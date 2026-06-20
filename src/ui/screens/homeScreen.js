import { getState } from '../../core/store.js';
import { loadHomeFeedPhased } from '../../plex/recommendations/homeFeed.js';
import { canUseWatchlists } from '../../watchlists/access.js';
import { listWatchlists } from '../../watchlists/store.js';
import { resolveWatchlistItems, watchlistToHubRow } from '../../watchlists/resolve.js';
import { renderHubRow } from '../components/hubRow.js';
import { prepareFeedForRender } from './homeFeedRender.js';
import { mountBrowsingHubNav } from '../components/browsingHubNav.js';
import { focusFirst, attachFocusNav, invalidateFocusableCache } from '../focus.js';
import {
  hydrateFocusedNeighborhood,
  primeVisiblePosters
} from '../posterImages.js';
import {
  schedulePrefetch,
  prefetchLibraryBrowse,
  abortPrefetch
} from '../../core/idlePrefetch.js';
import { getArtUrl } from '../../plex/client.js';
import { loadUltraBlurBackdrop } from '../../plex/ultrablur.js';

function homeScreen(root, params, navigate) {
  var state = getState();
  var user = state.activeHomeUser || state.user;
  var screen = document.createElement('div');
  screen.className = 'screen screen-home';
  screen.innerHTML =
    '<div class="home-layout">' +
    '<nav class="browsing-hub-nav-host" id="browsing-hub-nav-host"></nav>' +
    '<div class="home-main">' +
    '<div class="il-hero" id="il-hero" aria-hidden="true">' +
    '<div class="il-hero__backdrop il-hero__backdrop--a" id="il-backdrop-a"></div>' +
    '<div class="il-hero__backdrop il-hero__backdrop--b" id="il-backdrop-b"></div>' +
    '<div class="il-hero__scrim"></div>' +
    '<div class="il-hero__content">' +
    '<p class="il-hero__label" id="il-hero-label"></p>' +
    '<h2 class="il-hero__title" id="il-hero-title"></h2>' +
    '<p class="il-hero__meta" id="il-hero-meta"></p>' +
    '<p class="il-hero__overview" id="il-hero-overview"></p>' +
    '</div>' +
    '</div>' +
    '<div class="home-feed-host" id="home-feed-host">' +
    '<div id="home-feed" class="home-feed"><p class="status-msg">Loading…</p></div>' +
    '</div></div></div>';

  root.appendChild(screen);
  var detachFocus = attachFocusNav(screen);
  var posterFocusToken = 0;
  var posterFocusTimer = null;
  var ultrablurPrefetchTimer = null;
  var destroyed = false;
  var renderToken = 0;
  var activeHubId = (params && params.hub) || 'home';
  var hubNavHost = screen.querySelector('#browsing-hub-nav-host');
  var hubTitleEl = screen.querySelector('#home-hub-title');

  // ── Immersive List hero state ──────────────────────────────────────────────
  var ilHeroEl    = screen.querySelector('#il-hero');
  var ilBackdropA = screen.querySelector('#il-backdrop-a');
  var ilBackdropB = screen.querySelector('#il-backdrop-b');
  var ilTitleEl   = screen.querySelector('#il-hero-title');
  var ilLabelEl   = screen.querySelector('#il-hero-label');
  var ilMetaEl    = screen.querySelector('#il-hero-meta');
  var ilOverview  = screen.querySelector('#il-hero-overview');
  var ilSide      = 'a'; // which backdrop is currently showing
  var ilHeroToken = 0;
  var ilHeroTimer = null;

  // Simple LRU for decoded backdrops (just track URLs; Image keeps pixels in mem)
  var ilCacheKeys = [];
  var IL_CACHE_MAX = 6;
  function ilCacheTouch(url) {
    var i = ilCacheKeys.indexOf(url);
    if (i >= 0) ilCacheKeys.splice(i, 1);
    ilCacheKeys.push(url);
    while (ilCacheKeys.length > IL_CACHE_MAX) ilCacheKeys.shift();
  }

  function ilBuildArtUrl(item) {
    if (!item || !state.activeServer) return null;
    var path = (item.artPath != null ? item.artPath : null) || (item.art != null ? item.art : null);
    if (!path) return null;
    return getArtUrl(state.activeServer, path, 960);
  }

  function ilFormatMeta(item) {
    if (!item) return '';
    var parts = [];
    if (item.year) parts.push(String(item.year));
    if (item.contentRating) parts.push(item.contentRating);
    if (item.duration) {
      var mins = Math.round(item.duration / 60000);
      var h = Math.floor(mins / 60);
      var m = mins % 60;
      parts.push(h > 0 ? h + 'h ' + m + 'm' : m + 'm');
    }
    if (item.genre) parts.push(typeof item.genre === 'string' ? item.genre : (item.Genre && item.Genre[0] && item.Genre[0].tag) || '');
    return parts.filter(Boolean).join('  ·  ');
  }

  function ilUpdateHero(item) {
    if (!item || !ilHeroEl) return;
    ilTitleEl.textContent = item.title || '';
    var typeLabel = item.type === 'show' ? 'TV Series' : item.type === 'movie' ? 'Movie' : '';
    ilLabelEl.textContent = typeLabel;
    ilMetaEl.textContent = ilFormatMeta(item);
    ilOverview.textContent = item.summary || '';

    var url = ilBuildArtUrl(item);
    if (!url) return;

    var next = ilSide === 'a' ? ilBackdropB : ilBackdropA;
    var curr = ilSide === 'a' ? ilBackdropA : ilBackdropB;

    var img = new Image();
    img.onload = function () {
      if (destroyed) return;
      ilCacheTouch(url);
      next.style.backgroundImage = 'url(' + url + ')';
      next.style.opacity = '1';
      curr.style.opacity = '0';
      ilSide = ilSide === 'a' ? 'b' : 'a';
    };
    img.src = url;
  }

  function ilShowHero(show) {
    if (!ilHeroEl) return;
    if (show) {
      ilHeroEl.style.display = '';
      ilHeroEl.removeAttribute('aria-hidden');
    } else {
      ilHeroEl.style.display = 'none';
      ilHeroEl.setAttribute('aria-hidden', 'true');
    }
  }
  // Hero hidden until first home-hub card is focused
  ilShowHero(false);
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
      ilShowHero(false);
      loadHomeHub();
      return;
    }
    if (item.id === 'watchlist') {
      ilShowHero(false);
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

    // Immersive list: show/update hero when a card in the home feed is focused
    if (activeHubId === 'home') {
      var inFeed = card && e.target.closest ? e.target.closest('#home-feed') : null;
      if (inFeed) {
        ilShowHero(true);
        var tok = ++ilHeroToken;
        if (ilHeroTimer) clearTimeout(ilHeroTimer);
        ilHeroTimer = setTimeout(function () {
          ilHeroTimer = null;
          if (destroyed || tok !== ilHeroToken) return;
          ilUpdateHero(card && card._plaxItem);
        }, 220);
      }
    }

    if (!card || destroyed) return;
    var token = ++posterFocusToken;
    if (posterFocusTimer) clearTimeout(posterFocusTimer);
    posterFocusTimer = setTimeout(function () {
      posterFocusTimer = null;
      if (destroyed || token !== posterFocusToken) return;
      hydrateFocusedNeighborhood(card, { before: 2, after: 4 });
    }, 80);

    if (ultrablurPrefetchTimer) clearTimeout(ultrablurPrefetchTimer);
    ultrablurPrefetchTimer = setTimeout(function () {
      ultrablurPrefetchTimer = null;
      if (destroyed) return;
      var item = card && card._plaxItem;
      var artPath = item && (item.artPath || item.art);
      var server = getState().activeServer;
      if (artPath && server) loadUltraBlurBackdrop(server, artPath);
    }, 250);
  });

  function pinContinueWatchingFirst(rows) {
    if (!rows || !rows.length) return rows;
    var pinned = [];
    var rest = [];
    for (var i = 0; i < rows.length; i++) {
      var id = rows[i].hubIdentifier || '';
      if (id.indexOf('continue') !== -1 || id.indexOf('ondeck') !== -1 || id.indexOf('resume') !== -1) {
        pinned.push(rows[i]);
      } else {
        rest.push(rows[i]);
      }
    }
    return pinned.concat(rest);
  }

  function renderRowsIntoFeed(rows, append) {
    var token = renderToken;
    var el = document.getElementById('home-feed');
    if (!el || destroyed || token !== renderToken) return;
    // Drops the loading skeletons on a fresh render (even when empty) so they
    // can't leak above later-deferred rows. See prepareFeedForRender for why.
    if (!prepareFeedForRender(el, rows, append)) return;
    var sorted = pinContinueWatchingFirst(rows);
    sorted.forEach(function (row) {
      renderHubRow(el, row, navigate, {
        cols: 12,
        visibleCount: 20,
        server: state.activeServer,
        playbackPrefs: state.playbackPrefs
      });
    });
    // The feed DOM just changed (skeletons → rows, or deferred rows appended).
    // focus.js caches focusables/zones per container; invalidate so D-pad RIGHT
    // from the sidebar finds the freshly-rendered cards instead of locking onto
    // the now-stale skeleton zones (the "can't go right into the rails after
    // returning to Home" bug).
    invalidateFocusableCache();
    primeVisiblePosters(el);
    focusFirstFeedCardIfNeeded();
    // After the visible rows are committed, warm the metadata (and detail
    // follow-ups) for the top items so opening detail does not hit the
    // network, and warm the first library's grid so entering it is instant.
    if (state.activeServer && rows && rows.length) {
      try {
        schedulePrefetch(state.activeServer, rows, { perRow: 6, maxRows: 2 });
        var firstLib = firstBrowsableLibrary();
        if (firstLib) prefetchLibraryBrowse(state.activeServer, firstLib);
      } catch (e) { /* ignore */ }
    }
  }

  // The first movie/show library in the sidebar — the most likely entry.
  function firstBrowsableLibrary() {
    var libs = state.libraries || [];
    for (var i = 0; i < libs.length; i++) {
      var t = libs[i] && libs[i].type;
      if (t === 'movie' || t === 'show') return libs[i];
    }
    return libs.length ? libs[0] : null;
  }

  function focusFirstFeedCardIfNeeded() {
    if (destroyed) return;
    var el = document.getElementById('home-feed');
    if (!el) return;
    var active = document.activeElement;
    // If focus is already inside the feed, leave it alone.
    if (active && el.contains(active)) return;
    // If focus is on a sidebar item the user explicitly moved to, leave it alone.
    var sidebar = screen.querySelector('.browsing-hub-nav-host');
    if (sidebar && active && sidebar.contains(active) && active !== document.body) {
      // Only override the initial body-focus state — not a deliberate sidebar landing.
      var initialAuto = sidebar.getAttribute('data-initial-focus') === '1';
      if (!initialAuto) return;
      sidebar.removeAttribute('data-initial-focus');
    }
    var card = el.querySelector('.media-card, .row-item, [data-item-index="0"]');
    if (card && card.focus) card.focus();
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
        renderHubRow(el, row, navigate, {
        cols: 12,
        visibleCount: 20,
        server: state.activeServer,
        playbackPrefs: state.playbackPrefs
      });
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
      invalidateFocusableCache();
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

  // Initial focus goes to the first content card once the feed loads
  // (see focusFirstFeedCardIfNeeded). Tag the sidebar as auto-focused so
  // it can be displaced when content arrives — but never if the user
  // explicitly moved into it.
  var initialSidebar = screen.querySelector('.browsing-hub-nav-host');
  if (initialSidebar) initialSidebar.setAttribute('data-initial-focus', '1');
  if (!hubNav.focusSidebar()) focusFirst(screen);

  return {
    destroy: function () {
      destroyed = true;
      renderToken += 1;
      posterFocusToken += 1;
      ilHeroToken += 1;
      if (posterFocusTimer) { clearTimeout(posterFocusTimer); posterFocusTimer = null; }
      if (ilHeroTimer) { clearTimeout(ilHeroTimer); ilHeroTimer = null; }
      try { abortPrefetch(); } catch (e) { /* ignore */ }
      detachFocus();
    },
    onSuspend: function () {
      try { abortPrefetch(); } catch (e) { /* ignore */ }
    }
  };
}

export { homeScreen };
