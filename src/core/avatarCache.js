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

var AVATAR_KEY_PREFIX = 'plax_avatar_';

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
function fetchAndCacheAvatar(userId, url) {
  if (!userId || !url) return;
  // Skip if already cached
  if (getCachedAvatar(userId)) return;
  fetch(url).then(function (response) {
    if (!response.ok) return null;
    return response.blob();
  }).then(function (blob) {
    if (!blob) return;
    var reader = new FileReader();
    reader.onload = function () {
      setCachedAvatar(userId, reader.result);
    };
    reader.readAsDataURL(blob);
  }).catch(function () {
    // network or FileReader error — ignore
  });
}

export { getCachedAvatar, setCachedAvatar, evictAvatarsNotIn, fetchAndCacheAvatar };
