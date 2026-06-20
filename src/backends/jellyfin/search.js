/**
 * Jellyfin search → rows grouped by type (Movies / Shows / Episodes), matching
 * the row contract searchScreen consumes ({title, hubIdentifier, items}). Supports
 * the staggered onRow callback so results stream in as Plex's searchHubs does.
 */
import { fetchJellyfinJson } from './client.js';
import { mapItem } from './mapItem.js';

var SEARCH_FIELDS = 'ProviderIds,ParentId';
var GROUPS = [
  { title: 'Movies', id: 'search.movies', type: 'movie' },
  { title: 'Shows', id: 'search.shows', type: 'show' },
  { title: 'Episodes', id: 'search.episodes', type: 'episode' }
];

function search(server, query, limit, opts) {
  opts = opts || {};
  var q = (query || '').trim();
  if (!server || !q) return Promise.resolve([]);
  limit = limit || 24;
  return fetchJellyfinJson('/Items', {
    base: server.url, token: server.accessToken,
    params: {
      userId: server.userId,
      searchTerm: q,
      recursive: true,
      includeItemTypes: 'Movie,Series,Episode',
      limit: limit * 3,
      fields: SEARCH_FIELDS
    }
  }).then(function (res) {
    var items = ((res && res.Items) || []).map(function (r) { return mapItem(r, server); });
    var rows = [];
    GROUPS.forEach(function (g) {
      var groupItems = items.filter(function (it) { return it.type === g.type; }).slice(0, limit);
      if (!groupItems.length) return;
      var row = { title: g.title, hubIdentifier: g.id, items: groupItems };
      rows.push(row);
      if (opts.stagger && typeof opts.onRow === 'function') opts.onRow(row);
    });
    return rows;
  });
}

export { search };
