import test from 'node:test';
import assert from 'node:assert/strict';

import { flushTimelineProgress } from '../src/playback/timelineFlush.js';

var session = {
  server: { connectionUri: 'http://127.0.0.1:32400' },
  item: { ratingKey: '42', duration: 120000 }
};

test('flushTimelineProgress uses explicit stopped state', async function () {
  var calls = [];
  await flushTimelineProgress({
    session: session,
    isPaused: false,
    explicitState: 'stopped',
    viewOffsetMs: 60000,
    durationMs: 120000,
    updateProgress: function (server, ratingKey, ms, state, duration, extra) {
      calls.push({ ratingKey: ratingKey, ms: ms, state: state, duration: duration });
      return Promise.resolve();
    }
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].state, 'stopped');
  assert.equal(calls[0].ms, 60000);
});

test('flushTimelineProgress defaults to paused when element paused', async function () {
  var calls = [];
  await flushTimelineProgress({
    session: session,
    isPaused: true,
    viewOffsetMs: 5000,
    durationMs: 120000,
    updateProgress: function (server, ratingKey, ms, state) {
      calls.push({ state: state, ms: ms });
      return Promise.resolve();
    }
  });
  assert.equal(calls[0].state, 'paused');
});

test('flushTimelineProgress rejects and invokes onFailure', async function () {
  var failures = 0;
  await assert.rejects(flushTimelineProgress({
    session: session,
    isPaused: false,
    explicitState: 'stopped',
    viewOffsetMs: 0,
    durationMs: 120000,
    updateProgress: function () {
      return Promise.reject(new Error('plex down'));
    },
    onFailure: function () {
      failures += 1;
    }
  }), /plex down/);
  assert.equal(failures, 1);
});

test('flushTimelineProgress no-ops without session', async function () {
  await flushTimelineProgress({
    session: null,
    updateProgress: function () {
      throw new Error('should not run');
    }
  });
});
