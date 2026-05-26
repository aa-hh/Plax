import test from 'node:test';
import assert from 'node:assert/strict';

import { getState, setState } from '../src/core/store.js';
import {
  getPlexClientIdentity,
  plexClientFields,
  setPlexDeviceInfo,
  resetPlexDeviceInfoForTest,
  PMS_PRODUCT,
  PMS_PLATFORM
} from '../src/plex/clientIdentity.js';
import { plexClientQuery } from '../src/plex/client.js';
import { buildPlaybackUrl } from '../src/playback/sessionController.js';

var savedClientId;
var savedPalmSystem;

test.beforeEach(function () {
  savedClientId = getState().clientId;
  setState({ clientId: 'test-client-uuid-1234' });
  resetPlexDeviceInfoForTest();
  savedPalmSystem = globalThis.PalmSystem;
  globalThis.PalmSystem = { identifier: 'com.webos.app.xplay-lite' };
});

test.afterEach(function () {
  resetPlexDeviceInfoForTest();
  setState({ clientId: savedClientId });
  if (savedPalmSystem === undefined) {
    delete globalThis.PalmSystem;
  } else {
    globalThis.PalmSystem = savedPalmSystem;
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

test('plexClientQuery includes platform version and model', function () {
  setPlexDeviceInfo({ modelName: 'OLED65C1PUA', firmwareVersion: '6.2.1' });

  var q = plexClientQuery();
  assert.equal(q['X-Plex-Product'], PMS_PRODUCT);
  assert.equal(q['X-Plex-Platform-Version'], '6.2.1');
  assert.equal(q['X-Plex-Model'], 'OLED65C1PUA');
});

test('buildPlaybackUrl transcode query carries full Plex client identity', function () {
  setPlexDeviceInfo({ modelName: 'OLED55B9PUA', version: '4.9.0' });

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
      mediaIndex: 0,
      partIndex: 0
    },
    'hls'
  );
  var u = new URL(url);
  assert.equal(u.searchParams.get('X-Plex-Product'), PMS_PRODUCT);
  assert.equal(u.searchParams.get('X-Plex-Platform'), PMS_PLATFORM);
  assert.equal(u.searchParams.get('X-Plex-Platform-Version'), '4.9.0');
  assert.equal(u.searchParams.get('X-Plex-Model'), 'OLED55B9PUA');
  assert.equal(u.searchParams.get('X-Plex-Client-Identifier'), 'test-client-uuid-1234');
});
