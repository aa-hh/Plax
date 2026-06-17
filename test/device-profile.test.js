import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWebOsClientProfileExtra,
  buildDirectPlayProfiles,
  buildSubtitleProfiles,
  buildCodecProfiles,
  buildTranscodeTargets,
  buildBitrateLimitations
} from '../src/playback/deviceProfile.js';
import { getDeviceCapabilities } from '../src/playback/capabilityMatrix.js';
import { setState } from '../src/core/store.js';

var uhdDevice = {
  uhd: true,
  hdr10: true,
  dolbyVision: true,
  versionMajor: 4,
  model: 'OLED55B8LLA'
};

test('direct-play profile advertises HEVC in mp4/mkv/ts', function () {
  var profiles = buildDirectPlayProfiles(uhdDevice);
  assert.ok(profiles[0].indexOf('container=mp4,mkv,ts') >= 0);
  assert.ok(profiles[0].indexOf('videoCodec=h264,hevc') >= 0);
  assert.ok(profiles[0].indexOf('audioCodec=aac,ac3,eac3') >= 0);
});

test('direct-play profile includes DTS core but not DTS-HD variants', function () {
  var profiles = buildDirectPlayProfiles(uhdDevice);
  // The audioCodec list ends before subtitleCodec, so check the audio segment.
  var audioSeg = profiles[0].slice(
    profiles[0].indexOf('audioCodec='),
    profiles[0].indexOf('&subtitleCodec=')
  );
  assert.ok(/(^|,)dca($|,)/.test(audioSeg.replace('audioCodec=', '')), 'dca present');
  assert.equal(audioSeg.indexOf('dca-ma'), -1, 'dca-ma absent');
  assert.equal(audioSeg.indexOf('dca-hi-res'), -1, 'dca-hi-res absent');
  assert.equal(audioSeg.indexOf('dca-x'), -1, 'dca-x absent');
});

test('direct-play profile declares soft-text subtitle codecs', function () {
  var profiles = buildDirectPlayProfiles(uhdDevice);
  assert.ok(profiles[0].indexOf('subtitleCodec=srt') >= 0);
  assert.ok(profiles[0].indexOf('webvtt') >= 0);
});

test('subtitle profile declares soft-text codecs', function () {
  var caps = getDeviceCapabilities(uhdDevice);
  var subs = buildSubtitleProfiles(caps);
  assert.equal(subs.length, 1);
  assert.ok(subs[0].indexOf('type=subtitleProfile') >= 0);
  assert.ok(subs[0].indexOf('codec=srt,ass,ssa,subrip,webvtt') >= 0);
});

test('DV device adds mp4-only direct-play profile', function () {
  var profiles = buildDirectPlayProfiles(uhdDevice);
  assert.equal(profiles.length, 2);
  assert.ok(profiles[1].indexOf('container=mp4&videoCodec=hevc') >= 0);
});

test('copy/remux transcode targets keep HEVC', function () {
  var targets = buildTranscodeTargets(uhdDevice, null, { strategy: 'direct-stream' });
  var joined = targets.join('+');
  assert.ok(joined.indexOf('videoCodec=h264,hevc') >= 0);
  assert.ok(joined.indexOf('protocol=http') >= 0);
  assert.ok(joined.indexOf('container=mp4&videoCodec=hevc') >= 0);
});

test('full transcode targets use h264 only', function () {
  var targets = buildTranscodeTargets(uhdDevice, null, { strategy: 'transcode' });
  var joined = targets.join('+');
  assert.ok(joined.indexOf('videoCodec=h264') >= 0);
  assert.equal(joined.indexOf('videoCodec=h264,hevc'), -1);
});

test('DTS-HD MA audio maps to ac3 transcode target', function () {
  var extra = buildWebOsClientProfileExtra(uhdDevice, { strategy: 'direct-stream' });
  assert.ok(extra.indexOf('audioCodec=dca-ma&transcodeCodec=ac3') >= 0);
});

test('TrueHD audio maps to ac3 transcode target', function () {
  var extra = buildWebOsClientProfileExtra(uhdDevice, { strategy: 'direct-stream' });
  assert.ok(extra.indexOf('audioCodec=truehd&transcodeCodec=ac3') >= 0);
});

test('codec profiles use Plex name/value limitation grammar', function () {
  var caps = getDeviceCapabilities(uhdDevice);
  var profiles = buildCodecProfiles(caps, uhdDevice);
  var joined = profiles.join('+');
  // New grammar — name/value pairs, not videoResolution/maxVideoBitrate.
  assert.ok(joined.indexOf('scope=videoCodec&codec=h264&name=video.bitrate&value=50000') >= 0);
  assert.ok(joined.indexOf('scope=videoCodec&codec=hevc&name=video.bitrate&value=60000') >= 0);
  assert.ok(joined.indexOf('codec=h264&name=video.level&value=42') >= 0);
  assert.ok(joined.indexOf('codec=hevc&name=video.bitDepth&value=10') >= 0);
  assert.ok(joined.indexOf('codec=*&name=audio.channels&value=6') >= 0);
  // Must NOT use the old malformed grammar.
  assert.equal(joined.indexOf('videoResolution'), -1);
  assert.equal(joined.indexOf('maxVideoBitrate'), -1);
});

test('bitrate limitations alias returns the video.bitrate subset (UHD ceilings)', function () {
  var limits = buildBitrateLimitations(uhdDevice);
  var joined = limits.join('+');
  assert.ok(joined.indexOf('codec=h264&name=video.bitrate&value=50000') >= 0);
  assert.ok(joined.indexOf('codec=hevc&name=video.bitrate&value=60000') >= 0);
  // alias only emits video.bitrate, nothing else.
  assert.equal(joined.indexOf('video.level'), -1);
  assert.equal(joined.indexOf('audio.channels'), -1);
});

test('buildWebOsClientProfileExtra includes subtitle profile + new limitation grammar', function () {
  var extra = buildWebOsClientProfileExtra(uhdDevice, { strategy: 'direct-stream' });
  assert.ok(extra.indexOf('type=subtitleProfile') >= 0);
  assert.ok(extra.indexOf('&subtitleCodec=') >= 0);
  assert.ok(extra.indexOf('name=video.bitrate&value=') >= 0);
});

test('buildWebOsClientProfileExtra reads deviceInfo from store', function () {
  setState({ deviceInfo: { uhd: false, hdr10: false, dolbyVision: false, versionMajor: 4 } });
  var extra = buildWebOsClientProfileExtra(null, { strategy: 'direct' });
  // FHD ceilings for webOS4: h264 + hevc both 40000 kbps.
  assert.ok(extra.indexOf('name=video.bitrate&value=40000') >= 0);
});
