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
import { sampleFrames } from '../perf/frameJank.js';

// Score the SMOOTHNESS of a D-pad glide, not just the latency to commit focus.
// The existing input:keydown/input:focusCommitted marks (attachFocusNav) time
// keydown → the frame focus lands — but the glide that follows writes
// scrollLeft/scrollTop every frame for 150ms (a per-frame layout on Chrome 53),
// and whether THAT holds 60fps is the "does moving along the rail feel smooth"
// question. Fire the rAF sampler over a short window covering the glide.
// Throttled: holding an arrow fires a glide per repeat, so one window per burst
// (ignore new starts while a window is still open) keeps it to a single
// representative number instead of dozens of superseded fragments. Self-gates
// (no-op unless perf/debug is on) and dual-gated, so it reaches tv.log in a
// plain debug session — unlike the perfMark-only input:* latency marks.
var RAIL_SAMPLE_WINDOW = 500;
var _railSampleAt = 0;
function sampleGlide(axis) {
  var now = (typeof performance !== 'undefined' && performance.now)
    ? performance.now() : Date.now();
  if (now - _railSampleAt < RAIL_SAMPLE_WINDOW) return; // mid-burst; already sampling
  _railSampleAt = now;
  sampleFrames('jank:rail-scroll', { axis: axis }, RAIL_SAMPLE_WINDOW);
}

// Snappy gliding D-pad scroll — a short rAF ease-out glide on EVERY engine,
// including webOS 4 / Chromium 53. Gliding scroll was always viable on that
// engine: requestAnimationFrame shipped in Chrome 24, and LG's own Enact
// framework glided via GPU transforms. Only the *declarative*
// `scroll-behavior: smooth` CSS was post-53; the capability was never missing.
// Kept short (150ms) so it reads snappy, not floaty. In-flight glides cancel
// (see smoothScroll*), so a held d-pad smoothly chases focus instead of
// queueing. If profiling ever shows the per-frame scrollLeft/scrollTop reflow
// stutters on the B8, the period-correct upgrade is a translate3d track (the
// Enact approach) — but the app shipped a 220ms rAF glide here without jank.
var NAV_SCROLL_MS = 150;

var focusableSelector = 'button, [tabindex], .btn, .card, .nav-item, .library-item, .browsing-hub-item, .row-item, .season-chip, .episode-chip, .detail-setting-chip, .detail-breadcrumb, .detail-breadcrumb-trail__btn, .detail-episode-picker, .detail-link, .detail-file-row, .detail-modal-cancel, .detail-watchlist-btn, .watchlist-row-link, .user-chip, .profile-card, .pin-pad-btn, select, .player-seek-bar, .player-control-pill, .player-stream-pill, .player-menu-option, input.search-input, .search-input';

var ARROW_LEFT = 37;
var ARROW_UP = 38;
var ARROW_RIGHT = 39;
var ARROW_DOWN = 40;

// ── Native text-input keyboard ownership ────────────────────────────────────
// When a live <input>/<textarea> is the active field, the webOS on-screen
// keyboard's editing keys must act on the FIELD, not the app: Left/Right move
// the cursor and Back/Backspace deletes a character. Two things otherwise
// hijack them — the geometric d-pad engine below (arrows → move focus) and the
// router's global Back handler (461/Backspace → navigate back). Both listen on
// `document`, so a single capture-phase listener on `window` (which runs first
// in the capture path) can claim these keys and stopImmediatePropagation so
// neither downstream handler sees them. Up/Down/Enter/Esc are intentionally
// left to flow through, so the user can still leave the field and submit.
// (The modal text inputs solve this with their own scoped handler; this is the
// equivalent for native inputs that live inside the focus nav, e.g. search.)
var KEY_BACKSPACE = 8;
var KEY_BACK = 461;
var EDITABLE_INPUT_TYPES = {
  text: 1, search: 1, url: 1, tel: 1, email: 1, password: 1, number: 1, '': 1
};

function isEditableTextInput(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.isContentEditable) return true;
  var tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag !== 'INPUT') return false;
  return !!EDITABLE_INPUT_TYPES[(el.getAttribute('type') || '').toLowerCase()];
}

// The field that owns keyboard input. Tracked rather than read live from
// document.activeElement because the webOS keyboard can pull DOM focus onto
// <body> while it is open — we must keep editing the field in that window.
var activeEditable = null;

function editTarget() {
  if (isEditableTextInput(document.activeElement)) return document.activeElement;
  // Keyboard-stole-focus case: only honour the tracked field while focus has
  // genuinely collapsed (to body/null), never when a real nav element is
  // focused — otherwise a Backspace on a card would edit the search box.
  var a = document.activeElement;
  var collapsed = !a || a === document.body;
  if (collapsed && activeEditable && document.contains(activeEditable)) return activeEditable;
  return null;
}

function moveInputCursor(el, delta) {
  try {
    var pos = (el.selectionStart == null ? el.value.length : el.selectionStart) + delta;
    pos = Math.max(0, Math.min(pos, el.value.length));
    el.setSelectionRange(pos, pos);
  } catch (e) { /* some input types reject selection APIs — ignore */ }
}

function deleteInputChar(el) {
  var v = el.value;
  var s, end;
  try { s = el.selectionStart; end = el.selectionEnd; }
  catch (e) { s = end = v.length; }
  if (s == null) { s = end = v.length; }
  if (s !== end) {
    el.value = v.slice(0, s) + v.slice(end);
    try { el.setSelectionRange(s, s); } catch (e) {}
  } else if (s > 0) {
    el.value = v.slice(0, s - 1) + v.slice(s);
    try { el.setSelectionRange(s - 1, s - 1); } catch (e) {}
  } else {
    return; // nothing to delete; let the key fall through (e.g. Back navigates)
  }
  // Programmatic value changes don't fire 'input' — dispatch so live search and
  // any other input listeners stay in sync.
  try { el.dispatchEvent(new Event('input', { bubbles: true })); }
  catch (e) {
    var ev = document.createEvent('Event');
    ev.initEvent('input', true, false);
    el.dispatchEvent(ev);
  }
}

// Build a keydown event that reliably carries keyCode/which 13 on Chrome 53.
// The KeyboardEvent constructor and initKeyboardEvent both leave keyCode at 0
// on that engine, so force the legacy fields with defineProperty — element
// handlers (e.g. searchScreen) gate on `e.keyCode === 13`.
function makeEnterKeydown() {
  var ev;
  try { ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }); }
  catch (err) {
    ev = document.createEvent('Event');
    ev.initEvent('keydown', true, true);
  }
  try {
    Object.defineProperty(ev, 'keyCode', { value: 13, configurable: true });
    Object.defineProperty(ev, 'which', { value: 13, configurable: true });
    if (ev.key !== 'Enter') Object.defineProperty(ev, 'key', { value: 'Enter', configurable: true });
  } catch (err2) { /* read-only on some engines — key string still set above */ }
  ev.__syntheticEnter = true;
  return ev;
}

function onEditableKeydown(e) {
  // Never re-process our own synthetic Enter (prevents any dispatch loop).
  if (e.__syntheticEnter) return;
  var el = editTarget();
  if (!el) return;
  var code = e.keyCode || e.which;
  var k = e.key; // some webOS events carry only the key string, keyCode 0
  var isLeft = code === ARROW_LEFT || k === 'ArrowLeft' || k === 'Left';
  var isRight = code === ARROW_RIGHT || k === 'ArrowRight' || k === 'Right';
  // The router treats both keyCode 461 and key 'Backspace'/'GoBack' as Back, so
  // the guard must claim the same signals to win the delete.
  var isDelete = code === KEY_BACK || code === KEY_BACKSPACE ||
    k === 'Backspace' || k === 'Delete' || k === 'GoBack';
  if (isLeft) {
    e.preventDefault(); e.stopImmediatePropagation(); moveInputCursor(el, -1); return;
  }
  if (isRight) {
    e.preventDefault(); e.stopImmediatePropagation(); moveInputCursor(el, 1); return;
  }
  if (isDelete) {
    // Only swallow when there is actually something to delete; an empty field
    // lets Back bubble through so the user can still leave the screen.
    var v = el.value, s;
    try { s = el.selectionStart; } catch (err) { s = v.length; }
    if (v && (s == null || s > 0 || el.selectionStart !== el.selectionEnd)) {
      e.preventDefault(); e.stopImmediatePropagation(); deleteInputChar(el); return;
    }
  }
  // Enter — only intervene in the focus-stolen case (webOS keyboard pulled focus
  // to <body>). When the field truly owns DOM focus its own element-level keydown
  // handler fires normally; dispatching again would double-submit. When focus is
  // on <body> the element handler never fires, so we re-dispatch a synthetic
  // keydown(13) to the tracked field so screen-level handlers (e.g. searchScreen)
  // pick it up as if the element had focus.
  var isEnter = code === 13 || k === 'Enter';
  if (isEnter) {
    var a = document.activeElement;
    var focusStolen = !a || a === document.body;
    if (focusStolen && el === activeEditable) {
      // Claim the event so it doesn't also reach nav/router as an OK press.
      e.preventDefault(); e.stopImmediatePropagation();
      el.dispatchEvent(makeEnterKeydown());
      return;
    }
    // Field genuinely holds focus — let the event flow to its own element handler.
    return;
  }
  // Up/Down/Esc and everything else fall through to nav + router.
}

function onEditableFocusIn(e) {
  var t = e.target;
  if (isEditableTextInput(t)) { activeEditable = t; return; }
  // A real (non-body) element took focus → we've left the field.
  if (t && t.nodeType === 1 && t !== document.body) activeEditable = null;
}

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('keydown', onEditableKeydown, true);
  document.addEventListener('focusin', onEditableFocusIn, true);
}

// --- Declarative nav overrides ------------------------------------------------
// Two ways to pin a specific element as the target for a direction:
//
//   1. HTML attribute on the source element:
//        <button data-nav-right="#my-other-btn">…</button>
//      Accepts any CSS selector; evaluated live so dynamic content works.
//
//   2. JS programmatic map (for elements you can't easily annotate):
//        import { addNavOverride } from './focus.js';
//        addNavOverride('.sidebar-item--last', ARROW_RIGHT, '.content-first-card');
//
// Overrides are checked before the geometric scorer. Unresolved selectors
// (element not in DOM or not focusable) fall through to geometry.

var _navOverrides = []; // [{ fromSel, dir, toSel }]

function addNavOverride(fromSel, directionKey, toSel) {
  _navOverrides.push({ fromSel: fromSel, dir: directionKey, toSel: toSel });
}

function clearNavOverrides() { _navOverrides = []; }

var _dirAttr = {};
_dirAttr[37] = 'data-nav-left';
_dirAttr[38] = 'data-nav-up';
_dirAttr[39] = 'data-nav-right';
_dirAttr[40] = 'data-nav-down';

function resolveNavOverride(active, key) {
  if (!active) return null;
  // 1. data-nav-* attribute on the element itself
  var attr = _dirAttr[key];
  if (attr) {
    var sel = active.getAttribute(attr);
    if (sel) {
      try {
        var el = document.querySelector(sel);
        if (el && isNavFocusable(el)) return el;
      } catch (e) { /* invalid selector — ignore */ }
    }
  }
  // 2. Programmatic override map
  for (var i = 0; i < _navOverrides.length; i++) {
    var ov = _navOverrides[i];
    if (ov.dir !== key) continue;
    try {
      if (!active.matches(ov.fromSel)) continue;
      var target = document.querySelector(ov.toSel);
      if (target && isNavFocusable(target)) return target;
    } catch (e) { /* invalid selector — ignore */ }
  }
  return null;
}

// --- Spatial scoring constants -------------------------------------------
// score = primaryAxisGap + GAP_PENALTY × cross-axis-edge-gap
//
// Primary distance (how far the move goes) dominates. The cross-axis term
// only kicks in when the candidate is outside the active element's column/row
// (edge-to-edge gap > 0); elements that overlap horizontally/vertically have
// zero extra penalty and compete purely on vertical/horizontal proximity.
//
// GAP_PENALTY = 1 keeps column-following for grids (same-column wins by a
// small margin) while letting a much-closer off-column element beat a
// far-away same-column element — fixing the cast-card→action-button case
// where 580 px of vertical proximity advantage was overwhelmed by the old
// flat 10 000-pt or 30-pt/px gap terms. The sidebar guard (isInSideNav) is
// independent and keeps the sidebar unreachable via Up/Down.
var GAP_PENALTY = 1;

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
  if (key === ARROW_UP) return cCy < aCy - 1 && c.bottom <= a.top;
  if (key === ARROW_DOWN) return cCy > aCy + 1 && c.top >= a.bottom;
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

// How far off the travel axis the candidate sits (drift), whether the two rects
// overlap on the cross axis, and the edge-to-edge gap when they don't.
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
  // Edge-to-edge gap: 0 when overlapping, positive distance otherwise.
  var gap = overlaps ? 0 : Math.max(cStart - aEnd, aStart - cEnd);
  return { offset: offset, overlaps: overlaps, gap: gap };
}

function scoreCandidate(a, c, key) {
  var primary = Math.max(0, primaryAxisGap(a, c, key));
  var cross = crossAxisOffset(a, c, key);
  // Overlapping elements (gap=0) sort purely by primary distance — no cross
  // penalty at all. Non-overlapping elements pay GAP_PENALTY per pixel of
  // edge-to-edge gap, so column-preference is preserved without the
  // center-to-center term that previously overwhelmed primary proximity.
  // Tiny center-alignment tiebreaker (0.001×) so equal-gap candidates sort
  // by cross-axis center distance rather than arbitrary DOM order.
  return primary + GAP_PENALTY * cross.gap + 0.001 * cross.offset;
}

function isPlayerSeekBar(el) {
  return !!(el && el.classList && el.classList.contains('player-seek-bar'));
}

// Is el inside the sidebar (browsing-hub-nav-host)?
// Used to block vertical D-pad from jumping across the sidebar/content boundary.
// Memoised per element: side-nav membership never changes for a node's lifetime,
// and spatialMove() asks this of every candidate on every vertical keypress — the
// raw .closest() walk was a DOM-root traversal per card (60+ on Home).
var _sideNavMemo = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
function sideNavHostOf(el) {
  if (!el || !el.closest) return null;
  if (_sideNavMemo && _sideNavMemo.has(el)) return _sideNavMemo.get(el);
  var host = el.closest('.browsing-hub-nav-host') || null;
  if (_sideNavMemo) _sideNavMemo.set(el, host);
  return host;
}
function isInSideNav(el) {
  return !!sideNavHostOf(el);
}

// The geometric move: nearest focusable in the pressed direction.
function spatialMove(container, key) {
  var active = document.activeElement;
  // The seek bar owns LEFT/RIGHT for scrubbing — let those keys fall through.
  if (isPlayerSeekBar(active) && (key === ARROW_LEFT || key === ARROW_RIGHT)) {
    return null;
  }
  // Declarative override wins over geometry.
  var override = resolveNavOverride(active, key);
  if (override) return override;
  var aRect = rectOf(active);
  if (!aRect) return null;

  var activeHost = sideNavHostOf(active);
  var activeSideNav = !!activeHost;
  // Moving UP/DOWN inside the sidebar never leaves it, so only the sidebar's
  // own ~8 items are real candidates. Scoping the query to the host avoids
  // measuring getBoundingClientRect() on every card on the screen (60+ on Home)
  // just to discard them via the cross-boundary guard below — the dominant cost
  // of the "laggy sidebar" while traversing it.
  var scope = container;
  if (activeSideNav && (key === ARROW_UP || key === ARROW_DOWN)) scope = activeHost;
  var list = getFocusables(scope);
  var best = null;
  var bestScore = Infinity;
  for (var i = 0; i < list.length; i++) {
    var c = list[i];
    if (c === active) continue;
    var cRect = rectOf(c);
    if (!cRect) continue;
    if (!strictlyInDirection(aRect, cRect, key)) continue;
    // Up/Down never crosses the sidebar/content boundary — sidebar is only
    // reachable via Left. Without this, the sidebar wins when no content
    // candidate exists above/below the focused element (e.g. at the top of
    // a scrolled detail screen), scoring just 10k penalty over 0 penalty.
    if ((key === ARROW_UP || key === ARROW_DOWN) && isInSideNav(c) !== activeSideNav) continue;
    var score = scoreCandidate(aRect, cRect, key);
    if (score < bestScore) { bestScore = score; best = c; }
  }
  // LEFT that crosses from main content INTO the sidebar should always land on
  // the TOP nav item (Home), not the geometrically-nearest one — otherwise the
  // selector jumps to whatever item happens to sit at the card's vertical
  // position (Search, a library, …), which reads as random. When the leftmost
  // content's only LEFT move is "open the sidebar", that move means "go to nav",
  // and nav starts at the top. (Moving LEFT *within* the sidebar has no
  // candidate, so this never hijacks intra-sidebar navigation.)
  if (key === ARROW_LEFT && !activeSideNav && best && isInSideNav(best)) {
    var hubHost = sideNavHostOf(best);
    var firstHub = hubHost && hubHost.querySelector('.browsing-hub-item');
    if (firstHub && isNavFocusable(firstHub)) return firstHub;
  }
  return best;
}

function handleKeyNav(container, e) {
  var key = e.keyCode;
  if ([ARROW_LEFT, ARROW_UP, ARROW_RIGHT, ARROW_DOWN].indexOf(key) < 0) return false;
  var target = spatialMove(container, key);
  if (!target) {
    // Vertical key with no candidate: if focus is in the main content (not
    // the sidebar), eat the event so the webOS platform navigator can't
    // jump laterally to the sidebar when the user is at the content boundary.
    if ((key === ARROW_UP || key === ARROW_DOWN) && !isInSideNav(document.activeElement)) {
      e.preventDefault();
    }
    return false;
  }
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
  if (durationMs <= 0 || typeof requestAnimationFrame === 'undefined') {
    // Cancel any in-flight glide so a queued frame can't overwrite the jump.
    if (_carouselRafs) {
      var inflight = _carouselRafs.get(row);
      if (inflight) { cancelAnimationFrame(inflight); _carouselRafs.delete(row); }
    }
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
  sampleGlide('horizontal');
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

// Smooth RAF-based vertical scroll — the same ease-out-cubic 220ms motion the
// carousel uses for left/right, applied to scrollTop so moving between rails
// animates identically. Cancels mid-flight if the same scroller gets another
// request. Falls back to instant scroll without requestAnimationFrame (tests).
var _vScrollRafs = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
function smoothScrollVertical(scroller, target, durationMs) {
  if (durationMs <= 0 || typeof requestAnimationFrame === 'undefined') {
    if (_vScrollRafs) {
      var inflight = _vScrollRafs.get(scroller);
      if (inflight) { cancelAnimationFrame(inflight); _vScrollRafs.delete(scroller); }
    }
    scroller.scrollTop = target;
    return;
  }
  if (_vScrollRafs) {
    var prev = _vScrollRafs.get(scroller);
    if (prev) { cancelAnimationFrame(prev); _vScrollRafs.delete(scroller); }
  }
  var start = scroller.scrollTop;
  var delta = target - start;
  if (Math.abs(delta) < 2) { scroller.scrollTop = target; return; }
  sampleGlide('vertical');
  var startTime = 0;
  function step(ts) {
    if (!startTime) startTime = ts;
    var t = Math.min((ts - startTime) / durationMs, 1);
    // ease-out cubic
    var eased = 1 - (1 - t) * (1 - t) * (1 - t);
    scroller.scrollTop = start + delta * eased;
    if (t < 1) {
      var raf = requestAnimationFrame(step);
      if (_vScrollRafs) _vScrollRafs.set(scroller, raf);
    } else if (_vScrollRafs) {
      _vScrollRafs.delete(scroller);
    }
  }
  var raf = requestAnimationFrame(step);
  if (_vScrollRafs) _vScrollRafs.set(scroller, raf);
}

// Distance of `child`'s top from the top of `scroller`'s scroll content,
// summing offsetTop up the offsetParent chain (robust when the scroller is
// not the direct offsetParent).
function topWithinScroller(child, scroller) {
  var t = 0;
  var n = child;
  while (n && n !== scroller && n.offsetParent) {
    t += n.offsetTop;
    n = n.offsetParent;
  }
  return t;
}

// Anchored home-feed rail scroll: the focused rail is pinned to a FIXED
// vertical slot — the natural resting position of the first rail. Moving the
// selector DOWN to the next rail scrolls the whole feed up so the new rail
// slides into that same slot, pushing the previous rail off the top (under the
// immersive hero). The selector itself never moves vertically. Returns true if
// it handled the scroll, false if `el` isn't in an anchored home feed.
function scrollHomeRailAnchored(el) {
  var feed = el.closest ? el.closest('.home-feed') : null;
  var section = el.closest ? el.closest('.row-section') : null;
  if (!feed || !section) return false;
  var firstSection = feed.querySelector('.row-section');
  if (!firstSection) return false;
  // scrollTop that lands `section`'s top exactly where the first rail's top
  // sits at scrollTop 0 — i.e. their content-space distance.
  var target = topWithinScroller(section, feed) - topWithinScroller(firstSection, feed);
  var maxScroll = feed.scrollHeight - feed.clientHeight;
  if (target < 0) target = 0;
  if (maxScroll >= 0 && target > maxScroll) target = maxScroll;
  // Same motion as the horizontal carousel: a short glide on capable engines,
  // an instant jump on webOS 4 / Chromium 53 for snappy rail-to-rail movement.
  smoothScrollVertical(feed, target, NAV_SCROLL_MS);
  return true;
}

// One card's horizontal advance (card width + gap) measured from the rendered
// siblings, so the anchored-slot scroll snaps exactly to the grid pitch. Falls
// back to a poster-width estimate when the card has no rendered neighbour.
function railPitch(el) {
  function adjacentCard(node, dir) {
    var n = dir > 0 ? node.nextElementSibling : node.previousElementSibling;
    while (n && (!n.getAttribute || n.getAttribute('data-item-index') == null)) {
      n = dir > 0 ? n.nextElementSibling : n.previousElementSibling;
    }
    return n;
  }
  var nx = adjacentCard(el, 1);
  if (nx) return Math.abs(nx.offsetLeft - el.offsetLeft);
  var pv = adjacentCard(el, -1);
  if (pv) return Math.abs(el.offsetLeft - pv.offsetLeft);
  return (el.offsetWidth || 248) + 40;
}

function scrollFocusedIntoView(el) {
  if (!el) return;
  // If focus arrived via a magic-remote click, don't snap-scroll — let the
  // click handler (navigation) run without a jarring visual shift.
  if (Date.now() - recentPointerAt < 300) return;
  // Chrome 53 (webOS 4) ignores scrollIntoViewOptions — implement manually.

  // Horizontal carousel.
  var rowScroll = el.closest ? el.closest('.row-scroll') : null;
  if (rowScroll) {
    var containerWidth = rowScroll.offsetWidth;
    var target;
    if (el.closest && el.closest('.home-feed')) {
      // Home rails: anchored-slot scroll. The selector stays pinned on a fixed
      // column (the 3rd slot); the first 3 cards sit at scrollLeft 0, and from
      // the 4th card on the rail shifts left in whole card-pitch steps so the
      // focused card lands on that slot. Snapping to the pitch keeps every rail
      // aligned to the 12-column grid (no half-card centring drift).
      var idx = parseInt(el.getAttribute('data-item-index'), 10);
      if (isNaN(idx)) idx = 0;
      var ANCHOR_SLOT = 2; // 0-based → the third visible card
      target = (idx - ANCHOR_SLOT) * railPitch(el);
    } else {
      // Other rails (library/detail): center the focused card.
      var cardLeft = el.offsetLeft;
      var cardWidth = el.offsetWidth || 172;
      target = cardLeft - Math.floor((containerWidth - cardWidth) / 2);
    }
    target = Math.max(0, Math.min(target, rowScroll.scrollWidth - containerWidth));
    smoothScrollCarousel(rowScroll, target, NAV_SCROLL_MS);
    // Vertical: anchor the rail to its fixed slot on the home feed, else fall
    // back to the edge-margin "camera follows focus" scroll for other lists.
    if (!scrollHomeRailAnchored(el)) scrollNearestVertical(rowScroll);
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

// Returns all valid candidates in `key` direction from current active element,
// each annotated with their score. Used by the focus-debug overlay to label arrows.
function getScoredCandidates(container, key) {
  var active = document.activeElement;
  var aRect = active && rectOf(active);
  if (!aRect) return [];
  var activeSideNav = isInSideNav(active);
  var list = getFocusables(container);
  var results = [];
  for (var i = 0; i < list.length; i++) {
    var c = list[i];
    if (c === active) continue;
    var cRect = rectOf(c);
    if (!cRect) continue;
    if (!strictlyInDirection(aRect, cRect, key)) continue;
    if ((key === ARROW_UP || key === ARROW_DOWN) && isInSideNav(c) !== activeSideNav) continue;
    results.push({ el: c, rect: cRect, score: Math.round(scoreCandidate(aRect, cRect, key)) });
  }
  results.sort(function (a, b) { return a.score - b.score; });
  return results;
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
  getScoredCandidates,
  restoreFocus,
  addNavOverride,
  clearNavOverrides
};
