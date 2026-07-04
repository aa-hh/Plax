/**
 * Measure how long a CSS animation ACTUALLY took on a given element — wall-
 * clock time, not the declared CSS duration — split into two phases so the
 * cause of slowness is diagnosable from tv.log alone:
 *
 *   startDelayMs  creation → `animationstart`. Big number = the MAIN THREAD
 *                 was too busy (DOM build, style recalc, image decode, JS) to
 *                 commit the element's first frame. This is the congestion
 *                 signal — the animation hasn't even begun.
 *   runMs         `animationstart` → `animationend`. Compares against the
 *                 declared CSS duration. Big overshoot = the compositor is
 *                 genuinely struggling (rare for opacity/transform) OR event
 *                 delivery is stalled behind main-thread work.
 *   durationMs    total (creation → end) — kept for continuity with earlier
 *                 tv.log captures.
 *
 * NOTE: both events are delivered on the main thread, so a compositor-driven
 * fade can LOOK smooth on screen while these numbers are big — that still
 * matters, because a congested main thread is exactly what makes remote input
 * and focus glides feel laggy. Treat startDelayMs as the "input dead time"
 * proxy, and the frameJank sampler as the smoothness proxy.
 *
 * Reports through TWO channels so it's usable both locally and on-device:
 *  - the in-memory perf-mark buffer (resourceMonitor.mark → window.__plaxPerf.
 *    exportData()), gated by ?perf=1 / localStorage plax_perf_enabled
 *  - the remote tvLog sink (tag 'perf'), gated by tvDebug's debug+logSink
 *    state. See docs/design-system/component-registry.md → Motion.
 */

import { mark } from './resourceMonitor.js';
import { tvLog } from '../utils/tvDebug.js';

function nowMs() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

/**
 * @param {Element} el      the element the CSS animation runs on
 * @param {string} label    perf-mark / tvLog label, e.g. 'anim:screen-enter-fade'
 * @param {object} [data]   extra context (route, rowCount, etc.)
 */
function timeAnimation(el, label, data) {
  if (!el || typeof el.addEventListener !== 'function') return;
  var createdAt = nowMs();
  var startedAt = 0;
  var done = false;

  function detach() {
    el.removeEventListener('animationstart', onStart);
    el.removeEventListener('animationend', onEnd);
    el.removeEventListener('animationcancel', onCancel);
  }

  function finish(extra) {
    if (done) return;
    done = true;
    detach();
    var endAt = nowMs();
    var payload = {
      durationMs: Math.round(endAt - createdAt),
      startDelayMs: startedAt ? Math.round(startedAt - createdAt) : null,
      runMs: startedAt ? Math.round(endAt - startedAt) : null
    };
    if (data) { for (var k in data) if (data.hasOwnProperty(k)) payload[k] = data[k]; }
    if (extra) { for (var k2 in extra) if (extra.hasOwnProperty(k2)) payload[k2] = extra[k2]; }
    mark(label, payload);
    tvLog('perf', label, payload);
  }
  function onStart(e) {
    if (e.target !== el) return; // ignore bubbled child-element animations
    if (!startedAt) startedAt = nowMs();
  }
  function onEnd(e) {
    if (e.target !== el) return;
    finish();
  }
  function onCancel(e) {
    if (e.target !== el) return;
    finish({ cancelled: true });
  }
  el.addEventListener('animationstart', onStart);
  el.addEventListener('animationend', onEnd);
  el.addEventListener('animationcancel', onCancel);
}

export { timeAnimation };
