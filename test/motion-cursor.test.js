import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createMotionCursorTracker,
  SHOW_AFTER_MS,
  HIDE_AFTER_MS,
  MOTION_GAP_MS
} from '../src/platform/motionCursorState.js';
import { isSignificantSensorMotion } from '../src/platform/motionCursor.js';

test('motion cursor constants', function () {
  assert.equal(SHOW_AFTER_MS, 3000);
  assert.equal(HIDE_AFTER_MS, 3000);
  assert.equal(MOTION_GAP_MS, 250);
});

test('shows after 3s sustained motion', function () {
  var shows = 0;
  var tracker = createMotionCursorTracker({
    showAfterMs: 3000,
    hideAfterMs: 3000,
    motionGapMs: 250,
    onShow: function () { shows += 1; }
  });
  var t = 0;
  while (t < 2999) {
    tracker.onMotion(t);
    t += 100;
  }
  assert.equal(shows, 0);
  tracker.onMotion(3000);
  assert.equal(shows, 1);
  assert.equal(tracker.isVisible(), true);
});

test('brief motion burst does not show cursor', function () {
  var shows = 0;
  var tracker = createMotionCursorTracker({
    onShow: function () { shows += 1; }
  });
  tracker.onMotion(0);
  tracker.onMotion(500);
  tracker.tick(600);
  tracker.tick(3500);
  assert.equal(shows, 0);
});

test('hides after 3s idle once visible', function () {
  var hides = 0;
  var tracker = createMotionCursorTracker({
    onShow: function () {},
    onHide: function () { hides += 1; }
  });
  var t = 0;
  while (t <= 3000) {
    tracker.onMotion(t);
    t += 100;
  }
  assert.equal(tracker.isVisible(), true);
  tracker.tick(6000);
  assert.equal(hides, 1);
  assert.equal(tracker.isVisible(), false);
});

test('motion gap resets sustained-motion streak', function () {
  var shows = 0;
  var tracker = createMotionCursorTracker({
    onShow: function () { shows += 1; }
  });
  tracker.onMotion(0);
  tracker.onMotion(2000);
  tracker.tick(2500);
  tracker.onMotion(2600);
  tracker.tick(5100);
  assert.equal(shows, 0);
});

test('isSignificantSensorMotion ignores idle gyro noise', function () {
  assert.equal(isSignificantSensorMotion({
    gyroscope: { x: 0.01, y: 0.02, z: 0.01 }
  }), false);
  assert.equal(isSignificantSensorMotion({
    gyroscope: { x: 0.2, y: 0.15, z: 0.1 }
  }), true);
  assert.equal(isSignificantSensorMotion({
    linearAcceleration: { x: 0.1, y: 0.1, z: 0.1 }
  }), false);
  assert.equal(isSignificantSensorMotion({
    linearAcceleration: { x: 1.2, y: 0.5, z: 0.3 }
  }), true);
});
