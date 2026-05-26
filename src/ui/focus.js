/**
 * D-pad focus management for TV remotes.
 * Row-aware: horizontal moves within .row-scroll / .top-nav / .media-grid;
 * vertical moves between zones.
 */

var focusableSelector = 'button, [tabindex], .btn, .card, .nav-item, .library-item, .row-item, .season-chip, .episode-chip, .detail-setting-chip, .detail-breadcrumb, .detail-episode-picker, .detail-link, .detail-file-row, .detail-modal-option, .detail-modal-cancel, .user-chip, .profile-card, .pin-pad-btn, select, .player-seek-bar, .player-menu-option';

var ARROW_LEFT = 37;
var ARROW_UP = 38;
var ARROW_RIGHT = 39;
var ARROW_DOWN = 40;

function getFocusables(container) {
  return Array.prototype.slice.call(container.querySelectorAll(focusableSelector))
    .filter(function (el) { return !el.disabled && el.offsetParent !== null; });
}

function focusFirst(container) {
  var list = getFocusables(container);
  if (list.length) list[0].focus();
}

function getFocusZone(el) {
  if (!el) return null;
  return el.closest('.row-scroll') ||
    el.closest('.top-nav') ||
    el.closest('.home-pivots') ||
    el.closest('.media-grid') ||
    el.closest('[data-cols]') ||
    el.closest('.screen');
}

function getZones(container) {
  var zones = [];
  var nav = container.querySelector('.top-nav');
  if (nav) zones.push(nav);
  var pivots = container.querySelector('.home-pivots');
  if (pivots) zones.push(pivots);
  var rows = container.querySelectorAll('.row-scroll');
  for (var i = 0; i < rows.length; i++) zones.push(rows[i]);
  var grid = container.querySelector('.media-grid');
  if (grid && zones.indexOf(grid) < 0) zones.push(grid);
  var colGroups = container.querySelectorAll('[data-cols]');
  for (i = 0; i < colGroups.length; i++) {
    if (zones.indexOf(colGroups[i]) < 0) zones.push(colGroups[i]);
  }
  if (!zones.length) zones.push(container);
  return zones;
}

function zoneIndex(zones, zone) {
  for (var i = 0; i < zones.length; i++) {
    if (zones[i] === zone) return i;
  }
  return -1;
}

function focusInZone(zone, index) {
  var list = getFocusables(zone);
  if (!list.length) return false;
  var i = Math.max(0, Math.min(list.length - 1, index));
  list[i].focus();
  scrollFocusedIntoView(list[i]);
  return true;
}

function scrollFocusedIntoView(el) {
  if (!el || typeof el.scrollIntoView !== 'function') return;
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function handleKeyNav(container, e) {
  var key = e.keyCode;
  if ([ARROW_LEFT, ARROW_UP, ARROW_RIGHT, ARROW_DOWN].indexOf(key) < 0) return false;

  var active = document.activeElement;
  var zone = getFocusZone(active);
  if (!zone || !container.contains(zone)) zone = container;

  var zones = getZones(container);
  var zIdx = zoneIndex(zones, zone);
  if (zIdx < 0) zIdx = 0;

  var list = getFocusables(zone);
  var idx = list.indexOf(active);
  if (idx < 0) idx = 0;

  if (key === ARROW_LEFT || key === ARROW_RIGHT) {
    var delta = key === ARROW_RIGHT ? 1 : -1;
    var next = Math.max(0, Math.min(list.length - 1, idx + delta));
    if (next !== idx || list.length === 1) {
      e.preventDefault();
      list[next].focus();
      scrollFocusedIntoView(list[next]);
      return true;
    }
    return false;
  }

  // Vertical navigation between zones
  var targetZone = null;
  var targetIndex = idx;
  if (key === ARROW_DOWN && zIdx < zones.length - 1) {
    targetZone = zones[zIdx + 1];
  } else if (key === ARROW_UP && zIdx > 0) {
    targetZone = zones[zIdx - 1];
  } else {
    return false;
  }

  e.preventDefault();
  var targetList = getFocusables(targetZone);
  if (!targetList.length) return true;
  targetIndex = Math.min(targetIndex, targetList.length - 1);
  targetList[targetIndex].focus();
  scrollFocusedIntoView(targetList[targetIndex]);
  return true;
}

function attachFocusNav(container) {
  function onKey(e) {
    if ([ARROW_LEFT, ARROW_UP, ARROW_RIGHT, ARROW_DOWN].indexOf(e.keyCode) >= 0) {
      handleKeyNav(container, e);
    }
  }
  function onFocusIn(e) {
    var t = e.target;
    if (!t || !container.contains(t)) return;
    if (t.matches && t.matches(focusableSelector)) scrollFocusedIntoView(t);
  }
  container.addEventListener('keydown', onKey);
  container.addEventListener('focusin', onFocusIn);
  return function detach() {
    container.removeEventListener('keydown', onKey);
    container.removeEventListener('focusin', onFocusIn);
  };
}

export { getFocusables, focusFirst, handleKeyNav, attachFocusNav, scrollFocusedIntoView };
