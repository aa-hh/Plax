import { getState, setState } from '../../core/store.js';
import { browseByType, refreshSection } from '../../plex/library.js';
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
/** Cap DOM cards to avoid webOS OOM on huge libraries (full virtualization deferred). */
var MAX_GRID_DOM_CARDS = 500;

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
    '<div class="media-grid" id="media-grid" data-cols="6"></div>' +
    '</div>' +
    '</div>';

  root.appendChild(screen);
  var detachFocus = attachFocusNav(screen);

  var hubNavHost = document.getElementById('browsing-hub-nav-host');
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
  var scanBtn = document.getElementById('btn-scan-library');
  // Full grid virtualization is deferred (see code review #5); initial poster batch is capped.
  var grid = document.getElementById('media-grid');
  var scanStatus = document.getElementById('lib-scan-status');
  var posterFocusToken = 0;
  var posterFocusTimer = null;
  var gridScrollTimer = null;
  var gridLoadToken = 0;
  var destroyed = false;

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

  if (grid) {
    grid.addEventListener('scroll', function () {
      if (destroyed) return;
      if (gridScrollTimer) clearTimeout(gridScrollTimer);
      gridScrollTimer = setTimeout(function () {
        gridScrollTimer = null;
        if (!destroyed) hydrateGridViewport(grid);
      }, 120);
    });
  }

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

  function gridCardCount() {
    if (!grid) return 0;
    return grid.querySelectorAll('.media-card').length;
  }

  function setGridCapNotice(visible, totalCount) {
    var id = 'lib-grid-cap-notice';
    var existing = document.getElementById(id);
    if (!visible) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;
    var notice = document.createElement('p');
    notice.id = id;
    notice.className = 'watch-status-msg';
    var shown = MAX_GRID_DOM_CARDS;
    notice.textContent = totalCount > shown
      ? 'Showing first ' + shown + ' of ' + totalCount + ' titles. Use Search to find others.'
      : 'Showing first ' + shown + ' titles.';
    var main = document.getElementById('lib-main');
    if (main && grid) main.insertBefore(notice, grid.nextSibling);
  }

  function appendGridCards(lib, items, startIndex) {
    var room = MAX_GRID_DOM_CARDS - gridCardCount();
    if (room <= 0) return 0;
    var batch = items.length > room ? items.slice(0, room) : items;
    batch.forEach(function (item, index) {
      var absoluteIndex = startIndex + index;
      var card = createMediaCard(item, function (selected, routeParams) {
        var route = routeParams || { ratingKey: selected.ratingKey };
        route.libraryType = lib.type;
        route.libraryId = lib.id;
        navigate('detail', route);
      }, {
        layout: 'grid',
        deferPoster: absoluteIndex >= LIBRARY_INITIAL_POSTERS
      });
      card.setAttribute('data-item-index', String(absoluteIndex));
      grid.appendChild(card);
    });
    return batch.length;
  }

  function renderGridPage(lib, items) {
    grid.innerHTML = '';
    setGridCapNotice(false);
    if (!items.length) return;
    var visible = items.length > MAX_GRID_DOM_CARDS ? items.slice(0, MAX_GRID_DOM_CARDS) : items;
    appendGridCards(lib, visible, 0);
    if (items.length > MAX_GRID_DOM_CARDS) setGridCapNotice(true, items.length);
    primeVisiblePosters(grid);
    focusFirst(grid);
  }

  scanBtn.addEventListener('click', startSectionScan);

  function loadGrid(lib) {
    var token = ++gridLoadToken;
    document.getElementById('lib-title').textContent = lib.title;
    grid.innerHTML = '<p class="status-msg">Loading…</p>';
    return browseByType(server, lib.id, lib.type, { progressive: true }).then(function (result) {
      if (destroyed || token !== gridLoadToken) return;
      var items = result.items || result;
      var fetchRest = result.fetchRest;
      renderGridPage(lib, items);

      if (fetchRest && gridCardCount() < MAX_GRID_DOM_CARDS) {
        fetchRest().then(function (allItems) {
          if (destroyed || token !== gridLoadToken) return;
          if (!allItems || allItems.length <= items.length) return;
          if (gridCardCount() >= MAX_GRID_DOM_CARDS) {
            setGridCapNotice(true, allItems.length);
            return;
          }
          var appended = appendGridCards(lib, allItems.slice(items.length), items.length);
          if (appended < allItems.length - items.length || allItems.length > MAX_GRID_DOM_CARDS) {
            setGridCapNotice(true, allItems.length);
          }
        }).catch(function () {});
      } else if (items.length >= MAX_GRID_DOM_CARDS) {
        setGridCapNotice(true, items.length);
      }
    }).catch(function (err) {
      if (destroyed || token !== gridLoadToken) return;
      grid.innerHTML = '<p class="status-msg">Failed: ' + err.message + '</p>';
    });
  }

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
      detachFocus();
    }
  };
}

export { libraryScreen };
