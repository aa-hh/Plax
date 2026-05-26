import { fetchPlexJson, serverUrl, getServerToken } from './client.js';
import { buildQuery } from '../utils/fetch.js';
import * as cache from '../core/cache.js';

var DEFAULT_WIDTH = 1920;
var DEFAULT_HEIGHT = 1080;

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

function loadUltraBlurBackground(server, artPath) {
  if (!server || !artPath) return Promise.resolve(null);
  var key = cache.buildKey(serverScope(server), artPath);
  return cache.remember('ultrablur', key, function () {
    return fetchUltraBlurColors(server, artPath).then(function (colors) {
      if (!colors) return null;
      return buildUltraBlurImageUrl(server, colors);
    });
  });
}

export {
  fetchUltraBlurColors,
  buildUltraBlurImageUrl,
  loadUltraBlurBackground
};
