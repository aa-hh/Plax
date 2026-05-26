import test from 'node:test';
import assert from 'node:assert/strict';

import {
  composeHomeRows,
  selectAccessibleHomeLibraries,
  filterItemsToAccessibleLibraries,
  dedupeDeferredRowsAgainstInitial
} from '../src/plex/recommendations/homeFeed.js';
import { rowPrefersSeriesPoster } from '../src/ui/components/hubRow.js';

test('selectAccessibleHomeLibraries keeps movie/tv libraries only', function () {
  var libraries = [
    { id: '1', title: 'Films', type: 'movie', hidden: false, _accessible: true },
    { id: '2', title: 'TV', type: 'show', hidden: false, _accessible: true },
    { id: '3', title: 'Music', type: 'artist', hidden: false, _accessible: true },
    { id: '4', title: 'Hidden', type: 'movie', hidden: true, _accessible: true },
    { id: '5', title: 'Blocked', type: 'show', hidden: false, _accessible: false }
  ];

  var selected = selectAccessibleHomeLibraries(
    libraries,
    { admin: false, restricted: true }
  );

  assert.deepEqual(selected.map(function (lib) { return lib.id; }), ['1', '2']);
});

test('composeHomeRows puts On Deck before recently added rails', function () {
  var continueRow = {
    title: 'On Deck',
    hubIdentifier: 'home.continue',
    items: [{ ratingKey: 'cw-1', type: 'episode' }]
  };
  var sectionRows = [
    {
      title: 'Recently Added in Films',
      hubIdentifier: 'home.section.1.recent',
      items: [{ ratingKey: 'm-1', type: 'movie' }]
    }
  ];
  var promotedRows = [
    {
      title: 'Continue Watching',
      hubIdentifier: 'home.continuewatching',
      items: [{ ratingKey: 'cw-2', type: 'movie' }]
    },
    {
      title: 'Trending',
      hubIdentifier: 'home.trending',
      items: [{ ratingKey: 't-1', type: 'movie' }]
    }
  ];

  var rows = composeHomeRows(continueRow, sectionRows, promotedRows);

  assert.equal(rows[0].title, 'On Deck');
  assert.equal(rows[1].title, 'Recently Added in Films');
  assert.equal(rows[2].title, 'Trending');
  assert.equal(rows.length, 3);
});

test('composeHomeRows keeps promoted continue row when explicit On Deck missing', function () {
  var promotedRows = [
    {
      title: 'Continue Watching',
      hubIdentifier: 'home.continuewatching',
      items: [{ ratingKey: 'cw-2', type: 'movie' }]
    },
    {
      title: 'Trending',
      hubIdentifier: 'home.trending',
      items: [{ ratingKey: 't-1', type: 'movie' }]
    }
  ];

  var rows = composeHomeRows(null, [], promotedRows);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].hubIdentifier, 'home.continue');
  assert.equal(rows[0].title, 'On Deck');
  assert.equal(rows[0].displayVariant, 'compact');
  assert.equal(rows[0].preferSeriesPoster, true);
});

test('composeHomeRows keeps a single On Deck rail when multiple sources exist', function () {
  var continueRow = {
    title: 'On Deck',
    hubIdentifier: 'home.continue',
    items: [{ ratingKey: 'cw-1', type: 'episode' }]
  };
  var promotedRows = [
    {
      title: 'On Deck',
      hubIdentifier: 'home.ondeck',
      items: [{ ratingKey: 'od-1', type: 'movie' }]
    },
    {
      title: 'Continue Watching',
      hubIdentifier: 'home.continuewatching',
      items: [{ ratingKey: 'cw-2', type: 'movie' }]
    }
  ];

  var rows = composeHomeRows(continueRow, [], promotedRows);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].hubIdentifier, 'home.continue');
});

test('restricted profile continue items are limited to allowed libraries', function () {
  var items = [
    { ratingKey: 'a', librarySectionID: '1', type: 'movie' },
    { ratingKey: 'b', librarySectionID: '2', type: 'episode' },
    { ratingKey: 'c', librarySectionID: '999', type: 'movie' },
    { ratingKey: 'd', type: 'movie' }
  ];
  var allowedLibraries = [{ id: '1' }, { id: '2' }];

  var scoped = filterItemsToAccessibleLibraries(items, allowedLibraries, true);

  assert.deepEqual(scoped.map(function (item) { return item.ratingKey; }), ['a', 'b']);
});

test('managed user gets On Deck row when scoped resumable items exist', function () {
  var scopedItems = filterItemsToAccessibleLibraries(
    [{ ratingKey: 'x-1', librarySectionID: '2', type: 'episode' }],
    [{ id: '2' }],
    true
  );
  var rows = composeHomeRows({
    title: 'On Deck',
    hubIdentifier: 'home.continue',
    items: scopedItems
  }, [], []);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'On Deck');
  assert.equal(rows[0].items.length, 1);
});

test('managed and admin flows both dedupe to one On Deck rail', function () {
  var promotedContinueRows = [
    {
      title: 'Continue Watching',
      hubIdentifier: 'home.continuewatching',
      items: [{ ratingKey: 'cw-2', type: 'movie' }]
    },
    {
      title: 'On Deck',
      hubIdentifier: 'home.ondeck',
      items: [{ ratingKey: 'od-1', type: 'movie' }]
    }
  ];

  var adminRows = composeHomeRows({
    title: 'On Deck',
    hubIdentifier: 'home.continue',
    items: [{ ratingKey: 'cw-1', type: 'episode' }]
  }, [], promotedContinueRows);
  var managedRows = composeHomeRows(null, [], promotedContinueRows);

  assert.equal(adminRows.filter(function (row) { return row.hubIdentifier === 'home.continue'; }).length, 1);
  assert.equal(managedRows.filter(function (row) { return row.hubIdentifier === 'home.continue'; }).length, 1);
});

test('composeHomeRows keeps one recently added TV rail per library', function () {
  var promotedRows = [
    {
      title: 'Recently Added in TV Shows',
      hubIdentifier: 'home.television.recent',
      key: '/hubs/home/recentlyAdded?type=2',
      type: 'show',
      items: [{ ratingKey: 'tv-a', librarySectionID: '2', type: 'episode' }]
    },
    {
      title: 'Recently Added TV',
      hubIdentifier: 'home.recentlyadded.tv',
      key: '/hubs/promoted/recentlyAdded',
      type: 'show',
      items: [{ ratingKey: 'tv-b', librarySectionID: '2', type: 'episode' }]
    },
    {
      title: 'Recently Added in Films',
      hubIdentifier: 'home.movies.recent',
      key: '/hubs/home/recentlyAdded?type=1',
      type: 'movie',
      items: [{ ratingKey: 'movie-a', librarySectionID: '1', type: 'movie' }]
    }
  ];

  var rows = composeHomeRows(null, [], promotedRows);
  var tvRecentRows = rows.filter(function (row) {
    return row.title.toLowerCase().indexOf('recently added') >= 0 &&
      row.items[0] &&
      row.items[0].librarySectionID === '2';
  });

  assert.equal(tvRecentRows.length, 1);
  assert.equal(rows.filter(function (row) { return /recently added/i.test(row.title); }).length, 2);
});

test('deferred dedupe drops duplicate TV recent when initial already rendered', function () {
  var initialRows = composeHomeRows(null, [
    {
      title: 'Recently Added in TV',
      hubIdentifier: 'home.section.2.recent',
      key: '/hubs/sections/2/recentlyAdded',
      type: 'show',
      items: [{ ratingKey: 'tv-initial', librarySectionID: '2', type: 'episode' }]
    }
  ], [
    {
      title: 'Trending',
      hubIdentifier: 'home.trending',
      items: [{ ratingKey: 'trend-1', type: 'movie' }]
    }
  ]);

  var deferredRows = composeHomeRows(null, [], [
    {
      title: 'Recently Added TV Shows',
      hubIdentifier: 'home.television.recent',
      key: '/hubs/home/recentlyAdded?type=2',
      type: 'show',
      items: [{ ratingKey: 'tv-deferred', type: 'episode' }]
    },
    {
      title: 'Recently Added in Films',
      hubIdentifier: 'home.movies.recent',
      key: '/hubs/home/recentlyAdded?type=1',
      type: 'movie',
      items: [{ ratingKey: 'movie-deferred', type: 'movie' }]
    }
  ]);

  var dedupedDeferred = dedupeDeferredRowsAgainstInitial(initialRows, deferredRows);
  var finalRows = initialRows.concat(dedupedDeferred);
  var finalRecentRows = finalRows.filter(function (row) {
    return /recently added/i.test(row.title || '');
  });
  var tvRecentRows = finalRecentRows.filter(function (row) {
    return row.type === 'show' || row.type === 'episode' || (row.items || []).some(function (item) {
      return item && (item.type === 'show' || item.type === 'episode' || item.type === 'season');
    });
  });
  var movieRecentRows = finalRecentRows.filter(function (row) {
    return row.type === 'movie' || (row.items || []).some(function (item) {
      return item && item.type === 'movie';
    });
  });

  assert.equal(tvRecentRows.length, 1);
  assert.equal(movieRecentRows.length, 1);
});

test('On Deck style path prefers compact series-poster rail', function () {
  var rows = composeHomeRows(null, [], [{
    title: 'Continue Watching',
    hubIdentifier: 'home.continuewatching',
    items: [{ ratingKey: 'cw-2', type: 'episode' }]
  }]);
  var row = rows[0];

  assert.equal(row.displayVariant, 'compact');
  assert.equal(row.preferSeriesPoster, true);
  assert.equal(rowPrefersSeriesPoster(row), true);
});
