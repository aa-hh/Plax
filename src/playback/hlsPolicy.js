/**
 * webOS TV HLS rules (LG FAQ):
 * https://webostv.developer.lge.com/faq/2014-10-30-http-live-streaming-troubleshooting
 *
 * - Video and audio-only variants cannot coexist in a master playlist unless
 *   audio-only #EXT-X-STREAM-INF entries include a single CODECS value (e.g. mp4a.40.2).
 * - Multiple audio codecs in CODECS on an audio-only variant breaks playback.
 * - 502 during HLS → server/network issue.
 * - Buffering → inspect the variant bitrate that stalls.
 */

import { getPlexClientIdentity, PMS_PRODUCT } from '../plex/clientIdentity.js';
import { isTvRuntime } from '../platform/versionGate.js';

/**
 * Plex ClientProfileExtra: append-transcode-target-codec requires videoCodec and/or
 * audioCodec (not `codec=`). type=audioProfile is invalid for this directive.
 * Apply this on real TVs and the webOS simulator; both use LG's native HLS
 * path and need Plex to emit webOS-compatible master playlists with CODECS.
 */
var WEBOS_HLS_PROFILE_EXTRA =
  'append-transcode-target-codec(type=videoProfile&context=streaming&protocol=hls&container=mpegts&videoCodec=h264&audioCodec=aac)';

function usesWebOsTvPmsProfile() {
  return getPlexClientIdentity().product === PMS_PRODUCT;
}

function shouldUseWebOsHlsProfileExtra() {
  return isTvRuntime();
}

function applyWebOsHlsTranscodeParams(params) {
  params = params || {};
  /* Plex universal transcode: HLS with contained A/V where possible */
  params.protocol = 'hls';
  params.fastSeek = '1';
  /* Encourage muxed output; reduces audio-only EXT-X-STREAM-INF entries on LG TVs */
  if (shouldUseWebOsHlsProfileExtra()) {
    params['X-Plex-Client-Profile-Extra'] = WEBOS_HLS_PROFILE_EXTRA;
  }
  return params;
}

function buildHttpTranscodeFallbackParams(params) {
  var p = Object.assign({}, params);
  p.protocol = 'http';
  delete p['X-Plex-Client-Profile-Extra'];
  return p;
}

function isHlsUrl(url) {
  return /\.m3u8(\?|$)/i.test(url || '');
}

function describeHlsError(mediaError) {
  if (!mediaError) return 'Playback error';
  switch (mediaError.code) {
    case mediaError.MEDIA_ERR_NETWORK: return 'Network error (check server; HLS 502 is server-side)';
    case mediaError.MEDIA_ERR_DECODE: return 'Decode error (codec may exceed TV limits)';
    case mediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: return 'Stream not supported (check HLS playlist CODECS)';
    default: return 'Playback error (code ' + mediaError.code + ')';
  }
}

function isSrcNotSupportedError(mediaError) {
  if (!mediaError) return false;
  return mediaError.code === mediaError.MEDIA_ERR_SRC_NOT_SUPPORTED;
}

function formatFinalPlaybackError(info, httpFallbackTried, options) {
  options = options || {};
  if (options.directPlayOnly) {
    var hint = options.directPlayHint ||
      'Direct play only — no server transcode was used. Try Auto quality, another file version, or turn off image subtitles.';
    if (info && info.message && info.message.indexOf('Direct play') < 0) {
      return info.message + ' ' + hint;
    }
    return hint;
  }
  if (httpFallbackTried) {
    return 'Playback failed — try a lower quality in Settings or check your Plex server.';
  }
  return (info && info.message) ? info.message : 'Playback error';
}

function formatDirectPlayOnlyError(probe) {
  if (!probe) {
    return 'Direct play failed. Choose Auto or a transcode quality (720p, 1080p) in Settings.';
  }
  if (probe.bitrateCheck && probe.bitrateCheck.unknown) {
    return 'Direct play only: source bitrate unknown — use Auto or a transcode quality.';
  }
  if (probe.bitrateCheck && probe.bitrateCheck.exceeds) {
    return 'Direct play only: bitrate exceeds this TV\'s limit (' +
      probe.bitrateCheck.actualMbps + ' Mbps > ' + probe.bitrateCheck.limitMbps + ' Mbps).';
  }
  if (!probe.canDirectPlay && probe.warnings.length) {
    return 'Direct play only: ' + probe.warnings.join(' ');
  }
  return 'Direct play only: TV or network could not play the original file (codec, container, or HTTPS).';
}

export {
  WEBOS_HLS_PROFILE_EXTRA,
  usesWebOsTvPmsProfile,
  shouldUseWebOsHlsProfileExtra,
  applyWebOsHlsTranscodeParams,
  buildHttpTranscodeFallbackParams,
  isHlsUrl,
  describeHlsError,
  isSrcNotSupportedError,
  formatFinalPlaybackError,
  formatDirectPlayOnlyError
};
