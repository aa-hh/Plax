import { getState } from '../../core/store.js';
import { canUseWatchlists } from '../../watchlists/access.js';
import {
  listWatchlists,
  ensureDefaultWatchlist,
  addItemToWatchlist,
  removeItemFromWatchlist,
  findWatchlistsContainingItem,
  createWatchlist
} from '../../watchlists/store.js';
import { bookmarkIconSvg } from '../icons/navIcons.js';

function watchlistBookmarkButtonHtml(filled) {
  return '<button type="button" class="detail-watchlist-btn" id="detail-watchlist-btn" ' +
    'tabindex="0" aria-label="' + (filled ? 'On watchlist' : 'Add to watchlist') + '" ' +
    'aria-pressed="' + (filled ? 'true' : 'false') + '">' +
    bookmarkIconSvg(!!filled) +
    '</button>';
}

function supportsWatchlistBookmark(item) {
  if (!item) return false;
  return item.type === 'movie' || item.type === 'show' ||
    item.type === 'season' || item.type === 'episode';
}

function updateBookmarkButton(btn, filled) {
  if (!btn) return;
  btn.setAttribute('aria-label', filled ? 'On watchlist' : 'Add to watchlist');
  btn.setAttribute('aria-pressed', filled ? 'true' : 'false');
  btn.classList.toggle('detail-watchlist-btn--active', !!filled);
  btn.innerHTML = bookmarkIconSvg(!!filled);
}

function wireWatchlistBookmark(screen, item, opts) {
  opts = opts || {};
  var user = getState().activeHomeUser || getState().user;
  if (!canUseWatchlists(user) || !supportsWatchlistBookmark(item)) return null;

  var btn = screen.querySelector('#detail-watchlist-btn');
  if (!btn) return null;

  function refresh() {
    updateBookmarkButton(btn, findWatchlistsContainingItem(user, item.ratingKey).length > 0);
  }

  refresh();

  btn.addEventListener('click', function () {
    openWatchlistPicker(screen, item, user, {
      onChange: function () {
        refresh();
        if (opts.onChange) opts.onChange();
      }
    });
  });

  return { refresh: refresh };
}

function openWatchlistPicker(screen, item, user, opts) {
  opts = opts || {};
  var lists = listWatchlists(user);
  if (!lists.length) ensureDefaultWatchlist(user);
  lists = listWatchlists(user);

  var containing = {};
  findWatchlistsContainingItem(user, item.ratingKey).forEach(function (wl) {
    containing[wl.id] = 1;
  });

  var overlay = document.createElement('div');
  overlay.className = 'detail-modal';
  overlay.id = 'watchlist-picker-modal';
  overlay.innerHTML =
    '<div class="detail-modal-sheet" role="dialog" aria-modal="true">' +
    '<p class="detail-modal-title">Watchlist</p>' +
    '<div class="detail-modal-list" id="watchlist-picker-list"></div>' +
    '<div class="detail-modal-footer">' +
    '<button type="button" class="btn" id="watchlist-picker-new" tabindex="0">New list</button>' +
    '<button type="button" class="btn btn-outline btn--sm detail-modal-cancel" id="watchlist-picker-close" tabindex="0">Done</button>' +
    '</div></div>';

  screen.appendChild(overlay);
  overlay.hidden = false;

  var listEl = overlay.querySelector('#watchlist-picker-list');

  function renderList() {
    lists = listWatchlists(user);
    listEl.innerHTML = '';
    lists.forEach(function (wl) {
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'detail-modal-option';
      row.tabIndex = 0;
      var onList = !!containing[wl.id];
      row.textContent = wl.name + (onList ? ' ✓' : '');
      if (onList) row.classList.add('detail-modal-option--active');
      row.addEventListener('click', function () {
        if (containing[wl.id]) {
          removeItemFromWatchlist(user, wl.id, item.ratingKey);
          delete containing[wl.id];
        } else {
          addItemToWatchlist(user, wl.id, item);
          containing[wl.id] = 1;
        }
        renderList();
        if (opts.onChange) opts.onChange();
      });
      listEl.appendChild(row);
    });
    if (!lists.length) {
      listEl.innerHTML = '<p class="status-msg">No watchlists yet.</p>';
    }
  }

  renderList();

  overlay.querySelector('#watchlist-picker-close').addEventListener('click', close);
  overlay.querySelector('#watchlist-picker-new').addEventListener('click', function () {
    var name = 'Watchlist ' + (lists.length + 1);
    var wl = createWatchlist(user, name);
    addItemToWatchlist(user, wl.id, item);
    containing[wl.id] = 1;
    renderList();
    if (opts.onChange) opts.onChange();
  });

  function close() {
    overlay.remove();
  }

  var first = listEl.querySelector('.detail-modal-option');
  if (first) first.focus();
  else overlay.querySelector('#watchlist-picker-close').focus();

  return { close: close };
}

export {
  watchlistBookmarkButtonHtml,
  supportsWatchlistBookmark,
  wireWatchlistBookmark,
  updateBookmarkButton
};
