/** Plex timeline state for seek / flush based on element pause flag. */
function timelineStateForPlayback(isPaused) {
  return isPaused ? 'paused' : 'playing';
}

function timelineStateForFlush(isPaused, explicitState) {
  if (explicitState) return explicitState;
  return timelineStateForPlayback(isPaused);
}

export { timelineStateForPlayback, timelineStateForFlush };
