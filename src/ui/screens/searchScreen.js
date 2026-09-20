import { getState } from '../../core/store.js';
import { search as searchHubs } from '../../backends/index.js';
import { renderHubRow } from '../components/hubRow.js';
import { mountBrowsingHubNav } from '../components/browsingHubNav.js';
import { focusFirst, attachFocusNav, invalidateFocusableCache } from '../focus.js';
import {
  hydrateFocusedNeighborhood,
  primeVisiblePosters
} from '../posterImages.js';
import {
  describeLoadError,
  renderStatus,
  renderRowSkeletons,
  truncateLabel
} from './screenStates.js';

var DEBOUNCE_MS = 350;
var HUB_LIMIT = 10;
var SEARCH_SKELETON_ROWS = 3;
/** Longest query echoed back in the "No results" line (CJK/emoji-safe cut). */
var QUERY_ECHO_MAX = 60;
var IDLE_MESSAGE = 'Type to search your libraries.';
/** Staggered reveal for rows that arrive in one batch (mirrors Home). */
var ROW_STAGGER_STEP_MS = 40;
var ROW_STAGGER_MAX_STEPS = 6;

function searchScreen(root, params, navigate) {
  var state = getState();
  var server = state.activeServer;
  var activeLibrary = state.activeLibrary;

  var screen = document.createElement('div');
  screen.className = 'screen search-screen';
  screen.innerHTML =
    '<div class="home-layout search-layout">' +
    '<nav class="browsing-hub-nav-host" id="browsing-hub-nav-host" data-focus-zone="sidebar" data-focus-zone-enter=".browsing-hub-item"></nav>' +
    '<div class="home-main search-main">' +
    '<h1 class="screen-title screen-title-compact">Search</h1>' +
    '<div class="search-input-row" data-focus-zone="search-input">' +
    '<input id="search-input" class="search-input" type="search" tabindex="0" aria-label="Search" ' +
    'placeholder="Search movies, shows, episodes" ' +
    'autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />' +
    '</div>' +
    '<div id="search-results" class="search-results" aria-live="polite"></div>' +
    '</div></div>';

  root.appendChild(screen);
  var detachFocus = attachFocusNav(screen);

  mountBrowsingHubNav(screen.querySelector('#browsing-hub-nav-host'), {
    navigate: navigate,
    activeRoute: 'search',
    fromRoute: 'search'
  });

  var input = screen.querySelector('#search-input');
  var results = screen.querySelector('#search-results');
  var debounceTimer = null;
  var lastQuery = '';
  var requestToken = 0;
  var destroyed = false;
  var posterFocusToken = 0;
  var posterFocusTimer = null;

  function schedulePosterNeighborhood(card) {
    if (!card || destroyed) return;
    var token = ++posterFocusToken;
    if (posterFocusTimer) clearTimeout(posterFocusTimer);
    posterFocusTimer = setTimeout(function () {
      posterFocusTimer = null;
      if (destroyed || token !== posterFocusToken) return;
      hydrateFocusedNeighborhood(card, { before: 2, after: 4 });
    }, 80);
  }

  screen.addEventListener('focusin', function (e) {
    var card = e.target && e.target.closest ? e.target.closest('.media-card') : null;
    if (card) schedulePosterNeighborhood(card);
  });

  // Any re-render of the results pane may remove the focused card / retry
  // button; keep focus on the input (the natural place to keep typing).
  function reclaimFocus() {
    var active = document.activeElement;
    if (active && results.contains(active) && input.focus) input.focus();
  }

  function setMessage(text, opts) {
    reclaimFocus();
    renderStatus(results, text, opts);
    invalidateFocusableCache();
  }

  function setBusy(busy) {
    if (busy) input.setAttribute('aria-busy', 'true');
    else input.removeAttribute('aria-busy');
  }

  function showSearchSkeletons() {
    reclaimFocus();
    renderRowSkeletons(results, SEARCH_SKELETON_ROWS);
    invalidateFocusableCache();
  }

  function noResultsMessage() {
    return 'No results for “' + truncateLabel(lastQuery, QUERY_ECHO_MAX) + '”. Try a shorter title or a different spelling.';
  }

  function enterRow(section, step) {
    if (!section || !section.classList) return;
    var delay = Math.min(step, ROW_STAGGER_MAX_STEPS) * ROW_STAGGER_STEP_MS;
    if (delay) section.style.animationDelay = delay + 'ms';
    section.classList.add('row-section--enter');
  }

  function renderRows(rows) {
    reclaimFocus();
    results.innerHTML = '';
    if (!rows.length) {
      setMessage(noResultsMessage());
      return;
    }
    rows.forEach(function (row, i) {
      enterRow(renderHubRow(results, row, navigate), i);
    });
    invalidateFocusableCache();
    primeVisiblePosters(results);
  }

  function appendRow(row) {
    // Streamed rows already arrive spaced out by the network; no extra delay.
    enterRow(renderHubRow(results, row, navigate), 0);
    invalidateFocusableCache();
    primeVisiblePosters(results);
  }

  function runSearch(query) {
    var token = ++requestToken;
    setBusy(false);
    if (!query) {
      setMessage(IDLE_MESSAGE);
      return;
    }
    if (!server) {
      setMessage('No server connected. Sign in from Settings, then search again.');
      return;
    }
    setBusy(true);
    showSearchSkeletons();
    var streamed = false;
    searchHubs(server, query, HUB_LIMIT, {
      library: activeLibrary,
      stagger: true,
      onRow: function (row) {
        if (token !== requestToken || destroyed) return;
        if (!streamed) {
          reclaimFocus();
          results.innerHTML = '';
          streamed = true;
        }
        appendRow(row);
      }
    })
      .then(function (rows) {
        if (token !== requestToken || destroyed) return;
        setBusy(false);
        if (!rows.length) {
          setMessage(noResultsMessage());
          return;
        }
        if (!streamed) renderRows(rows);
        else primeVisiblePosters(results);
      })
      .catch(function (err) {
        if (token !== requestToken || destroyed) return;
        setBusy(false);
        setMessage(describeLoadError(err, 'search results'), {
          error: true,
          retry: function () { runSearch(lastQuery); }
        });
      });
  }

  function scheduleSearch() {
    var q = input.value.trim();
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (q === lastQuery) return;
    debounceTimer = setTimeout(function () {
      debounceTimer = null;
      lastQuery = q;
      runSearch(q);
    }, DEBOUNCE_MS);
  }

  input.addEventListener('input', scheduleSearch);

  input.addEventListener('keydown', function (e) {
    if (e.keyCode === 13) {
      e.preventDefault();
      e.stopPropagation();
      if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
      lastQuery = input.value.trim();
      runSearch(lastQuery);
    }
  });

  if (params && params.query) {
    input.value = params.query;
    lastQuery = String(params.query).trim();
    runSearch(lastQuery);
  } else {
    setMessage(IDLE_MESSAGE);
  }

  setTimeout(function () {
    try { input.focus(); } catch (e) { focusFirst(screen); }
  }, 0);

  return {
    destroy: function () {
      destroyed = true;
      posterFocusToken += 1;
      if (posterFocusTimer) {
        clearTimeout(posterFocusTimer);
        posterFocusTimer = null;
      }
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      requestToken += 1;
      detachFocus();
    }
  };
}

export { searchScreen };
