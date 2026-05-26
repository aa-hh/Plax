import { getState } from '../../core/store.js';
import { loadHomeFeedPhased } from '../../plex/recommendations/homeFeed.js';
import { canUseWatchlists } from '../../watchlists/access.js';
import { listWatchlists } from '../../watchlists/store.js';
import { resolveWatchlistItems, watchlistToHubRow } from '../../watchlists/resolve.js';
import { renderHubRow } from '../components/hubRow.js';
import { mountBrowsingHubNav } from '../components/browsingHubNav.js';
import { focusFirst, attachFocusNav } from '../focus.js';
import {
  hydrateFocusedNeighborhood,
  primeVisiblePosters
} from '../posterImages.js';

function homeScreen(root, params, navigate) {
  var state = getState();
  var user = state.activeHomeUser || state.user;
  var screen = document.createElement('div');
  screen.className = 'screen screen-home';
  screen.innerHTML =
    '<div class="home-layout">' +
    '<nav class="browsing-hub-nav-host" id="browsing-hub-nav-host"></nav>' +
    '<div class="home-main">' +
    '<h1 class="screen-title screen-title-compact" id="home-hub-title">Home</h1>' +
    '<div class="home-feed-host" id="home-feed-host">' +
    '<div id="home-feed" class="home-feed"><p class="status-msg">Loading…</p></div>' +
    '</div></div></div>';

  root.appendChild(screen);
  var detachFocus = attachFocusNav(screen);
  var posterFocusToken = 0;
  var posterFocusTimer = null;
  var destroyed = false;
  var renderToken = 0;
  var activeHubId = (params && params.hub) || 'home';
  var hubNavHost = document.getElementById('browsing-hub-nav-host');
  var hubTitleEl = document.getElementById('home-hub-title');
  var hubNav = mountBrowsingHubNav(hubNavHost, {
    navigate: navigate,
    activeHubId: activeHubId,
    fromRoute: 'home',
    onSelect: function (item) {
      if (item.id === 'settings' || item.id === 'search' || item.id.indexOf('library:') === 0) return;
      selectHub(item);
    }
  });
  activeHubId = hubNav.activeId;

  function setHubTitle(label) {
    if (hubTitleEl) hubTitleEl.textContent = label || 'Home';
  }

  function selectHub(item) {
    if (!item) return;
    if (item.id.indexOf('library:') === 0 && item.library) {
      navigate('library', { libraryId: item.library.id });
      return;
    }
    activeHubId = item.id;
    hubNav.setActiveId(activeHubId);
    setHubTitle(item.label);
    if (item.id === 'home') {
      loadHomeHub();
      return;
    }
    if (item.id === 'watchlist') {
      loadWatchlistHub();
    }
  }

  function renderRowSkeletons(el, count) {
    var i;
    el.innerHTML = '';
    for (i = 0; i < count; i++) {
      var section = document.createElement('div');
      section.className = 'row-section row-skeleton';
      section.innerHTML =
        '<p class="row-label row-skeleton-label"></p>' +
        '<div class="row-scroll row-skeleton-scroll">' +
        '<div class="row-skeleton-card"></div>'.repeat(8) +
        '</div>';
      el.appendChild(section);
    }
  }

  screen.addEventListener('focusin', function (e) {
    var card = e.target && e.target.closest ? e.target.closest('.media-card') : null;
    if (!card || destroyed) return;
    var token = ++posterFocusToken;
    if (posterFocusTimer) clearTimeout(posterFocusTimer);
    posterFocusTimer = setTimeout(function () {
      posterFocusTimer = null;
      if (destroyed || token !== posterFocusToken) return;
      hydrateFocusedNeighborhood(card, { before: 2, after: 4 });
    }, 80);
  });

  function renderRowsIntoFeed(rows, append) {
    var token = renderToken;
    var el = document.getElementById('home-feed');
    if (!el || destroyed || token !== renderToken) return;
    if (!rows || !rows.length) return;
    if (!append) el.innerHTML = '';
    rows.forEach(function (row) {
      renderHubRow(el, row, navigate, { cols: 12, visibleCount: 20 });
    });
    primeVisiblePosters(el);
  }

  function loadHomeHub() {
    var feedEl = document.getElementById('home-feed');
    if (feedEl) renderRowSkeletons(feedEl, 3);
    var token = ++renderToken;

    loadHomeFeedPhased(state.activeServer, {
      libraries: state.libraries || [],
      activeHomeUser: state.activeHomeUser || null
    }).then(function (feed) {
      if (destroyed || token !== renderToken) return;
      var el = document.getElementById('home-feed');
      if (!el) return;

      renderRowsIntoFeed(feed.initialRows, false);

      (feed.deferredRowsPromise || Promise.resolve([])).then(function (rows) {
        if (destroyed || token !== renderToken || !rows || !rows.length) return;
        renderRowsIntoFeed(rows, true);
      }).catch(function () {});

      var hasInitial = feed.initialRows && feed.initialRows.length;
      (feed.deferredRowsPromise || Promise.resolve([])).then(function (rows) {
        if (destroyed || token !== renderToken) return;
        if (!hasInitial && (!rows || !rows.length)) {
          el.innerHTML = '<p class="status-msg">No recommendations yet. Browse a library from the sidebar.</p>';
        }
      }).catch(function () {});
    }).catch(function (err) {
      if (destroyed || token !== renderToken) return;
      var el = document.getElementById('home-feed');
      if (el) el.innerHTML = '<p class="status-msg">Could not load home: ' + err.message + '</p>';
    });
  }

  function loadWatchlistHub() {
    if (!canUseWatchlists(user)) {
      var denied = document.getElementById('home-feed');
      if (denied) denied.innerHTML = '<p class="status-msg">Watchlists are not available for this profile.</p>';
      return;
    }
    var token = ++renderToken;
    var feedEl = document.getElementById('home-feed');
    if (feedEl) feedEl.innerHTML = '<p class="status-msg">Loading watchlists…</p>';

    var lists = listWatchlists(user);
    if (!lists.length) {
      feedEl.innerHTML =
        '<p class="status-msg">No watchlists yet. Bookmark a movie or episode, or create a list in Settings.</p>';
      return;
    }

    Promise.all(lists.map(function (wl) {
      return resolveWatchlistItems(state.activeServer, wl.items || []).then(function (items) {
        return watchlistToHubRow(wl, items);
      });
    })).then(function (rows) {
      if (destroyed || token !== renderToken) return;
      var el = document.getElementById('home-feed');
      if (!el) return;
      el.innerHTML = '';
      var hasRows = false;
      rows.forEach(function (row) {
        if (!row.items || !row.items.length) return;
        hasRows = true;
        renderHubRow(el, row, navigate, { cols: 12, visibleCount: 20 });
        var wlId = String(row.hubIdentifier || '').replace('watchlist.', '');
        var sections = el.querySelectorAll('.row-section');
        var section = sections[sections.length - 1];
        if (section) {
          var label = section.querySelector('.row-label');
          if (label && wlId) {
            var link = document.createElement('button');
            link.type = 'button';
            link.className = 'watchlist-row-link';
            link.setAttribute('data-watchlist-id', wlId);
            link.tabIndex = 0;
            link.textContent = row.title + ' →';
            label.innerHTML = '';
            label.appendChild(link);
            link.addEventListener('click', function () {
              navigate('watchlist', { watchlistId: wlId });
            });
          }
        }
      });
      if (!hasRows) {
        el.innerHTML = '<p class="status-msg">Your watchlists are empty. Bookmark titles from detail screens.</p>';
      } else {
        primeVisiblePosters(el);
      }
    });
  }

  if (activeHubId === 'watchlist') {
    setHubTitle('Watchlist');
    loadWatchlistHub();
  } else {
    setHubTitle('Home');
    loadHomeHub();
  }

  if (!hubNav.focusSidebar()) focusFirst(screen);

  return {
    destroy: function () {
      destroyed = true;
      renderToken += 1;
      posterFocusToken += 1;
      if (posterFocusTimer) {
        clearTimeout(posterFocusTimer);
        posterFocusTimer = null;
      }
      detachFocus();
    }
  };
}

export { homeScreen };
