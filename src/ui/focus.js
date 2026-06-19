/**
 * Geometric D-pad focus management for TV remotes.
 *
 * On each arrow press we take the focused element's bounding rect, project a
 * beam in the pressed direction, and move focus to the nearest candidate by
 * geometry (the standard spatial-navigation model used by Enact Spotlight /
 * Norigin / the W3C CSS spatial-navigation spec). Layout *is* the navigation
 * model, so there is no per-screen zone graph to keep in sync.
 *
 * A focus watchdog re-homes focus whenever it collapses to <body> (e.g. a
 * re-render removes the focused node), which is the root cause of the
 * "selector disappears for no reason" bug.
 */

import { isPerfEnabled, mark as perfMark } from '../perf/resourceMonitor.js';

var focusableSelector = 'button, [tabindex], .btn, .card, .nav-item, .library-item, .browsing-hub-item, .row-item, .season-chip, .episode-chip, .detail-setting-chip, .detail-breadcrumb, .detail-breadcrumb-trail__btn, .detail-episode-picker, .detail-link, .detail-file-row, .detail-modal-option, .detail-modal-cancel, .detail-watchlist-btn, .watchlist-row-link, .user-chip, .profile-card, .pin-pad-btn, select, .player-seek-bar, .player-control-pill, .player-stream-pill, .player-menu-option, input.search-input, .search-input';

var ARROW_LEFT = 37;
var ARROW_UP = 38;
var ARROW_RIGHT = 39;
var ARROW_DOWN = 40;

// --- Spatial scoring constants (tune on-device) -------------------------------
// Cross-axis offset is penalised much harder than primary-axis distance so a
// grid moves straight up/down and a row moves straight left/right instead of
// drifting diagonally to a slightly-closer neighbour.
var CROSS_AXIS_PENALTY = 8;
// Flat cost added when the candidate's cross-axis range does not overlap the
// active element's range at all (keeps focus within the current column/row when
// an aligned option exists).
var MISALIGN_PENALTY = 10000;

function navTabIndex(el) {
  if (!el) return 0;
  if (typeof el.tabIndex === 'number' && !isNaN(el.tabIndex)) return el.tabIndex;
  var raw = el.getAttribute && el.getAttribute('tabindex');
  if (raw == null || raw === '') return 0;
  var parsed = parseInt(raw, 10);
  return isNaN(parsed) ? 0 : parsed;
}

function isNavFocusable(el) {
  if (!el || el.disabled) return false;
  if (el.hidden) return false;
  if (navTabIndex(el) < 0) return false;
  // More reliable than offsetParent === null on older Chromium
  if (el.offsetWidth <= 0 && el.offsetHeight <= 0) return false;
  try {
    var style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  } catch (e) { /* ignore — treat as focusable */ }
  return true;
}

var focusableCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

function invalidateFocusableCache() {
  if (focusableCache) focusableCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
}

function getFocusables(container) {
  if (focusableCache && focusableCache.has(container)) {
    return focusableCache.get(container);
  }
  var list = Array.prototype.slice.call(container.querySelectorAll(focusableSelector))
    .filter(isNavFocusable);
  if (focusableCache) focusableCache.set(container, list);
  return list;
}

function focusFirst(container) {
  var list = getFocusables(container);
  if (list.length) list[0].focus();
}

// --- Geometry -----------------------------------------------------------------

function rectOf(el) {
  if (!el || !el.getBoundingClientRect) return null;
  var r = el.getBoundingClientRect();
  if (!r) return null;
  // Degenerate (hidden / not laid out) — caller skips.
  if ((r.width === 0 && r.height === 0)) return null;
  return r;
}

// Is candidate rect `c` strictly in the pressed direction from active rect `a`?
// Uses centre-beyond-edge so equal-row neighbours still qualify horizontally.
function strictlyInDirection(a, c, key) {
  var aCx = a.left + a.width / 2;
  var aCy = a.top + a.height / 2;
  var cCx = c.left + c.width / 2;
  var cCy = c.top + c.height / 2;
  if (key === ARROW_LEFT) return cCx < aCx - 1 && c.right <= a.right;
  if (key === ARROW_RIGHT) return cCx > aCx + 1 && c.left >= a.left;
  if (key === ARROW_UP) return cCy < aCy - 1 && c.bottom <= a.bottom;
  if (key === ARROW_DOWN) return cCy > aCy + 1 && c.top >= a.top;
  return false;
}

// Distance along the axis of travel (how far the move goes).
function primaryAxisGap(a, c, key) {
  if (key === ARROW_LEFT) return a.left - c.right;
  if (key === ARROW_RIGHT) return c.left - a.right;
  if (key === ARROW_UP) return a.top - c.bottom;
  if (key === ARROW_DOWN) return c.top - a.bottom;
  return 0;
}

// How far off the travel axis the candidate sits (drift), plus whether the two
// rects overlap on the cross axis (same column for vertical moves, same row for
// horizontal moves).
function crossAxisOffset(a, c, key) {
  var horizontalMove = key === ARROW_LEFT || key === ARROW_RIGHT;
  var aStart = horizontalMove ? a.top : a.left;
  var aEnd = horizontalMove ? a.bottom : a.right;
  var cStart = horizontalMove ? c.top : c.left;
  var cEnd = horizontalMove ? c.bottom : c.right;
  var aMid = (aStart + aEnd) / 2;
  var cMid = (cStart + cEnd) / 2;
  var offset = Math.abs(cMid - aMid);
  var overlaps = cEnd > aStart && cStart < aEnd;
  return { offset: offset, overlaps: overlaps };
}

function scoreCandidate(a, c, key) {
  var primary = Math.max(0, primaryAxisGap(a, c, key));
  var cross = crossAxisOffset(a, c, key);
  var score = primary + CROSS_AXIS_PENALTY * cross.offset;
  if (!cross.overlaps) score += MISALIGN_PENALTY;
  return score;
}

function isPlayerSeekBar(el) {
  return !!(el && el.classList && el.classList.contains('player-seek-bar'));
}

// The geometric move: nearest focusable in the pressed direction.
function spatialMove(container, key) {
  var active = document.activeElement;
  // The seek bar owns LEFT/RIGHT for scrubbing — let those keys fall through.
  if (isPlayerSeekBar(active) && (key === ARROW_LEFT || key === ARROW_RIGHT)) {
    return null;
  }
  var aRect = rectOf(active);
  if (!aRect) return null;

  var list = getFocusables(container);
  var best = null;
  var bestScore = Infinity;
  for (var i = 0; i < list.length; i++) {
    var c = list[i];
    if (c === active) continue;
    var cRect = rectOf(c);
    if (!cRect) continue;
    if (!strictlyInDirection(aRect, cRect, key)) continue;
    var score = scoreCandidate(aRect, cRect, key);
    if (score < bestScore) { bestScore = score; best = c; }
  }
  return best;
}

function handleKeyNav(container, e) {
  var key = e.keyCode;
  if ([ARROW_LEFT, ARROW_UP, ARROW_RIGHT, ARROW_DOWN].indexOf(key) < 0) return false;
  var target = spatialMove(container, key);
  if (!target) return false;
  e.preventDefault();
  target.focus();
  scrollFocusedIntoView(target);
  return true;
}

// --- Scroll-into-view (unchanged; the only other geometry consumers) ----------

// When the user clicks a focusable with the Magic Remote pointer, we don't
// want the row/page to snap-center the card before navigation kicks in.
// Track recent pointer interactions and skip the scroll-into-view for them.
var recentPointerAt = 0;
function notePointerInteraction() { recentPointerAt = Date.now(); }
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('mousedown', notePointerInteraction, true);
  document.addEventListener('click', notePointerInteraction, true);
}

function scrollNearestVertical(el) {
  if (!el) return;
  var parent = el.parentElement;
  while (parent && parent !== document.documentElement) {
    var style;
    try { style = window.getComputedStyle(parent); } catch (e) { parent = parent.parentElement; continue; }
    var oy = style.overflowY;
    if (oy === 'auto' || oy === 'scroll') {
      var pRect = parent.getBoundingClientRect();
      var eRect = el.getBoundingClientRect();
      // Keep the focused element off the container edges by a margin so rows
      // frame consistently (camera follows focus); clamp to 0 so returning to
      // the first row restores the original top-of-feed position.
      var m = 24;
      if (eRect.top < pRect.top + m) {
        parent.scrollTop -= (pRect.top + m - eRect.top);
        if (parent.scrollTop < 0) parent.scrollTop = 0;
      } else if (eRect.bottom > pRect.bottom - m) {
        parent.scrollTop += (eRect.bottom - (pRect.bottom - m));
      }
      return;
    }
    parent = parent.parentElement;
  }
}

// Smooth RAF-based horizontal scroll for carousels. Cancels mid-flight if the
// same row gets another scroll request (only the newest landing card wins).
// Falls back to instant scroll in environments without requestAnimationFrame (tests).
var _carouselRafs = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
function smoothScrollCarousel(row, target, durationMs) {
  if (typeof requestAnimationFrame === 'undefined') {
    row.scrollLeft = target;
    return;
  }
  if (_carouselRafs) {
    var prev = _carouselRafs.get(row);
    if (prev) { cancelAnimationFrame(prev); _carouselRafs.delete(row); }
  }
  var start = row.scrollLeft;
  var delta = target - start;
  if (Math.abs(delta) < 2) { row.scrollLeft = target; return; }
  var startTime = 0;
  function step(ts) {
    if (!startTime) startTime = ts;
    var t = Math.min((ts - startTime) / durationMs, 1);
    // ease-out cubic
    var eased = 1 - (1 - t) * (1 - t) * (1 - t);
    row.scrollLeft = start + delta * eased;
    if (t < 1) {
      var raf = requestAnimationFrame(step);
      if (_carouselRafs) _carouselRafs.set(row, raf);
    } else if (_carouselRafs) {
      _carouselRafs.delete(row);
    }
  }
  var raf = requestAnimationFrame(step);
  if (_carouselRafs) _carouselRafs.set(row, raf);
}

function scrollFocusedIntoView(el) {
  if (!el) return;
  // If focus arrived via a magic-remote click, don't snap-scroll — let the
  // click handler (navigation) run without a jarring visual shift.
  if (Date.now() - recentPointerAt < 300) return;
  // Chrome 53 (webOS 4) ignores scrollIntoViewOptions — implement manually.

  // Horizontal carousel: center the focused card inside its row-scroll.
  var rowScroll = el.closest ? el.closest('.row-scroll') : null;
  if (rowScroll) {
    var cardLeft = el.offsetLeft;
    var cardWidth = el.offsetWidth || 172;
    var containerWidth = rowScroll.offsetWidth;
    var target = cardLeft - Math.floor((containerWidth - cardWidth) / 2);
    target = Math.max(0, Math.min(target, rowScroll.scrollWidth - containerWidth));
    smoothScrollCarousel(rowScroll, target, 220);
    // Ensure the row itself is vertically visible.
    scrollNearestVertical(rowScroll);
    return;
  }

  // Everything else: nearest vertical scroll (don't move if already visible).
  scrollNearestVertical(el);
}

// --- Focus watchdog -----------------------------------------------------------
// When a re-render removes the focused node, the browser drops focus to <body>.
// We restore it: to the last good element if still usable, else the nearest
// current focusable to where it was, else the first focusable in the container.

function elementConnected(el, container) {
  if (!el) return false;
  if (container && container.contains) return container.contains(el);
  if (typeof el.isConnected === 'boolean') return el.isConnected;
  return true;
}

function nearestToRect(container, rect) {
  if (!rect) return null;
  var list = getFocusables(container);
  var best = null;
  var bestDist = Infinity;
  var cx = rect.left + rect.width / 2;
  var cy = rect.top + rect.height / 2;
  for (var i = 0; i < list.length; i++) {
    var r = rectOf(list[i]);
    if (!r) continue;
    var dx = (r.left + r.width / 2) - cx;
    var dy = (r.top + r.height / 2) - cy;
    var d = dx * dx + dy * dy;
    if (d < bestDist) { bestDist = d; best = list[i]; }
  }
  return best;
}

function restoreFocus(container, lastFocused, lastRect) {
  var active = document.activeElement;
  // Only act when focus is actually lost (on <body> or outside the container).
  var lostToBody = !active || (document.body && active === document.body);
  var outside = active && container && container.contains && !container.contains(active);
  if (!lostToBody && !outside) return;

  if (lastFocused && elementConnected(lastFocused, container) && isNavFocusable(lastFocused)) {
    lastFocused.focus();
    scrollFocusedIntoView(lastFocused);
    return;
  }
  var neighbor = nearestToRect(container, lastRect);
  if (neighbor) {
    neighbor.focus();
    scrollFocusedIntoView(neighbor);
    return;
  }
  focusFirst(container);
}

function scheduleRestore(fn) {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fn);
  else if (typeof setTimeout === 'function') setTimeout(fn, 0);
  else fn();
}

function attachFocusNav(container) {
  var lastFocused = null;
  var lastRect = null;

  function onKey(e) {
    if ([ARROW_LEFT, ARROW_UP, ARROW_RIGHT, ARROW_DOWN].indexOf(e.keyCode) >= 0) {
      var perfOn = isPerfEnabled();
      var keydownT = 0;
      var beforeEl = null;
      if (perfOn) {
        keydownT = (typeof performance !== 'undefined' && performance.now)
          ? performance.now() : Date.now();
        perfMark('input:keydown', { keyCode: e.keyCode });
        beforeEl = document.activeElement;
      }
      handleKeyNav(container, e);
      if (perfOn && typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function () {
          var after = document.activeElement;
          var now = (typeof performance !== 'undefined' && performance.now)
            ? performance.now() : Date.now();
          perfMark('input:focusCommitted', {
            keyCode: e.keyCode,
            moved: after !== beforeEl,
            ms: Math.round(now - keydownT)
          });
        });
      }
    }
  }
  function onFocusIn(ev) {
    var t = ev.target;
    if (!t || !container.contains(t)) return;
    lastFocused = t;
    lastRect = rectOf(t) || lastRect;
    if (t.matches && t.matches(focusableSelector)) scrollFocusedIntoView(t);
  }
  function onFocusOut(ev) {
    // If focus moved to another element inside the app, nothing to recover.
    if (ev && ev.relatedTarget) return;
    scheduleRestore(function () { restoreFocus(container, lastFocused, lastRect); });
  }
  container.addEventListener('keydown', onKey);
  container.addEventListener('focusin', onFocusIn);
  container.addEventListener('focusout', onFocusOut);
  return function detach() {
    container.removeEventListener('keydown', onKey);
    container.removeEventListener('focusin', onFocusIn);
    container.removeEventListener('focusout', onFocusOut);
  };
}

export {
  focusableSelector,
  getFocusables,
  invalidateFocusableCache,
  focusFirst,
  handleKeyNav,
  attachFocusNav,
  scrollFocusedIntoView,
  isNavFocusable,
  spatialMove,
  restoreFocus
};
