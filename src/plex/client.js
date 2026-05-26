import { getState } from '../core/store.js';
import { fetchJson, fetchText, buildQuery } from '../utils/fetch.js';
import { parsePlexXml } from '../utils/xml.js';
import { AUTH_PRODUCT, VERSION, plexClientFields } from './clientIdentity.js';

var PLEX_TV = 'https://plex.tv';
var PRODUCT = AUTH_PRODUCT;

function PlexApiError(message, status, body) {
  this.name = 'PlexApiError';
  this.message = message;
  this.status = status;
  this.body = body;
}

PlexApiError.prototype = Object.create(Error.prototype);

function getClientId() {
  var s = getState();
  return s.clientId;
}

function getToken() {
  var s = getState();
  var user = s.activeHomeUser || s.user;
  return (user && user.authToken) || s.authToken;
}

function plexHeaders(extra) {
  extra = extra || {};
  var h = Object.assign({ Accept: 'application/json' }, plexClientFields());
  var token = getToken();
  if (token) h['X-Plex-Token'] = token;
  var k;
  for (k in extra) {
    if (Object.prototype.hasOwnProperty.call(extra, k)) h[k] = extra[k];
  }
  return h;
}

/** Query params for endpoints where headers cannot be sent (e.g. <video src>). */
function plexClientQuery(extra) {
  extra = extra || {};
  var q = Object.assign({}, plexClientFields());
  var token = getToken();
  if (token) q['X-Plex-Token'] = token;
  var k;
  for (k in extra) {
    if (Object.prototype.hasOwnProperty.call(extra, k)) q[k] = extra[k];
  }
  return q;
}

function plexTvUrl(path, params) {
  var q = buildQuery(params || {});
  return PLEX_TV + path + (q ? '?' + q : '');
}

function serverUrl(base, path, params, server) {
  var sep = path.indexOf('?') >= 0 ? '&' : '?';
  var q = Object.assign(plexClientQuery(), params || {});
  var serverToken = server && server.accessToken;
  if (serverToken) q['X-Plex-Token'] = serverToken;
  return base.replace(/\/$/, '') + path + sep + buildQuery(q);
}

function mapPlexHttpError(status, body) {
  if (status === 401) {
    return new PlexApiError('Plex authentication failed. Sign in again.', status, body);
  }
  if (status === 403) {
    return new PlexApiError('Plex permission denied for this action.', status, body);
  }
  if (status === 404) {
    return new PlexApiError('Not found on Plex server.', status, body);
  }
  if (status === 500 || status === 502 || status === 503 || status === 504) {
    return new PlexApiError('Plex server unavailable (' + status + '). Check the server or network.', status, body);
  }
  return new PlexApiError('HTTP ' + status + (body ? ': ' + body.slice(0, 120) : ''), status, body);
}

function tokenFromServerUrl(url) {
  if (!url || url.indexOf('X-Plex-Token=') < 0) return null;
  var match = url.match(/[?&]X-Plex-Token=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function fetchPlexXml(url, options) {
  options = options || {};
  var serverToken = options.accessToken || tokenFromServerUrl(url);
  var headers = plexHeaders({ Accept: 'application/xml' });
  if (serverToken) {
    headers['X-Plex-Token'] = serverToken;
  }
  return fetchText(url, {
    headers: headers,
    timeout: options.timeout || 30000
  }).then(parsePlexXml).catch(function (err) {
    if (err && err.status) throw mapPlexHttpError(err.status, err.body || '');
    throw err;
  });
}

function fetchPlexJson(url, options) {
  options = options || {};
  var serverToken = options.accessToken || tokenFromServerUrl(url);
  var headers = plexHeaders({ Accept: 'application/json' });
  if (serverToken) {
    headers['X-Plex-Token'] = serverToken;
  }
  return fetchJson(url, {
    headers: headers,
    timeout: options.timeout || 30000
  });
}

function getServerToken(server) {
  return (server && server.accessToken) || getToken();
}

function getImageUrl(server, path, opts) {
  if (!path) return '';
  opts = opts || {};
  var width = opts.width || 300;
  var height = opts.height != null ? opts.height : Math.round(width * 1.5);
  var params = {
    width: width,
    height: height
  };
  if (opts.minSize) params.minSize = 1;
  if (opts.upscale) params.upscale = 1;
  return serverUrl(server.connectionUri, path, params, server);
}

function getThumbUrl(server, path, width) {
  return getImageUrl(server, path, { width: width || 300 });
}

function getArtUrl(server, path, width) {
  return getImageUrl(server, path, { width: width || 1920, height: 1080 });
}

/** Strip X-Plex-Token from URLs before logging (connection probes, playback, errors). */
function redactPlexUrl(url) {
  if (!url || typeof url !== 'string') return url;
  try {
    var parsed = new URL(url, window.location.href);
    if (parsed.searchParams.has('X-Plex-Token')) {
      parsed.searchParams.set('X-Plex-Token', '[redacted]');
    }
    return parsed.toString();
  } catch (e) {
    return url.replace(/([?&]X-Plex-Token=)[^&]*/gi, '$1[redacted]');
  }
}

export {
  PLEX_TV,
  PRODUCT,
  VERSION,
  PlexApiError,
  getClientId,
  getToken,
  plexHeaders,
  plexClientQuery,
  plexTvUrl,
  serverUrl,
  fetchPlexXml,
  fetchPlexJson,
  getThumbUrl,
  getArtUrl,
  getImageUrl,
  mapPlexHttpError,
  getServerToken,
  redactPlexUrl
};
