import test from 'node:test';
import assert from 'node:assert/strict';

import { installMinimalDom, createElement } from './helpers/minimal-dom.js';
import {
  getFocusables,
  invalidateFocusableCache,
  isNavFocusable
} from '../src/ui/focus.js';

installMinimalDom();

function makeBtn(tabindex) {
  var el = createElement('button');
  el.setAttribute('tabindex', tabindex != null ? String(tabindex) : '0');
  return el;
}

function makeContainer() {
  var container = createElement('div');
  var btn1 = makeBtn(0);
  btn1.id = 'b1';
  var btn2 = makeBtn(0);
  btn2.id = 'b2';
  container.appendChild(btn1);
  container.appendChild(btn2);
  return container;
}

test('getFocusables returns same array reference on second call (cache hit)', function () {
  invalidateFocusableCache();
  var container = makeContainer();
  var first = getFocusables(container);
  var second = getFocusables(container);
  assert.strictEqual(first, second, 'second call should return cached array reference');
});

test('invalidateFocusableCache causes getFocusables to re-query', function () {
  invalidateFocusableCache();
  var container = makeContainer();
  var first = getFocusables(container);
  invalidateFocusableCache();
  var second = getFocusables(container);
  assert.notStrictEqual(first, second, 'after cache invalidation a new array should be returned');
  assert.equal(first.length, second.length, 'both arrays should contain the same number of focusables');
});

test('isNavFocusable excludes element with display:none inline style', function () {
  // Simulate getComputedStyle returning display:none for the element
  var el = createElement('div');
  el.setAttribute('tabindex', '0');

  // Install a getComputedStyle that reports display:none for this specific element
  var originalGetComputedStyle = globalThis.window && globalThis.window.getComputedStyle;
  globalThis.window = globalThis.window || {};
  globalThis.window.getComputedStyle = function (target) {
    if (target === el) {
      return { display: 'none', visibility: 'visible' };
    }
    return { display: 'block', visibility: 'visible' };
  };

  assert.equal(isNavFocusable(el), false, 'display:none element should not be focusable');

  // Restore
  if (originalGetComputedStyle) {
    globalThis.window.getComputedStyle = originalGetComputedStyle;
  } else {
    delete globalThis.window.getComputedStyle;
  }
});

test('isNavFocusable excludes element with visibility:hidden computed style', function () {
  var el = createElement('div');
  el.setAttribute('tabindex', '0');

  var originalGetComputedStyle = globalThis.window && globalThis.window.getComputedStyle;
  globalThis.window = globalThis.window || {};
  globalThis.window.getComputedStyle = function (target) {
    if (target === el) {
      return { display: 'block', visibility: 'hidden' };
    }
    return { display: 'block', visibility: 'visible' };
  };

  assert.equal(isNavFocusable(el), false, 'visibility:hidden element should not be focusable');

  if (originalGetComputedStyle) {
    globalThis.window.getComputedStyle = originalGetComputedStyle;
  } else {
    delete globalThis.window.getComputedStyle;
  }
});

test('isNavFocusable includes visible element', function () {
  var el = createElement('div');
  el.setAttribute('tabindex', '0');

  var originalGetComputedStyle = globalThis.window && globalThis.window.getComputedStyle;
  globalThis.window = globalThis.window || {};
  globalThis.window.getComputedStyle = function () {
    return { display: 'block', visibility: 'visible' };
  };

  assert.equal(isNavFocusable(el), true, 'visible element should be focusable');

  if (originalGetComputedStyle) {
    globalThis.window.getComputedStyle = originalGetComputedStyle;
  } else {
    delete globalThis.window.getComputedStyle;
  }
});

test('isNavFocusable excludes disabled element', function () {
  var el = createElement('button');
  el.disabled = true;
  el.setAttribute('tabindex', '0');
  assert.equal(isNavFocusable(el), false);
});

test('isNavFocusable excludes hidden element', function () {
  var el = createElement('button');
  el.hidden = true;
  el.setAttribute('tabindex', '0');
  assert.equal(isNavFocusable(el), false);
});

test('isNavFocusable excludes element with tabindex -1', function () {
  var el = createElement('div');
  el.setAttribute('tabindex', '-1');
  assert.equal(isNavFocusable(el), false);
});
