/**
 * rAF frame sampler — the direct "does it feel smooth" number for a window of
 * time after a navigation. requestAnimationFrame ticks with the main thread's
 * frame production, so stalls here are exactly the stalls the user feels in
 * remote input and JS-driven focus glides (compositor-driven CSS animations
 * can stay smooth even when this stalls — that divergence is informative).
 *
 * Reports one summary per sample window:
 *   frames    rAF callbacks observed
 *   dropped   inter-frame gaps > 33ms (missed at least one 60fps frame)
 *   frozen    gaps > 100ms (visible hitch / input dead time)
 *   worstMs   longest single gap
 *   busyMs    sum of all time spent in >33ms gaps — total congestion
 *
 * Self-gating: mark() needs the perf flag, tvLog() needs debug+logSink — when
 * neither is on the sampler doesn't even start (zero rAF churn in retail).
 * Only one sampler runs at a time; a new navigation supersedes the old window
 * (the old one reports what it saw, tagged superseded:true).
 */

import { mark, isPerfEnabled } from './resourceMonitor.js';
import { tvLog, isTvDebugEnabled } from '../utils/tvDebug.js';

function nowMs() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

var active = null;

function report(session, superseded) {
  var payload = {
    frames: session.frames,
    dropped: session.dropped,
    frozen: session.frozen,
    worstMs: Math.round(session.worstMs),
    busyMs: Math.round(session.busyMs),
    windowMs: Math.round(nowMs() - session.startedAt)
  };
  for (var k in session.data) if (session.data.hasOwnProperty(k)) payload[k] = session.data[k];
  if (superseded) payload.superseded = true;
  mark(session.label, payload);
  tvLog('perf', session.label, payload);
}

/**
 * Sample frame gaps for `windowMs` (default 1500ms) and report a summary.
 * @param {string} label  e.g. 'jank:navigation'
 * @param {object} [data] extra context (route etc.)
 * @param {number} [windowMs]
 */
function sampleFrames(label, data, windowMs) {
  if (!isPerfEnabled() && !isTvDebugEnabled()) return;
  if (typeof requestAnimationFrame !== 'function') return;
  if (active) { active.stopped = true; report(active, true); active = null; }

  var session = {
    label: label,
    data: data || {},
    startedAt: nowMs(),
    lastTick: 0,
    frames: 0,
    dropped: 0,
    frozen: 0,
    worstMs: 0,
    busyMs: 0,
    stopped: false
  };
  active = session;
  var deadline = session.startedAt + (windowMs || 1500);

  function tick() {
    if (session.stopped) return;
    var t = nowMs();
    if (session.lastTick) {
      var gap = t - session.lastTick;
      session.frames++;
      if (gap > 33) {
        session.dropped++;
        session.busyMs += gap;
        if (gap > 100) session.frozen++;
        if (gap > session.worstMs) session.worstMs = gap;
      }
    }
    session.lastTick = t;
    if (t >= deadline) {
      session.stopped = true;
      if (active === session) active = null;
      report(session, false);
      return;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

export { sampleFrames };
