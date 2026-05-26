import test from 'node:test';
import assert from 'node:assert/strict';

import { installMinimalDom, createElement } from './helpers/minimal-dom.js';

installMinimalDom();

var session = {
  server: { connectionUri: 'http://127.0.0.1:32400' },
  item: { ratingKey: '99', duration: 120000 }
};

var progressCalls = [];
var playerModule;

function mockProgressApi() {
  progressCalls = [];
  playerModule.setProgressApiForTest({
    updateProgress: function (server, ratingKey, ms, state, duration, extra) {
      progressCalls.push({
        ratingKey: ratingKey,
        ms: ms,
        state: state,
        duration: duration,
        extra: extra || {}
      });
      return Promise.resolve();
    },
    markWatched: function () {
      return Promise.resolve();
    }
  });
}

function playingCalls() {
  return progressCalls.filter(function (c) { return c.state === 'playing'; });
}

function fakeTimers() {
  var now = 0;
  var timers = [];
  return {
    setTimeout: function (fn, ms) {
      var id = timers.length + 1;
      timers.push({ id: id, fn: fn, at: now + ms });
      return id;
    },
    clearTimeout: function (id) {
      timers = timers.filter(function (t) { return t.id !== id; });
    },
    tick: function (ms) {
      now += ms;
      var due = timers.filter(function (t) { return t.at <= now; });
      timers = timers.filter(function (t) { return t.at > now; });
      due.forEach(function (t) { t.fn(); });
    }
  };
}

async function loadPlayer() {
  playerModule = await import('../src/playback/playerAdapter.js');
  return playerModule;
}

function setupVideo(overrides) {
  overrides = overrides || {};
  var video = createElement('video');
  video.id = 'native-player';
  video.duration = overrides.duration != null ? overrides.duration : 120;
  video.readyState = overrides.readyState != null ? overrides.readyState : 1;
  video.currentTime = overrides.currentTime != null ? overrides.currentTime : 0;
  video.paused = overrides.paused != null ? overrides.paused : true;
  document.body.children.length = 0;
  document.body.appendChild(video);
  if (document.registerPlayer) document.registerPlayer(video);
  return video;
}

test.beforeEach(async function () {
  setupVideo();
  await loadPlayer();
  mockProgressApi();
  playerModule.init();
  playerModule.clearListeners();
});

test.afterEach(function () {
  if (playerModule) {
    playerModule.stop({ skipTimeline: true });
    playerModule.clearListeners();
    playerModule.setProgressApiForTest(null);
    playerModule.setRebufferTimersForTest(null);
  }
});

test('play defers first playing timeline until playing event', async function () {
  var video = playerModule.getVideoElement();
  video.currentTime = 0;
  playerModule.play('http://127.0.0.1/video.mkv', session);

  assert.equal(playingCalls().length, 0);

  video.dispatchEvent('playing');
  await new Promise(function (resolve) { setImmediate(resolve); });

  assert.equal(playingCalls().length, 1);
  assert.equal(playingCalls()[0].ratingKey, '99');
});

test('timeupdate at zero does not sync playing before progress', async function () {
  var video = playerModule.getVideoElement();
  playerModule.play('http://127.0.0.1/video.mkv', session);

  video.currentTime = 0;
  video.dispatchEvent('timeupdate');
  await new Promise(function (resolve) { setImmediate(resolve); });

  assert.equal(playingCalls().length, 0);
});

test('timeupdate with currentTime > 0 syncs initial playing timeline', async function () {
  var video = playerModule.getVideoElement();
  playerModule.play('http://127.0.0.1/video.mkv', session);

  video.currentTime = 5;
  video.dispatchEvent('timeupdate');
  await new Promise(function (resolve) { setImmediate(resolve); });

  assert.equal(playingCalls().length, 1);
  assert.equal(playingCalls()[0].ms, 5000);
});

test('stop teardown order clears src before load and nulls session', async function () {
  var video = playerModule.getVideoElement();
  var order = [];
  var origRemove = video.removeAttribute.bind(video);
  var origLoad = video.load.bind(video);
  video.removeAttribute = function (name) {
    order.push('removeAttribute:' + name);
    return origRemove(name);
  };
  video.load = function () {
    order.push('load');
    return origLoad();
  };

  playerModule.play('http://127.0.0.1/video.mkv', session);
  video.currentTime = 30;
  playerModule.stop();

  assert.deepEqual(order, ['removeAttribute:src', 'load']);
  assert.equal(video.src, '');
  assert.ok(video.classList.contains('hidden'));

  progressCalls.length = 0;
  await playerModule.flushProgress('stopped');
  assert.equal(progressCalls.length, 0);
});

test('stop sends stopped timeline when session present', async function () {
  playerModule.play('http://127.0.0.1/video.mkv', session);
  playerModule.getVideoElement().currentTime = 45;
  progressCalls.length = 0;

  playerModule.stop();
  await new Promise(function (resolve) { setImmediate(resolve); });

  var stopped = progressCalls.filter(function (c) { return c.state === 'stopped'; });
  assert.equal(stopped.length, 1);
  assert.equal(stopped[0].ms, 45000);
});

test('flushProgress integrates timeline flush with injectable updateProgress', async function () {
  playerModule.play('http://127.0.0.1/video.mkv', session);
  var video = playerModule.getVideoElement();
  video.currentTime = 60;
  progressCalls.length = 0;

  await playerModule.flushProgress('stopped');

  assert.equal(progressCalls.length, 1);
  assert.equal(progressCalls[0].state, 'stopped');
  assert.equal(progressCalls[0].ms, 60000);
});

test('rebufferFired resets when buffering clears; watchdog fires onRebufferTimeout', function () {
  var clock = fakeTimers();
  playerModule.setRebufferTimersForTest(clock);

  var timeouts = 0;
  playerModule.onRebufferTimeout(function () {
    timeouts += 1;
  });

  playerModule.play('http://127.0.0.1/video.mkv', session);
  var video = playerModule.getVideoElement();

  clock.tick(playerModule.REBUFFER_TIMEOUT_MS);
  assert.equal(timeouts, 1);

  clock.tick(playerModule.REBUFFER_TIMEOUT_MS);
  assert.equal(timeouts, 1);

  video.dispatchEvent('playing');
  video.dispatchEvent('waiting');
  clock.tick(playerModule.REBUFFER_TIMEOUT_MS);
  assert.equal(timeouts, 2);
});

test('rebuffer watchdog does not fire when buffering cleared before timeout', function () {
  var clock = fakeTimers();
  playerModule.setRebufferTimersForTest(clock);

  var timeouts = 0;
  playerModule.onRebufferTimeout(function () {
    timeouts += 1;
  });

  playerModule.play('http://127.0.0.1/video.mkv', session);
  var video = playerModule.getVideoElement();

  video.dispatchEvent('canplay');
  clock.tick(playerModule.REBUFFER_TIMEOUT_MS);
  assert.equal(timeouts, 0);
});

test('seek replaces pending loadedmetadata listener (no stack)', function () {
  var video = setupVideo({ readyState: 0, duration: 0 });
  playerModule.init();

  playerModule.play('http://127.0.0.1/video.mkv', session);
  playerModule.seek(10);
  assert.equal(video.getListenerCount('loadedmetadata'), 1);

  playerModule.seek(20);
  assert.equal(video.getListenerCount('loadedmetadata'), 1);

  video.readyState = 1;
  video.duration = 120;
  video.dispatchEvent('loadedmetadata');
  assert.equal(Math.floor(video.currentTime), 20);
});

test('getCurrentTimeMs retains position after stop teardown', function () {
  var video = setupVideo({ currentTime: 42.5 });
  playerModule.init();
  playerModule.play('http://127.0.0.1/video.mkv', session, { offset: 0 });
  assert.equal(playerModule.getCurrentTimeMs(), 42500);
  playerModule.stop({ skipTimeline: true });
  assert.equal(playerModule.getCurrentTimeMs(), 42500);
});

test('scrobble resets after seek back below threshold', async function () {
  var markCount = 0;
  playerModule.setProgressApiForTest({
    updateProgress: function () {
      return Promise.resolve();
    },
    markWatched: function () {
      markCount += 1;
      return Promise.resolve();
    }
  });

  var video = setupVideo({ currentTime: 93, duration: 100, paused: false });
  playerModule.init();
  playerModule.play('http://127.0.0.1/video.mkv', session);

  await playerModule.flushProgress('playing');
  assert.equal(markCount, 1);

  video.currentTime = 50;
  await playerModule.flushProgress('playing');
  assert.equal(markCount, 1);

  video.currentTime = 94;
  await playerModule.flushProgress('playing');
  assert.equal(markCount, 2);
});

test('stop cancels pending seek listener', function () {
  var video = setupVideo({ readyState: 0, duration: 0 });
  playerModule.init();

  playerModule.play('http://127.0.0.1/video.mkv', session);
  playerModule.seek(15);
  assert.equal(video.getListenerCount('loadedmetadata'), 1);

  playerModule.stop({ skipTimeline: true });
  assert.equal(video.getListenerCount('loadedmetadata'), 0);
});
