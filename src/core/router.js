import { isPerfEnabled, mark } from '../perf/resourceMonitor.js';
import { clearPosterUrlMaps } from '../ui/posterImages.js';

var routes = {};
var currentRoute = null;
var currentParams = {};
var rootEl = null;
var screenInstance = null;

function register(name, factory) {
  routes[name] = factory;
}

function navigate(name, params) {
  params = params || {};
  if (currentRoute === name && JSON.stringify(currentParams) === JSON.stringify(params)) {
    return;
  }
  currentRoute = name;
  currentParams = params;
  render();
}

function getRoute() {
  return { name: currentRoute, params: currentParams };
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
}

function render() {
  if (!rootEl || !routes[currentRoute]) return;
  var startedAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
  if (screenInstance && screenInstance.destroy) {
    screenInstance.destroy();
  }
  screenInstance = null;
  clearPosterUrlMaps();
  rootEl.innerHTML = '';
  screenInstance = routes[currentRoute](rootEl, currentParams, navigate);
  if (isPerfEnabled()) {
    var elapsed = startedAt ? Math.round(performance.now() - startedAt) : 0;
    mark('route:render', { route: currentRoute, renderMs: elapsed });
  }
}

export { register, navigate, getRoute, back, init };
