import { fetchPlexJson, serverUrl, getServerToken } from './client.js';
import * as cache from '../core/cache.js';

// Ultrablur is the DETAIL-screen backdrop only (season/show/film). The app-wide
// body background is a flat CSS token — `body { background: var(--surface-dim) }`
// in app.css — so the old "ultrablur as the default body background" path
// (warmDefaultBackground / fetchDefaultBackground / loadUltraBlurBackground +
// their _apply* helpers and the default-bg blob cache) was removed 2026-06-27
// after it was confirmed to have no callers anywhere in the repo.

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
  // 4s ceiling (was 12s): the ultrablur is a cosmetic backdrop, never worth
  // holding a request open for 12s on a slow PMS — fall back to the flat
  // surface-dim background fast instead of leaving the screen mid-load.
  return fetchPlexJson(url, { accessToken: token, timeout: 4000 })
    .then(parseUltraBlurColors)
    .catch(function () {
      return null;
    });
}

// buildUltraBlurImagePath/buildUltraBlurImageUrl/buildUltraBlurColorGradient
// (the server-rendered 1280x720 noise-dithered JPEG + its plain linear-
// gradient CSS fallback) were removed 2026-07-04: the JPEG's synchronous
// decode measured 1212ms on a real B8 and detailScreen.js now reproduces both
// of its ingredients (corner-color blending + noise dithering) natively via
// src/ui/colorWash.js, so nothing ever needs to build that URL again — grep
// confirmed no callers outside this file. loadUltraBlurBackdrop below no
// longer computes an imageUrl; note this means the PERSISTED disk cache may
// still contain old entries with a (now-ignored) `imageUrl` key — harmless,
// nothing reads it.
function loadUltraBlurBackdrop(server, artPath) {
  if (!server || !artPath) return Promise.resolve(null);
  var key = cache.buildKey(serverScope(server), artPath);
  return cache.remember('ultrablur', key, function () {
    return fetchUltraBlurColors(server, artPath).then(function (colors) {
      if (!colors) return null;
      return { colors: colors };
    });
  });
}

export {
  fetchUltraBlurColors,
  loadUltraBlurBackdrop
};
