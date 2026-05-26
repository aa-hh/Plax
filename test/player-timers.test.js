import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AUTOPLAY_COUNTDOWN_SEC,
  createAutoplayCountdown,
  shouldTriggerAutoplayOnCreditPrompt,
  shouldTriggerAutoplayOnEnded
} from '../src/playback/autoplayCountdown.js';
import { createRebufferWatchdog } from '../src/playback/rebufferWatchdog.js';
import { REBUFFER_TIMEOUT_MS } from '../src/playback/playerAdapter.js';

function fakeTimers() {
  var now = 0;
  var timers = [];
  return {
    now: function () { return now; },
    setInterval: function (fn, ms) {
      var id = timers.length + 1;
      timers.push({ id: id, fn: fn, ms: ms, at: now + ms, kind: 'interval' });
      return id;
    },
    clearInterval: function (id) {
      timers = timers.filter(function (t) { return t.id !== id; });
    },
    setTimeout: function (fn, ms) {
      var id = timers.length + 1;
      timers.push({ id: id, fn: fn, ms: ms, at: now + ms, kind: 'timeout' });
      return id;
    },
    clearTimeout: function (id) {
      timers = timers.filter(function (t) { return t.id !== id; });
    },
    tick: function (ms) {
      now += ms;
      var due = timers.filter(function (t) { return t.at <= now; });
      timers = timers.filter(function (t) { return t.at > now; });
      due.sort(function (a, b) { return a.at - b.at; });
      due.forEach(function (t) {
        t.fn();
        if (t.kind === 'interval') {
          timers.push({ id: timers.length + 1, fn: t.fn, ms: t.ms, at: now + t.ms, kind: 'interval' });
        }
      });
    }
  };
}

test('AUTOPLAY_COUNTDOWN_SEC is 5', function () {
  assert.equal(AUTOPLAY_COUNTDOWN_SEC, 5);
});

test('shouldTriggerAutoplayOnCreditPrompt when credits skip is active', function () {
  assert.equal(shouldTriggerAutoplayOnCreditPrompt({
    hasNextQueueItem: true,
    autoplayCancelled: false,
    hasCreditMarkers: true,
    skipPromptKind: 'credit'
  }), true);
  assert.equal(shouldTriggerAutoplayOnCreditPrompt({
    hasNextQueueItem: true,
    autoplayCancelled: false,
    hasCreditMarkers: true,
    skipPromptKind: 'intro'
  }), false);
  assert.equal(shouldTriggerAutoplayOnCreditPrompt({
    hasNextQueueItem: false,
    autoplayCancelled: false,
    hasCreditMarkers: true,
    skipPromptKind: 'credit'
  }), false);
});

test('shouldTriggerAutoplayOnEnded skips when credits countdown already started', function () {
  assert.equal(shouldTriggerAutoplayOnEnded({
    hasNextQueueItem: true,
    autoplayCancelled: false,
    hasCreditMarkers: true,
    creditsAutoplayTriggered: true
  }), false);
  assert.equal(shouldTriggerAutoplayOnEnded({
    hasNextQueueItem: true,
    autoplayCancelled: false,
    hasCreditMarkers: true,
    creditsAutoplayTriggered: false
  }), true);
  assert.equal(shouldTriggerAutoplayOnEnded({
    hasNextQueueItem: true,
    autoplayCancelled: false,
    hasCreditMarkers: false,
    creditsAutoplayTriggered: false
  }), true);
});

test('autoplay countdown: 5s wall time, ticks 5→1 then completes', function () {
  var clock = fakeTimers();
  var countdown = createAutoplayCountdown({
    setInterval: clock.setInterval.bind(clock),
    clearInterval: clock.clearInterval.bind(clock)
  });
  var ticks = [];
  var completed = 0;

  countdown.start(5, {
    onTick: function (remaining) { ticks.push(remaining); },
    onComplete: function () { completed += 1; }
  });

  assert.deepEqual(ticks, [5]);
  assert.equal(countdown.isRunning(), true);

  var i;
  for (i = 0; i < 4; i++) {
    clock.tick(1000);
  }
  assert.deepEqual(ticks, [5, 4, 3, 2, 1]);
  assert.equal(completed, 0);
  assert.equal(countdown.isRunning(), true);

  clock.tick(1000);
  assert.equal(completed, 1);
  assert.equal(countdown.isRunning(), false);
  assert.equal(countdown.getRemaining(), 0);
  assert.equal(clock.now(), 5000);
});

test('autoplay countdown: clear stops further ticks', function () {
  var clock = fakeTimers();
  var countdown = createAutoplayCountdown({
    setInterval: clock.setInterval.bind(clock),
    clearInterval: clock.clearInterval.bind(clock)
  });
  var completed = 0;
  countdown.start(5, { onComplete: function () { completed += 1; } });
  clock.tick(3000);
  countdown.clear();
  clock.tick(10000);
  assert.equal(completed, 0);
  assert.equal(countdown.isRunning(), false);
});

test('REBUFFER_TIMEOUT_MS is 12000', function () {
  assert.equal(REBUFFER_TIMEOUT_MS, 12000);
});

test('rebuffer watchdog: fires once after 12s while buffering', function () {
  var clock = fakeTimers();
  var fired = 0;
  var watchdog = createRebufferWatchdog({
    timeoutMs: 12000,
    onTimeout: function () { fired += 1; },
    setTimeout: clock.setTimeout.bind(clock),
    clearTimeout: clock.clearTimeout.bind(clock)
  });

  watchdog.notifyBuffering(true);
  clock.tick(11999);
  assert.equal(fired, 0);
  clock.tick(1);
  assert.equal(fired, 1);
  assert.equal(watchdog.hasFired(), true);

  clock.tick(12000);
  assert.equal(fired, 1);
});

test('rebuffer watchdog: buffer clear resets fired; can fire again', function () {
  var clock = fakeTimers();
  var fired = 0;
  var watchdog = createRebufferWatchdog({
    timeoutMs: 12000,
    onTimeout: function () { fired += 1; },
    setTimeout: clock.setTimeout.bind(clock),
    clearTimeout: clock.clearTimeout.bind(clock)
  });

  watchdog.notifyBuffering(true);
  clock.tick(12000);
  assert.equal(fired, 1);

  watchdog.notifyBuffering(false);
  assert.equal(watchdog.hasFired(), false);

  watchdog.notifyBuffering(true);
  clock.tick(12000);
  assert.equal(fired, 2);
});

test('rebuffer watchdog: resetEpisode clears timer without requiring buffer end', function () {
  var clock = fakeTimers();
  var fired = 0;
  var watchdog = createRebufferWatchdog({
    timeoutMs: 12000,
    onTimeout: function () { fired += 1; },
    setTimeout: clock.setTimeout.bind(clock),
    clearTimeout: clock.clearTimeout.bind(clock)
  });

  watchdog.notifyBuffering(true);
  watchdog.resetEpisode();
  clock.tick(12000);
  assert.equal(fired, 0);
});
