/**
 * Measure how long a CSS animation ACTUALLY took on a given element — wall-
 * clock time to `animationend`, not the declared CSS duration. On webOS 4 /
 * Chromium 53 the compositor can fall behind the declared timing (raster
 * contention, poster decode, GC pause), so the only way to see real jank is
 * to time the browser's own completion event rather than trust the CSS.
 *
 * Reports through TWO channels so it's usable both locally and on-device:
 *  - the in-memory perf-mark buffer (resourceMonitor.mark → window.__plaxPerf.
 *    exportData()), gated by ?perf=1 / localStorage plax_perf_enabled
 *  - the remote tvLog sink (tag 'perf'), gated by tvDebug's own debug+logSink
 *    state — so BOTH the perf flag and debug/logSink must be on to see these
 *    in tv.log. That mirrors every other tvLog call in the app; see
 *    docs/design-system/component-registry.md → Motion (instrumentation note).
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
  var startedAt = nowMs();
  var done = false;

  function finish(extra) {
    if (done) return;
    done = true;
    el.removeEventListener('animationend', onEnd);
    el.removeEventListener('animationcancel', onCancel);
    var elapsed = Math.round(nowMs() - startedAt);
    var payload = { durationMs: elapsed };
    if (data) { for (var k in data) if (data.hasOwnProperty(k)) payload[k] = data[k]; }
    if (extra) { for (var k2 in extra) if (extra.hasOwnProperty(k2)) payload[k2] = extra[k2]; }
    mark(label, payload);
    tvLog('perf', label, payload);
  }
  function onEnd(e) {
    if (e.target !== el) return; // ignore bubbled child-element animations
    finish();
  }
  function onCancel(e) {
    if (e.target !== el) return;
    finish({ cancelled: true });
  }
  el.addEventListener('animationend', onEnd);
  el.addEventListener('animationcancel', onCancel);
}

export { timeAnimation };
