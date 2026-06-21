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
    provider: get('provider'),
    jellyfinServer: get('jellyfinServer'),
    jellyfinServers: getJellyfinServers(),
    jellyfinSessions: get('jellyfinSessions') || [],
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
  if (data.provider != null) set('provider', data.provider);
  if (data.jellyfinServer != null) set('jellyfinServer', data.jellyfinServer);
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

/** Jellyfin per-user sessions cached on this device (multi-user picker). */
function getJellyfinSessions() {
  return get('jellyfinSessions') || [];
}

/** Add or replace a cached Jellyfin user session (keyed by userId). */
function upsertJellyfinSession(session) {
  if (!session || !session.userId || !session.token) return;
  var list = getJellyfinSessions().filter(function (s) { return s.userId !== session.userId; });
  list.push({
    userId: session.userId,
    name: session.name || '',
    token: session.token,
    imageTag: session.imageTag || null
  });
  set('jellyfinSessions', list);
}

/**
 * Servers this device has connected to (powers the server picker so a returning
 * user never re-types a URL). Survives sign-out — only the active token/session
 * is cleared, not the list of known servers.
 */
function getJellyfinServers() {
  var list = get('jellyfinServers') || [];
  // Back-compat: fold the legacy single active server into the list if missing,
  // so installs that predate the list still see their server in the picker.
  var active = get('jellyfinServer');
  if (active && active.url) {
    var known = false;
    for (var i = 0; i < list.length; i++) {
      if ((active.id && list[i].id === active.id) || list[i].url === active.url) { known = true; break; }
    }
    if (!known) {
      list = list.concat([{ url: active.url, name: active.name, id: active.id, version: active.version }]);
    }
  }
  return list;
}

/** Add or replace a known Jellyfin server (keyed by id, falling back to url). */
function upsertJellyfinServer(server) {
  if (!server || !server.url) return;
  var list = (get('jellyfinServers') || []).filter(function (s) {
    if (server.id && s.id) return s.id !== server.id;
    return s.url !== server.url;
  });
  list.push({
    url: server.url,
    name: server.name || 'Jellyfin',
    id: server.id || null,
    version: server.version || null
  });
  set('jellyfinServers', list);
}

/** Forget a known Jellyfin server (matched by id or url). */
function removeJellyfinServer(idOrUrl) {
  var list = (get('jellyfinServers') || []).filter(function (s) {
    return s.id !== idOrUrl && s.url !== idOrUrl;
  });
  set('jellyfinServers', list);
}

function clearAuth() {
  // Preserve the list of known Jellyfin servers across sign-out so the server
  // picker still offers them — seed it from the legacy single server first.
  upsertJellyfinServer(get('jellyfinServer'));
  remove('provider');
  remove('jellyfinServer');
  remove('jellyfinSessions');
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
  getJellyfinSessions,
  upsertJellyfinSession,
  getJellyfinServers,
  upsertJellyfinServer,
  removeJellyfinServer,
  getOwnerAuthToken,
  persistOwnerTokenForProfile,
  readSessionHomeSize,
  writeSessionHomeSize
};
