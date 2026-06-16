import test from 'node:test';
import assert from 'node:assert/strict';
import {
  installAbortControllerPolyfill,
  isAbortControllerPolyfilled
} from '../src/core/abortControllerPolyfill.js';

test('installAbortControllerPolyfill adds AbortController when missing', function () {
  var savedController = globalThis.AbortController;
  var savedSignal = globalThis.AbortSignal;
  delete globalThis.AbortController;
  delete globalThis.AbortSignal;

  assert.equal(installAbortControllerPolyfill(), true);
  assert.equal(isAbortControllerPolyfilled(), true);
  assert.equal(typeof globalThis.AbortController, 'function');
  assert.equal(typeof globalThis.AbortSignal, 'function');

  var controller = new globalThis.AbortController();
  assert.equal(controller.signal.aborted, false);

  var aborted = false;
  controller.signal.addEventListener('abort', function () {
    aborted = true;
  });
  controller.abort();
  assert.equal(controller.signal.aborted, true);
  assert.equal(aborted, true);

  if (savedController) globalThis.AbortController = savedController;
  else delete globalThis.AbortController;
  if (savedSignal) globalThis.AbortSignal = savedSignal;
  else delete globalThis.AbortSignal;
});

test('installAbortControllerPolyfill is noop when AbortController exists', function () {
  assert.equal(installAbortControllerPolyfill(), false);
});
