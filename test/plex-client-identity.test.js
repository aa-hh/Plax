import test from 'node:test';
import assert from 'node:assert/strict';

import { getState, setState } from '../src/core/store.js';
import {
  getPlexClientIdentity,
  plexClientFields,
  setPlexDeviceInfo,
  resetPlexDeviceInfoForTest,
  isSimulatorPlexIdentity,
  PMS_PRODUCT,
  PMS_PLATFORM
} from '../src/plex/clientIdentity.js';
import { plexClientQuery } from '../src/plex/client.js';
import { buildPlaybackUrl } from '../src/backends/plex/playback.js';

var savedClientId;
var savedPalmSystem;
var savedWebOS;

function mockRealTvWebOS() {
  globalThis.webOS = {
    platform: { tv: true },
    deviceInfo: function (cb) {
      cb({});
    }
  };
}

test.beforeEach(function () {
  savedClientId = getState().clientId;
  setState({ clientId: 'test-client-uuid-1234' });
  resetPlexDeviceInfoForTest();
  savedPalmSystem = globalThis.PalmSystem;
  savedWebOS = globalThis.webOS;
  globalThis.PalmSystem = { identifier: 'com.webos.app.plax' };
  mockRealTvWebOS();
});

test.afterEach(function () {
  resetPlexDeviceInfoForTest();
  setState({ clientId: savedClientId });
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

test('plexClientFields on TV runtime uses Plex for LG webOS identity', function () {
  setPlexDeviceInfo({
    modelName: 'OLED55B9PUA',
    version: '4.7.0',
    versionMajor: 4
  });

  var fields = plexClientFields();
  assert.equal(fields['X-Plex-Product'], PMS_PRODUCT);
  assert.equal(fields['X-Plex-Platform'], PMS_PLATFORM);
  assert.equal(fields['X-Plex-Platform-Version'], '4.7.0');
  assert.equal(fields['X-Plex-Model'], 'OLED55B9PUA');
  assert.equal(fields['X-Plex-Device'], 'TV');
  assert.equal(fields['X-Plex-Device-Name'], 'LG OLED55B9PUA');
  assert.equal(fields['X-Plex-Client-Identifier'], 'test-client-uuid-1234');
  assert.ok(fields['X-Plex-Version']);
});

test('plexClientFields fills platformVersion and model when TV fields missing', function () {
  setPlexDeviceInfo({ versionMajor: 5 });

  var identity = getPlexClientIdentity();
  assert.equal(identity.platformVersion, '5.0');
  assert.equal(identity.model, 'webOSTV');
  assert.equal(identity.deviceName, 'LG webOS TV');
});

test('platformVersion prefers webOS semver over firmware-style platformVersion', function () {
  setPlexDeviceInfo({
    modelName: 'OLED55B9PUA',
    platformVersion: '02.16.30',
    version: '4.9.0'
  });

  var identity = getPlexClientIdentity();
  assert.equal(identity.platformVersion, '4.9.0');
});

test('plexClientQuery includes platform version and model', function () {
  setPlexDeviceInfo({ modelName: 'OLED65C1PUA', firmwareVersion: '6.2.1' });

  var q = plexClientQuery();
  assert.equal(q['X-Plex-Product'], PMS_PRODUCT);
  assert.equal(q['X-Plex-Platform-Version'], '6.2.1');
  assert.equal(q['X-Plex-Model'], 'OLED65C1PUA');
});

test('buildPlaybackUrl transcode query carries full Plex client identity', function () {
  setPlexDeviceInfo({ modelName: 'OLED55B9PUA', version: '5.4.0' });

  var server = {
    connectionUri: 'https://plex.example.com:32400',
    accessToken: 'tok'
  };
  var url = buildPlaybackUrl(
    server,
    '/library/parts/1/file.mkv',
    {
      server: server,
      forceTranscode: true,
      sessionId: 'sess-1',
      transcodeSessionId: 'plex-transcode-sess-1',
      mediaIndex: 0,
      partIndex: 0
    },
    'hls'
  );
  var u = new URL(url);
  assert.equal(u.searchParams.get('X-Plex-Product'), PMS_PRODUCT);
  assert.equal(u.searchParams.get('X-Plex-Platform'), PMS_PLATFORM);
  assert.equal(u.searchParams.get('X-Plex-Platform-Version'), '5.4.0');
  assert.equal(u.searchParams.get('X-Plex-Model'), 'OLED55B9PUA');
  assert.equal(u.searchParams.get('X-Plex-Client-Identifier'), 'test-client-uuid-1234');
});

test('simulator runtime uses Plex Web Chrome identity', function () {
  delete globalThis.webOS;
  setPlexDeviceInfo({
    modelName: 'WEBOS26_SIMULATOR',
    platformVersion: '02.16.30',
    versionMajor: 2
  });

  var fields = plexClientFields();
  assert.equal(fields['X-Plex-Product'], 'Plex Web');
  assert.equal(fields['X-Plex-Platform'], 'Chrome');
  assert.equal(fields['X-Plex-Device'], 'Computer');
  assert.equal(fields['X-Plex-Model'], 'Browser');
  assert.ok(fields['X-Plex-Platform-Version']);
});

test('simulator model on TV webOS stack uses Plex Web identity', function () {
  setPlexDeviceInfo({
    modelName: 'WEBOS26_SIMULATOR',
    platformVersion: '02.16.30',
    version: '26.0.0'
  });

  assert.equal(isSimulatorPlexIdentity({ modelName: 'WEBOS26_SIMULATOR' }), true);
  var identity = getPlexClientIdentity();
  assert.equal(identity.product, 'Plex Web');
  assert.equal(identity.platform, 'Chrome');
  assert.equal(identity.model, 'Browser');
});
