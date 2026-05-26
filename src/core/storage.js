var PREFIX = 'xplay_lite_';
var SESSION_OWNER_KEY = PREFIX + 'session_ownerAuthToken';

function get(key) {
  try {
    var raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function set(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.warn('storage set failed', key);
  }
}

function remove(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch (e) { /* ignore */ }
}

function readSessionOwnerToken() {
  try {
    return sessionStorage.getItem(SESSION_OWNER_KEY) || null;
  } catch (e) {
    return null;
  }
}

function writeSessionOwnerToken(token) {
  try {
    if (token) sessionStorage.setItem(SESSION_OWNER_KEY, token);
    else sessionStorage.removeItem(SESSION_OWNER_KEY);
  } catch (e) { /* ignore */ }
}

function clearSessionOwnerToken() {
  writeSessionOwnerToken(null);
}

/** Owner token for Plex Home admin APIs (not persisted for restricted child sessions). */
function getOwnerAuthToken() {
  return readSessionOwnerToken() || get('ownerAuthToken');
}

/**
 * When a restricted profile is active, keep the owner token in sessionStorage only
 * so a child session cannot read it from localStorage after app restart.
 */
function persistOwnerTokenForProfile(ownerToken, activeHomeUser, activeAuthToken) {
  if (!ownerToken) return;
  var restrictedChild = activeHomeUser && activeHomeUser.restricted &&
    activeAuthToken && activeAuthToken !== ownerToken;
  if (restrictedChild) {
    writeSessionOwnerToken(ownerToken);
    remove('ownerAuthToken');
    return;
  }
  clearSessionOwnerToken();
  set('ownerAuthToken', ownerToken);
}

function loadPersistedAuth() {
  return {
    authToken: get('authToken'),
    ownerAuthToken: getOwnerAuthToken(),
    clientId: get('clientId'),
    user: get('user'),
    activeHomeUser: get('activeHomeUser'),
    networkPrefs: get('networkPrefs'),
    playbackPrefs: get('playbackPrefs')
  };
}

function persistAuth(data) {
  if (data.authToken != null) set('authToken', data.authToken);
  if (data.ownerAuthToken != null) {
    persistOwnerTokenForProfile(
      data.ownerAuthToken,
      data.activeHomeUser != null ? data.activeHomeUser : get('activeHomeUser'),
      data.authToken != null ? data.authToken : get('authToken')
    );
  } else if (data.activeHomeUser != null || data.authToken != null) {
    var owner = getOwnerAuthToken() || get('ownerAuthToken');
    if (owner) {
      persistOwnerTokenForProfile(
        owner,
        data.activeHomeUser != null ? data.activeHomeUser : get('activeHomeUser'),
        data.authToken != null ? data.authToken : get('authToken')
      );
    }
  }
  if (data.clientId != null) set('clientId', data.clientId);
  if (data.user != null) set('user', data.user);
  if (data.activeHomeUser != null) set('activeHomeUser', data.activeHomeUser);
  if (data.networkPrefs != null) set('networkPrefs', data.networkPrefs);
  if (data.playbackPrefs != null) set('playbackPrefs', data.playbackPrefs);
}

function clearAuth() {
  remove('authToken');
  remove('ownerAuthToken');
  clearSessionOwnerToken();
  remove('user');
  remove('activeHomeUser');
}

export {
  get,
  set,
  remove,
  loadPersistedAuth,
  persistAuth,
  clearAuth,
  getOwnerAuthToken,
  persistOwnerTokenForProfile
};
