/**
 * Backend registry + facade.
 *
 * getBackend() resolves the active MediaBackend from getState().provider.
 * The named exports below are call-time pass-throughs to the active backend, so
 * a call site only needs to change its import path (from '../plex/...' to
 * '../backends/index.js') — the call itself is unchanged, and the right provider
 * is dispatched at runtime even after a provider switch.
 */
import { getState } from '../core/store.js';
import { plexBackend } from './plex/index.js';
import { jellyfinBackend } from './jellyfin/index.js';

// Provider-agnostic shape helpers. These read the NORMALIZED item shape (which is
// identical across backends), so they are shared utilities, not per-backend calls.
// Re-exported here so screens import everything media-related from one place.
export { getWatchStatus, getWatchProgressPercent } from '../plex/library.js';

/** @returns {import('./interface.js').MediaBackend} the active backend. */
function getBackend() {
  if (getState().provider === 'jellyfin') return jellyfinBackend;
  return plexBackend;
}

// ---- call-time pass-throughs (import-path-only migration for existing sites) ----
function discoverServers() { return getBackend().discoverServers.apply(null, arguments); }
function getLibraries() { return getBackend().getLibraries.apply(null, arguments); }
function mapLibrarySections() { return getBackend().mapLibrarySections.apply(null, arguments); }
function pickActiveServer() { return getBackend().pickActiveServer.apply(null, arguments); }
function pickDefaultLibrary() { return getBackend().pickDefaultLibrary.apply(null, arguments); }

function browseByType() { return getBackend().browseByType.apply(null, arguments); }
function getMetadata() { return getBackend().getMetadata.apply(null, arguments); }
function getChildren() { return getBackend().getChildren.apply(null, arguments); }
function refreshSection() { return getBackend().refreshSection.apply(null, arguments); }
function refreshItem() { return getBackend().refreshItem.apply(null, arguments); }

function prefetchHomeHubs() { return getBackend().prefetchHomeHubs.apply(null, arguments); }
function loadHomeFeedPhased() { return getBackend().loadHomeFeedPhased.apply(null, arguments); }
function loadHubRows() { return getBackend().loadHubRows.apply(null, arguments); }
function getMetadataRelatedHubList() { return getBackend().getMetadataRelatedHubList.apply(null, arguments); }

function search() { return getBackend().search.apply(null, arguments); }

function reportTimeline() { return getBackend().reportTimeline.apply(null, arguments); }
function updateProgress() { return getBackend().updateProgress.apply(null, arguments); }
function markWatched() { return getBackend().markWatched.apply(null, arguments); }
function markUnwatched() { return getBackend().markUnwatched.apply(null, arguments); }

function getThumbUrl() { return getBackend().getThumbUrl.apply(null, arguments); }
function getArtUrl() { return getBackend().getArtUrl.apply(null, arguments); }

export {
  getBackend,
  discoverServers,
  getLibraries,
  mapLibrarySections,
  pickActiveServer,
  pickDefaultLibrary,
  browseByType,
  getMetadata,
  getChildren,
  refreshSection,
  refreshItem,
  prefetchHomeHubs,
  loadHomeFeedPhased,
  loadHubRows,
  getMetadataRelatedHubList,
  search,
  reportTimeline,
  updateProgress,
  markWatched,
  markUnwatched,
  getThumbUrl,
  getArtUrl
};
