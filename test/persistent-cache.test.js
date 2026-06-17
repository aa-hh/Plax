import test from 'node:test';
import assert from 'node:assert/strict';

import * as persistentCache from '../src/core/persistentCache.js';

// IndexedDB is not present in plain Node; the module should degrade to a
// silent no-op API.

test('isAvailable returns false when indexedDB is absent', function () {
  assert.equal(persistentCache.isAvailable(), false);
});

test('get returns undefined when persistence is unavailable', async function () {
  var v = await persistentCache.get('metadata', 'srv:nope');
  assert.equal(v, undefined);
});

test('set is a no-op that does not throw', async function () {
  await persistentCache.set('metadata', 'srv:foo', { v: 1 }, 1000);
  // No-throw is success. A follow-up get still returns undefined.
  var v = await persistentCache.get('metadata', 'srv:foo');
  assert.equal(v, undefined);
});

test('getBlob returns null without IDB', async function () {
  var b = await persistentCache.getBlob('http://example/poster.jpg');
  assert.equal(b, null);
});

test('putBlob is a no-op', async function () {
  // Pass a blob-shaped object — even when present, no IDB means no-op.
  await persistentCache.putBlob('http://example/p.jpg', { size: 100 });
});

test('clearAll resolves without IDB', async function () {
  await persistentCache.clearAll();
});

test('evictExpired resolves without IDB', async function () {
  await persistentCache.evictExpired();
});
