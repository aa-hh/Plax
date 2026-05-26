import test from 'node:test';
import assert from 'node:assert/strict';

import {
  timelineStateForPlayback,
  timelineStateForFlush
} from '../src/playback/timelineSyncState.js';

test('timelineStateForPlayback maps pause flag to Plex states', function () {
  assert.equal(timelineStateForPlayback(true), 'paused');
  assert.equal(timelineStateForPlayback(false), 'playing');
});

test('timelineStateForFlush prefers explicit state', function () {
  assert.equal(timelineStateForFlush(true, 'stopped'), 'stopped');
  assert.equal(timelineStateForFlush(false, null), 'playing');
  assert.equal(timelineStateForFlush(true, undefined), 'paused');
});
