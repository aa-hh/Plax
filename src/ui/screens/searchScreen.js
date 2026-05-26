import { getState } from '../../core/store.js';
import { searchHubs } from '../../plex/search.js';
import { renderHubRow } from '../components/hubRow.js';
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
    '<div class="top-nav">' +
    '<button class="nav-item" data-nav="home" tabindex="0">Home</button>' +
    '<button class="nav-item" data-nav="library" tabindex="0">Library</button>' +
    '<button class="nav-item active" data-nav="search" tabindex="0">Search</button>' +
    '<button class="nav-item" data-nav="settings" tabindex="0">Settings</button>' +
    '</div>' +
    '<h1 class="screen-title screen-title-compact">Search</h1>' +
    '<div class="search-input-row">' +
    '<input id="search-input" class="search-input" type="search" tabindex="0" ' +
    'placeholder="Search movies, shows, episodes" ' +
    'autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />' +
    '</div>' +
    '<div id="search-results" class="search-results">' +
    '<p class="status-msg">Type to search your Plex libraries.</p>' +
    '</div>';

  root.appendChild(screen);
  var detachFocus = attachFocusNav(screen);

  screen.querySelector('[data-nav="home"]').addEventListener('click', function () {
    navigate('home', {});
  });
  screen.querySelector('[data-nav="library"]').addEventListener('click', function () {
    navigate('library', {});
  });
  screen.querySelector('[data-nav="settings"]').addEventListener('click', function () {
    navigate('settings', { _from: 'search' });
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

  // Per-input key handling so arrow keys behave sensibly around the
  // virtual keyboard and the screen-level d-pad navigation does not
  // jump focus while the user is editing the query.
  input.addEventListener('keydown', function (e) {
    var code = e.keyCode;
    if (code === 13) {
      e.preventDefault();
      e.stopPropagation();
      if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
      lastQuery = input.value.trim();
      runSearch(lastQuery);
      return;
    }
    if (code === 40) {
      e.preventDefault();
      e.stopPropagation();
      var firstCard = results.querySelector('.card, .row-item, [tabindex]');
      if (firstCard) firstCard.focus();
      return;
    }
    if (code === 38) {
      e.preventDefault();
      e.stopPropagation();
      var firstNav = screen.querySelector('.nav-item');
      if (firstNav) firstNav.focus();
      return;
    }
    if (code === 37 || code === 39) {
      // Let the input handle horizontal text cursor; do not move focus.
      e.stopPropagation();
    }
  });

  if (params && params.query) {
    input.value = params.query;
    lastQuery = String(params.query).trim();
    runSearch(lastQuery);
  }

  // Focus input on entry — on webOS TV this also triggers the
  // platform-provided virtual keyboard.
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
