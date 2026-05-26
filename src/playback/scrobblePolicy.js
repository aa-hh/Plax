var SCROBBLE_THRESHOLD = 0.92;
/** Below this fraction of duration, a prior scrobble is cleared after seek-back. */
var SCROBBLE_RESET_THRESHOLD = 0.85;
var SHORT_CONTENT_MS = 30000;
var NEAR_END_MS = 30000;

/**
 * Whether playback position warrants mark-watched / end-of-play scrobble.
 * Short items (<=30s) never scrobble via the near-end rule at t=0.
 */
function shouldScrobble(ms, duration) {
  if (!duration || duration <= 0) return false;
  if (ms / duration >= SCROBBLE_THRESHOLD) return true;
  if (duration <= SHORT_CONTENT_MS) return false;
  return duration - ms <= NEAR_END_MS;
}

/**
 * After mark-watched, user seek-back before end should allow continued scrobble sync.
 */
function shouldResetScrobble(ms, duration) {
  if (!duration || duration <= 0) return false;
  if (ms / duration < SCROBBLE_RESET_THRESHOLD) return true;
  return !shouldScrobble(ms, duration);
}

export {
  SCROBBLE_THRESHOLD,
  SCROBBLE_RESET_THRESHOLD,
  SHORT_CONTENT_MS,
  NEAR_END_MS,
  shouldScrobble,
  shouldResetScrobble
};
