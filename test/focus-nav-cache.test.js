/**
 * Cache and isNavFocusable tests for the geometric focus engine.
 *
 * getFocusables and invalidateFocusableCache are unchanged from the old engine;
 * cache-correctness tests are preserved. Tests that used removed exports have
 * been dropped; isNavFocusable computed-style tests are kept here because they
 * require a getComputedStyle stub (not appropriate for focus-nav.test.js).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { installMinimalDom, createElement, layout } from './helpers/minimal-dom.js';
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

// ---------------------------------------------------------------------------
// Cache hit / miss
// ---------------------------------------------------------------------------

test('getFocusables returns same array reference on second call (cache hit)', function () {
  invalidateFocusableCache();
  var container = makeContainer();
  var first  = getFocusables(container);
  var second = getFocusables(container);
  assert.strictEqual(first, second, 'second call should return cached array reference');
});

test('invalidateFocusableCache causes getFocusables to re-query', function () {
  invalidateFocusableCache();
  var container = makeContainer();
  var first = getFocusables(container);
  invalidateFocusableCache();
  var second = getFocusables(container);
  assert.notStrictEqual(first, second, 'after invalidation a new array should be returned');
  assert.equal(first.length, second.length, 'both arrays should contain the same number of focusables');
});

test('after invalidation getFocusables reflects newly added element', function () {
  invalidateFocusableCache();
  var container = makeContainer();
  var before = getFocusables(container).length;

  var extra = makeBtn(0);
  extra.id = 'b3';
  container.appendChild(extra);

  // Still cached — won't see the new element yet
  assert.equal(getFocusables(container).length, before);

  invalidateFocusableCache();
  var after = getFocusables(container).length;
  assert.equal(after, before + 1, 'fresh query should include the newly appended element');
});

test('getFocusables excludes elements whose tabindex is -1', function () {
  invalidateFocusableCache();
  var container = createElement('div');
  var visible = makeBtn(0);
  visible.id = 'visible';
  var excluded = makeBtn(-1);
  excluded.id = 'excluded';
  container.appendChild(visible);
  container.appendChild(excluded);

  var ids = getFocusables(container).map(function (el) { return el.id; });
  assert.ok(ids.indexOf('visible') >= 0, 'tabindex=0 element should be included');
  assert.equal(ids.indexOf('excluded'), -1, 'tabindex=-1 element should be excluded');
});

test('getFocusables excludes disabled button', function () {
  invalidateFocusableCache();
  var container = createElement('div');
  var active = makeBtn(0);
  active.id = 'active';
  var dead = createElement('button');
  dead.id = 'dead';
  dead.disabled = true;
  dead.setAttribute('tabindex', '0');
  container.appendChild(active);
  container.appendChild(dead);

  var ids = getFocusables(container).map(function (el) { return el.id; });
  assert.ok(ids.indexOf('active') >= 0);
  assert.equal(ids.indexOf('dead'), -1, 'disabled element should be excluded');
});

// ---------------------------------------------------------------------------
// isNavFocusable — computed-style checks (require getComputedStyle stub)
// ---------------------------------------------------------------------------

function withComputedStyle(styleMap, fn) {
  var original = globalThis.window && globalThis.window.getComputedStyle;
  globalThis.window = globalThis.window || {};
  globalThis.window.getComputedStyle = function (target) {
    return styleMap(target);
  };
  try { fn(); } finally {
    if (original) globalThis.window.getComputedStyle = original;
    else delete globalThis.window.getComputedStyle;
  }
}

test('isNavFocusable excludes element with display:none', function () {
  var el = createElement('div');
  el.setAttribute('tabindex', '0');
  withComputedStyle(function (target) {
    return target === el
      ? { display: 'none', visibility: 'visible' }
      : { display: 'block', visibility: 'visible' };
  }, function () {
    assert.equal(isNavFocusable(el), false);
  });
});

test('isNavFocusable excludes element with visibility:hidden', function () {
  var el = createElement('div');
  el.setAttribute('tabindex', '0');
  withComputedStyle(function (target) {
    return target === el
      ? { display: 'block', visibility: 'hidden' }
      : { display: 'block', visibility: 'visible' };
  }, function () {
    assert.equal(isNavFocusable(el), false);
  });
});

test('isNavFocusable includes a normally visible element', function () {
  var el = createElement('div');
  el.setAttribute('tabindex', '0');
  withComputedStyle(function () {
    return { display: 'block', visibility: 'visible' };
  }, function () {
    assert.equal(isNavFocusable(el), true);
  });
});

test('isNavFocusable excludes hidden element (hidden attribute)', function () {
  var el = createElement('button');
  el.hidden = true;
  el.setAttribute('tabindex', '0');
  assert.equal(isNavFocusable(el), false);
});

test('isNavFocusable excludes element with zero dimensions', function () {
  var el = createElement('button');
  el.setAttribute('tabindex', '0');
  layout(el, 0, 0, 0, 0);
  assert.equal(isNavFocusable(el), false);
});
