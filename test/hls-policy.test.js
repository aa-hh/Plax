import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyWebOsHlsTranscodeParams,
  buildHttpTranscodeFallbackParams,
  usesWebOsTvPmsProfile,
  WEBOS_HLS_PROFILE_EXTRA
} from '../src/playback/hlsPolicy.js';
import {
  setPlexDeviceInfo,
  resetPlexDeviceInfoForTest,
  PMS_PRODUCT
} from '../src/plex/clientIdentity.js';

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

test('WEBOS_HLS_PROFILE_EXTRA uses videoCodec and audioCodec with protocol=hls', function () {
  assert.match(WEBOS_HLS_PROFILE_EXTRA, /videoCodec=h264/);
  assert.match(WEBOS_HLS_PROFILE_EXTRA, /audioCodec=aac/);
  assert.match(WEBOS_HLS_PROFILE_EXTRA, /protocol=hls/);
  assert.ok(WEBOS_HLS_PROFILE_EXTRA.indexOf('codec=h264') < 0);
  assert.ok(WEBOS_HLS_PROFILE_EXTRA.indexOf('type=audioProfile') < 0);
});

test('applyWebOsHlsTranscodeParams omits profile extra for Plex Web identity', function () {
  setPlexDeviceInfo({
    modelName: 'WEBOS26_SIMULATOR',
    version: '26.0.0'
  });
  assert.equal(usesWebOsTvPmsProfile(), false);

  var params = applyWebOsHlsTranscodeParams({});
  assert.equal(params.protocol, 'hls');
  assert.equal(params['X-Plex-Client-Profile-Extra'], undefined);
});

test('applyWebOsHlsTranscodeParams sets profile extra for Plex for LG', function () {
  setPlexDeviceInfo({ modelName: 'OLED55B9PUA', version: '4.9.0' });
  assert.equal(usesWebOsTvPmsProfile(), true);

  var params = applyWebOsHlsTranscodeParams({});
  assert.equal(params['X-Plex-Client-Profile-Extra'], WEBOS_HLS_PROFILE_EXTRA);
});

test('buildHttpTranscodeFallbackParams strips profile extra', function () {
  setPlexDeviceInfo({ modelName: 'OLED55B9PUA', version: '4.9.0' });
  var hls = applyWebOsHlsTranscodeParams({ offset: '10' });
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
