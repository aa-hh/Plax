/**
 * avatarCache.js — localStorage-backed avatar cache for user picker screens.
 *
 * Uses localStorage (NOT IndexedDB — the persistentCache IDB is gated off on
 * webOS4 due to a known hang bug). Stores avatars as base64 dataURLs keyed by
 * userId. No TTL; eviction is explicit (evictAvatarsNotIn) or on quota error.
 *
 * All localStorage access is wrapped in try/catch: the API may be unavailable
 * in some webOS sandboxes, and quota errors must not interrupt rendering.
 */

// v2: resized to 120px JPEG before storage (v1 stored full-size, was slow to decode)
var AVATAR_KEY_PREFIX = 'plax_avatar2_';

/**
 * Returns the cached dataURL for userId, or null if not cached.
 * @param {string} userId
 * @returns {string|null}
 */
function getCachedAvatar(userId) {
  if (!userId) return null;
  try {
    return localStorage.getItem(AVATAR_KEY_PREFIX + userId) || null;
  } catch (e) {
    return null;
  }
}

/**
 * Stores a base64 dataURL for userId. Silently swallows quota errors.
 * @param {string} userId
 * @param {string} dataUrl
 */
function setCachedAvatar(userId, dataUrl) {
  if (!userId || !dataUrl) return;
  try {
    localStorage.setItem(AVATAR_KEY_PREFIX + userId, dataUrl);
  } catch (e) {
    // quota exceeded or localStorage unavailable — ignore
  }
}

/**
 * Removes any cached avatars whose userId is NOT in the provided array.
 * Call this after fetching the current user list to flush gone users.
 * @param {string[]} userIds
 */
function evictAvatarsNotIn(userIds) {
  var activeSet = Object.create(null);
  var i;
  for (i = 0; i < userIds.length; i++) {
    activeSet[userIds[i]] = true;
  }
  try {
    var keysToRemove = [];
    var j;
    for (j = 0; j < localStorage.length; j++) {
      var key = localStorage.key(j);
      if (key && key.indexOf(AVATAR_KEY_PREFIX) === 0) {
        var userId = key.slice(AVATAR_KEY_PREFIX.length);
        if (!activeSet[userId]) {
          keysToRemove.push(key);
        }
      }
    }
    for (j = 0; j < keysToRemove.length; j++) {
      try { localStorage.removeItem(keysToRemove[j]); } catch (e) { /* ignore */ }
    }
  } catch (e) {
    // localStorage unavailable — ignore
  }
}

/**
 * Fetches an image URL as a blob, converts to base64 dataURL, and caches it.
 * Fire-and-forget: does not block rendering; errors are swallowed.
 * @param {string} userId
 * @param {string} url
 */
// Size avatars are resized to before storing. Keeps dataURLs small (~8–15 KB)
// so localStorage reads and browser decode are fast on warm cache.
var CACHE_SIZE = 120;

function fetchAndCacheAvatar(userId, url) {
  if (!userId || !url) return;
  if (getCachedAvatar(userId)) return;
  fetch(url).then(function (response) {
    if (!response.ok) return null;
    return response.blob();
  }).then(function (blob) {
    if (!blob) return;
    // Draw into a small canvas before storing so the cached dataURL is
    // ~10x smaller than the raw server image (120px JPEG vs 300px source).
    var objectUrl = URL.createObjectURL(blob);
    var img = new Image();
    img.onload = function () {
      try {
        var canvas = document.createElement('canvas');
        canvas.width = CACHE_SIZE;
        canvas.height = CACHE_SIZE;
        canvas.getContext('2d').drawImage(img, 0, 0, CACHE_SIZE, CACHE_SIZE);
        setCachedAvatar(userId, canvas.toDataURL('image/jpeg', 0.85));
      } catch (e) { /* ignore: canvas tainted or unavailable */ }
      URL.revokeObjectURL(objectUrl);
    };
    img.onerror = function () { URL.revokeObjectURL(objectUrl); };
    img.src = objectUrl;
  }).catch(function () {});
}

export { getCachedAvatar, setCachedAvatar, evictAvatarsNotIn, fetchAndCacheAvatar };
