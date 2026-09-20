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
import { focusFirst, attachFocusNav, invalidateFocusableCache } from '../focus.js';
import { openActionDialog, openTextInputModal } from '../components/controls.js';
import { primeVisiblePosters } from '../posterImages.js';
import {
  describeLoadError,
  renderStatus,
  renderRowSkeletons,
  truncateLabel
} from './screenStates.js';

/** Longest list name shown inside the delete-confirmation title. */
var DIALOG_NAME_MAX = 40;

function watchlistScreen(root, params, navigate) {
  var state = getState();
  var user = state.activeHomeUser || state.user;
  var screen = document.createElement('div');
  screen.className = 'screen watchlist-screen screen-home';

  screen.innerHTML =
    '<div class="home-layout">' +
    '<nav class="browsing-hub-nav-host" id="browsing-hub-nav-host" data-focus-zone="sidebar" data-focus-zone-enter=".browsing-hub-item"></nav>' +
    '<div class="home-main">' +
    '<h1 class="screen-title screen-title-compact watchlist-title" id="watchlist-title">Watchlist</h1>' +
    '<div class="watchlist-manage-actions" id="watchlist-actions" data-focus-zone="watchlist-manage" data-cols="2"></div>' +
    '<div class="home-feed-host watchlist-feed-host">' +
    '<div id="watchlist-feed" class="home-feed" aria-live="polite"></div>' +
    '</div></div></div>';

  root.appendChild(screen);
  var detachFocus = attachFocusNav(screen);
  var destroyed = false;
  var loadToken = 0;

  var hubNav = mountBrowsingHubNav(screen.querySelector('#browsing-hub-nav-host'), {
    navigate: navigate,
    activeHubId: 'watchlist',
    fromRoute: 'watchlist'
  });

  var title = screen.querySelector('#watchlist-title');
  var actions = screen.querySelector('#watchlist-actions');
  var feed = screen.querySelector('#watchlist-feed');

  // Every terminal state keeps the sidebar mounted so the D-pad always has
  // somewhere to go; focus lands on the sidebar (never <body>).
  function showMessage(text, opts) {
    renderStatus(feed, text, opts);
    invalidateFocusableCache();
    if (!hubNav.focusSidebar()) focusFirst(screen);
  }

  function finish() {
    return {
      destroy: function () {
        destroyed = true;
        loadToken += 1;
        detachFocus();
      }
    };
  }

  if (!canUseWatchlists(user)) {
    showMessage('Watchlists are not available for this profile. Switch to an admin or managed profile to use them.');
    return finish();
  }

  var watchlistId = params.watchlistId;
  var wl = watchlistId ? getWatchlist(user, watchlistId) : null;

  if (!wl) {
    var lists = listWatchlists(user);
    if (lists.length === 1) {
      wl = lists[0];
      watchlistId = wl.id;
    } else if (!lists.length) {
      showMessage('No watchlists yet. Bookmark a movie or episode from its detail screen to start one.');
      return finish();
    } else {
      showMessage('Choose a watchlist from Home or Settings.');
      return finish();
    }
  }

  title.textContent = wl.name;
  actions.innerHTML =
    '<button class="btn" id="btn-rename-watchlist" tabindex="0">Rename</button>' +
    '<button class="btn" id="btn-delete-watchlist" tabindex="0">Delete list</button>';

  screen.querySelector('#btn-rename-watchlist').addEventListener('click', function () {
    openTextInputModal({
      title: 'Rename watchlist',
      defaultValue: wl.name,
      onConfirm: function (next) {
        next = next == null ? '' : String(next).trim();
        if (!next || next === wl.name) return;
        var saved = renameWatchlist(user, wl.id, next);
        if (!saved) return;
        wl.name = saved.name;
        title.textContent = saved.name;
      }
    });
  });

  screen.querySelector('#btn-delete-watchlist').addEventListener('click', function () {
    openActionDialog({
      title: 'Delete “' + truncateLabel(wl.name, DIALOG_NAME_MAX) + '”?',
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

  function loadItems() {
    var token = ++loadToken;
    var snapshots = wl.items || [];
    if (!snapshots.length) {
      showMessage('No titles yet. Use the bookmark on a movie, season, or episode.');
      return;
    }
    if (!state.activeServer) {
      showMessage('Not connected to a server, so this list cannot load. Connect from Settings and come back.', { error: true });
      return;
    }
    // A retry from the error state is about to wipe its own button.
    var active = document.activeElement;
    if (active && feed.contains(active) && !hubNav.focusSidebar()) focusFirst(screen);
    renderRowSkeletons(feed, 1);
    invalidateFocusableCache();

    Promise.resolve().then(function () {
      return resolveWatchlistItems(state.activeServer, snapshots);
    }).then(function (items) {
      if (destroyed || token !== loadToken) return;
      feed.innerHTML = '';
      if (!items.length) {
        showMessage('No titles yet. Use the bookmark on a movie, season, or episode.');
        return;
      }
      var row = watchlistToHubRow(wl, items);
      row.title = '';
      // visibleCount must stay a fixed WINDOW, not items.length: createVirtualRow
      // only windows when items.length > maxDom, so `Math.max(items.length, 20)`
      // forced EVERY card (and its poster) into the DOM, defeating virtualization —
      // a 100-item watchlist mounted 100 cards on the B8. 20 matches the home rails;
      // the lead/trail spacers preserve scroll extent so the row looks identical.
      var section = renderHubRow(feed, row, navigate, { cols: 12, visibleCount: 20 });
      if (section && section.classList) section.classList.add('row-section--enter');
      invalidateFocusableCache();
      primeVisiblePosters(feed);
      if (!hubNav.focusSidebar()) {
        var rowScroll = feed.querySelector('.row-scroll');
        if (rowScroll) focusFirst(rowScroll);
        else focusFirst(screen);
      }
    }).catch(function (err) {
      if (destroyed || token !== loadToken) return;
      showMessage(describeLoadError(err, 'this list'), { error: true, retry: loadItems });
    });
  }

  loadItems();

  return finish();
}

export { watchlistScreen };
