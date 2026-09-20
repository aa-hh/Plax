import test from 'node:test';
import assert from 'node:assert/strict';

import {
  friendlyLoadError,
  seasonTabLabel,
  episodeCountLabel
} from '../src/ui/screens/detailScreen.js';

test('friendlyLoadError names the problem and the recovery per status', function () {
  assert.equal(friendlyLoadError({ status: 403 }, 'refresh'),
    'Not allowed to refresh. Your account may not have permission.');
  assert.equal(friendlyLoadError({ status: 401 }, 'load this title'),
    'Sign-in expired. Sign in again to load this title.');
  assert.equal(friendlyLoadError({ status: 404 }, 'load this title'),
    'This title is no longer on the server.');
  assert.equal(friendlyLoadError({ status: 503 }, 'load the seasons'),
    'Server unreachable. Try again in a moment.');
  assert.equal(friendlyLoadError(new Error('Request timeout after 8000ms'), 'mark as watched'),
    'The server took too long to respond. Try again.');
});

test('friendlyLoadError never leaks a raw message or a bare "Error"', function () {
  assert.equal(friendlyLoadError(new Error('TypeError: Failed to fetch'), 'load this title'),
    'Could not load this title. Check the server connection and try again.');
  assert.equal(friendlyLoadError(null, 'load the episodes'),
    'Could not load the episodes. Check the server connection and try again.');
  assert.equal(friendlyLoadError(undefined),
    'Could not load. Check the server connection and try again.');
});

test('seasonTabLabel: positive index → "Season N", specials keep their title', function () {
  assert.equal(seasonTabLabel({ index: 3, title: 'Season 3' }), 'Season 3');
  assert.equal(seasonTabLabel({ index: '12' }), 'Season 12');
  assert.equal(seasonTabLabel({ index: 0, title: 'Specials' }), 'Specials');
  assert.equal(seasonTabLabel({ title: '第一季' }), '第一季');
  assert.equal(seasonTabLabel({}), 'Season');
  assert.equal(seasonTabLabel(null), 'Season');
});

test('episodeCountLabel pluralises', function () {
  assert.equal(episodeCountLabel(1), '1 episode');
  assert.equal(episodeCountLabel(2), '2 episodes');
  assert.equal(episodeCountLabel('200'), '200 episodes');
  assert.equal(episodeCountLabel(undefined), '0 episodes');
});
