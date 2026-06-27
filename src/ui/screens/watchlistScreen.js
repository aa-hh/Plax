import { getState } from '../../core/store.js';
import { canUseWatchlists } from '../../watchlists/access.js';
import {
  getWatchlist,
  listWatchlists,
  renameWatchlist,
  deleteWatchlist
} from '../../watchlists/store.js';
import { resolveWatchlistItems, watchlistToHubRow } from '../../watchlists/resolve.js';
import { renderHubRow } from '../components/hubRow.js';
import { mountBrowsingHubNav } from '../components/browsingHubNav.js';
import { focusFirst, attachFocusNav } from '../focus.js';
import { openActionDialog, openTextInputModal } from '../components/controls.js';
import { primeVisiblePosters } from '../posterImages.js';

function watchlistScreen(root, params, navigate) {
  var state = getState();
  var user = state.activeHomeUser || state.user;
  var screen = document.createElement('div');
  screen.className = 'screen watchlist-screen screen-home';

  if (!canUseWatchlists(user)) {
    screen.innerHTML = '<p class="status-msg">Watchlists are not available for this profile.</p>';
    root.appendChild(screen);
    return { destroy: function () {} };
  }

  var watchlistId = params.watchlistId;
  var wl = watchlistId ? getWatchlist(user, watchlistId) : null;

  screen.innerHTML =
    '<div class="home-layout">' +
    '<nav class="browsing-hub-nav-host" id="browsing-hub-nav-host"></nav>' +
    '<div class="home-main">' +
    '<h1 class="screen-title screen-title-compact" id="watchlist-title">Watchlist</h1>' +
    '<div class="watchlist-manage-actions" id="watchlist-actions" data-focus-zone="watchlist-manage" data-cols="2"></div>' +
    '<div class="home-feed-host watchlist-feed-host">' +
    '<div id="watchlist-feed" class="home-feed"><p class="status-msg">Loading…</p></div>' +
    '</div></div></div>';

  root.appendChild(screen);
  var detachFocus = attachFocusNav(screen);
  var destroyed = false;

  var hubNav = mountBrowsingHubNav(screen.querySelector('#browsing-hub-nav-host'), {
    navigate: navigate,
    activeHubId: 'watchlist',
    fromRoute: 'watchlist'
  });
  if (!wl) {
    var lists = listWatchlists(user);
    if (lists.length === 1) {
      wl = lists[0];
      watchlistId = wl.id;
    } else {
      document.getElementById('watchlist-feed').innerHTML =
        '<p class="status-msg">Choose a watchlist from Home or Settings.</p>';
      focusFirst(screen);
      return { destroy: function () { detachFocus(); } };
    }
  }

  document.getElementById('watchlist-title').textContent = wl.name;
  var actions = document.getElementById('watchlist-actions');
  actions.innerHTML =
    '<button class="btn" id="btn-rename-watchlist" tabindex="0">Rename</button>' +
    '<button class="btn" id="btn-delete-watchlist" tabindex="0">Delete list</button>';

  document.getElementById('btn-rename-watchlist').addEventListener('click', function () {
    openTextInputModal({
      title: 'Rename watchlist',
      defaultValue: wl.name,
      onConfirm: function (next) {
        if (!next || next === wl.name) return;
        renameWatchlist(user, wl.id, next);
        document.getElementById('watchlist-title').textContent = next;
        wl.name = next;
      }
    });
  });

  document.getElementById('btn-delete-watchlist').addEventListener('click', function () {
    openActionDialog({
      title: 'Delete "' + wl.name + '"?',
      message: 'This removes the list and its contents.',
      actions: [
        {
          id: 'delete',
          label: 'Delete',
          primary: true,
          onSelect: function () {
            deleteWatchlist(user, wl.id);
            navigate('home', { hub: 'watchlist' });
          }
        },
        { id: 'cancel', label: 'Keep' }
      ]
    });
  });

  var feed = document.getElementById('watchlist-feed');
  resolveWatchlistItems(state.activeServer, wl.items || []).then(function (items) {
    if (destroyed) return;
    feed.innerHTML = '';
    if (!items.length) {
      feed.innerHTML =
        '<p class="status-msg">No titles yet. Use the bookmark on a movie, season, or episode.</p>';
      focusFirst(screen);
      return;
    }
    var row = watchlistToHubRow(wl, items);
    row.title = '';
    // visibleCount must stay a fixed WINDOW, not items.length: createVirtualRow
    // only windows when items.length > maxDom, so `Math.max(items.length, 20)`
    // forced EVERY card (and its poster) into the DOM, defeating virtualization —
    // a 100-item watchlist mounted 100 cards on the B8. 20 matches the home rails;
    // the lead/trail spacers preserve scroll extent so the row looks identical.
    renderHubRow(feed, row, navigate, { cols: 12, visibleCount: 20 });
    primeVisiblePosters(feed);
    if (!hubNav.focusSidebar()) {
      var rowScroll = feed.querySelector('.row-scroll');
      if (rowScroll) focusFirst(rowScroll);
      else focusFirst(screen);
    }
  });

  return {
    destroy: function () {
      destroyed = true;
      detachFocus();
    }
  };
}

export { watchlistScreen };
