import test from 'node:test';
import assert from 'node:assert/strict';

import { canUseWatchlists } from '../src/watchlists/access.js';
import {
  createWatchlist,
  addItemToWatchlist,
  removeItemFromWatchlist,
  findWatchlistsContainingItem,
  isItemInAnyWatchlist,
  listWatchlists,
  deleteWatchlist,
  profileKey
} from '../src/watchlists/store.js';
import {
  buildHubNavItems,
  buildSearchNavItems,
  buildSettingsNavItems,
  libraryHubId,
  resolveActiveHubId
} from '../src/ui/components/browsingHubNav.js';
import { bookmarkIconSvg, iconSvgForKind } from '../src/ui/icons/navIcons.js';
import { supportsWatchlistBookmark } from '../src/ui/components/watchlistBookmark.js';
import { watchlistToHubRow, classifyWatchlistRowKind } from '../src/watchlists/resolve.js';

test.beforeEach(function () {
  global.localStorage = {
    _data: {},
    getItem: function (k) { return this._data[k] || null; },
    setItem: function (k, v) { this._data[k] = v; },
    removeItem: function (k) { delete this._data[k]; }
  };
});

test('canUseWatchlists allows admin and managed profiles only', function () {
  assert.equal(canUseWatchlists({ admin: true, guest: false }), true);
  assert.equal(canUseWatchlists({ admin: false, restricted: true, guest: false }), true);
  assert.equal(canUseWatchlists({ admin: false, restricted: false, guest: false }), false);
  assert.equal(canUseWatchlists({ admin: true, guest: true }), false);
  assert.equal(canUseWatchlists(null), false);
});

test('watchlist store is scoped per profile', function () {
  var admin = { id: 'admin-1', admin: true };
  var kid = { id: 'kid-1', restricted: true, admin: false };

  var wl = createWatchlist(admin, 'Films to see');
  addItemToWatchlist(admin, wl.id, {
    ratingKey: '100',
    type: 'movie',
    title: 'Example'
  });

  assert.equal(listWatchlists(admin).length, 1);
  assert.equal(listWatchlists(kid).length, 0);
  assert.equal(isItemInAnyWatchlist(admin, '100'), true);
  assert.equal(isItemInAnyWatchlist(kid, '100'), false);
  assert.notEqual(profileKey(admin), profileKey(kid));
});

test('add and remove items update membership', function () {
  var user = { id: 'u-1', admin: true };
  var wl = createWatchlist(user, 'Queue');
  addItemToWatchlist(user, wl.id, { ratingKey: '42', type: 'episode', title: 'Pilot' });

  assert.equal(findWatchlistsContainingItem(user, '42').length, 1);
  removeItemFromWatchlist(user, wl.id, '42');
  assert.equal(isItemInAnyWatchlist(user, '42'), false);
});

test('resolveActiveHubId highlights library route target', function () {
  assert.equal(resolveActiveHubId({ library: { id: '2' } }), 'library:2');
  assert.equal(resolveActiveHubId({ hubId: 'watchlist' }), 'watchlist');
  assert.equal(resolveActiveHubId({ activeRoute: 'settings' }), 'settings');
  assert.equal(resolveActiveHubId({ activeRoute: 'search' }), 'search');
  assert.equal(libraryHubId({ id: '9' }), 'library:9');
});

test('search nav lives in separate sidebar section', function () {
  var search = buildSearchNavItems();
  assert.equal(search.length, 1);
  assert.equal(search[0].id, 'search');
  assert.equal(search[0].iconKind, 'search');
});

test('settings nav lives in separate sidebar section', function () {
  var media = buildHubNavItems({
    activeHomeUser: { id: '1', admin: true },
    libraries: [{ id: '1', title: 'Movies', type: 'movie', hidden: false }]
  });
  var system = buildSettingsNavItems();
  assert.ok(media.every(function (item) { return item.id !== 'settings'; }));
  assert.equal(system.length, 1);
  assert.equal(system[0].id, 'settings');
});

test('buildHubNavItems includes watchlist for eligible users', function () {
  var state = {
    activeHomeUser: { id: '1', admin: true },
    libraries: [
      { id: '1', title: 'Movies', type: 'movie', hidden: false },
      { id: '2', title: 'TV Shows', type: 'show', hidden: false }
    ]
  };
  var items = buildHubNavItems(state);
  var ids = items.map(function (item) { return item.id; });

  assert.deepEqual(ids.slice(0, 2), ['home', 'watchlist']);
  assert.ok(ids.indexOf('library:1') >= 0);
  assert.ok(ids.indexOf('library:2') >= 0);
});

test('buildHubNavItems omits watchlist for guest profiles', function () {
  var items = buildHubNavItems({
    activeHomeUser: { id: 'g', admin: false, restricted: false, guest: true },
    libraries: []
  });
  // Watchlist is omitted for guests, but Home and the Leaving Soon destination
  // (its own sidebar item, available to every profile) remain.
  assert.deepEqual(items.map(function (i) { return i.id; }), ['home', 'leavingSoon']);
});

test('bookmark icon markup is shared and filled variant differs', function () {
  var outline = bookmarkIconSvg(false);
  var filled = bookmarkIconSvg(true);
  assert.ok(outline.indexOf('hub-icon--bookmark') >= 0);
  assert.ok(filled.indexOf('hub-icon--bookmark-filled') >= 0);
  assert.equal(iconSvgForKind('watchlist', true), filled);
});

test('supportsWatchlistBookmark allows movie show season episode', function () {
  assert.equal(supportsWatchlistBookmark({ type: 'movie' }), true);
  assert.equal(supportsWatchlistBookmark({ type: 'show' }), true);
  assert.equal(supportsWatchlistBookmark({ type: 'season' }), true);
  assert.equal(supportsWatchlistBookmark({ type: 'episode' }), true);
  assert.equal(supportsWatchlistBookmark({ type: 'collection' }), false);
});

test('watchlistToHubRow uses on-deck compact presentation', function () {
  var row = watchlistToHubRow({ id: 'wl-1', name: 'Queue' }, [
    { ratingKey: '1', type: 'episode', title: 'Pilot' },
    { ratingKey: '2', type: 'movie', title: 'Film' }
  ]);
  assert.equal(row.displayVariant, 'compact');
  assert.equal(row.preferSeriesPoster, true);
  assert.equal(row.contentKind, 'mixed');
  assert.equal(classifyWatchlistRowKind([{ type: 'movie' }]), 'films');
});

test('deleteWatchlist removes list', function () {
  var user = { id: 'u-2', admin: true };
  var wl = createWatchlist(user, 'Temp');
  assert.equal(deleteWatchlist(user, wl.id), true);
  assert.equal(listWatchlists(user).length, 0);
});
