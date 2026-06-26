import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getDeviceCapabilities,
  resolveWebOsMajor,
  isVideoCodecSupported,
  bitrateCeilingKbps,
  isAudioDirectPlay,
  audioTranscodeTarget,
  directPlayAudioCodecList,
  transportFlags,
  subtitlePolicy,
  chromiumVersion,
  hlsVersion,
  uhd8kVideoCodecs,
  releaseInfoForMajor,
  LATEST_WEBOS_VERSION
} from '../src/playback/capabilityMatrix.js';

test('B8 model (no versionMajor) resolves to webOS 4', function () {
  var caps = getDeviceCapabilities({ model: 'OLED55B8LLA' });
  assert.equal(caps.version, 4);
  assert.equal(resolveWebOsMajor({ model: 'OLED55B8LLA' }), 4);

  // webOS 4 must NOT include vp9/av1.
  assert.equal(isVideoCodecSupported(caps, 'vp9'), false);
  assert.equal(isVideoCodecSupported(caps, 'av1'), false);
  assert.equal(caps.entry.video.vp9, undefined);
  assert.equal(caps.entry.video.av1, undefined);

  // webOS 4 transport quirks + no auto subtitle.
  assert.equal(transportFlags(caps).fmp4HlsBroken, true);
  assert.equal(transportFlags(caps).nativeHlsNeedsCodecsPatch, true);
  assert.equal(transportFlags(caps).preferProgressiveHttp, true);
  assert.equal(subtitlePolicy(caps).defaultDecision, 'none');
});

test('versionMajor 5 resolves to webOS 5 with vp9 + av1', function () {
  var caps = getDeviceCapabilities({ versionMajor: 5 });
  assert.equal(caps.version, 5);

  assert.equal(isVideoCodecSupported(caps, 'vp9'), true);
  assert.equal(isVideoCodecSupported(caps, 'av1'), true);

  assert.equal(transportFlags(caps).fmp4HlsBroken, false);
  assert.equal(subtitlePolicy(caps).defaultDecision, 'auto');
});

test('version string "6.2.0" resolves to webOS 6', function () {
  var caps = getDeviceCapabilities({ version: '6.2.0' });
  assert.equal(caps.version, 6);
  assert.equal(subtitlePolicy(caps).defaultDecision, 'auto');
});

test('unknown / empty deviceInfo resolves to default (latest-known / modern) entry', function () {
  var caps = getDeviceCapabilities({});
  assert.equal(caps.version, LATEST_WEBOS_VERSION);
  assert.ok(caps.entry.video.vp9);
  assert.ok(caps.entry.video.av1);

  var capsNull = getDeviceCapabilities(null);
  assert.equal(capsNull.version, LATEST_WEBOS_VERSION);
});

test('year-numbered webOS (22-26) resolves to the modern tier', function () {
  [22, 23, 24, 25, 26].forEach(function (major) {
    var caps = getDeviceCapabilities({ versionMajor: major });
    assert.equal(caps.version, major, 'preserves reported major ' + major);
    assert.equal(caps.entry, getDeviceCapabilities({ versionMajor: 24 }).entry, 'shares one modern entry');
    assert.equal(isVideoCodecSupported(caps, 'av1'), true);
    assert.equal(transportFlags(caps).fmp4HlsBroken, false);
    assert.equal(subtitlePolicy(caps).defaultDecision, 'auto');
  });
});

test('chromium + HLS version per webOS generation', function () {
  assert.equal(chromiumVersion(getDeviceCapabilities({ versionMajor: 4 })), 53);
  assert.equal(hlsVersion(getDeviceCapabilities({ versionMajor: 4 })), 5);
  assert.equal(chromiumVersion(getDeviceCapabilities({ versionMajor: 5 })), 68);
  assert.equal(hlsVersion(getDeviceCapabilities({ versionMajor: 5 })), 7);
  // modern tier reports the modern-range minimum engine.
  assert.equal(chromiumVersion(getDeviceCapabilities({ versionMajor: 24 })), 87);

  // Exact per-year engine/HLS comes from WEBOS_RELEASES.
  assert.equal(releaseInfoForMajor(26).chromium, 132);
  assert.equal(releaseInfoForMajor(24).chromium, 108);
  assert.equal(releaseInfoForMajor(22).chromium, 87);
  assert.equal(releaseInfoForMajor(26).hls, 7);
  assert.equal(releaseInfoForMajor(4).chromium, 53);
});

test('TLS + HTTP/2 transport per webOS version', function () {
  // webOS 4 caps at TLS 1.2 and has no HTTP/2; 5+ add TLS 1.3 + HTTP/2.
  assert.equal(releaseInfoForMajor(4).tls, 1.2);
  assert.equal(releaseInfoForMajor(4).http2, false);
  assert.equal(releaseInfoForMajor(5).tls, 1.3);
  assert.equal(releaseInfoForMajor(5).http2, true);
  assert.equal(releaseInfoForMajor(26).tls, 1.3);
  assert.equal(releaseInfoForMajor(26).http2, true);
});

test('8K codecs: none on webOS 4, hevc+av1 on modern', function () {
  assert.deepEqual(uhd8kVideoCodecs(getDeviceCapabilities({ versionMajor: 4 })), []);
  assert.ok(uhd8kVideoCodecs(getDeviceCapabilities({ versionMajor: 24 })).indexOf('hevc') >= 0);
  assert.ok(uhd8kVideoCodecs(getDeviceCapabilities({ versionMajor: 24 })).indexOf('av1') >= 0);
});

test('versionMajor (from sdkVersion) takes precedence over B8 model regex', function () {
  // With the official getSystemInfo sdkVersion, even B8 can report accurate versions.
  // If a B8 reports versionMajor:4 (from sdkVersion "4.4.3-22"), use that.
  // If a future device reports versionMajor:5 (from sdkVersion "5.x.x"), use that too.
  var caps = getDeviceCapabilities({ versionMajor: 5, model: 'OLED55B8LLA' });
  assert.equal(caps.version, 5);
  assert.equal(resolveWebOsMajor({ versionMajor: 5, model: 'OLED55B8LLA' }), 5);

  // But B8 with correct sdkVersion stays webOS 4
  var capsB8 = getDeviceCapabilities({ versionMajor: 4, model: 'OLED55B8LLA' });
  assert.equal(capsB8.version, 4);
  assert.equal(resolveWebOsMajor({ versionMajor: 4, model: 'OLED55B8LLA' }), 4);
});

test('audio direct-play and transcode targets (DTS spec-correct)', function () {
  var caps = getDeviceCapabilities({ model: 'OLED55B8LLA' });

  // base DTS core direct-plays; DTS-HD MA does not.
  assert.equal(isAudioDirectPlay(caps, 'dca'), true);
  assert.equal(isAudioDirectPlay(caps, 'dca-ma'), false);

  // null / empty → true (treat as compatible / unknown).
  assert.equal(isAudioDirectPlay(caps, null), true);
  assert.equal(isAudioDirectPlay(caps, ''), true);

  // case-insensitive.
  assert.equal(isAudioDirectPlay(caps, 'AC3'), true);

  assert.equal(audioTranscodeTarget(caps, 'dca-ma'), 'ac3');
  assert.equal(audioTranscodeTarget(caps, 'flac'), 'aac');
  assert.equal(audioTranscodeTarget(caps, 'truehd'), 'ac3');
  // direct-play codec → null (nothing to transcode).
  assert.equal(audioTranscodeTarget(caps, 'aac'), null);
  // unknown codec → null.
  assert.equal(audioTranscodeTarget(caps, 'bogus'), null);

  assert.ok(directPlayAudioCodecList(caps).indexOf('dca') >= 0);
});

test('bitrate ceilings match lgBitrateLimits', function () {
  var caps = getDeviceCapabilities({ model: 'OLED55B8LLA' });
  assert.equal(bitrateCeilingKbps(caps, 'h264', false), 40000); // FHD h264
  assert.equal(bitrateCeilingKbps(caps, 'hevc', true), 60000);  // UHD hevc
  assert.equal(bitrateCeilingKbps(caps, 'h264', true), 50000);  // UHD h264
});

test('accessors tolerate resolved entry, {version,entry}, and raw deviceInfo', function () {
  var deviceInfo = { model: 'OLED55B8LLA' };
  var resolved = getDeviceCapabilities(deviceInfo);

  // {version,entry} object
  assert.equal(isAudioDirectPlay(resolved, 'dca'), true);
  // resolved entry directly
  assert.equal(isAudioDirectPlay(resolved.entry, 'dca'), true);
  // raw deviceInfo
  assert.equal(isAudioDirectPlay(deviceInfo, 'dca'), true);

  assert.equal(bitrateCeilingKbps(resolved.entry, 'h264', false), 40000);
  assert.equal(bitrateCeilingKbps(deviceInfo, 'h264', false), 40000);
});
