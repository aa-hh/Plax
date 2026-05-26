/**
 * Plex trick-play / storyboard helpers for seek scrub previews.
 *
 * Supports:
 * - Part BIF indexes (`indexes="sd"` → /library/parts/{id}/indexes/sd/{offsetMs})
 * - Metadata storyboard sprite sheets (/library/metadata/{ratingKey}/storyboard)
 */

import { fetchPlexXml, serverUrl } from '../plex/client.js';
import * as cache from '../core/cache.js';

var PREVIEW_WIDTH = 240;
var PREVIEW_HEIGHT = 135;
var DEFAULT_INTERVAL_MS = 10000;
var STORYBOARD_PATHS = ['/storyboard', '/storyboards'];

function serverScope(server) {
  if (!server) return 'noserver';
  return server.clientIdentifier || server.connectionUri || 'unknown';
}

function parsePositiveInt(value, fallback) {
  var n = parseInt(value, 10);
  return n > 0 ? n : fallback;
}

function snapOffsetMs(offsetMs, intervalMs) {
  var interval = intervalMs > 0 ? intervalMs : DEFAULT_INTERVAL_MS;
  if (offsetMs <= 0) return 0;
  return Math.floor(offsetMs / interval) * interval;
}

function hasPartIndexes(version) {
  return !!(version && version.partIndexes === 'sd' && version.partId);
}

function buildPartIndexPreviewUrl(server, partId, offsetMs, opts) {
  opts = opts || {};
  var ms = Math.max(0, Math.round(offsetMs));
  var path = '/library/parts/' + partId + '/indexes/sd/' + ms;
  return serverUrl(server.connectionUri, path, {
    width: opts.width || PREVIEW_WIDTH,
    height: opts.height || PREVIEW_HEIGHT
  }, server);
}

function collectStoryboardNodes(result) {
  var nodes = [];
  if (!result) return nodes;
  (result.items || []).forEach(function (item) {
    if (item._tag === 'Storyboard') nodes.push(item);
  });
  var container = result.attrs || {};
  if (container._tag === 'Storyboard') nodes.push(container);
  return nodes;
}

function storyboardPathFromNode(node) {
  return node.key || node.url || node.thumb || '';
}

function parseStoryboardSheets(result, server) {
  var sheets = [];
  collectStoryboardNodes(result).forEach(function (node) {
    var path = storyboardPathFromNode(node);
    if (!path) return;
    var tileWidth = parsePositiveInt(node.tileWidth || node.thumbWidth, PREVIEW_WIDTH);
    var tileHeight = parsePositiveInt(node.tileHeight || node.thumbHeight, PREVIEW_HEIGHT);
    var cols = parsePositiveInt(node.cols, 1);
    var rows = parsePositiveInt(node.rows, 1);
    var intervalMs = parsePositiveInt(node.interval, DEFAULT_INTERVAL_MS);
    var startOffsetMs = parsePositiveInt(node.startOffsetMs || node.startTimeOffset, 0);
    var sheetWidth = parsePositiveInt(node.width, cols * tileWidth);
    var sheetHeight = parsePositiveInt(node.height, rows * tileHeight);
    sheets.push({
      path: path.indexOf('/') === 0 ? path : '/' + path,
      imageUrl: serverUrl(server.connectionUri, path, {
        width: sheetWidth,
        height: sheetHeight
      }, server),
      tileWidth: tileWidth,
      tileHeight: tileHeight,
      cols: cols,
      rows: rows,
      intervalMs: intervalMs,
      startOffsetMs: startOffsetMs,
      endOffsetMs: startOffsetMs + (intervalMs * cols * rows)
    });
  });
  return sheets;
}

function pickStoryboardSheet(sheets, offsetMs) {
  if (!sheets || !sheets.length) return null;
  var i;
  for (i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    if (offsetMs >= sheet.startOffsetMs && offsetMs < sheet.endOffsetMs) return sheet;
  }
  return sheets[sheets.length - 1];
}

function tileIndexForOffset(offsetMs, sheet) {
  var rel = Math.max(0, offsetMs - sheet.startOffsetMs);
  var index = Math.floor(rel / sheet.intervalMs);
  var maxTiles = sheet.cols * sheet.rows - 1;
  return Math.min(Math.max(0, index), maxTiles);
}

function tileColumnRow(tileIndex, cols) {
  var columns = cols > 0 ? cols : 1;
  return {
    col: tileIndex % columns,
    row: Math.floor(tileIndex / columns)
  };
}

function spriteBackgroundPosition(col, row, tileWidth, tileHeight) {
  return (-col * tileWidth) + 'px ' + (-row * tileHeight) + 'px';
}

function resolveSpritePreview(sheets, offsetMs) {
  var sheet = pickStoryboardSheet(sheets, offsetMs);
  if (!sheet) return null;
  var snappedMs = snapOffsetMs(offsetMs, sheet.intervalMs);
  var tileIndex = tileIndexForOffset(snappedMs, sheet);
  var pos = tileColumnRow(tileIndex, sheet.cols);
  return {
    mode: 'sprite',
    timeMs: snappedMs,
    imageUrl: sheet.imageUrl,
    tileWidth: sheet.tileWidth,
    tileHeight: sheet.tileHeight,
    backgroundPosition: spriteBackgroundPosition(pos.col, pos.row, sheet.tileWidth, sheet.tileHeight),
    backgroundSize: (sheet.cols * sheet.tileWidth) + 'px ' + (sheet.rows * sheet.tileHeight) + 'px'
  };
}

function resolvePartIndexPreview(server, version, offsetMs) {
  if (!hasPartIndexes(version)) return null;
  var snappedMs = snapOffsetMs(offsetMs, DEFAULT_INTERVAL_MS);
  return {
    mode: 'image',
    timeMs: snappedMs,
    imageUrl: buildPartIndexPreviewUrl(server, version.partId, snappedMs)
  };
}

function resolveScrubPreview(source, offsetMs, durationMs) {
  if (!source) return { mode: 'time', timeMs: Math.max(0, Math.min(offsetMs, durationMs || offsetMs)) };
  var dur = durationMs > 0 ? durationMs : offsetMs;
  var clamped = Math.max(0, Math.min(offsetMs, dur));
  if (source.kind === 'partIndex' && source.server && source.version) {
    var partPreview = resolvePartIndexPreview(source.server, source.version, clamped);
    if (partPreview) return partPreview;
  }
  if (source.kind === 'sprite' && source.sheets && source.sheets.length) {
    var spritePreview = resolveSpritePreview(source.sheets, clamped);
    if (spritePreview) return spritePreview;
  }
  return { mode: 'time', timeMs: snapOffsetMs(clamped, DEFAULT_INTERVAL_MS) };
}

function fetchStoryboardSheets(server, ratingKey) {
  var scope = serverScope(server);
  var cacheKey = cache.buildKey(scope, ratingKey);
  return cache.remember('storyboard', cacheKey, function () {
    var pathIndex = 0;
    function tryNext() {
      if (pathIndex >= STORYBOARD_PATHS.length) return Promise.resolve([]);
      var path = '/library/metadata/' + ratingKey + STORYBOARD_PATHS[pathIndex];
      pathIndex += 1;
      var url = serverUrl(server.connectionUri, path, {}, server);
      return fetchPlexXml(url).then(function (result) {
        var sheets = parseStoryboardSheets(result, server);
        if (sheets.length) return sheets;
        return tryNext();
      }).catch(function () {
        return tryNext();
      });
    }
    return tryNext();
  });
}

function loadScrubPreviewSource(server, item, version) {
  if (!server || !item) return Promise.resolve(null);
  if (hasPartIndexes(version)) {
    return Promise.resolve({
      kind: 'partIndex',
      server: server,
      version: version
    });
  }
  var ratingKey = item.ratingKey;
  if (!ratingKey) return Promise.resolve(null);
  return fetchStoryboardSheets(server, ratingKey).then(function (sheets) {
    if (!sheets.length) return null;
    return { kind: 'sprite', sheets: sheets };
  });
}

export {
  PREVIEW_WIDTH,
  PREVIEW_HEIGHT,
  DEFAULT_INTERVAL_MS,
  snapOffsetMs,
  hasPartIndexes,
  buildPartIndexPreviewUrl,
  parseStoryboardSheets,
  pickStoryboardSheet,
  tileIndexForOffset,
  tileColumnRow,
  spriteBackgroundPosition,
  resolveScrubPreview,
  resolveSpritePreview,
  resolvePartIndexPreview,
  fetchStoryboardSheets,
  loadScrubPreviewSource
};
