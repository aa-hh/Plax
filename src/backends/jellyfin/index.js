/**
 * Jellyfin backend adapter (MediaBackend contract — see ../interface.js).
 *
 * Phase 2 scope: auth + libraries + image URLs are real so sign-in lands on a
 * Home with the library sidebar. Browse / metadata / hubs / search / playback are
 * graceful empty stubs that Phase 3–4 implement (they resolve to empty rather than
 * throw, so the UI renders an empty-but-stable Home until then). See
 * docs/jellyfin/integration-research.md for the full API + field mapping.
 */
import { fetchJellyfinJson, jfUrl } from './client.js';
import { browseByType, getMetadata, getChildren, refreshSection, refreshItem } from './library.js';
import { loadHomeFeedPhased, loadSimilar, loadHubRows } from './hubs.js';
import { search } from './search.js';
import {
  resolveStreamUrl,
  buildSubtitlePlan,
  updateProgress,
  reportTimeline,
  markWatched,
  markUnwatched
} from './playback.js';
import { blurHashToCorners } from './blurhashPalette.js';

function loadAmbientColors(server, item) {
  if (!item || !item.ambientHash) return Promise.resolve(null);
  return Promise.resolve(blurHashToCorners(item.ambientHash));
}

function collectionTypeToSectionType(ct) {
  switch (ct) {
    case 'movies': return 'movie';
    case 'tvshows': return 'show';
    case 'music': return 'music';
    case 'homevideos': return 'movie';
    default: return ct || 'movie';
  }
}

/** GET /Users/{userId}/Views → library sections in the app's {id,title,type} shape. */
function getLibraries(server) {
  var userId = server && server.userId;
  if (!userId) return Promise.resolve({ items: [] });
  return fetchJellyfinJson('/Users/' + userId + '/Views', { base: server.url, token: server.accessToken })
    .then(function (res) {
      var items = (res && res.Items) || [];
      var sections = items.map(function (it) {
        return {
          id: it.Id,
          title: it.Name,
          type: collectionTypeToSectionType(it.CollectionType),
          collectionType: it.CollectionType || '',
          key: '/Items?ParentId=' + it.Id
        };
      }).filter(function (s) {
        // Only show movie/show libraries for now (music/photos unsupported in UI).
        return s.type === 'movie' || s.type === 'show';
      });
      return { items: sections };
    });
}

/** appBootstrap (jellyfin branch) passes the getLibraries result straight through. */
function mapLibrarySections(result) {
  return (result && result.items) || [];
}

function pickDefaultLibrary(libs) {
  return (libs && libs[0]) || null;
}

// ---- image URLs (no token needed for image GETs) ----
function imageUrl(server, itemId, type, tag, width) {
  if (!server || !itemId) return '';
  var params = {};
  if (tag) params.tag = tag;
  if (width) params.maxWidth = width;
  return jfUrl(server.url, '/Items/' + itemId + '/Images/' + (type || 'Primary'), params);
}

// For Jellyfin, mapItem (Phase 3) stores { _imageItemId, _primaryTag, _backdropTag }
// on the normalized item and sets thumb/art via these builders. Until then these
// accept a pre-built path and pass it through.
function getThumbUrl(server, path, width) {
  if (path && /^https?:\/\//.test(path)) return path;
  return path || '';
}
function getArtUrl(server, path, width) {
  if (path && /^https?:\/\//.test(path)) return path;
  return path || '';
}

// ---- remaining no-ops (watch-state lands in Phase 4; refresh is admin-only) ----
function notImplemented() { return Promise.resolve(null); }

var jellyfinBackend = {
  id: 'jellyfin',
  displayName: 'Jellyfin',

  // discovery & libraries
  discoverServers: function () { return Promise.resolve({ resolved: [] }); },
  getLibraries: getLibraries,
  mapLibrarySections: mapLibrarySections,
  pickActiveServer: function (servers) { return (servers && servers[0]) || null; },
  pickDefaultLibrary: pickDefaultLibrary,

  // browse / metadata
  browseByType: browseByType,
  getMetadata: getMetadata,
  getChildren: getChildren,
  refreshSection: refreshSection, // POST /Items/{id}/Refresh (admin-only; 403 → friendlyScanError)
  refreshItem: refreshItem,

  // home feed / hubs
  prefetchHomeHubs: function () { return Promise.resolve({ hubList: [], rows: [] }); },
  loadHomeFeedPhased: loadHomeFeedPhased,
  loadHubRows: loadHubRows,
  getMetadataRelatedHubList: function (server, id, size) { return loadSimilar(server, id, size); },

  // search
  search: search,

  // playback (sessionController delegates here for provider==='jellyfin')
  resolveStreamUrl: resolveStreamUrl,
  buildSubtitlePlan: buildSubtitlePlan,

  // watch state / progress
  reportTimeline: reportTimeline,
  updateProgress: updateProgress,
  markWatched: markWatched,
  markUnwatched: markUnwatched,

  // images
  getThumbUrl: getThumbUrl,
  getArtUrl: getArtUrl,
  imageUrl: imageUrl,

  loadAmbientColors: loadAmbientColors
};

export { jellyfinBackend, getLibraries };
