/**
 * Jellyfin browse / metadata / children — translated into the app's normalized
 * shape via mapItem. Endpoints + params validated against a live 10.11 server.
 * Cache keys are scoped 'jf:<serverId>' so Plex and Jellyfin never collide.
 */
import { fetchJellyfinJson } from './client.js';
import { mapItem, ticksToMs } from './mapItem.js';
import * as cache from '../../core/cache.js';

// Lists/cards need only image+userdata (returned by default with userId) plus a
// couple of extras; detail pulls the heavy fields.
var LIST_FIELDS = 'ProviderIds,ParentId,PrimaryImageAspectRatio,ChildCount,DateCreated';
var DETAIL_FIELDS = 'Overview,Genres,People,Studios,MediaSources,MediaStreams,ProviderIds,ParentId,ChildCount,RecursiveItemCount,DateCreated';

function scope(server) {
  return 'jf:' + ((server && (server.id || server.url)) || 'srv');
}

function includeTypesFor(sectionType) {
  if (sectionType === 'show') return 'Series';
  if (sectionType === 'movie') return 'Movie';
  return '';
}

function mapList(res, server) {
  return ((res && res.Items) || []).map(function (r) { return mapItem(r, server); });
}

/** Grid browse → { total, items, fetchRest? } (the shape libraryScreen expects). */
function browseByType(server, sectionId, sectionType, opts) {
  opts = opts || {};
  var baseParams = {
    userId: server.userId,
    parentId: sectionId,
    includeItemTypes: includeTypesFor(sectionType),
    recursive: true,
    sortBy: 'SortName',
    sortOrder: 'Ascending',
    fields: LIST_FIELDS
  };
  var firstParams = Object.assign({ startIndex: 0, limit: 300 }, baseParams);
  return fetchJellyfinJson('/Items', {
    base: server.url, token: server.accessToken, params: firstParams
  }).then(function (res) {
    var total = res.TotalRecordCount != null ? res.TotalRecordCount : (res.Items || []).length;
    var items = mapList(res, server);
    var result = { total: total, items: items };
    if (total > items.length) {
      result.fetchRest = function () {
        var allParams = Object.assign({ startIndex: 0, limit: total }, baseParams);
        return fetchJellyfinJson('/Items', {
          base: server.url, token: server.accessToken, params: allParams
        }).then(function (r2) { return mapList(r2, server); });
      };
    }
    return result;
  });
}

// Jellyfin Media Segment Type → the app's normalized marker type. Outro = credits.
var SEGMENT_TYPE_MAP = { Intro: 'intro', Outro: 'credit' };

/**
 * Skip-intro / skip-credits markers via the Media Segments API (Jellyfin 10.10+,
 * requires the segments provider). Returns the normalized marker shape
 * ({ id, type, startMs, endMs }) the player consumes. Absent/old servers 404 →
 * resolve to [] so detail/playback degrade gracefully.
 */
function loadMediaSegments(server, ratingKey) {
  return fetchJellyfinJson('/MediaSegments/' + ratingKey, {
    base: server.url, token: server.accessToken,
    params: { includeSegmentTypes: 'Intro,Outro' }
  }).then(function (res) {
    return ((res && res.Items) || []).map(function (s) {
      var type = SEGMENT_TYPE_MAP[s.Type];
      if (!type) return null;
      var startMs = ticksToMs(s.StartTicks);
      var endMs = ticksToMs(s.EndTicks);
      if (endMs <= startMs) return null;
      return { id: s.Id || 0, type: type, startMs: startMs, endMs: endMs, final: type === 'credit' };
    }).filter(Boolean);
  }).catch(function () { return []; });
}

/** Single item (full detail). Cached like Plex's getMetadata. */
function getMetadata(server, ratingKey, opts) {
  opts = opts || {};
  var key = cache.buildKey(scope(server), ratingKey);
  if (opts.fresh) cache.invalidate('metadata', key);
  return cache.remember('metadata', key, function () {
    return Promise.all([
      fetchJellyfinJson('/Users/' + server.userId + '/Items/' + ratingKey, {
        base: server.url, token: server.accessToken, params: { fields: DETAIL_FIELDS }
      }),
      loadMediaSegments(server, ratingKey)
    ]).then(function (results) {
      var raw = results[0];
      var segments = results[1] || [];
      if (!raw || !raw.Id) throw new Error('Not found on Jellyfin server');
      var item = mapItem(raw, server);
      if (segments.length) {
        var intros = segments.filter(function (m) { return m.type === 'intro'; });
        item.markers = segments;
        item.introMarkers = intros;
        item.introMarker = intros.length ? intros[0] : null;
        item.creditMarkers = segments.filter(function (m) { return m.type === 'credit'; });
      }
      return item;
    });
  });
}

/** Children: seasons of a series, or episodes of a season (generic parentId browse). */
function getChildren(server, ratingKey, opts) {
  opts = opts || {};
  var key = cache.buildKey(scope(server), 'children', ratingKey);
  if (opts.fresh) cache.invalidate('children', key);
  return cache.remember('children', key, function () {
    return fetchJellyfinJson('/Items', {
      base: server.url, token: server.accessToken,
      params: {
        userId: server.userId,
        parentId: ratingKey,
        sortBy: 'ParentIndexNumber,IndexNumber,SortName',
        sortOrder: 'Ascending',
        fields: LIST_FIELDS,
        limit: 800
      }
    }).then(function (res) { return mapList(res, server); });
  });
}

/**
 * Trigger a server-side library scan: POST /Items/{id}/Refresh. Admin-only on
 * Jellyfin — non-admin users get a 403, which fetchJson surfaces as err.status
 * 403 so libraryScreen's friendlyScanError shows the "not allowed" message
 * (instead of the old fake success). Returns 204 (no body) on success.
 */
function refreshSection(server, sectionId, opts) {
  opts = opts || {};
  return fetchJellyfinJson('/Items/' + sectionId + '/Refresh', {
    base: server.url, token: server.accessToken, method: 'POST',
    params: {
      Recursive: true,
      metadataRefreshMode: opts.force ? 'FullRefresh' : 'Default',
      imageRefreshMode: opts.force ? 'FullRefresh' : 'Default',
      replaceAllMetadata: !!opts.force,
      replaceAllImages: false
    }
  });
}

/**
 * Refresh a single item's metadata: POST /Items/{id}/Refresh. Same admin-gated
 * endpoint as refreshSection; non-recursive, pulls fresh metadata + images.
 */
function refreshItem(server, ratingKey, opts) {
  opts = opts || {};
  return fetchJellyfinJson('/Items/' + ratingKey + '/Refresh', {
    base: server.url, token: server.accessToken, method: 'POST',
    params: {
      Recursive: false,
      metadataRefreshMode: 'FullRefresh',
      imageRefreshMode: 'FullRefresh',
      replaceAllMetadata: !!opts.force,
      replaceAllImages: false
    }
  });
}

export { browseByType, getMetadata, getChildren, refreshSection, refreshItem };
