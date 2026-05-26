/**
 * Re-buffer watchdog: fires onTimeout once per buffering episode while stalled.
 * Clears and allows another fire after buffering ends (disarm).
 */
function createRebufferWatchdog(options) {
  var timeoutMs = options.timeoutMs;
  var onTimeout = options.onTimeout;

  var timer = null;
  var fired = false;
  var buffering = false;

  function scheduleTimeout(fn, ms) {
    return (options.setTimeout || setTimeout)(fn, ms);
  }

  function cancelTimeout(id) {
    (options.clearTimeout || clearTimeout)(id);
  }

  function clearWatchdog() {
    if (timer) {
      cancelTimeout(timer);
      timer = null;
    }
  }

  function arm() {
    clearWatchdog();
    timer = scheduleTimeout(function () {
      timer = null;
      if (fired || !buffering) return;
      fired = true;
      if (onTimeout) {
        try { onTimeout(); } catch (e) { console.error(e); }
      }
    }, timeoutMs);
  }

  function notifyBuffering(show) {
    if (buffering === show) return false;
    buffering = show;
    if (show) {
      arm();
    } else {
      clearWatchdog();
      fired = false;
    }
    return true;
  }

  /** New playback session (e.g. play() on a new URL). */
  function resetEpisode() {
    fired = false;
    clearWatchdog();
  }

  function destroy() {
    clearWatchdog();
    buffering = false;
    fired = false;
  }

  function hasFired() {
    return fired;
  }

  function isBuffering() {
    return buffering;
  }

  return {
    notifyBuffering: notifyBuffering,
    resetEpisode: resetEpisode,
    destroy: destroy,
    hasFired: hasFired,
    isBuffering: isBuffering
  };
}

export {
  createRebufferWatchdog
};
