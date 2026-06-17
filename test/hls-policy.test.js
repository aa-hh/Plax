import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyWebOsHlsTranscodeParams,
  buildHttpTranscodeFallbackParams,
  extractHlsManifestDiagnostics,
  usesWebOsTvPmsProfile,
  shouldUseWebOsHlsProfileExtra,
  isWebOs4Tv,
  isHlsSourceRejectedError,
  WEBOS_HLS_MPEGTS_PROFILE_EXTRA,
  WEBOS_HLS_FMP4_PROFILE_EXTRA,
  WEBOS_HLS_TRANSCODE_FMP4_PROFILE_EXTRA
} from '../src/playback/hlsPolicy.js';
import {
  setPlexDeviceInfo,
  resetPlexDeviceInfoForTest,
  PMS_PRODUCT
} from '../src/plex/clientIdentity.js';
import { setState } from '../src/core/store.js';

var savedPalmSystem;
var savedWebOS;

function mockTvWebOS(device) {
  globalThis.webOS = {
    platform: { tv: true },
    deviceInfo: function (cb) {
      cb(device || {});
    }
  };
}

test.beforeEach(function () {
  resetPlexDeviceInfoForTest();
  savedPalmSystem = globalThis.PalmSystem;
  savedWebOS = globalThis.webOS;
  globalThis.PalmSystem = { identifier: 'com.webos.app.xplay-lite' };
  mockTvWebOS({ modelName: 'OLED55B9PUA', version: '4.9.0' });
});

test.afterEach(function () {
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

test('webOS 4 TV HLS start uses device profile with HEVC direct play', function () {
  setPlexDeviceInfo({ modelName: 'OLED55B8LLA', version: '4.4.0', uhd: true });
  setState({ deviceInfo: { uhd: true, hdr10: true, dolbyVision: false, versionMajor: 4 } });
  assert.equal(isWebOs4Tv(), true);

  var remux = applyWebOsHlsTranscodeParams({}, { strategy: 'direct-stream' });
  assert.equal(remux['X-Plex-Client-Profile-Name'], 'Generic');
  assert.ok(remux['X-Plex-Client-Profile-Extra'].indexOf('videoCodec=h264,hevc') >= 0);
  assert.equal(remux.protocol, 'hls');

  var transcode = applyWebOsHlsTranscodeParams({}, { strategy: 'transcode' });
  assert.equal(transcode['X-Plex-Client-Profile-Name'], 'Generic');
  assert.ok(transcode['X-Plex-Client-Profile-Extra'].indexOf('add-transcode-target') >= 0);
  assert.ok(!/add-transcode-target[^+]*videoCodec=h264,hevc/.test(transcode['X-Plex-Client-Profile-Extra']));
});

test('webOS 5+ TV keeps mpegts profile extra', function () {
  setPlexDeviceInfo({ modelName: 'OLED65C1PUA', version: '6.2.1' });
  assert.equal(isWebOs4Tv(), false);

  var params = applyWebOsHlsTranscodeParams({}, { strategy: 'direct-stream' });
  assert.equal(params['X-Plex-Client-Profile-Extra'], WEBOS_HLS_MPEGTS_PROFILE_EXTRA);
});

test('applyWebOsHlsTranscodeParams includes profile extra for webOS simulator HLS', function () {
  setPlexDeviceInfo({
    modelName: 'WEBOS26_SIMULATOR',
    version: '26.0.0'
  });
  assert.equal(usesWebOsTvPmsProfile(), false);
  assert.equal(shouldUseWebOsHlsProfileExtra(), true);

  var params = applyWebOsHlsTranscodeParams({}, { strategy: 'direct-stream' });
  assert.equal(params.protocol, 'hls');
  assert.equal(params['X-Plex-Client-Profile-Extra'], WEBOS_HLS_MPEGTS_PROFILE_EXTRA);
});

test('isHlsSourceRejectedError matches play() rejection text', function () {
  assert.equal(isHlsSourceRejectedError({
    message: 'Failed to load because no supported source was found.'
  }), true);
  assert.equal(isHlsSourceRejectedError({ message: 'Network error' }), false);
});

test('buildHttpTranscodeFallbackParams strips profile extra', function () {
  setPlexDeviceInfo({ modelName: 'OLED55B8LLA', version: '4.4.0' });
  var hls = applyWebOsHlsTranscodeParams({ offset: '10' }, { strategy: 'transcode' });
  var http = buildHttpTranscodeFallbackParams(hls);
  assert.equal(http.protocol, 'http');
  assert.equal(http['X-Plex-Client-Profile-Extra'], undefined);
  assert.equal(http.offset, '10');
});

test('usesWebOsTvPmsProfile is false without TV runtime', function () {
  delete globalThis.PalmSystem;
  delete globalThis.webOS;
  assert.equal(usesWebOsTvPmsProfile(), false);
});

test('usesWebOsTvPmsProfile is true for real LG TV device', function () {
  setPlexDeviceInfo({ modelName: 'OLED65C1PUA', version: '6.2.1' });
  assert.equal(usesWebOsTvPmsProfile(), true);
  assert.equal(PMS_PRODUCT, 'Plex for LG');
});

test('extractHlsManifestDiagnostics pulls STREAM-INF and CODECS', function () {
  var body = [
    '#EXTM3U',
    '#EXT-X-STREAM-INF:BANDWIDTH=4200000,CODECS="avc1.640028,mp4a.40.2",RESOLUTION=1920x1080',
    'session/video.m3u8',
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",CODECS="mp4a.40.2",URI="audio.m3u8"'
  ].join('\n');
  var diag = extractHlsManifestDiagnostics(body);
  assert.equal(diag.isM3u8, true);
  assert.equal(diag.streamInfs.length, 1);
  assert.ok(diag.streamInfs[0].indexOf('CODECS=') >= 0);
  assert.equal(diag.mediaTags.length, 1);
  assert.ok(diag.snippet.indexOf('CODECS=avc1.640028,mp4a.40.2') >= 0);
});
