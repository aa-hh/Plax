/**
 * Jellyfin home rows → the phased-feed contract homeScreen expects:
 *   { initialRows: [row], deferredRowsPromise: Promise<[row]> }
 * where each row is { title, hubIdentifier, items:[normalized] }.
 * Continue Watching is pinned first by homeScreen via the 'resume' identifier.
 * Validated shapes against live 10.11: Resume/NextUp enveloped, Latest is a bare array.
 */
import { fetchJellyfinJson } from './client.js';
import { mapItem } from './mapItem.js';

var HUB_FIELDS = 'ProviderIds,ParentId';

function toRow(title, id, rawItems, server) {
  return {
    title: title,
    hubIdentifier: id,
    items: (rawItems || []).map(function (r) { return mapItem(r, server); })
  };
}

function loadResume(server) {
  return fetchJellyfinJson('/Users/' + server.userId + '/Items/Resume', {
    base: server.url, token: server.accessToken,
    params: { limit: 12, mediaTypes: 'Video', fields: HUB_FIELDS }
  }).then(function (res) {
    return toRow('Continue Watching', 'resume', res && res.Items, server);
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
  return rows.filter(function (r) { return r && r.items && r.items.length; });
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

export { loadHomeFeedPhased };
