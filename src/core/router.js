import { isPerfEnabled, mark } from '../perf/resourceMonitor.js';
import { clearPosterUrlMaps } from '../ui/posterImages.js';
import { invalidateFocusableCache, focusFirst } from '../ui/focus.js';
import { exitToLauncher } from '../platform/webos.js';

var routes = {};
var currentRoute = null;
var currentParams = {};
var rootEl = null;
var screenInstance = null;

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

function navigate(name, params) {
  params = params || {};
  if (currentRoute === name && paramsKeyFor(currentParams) === paramsKeyFor(params)) {
    return;
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
  if (currentRoute === 'detail') {
    if (currentParams && currentParams.parentDetail && currentParams.parentDetail.ratingKey) {
      navigate('detail', currentParams.parentDetail);
      return;
    }
    navigate('library', {});
    return;
  }
  if (currentRoute === 'player') {
    navigate('detail', currentParams._detail || {});
    return;
  }
  if (currentRoute === 'settings') {
    navigate(currentParams._from || 'library', {});
    return;
  }
  if (currentRoute === 'search') {
    navigate(currentParams._from || 'home', {});
    return;
  }
  if (currentRoute === 'design-review') {
    navigate(currentParams._from || 'settings', {});
    return;
  }
  if (currentRoute === 'profile-picker') {
    if (currentParams._from) {
      navigate(currentParams._from, {});
    }
    return;
  }
  if (shouldExitToLauncher(currentRoute, currentParams)) {
    exitToLauncher();
  }
}

// webOS remote "Search" key — surface from any screen except the player
// (where it conflicts with playback) and pairing / profile-picker (no server yet).
var SEARCH_KEYCODE = 84;
var SEARCH_BLOCKED_ROUTES = { player: 1, pairing: 1, search: 1, 'profile-picker': 1 };

function init(root) {
  rootEl = root;
  document.addEventListener('keydown', function (e) {
    if (e.keyCode === 461 || e.key === 'Backspace' || e.key === 'GoBack') {
      e.preventDefault();
      back();
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
    schedulePaintMark(entry.route);
  }
}

function schedulePaintMark(route) {
  if (typeof requestAnimationFrame !== 'function') return;
  requestAnimationFrame(function () {
    if (currentRoute === route) {
      mark('screen:firstPaint', { route: route });
    }
  });
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

  var host = document.createElement('div');
  host.className = 'screen-host';
  host.setAttribute('data-route', currentRoute);
  rootEl.appendChild(host);

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

  enforceRetentionCap();

  if (perfOn) {
    var elapsed = startedAt ? Math.round(performance.now() - startedAt) : 0;
    mark('route:render', { route: currentRoute, renderMs: elapsed });
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
  clearPosterUrlMaps();
}

export {
  register,
  navigate,
  getRoute,
  back,
  init,
  shouldExitToLauncher,
  invalidateRetention
};
