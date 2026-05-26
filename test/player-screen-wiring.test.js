import test from 'node:test';
import assert from 'node:assert/strict';

import { stopPlaybackForQueueAdvance } from '../src/playback/queueAdvance.js';
import {
  shouldScheduleOverlayHideWhenShowing,
  onPlaybackFirstFrame
} from '../src/ui/screens/playerOverlayFirstFrame.js';

test('stopPlaybackForQueueAdvance flushes stopped before skipTimeline stop', async function () {
  var order = [];
  await stopPlaybackForQueueAdvance({
    flushProgress: function (state) {
      order.push('flush:' + state);
      return Promise.resolve();
    },
    stop: function (opts) {
      order.push('stop:' + JSON.stringify(opts));
    }
  });
  assert.deepEqual(order, ['flush:stopped', 'stop:{"skipTimeline":true}']);
});

test('stopPlaybackForQueueAdvance still stops when flush rejects', async function () {
  var stopped = false;
  await stopPlaybackForQueueAdvance({
    flushProgress: function () {
      return Promise.reject(new Error('plex down'));
    },
    stop: function (opts) {
      stopped = true;
      assert.deepEqual(opts, { skipTimeline: true });
    }
  });
  assert.equal(stopped, true);
});

test('shouldScheduleOverlayHideWhenShowing is false before first frame', function () {
  assert.equal(shouldScheduleOverlayHideWhenShowing(false), false);
});

test('shouldScheduleOverlayHideWhenShowing is true after first frame', function () {
  assert.equal(shouldScheduleOverlayHideWhenShowing(true), true);
});

test('onPlaybackFirstFrame arms gate and requests hide once', function () {
  var result = onPlaybackFirstFrame(false);
  assert.deepEqual(result, { hideAfterFirstFrame: true, scheduleHide: true });
});

test('onPlaybackFirstFrame does not reschedule hide on later frames', function () {
  var result = onPlaybackFirstFrame(true);
  assert.deepEqual(result, { hideAfterFirstFrame: true, scheduleHide: false });
});
