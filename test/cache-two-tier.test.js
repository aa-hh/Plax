import test from 'node:test';
import assert from 'node:assert/strict';

import {
  remember,
  rememberSWR,
  invalidate,
  invalidateAll,
  setPersistentImpl
} from '../src/core/cache.js';

function makeFakePersistent() {
  var store = Object.create(null);
  var setCount = 0;
  var getCount = 0;
  return {
    get: function (ns, key) {
      getCount += 1;
      return Promise.resolve(store[ns + ':' + key]);
    },
    set: function (ns, key, value) {
      setCount += 1;
      store[ns + ':' + key] = value;
    },
    clearAll: function () { store = Object.create(null); },
    isAvailable: function () { return true; },
    __counts: function () { return { setCount: setCount, getCount: getCount }; },
    __store: function () { return store; }
  };
}

test('remember returns disk value when memory misses but disk hits', async function () {
  invalidateAll();
  var fake = makeFakePersistent();
  fake.set('metadata', 'srv:1', { ratingKey: '1', cached: true });
  setPersistentImpl(fake);

  var value = await remember('metadata', 'srv:1', function () {
    return Promise.resolve({ ratingKey: '1', fresh: true });
  });
  // The returned value is the disk one — even if a SWR refresh runs in the
  // background, the caller gets the cached bytes synchronously.
  assert.equal(value.cached, true);
  assert.equal(value.fresh, undefined);
  setPersistentImpl(null);
});

test('remember runs loader and persists on memory + disk miss', async function () {
  invalidateAll();
  var fake = makeFakePersistent();
  setPersistentImpl(fake);

  var loaderCalls = 0;
  var value = await remember('metadata', 'srv:2', function () {
    loaderCalls += 1;
    return Promise.resolve({ ratingKey: '2', fresh: true });
  });
  assert.equal(loaderCalls, 1);
  assert.equal(value.ratingKey, '2');
  // Persisted to disk for next session.
  var counts = fake.__counts();
  assert.equal(counts.setCount, 1, 'fresh value should be written to disk');
  setPersistentImpl(null);
});

test('search namespace is not persisted', async function () {
  invalidateAll();
  var fake = makeFakePersistent();
  setPersistentImpl(fake);

  await remember('search', 'srv:q', function () {
    return Promise.resolve({ hits: [] });
  });
  assert.equal(fake.__counts().setCount, 0, 'search namespace must skip persistence');
  setPersistentImpl(null);
});

test('rememberSWR consults disk on first lookup of a key', async function () {
  invalidateAll();
  var fake = makeFakePersistent();
  fake.set('hubs', 'srv:home', { rows: [{ id: 'r1' }] });
  setPersistentImpl(fake);

  var value = await rememberSWR('hubs', 'srv:home', function () {
    return Promise.resolve({ rows: [{ id: 'r1', fresh: true }] });
  });
  assert.deepEqual(value.rows, [{ id: 'r1' }]);
  setPersistentImpl(null);
});

test('invalidateAll wipes persistent store', async function () {
  invalidateAll();
  var fake = makeFakePersistent();
  fake.set('metadata', 'srv:x', { v: 1 });
  setPersistentImpl(fake);
  invalidateAll();
  assert.deepEqual(Object.keys(fake.__store()), []);
  setPersistentImpl(null);
});
