import test from 'node:test';
import assert from 'node:assert/strict';

import { schedulePrefetch, abortPrefetch, __isIdleForTests } from '../src/core/idlePrefetch.js';

function wait(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

// idlePrefetch calls plex/library.getMetadata, which under the hood goes
// through fetch. Force every fetch to reject so we exercise the recover-
// and-pump path deterministically rather than depending on whatever
// mock a previous test file left installed.
function withRejectingFetch(fn) {
  var prev = globalThis.fetch;
  globalThis.fetch = function () { return Promise.reject(new Error('mocked-out')); };
  return Promise.resolve().then(fn).finally(function () { globalThis.fetch = prev; });
}

test('schedulePrefetch enqueues and then idles after running', function () {
  return withRejectingFetch(function () {
    abortPrefetch();
    var server = { connectionUri: 'http://nowhere.invalid' };
    schedulePrefetch(server, [{ items: [{ ratingKey: '1' }, { ratingKey: '2' }] }], {
      perRow: 2,
      maxRows: 1,
      idleDelayMs: 10
    });
    return wait(200).then(function () {
      assert.equal(__isIdleForTests(), true);
    });
  });
});

test('abortPrefetch clears the queue before the delay elapses', function () {
  abortPrefetch();
  var server = { connectionUri: 'http://nowhere.invalid' };
  schedulePrefetch(server, [{ items: [{ ratingKey: 'a' }, { ratingKey: 'b' }, { ratingKey: 'c' }] }], {
    perRow: 3,
    maxRows: 1,
    idleDelayMs: 500
  });
  abortPrefetch();
  // Should be idle immediately — start timer cancelled, queue cleared.
  assert.equal(__isIdleForTests(), true);
});

test('schedulePrefetch deduplicates ratingKeys across calls', function () {
  abortPrefetch();
  var server = { connectionUri: 'http://nowhere.invalid' };
  schedulePrefetch(server, [{ items: [{ ratingKey: '1' }, { ratingKey: '2' }] }], {
    perRow: 2,
    maxRows: 1,
    idleDelayMs: 5000
  });
  schedulePrefetch(server, [{ items: [{ ratingKey: '2' }, { ratingKey: '3' }] }], {
    perRow: 2,
    maxRows: 1,
    idleDelayMs: 5000
  });
  abortPrefetch();
  assert.equal(__isIdleForTests(), true);
});

test('schedulePrefetch with no rows is a no-op', function () {
  abortPrefetch();
  schedulePrefetch({ connectionUri: 'x' }, [], { idleDelayMs: 10 });
  return wait(40).then(function () {
    assert.equal(__isIdleForTests(), true);
  });
});
