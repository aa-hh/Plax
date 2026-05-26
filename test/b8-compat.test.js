import test from 'node:test';
import assert from 'node:assert/strict';

import { MIN_WEBOS_TV_MAJOR } from '../src/platform/versionGate.js';
import { tvLikelySupportsDtsFromDevice, parseWebOsMajor } from '../src/platform/webos.js';
import { probePlayback } from '../src/playback/capabilityProbe.js';

var h264Ok = { h264: 'probably', hevc: 'probably', ac3: 'probably', eac3: '', dts: '' };
var dtsInferred = Object.assign({}, h264Ok, { dts: 'probably', dtsInferred: true });

test('version gate allows webOS TV 4.x (LG B8)', function () {
  assert.equal(MIN_WEBOS_TV_MAJOR, 4);
});

test('tvLikelySupportsDtsFromDevice for B8 / webOS 4 deviceInfo', function () {
  assert.equal(tvLikelySupportsDtsFromDevice({ versionMajor: 4, modelName: 'OLED55B8PUA' }), true);
  assert.equal(tvLikelySupportsDtsFromDevice({ version: '4.9.0', modelName: 'LG TV' }), true);
  assert.equal(tvLikelySupportsDtsFromDevice({ versionMajor: 3 }), false);
  assert.equal(tvLikelySupportsDtsFromDevice({ modelName: 'OLED65C8PLA' }), true);
  assert.equal(parseWebOsMajor({ version: '5.2.1' }), 5);
});

test('probePlayback: DTS probe miss still allows direct stream on Auto', function () {
  var version = {
    videoCodec: 'h264',
    audioCodec: 'dca-ma',
    container: 'mkv',
    bitrate: 8000
  };
  var probe = probePlayback({}, version, h264Ok, { uhd: false });
  assert.equal(probe.canDirectPlay, false);
  assert.equal(probe.canDirectStream, true);
  assert.ok(probe.warnings.some(function (w) { return w.indexOf('DTS') >= 0; }));
});

test('probePlayback: inferred DTS allows progressive direct play', function () {
  var version = {
    videoCodec: 'h264',
    audioCodec: 'dts',
    container: 'mp4',
    bitrate: 8000
  };
  var probe = probePlayback({}, version, dtsInferred, { uhd: false, versionMajor: 4 });
  assert.equal(probe.canDirectPlay, true);
  assert.equal(probe.canDirectStream, true);
});

test('probePlayback: HEVC miss blocks both direct play and direct stream', function () {
  var version = {
    videoCodec: 'hevc',
    audioCodec: 'aac',
    container: 'mp4',
    bitrate: 8000
  };
  var caps = { h264: 'probably', hevc: '', ac3: '', eac3: '', dts: '' };
  var probe = probePlayback({}, version, caps, { uhd: true });
  assert.equal(probe.canDirectPlay, false);
  assert.equal(probe.canDirectStream, false);
});
