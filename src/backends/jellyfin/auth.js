/**
 * Jellyfin authentication: server-URL validation, Quick Connect (remote-friendly,
 * the Plex-PIN analog), and username/password fallback. See
 * docs/jellyfin/integration-research.md Part B §1.
 *
 * None of these set app state — the login screen owns persistence so the flow
 * mirrors pairingScreen (which persists then navigates).
 */
import { fetchJellyfinJson, normalizeBaseUrl } from './client.js';

/**
 * Validate a user-entered server URL via the unauthenticated public-info endpoint.
 * Resolves to a normalized server descriptor; rejects if it isn't a Jellyfin server.
 */
function validateServer(rawUrl) {
  var base = normalizeBaseUrl(rawUrl);
  if (!base) return Promise.reject(new Error('Enter a server address'));
  if (!/^https?:\/\//i.test(base)) base = 'http://' + base;
  return fetchJellyfinJson('/System/Info/Public', { base: base, token: '', timeout: 12000 })
    .then(function (info) {
      if (!info || !info.Id || !info.Version) {
        throw new Error('That address is not a Jellyfin server');
      }
      return {
        url: base,
        name: info.ServerName || 'Jellyfin',
        id: info.Id,
        version: info.Version,
        type: 'jellyfin'
      };
    });
}

/** Login-screen user list (no auth). Users configured to show publicly. */
function fetchPublicUsers(base) {
  return fetchJellyfinJson('/Users/Public', { base: base, token: '', timeout: 10000 })
    .then(function (list) { return Array.isArray(list) ? list : []; })
    .catch(function () { return []; });
}

function quickConnectEnabled(base) {
  return fetchJellyfinJson('/QuickConnect/Enabled', { base: base, token: '', timeout: 10000 })
    .then(function (v) { return v === true || v === 'true'; })
    .catch(function () { return false; });
}

/** Returns { Secret, Code, ... }. Show Code to the user; keep Secret private. */
function initiateQuickConnect(base) {
  return fetchJellyfinJson('/QuickConnect/Initiate', { base: base, token: '', method: 'POST' });
}

/** Poll until result.Authenticated === true. */
function pollQuickConnectOnce(base, secret) {
  return fetchJellyfinJson('/QuickConnect/Connect', { base: base, token: '', params: { secret: secret } });
}

/** Exchange an authorized Quick Connect secret for an AuthenticationResult. */
function authenticateWithQuickConnect(base, secret) {
  return fetchJellyfinJson('/Users/AuthenticateWithQuickConnect', {
    base: base, token: '', method: 'POST', body: { Secret: secret }
  });
}

/** Username/password fallback. Password field is `Pw` (Jellyfin quirk). */
function authenticateByName(base, username, password) {
  return fetchJellyfinJson('/Users/AuthenticateByName', {
    base: base, token: '', method: 'POST', body: { Username: username, Pw: password || '' }
  });
}

/**
 * Drive Quick Connect to completion: initiate, surface the code, poll until the
 * user approves on another device, then authenticate.
 * onCode(code) is called once with the 6-digit code to display.
 * Returns a controller with .promise (→ AuthenticationResult) and .cancel().
 */
function runQuickConnect(base, onCode) {
  var cancelled = false;
  var POLL_MS = 5000;
  var MAX_MS = 5 * 60 * 1000;
  var started = Date.now();

  var promise = initiateQuickConnect(base).then(function (init) {
    if (!init || !init.Secret) throw new Error('Quick Connect unavailable');
    if (typeof onCode === 'function') onCode(init.Code);
    var secret = init.Secret;

    return new Promise(function (resolve, reject) {
      function tick() {
        if (cancelled) return reject(new Error('cancelled'));
        if (Date.now() - started > MAX_MS) return reject(new Error('Quick Connect timed out'));
        pollQuickConnectOnce(base, secret).then(function (res) {
          if (cancelled) return reject(new Error('cancelled'));
          if (res && res.Authenticated) {
            authenticateWithQuickConnect(base, secret).then(resolve, reject);
          } else {
            setTimeout(tick, POLL_MS);
          }
        }).catch(function () {
          // Transient poll error — keep trying until the overall timeout.
          if (!cancelled) setTimeout(tick, POLL_MS);
        });
      }
      tick();
    });
  });

  return {
    promise: promise,
    cancel: function () { cancelled = true; }
  };
}

export {
  validateServer,
  fetchPublicUsers,
  quickConnectEnabled,
  initiateQuickConnect,
  pollQuickConnectOnce,
  authenticateWithQuickConnect,
  authenticateByName,
  runQuickConnect
};
