/**
 * Jellyfin home rows → the phased-feed contract homeScreen expects:
 *   { initialRows: [row], deferredRowsPromise: Promise<[row]> }
 * where each row is { title, hubIdentifier, items:[normalized] }.
 * Continue Watching is pinned first by homeScreen via the 'resume' identifier.
 * Validated shapes against live 10.11: Resume/NextUp enveloped, Latest is a bare array.
 */
import { fetchJellyfinJson } from './client.js';
import { mapItem } from './mapItem.js';
import { normalizeHomeRow } from '../../plex/recommendations/homeFeed.js';

var HUB_FIELDS = 'ProviderIds,ParentId,BackdropImageTags,ParentBackdropImageTags,ParentBackdropItemId,ImageBlurHashes,PrimaryImageAspectRatio';

function toRow(title, id, rawItems, server, extra) {
  var row = {
    title: title,
    hubIdentifier: id,
    items: (rawItems || []).map(function (r) { return mapItem(r, server); })
  };
  if (extra) {
    for (var k in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, k)) row[k] = extra[k];
    }
  }
  return row;
}

function loadResume(server) {
  return fetchJellyfinJson('/Users/' + server.userId + '/Items/Resume', {
    base: server.url, token: server.accessToken,
    params: { limit: 12, mediaTypes: 'Video', fields: HUB_FIELDS }
  }).then(function (res) {
    // Compact layout + series posters, matching Plex's On Deck row.
    return toRow('Continue Watching', 'resume', res && res.Items, server, {
      displayVariant: 'compact', preferSeriesPoster: true
    });
  }).catch(function () { return null; });
}

function loadNextUp(server) {
  return fetchJellyfinJson('/Shows/NextUp', {
    base: server.url, token: server.accessToken,
    params: { userId: server.userId, limit: 20, fields: HUB_FIELDS }
  }).then(function (res) {
    return toRow('Next Up', 'nextup', res && res.Items, server);
  }).catch(function () { return null; });
}

function loadLatest(server, lib) {
  // NOTE: /Items/Latest returns a BARE ARRAY, not the {Items,...} envelope.
  return fetchJellyfinJson('/Users/' + server.userId + '/Items/Latest', {
    base: server.url, token: server.accessToken,
    params: { parentId: lib.id, limit: 20, fields: HUB_FIELDS }
  }).then(function (arr) {
    return toRow('Recently Added in ' + lib.title, 'latest.' + lib.id, arr, server);
  }).catch(function () { return null; });
}

function nonEmpty(rows) {
  // normalizeHomeRow sets contentKind (so hubRow picks series-poster orientation)
  // and swaps episode thumbs to the series poster for TV rows. It Object.assigns
  // over the row, preserving the explicit displayVariant/preferSeriesPoster set
  // on the Resume row.
  return rows
    .filter(function (r) { return r && r.items && r.items.length; })
    .map(normalizeHomeRow);
}

/**
 * "More Like This" for the detail screen. GET /Items/{id}/Similar returns items
 * directly (no hub envelope), so we wrap them in a single inline-items hub
 * descriptor that loadHubRows passes straight through.
 */
function loadSimilar(server, itemId, limit) {
  return fetchJellyfinJson('/Items/' + itemId + '/Similar', {
    base: server.url, token: server.accessToken,
    params: { userId: server.userId, limit: limit || 12, fields: HUB_FIELDS }
  }).then(function (res) {
    var items = ((res && res.Items) || []).map(function (r) { return mapItem(r, server); });
    if (!items.length) return [];
    return [normalizeHomeRow({
      title: 'More Like This', hubIdentifier: 'similar.' + itemId, items: items
    })];
  }).catch(function () { return []; });
}

/**
 * Jellyfin hubs already carry their items inline (unlike Plex, where a hub list
 * is resolved to rows by key), so just return the non-empty ones unchanged.
 */
function loadHubRows(server, hubList) {
  return Promise.resolve((hubList || []).filter(function (h) {
    return h && h.items && h.items.length;
  }));
}

function loadHomeFeedPhased(server, opts) {
  opts = opts || {};
  var libs = opts.libraries || [];
  return Promise.all([loadResume(server), loadNextUp(server)]).then(function (initial) {
    var deferredRowsPromise = Promise.all(libs.map(function (lib) {
      return loadLatest(server, lib);
    })).then(nonEmpty);
    return { initialRows: nonEmpty(initial), deferredRowsPromise: deferredRowsPromise };
  });
}

export { loadHomeFeedPhased, loadSimilar, loadHubRows };
