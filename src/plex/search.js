/**
 * Plex multi-type search.
 *
 * Primary endpoint:
 *   GET /hubs/search?query=…&limit=…
 *     Returns a MediaContainer of <Hub> rows (Movies, Shows, Episodes,
 *     Actors, Directors). Hub children carry inline metadata, so a single
 *     request fills every result row.
 *
 * Section-scoped fallback (when an active library is selected and the
 * primary endpoint returns no usable rows):
 *   GET /library/sections/{id}/search?type=…&query=…&limit=…
 *     Returns a flat list of <Video>/<Directory> entries for that section.
 *
 * Voice search variants are out of scope (no remote mic on webOS TV path).
 *
 * Results are cached briefly in the `search` namespace (see core/cache.js)
 * so debounced typing does not re-hit the PMS on identical queries.
 */

import {
  fetchPlexXml,
  serverUrl
} from './client.js';
import { mapHubNode, loadHubRows, mapMetadataResults } from './library.js';
import * as cache from '../core/cache.js';

var DEFAULT_HUB_LIMIT = 10;

// Hub `type` values we surface in the TV UI. People hubs (actor / director)
// are skipped for MVP — we have no person detail route.
var TV_SEARCH_HUB_TYPES = {
  movie: 1,
  show: 1,
  episode: 1,
  season: 1,
  mixed: 1,
  video: 1
};

// Section type ids per Plex API.
var SECTION_SEARCH_TYPE = {
  movie: 1,
  show: 2,
  episode: 4
};

function serverScope(server) {
  if (!server) return 'noserver';
  return server.clientIdentifier || server.connectionUri || 'unknown';
}

function normalizeQuery(query) {
  return (query || '').trim();
}

function isTvSearchHub(hubMeta) {
  if (!hubMeta) return false;
  if (!hubMeta.type) return true;
  return !!TV_SEARCH_HUB_TYPES[hubMeta.type];
}

function fetchHubsSearch(server, query, limit) {
  var url = serverUrl(server.connectionUri, '/hubs/search', {
    query: query,
    limit: limit,
    includeCollections: 0
  }, server);
  return fetchPlexXml(url);
}

function loadHubsSearchRows(server, query, limit, opts) {
  opts = opts || {};
  return fetchHubsSearch(server, query, limit).then(function (result) {
    var hubs = (result.hubs || []).map(mapHubNode).filter(isTvSearchHub);
    if (!hubs.length) return [];
    return loadHubRows(server, hubs, limit, { onRow: opts.onRow });
  });
}

function fetchSectionSearch(server, sectionId, sectionType, query, limit) {
  var typeId = SECTION_SEARCH_TYPE[sectionType];
  var params = {
    query: query,
    'X-Plex-Container-Size': limit
  };
  if (typeId) params.type = typeId;
  var url = serverUrl(
    server.connectionUri,
    '/library/sections/' + sectionId + '/search',
    params,
    server
  );
  return fetchPlexXml(url);
}

function loadSectionFallbackRow(server, library, query, limit) {
  if (!library || !library.id) return Promise.resolve(null);
  return fetchSectionSearch(server, library.id, library.type, query, limit)
    .then(function (result) {
      var items = mapMetadataResults(result, server);
      if (!items.length) return null;
      return {
        title: library.title || 'Library',
        hubIdentifier: 'search.section.' + library.id,
        type: library.type || 'mixed',
        size: items.length,
        items: items
      };
    })
    .catch(function () { return null; });
}

/**
 * Search Plex via /hubs/search and (optionally) fall back to the active
 * library section when the primary endpoint returns nothing.
 *
 * @param {object} server      Active PMS connection (with connectionUri / accessToken).
 * @param {string} query       Raw user query (trimmed before sending).
 * @param {number} [limit]     Max items per hub. Defaults to 10.
 * @param {object} [opts]      { library } for section-scoped fallback.
 * @returns {Promise<Array<{title, hubIdentifier, type, size, items}>>}
 */
function searchHubs(server, query, limit, opts) {
  var q = normalizeQuery(query);
  if (!server || !q) return Promise.resolve([]);
  limit = limit || DEFAULT_HUB_LIMIT;
  opts = opts || {};

  var scope = serverScope(server);
  var sectionId = opts.library && opts.library.id;
  var key = cache.buildKey(
    scope,
    'hubs',
    q.toLowerCase(),
    limit,
    sectionId || 'all'
  );

  function finishRows(rows) {
    if (rows.length) return rows;
    if (!opts.library) return rows;
    return loadSectionFallbackRow(server, opts.library, q, limit)
      .then(function (row) {
        if (row && typeof opts.onRow === 'function') opts.onRow(row);
        return row ? [row] : [];
      });
  }

  function loadRows() {
    return loadHubsSearchRows(server, q, limit, opts).then(finishRows).catch(function (err) {
      if (opts.library) {
        return loadSectionFallbackRow(server, opts.library, q, limit)
          .then(function (row) {
            if (row && typeof opts.onRow === 'function') opts.onRow(row);
            return row ? [row] : [];
          });
      }
      throw err;
    });
  }

  if (opts.stagger && typeof opts.onRow === 'function') {
    return loadRows();
  }

  return cache.remember('search', key, loadRows);
}

export { searchHubs };
