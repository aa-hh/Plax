/**
 * Jellyfin HTTP client. Mirrors the role of src/plex/client.js but for Jellyfin's
 * REST API: JSON in/out, no XML. Auth is carried via the `Authorization:
 * MediaBrowser ...` header (the modern form; `X-Emby-Authorization` is the legacy
 * alias). See docs/jellyfin/integration-research.md Part B for the API contract.
 */
import { getState } from '../../core/store.js';
import { fetchJson, buildQuery } from '../../utils/fetch.js';
import { VERSION } from '../../plex/clientIdentity.js';

var CLIENT_NAME = 'XPlay';

/** Stable per-install device id — reuses the app clientId (persisted as plax_clientId). */
function getDeviceId() {
  var s = getState();
  if (s && s.clientId) return s.clientId;
  try {
    return localStorage.getItem('plax_clientId') || 'xplay-device';
  } catch (e) {
    return 'xplay-device';
  }
}

function getDeviceName() {
  try {
    var id = getState().deviceInfo;
    if (id && id.modelName) return String(id.modelName);
  } catch (e) { /* ignore */ }
  return 'LG webOS TV';
}

/** `Authorization: MediaBrowser ...` value. Token omitted before sign-in. */
function authHeader(token) {
  var parts = [
    'Client="' + CLIENT_NAME + '"',
    'Device="' + getDeviceName() + '"',
    'DeviceId="' + getDeviceId() + '"',
    'Version="' + VERSION + '"'
  ];
  if (token) parts.push('Token="' + token + '"');
  return 'MediaBrowser ' + parts.join(', ');
}

function jellyfinHeaders(token, extra) {
  var h = { Accept: 'application/json', Authorization: authHeader(token) };
  var k;
  if (extra) for (k in extra) {
    if (Object.prototype.hasOwnProperty.call(extra, k)) h[k] = extra[k];
  }
  return h;
}

/** Strip trailing slash; callers pass a user-entered base like https://host:8096. */
function normalizeBaseUrl(url) {
  if (!url) return '';
  return String(url).trim().replace(/\/+$/, '');
}

function jfUrl(base, path, params) {
  var q = params ? buildQuery(params) : '';
  var sep = path.indexOf('?') >= 0 ? '&' : '?';
  return normalizeBaseUrl(base) + path + (q ? sep + q : '');
}

/**
 * Resolve the active access token: explicit opts.token wins, else current session.
 * Image GETs need no token, so callers may pass token:'' to omit it.
 */
function resolveToken(opts) {
  if (opts && Object.prototype.hasOwnProperty.call(opts, 'token')) return opts.token;
  var s = getState();
  return (s && s.authToken) || null;
}

/**
 * Fetch + parse JSON from a Jellyfin endpoint.
 * opts: { base, params, method, body (object→JSON), token, headers, timeout }
 * If `base` is omitted, uses the active server's url from state.
 */
function fetchJellyfinJson(path, opts) {
  opts = opts || {};
  var base = opts.base;
  if (!base) {
    var server = getState().activeServer;
    base = server && server.url;
  }
  if (!base) return Promise.reject(new Error('No Jellyfin server configured'));

  var headers = jellyfinHeaders(resolveToken(opts), opts.headers);
  var fetchOpts = { method: opts.method || 'GET', headers: headers, timeout: opts.timeout || 30000 };
  if (opts.body != null) {
    headers['Content-Type'] = 'application/json';
    fetchOpts.body = JSON.stringify(opts.body);
  }
  return fetchJson(jfUrl(base, path, opts.params), fetchOpts);
}

export {
  CLIENT_NAME,
  getDeviceId,
  getDeviceName,
  authHeader,
  jellyfinHeaders,
  normalizeBaseUrl,
  jfUrl,
  fetchJellyfinJson
};
