/**
 * Playback fallback ladder state and decisions (direct → remux → transcode → HTTP).
 * Pure logic; screen layer applies messages and restarts playback.
 */

function createPlaybackFallbackState() {
  return {
    directStreamFallbackTried: false,
    fullTranscodeFallbackTried: false,
    hlsFallbackTried: false,
    httpFallbackTried: false,
    rebufferDownshiftTried: false
  };
}

function resetPlaybackFallbackFlags(state) {
  state.directStreamFallbackTried = false;
  state.fullTranscodeFallbackTried = false;
  state.hlsFallbackTried = false;
  state.httpFallbackTried = false;
  state.rebufferDownshiftTried = false;
}

/** Allow another quality downshift on the next rebuffer episode. */
function resetRebufferDownshiftForEpisode(state) {
  state.rebufferDownshiftTried = false;
}

function isLadderFallbackStreamChange(streamChange) {
  return !!streamChange && (
    streamChange.indexOf('-fallback') >= 0 ||
    streamChange === 'subtitle-fallback'
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
}

/**
 * Next step after a playback error when auto-fallback is allowed.
 * @returns {{ action: 'direct-stream'|'full-transcode'|'http-transcode'|'terminal' }}
 */
function decideErrorFallback(state, context) {
  var playbackMode = context.playbackMode;
  var codecUnsupported = context.codecUnsupported;
  var isHls = context.isHls;

  if (playbackMode === 'direct' && !state.directStreamFallbackTried) {
    state.directStreamFallbackTried = true;
    return { action: 'direct-stream' };
  }
  if (playbackMode === 'direct-stream' && !state.fullTranscodeFallbackTried) {
    state.fullTranscodeFallbackTried = true;
    return {
      action: 'full-transcode',
      codecUnsupported: codecUnsupported
    };
  }
  if (isHls && !state.hlsFallbackTried && playbackMode !== 'transcode-http') {
    state.hlsFallbackTried = true;
    return { action: 'http-transcode' };
  }
  if (!state.httpFallbackTried) state.httpFallbackTried = true;
  return { action: 'terminal' };
}

/**
 * Rebuffer watchdog: one quality downshift on HLS transcode, then HTTP transcode.
 * @returns {{ action: 'quality-downshift'|'http-transcode'|'none', nextQuality?: string }}
 */
function decideRebufferFallback(state, context) {
  if (
    context.onHlsTranscode &&
    context.nextLowerQuality &&
    !state.rebufferDownshiftTried
  ) {
    state.rebufferDownshiftTried = true;
    return { action: 'quality-downshift', nextQuality: context.nextLowerQuality };
  }
  if (context.transcodeProtocol !== 'http' && !state.httpFallbackTried) {
    state.httpFallbackTried = true;
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
  resetRebufferDownshiftForEpisode,
  isLadderFallbackStreamChange,
  applyRestartPlaybackFallbackFlags,
  decideErrorFallback,
  decideRebufferFallback,
  clearHlsFallbackAfterHlsTranscodeStart
};
