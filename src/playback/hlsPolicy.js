/**
 * webOS TV HLS rules (LG FAQ):
 * https://webostv.developer.lge.com/faq/2014-10-30-http-live-streaming-troubleshooting
 *
 * - Video and audio-only variants cannot coexist in a master playlist unless
 *   audio-only #EXT-X-STREAM-INF entries include a single CODECS value (e.g. mp4a.40.2).
 * - Multiple audio codecs in CODECS on an audio-only variant breaks playback.
 * - webOS 4 (2018 B8): native HLS often rejects MPEG-TS remux master playlists;
 *   prefer fMP4 (container=mp4) and skip remux → use full HLS transcode earlier.
 */

import { getPlexClientIdentity, PMS_PRODUCT } from '../plex/clientIdentity.js';
import { isTvRuntime } from '../platform/versionGate.js';

/** Legacy remux/transcode profile for webOS 5+ LG native HLS (MPEG-TS segments). */
var WEBOS_HLS_MPEGTS_PROFILE_EXTRA =
  'append-transcode-target-codec(type=videoProfile&context=streaming&protocol=hls&container=mpegts&videoCodec=h264&audioCodec=aac)';

/** webOS 4 B8/C8/E8: fMP4 HLS avoids bad CODECS lines in MPEG-TS master playlists. */
var WEBOS_HLS_FMP4_PROFILE_EXTRA =
  'append-transcode-target-codec(type=videoProfile&context=streaming&protocol=hls&container=mp4&videoCodec=h264&audioCodec=aac)';

/** Full HLS transcode on webOS 4 — muxed fMP4, not stream-copy remux. */
var WEBOS_HLS_TRANSCODE_FMP4_PROFILE_EXTRA =
  'append-transcode-target-codec(type=videoProfile&context=streaming&protocol=hls&container=mp4&videoCodec=h264&audioCodec=aac)';

/** @deprecated alias — tests and docs reference this name; prefer resolveWebOsHlsProfileExtra(). */
var WEBOS_HLS_PROFILE_EXTRA = WEBOS_HLS_MPEGTS_PROFILE_EXTRA;

function usesWebOsTvPmsProfile() {
  return getPlexClientIdentity().product === PMS_PRODUCT;
}

function shouldUseWebOsHlsProfileExtra() {
  return isTvRuntime();
}

function getWebOsPlatformMajor() {
  var identity = getPlexClientIdentity();
  if (!identity || !identity.platformVersion) return 0;
  var major = parseInt(String(identity.platformVersion).split('.')[0], 10);
  return isNaN(major) ? 0 : major;
}

function isWebOs4Model(model) {
  return /OLED\d{2}[BCEW]8/i.test(String(model || ''));
}

/** True on real LG TVs running webOS 4.x (e.g. 2018 B8). */
function isWebOs4Tv() {
  if (!shouldUseWebOsHlsProfileExtra()) return false;
  if (getWebOsPlatformMajor() === 4) return true;
  var identity = getPlexClientIdentity();
  return isWebOs4Model(identity && identity.model);
}

function isFullTranscodeStrategy(strategy) {
  return strategy === 'transcode' || strategy === 'http-transcode';
}

function resolveWebOsHlsProfileExtra(options) {
  options = options || {};
  var strategy = options.strategy || options.playbackStrategy || 'direct-stream';
  if (!shouldUseWebOsHlsProfileExtra()) return null;
  if (isWebOs4Tv()) {
    return isFullTranscodeStrategy(strategy)
      ? WEBOS_HLS_TRANSCODE_FMP4_PROFILE_EXTRA
      : WEBOS_HLS_FMP4_PROFILE_EXTRA;
  }
  return WEBOS_HLS_MPEGTS_PROFILE_EXTRA;
}

/** Params for universal start.m3u8 / start (playback). */
function applyWebOsHlsTranscodeParams(params, options) {
  params = params || {};
  options = options || {};
  params.protocol = 'hls';
  params.fastSeek = '1';
  params['X-Plex-Incomplete-Segments'] = '1';
  if (isWebOs4Tv()) {
    // webOS 4 (Chromium 53) over WAN: PMS 400s start.m3u8 when it carries the
    // decision-only params. Mirror plex-for-kodi's minimal buildTranscodeHls set:
    // keep only path, mediaIndex/partIndex, session, directPlay, directStream,
    // videoResolution, maxVideoBitrate, offset, location, audioStreamID (if any),
    // skipSubtitles/subtitleSize/burn-related, protocol, X-Plex-Client-Profile-Name.
    params['X-Plex-Client-Profile-Name'] = 'Generic';
    // PMS needs add-transcode-target directives to produce a valid HLS
    // profile for the Generic client. Without them /decision returns size=0
    // with "No conversion profile found for protocol http" and start.m3u8
    // 400s. The variant playlist also needs CODECS for webOS 4 native HLS
    // — supplying these targets makes PMS emit it. Mirrors the decision URL.
    params['X-Plex-Client-Profile-Extra'] = [
      'add-transcode-target(type=videoProfile&context=streaming&protocol=hls&container=mpegts&videoCodec=h264&audioCodec=aac,ac3,mp3)',
      'add-transcode-target-audio-codec(type=videoProfile&context=streaming&protocol=hls&audioCodec=aac)',
      'add-direct-play-profile(type=videoProfile&container=mp4,m4v,mov&videoCodec=h264&audioCodec=aac,ac3,mp3)'
    ].join('+');
    delete params['X-Plex-Incomplete-Segments'];
    delete params.hasMDE;
    delete params.mediaBufferSize;
    delete params.autoAdjustQuality;
    delete params.directStreamAudio;
    delete params.fastSeek;
    delete params.transcodeSessionId;
    delete params['X-Plex-Direct-Play'];
    delete params['X-Plex-Direct-Stream'];
    // plex-for-kodi sends directStream=1 on every transcode URL — PMS decides
    // remux vs full-transcode from /decision metadata, not this flag. Sending
    // directStream=0 over WAN to this PMS build triggers HTTP 400.
    params.directStream = '1';
    // plex-for-kodi does not include audioStreamID on the transcode URL; PMS
    // reads the selected audio stream from /decision. Passing it here over WAN
    // to this build triggers HTTP 400.
    delete params.audioStreamID;
    if (params.skipSubtitles === '1') {
      delete params.subtitleSize;
      delete params.audioBoost;
    }
    if (params.offset == null) params.offset = '0';
    // plex-for-kodi only adds `location=lan` for local connections — never
    // `location=wan`. Sending the explicit wan tag over WAN to this PMS build
    // triggers HTTP 400.
    if (params.location !== 'lan') delete params.location;
    // plex-for-kodi puts X-Plex-Session-Id and X-Plex-Session-Identifier on
    // every transcode URL so PMS can correlate start.m3u8 with the /decision
    // call. Without these, this PMS build over WAN returns HTTP 400.
    if (params.session) {
      params['X-Plex-Session-Id'] = params.session;
      params['X-Plex-Session-Identifier'] = params.session;
    }
    // plex-for-kodi only includes X-Plex-Token, X-Plex-Client-Identifier,
    // X-Plex-Session-Id/Identifier, and X-Plex-Client-Profile-Name as query
    // params on the transcode URL — Product/Version/Platform/Device go in HTTP
    // headers. Our <video> element can't set headers, so they leak into the URL
    // via plexClientQuery(). Stripping them mirrors plex-for-kodi's shape on
    // start.m3u8 (the direct-play endpoint is more permissive and accepts them).
    // Set to null (not delete) — serverUrl() merges plexClientQuery() with
    // params, so delete would let the identity fields reappear from there.
    // buildQuery() skips null-valued keys.
    params['X-Plex-Product'] = null;
    params['X-Plex-Version'] = null;
    params['X-Plex-Platform'] = null;
    params['X-Plex-Platform-Version'] = null;
    params['X-Plex-Device'] = null;
    params['X-Plex-Model'] = null;
    params['X-Plex-Device-Name'] = null;
    params['X-Plex-Device-Vendor'] = null;
    return params;
  }
  var profileExtra = resolveWebOsHlsProfileExtra(options);
  if (profileExtra) {
    params['X-Plex-Client-Profile-Extra'] = profileExtra;
  } else {
    delete params['X-Plex-Client-Profile-Extra'];
  }
  return params;
}

/** True when PMS chose HLS/DASH-style segmented delivery (not progressive HTTP). */
function isSegmentedDeliveryProtocol(protocol) {
  var p = String(protocol || '').toLowerCase();
  return p === 'hls' || p === 'dash';
}

function buildHttpTranscodeFallbackParams(params) {
  var p = Object.assign({}, params);
  p.protocol = 'http';
  delete p['X-Plex-Client-Profile-Extra'];
  delete p['X-Plex-Incomplete-Segments'];
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

/** Native HLS / play() rejection when the TV cannot load the m3u8 or segments. */
function isHlsSourceRejectedError(info) {
  if (!info) return false;
  if (isSrcNotSupportedError(info.mediaError)) return true;
  var msg = String(info.message || (info.mediaError && info.mediaError.message) || '')
    .toLowerCase();
  if (!msg) return false;
  return /no supported source|not supported|failed to load|src_not_supported|media_err_src/.test(msg);
}

/**
 * Pull EXT-X-STREAM-INF / CODECS lines from an m3u8 body for TV diagnostics.
 * @returns {{ isM3u8: boolean, streamInfs: string[], mediaTags: string[], snippet: string }}
 */
function extractHlsManifestDiagnostics(text) {
  var body = String(text || '');
  var lines = body.split(/\r?\n/);
  var streamInfs = [];
  var mediaTags = [];
  var snippetLines = [];
  var i;
  for (i = 0; i < lines.length; i++) {
    var line = (lines[i] || '').trim();
    if (!line) continue;
    if (line.indexOf('#EXTM3U') === 0 && snippetLines.indexOf(line) < 0) {
      snippetLines.push(line);
    }
    if (line.indexOf('#EXT-X-STREAM-INF') === 0) {
      streamInfs.push(line.length > 280 ? line.slice(0, 277) + '...' : line);
      snippetLines.push(line);
      var codecsMatch = line.match(/CODECS="([^"]+)"/i);
      if (codecsMatch && codecsMatch[1]) {
        snippetLines.push('CODECS=' + codecsMatch[1]);
      }
    }
    if (
      line.indexOf('#EXT-X-MEDIA:') === 0 &&
      /TYPE=(AUDIO|SUBTITLES|VIDEO)/i.test(line)
    ) {
      var tag = line.length > 280 ? line.slice(0, 277) + '...' : line;
      mediaTags.push(tag);
      snippetLines.push(tag);
    }
    if (snippetLines.length >= 14) break;
  }
  return {
    isM3u8: body.indexOf('#EXTM3U') >= 0,
    streamInfs: streamInfs,
    mediaTags: mediaTags,
    snippet: snippetLines.slice(0, 14).join('\n')
  };
}

/**
 * GET start.m3u8 (or variant) and return HTTP status + manifest snippet.
 * Fire-and-forget from playerAdapter on native HLS rejection.
 */
function fetchHlsManifestProbe(url, headers) {
  return new Promise(function (resolve) {
    if (!url) {
      resolve({ error: 'no-url' });
      return;
    }
    if (typeof XMLHttpRequest === 'undefined') {
      resolve({ error: 'xhr-unavailable' });
      return;
    }
    var xhr = new XMLHttpRequest();
    var settled = false;
    function finish(payload) {
      if (settled) return;
      settled = true;
      resolve(payload);
    }
    xhr.open('GET', url, true);
    xhr.timeout = 8000;
    Object.keys(headers || {}).forEach(function (key) {
      try { xhr.setRequestHeader(key, headers[key]); } catch (e) { /* forbidden header */ }
    });
    xhr.onload = function () {
      var body = xhr.responseText || '';
      var diag = extractHlsManifestDiagnostics(body);
      var payload = {
        status: xhr.status,
        isM3u8: diag.isM3u8,
        streamInfs: diag.streamInfs,
        mediaTags: diag.mediaTags,
        snippet: diag.snippet
      };
      if (!diag.isM3u8 && body) {
        payload.bodyPreview = body.replace(/\s+/g, ' ').slice(0, 160);
      }
      finish(payload);
    };
    xhr.onerror = function () {
      finish({ status: xhr.status || 0, error: 'network' });
    };
    xhr.ontimeout = function () {
      finish({ error: 'timeout' });
    };
    try {
      xhr.send();
    } catch (e) {
      finish({ error: String(e && e.message ? e.message : e) });
    }
  });
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
  WEBOS_HLS_MPEGTS_PROFILE_EXTRA,
  WEBOS_HLS_FMP4_PROFILE_EXTRA,
  WEBOS_HLS_TRANSCODE_FMP4_PROFILE_EXTRA,
  usesWebOsTvPmsProfile,
  shouldUseWebOsHlsProfileExtra,
  getWebOsPlatformMajor,
  isWebOs4Tv,
  resolveWebOsHlsProfileExtra,
  applyWebOsHlsTranscodeParams,
  isSegmentedDeliveryProtocol,
  buildHttpTranscodeFallbackParams,
  isHlsUrl,
  extractHlsManifestDiagnostics,
  fetchHlsManifestProbe,
  describeHlsError,
  isSrcNotSupportedError,
  isHlsSourceRejectedError,
  formatFinalPlaybackError,
  formatDirectPlayOnlyError
};
