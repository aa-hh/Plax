/**
 * D-pad focus management for TV remotes.
 * Sidebar: Up/Down between hub items, Right exits to main content.
 * Main: Left/Right within zones; Left at edge returns to sidebar; Up/Down between zones.
 */

var focusableSelector = 'button, [tabindex], .btn, .card, .nav-item, .library-item, .browsing-hub-item, .row-item, .season-chip, .episode-chip, .detail-setting-chip, .detail-breadcrumb, .detail-episode-picker, .detail-link, .detail-file-row, .detail-modal-option, .detail-modal-cancel, .detail-watchlist-btn, .watchlist-row-link, .user-chip, .profile-card, .pin-pad-btn, select, .player-seek-bar, .player-menu-option';

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
    el.closest('.browsing-hub-nav-host') ||
    el.closest('.settings-main') ||
    el.closest('.search-input-row') ||
    el.closest('.search-results') ||
    el.closest('.media-grid') ||
    el.closest('[data-cols]') ||
    el.closest('.screen');
}

function getZones(container) {
  var zones = [];
  var hubHost = container.querySelector('.browsing-hub-nav-host');
  if (hubHost) zones.push(hubHost);
  var searchInput = container.querySelector('.search-input-row');
  if (searchInput) zones.push(searchInput);
  var rows = container.querySelectorAll('.row-scroll');
  for (var i = 0; i < rows.length; i++) zones.push(rows[i]);
  var searchResults = container.querySelector('.search-results');
  if (searchResults && zones.indexOf(searchResults) < 0) zones.push(searchResults);
  var grid = container.querySelector('.media-grid');
  if (grid && zones.indexOf(grid) < 0) zones.push(grid);
  var settingsMain = container.querySelector('.settings-main');
  if (settingsMain && zones.indexOf(settingsMain) < 0) zones.push(settingsMain);
  var colGroups = container.querySelectorAll('[data-cols]');
  for (var j = 0; j < colGroups.length; j++) {
    if (zones.indexOf(colGroups[j]) < 0) zones.push(colGroups[j]);
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

function isSidebarZone(zone) {
  return !!(zone && zone.classList && zone.classList.contains('browsing-hub-nav-host'));
}

function isAtLeftEdge(active, zone, idx) {
  if (idx <= 0) return true;
  if (!active || !active.getAttribute) return idx <= 0;
  var itemIndex = active.getAttribute('data-item-index');
  if (itemIndex != null && itemIndex !== '') {
    var parsed = parseInt(itemIndex, 10);
    if (!isNaN(parsed) && parsed === 0) return true;
  }
  if (zone && zone.classList && zone.classList.contains('media-grid')) {
    var cols = parseInt(zone.getAttribute('data-cols'), 10) || 6;
    if (cols > 0 && idx % cols === 0) return true;
  }
  return false;
}

function focusSidebar(container) {
  var host = container.querySelector('.browsing-hub-nav-host');
  if (!host) return false;
  var target = host.querySelector('.browsing-hub-item.active') ||
    host.querySelector('.browsing-hub-item');
  if (!target) return false;
  target.focus();
  scrollFocusedIntoView(target);
  return true;
}

function focusInZone(zone, index) {
  var list = getFocusables(zone);
  if (!list.length) return false;
  var i = Math.max(0, Math.min(list.length - 1, index));
  list[i].focus();
  scrollFocusedIntoView(list[i]);
  return true;
}

function focusFirstInNextZone(zones, startIdx, preferredIndex) {
  var i;
  for (i = startIdx; i < zones.length; i++) {
    if (focusInZone(zones[i], preferredIndex)) return true;
  }
  return false;
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

  if (isSidebarZone(zone)) {
    if (key === ARROW_RIGHT) {
      e.preventDefault();
      if (focusFirstInNextZone(zones, zIdx + 1, idx)) return true;
      return false;
    }
    if (key === ARROW_UP || key === ARROW_DOWN) {
      var vDelta = key === ARROW_DOWN ? 1 : -1;
      var vNext = Math.max(0, Math.min(list.length - 1, idx + vDelta));
      if (vNext !== idx || list.length === 1) {
        e.preventDefault();
        list[vNext].focus();
        scrollFocusedIntoView(list[vNext]);
        return true;
      }
      return false;
    }
    return false;
  }

  if (key === ARROW_LEFT || key === ARROW_RIGHT) {
    if (key === ARROW_LEFT && isAtLeftEdge(active, zone, idx)) {
      if (container.querySelector('.browsing-hub-nav-host')) {
        e.preventDefault();
        if (focusSidebar(container)) return true;
      }
    }
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

export {
  getFocusables,
  focusFirst,
  handleKeyNav,
  attachFocusNav,
  scrollFocusedIntoView,
  isSidebarZone,
  isAtLeftEdge,
  getZones,
  zoneIndex
};
