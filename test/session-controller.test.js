import test from 'node:test';
import assert from 'node:assert/strict';

import { getState, setState } from '../src/core/store.js';
import {
  setPlexDeviceInfo,
  resetPlexDeviceInfoForTest,
  PMS_PRODUCT
} from '../src/plex/clientIdentity.js';
import {
  WEBOS_HLS_MPEGTS_PROFILE_EXTRA,
  WEBOS_HLS_TRANSCODE_FMP4_PROFILE_EXTRA
} from '../src/playback/hlsPolicy.js';
import {
  buildDirectPlayUrl,
  buildPlaybackUrl,
  buildDecisionRequestParams,
  createSession,
  resolvePlaybackStrategy,
  resolveStreamUrl,
  buildFirstDecisionUrl
} from '../src/playback/sessionController.js';

var mockServer = {
  connectionUri: 'https://plex.example.com:32400',
  accessToken: 'server-token-xyz'
};

var partKey = '/library/parts/99/abc.mkv';

function parseQuery(url) {
  var u = new URL(url);
  var q = {};
  u.searchParams.forEach(function (value, key) {
    q[key] = value;
  });
  return q;
}

function mockFetchWithDecision(decisionBody, m3u8Options) {
  m3u8Options = m3u8Options || {};
  globalThis.fetch = function (url) {
    var u = String(url);
    if (u.indexOf('start.m3u8') >= 0) {
      if (m3u8Options.fail) {
        return Promise.resolve({
          ok: false,
          status: m3u8Options.status || 400,
          text: function () {
            return m3u8Options.body || '<html>400 Bad Request</html>';
          },
          headers: { get: function () { return 'text/html'; } }
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: function () { return '#EXTM3U\n#EXT-X-VERSION:3'; },
        headers: { get: function () { return 'application/vnd.apple.mpegurl'; } }
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      text: function () { return decisionBody; },
      headers: { get: function () { return 'application/xml'; } }
    });
  };
}

function baseSession(overrides) {
  return Object.assign({
    server: mockServer,
    item: { ratingKey: '12345', key: '/library/metadata/12345' },
    version: { partKey: partKey },
    sessionId: 'xplay-test-session',
    playbackSessionId: 'client-playback-session-id',
    transcodeSessionId: 'plex-test-session',
    mediaIndex: 0,
    partIndex: 0,
    transcodeProtocol: 'hls'
  }, overrides || {});
}

var savedPlaybackPrefs;
var savedPalmSystem;
var savedWebOS;
var savedFetch;

test.beforeEach(function () {
  savedPlaybackPrefs = Object.assign({}, getState().playbackPrefs);
  resetPlexDeviceInfoForTest();
  savedPalmSystem = globalThis.PalmSystem;
  savedWebOS = globalThis.webOS;
  savedFetch = globalThis.fetch;
});

test.afterEach(function () {
  setState({ playbackPrefs: savedPlaybackPrefs });
  resetPlexDeviceInfoForTest();
  if (savedPalmSystem === undefined) {
    delete globalThis.PalmSystem;
  } else {
    globalThis.PalmSystem = savedPalmSystem;
  }
  if (savedWebOS === undefined) {
    delete globalThis.webOS;
  } else {
    globalThis.webOS = savedWebOS;
  }
  if (savedFetch === undefined) {
    delete globalThis.fetch;
  } else {
    globalThis.fetch = savedFetch;
  }
});

test('buildDirectPlayUrl uses part path and server access token', function () {
  var url = buildDirectPlayUrl(mockServer, partKey);
  var u = new URL(url);
  assert.equal(u.origin + u.pathname, 'https://plex.example.com:32400' + partKey);
  assert.equal(u.searchParams.get('X-Plex-Token'), 'server-token-xyz');
});

test('buildDirectPlayUrl prefixes relative part paths', function () {
  var url = buildDirectPlayUrl(mockServer, 'library/parts/1/file.mkv');
  var u = new URL(url);
  assert.equal(u.pathname, '/library/parts/1/file.mkv');
});

test('buildPlaybackUrl HLS targets universal start.m3u8', function () {
  var session = baseSession({ forceTranscode: true });
  var url = buildPlaybackUrl(mockServer, partKey, session, 'hls');
  assert.ok(/\/video\/:\/transcode\/universal\/start\.m3u8\?/.test(url));
  assert.equal(parseQuery(url).protocol, 'hls');
  assert.equal(parseQuery(url)['X-Plex-Incomplete-Segments'], '1');
});

test('buildPlaybackUrl HTTP targets universal start without m3u8', function () {
  var session = baseSession({ forceTranscode: true });
  var url = buildPlaybackUrl(mockServer, partKey, session, 'hls');
  var hlsQ = parseQuery(url);
  var httpUrl = buildPlaybackUrl(mockServer, partKey, session, 'http');
  var httpQ = parseQuery(httpUrl);
  assert.ok(/\/video\/:\/transcode\/universal\/start\?/.test(httpUrl));
  assert.ok(httpUrl.indexOf('.m3u8') < 0);
  assert.equal(hlsQ['X-Plex-Client-Profile-Extra'], undefined);
  assert.equal(httpQ['X-Plex-Client-Profile-Extra'], undefined);
});

test('buildPlaybackUrl HLS on webOS 4 uses HEVC-capable device profile', function () {
  globalThis.PalmSystem = { identifier: 'com.webos.app.xplay-lite' };
  globalThis.webOS = {
    platform: { tv: true },
    deviceInfo: function (cb) {
      cb({ modelName: 'OLED55B9PUA', version: '4.9.0', uhd: true });
    }
  };
  setPlexDeviceInfo({ modelName: 'OLED55B8LLA', version: '4.4.0' });
  setState({ deviceInfo: { uhd: true, hdr10: true, dolbyVision: false, versionMajor: 4 } });

  var session = baseSession({ forceTranscode: true, playbackStrategy: 'transcode' });
  var q = parseQuery(buildPlaybackUrl(mockServer, partKey, session, 'hls'));
  assert.equal(q['X-Plex-Client-Profile-Name'], 'Generic');
  assert.ok(q['X-Plex-Client-Profile-Extra'].indexOf('videoCodec=h264,hevc') >= 0);
  assert.equal(q.directPlay, '0');
  assert.equal(q.directStream, '1');
  assert.ok(q.path && q.path.indexOf('http') < 0);
  assert.equal(q.location, undefined);
  assert.equal(q['X-Plex-Product'], undefined);
});

test('buildPlaybackUrl simulator Plex Web adds webOS HLS profile extra', function () {
  globalThis.PalmSystem = { identifier: 'com.webos.app.xplay-lite' };
  globalThis.webOS = {
    platform: { tv: true },
    deviceInfo: function (cb) {
      cb({ modelName: 'WEBOS26_SIMULATOR', version: '26.0.0' });
    }
  };
  setPlexDeviceInfo({ modelName: 'WEBOS26_SIMULATOR', version: '26.0.0' });

  var remote = {
    connectionUri: 'http://185.203.56.20:17054',
    accessToken: 'tok',
    activeConnection: { uri: 'http://185.203.56.20:17054', local: false }
  };
  var session = baseSession({
    server: remote,
    playbackStrategy: 'direct-stream',
    subtitleStreamId: 1894445,
    subtitleBurnIn: false,
    offset: 454000
  });
  var q = parseQuery(buildPlaybackUrl(remote, partKey, session, 'hls'));
  assert.equal(q['X-Plex-Product'], 'Plex Web');
  assert.equal(q['X-Plex-Client-Profile-Extra'], WEBOS_HLS_MPEGTS_PROFILE_EXTRA);
  assert.equal(q.path, '/library/metadata/12345');
  assert.equal(q.location, 'wan');
  assert.equal(q.directStream, '1');
  assert.equal(q.skipSubtitles, '1');
  assert.equal(q.subtitles, undefined);
  assert.equal(q.subtitleStreamID, undefined);
  assert.equal(q['X-Plex-Subtitle-Stream'], undefined);
  assert.equal(q.transcodeSessionId, 'plex-test-session');
});

test('buildPlaybackUrl transcode query includes offset seconds and fastSeek', function () {
  var session = baseSession({
    forceTranscode: true,
    offset: 125000
  });
  var q = parseQuery(buildPlaybackUrl(mockServer, partKey, session, 'hls'));
  assert.equal(q.offset, '125');
  assert.equal(q.fastSeek, '1');
});

test('buildPlaybackUrl direct strategy sets directPlay and directStream', function () {
  var session = baseSession({ playbackStrategy: 'direct' });
  var q = parseQuery(buildPlaybackUrl(mockServer, partKey, session, 'hls'));
  assert.equal(q.directPlay, '1');
  assert.equal(q.directStream, '1');
});

test('buildPlaybackUrl transcode strategy clears directPlay and directStream', function () {
  var session = baseSession({ playbackStrategy: 'transcode' });
  var q = parseQuery(buildPlaybackUrl(mockServer, partKey, session, 'hls'));
  assert.equal(q.directPlay, '0');
  assert.equal(q.directStream, '0');
});

test('buildPlaybackUrl direct-stream strategy remux flags', function () {
  var session = baseSession({ playbackStrategy: 'direct-stream' });
  var q = parseQuery(buildPlaybackUrl(mockServer, partKey, session, 'hls'));
  assert.equal(q.directPlay, '0');
  assert.equal(q.directStream, '1');
});

test('buildPlaybackUrl includes location=wan for remote PMS', function () {
  var remote = {
    connectionUri: 'http://185.203.56.20:17054',
    accessToken: 'tok',
    activeConnection: { uri: 'http://185.203.56.20:17054', local: false }
  };
  var q = parseQuery(buildPlaybackUrl(remote, partKey, baseSession({ server: remote }), 'hls'));
  assert.equal(q.location, 'wan');
});

test('buildPlaybackUrl includes location=lan for local PMS', function () {
  var local = {
    connectionUri: 'http://192.168.1.10:32400',
    accessToken: 'tok',
    activeConnection: { uri: 'http://192.168.1.10:32400', local: true }
  };
  var q = parseQuery(buildPlaybackUrl(local, partKey, baseSession({ server: local }), 'hls'));
  assert.equal(q.location, 'lan');
});

test('buildPlaybackUrl direct-stream with text subs skips server HLS subs', function () {
  var session = baseSession({
    playbackStrategy: 'direct-stream',
    subtitleStreamId: 1894297,
    subtitleBurnIn: false
  });
  var q = parseQuery(buildPlaybackUrl(mockServer, partKey, session, 'hls'));
  assert.equal(q.skipSubtitles, '1');
  assert.equal(q.subtitles, undefined);
  assert.equal(q.subtitleStreamID, undefined);
  assert.equal(q['X-Plex-Subtitle-Stream'], undefined);
  assert.notEqual(q.subtitles, 'burn');
});

test('resolvePlaybackStrategy leaves auto direct for text subs (PMS decides via /decision)', function () {
  setState({ playbackPrefs: Object.assign({}, savedPlaybackPrefs, { quality: 'auto', directPlay: true }) });
  assert.equal(
    resolvePlaybackStrategy({ quality: 'auto', subtitleStreamId: 5, subtitleBurnIn: false }),
    'direct'
  );
});

test('resolvePlaybackStrategy honors explicit session.playbackStrategy', function () {
  assert.equal(resolvePlaybackStrategy({ playbackStrategy: 'direct-stream' }), 'direct-stream');
  assert.equal(resolvePlaybackStrategy({ playbackStrategy: 'http-transcode' }), 'http-transcode');
});

test('resolvePlaybackStrategy original quality prefers direct', function () {
  setState({ playbackPrefs: Object.assign({}, savedPlaybackPrefs, { quality: 'auto', directPlay: true }) });
  assert.equal(resolvePlaybackStrategy({ quality: 'original' }), 'direct');
});

test('resolvePlaybackStrategy forceTranscode yields HLS or HTTP transcode', function () {
  assert.equal(resolvePlaybackStrategy({ forceTranscode: true }), 'transcode');
  assert.equal(
    resolvePlaybackStrategy({ forceTranscode: true, transcodeProtocol: 'http' }),
    'http-transcode'
  );
});

test('resolvePlaybackStrategy disables direct play when prefs.directPlay is false', function () {
  setState({ playbackPrefs: Object.assign({}, savedPlaybackPrefs, { directPlay: false }) });
  assert.equal(resolvePlaybackStrategy({ quality: 'auto' }), 'transcode');
});

test('resolveStreamUrl direct play returns part URL and direct mode', async function () {
  globalThis.fetch = function () {
    return Promise.resolve({
      ok: true,
      status: 200,
      text: function () {
        return [
          '<MediaContainer resourceSession="plex-dp">',
          '<Video><Media><Part decision="directplay"/></Media></Video>',
          '</MediaContainer>'
        ].join('');
      },
      headers: { get: function () { return 'application/xml'; } }
    });
  };
  var session = baseSession({ playbackStrategy: 'direct' });
  var result = await resolveStreamUrl(session);
  assert.equal(result.mode, 'direct');
  assert.ok(result.url.indexOf(partKey) >= 0);
  assert.ok(result.url.indexOf('transcode') < 0);
  assert.equal(parseQuery(result.url)['X-Plex-Token'], 'server-token-xyz');
});

test('resolveStreamUrl HLS transcode returns m3u8 and transcode-hls mode', async function () {
  mockFetchWithDecision([
    '<MediaContainer resourceSession="plex-tc">',
    '<Video><Media protocol="hls"><Part decision="transcode" protocol="hls"/></Media></Video>',
    '</MediaContainer>'
  ].join(''));
  var session = baseSession({ forceTranscode: true, transcodeSessionId: undefined });
  var result = await resolveStreamUrl(session);
  assert.equal(result.mode, 'transcode-hls');
  assert.ok(/start\.m3u8/.test(result.url));
  assert.equal(parseQuery(result.url).session, 'plex-tc');
});

test('resolveStreamUrl follows decision with subtitles=auto over HTTPS', async function () {
  var calls = [];
  var decisionBody = [
    '<MediaContainer resourceSession="plex-decision-session" size="1">',
    '<Video ratingKey="12345">',
    '<Media protocol="hls" selected="1">',
    '<Part decision="copy" protocol="hls" selected="1"/>',
    '</Media>',
    '</Video>',
    '</MediaContainer>'
  ].join('');
  globalThis.fetch = function (url, init) {
    calls.push({ url: String(url), init: init || {} });
    if (String(url).indexOf('start.m3u8') >= 0) {
      return Promise.resolve({
        ok: true,
        status: 200,
        text: function () { return '#EXTM3U\n#EXT-X-VERSION:3'; },
        headers: { get: function () { return 'application/vnd.apple.mpegurl'; } }
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      text: function () { return decisionBody; },
      headers: { get: function () { return 'application/xml'; } }
    });
  };

  var session = baseSession({
    item: { key: '/library/metadata/12345', ratingKey: '12345' },
    audioStreamId: 1894443,
    subtitleStreamId: 1894445,
    subtitleBurnIn: false,
    offset: 454000
  });
  var result = await resolveStreamUrl(session);
  var decision = calls.filter(function (call) {
    return call.url.indexOf('/video/:/transcode/universal/decision') >= 0;
  })[0];
  assert.ok(decision);
  assert.ok(decision.url.indexOf('https://plex.example.com') === 0);
  var decisionQuery = parseQuery(decision.url);
  var startQuery = parseQuery(result.url);

  assert.equal(decisionQuery.path, '/library/metadata/12345');
  assert.equal(decisionQuery.directPlay, '1');
  assert.equal(decisionQuery.directStream, undefined);
  assert.equal(decisionQuery['X-Plex-Client-Profile-Name'], 'Generic');
  assert.equal(decisionQuery.subtitles, 'auto');
  assert.equal(decisionQuery['X-Plex-Incomplete-Segments'], undefined);
  assert.equal(decisionQuery.subtitleSize, undefined);
  assert.equal(decisionQuery.autoAdjustSubtitle, undefined);
  assert.equal(decisionQuery.offset, '454');
  assert.equal(decisionQuery.skipSubtitles, undefined);
  assert.equal(decisionQuery.subtitleStreamID, undefined);
  assert.equal(decision.init.headers['X-Plex-Token'], 'server-token-xyz');
  assert.equal(decision.init.headers['X-Plex-Session-Identifier'], 'client-playback-session-id');

  assert.equal(result.mode, 'direct-stream');
  assert.equal(session.playbackStrategy, 'direct-stream');
  assert.equal(session.pmsDeliveryProtocol, 'hls');
  assert.equal(session.commitToHlsDelivery, true);
  assert.equal(startQuery.path, '/library/metadata/12345');
  assert.equal(startQuery.session, 'plex-decision-session');
  assert.equal(startQuery.transcodeSessionId, 'plex-decision-session');
  assert.equal(startQuery.skipSubtitles, '1');
  assert.equal(startQuery.audioStreamID, '1894443');
  assert.equal(startQuery['X-Plex-Token'], 'server-token-xyz');
});

test('resolveStreamUrl uses direct play when decision says directplay', async function () {
  globalThis.fetch = function () {
    return Promise.resolve({
      ok: true,
      status: 200,
      text: function () {
        return [
          '<MediaContainer resourceSession="plex-dp">',
          '<Video><Media><Part decision="directplay" protocol="http"/></Media></Video>',
          '</MediaContainer>'
        ].join('');
      },
      headers: { get: function () { return 'application/xml'; } }
    });
  };
  var session = baseSession({ subtitleStreamId: null });
  var result = await resolveStreamUrl(session);
  assert.equal(result.mode, 'direct');
  assert.ok(result.url.indexOf(partKey) >= 0);
  assert.ok(result.url.indexOf('transcode') < 0);
});

test('resolveStreamUrl http-transcode returns start URL and transcode-http mode', async function () {
  globalThis.fetch = function () {
    return Promise.resolve({
      ok: true,
      status: 200,
      text: function () {
        return [
          '<MediaContainer resourceSession="plex-http">',
          '<Video><Media><Part decision="transcode" protocol="http"/></Media></Video>',
          '</MediaContainer>'
        ].join('');
      },
      headers: { get: function () { return 'application/xml'; } }
    });
  };
  var session = baseSession({
    playbackStrategy: 'http-transcode',
    transcodeProtocol: 'hls'
  });
  var result = await resolveStreamUrl(session);
  assert.equal(result.mode, 'transcode-http');
  assert.ok(/\/transcode\/universal\/start\?/.test(result.url));
  assert.ok(result.url.indexOf('.m3u8') < 0);
});

test('resolveStreamUrl resolves partKey from nested media when version missing', async function () {
  globalThis.fetch = function () {
    return Promise.resolve({
      ok: true,
      status: 200,
      text: function () {
        return [
          '<MediaContainer resourceSession="plex-dp">',
          '<Video><Media><Part decision="directplay"/></Media></Video>',
          '</MediaContainer>'
        ].join('');
      },
      headers: { get: function () { return 'application/xml'; } }
    });
  };
  var nestedPartKey = '/library/parts/nested/part.mkv';
  var session = {
    server: mockServer,
    item: {
      ratingKey: '777',
      media: [{
        _children: [{ key: nestedPartKey }]
      }]
    },
    playbackStrategy: 'direct',
    mediaIndex: 0,
    partIndex: 0
  };
  var result = await resolveStreamUrl(session);
  assert.ok(result.url.indexOf(nestedPartKey) >= 0);
});

test('buildPlaybackUrl skips server subtitles for SRT transcode without subtitleBurnIn', function () {
  var session = baseSession({
    forceTranscode: true,
    playbackStrategy: 'transcode',
    subtitleStreamId: 1894297,
    subtitleBurnIn: false
  });
  var q = parseQuery(buildPlaybackUrl(mockServer, partKey, session, 'hls'));
  assert.equal(q.skipSubtitles, '1');
  assert.equal(q.subtitles, undefined);
  assert.equal(q.subtitleStreamID, undefined);
  assert.equal(q['X-Plex-Subtitle-Stream'], undefined);
});

test('buildPlaybackUrl burns only when subtitleBurnIn is true', function () {
  var session = baseSession({
    forceTranscode: true,
    playbackStrategy: 'transcode',
    subtitleStreamId: 1894297,
    subtitleBurnIn: true
  });
  var q = parseQuery(buildPlaybackUrl(mockServer, partKey, session, 'hls'));
  assert.equal(q.subtitles, 'burn');
  assert.equal(q.subtitleStreamID, '1894297');
  assert.equal(q['X-Plex-Subtitle-Stream'], '1894297');
  assert.equal(q.autoAdjustSubtitle, '1');
  assert.equal(q.subtitleSize, '100');
  assert.equal(q.subtitleFormat, undefined);
});

test('resolveStreamUrl decision includes burn params when subtitleBurnIn', async function () {
  var calls = [];
  globalThis.fetch = function (url, init) {
    calls.push({ url: String(url), init: init || {} });
    if (String(url).indexOf('start.m3u8') >= 0) {
      return Promise.resolve({
        ok: true,
        status: 200,
        text: function () { return '#EXTM3U'; },
        headers: { get: function () { return 'application/vnd.apple.mpegurl'; } }
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      text: function () {
        return [
          '<MediaContainer resourceSession="plex-burn-session">',
          '<Video><Media><Part decision="transcode" protocol="hls"/></Media></Video>',
          '</MediaContainer>'
        ].join('');
      },
      headers: { get: function () { return 'application/xml'; } }
    });
  };

  var session = baseSession({
    forceTranscode: true,
    playbackStrategy: 'transcode',
    subtitleStreamId: 1894297,
    subtitleBurnIn: true,
    subtitleAdvancedBurn: true,
    transcodeSessionId: undefined
  });
  await resolveStreamUrl(session);
  var decision = calls.filter(function (call) {
    return call.url.indexOf('/video/:/transcode/universal/decision') >= 0;
  })[0];
  assert.ok(decision);
  var decisionQuery = parseQuery(decision.url);
  assert.equal(decisionQuery.subtitles, 'burn');
  assert.equal(decisionQuery.subtitleStreamID, '1894297');
  assert.equal(decisionQuery.advancedSubtitles, 'burn');
  assert.equal(decisionQuery.directPlay, '1');
  assert.equal(decisionQuery.directStream, undefined);
  assert.equal(decisionQuery.subtitleSize, '100');
});

test('resolveStreamUrl selects subtitle stream before burn-in transcode', async function () {
  var calls = [];
  globalThis.fetch = function (url, init) {
    calls.push({ url: String(url), init: init || {} });
    if (String(url).indexOf('start.m3u8') >= 0) {
      return Promise.resolve({
        ok: true,
        status: 200,
        text: function () { return '#EXTM3U'; },
        headers: { get: function () { return 'application/vnd.apple.mpegurl'; } }
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      text: function () {
        return [
          '<MediaContainer resourceSession="plex-burn-session">',
          '<Video><Media><Part decision="transcode" protocol="hls"/></Media></Video>',
          '</MediaContainer>'
        ].join('');
      },
      headers: { get: function () { return 'application/xml'; } }
    });
  };

  var session = baseSession({
    forceTranscode: true,
    playbackStrategy: 'transcode',
    subtitleStreamId: 1894297,
    subtitleBurnIn: true,
    transcodeSessionId: undefined
  });
  var result = await resolveStreamUrl(session);
  var selection = calls.filter(function (call) {
    return call.init.method === 'PUT' && call.url.indexOf('/library/parts/99') >= 0;
  })[0];
  assert.ok(selection);
  assert.equal(parseQuery(selection.url).subtitleStreamID, '1894297');
  assert.equal(parseQuery(result.url).subtitles, 'burn');
  assert.equal(parseQuery(result.url).session, 'plex-burn-session');
});

test('createSession assigns distinct playbackSessionId from transcode session', function () {
  var session = createSession(
    { ratingKey: '1', key: '/library/metadata/1' },
    { partKey: partKey },
    {}
  );
  assert.ok(session.playbackSessionId);
  assert.ok(session.sessionId);
  assert.notEqual(session.playbackSessionId, session.sessionId);
  assert.match(session.playbackSessionId, /^[a-z0-9]{24}$/);
});

test('buildDecisionRequestParams includes Plex transcode level params for 720p', function () {
  var session = baseSession({ quality: '720', playbackStrategy: 'transcode' });
  var q = buildDecisionRequestParams(mockServer, partKey, session, 'hls');
  assert.equal(q.directPlay, '0');
  // directStream/directStreamAudio are start.m3u8-only now (decision carries directPlay).
  assert.equal(q.directStream, undefined);
  assert.equal(String(q.maxVideoBitrate), '4000');
  assert.equal(q.videoResolution, '1280x720');
  assert.equal(q.subtitleSize, undefined);
  assert.equal(q.audioBoost, undefined);
  assert.equal(q['X-Plex-Incomplete-Segments'], undefined);
});

test('buildDecisionRequestParams forces transcode flags when quality=720 without strategy', function () {
  var session = baseSession({ quality: '720', playbackStrategy: undefined });
  var q = buildDecisionRequestParams(mockServer, partKey, session, 'hls');
  assert.equal(q.directPlay, '0');
  assert.equal(q.directStream, undefined);
});

test('buildDecisionRequestParams mirrors plex-for-kodi minimal shape', function () {
  var session = baseSession({ quality: '720', playbackStrategy: 'transcode' });
  var q = buildDecisionRequestParams(mockServer, partKey, session, 'hls');
  // Present: MDE flag + client profile + buffer hint (what plex-for-kodi sends).
  assert.equal(q.hasMDE, '1');
  assert.equal(q['X-Plex-Client-Profile-Name'], 'Generic');
  assert.equal(q.mediaBufferSize, '102400');
  // Absent: streaming-only flags that make PMS return a bare HTTP 400 over WAN.
  assert.equal(q.protocol, undefined);
  assert.equal(q.directStream, undefined);
  assert.equal(q.directStreamAudio, undefined);
  assert.equal(q.fastSeek, undefined);
  assert.equal(q.autoAdjustQuality, undefined);
  assert.equal(q['X-Plex-Incomplete-Segments'], undefined);
});

test('buildPlaybackUrl transcode with soft subs includes subtitleSize and skipSubtitles', function () {
  var session = baseSession({
    quality: '720',
    playbackStrategy: 'transcode',
    forceTranscode: true,
    subtitleStreamId: 1894297,
    subtitleBurnIn: false
  });
  var q = parseQuery(buildPlaybackUrl(mockServer, partKey, session, 'hls', 'transcode'));
  assert.equal(q.subtitleSize, '75');
  assert.equal(q.audioBoost, '100');
  assert.equal(q.skipSubtitles, '1');
  assert.equal(q.maxVideoBitrate, '4000');
  assert.equal(q.videoResolution, '1280x720');
});

test('resolveStreamUrl overrides PMS copy when quality=720', async function () {
  mockFetchWithDecision([
    '<MediaContainer resourceSession="plex-copy-session">',
    '<Video><Media><Part decision="copy" protocol="hls"/></Media></Video>',
    '</MediaContainer>'
  ].join(''));
  var session = baseSession({ quality: '720', playbackStrategy: 'transcode', transcodeSessionId: undefined });
  var result = await resolveStreamUrl(session);
  assert.equal(session.playbackStrategy, 'transcode');
  assert.equal(result.mode, 'transcode-hls');
  var startQuery = parseQuery(result.url);
  assert.equal(startQuery.directPlay, '0');
  assert.equal(startQuery.directStream, '0');
  assert.equal(startQuery.maxVideoBitrate, '4000');
  assert.equal(startQuery.session, 'plex-copy-session');
});

test('resolveStreamUrl falls back to metadata path when no part key', async function () {
  globalThis.fetch = function () {
    return Promise.resolve({
      ok: true,
      status: 200,
      text: function () {
        return [
          '<MediaContainer resourceSession="plex-dp">',
          '<Video><Media><Part decision="directplay"/></Media></Video>',
          '</MediaContainer>'
        ].join('');
      },
      headers: { get: function () { return 'application/xml'; } }
    });
  };
  var session = {
    server: mockServer,
    item: { ratingKey: '555' },
    playbackStrategy: 'direct'
  };
  var result = await resolveStreamUrl(session);
  assert.ok(result.url.indexOf('/library/metadata/555') >= 0);
});

test('resolveStreamUrl rejects when server missing', async function () {
  await assert.rejects(
    function () { return resolveStreamUrl({ item: { ratingKey: '1' } }); },
    function (err) {
      return /no plex server connected/i.test(err.message);
    }
  );
});

test('buildDecisionRequestParams omits transcodeSessionId before PMS session exists', function () {
  var session = baseSession({ playbackStrategy: 'direct-stream', transcodeSessionId: undefined });
  var q = buildDecisionRequestParams(mockServer, partKey, session, 'hls');
  assert.equal(q.session, 'client-playback-session-id');
  assert.equal(q.transcodeSessionId, undefined);
  assert.equal(q.directPlay, '0');
  assert.equal(q.directStream, undefined);
  assert.equal(q.subtitleSize, undefined);
});

test('buildDecisionRequestParams sets subtitles=none when no subtitle selected', function () {
  // Root-cause guard: with no subtitle chosen, the param must be present as
  // 'none' so PMS cannot auto-select + burn a forced subtitle (which would
  // force a full video transcode and disable Direct Play).
  var session = baseSession({ playbackStrategy: 'direct', subtitleStreamId: null });
  var q = buildDecisionRequestParams(mockServer, partKey, session, 'hls');
  assert.equal(q.subtitles, 'none');
  // none is a value, not a new key — must not emit burn/soft-sub params.
  assert.equal(q.subtitleStreamID, undefined);
  assert.equal(q.skipSubtitles, undefined);
  assert.equal(q['X-Plex-Subtitle-Stream'], undefined);
});

test('buildDecisionRequestParams sets subtitles=none on webOS 5+ when no subtitle selected', function () {
  globalThis.PalmSystem = { identifier: 'com.webos.app.xplay-lite' };
  globalThis.webOS = {
    platform: { tv: true },
    deviceInfo: function (cb) {
      cb({ modelName: 'OLED55C9PUA', version: '5.2.0' });
    }
  };
  setPlexDeviceInfo({ modelName: 'OLED55C9PUA', version: '5.2.0' });
  setState({ deviceInfo: { versionMajor: 5 } });

  var session = baseSession({ playbackStrategy: 'direct', subtitleStreamId: null });
  var q = buildDecisionRequestParams(mockServer, partKey, session, 'hls');
  assert.equal(q.subtitles, 'none');
});

test('buildFirstDecisionUrl on webOS 4 uses capability probe flags', function () {
  globalThis.PalmSystem = { identifier: 'com.webos.app.xplay-lite' };
  globalThis.webOS = {
    platform: { tv: true },
    deviceInfo: function (cb) {
      cb({ modelName: 'OLED55B8LLA', version: '4.4.0' });
    }
  };
  setPlexDeviceInfo({ modelName: 'OLED55B8LLA', version: '4.4.0' });

  var session = baseSession({ playbackStrategy: 'direct-stream' });
  var q = parseQuery(buildFirstDecisionUrl(mockServer, partKey, session, 'hls'));
  assert.equal(q.directPlay, '1');
  // directStream/directStreamAudio no longer sent on the decision (start.m3u8 only).
  assert.equal(q.directStream, undefined);
  assert.equal(q.directStreamAudio, undefined);
  assert.equal(q['X-Plex-Client-Profile-Name'], 'Generic');
  // webOS 4 pins the decision to protocol=hls so PMS commits the transcode
  // session to the mpegts target (not the http/mp4 one → fMP4 base/header 404).
  assert.equal(q.protocol, 'hls');
  assert.equal(q.transcodeSessionId, undefined);
});

test('buildFirstDecisionUrl sends directPlay=0 for a manual quality cap', function () {
  // directPlay=1 lets PMS bypass maxVideoBitrate and reply "Direct play OK", so
  // a manual quality pick must request directPlay=0 to force a real transcode
  // session at the capped bitrate (otherwise start.m3u8 buffers forever).
  var session = baseSession({ quality: '720' });
  var q = parseQuery(buildFirstDecisionUrl(mockServer, partKey, session, 'hls'));
  assert.equal(q.directPlay, '0');
});

test('buildFirstDecisionUrl stays optimistic (directPlay=1) for original quality', function () {
  var session = baseSession({ quality: 'original' });
  var q = parseQuery(buildFirstDecisionUrl(mockServer, partKey, session, 'hls'));
  assert.equal(q.directPlay, '1');
});

test('buildPlaybackUrl uses resourceSession from decision on start URL', function () {
  globalThis.PalmSystem = { identifier: 'com.webos.app.xplay-lite' };
  globalThis.webOS = {
    platform: { tv: true },
    deviceInfo: function (cb) {
      cb({ modelName: 'OLED55B8LLA', version: '4.4.0' });
    }
  };
  setPlexDeviceInfo({ modelName: 'OLED55B8LLA', version: '4.4.0' });

  var session = baseSession({
    playbackStrategy: 'transcode',
    transcodeSessionId: 'ti0aanprmpr6y635rp2ttrbi'
  });
  var q = parseQuery(buildPlaybackUrl(mockServer, partKey, session, 'hls', 'transcode'));
  assert.equal(q.session, 'ti0aanprmpr6y635rp2ttrbi');
  assert.equal(q['X-Plex-Session-Id'], 'ti0aanprmpr6y635rp2ttrbi');
  assert.equal(q.transcodeSessionId, undefined);
  assert.notEqual(q.session, 'xplay-test-session');
});

test('resolveStreamUrl webOS 4 falls back to http-transcode when decision returns HTTP 400', async function () {
  globalThis.PalmSystem = { identifier: 'com.webos.app.xplay-lite' };
  globalThis.webOS = {
    platform: { tv: true },
    deviceInfo: function (cb) {
      cb({ modelName: 'OLED55B8LLA', version: '4.4.0' });
    }
  };
  setPlexDeviceInfo({ modelName: 'OLED55B8LLA', version: '4.4.0' });

  globalThis.fetch = function () {
    return Promise.resolve({
      ok: false,
      status: 400,
      text: function () { return '<html>400 Bad Request</html>'; },
      headers: { get: function () { return 'text/html'; } }
    });
  };

  // A decision 400 must never dead-end playback — fall through to progressive
  // HTTP transcode (the path that reached "first frame" on-device).
  var session = baseSession({ playbackStrategy: 'direct-stream', transcodeSessionId: undefined });
  var result = await resolveStreamUrl(session);
  assert.equal(result.mode, 'transcode-http');
  assert.equal(session.playbackStrategy, 'http-transcode');
  assert.ok(result.url.indexOf('start.m3u8') < 0);
});

test('resolveStreamUrl falls back to http-transcode when start.m3u8 probe returns HTTP 400', async function () {
  globalThis.fetch = function (url) {
    if (String(url).indexOf('/decision') >= 0) {
      return Promise.resolve({
        ok: true,
        status: 200,
        text: function () {
          return [
            '<MediaContainer resourceSession="plex-probe-session">',
            '<Video><Media protocol="hls"><Part decision="transcode" protocol="hls"/></Media></Video>',
            '</MediaContainer>'
          ].join('');
        },
        headers: { get: function () { return 'application/xml'; } }
      });
    }
    return Promise.resolve({
      ok: false,
      status: 400,
      text: function () { return '<html>400 Bad Request</html>'; },
      headers: { get: function () { return 'text/html'; } }
    });
  };

  // A rejected HLS start must not dead-end — fall through to progressive HTTP
  // transcode (the path that actually plays on webOS 4).
  var session = baseSession({ forceTranscode: true, transcodeSessionId: undefined });
  var result = await resolveStreamUrl(session);
  assert.equal(result.mode, 'transcode-http');
  assert.equal(session.playbackStrategy, 'http-transcode');
  assert.ok(result.url.indexOf('start.m3u8') < 0);
});

test('resolveStreamUrl prefers HTTP MP4 remux for MKV Dolby Vision copy', async function () {
  mockFetchWithDecision([
    '<MediaContainer resourceSession="plex-dv-copy">',
    '<Video><Media protocol="hls"><Part decision="copy" protocol="hls"/></Media></Video>',
    '</MediaContainer>'
  ].join(''));
  var session = baseSession({
    playbackStrategy: 'direct-stream',
    version: {
      partKey: partKey,
      container: 'mkv',
      videoCodec: 'hevc',
      videoProfile: 'dvhe.05'
    },
    transcodeSessionId: undefined
  });
  var result = await resolveStreamUrl(session);
  assert.equal(result.mode, 'direct-stream');
  assert.ok(result.url.indexOf('start.m3u8') < 0);
  assert.ok(/\/transcode\/universal\/start\?/.test(result.url));
});

test('resolveStreamUrl on webOS 4 routes forced transcode to mpegts HLS (hls.js), WAN-safe params', async function () {
  globalThis.PalmSystem = { identifier: 'com.webos.app.xplay-lite' };
  globalThis.webOS = {
    platform: { tv: true },
    deviceInfo: function (cb) {
      cb({ modelName: 'OLED55B8LLA', version: '4.4.0' });
    }
  };
  setPlexDeviceInfo({ modelName: 'OLED55B8LLA', version: '4.4.0' });
  // The webOS4 start URL builds its profile from getState().deviceInfo, so the
  // store must reflect a webOS4 device for the mpegts transcode target to appear.
  setState({ deviceInfo: { uhd: true, hdr10: true, dolbyVision: false, versionMajor: 4, version: '4.4.0', model: 'OLED55B8LLA' } });

  var probedStart = false;
  globalThis.fetch = function (url) {
    if (String(url).indexOf('/decision') >= 0) {
      return Promise.resolve({
        ok: true,
        status: 200,
        text: function () {
          return [
            '<MediaContainer resourceSession="plex-probe-session">',
            '<Video><Media protocol="hls"><Part decision="transcode" protocol="hls"/></Media></Video>',
            '</MediaContainer>'
          ].join('');
        },
        headers: { get: function () { return 'application/xml'; } }
      });
    }
    // start.m3u8 must NOT be XHR-probed on webOS 4 — hls.js loads it directly.
    probedStart = true;
    return Promise.resolve({
      ok: false,
      status: 400,
      text: function () { return '<html>400 Bad Request</html>'; },
      headers: { get: function () { return 'text/html'; } }
    });
  };

  // Verified by probing PMS directly: mpegts HLS yields a clean .ts playlist
  // (no fMP4 /base/header init segment) and the segments fetch 200, while
  // progressive HTTP returns a 0-byte body. So a forced transcode rides mpegts
  // HLS via hls.js. The start URL still carries the WAN-400-safe minimal param
  // set (no hasMDE / location=wan / X-Plex-* identity) per applyWebOsHls...().
  var session = baseSession({ forceTranscode: true, transcodeSessionId: undefined });
  var result = await resolveStreamUrl(session);
  assert.equal(result.mode, 'transcode-hls');
  assert.ok(/start\.m3u8/.test(result.url), 'webOS 4 forced transcode must use HLS for hls.js');
  assert.equal(result.url.indexOf('protocol=hls') >= 0, true, 'HLS start must set protocol=hls');
  assert.equal(result.url.indexOf('hasMDE=') < 0, true, 'WAN-400-triggering hasMDE must be stripped');
  assert.ok(
    decodeURIComponent(result.url).indexOf('container=mpegts') >= 0,
    'webOS 4 transcode profile-extra must request mpegts'
  );
  assert.equal(probedStart, false, 'native HLS playlist should not be XHR-probed on webOS 4');
});

test('resolveStreamUrl on webOS 4 reroutes direct-stream (copy) to progressive HTTP (fMP4 init segment 404s)', async function () {
  globalThis.PalmSystem = { identifier: 'com.webos.app.xplay-lite' };
  globalThis.webOS = {
    platform: { tv: true },
    deviceInfo: function (cb) {
      cb({ modelName: 'OLED55B8LLA', version: '4.4.0' });
    }
  };
  setPlexDeviceInfo({ modelName: 'OLED55B8LLA', version: '4.4.0' });

  globalThis.fetch = function (url) {
    if (String(url).indexOf('/decision') >= 0) {
      return Promise.resolve({
        ok: true,
        status: 200,
        text: function () {
          return [
            '<MediaContainer resourceSession="plex-copy-session">',
            '<Video><Media protocol="hls"><Part decision="copy" protocol="hls"/></Media></Video>',
            '</MediaContainer>'
          ].join('');
        },
        headers: { get: function () { return 'application/xml'; } }
      });
    }
    return Promise.resolve({
      ok: false,
      status: 400,
      text: function () { return '<html>400 Bad Request</html>'; },
      headers: { get: function () { return 'text/html'; } }
    });
  };

  var session = baseSession({ transcodeSessionId: undefined });
  var result = await resolveStreamUrl(session);
  assert.equal(result.mode, 'direct-stream');
  assert.ok(result.url.indexOf('start.m3u8') < 0, 'webOS 4 copy/remux must use progressive HTTP');
});
