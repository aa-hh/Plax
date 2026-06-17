/**
 * Picks the playback adapter at runtime.
 *
 * All real LG webOS TVs and the simulator use the HTML5 <video> element with
 * webOS mediaOption (native 4K HEVC HDR/DV). hls.js is used only for the
 * H.264 transcode fallback on webOS 4.
 */

import * as htmlPlayer from './playerAdapter.js';

var _resolvedPlayer = null;

function resolvePlayer() {
  if (_resolvedPlayer) return _resolvedPlayer;
  _resolvedPlayer = htmlPlayer;
  try {
    console.info('[player] adapter resolved: html5');
  } catch (e) { /* ignore */ }
  return _resolvedPlayer;
}

function getResolvedPlayerKind() {
  resolvePlayer();
  return 'html5';
}

function makeProxy(name) {
  return function () {
    var p = resolvePlayer();
    return p[name].apply(p, arguments);
  };
}

var init = makeProxy('init');
var play = makeProxy('play');
var pause = makeProxy('pause');
var resume = makeProxy('resume');
var stop = makeProxy('stop');
var seek = makeProxy('seek');
var seekMs = makeProxy('seekMs');
var seekBy = makeProxy('seekBy');
var isPaused = makeProxy('isPaused');
var togglePlayPause = makeProxy('togglePlayPause');
var getCurrentTimeMs = makeProxy('getCurrentTimeMs');
var getDurationMs = makeProxy('getDurationMs');
var getCanonicalDurationMs = makeProxy('getCanonicalDurationMs');
var onEnded = makeProxy('onEnded');
var onError = makeProxy('onError');
var onBuffering = makeProxy('onBuffering');
var onRebufferTimeout = makeProxy('onRebufferTimeout');
var onFirstFrame = makeProxy('onFirstFrame');
var onTimelineSyncFailure = makeProxy('onTimelineSyncFailure');
var flushProgress = makeProxy('flushProgress');
var redactPlexUrl = makeProxy('redactPlexUrl');
var clearListeners = makeProxy('clearListeners');
var showControls = makeProxy('showControls');
var getVideoElement = makeProxy('getVideoElement');
var clearSubtitles = makeProxy('clearSubtitles');
var hasClientSubtitlesLoaded = makeProxy('hasClientSubtitlesLoaded');
var loadClientSubtitle = makeProxy('loadClientSubtitle');
var loadClientSubtitleFromUrls = makeProxy('loadClientSubtitleFromUrls');
var setPlaybackMode = makeProxy('setPlaybackMode');
var getPlaybackMode = makeProxy('getPlaybackMode');
var getPlaybackStats = makeProxy('getPlaybackStats');
var setProgressApiForTest = makeProxy('setProgressApiForTest');
var setRebufferTimersForTest = makeProxy('setRebufferTimersForTest');
var setHlsPlayerForTest = makeProxy('setHlsPlayerForTest');

function getRebufferTimeoutMs() { return resolvePlayer().REBUFFER_TIMEOUT_MS; }

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
  setProgressApiForTest,
  setRebufferTimersForTest,
  setHlsPlayerForTest,
  getResolvedPlayerKind,
  getRebufferTimeoutMs as REBUFFER_TIMEOUT_MS
};
