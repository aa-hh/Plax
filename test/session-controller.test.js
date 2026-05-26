import test from 'node:test';
import assert from 'node:assert/strict';

import { getState, setState } from '../src/core/store.js';
import {
  setPlexDeviceInfo,
  resetPlexDeviceInfoForTest,
  PMS_PRODUCT
} from '../src/plex/clientIdentity.js';
import { WEBOS_HLS_PROFILE_EXTRA } from '../src/playback/hlsPolicy.js';
import {
  buildDirectPlayUrl,
  buildPlaybackUrl,
  resolvePlaybackStrategy,
  resolveStreamUrl
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

function baseSession(overrides) {
  return Object.assign({
    server: mockServer,
    item: { ratingKey: '12345' },
    version: { partKey: partKey },
    sessionId: 'xplay-test-session',
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

test('buildPlaybackUrl HLS includes webOS profile extra only for Plex for LG', function () {
  globalThis.PalmSystem = { identifier: 'com.webos.app.xplay-lite' };
  globalThis.webOS = {
    platform: { tv: true },
    deviceInfo: function (cb) {
      cb({ modelName: 'OLED55B9PUA', version: '4.9.0' });
    }
  };
  setPlexDeviceInfo({ modelName: 'OLED55B9PUA', version: '4.9.0' });

  var session = baseSession({ forceTranscode: true });
  var q = parseQuery(buildPlaybackUrl(mockServer, partKey, session, 'hls'));
  assert.equal(q['X-Plex-Product'], PMS_PRODUCT);
  assert.equal(q['X-Plex-Client-Profile-Extra'], WEBOS_HLS_PROFILE_EXTRA);
  assert.ok(q.path && q.path.indexOf('http') < 0);
  assert.equal(q.location, 'wan');
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
  assert.equal(q['X-Plex-Client-Profile-Extra'], WEBOS_HLS_PROFILE_EXTRA);
  assert.equal(q.path, '/library/metadata/12345');
  assert.equal(q.location, 'wan');
  assert.equal(q.directStream, '1');
  assert.equal(q.skipSubtitles, '1');
  assert.equal(q.subtitles, undefined);
  assert.equal(q.subtitleStreamID, undefined);
  assert.equal(q['X-Plex-Subtitle-Stream'], undefined);
  assert.equal(q.transcodeSessionId, 'xplay-test-session');
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

test('resolvePlaybackStrategy upgrades direct to direct-stream when text subs selected', function () {
  setState({ playbackPrefs: Object.assign({}, savedPlaybackPrefs, { quality: 'auto', directPlay: true }) });
  assert.equal(
    resolvePlaybackStrategy({ quality: 'auto', subtitleStreamId: 5, subtitleBurnIn: false }),
    'direct-stream'
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
  var session = baseSession({ playbackStrategy: 'direct' });
  var result = await resolveStreamUrl(session);
  assert.equal(result.mode, 'direct');
  assert.ok(result.url.indexOf(partKey) >= 0);
  assert.ok(result.url.indexOf('transcode') < 0);
  assert.equal(parseQuery(result.url)['X-Plex-Token'], 'server-token-xyz');
});

test('resolveStreamUrl HLS transcode returns m3u8 and transcode-hls mode', async function () {
  var session = baseSession({ forceTranscode: true, transcodeProtocol: 'hls' });
  var result = await resolveStreamUrl(session);
  assert.equal(result.mode, 'transcode-hls');
  assert.ok(/start\.m3u8/.test(result.url));
});

test('resolveStreamUrl primes decision with metadata path and headers', async function () {
  var calls = [];
  globalThis.fetch = function (url, init) {
    calls.push({ url: String(url), init: init || {} });
    return Promise.resolve({
      ok: true,
      status: 200,
      text: function () {
        return Promise.resolve('<MediaContainer resourceSession="plex-decision-session"/>');
      },
      headers: { get: function () { return 'application/xml'; } }
    });
  };

  var session = baseSession({
    item: { key: '/library/metadata/12345', ratingKey: '12345' },
    playbackStrategy: 'direct-stream',
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
  var decisionQuery = parseQuery(decision.url);
  var startQuery = parseQuery(result.url);

  assert.equal(decisionQuery.path, '/library/metadata/12345');
  assert.equal(decisionQuery.directStream, '1');
  assert.equal(decisionQuery.offset, '454');
  assert.equal(decisionQuery.transcodeSessionId, 'xplay-test-session');
  assert.equal(decisionQuery.skipSubtitles, '1');
  assert.equal(decisionQuery['X-Plex-Audio-Stream'], undefined);
  assert.equal(decisionQuery['X-Plex-Auto-Audio-Stream'], undefined);
  assert.equal(decisionQuery['X-Plex-Session-Identifier'], 'xplay-test-session');
  assert.equal(decisionQuery['X-Plex-Token'], undefined);
  assert.equal(decisionQuery['X-Plex-Client-Identifier'], undefined);
  assert.equal(decision.init.headers['X-Plex-Token'], 'server-token-xyz');
  assert.equal(decision.init.headers['X-Plex-Session-Identifier'], 'xplay-test-session');
  assert.equal(decision.init.headers['X-Plex-Product'], 'Plex Web');

  assert.equal(result.mode, 'direct-stream');
  assert.equal(startQuery.path, '/library/metadata/12345');
  assert.equal(startQuery.session, 'plex-decision-session');
  assert.equal(startQuery.transcodeSessionId, 'plex-decision-session');
  assert.equal(startQuery.skipSubtitles, '1');
  assert.equal(startQuery.subtitles, undefined);
  assert.equal(startQuery.subtitleStreamID, undefined);
  assert.equal(startQuery['X-Plex-Audio-Stream'], '1894443');
  assert.equal(startQuery['X-Plex-Token'], 'server-token-xyz');
});

test('resolveStreamUrl http-transcode returns start URL and transcode-http mode', async function () {
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
    return Promise.resolve({
      ok: true,
      status: 200,
      text: function () {
        return Promise.resolve('<MediaContainer resourceSession="plex-burn-session"/>');
      },
      headers: { get: function () { return 'application/xml'; } }
    });
  };

  var session = baseSession({
    forceTranscode: true,
    playbackStrategy: 'transcode',
    subtitleStreamId: 1894297,
    subtitleBurnIn: true,
    subtitleAdvancedBurn: true
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
  assert.equal(decisionQuery.directPlay, '0');
  assert.equal(decisionQuery.directStream, '0');
});

test('resolveStreamUrl selects subtitle stream before burn-in transcode', async function () {
  var calls = [];
  globalThis.fetch = function (url, init) {
    calls.push({ url: String(url), init: init || {} });
    return Promise.resolve({
      ok: true,
      status: 200,
      text: function () {
        return Promise.resolve('<MediaContainer resourceSession="plex-burn-session"/>');
      },
      headers: { get: function () { return 'application/xml'; } }
    });
  };

  var session = baseSession({
    forceTranscode: true,
    playbackStrategy: 'transcode',
    subtitleStreamId: 1894297,
    subtitleBurnIn: true
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

test('resolveStreamUrl falls back to metadata path when no part key', async function () {
  var session = {
    server: mockServer,
    item: { ratingKey: '555' },
    playbackStrategy: 'direct'
  };
  var result = await resolveStreamUrl(session);
  assert.ok(result.url.indexOf('/library/metadata/555') >= 0);
});
