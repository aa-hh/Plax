import { fetchPlexJson, serverUrl, getServerToken } from './client.js';
import { buildQuery } from '../utils/fetch.js';
import * as cache from '../core/cache.js';
import * as persistentCache from '../core/persistentCache.js';

var DEFAULT_WIDTH = 1280;
var DEFAULT_HEIGHT = 720;

// Fixed colors matching the app's dark blue-to-black palette.
// Used to generate a noise-dithered ultrablur image as the default body
// background — avoids 8-bit gradient banding on the B8's OLED panel.
var DEFAULT_BG_COLORS = {
  topLeft:     '1d2433',
  topRight:    '161b28',
  bottomRight: '131314',
  bottomLeft:  '131314'
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

function _applyBlobToBody(blob) {
  var blobUrl = URL.createObjectURL(blob);
  document.body.style.backgroundImage = 'url(' + blobUrl + ')';
  document.body.style.backgroundSize = 'cover';
  document.body.style.backgroundPosition = 'center top';
}

// Called at bootstrap: reads IDB only, no network. Instant on warm cache.
function warmDefaultBackground() {
  return persistentCache.getBlob(DEFAULT_BG_BLOB_KEY).then(function (blob) {
    if (blob) _applyBlobToBody(blob);
  });
}

// Called once after profile picker: fetches from Plex, caches blob, applies.
// Fire-and-forget — does nothing if already cached.
function fetchDefaultBackground(server) {
  if (!server) return;
  persistentCache.getBlob(DEFAULT_BG_BLOB_KEY).then(function (blob) {
    if (blob) { _applyBlobToBody(blob); return; }
    var url = buildUltraBlurImageUrl(server, DEFAULT_BG_COLORS);
    if (!url) return;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.responseType = 'blob';
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
        persistentCache.putBlob(DEFAULT_BG_BLOB_KEY, xhr.response);
        _applyBlobToBody(xhr.response);
      }
    };
    xhr.send();
  });
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
