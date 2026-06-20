import { getState, setState } from '../../core/store.js';
import { browseByType, refreshSection } from '../../backends/index.js';
import { filterLibrariesForUser } from '../../security/libraryAccess.js';
import { createMediaCard } from '../components/mediaCard.js';
import { focusFirst, attachFocusNav } from '../focus.js';
import {
  mountBrowsingHubNav,
  libraryHubId
} from '../components/browsingHubNav.js';
import {
  hydrateFocusedNeighborhood,
  hydrateGridViewport,
  primeVisiblePosters
} from '../posterImages.js';

var LIBRARY_INITIAL_POSTERS = 24;
/** Virtual grid constants */
var GRID_COLS = 6;
var BUFFER_ROWS = 3;
/** Estimated card height (poster 264px + margin 24px + text ~40px) in px at 1080p */
var ROW_HEIGHT_ESTIMATE = 330;

var SORT_OPTIONS = [
  { key: 'titleSort', label: 'Title' },
  { key: 'addedAt', label: 'Date Added' },
  { key: 'originallyAvailableAt', label: 'Release Date' }
];

function libraryScreen(root, params, navigate) {
  var state = getState();
  var server = state.activeServer;
  var libraries = filterLibrariesForUser(state.libraries || [], state.activeHomeUser);
  var activeLib = state.activeLibrary || libraries[0];
  if (params.libraryId) {
    var picked = libraries.filter(function (lib) {
      return String(lib.id) === String(params.libraryId);
    })[0];
    if (picked) activeLib = picked;
  }
  var isScanning = false;
  var scanReloadTimer = null;

  var screen = document.createElement('div');
  screen.className = 'screen library-screen';
  screen.innerHTML =
    '<div class="library-layout">' +
    '<div class="library-sidebar" data-focus-zone="library-sidebar">' +
    '<nav class="browsing-hub-nav-host" id="browsing-hub-nav-host"></nav>' +
    '<button class="library-item library-action" id="btn-scan-library" tabindex="0">Scan for new media</button>' +
    '</div>' +
    '<div class="library-main" id="lib-main">' +
    '<h1 class="screen-title screen-title-compact" id="lib-title">Library</h1>' +
    '<p class="watch-status-msg" id="lib-scan-status"></p>' +
    '<div class="library-filter-bar" id="library-filter-bar">' +
    '<button class="library-filter-chip library-filter-chip--active" id="filter-chip-all" data-filter="all" tabindex="0">All</button>' +
    '<button class="library-filter-chip" id="filter-chip-unwatched" data-filter="unwatched" tabindex="0">Unwatched</button>' +
    '<button class="library-filter-chip" id="filter-chip-sort" data-sort-index="0" tabindex="0">Sort: Title ▾</button>' +
    '</div>' +
    '<div class="library-grid-host" id="library-grid-host">' +
    '<div class="media-grid" id="media-grid" data-cols="6" data-focus-zone="library-grid"></div>' +
    '</div>' +
    '</div>' +
    '</div>';

  root.appendChild(screen);
  var detachFocus = attachFocusNav(screen);

  var hubNavHost = screen.querySelector('#browsing-hub-nav-host');
  var hubNav = mountBrowsingHubNav(hubNavHost, {
    navigate: navigate,
    fromRoute: 'library',
    activeLibrary: activeLib,
    onLibrarySelect: function (lib) {
      setState({ activeLibrary: lib });
      activeLib = lib;
      hubNav.setActiveId(libraryHubId(lib));
      loadGrid(lib);
    }
  });
  var scanBtn = screen.querySelector('#btn-scan-library');
  var gridHost = screen.querySelector('#library-grid-host');
  var grid = screen.querySelector('#media-grid');
  var scanStatus = screen.querySelector('#lib-scan-status');
  var filterChipAll = screen.querySelector('#filter-chip-all');
  var filterChipUnwatched = screen.querySelector('#filter-chip-unwatched');
  var filterChipSort = screen.querySelector('#filter-chip-sort');

  var posterFocusToken = 0;
  var posterFocusTimer = null;
  var gridScrollTimer = null;
  var gridLoadToken = 0;
  var destroyed = false;

  // Virtual scroll state
  var allItems = [];            // full unfiltered+unsorted dataset
  var displayItems = [];        // after filter + sort applied
  var rowHeightPx = ROW_HEIGHT_ESTIMATE;
  var rowHeightMeasured = false;
  var topSpacer = null;
  var bottomSpacer = null;
  var lastRenderStart = -1;
  var lastRenderEnd = -1;
  var vScrollListener = null;

  // Filter/sort state
  var activeFilter = 'all';
  var activeSortIndex = 0;

  // ── Poster neighbourhood ──────────────────────────────────────────────────

  function schedulePosterNeighborhood(card) {
    if (!card || destroyed) return;
    var token = ++posterFocusToken;
    if (posterFocusTimer) clearTimeout(posterFocusTimer);
    posterFocusTimer = setTimeout(function () {
      posterFocusTimer = null;
      if (destroyed || token !== posterFocusToken) return;
      hydrateFocusedNeighborhood(card, { before: 2, after: 24 });
    }, 80);
  }

  screen.addEventListener('focusin', function (e) {
    var card = e.target && e.target.closest ? e.target.closest('.media-card') : null;
    if (card && grid && grid.contains(card)) schedulePosterNeighborhood(card);
  });

  // ── Scan status helpers ───────────────────────────────────────────────────

  function setScanStatus(text, isError) {
    if (!scanStatus) return;
    scanStatus.textContent = text || '';
    scanStatus.className = 'watch-status-msg' + (isError ? ' watch-status-error' : '');
  }

  function friendlyScanError(err) {
    if (err && err.status === 403) {
      return 'Scan not allowed. Restricted Plex Home users may not have permission.';
    }
    if (err && err.status === 401) {
      return 'Plex sign-in expired. Sign in again to scan.';
    }
    if (err && err.status >= 500) {
      return 'Plex server unreachable. Try again in a moment.';
    }
    if (err && err.message && err.message.toLowerCase().indexOf('timeout') >= 0) {
      return 'Scan request timed out.';
    }
    return (err && err.message) || 'Scan failed.';
  }

  // ── Filter / sort ─────────────────────────────────────────────────────────

  function applyFilterSort() {
    var items = allItems;

    // Filter
    if (activeFilter === 'unwatched') {
      items = items.filter(function (item) {
        return !item.viewCount || item.viewCount <= 0;
      });
    }

    // Sort
    var sortKey = SORT_OPTIONS[activeSortIndex].key;
    items = items.slice(); // don't mutate
    if (sortKey === 'addedAt') {
      // addedAt is not in mapLibraryItem — fall back to server-returned order
      // (items already arrive sorted by titleSort from server; reorder not possible
      //  without the addedAt field, so we leave as-is for now)
    } else if (sortKey === 'originallyAvailableAt') {
      items.sort(function (a, b) {
        var da = a.originallyAvailableAt || '';
        var db = b.originallyAvailableAt || '';
        if (db < da) return -1;
        if (db > da) return 1;
        return 0;
      });
    } else {
      // titleSort — already sorted by the server; leave as-is
    }

    displayItems = items;
  }

  function updateFilterChips() {
    if (!filterChipAll || !filterChipUnwatched || !filterChipSort) return;
    filterChipAll.className = 'library-filter-chip' + (activeFilter === 'all' ? ' library-filter-chip--active' : '');
    filterChipUnwatched.className = 'library-filter-chip' + (activeFilter === 'unwatched' ? ' library-filter-chip--active' : '');
    filterChipSort.textContent = 'Sort: ' + SORT_OPTIONS[activeSortIndex].label + ' ▾';
  }

  function onFilterChange() {
    applyFilterSort();
    updateFilterChips();
    // Reset virtual window to top
    lastRenderStart = -1;
    lastRenderEnd = -1;
    if (gridHost) gridHost.scrollTop = 0;
    setupVirtualScroll();
    renderWindow();
  }

  if (filterChipAll) {
    filterChipAll.addEventListener('click', function () {
      if (activeFilter === 'all') return;
      activeFilter = 'all';
      onFilterChange();
    });
  }

  if (filterChipUnwatched) {
    filterChipUnwatched.addEventListener('click', function () {
      if (activeFilter === 'unwatched') return;
      activeFilter = 'unwatched';
      onFilterChange();
    });
  }

  if (filterChipSort) {
    filterChipSort.addEventListener('click', function () {
      activeSortIndex = (activeSortIndex + 1) % SORT_OPTIONS.length;
      onFilterChange();
    });
  }

  // ── Virtual scroll ────────────────────────────────────────────────────────

  function ensureSpacers() {
    if (topSpacer && topSpacer.parentNode === grid) return;
    topSpacer = document.createElement('div');
    topSpacer.className = 'vgrid-spacer vgrid-spacer--top';
    topSpacer.style.width = '100%';
    topSpacer.style.flexShrink = '0';
    topSpacer.style.height = '0';
    grid.insertBefore(topSpacer, grid.firstChild);

    bottomSpacer = document.createElement('div');
    bottomSpacer.className = 'vgrid-spacer vgrid-spacer--bottom';
    bottomSpacer.style.width = '100%';
    bottomSpacer.style.flexShrink = '0';
    bottomSpacer.style.height = '0';
    grid.appendChild(bottomSpacer);
  }

  function measureRowHeight() {
    if (rowHeightMeasured) return;
    var card = grid.querySelector('.media-card');
    if (!card) return;
    var h = card.offsetHeight;
    if (h > 50) {
      // Include the top+bottom margin (--media-grid-gap-y = 24px total = 12px each side)
      rowHeightPx = h + 24;
      rowHeightMeasured = true;
    }
  }

  function makeCard(item, index) {
    var card = createMediaCard(item, function (selected, routeParams) {
      var route = routeParams || { ratingKey: selected.ratingKey };
      route.libraryType = activeLib.type;
      route.libraryId = activeLib.id;
      navigate('detail', route);
    }, {
      layout: 'grid',
      deferPoster: index >= LIBRARY_INITIAL_POSTERS
    });
    card.setAttribute('data-item-index', String(index));
    return card;
  }

  function renderWindow() {
    if (destroyed || !grid || !gridHost) return;
    ensureSpacers();

    var total = displayItems.length;
    var totalRows = Math.ceil(total / GRID_COLS);

    if (total === 0) {
      topSpacer.style.height = '0';
      bottomSpacer.style.height = '0';
      // Remove any rendered cards
      var toRemove = Array.prototype.slice.call(grid.querySelectorAll('.media-card'));
      for (var r = 0; r < toRemove.length; r++) grid.removeChild(toRemove[r]);
      return;
    }

    measureRowHeight();

    var scrollTop = gridHost.scrollTop;
    var viewportHeight = gridHost.clientHeight || 860;

    var visibleStartRow = Math.floor(scrollTop / rowHeightPx);
    var visibleEndRow = Math.ceil((scrollTop + viewportHeight) / rowHeightPx);
    var renderStartRow = Math.max(0, visibleStartRow - BUFFER_ROWS);
    var renderEndRow = Math.min(totalRows, visibleEndRow + BUFFER_ROWS);

    var renderStartIndex = renderStartRow * GRID_COLS;
    var renderEndIndex = Math.min(total, renderEndRow * GRID_COLS);

    // Skip re-render if window hasn't shifted
    if (renderStartIndex === lastRenderStart && renderEndIndex === lastRenderEnd) return;
    lastRenderStart = renderStartIndex;
    lastRenderEnd = renderEndIndex;

    // Preserve D-pad focus across the rebuild: on a TV the grid scrolls
    // *because* focus moved, so the focused card node is about to be removed.
    // Remember its item index and restore focus to the new node afterward
    // (mirrors virtualRow.js). Without this, focus drops to <body> and D-pad
    // navigation dies mid-scroll.
    var active = document.activeElement;
    var focusedIndex = (active && grid.contains(active) && active.getAttribute)
      ? parseInt(active.getAttribute('data-item-index'), 10)
      : NaN;

    // Remove existing cards (but not spacers)
    var existingCards = Array.prototype.slice.call(grid.querySelectorAll('.media-card'));
    for (var i = 0; i < existingCards.length; i++) {
      grid.removeChild(existingCards[i]);
    }

    // Update spacer heights
    topSpacer.style.height = (renderStartRow * rowHeightPx) + 'px';
    bottomSpacer.style.height = ((totalRows - renderEndRow) * rowHeightPx) + 'px';

    // Render visible slice
    var fragment = document.createDocumentFragment();
    for (var j = renderStartIndex; j < renderEndIndex; j++) {
      fragment.appendChild(makeCard(displayItems[j], j));
    }
    // Insert between spacers: insert before bottomSpacer
    grid.insertBefore(fragment, bottomSpacer);

    // Restore focus to the same item if it's still within the rendered window.
    if (!isNaN(focusedIndex) && focusedIndex >= renderStartIndex && focusedIndex < renderEndIndex) {
      var refocus = grid.querySelector('.media-card[data-item-index="' + focusedIndex + '"]');
      if (refocus && refocus.focus) refocus.focus();
    }

    // Prime posters for what's visible
    primeVisiblePosters(grid);

    // Try to measure height after first render
    if (!rowHeightMeasured) measureRowHeight();
  }

  function setupVirtualScroll() {
    // Remove old scroll listener if any
    if (vScrollListener && gridHost) {
      gridHost.removeEventListener('scroll', vScrollListener);
      vScrollListener = null;
    }
    if (!gridHost) return;
    vScrollListener = function () {
      if (destroyed) return;
      if (gridScrollTimer) clearTimeout(gridScrollTimer);
      gridScrollTimer = setTimeout(function () {
        gridScrollTimer = null;
        if (!destroyed) {
          hydrateGridViewport(grid);
          renderWindow();
        }
      }, 80);
    };
    gridHost.addEventListener('scroll', vScrollListener);
  }

  // ── Grid loading ──────────────────────────────────────────────────────────

  function loadGrid(lib) {
    var token = ++gridLoadToken;
    screen.querySelector('#lib-title').textContent = lib.title;
    grid.innerHTML = '<p class="status-msg">Loading…</p>';
    lastRenderStart = -1;
    lastRenderEnd = -1;
    allItems = [];
    displayItems = [];

    return browseByType(server, lib.id, lib.type, { progressive: true }).then(function (result) {
      if (destroyed || token !== gridLoadToken) return;

      var items = result.items || result;
      var fetchRest = result.fetchRest;

      allItems = items || [];
      applyFilterSort();

      // Clear loading message, ensure spacers exist
      grid.innerHTML = '';
      setupVirtualScroll();
      renderWindow();

      if (fetchRest) {
        fetchRest().then(function (allServerItems) {
          if (destroyed || token !== gridLoadToken) return;
          if (!allServerItems || allServerItems.length <= allItems.length) return;
          allItems = allServerItems;
          applyFilterSort();
          renderWindow();
        }).catch(function () {});
      }
    }).catch(function (err) {
      if (destroyed || token !== gridLoadToken) return;
      grid.innerHTML = '<p class="status-msg">Failed: ' + err.message + '</p>';
    });
  }

  // ── Scan ──────────────────────────────────────────────────────────────────

  scanBtn.addEventListener('click', startSectionScan);

  function startSectionScan() {
    if (isScanning) return;
    var current = getState().activeLibrary || activeLib;
    if (!current) {
      setScanStatus('No active library to scan.', true);
      return;
    }
    isScanning = true;
    scanBtn.disabled = true;
    setScanStatus('Scan started on "' + current.title + '"…', false);

    refreshSection(server, current.id, { force: false }).then(function () {
      if (scanReloadTimer) clearTimeout(scanReloadTimer);
      scanReloadTimer = setTimeout(function () {
        scanReloadTimer = null;
        var stillActive = getState().activeLibrary || activeLib;
        // Only auto-reload if the user is still viewing the scanned library.
        if (!stillActive || stillActive.id !== current.id) {
          setScanStatus('Scan requested.', false);
          isScanning = false;
          scanBtn.disabled = false;
          return;
        }
        loadGrid(stillActive).then(function () {
          setScanStatus('Library refreshed.', false);
        }).catch(function () {
          setScanStatus('Scan requested.', false);
        }).then(function () {
          isScanning = false;
          scanBtn.disabled = false;
        });
      }, 5000);
    }).catch(function (err) {
      isScanning = false;
      scanBtn.disabled = false;
      setScanStatus(friendlyScanError(err), true);
    });
  }

  if (activeLib) loadGrid(activeLib);
  else grid.innerHTML = '<p class="status-msg">No libraries available</p>';

  if (!hubNav.focusSidebar()) focusFirst(screen);

  return {
    destroy: function () {
      destroyed = true;
      gridLoadToken += 1;
      posterFocusToken += 1;
      if (posterFocusTimer) {
        clearTimeout(posterFocusTimer);
        posterFocusTimer = null;
      }
      if (gridScrollTimer) {
        clearTimeout(gridScrollTimer);
        gridScrollTimer = null;
      }
      if (scanReloadTimer) clearTimeout(scanReloadTimer);
      if (vScrollListener && gridHost) {
        gridHost.removeEventListener('scroll', vScrollListener);
        vScrollListener = null;
      }
      detachFocus();
    }
  };
}

export { libraryScreen };
