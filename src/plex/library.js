import {
  fetchPlexXml,
  serverUrl,
  getThumbUrl,
  getArtUrl,
  plexHeaders,
  mapPlexHttpError
} from './client.js';
import { extractMetadataItems } from '../utils/xml.js';
import {
  collectMarkersForItem,
  findIntroMarkers,
  findCreditMarkers
} from '../playback/introMarkers.js';
import * as cache from '../core/cache.js';

function serverScope(server) {
  if (!server) return 'noserver';
  return server.clientIdentifier || server.connectionUri || 'unknown';
}

var WATCH_SENSITIVE_HUB_PATHS = [
  '/hubs/continueWatching',
  '/hubs/home/',
  'onDeck',
  'recentlyAdded',
  'continueWatching'
];

function hubKeyIsWatchSensitive(key) {
  if (key.indexOf(':items:') < 0) return false;
  for (var i = 0; i < WATCH_SENSITIVE_HUB_PATHS.length; i++) {
    if (key.indexOf(WATCH_SENSITIVE_HUB_PATHS[i]) >= 0) return true;
  }
  return false;
}

function invalidateWatchSensitiveHubs(server) {
  var scope = serverScope(server);
  var prefix = scope + ':';
  cache.invalidateMatching('hubs', function (key) {
    return key.indexOf(prefix) === 0 && hubKeyIsWatchSensitive(key);
  });
}

function invalidateAfterWatchChange(server, ratingKey) {
  var scope = serverScope(server);
  cache.invalidate('metadata', cache.buildKey(scope, ratingKey));
  if (ratingKey) {
    cache.invalidate('children', cache.buildKey(scope, ratingKey));
  }
  invalidateWatchSensitiveHubs(server);
}

function invalidateAfterItemRefresh(server, ratingKey) {
  var scope = serverScope(server);
  cache.invalidate('metadata', cache.buildKey(scope, ratingKey));
  if (ratingKey) {
    cache.invalidate('children', cache.buildKey(scope, ratingKey));
  }
  // A re-scan may surface new children / artwork in Recently Added etc.
  cache.invalidate('hubs');
}

function invalidateAfterSectionRefresh(/* server, sectionId */) {
  // Section refresh can affect Recently Added and any section-scoped hub.
  // browseByType is not cached today; only hubs need to be flushed.
  cache.invalidate('hubs');
}

function parseTaggedChildren(children, tag) {
  return (children || []).filter(function (c) { return c._tag === tag; });
}

function parseMediaList(children) {
  return parseTaggedChildren(children, 'Media').map(function (m) {
    var parts = parseTaggedChildren(m._children, 'Part');
    if (!parts.length && m._children) {
      parts = m._children.filter(function (c) { return c.key || c.file; });
    }
    return {
      id: m.id,
      duration: m.duration,
      bitrate: m.bitrate,
      width: m.width,
      height: m.height,
      aspectRatio: m.aspectRatio,
      videoCodec: m.videoCodec,
      videoProfile: m.videoProfile,
      videoResolution: m.videoResolution,
      videoFrameRate: m.videoFrameRate,
      audioCodec: m.audioCodec,
      audioChannels: m.audioChannels,
      container: m.container,
      _tag: 'Media',
      _children: parts.map(function (p) {
        var streams = parseTaggedChildren(p._children, 'Stream');
        return Object.assign({}, p, {
          _tag: 'Part',
          _children: streams,
          _nested: streams
        });
      })
    };
  });
}

function mapLibraryItem(item, server) {
  var thumbPath = item.thumb || item.parentThumb || item.grandparentThumb;
  var artPath = item.art || item.parentArt || item.grandparentArt;
  var children = item._children || [];
  var mediaFromChildren = parseMediaList(children);
  var genres = parseTaggedChildren(children, 'Genre').map(function (g) {
    return { id: g.id, tag: g.tag, filter: g.filter };
  });
  var roles = parseTaggedChildren(children, 'Role').map(function (r) {
    return { id: r.id, tag: r.tag, role: r.role, thumb: r.thumb };
  });
  var directors = parseTaggedChildren(children, 'Director').map(function (d) {
    return { id: d.id, tag: d.tag };
  });
  var collections = parseTaggedChildren(children, 'Collection').map(function (c) {
    return { id: c.id, tag: c.tag, title: c.title };
  });
  var media = mediaFromChildren.length ? mediaFromChildren : (item.media || []);
  var markers = collectMarkersForItem({ _children: children, media: media });
  var introMarkers = findIntroMarkers(markers);
  var introMarker = introMarkers.length ? introMarkers[0] : null;
  var creditMarkers = findCreditMarkers(markers);

  return {
    ratingKey: item.ratingKey,
    key: item.key,
    guid: item.guid,
    title: item.title,
    type: item.type,
    year: item.year,
    originallyAvailableAt: item.originallyAvailableAt,
    contentRating: item.contentRating,
    rating: parseFloat(item.rating) || 0,
    ratingImage: item.ratingImage || '',
    audienceRating: parseFloat(item.audienceRating) || 0,
    audienceRatingImage: item.audienceRatingImage || '',
    studio: item.studio,
    summary: item.summary,
    thumb: thumbPath ? getThumbUrl(server, thumbPath) : '',
    art: artPath ? getArtUrl(server, artPath) : '',
    thumbPath: thumbPath,
    artPath: artPath,
    parentThumbUrl: item.parentThumb ? getThumbUrl(server, item.parentThumb) : '',
    grandparentThumbUrl: item.grandparentThumb ? getThumbUrl(server, item.grandparentThumb) : '',
    viewOffset: parseInt(item.viewOffset, 10) || 0,
    duration: parseInt(item.duration, 10) || 0,
    viewCount: parseInt(item.viewCount, 10) || 0,
    leafCount: parseInt(item.leafCount, 10) || 0,
    viewedLeafCount: parseInt(item.viewedLeafCount, 10) || 0,
    childCount: parseInt(item.childCount, 10) || 0,
    librarySectionID: item.librarySectionID != null ? String(item.librarySectionID) : '',
    parentRatingKey: item.parentRatingKey,
    grandparentRatingKey: item.grandparentRatingKey,
    grandparentTitle: item.grandparentTitle,
    grandparentThumb: item.grandparentThumb,
    parentTitle: item.parentTitle,
    parentIndex: item.parentIndex,
    index: item.index,
    genres: genres,
    roles: roles,
    directors: directors,
    collections: collections,
    media: media,
    markers: markers,
    introMarkers: introMarkers,
    introMarker: introMarker,
    creditMarkers: creditMarkers,
    _children: children
  };
}

function mapMetadataResults(result, server) {
  return extractMetadataItems(result).map(function (i) {
    return mapLibraryItem(i, server);
  });
}

var LIBRARY_PROVIDER = 'com.plexapp.plugins.library';

function getWatchStatus(item) {
  if (item.viewCount > 0 && item.viewOffset <= 0) return 'watched';
  if (item.viewOffset > 0) return 'progress';
  return 'unwatched';
}

function getWatchProgressPercent(item) {
  if (!item || !item.duration || !item.viewOffset) return 0;
  return Math.min(100, Math.round((item.viewOffset / item.duration) * 100));
}

function pmsAction(server, path, params, method) {
  var url = serverUrl(server.connectionUri, path, Object.assign({
    identifier: LIBRARY_PROVIDER
  }, params || {}), server);
  return fetch(url, {
    method: method || 'GET',
    headers: plexHeaders()
  }).then(function (res) {
    if (!res.ok) {
      return res.text().then(function (body) {
        throw mapPlexHttpError(res.status, body || '');
      });
    }
    return res;
  });
}

function reportTimeline(server, ratingKey, opts) {
  opts = opts || {};
  var params = {
    ratingKey: ratingKey,
    key: '/library/metadata/' + ratingKey,
    state: opts.state || 'playing',
    time: opts.time != null ? opts.time : 0
  };
  if (opts.duration) params.duration = opts.duration;
  if (opts.state === 'stopped' && opts.continuing != null) {
    params.continuing = opts.continuing ? 1 : 0;
  }
  return pmsAction(server, '/:/timeline', params, 'POST');
}

function browseLibrary(server, sectionId, type, start, size) {
  start = start || 0;
  size = size || 50;
  var path = '/library/sections/' + sectionId + '/all';
  var url = serverUrl(server.connectionUri, path, {
    'X-Plex-Container-Start': start,
    'X-Plex-Container-Size': size,
    sort: 'titleSort'
  }, server);
  return fetchPlexXml(url).then(function (result) {
    return {
      total: result.size,
      items: mapMetadataResults(result, server)
    };
  });
}

var BROWSE_PAGE_CONCURRENCY = 2;

function browseCacheKey(server, sectionId, sectionType, pageSize) {
  return cache.buildKey(serverScope(server), sectionId, sectionType, pageSize);
}

function storeBrowseListing(server, sectionId, sectionType, pageSize, items) {
  var key = browseCacheKey(server, sectionId, sectionType, pageSize);
  cache.set('browse', key, { items: items, cachedAt: Date.now() });
}

function browseByType(server, sectionId, sectionType, opts) {
  opts = opts || {};
  var path = '/library/sections/' + sectionId + '/all';
  var pageSize = opts.pageSize != null ? opts.pageSize : 200;
  var normalizedType = String(sectionType || '').toLowerCase();
  if (normalizedType === 'tv' || normalizedType === 'series' || normalizedType === 'shows') {
    normalizedType = 'show';
  }
  var cacheKey = browseCacheKey(server, sectionId, normalizedType, pageSize);
  if (opts.fresh) cache.invalidate('browse', cacheKey);

  var cached = cache.get('browse', cacheKey);
  if (cached && cached.items && cached.items.length && !opts.fresh) {
    if (opts.progressive) {
      return Promise.resolve({ items: cached.items.slice(), progressive: false });
    }
    return Promise.resolve(cached.items.slice());
  }

  function pageExtra(start) {
    var extra = {
      sort: 'titleSort',
      'X-Plex-Container-Start': start || 0,
      'X-Plex-Container-Size': pageSize
    };
    if (normalizedType === 'movie') extra.type = 1;
    else if (normalizedType === 'show') extra.type = 2;
    return extra;
  }

  function fetchPageAt(start) {
    var url = serverUrl(server.connectionUri, path, pageExtra(start), server);
    return fetchPlexXml(url).then(function (result) {
      return {
        pageItems: mapMetadataResults(result, server),
        offset: parseInt(result.attrs && result.attrs.offset, 10) || start || 0,
        totalSize: parseInt(result.attrs && result.attrs.totalSize, 10) || 0
      };
    });
  }

  function fetchRemainingParallel(nextStart, acc, totalSize) {
    var starts = [];
    for (var s = nextStart; s < totalSize; s += pageSize) starts.push(s);
    if (!starts.length) {
      storeBrowseListing(server, sectionId, normalizedType, pageSize, acc);
      return Promise.resolve(acc);
    }
    return mapPool(starts, BROWSE_PAGE_CONCURRENCY, function (start) {
      return fetchPageAt(start).then(function (page) { return page.pageItems; });
    }).then(function (pages) {
      var merged = acc.slice();
      for (var i = 0; i < pages.length; i++) {
        if (pages[i] && pages[i].length) merged = merged.concat(pages[i]);
      }
      storeBrowseListing(server, sectionId, normalizedType, pageSize, merged);
      return merged;
    });
  }

  function fetchPage(start, acc) {
    return fetchPageAt(start).then(function (page) {
      var pageItems = page.pageItems;
      var next = (acc || []).concat(pageItems);
      var offset = page.offset;
      var totalSize = page.totalSize || next.length;
      var nextStart = offset + pageItems.length;
      var hasMore = pageItems.length > 0 && nextStart < totalSize;

      if (opts.progressive && (!acc || !acc.length) && hasMore) {
        return {
          progressive: true,
          items: next,
          fetchRest: function () {
            return fetchRemainingParallel(nextStart, next, totalSize);
          }
        };
      }

      if (!hasMore) {
        storeBrowseListing(server, sectionId, normalizedType, pageSize, next);
        return { items: next };
      }
      return fetchPage(nextStart, next);
    });
  }

  return cache.remember('browse', cacheKey, function () {
    return fetchPage(0, []).then(function (res) {
      if (res && res.progressive) return res;
      return res.items || res;
    });
  }).then(function (res) {
    if (res && res.progressive) return res;
    if (Array.isArray(res)) return res;
    return res && res.items ? res.items : res;
  });
}

function getMetadata(server, ratingKey, opts) {
  opts = opts || {};
  var key = cache.buildKey(serverScope(server), ratingKey);
  if (opts.fresh) cache.invalidate('metadata', key);
  return cache.remember('metadata', key, function () {
    var url = serverUrl(server.connectionUri, '/library/metadata/' + ratingKey, {
      includeChildren: 1,
      includeExtras: 1,
      includeRelated: 0,
      includeOnDeck: 0
    }, server);
    return fetchPlexXml(url).then(function (result) {
      var items = mapMetadataResults(result, server);
      if (!items.length) throw mapPlexHttpError(404, '');
      return items[0];
    });
  });
}

function getChildren(server, ratingKey, opts) {
  opts = opts || {};
  var key = cache.buildKey(serverScope(server), ratingKey);
  if (opts.fresh) cache.invalidate('children', key);
  return cache.remember('children', key, function () {
    var url = serverUrl(server.connectionUri, '/library/metadata/' + ratingKey + '/children', {
      'X-Plex-Container-Size': 200
    }, server);
    return fetchPlexXml(url).then(function (result) {
      return mapMetadataResults(result, server);
    });
  });
}

var TV_HUB_TYPES = { movie: 1, show: 1, episode: 1, season: 1, mixed: 1, video: 1 };
var SKIP_HUB_IDENTIFIERS = {
  'home.music.recent': 1,
  'home.photos.recent': 1,
  'home.playlists': 1,
  'home.videos.recent': 1
};

function mapHubNode(hub) {
  return {
    hubIdentifier: hub.hubIdentifier || '',
    key: hub.key || '',
    hubKey: hub.hubKey || '',
    title: hub.title || '',
    type: hub.type || '',
    context: hub.context || '',
    size: parseInt(hub.size, 10) || 0,
    totalSize: parseInt(hub.totalSize, 10) || 0,
    more: hub.more === '1' || hub.more === true,
    style: hub.style || 'shelf',
    promoted: hub.promoted === '1' || hub.promoted === true,
    _raw: hub
  };
}

function mapHubsFromResult(result) {
  return (result.hubs || []).map(mapHubNode);
}

function isTvRelevantHub(hub) {
  if (SKIP_HUB_IDENTIFIERS[hub.hubIdentifier]) return false;
  if (hub.type && !TV_HUB_TYPES[hub.type]) return false;
  return true;
}

function hubInlineItems(hubNode, server) {
  return mapMetadataResults({ hubs: [hubNode], items: [] }, server);
}

function fetchHubContainer(server, path, size) {
  var url = serverUrl(server.connectionUri, path, {
    'X-Plex-Container-Size': size || 24
  }, server);
  return fetchPlexXml(url);
}

function getHubItems(server, hubPath, size, opts) {
  opts = opts || {};
  size = size || 20;
  var path = hubPath.indexOf('/') === 0 ? hubPath : '/' + hubPath;
  var key = cache.buildKey(serverScope(server), 'items', path, size);
  if (opts.fresh) cache.invalidate('hubs', key);
  var loader = function () {
    return fetchHubContainer(server, path, size).then(function (result) {
      return mapMetadataResults(result, server);
    }).catch(function () { return []; });
  };
  if (opts.swr === false) return cache.remember('hubs', key, loader);
  return cache.rememberSWR('hubs', key, loader, { staleMs: 30 * 1000 });
}

function loadHubRow(server, hubMeta, size) {
  var inline = hubInlineItems(hubMeta._raw, server);
  if (inline.length) {
    return Promise.resolve(Object.assign({}, hubMeta, { items: inline }));
  }
  if (!hubMeta.key) {
    return Promise.resolve(Object.assign({}, hubMeta, { items: [] }));
  }
  return getHubItems(server, hubMeta.key, size).then(function (items) {
    return Object.assign({}, hubMeta, { items: items });
  });
}

function mapPool(items, limit, fn) {
  if (!items || !items.length) return Promise.resolve([]);
  var results = new Array(items.length);
  var index = 0;
  var active = 0;

  return new Promise(function (resolve, reject) {
    function pump() {
      while (active < limit && index < items.length) {
        var slot = index++;
        active += 1;
        Promise.resolve(fn(items[slot], slot)).then(function (value) {
          results[slot] = value;
          active -= 1;
          if (index >= items.length && active === 0) resolve(results);
          else pump();
        }).catch(reject);
      }
    }
    pump();
  });
}

function loadHubRows(server, hubMetas, size, opts) {
  opts = opts || {};
  var concurrency = opts.concurrency != null ? opts.concurrency : 4;
  var onRow = opts.onRow;
  return mapPool(hubMetas, concurrency, function (h) {
    return loadHubRow(server, h, size).then(function (row) {
      if (row.items && row.items.length) {
        if (onRow) onRow(row);
        return row;
      }
      return null;
    });
  }).then(function (rows) {
    return rows.filter(function (r) { return r && r.items && r.items.length; });
  });
}

function getPromotedHubList(server, size, opts) {
  opts = opts || {};
  var key = cache.buildKey(serverScope(server), 'promoted', size || 'd');
  if (opts.fresh) cache.invalidate('hubs', key);
  var loader = function () {
    return fetchHubContainer(server, '/hubs/promoted', size).then(function (result) {
      return mapHubsFromResult(result).filter(isTvRelevantHub);
    }).catch(function () {
      return fetchHubContainer(server, '/hubs', size).then(function (result) {
        return mapHubsFromResult(result).filter(isTvRelevantHub);
      }).catch(function () { return []; });
    });
  };
  if (opts.swr === false) return cache.remember('hubs', key, loader);
  return cache.rememberSWR('hubs', key, loader, { staleMs: 30 * 1000 });
}

function getSectionHubList(server, sectionId, size, opts) {
  opts = opts || {};
  var key = cache.buildKey(serverScope(server), 'section', sectionId, size || 'd');
  if (opts.fresh) cache.invalidate('hubs', key);
  var loader = function () {
    return fetchHubContainer(server, '/hubs/sections/' + sectionId, size).then(function (result) {
      return mapHubsFromResult(result).filter(isTvRelevantHub);
    }).catch(function () { return []; });
  };
  if (opts.swr === false) return cache.remember('hubs', key, loader);
  return cache.rememberSWR('hubs', key, loader, { staleMs: 45 * 1000 });
}

function getMetadataRelatedHubList(server, metadataId, size, opts) {
  opts = opts || {};
  var key = cache.buildKey(serverScope(server), 'related', metadataId, size || 'd');
  if (opts.fresh) cache.invalidate('hubs', key);
  var loader = function () {
    return fetchHubContainer(server, '/hubs/metadata/' + metadataId + '/related', size)
      .then(function (result) {
        return mapHubsFromResult(result).filter(isTvRelevantHub);
      }).catch(function () { return []; });
  };
  if (opts.swr === false) return cache.remember('hubs', key, loader);
  return cache.rememberSWR('hubs', key, loader, { staleMs: 45 * 1000 });
}

/**
 * Warm home hub cache during bootstrap (promoted list + first rows).
 * Safe to fire in parallel with getLibraries — read-only PMS calls.
 */
function prefetchHomeHubs(server, opts) {
  opts = opts || {};
  var hubSize = opts.hubListSize != null ? opts.hubListSize : 16;
  var rowSize = opts.rowSize != null ? opts.rowSize : 20;
  var initialRows = opts.initialRows != null ? opts.initialRows : 2;
  return getPromotedHubList(server, hubSize).then(function (hubList) {
    if (!hubList.length) return { hubList: [], rows: [] };
    return loadHubRows(server, hubList.slice(0, initialRows), rowSize).then(function (rows) {
      return { hubList: hubList, rows: rows };
    });
  }).catch(function () {
    return { hubList: [], rows: [] };
  });
}

function getContinueWatching(server) {
  function dedupe(items) {
    var seen = {};
    return (items || []).filter(function (item) {
      if (!item) return false;
      var key = String(item.ratingKey || item.key || '').trim();
      if (!key) return true;
      if (seen[key]) return false;
      seen[key] = 1;
      return true;
    });
  }

  return getHubItems(server, '/hubs/continueWatching', 24).then(function (items) {
    if (items && items.length) return dedupe(items);
    return getHubItems(server, '/hubs/home/continueWatching', 24).then(function (altItems) {
      if (altItems && altItems.length) return dedupe(altItems);
      return Promise.all([
        getOnDeck(server, 'show'),
        getOnDeck(server, 'movie')
      ]).then(function (parts) {
        return dedupe((parts[0] || []).concat(parts[1] || []));
      });
    });
  }).catch(function () {
    return [];
  });
}

function getRecentlyAdded(server, mediaType) {
  return getHubItems(server, '/hubs/home/recentlyAdded?type=' + mediaType, 20);
}

function getOnDeck(server, mediaType) {
  var typeParam = mediaType === 'show' ? '2' : '1';
  return getHubItems(server, '/hubs/home/onDeck?type=' + typeParam, 20)
    .catch(function () { return getHubItems(server, '/hubs/sections/home/onDeck', 20); })
    .catch(function () { return []; });
}

function updateProgress(server, ratingKey, viewOffset, state, duration, extra) {
  extra = extra || {};
  return reportTimeline(server, ratingKey, {
    state: state || 'playing',
    time: viewOffset,
    duration: duration,
    continuing: extra.continuing
  }).then(function (res) {
    // Playback transitions change viewOffset, viewCount, Continue Watching, etc.
    // Only invalidate on stop/pause to avoid thrashing the cache mid-play.
    if (state === 'stopped' || state === 'paused') {
      invalidateAfterWatchChange(server, ratingKey);
    }
    return res;
  }).catch(function (err) {
    console.warn('Plex timeline:', err.message);
  });
}

function markWatched(server, ratingKey) {
  return pmsAction(server, '/:/scrobble', { key: '/library/metadata/' + ratingKey }, 'PUT').then(function (res) {
    invalidateAfterWatchChange(server, ratingKey);
    return res;
  });
}

function markUnwatched(server, ratingKey) {
  return pmsAction(server, '/:/unscrobble', { key: '/library/metadata/' + ratingKey }, 'PUT').then(function (res) {
    invalidateAfterWatchChange(server, ratingKey);
    return res;
  });
}

/**
 * Trigger a Plex Media Server scan for a library section.
 *
 *   GET /library/sections/{sectionId}/refresh           -> normal scan
 *   GET /library/sections/{sectionId}/refresh?force=1   -> force re-scan
 *
 * Note: Plex's section refresh endpoint uses GET, not PUT.
 * Returns a Promise<Response>. PMS responds immediately; the scan runs
 * asynchronously on the server. 401/403/5xx are mapped to PlexApiError.
 */
function refreshSection(server, sectionId, opts) {
  opts = opts || {};
  var params = {};
  if (opts.force) params.force = 1;
  var url = serverUrl(
    server.connectionUri,
    '/library/sections/' + sectionId + '/refresh',
    params,
    server
  );
  return fetch(url, { method: 'GET', headers: plexHeaders() }).then(function (res) {
    if (!res.ok) {
      return res.text().then(function (body) {
        throw mapPlexHttpError(res.status, body || '');
      });
    }
    invalidateAfterSectionRefresh(server, sectionId);
    return res;
  });
}

/**
 * Trigger a Plex Media Server metadata refresh for a single item.
 *
 *   PUT /library/metadata/{ratingKey}/refresh
 *
 * Returns a Promise<Response>. PMS responds immediately; the refresh runs
 * asynchronously on the server. 401/403/5xx are mapped to PlexApiError.
 */
function refreshItem(server, ratingKey) {
  var url = serverUrl(
    server.connectionUri,
    '/library/metadata/' + ratingKey + '/refresh',
    {},
    server
  );
  return fetch(url, { method: 'PUT', headers: plexHeaders() }).then(function (res) {
    if (!res.ok) {
      return res.text().then(function (body) {
        throw mapPlexHttpError(res.status, body || '');
      });
    }
    invalidateAfterItemRefresh(server, ratingKey);
    return res;
  });
}

export {
  mapLibraryItem,
  mapMetadataResults,
  getWatchStatus,
  getWatchProgressPercent,
  browseLibrary,
  browseByType,
  getMetadata,
  getChildren,
  mapHubNode,
  loadHubRow,
  loadHubRows,
  getPromotedHubList,
  getSectionHubList,
  getMetadataRelatedHubList,
  prefetchHomeHubs,
  getContinueWatching,
  getHubItems,
  getRecentlyAdded,
  getOnDeck,
  reportTimeline,
  updateProgress,
  markWatched,
  markUnwatched,
  refreshSection,
  refreshItem
};
