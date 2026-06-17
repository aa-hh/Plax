import test from 'node:test';
import assert from 'node:assert/strict';

import { installMinimalDom, createElement } from './helpers/minimal-dom.js';
import {
  handleKeyNav,
  getZones,
  focusSidebar,
  zoneColumnCount
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

function gridCard(id, itemIndex) {
  var el = createElement('div');
  el.id = id;
  el.className = 'media-card card row-item';
  el.setAttribute('tabindex', '0');
  el.setAttribute('data-item-index', String(itemIndex));
  return el;
}

function buildLibraryFixture(cardCount) {
  cardCount = cardCount != null ? cardCount : 14;
  var screen = createElement('div');
  screen.className = 'screen library-screen';

  var layout = createElement('div');
  layout.className = 'library-layout';

  var sidebar = createElement('div');
  sidebar.className = 'library-sidebar';
  sidebar.setAttribute('data-focus-zone', 'library-sidebar');

  var hub = createElement('nav');
  hub.className = 'browsing-hub-nav-host';
  hub.appendChild(hubBtn('hub-home'));
  hub.appendChild(hubBtn('hub-library'));
  sidebar.appendChild(hub);

  var scan = createElement('button');
  scan.id = 'btn-scan-library';
  scan.className = 'library-item library-action';
  scan.setAttribute('tabindex', '0');
  sidebar.appendChild(scan);

  var main = createElement('div');
  main.className = 'library-main';

  var gridHost = createElement('div');
  gridHost.className = 'library-grid-host';
  gridHost.id = 'library-grid-host';

  var grid = createElement('div');
  grid.className = 'media-grid';
  grid.id = 'media-grid';
  grid.setAttribute('data-cols', '6');
  var i;
  for (i = 0; i < cardCount; i++) {
    grid.appendChild(gridCard('card-' + i, i));
  }
  gridHost.appendChild(grid);
  main.appendChild(gridHost);

  layout.appendChild(sidebar);
  layout.appendChild(main);
  screen.appendChild(layout);
  return screen;
}

test('getZones lists library sidebar once before media grid', function () {
  installMinimalDom();
  var screen = buildLibraryFixture(6);
  document.registerTree(screen);

  var zones = getZones(screen);
  var sidebar = screen.querySelector('[data-focus-zone="library-sidebar"]');
  var grid = screen.querySelector('.media-grid');
  assert.equal(zones.filter(function (z) { return z === grid; }).length, 1);
  assert.ok(zones.indexOf(sidebar) < zones.indexOf(grid));
});

test('Right in grid moves within row only', function () {
  installMinimalDom();
  var screen = buildLibraryFixture(14);
  document.registerTree(screen);

  screen.querySelector('#card-0').focus();
  handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  assert.equal(document.activeElement.id, 'card-1');
  handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  assert.equal(document.activeElement.id, 'card-2');
});

test('Right at row end does not wrap to next row', function () {
  installMinimalDom();
  var screen = buildLibraryFixture(14);
  document.registerTree(screen);

  screen.querySelector('#card-5').focus();
  handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  assert.equal(document.activeElement.id, 'card-5');
});

test('Down in grid moves by column count', function () {
  installMinimalDom();
  var screen = buildLibraryFixture(14);
  document.registerTree(screen);

  assert.equal(zoneColumnCount(screen.querySelector('.media-grid')), 6);
  screen.querySelector('#card-1').focus();
  handleKeyNav(screen, keyEvent(ARROW_DOWN));
  assert.equal(document.activeElement.id, 'card-7');
});

test('Up from second row returns to same column', function () {
  installMinimalDom();
  var screen = buildLibraryFixture(14);
  document.registerTree(screen);

  screen.querySelector('#card-8').focus();
  handleKeyNav(screen, keyEvent(ARROW_UP));
  assert.equal(document.activeElement.id, 'card-2');
});

test('Up from first grid row stays in grid (no sidebar jump)', function () {
  installMinimalDom();
  var screen = buildLibraryFixture(8);
  document.registerTree(screen);

  screen.querySelector('#card-3').focus();
  handleKeyNav(screen, keyEvent(ARROW_UP));
  // UP from the top row should not jump to the sidebar — focus stays in the grid
  assert.ok(document.activeElement.className.indexOf('browsing-hub-item') < 0);
});

test('Left from first column focuses sidebar', function () {
  installMinimalDom();
  var screen = buildLibraryFixture(8);
  document.registerTree(screen);

  screen.querySelector('#card-6').focus();
  handleKeyNav(screen, keyEvent(ARROW_LEFT));
  assert.ok(document.activeElement.className.indexOf('browsing-hub-item') >= 0);
});

test('Right from sidebar enters grid at first card', function () {
  installMinimalDom();
  var screen = buildLibraryFixture(8);
  document.registerTree(screen);

  screen.querySelector('#hub-home').focus();
  handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  assert.equal(document.activeElement.id, 'card-0');
});

test('Down from last sidebar item enters grid', function () {
  installMinimalDom();
  var screen = buildLibraryFixture(8);
  document.registerTree(screen);

  screen.querySelector('#btn-scan-library').focus();
  handleKeyNav(screen, keyEvent(ARROW_DOWN));
  assert.equal(document.activeElement.id, 'card-0');
});

test('focusSidebar helper focuses first hub item', function () {
  installMinimalDom();
  var screen = buildLibraryFixture(4);
  document.registerTree(screen);

  screen.querySelector('#card-0').focus();
  assert.equal(focusSidebar(screen), true);
  assert.equal(document.activeElement.id, 'hub-home');
});
