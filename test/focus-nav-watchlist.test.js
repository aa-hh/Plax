import test from 'node:test';
import assert from 'node:assert/strict';

import { installMinimalDom, createElement } from './helpers/minimal-dom.js';
import { handleKeyNav, getZones } from '../src/ui/focus.js';

var ARROW_RIGHT = 39;
var ARROW_DOWN = 40;

function keyEvent(code) {
  return { keyCode: code, preventDefault: function () {} };
}

function buildWatchlistFixture() {
  var screen = createElement('div');
  screen.className = 'screen watchlist-screen';

  var hub = createElement('nav');
  hub.className = 'browsing-hub-nav-host';
  var hubHome = createElement('button');
  hubHome.className = 'browsing-hub-item';
  hubHome.id = 'hub-home';
  hubHome.setAttribute('tabindex', '0');
  hub.appendChild(hubHome);

  var main = createElement('div');
  main.className = 'home-main';

  var actions = createElement('div');
  actions.className = 'watchlist-manage-actions';
  actions.setAttribute('data-focus-zone', 'watchlist-manage');
  actions.setAttribute('data-cols', '2');
  var rename = createElement('button');
  rename.className = 'btn';
  rename.id = 'btn-rename';
  rename.setAttribute('tabindex', '0');
  var del = createElement('button');
  del.className = 'btn';
  del.id = 'btn-delete';
  del.setAttribute('tabindex', '0');
  actions.appendChild(rename);
  actions.appendChild(del);

  var row = createElement('div');
  row.className = 'row-scroll';
  var card = createElement('button');
  card.className = 'card row-item';
  card.id = 'watch-card-1';
  card.setAttribute('tabindex', '0');
  row.appendChild(card);

  main.appendChild(actions);
  main.appendChild(row);
  screen.appendChild(hub);
  screen.appendChild(main);
  return screen;
}

test('watchlist manage actions are adjacent left and right', function () {
  installMinimalDom();
  var screen = buildWatchlistFixture();
  document.registerTree(screen);

  screen.querySelector('#btn-rename').focus();
  handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  assert.equal(document.activeElement.id, 'btn-delete');
});

test('getZones orders manage actions before content row', function () {
  installMinimalDom();
  var screen = buildWatchlistFixture();
  document.registerTree(screen);

  var zones = getZones(screen);
  var actions = screen.querySelector('[data-focus-zone="watchlist-manage"]');
  var row = screen.querySelector('.row-scroll');
  assert.ok(zones.indexOf(actions) < zones.indexOf(row));
});

test('Down from delete watchlist button reaches first card', function () {
  installMinimalDom();
  var screen = buildWatchlistFixture();
  document.registerTree(screen);

  screen.querySelector('#btn-delete').focus();
  handleKeyNav(screen, keyEvent(ARROW_DOWN));
  assert.equal(document.activeElement.id, 'watch-card-1');
});
