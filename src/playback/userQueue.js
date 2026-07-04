/**
 * userQueue — the persistent, user-curated "Up Next" queue.
 *
 * This is the manual companion to `playbackQueue.js` (which is an in-memory
 * episode-autoplay queue). Items here are added explicitly by the user via the
 * detail overflow menu ("Add to Up Next") and surface on a Home rail. The store
 * mirrors `src/watchlists/store.js`:
 *   - persists through `core/storage.js` (localStorage, `plax_` prefix) so it
 *     survives a cold reload,
 *   - is keyed PER USER (managed-profile aware) via the same `profileKey`,
 *   - stores a backend-agnostic SNAPSHOT of the item (no backend call) so a Plex
 *     or Jellyfin item renders a media card + plays straight from the snapshot.
 *
 * On every mutation it broadcasts a `xplay:userqueue-changed` CustomEvent on
 * `window` so the Home rail can re-render without polling. The detail (CustomEvent
 * `detail`) carries the profile key so a listener can ignore changes for a profile
 * it isn't showing.
 *
 * Chrome53/webOS4-safe: var, no optional chaining, no arrow-only APIs.
 */
import { get, set } from '../core/storage.js';
import { profileKey } from '../watchlists/store.js';

var STORAGE_VERSION = 1;
var CHANGED_EVENT = 'xplay:userqueue-changed';

function storageKey(user) {
  return 'userqueue_' + profileKey(user);
}

function loadItems(user) {
  var raw = get(storageKey(user));
  if (!raw || typeof raw !== 'object') return [];
  if (!Array.isArray(raw.items)) return [];
  return raw.items;
}

function saveItems(user, list) {
  set(storageKey(user), {
    version: STORAGE_VERSION,
    items: list || []
  });
}

function notify(user) {
  try {
    if (typeof window === 'undefined' || !window.dispatchEvent) return;
    var Ctor = window.CustomEvent;
    var evt;
    if (typeof Ctor === 'function') {
      evt = new Ctor(CHANGED_EVENT, { detail: { profile: profileKey(user) } });
    } else if (document && document.createEvent) {
      evt = document.createEvent('CustomEvent');
      evt.initCustomEvent(CHANGED_EVENT, false, false, { profile: profileKey(user) });
    } else {
      return;
    }
    window.dispatchEvent(evt);
  } catch (e) { /* notification is best-effort */ }
}

/**
 * Snapshot enough of an item to render a media card AND start playback later,
 * for either backend. Mirrors `watchlists/store.js#snapshotFromItem` and adds the
 * server id so the player can resolve the right backend without a re-fetch.
 */
function snapshotFromItem(item) {
  if (!item || item.ratingKey == null) return null;
  return {
    ratingKey: String(item.ratingKey),
    type: item.type || '',
    title: item.title || item.grandparentTitle || '',
    thumb: item.thumb || item.grandparentThumbUrl || item.art || '',
    art: item.art || '',
    grandparentTitle: item.grandparentTitle || '',
    grandparentThumbUrl: item.grandparentThumbUrl || '',
    grandparentRatingKey: item.grandparentRatingKey != null ? String(item.grandparentRatingKey) : '',
    parentTitle: item.parentTitle || '',
    parentRatingKey: item.parentRatingKey != null ? String(item.parentRatingKey) : '',
    parentIndex: item.parentIndex != null ? item.parentIndex : null,
    index: item.index != null ? item.index : null,
    year: item.year != null ? item.year : null,
    viewOffset: item.viewOffset != null ? item.viewOffset : null,
    duration: item.duration != null ? item.duration : null,
    contentRating: item.contentRating || '',
    leafCount: item.leafCount != null ? item.leafCount : null,
    librarySectionID: item.librarySectionID != null ? String(item.librarySectionID) : '',
    serverId: item.serverId != null ? String(item.serverId)
      : (item.server && item.server.id != null ? String(item.server.id) : ''),
    addedAt: Date.now()
  };
}

/** Ordered array of stored snapshots (oldest-added first → play order). */
function getQueueItems(user) {
  return loadItems(user).slice();
}

/** True if an item with this ratingKey is already queued. */
function isInQueue(user, ratingKey) {
  var key = String(ratingKey);
  return loadItems(user).some(function (i) { return String(i.ratingKey) === key; });
}

/**
 * Append an item to the queue. Dedupes by ratingKey (a re-add is a no-op move-to-
 * end refresh of the snapshot). Persists + notifies. Returns the updated list.
 */
function addToQueue(user, item) {
  var snap = snapshotFromItem(item);
  if (!snap) return getQueueItems(user);
  var list = loadItems(user).filter(function (i) {
    return String(i.ratingKey) !== snap.ratingKey;
  });
  list.push(snap);
  saveItems(user, list);
  notify(user);
  return list.slice();
}

/** Remove the item with this ratingKey. Persists + notifies. Returns updated list. */
function removeFromQueue(user, ratingKey) {
  var key = String(ratingKey);
  var list = loadItems(user).filter(function (i) {
    return String(i.ratingKey) !== key;
  });
  saveItems(user, list);
  notify(user);
  return list.slice();
}

/** Empty the queue. Persists + notifies. */
function clearQueue(user) {
  saveItems(user, []);
  notify(user);
}

export {
  getQueueItems,
  addToQueue,
  removeFromQueue,
  isInQueue,
  clearQueue,
  snapshotFromItem,
  CHANGED_EVENT
};
