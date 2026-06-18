import { fetchPlexJson, serverUrl, getServerToken } from './client.js';
import { buildQuery } from '../utils/fetch.js';
import * as cache from '../core/cache.js';
import * as persistentCache from '../core/persistentCache.js';

var DEFAULT_WIDTH = 1280;
var DEFAULT_HEIGHT = 720;

// Fixed colors matching the app's dark blue-to-black palette.
// Used to generate a noise-dithered ultrablur image as the default body
// background — avoids 8-bit gradient banding on the B8's OLED panel.
// Neutral Material surface-dim grays (no blue tint). A near-flat dark gradient,
// kept as a dithered ultrablur image only to avoid 8-bit gradient banding on the
// B8 OLED — the colors themselves are essentially surface-dim (#131313).
var DEFAULT_BG_COLORS = {
  topLeft:     '1b1b1b',
  topRight:    '171717',
  bottomRight: '131313',
  bottomLeft:  '131313'
};

function serverScope(server) {
  if (!server) return 'noserver';
  return server.clientIdentifier || server.connectionUri || 'unknown';
}

function parseUltraBlurColors(data) {
  if (!data || !data.MediaContainer) return null;
  var container = data.MediaContainer;
  var list = container.UltraBlurColors;
  if (!list) return null;
  if (!Array.isArray(list)) list = [list];
  if (!list.length) return null;
  var c = list[0];
  if (!c.topLeft || !c.topRight || !c.bottomRight || !c.bottomLeft) return null;
  return {
    topLeft: String(c.topLeft).replace(/^#/, ''),
    topRight: String(c.topRight).replace(/^#/, ''),
    bottomRight: String(c.bottomRight).replace(/^#/, ''),
    bottomLeft: String(c.bottomLeft).replace(/^#/, '')
  };
}

function fetchUltraBlurColors(server, artPath) {
  if (!server || !server.connectionUri || !artPath) {
    return Promise.resolve(null);
  }
  var url = serverUrl(server.connectionUri, '/services/ultrablur/colors', { url: artPath }, server);
  var token = getServerToken(server);
  return fetchPlexJson(url, { accessToken: token, timeout: 12000 })
    .then(parseUltraBlurColors)
    .catch(function () {
      return null;
    });
}

function buildUltraBlurImagePath(colors, opts) {
  opts = opts || {};
  var width = opts.width || DEFAULT_WIDTH;
  var height = opts.height || DEFAULT_HEIGHT;
  return '/services/ultrablur/image?' + buildQuery({
    topLeft: colors.topLeft,
    topRight: colors.topRight,
    bottomRight: colors.bottomRight,
    bottomLeft: colors.bottomLeft,
    width: width,
    height: height,
    noise: 1
  });
}

function buildUltraBlurImageUrl(server, colors, opts) {
  if (!server || !server.connectionUri || !colors) return null;
  opts = opts || {};
  var innerPath = buildUltraBlurImagePath(colors, opts);
  return serverUrl(server.connectionUri, '/photo/:/transcode', {
    url: innerPath,
    width: opts.width || DEFAULT_WIDTH,
    height: opts.height || DEFAULT_HEIGHT,
    minSize: 1
  }, server);
}

function buildUltraBlurColorGradient(colors) {
  if (!colors) return '';
  return (
    'linear-gradient(135deg, #' + colors.topLeft + ' 0%, #' + colors.topRight +
    ' 38%, #' + colors.bottomRight + ' 72%, #' + colors.bottomLeft + ' 100%)'
  );
}

function loadUltraBlurBackdrop(server, artPath) {
  if (!server || !artPath) return Promise.resolve(null);
  var key = cache.buildKey(serverScope(server), artPath);
  return cache.remember('ultrablur', key, function () {
    return fetchUltraBlurColors(server, artPath).then(function (colors) {
      if (!colors) return null;
      return {
        colors: colors,
        imageUrl: buildUltraBlurImageUrl(server, colors)
      };
    });
  });
}

function loadUltraBlurBackground(server, artPath) {
  return loadUltraBlurBackdrop(server, artPath).then(function (backdrop) {
    return backdrop && backdrop.imageUrl ? backdrop.imageUrl : null;
  });
}

var DEFAULT_BG_BLOB_KEY = 'plax://default-bg/v1';

function _applyBgImage(cssUrl) {
  document.body.style.backgroundImage = cssUrl;
  document.body.style.backgroundSize = 'cover';
  document.body.style.backgroundPosition = 'center top';
}

function _applyBlobToBody(blob) {
  _applyBgImage('url(' + URL.createObjectURL(blob) + ')');
}

// Apply the ultrablur straight from its Plex URL — no IndexedDB, no XHR, works
// everywhere instantly. This is the reliable display path (IDB is gated off on
// webOS 4 / B8, so the blob cache below is a cosmetic optimisation only — it
// must NEVER be the sole path or the background silently vanishes on the TV).
function _applyDefaultBackgroundUrl(server) {
  if (!server) return false;
  var url = buildUltraBlurImageUrl(server, DEFAULT_BG_COLORS);
  if (!url) return false;
  _applyBgImage('url(' + url + ')');
  return true;
}

// Called at bootstrap. Show the background NOW via the direct URL; if a cached
// blob exists (warm IDB on capable platforms) swap to it to avoid a re-fetch.
function warmDefaultBackground(server) {
  _applyDefaultBackgroundUrl(server);
  return persistentCache.getBlob(DEFAULT_BG_BLOB_KEY).then(function (blob) {
    if (blob) _applyBlobToBody(blob);
  }).catch(function () {});
}

// Called after the profile picker. The direct URL already shows the background;
// here we additionally cache a blob for the next cold start (best-effort — a
// failed fetch or a gated cache never affects what's on screen).
function fetchDefaultBackground(server) {
  if (!server) return;
  _applyDefaultBackgroundUrl(server);
  persistentCache.getBlob(DEFAULT_BG_BLOB_KEY).then(function (blob) {
    if (blob) return; // already cached
    var url = buildUltraBlurImageUrl(server, DEFAULT_BG_COLORS);
    if (!url) return;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.responseType = 'blob';
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
        persistentCache.putBlob(DEFAULT_BG_BLOB_KEY, xhr.response);
      }
    };
    xhr.send();
  }).catch(function () {});
}

export {
  fetchUltraBlurColors,
  buildUltraBlurImageUrl,
  buildUltraBlurColorGradient,
  loadUltraBlurBackdrop,
  loadUltraBlurBackground,
  warmDefaultBackground,
  fetchDefaultBackground
};
