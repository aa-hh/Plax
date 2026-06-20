/**
 * Jellyfin browse / metadata / children — translated into the app's normalized
 * shape via mapItem. Endpoints + params validated against a live 10.11 server.
 * Cache keys are scoped 'jf:<serverId>' so Plex and Jellyfin never collide.
 */
import { fetchJellyfinJson } from './client.js';
import { mapItem } from './mapItem.js';
import * as cache from '../../core/cache.js';

// Lists/cards need only image+userdata (returned by default with userId) plus a
// couple of extras; detail pulls the heavy fields.
var LIST_FIELDS = 'ProviderIds,ParentId,PrimaryImageAspectRatio';
var DETAIL_FIELDS = 'Overview,Genres,People,Studios,MediaSources,MediaStreams,ProviderIds,ParentId';

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

/** Single item (full detail). Cached like Plex's getMetadata. */
function getMetadata(server, ratingKey, opts) {
  opts = opts || {};
  var key = cache.buildKey(scope(server), ratingKey);
  if (opts.fresh) cache.invalidate('metadata', key);
  return cache.remember('metadata', key, function () {
    return fetchJellyfinJson('/Users/' + server.userId + '/Items/' + ratingKey, {
      base: server.url, token: server.accessToken, params: { fields: DETAIL_FIELDS }
    }).then(function (raw) {
      if (!raw || !raw.Id) throw new Error('Not found on Jellyfin server');
      return mapItem(raw, server);
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

export { browseByType, getMetadata, getChildren };
