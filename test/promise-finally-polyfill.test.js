import test from 'node:test';
import assert from 'node:assert/strict';
import { installPromiseFinallyPolyfill } from '../src/core/promiseFinallyPolyfill.js';

test('installPromiseFinallyPolyfill adds finally when missing', async function () {
  var saved = Promise.prototype.finally;
  delete Promise.prototype.finally;
  assert.equal(installPromiseFinallyPolyfill(), true);
  var cleaned = false;
  await Promise.resolve(1).finally(function () {
    cleaned = true;
  });
  assert.equal(cleaned, true);
  await assert.rejects(function () {
    return Promise.reject(new Error('fail')).finally(function () {});
  }, /fail/);
  if (saved) Promise.prototype.finally = saved;
  else delete Promise.prototype.finally;
});

test('installPromiseFinallyPolyfill is noop when finally exists', function () {
  assert.equal(installPromiseFinallyPolyfill(), false);
});
