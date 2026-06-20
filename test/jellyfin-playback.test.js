import { test } from 'node:test';
import assert from 'node:assert';
import { buildStreamFromInfo } from '../src/backends/jellyfin/playback.js';

var SERVER = { url: 'https://jf.example', userId: 'u1', accessToken: 'tok123' };

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
