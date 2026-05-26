/**
 * Debounced motion → pointer visibility (testable, no DOM).
 * Show after sustained motion; hide after idle.
 */

export var SHOW_AFTER_MS = 3000;
export var HIDE_AFTER_MS = 3000;
/** Gap without motion samples resets the sustained-motion streak. */
export var MOTION_GAP_MS = 250;

/**
 * @param {object} [options]
 * @param {number} [options.showAfterMs]
 * @param {number} [options.hideAfterMs]
 * @param {number} [options.motionGapMs]
 * @param {function(): void} [options.onShow]
 * @param {function(): void} [options.onHide]
 */
export function createMotionCursorTracker(options) {
  options = options || {};
  var showAfterMs = options.showAfterMs != null ? options.showAfterMs : SHOW_AFTER_MS;
  var hideAfterMs = options.hideAfterMs != null ? options.hideAfterMs : HIDE_AFTER_MS;
  var motionGapMs = options.motionGapMs != null ? options.motionGapMs : MOTION_GAP_MS;
  var onShow = options.onShow || function () {};
  var onHide = options.onHide || function () {};

  var visible = false;
  var lastMotionAt = null;
  var motionStreakStart = null;

  function clearStreak() {
    motionStreakStart = null;
  }

  function beginStreak(now) {
    motionStreakStart = now;
  }

  function syncStreak(now) {
    if (lastMotionAt == null || now - lastMotionAt > motionGapMs) {
      beginStreak(now);
      return;
    }
    if (motionStreakStart == null) beginStreak(now);
  }

  function maybeShow(now) {
    if (visible || motionStreakStart == null) return;
    if (now - motionStreakStart >= showAfterMs) {
      visible = true;
      onShow();
    }
  }

  function maybeHide(now) {
    if (!visible) return;
    if (lastMotionAt == null || now - lastMotionAt >= hideAfterMs) {
      visible = false;
      clearStreak();
      onHide();
    }
  }

  function onMotion(now) {
    syncStreak(now);
    lastMotionAt = now;
    if (!visible) {
      maybeShow(now);
      return;
    }
    maybeHide(now);
  }

  function tick(now) {
    if (lastMotionAt != null && now - lastMotionAt > motionGapMs) {
      clearStreak();
    }
    if (!visible) {
      maybeShow(now);
    } else {
      maybeHide(now);
    }
  }

  function isVisible() {
    return visible;
  }

  function reset() {
    visible = false;
    lastMotionAt = null;
    clearStreak();
  }

  return {
    onMotion: onMotion,
    tick: tick,
    isVisible: isVisible,
    reset: reset
  };
}
