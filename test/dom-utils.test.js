import test from 'node:test';
import assert from 'node:assert/strict';
import { addOnceEventListener } from '../src/utils/domUtils.js';

test('addOnceEventListener fires handler exactly once when event fires multiple times', function () {
  var callCount = 0;
  var el = new EventTarget();

  addOnceEventListener(el, 'test', function () {
    callCount += 1;
  });

  el.dispatchEvent(new Event('test'));
  el.dispatchEvent(new Event('test'));

  assert.equal(callCount, 1);
});

test('addOnceEventListener handler is called with correct arguments', function () {
  var receivedEvent = null;
  var el = new EventTarget();

  addOnceEventListener(el, 'custom', function (e) {
    receivedEvent = e;
  });

  var evt = new Event('custom');
  el.dispatchEvent(evt);

  assert.equal(receivedEvent, evt);
});

test('addOnceEventListener returns wrapper that can be used to remove listener early', function () {
  var callCount = 0;
  var el = new EventTarget();

  var wrapper = addOnceEventListener(el, 'test', function () {
    callCount += 1;
  });

  el.removeEventListener('test', wrapper);
  el.dispatchEvent(new Event('test'));

  assert.equal(callCount, 0);
});

test('addOnceEventListener does not affect other listeners on the same event', function () {
  var count1 = 0;
  var count2 = 0;
  var el = new EventTarget();

  addOnceEventListener(el, 'test', function () { count1 += 1; });
  el.addEventListener('test', function () { count2 += 1; });

  el.dispatchEvent(new Event('test'));
  el.dispatchEvent(new Event('test'));

  assert.equal(count1, 1);
  assert.equal(count2, 2);
});
