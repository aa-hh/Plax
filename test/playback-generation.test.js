import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isStalePlaybackGeneration,
  createPlaybackGenerationCounter
} from '../src/playback/playbackGeneration.js';

test('isStalePlaybackGeneration is false for matching generation', function () {
  assert.equal(isStalePlaybackGeneration(2, 2), false);
});

test('isStalePlaybackGeneration is true after bump', function () {
  assert.equal(isStalePlaybackGeneration(1, 2), true);
});

test('createPlaybackGenerationCounter bump invalidates prior captures', function () {
  var counter = createPlaybackGenerationCounter();
  var gen = counter.bump();
  assert.equal(counter.isStale(gen), false);
  counter.bump();
  assert.equal(counter.isStale(gen), true);
  assert.equal(counter.current(), 2);
});
