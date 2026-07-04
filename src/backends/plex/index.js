/**
 * Plex backend adapter.
 *
 * Thin wrapper that exposes the original src/plex/* functions under the
 * MediaBackend contract (see ../interface.js). No behavior change: these are the
 * same functions the app has always called, now reachable through getBackend().
 * The normalized item shape is Plex's mapLibraryItem output — the canonical shape.
 */
import {
  browseByType,
  getMetadata,
  getChildren,
  getMetadataRelatedHubList,
  loadHubRows,
  refreshSection,
  refreshItem,
  prefetchHomeHubs,
  reportTimeline,
  updateProgress,
  markWatched,
  markUnwatched
} from '../../plex/library.js';
import {
  discoverServers,
  getLibraries,
  mapLibrarySections,
  pickActiveServer,
  pickDefaultLibrary
} from '../../plex/servers/discovery.js';
import { searchHubs } from '../../plex/search.js';
import { loadHomeFeedPhased } from '../../plex/recommendations/homeFeed.js';
import { getThumbUrl, getArtUrl } from '../../plex/client.js';
import { loadUltraBlurBackdrop } from '../../plex/ultrablur.js';
import { resolveStreamUrl, buildSubtitlePlan } from './playback.js';

function loadAmbientColors(server, item) {
  if (!server || !item) return Promise.resolve(null);
  var artPath = item.artPath || item.art;
  if (!artPath) return Promise.resolve(null);
  return loadUltraBlurBackdrop(server, artPath).then(function (backdrop) {
    return backdrop && backdrop.colors ? backdrop.colors : null;
  });
}

var plexBackend = {
  id: 'plex',
  displayName: 'Plex',

  // discovery & libraries
  discoverServers: discoverServers,
  getLibraries: getLibraries,
  mapLibrarySections: mapLibrarySections,
  pickActiveServer: pickActiveServer,
  pickDefaultLibrary: pickDefaultLibrary,

  // browse / metadata
  browseByType: browseByType,
  getMetadata: getMetadata,
  getChildren: getChildren,
  refreshSection: refreshSection,
  refreshItem: refreshItem,

  // home feed / hubs
  prefetchHomeHubs: prefetchHomeHubs,
  loadHomeFeedPhased: loadHomeFeedPhased,
  loadHubRows: loadHubRows,
  getMetadataRelatedHubList: getMetadataRelatedHubList,

  // search
  search: searchHubs,

  // watch state
  reportTimeline: reportTimeline,
  updateProgress: updateProgress,
  markWatched: markWatched,
  markUnwatched: markUnwatched,

  // images
  getThumbUrl: getThumbUrl,
  getArtUrl: getArtUrl,

  loadAmbientColors: loadAmbientColors,

  // playback
  resolveStreamUrl: resolveStreamUrl,
  buildSubtitlePlan: buildSubtitlePlan
};

export { plexBackend };
