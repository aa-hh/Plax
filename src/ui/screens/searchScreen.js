import { getState } from '../../core/store.js';
import { searchHubs } from '../../plex/search.js';
import { renderHubRow } from '../components/hubRow.js';
import { mountBrowsingHubNav } from '../components/browsingHubNav.js';
import { focusFirst, attachFocusNav } from '../focus.js';
import {
  hydrateFocusedNeighborhood,
  primeVisiblePosters
} from '../posterImages.js';

var DEBOUNCE_MS = 350;
var HUB_LIMIT = 10;
var SEARCH_SKELETON_ROWS = 3;

function escapeText(s) {
  var d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
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

function searchScreen(root, params, navigate) {
  var state = getState();
  var server = state.activeServer;
  var activeLibrary = state.activeLibrary;

  var screen = document.createElement('div');
  screen.className = 'screen search-screen';
  screen.innerHTML =
    '<div class="home-layout search-layout">' +
    '<nav class="browsing-hub-nav-host" id="browsing-hub-nav-host"></nav>' +
    '<div class="home-main search-main">' +
    '<h1 class="screen-title screen-title-compact">Search</h1>' +
    '<div class="search-input-row">' +
    '<input id="search-input" class="search-input" type="search" tabindex="0" aria-label="Search" ' +
    'placeholder="Search movies, shows, episodes" ' +
    'autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />' +
    '</div>' +
    '<div id="search-results" class="search-results">' +
    '<p class="status-msg">Type to search your Plex libraries.</p>' +
    '</div></div></div>';

  root.appendChild(screen);
  var detachFocus = attachFocusNav(screen);

  mountBrowsingHubNav(document.getElementById('browsing-hub-nav-host'), {
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

  function setMessage(html) {
    results.innerHTML = '<p class="status-msg">' + html + '</p>';
  }

  function showSearchSkeletons() {
    renderRowSkeletons(results, SEARCH_SKELETON_ROWS);
  }

  function renderRows(rows) {
    results.innerHTML = '';
    if (!rows.length) {
      setMessage('No results for &ldquo;' + escapeText(lastQuery) + '&rdquo;.');
      return;
    }
    rows.forEach(function (row) {
      renderHubRow(results, row, navigate);
    });
    primeVisiblePosters(results);
  }

  function appendRow(row) {
    renderHubRow(results, row, navigate);
    primeVisiblePosters(results);
  }

  function runSearch(query) {
    var token = ++requestToken;
    if (!query) {
      setMessage('Type to search your Plex libraries.');
      return;
    }
    if (!server) {
      setMessage('No Plex server connected.');
      return;
    }
    showSearchSkeletons();
    var streamed = false;
    searchHubs(server, query, HUB_LIMIT, {
      library: activeLibrary,
      stagger: true,
      onRow: function (row) {
        if (token !== requestToken || destroyed) return;
        if (!streamed) {
          results.innerHTML = '';
          streamed = true;
        }
        appendRow(row);
      }
    })
      .then(function (rows) {
        if (token !== requestToken || destroyed) return;
        if (!rows.length) {
          setMessage('No results for &ldquo;' + escapeText(lastQuery) + '&rdquo;.');
          return;
        }
        if (!streamed) renderRows(rows);
        else primeVisiblePosters(results);
      })
      .catch(function (err) {
        if (token !== requestToken || destroyed) return;
        setMessage('Search failed: ' + escapeText(err && err.message ? err.message : 'unknown error'));
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
