import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webos4DeviceProfile, buildJellyfinDeviceProfile } from '../src/backends/jellyfin/deviceProfile.js';

function videoTranscode(profile) {
  return profile.TranscodingProfiles.filter(function (p) {
    return p.Type === 'Video' && String(p.Protocol).toLowerCase() === 'hls';
  })[0];
}
function videoDirectPlay(profile) {
  return profile.DirectPlayProfiles.filter(function (p) { return p.Type === 'Video'; });
}

test('webOS 4 profile is byte-identical to the frozen baseline (no B8 regression)', function () {
  var built = buildJellyfinDeviceProfile({ versionMajor: 4 });
  assert.deepEqual(built, webos4DeviceProfile);
  // mpegts transcode is the guaranteed B8 path.
  assert.equal(videoTranscode(built).Container, 'ts');
  assert.equal(videoTranscode(built).VideoCodec, 'h264');
});

test('B8 by model regex also resolves to the mpegts baseline', function () {
  var built = buildJellyfinDeviceProfile({ model: 'OLED55B8LLA' });
  assert.equal(videoTranscode(built).Container, 'ts');
});

[5, 6, 22, 24, 26].forEach(function (major) {
  test('webOS ' + major + ' uses fMP4 HLS + HEVC remux + VP9/AV1 direct play', function () {
    var built = buildJellyfinDeviceProfile({ versionMajor: major });
    var tx = videoTranscode(built);
    // fMP4 (container=mp4) so the server can REMUX HEVC/AV1 into HLS, not re-encode.
    assert.equal(tx.Container, 'mp4');
    assert.ok(tx.VideoCodec.split(',').indexOf('hevc') >= 0, 'HEVC allowed in HLS transcode');
    assert.ok(tx.VideoCodec.split(',').indexOf('h264') >= 0, 'H.264 kept as transcode fallback');
    // VP9/AV1 advertised for direct play on every video direct-play profile.
    videoDirectPlay(built).forEach(function (p) {
      assert.ok(p.VideoCodec.split(',').indexOf('vp9') >= 0, 'VP9 direct play');
      assert.ok(p.VideoCodec.split(',').indexOf('av1') >= 0, 'AV1 direct play');
      // existing codecs preserved
      assert.ok(p.VideoCodec.split(',').indexOf('hevc') >= 0, 'HEVC preserved');
    });
  });
});

test('does not mutate the frozen baseline', function () {
  buildJellyfinDeviceProfile({ versionMajor: 26 });
  assert.equal(videoTranscode(webos4DeviceProfile).Container, 'ts');
  assert.equal(videoDirectPlay(webos4DeviceProfile)[0].VideoCodec.indexOf('av1'), -1);
});
