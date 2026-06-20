import test from 'node:test';
import assert from 'node:assert/strict';

import { installMinimalDom, createElement, layout } from './helpers/minimal-dom.js';
import {
  handleKeyNav,
  getFocusables,
  invalidateFocusableCache
} from '../src/ui/focus.js';

var ARROW_DOWN = 40;
var ARROW_RIGHT = 39;
var ARROW_LEFT = 37;
var ARROW_UP = 38;

function keyEvent(code) {
  return { keyCode: code, preventDefault: function () {} };
}

function hubBtn(id) {
  var el = createElement('button');
  el.id = id;
  el.className = 'browsing-hub-item';
  el.setAttribute('tabindex', '0');
  return el;
}

function gridCard(id) {
  var el = createElement('div');
  el.id = id;
  el.className = 'media-card card row-item';
  el.setAttribute('tabindex', '0');
  return el;
}

/**
 * Library screen layout:
 *   Sidebar:
 *     hub-home        (0,  50, 200, 40)
 *     btn-scan-library(0, 100, 200, 40)
 *   Grid row 1 (y=100, h=250): card-0..card-5 at x=[220,412,604,796,988,1180]
 *   Grid row 2 (y=380, h=250): card-6..card-11
 */
var CARD_XS = [220, 412, 604, 796, 988, 1180];
var CARD_W = 172;
var CARD_H = 250;
var ROW_Y = [100, 380];

function buildLibraryFixture(cardCount) {
  cardCount = cardCount != null ? cardCount : 12;
  var screen = createElement('div');
  screen.className = 'screen library-screen';

  var sidebar = createElement('div');
  sidebar.className = 'library-sidebar';

  var home = hubBtn('hub-home');
  layout(home, 0, 50, 200, 40);

  var scan = createElement('button');
  scan.id = 'btn-scan-library';
  scan.className = 'library-item library-action';
  scan.setAttribute('tabindex', '0');
  layout(scan, 0, 100, 200, 40);

  sidebar.appendChild(home);
  sidebar.appendChild(scan);

  var grid = createElement('div');
  grid.className = 'media-grid';
  grid.id = 'media-grid';

  var i;
  for (i = 0; i < cardCount; i++) {
    var col = i % 6;
    var row = Math.floor(i / 6);
    var card = gridCard('card-' + i);
    layout(card, CARD_XS[col], ROW_Y[row] || ROW_Y[ROW_Y.length - 1] + (row - 1) * 280, CARD_W, CARD_H);
    grid.appendChild(card);
  }

  screen.appendChild(sidebar);
  screen.appendChild(grid);
  return screen;
}

// --- getFocusables still works on a sub-container ----------------------------

test('getFocusables(sidebar) returns sidebar elements', function () {
  installMinimalDom();
  var screen = buildLibraryFixture(6);
  document.registerTree(screen);

  var sidebar = screen.querySelector('.library-sidebar');
  var items = getFocusables(sidebar);
  assert.ok(items.length >= 2, 'sidebar should have at least 2 focusables');
  assert.ok(items.some(function (el) { return el.id === 'hub-home'; }));
  assert.ok(items.some(function (el) { return el.id === 'btn-scan-library'; }));
});

// --- Sidebar vertical navigation ---------------------------------------------

test('Down from hub-home moves to btn-scan-library', function () {
  installMinimalDom();
  var screen = buildLibraryFixture(6);
  document.registerTree(screen);

  screen.querySelector('#hub-home').focus();
  assert.equal(handleKeyNav(screen, keyEvent(ARROW_DOWN)), true);
  assert.equal(document.activeElement.id, 'btn-scan-library');
});

test('Up from btn-scan-library moves to hub-home', function () {
  installMinimalDom();
  var screen = buildLibraryFixture(6);
  document.registerTree(screen);

  screen.querySelector('#btn-scan-library').focus();
  assert.equal(handleKeyNav(screen, keyEvent(ARROW_UP)), true);
  assert.equal(document.activeElement.id, 'hub-home');
});

// --- Sidebar → grid (RIGHT) --------------------------------------------------

test('Right from hub-home enters first row-1 grid card', function () {
  installMinimalDom();
  var screen = buildLibraryFixture(6);
  document.registerTree(screen);

  // hub-home centre y = 70. card-0 centre y = 225. card-0 is the nearest element
  // strictly to the right (lowest score wins).
  screen.querySelector('#hub-home').focus();
  assert.equal(handleKeyNav(screen, keyEvent(ARROW_RIGHT)), true);
  assert.equal(document.activeElement.id, 'card-0');
});

test('Right from btn-scan-library enters first row-1 grid card', function () {
  installMinimalDom();
  var screen = buildLibraryFixture(6);
  document.registerTree(screen);

  screen.querySelector('#btn-scan-library').focus();
  assert.equal(handleKeyNav(screen, keyEvent(ARROW_RIGHT)), true);
  assert.equal(document.activeElement.id, 'card-0');
});

// --- Grid → sidebar (LEFT) ---------------------------------------------------

test('Left from card-0 returns focus to a sidebar element', function () {
  installMinimalDom();
  var screen = buildLibraryFixture(6);
  document.registerTree(screen);

  screen.querySelector('#card-0').focus();
  assert.equal(handleKeyNav(screen, keyEvent(ARROW_LEFT)), true);
  var activeId = document.activeElement.id;
  assert.ok(
    activeId === 'hub-home' || activeId === 'btn-scan-library',
    'expected sidebar element, got ' + activeId
  );
});

// --- Grid horizontal navigation ----------------------------------------------

test('Right from card-0 moves to card-1', function () {
  installMinimalDom();
  var screen = buildLibraryFixture(6);
  document.registerTree(screen);

  screen.querySelector('#card-0').focus();
  assert.equal(handleKeyNav(screen, keyEvent(ARROW_RIGHT)), true);
  assert.equal(document.activeElement.id, 'card-1');
});

test('Right from card-1 moves to card-2', function () {
  installMinimalDom();
  var screen = buildLibraryFixture(6);
  document.registerTree(screen);

  screen.querySelector('#card-1').focus();
  assert.equal(handleKeyNav(screen, keyEvent(ARROW_RIGHT)), true);
  assert.equal(document.activeElement.id, 'card-2');
});

test('Left from card-1 returns to card-0', function () {
  installMinimalDom();
  var screen = buildLibraryFixture(6);
  document.registerTree(screen);

  screen.querySelector('#card-1').focus();
  assert.equal(handleKeyNav(screen, keyEvent(ARROW_LEFT)), true);
  assert.equal(document.activeElement.id, 'card-0');
});

// --- Grid DOWN / UP between rows ---------------------------------------------

test('Down from card-1 moves to card-7 (same column, row 2)', function () {
  installMinimalDom();
  var screen = buildLibraryFixture(12);
  document.registerTree(screen);

  screen.querySelector('#card-1').focus();
  assert.equal(handleKeyNav(screen, keyEvent(ARROW_DOWN)), true);
  assert.equal(document.activeElement.id, 'card-7');
});

test('Up from card-7 returns to card-1 (same column, row 1)', function () {
  installMinimalDom();
  var screen = buildLibraryFixture(12);
  document.registerTree(screen);

  screen.querySelector('#card-7').focus();
  assert.equal(handleKeyNav(screen, keyEvent(ARROW_UP)), true);
  assert.equal(document.activeElement.id, 'card-1');
});

// --- Regression: virtual-grid rebuild must invalidate the focusable cache -----
// Repro of the reported bug: after scrolling a couple of rows, DOWN jumped to the
// sidebar and you couldn't get back into the grid. Cause: the virtual grid
// rebuilds its card nodes on scroll, but focus.js caches focusables per
// container — a stale cache holds detached cards, so DOWN's only in-direction
// candidate is the (always-cached) bottom rail item. libraryScreen.renderWindow
// now calls invalidateFocusableCache() on every rebuild; this locks that in.

function buildOverlayRailFixture() {
  var screen = createElement('div');
  screen.className = 'screen library-screen';

  // Overlay rail in the gutter, with a System/Settings item pinned low — exactly
  // the candidate a stale cache wrongly picks on DOWN from mid-grid.
  var rail = createElement('nav');
  rail.className = 'browsing-hub-nav-host';
  var home = hubBtn('hub-home');
  layout(home, 0, 60, 64, 48);
  var settings = hubBtn('hub-settings');
  layout(settings, 0, 900, 64, 48);
  rail.appendChild(home);
  rail.appendChild(settings);

  var grid = createElement('div');
  grid.className = 'media-grid';
  grid.id = 'media-grid';
  var COLX = [150, 420, 690, 960, 1230, 1500];
  var k = 0;
  function addCard(col, y) {
    var c = gridCard('card-' + (k++));
    layout(c, COLX[col], y, 248, 372);
    grid.appendChild(c);
  }
  var col;
  for (col = 0; col < 6; col++) addCard(col, 100);  // row 1
  for (col = 0; col < 6; col++) addCard(col, 500);  // row 2 (card-6..11)

  screen.appendChild(rail);
  screen.appendChild(grid);
  return { screen: screen, grid: grid, COLX: COLX };
}

test('stale focusable cache after a grid rebuild traps DOWN on the sidebar', function () {
  installMinimalDom();
  invalidateFocusableCache();
  var fx = buildOverlayRailFixture();
  document.registerTree(fx.screen);

  // Prime the cache while on a row-2 card (as real navigation does).
  fx.screen.querySelector('#card-7').focus();
  getFocusables(fx.screen);

  // Virtual-scroll rebuild brings in a new row-3 card directly below card-7,
  // but the cache is NOT refreshed.
  var below = gridCard('card-new');
  layout(below, fx.COLX[1], 920, 248, 372);
  fx.grid.appendChild(below);

  fx.screen.querySelector('#card-7').focus();
  handleKeyNav(fx.screen, keyEvent(ARROW_DOWN));
  assert.equal(
    document.activeElement.id, 'hub-settings',
    'stale cache: DOWN wrongly falls through to the bottom rail item'
  );
});

test('invalidating the cache after a rebuild restores DOWN into the grid (and RIGHT back out of the rail)', function () {
  installMinimalDom();
  invalidateFocusableCache();
  var fx = buildOverlayRailFixture();
  document.registerTree(fx.screen);

  fx.screen.querySelector('#card-7').focus();
  getFocusables(fx.screen);

  var below = gridCard('card-new');
  layout(below, fx.COLX[1], 920, 248, 372);
  fx.grid.appendChild(below);

  // The fix: renderWindow invalidates after rebuilding.
  invalidateFocusableCache();

  fx.screen.querySelector('#card-7').focus();
  handleKeyNav(fx.screen, keyEvent(ARROW_DOWN));
  assert.equal(
    document.activeElement.id, 'card-new',
    'after invalidation DOWN reaches the rebuilt grid card'
  );

  // And focus is not trapped: RIGHT from the rail returns into the grid.
  fx.screen.querySelector('#hub-settings').focus();
  handleKeyNav(fx.screen, keyEvent(ARROW_RIGHT));
  assert.ok(
    document.activeElement.className.indexOf('media-card') >= 0,
    'RIGHT from the rail returns to a grid card, got ' + document.activeElement.id
  );
});
