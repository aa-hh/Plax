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
import { openSidePanel } from './controls.js';

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
  if (!listWatchlists(user).length) ensureDefaultWatchlist(user);

  // Which lists currently contain this title — the checked set.
  var containing = {};
  findWatchlistsContainingItem(user, item.ratingKey).forEach(function (wl) {
    containing[wl.id] = 1;
  });

  // Multi-select kit side panel (Modal drawer Direction=Right). Each row toggles
  // add/remove via a checkbox control and stays open; footer = New list + Done.
  // "New list" must re-render the row set, so it closes + reopens the panel.
  var teardown = null;

  function open() {
    var lists = listWatchlists(user);
    teardown = openSidePanel({
      title: 'Watchlist',
      multiSelect: true,
      options: lists.map(function (wl) {
        return { id: wl.id, label: wl.name, checked: !!containing[wl.id] };
      }),
      onToggle: function (id, o, nowChecked) {
        if (nowChecked) {
          addItemToWatchlist(user, id, item);
          containing[id] = 1;
        } else {
          removeItemFromWatchlist(user, id, item.ratingKey);
          delete containing[id];
        }
        if (opts.onChange) opts.onChange();
      },
      footerActions: [
        {
          id: 'new',
          label: 'New list',
          keepOpen: true,
          onSelect: function () {
            var name = 'Watchlist ' + (listWatchlists(user).length + 1);
            var wl = createWatchlist(user, name);
            addItemToWatchlist(user, wl.id, item);
            containing[wl.id] = 1;
            if (opts.onChange) opts.onChange();
            if (teardown) teardown();
            open(); // rebuild rows to include the new list (now checked)
          }
        },
        { id: 'done', label: 'Done', className: 'btn-outline btn--sm' }
      ],
      onCancel: function () {}
    });
  }

  open();

  return { close: function () { if (teardown) teardown(); } };
}

export {
  watchlistBookmarkButtonHtml,
  supportsWatchlistBookmark,
  wireWatchlistBookmark,
  updateBookmarkButton
};
