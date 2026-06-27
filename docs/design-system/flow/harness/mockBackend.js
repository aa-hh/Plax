/**
 * Mock MediaBackend facade for the flow harness. Aliased in place of
 * src/backends/index.js by the harness rollup plugin, so the REAL screens get
 * fixtures instead of network calls. Exposes every name the real facade exports.
 *
 * Behavior varies by scenario (set via `setScenario`) so the same screen can
 * render full/empty/error states.
 */
import { FIX } from './fixtures.js';

// Provider-agnostic shape helpers are real (pure) — re-export from the source.
export { getWatchStatus, getWatchProgressPercent } from '../../../../src/plex/library.js';

let scenario = 'home';
export function setScenario(s) { scenario = s; }
export function getScenario() { return scenario; }

// ── poster/art placeholders: distinct gradient per path (looks like poster art) ─
function hash(s) { let h = 0; s = String(s); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
function gradient(seed, w, h) {
  const hue = hash(seed) % 360;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0' stop-color='hsl(${hue},42%,32%)'/><stop offset='1' stop-color='hsl(${(hue + 38) % 360},48%,16%)'/>` +
    `</linearGradient></defs><rect width='100%' height='100%' fill='url(#g)'/>` +
    `<circle cx='${w * 0.5}' cy='${h * 0.42}' r='${Math.min(w, h) * 0.16}' fill='hsl(${hue},38%,46%)' opacity='0.5'/>` +
    `<text x='50%' y='62%' text-anchor='middle' font-family='Arial' font-size='${Math.round(Math.min(w, h) * 0.18)}' font-weight='700' fill='rgba(255,255,255,0.12)'>${(hash(seed) % 99).toString().padStart(2, '0')}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
export function getThumbUrl(server, thumb, w) { return gradient(thumb || Math.random(), w || 300, Math.round((w || 300) * 1.5)); }
export function getArtUrl(server, path, w) { return gradient(path || 'art', w || 960, Math.round((w || 960) * 0.5625)); }

// ── home / hubs ───────────────────────────────────────────────────────────────
export function loadHomeFeedPhased() {
  if (scenario === 'home-empty') {
    return Promise.resolve({ initialRows: [], deferredRowsPromise: Promise.resolve([]) });
  }
  return Promise.resolve({
    initialRows: FIX.homeRows.slice(0, 3),
    deferredRowsPromise: Promise.resolve(FIX.homeRows.slice(3)),
  });
}
export function prefetchHomeHubs() { return Promise.resolve({ hubList: [], rows: FIX.homeRows }); }
export function loadHubRows() { return Promise.resolve(FIX.searchRows); }
export function getMetadataRelatedHubList() { return Promise.resolve([{ title: 'More Like This' }, { title: 'From the Studio' }]); }

// ── library / browse ──────────────────────────────────────────────────────────
export function getLibraries() { return Promise.resolve(FIX.libraries); }
export function mapLibrarySections() { return FIX.libraries; }
export function browseByType() { return Promise.resolve({ items: FIX.libraryItems }); }
export function refreshSection() { return Promise.resolve({ items: FIX.libraryItems }); }
export function refreshItem(server, ratingKey) { return getMetadata(server, ratingKey); }
export function pickActiveServer() { return FIX.server; }
export function pickDefaultLibrary() { return FIX.libraries[0]; }
export function discoverServers() { return Promise.resolve({ resolved: [FIX.server] }); }

// ── detail ────────────────────────────────────────────────────────────────────
export function getMetadata(server, ratingKey) {
  const map = { '5001': FIX.movie, '5002': FIX.show, '5003': FIX.season, '5004': FIX.episode };
  const byScenario = { 'detail-movie': FIX.movie, 'detail-show': FIX.show, 'detail-season': FIX.season, 'detail-episode': FIX.episode };
  return Promise.resolve(map[ratingKey] || byScenario[scenario] || FIX.movie);
}
export function getChildren(server, key) {
  if (scenario === 'detail-show' || String(key) === '5002') return Promise.resolve(FIX.seasons());
  return Promise.resolve(FIX.episodes());
}

// ── search ────────────────────────────────────────────────────────────────────
export function search() {
  if (scenario === 'search-empty') return Promise.resolve([]);
  return Promise.resolve(FIX.searchRows);
}

// ── playback reporting (no-ops) ───────────────────────────────────────────────
export function reportTimeline() { return Promise.resolve(); }
export function updateProgress() { return Promise.resolve(); }
export function markWatched() { return Promise.resolve(); }
export function markUnwatched() { return Promise.resolve(); }
export function getBackend() { return {}; }
