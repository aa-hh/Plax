import Hls from 'hls.js';
import { keepScreenOn } from '../platform/webos.js';
import { updateProgress as libraryUpdateProgress, markWatched as libraryMarkWatched } from '../plex/library.js';
import { redactPlexUrl } from '../plex/client.js';
import { getPlexClientIdentity, PMS_PRODUCT } from '../plex/clientIdentity.js';
import { connectionSchemeLabel } from '../plex/servers/connectionPolicy.js';
import { fetchText } from '../utils/fetch.js';
import { isSimulatorRuntime } from '../platform/webosRuntime.js';
import {
  describeHlsError,
  fetchHlsManifestProbe,
  isHlsUrl
} from './hlsPolicy.js';
import { shouldSkipClientPlaybackOffset } from './playbackOffset.js';
import { shouldScrobble, shouldResetScrobble } from './scrobblePolicy.js';
import { timelineStateForPlayback } from './timelineSyncState.js';
import { flushTimelineProgress } from './timelineFlush.js';
import { parseSubtitleTextToCues } from './tracks/srtParser.js';
import { shouldRetrySubtitleFetch } from './tracks/subtitleTracks.js';
import { createRebufferWatchdog } from './rebufferWatchdog.js';
import { summarizeTranscodeUrl } from './plexPaths.js';
import { addOnceEventListener } from '../utils/domUtils.js';
import { getState } from '../core/store.js';
import { tvLog, tvError } from '../utils/tvDebug.js';

var videoEl = null;
var progressTimer = null;
var sessionRef = null;
var onEndedCb = null;
var onErrorCb = null;
var onBufferingCb = null;
var onRebufferTimeoutCb = null;
var onFirstFrameCb = null;
var onTimelineSyncFailureCb = null;
var firstFrameFired = false;
var pendingSeekListener = null;
var pendingSeekWrapper = null;
var bufferingShown = false;
var scrobbled = false;
var lastTimelineMs = -1;
var lastKnownPositionMs = 0;
/** Plex offset baked into transcode URL; element currentTime is relative to that point. */
var streamBaseOffsetMs = 0;
/** @see docs/caching-and-buffering.md */
var REBUFFER_TIMEOUT_MS = 12000;
var REBUFFER_TIMEOUT_MS_WEBOS4 = 20000;

function getRebufferTimeoutMs() {
  var state = typeof getState === 'function' ? getState() : null;
  var major = state && state.platformMajor != null ? state.platformMajor : 0;
  return (major > 0 && major <= 4) ? REBUFFER_TIMEOUT_MS_WEBOS4 : REBUFFER_TIMEOUT_MS;
}

var HlsPlayer = Hls;
var activeHls = null;

function fireRebufferTimeout() {
  if (onRebufferTimeoutCb) {
    try { onRebufferTimeoutCb(); } catch (e) { console.error(e); }
  }
}

function createAdapterRebufferWatchdog(timerFns) {
  var opts = {
    timeoutMs: getRebufferTimeoutMs(),
    onTimeout: fireRebufferTimeout
  };
  if (timerFns) {
    if (timerFns.setTimeout) opts.setTimeout = timerFns.setTimeout;
    if (timerFns.clearTimeout) opts.clearTimeout = timerFns.clearTimeout;
  }
  return createRebufferWatchdog(opts);
}

var rebufferWatchdog = createAdapterRebufferWatchdog();

/** Inject fake setTimeout/clearTimeout in unit tests. Pass null to restore defaults. */
function setRebufferTimersForTest(timerFns) {
  if (rebufferWatchdog && rebufferWatchdog.destroy) rebufferWatchdog.destroy();
  rebufferWatchdog = createAdapterRebufferWatchdog(timerFns || null);
}

function setHlsPlayerForTest(HlsCtor) {
  destroyActiveHls();
  HlsPlayer = HlsCtor || Hls;
}
var initialPlayingTimelineSynced = false;
var initialTimelineTimeupdateListener = null;
var activeTextTrack = null;
var lastPlaybackUrl = null;
var playbackModeRef = 'unknown';
var runtimeBuildLogged = false;

var TIMELINE_INTERVAL_MS = 10000;

var defaultProgressApi = {
  updateProgress: libraryUpdateProgress,
  markWatched: libraryMarkWatched
};
var progressApi = defaultProgressApi;

/** Override Plex timeline/scrobble calls in unit tests. Pass null to restore defaults. */
function setProgressApiForTest(overrides) {
  if (!overrides) {
    progressApi = defaultProgressApi;
    return;
  }
  progressApi = {
    updateProgress: overrides.updateProgress || defaultProgressApi.updateProgress,
    markWatched: overrides.markWatched || defaultProgressApi.markWatched
  };
}

/**
 * webOS TV 5+ buffering policy (see docs/caching-and-buffering.md):
 *   - Single native <video> element (one decoder, hard LG rule).
 *   - preload="metadata" — fetch manifest + first segment; never "auto" on TV
 *     (memory pressure on 1-2 GB devices, especially webOS 5).
 *   - Re-buffer watchdog: if the player stays in waiting/stalled for
 *     REBUFFER_TIMEOUT_MS without progressing, fire onRebufferTimeout so the
 *     screen can downshift quality / fall back to HTTP transcode.
 */

function streamTypeLabel(mode) {
  if (mode === 'direct') return 'direct-play';
  if (mode === 'direct-stream') return 'direct-stream (HLS)';
  if (mode === 'transcode-hls' || mode === 'transcode-http') return 'pure-transcode';
  return 'unknown';
}

function compactPlaybackUrl(url) {
  var redacted = redactPlexUrl(url);
  if (!redacted || redacted.length <= 180) return redacted || '';
  return redacted.slice(0, 177) + '...';
}

function logPlaybackStreamType(mode, url) {
  var label = streamTypeLabel(mode);
  var compact = compactPlaybackUrl(url);
  console.info(
    '[playback] stream type: ' +
      label +
      ' (mode=' + (mode || 'unknown') +
      ', url=' + compact + ')'
  );
  tvLog('playback', 'stream ' + label, { mode: mode || 'unknown', url: compact });
}

/* Decoded `path=` + transcode decision params, on their own line, so the
 * value PMS actually receives is unambiguously visible in the console. */
function logPlaybackTranscodeParams(url) {
  var params = summarizeTranscodeUrl(url);
  if (!params || !Object.keys(params).length) return;
  console.info('[playback] params:', params);
  tvLog('playback', 'transcode params', params);
}

function resolvePlaybackConnectionScheme(url, session) {
  var fromUrl = connectionSchemeLabel(url || '');
  if (fromUrl !== 'unknown') return fromUrl;
  var server = session && session.server;
  if (!server) return 'unknown';
  if (server.activeConnection && server.activeConnection.uri) {
    var fromActive = connectionSchemeLabel(server.activeConnection.uri);
    if (fromActive !== 'unknown') return fromActive;
  }
  return connectionSchemeLabel(server.connectionUri || '');
}

function logPlaybackConnection(url, session) {
  var scheme = resolvePlaybackConnectionScheme(url, session);
  console.info('[playback] connection: ' + scheme);
  tvLog('playback', 'connection ' + scheme);
}

function logRuntimeBuildStampOnce() {
  if (runtimeBuildLogged) return;
  runtimeBuildLogged = true;
  if (typeof window !== 'undefined' && window.__XPLAY_BUILD__) {
    var b = window.__XPLAY_BUILD__;
    console.info('[XPlay Lite] runtime-build', b.builtAt, b.gitCommit || 'no-git', b.summary || '');
    return;
  }
  console.warn('[XPlay Lite] runtime-build missing');
}

function shouldUseMseHls(url) {
  if (!isHlsUrl(url) || !HlsPlayer || !HlsPlayer.isSupported || !HlsPlayer.isSupported()) {
    return false;
  }
  var identity = getPlexClientIdentity();
  /* Real webOS TVs have native HLS support and stricter decoder ownership.
   * Simulator and desktop-browser runs use Chromium's MSE path instead, which
   * avoids FFmpegDemuxer rejecting Plex MPEG-TS HLS directly. */
  return isSimulatorRuntime() || !identity || identity.product !== PMS_PRODUCT;
}

function destroyActiveHls() {
  if (!activeHls) return;
  try { activeHls.destroy(); } catch (e) { /* ignore teardown errors */ }
  activeHls = null;
}

function hlsAuthHeaders(url, session) {
  var headers = {};
  var token = null;
  var sessionId = null;
  try {
    var parsed = new URL(url);
    token = parsed.searchParams.get('X-Plex-Token') || null;
    sessionId = parsed.searchParams.get('X-Plex-Session-Identifier') ||
      parsed.searchParams.get('session') || null;
  } catch (e) {
    token = null;
    sessionId = null;
  }
  if (!token && session && session.server && session.server.accessToken) {
    token = session.server.accessToken;
  }
  if (token) headers['X-Plex-Token'] = token;
  if (sessionId) headers['X-Plex-Session-Identifier'] = sessionId;
  return headers;
}

function attachMseHls(url, requestHeaders) {
  var events = HlsPlayer.Events || {};
  var errorTypes = HlsPlayer.ErrorTypes || {};
  destroyActiveHls();
  activeHls = new HlsPlayer({
    lowLatencyMode: false,
    backBufferLength: 60,
    /* Plex universal HLS lists upcoming segments before they exist (404 until ready). */
    fragLoadingMaxRetry: 12,
    fragLoadingRetryDelay: 1000,
    fragLoadingMaxRetryTimeout: 64000,
    xhrSetup: function (xhr) {
      var headers = requestHeaders || {};
      Object.keys(headers).forEach(function (key) {
        try { xhr.setRequestHeader(key, headers[key]); } catch (e) { /* ignore forbidden headers */ }
      });
    }
  });
  activeHls.on(events.MEDIA_ATTACHED, function () {
    activeHls.loadSource(url);
  });
  activeHls.on(events.MANIFEST_PARSED, function () {
    notifyBuffering(false);
  });
  activeHls.on(events.ERROR, function (_event, data) {
    if (!data || !data.fatal) return;
    console.warn('[playback] hls.js fatal error', data.type, data.details);
    tvLog('playback', 'hls.js fatal', { type: data.type, details: data.details });
    if (data.type === errorTypes.NETWORK_ERROR && activeHls.startLoad) {
      activeHls.startLoad();
      return;
    }
    if (data.type === errorTypes.MEDIA_ERROR && activeHls.recoverMediaError) {
      activeHls.recoverMediaError();
      return;
    }
    destroyActiveHls();
    notifyBuffering(false);
    if (onErrorCb) {
      onErrorCb(normalizePlaybackError(new Error('HLS playback failed'), url));
    }
  });
  activeHls.attachMedia(videoEl);
  console.info('[playback] using hls.js for HLS compatibility');
  tvLog('playback', 'using hls.js');
}

function notifyBuffering(show) {
  if (!rebufferWatchdog.notifyBuffering(show)) return;
  bufferingShown = show;
  if (onBufferingCb) onBufferingCb(show);
}

function getItemDurationMs() {
  if (sessionRef && sessionRef.item && sessionRef.item.duration) {
    return sessionRef.item.duration;
  }
  return 0;
}

function getCanonicalDurationMs() {
  var metaMs = getItemDurationMs();
  var videoMs = getDurationMs();
  if (playbackModeRef === 'direct' && videoMs > 0) return videoMs;
  if (metaMs > 0) return metaMs;
  return videoMs > 0 ? videoMs : metaMs;
}

function normalizePlaybackError(err, url) {
  var src = url || lastPlaybackUrl || (videoEl && videoEl.src) || '';
  var mediaErr = err && err.code != null ? err : null;
  var msg = (err && err.message) ? err.message : String(err || 'Playback failed');
  if (!mediaErr && videoEl && videoEl.error) mediaErr = videoEl.error;
  return {
    message: msg,
    mediaError: mediaErr || err,
    isHls: isHlsUrl(src),
    url: redactPlexUrl(src)
  };
}

function scrobbleIfNeeded(ms, duration) {
  var server = sessionRef && sessionRef.server;
  var ratingKey = sessionRef && sessionRef.item && sessionRef.item.ratingKey;
  if (!server || !ratingKey) return Promise.resolve();
  if (scrobbled) {
    if (shouldResetScrobble(ms, duration)) scrobbled = false;
    else return Promise.resolve();
  }
  if (!shouldScrobble(ms, duration)) return Promise.resolve();
  scrobbled = true;
  return progressApi.markWatched(server, ratingKey).catch(function (err) {
    scrobbled = false;
    console.warn('Plex scrobble:', err.message);
  });
}

function cancelInitialPlayingTimelineSync() {
  if (initialTimelineTimeupdateListener && videoEl) {
    videoEl.removeEventListener('timeupdate', initialTimelineTimeupdateListener);
    initialTimelineTimeupdateListener = null;
  }
}

function syncInitialPlayingTimeline() {
  if (initialPlayingTimelineSynced || !sessionRef || !videoEl) return;
  initialPlayingTimelineSynced = true;
  cancelInitialPlayingTimelineSync();
  syncTimeline('playing', true);
}

function maybeSyncInitialPlayingTimelineFromTime() {
  if (initialPlayingTimelineSynced || !sessionRef || !videoEl) return;
  if (videoEl.currentTime > 0) syncInitialPlayingTimeline();
}

function armInitialPlayingTimelineSync() {
  initialPlayingTimelineSynced = false;
  cancelInitialPlayingTimelineSync();
  if (!videoEl) return;
  initialTimelineTimeupdateListener = function () {
    maybeSyncInitialPlayingTimelineFromTime();
  };
  videoEl.addEventListener('timeupdate', initialTimelineTimeupdateListener);
}

function syncTimeline(state, force) {
  var server = sessionRef && sessionRef.server;
  var item = sessionRef && sessionRef.item;
  if (!server || !item || !item.ratingKey) return Promise.resolve();
  var ratingKey = item.ratingKey;
  var ms = getCurrentTimeMs();
  var duration = getCanonicalDurationMs();
  if (!force && state === 'playing' && lastTimelineMs >= 0 && Math.abs(ms - lastTimelineMs) < 500) {
    return Promise.resolve();
  }
  lastTimelineMs = ms;
  var extra = {};
  if (state === 'stopped') extra.continuing = 0;
  return scrobbleIfNeeded(ms, duration).then(function () {
    if (!server) return Promise.resolve();
    return progressApi.updateProgress(server, ratingKey, ms, state, duration, extra);
  });
}

function logHlsErrorDiagnostics(src, mediaErr) {
  if (!isHlsUrl(src)) return;
  var headers = hlsAuthHeaders(src, sessionRef);
  fetchHlsManifestProbe(src, headers).then(function (probe) {
    tvError('playback', 'HLS manifest probe', {
      mediaErrorCode: mediaErr && mediaErr.code,
      mediaErrorMessage: describeHlsError(mediaErr),
      nativeHls: !activeHls,
      httpStatus: probe.status,
      isM3u8: probe.isM3u8,
      streamInfCount: probe.streamInfs && probe.streamInfs.length,
      streamInfs: probe.streamInfs,
      mediaTags: probe.mediaTags,
      snippet: probe.snippet || probe.bodyPreview,
      probeError: probe.error
    });
  });
}

function attachPlaybackEvents() {
  if (!videoEl || videoEl.getAttribute('data-events') === '1') return;
  videoEl.setAttribute('data-events', '1');

  videoEl.addEventListener('ended', function () {
    notifyBuffering(false);
    scrobbled = true;
    var server = sessionRef && sessionRef.server;
    var ratingKey = sessionRef && sessionRef.item && sessionRef.item.ratingKey;
    var done = Promise.resolve();
    if (server && ratingKey) {
      done = progressApi.markWatched(server, ratingKey).catch(function (err) {
        console.warn('Plex scrobble on end:', err.message);
      }).then(function () {
        return syncTimeline('stopped', true);
      });
    }
    done.catch(function (err) {
      console.warn('Playback end cleanup:', err && err.message ? err.message : err);
    }).finally(function () {
      if (onEndedCb) onEndedCb();
    });
  });

  videoEl.addEventListener('error', function () {
    notifyBuffering(false);
    var err = videoEl.error;
    var msg = describeHlsError(err);
    console.error('Playback error', msg, err, redactPlexUrl(videoEl.src));
    tvError('playback', 'video error', {
      message: msg,
      code: err && err.code,
      url: redactPlexUrl(videoEl.src)
    });
    logHlsErrorDiagnostics(videoEl.src, err);
    if (onErrorCb) {
      onErrorCb({
        message: msg,
        mediaError: err,
        isHls: isHlsUrl(videoEl.src),
        url: redactPlexUrl(videoEl.src)
      });
    }
  });

  videoEl.addEventListener('waiting', function () {
    notifyBuffering(true);
    tvLog('playback', 'video waiting');
  });
  videoEl.addEventListener('stalled', function () {
    notifyBuffering(true);
    tvLog('playback', 'video stalled');
  });
  videoEl.addEventListener('playing', function () {
    notifyBuffering(false);
    syncInitialPlayingTimeline();
    tvLog('playback', 'video playing');
  });
  videoEl.addEventListener('canplay', function () { notifyBuffering(false); });
  videoEl.addEventListener('canplaythrough', function () { notifyBuffering(false); });
}

function init() {
  videoEl = document.getElementById('native-player');
  if (!videoEl) {
    videoEl = document.createElement('video');
    videoEl.id = 'native-player';
    videoEl.className = 'native-player hidden';
    document.body.appendChild(videoEl);
  }
  // webOS TV buffering policy:
  //   playsinline / webkit-playsinline → keep inline; never trigger a fullscreen
  //     fallback flow (LG single-video rule, no PiP).
  //   preload="metadata" → fetch manifest + first segment only; "auto" would
  //     bloat decoder memory on webOS 5.
  //   NO crossorigin attribute → Plex tokenises requests via query string and
  //     CORS preflights have caused HLS init failures on some LG firmwares.
  videoEl.setAttribute('playsinline', '');
  videoEl.setAttribute('webkit-playsinline', '');
  videoEl.setAttribute('preload', 'metadata');
  videoEl.removeAttribute('crossorigin');
  attachPlaybackEvents();
}

function clearSubtitles() {
  if (!videoEl) return;
  var textTracks = videoEl.textTracks;
  if (textTracks) {
    for (var i = 0; i < textTracks.length; i++) {
      var tt = textTracks[i];
      tt.mode = 'disabled';
      var cues = tt.cues;
      if (cues) {
        for (var c = cues.length - 1; c >= 0; c--) {
          try { tt.removeCue(cues[c]); } catch (e) { /* ignore */ }
        }
      }
    }
  }
  activeTextTrack = null;
  var tracks = videoEl.querySelectorAll('track[data-xplay-sub]');
  for (var t = 0; t < tracks.length; t++) tracks[t].remove();
}

function applySrtText(srtText, offsetMs) {
  clearSubtitles();
  if (!videoEl || !srtText) return;
  var cues = parseSubtitleTextToCues(srtText, offsetMs || 0);
  if (!cues.length) return;
  var track = videoEl.addTextTrack('subtitles', 'Subtitles', 'en');
  cues.forEach(function (cue) {
    try { track.addCue(cue); } catch (e) { /* ignore */ }
  });
  track.mode = 'showing';
  activeTextTrack = track;
}

function hasClientSubtitlesLoaded() {
  return !!activeTextTrack;
}

function normalizeSubtitleFetchAttempts(urls) {
  if (!urls || !urls.length) return [];
  return urls.map(function (entry) {
    if (typeof entry === 'string') return { label: 'subtitle', url: entry };
    return { label: entry.label || 'subtitle', url: entry.url, init: entry.init || null };
  }).filter(function (attempt) { return !!attempt.url; });
}

var SUBTITLE_FETCH_TIMEOUT_MS = 20000;

function xhrSubtitleText(url, options, originalErr) {
  if (typeof XMLHttpRequest === 'undefined') {
    return Promise.reject(originalErr || new Error('Subtitle fetch unavailable'));
  }
  return new Promise(function (resolve, reject) {
    var xhr = new XMLHttpRequest();
    var timeoutMs = options && options.timeout > 0
      ? options.timeout
      : SUBTITLE_FETCH_TIMEOUT_MS;
    var done = false;
    function finish(err, text) {
      if (done) return;
      done = true;
      if (err) {
        reject(err);
        return;
      }
      resolve(text);
    }
    function finishWithText() {
      var text = xhr.responseText || '';
      if (xhr.status >= 200 && xhr.status < 300) {
        finish(null, text);
        return;
      }
      if (xhr.status >= 400) {
        var statusErr = new Error('HTTP ' + xhr.status);
        statusErr.status = xhr.status;
        statusErr.body = text;
        finish(statusErr);
        return;
      }
      finish(originalErr || new Error('Subtitle fetch failed'));
    }
    xhr.open(options && options.method ? options.method : 'GET', url, true);
    xhr.timeout = timeoutMs;
    var headers = (options && options.headers) || {};
    Object.keys(headers).forEach(function (key) {
      try { xhr.setRequestHeader(key, headers[key]); } catch (e) { /* forbidden header */ }
    });
    xhr.onload = finishWithText;
    xhr.onerror = finishWithText;
    xhr.ontimeout = function () {
      finish(new Error('Request timeout'));
    };
    xhr.send(options && options.body ? options.body : null);
  });
}

function fetchSubtitleText(url, options) {
  options = Object.assign({ timeout: SUBTITLE_FETCH_TIMEOUT_MS }, options || {});
  if (typeof XMLHttpRequest !== 'undefined') {
    return xhrSubtitleText(url, options, new Error('Subtitle fetch failed')).catch(function (xhrErr) {
      if (xhrErr && (xhrErr.status || xhrErr.message === 'Request timeout')) {
        return Promise.reject(xhrErr);
      }
      return fetchText(url, options);
    });
  }
  return fetchText(url, options);
}

function resolveSubtitleManifestTarget(baseUrl, body) {
  if (!body || String(body).indexOf('#EXTM3U') < 0) return null;
  var lines = String(body).split(/\r?\n/);
  var hasVariantStreams = false;
  var hasMediaSegments = false;
  var firstDataLine = null;
  var subtitleUri = null;
  for (var i = 0; i < lines.length; i++) {
    var line = (lines[i] || '').trim();
    if (!line) continue;
    if (line.indexOf('#EXT-X-STREAM-INF') === 0) hasVariantStreams = true;
    if (line.indexOf('#EXTINF:') === 0 || line.indexOf('#EXT-X-TARGETDURATION:') === 0) {
      hasMediaSegments = true;
    }
    if (!firstDataLine && line.charAt(0) !== '#') firstDataLine = line;
    if (
      line.indexOf('#EXT-X-MEDIA:') === 0 &&
      /TYPE=SUBTITLES/i.test(line) &&
      /URI="/i.test(line)
    ) {
      var uriMatch = line.match(/URI="([^"]+)"/i);
      if (uriMatch && uriMatch[1]) {
        subtitleUri = uriMatch[1];
        break;
      }
    }
  }
  if (subtitleUri) {
    try {
      return new URL(subtitleUri, baseUrl).toString();
    } catch (e) {
      if (subtitleUri.indexOf('http://') === 0 || subtitleUri.indexOf('https://') === 0) {
        return subtitleUri;
      }
      if (subtitleUri.charAt(0) === '/') {
        var origin = '';
        try { origin = new URL(baseUrl).origin; } catch (err) { origin = ''; }
        return origin ? (origin + subtitleUri) : subtitleUri;
      }
      return subtitleUri;
    }
  }
  /* Do not follow generic variant playlists; those are usually video ladders. */
  if (hasVariantStreams && !hasMediaSegments) return null;
  if (!firstDataLine) return null;
  if (/\.ts(\?|$)/i.test(firstDataLine) || /\.m4s(\?|$)/i.test(firstDataLine)) return null;
  try {
    return new URL(firstDataLine, baseUrl).toString();
  } catch (e) {
    if (firstDataLine.indexOf('http://') === 0 || firstDataLine.indexOf('https://') === 0) {
      return firstDataLine;
    }
    if (firstDataLine.charAt(0) === '/') {
      var originBase = '';
      try { originBase = new URL(baseUrl).origin; } catch (err) { originBase = ''; }
      return originBase ? (originBase + firstDataLine) : firstDataLine;
    }
    return firstDataLine;
  }
}

function fetchSubtitleTextWithManifestFollow(url, options, depth) {
  depth = depth || 0;
  return fetchSubtitleText(url, options).then(function (text) {
    if (depth >= 4) return text;
    var nextUrl = resolveSubtitleManifestTarget(url, text);
    if (!nextUrl || nextUrl === url) return text;
    return fetchSubtitleTextWithManifestFollow(nextUrl, options, depth + 1);
  });
}

function promiseWithTimeout(promise, timeoutMs, message) {
  return new Promise(function (resolve, reject) {
    var settled = false;
    var timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      reject(new Error(message || 'Request timeout'));
    }, timeoutMs);
    promise.then(function (value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    }, function (err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}

function loadClientSubtitleFromUrls(urls, offsetMs) {
  var attempts = normalizeSubtitleFetchAttempts(urls);
  if (!attempts.length) return Promise.reject(new Error('No subtitle URL'));
  var index = 0;
  function tryNext(lastErr) {
    if (index >= attempts.length) {
      return Promise.reject(lastErr || new Error('No subtitle URL'));
    }
    var entry = attempts[index];
    var url = entry.url;
    var label = entry.label;
    var attempt = index + 1;
    index += 1;
    console.info(
      '[subtitles] fetch ' + attempt + '/' + attempts.length + ' (' + label + ')',
      redactPlexUrl(url)
    );
    var fetchOptions = Object.assign({ timeout: SUBTITLE_FETCH_TIMEOUT_MS }, entry.init || {});
    return promiseWithTimeout(
      fetchSubtitleTextWithManifestFollow(url, fetchOptions),
      fetchOptions.timeout,
      'Request timeout'
    ).then(function (text) {
      applySrtText(text, offsetMs);
      if (!hasClientSubtitlesLoaded()) {
        var parseErr = new Error('Subtitle file had no parseable cues');
        parseErr.body = text;
        return Promise.reject(parseErr);
      }
    }).catch(function (err) {
      if (index < attempts.length && (shouldRetrySubtitleFetch(err) || !err.status)) {
        var detail = err.body ? ' — ' + String(err.body).slice(0, 120) : '';
        var failKind = err.status
          ? 'HTTP ' + err.status
          : (err.message === 'Request timeout' ? 'timeout' : 'parse failure');
        console.warn(
          '[subtitles] ' + failKind + ' on (' + label + '), trying fallback' + detail
        );
        return tryNext(err);
      }
      var failDetail = err.body ? ' — ' + String(err.body).slice(0, 120) : '';
      console.warn('[subtitles] failed on (' + label + ')', err.message + failDetail);
      return Promise.reject(err);
    });
  }
  return tryNext();
}

function loadClientSubtitle(url, offsetMs) {
  if (!url) return Promise.reject(new Error('No subtitle URL'));
  return loadClientSubtitleFromUrls([url], offsetMs);
}

function applyPlaybackOffset(offsetMs) {
  if (!videoEl || !offsetMs || offsetMs <= 0) return;
  var sec = offsetMs / 1000;
  var applied = false;
  function trySeek() {
    if (applied || !videoEl) return;
    if (videoEl.readyState < 1) return;
    try {
      videoEl.currentTime = sec;
      applied = true;
    } catch (e) { /* ignore */ }
  }
  trySeek();
  videoEl.addEventListener('loadedmetadata', function seekOnce() {
    videoEl.removeEventListener('loadedmetadata', seekOnce);
    trySeek();
  });
  videoEl.addEventListener('canplay', function seekOnCanPlay() {
    if (applied) {
      videoEl.removeEventListener('canplay', seekOnCanPlay);
      return;
    }
    trySeek();
    if (applied) videoEl.removeEventListener('canplay', seekOnCanPlay);
  });
}

function notifyFirstFrame() {
  if (firstFrameFired || !videoEl) return;
  firstFrameFired = true;
  if (onFirstFrameCb) {
    try { onFirstFrameCb(); } catch (e) { console.error(e); }
  }
}

function play(url, session, options) {
  options = options || {};
  sessionRef = session;
  scrobbled = false;
  lastTimelineMs = -1;
  var offsetMs = options.offset || (session && session.offset) || 0;
  var mode = options.mode || playbackModeRef;
  streamBaseOffsetMs = 0;
  if (offsetMs > 0 && shouldSkipClientPlaybackOffset(url, mode, offsetMs)) {
    streamBaseOffsetMs = offsetMs;
  }
  lastKnownPositionMs = offsetMs;
  initialPlayingTimelineSynced = false;
  firstFrameFired = false;
  lastPlaybackUrl = url;
  playbackModeRef = mode;
  logRuntimeBuildStampOnce();
  logPlaybackStreamType(mode, url);
  logPlaybackTranscodeParams(url);
  logPlaybackConnection(url, session);
  tvLog('playback', 'play attempt', {
    mode: mode,
    offsetMs: offsetMs,
    mseHls: shouldUseMseHls(url),
    url: compactPlaybackUrl(url)
  });
  rebufferWatchdog.resetEpisode();
  notifyBuffering(true);
  videoEl.classList.remove('hidden');
  if (shouldUseMseHls(url)) {
    attachMseHls(url, hlsAuthHeaders(url, session));
  } else {
    destroyActiveHls();
    videoEl.src = url;
  }
  keepScreenOn(true);
  addOnceEventListener(videoEl, 'canplay', notifyFirstFrame);
  addOnceEventListener(videoEl, 'playing', notifyFirstFrame);
  if (offsetMs > 0 && !shouldSkipClientPlaybackOffset(url, mode, offsetMs)) {
    applyPlaybackOffset(offsetMs);
  }
  var p = videoEl.play();
  if (p && p.catch) {
    p.catch(function (err) {
      console.error(err);
      tvError('playback', 'play() rejected', err && err.message ? err.message : err);
      notifyBuffering(false);
      if (onErrorCb) onErrorCb(normalizePlaybackError(err, url));
    });
  }
  startProgressSync();
  armInitialPlayingTimelineSync();
  return videoEl;
}

function getVideoElement() {
  return videoEl;
}

function pause() {
  if (videoEl) videoEl.pause();
  stopProgressSync();
  rebufferWatchdog.resetEpisode();
  syncTimeline('paused', true);
}

function resume() {
  if (videoEl) videoEl.play();
  startProgressSync();
  syncTimeline('playing', true);
}

function stop(options) {
  options = options || {};
  var server = sessionRef && sessionRef.server;
  var item = sessionRef && sessionRef.item;
  var ratingKey = item && item.ratingKey;
  var duration = getCanonicalDurationMs() || (item && item.duration) || getDurationMs();
  var ms = getCurrentTimeMs();
  if (ms > 0) lastKnownPositionMs = ms;

  stopProgressSync();
  rebufferWatchdog.resetEpisode();
  cancelInitialPlayingTimelineSync();
  cancelPendingSeek();
  clearSubtitles();
  notifyBuffering(false);
  keepScreenOn(false);
  if (videoEl) {
    videoEl.pause();
    destroyActiveHls();
    // Order matters on webOS: clear src first, then call load() to free the
    // native decoder. Otherwise the decoder may stay pinned until the next
    // <video> usage and silently fail subsequent play().
    videoEl.removeAttribute('src');
    videoEl.load();
    videoEl.classList.add('hidden');
  }
  sessionRef = null;
  scrobbled = false;
  lastTimelineMs = -1;
  /* keep lastKnownPositionMs for restart offset after teardown */
  rebufferWatchdog.resetEpisode();
  initialPlayingTimelineSynced = false;
  lastPlaybackUrl = null;
  playbackModeRef = 'unknown';
  streamBaseOffsetMs = 0;

  if (server && ratingKey && !options.skipTimeline) {
    var continuing = options.continuing != null ? options.continuing : 0;
    progressApi.updateProgress(server, ratingKey, ms, 'stopped', duration, { continuing: continuing }).catch(function (err) {
      console.warn('Plex timeline on stop:', err.message);
      if (onTimelineSyncFailureCb) {
        try { onTimelineSyncFailureCb(err); } catch (e) { console.error(e); }
      }
    });
  }
}

function flushProgress(state) {
  if (!sessionRef) return Promise.resolve();
  var ms = getCurrentTimeMs();
  var duration = getCanonicalDurationMs();
  return flushTimelineProgress({
    session: sessionRef,
    isPaused: isPaused(),
    explicitState: state,
    viewOffsetMs: ms,
    durationMs: duration,
    updateProgress: function (server, ratingKey, viewOffset, timelineState, dur, extra) {
      lastTimelineMs = viewOffset;
      return scrobbleIfNeeded(viewOffset, dur).then(function () {
        return progressApi.updateProgress(server, ratingKey, viewOffset, timelineState, dur, extra);
      });
    },
    onFailure: function (err) {
      console.warn('Plex timeline flush:', err && err.message ? err.message : err);
      if (onTimelineSyncFailureCb) {
        try { onTimelineSyncFailureCb(err); } catch (e) { console.error(e); }
      }
    }
  });
}

function clampSeekSeconds(seconds) {
  if (!videoEl) return Math.max(0, seconds || 0);
  var dur = videoEl.duration;
  if (dur && isFinite(dur) && dur > 0) {
    return Math.max(0, Math.min(seconds, dur));
  }
  return Math.max(0, seconds || 0);
}

function cancelPendingSeek() {
  if (pendingSeekWrapper && videoEl) {
    videoEl.removeEventListener('loadedmetadata', pendingSeekWrapper);
    pendingSeekWrapper = null;
    pendingSeekListener = null;
  }
}

function seek(seconds) {
  if (!videoEl) return;
  seconds = clampSeekSeconds(seconds);
  cancelPendingSeek();
  function apply() {
    try {
      videoEl.currentTime = seconds;
    } catch (e) {
      console.warn('Seek failed:', e && e.message ? e.message : e);
    }
    syncTimeline(timelineStateForPlayback(videoEl.paused), true);
  }
  if (videoEl.readyState >= 1 && isFinite(videoEl.duration) && videoEl.duration > 0) {
    apply();
    return;
  }
  pendingSeekListener = function seekWhenReady() {
    pendingSeekListener = null;
    pendingSeekWrapper = null;
    apply();
  };
  pendingSeekWrapper = addOnceEventListener(videoEl, 'loadedmetadata', pendingSeekListener);
}

function seekMs(ms) {
  var targetMs = Math.max(0, ms || 0);
  var relMs = Math.max(0, targetMs - (streamBaseOffsetMs || 0));
  seek(relMs / 1000);
  if (targetMs > 0) lastKnownPositionMs = targetMs;
}

function seekBy(secondsDelta) {
  if (!videoEl) return;
  seek(videoEl.currentTime + secondsDelta);
}

function isPaused() {
  return !videoEl || videoEl.paused;
}

function togglePlayPause() {
  if (!videoEl) return;
  if (videoEl.paused) resume();
  else pause();
}

function mediaPositionMsFromVideo() {
  if (!videoEl) return 0;
  var currentMs = Math.floor(videoEl.currentTime * 1000);
  if (!streamBaseOffsetMs) return currentMs;
  /* hls.js/MSE can expose absolute media timeline currentTime when Plex
   * transcode URL already includes offset. In that case adding streamBaseOffset
   * double-counts resume position (e.g. 2061s -> 4122s), which breaks
   * timeline/subtitle API calls and fallback restarts.
   */
  if (activeHls && currentMs >= (streamBaseOffsetMs - 2000)) return currentMs;
  return currentMs + streamBaseOffsetMs;
}

function getCurrentTimeMs() {
  if (!videoEl) {
    return lastKnownPositionMs > 0 ? lastKnownPositionMs : 0;
  }
  var ms = mediaPositionMsFromVideo();
  if (ms > 0) {
    if (lastKnownPositionMs > 0 && ms < lastKnownPositionMs &&
        streamBaseOffsetMs > 0 && ms <= streamBaseOffsetMs) {
      return lastKnownPositionMs;
    }
    lastKnownPositionMs = ms;
    return ms;
  }
  return lastKnownPositionMs > 0 ? lastKnownPositionMs : 0;
}

function getDurationMs() {
  return videoEl && videoEl.duration ? Math.floor(videoEl.duration * 1000) : 0;
}

function startProgressSync() {
  stopProgressSync();
  progressTimer = setInterval(function () {
    if (!sessionRef || !videoEl || videoEl.paused) return;
    var ms = getCurrentTimeMs();
    var duration = getCanonicalDurationMs();
    scrobbleIfNeeded(ms, duration).then(function () {
      return syncTimeline('playing', true);
    }).catch(function (err) {
      console.warn('Plex timeline sync:', err && err.message ? err.message : err);
    });
  }, TIMELINE_INTERVAL_MS);
}

function stopProgressSync() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

function onEnded(fn) {
  onEndedCb = fn;
}

function onError(fn) {
  onErrorCb = fn;
}

function onBuffering(fn) {
  onBufferingCb = fn;
}

function onRebufferTimeout(fn) {
  onRebufferTimeoutCb = fn;
}

function onFirstFrame(fn) {
  onFirstFrameCb = fn;
}

function onTimelineSyncFailure(fn) {
  onTimelineSyncFailureCb = fn;
}

function clearListeners() {
  onEndedCb = null;
  onErrorCb = null;
  onBufferingCb = null;
  onRebufferTimeoutCb = null;
  onFirstFrameCb = null;
  onTimelineSyncFailureCb = null;
}

function showControls(visible) {
  if (videoEl) {
    videoEl.classList.toggle('controls-visible', visible);
  }
}

function setPlaybackMode(mode) {
  playbackModeRef = mode || 'unknown';
}

function getPlaybackMode() {
  return playbackModeRef;
}

function getPlaybackStats() {
  var w = videoEl ? videoEl.videoWidth : 0;
  var h = videoEl ? videoEl.videoHeight : 0;
  return {
    mode: playbackModeRef,
    url: redactPlexUrl(lastPlaybackUrl),
    videoWidth: w,
    videoHeight: h,
    isHls: isHlsUrl(lastPlaybackUrl)
  };
}

export {
  init,
  play,
  pause,
  resume,
  stop,
  seek,
  seekMs,
  seekBy,
  isPaused,
  togglePlayPause,
  getCurrentTimeMs,
  getDurationMs,
  getCanonicalDurationMs,
  onEnded,
  onError,
  onBuffering,
  onRebufferTimeout,
  onFirstFrame,
  onTimelineSyncFailure,
  flushProgress,
  redactPlexUrl,
  clearListeners,
  showControls,
  getVideoElement,
  clearSubtitles,
  hasClientSubtitlesLoaded,
  loadClientSubtitle,
  loadClientSubtitleFromUrls,
  setPlaybackMode,
  getPlaybackMode,
  getPlaybackStats,
  REBUFFER_TIMEOUT_MS,
  setProgressApiForTest,
  setRebufferTimersForTest,
  setHlsPlayerForTest
};
