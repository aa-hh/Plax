/**
 * webOS native <video> mediaOption builder (LG media pipeline).
 * Encoded into <source type="mime;mediaOption=..."> for 4K/HDR/DV playback.
 */

var MIME_HLS = 'application/vnd.apple.mpegurl';
var MIME_MP4 = 'video/mp4';
var MIME_MKV = 'video/x-matroska';
var MIME_TS = 'video/mp2t';

/** Default HLS start bitrate when remuxing at original quality (20 Mbps, bps). */
var DEFAULT_HLS_START_BPS = 20000000;

function isHlsPlaybackMode(mode) {
  return mode === 'direct-stream' || mode === 'transcode-hls';
}

function resolveHlsStartBps(maxVideoBitrateKbps) {
  if (maxVideoBitrateKbps && maxVideoBitrateKbps > 0) {
    return maxVideoBitrateKbps * 1000;
  }
  return DEFAULT_HLS_START_BPS;
}

function isHlsPlaybackUrl(url) {
  return /\.m3u8(\?|$)/i.test(url || '');
}

function guessMimeFromUrl(url) {
  var path = String(url || '').split('?')[0].toLowerCase();
  if (/\.mkv$/i.test(path)) return MIME_MKV;
  if (/\.ts$/i.test(path)) return MIME_TS;
  if (/\.m3u8$/i.test(path)) return MIME_HLS;
  return MIME_MP4;
}

function adaptiveStreamingCaps(deviceInfo) {
  var uhd = deviceInfo && deviceInfo.uhd;
  return {
    maxWidth: uhd ? 3840 : 1920,
    maxHeight: uhd ? 2160 : 1080
  };
}

/**
 * @param {string} url
 * @param {string} mode playback mode (direct, direct-stream, transcode-hls, ...)
 * @param {object} deviceInfo webOS.deviceInfo snapshot (uhd, hdr10, dolbyVision)
 * @param {number} offsetMs resume position in milliseconds
 * @param {{ maxVideoBitrate?: number }} [hints] optional profile bitrate (kbps)
 * @returns {{ mimeType: string, mediaOption: object, sourceType: string }}
 */
function buildMediaSource(url, mode, deviceInfo, offsetMs, hints) {
  deviceInfo = deviceInfo || {};
  hints = hints || {};
  var hls = isHlsPlaybackUrl(url);
  // For progressive/direct (URI) sources always label the <source> video/mp4.
  // webOS-4 Chromium returns "" from canPlayType for video/x-matroska (and
  // video/mp2t), so a truthful MKV/TS MIME makes the browser SKIP the <source>
  // (networkState 3, no error) before LG's pipeline — which fully supports MKV/
  // HEVC — ever sees it. video/mp4 passes canPlayType ("maybe"); webOS then
  // sniffs the real container from the stream. The mediaOption drives playback.
  var mimeType = hls ? MIME_HLS : MIME_MP4;
  var adaptiveStreaming = adaptiveStreamingCaps(deviceInfo);
  if (hls && isHlsPlaybackMode(mode)) {
    adaptiveStreaming.seamlessPlay = true;
    adaptiveStreaming.bps = {
      start: resolveHlsStartBps(hints.maxVideoBitrate)
    };
  }
  var mediaOption = {
    mediaTransportType: hls ? 'HLS' : 'URI',
    option: {
      adaptiveStreaming: adaptiveStreaming
    }
  };
  if (offsetMs > 0) {
    mediaOption.option.transmission = {
      playTime: { start: offsetMs }
    };
  }
  var sourceType = mimeType + ';mediaOption=' + encodeURIComponent(JSON.stringify(mediaOption));
  return {
    mimeType: mimeType,
    mediaOption: mediaOption,
    sourceType: sourceType,
    mode: mode || 'unknown'
  };
}

export {
  buildMediaSource,
  isHlsPlaybackUrl,
  isHlsPlaybackMode,
  guessMimeFromUrl,
  adaptiveStreamingCaps,
  resolveHlsStartBps,
  DEFAULT_HLS_START_BPS,
  MIME_HLS,
  MIME_MP4
};
