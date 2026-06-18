var PREFIX = 'plax_';
var SESSION_OWNER_KEY = PREFIX + 'session_ownerAuthToken';
var SESSION_HOME_SIZE_KEY = PREFIX + 'session_homeSize';
var OLD_PREFIX = 'xplay_lite_';
var MIGRATION_MARKER_KEY = PREFIX + '_migrated_from_xplay_lite';

function migrateFromOldAppId() {
  try {
    if (localStorage.getItem(MIGRATION_MARKER_KEY) === '1') return;
    var keysToMigrate = ['authToken', 'ownerAuthToken', 'clientId', 'user', 'activeHomeUser', 'networkPrefs', 'playbackPrefs'];
    var migrated = false;
    keysToMigrate.forEach(function (key) {
      var oldKey = OLD_PREFIX + key;
      var newKey = PREFIX + key;
      if (!localStorage.getItem(newKey) && localStorage.getItem(oldKey)) {
        var val = localStorage.getItem(oldKey);
        if (val) {
          localStorage.setItem(newKey, val);
          migrated = true;
        }
      }
    });
    localStorage.setItem(MIGRATION_MARKER_KEY, '1');
    if (migrated) console.log('Plax: migrated auth data from previous installation');
  } catch (e) {
    console.warn('Plax: migration from old app ID failed', e);
  }
}

migrateFromOldAppId();

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

function readSessionHomeSize() {
  try {
    var raw = sessionStorage.getItem(SESSION_HOME_SIZE_KEY);
    if (raw == null || raw === '') return null;
    var n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 ? n : null;
  } catch (e) {
    return null;
  }
}

function writeSessionHomeSize(homeSize) {
  try {
    if (homeSize != null && homeSize >= 1) {
      sessionStorage.setItem(SESSION_HOME_SIZE_KEY, String(homeSize));
    }
  } catch (e) { /* ignore */ }
}

/** Owner token for Plex Home admin APIs and restricted-profile server discovery. */
function getOwnerAuthToken() {
  return readSessionOwnerToken() || get('ownerAuthToken');
}

/**
 * Persist owner token for Plex Home admin APIs and server discovery assist.
 * Survives cold restart so restricted managed profiles can merge owner connections.
 */
function persistOwnerTokenForProfile(ownerToken, activeHomeUser, activeAuthToken) {
  if (!ownerToken) return;
  writeSessionOwnerToken(ownerToken);
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
  persistOwnerTokenForProfile,
  readSessionHomeSize,
  writeSessionHomeSize
};
