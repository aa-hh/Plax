import test from 'node:test';
import assert from 'node:assert/strict';

import { installMinimalDom, createElement } from './helpers/minimal-dom.js';
import {
  isSidebarZone,
  isAtLeftEdge,
  getZones,
  handleKeyNav,
  getFocusables,
  zoneColumnCount,
  tryColumnarMove,
  isDescendantOfAny
} from '../src/ui/focus.js';

var ARROW_RIGHT = 39;
var ARROW_LEFT = 37;
var ARROW_DOWN = 40;
var ARROW_UP = 38;

function keyEvent(code) {
  return { keyCode: code, preventDefault: function () {} };
}

function mockZone(classes, attrs) {
  attrs = attrs || {};
  return {
    classList: {
      contains: function (name) {
        return classes.indexOf(name) >= 0;
      }
    },
    getAttribute: function (name) {
      return attrs[name] != null ? String(attrs[name]) : null;
    }
  };
}

function mockActive(itemIndex) {
  return {
    getAttribute: function (name) {
      if (name === 'data-item-index' && itemIndex != null) return String(itemIndex);
      return null;
    }
  };
}

test('isSidebarZone detects browsing hub host', function () {
  assert.equal(isSidebarZone(mockZone(['browsing-hub-nav-host'])), true);
  assert.equal(isSidebarZone(mockZone(['row-scroll'])), false);
  assert.equal(isSidebarZone(null), false);
});

test('isSidebarZone detects library sidebar composite zone', function () {
  assert.equal(isSidebarZone(mockZone([], { 'data-focus-zone': 'library-sidebar' })), true);
});

test('isAtLeftEdge uses index zero and virtual row metadata', function () {
  assert.equal(isAtLeftEdge(mockActive(0), mockZone(['row-scroll']), 2), true);
  assert.equal(isAtLeftEdge(mockActive(1), mockZone(['row-scroll']), 1), false);
  assert.equal(isAtLeftEdge(mockActive(null), mockZone(['top-nav']), 0), true);
});

test('isAtLeftEdge treats first grid column as left edge', function () {
  var grid = mockZone(['media-grid'], { 'data-cols': '6' });
  assert.equal(isAtLeftEdge(mockActive(null), grid, 0), true);
  assert.equal(isAtLeftEdge(mockActive(null), grid, 6), true);
  assert.equal(isAtLeftEdge(mockActive(null), grid, 1), false);
});

test('zoneColumnCount defaults media grid to six columns', function () {
  assert.equal(zoneColumnCount(mockZone(['media-grid'])), 6);
  assert.equal(zoneColumnCount(mockZone(['row-scroll'], { 'data-cols': '4' })), 4);
});

test('tryColumnarMove steps by column count', function () {
  assert.equal(tryColumnarMove(new Array(12), 0, 6, ARROW_DOWN), 6);
  assert.equal(tryColumnarMove(new Array(12), 6, 6, ARROW_UP), 0);
  assert.equal(tryColumnarMove(new Array(5), 0, 6, ARROW_DOWN), -1);
});

test('getZones skips row-scroll nested inside detail rails zone', function () {
  installMinimalDom();
  var screen = createElement('div');
  screen.className = 'screen';
  var rails = createElement('div');
  rails.setAttribute('data-focus-zone', 'detail-rails');
  rails.className = 'detail-rails';
  var row = createElement('div');
  row.className = 'row-scroll';
  row.appendChild(createElement('button'));
  rails.appendChild(row);
  screen.appendChild(rails);
  document.registerTree(screen);

  var zones = getZones(screen);
  assert.equal(zones.indexOf(row), -1);
  assert.ok(zones.indexOf(rails) >= 0);
});

test('library sidebar zone includes hub and scan control', function () {
  installMinimalDom();
  var screen = createElement('div');
  screen.className = 'screen library-screen';
  var sidebar = createElement('div');
  sidebar.className = 'library-sidebar';
  sidebar.setAttribute('data-focus-zone', 'library-sidebar');
  var hub = createElement('nav');
  hub.className = 'browsing-hub-nav-host';
  var hubBtn = createElement('button');
  hubBtn.className = 'browsing-hub-item';
  hubBtn.id = 'hub-home';
  hubBtn.setAttribute('tabindex', '0');
  hub.appendChild(hubBtn);
  var scan = createElement('button');
  scan.className = 'library-item library-action';
  scan.id = 'btn-scan-library';
  scan.setAttribute('tabindex', '0');
  sidebar.appendChild(hub);
  sidebar.appendChild(scan);
  var grid = createElement('div');
  grid.className = 'media-grid';
  grid.setAttribute('data-cols', '6');
  screen.appendChild(sidebar);
  screen.appendChild(grid);
  document.registerTree(screen);

  assert.equal(isSidebarZone(sidebar), true);
  var ids = getFocusables(sidebar).map(function (el) { return el.id; });
  assert.deepEqual(ids, ['hub-home', 'btn-scan-library']);

  hubBtn.focus();
  handleKeyNav(screen, keyEvent(ARROW_DOWN));
  assert.equal(document.activeElement.id, 'btn-scan-library');
});

test('media grid Down moves to next row in reading order', function () {
  installMinimalDom();
  var screen = createElement('div');
  screen.className = 'screen library-screen';
  var hub = createElement('nav');
  hub.className = 'browsing-hub-nav-host';
  var grid = createElement('div');
  grid.className = 'media-grid';
  grid.setAttribute('data-cols', '3');
  var i;
  for (i = 0; i < 9; i++) {
    var card = createElement('button');
    card.className = 'card media-card';
    card.id = 'card-' + i;
    card.setAttribute('tabindex', '0');
    grid.appendChild(card);
  }
  screen.appendChild(hub);
  screen.appendChild(grid);
  document.registerTree(screen);

  screen.querySelector('#card-1').focus();
  handleKeyNav(screen, keyEvent(ARROW_DOWN));
  assert.equal(document.activeElement.id, 'card-4');
});

test('pin pad Down from 8 focuses 0 on bottom row', function () {
  installMinimalDom();
  var screen = createElement('div');
  screen.className = 'screen profile-picker-screen';
  var grid = createElement('div');
  grid.className = 'pin-pad-grid';
  grid.setAttribute('data-cols', '3');
  ['1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach(function (key) {
    var btn = createElement('button');
    btn.className = 'pin-pad-btn';
    btn.id = 'pin-' + key;
    btn.setAttribute('tabindex', '0');
    grid.appendChild(btn);
  });
  var bottom = createElement('div');
  bottom.className = 'pin-pad-row-bottom';
  bottom.setAttribute('data-cols', '2');
  var zero = createElement('button');
  zero.className = 'pin-pad-btn';
  zero.id = 'pin-0';
  zero.setAttribute('tabindex', '0');
  var del = createElement('button');
  del.className = 'pin-pad-btn';
  del.id = 'pin-del';
  del.setAttribute('tabindex', '0');
  bottom.appendChild(zero);
  bottom.appendChild(del);
  screen.appendChild(grid);
  screen.appendChild(bottom);
  document.registerTree(screen);

  screen.querySelector('#pin-8').focus();
  handleKeyNav(screen, keyEvent(ARROW_DOWN));
  assert.equal(document.activeElement.id, 'pin-0');
});

test('isDescendantOfAny detects nested zones', function () {
  installMinimalDom();
  var parent = createElement('div');
  parent.id = 'parent';
  var child = createElement('div');
  child.id = 'child';
  parent.appendChild(child);
  assert.equal(isDescendantOfAny(child, [parent]), true);
  assert.equal(isDescendantOfAny(parent, [child]), false);
});
