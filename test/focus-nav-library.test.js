import test from 'node:test';
import assert from 'node:assert/strict';

import { installMinimalDom, createElement, layout } from './helpers/minimal-dom.js';
import {
  handleKeyNav,
  getFocusables
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
