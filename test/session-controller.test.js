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

test.beforeEach(function () {
  savedPlaybackPrefs = Object.assign({}, getState().playbackPrefs);
  resetPlexDeviceInfoForTest();
  savedPalmSystem = globalThis.PalmSystem;
  savedWebOS = globalThis.webOS;
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

test('buildPlaybackUrl simulator Plex Web omits profile extra on HLS', function () {
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
  assert.equal(q['X-Plex-Client-Profile-Extra'], undefined);
  assert.equal(q.path, partKey);
  assert.equal(q.location, 'wan');
  assert.equal(q.directStream, '1');
  assert.equal(q.subtitles, 'auto');
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

test('buildPlaybackUrl direct-stream with text subs includes soft subtitle params', function () {
  var session = baseSession({
    playbackStrategy: 'direct-stream',
    subtitleStreamId: 1894297,
    subtitleBurnIn: false
  });
  var q = parseQuery(buildPlaybackUrl(mockServer, partKey, session, 'hls'));
  assert.equal(q.subtitles, 'auto');
  assert.equal(q.subtitleStreamID, '1894297');
  assert.equal(q['X-Plex-Subtitle-Stream'], '1894297');
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

test('buildPlaybackUrl omits burn for SRT transcode without subtitleBurnIn', function () {
  var session = baseSession({
    forceTranscode: true,
    playbackStrategy: 'transcode',
    subtitleStreamId: 1894297,
    subtitleBurnIn: false
  });
  var q = parseQuery(buildPlaybackUrl(mockServer, partKey, session, 'hls'));
  assert.equal(q.subtitles, undefined);
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
  assert.equal(q['X-Plex-Subtitle-Stream'], '1894297');
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
