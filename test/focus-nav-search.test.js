import test from 'node:test';
import assert from 'node:assert/strict';

import { installMinimalDom, createElement, layout } from './helpers/minimal-dom.js';
import {
  handleKeyNav
} from '../src/ui/focus.js';

var ARROW_RIGHT = 39;
var ARROW_LEFT = 37;
var ARROW_DOWN = 40;

function keyEvent(code) {
  return { keyCode: code, preventDefault: function () {} };
}

/**
 * Search screen layout (all elements at y≈50 so they are horizontally aligned):
 *
 *   Sidebar:
 *     hub-search  (0,  50, 200, 40)
 *     hub-movies  (0, 100, 200, 40)
 *
 *   Search input:
 *     search-input (220, 50, 400, 40)
 *
 *   Result cards:
 *     result-0  (640,  50, 172, 250)
 *     result-1  (832,  50, 172, 250)
 *     result-2  (1024, 50, 172, 250)
 */
function buildSearchFixture() {
  var screen = createElement('div');
  screen.className = 'screen search-screen';

  var hubSearch = createElement('button');
  hubSearch.id = 'hub-search';
  hubSearch.className = 'browsing-hub-item';
  hubSearch.setAttribute('tabindex', '0');
  layout(hubSearch, 0, 50, 200, 40);

  var hubMovies = createElement('button');
  hubMovies.id = 'hub-movies';
  hubMovies.className = 'browsing-hub-item';
  hubMovies.setAttribute('tabindex', '0');
  layout(hubMovies, 0, 100, 200, 40);

  var input = createElement('input');
  input.id = 'search-input';
  input.className = 'search-input';
  input.setAttribute('tabindex', '0');
  layout(input, 220, 50, 400, 40);

  var result0 = createElement('button');
  result0.id = 'result-0';
  result0.className = 'card row-item';
  result0.setAttribute('tabindex', '0');
  layout(result0, 640, 50, 172, 250);

  var result1 = createElement('button');
  result1.id = 'result-1';
  result1.className = 'card row-item';
  result1.setAttribute('tabindex', '0');
  layout(result1, 832, 50, 172, 250);

  var result2 = createElement('button');
  result2.id = 'result-2';
  result2.className = 'card row-item';
  result2.setAttribute('tabindex', '0');
  layout(result2, 1024, 50, 172, 250);

  screen.appendChild(hubSearch);
  screen.appendChild(hubMovies);
  screen.appendChild(input);
  screen.appendChild(result0);
  screen.appendChild(result1);
  screen.appendChild(result2);

  return screen;
}

// --- Sidebar → input → results (RIGHT) ---------------------------------------

test('Right from hub-search focuses search input', function () {
  installMinimalDom();
  var screen = buildSearchFixture();
  document.registerTree(screen);

  screen.querySelector('#hub-search').focus();
  assert.equal(handleKeyNav(screen, keyEvent(ARROW_RIGHT)), true);
  assert.equal(document.activeElement.id, 'search-input');
});

test('Right from search input focuses first result card', function () {
  installMinimalDom();
  var screen = buildSearchFixture();
  document.registerTree(screen);

  screen.querySelector('#search-input').focus();
  assert.equal(handleKeyNav(screen, keyEvent(ARROW_RIGHT)), true);
  assert.equal(document.activeElement.id, 'result-0');
});

test('Right from result-0 moves to result-1', function () {
  installMinimalDom();
  var screen = buildSearchFixture();
  document.registerTree(screen);

  screen.querySelector('#result-0').focus();
  assert.equal(handleKeyNav(screen, keyEvent(ARROW_RIGHT)), true);
  assert.equal(document.activeElement.id, 'result-1');
});

// --- Results → input → sidebar (LEFT) ----------------------------------------

test('Left from result-0 returns to search input', function () {
  installMinimalDom();
  var screen = buildSearchFixture();
  document.registerTree(screen);

  screen.querySelector('#result-0').focus();
  assert.equal(handleKeyNav(screen, keyEvent(ARROW_LEFT)), true);
  assert.equal(document.activeElement.id, 'search-input');
});

test('Left from search input returns to hub-search', function () {
  installMinimalDom();
  var screen = buildSearchFixture();
  document.registerTree(screen);

  screen.querySelector('#search-input').focus();
  assert.equal(handleKeyNav(screen, keyEvent(ARROW_LEFT)), true);
  assert.equal(document.activeElement.id, 'hub-search');
});

// --- Sidebar vertical navigation ---------------------------------------------

test('Down from hub-search moves to hub-movies', function () {
  installMinimalDom();
  var screen = buildSearchFixture();
  document.registerTree(screen);

  screen.querySelector('#hub-search').focus();
  assert.equal(handleKeyNav(screen, keyEvent(ARROW_DOWN)), true);
  assert.equal(document.activeElement.id, 'hub-movies');
});
