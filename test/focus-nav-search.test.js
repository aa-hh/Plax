import test from 'node:test';
import assert from 'node:assert/strict';

import { installMinimalDom, createElement } from './helpers/minimal-dom.js';
import {
  handleKeyNav,
  getZones,
  focusSearchInput,
  focusSearchResults
} from '../src/ui/focus.js';

var ARROW_RIGHT = 39;
var ARROW_LEFT = 37;
var ARROW_DOWN = 40;

function keyEvent(code) {
  return { keyCode: code, preventDefault: function () {} };
}

function hubItem(id) {
  var el = createElement('button');
  el.id = id;
  el.className = 'browsing-hub-item';
  el.setAttribute('tabindex', '0');
  return el;
}

function rowCard(id, index) {
  var el = createElement('button');
  el.id = id;
  el.className = 'card row-item';
  el.setAttribute('tabindex', '0');
  el.setAttribute('data-item-index', String(index));
  return el;
}

function buildSearchFixture() {
  var screen = createElement('div');
  screen.className = 'screen search-screen';

  var layout = createElement('div');
  layout.className = 'home-layout search-layout';

  var hub = createElement('nav');
  hub.className = 'browsing-hub-nav-host';
  hub.appendChild(hubItem('hub-home'));
  hub.appendChild(hubItem('hub-search'));
  layout.appendChild(hub);

  var main = createElement('div');
  main.className = 'home-main search-main';

  var inputRow = createElement('div');
  inputRow.className = 'search-input-row';
  var input = createElement('input');
  input.id = 'search-input';
  input.className = 'search-input';
  input.setAttribute('tabindex', '0');
  inputRow.appendChild(input);
  main.appendChild(inputRow);

  var results = createElement('div');
  results.className = 'search-results';
  var section = createElement('div');
  section.className = 'row-section';
  var scroll = createElement('div');
  scroll.className = 'row-scroll';
  scroll.setAttribute('data-cols', '10');
  scroll.appendChild(rowCard('card-a', 0));
  scroll.appendChild(rowCard('card-b', 1));
  section.appendChild(scroll);
  results.appendChild(section);
  main.appendChild(results);

  layout.appendChild(main);
  screen.appendChild(layout);
  return screen;
}

test('search getZones orders sidebar, input, row-scroll without results host duplicate', function () {
  installMinimalDom();
  var screen = buildSearchFixture();
  document.registerTree(screen);

  var zones = getZones(screen);
  assert.equal(zones[0].className.indexOf('browsing-hub-nav-host') >= 0, true);
  assert.equal(zones[1].className.indexOf('search-input-row') >= 0, true);
  assert.equal(zones[2].className.indexOf('row-scroll') >= 0, true);
  assert.equal(zones.some(function (z) {
    return z.className && z.className.indexOf('search-results') >= 0;
  }), false);
});

test('Right from sidebar focuses search input', function () {
  installMinimalDom();
  var screen = buildSearchFixture();
  document.registerTree(screen);

  screen.querySelector('#hub-home').focus();
  assert.equal(handleKeyNav(screen, keyEvent(ARROW_RIGHT)), true);
  assert.equal(document.activeElement.id, 'search-input');
});

test('Right from search input focuses first result card', function () {
  installMinimalDom();
  var screen = buildSearchFixture();
  document.registerTree(screen);

  screen.querySelector('#search-input').focus();
  assert.equal(handleKeyNav(screen, keyEvent(ARROW_RIGHT)), true);
  assert.equal(document.activeElement.id, 'card-a');
});

test('Left from first result card focuses search input', function () {
  installMinimalDom();
  var screen = buildSearchFixture();
  document.registerTree(screen);

  screen.querySelector('#card-a').focus();
  assert.equal(handleKeyNav(screen, keyEvent(ARROW_LEFT)), true);
  assert.equal(document.activeElement.id, 'search-input');
});

test('Left from search input focuses sidebar', function () {
  installMinimalDom();
  var screen = buildSearchFixture();
  document.registerTree(screen);

  screen.querySelector('#search-input').focus();
  assert.equal(handleKeyNav(screen, keyEvent(ARROW_LEFT)), true);
  assert.equal(document.activeElement.id, 'hub-home');
});

test('Down from search input focuses first result row', function () {
  installMinimalDom();
  var screen = buildSearchFixture();
  document.registerTree(screen);

  screen.querySelector('#search-input').focus();
  assert.equal(handleKeyNav(screen, keyEvent(ARROW_DOWN)), true);
  assert.equal(document.activeElement.id, 'card-a');
});

test('focusSearchResults and focusSearchInput helpers', function () {
  installMinimalDom();
  var screen = buildSearchFixture();
  document.registerTree(screen);

  assert.equal(focusSearchResults(screen, 1), true);
  assert.equal(document.activeElement.id, 'card-b');
  assert.equal(focusSearchInput(screen), true);
  assert.equal(document.activeElement.id, 'search-input');
});
