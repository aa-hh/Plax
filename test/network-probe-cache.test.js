import test from 'node:test';
import assert from 'node:assert/strict';

import { getState, setState } from '../src/core/store.js';
import {
  probeCacheKey,
  serverScopeKey,
  getCachedProbeResult,
  setCachedProbeResult,
  clearItemProbeCache,
  isCacheFresh,
  SESSION_TTL_MS,
  ITEM_PROBE_TTL_MS,
  ITEM_PROBE_CACHE_MAX,
  setPlaybackActive,
  startNetworkProbeIfNeeded
} from '../src/playback/networkProbe.js';

var serverA = { clientIdentifier: 'server-a', connectionUri: 'http://a.local:32400' };
var serverB = { clientIdentifier: 'server-b', connectionUri: 'http://b.local:32400' };

var probeDone = {
  status: 'done',
  measuredMbps: 42,
  testedAt: Date.now()
};

function resetProbeState() {
  clearItemProbeCache();
  setPlaybackActive(false);
  setState({ networkProbe: null });
}

test.afterEach(function () {
  resetProbeState();
});

test('probeCacheKey includes server scope, ratingKey, and versionId', function () {
  var scope = serverScopeKey(serverA);
  assert.equal(
    probeCacheKey(serverA, '12345', 'v1'),
    scope + ':12345:v1'
  );
  assert.equal(
    probeCacheKey(serverA, '12345', null),
    scope + ':12345:default'
  );
  assert.notEqual(
    probeCacheKey(serverA, '12345', 'v1'),
    probeCacheKey(serverA, '12345', 'v2')
  );
  assert.notEqual(
    probeCacheKey(serverA, '111', 'v1'),
    probeCacheKey(serverA, '222', 'v1')
  );
});

test('item probe cache stores and returns results per key', function () {
  setCachedProbeResult(serverA, 'rk1', 'v1', probeDone);
  assert.deepEqual(getCachedProbeResult(serverA, 'rk1', 'v1'), probeDone);
  assert.equal(getCachedProbeResult(serverA, 'rk1', 'v2'), null);
  assert.equal(getCachedProbeResult(serverA, 'rk2', 'v1'), null);
});

test('item probe cache entries expire after TTL', function () {
  setCachedProbeResult(serverA, 'rk-ttl', 'v1', probeDone);
  assert.ok(getCachedProbeResult(serverA, 'rk-ttl', 'v1'));

  var now = Date.now();
  var originalNow = Date.now;
  Date.now = function () { return now + ITEM_PROBE_TTL_MS + 1; };
  try {
    assert.equal(getCachedProbeResult(serverA, 'rk-ttl', 'v1'), null);
  } finally {
    Date.now = originalNow;
  }
});

test('item probe cache evicts LRU entry when over cap', function () {
  var i;
  for (i = 0; i < ITEM_PROBE_CACHE_MAX; i++) {
    setCachedProbeResult(serverA, 'rk-' + i, 'v1', { status: 'done', measuredMbps: i });
  }

  setCachedProbeResult(serverA, 'rk-new', 'v1', { status: 'done', measuredMbps: 99 });
  assert.equal(getCachedProbeResult(serverA, 'rk-0', 'v1'), null, 'oldest evicted');
  assert.ok(getCachedProbeResult(serverA, 'rk-31', 'v1'), 'newest-at-cap entry retained');
  assert.equal(getCachedProbeResult(serverA, 'rk-new', 'v1').measuredMbps, 99);
});

test('item probe cache touch refreshes LRU order', function () {
  var i;
  for (i = 0; i < ITEM_PROBE_CACHE_MAX; i++) {
    setCachedProbeResult(serverA, 'rk-' + i, 'v1', { status: 'done', measuredMbps: i });
  }
  assert.ok(getCachedProbeResult(serverA, 'rk-0', 'v1'));
  setCachedProbeResult(serverA, 'rk-overflow', 'v1', { status: 'done', measuredMbps: 100 });
  assert.ok(getCachedProbeResult(serverA, 'rk-0', 'v1'), 'touched entry survives eviction');
  assert.equal(getCachedProbeResult(serverA, 'rk-1', 'v1'), null);
});

test('server scope change clears item probe cache', function () {
  setCachedProbeResult(serverA, 'rk-scope', 'v1', probeDone);
  assert.ok(getCachedProbeResult(serverA, 'rk-scope', 'v1'));

  setCachedProbeResult(serverB, 'rk-scope', 'v1', { status: 'done', measuredMbps: 7 });
  assert.equal(getCachedProbeResult(serverB, 'rk-scope', 'v1').measuredMbps, 7);
  assert.equal(getCachedProbeResult(serverA, 'rk-scope', 'v1'), null);
});

test('isCacheFresh rejects missing or scope-mismatched cache', function () {
  assert.equal(isCacheFresh(null, serverA), false);
  assert.equal(isCacheFresh({}, serverA), false);
  assert.equal(isCacheFresh({
    status: 'done',
    testedAt: Date.now(),
    serverScope: serverScopeKey(serverB)
  }, serverA), false);
});

test('isCacheFresh treats testing and running as fresh', function () {
  var scope = serverScopeKey(serverA);
  assert.equal(isCacheFresh({ status: 'testing', serverScope: scope }, serverA), true);
  assert.equal(isCacheFresh({ status: 'running', serverScope: scope }, serverA), true);
});

test('isCacheFresh honors session TTL for done probes', function () {
  var scope = serverScopeKey(serverA);
  var fresh = {
    status: 'done',
    testedAt: Date.now(),
    serverScope: scope
  };
  assert.equal(isCacheFresh(fresh, serverA), true);

  var stale = {
    status: 'done',
    testedAt: Date.now() - SESSION_TTL_MS - 1,
    serverScope: scope
  };
  assert.equal(isCacheFresh(stale, serverA), false);
  assert.equal(isCacheFresh({ status: 'error', testedAt: Date.now(), serverScope: scope }, serverA), false);
  assert.equal(isCacheFresh({ status: 'done', serverScope: scope }, serverA), false);
});

test('startNetworkProbeIfNeeded returns fresh session cache without download', async function () {
  var scope = serverScopeKey(serverA);
  var sessionCache = {
    status: 'done',
    testedAt: Date.now(),
    serverScope: scope,
    mbps: 25
  };
  setState({ networkProbe: sessionCache });

  var result = await startNetworkProbeIfNeeded(serverA, { force: false });
  assert.equal(result, sessionCache);
});

test('startNetworkProbeIfNeeded defers to fresh cache during playback', async function () {
  var scope = serverScopeKey(serverA);
  var sessionCache = {
    status: 'testing',
    serverScope: scope,
    mbps: null
  };
  setState({ networkProbe: sessionCache });
  setPlaybackActive(true);

  var duringPlay = await startNetworkProbeIfNeeded(serverA, { force: false });
  assert.equal(duringPlay, sessionCache);
});

test('startNetworkProbeIfNeeded returns null during playback when cache stale', async function () {
  setState({
    networkProbe: {
      status: 'done',
      testedAt: Date.now() - SESSION_TTL_MS - 1000,
      serverScope: serverScopeKey(serverA)
    }
  });
  setPlaybackActive(true);

  var deferred = await startNetworkProbeIfNeeded(serverA, { force: false });
  assert.equal(deferred, null);
});
