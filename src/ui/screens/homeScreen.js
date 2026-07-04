import { getState } from '../../core/store.js';
import { timeAnimation } from '../../perf/animationTiming.js';
import { beginTransition, endTransition, onIdle } from '../transitionGate.js';
import { loadHomeFeedPhased } from '../../backends/index.js';
import { loadLeavingSoonRows } from '../../plex/recommendations/homeFeed.js';
import { canUseWatchlists } from '../../watchlists/access.js';
import { listWatchlists } from '../../watchlists/store.js';
import { resolveWatchlistItems, watchlistToHubRow, queueToHubRow } from '../../watchlists/resolve.js';
import { getQueueItems, CHANGED_EVENT as USERQUEUE_CHANGED_EVENT } from '../../playback/userQueue.js';
import { profileKey } from '../../watchlists/store.js';
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
import { getArtUrl } from '../../backends/index.js';
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
    // The hero art box is ~796px wide (gt-col-5 + safe-x) and the art is cover-
    // scaled then scrimmed, so 720px is plenty — 960px was 1.2x overscan that
    // doubled the decode cost on the B8 for no visible gain behind the scrim.
    return getArtUrl(state.activeServer, path, 720);
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

    // Guard the swap with the current hero token so a slow image that resolves
    // after the user has moved on can't flash a stale backdrop, and so onerror/
    // timeout can't wedge the crossfade.
    var swapTok = ilHeroToken;
    var settled = false;
    function commit() {
      if (settled || destroyed || swapTok !== ilHeroToken) return;
      settled = true;
      ilCacheTouch(url);
      next.style.backgroundImage = 'url(' + url + ')';
      next.style.opacity = '1';
      curr.style.opacity = '0';
      ilSide = ilSide === 'a' ? 'b' : 'a';
    }
    var img = new Image();
    img.onload = commit;
    // A failed/slow art fetch must never leave the crossfade half-applied or
    // block the next one — drop it silently (the previous backdrop stays).
    img.onerror = function () { settled = true; };
    // Hard ceiling: if neither load nor error fires (B8 can stall on a slow
    // transcode), release the swap so a later focus can start fresh.
    setTimeout(function () { if (!settled) settled = true; }, 6000);
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
      return;
    }
    if (item.id === 'leavingSoon') {
      ilShowHero(false);
      loadLeavingSoonHub();
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
        }, 500);
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

  // Build the manually-queued "Up Next" rail from userQueue snapshots. Empty
  // queue → null (renders no rail). Snapshots already carry render+navigate data,
  // so they go straight into a hub row (no backend resolve needed).
  function buildUserQueueRow() {
    var items = getQueueItems(state.activeHomeUser || state.user) || [];
    if (!items.length) return null;
    return queueToHubRow(items);
  }

  // Placement: pin Continue Watching / On Deck first, then "Up Next" immediately
  // after it (or first when there's no resume rail), then the rest. Rationale:
  // resume is the single most-likely action, but a manually-queued item is a
  // deliberate "I want to watch this next" signal that should outrank the
  // algorithmic recommendation rails below it.
  function pinContinueWatchingFirst(rows, includeQueue) {
    var queueRow = includeQueue ? buildUserQueueRow() : null;
    var src = rows || [];
    if (!src.length && !queueRow) return src;
    var pinned = [];
    var rest = [];
    for (var i = 0; i < src.length; i++) {
      var id = src[i].hubIdentifier || '';
      // Never let a duplicate queue row from an append survive (defensive).
      if (id.indexOf('home.userqueue') !== -1) continue;
      if (id.indexOf('continue') !== -1 || id.indexOf('ondeck') !== -1 || id.indexOf('resume') !== -1) {
        pinned.push(src[i]);
      } else {
        rest.push(src[i]);
      }
    }
    if (queueRow) pinned.push(queueRow);
    return pinned.concat(rest);
  }

  function renderRowsIntoFeed(rows, append) {
    var token = renderToken;
    var el = document.getElementById('home-feed');
    if (!el || destroyed || token !== renderToken) return;
    // Drops the loading skeletons on a fresh render (even when empty) so they
    // can't leak above later-deferred rows. See prepareFeedForRender for why.
    if (!prepareFeedForRender(el, rows, append)) return;
    // Inject the "Up Next" rail only on the fresh (non-append) render so the
    // deferred-rows append below can't add a second copy.
    var sorted = pinContinueWatchingFirst(rows, !append);
    // ONE ROW PER MACROTASK: rendering 3 rows × 20 cards in one synchronous
    // pass measured as a ~1.1s main-thread freeze on the B8 (jank:navigation
    // home: 3 rAF frames in 1.5s; fade startDelayMs 1166). Render the first
    // row now and self-schedule the rest through the existing append path —
    // each row becomes its own task so frames and remote input interleave.
    var hasMoreRows = false;
    if (sorted.length > 1) {
      hasMoreRows = true;
      var laterRows = sorted.slice(1);
      sorted = sorted.slice(0, 1);
      setTimeout(function () {
        if (destroyed || token !== renderToken) return;
        renderRowsIntoFeed(laterRows, true);
      }, 0);
    }
    // Only the rows added in THIS pass get the staggered entrance. A fresh
    // render cleared the feed (startIndex 0); a deferred-append batch cascades
    // from its own start so late rows still reveal in sequence.
    var startIndex = el.querySelectorAll('.row-section:not(.row-skeleton)').length;
    sorted.forEach(function (row) {
      renderHubRow(el, row, navigate, {
        cols: 12,
        visibleCount: 20,
        server: state.activeServer,
        playbackPrefs: state.playbackPrefs
      });
    });
    // Staggered screen-enter reveal — each freshly-mounted row rises+fades in
    // (transform/opacity only, caps-motion-gated in CSS). Non-blocking: focus is
    // set independently below, so the reveal never gates first input.
    var lastStaggeredRow = applyRowEnterStagger(el, startIndex);
    if (lastStaggeredRow) {
      timeAnimation(lastStaggeredRow, 'anim:row-stagger-complete', {
        route: 'home', rowCount: sorted.length, append: !!append
      });
      if (document.documentElement.classList.contains('caps-motion')) {
        beginTransition(550); // per-row build + 250ms run + headroom
        if (!hasMoreRows) {
          lastStaggeredRow.addEventListener('animationend', function onCascadeEnd(e) {
            if (e.target !== lastStaggeredRow) return;
            lastStaggeredRow.removeEventListener('animationend', onCascadeEnd);
            endTransition();
          });
        }
      }
    }
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
    // Deferred behind the transition gate: JSON fetch+parse is main-thread
    // work that would otherwise run during the row cascade.
    if (state.activeServer && rows && rows.length) {
      onIdle(function () {
        if (destroyed || token !== renderToken) return;
        try {
          schedulePrefetch(state.activeServer, rows, { perRow: 6, maxRows: 2 });
          var firstLib = firstBrowsableLibrary();
          if (firstLib) prefetchLibraryBrowse(state.activeServer, firstLib);
        } catch (e) { /* ignore */ }
      });
    }
  }

  // Stagger the entrance of the rows added at/after startIndex. The CSS keyframe
  // (.row-section--enter) does the work under html.caps-motion; here we only set
  // a capped per-row animation-delay as a literal ms string (no CSS calc →
  // Chrome53-safe). The delay caps at MAX_STEPS so a long feed never makes the
  // last row wait — the reveal is ambient, not a gate on input.
  function applyRowEnterStagger(el, startIndex) {
    if (!el) return null;
    var rowEls = el.querySelectorAll('.row-section:not(.row-skeleton)');
    var STEP_MS = 40;
    var MAX_STEPS = 6; // 6 × 40ms = last row starts by 240ms
    var lastRow = null;
    for (var i = startIndex; i < rowEls.length; i++) {
      var rowEl = rowEls[i];
      var delay = Math.min(i - startIndex, MAX_STEPS) * STEP_MS;
      if (delay) rowEl.style.animationDelay = delay + 'ms';
      rowEl.classList.add('row-section--enter');
      lastRow = rowEl;
    }
    return lastRow;
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
        // Don't clobber a rendered "Up Next" rail (or any section) with the
        // empty-state copy: the queue rail can be the only content on Home.
        var hasRenderedRow = !!el.querySelector('.row-section');
        if (!hasInitial && (!rows || !rows.length) && !hasRenderedRow) {
          el.innerHTML = '<p class="status-msg">No recommendations yet. Browse a library from the sidebar.</p>';
        }
      }).catch(function () {});
    }).catch(function (err) {
      if (destroyed || token !== renderToken) return;
      var el = document.getElementById('home-feed');
      if (el) {
        el.innerHTML = '';
        var msg = document.createElement('p');
        msg.className = 'status-msg';
        msg.textContent = 'Could not load home: ' + (err && err.message ? err.message : 'unknown error');
        el.appendChild(msg);
      }
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

  function loadLeavingSoonHub() {
    var token = ++renderToken;
    var feedEl = document.getElementById('home-feed');
    if (feedEl) feedEl.innerHTML = '<p class="status-msg">Loading…</p>';

    loadLeavingSoonRows(state.activeServer, {
      libraries: state.libraries || [],
      activeHomeUser: state.activeHomeUser || null
    }).then(function (rows) {
      if (destroyed || token !== renderToken) return;
      var el = document.getElementById('home-feed');
      if (!el) return;
      el.innerHTML = '';
      var hasRows = false;
      (rows || []).forEach(function (row) {
        if (!row || !row.items || !row.items.length) return;
        hasRows = true;
        renderHubRow(el, row, navigate, {
          cols: 12,
          visibleCount: 20,
          server: state.activeServer,
          playbackPrefs: state.playbackPrefs
        });
      });
      invalidateFocusableCache();
      if (!hasRows) {
        el.innerHTML =
          '<p class="status-msg">Nothing is leaving soon. Titles expiring from your libraries will appear here.</p>';
      } else {
        primeVisiblePosters(el);
        focusFirstFeedCardIfNeeded();
      }
    }).catch(function () {
      if (destroyed || token !== renderToken) return;
      var el = document.getElementById('home-feed');
      if (el) {
        el.innerHTML =
          '<p class="status-msg">Nothing is leaving soon. Titles expiring from your libraries will appear here.</p>';
      }
    });
  }

  if (activeHubId === 'watchlist') {
    setHubTitle('Watchlist');
    loadWatchlistHub();
  } else if (activeHubId === 'leavingSoon') {
    setHubTitle('Leaving Soon');
    loadLeavingSoonHub();
  } else {
    setHubTitle('Home');
    loadHomeHub();
  }

  // Live-refresh the "Up Next" rail when the queue mutates (add/remove from the
  // detail overflow menu). Only re-run the default home feed — the rail lives on
  // the 'home' hub — and only for the profile this screen is showing. Chrome53-
  // safe: a plain window addEventListener (the dispatcher feature-detects).
  function onUserQueueChanged(e) {
    if (destroyed || activeHubId !== 'home') return;
    var changed = e && e.detail ? e.detail.profile : null;
    if (changed != null && changed !== profileKey(state.activeHomeUser || state.user)) return;
    loadHomeHub();
  }
  window.addEventListener(USERQUEUE_CHANGED_EVENT, onUserQueueChanged);

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
      window.removeEventListener(USERQUEUE_CHANGED_EVENT, onUserQueueChanged);
      detachFocus();
    },
    onSuspend: function () {
      try { abortPrefetch(); } catch (e) { /* ignore */ }
      // Cancel the immersive hero swap when this (retained) screen is covered
      // by a newer one: the 500ms settle timer — and any already-in-flight art
      // load — must not decode a 720px hero image BEHIND the detail screen
      // (measured contributor to detail's late freeze). Bumping the token
      // invalidates in-flight commits (same guard the swap already checks);
      // the next focused card re-arms the hero after resume.
      ilHeroToken += 1;
      if (ilHeroTimer) { clearTimeout(ilHeroTimer); ilHeroTimer = null; }
    },
    onResume: function () {
      // Recover posters whose deferred binds were dropped while this screen
      // was hidden (posterImages' stale-by-hide guard): re-prime whatever is
      // in the viewport now that the host is visible again.
      var el = document.getElementById('home-feed');
      if (el) primeVisiblePosters(el);
    }
  };
}

export { homeScreen };
