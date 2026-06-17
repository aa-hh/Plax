import { getState } from '../../core/store.js';
import { getMetadata } from '../../plex/library.js';
import { createSession, resolveStreamUrl } from '../../playback/sessionController.js';
import * as player from '../../playback/playerFactory.js';
import * as queue from '../../playback/playbackQueue.js';
import {
  extractIntroMarkers,
  extractCreditMarkers,
  findActiveIntroMarker,
  findActiveCreditMarker,
  introSkipTargetMs,
  creditSkipTargetMs,
  markerKey
} from '../../playback/introMarkers.js';
import { attachRemoteKeys, KEYS, SEEK_STEP_SEC } from '../../playback/remoteKeys.js';
import { parseAudioStreams } from '../../playback/tracks/audioTracks.js';
import {
  parseSubtitleStreams,
  findSubtitleTrack,
  canUseClientSubtitles,
  isDirectPlaybackMode,
  shouldBurnInSubtitle,
  isAdvancedSubtitleCodec,
  buildSubtitleFetchPlan,
  prepareClientSubtitlePlayback,
  parseTranscodeSessionFromUrl,
  pickDefaultSubtitleTrack,
  subtitleDisplayTitle,
  subtitleMenuOptionLabel
} from '../../playback/tracks/subtitleTracks.js';
import {
  listProfiles,
  getProfile,
  normalizeQualityKey,
  formatOriginalQualityLabel,
  isDirectPlayOnlyQuality,
  allowsPlaybackFallback,
  requiresServerTranscode
} from '../../playback/qualityProfiles.js';
import {
  showLoadingOverlay,
  hideLoadingOverlay,
  showBuffering,
  hideBuffering,
  resetBufferingOverlay
} from '../loadingOverlay.js';
import {
  isHlsUrl,
  isSrcNotSupportedError,
  isHlsSourceRejectedError,
  formatFinalPlaybackError,
  formatDirectPlayOnlyError
} from '../../playback/hlsPolicy.js';
import { stopPlaybackForQueueAdvance } from '../../playback/queueAdvance.js';
import {
  resolveQueueAdvanceOffset,
  resolveInitialPlaybackOffset
} from '../../playback/queuePlaybackOffset.js';
import {
  shouldScheduleOverlayHideWhenShowing,
  onPlaybackFirstFrame
} from './playerOverlayFirstFrame.js';
import {
  createPlaybackFallbackState,
  resetPlaybackFallbackFlags,
  applyRestartPlaybackFallbackFlags,
  decideErrorFallback,
  decideRebufferFallback,
  clearHlsFallbackAfterHlsTranscodeStart
} from '../../playback/playbackFallback.js';
import { createPlaybackRestartLock } from '../../playback/playbackRestartLock.js';
import { probePlayback } from '../../playback/capabilityProbe.js';
import { isStalePlaybackGeneration } from '../../playback/playbackGeneration.js';
import { loadDeviceDisplay } from '../../platform/deviceDisplay.js';
import { onAppBackground } from '../../platform/webos.js';
import {
  isMotionCursorVisible,
  MOTION_CURSOR_SHOW_EVENT,
  MOTION_CURSOR_HIDE_EVENT
} from '../../platform/motionCursor.js';
import {
  getFocusables,
  focusFirst,
  attachFocusNav,
  scrollFocusedIntoView,
  focusableSelector
} from '../focus.js';
import { getPlaybackPrefs, setPlaybackPrefs } from '../../settings/playbackSettings.js';
import {
  loadScrubPreviewSource,
  resolveScrubPreview
} from '../../playback/storyboard.js';
import {
  AUTOPLAY_COUNTDOWN_SEC,
  createAutoplayCountdown,
  shouldTriggerAutoplayOnCreditPrompt,
  shouldTriggerAutoplayOnEnded
} from '../../playback/autoplayCountdown.js';
import { CLIENT_SUBTITLE_DEFER_MS } from '../../playback/subtitleTiming.js';
import { formatPlaybackFailure } from '../../playback/playbackErrors.js';
import {
  tvLog,
  tvError,
  refreshDebugFromEnvironment,
  ensureDebugOverlayOnTop,
  setDebugOverlayPlayerMode
} from '../../utils/tvDebug.js';

var OVERLAY_HIDE_MS = 3000;
/* Manual Phase 4: validate HTTPS plex.direct proxy on real webOS vs Plex Web HAR. */
var SEEK_COMMIT_DEBOUNCE_MS = 300;
var SCRUB_STEP_MS = 10000;
var SCRUB_PREVIEW_APPLY_MS = 80;

function formatTime(ms) {
  var s = Math.floor(ms / 1000);
  var m = Math.floor(s / 60);
  var h = Math.floor(m / 60);
  s = s % 60;
  m = m % 60;
  if (h) return h + ':' + pad(m) + ':' + pad(s);
  return m + ':' + pad(s);
}
function pad(n) { return n < 10 ? '0' + n : String(n); }

var PLAYER_REWIND_MS = 10000;
var PLAYER_FORWARD_MS = 30000;

var ICON_QUALITY =
  '<svg class="player-stream-icon" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path fill="currentColor" d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.04-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.58.24-1.12.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.04.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.58-.24 1.12-.57 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"/>' +
  '</svg>';
var ICON_AUDIO =
  '<svg class="player-stream-icon" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path fill="currentColor" d="M3 10v4h4l5 5V5L7 10H3zm13.5 2c0-1.77-1.02-3.29-2.5-4.03v8.06c1.48-.74 2.5-2.26 2.5-4.03zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>' +
  '</svg>';
var ICON_SUBTITLE =
  '<svg class="player-stream-icon player-stream-icon--cc" viewBox="0 0 24 24" aria-hidden="true">' +
  '<rect x="3" y="5" width="18" height="14" rx="2.75" fill="none" stroke="currentColor" stroke-width="1.75"/>' +
  '<path fill="currentColor" d="M7.2 8.8h1.2c1.05 0 1.8.62 1.8 1.58 0 .96-.75 1.58-1.8 1.58h-.55v1.04H7.2V8.8zm1.2 2.42c.48 0 .75-.28.75-.68 0-.4-.27-.68-.75-.68h-.36v1.36h.36zm4.15 1.3h.9c.24.54.68.82 1.28.82 1.02 0 1.62-.72 1.62-1.88 0-1.12-.58-1.82-1.56-1.82-.62 0-1.08.28-1.38.76h-.94c.36-1 1.18-1.54 2.28-1.54 1.58 0 2.62 1.04 2.62 2.6 0 1.58-1.06 2.62-2.66 2.62-.94 0-1.68-.36-2.16-1.04z"/>' +
  '<path fill="currentColor" d="M6.25 15.8h11.5v1.5H6.25zm0 2.35h8v1.5H6.25z"/>' +
  '</svg>';

var ICON_PREV =
  '<svg class="player-control-icon" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path fill="currentColor" d="M6 6h2v12H6V6zm3.5 6l8.5-6v12l-8.5-6z"/>' +
  '</svg>';
var ICON_NEXT =
  '<svg class="player-control-icon" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path fill="currentColor" d="M16 6h2v12h-2V6zM6 18l8.5-6L6 6v12z"/>' +
  '</svg>';
var ICON_REWIND =
  '<svg class="player-control-icon" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path fill="currentColor" d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>' +
  '</svg>';
var ICON_FORWARD =
  '<svg class="player-control-icon" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path fill="currentColor" d="M12.01 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6H20c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/>' +
  '</svg>';
var ICON_PLAY =
  '<svg class="player-control-icon" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path fill="currentColor" d="M8 5v14l11-7L8 5z"/>' +
  '</svg>';
var ICON_PAUSE =
  '<svg class="player-control-icon" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>' +
  '</svg>';
var ICON_STOP =
  '<svg class="player-control-icon" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path fill="currentColor" d="M6 6h12v12H6V6z"/>' +
  '</svg>';
var ICON_SKIP_INTRO =
  '<svg class="player-control-icon" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path fill="currentColor" d="M4 18l8.5-6L4 6v12zm9-6v6h2V6h-2zm3.5 6 5.5-3-5.5-3v6z"/>' +
  '</svg>';

function formatPlaybackDisplay(item) {
  if (!item) return { primary: 'Loading…', secondary: '' };
  if (item.type === 'episode') {
    var showTitle = item.grandparentTitle || item.parentTitle || '';
    var epTitle = item.title || '';
    var meta = '';
    if (item.parentIndex != null && item.parentIndex !== '' &&
        item.index != null && item.index !== '') {
      meta = 'S' + item.parentIndex + ' · E' + item.index;
    } else if (item.index != null && item.index !== '') {
      meta = 'E' + item.index;
    }
    var secondary = meta;
    if (epTitle) secondary = secondary ? secondary + ' · ' + epTitle : epTitle;
    return {
      primary: showTitle || epTitle || 'Episode',
      secondary: showTitle ? secondary : ''
    };
  }
  return { primary: item.title || 'Untitled', secondary: '' };
}

function playerScreen(root, params, navigate) {
  var server = getState().activeServer;
  var overlay = document.createElement('div');
  overlay.className = 'player-overlay';
  overlay.innerHTML =
    '<div class="player-subtitle-delay" id="player-subtitle-delay" hidden>' +
    '<button type="button" class="btn player-subtitle-delay-btn" id="btn-sub-delay-minus" tabindex="0" aria-label="Subtitle earlier">−</button>' +
    '<span class="player-subtitle-delay-value" id="player-sub-delay-value">0 ms</span>' +
    '<button type="button" class="btn player-subtitle-delay-btn" id="btn-sub-delay-plus" tabindex="0" aria-label="Subtitle later">+</button>' +
    '</div>' +
    '<button type="button" class="player-skip-intro-prompt" id="btn-skip-intro-prompt" hidden tabindex="0" aria-label="Skip intro. Press OK to confirm.">' +
    ICON_SKIP_INTRO +
    '<span class="player-skip-intro-prompt-text">Skip Intro</span>' +
    '<span class="player-skip-intro-prompt-hint">OK</span>' +
    '</button>' +
    '<div class="player-bottom">' +
    '<div class="player-seek-row" data-focus-zone="player-seek">' +
    '<span class="player-time player-time--elapsed" id="player-time-elapsed" aria-hidden="true">0:00</span>' +
    '<div class="player-seek-wrap">' +
    '<div class="player-scrub-preview" id="player-scrub-preview" hidden aria-hidden="true">' +
    '<div class="player-scrub-preview-thumb" id="player-scrub-preview-thumb"></div>' +
    '<span class="player-scrub-preview-time" id="player-scrub-preview-time">0:00</span>' +
    '</div>' +
    '<button type="button" class="player-seek-bar" id="player-seek" tabindex="0" role="slider" aria-label="Seek" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
    '<span class="player-seek-track"><span class="player-seek-played" id="progress-fill"></span>' +
    '<span class="player-seek-thumb" id="seek-thumb"></span></span>' +
    '</button>' +
    '</div>' +
    '<span class="player-time player-time--total" id="player-time-total" aria-hidden="true">0:00</span>' +
    '</div>' +
    '<div class="player-control-bar">' +
    '<div class="player-meta-col">' +
    '<h1 class="player-now-playing-title" id="player-title-primary">Loading…</h1>' +
    '<p class="player-now-playing-subtitle" id="player-title-secondary" hidden></p>' +
    '<p class="player-status" id="player-status" hidden></p>' +
    '<button type="button" class="btn player-retry-btn" id="btn-playback-retry" hidden tabindex="0">Retry</button>' +
    '<p class="player-next-up" id="player-next-up" hidden></p>' +
    '</div>' +
    '<div class="player-taskbar" data-focus-zone="player-taskbar" data-focus-mode="sequential" data-focus-sequential-axis="horizontal">' +
    '<div class="player-transport-col">' +
    '<div class="player-transport-wing player-transport-wing--left">' +
    '<button type="button" class="player-control-pill player-control-pill--icon" id="btn-prev" tabindex="0" aria-label="Previous in queue">' + ICON_PREV + '</button>' +
    '<button type="button" class="player-control-pill player-control-pill--icon" id="btn-rewind" tabindex="0" aria-label="Rewind 10 seconds">' + ICON_REWIND + '</button>' +
    '</div>' +
    '<div class="player-transport-center">' +
    '<button type="button" class="player-control-pill player-control-pill--icon player-control-pill--play" id="btn-pause" tabindex="0" aria-label="Pause">' + ICON_PAUSE + '</button>' +
    '</div>' +
    '<div class="player-transport-wing player-transport-wing--right">' +
    '<button type="button" class="player-control-pill player-control-pill--icon" id="btn-forward" tabindex="0" aria-label="Forward 30 seconds">' + ICON_FORWARD + '</button>' +
    '<button type="button" class="player-control-pill player-control-pill--icon" id="btn-next" tabindex="0" aria-label="Next in queue">' + ICON_NEXT + '</button>' +
    '<button type="button" class="player-control-pill player-control-pill--icon player-control-pill--danger" id="btn-stop" tabindex="0" aria-label="Stop">' + ICON_STOP + '</button>' +
    '</div>' +
    '</div>' +
    '<div class="player-settings-col">' +
    '<button type="button" class="player-stream-pill player-stream-pill--icon" id="btn-player-quality" tabindex="0" aria-haspopup="dialog" aria-label="Quality">' +
    '<span class="player-stream-active-mark" id="mark-quality" hidden></span>' +
    ICON_QUALITY +
    '</button>' +
    '<button type="button" class="player-stream-pill player-stream-pill--icon" id="btn-audio" tabindex="0" aria-haspopup="dialog" aria-label="Audio">' +
    '<span class="player-stream-active-mark" id="mark-audio" hidden></span>' +
    ICON_AUDIO +
    '</button>' +
    '<button type="button" class="player-stream-pill player-stream-pill--icon" id="btn-player-subtitles" tabindex="0" aria-haspopup="dialog" aria-label="Subtitles">' +
    '<span class="player-stream-active-mark" id="mark-subtitles"></span>' +
    ICON_SUBTITLE +
    '</button>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '<div class="player-track-modal" id="player-track-modal" hidden>' +
    '<div class="player-track-modal-sheet" id="player-track-modal-sheet" data-focus-zone="player-menu" role="dialog" aria-modal="true" aria-labelledby="player-menu-title">' +
    '<p class="player-track-modal-title" id="player-menu-title"></p>' +
    '<div class="player-menu-list" id="player-menu-list"></div>' +
    '<div class="player-track-modal-footer">' +
    '<button type="button" class="btn btn-player-modal-cancel" id="btn-menu-cancel" tabindex="0">Cancel</button>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '<div class="player-info-panel" id="player-info-panel" hidden>' +
    '<p class="player-menu-title">Playback info</p>' +
    '<pre class="player-info-body" id="player-info-body"></pre>' +
    '</div>' +
    '<div class="player-autoplay-panel" id="player-autoplay-panel" hidden>' +
    '<p class="player-autoplay-text" id="player-autoplay-text">Up next in 5s</p>' +
    '<div class="player-autoplay-actions" data-cols="2">' +
    '<button class="btn btn-primary" id="btn-autoplay-play" tabindex="0">Play now</button>' +
    '<button class="btn" id="btn-autoplay-cancel" tabindex="0">Cancel</button>' +
    '</div></div>' +
    '<p class="player-hint" id="player-hint">Seek: focus timeline + ←→ · Red: subtitles · Blue: info</p>';
  root.appendChild(overlay);
  var detachFocus = attachFocusNav(overlay);

  refreshDebugFromEnvironment('player');
  ensureDebugOverlayOnTop();
  setDebugOverlayPlayerMode(true);
  tvLog('player', 'screen mounted', {
    ratingKey: params.ratingKey,
    offset: params.offset || 0
  });

  var session = null;
  var currentItem = null;
  var currentVersion = null;
  var currentProbe = null;
  var progressInterval = null;
  var fallbackState = createPlaybackFallbackState();
  var playbackRestartLock = createPlaybackRestartLock();
  var advancing = false;
  var destroyed = false;
  var playbackGeneration = 0;
  var awaitingPrepareOverlay = false;
  var playbackRetryVisible = false;
  var introMarkers = [];
  var creditMarkers = [];
  var skippedIntroMarkerKeys = {};
  var skippedCreditMarkerKeys = {};
  var skipPromptActive = false;
  var skipPromptKind = null;

  var playbackPrefs = getPlaybackPrefs();
  var selectedAudioId = params.audioStreamId;
  var selectedSubtitleId = params.subtitleStreamId;
  var subtitleOffset = params.subtitleOffset != null
    ? params.subtitleOffset
    : (playbackPrefs.subtitleOffsetMs || 0);
  var selectedQuality = normalizeQualityKey(playbackPrefs.quality || 'original');

  var audioTracks = [];
  var subtitleTracks = [];
  var graphicalSubtitleTracks = [];
  var qualityOptions = listProfiles();
  var playbackMode = 'unknown';
  var deviceInfo = { uhd: false, hdr10: false, dolbyVision: false };

  loadDeviceDisplay(function (info) {
    deviceInfo = info;
    if (currentItem) {
      currentProbe = probePlayback(currentItem, currentVersion, null, deviceInfo);
      if (isStrictDirectPlay() && currentProbe && !currentProbe.canDirectPlay) {
        setPlayerMessage(formatDirectPlayOnlyError(currentProbe));
      }
      if (infoPanelVisible) updateInfoPanel();
    }
  });

  var overlayVisible = true;
  var menuOpen = null;
  var infoPanelVisible = false;
  var scrubPreviewMs = null;
  var scrubPreviewSource = null;
  var scrubPreviewSourceKey = null;
  var scrubPreviewLoadGen = 0;
  var scrubPreviewApplyTimer = null;
  var scrubPreviewPendingMs = null;
  var overlayHideTimer = null;
  var overlayHideAfterFirstFrame = false;
  var firstFrameWaiters = [];
  var clientSubtitleDeferTimer = null;
  var seekCommitTimer = null;
  var seekCommitPendingMs = null;
  var autoplayCountdown = createAutoplayCountdown({
    setInterval: setInterval,
    clearInterval: clearInterval
  });
  var autoplayCancelled = false;
  var creditsAutoplayTriggered = false;
  var creditsAutoplayMarkerKey = null;

  var btnSkipIntroPrompt = document.getElementById('btn-skip-intro-prompt');
  var btnSkipIntroPromptText = btnSkipIntroPrompt
    ? btnSkipIntroPrompt.querySelector('.player-skip-intro-prompt-text')
    : null;
  var seekBar = document.getElementById('player-seek');
  var scrubPreviewEl = document.getElementById('player-scrub-preview');
  var scrubPreviewThumbEl = document.getElementById('player-scrub-preview-thumb');
  var scrubPreviewTimeEl = document.getElementById('player-scrub-preview-time');
  var trackModal = document.getElementById('player-track-modal');
  var menuReturnFocus = null;
  var infoPanel = document.getElementById('player-info-panel');
  var autoplayPanel = document.getElementById('player-autoplay-panel');
  var playbackErrorBanner = null;

  function ensurePlaybackErrorBanner() {
    if (playbackErrorBanner) return playbackErrorBanner;
    playbackErrorBanner = document.getElementById('player-playback-error');
    if (!playbackErrorBanner) {
      playbackErrorBanner = document.createElement('div');
      playbackErrorBanner.id = 'player-playback-error';
      playbackErrorBanner.className = 'player-playback-error hidden';
      playbackErrorBanner.setAttribute('role', 'alert');
      document.body.appendChild(playbackErrorBanner);
    }
    return playbackErrorBanner;
  }

  function clearPlaybackFailureUi() {
    overlay.classList.remove('player-overlay--playback-error');
    if (playbackErrorBanner) playbackErrorBanner.classList.add('hidden');
    var status = document.getElementById('player-status');
    if (status) status.classList.remove('player-status--error');
  }

  function showPlaybackFailure(err, context) {
    context = context || {};
    var message = formatPlaybackFailure(err, context);
    tvError('player', 'PLAYBACK FAILED', message);
    tvError('player', 'playback failure diagnostics', {
      stats: player.getPlaybackStats ? player.getPlaybackStats() : null,
      selectedQuality: selectedQuality,
      strategy: session && session.playbackStrategy || null,
      protocol: session && session.transcodeProtocol || null,
      requirementInfo: currentProbe && currentProbe.bitrateCheck ? currentProbe.bitrateCheck : null
    });
    refreshDebugFromEnvironment('playback-failure');
    ensureDebugOverlayOnTop();

    var banner = ensurePlaybackErrorBanner();
    banner.textContent = message;
    banner.classList.remove('hidden');

    var status = document.getElementById('player-status');
    if (status) {
      status.textContent = message;
      status.hidden = false;
      status.classList.add('player-status--error');
    }

    overlay.classList.add('player-overlay--playback-error');
    setOverlayVisible(true);
    clearOverlayHideTimer();
    showPlaybackRetry(true);
    awaitingPrepareOverlay = false;
    hideLoadingOverlay();
    hideBuffering();

    var retryBtn = document.getElementById('btn-playback-retry');
    if (retryBtn && document.activeElement !== retryBtn) {
      try { retryBtn.focus(); } catch (focusErr) { /* ignore */ }
    }
    return message;
  }

  function beginPrepareOverlay() {
    awaitingPrepareOverlay = true;
    showLoadingOverlay('Preparing playback…', 'loading');
  }

  function bumpPlaybackGeneration() {
    playbackGeneration += 1;
    clearDeferredClientSubtitle();
    resolveFirstFrameWaiters();
    return playbackGeneration;
  }

  function clearDeferredClientSubtitle() {
    if (clientSubtitleDeferTimer) {
      clearTimeout(clientSubtitleDeferTimer);
      clientSubtitleDeferTimer = null;
    }
  }

  function scheduleDeferredClientSubtitle(mode) {
    clearDeferredClientSubtitle();
    if (!shouldApplyClientSubtitleAfterPlay(mode)) return Promise.resolve();
    var gen = playbackGeneration;
    return waitForFirstFrame().then(function () {
      if (destroyed || isStalePlayback(gen)) return;
      return new Promise(function (resolve) {
        clientSubtitleDeferTimer = setTimeout(function () {
          clientSubtitleDeferTimer = null;
          if (destroyed || isStalePlayback(gen)) {
            resolve();
            return;
          }
          applyClientSubtitle().then(resolve, resolve);
        }, CLIENT_SUBTITLE_DEFER_MS);
      });
    });
  }

  function isStalePlayback(gen) {
    return isStalePlaybackGeneration(gen, playbackGeneration);
  }

  function withPlaybackRestartLock(work) {
    return playbackRestartLock.run(work);
  }

  function restartOffsetMs(fallbackMs) {
    var ms = player.getCurrentTimeMs();
    if (ms > 0) return ms;
    if (fallbackMs != null && fallbackMs > 0) return fallbackMs;
    return (session && session.offset) || params.offset || 0;
  }

  function activeTranscodeQualityKey() {
    if (requiresServerTranscode(selectedQuality)) {
      return selectedQuality;
    }
    return null;
  }

  function resolveFirstFrameWaiters() {
    var waiters = firstFrameWaiters;
    firstFrameWaiters = [];
    waiters.forEach(function (resolve) {
      resolve();
    });
  }

  function waitForFirstFrame() {
    return new Promise(function (resolve) {
      firstFrameWaiters.push(resolve);
    });
  }

  function chainPlaybackReady(promise, gen) {
    return promise.then(function (result) {
      if (destroyed || !result) return result;
      return waitForFirstFrame().then(function () {
        if (destroyed || isStalePlayback(gen)) return;
        return result;
      });
    });
  }

  function hidePrepareOverlayIfReady() {
    if (!awaitingPrepareOverlay) return;
    awaitingPrepareOverlay = false;
    hideLoadingOverlay();
  }

  function showPlaybackRetry(show) {
    playbackRetryVisible = !!show;
    var btn = document.getElementById('btn-playback-retry');
    if (btn) btn.hidden = !show;
  }

  function manualRetryPlayback() {
    if (!currentItem) return;
    return withPlaybackRestartLock(function () {
      showPlaybackRetry(false);
      clearPlaybackFailureUi();
      resetPlaybackFallbackFlags(fallbackState);
      setPlayerMessage('');
      var offset = restartOffsetMs();
      beginPrepareOverlay();
      bumpPlaybackGeneration();
      player.stop({ skipTimeline: true });
      return startPlayback(currentItem, offset);
    });
  }

  function applySubtitleAppearance() {
    var video = document.querySelector('video.native-player');
    if (!video) return;
    video.classList.remove('subtitle-size-s', 'subtitle-size-m', 'subtitle-size-l', 'subtitle-bg', 'subtitle-no-bg');
    var size = playbackPrefs.subtitleSize || 'm';
    video.classList.add('subtitle-size-' + size);
    if (playbackPrefs.subtitleBackground !== false) video.classList.add('subtitle-bg');
    else video.classList.add('subtitle-no-bg');
  }

  function getDurationMs() {
    var canonical = player.getCanonicalDurationMs && player.getCanonicalDurationMs();
    if (canonical > 0) return canonical;
    return player.getDurationMs() || (currentItem && currentItem.duration) || 1;
  }

  function isSeekScrubbing() {
    return scrubPreviewMs != null && seekBar && document.activeElement === seekBar;
  }

  function getScrubMs() {
    if (isSeekScrubbing()) return scrubPreviewMs;
    return player.getCurrentTimeMs();
  }

  function syncPlaybackProgressUi() {
    if (!isSeekScrubbing()) scrubPreviewMs = null;
    updateProgressUi();
  }

  function isTranscodePlayback() {
    return playbackMode === 'transcode-hls' || playbackMode === 'transcode-http';
  }

  function isStrictDirectPlay() {
    return isDirectPlayOnlyQuality(selectedQuality);
  }

  function canAutoFallback() {
    return allowsPlaybackFallback(selectedQuality);
  }

  function playbackFallbackContext(extra) {
    return Object.assign({
      pmsDeliveryProtocol: session && session.pmsDeliveryProtocol,
      commitToHlsDelivery: session && session.commitToHlsDelivery
    }, extra || {});
  }

  function seekToMs(ms) {
    var dur = getDurationMs();
    ms = Math.max(0, Math.min(ms, dur));
    if (isTranscodePlayback()) {
      return restartPlaybackAt(ms);
    }
    player.seekMs(ms);
    updateSeekUi(false);
    return Promise.resolve();
  }

  function clearOverlayHideTimer() {
    if (overlayHideTimer) {
      clearTimeout(overlayHideTimer);
      overlayHideTimer = null;
    }
  }

  function scheduleOverlayHide() {
    clearOverlayHideTimer();
    if (isMotionCursorVisible()) return;
    if (!overlayVisible || menuOpen || infoPanelVisible) return;
    if (autoplayPanel && !autoplayPanel.hidden) return;
    overlayHideTimer = setTimeout(function () {
      setOverlayVisible(false);
      focusSkipIntroPromptIfActive();
    }, OVERLAY_HIDE_MS);
  }

  function setOverlayVisible(visible) {
    overlayVisible = visible;
    overlay.classList.toggle('player-overlay--hidden', !visible);
    if (visible) {
      if (shouldScheduleOverlayHideWhenShowing(overlayHideAfterFirstFrame) && !isMotionCursorVisible()) {
        scheduleOverlayHide();
      }
    } else {
      clearOverlayHideTimer();
      closeMenu();
    }
    refreshSkipPromptChrome();
  }

  function focusSkipIntroPromptIfActive() {
    if (!skipPromptActive || overlayVisible || !btnSkipIntroPrompt || btnSkipIntroPrompt.hidden) return;
    btnSkipIntroPrompt.focus();
  }

  function focusOverlayDefault() {
    // When the toolbar comes up, land focus on the play/pause button so OK
    // toggles playback immediately — the most common action.
    var btn = document.getElementById('btn-pause');
    if (btn && !btn.hidden && (btn.offsetWidth > 0 || btn.offsetHeight > 0)) {
      btn.focus();
      if (document.activeElement === btn) return;
    }
    focusFirst(overlay.querySelector('.player-bottom') || overlay);
  }

  function toggleOverlayVisible() {
    setOverlayVisible(!overlayVisible);
    if (overlayVisible) {
      focusOverlayDefault();
    }
  }

  function loadTrackLists(item) {
    var media = (item.media && item.media[0]) || {};
    audioTracks = parseAudioStreams(media);
    subtitleTracks = parseSubtitleStreams(media);
    graphicalSubtitleTracks = parseSubtitleStreams(media, { includeGraphical: true })
      .filter(function (s) { return s.graphical; });
    if (selectedAudioId == null && audioTracks.length) {
      var selA = audioTracks.filter(function (a) { return a.selected; })[0];
      if (selA) selectedAudioId = selA.id;
    }
    if (selectedSubtitleId == null) {
      var defaultSub = pickDefaultSubtitleTrack(
        subtitleTracks.concat(graphicalSubtitleTracks)
      );
      if (defaultSub) selectedSubtitleId = defaultSub.id;
    }
    updateTrackButtonLabels();
  }

  function updateNowPlayingTitle(item) {
    var lines = formatPlaybackDisplay(item);
    var primary = document.getElementById('player-title-primary');
    var secondary = document.getElementById('player-title-secondary');
    if (primary) primary.textContent = lines.primary;
    if (secondary) {
      secondary.textContent = lines.secondary;
      secondary.hidden = !lines.secondary;
    }
  }

  function setPlayerMessage(message) {
    var status = document.getElementById('player-status');
    if (!status) return;
    if (message) {
      status.textContent = message;
      status.hidden = false;
      tvLog('player', 'status', message);
    } else {
      status.textContent = '';
      status.hidden = true;
      status.classList.remove('player-status--error');
    }
    if (message && playbackRetryVisible) return;
    if (!message) showPlaybackRetry(false);
  }

  function syncSubtitleDelayControls() {
    var panel = document.getElementById('player-subtitle-delay');
    if (!panel) return;
    var show = player.hasClientSubtitlesLoaded();
    panel.hidden = !show;
    if (!show) return;
    var val = document.getElementById('player-sub-delay-value');
    if (val) {
      val.textContent = (subtitleOffset >= 0 ? '+' : '') + subtitleOffset + ' ms';
    }
  }

  function adjustSubtitleOffset(deltaMs) {
    subtitleOffset += deltaMs;
    setPlaybackPrefs({ subtitleOffsetMs: subtitleOffset });
    if (session) session.subtitleOffset = subtitleOffset;
    syncSubtitleDelayControls();
    return applyClientSubtitle();
  }

  function formatQualityPillLabel() {
    var prof = getProfile(selectedQuality);
    var media = (currentItem && currentItem.media && currentItem.media[0]) || {};
    var ver = currentVersion || {};
    var res = ver.videoResolution || media.videoResolution || '';
    var name = prof.label || selectedQuality;
    if (selectedQuality === 'original') {
      name = formatOriginalQualityLabel(
        ver.bitrate || media.bitrate || 0,
        ver.videoResolution || media.videoResolution || ''
      );
    } else {
      var short = (prof.label || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
      if (short) name = short;
    }
    if (res && name.indexOf(res) < 0) return name + ' | ' + res;
    return name;
  }

  function formatAudioPillLabel() {
    var track = audioTracks.filter(function (t) { return t.id === selectedAudioId; })[0];
    if (!track) return audioTracks.length ? 'Audio' : '—';
    return track.language || track.title || 'Audio';
  }

  function formatSubtitlePillLabel() {
    if (selectedSubtitleId == null) return 'Off';
    var track = findSubtitleTrack(subtitleTracks.concat(graphicalSubtitleTracks), selectedSubtitleId);
    if (!track) return 'Subtitles';
    return subtitleDisplayTitle(track);
  }

  function updateTrackButtonLabels() {
    var btnAudio = document.getElementById('btn-audio');
    var btnSubs = document.getElementById('btn-player-subtitles');
    var markSubs = document.getElementById('mark-subtitles');
    if (btnAudio) {
      btnAudio.setAttribute('aria-label', 'Audio: ' + formatAudioPillLabel());
    }
    if (btnSubs) {
      var subsOn = selectedSubtitleId != null;
      btnSubs.classList.toggle('player-stream-pill--on', subsOn);
      if (markSubs) markSubs.hidden = !subsOn;
      btnSubs.setAttribute('aria-label', 'Subtitles: ' + formatSubtitlePillLabel());
    }
    var btnQuality = document.getElementById('btn-player-quality');
    if (btnQuality) {
      btnQuality.setAttribute('aria-label', 'Quality: ' + formatQualityPillLabel());
    }
    syncSubtitleDelayControls();
  }

  function setPlayerBottomFocusable(enabled) {
    var bottom = overlay.querySelector('.player-bottom');
    if (!bottom) return;
    bottom.querySelectorAll(focusableSelector).forEach(function (el) {
      if (enabled) {
        if (el.dataset.prevTabindex != null) {
          if (el.dataset.prevTabindex === '') el.removeAttribute('tabindex');
          else el.tabIndex = parseInt(el.dataset.prevTabindex, 10);
          delete el.dataset.prevTabindex;
        }
      } else {
        el.dataset.prevTabindex = el.hasAttribute('tabindex') ? String(el.tabIndex) : '';
        el.tabIndex = -1;
      }
    });
  }

  function shouldTrapPlayerChromeFocus() {
    return !!(menuOpen || infoPanelVisible ||
      (autoplayPanel && !autoplayPanel.hidden));
  }

  var wasPlayingBeforeModal = null;

  function syncPlaybackPausedForModal() {
    if (shouldTrapPlayerChromeFocus()) {
      if (wasPlayingBeforeModal === null) {
        wasPlayingBeforeModal = !player.isPaused();
        if (wasPlayingBeforeModal) {
          player.pause();
          updatePauseButton();
        }
      }
      return;
    }
    if (wasPlayingBeforeModal === null) return;
    if (wasPlayingBeforeModal) {
      player.resume();
      updatePauseButton();
      syncPlaybackProgressUi();
    }
    wasPlayingBeforeModal = null;
  }

  function syncPlayerChromeFocusable() {
    setPlayerBottomFocusable(!shouldTrapPlayerChromeFocus());
    syncPlaybackPausedForModal();
  }

  function onTrackModalKeyDown(e) {
    if (!menuOpen) return;
    var key = e.keyCode;
    if (key !== 38 && key !== 40) return;
    // Always swallow arrow keys when the modal is open — prevents attachFocusNav
    // from moving focus into the background player controls.
    e.preventDefault();
    e.stopImmediatePropagation();
    var listEl = document.getElementById('player-menu-list');
    var navItems = [];
    if (listEl) {
      navItems = Array.prototype.slice.call(listEl.querySelectorAll('.player-menu-option'));
    }
    var cancelBtn = document.getElementById('btn-menu-cancel');
    if (cancelBtn) navItems.push(cancelBtn);
    if (!navItems.length) return;

    var active = document.activeElement;
    var idx = navItems.indexOf(active);
    if (idx < 0) {
      // Focus escaped the modal — snap back to the active item or first item.
      var fallback = listEl && listEl.querySelector('.player-menu-option--active');
      if (!fallback && navItems.length) fallback = navItems[0];
      if (fallback) fallback.focus();
      return;
    }

    var nextIdx = key === 40
      ? Math.min(navItems.length - 1, idx + 1)
      : Math.max(0, idx - 1);
    if (nextIdx === idx) return;
    navItems[nextIdx].focus();
    scrollFocusedIntoView(navItems[nextIdx]);
  }

  function closeMenu() {
    menuOpen = null;
    overlay.classList.remove('player-overlay--track-modal');
    if (trackModal) trackModal.hidden = true;
    syncPlayerChromeFocusable();
    if (menuReturnFocus && menuReturnFocus.focus) {
      try { menuReturnFocus.focus(); } catch (err) { /* ignore */ }
    }
    menuReturnFocus = null;
    scheduleOverlayHide();
    refreshSkipPromptChrome();
  }

  function clearCreditsButtonFill() {
    if (!btnSkipIntroPrompt) return;
    btnSkipIntroPrompt.classList.remove('player-skip-intro-prompt--credits-countdown');
    btnSkipIntroPrompt.style.removeProperty('--credits-fill-duration');
  }

  function applyCreditsButtonFill() {
    if (!btnSkipIntroPrompt || skipPromptKind !== 'credit') return;
    btnSkipIntroPrompt.classList.add('player-skip-intro-prompt--credits-countdown');
    btnSkipIntroPrompt.style.setProperty(
      '--credits-fill-duration',
      AUTOPLAY_COUNTDOWN_SEC + 's'
    );
  }

  function clearAutoplayCountdown() {
    autoplayCountdown.clear();
    clearCreditsButtonFill();
    if (autoplayPanel) autoplayPanel.hidden = true;
    syncPlayerChromeFocusable();
  }

  function resetCreditsAutoplayState() {
    creditsAutoplayTriggered = false;
    creditsAutoplayMarkerKey = null;
  }

  function maybeStartCreditsAutoplay(activeCredit) {
    if (!shouldTriggerAutoplayOnCreditPrompt({
      hasNextQueueItem: queue.hasNext(),
      autoplayCancelled: autoplayCancelled,
      hasCreditMarkers: creditMarkers.length > 0,
      skipPromptKind: 'credit'
    })) return;

    var key = activeCredit ? markerKey(activeCredit) : '';
    if (!key) return;
    if (creditsAutoplayMarkerKey === key &&
      (autoplayCountdown.isRunning() || creditsAutoplayTriggered)) {
      if (skipPromptKind === 'credit') applyCreditsButtonFill();
      return;
    }

    creditsAutoplayMarkerKey = key;
    creditsAutoplayTriggered = true;
    startAutoplayCountdown(AUTOPLAY_COUNTDOWN_SEC, { fromCredits: true });
  }

  function startAutoplayCountdown(seconds, options) {
    options = options || {};
    if (!queue.hasNext() || autoplayCancelled) return;
    clearAutoplayCountdown();
    if (options.fromCredits) applyCreditsButtonFill();
    else clearCreditsButtonFill();

    var nextItem = queue.peekNext();
    var textEl = document.getElementById('player-autoplay-text');
    if (autoplayPanel) autoplayPanel.hidden = false;
    syncPlayerChromeFocusable();
    setOverlayVisible(true);
    clearOverlayHideTimer();
    function renderCountdown(remaining) {
      if (!textEl) return;
      var label = queue.formatNextUpLabel(nextItem);
      textEl.textContent = 'Up next in ' + remaining + 's' +
        (label ? ' — ' + label : '');
    }
    autoplayCountdown.start(seconds, {
      onTick: renderCountdown,
      onComplete: function () {
        if (autoplayPanel) autoplayPanel.hidden = true;
        clearCreditsButtonFill();
        playNextInQueue();
      }
    });
  }

  function toggleInfoPanel() {
    infoPanelVisible = !infoPanelVisible;
    if (!infoPanel) return;
    if (infoPanelVisible) {
      closeMenu();
      setOverlayVisible(true);
      clearOverlayHideTimer();
      infoPanel.hidden = false;
      updateInfoPanel();
    } else {
      infoPanel.hidden = true;
      scheduleOverlayHide();
    }
    syncPlayerChromeFocusable();
  }

  function formatPlaybackModeLabel(mode) {
    if (mode === 'direct') return 'Direct Play (progressive file)';
    if (mode === 'direct-stream') return 'Direct Stream (HLS remux)';
    if (mode === 'transcode-hls') return 'Transcode (HLS)';
    if (mode === 'transcode-http') return 'Transcode (HTTP)';
    return 'Unknown';
  }

  function updateInfoPanel() {
    var body = document.getElementById('player-info-body');
    if (!body) return;
    var stats = player.getPlaybackStats();
    var ver = currentVersion || {};
    var media = (currentItem && currentItem.media && currentItem.media[0]) || {};
    var lines = [];
    lines.push('Mode: ' + formatPlaybackModeLabel(stats.mode || playbackMode));
    if (stats.videoWidth && stats.videoHeight) {
      lines.push('Resolution: ' + stats.videoWidth + '×' + stats.videoHeight);
    } else if (ver.videoResolution || media.videoResolution) {
      lines.push('Resolution: ' + (ver.videoResolution || media.videoResolution));
    }
    if (ver.container || media.container) lines.push('Container: ' + (ver.container || media.container));
    if (ver.videoCodec || media.videoCodec) lines.push('Video: ' + (ver.videoCodec || media.videoCodec));
    if (ver.audioCodec || media.audioCodec) lines.push('Audio: ' + (ver.audioCodec || media.audioCodec));
    var bitrate = ver.bitrate || media.bitrate;
    if (bitrate) lines.push('Source bitrate: ~' + Math.round(bitrate / 1000) + ' Mbps');
    if (isStrictDirectPlay()) lines.push('Quality: original file only (no remux/transcode fallback)');
    else if (selectedQuality === 'original') {
      lines.push('Quality: Original (direct → remux → transcode)');
    } else {
      var qProf = getProfile(selectedQuality);
      if (qProf && qProf.label) lines.push('Quality: ' + qProf.label);
    }
    if (stats.mode === 'direct-stream') {
      lines.push('Stream: HLS remux — codecs copied, container repackaged (not full transcode)');
    } else if (stats.mode === 'transcode-hls' || stats.mode === 'transcode-http') {
      lines.push('Stream: server transcode session' + (stats.isHls ? ' (HLS)' : ' (HTTP)'));
    } else if (stats.mode === 'direct') {
      lines.push('Stream: progressive file from Plex (no server transcode)');
    }
    if (currentProbe && currentProbe.warnings.length) {
      lines.push('Notes: ' + currentProbe.warnings.join('; '));
    }
    var sub = findSubtitleTrack(subtitleTracks.concat(graphicalSubtitleTracks), selectedSubtitleId);
    if (selectedSubtitleId == null) lines.push('Subtitles: Off');
    else if (sub) {
      var subNote = sub.graphical
        ? ' (burned via transcode)'
        : (canUseClientSubtitles(playbackMode, sub) ? ' (client SRT)' : ' (server transcode)');
      lines.push('Subtitles: ' + sub.title + subNote);
    }
    body.textContent = lines.join('\n');
  }

  function isGraphicalSubtitleSelected() {
    var t = findSubtitleTrack(graphicalSubtitleTracks, selectedSubtitleId);
    return !!t;
  }

  function selectedTextSubtitleTrack() {
    return findSubtitleTrack(subtitleTracks, selectedSubtitleId);
  }

  function shouldApplyClientSubtitleAfterPlay(mode) {
    if (selectedSubtitleId == null || isGraphicalSubtitleSelected()) return false;
    if (session && session.subtitleBurnIn) return false;
    return canUseClientSubtitles(mode, selectedTextSubtitleTrack());
  }

  function sessionSubtitleBurnIn() {
    return selectedSubtitleId != null && isGraphicalSubtitleSelected();
  }

  function hasSelectedTextSubtitle() {
    return selectedSubtitleId != null && !isGraphicalSubtitleSelected();
  }

  function shouldPreferRemuxForSubtitles() {
    if (!hasSelectedTextSubtitle() || isStrictDirectPlay()) return false;
    return allowsPlaybackFallback(selectedQuality);
  }

  function applyRemuxStrategyForSubtitles(opts) {
    if (!opts || !shouldPreferRemuxForSubtitles()) return opts;
    if (opts.playbackStrategy === 'direct' || opts.playbackStrategy == null) {
      opts.playbackStrategy = 'direct-stream';
      opts.forceTranscode = false;
      opts.transcodeProtocol = 'hls';
    }
    return opts;
  }

  function applyClientSubtitle() {
    if (!session || selectedSubtitleId == null) return Promise.resolve();
    var track = selectedTextSubtitleTrack();
    if (!canUseClientSubtitles(playbackMode, track)) return Promise.resolve();
    var subtitleSession = Object.assign({}, session, {
      playbackOffsetMs: restartOffsetMs()
    });
    return prepareClientSubtitlePlayback(server, subtitleSession, track, playbackMode)
      .then(function () {
        var subtitleAttempts = buildSubtitleFetchPlan(server, subtitleSession, track, {
          playbackMode: playbackMode
        });
        if (!subtitleAttempts.length) {
          return Promise.reject(new Error('Could not build subtitle URL'));
        }
        return player.loadClientSubtitleFromUrls(subtitleAttempts, subtitleOffset);
      }).then(function () {
      if (destroyed) return;
      syncSubtitleDelayControls();
    }).catch(function (err) {
      if (destroyed) return Promise.reject(err);
      syncSubtitleDelayControls();
      console.warn('Client subtitles failed:', err.message);
      var detail = err && err.message ? ' (' + err.message + ')' : '';
      if (isStrictDirectPlay()) {
        setPlayerMessage(
          'Subtitles unavailable in Original quality' + detail +
            '. Switch to Original quality for embedded subtitles, or pick image subtitles (burn-in).'
        );
        return Promise.resolve();
      }
      if (playbackMode === 'direct-stream') {
        setPlayerMessage(
          'Subtitles could not be loaded' + detail + '. Playback continues without subtitles.'
        );
        return Promise.resolve();
      }
      if (playbackMode === 'transcode-hls' || playbackMode === 'transcode-http') {
        setPlayerMessage('Client subtitles unavailable' + detail + ' — burning subtitles into the stream…');
        return restartPlaybackAt(restartOffsetMs(), null, 'subtitle-burn');
      }
      if (isDirectPlaybackMode(playbackMode)) {
        setPlayerMessage(
          'Subtitles unavailable' + detail + '. Playback continues without subtitles.'
        );
        return Promise.resolve();
      }
      setPlayerMessage('Subtitles unavailable' + detail + '.');
      return Promise.resolve();
    });
  }

  function openMenu(kind) {
    menuOpen = kind;
    menuReturnFocus = document.activeElement;
    if (infoPanel) infoPanel.hidden = true;
    infoPanelVisible = false;
    setOverlayVisible(true);
    var titleEl = document.getElementById('player-menu-title');
    var listEl = document.getElementById('player-menu-list');
    if (!trackModal || !listEl) return;
    trackModal.hidden = false;
    overlay.classList.add('player-overlay--track-modal');
    syncPlayerChromeFocusable();
    listEl.innerHTML = '';
    listEl.scrollTop = 0;
    var options = [];
    if (kind === 'audio') {
      if (titleEl) titleEl.textContent = 'Audio';
      if (!audioTracks.length) {
        listEl.innerHTML = '<p class="player-menu-empty">No alternate audio tracks</p>';
      } else {
        audioTracks.forEach(function (t) {
          options.push({ kind: 'audio', id: t.id, label: t.title, selected: t.id === selectedAudioId });
        });
      }
    } else if (kind === 'subtitles') {
      if (titleEl) titleEl.textContent = 'Subtitles';
      options.push({ kind: 'subtitle', id: null, label: 'Off', selected: selectedSubtitleId == null });
      subtitleTracks.forEach(function (t) {
        options.push({
          kind: 'subtitle',
          id: t.id,
          label: subtitleMenuOptionLabel(t),
          selected: t.id === selectedSubtitleId
        });
      });
      graphicalSubtitleTracks.forEach(function (t) {
        options.push({
          kind: 'subtitle',
          id: t.id,
          label: subtitleMenuOptionLabel(t) + ' (image — transcode)',
          selected: t.id === selectedSubtitleId
        });
      });
    } else if (kind === 'quality') {
      if (titleEl) titleEl.textContent = 'Quality';
      var media = (currentItem && currentItem.media && currentItem.media[0]) || {};
      var ver = currentVersion || {};
      var srcBitrate = ver.bitrate || media.bitrate || 0;
      var srcRes = ver.videoResolution || media.videoResolution || '';
      var activeQualityKey = normalizeQualityKey(selectedQuality);
      qualityOptions.forEach(function (q) {
        var label = q.id === 'original'
          ? formatOriginalQualityLabel(srcBitrate, srcRes)
          : q.label;
        options.push({
          kind: 'quality',
          id: q.id,
          label: label,
          selected: q.id === activeQualityKey
        });
      });
    }
    options.forEach(function (opt) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn player-menu-option' + (opt.selected ? ' player-menu-option--active' : '');
      btn.textContent = opt.label + (opt.selected ? ' ✓' : '');
      btn.tabIndex = 0;
      btn.addEventListener('click', function () {
        applyMenuSelection(kind, opt.id);
      });
      listEl.appendChild(btn);
    });
    var cancelBtn = document.getElementById('btn-menu-cancel');
    var selectedBtn = listEl.querySelector('.player-menu-option--active');
    if (selectedBtn) {
      selectedBtn.focus();
      scrollFocusedIntoView(selectedBtn);
    } else if (cancelBtn) {
      cancelBtn.focus();
    } else {
      focusFirst(document.getElementById('player-track-modal-sheet'));
    }
    clearOverlayHideTimer();
  }

  function applyMenuSelection(kind, id) {
    if (kind === 'audio') {
      if (id === selectedAudioId) {
        closeMenu();
        return;
      }
      selectedAudioId = id;
      closeMenu();
      updateTrackButtonLabels();
      restartPlaybackAt(restartOffsetMs(), null, 'audio');
      return;
    }
    if (kind === 'subtitles') {
      if (id === selectedSubtitleId) {
        closeMenu();
        return;
      }
      var previousSubtitleId = selectedSubtitleId;
      selectedSubtitleId = id;
      closeMenu();
      updateTrackButtonLabels();
      if (id == null) {
        var hadBurnIn = session && session.subtitleBurnIn;
        var wasRemuxForSubs = playbackMode === 'direct-stream' && previousSubtitleId != null &&
          !findSubtitleTrack(graphicalSubtitleTracks, previousSubtitleId);
        player.clearSubtitles();
        syncSubtitleDelayControls();
        if (session) {
          session.subtitleStreamId = null;
          session.subtitleBurnIn = false;
        }
        if (hadBurnIn || wasRemuxForSubs) {
          restartPlaybackAt(restartOffsetMs(), null, 'subtitle-off');
        }
        return;
      }
      var track = findSubtitleTrack(subtitleTracks.concat(graphicalSubtitleTracks), id);
      if (track && shouldBurnInSubtitle(track)) {
        restartPlaybackAt(restartOffsetMs(), null, 'subtitle-burn');
        return;
      }
      if (canUseClientSubtitles(playbackMode, track)) {
        var switchingFromBurnIn = session && session.subtitleBurnIn;
        var needsRemux = playbackMode === 'direct' && shouldPreferRemuxForSubtitles();
        if (session) {
          session.subtitleStreamId = id;
          session.subtitleBurnIn = false;
        }
        if (switchingFromBurnIn) {
          restartPlaybackAt(restartOffsetMs(), null, 'subtitle-soft');
          return;
        }
        if (needsRemux) {
          restartPlaybackAt(restartOffsetMs(), 'hls', 'subtitle-remux');
          return;
        }
        applyClientSubtitle();
        return;
      }
      restartPlaybackAt(restartOffsetMs(), null, 'subtitle');
      return;
    }
    if (kind === 'quality') {
      if (id === selectedQuality) {
        closeMenu();
        return;
      }
      selectedQuality = id;
      setPlaybackPrefs({ quality: selectedQuality });
      if (currentItem) {
        currentProbe = probePlayback(currentItem, currentVersion, null, deviceInfo);
      }
      closeMenu();
      updateTrackButtonLabels();
      restartPlaybackAt(restartOffsetMs(), null, 'quality');
      return;
    }
  }



  function handlePlayerBack(e) {
    if (e.keyCode !== KEYS.BACK && e.key !== 'GoBack' && e.keyCode !== 8) return;
    if (menuOpen) {
      closeMenu();
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if (infoPanelVisible) {
      toggleInfoPanel();
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if (autoplayCountdown.isRunning()) {
      clearAutoplayCountdown();
      autoplayCancelled = true;
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if (overlayVisible) {
      setOverlayVisible(false);
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    exitPlayer();
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function onOverlayActivity() {
    if (isMotionCursorVisible()) return;
    if (overlayVisible) scheduleOverlayHide();
  }

  player.onBuffering(function (show) {
    if (show) {
      tvLog('playback', 'buffering');
      showBuffering('Buffering…');
    } else {
      hideBuffering();
    }
  });

  player.onRebufferTimeout(function () {
    if (destroyed || !session) return;
    tvError('player', 'rebuffer timeout', { playbackMode: playbackMode, quality: activeTranscodeQualityKey() });
    if (!canAutoFallback()) {
      setPlayerMessage(formatDirectPlayOnlyError(currentProbe) +
        ' Buffering with no transcode fallback.');
      return;
    }
    var rebufferStep = decideRebufferFallback(fallbackState, playbackFallbackContext({
      playbackMode: playbackMode,
      transcodeProtocol: session.transcodeProtocol
    }));
    tvError('player', 'rebuffer fallback', { action: rebufferStep.action });
    if (rebufferStep.action === 'full-transcode') {
      setPlayerMessage('Stream copy stalled — transcoding…');
      retryTranscode('hls', restartOffsetMs(params.offset), 'full-transcode-fallback');
      return;
    }
    if (rebufferStep.action === 'http-transcode') {
      setPlayerMessage('Slow buffering — switching to HTTP transcode…');
      restartPlaybackAt(restartOffsetMs(params.offset), 'http', 'http-transcode-fallback');
      return;
    }
    setPlayerMessage('Slow buffering — check network or lower quality in Settings.');
  });

  function updateNextUpUi() {
    var el = document.getElementById('player-next-up');
    if (!el) return;
    var nextItem = queue.peekNext();
    if (nextItem && queue.isAutoplayQueue()) {
      el.textContent = 'Up next: ' + queue.formatNextUpLabel(nextItem);
      el.hidden = false;
    } else {
      el.textContent = '';
      el.hidden = true;
    }
    updateQueueControls();
  }

  function updateQueueControls() {
    var btnPrev = document.getElementById('btn-prev');
    var btnNext = document.getElementById('btn-next');
    var hasPrev = queue.hasPrevious && queue.hasPrevious();
    var hasNext = queue.hasNext();
    if (btnPrev) btnPrev.disabled = !hasPrev;
    if (btnNext) btnNext.disabled = !hasNext;
  }

  function refreshSkipPromptChrome() {
    var showChrome = skipPromptActive && !menuOpen;
    if (btnSkipIntroPrompt) btnSkipIntroPrompt.hidden = !showChrome;
    overlay.classList.toggle('player-overlay--skip-intro-active', showChrome);
    if (showChrome) focusSkipIntroPromptIfActive();
  }

  function setSkipPromptVisible(show, kind) {
    skipPromptActive = show;
    skipPromptKind = show ? (kind || null) : null;
    if (btnSkipIntroPromptText) {
      btnSkipIntroPromptText.textContent = kind === 'credit' ? 'Skip Credits' : 'Skip Intro';
    }
    if (btnSkipIntroPrompt) {
      btnSkipIntroPrompt.setAttribute(
        'aria-label',
        kind === 'credit'
          ? 'Skip credits. Press OK to confirm.'
          : 'Skip intro. Press OK to confirm.'
      );
    }
    refreshSkipPromptChrome();
    if (show && kind === 'credit') {
      maybeStartCreditsAutoplay(
        findActiveCreditMarker(creditMarkers, player.getCurrentTimeMs())
      );
    } else if (kind !== 'credit') {
      clearCreditsButtonFill();
    }
  }

  function skipIntro() {
    var active = findActiveIntroMarker(introMarkers, player.getCurrentTimeMs());
    if (!active || skippedIntroMarkerKeys[markerKey(active)]) return;
    skippedIntroMarkerKeys[markerKey(active)] = true;
    setSkipPromptVisible(false);
    seekToMs(introSkipTargetMs(active));
  }

  function skipCredits() {
    var active = findActiveCreditMarker(creditMarkers, player.getCurrentTimeMs());
    if (!active || skippedCreditMarkerKeys[markerKey(active)]) return;
    skippedCreditMarkerKeys[markerKey(active)] = true;
    setSkipPromptVisible(false);
    seekToMs(creditSkipTargetMs(active));
  }

  function skipActiveMarker() {
    if (skipPromptKind === 'credit') skipCredits();
    else skipIntro();
  }

  function updateMarkerSkipUi() {
    var activeIntro = introMarkers.length
      ? findActiveIntroMarker(introMarkers, player.getCurrentTimeMs())
      : null;
    if (activeIntro && !skippedIntroMarkerKeys[markerKey(activeIntro)]) {
      setSkipPromptVisible(true, 'intro');
      return;
    }
    var activeCredit = creditMarkers.length
      ? findActiveCreditMarker(creditMarkers, player.getCurrentTimeMs())
      : null;
    if (activeCredit && !skippedCreditMarkerKeys[markerKey(activeCredit)]) {
      setSkipPromptVisible(true, 'credit');
      return;
    }
    setSkipPromptVisible(false);
  }

  function markMarkersSkippedBeforeOffset(offsetMs) {
    introMarkers.forEach(function (m) {
      if (offsetMs >= m.endMs) skippedIntroMarkerKeys[markerKey(m)] = true;
    });
    creditMarkers.forEach(function (m) {
      if (offsetMs >= m.endMs) skippedCreditMarkerKeys[markerKey(m)] = true;
    });
  }

  function scrubPreviewCacheKey() {
    if (!currentItem) return '';
    return String(currentItem.ratingKey || '') + ':' + String((currentVersion && currentVersion.partId) || '');
  }

  function resetScrubPreviewSource() {
    scrubPreviewSource = null;
    scrubPreviewSourceKey = null;
    scrubPreviewLoadGen += 1;
  }

  function clearScrubPreviewApplyTimer() {
    if (scrubPreviewApplyTimer) {
      clearTimeout(scrubPreviewApplyTimer);
      scrubPreviewApplyTimer = null;
    }
    scrubPreviewPendingMs = null;
  }

  function hideScrubPreview() {
    clearScrubPreviewApplyTimer();
    if (scrubPreviewEl) scrubPreviewEl.hidden = true;
    if (scrubPreviewThumbEl) {
      scrubPreviewThumbEl.style.backgroundImage = '';
      scrubPreviewThumbEl.style.backgroundPosition = '';
      scrubPreviewThumbEl.style.backgroundSize = '';
      scrubPreviewThumbEl.innerHTML = '';
    }
  }

  function positionScrubPreview(pct) {
    if (!scrubPreviewEl || !seekBar) return;
    var track = seekBar.querySelector('.player-seek-track');
    var trackWidth = track ? track.offsetWidth : seekBar.offsetWidth;
    var previewWidth = scrubPreviewEl.offsetWidth || 0;
    var thumbX = (pct / 100) * trackWidth;
    var left = Math.max(0, Math.min(trackWidth - previewWidth, thumbX - previewWidth / 2));
    scrubPreviewEl.style.left = left + 'px';
  }

  function applyScrubPreviewVisual(preview, pct) {
    if (!scrubPreviewEl || !scrubPreviewTimeEl) return;
    scrubPreviewEl.hidden = false;
    scrubPreviewTimeEl.textContent = formatTime(preview.timeMs);
    positionScrubPreview(pct);
    if (!scrubPreviewThumbEl) return;
    if (preview.mode === 'sprite' || preview.mode === 'image') {
      scrubPreviewThumbEl.hidden = false;
      if (preview.mode === 'sprite') {
        scrubPreviewThumbEl.innerHTML = '';
        scrubPreviewThumbEl.style.backgroundImage = 'url("' + preview.imageUrl + '")';
        scrubPreviewThumbEl.style.backgroundPosition = preview.backgroundPosition;
        scrubPreviewThumbEl.style.backgroundSize = preview.backgroundSize;
      } else {
        scrubPreviewThumbEl.style.backgroundImage = '';
        scrubPreviewThumbEl.style.backgroundPosition = '';
        scrubPreviewThumbEl.style.backgroundSize = '';
        scrubPreviewThumbEl.innerHTML = '';
        var img = document.createElement('img');
        img.alt = '';
        img.decoding = 'async';
        img.src = preview.imageUrl;
        scrubPreviewThumbEl.appendChild(img);
      }
      return;
    }
    scrubPreviewThumbEl.hidden = true;
    scrubPreviewThumbEl.style.backgroundImage = '';
    scrubPreviewThumbEl.style.backgroundPosition = '';
    scrubPreviewThumbEl.style.backgroundSize = '';
    scrubPreviewThumbEl.innerHTML = '';
  }

  function scheduleScrubPreviewApply(offsetMs, pct) {
    scrubPreviewPendingMs = offsetMs;
    if (scrubPreviewApplyTimer) return;
    scrubPreviewApplyTimer = setTimeout(function () {
      scrubPreviewApplyTimer = null;
      var ms = scrubPreviewPendingMs;
      scrubPreviewPendingMs = null;
      if (ms == null || scrubPreviewMs == null) return;
      var preview = resolveScrubPreview(scrubPreviewSource, ms, getDurationMs());
      applyScrubPreviewVisual(preview, pct);
    }, SCRUB_PREVIEW_APPLY_MS);
  }

  function ensureScrubPreviewSource() {
    var state = getState();
    var server = state.server;
    if (!server || !currentItem) return;
    var key = scrubPreviewCacheKey();
    if (scrubPreviewSource && scrubPreviewSourceKey === key) return;
    scrubPreviewSourceKey = key;
    var gen = ++scrubPreviewLoadGen;
    loadScrubPreviewSource(server, currentItem, currentVersion).then(function (source) {
      if (gen !== scrubPreviewLoadGen || destroyed) return;
      scrubPreviewSource = source;
      if (scrubPreviewMs != null) updateSeekUi(true);
    });
  }

  function updateScrubPreviewUi(scrubbing, cur, dur) {
    if (!scrubbing || scrubPreviewMs == null) {
      hideScrubPreview();
      return;
    }
    var pct = dur > 0 ? Math.min(100, Math.max(0, (cur / dur) * 100)) : 0;
    ensureScrubPreviewSource();
    if (!scrubPreviewSource) {
      applyScrubPreviewVisual(resolveScrubPreview(null, cur, dur), pct);
      return;
    }
    scheduleScrubPreviewApply(cur, pct);
  }

  function updateSeekUi(scrubbing) {
    var dur = getDurationMs();
    var cur = getScrubMs();
    var pct = dur > 0 ? Math.min(100, Math.max(0, (cur / dur) * 100)) : 0;
    var fill = document.getElementById('progress-fill');
    var thumb = document.getElementById('seek-thumb');
    if (fill) fill.style.width = pct + '%';
    if (thumb) thumb.style.left = pct + '%';
    if (seekBar) {
      seekBar.classList.toggle('player-seek-bar--scrubbing', !!scrubbing);
      seekBar.setAttribute('aria-valuenow', String(Math.round(pct)));
    }
    var elapsedEl = document.getElementById('player-time-elapsed');
    var totalEl = document.getElementById('player-time-total');
    if (elapsedEl) elapsedEl.textContent = formatTime(cur);
    if (totalEl) totalEl.textContent = formatTime(dur);
    if (seekBar) {
      seekBar.setAttribute('aria-valuetext', formatTime(cur) + ' of ' + formatTime(dur));
    }
    updateScrubPreviewUi(scrubbing, cur, dur);
    updateMarkerSkipUi();
  }

  function updateProgressUi() {
    updateSeekUi(isSeekScrubbing());
  }

  function ensurePlaybackProgressUiSync() {
    var video = player.getVideoElement();
    if (!video || video.getAttribute('data-xplay-progress-sync') === '1') return;
    video.setAttribute('data-xplay-progress-sync', '1');
    video.addEventListener('playing', function () {
      if (destroyed) return;
      syncPlaybackProgressUi();
    });
    video.addEventListener('seeked', function () {
      if (destroyed || isSeekScrubbing()) return;
      syncPlaybackProgressUi();
    });
  }

  function updatePauseButton() {
    var btn = document.getElementById('btn-pause');
    if (!btn) return;
    var paused = player.isPaused();
    btn.innerHTML = paused ? ICON_PLAY : ICON_PAUSE;
    btn.setAttribute('aria-label', paused ? 'Play' : 'Pause');
  }

  function playUrl(result, offset, playbackSession) {
    playbackSession = playbackSession || session;
    playbackMode = result.mode || 'unknown';
    tvLog('player', 'playUrl', {
      mode: playbackMode,
      offsetMs: offset,
      url: result.url && result.url.length > 120
        ? result.url.slice(0, 117) + '...'
        : result.url
    });
    var transcodeSession = parseTranscodeSessionFromUrl(result.url);
    if (transcodeSession) {
      playbackSession.transcodeSessionId = transcodeSession;
      if (playbackSession === session) session.transcodeSessionId = transcodeSession;
    }
    player.setPlaybackMode(playbackMode);
    player.play(result.url, playbackSession, { offset: offset, mode: playbackMode });
    applySubtitleAppearance();
    ensurePlaybackProgressUiSync();
    if (!progressInterval) {
      progressInterval = setInterval(function () {
        updateProgressUi();
        updatePauseButton();
        if (infoPanelVisible) updateInfoPanel();
      }, 500);
    }
    updatePauseButton();
    syncPlaybackProgressUi();
  }

  function tryPlayback(offset, gen) {
    if (gen == null) gen = playbackGeneration;
    var playbackSession = session;
    if (!playbackSession) return Promise.resolve();
    return resolveStreamUrl(playbackSession).then(function (result) {
      if (destroyed || isStalePlayback(gen) || session !== playbackSession) return;
      playUrl(result, offset, playbackSession);
      return result;
    }).catch(function (err) {
      if (destroyed || isStalePlayback(gen)) return;
      showPlaybackFailure(err, { phase: 'Stream URL' });
    });
  }

  function sessionQualityForPlay() {
    if (selectedQuality === 'original') return 'original';
    return selectedQuality;
  }

  function initialPlaybackStrategy(probe, forceTranscode) {
    if (isStrictDirectPlay()) return 'direct';
    var quality = sessionQualityForPlay();
    if (requiresServerTranscode(quality)) return 'transcode';
    if (forceTranscode) return 'transcode';
    if (selectedQuality === 'original' && probe) {
      if (!probe.canDirectPlay && !probe.canDirectStream) return 'transcode';
      if (!probe.canDirectPlay && probe.canDirectStream) return 'direct-stream';
    }
    return 'direct';
  }

  function subtitleBurnSessionFlags() {
    var burnIn = sessionSubtitleBurnIn();
    if (!burnIn && !(session && session.subtitleBurnIn)) return { burnIn: false, advancedBurn: false };
    var track = findSubtitleTrack(
      subtitleTracks.concat(graphicalSubtitleTracks),
      selectedSubtitleId
    );
    return {
      burnIn: true,
      advancedBurn: !!(track && isAdvancedSubtitleCodec(track))
    };
  }

  function buildSessionOptions(offset, protocol, streamChange) {
    var burnFlags = subtitleBurnSessionFlags();
    var opts = {
      offset: offset,
      audioStreamId: selectedAudioId,
      subtitleStreamId: selectedSubtitleId,
      subtitleOffset: subtitleOffset,
      subtitleBurnIn: burnFlags.burnIn,
      subtitleAdvancedBurn: burnFlags.advancedBurn,
      quality: sessionQualityForPlay(),
      forceTranscode: params.forceTranscode || (session && session.forceTranscode),
      transcodeProtocol: protocol || (session && session.transcodeProtocol) || 'hls'
    };
    if (session && session.playbackSessionId) {
      opts.playbackSessionId = session.playbackSessionId;
    }
    if (streamChange === 'direct-stream-fallback' || streamChange === 'subtitle-remux') {
      opts.playbackStrategy = 'direct-stream';
      opts.forceTranscode = false;
      opts.transcodeProtocol = 'hls';
      return opts;
    }
    if (streamChange === 'direct-no-subs-fallback') {
      opts.subtitleStreamId = null;
      opts.subtitleOffset = 0;
      opts.subtitleBurnIn = false;
      opts.playbackStrategy = 'direct';
      opts.forceTranscode = false;
      opts.transcodeProtocol = 'hls';
      return opts;
    }
    if (streamChange === 'full-transcode-fallback') {
      opts.playbackStrategy = 'transcode';
      opts.forceTranscode = true;
      opts.transcodeProtocol = 'hls';
      return opts;
    }
    if (streamChange === 'http-transcode-fallback') {
      opts.playbackStrategy = 'http-transcode';
      opts.forceTranscode = true;
      opts.transcodeProtocol = 'http';
      return opts;
    }
    if (streamChange === 'subtitle-burn') {
      opts.forceTranscode = true;
      opts.playbackStrategy = 'transcode';
      opts.subtitleBurnIn = true;
      opts.subtitleAdvancedBurn = burnFlags.advancedBurn;
    }
    if (streamChange === 'subtitle-fallback' || streamChange === 'subtitle') {
      opts.forceTranscode = true;
      opts.playbackStrategy = 'transcode';
      opts.subtitleBurnIn = false;
    }
    if (streamChange === 'subtitle-soft') {
      opts.subtitleBurnIn = false;
      if (session) {
        opts.playbackStrategy = session.playbackStrategy;
        opts.forceTranscode = session.forceTranscode;
        opts.transcodeProtocol = session.transcodeProtocol;
      }
    }
    if ((streamChange === 'audio' || streamChange === 'quality') &&
        requiresServerTranscode(sessionQualityForPlay())) {
      opts.forceTranscode = true;
      opts.playbackStrategy = 'transcode';
    }
    if (streamChange === 'subtitle-off') {
      opts.subtitleBurnIn = false;
      if (session && session.subtitleBurnIn) {
        opts.forceTranscode = true;
        opts.playbackStrategy = session.playbackStrategy || 'transcode';
        opts.transcodeProtocol = session.transcodeProtocol;
      } else if (playbackMode === 'direct-stream' && selectedSubtitleId == null) {
        opts.forceTranscode = false;
        opts.playbackStrategy = initialPlaybackStrategy(currentProbe, false);
        opts.transcodeProtocol = 'hls';
      }
    }
    if (isGraphicalSubtitleSelected()) {
      opts.forceTranscode = true;
      opts.playbackStrategy = 'transcode';
      opts.subtitleBurnIn = true;
      opts.subtitleAdvancedBurn = false;
    }
    if (session && session.subtitleBurnIn &&
        (streamChange === 'quality' || streamChange === 'audio')) {
      opts.subtitleBurnIn = true;
      opts.subtitleAdvancedBurn = session.subtitleAdvancedBurn === true;
      opts.forceTranscode = true;
      opts.playbackStrategy = 'transcode';
    }
    var prof = getProfile(selectedQuality);
    if ((streamChange === 'quality' || streamChange === 'audio') && prof && prof.forceDirect) {
      opts.forceTranscode = false;
      opts.playbackStrategy = 'direct';
    }
    if (!opts.playbackStrategy) {
      opts.playbackStrategy = initialPlaybackStrategy(
        currentProbe,
        opts.forceTranscode
      );
    }
    applyRemuxStrategyForSubtitles(opts);
    return opts;
  }

  function restartPlaybackAt(offset, protocol, streamChange) {
    if (!currentItem) return Promise.resolve();
    tvLog('player', 'restart', {
      offsetMs: offset,
      protocol: protocol,
      change: streamChange || null
    });
    return withPlaybackRestartLock(function () {
      var gen = bumpPlaybackGeneration();
      var wasProtocol = session && session.transcodeProtocol;
      beginPrepareOverlay();
      applyRestartPlaybackFallbackFlags(fallbackState, streamChange);
      return player.flushProgress('stopped').catch(function () {
        /* flushProgress already surfaced timeline failure */
      }).then(function () {
        if (destroyed || isStalePlayback(gen)) return;
        player.stop({ skipTimeline: true });
        if (destroyed || isStalePlayback(gen)) return;
        session = createSession(
          currentItem,
          currentVersion,
          buildSessionOptions(offset, protocol || wasProtocol, streamChange)
        );
        return chainPlaybackReady(tryPlayback(offset, gen), gen);
      }).then(function (result) {
        if (destroyed || isStalePlayback(gen) || !result) return result;
        hidePrepareOverlayIfReady();
        setOverlayVisible(true);
        if (shouldApplyClientSubtitleAfterPlay(result.mode)) {
          scheduleDeferredClientSubtitle(result.mode);
        } else {
          if (selectedSubtitleId == null) player.clearSubtitles();
          syncSubtitleDelayControls();
        }
        if (infoPanelVisible) updateInfoPanel();
        return result;
      });
    });
  }

  function retryTranscode(protocol, offset, streamChange) {
    restartPlaybackAt(offset, protocol, streamChange || 'full-transcode-fallback');
  }

  player.onError(function (info) {
    if (destroyed) return;
    tvError('player', 'playback error', {
      message: info && info.message,
      isHls: info && info.isHls,
      url: info && info.url
    });
    var offset = restartOffsetMs((session && session.offset) || 0);
    var codecUnsupported = isSrcNotSupportedError(info.mediaError) ||
      isHlsSourceRejectedError(info);

    if (!canAutoFallback()) {
      showPlaybackFailure(info, {
        phase: 'Video',
        fallback: formatDirectPlayOnlyError(currentProbe)
      });
      return;
    }

    var errorStep = decideErrorFallback(fallbackState, playbackFallbackContext({
      playbackMode: playbackMode,
      codecUnsupported: codecUnsupported,
      isHls: info.isHls
    }));
    if (errorStep.action === 'direct-stream') {
      setPlayerMessage('Direct play unavailable — trying stream copy…');
      restartPlaybackAt(offset, 'hls', 'direct-stream-fallback');
      return;
    }
    if (errorStep.action === 'direct-no-subs') {
      /* Server rejected the remux we started just to deliver subtitles
       * (common on Whatbox-style proxies). Direct play works — revert and
       * tell the user subs are unavailable so playback keeps going. */
      selectedSubtitleId = null;
      subtitleOffset = 0;
      setPlayerMessage(
        'Subtitles unavailable on this server — playing without subtitles.'
      );
      restartPlaybackAt(offset, null, 'direct-no-subs-fallback');
      return;
    }
    if (errorStep.action === 'full-transcode') {
      setPlayerMessage(codecUnsupported
        ? 'HLS codecs not supported on TV — transcoding…'
        : 'Stream copy failed — transcoding…');
      retryTranscode('hls', offset, 'full-transcode-fallback');
      return;
    }
    if (errorStep.action === 'http-transcode') {
      setPlayerMessage('HLS issue — retrying via HTTP transcode…');
      retryTranscode('http', offset, 'http-transcode-fallback');
      return;
    }
    awaitingPrepareOverlay = false;
    hideLoadingOverlay();
    showPlaybackFailure(new Error(formatFinalPlaybackError(info, fallbackState.httpFallbackTried, {
      directPlayOnly: isStrictDirectPlay()
    })), { phase: 'Video' });
  });

  function startPlayback(item, offset) {
    return withPlaybackRestartLock(function () {
      return startPlaybackLocked(item, offset);
    });
  }

  function startPlaybackLocked(item, offset) {
    var gen = bumpPlaybackGeneration();
    resetPlaybackFallbackFlags(fallbackState);
    showPlaybackRetry(false);
    clearPlaybackFailureUi();
    currentItem = item;
    tvLog('player', 'startPlayback', {
      ratingKey: item && item.ratingKey,
      title: item && item.title,
      offsetMs: offset
    });
    currentVersion = params.version || null;
    resetScrubPreviewSource();
    hideScrubPreview();
    currentProbe = probePlayback(item, currentVersion, null, deviceInfo);
    loadTrackLists(item);

    introMarkers = extractIntroMarkers(item);
    creditMarkers = extractCreditMarkers(item);
    skippedIntroMarkerKeys = {};
    skippedCreditMarkerKeys = {};
    resetCreditsAutoplayState();
    var startOffsetMs = resolveInitialPlaybackOffset(
      offset,
      item.viewOffset,
      params.offset
    );
    markMarkersSkippedBeforeOffset(startOffsetMs);

    updateNowPlayingTitle(item);
    updateNextUpUi();

    var directPlayProbeWarning = isStrictDirectPlay() && currentProbe && !currentProbe.canDirectPlay
      ? formatDirectPlayOnlyError(currentProbe)
      : '';
    setPlayerMessage(directPlayProbeWarning);
    beginPrepareOverlay();
    if (!server) {
      showPlaybackFailure(new Error('No Plex server connected. Return to library and try again.'), {
        phase: 'Start'
      });
      return Promise.resolve();
    }
    tvLog('player', 'quality resolved', { prefs: selectedQuality });
    if (destroyed || isStalePlayback(gen)) return Promise.resolve();
    session = createSession(item, currentVersion, buildSessionOptions(startOffsetMs));
    return chainPlaybackReady(tryPlayback(startOffsetMs, gen), gen).then(function (result) {
      if (destroyed || isStalePlayback(gen) || !result) return result;
      hidePrepareOverlayIfReady();
      setOverlayVisible(true);
      if (isStrictDirectPlay() && result.mode !== 'direct') {
        setPlayerMessage(formatDirectPlayOnlyError(currentProbe));
      }
      if (shouldApplyClientSubtitleAfterPlay(result.mode)) {
        scheduleDeferredClientSubtitle(result.mode);
      } else {
        if (selectedSubtitleId == null) player.clearSubtitles();
        syncSubtitleDelayControls();
      }
      if (infoPanelVisible) updateInfoPanel();
      clearHlsFallbackAfterHlsTranscodeStart(
        fallbackState,
        result.mode,
        isHlsUrl(result.url)
      );
      return result;
    });
  }

  function loadAndPlay(ratingKey, offset) {
    if (destroyed) return Promise.resolve();
    beginPrepareOverlay();
    return getMetadata(server, ratingKey).then(function (item) {
      if (destroyed) return;
      return startPlayback(item, offset);
    }).catch(function (err) {
      if (destroyed) return;
      awaitingPrepareOverlay = false;
      hideLoadingOverlay();
      updateNowPlayingTitle(null);
      showPlaybackFailure(err, { phase: 'Metadata' });
    });
  }

  function exitPlayer() {
    awaitingPrepareOverlay = false;
    hideLoadingOverlay();
    player.stop();
    navigate('detail', params._detail || { ratingKey: params.ratingKey });
  }

  function playNextInQueue() {
    if (!queue.hasNext() || advancing) return Promise.resolve(false);
    clearAutoplayCountdown();
    autoplayCancelled = false;
    advancing = true;
    return stopPlaybackForQueueAdvance(player).then(function () {
      var nextItem = queue.next();
      updateNextUpUi();
      return loadAndPlay(nextItem.ratingKey, resolveQueueAdvanceOffset());
    }).then(function () {
      if (destroyed) return false;
      advancing = false;
      return true;
    }).catch(function () {
      if (destroyed) return false;
      advancing = false;
      return false;
    });
  }

  function playPreviousInQueue() {
    if (!(queue.hasPrevious && queue.hasPrevious()) || advancing) return Promise.resolve(false);
    clearAutoplayCountdown();
    autoplayCancelled = false;
    advancing = true;
    return stopPlaybackForQueueAdvance(player).then(function () {
      var prevItem = queue.previous();
      updateNextUpUi();
      return loadAndPlay(prevItem.ratingKey, resolveQueueAdvanceOffset());
    }).then(function () {
      if (destroyed) return false;
      advancing = false;
      return true;
    }).catch(function () {
      if (destroyed) return false;
      advancing = false;
      return false;
    });
  }

  function onPlaybackEnded() {
    if (shouldTriggerAutoplayOnEnded({
      hasNextQueueItem: queue.hasNext(),
      autoplayCancelled: autoplayCancelled,
      hasCreditMarkers: creditMarkers.length > 0,
      creditsAutoplayTriggered: creditsAutoplayTriggered
    })) {
      startAutoplayCountdown(AUTOPLAY_COUNTDOWN_SEC);
      return;
    }
    if (queue.hasNext() && autoplayCancelled) {
      clearAutoplayCountdown();
      setOverlayVisible(true);
      clearOverlayHideTimer();
      updatePauseButton();
      return;
    }
    exitPlayer();
  }

  if (btnSkipIntroPrompt) {
    btnSkipIntroPrompt.addEventListener('click', function () {
      skipActiveMarker();
    });
  }

  document.getElementById('btn-pause').addEventListener('click', function () {
    player.togglePlayPause();
    updatePauseButton();
    syncPlaybackProgressUi();
    onOverlayActivity();
  });
  document.getElementById('btn-rewind').addEventListener('click', function () {
    seekToMs(player.getCurrentTimeMs() - PLAYER_REWIND_MS);
    onOverlayActivity();
  });
  document.getElementById('btn-forward').addEventListener('click', function () {
    seekToMs(player.getCurrentTimeMs() + PLAYER_FORWARD_MS);
    onOverlayActivity();
  });
  document.getElementById('btn-prev').addEventListener('click', function () {
    playPreviousInQueue();
    onOverlayActivity();
  });
  document.getElementById('btn-next').addEventListener('click', function () {
    playNextInQueue();
    onOverlayActivity();
  });
  document.getElementById('btn-stop').addEventListener('click', exitPlayer);
  document.getElementById('btn-audio').addEventListener('click', function () { openMenu('audio'); });
  document.getElementById('btn-player-subtitles').addEventListener('click', function () { openMenu('subtitles'); });
  document.getElementById('btn-player-quality').addEventListener('click', function () { openMenu('quality'); });
  var btnPlaybackRetry = document.getElementById('btn-playback-retry');
  if (btnPlaybackRetry) {
    btnPlaybackRetry.addEventListener('click', function () {
      manualRetryPlayback();
      onOverlayActivity();
    });
  }
  document.getElementById('btn-autoplay-play').addEventListener('click', function () {
    clearAutoplayCountdown();
    playNextInQueue();
  });
  document.getElementById('btn-autoplay-cancel').addEventListener('click', function () {
    autoplayCancelled = true;
    clearAutoplayCountdown();
    scheduleOverlayHide();
  });
  document.getElementById('btn-menu-cancel').addEventListener('click', function () {
    closeMenu();
    onOverlayActivity();
  });

  var btnSubDelayMinus = document.getElementById('btn-sub-delay-minus');
  var btnSubDelayPlus = document.getElementById('btn-sub-delay-plus');
  if (btnSubDelayMinus) {
    btnSubDelayMinus.addEventListener('click', function () {
      adjustSubtitleOffset(-100).then(function () { onOverlayActivity(); });
    });
  }
  if (btnSubDelayPlus) {
    btnSubDelayPlus.addEventListener('click', function () {
      adjustSubtitleOffset(100).then(function () { onOverlayActivity(); });
    });
  }

  function seekBarStepMs() {
    var dur = getDurationMs();
    return Math.max(SEEK_STEP_SEC * 1000, Math.min(SCRUB_STEP_MS, Math.floor(dur / 60)));
  }

  function isSeekBarArrowKey(e) {
    return e.keyCode === 37 || e.key === 'ArrowLeft' ||
      e.keyCode === 39 || e.key === 'ArrowRight';
  }

  function nudgeSeekBarScrub(deltaMs) {
    var dur = getDurationMs();
    scrubPreviewMs = Math.max(0, Math.min(dur, getScrubMs() + deltaMs));
    updateSeekUi(true);
  }

  function handleSeekBarArrowKey(e) {
    if (!isSeekBarArrowKey(e)) return false;
    var step = seekBarStepMs();
    if (e.keyCode === 37 || e.key === 'ArrowLeft') {
      nudgeSeekBarScrub(-step);
    } else {
      nudgeSeekBarScrub(step);
    }
    return true;
  }

  function commitSeekBarScrub(e) {
    var targetMs = getScrubMs();
    scrubPreviewMs = null;
    if (isTranscodePlayback()) {
      seekCommitPendingMs = targetMs;
      if (seekCommitTimer) clearTimeout(seekCommitTimer);
      seekCommitTimer = setTimeout(function () {
        seekCommitTimer = null;
        var commitMs = seekCommitPendingMs;
        seekCommitPendingMs = null;
        if (commitMs == null) return;
        restartPlaybackAt(commitMs).then(function () {
          seekBar.blur();
          updateSeekUi(false);
          onOverlayActivity();
        });
      }, SEEK_COMMIT_DEBOUNCE_MS);
    } else {
      seekToMs(targetMs).then(function () {
        seekBar.blur();
        updateSeekUi(false);
        onOverlayActivity();
      });
    }
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  seekBar.addEventListener('focus', function () {
    scrubPreviewMs = player.getCurrentTimeMs();
    updateSeekUi(true);
    clearOverlayHideTimer();
  });
  seekBar.addEventListener('blur', function () {
    scrubPreviewMs = null;
    hideScrubPreview();
    updateSeekUi(false);
  });
  overlay.addEventListener('keydown', function (e) {
    if (document.activeElement !== seekBar) return;
    if (handleSeekBarArrowKey(e)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if (e.keyCode === 13 || e.key === 'Enter') {
      commitSeekBarScrub(e);
      e.stopImmediatePropagation();
    }
  }, true);
  seekBar.addEventListener('keydown', function (e) {
    if (handleSeekBarArrowKey(e)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.keyCode === 13 || e.key === 'Enter') {
      commitSeekBarScrub(e);
    }
  });

  overlay.addEventListener('keydown', function (e) {
    if (e.keyCode === 13) {
      var ae = document.activeElement;
      if (ae && (ae.tagName === 'BUTTON' || ae.classList.contains('player-seek-bar'))) return;
      if (menuOpen) return;
      toggleOverlayVisible();
      e.preventDefault();
    }
    onOverlayActivity();
  });
  overlay.addEventListener('focusin', onOverlayActivity);
  overlay.addEventListener('pointerdown', onOverlayActivity);
  overlay.addEventListener('pointermove', onOverlayActivity);
  document.addEventListener('keydown', onTrackModalKeyDown, true);
  document.addEventListener('keydown', handlePlayerBack, true);

  function handlePlayerEnter(e) {
    if (e.keyCode !== 13 || menuOpen) return;
    if (skipPromptActive && btnSkipIntroPrompt && !btnSkipIntroPrompt.hidden) {
      var focused = document.activeElement;
      if (!overlayVisible || focused === btnSkipIntroPrompt) {
        skipActiveMarker();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }
    if (overlayVisible) return;
    var ae = document.activeElement;
    if (ae && ae.tagName === 'BUTTON') return;
    setOverlayVisible(true);
    focusOverlayDefault();
    e.preventDefault();
  }

  document.addEventListener('keydown', handlePlayerEnter, true);

  function onMotionCursorShow() {
    setOverlayVisible(true);
    clearOverlayHideTimer();
  }

  function onMotionCursorHide() {
    setOverlayVisible(false);
  }

  // Wake controls on any pointer activity (Magic Remote pointer mode generates
  // synthetic mousemove events that may be below the motion-sensor threshold).
  var lastPointerWakeAt = 0;
  function onPointerWake() {
    var now = Date.now();
    if (now - lastPointerWakeAt < 80) return;
    lastPointerWakeAt = now;
    setOverlayVisible(true);
    clearOverlayHideTimer();
  }

  document.addEventListener(MOTION_CURSOR_SHOW_EVENT, onMotionCursorShow);
  document.addEventListener(MOTION_CURSOR_HIDE_EVENT, onMotionCursorHide);
  document.addEventListener('mousemove', onPointerWake);
  document.addEventListener('mousedown', onPointerWake);

  player.onEnded(onPlaybackEnded);

  player.onFirstFrame(function () {
    hidePrepareOverlayIfReady();
    tvLog('playback', 'first frame');
    var overlayGate = onPlaybackFirstFrame(overlayHideAfterFirstFrame);
    overlayHideAfterFirstFrame = overlayGate.hideAfterFirstFrame;
    if (overlayGate.scheduleHide) scheduleOverlayHide();
    resolveFirstFrameWaiters();
  });

  player.onTimelineSyncFailure(function () {
    if (destroyed) return;
    setPlayerMessage('Could not save watch progress to Plex.');
    scheduleOverlayHide();
  });

  var detachAppBackground = onAppBackground(function () {
    if (destroyed) return;
    if (!player.getVideoElement() || player.getVideoElement().classList.contains('hidden')) return;
    player.pause();
    updatePauseButton();
  });

  var detachRemote = attachRemoteKeys({
    onPlay: function () {
      if (player.isPaused()) player.resume();
      else player.pause();
      updatePauseButton();
      syncPlaybackProgressUi();
      setOverlayVisible(true);
      onOverlayActivity();
    },
    onPause: function () {
      player.pause();
      updatePauseButton();
      syncPlaybackProgressUi();
      setOverlayVisible(true);
      onOverlayActivity();
    },
    onStop: exitPlayer,
    onFastForward: function () {
      seekToMs(player.getCurrentTimeMs() + SEEK_STEP_SEC * 1000);
      setOverlayVisible(true);
      onOverlayActivity();
    },
    onRewind: function () {
      seekToMs(player.getCurrentTimeMs() - SEEK_STEP_SEC * 1000);
      setOverlayVisible(true);
      onOverlayActivity();
    },
    onSkipNext: function () {
      if (queue.hasNext()) playNextInQueue();
    },
    onSkipIntro: function () {
      if (skipPromptActive) skipActiveMarker();
    },
    onToggleControls: function () {
      toggleOverlayVisible();
    },
    onToggleInfo: function () {
      toggleInfoPanel();
    },
    onOpenSubtitles: function () {
      setOverlayVisible(true);
      openMenu('subtitles');
    },
    onOpenAudio: function () {
      setOverlayVisible(true);
      openMenu('audio');
    }
  });

  function initQueueAndStart() {
    var offset = params.offset || 0;
    if (params.queueSeasonKey) {
      queue.buildFromSeason(server, params.queueSeasonKey, params.ratingKey).then(function () {
        if (destroyed) return;
        updateNextUpUi();
        return loadAndPlay(params.ratingKey, offset);
      }).catch(function (err) {
        if (destroyed) return;
        awaitingPrepareOverlay = false;
        hideLoadingOverlay();
        showPlaybackFailure(err, { phase: 'Queue' });
      });
      return;
    }
    getMetadata(server, params.ratingKey).then(function (item) {
      if (destroyed) return;
      queue.buildSingle(item);
      updateNextUpUi();
      startPlayback(item, offset);
    }).catch(function (err) {
      if (destroyed) return;
      awaitingPrepareOverlay = false;
      hideLoadingOverlay();
      showPlaybackFailure(err, { phase: 'Queue' });
    });
  }

  beginPrepareOverlay();
  initQueueAndStart();
  focusFirst(overlay);

  return {
    destroy: function () {
      destroyed = true;
      setDebugOverlayPlayerMode(false);
      clearPlaybackFailureUi();
      if (playbackErrorBanner && playbackErrorBanner.parentNode) {
        playbackErrorBanner.parentNode.removeChild(playbackErrorBanner);
        playbackErrorBanner = null;
      }
      if (progressInterval) clearInterval(progressInterval);
      clearAutoplayCountdown();
      clearOverlayHideTimer();
      clearDeferredClientSubtitle();
      if (seekCommitTimer) {
        clearTimeout(seekCommitTimer);
        seekCommitTimer = null;
      }
      hideScrubPreview();
      resetScrubPreviewSource();
      firstFrameWaiters = [];
      awaitingPrepareOverlay = false;
      resetBufferingOverlay();
      if (detachAppBackground) detachAppBackground();

      function teardown() {
        player.clearListeners();
        player.stop({ skipTimeline: true });
        session = null;
        queue.reset();
        detachRemote();
        detachFocus();
        document.removeEventListener('keydown', onTrackModalKeyDown, true);
        document.removeEventListener('keydown', handlePlayerBack, true);
        document.removeEventListener('keydown', handlePlayerEnter, true);
        document.removeEventListener(MOTION_CURSOR_SHOW_EVENT, onMotionCursorShow);
        document.removeEventListener(MOTION_CURSOR_HIDE_EVENT, onMotionCursorHide);
        document.removeEventListener('mousemove', onPointerWake);
        document.removeEventListener('mousedown', onPointerWake);
        overlay.remove();
      }

      if (session) {
        player.flushProgress('stopped').catch(function () {
          /* flushProgress already surfaced timeline failure */
        }).finally(teardown);
      } else {
        teardown();
      }
    }
  };
}

export { playerScreen };
