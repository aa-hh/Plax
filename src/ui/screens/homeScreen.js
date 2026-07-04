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
import { getArtUrl, loadAmbientColors } from '../../backends/index.js';
import { tvLog } from '../../utils/tvDebug.js';
import { buildCornerWashCss, cornerWashLayerCount, hexToRgba } from '../colorWash.js';

function homeScreen(root, params, navigate) {
  var state = getState();
  var user = state.activeHomeUser || state.user;
  var screen = document.createElement('div');
  // il--no-bleed: DESIGN verdict, not a perf fallback (2026-07-04, on-device).
  // The soft full-bleed art layer read as a duplicated poster echo behind the
  // crisp corner box — a 720→1920 upscale is not soft enough to register as
  // ambient glow. The immersive response is carried by the ambient color wash
  // + the crisp subject box. Remove this class only with a REAL blur source
  // (e.g. server-blurred art), never the raw upscale.
  screen.className = 'screen screen-home il--no-bleed';
  screen.innerHTML =
    '<div class="home-layout">' +
    // Layered immersive hero — full-screen ambient wash (a/b) + soft art bleed
    // (a/b) + bleed scrim, all BEHIND the home content (see .il-ambient /
    // .il-hero__bleed in app.css). Color leads, image follows.
    '<div class="il-ambient il-ambient--a" id="il-ambient-a"></div>' +
    '<div class="il-ambient il-ambient--b" id="il-ambient-b"></div>' +
    '<div class="il-hero__bleed il-hero__bleed--a" id="il-bleed-a"></div>' +
    '<div class="il-hero__bleed il-hero__bleed--b" id="il-bleed-b"></div>' +
    '<div class="il-hero__bleed-scrim" id="il-bleed-scrim"></div>' +
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
  var ilAmbientA  = screen.querySelector('#il-ambient-a');
  var ilAmbientB  = screen.querySelector('#il-ambient-b');
  var ilBleedA    = screen.querySelector('#il-bleed-a');
  var ilBleedB    = screen.querySelector('#il-bleed-b');
  var ilBleedScrim = screen.querySelector('#il-bleed-scrim');
  var ilTitleEl   = screen.querySelector('#il-hero-title');
  var ilLabelEl   = screen.querySelector('#il-hero-label');
  var ilMetaEl    = screen.querySelector('#il-hero-meta');
  var ilOverview  = screen.querySelector('#il-hero-overview');
  var ilSide      = 'a'; // which crisp corner-box backdrop is currently showing
  var ilAmbSide   = 'a'; // which ambient wash layer is currently showing
  var ilBleedSide = 'a'; // which bleed layer is currently showing
  var ilHeroToken = 0;
  var ilHeroTimer = null;
  var ilAmbientOn = false; // ambient wash currently faded in (hero visible)

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

  // Max opacities: ambient is a subtle tint (never wallpaper); the bleed art is
  // soft support under a strong scrim. Kept as constants so the crossfade both
  // ramps to and (on ilShowHero(false)) leaves from a single source of truth.
  var IL_AMBIENT_MAX = '0.55';
  var IL_BLEED_MAX = '0.45';

  // Fade the ambient wash into `colors` immediately — the cheap "color leads"
  // layer, applied on a palette cache-hit before the image bytes are ready.
  function ilApplyAmbient(colors, tok) {
    if (!ilAmbientA || !colors) return;
    if (destroyed || tok !== ilHeroToken) return;
    var wash = buildCornerWashCss(colors);
    if (!wash) return;
    var count = cornerWashLayerCount(colors);
    // Per-layer repeat: noise tile tiles, radial gradients don't (mirrors
    // detailScreen's detailBgLayerRepeat — never parse the wash string).
    var repeats = [];
    for (var i = 0; i < count; i++) repeats.push(i === 0 ? 'repeat' : 'no-repeat');
    var repeatStr = repeats.join(', ');
    var next = ilAmbSide === 'a' ? ilAmbientB : ilAmbientA;
    var curr = ilAmbSide === 'a' ? ilAmbientA : ilAmbientB;
    next.style.backgroundImage = wash;
    next.style.backgroundRepeat = repeatStr;
    next.style.opacity = IL_AMBIENT_MAX;
    curr.style.opacity = '0';
    ilAmbSide = ilAmbSide === 'a' ? 'b' : 'a';
    ilAmbientOn = true;
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

    // Guard the whole swap with the current hero token so a slow read that
    // resolves after the user has moved on can't flash a stale layer.
    var swapTok = ilHeroToken;

    // ── VISIBLE LAYERS use the plain art URL as a CSS background (display only,
    // no CORS, no canvas) — the way the crisp box worked BEFORE Phase 3. The
    // Phase-3 blob-XHR path (palette.js) fed BOTH the box and the bleed off an
    // objectURL; when that fetch/decode failed on the B8 it silently produced
    // null and the ENTIRE hero (incl. the previously-working box) went blank.
    // Decouple: images from the raw URL, wash colors from PMS (below). Preload
    // via an <img> so we only crossfade once the bytes are actually decoded.
    var img = new Image();
    var imgSettled = false;
    img.onload = function () {
      if (imgSettled || destroyed || swapTok !== ilHeroToken) return;
      imgSettled = true;
      var artCss = 'url(' + url + ')';
      ilCacheTouch(url);

      var boxNext = ilSide === 'a' ? ilBackdropB : ilBackdropA;
      var boxCurr = ilSide === 'a' ? ilBackdropA : ilBackdropB;
      boxNext.style.backgroundImage = artCss;
      boxNext.style.opacity = '1';
      boxCurr.style.opacity = '0';
      ilSide = ilSide === 'a' ? 'b' : 'a';

      // Bleed is caps-motion + kill-switch gated in CSS via !important (inline
      // writes beat plain class rules; !important lets the suppressed states win).
      var bleedNext = ilBleedSide === 'a' ? ilBleedB : ilBleedA;
      var bleedCurr = ilBleedSide === 'a' ? ilBleedA : ilBleedB;
      bleedNext.style.backgroundImage = artCss;
      bleedNext.style.opacity = IL_BLEED_MAX;
      bleedCurr.style.opacity = '0';
      if (ilBleedScrim) ilBleedScrim.style.opacity = '1';
      ilBleedSide = ilBleedSide === 'a' ? 'b' : 'a';
    };
    img.onerror = function () { imgSettled = true; };
    setTimeout(function () { if (!imgSettled) imgSettled = true; }, 6000);
    img.src = url;

    // ── AMBIENT WASH colors from PMS /services/ultrablur/colors — the SAME
    // source the detail backdrop uses (proven on-device), and home already
    // prefetches it on focus at 250ms so by this 500ms settle it is usually
    // cache-warm. Independent of the image crossfade above ("color leads,
    // image follows" still holds when colors resolve first). No canvas, no
    // cross-origin byte read — the fragile bits that broke Phase 3.
    var server = state.activeServer;
    var artPath = item.artPath || item.art;
    var colorsFrom = 'none';
    if (server && artPath) {
      loadAmbientColors(server, item).then(function (colors) {
        if (destroyed || swapTok !== ilHeroToken) return;
        if (colors) {
          ilApplyAmbient(colors, swapTok);
          ilTintHeroScrim(colors);
          tvLog('perf', 'home:hero-swap', { colorsFrom: 'ambient' });
        } else {
          tvLog('perf', 'home:hero-swap', { colorsFrom: 'none' });
        }
      });
    } else {
      tvLog('perf', 'home:hero-swap', { colorsFrom: colorsFrom });
    }
  }

  // Tint the hero box's edge scrim with the ITEM's OWN palette (2026-07-04
  // seam fix, round 2). Every transparency-only melt still left a visible
  // color-temperature boundary: the masked photo region (often dark pixels)
  // hands off to a wash built from corner AVERAGES, so even a long alpha ramp
  // ends in a luminance/hue cliff at the contour where content stops reading.
  // The bridge: as the photo's mask fades it OUT, this gradient fades the
  // wash's own top-right color IN over the same band — mid-band ghosting is
  // hidden under the tint, and at the box's edges the tint's strength (~0.35)
  // roughly tracks the wash's top-right radial underneath, so hue stays
  // continuous across the boundary. One inline string per swap; zero layers
  // added; the static CSS scrim colors are just the pre-colors default.
  function ilTintHeroScrim(colors) {
    var scrimEl = screen.querySelector('.il-hero__scrim');
    if (!scrimEl || !colors || !colors.topRight) return;
    var mid = hexToRgba(colors.topRight, 0.45);
    var edge = hexToRgba(colors.topRight, 0.35);
    var clear = hexToRgba(colors.topRight, 0);
    if (!mid) return;
    scrimEl.style.background =
      'linear-gradient(to left, ' + clear + ' 28%, ' + mid + ' 62%, ' + edge + ' 100%), ' +
      'linear-gradient(to top, ' + edge + ' 0%, ' + mid + ' 26%, ' + clear + ' 55%)';
  }

  function ilShowHero(show) {
    if (!ilHeroEl) return;
    if (show) {
      ilHeroEl.style.display = '';
      ilHeroEl.removeAttribute('aria-hidden');
      // Restore the ambient wash that was faded out when focus left the feed —
      // the next ilUpdateHero re-crossfades it, but bring the current side back
      // now so there's no dark flash before the 500ms settle resolves.
      if (ilAmbientOn) {
        (ilAmbSide === 'a' ? ilAmbientB : ilAmbientA).style.opacity = IL_AMBIENT_MAX;
      }
    } else {
      ilHeroEl.style.display = 'none';
      ilHeroEl.setAttribute('aria-hidden', 'true');
      // Fade BOTH ambient layers out alongside the content dim (sidebar focus /
      // non-home hubs). Bleed follows so the art never lingers over a hub with
      // no focused card. State (which side, whether on) is preserved so a
      // later ilShowHero(true) restores without a re-sample.
      if (ilAmbientA) { ilAmbientA.style.opacity = '0'; ilAmbientB.style.opacity = '0'; }
      if (ilBleedA) { ilBleedA.style.opacity = '0'; ilBleedB.style.opacity = '0'; }
      if (ilBleedScrim) ilBleedScrim.style.opacity = '0';
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
      if (artPath && server) loadAmbientColors(server, item);
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
