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
    jellyfinSessions: get('jellyfinSessions') || [],
    savedLinks: getSavedLinks(),
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

/**
 * Saved links — one persisted credential set per backend "server" the user has
 * successfully connected to. CROSS-PROVIDER and SURVIVES sign-out / forget-this-
 * server: this is the store that lets a user jump between a Plex account and a
 * Jellyfin server without ever re-linking. Each entry is provider-tagged:
 *   Plex     { provider:'plex',     id:'plex:'+clientId, name, authToken, ownerAuthToken, clientId, user }
 *   Jellyfin { provider:'jellyfin', id:'jf:'+serverId,   name, url, version, jfId }
 * Keyed by `id` (one Plex account = one link; one Jellyfin server = one link).
 * Seeds from the legacy single `jellyfinServer` key on first read (back-compat).
 */
function getSavedLinks() {
  var list = get('savedLinks');
  if (!list) {
    list = [];
    var legacyList = get('jellyfinServers');
    if (legacyList && legacyList.length) {
      legacyList.forEach(function (s) {
        list.push(jellyfinLinkFrom(s));
      });
    } else {
      var legacy = get('jellyfinServer');
      if (legacy && legacy.url) list.push(jellyfinLinkFrom(legacy));
    }
    set('savedLinks', list);
  }
  return list;
}

function upsertSavedLink(link) {
  if (!link || !link.id) return;
  var list = getSavedLinks().filter(function (l) { return l.id !== link.id; });
  list.unshift(link);            // most-recent first
  set('savedLinks', list);
}

function removeSavedLink(id) {
  if (!id) return;
  set('savedLinks', getSavedLinks().filter(function (l) { return l.id !== id; }));
}

function jellyfinLinkFrom(s) {
  var jfId = s.id || s.url;
  return {
    provider: 'jellyfin',
    id: 'jf:' + jfId,
    name: s.name || s.url,
    url: s.url,
    version: s.version || '',
    jfId: jfId
  };
}

/** Save/refresh the Plex account link (one per plex.tv account, keyed by clientId). */
function upsertPlexLink(o) {
  if (!o || !o.clientId || !o.authToken) return;
  upsertSavedLink({
    provider: 'plex',
    id: 'plex:' + o.clientId,
    name: o.name || 'Plex',
    authToken: o.authToken,
    ownerAuthToken: o.ownerAuthToken || o.authToken,
    clientId: o.clientId,
    user: o.user || null
  });
}

// ── Back-compat adapters (jellyfinLoginScreen + any caller still on the old API) ──
function getJellyfinServers() {
  return getSavedLinks()
    .filter(function (l) { return l.provider === 'jellyfin'; })
    .map(function (l) { return { url: l.url, name: l.name, id: l.jfId || l.id, version: l.version }; });
}

function upsertJellyfinServer(server) {
  if (!server || !server.url) return;
  upsertSavedLink(jellyfinLinkFrom(server));
}

function removeJellyfinServer(serverId) {
  removeSavedLink('jf:' + serverId);
}

/**
 * Clear only the ACTIVE session (the credential currently driving the app) while
 * KEEPING the saved-links list and cached Jellyfin per-user sessions. Used by
 * "Switch server" (jump to another saved link) and after "Forget server" removes
 * the current link — neither should nuke the user's other saved links.
 */
function clearActiveSession() {
  remove('provider');
  remove('authToken');
  remove('ownerAuthToken');
  clearSessionOwnerToken();
  remove('user');
  remove('activeHomeUser');
  remove('jellyfinServer');
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

function clearAuth() {
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
  clearActiveSession,
  getSavedLinks,
  upsertSavedLink,
  removeSavedLink,
  upsertPlexLink,
  getJellyfinServers,
  upsertJellyfinServer,
  removeJellyfinServer,
  getJellyfinSessions,
  upsertJellyfinSession,
  getOwnerAuthToken,
  persistOwnerTokenForProfile,
  readSessionHomeSize,
  writeSessionHomeSize
};
