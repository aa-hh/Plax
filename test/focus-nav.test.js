/**
 * Behavioral tests for the geometric D-pad navigation engine.
 *
 * All navigation tests use layout() to position elements so the spatial
 * scoring in spatialMove() has real geometry to work with.
 *
 * Old structural helpers (isSidebarZone, isAtLeftEdge, getZones,
 * zoneColumnCount, tryColumnarMove, isDescendantOfAny) no longer exist.
 * Tests are expressed as "press a key, check which element gains focus."
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { installMinimalDom, createElement, layout } from './helpers/minimal-dom.js';
import {
  handleKeyNav,
  getFocusables,
  isNavFocusable,
  restoreFocus,
  spatialMove
} from '../src/ui/focus.js';

var ARROW_RIGHT = 39;
var ARROW_LEFT  = 37;
var ARROW_DOWN  = 40;
var ARROW_UP    = 38;

function keyEvent(code) {
  return { keyCode: code, preventDefault: function () {} };
}

function btn(id, x, y, w, h) {
  var el = createElement('button');
  el.id = id;
  el.setAttribute('tabindex', '0');
  layout(el, x, y, w !== undefined ? w : 100, h !== undefined ? h : 40);
  return el;
}

// ---------------------------------------------------------------------------
// isNavFocusable — basic unit tests
// ---------------------------------------------------------------------------

test('isNavFocusable includes a standard visible button', function () {
  installMinimalDom();
  var el = createElement('button');
  el.setAttribute('tabindex', '0');
  // default __rect is 100×40 so offsetWidth/Height > 0
  assert.equal(isNavFocusable(el), true);
});

test('isNavFocusable excludes disabled element', function () {
  installMinimalDom();
  var el = createElement('button');
  el.disabled = true;
  el.setAttribute('tabindex', '0');
  assert.equal(isNavFocusable(el), false);
});

test('isNavFocusable excludes tabindex -1', function () {
  installMinimalDom();
  var el = createElement('button');
  el.setAttribute('tabindex', '-1');
  assert.equal(isNavFocusable(el), false);
});

test('isNavFocusable excludes zero-dimension element', function () {
  installMinimalDom();
  var el = createElement('button');
  el.setAttribute('tabindex', '0');
  layout(el, 0, 0, 0, 0);
  assert.equal(isNavFocusable(el), false);
});

// ---------------------------------------------------------------------------
// Sidebar-to-main transition (replaces isSidebarZone/isAtLeftEdge tests)
//
//  sidebar-item  (x=0,   y=100, w=200, h=40)
//  main-item     (x=220, y=100, w=200, h=40)
//
// Pressing RIGHT from the sidebar item should land on the main item.
// ---------------------------------------------------------------------------

test('RIGHT from sidebar item (x=0) moves focus to main item (x=220)', function () {
  installMinimalDom();
  var screen = createElement('div');
  screen.className = 'screen';

  var sidebar = btn('sidebar-item', 0,   100, 200, 40);
  var main    = btn('main-item',    220, 100, 200, 40);
  screen.appendChild(sidebar);
  screen.appendChild(main);
  document.registerTree(screen);

  sidebar.focus();
  var handled = handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  assert.equal(handled, true);
  assert.equal(document.activeElement.id, 'main-item');
});

test('LEFT from item at x=0 finds nothing and returns false', function () {
  installMinimalDom();
  var screen = createElement('div');
  screen.className = 'screen';

  var only = btn('only', 0, 100, 200, 40);
  // Another item to the right should not be reachable going left
  var right = btn('right', 220, 100, 200, 40);
  screen.appendChild(only);
  screen.appendChild(right);
  document.registerTree(screen);

  only.focus();
  var handled = handleKeyNav(screen, keyEvent(ARROW_LEFT));
  assert.equal(handled, false);
  assert.equal(document.activeElement.id, 'only');
});

// ---------------------------------------------------------------------------
// Grid navigation (replaces zoneColumnCount / tryColumnarMove / getZones tests)
//
//  3-column grid, each cell 100×80, 10px gaps:
//
//    [0,0]  [110,0]  [220,0]    row 0
//    [0,90] [110,90] [220,90]   row 1
//    [0,180][110,180][220,180]  row 2
// ---------------------------------------------------------------------------

function makeGrid(screen) {
  var ids = [];
  for (var row = 0; row < 3; row++) {
    for (var col = 0; col < 3; col++) {
      var id = 'c' + row + col;
      ids.push(id);
      var el = btn(id, col * 110, row * 90, 100, 80);
      screen.appendChild(el);
    }
  }
  return ids;
}

test('DOWN in grid moves to item directly below (same column)', function () {
  installMinimalDom();
  var screen = createElement('div');
  screen.className = 'screen';
  makeGrid(screen);
  document.registerTree(screen);

  // c01 = row0 col1 → down should reach c11 (row1 col1)
  screen.querySelector('#c01').focus();
  var handled = handleKeyNav(screen, keyEvent(ARROW_DOWN));
  assert.equal(handled, true);
  assert.equal(document.activeElement.id, 'c11');
});

test('DOWN from bottom row returns false (no item below)', function () {
  installMinimalDom();
  var screen = createElement('div');
  screen.className = 'screen';
  makeGrid(screen);
  document.registerTree(screen);

  screen.querySelector('#c21').focus();
  var handled = handleKeyNav(screen, keyEvent(ARROW_DOWN));
  assert.equal(handled, false);
});

test('RIGHT in grid moves across the row', function () {
  installMinimalDom();
  var screen = createElement('div');
  screen.className = 'screen';
  makeGrid(screen);
  document.registerTree(screen);

  screen.querySelector('#c10').focus();
  var handled = handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  assert.equal(handled, true);
  assert.equal(document.activeElement.id, 'c11');
});

test('UP in grid moves to item directly above (same column)', function () {
  installMinimalDom();
  var screen = createElement('div');
  screen.className = 'screen';
  makeGrid(screen);
  document.registerTree(screen);

  screen.querySelector('#c11').focus();
  var handled = handleKeyNav(screen, keyEvent(ARROW_UP));
  assert.equal(handled, true);
  assert.equal(document.activeElement.id, 'c01');
});

// ---------------------------------------------------------------------------
// Scoring: aligned neighbour wins over diagonal
//
//  active  (0,   0,   50, 40)
//  aligned (60,  5,   50, 30)   centre-Y ≈ 20, strongly overlapping
//  drift   (60,  80,  50, 40)   no cross-axis overlap with active
//
// RIGHT should land on aligned, not drift.
// ---------------------------------------------------------------------------

test('RIGHT prefers aligned neighbour over drifted candidate', function () {
  installMinimalDom();
  var screen = createElement('div');
  screen.className = 'screen';

  var active  = btn('active',  0,  0,  50, 40);
  var aligned = btn('aligned', 60, 5,  50, 30);
  var drift   = btn('drift',   60, 80, 50, 40);
  screen.appendChild(active);
  screen.appendChild(aligned);
  screen.appendChild(drift);
  document.registerTree(screen);

  active.focus();
  handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  assert.equal(document.activeElement.id, 'aligned');
});

// ---------------------------------------------------------------------------
// restoreFocus watchdog tests
// ---------------------------------------------------------------------------

test('restoreFocus restores lastFocused when still connected', function () {
  installMinimalDom();
  var screen = createElement('div');
  screen.className = 'screen';

  var a = btn('a', 0,   0, 100, 40);
  var b = btn('b', 0, 100, 100, 40);
  screen.appendChild(a);
  screen.appendChild(b);
  document.registerTree(screen);

  // Simulate losing focus to body
  document.activeElement = document.body;

  restoreFocus(screen, a, a.getBoundingClientRect());
  assert.equal(document.activeElement.id, 'a');
});

test('restoreFocus falls back to nearest neighbour when lastFocused removed', function () {
  installMinimalDom();
  var screen = createElement('div');
  screen.className = 'screen';

  var a = btn('a', 0,   0, 100, 40);
  var b = btn('b', 0, 100, 100, 40);
  screen.appendChild(a);
  screen.appendChild(b);
  document.registerTree(screen);

  // Capture rect before removal
  var lastRect = a.getBoundingClientRect();
  // Remove 'a' from the container
  screen.removeChild(a);

  document.activeElement = document.body;

  // 'a' is not connected; nearest to its rect (0,0) should be 'b'
  restoreFocus(screen, a, lastRect);
  assert.equal(document.activeElement.id, 'b');
});

test('restoreFocus does not throw when container has no focusables', function () {
  installMinimalDom();
  var screen = createElement('div');
  screen.className = 'screen';
  document.registerTree(screen);

  document.activeElement = document.body;

  // Should not throw
  assert.doesNotThrow(function () {
    restoreFocus(screen, null, null);
  });
});
