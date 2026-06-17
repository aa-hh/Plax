/**
 * Playback fallback ladder state and decisions (direct → remux → transcode → HTTP).
 * Pure logic; screen layer applies messages and restarts playback.
 */

import { tvLog } from '../utils/tvDebug.js';
import { isWebOs4Tv } from './hlsPolicy.js';

function createPlaybackFallbackState() {
  return {
    directStreamFallbackTried: false,
    fullTranscodeFallbackTried: false,
    hlsFallbackTried: false,
    httpFallbackTried: false,
    /* Remux was started only to deliver subtitles (e.g. embedded SRT on a
     * server whose direct play works but universal transcode does not, like
     * some Whatbox/seedbox setups). On failure we revert to direct play
     * without subtitles instead of cascading through more transcode attempts
     * that hit the same broken endpoint. */
    enteredRemuxForSubtitlesOnly: false,
    /* Set once we've reverted to direct-no-subs for this episode so we don't
     * silently flip subtitles back on after another fallback. */
    directNoSubsFallbackTried: false
  };
}

function resetPlaybackFallbackFlags(state) {
  state.directStreamFallbackTried = false;
  state.fullTranscodeFallbackTried = false;
  state.hlsFallbackTried = false;
  state.httpFallbackTried = false;
  state.enteredRemuxForSubtitlesOnly = false;
  state.directNoSubsFallbackTried = false;
}

/** PMS /decision chose HLS (or DASH) — do not fall back to progressive HTTP transcode. */
function isPmsCommittedToHlsDelivery(context) {
  context = context || {};
  if (context.playbackMode === 'transcode-hls') return false;
  if (context.codecUnsupported &&
      (context.playbackMode === 'transcode-hls' || context.playbackMode === 'direct-stream')) {
    return false;
  }
  if (context.commitToHlsDelivery === true) return true;
  var protocol = String(context.pmsDeliveryProtocol || '').toLowerCase();
  return protocol === 'hls' || protocol === 'dash';
}

function isLadderFallbackStreamChange(streamChange) {
  return !!streamChange && (
    streamChange.indexOf('-fallback') >= 0 ||
    streamChange === 'subtitle-fallback' ||
    streamChange === 'subtitle-remux'
  );
}

/**
 * Updates fallback flags when restarting playback (auto-fallback preserves flags).
 */
function applyRestartPlaybackFallbackFlags(state, streamChange) {
  if (!isLadderFallbackStreamChange(streamChange)) {
    resetPlaybackFallbackFlags(state);
  }
  if (streamChange === 'direct-stream-fallback') state.directStreamFallbackTried = true;
  if (streamChange === 'full-transcode-fallback') state.fullTranscodeFallbackTried = true;
  if (streamChange === 'http-transcode-fallback') {
    state.hlsFallbackTried = true;
    state.httpFallbackTried = true;
  }
  /* Remux strictly for subtitles — when the server cannot transcode, prefer
   * reverting to direct play over cascading transcode attempts. */
  if (streamChange === 'subtitle-remux') {
    state.enteredRemuxForSubtitlesOnly = true;
  }
  if (streamChange === 'direct-no-subs-fallback') {
    state.directNoSubsFallbackTried = true;
    state.enteredRemuxForSubtitlesOnly = false;
  }
}

/**
 * Burn-in guard: when the user explicitly chose a graphical/PGS subtitle that
 * must be burned, the ladder must NEVER revert to a sub-dropping mode
 * (direct / direct-stream-as-direct-play / direct-no-subs) — that would
 * silently drop the chosen subtitle. The only permitted steps keep a
 * burn-capable transcode: full-transcode → http-transcode → terminal. We never
 * loop: each rung sets its tried flag before returning.
 */
function decideBurnInErrorFallback(state, context) {
  var codecUnsupported = context.codecUnsupported;

  if (!state.fullTranscodeFallbackTried) {
    state.fullTranscodeFallbackTried = true;
    tvLog('fallback', 'error → full-transcode (subtitle burn-in preserved)');
    return { action: 'full-transcode', codecUnsupported: codecUnsupported };
  }
  // webOS 4 progressive HTTP returns 0 bytes, so it can't preserve a burn-in
  // either — skip straight to terminal once the HLS transcode is exhausted.
  if (!isWebOs4Tv() && !state.httpFallbackTried && !isPmsCommittedToHlsDelivery(context)) {
    state.hlsFallbackTried = true;
    state.httpFallbackTried = true;
    tvLog('fallback', 'error → http-transcode (subtitle burn-in preserved)');
    return { action: 'http-transcode' };
  }
  if (!state.httpFallbackTried) state.httpFallbackTried = true;
  tvLog('fallback', 'error → terminal (subtitle burn-in)');
  return { action: 'terminal' };
}

/**
 * Next step after a playback error when auto-fallback is allowed.
 * @returns {{ action: 'direct-stream'|'direct-no-subs'|'full-transcode'|'http-transcode'|'terminal' }}
 */
function decideErrorFallback(state, context) {
  var playbackMode = context.playbackMode;
  var codecUnsupported = context.codecUnsupported;
  var isHls = context.isHls;

  /* Subtitle burn-in must survive the ladder: only burn-capable transcode
   * fallbacks are allowed (never direct / direct-stream / direct-no-subs). */
  if (context.subtitleBurnIn === true) {
    return decideBurnInErrorFallback(state, context);
  }

  if (playbackMode === 'direct' && !state.directStreamFallbackTried) {
    state.directStreamFallbackTried = true;
    if (isWebOs4Tv()) {
      state.fullTranscodeFallbackTried = true;
      tvLog('fallback', 'error → full-transcode (webOS4 skip remux)');
      return {
        action: 'full-transcode',
        codecUnsupported: codecUnsupported
      };
    }
    tvLog('fallback', 'error → direct-stream');
    return { action: 'direct-stream' };
  }
  /* Remux was started only for subtitles and the server rejected it
   * (e.g. Whatbox universal transcode broken). Direct play already works;
   * revert and stop chasing more transcode attempts that hit the same
   * endpoint. The screen layer disables subtitles for the session. */
  if (
    playbackMode === 'direct-stream' &&
    state.enteredRemuxForSubtitlesOnly &&
    !state.directNoSubsFallbackTried
  ) {
    state.directNoSubsFallbackTried = true;
    state.enteredRemuxForSubtitlesOnly = false;
    tvLog('fallback', 'error → direct-no-subs');
    return { action: 'direct-no-subs' };
  }
  if (playbackMode === 'direct-stream' && !state.fullTranscodeFallbackTried) {
    state.fullTranscodeFallbackTried = true;
    tvLog('fallback', 'error → full-transcode');
    return {
      action: 'full-transcode',
      codecUnsupported: codecUnsupported
    };
  }
  // webOS 4: never fall to progressive HTTP transcode — PMS returns a 0-byte
  // body on this build, so it can't rescue a failed HLS transcode. Go terminal.
  if (isWebOs4Tv() && (playbackMode === 'transcode-hls' || isHls)) {
    tvLog('fallback', 'error → terminal (webOS4: no http-transcode)');
    return { action: 'terminal' };
  }
  if (
    playbackMode === 'transcode-hls' &&
    isHls &&
    !state.httpFallbackTried
  ) {
    state.httpFallbackTried = true;
    tvLog('fallback', 'error → http-transcode (HLS transcode failed)');
    return { action: 'http-transcode' };
  }
  if (
    isHls &&
    !state.hlsFallbackTried &&
    playbackMode !== 'transcode-http' &&
    !isPmsCommittedToHlsDelivery(context)
  ) {
    state.hlsFallbackTried = true;
    tvLog('fallback', 'error → http-transcode');
    return { action: 'http-transcode' };
  }
  if (!state.httpFallbackTried) state.httpFallbackTried = true;
  tvLog('fallback', 'error → terminal');
  return { action: 'terminal' };
}

/**
 * Rebuffer watchdog: HLS remux falls back to full transcode, then HTTP transcode.
 * Quality is never downgraded on buffering.
 * @returns {{ action: 'http-transcode'|'full-transcode'|'none' }}
 */
function decideRebufferFallback(state, context) {
  /* HLS remux with soft subs: try full HLS transcode before HTTP progressive
   * (HTTP fails on desktop MSE and does not fix a stalled remux session). */
  if (
    context.playbackMode === 'direct-stream' &&
    context.transcodeProtocol === 'hls' &&
    !state.fullTranscodeFallbackTried
  ) {
    state.fullTranscodeFallbackTried = true;
    tvLog('fallback', 'rebuffer → full-transcode');
    return { action: 'full-transcode' };
  }
  // webOS 4: progressive HTTP transcode returns a 0-byte body (PMS quirk on this
  // build) — it never plays, so it is NOT a valid rebuffer escape. Stay on the
  // mpegts HLS transcode and let it keep fetching segments rather than switching
  // to a delivery that's guaranteed to stall.
  if (isWebOs4Tv()) {
    return { action: 'none' };
  }
  if (
    context.transcodeProtocol !== 'http' &&
    !state.httpFallbackTried &&
    !isPmsCommittedToHlsDelivery(context)
  ) {
    state.httpFallbackTried = true;
    tvLog('fallback', 'rebuffer → http-transcode');
    return { action: 'http-transcode' };
  }
  return { action: 'none' };
}

/** Successful HLS transcode start allows a later HTTP fallback attempt. */
function clearHlsFallbackAfterHlsTranscodeStart(state, mode, urlIsHls) {
  if (mode === 'transcode-hls' && urlIsHls) {
    state.hlsFallbackTried = false;
  }
}

export {
  createPlaybackFallbackState,
  resetPlaybackFallbackFlags,
  isPmsCommittedToHlsDelivery,
  isLadderFallbackStreamChange,
  applyRestartPlaybackFallbackFlags,
  decideErrorFallback,
  decideRebufferFallback,
  clearHlsFallbackAfterHlsTranscodeStart
};
