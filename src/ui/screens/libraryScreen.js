import { getState, setState } from '../../core/store.js';
import { browseByType, refreshSection } from '../../backends/index.js';
import { filterLibrariesForUser } from '../../security/libraryAccess.js';
import { createMediaCard } from '../components/mediaCard.js';
import { focusFirst, attachFocusNav, invalidateFocusableCache } from '../focus.js';
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
/** Estimated card-row pitch at 1080p: poster --row-poster-h 372px + caption
 *  (~48px) + vertical margins (28px) ≈ 448. Measured precisely after first
 *  render (measureRowHeight); this is only the pre-measure guess. */
var ROW_HEIGHT_ESTIMATE = 460;

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
    '<nav class="browsing-hub-nav-host" id="browsing-hub-nav-host"></nav>' +
    '<div class="library-main" id="lib-main">' +
    '<h1 class="screen-title library-title" id="lib-title">Library</h1>' +
    '<p class="watch-status-msg" id="lib-scan-status"></p>' +
    '<div class="library-toolbar">' +
    '<div class="library-filter-bar" id="library-filter-bar">' +
    '<button class="library-filter-chip library-filter-chip--active" id="filter-chip-all" data-filter="all" tabindex="0">All</button>' +
    '<button class="library-filter-chip" id="filter-chip-unwatched" data-filter="unwatched" tabindex="0">Unwatched</button>' +
    '<button class="library-filter-chip library-filter-chip--sort" id="filter-chip-sort" data-sort-index="0" tabindex="0">Sort: Title</button>' +
    '</div>' +
    '<button class="btn btn-outline btn--sm library-scan-btn" id="btn-scan-library" tabindex="0">Scan library</button>' +
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
  // Set whenever displayItems is rebuilt (filter/sort/load) so the next
  // renderWindow drops ALL cards instead of reusing by index — the item AT each
  // index changed, so incremental reuse would show stale posters. Pure scrolling
  // leaves it false → cards are reused (no whole-grid poster flash).
  var displayDirty = false;
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

  // On a cold landing, move focus onto the first grid card once it renders so the
  // user starts in the content (not on the overlay rail, which would expand over
  // the grid). Mirrors homeScreen.focusFirstFeedCardIfNeeded: only displace the
  // auto-focused sidebar (data-initial-focus), never a deliberate sidebar landing
  // or an in-place library switch.
  function focusFirstGridCardIfNeeded() {
    if (destroyed || !grid) return;
    var active = document.activeElement;
    if (active && grid.contains(active)) return;
    var sidebar = screen.querySelector('.browsing-hub-nav-host');
    if (sidebar && active && sidebar.contains(active) && active !== document.body) {
      var initialAuto = sidebar.getAttribute('data-initial-focus') === '1';
      if (!initialAuto) return;
      sidebar.removeAttribute('data-initial-focus');
    }
    var card = grid.querySelector('.media-card');
    if (card && card.focus) card.focus();
  }

  // ── Scan status helpers ───────────────────────────────────────────────────

  function setScanStatus(text, isError) {
    if (!scanStatus) return;
    scanStatus.textContent = text || '';
    scanStatus.className = 'watch-status-msg' + (isError ? ' watch-status-error' : '');
  }

  function friendlyScanError(err) {
    if (err && err.status === 403) {
      return 'Scan not allowed. Your account may not have permission (admin only).';
    }
    if (err && err.status === 401) {
      return 'Sign-in expired. Sign in again to scan.';
    }
    if (err && err.status >= 500) {
      return 'Server unreachable. Try again in a moment.';
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
      // Newest first. addedAt is normalized to epoch ms by both backends
      // (Plex addedAt*1000, Jellyfin DateCreated→ms); 0 sinks to the bottom.
      items.sort(function (a, b) {
        return (b.addedAt || 0) - (a.addedAt || 0);
      });
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
    displayDirty = true;
  }

  function updateFilterChips() {
    if (!filterChipAll || !filterChipUnwatched || !filterChipSort) return;
    filterChipAll.className = 'library-filter-chip' + (activeFilter === 'all' ? ' library-filter-chip--active' : '');
    filterChipUnwatched.className = 'library-filter-chip' + (activeFilter === 'unwatched' ? ' library-filter-chip--active' : '');
    filterChipSort.textContent = 'Sort: ' + SORT_OPTIONS[activeSortIndex].label;
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
      invalidateFocusableCache();
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

    // Skip re-render if the window hasn't shifted — unless the dataset itself
    // changed (filter/sort/load), which must rebuild even at the same range.
    if (!displayDirty && renderStartIndex === lastRenderStart && renderEndIndex === lastRenderEnd) return;
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

    // Incremental reconcile (NOT a full rebuild): keep the cards that are still
    // in the new window so their already-loaded posters survive. Recreating every
    // card on each scroll restarts every poster from its dark placeholder + fade,
    // which flashes the whole grid black on every row step. Only remove the cards
    // that scrolled out and add the ones that scrolled in.
    // displayItems changed (filter/sort/load) → the item at each index is
    // different, so every card must be rebuilt; reuse only on pure scroll.
    var fullReset = displayDirty;
    displayDirty = false;
    var existingCards = Array.prototype.slice.call(grid.querySelectorAll('.media-card'));
    var present = {};
    var removedAny = false;
    for (var i = 0; i < existingCards.length; i++) {
      var ci = parseInt(existingCards[i].getAttribute('data-item-index'), 10);
      if (fullReset || isNaN(ci) || ci < renderStartIndex || ci >= renderEndIndex) {
        grid.removeChild(existingCards[i]);
        removedAny = true;
      } else {
        present[ci] = existingCards[i];
      }
    }

    // Update spacer heights
    topSpacer.style.height = (renderStartRow * rowHeightPx) + 'px';
    bottomSpacer.style.height = ((totalRows - renderEndRow) * rowHeightPx) + 'px';

    // Add the cards that entered the window, each inserted before the first
    // already-rendered card with a higher index so DOM stays in item order
    // (flex-wrap depends on it). New blocks are contiguous at one end, so this
    // is a handful of cheap lookups per scroll step.
    var addedAny = false;
    for (var j = renderStartIndex; j < renderEndIndex; j++) {
      if (present[j]) continue;
      var newCard = makeCard(displayItems[j], j);
      var ref = bottomSpacer;
      var cur = grid.querySelectorAll('.media-card');
      for (var m = 0; m < cur.length; m++) {
        var mi = parseInt(cur[m].getAttribute('data-item-index'), 10);
        if (!isNaN(mi) && mi > j) { ref = cur[m]; break; }
      }
      grid.insertBefore(newCard, ref);
      addedAny = true;
    }

    // Refresh focus.js's per-container focusable cache only when the node set
    // actually changed, so the geometric D-pad nav never scores detached cards
    // (the stale-cache "DOWN jumps to the sidebar and can't get back" bug).
    if (addedAny || removedAny) invalidateFocusableCache();

    // Focus is naturally preserved when the focused card stays in the window
    // (it's not removed). Only re-home if it scrolled out and focus dropped.
    if (!isNaN(focusedIndex) && focusedIndex >= renderStartIndex && focusedIndex < renderEndIndex) {
      var active2 = document.activeElement;
      if (!active2 || !grid.contains(active2)) {
        var refocus = present[focusedIndex] ||
          grid.querySelector('.media-card[data-item-index="' + focusedIndex + '"]');
        if (refocus && refocus.focus) refocus.focus();
      }
    }

    // Prime posters for the freshly added cards (kept cards already have theirs).
    if (addedAny) primeVisiblePosters(grid);

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
      focusFirstGridCardIfNeeded();

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

  // Land focus on the active sidebar item, but tag it as auto-focus so it gives
  // way to the first grid card once the grid renders (focusFirstGridCardIfNeeded).
  var initialSidebar = screen.querySelector('.browsing-hub-nav-host');
  if (initialSidebar) initialSidebar.setAttribute('data-initial-focus', '1');
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
