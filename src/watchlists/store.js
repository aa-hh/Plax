import { get, set } from '../core/storage.js';

var STORAGE_VERSION = 1;

function profileKey(user) {
  if (!user) return 'default';
  return String(user.id != null ? user.id : user.uuid || 'default');
}

function storageKey(user) {
  return 'watchlists_' + profileKey(user);
}

function emptyStore() {
  return { version: STORAGE_VERSION, watchlists: [] };
}

function loadStore(user) {
  var raw = get(storageKey(user));
  if (!raw || typeof raw !== 'object') return emptyStore();
  if (!Array.isArray(raw.watchlists)) return emptyStore();
  return {
    version: STORAGE_VERSION,
    watchlists: raw.watchlists
  };
}

function saveStore(user, store) {
  set(storageKey(user), {
    version: STORAGE_VERSION,
    watchlists: store.watchlists || []
  });
}

function newId() {
  return 'wl-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function listWatchlists(user) {
  return loadStore(user).watchlists.slice();
}

function getWatchlist(user, watchlistId) {
  return listWatchlists(user).filter(function (wl) {
    return wl && wl.id === watchlistId;
  })[0] || null;
}

function createWatchlist(user, name) {
  var store = loadStore(user);
  var now = Date.now();
  var wl = {
    id: newId(),
    name: String(name || 'Watchlist').trim() || 'Watchlist',
    createdAt: now,
    updatedAt: now,
    items: []
  };
  store.watchlists.push(wl);
  saveStore(user, store);
  return wl;
}

function renameWatchlist(user, watchlistId, name) {
  var store = loadStore(user);
  var wl = store.watchlists.filter(function (w) { return w.id === watchlistId; })[0];
  if (!wl) return null;
  wl.name = String(name || wl.name).trim() || wl.name;
  wl.updatedAt = Date.now();
  saveStore(user, store);
  return wl;
}

function deleteWatchlist(user, watchlistId) {
  var store = loadStore(user);
  var before = store.watchlists.length;
  store.watchlists = store.watchlists.filter(function (w) { return w.id !== watchlistId; });
  if (store.watchlists.length === before) return false;
  saveStore(user, store);
  return true;
}

function snapshotFromItem(item) {
  if (!item || item.ratingKey == null) return null;
  return {
    ratingKey: String(item.ratingKey),
    type: item.type || '',
    title: item.title || item.grandparentTitle || '',
    thumb: item.thumb || item.grandparentThumbUrl || item.art || '',
    grandparentTitle: item.grandparentTitle || '',
    grandparentThumbUrl: item.grandparentThumbUrl || '',
    parentTitle: item.parentTitle || '',
    parentIndex: item.parentIndex != null ? item.parentIndex : null,
    index: item.index != null ? item.index : null,
    year: item.year != null ? item.year : null,
    viewOffset: item.viewOffset != null ? item.viewOffset : null,
    duration: item.duration != null ? item.duration : null,
    contentRating: item.contentRating || '',
    leafCount: item.leafCount != null ? item.leafCount : null,
    librarySectionID: item.librarySectionID != null ? String(item.librarySectionID) : '',
    addedAt: Date.now()
  };
}

function addItemToWatchlist(user, watchlistId, item) {
  var snap = snapshotFromItem(item);
  if (!snap) return null;
  var store = loadStore(user);
  var wl = store.watchlists.filter(function (w) { return w.id === watchlistId; })[0];
  if (!wl) return null;
  wl.items = (wl.items || []).filter(function (i) {
    return String(i.ratingKey) !== snap.ratingKey;
  });
  wl.items.unshift(snap);
  wl.updatedAt = Date.now();
  saveStore(user, store);
  return wl;
}

function removeItemFromWatchlist(user, watchlistId, ratingKey) {
  var store = loadStore(user);
  var wl = store.watchlists.filter(function (w) { return w.id === watchlistId; })[0];
  if (!wl) return false;
  var key = String(ratingKey);
  var before = (wl.items || []).length;
  wl.items = (wl.items || []).filter(function (i) { return String(i.ratingKey) !== key; });
  if (wl.items.length === before) return false;
  wl.updatedAt = Date.now();
  saveStore(user, store);
  return true;
}

function findWatchlistsContainingItem(user, ratingKey) {
  var key = String(ratingKey);
  return listWatchlists(user).filter(function (wl) {
    return (wl.items || []).some(function (i) { return String(i.ratingKey) === key; });
  });
}

function isItemInAnyWatchlist(user, ratingKey) {
  return findWatchlistsContainingItem(user, ratingKey).length > 0;
}

function ensureDefaultWatchlist(user) {
  var lists = listWatchlists(user);
  if (lists.length) return lists[0];
  return createWatchlist(user, 'Watchlist');
}

export {
  profileKey,
  listWatchlists,
  getWatchlist,
  createWatchlist,
  renameWatchlist,
  deleteWatchlist,
  addItemToWatchlist,
  removeItemFromWatchlist,
  findWatchlistsContainingItem,
  isItemInAnyWatchlist,
  ensureDefaultWatchlist,
  snapshotFromItem
};
