import { isPerfEnabled, mark } from '../perf/resourceMonitor.js';
import { timeAnimation } from '../perf/animationTiming.js';
import { sampleFrames } from '../perf/frameJank.js';
import { beginTransition, endTransition } from '../ui/transitionGate.js';
import { tvLog } from '../utils/tvDebug.js';
import { clearPosterUrlMaps } from '../ui/posterImages.js';
import { invalidateFocusableCache, focusFirst } from '../ui/focus.js';
import { exitToLauncher } from '../platform/webos.js';

var routes = {};
var currentRoute = null;
var currentParams = {};
var rootEl = null;
var screenInstance = null;

/** One-shot callback fired after the very first screen factory returns. */
var firstMountCallback = null;

function onFirstMount(cb) {
  firstMountCallback = cb;
}

/**
 * Screen retention ("window stack"), Kodi-style.
 *
 * Instead of tearing down the DOM on every navigation, each retainable screen
 * gets its own host <div> appended to rootEl. Navigating away hides the host
 * (display:none) instead of destroying it; navigating back to a matching
 * route+params re-shows the existing host instantly (no rebuild, no network,
 * no poster re-decode). The stack is capped; the oldest entry is evicted
 * (destroy + remove host) when the cap is exceeded.
 *
 * Each entry: { route, paramsKey, host, instance, retained }.
 *   - retained=true  : kept alive on navigate-away (most browse screens).
 *   - retained=false : transient (player / pairing / profile-picker) — popped
 *                      and destroyed on the next navigation.
 */
var retainStack = [];
var MAX_RETAINED = 3;

// Active video / transient auth must never be kept alive in the background.
var NON_RETAINED_ROUTES = { player: 1, pairing: 1, 'profile-picker': 1 };

/**
 * Logical navigation history ("breadcrumbs"), independent of the DOM
 * retainStack. Every forward navigation pushes the screen we're leaving so
 * that Back always returns to where the user actually came from — instead of
 * the old hardcoded per-route guesses that could land on a blank screen.
 *
 * Each entry: { name, params }. Transient routes (player/pairing/profile-
 * picker) are never pushed — backing out of a detail page must not drop the
 * user back into the video they just left.
 */
var history = [];
var MAX_HISTORY = 30;
var navigatingBack = false;

function paramsKeyFor(params) {
  return JSON.stringify(params || {});
}

function callIfPresent(instance, name) {
  if (instance && typeof instance[name] === 'function') {
    try { instance[name](); } catch (e) { /* ignore */ }
  }
}

function destroyEntry(entry) {
  if (!entry) return;
  if (entry.instance && entry.instance.destroy) {
    try { entry.instance.destroy(); } catch (e) { /* ignore */ }
  }
  if (entry.host && entry.host.parentNode) {
    entry.host.parentNode.removeChild(entry.host);
  }
}

/** Index of a live retained entry matching route+params, or -1. */
function findRetainedIndex(route, paramsKey) {
  var i;
  for (i = 0; i < retainStack.length; i++) {
    var entry = retainStack[i];
    if (entry.retained && entry.route === route && entry.paramsKey === paramsKey) {
      return i;
    }
  }
  return -1;
}

/** Drop transient (non-retained) entries — called as we leave them. */
function popTransientEntries() {
  var kept = [];
  var i;
  for (i = 0; i < retainStack.length; i++) {
    var entry = retainStack[i];
    if (entry.retained) {
      kept.push(entry);
    } else {
      destroyEntry(entry);
    }
  }
  retainStack = kept;
}

/** Evict oldest retained hosts until at most MAX_RETAINED remain. */
function enforceRetentionCap() {
  while (retainStack.length > MAX_RETAINED) {
    var oldest = retainStack.shift();
    destroyEntry(oldest);
  }
}

function register(name, factory) {
  routes[name] = factory;
}

function navigate(name, params, opts) {
  params = params || {};
  opts = opts || {};
  if (currentRoute === name && paramsKeyFor(currentParams) === paramsKeyFor(params)) {
    return;
  }
  // Record the breadcrumb for the screen we're leaving (unless this is a Back
  // step, an explicit replace, or we're leaving a transient route).
  if (!navigatingBack && !opts.replace && currentRoute &&
      !NON_RETAINED_ROUTES[currentRoute]) {
    var top = history[history.length - 1];
    // Navigating straight back to the previous screen? Collapse it instead of
    // pushing a duplicate — prevents A→B→A back-and-forth loops.
    if (top && top.name === name && paramsKeyFor(top.params) === paramsKeyFor(params)) {
      history.pop();
    } else {
      history.push({ name: currentRoute, params: currentParams });
      if (history.length > MAX_HISTORY) history.shift();
    }
  }
  currentRoute = name;
  currentParams = params;
  render();
}

function getRoute() {
  return { name: currentRoute, params: currentParams };
}

var ENTRY_ROUTES = { home: 1, library: 1, watchlist: 1, pairing: 1 };

/**
 * True when Back should exit to the TV Home launcher (LG entry-page behavior).
 */
function shouldExitToLauncher(route, params) {
  if (!route) return true;
  if (route === 'profile-picker') return !(params && params._from);
  return !!ENTRY_ROUTES[route];
}

function back() {
  // Follow the breadcrumb trail back to wherever the user actually came from.
  // Root-screen exit is NOT handled here — quitting the app is driven solely by
  // the global long-press Back/Exit handler in init(). Keeping the launcher-exit
  // out of back() avoids a second exit path (the double-exit pitfall at webos.js:138).
  if (history.length > 0) {
    var prev = history.pop();
    navigatingBack = true;
    try {
      navigate(prev.name, prev.params);
    } finally {
      navigatingBack = false;
    }
  }
}

// webOS remote "Search" key — surface from any screen except the player
// (where it conflicts with playback) and pairing / profile-picker (no server yet).
var SEARCH_KEYCODE = 84;
var SEARCH_BLOCKED_ROUTES = { player: 1, pairing: 1, search: 1, 'profile-picker': 1 };

function isBackKey(e) {
  return e.keyCode === 461 || e.key === 'Backspace' || e.key === 'GoBack';
}

/**
 * Global long-press Back/Exit → quit the app (Google TV pattern; replaces the
 * prohibited exit-confirm modal — see docs/google-tv-live-spec-supplement.md).
 * A short Back navigates one step; holding the remote Back/Exit key for
 * BACK_HOLD_MS quits from anywhere. Auto-repeat keydown events (fired only while
 * the key is physically held) are the hold signal — short taps never arm the
 * exit, so a missed keyup can never quit the app by accident.
 */
var BACK_HOLD_MS = 700;
var backPressStart = 0;
var backDidExit = false;

function init(root) {
  rootEl = root;
  document.addEventListener('keydown', function (e) {
    if (isBackKey(e)) {
      // Swallow Back so the webOS system never exits us to the launcher on its
      // own — exit is driven entirely by the long-press handler below.
      e.preventDefault();
      // Auto-repeat fires only while the key is physically held: once held past
      // the threshold, quit the app from anywhere (Google TV long-press-to-exit).
      if (e.repeat) {
        if (!backDidExit && backPressStart &&
            (Date.now() - backPressStart) >= BACK_HOLD_MS) {
          backDidExit = true;
          exitToLauncher();
        }
        return;
      }
      // Fresh press: arm the hold timer and walk back one step. At a root entry
      // screen (no breadcrumbs) a short Back does nothing — exit is long-press only.
      backPressStart = Date.now();
      backDidExit = false;
      if (history.length > 0) back();
      return;
    }
    if (e.keyCode === SEARCH_KEYCODE && !SEARCH_BLOCKED_ROUTES[currentRoute]) {
      var target = e.target;
      // Don't hijack the key while typing in an input/textarea.
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      e.preventDefault();
      navigate('search', { _from: currentRoute || 'home' });
    }
  });
  // Releasing Back/Exit ends the hold window so the next press starts fresh.
  document.addEventListener('keyup', function (e) {
    if (isBackKey(e)) {
      backPressStart = 0;
      backDidExit = false;
    }
  });
  // Low-memory safeguard: when the app is backgrounded, drop everything but
  // the current (top) screen so we don't hold decoded textures off-screen.
  if (typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden' || document.hidden) {
        trimRetainedToTop();
      }
    });
  }
}

/** Hide every retained host except the given (current) one. */
function hideOtherHosts(activeEntry) {
  var i;
  for (i = 0; i < retainStack.length; i++) {
    var entry = retainStack[i];
    if (entry === activeEntry) continue;
    if (entry.shown) {
      // Remember where focus was before we hide the host — a display:none
      // subtree can't hold focus, so focus would otherwise fall to <body>
      // and Back would land focus-less. We restore this on re-show.
      entry.savedFocus = (entry.host && document.activeElement &&
        entry.host.contains(document.activeElement)) ? document.activeElement : null;
      entry.shown = false;
      callIfPresent(entry.instance, 'onSuspend');
    }
    if (entry.host) entry.host.style.display = 'none';
  }
}

/** Put focus back where it was when this entry was last hidden. */
function restoreEntryFocus(entry) {
  if (!entry || !entry.host) return;
  var saved = entry.savedFocus;
  // Still attached to this (now visible) host and focusable? Restore it.
  if (saved && entry.host.contains(saved) && typeof saved.focus === 'function' &&
      (saved.offsetWidth > 0 || saved.offsetHeight > 0)) {
    saved.focus();
    if (document.activeElement === saved) return;
  }
  // Fall back to the first focusable in the host so Back is never focus-less.
  focusFirst(entry.host);
}

/** Re-show a retained entry instantly — no rebuild, no network, no re-decode. */
function showRetainedEntry(entry, perfOn) {
  if (perfOn) mark('screen:enter', { route: entry.route });
  var startedAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;

  hideOtherHosts(entry);
  if (entry.host) entry.host.style.display = '';
  screenInstance = entry.instance;
  if (!entry.shown) {
    entry.shown = true;
    callIfPresent(entry.instance, 'onResume');
  }
  invalidateFocusableCache();
  // Restore D-pad focus to where the user left this screen — the whole point
  // of retention is that Back feels like the screen never went away.
  restoreEntryFocus(entry);

  // Move the re-shown entry to the top of the stack (most-recent).
  var idx = retainStack.indexOf(entry);
  if (idx >= 0) {
    retainStack.splice(idx, 1);
    retainStack.push(entry);
  }

  if (perfOn) {
    var elapsed = startedAt ? Math.round(performance.now() - startedAt) : 0;
    mark('route:render', { route: entry.route, renderMs: elapsed, retained: true });
    tvLog('perf', 'route:render', { route: entry.route, renderMs: elapsed, retained: true });
    schedulePaintMark(entry.route);
  }
}

function schedulePaintMark(route) {
  if (typeof requestAnimationFrame !== 'function') return;
  requestAnimationFrame(function () {
    if (currentRoute === route) {
      mark('screen:firstPaint', { route: route });
      tvLog('perf', 'screen:firstPaint', { route: route });
    }
  });
}

/**
 * "Full paint" ≠ first paint: first paint (one rAF above) fires as soon as the
 * DOM is committed, before any <img> in the new screen has actually decoded.
 * On the B8 the poster decode is exactly where jank hides, so this waits for
 * every <img> already in the DOM at build time to finish loading (bounded by
 * FULL_PAINT_TIMEOUT_MS so a slow/broken image can't wedge the mark forever),
 * then reports elapsed-since-build plus how many images were still pending at
 * the cutoff — a direct signal for "this screen is slow because of images".
 * Images added later (lazy rows, deferred rails) are NOT tracked here; this is
 * a build-time snapshot, not a full lifecycle observer.
 */
var FULL_PAINT_TIMEOUT_MS = 4000;
function scheduleContentPaintMark(host, route, buildStartedAt) {
  if (!host || typeof host.querySelectorAll !== 'function') return;
  var imgs = host.querySelectorAll('img');
  var pending = 0;
  var settled = false;
  var i;
  for (i = 0; i < imgs.length; i++) {
    if (!imgs[i].complete) pending++;
  }
  function report(timedOut) {
    if (settled) return;
    settled = true;
    var elapsed = Math.round(nowMsSafe() - buildStartedAt);
    var payload = { route: route, elapsedMs: elapsed, imageCount: imgs.length, pendingAtCutoff: pending, timedOut: !!timedOut };
    mark('screen:contentPainted', payload);
    tvLog('perf', 'screen:contentPainted', payload);
  }
  if (pending === 0) {
    // Nothing to wait for — still measure on the next rAF so the number
    // reflects committed layout, not just synchronous script time.
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function () { report(false); });
    } else {
      report(false);
    }
    return;
  }
  var remaining = pending;
  function onSettle() {
    remaining--;
    if (remaining <= 0) report(false);
  }
  for (i = 0; i < imgs.length; i++) {
    if (imgs[i].complete) continue;
    imgs[i].addEventListener('load', onSettle, { once: true });
    imgs[i].addEventListener('error', onSettle, { once: true });
  }
  setTimeout(function () { report(true); }, FULL_PAINT_TIMEOUT_MS);
}

function nowMsSafe() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

function render() {
  if (!rootEl || !routes[currentRoute]) return;
  var perfOn = isPerfEnabled();

  // Leaving the previous screen: drop transient entries (player/pairing/etc.)
  // and suspend/hide retained ones.
  popTransientEntries();

  var paramsKey = paramsKeyFor(currentParams);
  var isRetainable = !NON_RETAINED_ROUTES[currentRoute];

  // HIT: a retained host already matches this route+params — re-show it.
  if (isRetainable) {
    var hitIdx = findRetainedIndex(currentRoute, paramsKey);
    if (hitIdx >= 0) {
      showRetainedEntry(retainStack[hitIdx], perfOn);
      return;
    }
  }

  // MISS: build fresh into a new host.
  if (perfOn) mark('screen:enter', { route: currentRoute });
  var startedAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;

  // Open the protected transition window BEFORE the screen builds: everything
  // heavy the build kicks off (poster decode, hero backdrop) queues behind
  // onIdle instead of competing with the enter fade + first input. Closed
  // early by the fade's animationend below; the gate's own safety timeout
  // covers the no-animation paths (caps-motion off, cancelled).
  beginTransition(400);
  // Jank scoreboard: sample rAF gaps through the transition + hydration
  // window so every navigation gets a dropped-frames number in tv.log.
  sampleFrames('jank:navigation', { route: currentRoute });

  var host = document.createElement('div');
  // Cross-screen fade-through: a freshly-built screen fades in (opacity-only,
  // compositor, caps-motion-gated in CSS). Retained Back re-shows are NOT
  // re-animated — they snap instantly, keeping the retention promise that Back
  // feels like the screen never went away.
  host.className = 'screen-host screen-host--enter';
  host.setAttribute('data-route', currentRoute);
  rootEl.appendChild(host);
  // Only fires when html.caps-motion is present (the CSS animation only runs
  // there); on a non-motion engine there's no animationend to time, so the
  // listener just sits idle and is GC'd with the host on next navigation.
  if (document.documentElement.classList.contains('caps-motion')) {
    timeAnimation(host, 'anim:screen-enter-fade', { route: currentRoute });
    host.addEventListener('animationend', function onFadeEnd(e) {
      if (e.target !== host) return;
      host.removeEventListener('animationend', onFadeEnd);
      // Drop the animation class once the fade completes so a retained host
      // (which can live for the rest of the session) doesn't keep an
      // unnecessary compositor layer promoted.
      host.classList.remove('screen-host--enter');
      // Fade is done — release the deferred heavy work (poster queue etc.).
      endTransition();
    });
  }

  var entry = {
    route: currentRoute,
    paramsKey: paramsKey,
    host: host,
    instance: null,
    retained: isRetainable,
    shown: true
  };

  // Hide/suspend other live hosts before building the new one.
  hideOtherHosts(entry);
  retainStack.push(entry);

  invalidateFocusableCache();
  entry.instance = routes[currentRoute](host, currentParams, navigate);
  screenInstance = entry.instance;

  // Fire the one-shot first-mount hook (used by the splash screen).
  if (firstMountCallback) {
    var cb = firstMountCallback;
    firstMountCallback = null;
    try { cb(); } catch (e) { /* ignore */ }
  }

  enforceRetentionCap();

  // Content paint (images decoding) is measured unconditionally — mark()/
  // tvLog() self-gate on the perf/debug flags, so this is a cheap no-op
  // listener setup when neither is enabled.
  scheduleContentPaintMark(host, currentRoute, startedAt || nowMsSafe());

  if (perfOn) {
    var elapsed = startedAt ? Math.round(performance.now() - startedAt) : 0;
    mark('route:render', { route: currentRoute, renderMs: elapsed });
    tvLog('perf', 'route:render', { route: currentRoute, renderMs: elapsed });
    schedulePaintMark(currentRoute);
  }
}

/** Trim the retained stack down to just the current (top) screen. */
function trimRetainedToTop() {
  if (retainStack.length <= 1) return;
  var top = retainStack[retainStack.length - 1];
  var i;
  for (i = 0; i < retainStack.length; i++) {
    if (retainStack[i] !== top) destroyEntry(retainStack[i]);
  }
  retainStack = top ? [top] : [];
}

/**
 * Wipe retained hosts on a full reset (user-switch / sign-out). Keeps the
 * currently-visible (top) screen intact so a mid-bootstrap user-switch does
 * not blank the screen; only the off-screen retained hosts are discarded.
 * Also flushes the poster URL maps (revoking object URLs) since the cached
 * bytes belong to the outgoing user/session.
 */
function invalidateRetention() {
  trimRetainedToTop();
  history = [];
  backPressStart = 0;
  backDidExit = false;
  clearPosterUrlMaps();
}

export {
  register,
  navigate,
  getRoute,
  back,
  init,
  onFirstMount,
  shouldExitToLauncher,
  invalidateRetention
};
