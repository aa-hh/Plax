import test from 'node:test';
import assert from 'node:assert/strict';

import { probePlayback } from '../src/playback/capabilityProbe.js';
import {
  resolveEffectivePlaybackQuality,
  resolveInitialPlaybackStrategy,
  recommendPlaybackQuality,
  requiredMbpsForVersion
} from '../src/playback/networkProbe.js';

var h264Ok = { h264: 'probably', hevc: 'probably', ac3: 'probably', eac3: '', dts: '' };

test('resolveEffectivePlaybackQuality keeps manual profile', function () {
  assert.equal(resolveEffectivePlaybackQuality('1080', {
    status: 'done',
    recommendedQualityId: '720'
  }), '1080');
});

test('resolveEffectivePlaybackQuality applies probe when prefs are auto', function () {
  assert.equal(resolveEffectivePlaybackQuality('auto', {
    status: 'done',
    recommendedQualityId: '720'
  }), '720');
  assert.equal(resolveEffectivePlaybackQuality('auto', { status: 'testing' }), 'auto');
});

test('resolveInitialPlaybackStrategy transcodes when auto picks transcode profile', function () {
  assert.equal(resolveInitialPlaybackStrategy({
    prefsQuality: 'auto',
    effectiveQuality: '720',
    playbackProbe: { canDirectPlay: true, canDirectStream: true },
    refinedProbe: { mbps: 12 },
    version: { bitrate: 8000 }
  }), 'transcode');
});

test('resolveInitialPlaybackStrategy uses measured Mbps for auto direct eligibility', function () {
  var version = { bitrate: 8000, videoCodec: 'h264', audioCodec: 'aac', container: 'mp4' };
  var probe = probePlayback({}, version, h264Ok, { uhd: false });
  assert.equal(resolveInitialPlaybackStrategy({
    prefsQuality: 'auto',
    effectiveQuality: 'auto',
    playbackProbe: probe,
    refinedProbe: { mbps: 20, measuredMbps: 20 },
    version: version
  }), 'direct');
  assert.equal(resolveInitialPlaybackStrategy({
    prefsQuality: 'auto',
    effectiveQuality: 'auto',
    playbackProbe: probe,
    refinedProbe: { mbps: 4, measuredMbps: 4 },
    version: version
  }), 'transcode');
});

test('resolveInitialPlaybackStrategy avoids direct when link is below file need', function () {
  var version = { bitrate: 40000, videoCodec: 'hevc', audioCodec: 'aac', container: 'mp4' };
  var probe = probePlayback({}, version, h264Ok, { uhd: true });
  var rec = recommendPlaybackQuality({
    version: version,
    playbackProbe: probe,
    measuredMbps: 10,
    deviceInfo: { uhd: true }
  });
  assert.notEqual(rec.qualityKey, 'auto');
  assert.equal(resolveInitialPlaybackStrategy({
    prefsQuality: 'auto',
    effectiveQuality: rec.qualityKey,
    playbackProbe: probe,
    refinedProbe: { mbps: 10, measuredMbps: 10 },
    version: version
  }), 'transcode');
  assert.equal(resolveInitialPlaybackStrategy({
    prefsQuality: 'auto',
    effectiveQuality: 'auto',
    playbackProbe: probe,
    refinedProbe: { mbps: 10, measuredMbps: 10 },
    version: version
  }), 'transcode');
});

test('requiredMbpsForVersion applies headroom', function () {
  assert.equal(requiredMbpsForVersion({ bitrate: 10000 }), 11.5);
});
