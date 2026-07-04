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
 * D-pad rail glides also open the gate (extendTransition, never shortens the
 * window) so posters don't decode mid-glide — the freeze wasn't the scroll
 * itself, it was posters decoding the instant scrolling revealed them. A held
 * key keeps extending; posters resolve once input actually stops.
 *
 * When the gate closes, the deferred queue drains ONE callback per macrotask
 * (a setTimeout(0) chain), not all at once — dumping the whole queue
 * synchronously was itself a measured freeze (every deferred poster decoding
 * in a single task).
 *
 * Deliberately tiny and dependency-free: consumers must never be able to
 * deadlock on it. onIdle() fires synchronously when no transition is active.
 */

var transitionUntil = 0;   // epoch-ms deadline of the current protected window
var idleQueue = [];
var timerId = null;
var draining = false;      // true while the trickle drain chain is in flight

function nowMs() {
  return Date.now();
}

// Drain ONE callback per macrotask (a setTimeout(0) chain) instead of the
// whole queue in a single synchronous loop. Measured on a real B8: dumping
// every deferred poster decode in one task was the 1506ms home re-entry
// stall. Trickling keeps each task short so input stays responsive between
// decodes.
//
// - `draining` prevents a double-drain (endTransition + the safety timeout
//   can both try to start one).
// - If beginTransition/extendTransition re-opens the gate mid-drain, STOP the
//   chain immediately; whatever is left in idleQueue stays queued for the
//   NEXT drain (it is not lost, not re-ordered).
// - A callback that itself calls onIdle() must queue into a later drain, not
//   the one currently running — achieved by only ever shifting from the live
//   idleQueue array (a fresh onIdle push during drain lands after the
//   in-flight item and is picked up by a later tick, never re-entered here).
// - A throwing callback must not starve the rest of the chain.
function drainStep() {
  if (isTransitioning()) {
    // Gate re-opened mid-drain (extendTransition/beginTransition fired from
    // inside a callback, or a fresh caller extended the window). Stop; the
    // remaining queue is picked up by the next flush.
    draining = false;
    return;
  }
  if (idleQueue.length === 0) {
    draining = false;
    return;
  }
  var cb = idleQueue.shift();
  try { cb(); } catch (e) { /* one bad consumer must not starve the rest */ }
  if (idleQueue.length === 0) {
    draining = false;
    return;
  }
  setTimeout(drainStep, 0);
}

function flushIdleQueue() {
  if (timerId) { clearTimeout(timerId); timerId = null; }
  transitionUntil = 0;
  if (draining) return; // already trickling; this tick's work continues it
  if (idleQueue.length === 0) return;
  draining = true;
  drainStep();
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

/**
 * Extend the protected window — an alias for beginTransition kept as its own
 * name for call-site intent (D-pad glide "extending" an already-open gate
 * vs. navigation "beginning" one). Never shortens: a shorter/earlier deadline
 * never wins, so a held key re-extending every glide can't accidentally
 * close the gate early.
 * @param {number} [ms] window length; default 400
 */
function extendTransition(ms) {
  beginTransition(ms);
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

export { beginTransition, extendTransition, endTransition, isTransitioning, onIdle };
