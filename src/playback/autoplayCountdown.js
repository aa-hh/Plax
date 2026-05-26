/** Default seconds shown before auto-advancing to the next queue item. */
var AUTOPLAY_COUNTDOWN_SEC = 5;

/**
 * Start autoplay countdown when the skip-credits prompt is shown (active credit marker).
 * @param {{ hasNextQueueItem: boolean, autoplayCancelled: boolean, hasCreditMarkers: boolean, skipPromptKind: string|null }} opts
 */
function shouldTriggerAutoplayOnCreditPrompt(opts) {
  return !!opts.hasNextQueueItem &&
    !opts.autoplayCancelled &&
    !!opts.hasCreditMarkers &&
    opts.skipPromptKind === 'credit';
}

/**
 * Fall back to end-of-playback countdown when there is no credit marker, or credits countdown never started.
 * @param {{ hasNextQueueItem: boolean, autoplayCancelled: boolean, hasCreditMarkers: boolean, creditsAutoplayTriggered: boolean }} opts
 */
function shouldTriggerAutoplayOnEnded(opts) {
  return !!opts.hasNextQueueItem &&
    !opts.autoplayCancelled &&
    (!opts.hasCreditMarkers || !opts.creditsAutoplayTriggered);
}

/**
 * Interval-based autoplay countdown (one tick per second).
 * @param {{ setInterval: Function, clearInterval: Function }} timers
 */
function createAutoplayCountdown(timers) {
  var setIntervalFn = timers.setInterval;
  var clearIntervalFn = timers.clearInterval;
  var timer = null;
  var remaining = 0;

  function clear() {
    if (timer) {
      clearIntervalFn(timer);
      timer = null;
    }
    remaining = 0;
  }

  /**
   * @param {number} seconds
   * @param {{ onTick?: (remaining: number) => void, onComplete?: () => void }} callbacks
   */
  function start(seconds, callbacks) {
    callbacks = callbacks || {};
    clear();
    remaining = seconds;
    if (callbacks.onTick) callbacks.onTick(remaining);
    timer = setIntervalFn(function () {
      remaining -= 1;
      if (remaining <= 0) {
        clear();
        if (callbacks.onComplete) callbacks.onComplete();
        return;
      }
      if (callbacks.onTick) callbacks.onTick(remaining);
    }, 1000);
  }

  function getRemaining() {
    return remaining;
  }

  function isRunning() {
    return timer != null;
  }

  return {
    clear: clear,
    start: start,
    getRemaining: getRemaining,
    isRunning: isRunning
  };
}

export {
  AUTOPLAY_COUNTDOWN_SEC,
  shouldTriggerAutoplayOnCreditPrompt,
  shouldTriggerAutoplayOnEnded,
  createAutoplayCountdown
};
