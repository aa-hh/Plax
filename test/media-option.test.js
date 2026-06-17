import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMediaSource,
  adaptiveStreamingCaps,
  guessMimeFromUrl,
  MIME_HLS
} from '../src/playback/mediaOption.js';

test('buildMediaSource uses HLS transport for m3u8 URLs', function () {
  var built = buildMediaSource('http://plex.local/start.m3u8?token=1', 'direct-stream', {}, 0);
  assert.equal(built.mimeType, MIME_HLS);
  assert.equal(built.mediaOption.mediaTransportType, 'HLS');
});

test('buildMediaSource uses URI transport for progressive files', function () {
  var built = buildMediaSource('http://plex.local/library/parts/1/file.mkv', 'direct', {}, 0);
  assert.equal(built.mediaOption.mediaTransportType, 'URI');
  assert.equal(guessMimeFromUrl('http://plex.local/library/parts/1/file.mkv'), 'video/x-matroska');
});

test('adaptiveStreamingCaps lifts to 4K on UHD TVs', function () {
  var fhd = adaptiveStreamingCaps({ uhd: false });
  var uhd = adaptiveStreamingCaps({ uhd: true });
  assert.deepEqual(fhd, { maxWidth: 1920, maxHeight: 1080 });
  assert.deepEqual(uhd, { maxWidth: 3840, maxHeight: 2160 });
  var built = buildMediaSource('http://plex.local/file.mkv', 'direct', { uhd: true }, 0);
  assert.equal(built.mediaOption.option.adaptiveStreaming.maxWidth, 3840);
  assert.equal(built.mediaOption.option.adaptiveStreaming.maxHeight, 2160);
});

test('buildMediaSource adds seamlessPlay and bps.start for HLS remux', function () {
  var built = buildMediaSource('http://plex.local/start.m3u8?token=1', 'direct-stream', {}, 0);
  assert.equal(built.mediaOption.option.adaptiveStreaming.seamlessPlay, true);
  assert.equal(built.mediaOption.option.adaptiveStreaming.bps.start, 20000000);
});

test('buildMediaSource uses profile maxVideoBitrate for HLS bps.start', function () {
  var built = buildMediaSource(
    'http://plex.local/start.m3u8?token=1',
    'transcode-hls',
    {},
    0,
    { maxVideoBitrate: 12000 }
  );
  assert.equal(built.mediaOption.option.adaptiveStreaming.bps.start, 12000000);
});

test('buildMediaSource encodes resume offset in mediaOption', function () {
  var built = buildMediaSource('http://plex.local/file.mkv', 'direct', {}, 125000);
  assert.equal(built.mediaOption.option.transmission.playTime.start, 125000);
  assert.ok(built.sourceType.indexOf('mediaOption=') > 0);
  var jsonStart = built.sourceType.indexOf('mediaOption=') + 'mediaOption='.length;
  var parsed = JSON.parse(decodeURIComponent(built.sourceType.slice(jsonStart)));
  assert.equal(parsed.option.transmission.playTime.start, 125000);
});
