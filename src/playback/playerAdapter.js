import { keepScreenOn } from '../platform/webos.js';
import { updateProgress, markWatched } from '../plex/library.js';
import { fetchText } from '../utils/fetch.js';
import { describeHlsError, isHlsUrl } from './hlsPolicy.js';
import { parseSrtToCues } from './tracks/srtParser.js';

var videoEl = null;
var progressTimer = null;
var sessionRef = null;
var onEndedCb = null;
var onErrorCb = null;
var onBufferingCb = null;
var onRebufferTimeoutCb = null;
var bufferingShown = false;
var scrobbled = false;
var lastTimelineMs = -1;
var rebufferTimer = null;
var rebufferFired = false;
var activeTextTrack = null;
var lastPlaybackUrl = null;
var playbackModeRef = 'unknown';

var TIMELINE_INTERVAL_MS = 10000;
var SCROBBLE_THRESHOLD = 0.92;

/**
 * webOS TV 5+ buffering policy (see docs/caching-and-buffering.md):
 *   - Single native <video> element (one decoder, hard LG rule).
 *   - preload="metadata" — fetch manifest + first segment; never "auto" on TV
 *     (memory pressure on 1-2 GB devices, especially webOS 5).
 *   - Re-buffer watchdog: if the player stays in waiting/stalled for
 *     REBUFFER_TIMEOUT_MS without progressing, fire onRebufferTimeout so the
 *     screen can downshift quality / fall back to HTTP transcode.
 */
var REBUFFER_TIMEOUT_MS = 12000;

function notifyBuffering(show) {
  if (bufferingShown === show) return;
  bufferingShown = show;
  if (onBufferingCb) onBufferingCb(show);
  if (show) startRebufferWatchdog();
  else clearRebufferWatchdog();
}

function startRebufferWatchdog() {
  clearRebufferWatchdog();
  rebufferTimer = setTimeout(function () {
    rebufferTimer = null;
    if (rebufferFired || !bufferingShown) return;
    rebufferFired = true;
    if (onRebufferTimeoutCb) {
      try { onRebufferTimeoutCb(); } catch (e) { console.error(e); }
    }
  }, REBUFFER_TIMEOUT_MS);
}

function clearRebufferWatchdog() {
  if (rebufferTimer) {
    clearTimeout(rebufferTimer);
    rebufferTimer = null;
  }
}

function getItemDurationMs() {
  if (sessionRef && sessionRef.item && sessionRef.item.duration) {
    return sessionRef.item.duration;
  }
  return getDurationMs();
}

function shouldScrobble(ms, duration) {
  if (!duration || duration <= 0) return false;
  if (ms / duration >= SCROBBLE_THRESHOLD) return true;
  return duration - ms <= 30000;
}

function scrobbleIfNeeded(ms, duration) {
  var server = sessionRef && sessionRef.server;
  var ratingKey = sessionRef && sessionRef.item && sessionRef.item.ratingKey;
  if (scrobbled || !server || !ratingKey) return Promise.resolve();
  if (!shouldScrobble(ms, duration)) return Promise.resolve();
  scrobbled = true;
  return markWatched(server, ratingKey).catch(function (err) {
    scrobbled = false;
    console.warn('Plex scrobble:', err.message);
  });
}

function syncTimeline(state, force) {
  var server = sessionRef && sessionRef.server;
  var item = sessionRef && sessionRef.item;
  if (!server || !item || !item.ratingKey) return Promise.resolve();
  var ratingKey = item.ratingKey;
  var ms = getCurrentTimeMs();
  var duration = getItemDurationMs();
  if (!force && state === 'playing' && lastTimelineMs >= 0 && Math.abs(ms - lastTimelineMs) < 500) {
    return Promise.resolve();
  }
  lastTimelineMs = ms;
  var extra = {};
  if (state === 'stopped') extra.continuing = 0;
  return scrobbleIfNeeded(ms, duration).then(function () {
    if (!server) return Promise.resolve();
    return updateProgress(server, ratingKey, ms, state, duration, extra);
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
      done = markWatched(server, ratingKey).catch(function (err) {
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
    console.error('Playback error', msg, err);
    if (onErrorCb) {
      onErrorCb({
        message: msg,
        mediaError: err,
        isHls: isHlsUrl(videoEl.src),
        url: videoEl.src
      });
    }
  });

  videoEl.addEventListener('waiting', function () { notifyBuffering(true); });
  videoEl.addEventListener('stalled', function () { notifyBuffering(true); });
  videoEl.addEventListener('playing', function () { notifyBuffering(false); });
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
  if (activeTextTrack) {
    activeTextTrack.mode = 'disabled';
    var cues = activeTextTrack.cues;
    if (cues) {
      for (var i = cues.length - 1; i >= 0; i--) {
        try { activeTextTrack.removeCue(cues[i]); } catch (e) { /* ignore */ }
      }
    }
    activeTextTrack = null;
  }
  var tracks = videoEl.querySelectorAll('track[data-xplay-sub]');
  for (var t = 0; t < tracks.length; t++) tracks[t].remove();
}

function applySrtText(srtText, offsetMs) {
  clearSubtitles();
  if (!videoEl || !srtText) return;
  var cues = parseSrtToCues(srtText, offsetMs || 0);
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

function loadClientSubtitle(url, offsetMs) {
  if (!url) return Promise.reject(new Error('No subtitle URL'));
  return fetchText(url, { timeout: 20000 }).then(function (text) {
    applySrtText(text, offsetMs);
  });
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

function play(url, session, options) {
  options = options || {};
  sessionRef = session;
  scrobbled = false;
  lastTimelineMs = -1;
  rebufferFired = false;
  lastPlaybackUrl = url;
  playbackModeRef = options.mode || playbackModeRef;
  clearRebufferWatchdog();
  notifyBuffering(true);
  videoEl.classList.remove('hidden');
  videoEl.src = url;
  keepScreenOn(true);
  var offsetMs = options.offset || (session && session.offset) || 0;
  if (offsetMs > 0) applyPlaybackOffset(offsetMs);
  var p = videoEl.play();
  if (p && p.catch) {
    p.catch(function (err) {
      console.error(err);
      notifyBuffering(false);
      if (onErrorCb) onErrorCb(err);
    });
  }
  startProgressSync();
  syncTimeline('playing', true);
  return videoEl;
}

function getVideoElement() {
  return videoEl;
}

function pause() {
  if (videoEl) videoEl.pause();
  stopProgressSync();
  clearRebufferWatchdog();
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
  var duration = item && item.duration ? item.duration : getDurationMs();
  var ms = getCurrentTimeMs();

  stopProgressSync();
  clearRebufferWatchdog();
  clearSubtitles();
  notifyBuffering(false);
  keepScreenOn(false);
  if (videoEl) {
    videoEl.pause();
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
  rebufferFired = false;
  lastPlaybackUrl = null;
  playbackModeRef = 'unknown';

  if (server && ratingKey && !options.skipTimeline) {
    var continuing = options.continuing != null ? options.continuing : 0;
    updateProgress(server, ratingKey, ms, 'stopped', duration, { continuing: continuing }).catch(function (err) {
      console.warn('Plex timeline on stop:', err.message);
    });
  }
}

function clampSeekSeconds(seconds) {
  if (!videoEl) return Math.max(0, seconds || 0);
  var dur = videoEl.duration;
  if (dur && isFinite(dur) && dur > 0) {
    return Math.max(0, Math.min(seconds, dur));
  }
  return Math.max(0, seconds || 0);
}

function seek(seconds) {
  if (!videoEl) return;
  seconds = clampSeekSeconds(seconds);
  function apply() {
    try {
      videoEl.currentTime = seconds;
    } catch (e) {
      console.warn('Seek failed:', e && e.message ? e.message : e);
    }
    syncTimeline('playing', true);
  }
  if (videoEl.readyState >= 1 && isFinite(videoEl.duration) && videoEl.duration > 0) {
    apply();
    return;
  }
  videoEl.addEventListener('loadedmetadata', function seekWhenReady() {
    videoEl.removeEventListener('loadedmetadata', seekWhenReady);
    apply();
  });
}

function seekMs(ms) {
  seek((ms || 0) / 1000);
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

function getCurrentTimeMs() {
  return videoEl ? Math.floor(videoEl.currentTime * 1000) : 0;
}

function getDurationMs() {
  return videoEl && videoEl.duration ? Math.floor(videoEl.duration * 1000) : 0;
}

function startProgressSync() {
  stopProgressSync();
  progressTimer = setInterval(function () {
    if (!sessionRef || !videoEl || videoEl.paused) return;
    var ms = getCurrentTimeMs();
    var duration = getItemDurationMs();
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

function clearListeners() {
  onEndedCb = null;
  onErrorCb = null;
  onBufferingCb = null;
  onRebufferTimeoutCb = null;
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
    url: lastPlaybackUrl,
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
  onEnded,
  onError,
  onBuffering,
  onRebufferTimeout,
  clearListeners,
  showControls,
  getVideoElement,
  clearSubtitles,
  hasClientSubtitlesLoaded,
  loadClientSubtitle,
  setPlaybackMode,
  getPlaybackMode,
  getPlaybackStats,
  REBUFFER_TIMEOUT_MS
};
