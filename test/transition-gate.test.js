import test from 'node:test';
import assert from 'node:assert/strict';

import {
  beginTransition,
  extendTransition,
  endTransition,
  isTransitioning,
  onIdle
} from '../src/ui/transitionGate.js';

function wait(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

// Every test starts by force-closing any window left open by a previous
// test (endTransition drains synchron-ish via the trickle chain, but since
// nothing should be queued at suite boundaries this just resets state).
function reset() {
  endTransition();
}

test('extendTransition opens the gate when none is active', function () {
  reset();
  assert.equal(isTransitioning(), false);
  extendTransition(200);
  assert.equal(isTransitioning(), true);
});

test('extendTransition never shortens an existing longer window', function () {
  reset();
  beginTransition(500);
  var deadlineBefore = isTransitioning();
  assert.equal(deadlineBefore, true);
  // A short extend must not cut the existing 500ms window down to 10ms.
  extendTransition(10);
  return wait(50).then(function () {
    // Still well within the original 500ms window.
    assert.equal(isTransitioning(), true);
    reset();
  });
});

test('extendTransition does extend when the new deadline is later', function () {
  reset();
  beginTransition(50);
  extendTransition(300);
  return wait(100).then(function () {
    // Would have closed by now under the original 50ms window; the longer
    // extend should still be open.
    assert.equal(isTransitioning(), true);
    reset();
  });
});

test('onIdle runs synchronously when no transition is active', function () {
  reset();
  var ran = false;
  onIdle(function () { ran = true; });
  assert.equal(ran, true);
});

test('onIdle queues while transitioning and drains after the gate closes', function () {
  reset();
  beginTransition(20);
  var ran = false;
  onIdle(function () { ran = true; });
  assert.equal(ran, false); // still gated
  return wait(60).then(function () {
    assert.equal(ran, true); // safety timeout closed + drained it
  });
});

test('trickle drain runs one callback per paced tick, not all synchronously', function () {
  reset();
  beginTransition(10);
  var order = [];
  onIdle(function () { order.push('a'); assert.equal(order.length, 1); });
  onIdle(function () { order.push('b'); });
  onIdle(function () { order.push('c'); });
  // Immediately after the gate closes (endTransition), none should have run
  // synchronously in the same tick as the LAST one queued — drain is
  // scheduled via setTimeout(0), so right after endTransition() returns,
  // at most the first item may have run (drainStep is invoked synchronously
  // from flushIdleQueue, but subsequent items are chained via setTimeout).
  endTransition();
  assert.equal(order.length <= 1, true, 'no more than the first callback runs synchronously');
  // Drain ticks are DRAIN_TICK_MS (48ms) apart so decodes can't batch into
  // one raster frame — waits sized generously above 2 ticks.
  return wait(60).then(function () {
    assert.deepEqual(order.length >= 2, true);
    return wait(120);
  }).then(function () {
    assert.deepEqual(order, ['a', 'b', 'c']);
  });
});

test('re-opening the gate mid-drain pauses the chain until the next flush', function () {
  reset();
  beginTransition(10);
  var order = [];
  onIdle(function () {
    order.push(1);
    // Re-open the gate from inside a draining callback.
    extendTransition(50);
  });
  onIdle(function () { order.push(2); });
  onIdle(function () { order.push(3); });
  endTransition();
  return wait(20).then(function () {
    // The first callback ran and re-opened the gate; 2 and 3 must NOT have
    // run yet because the drain should have stopped.
    assert.deepEqual(order, [1]);
    assert.equal(isTransitioning(), true);
    // Let the re-opened window close on its own safety timeout and confirm
    // the remaining queue drains afterward (2 runs at flush, 3 one 48ms tick
    // later → needs ~50+48 from here; wait well past it).
    return wait(140);
  }).then(function () {
    assert.deepEqual(order, [1, 2, 3]);
  });
});

test('a throwing callback does not stop the rest of the drain', function () {
  reset();
  beginTransition(10);
  var order = [];
  onIdle(function () { order.push('x'); throw new Error('boom'); });
  onIdle(function () { order.push('y'); });
  endTransition();
  // 'x' runs at flush; 'y' one 48ms drain tick later.
  return wait(120).then(function () {
    assert.deepEqual(order, ['x', 'y']);
  });
});

test('endTransition is a no-op when nothing is active and nothing is queued', function () {
  reset();
  assert.equal(isTransitioning(), false);
  // Should not throw, should not leave anything dangling.
  endTransition();
  assert.equal(isTransitioning(), false);
});
