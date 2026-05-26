import {
  getPromotedHubList,
  loadHubRows,
  getContinueWatching,
  getRecentlyAdded,
  getOnDeck
} from '../library.js';

var HUB_ROW_SIZE = 20;
var INITIAL_ROWS = 2;
function emptyDeferredRows() {
  return Promise.resolve([]);
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
  return getPromotedHubList(server, 16).then(function (hubList) {
    if (!hubList.length) {
      return loadLegacyHomeFeed(server).then(function (legacy) {
        return {
          initialRows: legacy.rows || [],
          deferredRowsPromise: emptyDeferredRows()
        };
      });
    }
    var firstHubs = hubList.slice(0, INITIAL_ROWS);
    var restHubs = hubList.slice(INITIAL_ROWS);
    var deferredRowsPromise = restHubs.length
      ? loadHubRows(server, restHubs, HUB_ROW_SIZE).then(normalizeRows).catch(function () { return []; })
      : emptyDeferredRows();
    return loadHubRows(server, firstHubs, HUB_ROW_SIZE).then(function (firstRows) {
      return {
        initialRows: normalizeRows(firstRows || []),
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

export { loadHomeFeedPhased };
