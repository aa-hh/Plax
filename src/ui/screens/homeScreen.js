import { getState } from '../../core/store.js';
import { loadHomeFeedPhased } from '../../plex/recommendations/homeFeed.js';
import { renderHubRow } from '../components/hubRow.js';
import { focusFirst, attachFocusNav } from '../focus.js';
import {
  hydrateFocusedNeighborhood,
  primeVisiblePosters
} from '../posterImages.js';

function homeScreen(root, params, navigate) {
  var state = getState();
  var screen = document.createElement('div');
  screen.className = 'screen screen-home';
  screen.innerHTML =
    '<div class="top-nav">' +
    '<button class="nav-item active" data-nav="home" tabindex="0">Home</button>' +
    '<button class="nav-item" data-nav="library" tabindex="0">Library</button>' +
    '<button class="nav-item" data-nav="search" tabindex="0">Search</button>' +
    '<button class="nav-item" data-nav="settings" tabindex="0">Settings</button>' +
    '</div>' +
    '<h1 class="screen-title screen-title-compact">Home</h1>' +
    '<div class="home-pivots" data-cols="4">' +
    '<button class="nav-item home-pivot active" data-pivot="all" tabindex="0">All</button>' +
    '<button class="nav-item home-pivot" data-pivot="tv" tabindex="0">TV</button>' +
    '<button class="nav-item home-pivot" data-pivot="films" tabindex="0">Films</button>' +
    '<button class="nav-item home-pivot home-pivot-search" data-pivot="search" tabindex="0">Search</button>' +
    '</div>' +
    '<div class="home-feed-host" id="home-feed-host">' +
    '<div id="home-feed" class="home-feed"><p class="status-msg">Loading…</p></div>' +
    '</div>';

  root.appendChild(screen);
  var detachFocus = attachFocusNav(screen);
  var posterFocusToken = 0;
  var posterFocusTimer = null;
  var destroyed = false;
  var renderToken = 0;
  var activePivot = 'all';
  var pivotScrollTop = { all: 0, tv: 0, films: 0 };
  var pivotVisibleCount = 0;

  screen.querySelector('[data-nav="library"]').addEventListener('click', function () { navigate('library', {}); });
  screen.querySelector('[data-nav="search"]').addEventListener('click', function () {
    navigate('search', { _from: 'home' });
  });
  screen.querySelector('[data-nav="settings"]').addEventListener('click', function () {
    navigate('settings', { _from: 'home' });
  });
  Array.prototype.slice.call(screen.querySelectorAll('.home-pivot')).forEach(function (btn) {
    btn.addEventListener('click', function () {
      var pivot = btn.getAttribute('data-pivot');
      if (pivot === 'search') {
        navigate('search', { _from: 'home' });
        return;
      }
      setActivePivot(pivot);
    });
  });

  function classifyRowKinds(row) {
    var kinds = { tv: 0, films: 0 };
    if (row.hubIdentifier) {
      var hub = String(row.hubIdentifier).toLowerCase();
      if (hub.indexOf('movie') >= 0) kinds.films = 1;
      if (hub.indexOf('television') >= 0 || hub.indexOf('show') >= 0 || hub.indexOf('ondeck') >= 0) {
        kinds.tv = 1;
      }
    }
    if (row.type) {
      var t = String(row.type).toLowerCase();
      if (t === 'movie') kinds.films = 1;
      if (t === 'show' || t === 'episode' || t === 'season') kinds.tv = 1;
    }
    (row.items || []).forEach(function (item) {
      if (!item || !item.type) return;
      if (item.type === 'movie') kinds.films = 1;
      else if (item.type === 'show' || item.type === 'episode' || item.type === 'season') kinds.tv = 1;
    });
    if (!kinds.tv && !kinds.films) {
      kinds.tv = 1;
      kinds.films = 1;
    }
    return kinds;
  }

  function applyPivotVisibility() {
    var feedEl = document.getElementById('home-feed');
    if (!feedEl) return;
    var rows = Array.prototype.slice.call(feedEl.querySelectorAll('.row-section'));
    var visibleCount = 0;
    rows.forEach(function (section) {
      var tags = (section.getAttribute('data-pivot-tags') || 'tv films').split(' ');
      var matches = activePivot === 'all' || tags.indexOf(activePivot) >= 0;
      section.hidden = !matches;
      if (matches) visibleCount += 1;
    });
    pivotVisibleCount = visibleCount;
    var empty = feedEl.querySelector('.home-pivot-empty');
    if (!empty) {
      empty = document.createElement('p');
      empty.className = 'status-msg home-pivot-empty';
      feedEl.appendChild(empty);
    }
    empty.hidden = visibleCount > 0;
    if (!empty.hidden) {
      empty.textContent = activePivot === 'tv'
        ? 'No TV rows right now.'
        : 'No film rows right now.';
    }
  }

  function setActivePivot(nextPivot) {
    if (nextPivot !== 'all' && nextPivot !== 'tv' && nextPivot !== 'films') return;
    var feedEl = document.getElementById('home-feed');
    if (!feedEl) return;
    pivotScrollTop[activePivot] = feedEl.scrollTop;
    activePivot = nextPivot;
    Array.prototype.slice.call(screen.querySelectorAll('.home-pivot')).forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-pivot') === nextPivot);
    });
    applyPivotVisibility();
    feedEl.scrollTop = pivotScrollTop[nextPivot] || 0;
    if (pivotVisibleCount === 0) {
      var fallback = screen.querySelector('.home-pivot.active');
      if (fallback) fallback.focus();
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

  var feedEl = document.getElementById('home-feed');
  if (feedEl) renderRowSkeletons(feedEl, 3);

  loadHomeFeedPhased(state.activeServer).then(function (feed) {
    var token = ++renderToken;
    var el = document.getElementById('home-feed');
    if (!el || destroyed) return;

    function renderRows(rows, append) {
      if (destroyed || token !== renderToken) return;
      if (!rows || !rows.length) return;
      if (!append) el.innerHTML = '';
      rows.forEach(function (row) {
        var section = renderHubRow(el, row, navigate, { cols: 12, visibleCount: 20 });
        if (!section) return;
        var kinds = classifyRowKinds(row);
        var tags = [];
        if (kinds.tv) tags.push('tv');
        if (kinds.films) tags.push('films');
        section.setAttribute('data-pivot-tags', tags.join(' '));
      });
      applyPivotVisibility();
      primeVisiblePosters(el);
    }

    renderRows(feed.initialRows, false);

    (feed.deferredRowsPromise || Promise.resolve([])).then(function (rows) {
      if (destroyed || token !== renderToken || !rows || !rows.length) return;
      renderRows(rows, true);
    }).catch(function () {});

    var hasInitial = feed.initialRows && feed.initialRows.length;
    (feed.deferredRowsPromise || Promise.resolve([])).then(function (rows) {
      if (destroyed || token !== renderToken) return;
      if (!hasInitial && (!rows || !rows.length)) {
        el.innerHTML = '<p class="status-msg">No recommendations yet. Browse Library.</p>';
      }
    }).catch(function () {});

    var nav = screen.querySelector('.top-nav .nav-item');
    if (nav) nav.focus();
    else focusFirst(screen);
  }).catch(function (err) {
    if (destroyed) return;
    var el = document.getElementById('home-feed');
    if (el) el.innerHTML = '<p class="status-msg">Could not load home: ' + err.message + '</p>';
  });

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
