import test from 'node:test';
import assert from 'node:assert/strict';

import { installMinimalDom, createElement } from './helpers/minimal-dom.js';
import {
  handleKeyNav,
  getZones,
  focusSidebar,
  isAtLeftEdge,
  preferredColumnIndex
} from '../src/ui/focus.js';

var ARROW_DOWN = 40;
var ARROW_RIGHT = 39;
var ARROW_LEFT = 37;
var ARROW_UP = 38;

function keyEvent(code) {
  return { keyCode: code, preventDefault: function () {} };
}

function btn(id, className, attrs) {
  attrs = attrs || {};
  var el = createElement('button');
  el.id = id;
  el.className = className || 'btn';
  el.setAttribute('tabindex', '0');
  Object.keys(attrs).forEach(function (name) {
    el.setAttribute(name, attrs[name]);
  });
  return el;
}

function card(id, index) {
  return btn(id, 'media-card card row-item', { 'data-item-index': String(index) });
}

function hubRowSection(id, cards, opts) {
  opts = opts || {};
  var section = createElement('div');
  section.className = 'row-section';
  section.id = id;
  section.setAttribute('data-focus-zone', 'hub-row');
  if (opts.labelLink) {
    var label = createElement('p');
    label.className = 'row-label';
    label.appendChild(opts.labelLink);
    section.appendChild(label);
  }
  var wrap = createElement('div');
  var scroll = createElement('div');
  scroll.className = 'row-scroll';
  scroll.setAttribute('data-cols', '12');
  cards.forEach(function (c) {
    scroll.appendChild(c);
  });
  wrap.appendChild(scroll);
  section.appendChild(wrap);
  return section;
}

function buildHomeFixture() {
  var screen = createElement('div');
  screen.className = 'screen screen-home';

  var layout = createElement('div');
  layout.className = 'home-layout';

  var hub = createElement('nav');
  hub.className = 'browsing-hub-nav-host';
  hub.appendChild(btn('hub-home', 'browsing-hub-item active'));
  hub.appendChild(btn('hub-watchlist', 'browsing-hub-item'));
  layout.appendChild(hub);

  var main = createElement('div');
  main.className = 'home-main';

  var feed = createElement('div');
  feed.className = 'home-feed';
  feed.appendChild(hubRowSection('row-continue', [
    card('continue-0', 0),
    card('continue-1', 1),
    card('continue-2', 2)
  ]));
  feed.appendChild(hubRowSection('row-recent', [
    card('recent-0', 0),
    card('recent-1', 1),
    card('recent-2', 2),
    card('recent-3', 3)
  ], {
    labelLink: btn('watchlist-link', 'watchlist-row-link')
  }));
  main.appendChild(feed);
  layout.appendChild(main);
  screen.appendChild(layout);
  return screen;
}

test('getZones orders sidebar then hub rows without duplicate row-scroll', function () {
  installMinimalDom();
  var screen = buildHomeFixture();
  document.registerTree(screen);

  var zones = getZones(screen);
  assert.equal(zones.length, 3);
  assert.ok(zones[0].classList.contains('browsing-hub-nav-host'));
  assert.equal(zones[1].id, 'row-continue');
  assert.equal(zones[2].id, 'row-recent');
});

test('Right from sidebar focuses first card in first hub row', function () {
  installMinimalDom();
  var screen = buildHomeFixture();
  document.registerTree(screen);

  focusSidebar(screen);
  handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  assert.equal(document.activeElement.id, 'continue-0');
});

test('Right and Left move sequentially within a hub row', function () {
  installMinimalDom();
  var screen = buildHomeFixture();
  document.registerTree(screen);

  screen.querySelector('#continue-1').focus();
  handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  assert.equal(document.activeElement.id, 'continue-2');
  handleKeyNav(screen, keyEvent(ARROW_LEFT));
  assert.equal(document.activeElement.id, 'continue-1');
});

test('Down between hub rows preserves data-item-index column', function () {
  installMinimalDom();
  var screen = buildHomeFixture();
  document.registerTree(screen);

  screen.querySelector('#continue-2').focus();
  handleKeyNav(screen, keyEvent(ARROW_DOWN));
  assert.equal(document.activeElement.id, 'recent-2');
});

test('Up between hub rows preserves column index', function () {
  installMinimalDom();
  var screen = buildHomeFixture();
  document.registerTree(screen);

  screen.querySelector('#recent-1').focus();
  handleKeyNav(screen, keyEvent(ARROW_UP));
  assert.equal(document.activeElement.id, 'continue-1');
});

test('Left from first card reaches row label link before sidebar', function () {
  installMinimalDom();
  var screen = buildHomeFixture();
  document.registerTree(screen);

  var rowZone = screen.querySelector('#row-recent');
  screen.querySelector('#recent-0').focus();
  assert.equal(isAtLeftEdge(document.activeElement, rowZone, 1), false);

  handleKeyNav(screen, keyEvent(ARROW_LEFT));
  assert.equal(document.activeElement.id, 'watchlist-link');

  handleKeyNav(screen, keyEvent(ARROW_LEFT));
  assert.equal(document.activeElement.id, 'hub-home');
});

test('preferredColumnIndex matches cards by data-item-index', function () {
  installMinimalDom();
  var screen = buildHomeFixture();
  document.registerTree(screen);

  var active = screen.querySelector('#continue-2');
  var targetList = [
    screen.querySelector('#recent-0'),
    screen.querySelector('#recent-1'),
    screen.querySelector('#recent-2')
  ];
  assert.equal(preferredColumnIndex(active, 99, targetList), 2);
});
