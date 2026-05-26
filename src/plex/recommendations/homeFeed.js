import {
  getPromotedHubList,
  loadHubRows,
  getContinueWatching,
  getHubItems,
  getSectionHubList,
  getRecentlyAdded,
  getOnDeck
} from '../library.js';
import {
  filterLibrariesForUser,
  isMovieOrTvSection,
  isRestrictedProfile
} from '../../security/libraryAccess.js';

var HUB_ROW_SIZE = 20;
var INITIAL_ROWS = 2;
function emptyDeferredRows() {
  return Promise.resolve([]);
}

function buildUnknownRowKey(row, index) {
  if (!row) return 'row:unknown:' + index;
  return 'row:unknown:' + index + ':' + normalizeToken([
    row.title || '',
    row.key || '',
    row.hubIdentifier || '',
    row.hubKey || '',
    row.context || ''
  ].join(' '));
}

function describeRowForTrace(row, key) {
  var grouping = buildRecentlyAddedGrouping(row);
  return {
    key: key,
    title: row && row.title,
    hubIdentifier: row && row.hubIdentifier,
    sectionId: grouping.sectionId,
    mediaType: grouping.mediaType,
    titleHint: grouping.titleHint
  };
}

function dedupeRows(rows, opts) {
  opts = opts || {};
  var seen = opts.seen || {};
  var trace = !!opts.trace;
  var label = opts.label || 'rows';
  var dropped = [];
  var filtered = (rows || []).filter(function (row, index) {
    if (!row || !row.items || !row.items.length) return false;
    var key = rowSemanticKey(row);
    if (!key) key = buildUnknownRowKey(row, index);
    var aliasKeys = recentlyAddedAliasKeys(row);
    var candidateKeys = [key].concat(aliasKeys);
    var hasCollision = candidateKeys.some(function (candidateKey) {
      return !!seen[candidateKey];
    });
    if (hasCollision) {
      if (trace) dropped.push(describeRowForTrace(row, key));
      return false;
    }
    candidateKeys.forEach(function (candidateKey) {
      if (!candidateKey) return;
      seen[candidateKey] = 1;
    });
    return true;
  });
  if (trace && dropped.length) {
    console.info('[home-feed] dropped duplicate rows', { label: label, dropped: dropped });
  }
  return filtered;
}

function dedupeItems(items) {
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

function isContinueHubRow(row) {
  if (!row) return false;
  var hints = [
    row.hubIdentifier || '',
    row.key || '',
    row.hubKey || '',
    row.context || '',
    row.title || ''
  ].join(' ').toLowerCase();
  return (
    hints.indexOf('continuewatching') >= 0 ||
    hints.indexOf('continue watching') >= 0 ||
    hints.indexOf('ondeck') >= 0 ||
    hints.indexOf('on deck') >= 0
  );
}

function isRecentlyAddedHub(row) {
  if (!row) return false;
  var hints = [
    row.hubIdentifier || '',
    row.key || '',
    row.hubKey || '',
    row.context || '',
    row.title || ''
  ].join(' ').toLowerCase();
  return hints.indexOf('recentlyadded') >= 0 || hints.indexOf('recently added') >= 0;
}

function normalizeToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function extractSectionIdFromPathish(value) {
  var text = String(value || '');
  var match = text.match(/\/hubs\/sections\/([^/?]+)/i);
  return match && match[1] ? String(match[1]) : '';
}

function extractSectionIdFromRecentHubIdentifier(value) {
  var text = String(value || '');
  var match = text.match(/home\.section\.([^.]+)\.recent/i);
  return match && match[1] ? String(match[1]) : '';
}

function extractRowSectionId(row) {
  if (!row) return '';
  var direct = String(row.librarySectionID || row.sectionId || '').trim();
  if (direct) return direct;

  var fromIdentifier = extractSectionIdFromRecentHubIdentifier(row.hubIdentifier);
  if (fromIdentifier) return fromIdentifier;

  var fromPath =
    extractSectionIdFromPathish(row.key) ||
    extractSectionIdFromPathish(row.hubKey) ||
    extractSectionIdFromPathish(row.context);
  if (fromPath) return fromPath;

  var itemSectionIds = {};
  (row.items || []).forEach(function (item) {
    var sectionId = String(item && item.librarySectionID != null ? item.librarySectionID : '').trim();
    if (!sectionId) return;
    itemSectionIds[sectionId] = 1;
  });
  var uniqueIds = Object.keys(itemSectionIds);
  if (uniqueIds.length === 1) return uniqueIds[0];
  return '';
}

function normalizeRecentlyAddedHint(value) {
  var tokenMap = {
    television: 'tv',
    tv: 'tv',
    show: 'tv',
    shows: 'tv',
    series: 'tv',
    movie: 'movie',
    movies: 'movie',
    film: 'movie',
    films: 'movie'
  };
  var tokens = normalizeToken(value || '').split(' ').filter(function (token) {
    return token && token !== 'recently' && token !== 'added' && token !== 'in';
  }).map(function (token) {
    return tokenMap[token] || token;
  });
  var unique = [];
  var seen = {};
  tokens.forEach(function (token) {
    if (seen[token]) return;
    seen[token] = 1;
    unique.push(token);
  });
  return unique.join(' ').trim();
}

function inferRecentlyAddedMediaType(row) {
  if (!row) return 'mixed';
  var films = 0;
  var tv = 0;
  var hints = [
    row.type || '',
    row.title || '',
    row.hubIdentifier || '',
    row.key || '',
    row.hubKey || '',
    row.context || ''
  ].join(' ').toLowerCase();

  if (hints.indexOf('type=1') >= 0 || hints.indexOf('movie') >= 0 || hints.indexOf('film') >= 0) films = 1;
  if (
    hints.indexOf('type=2') >= 0 ||
    hints.indexOf('television') >= 0 ||
    hints.indexOf('tv') >= 0 ||
    hints.indexOf('show') >= 0 ||
    hints.indexOf('season') >= 0 ||
    hints.indexOf('episode') >= 0
  ) {
    tv = 1;
  }

  (row.items || []).forEach(function (item) {
    if (!item || !item.type) return;
    if (item.type === 'movie') films = 1;
    if (item.type === 'show' || item.type === 'season' || item.type === 'episode') tv = 1;
  });

  if (tv && !films) return 'tv';
  if (films && !tv) return 'movie';
  return 'mixed';
}

function buildRecentlyAddedGrouping(row) {
  var mediaType = inferRecentlyAddedMediaType(row);
  var sectionId = extractRowSectionId(row);
  var titleHint = normalizeRecentlyAddedHint(row && row.title ? row.title : '');
  var sourceHint = normalizeRecentlyAddedHint(
    [
      (row && row.hubIdentifier) || '',
      (row && row.key) || '',
      (row && row.hubKey) || '',
      (row && row.context) || ''
    ].join(' ')
      .replace(/type=1/gi, ' movie ')
      .replace(/type=2/gi, ' tv ')
  );

  return {
    mediaType: mediaType,
    sectionId: sectionId,
    titleHint: titleHint,
    sourceHint: sourceHint
  };
}

function recentlyAddedFallbackKey(row) {
  if (!row) return 'generic';
  var grouping = buildRecentlyAddedGrouping(row);
  var titleHint = grouping.titleHint;
  if (!titleHint) {
    titleHint = grouping.sourceHint;
  }
  return (grouping.mediaType || 'mixed') + ':' + (titleHint || 'generic');
}

function recentlyAddedAliasKeys(row) {
  if (!row || !isRecentlyAddedHub(row)) return [];
  var grouping = buildRecentlyAddedGrouping(row);
  var aliases = [];
  if (grouping.titleHint) {
    aliases.push('home:recent:hint:' + grouping.mediaType + ':' + grouping.titleHint);
  }
  if (grouping.sourceHint) {
    aliases.push('home:recent:source:' + grouping.mediaType + ':' + grouping.sourceHint);
  }
  return aliases;
}

function rowSemanticKey(row) {
  if (!row) return '';
  if (isContinueHubRow(row)) return 'home:continue';
  if (isRecentlyAddedHub(row)) {
    var grouping = buildRecentlyAddedGrouping(row);
    if (grouping.sectionId) return 'home:recent:' + grouping.sectionId + ':' + grouping.mediaType;
    return 'home:recent:fallback:' + recentlyAddedFallbackKey(row);
  }
  return String(row.hubIdentifier || row.key || row.title || '').toLowerCase();
}

function selectAccessibleHomeLibraries(libraries, user) {
  return filterLibrariesForUser(libraries || [], user).filter(function (lib) {
    return isMovieOrTvSection(lib);
  });
}

function mapSectionRecentlyAddedFallback(server, library) {
  return getHubItems(server, '/hubs/sections/' + library.id + '/recentlyAdded', HUB_ROW_SIZE).then(function (items) {
    if (!items || !items.length) return null;
    return {
      title: 'Recently Added in ' + library.title,
      hubIdentifier: 'home.section.' + library.id + '.recent',
      key: '/hubs/sections/' + library.id + '/recentlyAdded',
      type: library.type,
      items: items
    };
  }).catch(function () {
    return null;
  });
}

function loadSectionRecentlyAddedRow(server, library) {
  return getSectionHubList(server, library.id, 16).then(function (hubs) {
    var recentHub = (hubs || []).find(isRecentlyAddedHub);
    if (!recentHub) return mapSectionRecentlyAddedFallback(server, library);
    return loadHubRows(server, [recentHub], HUB_ROW_SIZE, { concurrency: 1 }).then(function (rows) {
      if (!rows || !rows.length) return mapSectionRecentlyAddedFallback(server, library);
      var row = rows[0];
      return Object.assign({}, row, {
        title: 'Recently Added in ' + library.title
      });
    });
  }).catch(function () {
    return mapSectionRecentlyAddedFallback(server, library);
  });
}

function loadLibraryScopedRecentlyAddedRows(server, libraries) {
  if (!libraries || !libraries.length) return Promise.resolve([]);
  return Promise.all(libraries.map(function (library) {
    return loadSectionRecentlyAddedRow(server, library);
  })).then(function (rows) {
    return rows.filter(function (row) { return row && row.items && row.items.length; });
  });
}

function buildAccessibleLibraryIdSet(libraries) {
  var ids = {};
  (libraries || []).forEach(function (library) {
    if (!library || library.id == null) return;
    ids[String(library.id)] = 1;
  });
  return ids;
}

function filterItemsToAccessibleLibraries(items, libraries, restricted) {
  var list = dedupeItems(items || []);
  if (!restricted) return list;
  var allowed = buildAccessibleLibraryIdSet(libraries);
  var hasAllowed = Object.keys(allowed).length > 0;
  if (!hasAllowed) return [];
  return list.filter(function (item) {
    var sectionId = item && item.librarySectionID != null ? String(item.librarySectionID) : '';
    if (!sectionId) return false;
    return !!allowed[sectionId];
  });
}

function scopeRowsToLibraries(rows, libraries, restricted) {
  return (rows || []).map(function (row) {
    if (!row || !row.items || !row.items.length) return null;
    var scopedItems = filterItemsToAccessibleLibraries(row.items, libraries, restricted);
    if (!scopedItems.length) return null;
    return Object.assign({}, row, { items: scopedItems });
  }).filter(function (row) { return row && row.items && row.items.length; });
}

function buildContinueWatchingRow(items) {
  if (!items || !items.length) return null;
  return {
    title: 'On Deck',
    hubIdentifier: 'home.continue',
    key: '/hubs/continueWatching',
    displayVariant: 'compact',
    preferSeriesPoster: true,
    items: items
  };
}

function normalizeContinueRowPresentation(row) {
  if (!row || !isContinueHubRow(row)) return row;
  return Object.assign({}, row, {
    title: 'On Deck',
    hubIdentifier: 'home.continue',
    displayVariant: 'compact',
    preferSeriesPoster: true
  });
}

function composeHomeRows(continueRow, sectionRows, promotedRows, opts) {
  opts = opts || {};
  var hasContinue = !!continueRow;
  var hasSectionRecentRows = !!(sectionRows && sectionRows.length);
  var filteredPromoted = (promotedRows || []).filter(function (row) {
    if (!row) return false;
    if (hasContinue && isContinueHubRow(row)) return false;
    if (hasSectionRecentRows && isRecentlyAddedHub(row)) return false;
    return true;
  });
  var mergedRows = []
    .concat(continueRow ? [continueRow] : [])
    .concat(sectionRows || [])
    .concat(filteredPromoted);
  var deduped = dedupeRows(mergedRows, {
    trace: !!opts.trace,
    label: opts.label || 'compose'
  })
    .map(normalizeContinueRowPresentation);
  if (opts.trace) {
    console.info('[home-feed] compose rows', {
      label: opts.label || 'compose',
      rows: deduped.map(function (row) {
        return describeRowForTrace(row, rowSemanticKey(row));
      })
    });
  }
  return deduped;
}

function dedupeDeferredRowsAgainstInitial(initialRows, deferredRows, opts) {
  opts = opts || {};
  var seen = {};
  dedupeRows(initialRows || [], { seen: seen });
  return dedupeRows(deferredRows || [], {
    seen: seen,
    trace: !!opts.trace,
    label: opts.label || 'deferred-final'
  });
}

function classifyHomeRowKind(row) {
  var tv = 0;
  var films = 0;
  if (!row) return 'mixed';

  var hints = [
    row.hubIdentifier || '',
    row.key || '',
    row.hubKey || '',
    row.context || '',
    row.title || '',
    row.type || ''
  ].join(' ').toLowerCase();

  if (hints.indexOf('movie') >= 0 || hints.indexOf('type=1') >= 0) films = 1;
  if (
    hints.indexOf('television') >= 0 ||
    hints.indexOf('show') >= 0 ||
    hints.indexOf('episode') >= 0 ||
    hints.indexOf('season') >= 0 ||
    hints.indexOf('type=2') >= 0 ||
    hints.indexOf('ondeck') >= 0
  ) tv = 1;

  (row.items || []).forEach(function (item) {
    if (!item || !item.type) return;
    if (item.type === 'movie') films = 1;
    if (item.type === 'show' || item.type === 'season' || item.type === 'episode') tv = 1;
  });

  if (tv && !films) return 'tv';
  if (films && !tv) return 'films';
  return 'mixed';
}

function normalizeHomeRowItems(items, rowKind) {
  return (items || []).map(function (item) {
    if (!item || item.type !== 'episode') return item;
    if (rowKind === 'films') return item;
    if (!item.grandparentThumbUrl) return item;
    return Object.assign({}, item, { thumb: item.grandparentThumbUrl });
  });
}

function normalizeHomeRow(row) {
  if (!row) return row;
  var rowKind = classifyHomeRowKind(row);
  return Object.assign({}, row, {
    contentKind: rowKind,
    items: normalizeHomeRowItems(row.items, rowKind)
  });
}

function normalizeRows(rows) {
  return (rows || []).map(normalizeHomeRow);
}

function loadLegacyHomeFeed(server) {
  return Promise.all([
    getContinueWatching(server),
    getRecentlyAdded(server, 2),
    getRecentlyAdded(server, 1),
    getOnDeck(server, 'show')
  ]).then(function (results) {
    var rows = [];
    if (results[0].length) {
      rows.push({ title: 'Continue Watching', hubIdentifier: 'home.continue', items: results[0] });
    }
    var newInTv = results[1].length ? normalizeHomeRowItems(results[1], 'tv') : results[3];
    if (newInTv.length) {
      rows.push({
        title: results[1].length ? 'Recently Added TV' : 'On Deck',
        hubIdentifier: results[1].length ? 'home.television.recent' : 'home.ondeck',
        items: newInTv
      });
    }
    if (results[2].length) {
      rows.push({
        title: 'Recently Added Movies',
        hubIdentifier: 'home.movies.recent',
        items: results[2]
      });
    }
    return { rows: normalizeRows(rows) };
  });
}

function loadHomeFeedPhased(server) {
  var opts = arguments.length > 1 && arguments[1] ? arguments[1] : {};
  var traceHomeDedupe = !!opts.traceHomeDedupe;
  var restricted = isRestrictedProfile(opts.activeHomeUser || null);
  var accessibleLibraries = selectAccessibleHomeLibraries(opts.libraries || [], opts.activeHomeUser || null);

  return Promise.all([
    getContinueWatching(server).catch(function () { return []; }),
    loadLibraryScopedRecentlyAddedRows(server, accessibleLibraries),
    getPromotedHubList(server, 16).catch(function () { return []; })
  ]).then(function (results) {
    var continueItems = filterItemsToAccessibleLibraries(results[0] || [], accessibleLibraries, restricted);
    var continueRow = buildContinueWatchingRow(continueItems);
    var sectionRows = normalizeRows(scopeRowsToLibraries(results[1] || [], accessibleLibraries, restricted));
    var hubList = results[2] || [];

    if (!hubList.length && !sectionRows.length && !continueRow) {
      return loadLegacyHomeFeed(server).then(function (legacy) {
        return {
          initialRows: legacy.rows || [],
          deferredRowsPromise: emptyDeferredRows()
        };
      });
    }

    var firstHubs = hubList.slice(0, INITIAL_ROWS);
    var restHubs = hubList.slice(INITIAL_ROWS);
    var deferredPromotedRowsPromise = restHubs.length
      ? loadHubRows(server, restHubs, HUB_ROW_SIZE).then(normalizeRows).catch(function () { return []; })
      : emptyDeferredRows();

    return loadHubRows(server, firstHubs, HUB_ROW_SIZE).then(function (firstRows) {
      var promotedFirstRows = normalizeRows(scopeRowsToLibraries(firstRows || [], accessibleLibraries, restricted));
      var combinedRows = composeHomeRows(continueRow, sectionRows, promotedFirstRows, {
        trace: traceHomeDedupe,
        label: 'initial-compose'
      });
      var initialRows = combinedRows.slice(0, Math.max(INITIAL_ROWS + 1, 3));
      var overflowRows = combinedRows.slice(initialRows.length);

      var deferredRowsPromise = deferredPromotedRowsPromise.then(function (deferredPromotedRows) {
        var scopedDeferredRows = scopeRowsToLibraries(deferredPromotedRows || [], accessibleLibraries, restricted);
        var deferredComposedRows = composeHomeRows(null, [], scopedDeferredRows, {
          trace: traceHomeDedupe,
          label: 'deferred-compose'
        });
        var deferredRows = dedupeRows(overflowRows.concat(deferredComposedRows), {
          trace: traceHomeDedupe,
          label: 'deferred-overflow-merge'
        });
        return dedupeDeferredRowsAgainstInitial(initialRows, deferredRows, {
          trace: traceHomeDedupe,
          label: 'deferred-final'
        });
      });

      return {
        initialRows: initialRows,
        deferredRowsPromise: deferredRowsPromise
      };
    });
  }).catch(function () {
    return loadLegacyHomeFeed(server).then(function (legacy) {
      return {
        initialRows: legacy.rows || [],
        deferredRowsPromise: emptyDeferredRows()
      };
    });
  });
}

export {
  loadHomeFeedPhased,
  selectAccessibleHomeLibraries,
  isContinueHubRow,
  isRecentlyAddedHub,
  composeHomeRows,
  filterItemsToAccessibleLibraries,
  dedupeDeferredRowsAgainstInitial
};
