/**
 * D-pad focus management for TV remotes.
 * Sidebar: Up/Down between hub items, Right exits to main content.
 * Main: Left/Right within zones; Left at edge returns to sidebar; Up/Down between zones.
 */

var focusableSelector = 'button, [tabindex], .btn, .card, .nav-item, .library-item, .browsing-hub-item, .row-item, .season-chip, .episode-chip, .detail-setting-chip, .detail-breadcrumb, .detail-breadcrumb-trail__btn, .detail-episode-picker, .detail-link, .detail-file-row, .detail-modal-option, .detail-modal-cancel, .detail-watchlist-btn, .watchlist-row-link, .user-chip, .profile-card, .pin-pad-btn, select, .player-seek-bar, .player-control-pill, .player-stream-pill, .player-menu-option, input.search-input, .search-input';

var ARROW_LEFT = 37;
var ARROW_UP = 38;
var ARROW_RIGHT = 39;
var ARROW_DOWN = 40;

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

function getFocusZone(el) {
  if (!el) return null;
  var zone = el.closest('[data-focus-zone]');
  if (zone) return zone;
  zone = el.closest('.settings-watchlist-row');
  if (zone) return zone;
  zone = el.closest('.settings-actions');
  if (zone) return zone;
  zone = el.closest('.settings-row');
  if (zone) return zone;
  zone = el.closest('[data-cols]');
  if (zone) return zone;
  zone = el.closest('.row-scroll');
  if (zone) return zone;
  zone = el.closest('.browsing-hub-nav-host');
  if (zone) return zone;
  zone = el.closest('.settings-main');
  if (zone) return zone;
  zone = el.closest('.search-input-row');
  if (zone) return zone;
  zone = el.closest('.search-results');
  if (zone) return zone;
  zone = el.closest('.media-grid');
  if (zone) return zone;
  return el.closest('.screen');
}

function pushZone(zones, el) {
  if (el && zones.indexOf(el) < 0) zones.push(el);
}

function isDescendantOfAny(node, zones) {
  if (!node || !zones || !zones.length) return false;
  for (var i = 0; i < zones.length; i++) {
    var zone = zones[i];
    if (zone === node) continue;
    if (zone && zone.contains && zone.contains(node)) return true;
  }
  return false;
}

function isSettingsRowZone(el) {
  if (!el || !el.classList) return false;
  return el.classList.contains('settings-row') ||
    el.classList.contains('settings-watchlist-row') ||
    el.classList.contains('settings-actions');
}

function isSettingsScreen(container) {
  return !!(container && container.querySelector &&
    (container.querySelector('.settings-content') || container.querySelector('.settings-screen')));
}

function collectSettingsZones(container, zones) {
  var content = container.querySelector('.settings-content');
  if (!content) {
    if (!isSettingsScreen(container)) {
      var settingsMain = container.querySelector('.settings-main');
      if (settingsMain && !isDescendantOfAny(settingsMain, zones)) pushZone(zones, settingsMain);
    }
    return;
  }
  var candidates = content.querySelectorAll(
    '.settings-row, .settings-watchlist-row, .settings-actions'
  );
  var i;
  for (i = 0; i < candidates.length; i++) {
    var row = candidates[i];
    if (!getFocusables(row).length) continue;
    if (isDescendantOfAny(row, zones)) continue;
    pushZone(zones, row);
  }
}

function getZones(container) {
  var zones = [];
  var librarySidebar = container.querySelector('[data-focus-zone="library-sidebar"]');
  if (librarySidebar) {
    pushZone(zones, librarySidebar);
  } else {
    var hubHost = container.querySelector('.browsing-hub-nav-host');
    if (hubHost) pushZone(zones, hubHost);
  }

  var focusZones = container.querySelectorAll('[data-focus-zone]');
  for (var i = 0; i < focusZones.length; i++) {
    if (focusZones[i] === librarySidebar) continue;
    if (!isDescendantOfAny(focusZones[i], zones)) pushZone(zones, focusZones[i]);
  }

  var searchInput = container.querySelector('.search-input-row');
  if (searchInput && !isDescendantOfAny(searchInput, zones)) pushZone(zones, searchInput);

  var rows = container.querySelectorAll('.row-scroll');
  for (var r = 0; r < rows.length; r++) {
    if (!isDescendantOfAny(rows[r], zones)) pushZone(zones, rows[r]);
  }

  var searchResults = container.querySelector('.search-results');
  if (searchResults && !isDescendantOfAny(searchResults, zones)) {
    var skipResultsHost = container.querySelector('.search-screen') &&
      searchResults.querySelector('.row-scroll');
    if (!skipResultsHost) pushZone(zones, searchResults);
  }

  var grid = container.querySelector('.media-grid');
  if (grid && !isDescendantOfAny(grid, zones)) pushZone(zones, grid);

  collectSettingsZones(container, zones);

  var colGroups = container.querySelectorAll('[data-cols]');
  for (var j = 0; j < colGroups.length; j++) {
    if (colGroups[j].classList && colGroups[j].classList.contains('media-grid')) continue;
    if (isDescendantOfAny(colGroups[j], zones)) continue;
    pushZone(zones, colGroups[j]);
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

function resolveZoneIndex(zones, zone, active) {
  var zIdx = zoneIndex(zones, zone);
  if (zIdx >= 0) return zIdx;
  if (active) {
    for (var i = 0; i < zones.length; i++) {
      if (zones[i].contains && zones[i].contains(active)) return i;
    }
  }
  return 0;
}

function isSidebarZone(zone) {
  if (!zone) return false;
  if (zone.classList && zone.classList.contains('browsing-hub-nav-host')) return true;
  if (zone.getAttribute && zone.getAttribute('data-focus-zone') === 'library-sidebar') return true;
  if (zone.className && String(zone.className).indexOf('browsing-hub-nav-host') >= 0) return true;
  return false;
}

function isPlaybackColumnsZone(zone) {
  return !!(zone && zone.classList && zone.classList.contains('detail-playback-columns'));
}

function isMediaGridZone(zone) {
  return !!(zone && zone.classList && zone.classList.contains('media-grid'));
}

function isHubRowZone(zone) {
  return !!(zone && zone.getAttribute && zone.getAttribute('data-focus-zone') === 'hub-row');
}

function usesLayoutGridCells(zone) {
  return !!(zone && zone.classList && zone.classList.contains('pin-pad-grid'));
}

function zoneColumnCount(zone) {
  if (!zone || !zone.getAttribute) return 0;
  var cols = parseInt(zone.getAttribute('data-cols'), 10);
  if (!isNaN(cols) && cols > 0) return cols;
  if (zone.classList && zone.classList.contains('media-grid')) return 6;
  return 0;
}

function colGridRowCount(len, cols) {
  return len > 0 && cols > 0 ? Math.ceil(len / cols) : 0;
}

function findColGridIndex(list, row, col, cols) {
  var len = list.length;
  var rows = colGridRowCount(len, cols);
  if (row < 0 || row >= rows || col < 0 || col >= cols) return -1;
  var idx = row * cols + col;
  if (idx < len) return idx;
  var c;
  for (c = col; c >= 0; c--) {
    idx = row * cols + c;
    if (idx < len) return idx;
  }
  for (c = col + 1; c < cols; c++) {
    idx = row * cols + c;
    if (idx < len) return idx;
  }
  return -1;
}

function tryColumnarMove(list, idx, cols, key) {
  if (!cols || cols <= 0) return -1;
  var row = Math.floor(idx / cols);
  var col = idx % cols;
  if (key === ARROW_DOWN) {
    var downRow = row + 1;
    if (downRow >= colGridRowCount(list.length, cols)) return -1;
    return findColGridIndex(list, downRow, col, cols);
  }
  if (key === ARROW_UP) {
    if (row <= 0) return -1;
    return findColGridIndex(list, row - 1, col, cols);
  }
  return -1;
}

function tryRowHorizontalMove(list, idx, cols, key) {
  if (!cols || cols <= 0) return -1;
  var col = idx % cols;
  var row = Math.floor(idx / cols);
  var rowStart = row * cols;
  var rowEnd = Math.min(list.length - 1, rowStart + cols - 1);
  if (key === ARROW_LEFT) {
    if (col === 0) return -1;
    return idx - 1;
  }
  if (key === ARROW_RIGHT) {
    if (idx >= rowEnd) return -1;
    return idx + 1;
  }
  return -1;
}

function layoutGridChildIndex(grid, active) {
  var children = grid.children;
  var i;
  for (i = 0; i < children.length; i++) {
    if (children[i] === active) return i;
    if (children[i].contains && children[i].contains(active)) return i;
  }
  return -1;
}

function layoutGridFocusableAt(grid, childIdx) {
  var child = grid.children[childIdx];
  if (!child) return null;
  if (isNavFocusable(child)) return child;
  return getFocusables(child)[0] || null;
}

function tryLayoutGridMove(grid, active, key) {
  if (!usesLayoutGridCells(grid)) return null;
  var cols = zoneColumnCount(grid);
  if (!cols) return null;
  var childIdx = layoutGridChildIndex(grid, active);
  if (childIdx < 0) return null;
  var row = Math.floor(childIdx / cols);
  var col = childIdx % cols;
  var targetRow = row;
  var targetCol = col;
  if (key === ARROW_DOWN) targetRow = row + 1;
  else if (key === ARROW_UP) targetRow = row - 1;
  else if (key === ARROW_LEFT) targetCol = col - 1;
  else if (key === ARROW_RIGHT) targetCol = col + 1;
  else return null;

  if (targetCol < 0 || targetCol >= cols || targetRow < 0) return null;

  var children = grid.children;
  var maxRow = Math.floor((children.length - 1) / cols);
  if (targetRow > maxRow) return null;

  var targetIdx = targetRow * cols + targetCol;
  var target = layoutGridFocusableAt(grid, targetIdx);
  if (target) return target;

  var c;
  if (key === ARROW_DOWN || key === ARROW_UP) {
    for (c = targetCol - 1; c >= 0; c--) {
      target = layoutGridFocusableAt(grid, targetRow * cols + c);
      if (target) return target;
    }
    for (c = targetCol + 1; c < cols; c++) {
      target = layoutGridFocusableAt(grid, targetRow * cols + c);
      if (target) return target;
    }
  }
  return null;
}

function isAtLeftEdge(active, zone, idx) {
  if (isHubRowZone(zone)) return idx <= 0;
  if (idx <= 0) return true;
  if (!active || !active.getAttribute) return idx <= 0;
  var itemIndex = active.getAttribute('data-item-index');
  if (itemIndex != null && itemIndex !== '') {
    var parsed = parseInt(itemIndex, 10);
    if (!isNaN(parsed) && parsed === 0) return true;
  }
  var cols = zoneColumnCount(zone);
  if (cols > 0 && idx % cols === 0) return true;
  return false;
}

function findSequentialRoot(container, active) {
  var root = active && active.closest ? active.closest('[data-focus-mode="sequential"]') : null;
  if (root && container.contains(root)) return root;
  if (container.getAttribute && container.getAttribute('data-focus-mode') === 'sequential') {
    return container;
  }
  var screen = container.querySelector('[data-focus-mode="sequential"]');
  if (screen && container.contains(screen) && active && active.closest && screen.contains(active)) {
    return screen;
  }
  return null;
}

function sequentialAxisFor(root) {
  var axis = root && root.getAttribute ? root.getAttribute('data-focus-sequential-axis') : null;
  if (axis === 'horizontal' || axis === 'vertical') return axis;
  return 'both';
}

function handleSequentialNav(root, active, key) {
  var axis = sequentialAxisFor(root);
  if (axis === 'horizontal' && key !== ARROW_LEFT && key !== ARROW_RIGHT) return false;
  if (axis === 'vertical' && key !== ARROW_UP && key !== ARROW_DOWN) return false;

  var list = getFocusables(root);
  if (list.length <= 1) return false;
  var idx = list.indexOf(active);
  if (idx < 0) idx = 0;
  var delta = 0;
  if (key === ARROW_DOWN || key === ARROW_RIGHT) delta = 1;
  else if (key === ARROW_UP || key === ARROW_LEFT) delta = -1;
  else return false;
  var next = idx + delta;
  if (next < 0 || next >= list.length) return false;
  list[next].focus();
  scrollFocusedIntoView(list[next]);
  return true;
}

function findActiveHubItem(host) {
  var items = host.querySelectorAll('.browsing-hub-item');
  var i;
  for (i = 0; i < items.length; i++) {
    if (items[i].classList && items[i].classList.contains('active')) return items[i];
    if (items[i].className && String(items[i].className).indexOf(' active') >= 0) return items[i];
  }
  return items.length ? items[0] : null;
}

function focusSidebar(container) {
  var host = container.querySelector('.browsing-hub-nav-host');
  if (!host) return false;
  var target = findActiveHubItem(host);
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

function preferredColumnIndex(active, listIndex, targetList) {
  if (active && active.getAttribute) {
    var itemIndex = active.getAttribute('data-item-index');
    if (itemIndex != null && itemIndex !== '') {
      var parsed = parseInt(itemIndex, 10);
      if (!isNaN(parsed)) {
        var t;
        for (t = 0; t < targetList.length; t++) {
          var attr = targetList[t].getAttribute('data-item-index');
          if (attr != null && attr !== '' && parseInt(attr, 10) === parsed) return t;
        }
      }
    }
  }
  return Math.max(0, Math.min(listIndex, targetList.length - 1));
}

function adjacentZonePreferredIndex(active, listIndex, fromZone, toZone, direction) {
  if (isHubRowZone(fromZone) || isHubRowZone(toZone)) {
    return preferredColumnIndex(active, listIndex, getFocusables(toZone));
  }
  if (isSettingsRowZone(fromZone) || isSettingsRowZone(toZone)) return 0;
  if (direction === ARROW_DOWN) return 0;
  return Math.min(listIndex, getFocusables(toZone).length - 1);
}

function focusInAdjacentZone(zones, fromIdx, direction, active, listIndex) {
  var step = direction === ARROW_DOWN ? 1 : -1;
  var fromZone = zones[fromIdx];
  var i = fromIdx + step;
  while (i >= 0 && i < zones.length) {
    var pref = adjacentZonePreferredIndex(active, listIndex, fromZone, zones[i], direction);
    if (focusInZone(zones[i], pref)) return true;
    i += step;
  }
  return false;
}

function scrollFocusedIntoView(el) {
  if (!el || typeof el.scrollIntoView !== 'function') return;
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function focusSearchInput(container) {
  var inputRow = container.querySelector('.search-input-row');
  if (!inputRow) return false;
  var input = inputRow.querySelector('.search-input') || inputRow.querySelector('input');
  if (!input || !isNavFocusable(input)) return false;
  input.focus();
  scrollFocusedIntoView(input);
  return true;
}

function findSearchResultsRow(container) {
  var results = container.querySelector('.search-results');
  if (results) {
    var nested = results.querySelector('.row-scroll');
    if (nested) return nested;
  }
  return container.querySelector('.row-scroll');
}

function focusSearchResults(container, index) {
  var row = findSearchResultsRow(container);
  if (!row) return false;
  return focusInZone(row, index != null ? index : 0);
}

function handleSearchLaneNav(container, zone, active, key) {
  var inputRow = container.querySelector('.search-input-row');
  if (!inputRow) return false;

  var input = inputRow.querySelector('.search-input') || inputRow.querySelector('input');
  var resultsRow = findSearchResultsRow(container);
  var inInput = active === input || zone === inputRow;
  var inResults = resultsRow && (zone === resultsRow || resultsRow.contains(active));

  if (key === ARROW_RIGHT) {
    if (isSidebarZone(zone)) {
      return focusSearchInput(container);
    }
    if (inInput) {
      return focusSearchResults(container, 0);
    }
  }

  if (key === ARROW_LEFT) {
    if (inInput) {
      return focusSidebar(container);
    }
    if (inResults) {
      var list = getFocusables(resultsRow);
      if (list.indexOf(active) === 0) {
        return focusSearchInput(container);
      }
    }
  }

  if (key === ARROW_DOWN && inInput) {
    return focusSearchResults(container, 0);
  }

  return false;
}

function getPlaybackColumn(active) {
  if (!active) return null;
  if (active.closest('.detail-file-section')) return 'file';
  if (active.closest('.detail-network-section')) return 'network';
  return null;
}

function handlePlaybackColumnsNav(container, zone, active, key) {
  var fileSection = zone.querySelector('.detail-file-section');
  var networkSection = zone.querySelector('.detail-network-section');
  if (!fileSection || !networkSection) return false;

  var fileList = getFocusables(fileSection);
  var netList = getFocusables(networkSection);
  if (!fileList.length || !netList.length) return false;

  var column = getPlaybackColumn(active);
  if (!column) return false;

  if (key === ARROW_UP || key === ARROW_DOWN) {
    var vDelta = key === ARROW_DOWN ? 1 : -1;
    var columnList = column === 'file' ? fileList : netList;
    var columnIdx = columnList.indexOf(active);
    if (columnIdx < 0) return false;
    var columnNext = columnIdx + vDelta;
    if (columnNext >= 0 && columnNext < columnList.length) {
      columnList[columnNext].focus();
      scrollFocusedIntoView(columnList[columnNext]);
      return true;
    }
    if (key === ARROW_UP && column === 'network' && columnIdx === 0) {
      fileList[fileList.length - 1].focus();
      scrollFocusedIntoView(fileList[fileList.length - 1]);
      return true;
    }
    return false;
  }

  if (key === ARROW_RIGHT && column === 'file') {
    var fileIdx = fileList.indexOf(active);
    if (fileIdx === fileList.length - 1) {
      netList[0].focus();
      scrollFocusedIntoView(netList[0]);
      return true;
    }
  }
  if (key === ARROW_LEFT && column === 'network') {
    var netIdx = netList.indexOf(active);
    if (netIdx === 0) {
      fileList[fileList.length - 1].focus();
      scrollFocusedIntoView(fileList[fileList.length - 1]);
      return true;
    }
  }
  return false;
}

function isPlayerSeekBar(el) {
  return !!(el && el.classList && el.classList.contains('player-seek-bar'));
}

function handleKeyNav(container, e) {
  var key = e.keyCode;
  if ([ARROW_LEFT, ARROW_UP, ARROW_RIGHT, ARROW_DOWN].indexOf(key) < 0) return false;

  var active = document.activeElement;

  if (isPlayerSeekBar(active) && (key === ARROW_LEFT || key === ARROW_RIGHT)) {
    return false;
  }

  var sequentialRoot = findSequentialRoot(container, active);
  if (sequentialRoot && handleSequentialNav(sequentialRoot, active, key)) {
    e.preventDefault();
    return true;
  }

  var zone = getFocusZone(active);
  if (!zone || !container.contains(zone)) zone = container;

  var zones = getZones(container);
  var zIdx = resolveZoneIndex(zones, zone, active);

  var list = getFocusables(zone);
  var idx = list.indexOf(active);
  if (idx < 0) idx = 0;

  if (handleSearchLaneNav(container, zone, active, key)) {
    e.preventDefault();
    return true;
  }

  if (isSidebarZone(zone)) {
    if (key === ARROW_RIGHT) {
      e.preventDefault();
      var enterIdx = isSettingsScreen(container) ? 0 : idx;
      if (focusFirstInNextZone(zones, zIdx + 1, enterIdx)) return true;
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
      if (key === ARROW_DOWN && idx === list.length - 1) {
        var zoneId = zone.getAttribute && zone.getAttribute('data-focus-zone');
        if (zoneId === 'library-sidebar' || (isSettingsScreen(container) && !zoneId)) {
          e.preventDefault();
          if (focusFirstInNextZone(zones, zIdx + 1, 0)) return true;
        }
      }
    } else {
      return false;
    }
  }

  if ((key === ARROW_LEFT || key === ARROW_RIGHT || key === ARROW_UP || key === ARROW_DOWN) &&
      isPlaybackColumnsZone(zone)) {
    if (handlePlaybackColumnsNav(container, zone, active, key)) {
      e.preventDefault();
      return true;
    }
  }

  var layoutGrid = active && active.closest ? active.closest('.pin-pad-grid') : null;
  if (layoutGrid && usesLayoutGridCells(layoutGrid)) {
    var layoutTarget = tryLayoutGridMove(layoutGrid, active, key);
    if (layoutTarget) {
      e.preventDefault();
      layoutTarget.focus();
      scrollFocusedIntoView(layoutTarget);
      return true;
    }
  }

  if (key === ARROW_UP || key === ARROW_DOWN) {
    var cols = zoneColumnCount(zone);
    var columnNext = tryColumnarMove(list, idx, cols, key);
    if (columnNext >= 0) {
      e.preventDefault();
      list[columnNext].focus();
      scrollFocusedIntoView(list[columnNext]);
      return true;
    }
    if (key === ARROW_UP && isMediaGridZone(zone) && cols > 0 &&
        Math.floor(idx / cols) === 0 && container.querySelector('.browsing-hub-nav-host')) {
      e.preventDefault();
      if (focusSidebar(container)) return true;
    }
    if (key === ARROW_UP && isSettingsScreen(container) && isSettingsRowZone(zone) &&
        zIdx > 0 && isSidebarZone(zones[zIdx - 1])) {
      e.preventDefault();
      if (focusSidebar(container)) return true;
    }
  }

  if (key === ARROW_LEFT || key === ARROW_RIGHT) {
    if (key === ARROW_LEFT && isAtLeftEdge(active, zone, idx)) {
      if (container.querySelector('.browsing-hub-nav-host')) {
        e.preventDefault();
        if (focusSidebar(container)) return true;
      }
    }
    var hCols = zoneColumnCount(zone);
    var hNext = hCols > 0 ? tryRowHorizontalMove(list, idx, hCols, key) : -1;
    if (hNext < 0) {
      if (hCols > 0) return false;
      hNext = idx + (key === ARROW_RIGHT ? 1 : -1);
      if (hNext < 0 || hNext >= list.length) return false;
    }
    if (hNext !== idx || list.length === 1) {
      e.preventDefault();
      list[hNext].focus();
      scrollFocusedIntoView(list[hNext]);
      return true;
    }
    return false;
  }

  if (key === ARROW_DOWN && container.querySelector('.browsing-hub-nav-host')) {
    var topBar = container.querySelector('[data-focus-zone="detail-top-bar"]');
    if (topBar && zone === topBar) {
      e.preventDefault();
      if (focusSidebar(container)) return true;
    }
  }

  if (key === ARROW_DOWN || key === ARROW_UP) {
    e.preventDefault();
    if (focusInAdjacentZone(zones, zIdx, key, active, idx)) return true;
    return false;
  }

  return false;
}

function attachFocusNav(container) {
  function onKey(e) {
    if ([ARROW_LEFT, ARROW_UP, ARROW_RIGHT, ARROW_DOWN].indexOf(e.keyCode) >= 0) {
      handleKeyNav(container, e);
    }
  }
  function onFocusIn(ev) {
    var t = ev.target;
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
  focusableSelector,
  getFocusables,
  invalidateFocusableCache,
  focusFirst,
  handleKeyNav,
  attachFocusNav,
  scrollFocusedIntoView,
  isNavFocusable,
  isSidebarZone,
  isMediaGridZone,
  isAtLeftEdge,
  getFocusZone,
  getZones,
  zoneIndex,
  resolveZoneIndex,
  focusSidebar,
  focusSearchInput,
  focusSearchResults,
  zoneColumnCount,
  tryColumnarMove,
  tryRowHorizontalMove,
  tryLayoutGridMove,
  usesLayoutGridCells,
  isDescendantOfAny,
  isHubRowZone,
  preferredColumnIndex,
  adjacentZonePreferredIndex,
  focusInZone,
  focusInAdjacentZone,
  findSequentialRoot,
  handleSequentialNav,
  handleSearchLaneNav,
  isPlaybackColumnsZone,
  handlePlaybackColumnsNav
};
