import test from 'node:test';
import assert from 'node:assert/strict';

import { createPlaybackRestartLock } from '../src/playback/playbackRestartLock.js';
import { isStalePlaybackGeneration } from '../src/playback/playbackGeneration.js';

function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

test('playback restart lock serializes overlapping restarts', async function () {
  var lock = createPlaybackRestartLock();
  var order = [];
  var p1 = lock.run(function () {
    order.push('a-start');
    return delay(25).then(function () {
      order.push('a-end');
    });
  });
  var p2 = lock.run(function () {
    order.push('b-start');
    order.push('b-end');
  });
  await Promise.all([p1, p2]);
  assert.deepEqual(order, ['a-start', 'a-end', 'b-start', 'b-end']);
});

test('playback restart lock continues after task rejection', async function () {
  var lock = createPlaybackRestartLock();
  var ran = false;
  await lock.run(function () {
    return Promise.reject(new Error('fail'));
  }).catch(function () {});
  await lock.run(function () {
    ran = true;
  });
  assert.equal(ran, true);
});

test('stale generation skips playUrl after overlapping restart bumps', async function () {
  var playbackGeneration = 0;
  var playUrlCalls = [];

  function bump() {
    playbackGeneration += 1;
    return playbackGeneration;
  }

  function tryPlayback(offset, gen) {
    return delay(15).then(function () {
      if (isStalePlaybackGeneration(gen, playbackGeneration)) return;
      playUrlCalls.push(offset);
    });
  }

  var gen1 = bump();
  var slow = tryPlayback(1000, gen1);
  bump();
  var gen2 = bump();
  var fast = tryPlayback(2000, gen2);
  await Promise.all([slow, fast]);
  assert.deepEqual(playUrlCalls, [2000]);
});
