import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildStreamFromInfo,
  buildSubtitlePlan,
  getPlaybackInfo,
  resolveStreamUrl
} from '../src/backends/jellyfin/playback.js';
import { mapStreams } from '../src/backends/jellyfin/mapItem.js';

var SERVER = { url: 'https://jf.example', userId: 'u1', accessToken: 'tok123' };

// Stub globalThis.fetch with a Response-like object carrying JSON. Records every
// request (url + parsed body) so callers can find a specific endpoint even when a
// flow fires several (PlaybackInfo + the Sessions/Playing start ping). Mirrors
// test/playback.test.js. `captured` exposes last-request fields plus find(substr).
function withMockFetch(jsonResponse, run) {
  var savedFetch = globalThis.fetch;
  var requests = [];
  var captured = {
    url: null, init: null, body: null, requests: requests,
    find: function (substr) {
      for (var i = 0; i < requests.length; i++) {
        if (String(requests[i].url).indexOf(substr) >= 0) return requests[i];
      }
      return null;
    }
  };
  globalThis.fetch = function (url, init) {
    var body = null;
    try { body = init && init.body ? JSON.parse(init.body) : null; } catch (e) { body = null; }
    captured.url = url;
    captured.init = init;
    captured.body = body;
    requests.push({ url: url, init: init, body: body });
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: function () { return 'application/json'; } },
      json: function () { return Promise.resolve(jsonResponse); },
      text: function () { return Promise.resolve(JSON.stringify(jsonResponse)); }
    });
  };
  return Promise.resolve()
    .then(function () { return run(captured); })
    .then(
      function (v) {
        if (savedFetch === undefined) delete globalThis.fetch; else globalThis.fetch = savedFetch;
        return v;
      },
      function (err) {
        if (savedFetch === undefined) delete globalThis.fetch; else globalThis.fetch = savedFetch;
        throw err;
      }
    );
}

test('transcode decision → HLS url + transcode-hls mode (real 10.11 shape)', function () {
  // Matches the live PlaybackInfo response for the MKV/DTS movie.
  var info = {
    PlaySessionId: 'f6eb0578530c438f95db5b9c8f4eec1d',
    MediaSources: [{
      Id: '3ea6e47669d67f1fbecd169cb24c0ef3',
      Container: 'mkv',
      SupportsDirectPlay: false,
      SupportsDirectStream: false,
      SupportsTranscoding: true,
      TranscodingUrl: '/videos/3ea6e476/master.m3u8?DeviceId=x&api_key=tok123',
      TranscodingSubProtocol: 'hls'
    }]
  };
  var out = buildStreamFromInfo(SERVER, '3ea6e47669d67f1fbecd169cb24c0ef3', info);
  assert.equal(out.mode, 'transcode-hls');
  // relative TranscodingUrl is absolutized against the server base
  assert.equal(out.url, 'https://jf.example/videos/3ea6e476/master.m3u8?DeviceId=x&api_key=tok123');
});

test('direct-play decision → native /Videos/{id}/stream + direct mode', function () {
  var info = {
    PlaySessionId: 'ps2',
    MediaSources: [{
      Id: 'msDP', Container: 'mp4', ETag: 'etag9',
      SupportsDirectPlay: true, SupportsDirectStream: true, SupportsTranscoding: true
    }]
  };
  var out = buildStreamFromInfo(SERVER, 'item9', info);
  assert.equal(out.mode, 'direct');
  assert.ok(out.url.indexOf('https://jf.example/Videos/item9/stream') === 0);
  assert.ok(out.url.indexOf('static=true') >= 0);
  assert.ok(out.url.indexOf('mediaSourceId=msDP') >= 0);
  assert.ok(out.url.indexOf('api_key=tok123') >= 0);
});

test('absolute TranscodingUrl is left untouched', function () {
  var info = {
    MediaSources: [{
      Id: 'm', SupportsDirectPlay: false,
      TranscodingUrl: 'https://cdn.example/x/master.m3u8'
    }]
  };
  var out = buildStreamFromInfo(SERVER, 'i', info);
  assert.equal(out.url, 'https://cdn.example/x/master.m3u8');
  assert.equal(out.mode, 'transcode-hls');
});

test('no playable source throws', function () {
  assert.throws(function () { buildStreamFromInfo(SERVER, 'i', { MediaSources: [] }); });
  assert.throws(function () {
    buildStreamFromInfo(SERVER, 'i', { MediaSources: [{ Id: 'm', SupportsDirectPlay: false }] });
  });
});

// ---- track selection: PlaybackInfo request params ----

test('getPlaybackInfo sends MediaSourceId/AudioStreamIndex/SubtitleStreamIndex when given', function () {
  return withMockFetch({ MediaSources: [{ Id: 'ms1', SupportsDirectPlay: true }], PlaySessionId: 'p' }, function (cap) {
    return getPlaybackInfo(SERVER, 'item9', {
      mediaSourceId: 'ms1', audioStreamIndex: 2, subtitleStreamIndex: 3
    }).then(function () {
      assert.equal(cap.body.MediaSourceId, 'ms1');
      assert.equal(cap.body.AudioStreamIndex, 2);
      assert.equal(cap.body.SubtitleStreamIndex, 3);
    });
  });
});

test('getPlaybackInfo omits selection params when not provided', function () {
  return withMockFetch({ MediaSources: [{ Id: 'ms1', SupportsDirectPlay: true }] }, function (cap) {
    return getPlaybackInfo(SERVER, 'item9', {}).then(function () {
      assert.ok(!('MediaSourceId' in cap.body));
      assert.ok(!('AudioStreamIndex' in cap.body));
      assert.ok(!('SubtitleStreamIndex' in cap.body));
    });
  });
});

test('resolveStreamUrl threads session audio/subtitle indices into the request', function () {
  var session = {
    server: SERVER,
    item: { ratingKey: 'item9' },
    offset: 0,
    version: { id: 'msV' },
    audioStreamId: 1,
    subtitleStreamId: 2
  };
  return withMockFetch({
    PlaySessionId: 'p',
    MediaSources: [{ Id: 'msV', SupportsDirectPlay: true, MediaStreams: [] }]
  }, function (cap) {
    return resolveStreamUrl(session).then(function (out) {
      // resolveStreamUrl fires PlaybackInfo then a Sessions/Playing start ping;
      // assert against the PlaybackInfo request specifically.
      var pi = cap.find('/PlaybackInfo');
      assert.ok(pi, 'PlaybackInfo request issued');
      assert.equal(pi.body.MediaSourceId, 'msV');
      assert.equal(pi.body.AudioStreamIndex, 1);
      assert.equal(pi.body.SubtitleStreamIndex, 2);
      assert.equal(out.mode, 'direct');
    });
  });
});

// ---- external text subtitle DeliveryUrl surfacing ----

test('buildStreamFromInfo returns subtitle.url for an External text subtitle', function () {
  var info = {
    PlaySessionId: 'p',
    MediaSources: [{
      Id: 'msSub', SupportsDirectPlay: false,
      TranscodingUrl: '/videos/x/master.m3u8',
      MediaStreams: [
        { Type: 'Video', Index: 0 },
        { Type: 'Audio', Index: 1 },
        {
          Type: 'Subtitle', Index: 3, Codec: 'subrip',
          DeliveryMethod: 'External',
          DeliveryUrl: '/Videos/itemS/msSub/Subtitles/3/0/Stream.subrip'
        }
      ]
    }]
  };
  var out = buildStreamFromInfo(SERVER, 'itemS', info, 3);
  assert.equal(out.mode, 'transcode-hls');
  assert.ok(out.subtitle, 'subtitle field present');
  assert.equal(out.subtitle.url, 'https://jf.example/Videos/itemS/msSub/Subtitles/3/0/Stream.subrip');
  assert.equal(out.subtitle.format, 'subrip');
});

test('buildStreamFromInfo burns in graphical subtitle: transcode mode, no subtitle field', function () {
  var info = {
    PlaySessionId: 'p',
    MediaSources: [{
      Id: 'msPgs', SupportsDirectPlay: false,
      TranscodingUrl: '/videos/x/master.m3u8',
      MediaStreams: [
        { Type: 'Video', Index: 0 },
        // Graphical PGS sub: server burns it in → DeliveryMethod Encode, no DeliveryUrl.
        { Type: 'Subtitle', Index: 2, Codec: 'pgssub', DeliveryMethod: 'Encode' }
      ]
    }]
  };
  var out = buildStreamFromInfo(SERVER, 'itemP', info, 2);
  assert.equal(out.mode, 'transcode-hls');
  assert.ok(!out.subtitle, 'no subtitle field for graphical/burned-in sub');
});

// ---- buildSubtitlePlan ----

test('buildSubtitlePlan builds the Stream.subrip URL with api_key for a text track', function () {
  // Prime the module's active MediaSource (resolveStreamUrl does this in real flow,
  // and buildSubtitlePlan prefers active.mediaSourceId). buildStreamFromInfo with a
  // msSub source sets active.mediaSourceId = 'msSub'.
  buildStreamFromInfo(SERVER, 'itemS', {
    PlaySessionId: 'p',
    MediaSources: [{ Id: 'msSub', SupportsDirectPlay: true, MediaStreams: [] }]
  });
  var session = { item: { ratingKey: 'itemS' }, version: { id: 'msSub' } };
  var track = { index: 3, codec: 'subrip', graphical: false };
  var plan = buildSubtitlePlan(SERVER, session, track);
  var attempts = plan.attempts();
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].label, 'jellyfin-external');
  assert.ok(attempts[0].url.indexOf(
    'https://jf.example/Videos/itemS/msSub/Subtitles/3/0/Stream.subrip') === 0);
  assert.ok(attempts[0].url.indexOf('api_key=tok123') >= 0);
});

test('buildSubtitlePlan uses vtt format for non-subrip text codecs', function () {
  buildStreamFromInfo(SERVER, 'itemS', {
    PlaySessionId: 'p',
    MediaSources: [{ Id: 'msSub', SupportsDirectPlay: true, MediaStreams: [] }]
  });
  var session = { item: { ratingKey: 'itemS' }, version: { id: 'msSub' } };
  var track = { index: 4, codec: 'webvtt', graphical: false };
  var plan = buildSubtitlePlan(SERVER, session, track);
  assert.ok(plan.attempts()[0].url.indexOf('/Subtitles/4/0/Stream.vtt') >= 0);
});

test('buildSubtitlePlan returns no attempts for a graphical track', function () {
  var session = { item: { ratingKey: 'itemP' }, version: { id: 'msPgs' } };
  var track = { index: 2, codec: 'pgssub', graphical: true };
  var plan = buildSubtitlePlan(SERVER, session, track);
  assert.deepEqual(plan.attempts(), []);
});

// ---- mapStreams: id === Index for audio AND subtitle ----

test('mapStreams gives subtitle and audio streams an id equal to their Index', function () {
  var streams = mapStreams([
    { Type: 'Video', Index: 0, Codec: 'h264' },
    { Type: 'Audio', Index: 1, Codec: 'aac' },
    { Type: 'Subtitle', Index: 3, Codec: 'subrip' }
  ]);
  var audio = streams[1];
  var sub = streams[2];
  assert.equal(audio.streamType, 2);
  assert.equal(audio.id, 1);
  assert.equal(audio.id, audio.index);
  assert.equal(sub.streamType, 3);
  assert.equal(sub.id, 3);
  assert.equal(sub.id, sub.index);
});
