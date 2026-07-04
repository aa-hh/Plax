import { getMetadata } from '../backends/index.js';

function mergeResolvedItem(snap, meta) {
  if (!meta) {
    return Object.assign({}, snap, {
      title: snap.title || 'Unavailable'
    });
  }
  return Object.assign({}, snap, meta, {
    ratingKey: meta.ratingKey || snap.ratingKey,
    type: meta.type || snap.type,
    title: meta.title || snap.title,
    thumb: meta.thumb || snap.thumb,
    grandparentTitle: meta.grandparentTitle || snap.grandparentTitle || '',
    grandparentThumbUrl: meta.grandparentThumbUrl || snap.grandparentThumbUrl || '',
    parentTitle: meta.parentTitle || snap.parentTitle || '',
    parentIndex: meta.parentIndex != null ? meta.parentIndex : snap.parentIndex,
    index: meta.index != null ? meta.index : snap.index,
    year: meta.year != null ? meta.year : snap.year,
    viewOffset: meta.viewOffset != null ? meta.viewOffset : snap.viewOffset,
    duration: meta.duration != null ? meta.duration : snap.duration,
    contentRating: meta.contentRating || snap.contentRating,
    leafCount: meta.leafCount != null ? meta.leafCount : snap.leafCount
  });
}

function resolveWatchlistItems(server, items) {
  if (!server || !items || !items.length) return Promise.resolve([]);
  return Promise.all(items.map(function (snap) {
    return getMetadata(server, snap.ratingKey).then(function (meta) {
      return mergeResolvedItem(snap, meta);
    }).catch(function () {
      return mergeResolvedItem(snap, null);
    });
  })).then(function (resolved) {
    return resolved.filter(function (item) { return item && item.ratingKey; });
  });
}

function classifyWatchlistRowKind(items) {
  var tv = 0;
  var films = 0;
  (items || []).forEach(function (item) {
    if (!item || !item.type) return;
    if (item.type === 'movie') films = 1;
    if (item.type === 'show' || item.type === 'season' || item.type === 'episode') tv = 1;
  });
  if (tv && !films) return 'tv';
  if (films && !tv) return 'films';
  return 'mixed';
}

/** Hub row shape aligned with Home On Deck rails (compact posters + card text). */
function watchlistToHubRow(watchlist, items) {
  var list = items || [];
  var contentKind = classifyWatchlistRowKind(list);
  return {
    title: watchlist.name,
    hubIdentifier: 'watchlist.' + watchlist.id,
    displayVariant: 'compact',
    preferSeriesPoster: contentKind === 'tv' || contentKind === 'mixed',
    contentKind: contentKind,
    items: list
  };
}

/**
 * Build a Home "Up Next" rail from userQueue snapshots. Mirrors
 * `watchlistToHubRow` so `renderHubRow` + `createMediaCard` give us vertical
 * 2:3 cards, focus motion and poster priming for free. Snapshots already carry
 * enough to render + navigate (no backend resolve needed — the detail screen
 * re-fetches on select), so we render them directly.
 */
function queueToHubRow(items) {
  var list = items || [];
  var contentKind = classifyWatchlistRowKind(list);
  return {
    title: 'Up Next',
    hubIdentifier: 'home.userqueue',
    displayVariant: 'compact',
    preferSeriesPoster: contentKind === 'tv' || contentKind === 'mixed',
    contentKind: contentKind,
    items: list
  };
}

export {
  resolveWatchlistItems,
  watchlistToHubRow,
  queueToHubRow,
  classifyWatchlistRowKind,
  mergeResolvedItem
};
