/**
 * Transition gate — the "one thing at a time" scheduler for webOS 4-class
 * hardware. The B8's single slow main thread handles a screen transition fine,
 * and image decode fine, and row hydration fine — but not simultaneously.
 * Measured on a real B8 (tv.log 2026-07-04): the enter fade declared at 200ms
 * took 372–1695ms wall-clock depending on how much competing work the screen
 * kicked off alongside it, and that congestion window is also input dead time.
 *
 * So: navigation opens a short protected window; heavy, deferrable work
 * (poster decode, hero backdrop, below-fold hydration, prefetch) queues via
 * onIdle() instead of running immediately. The router closes the window on the
 * enter-fade's animationend — or the safety timeout closes it if no animation
 * runs (caps-motion off, retained re-show, animation cancelled).
 *
 * Deliberately tiny and dependency-free: consumers must never be able to
 * deadlock on it. onIdle() fires synchronously when no transition is active.
 */

var transitionUntil = 0;   // epoch-ms deadline of the current protected window
var idleQueue = [];
var timerId = null;

function nowMs() {
  return Date.now();
}

function flushIdleQueue() {
  if (timerId) { clearTimeout(timerId); timerId = null; }
  transitionUntil = 0;
  // Swap before running so an onIdle callback that itself calls beginTransition
  // + onIdle queues into a fresh array instead of extending this drain.
  var q = idleQueue;
  idleQueue = [];
  for (var i = 0; i < q.length; i++) {
    try { q[i](); } catch (e) { /* one bad consumer must not starve the rest */ }
  }
}

/**
 * Open (or extend) the protected window. Safe to call repeatedly — the latest
 * deadline wins. The safety timeout guarantees the window ALWAYS closes even
 * if endTransition is never called.
 * @param {number} [ms] window length; default 400 (200ms fade + headroom)
 */
function beginTransition(ms) {
  var deadline = nowMs() + (ms || 400);
  if (deadline <= transitionUntil) return;
  transitionUntil = deadline;
  if (timerId) clearTimeout(timerId);
  timerId = setTimeout(flushIdleQueue, deadline - nowMs());
}

/** Close the window early (e.g. the enter fade finished) and drain the queue. */
function endTransition() {
  if (!isTransitioning() && idleQueue.length === 0) return;
  flushIdleQueue();
}

/** True while heavy work should hold off. */
function isTransitioning() {
  return transitionUntil > nowMs();
}

/**
 * Run `cb` when the current transition window closes — immediately (sync) if
 * none is active. No return handle: keep consumers simple; anything that can
 * become stale must check its own liveness (e.g. element still in the DOM).
 */
function onIdle(cb) {
  if (typeof cb !== 'function') return;
  if (!isTransitioning()) { cb(); return; }
  idleQueue.push(cb);
}

export { beginTransition, endTransition, isTransitioning, onIdle };
