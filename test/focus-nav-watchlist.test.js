import test from 'node:test';
import assert from 'node:assert/strict';

import { installMinimalDom, createElement, layout } from './helpers/minimal-dom.js';
import { handleKeyNav } from '../src/ui/focus.js';

var ARROW_RIGHT = 39;
var ARROW_DOWN  = 40;
var ARROW_LEFT  = 37;

function keyEvent(code) {
  return { keyCode: code, preventDefault: function () {} };
}

/**
 * Watchlist screen layout:
 *
 *   hub-home    (0,   100, 200, 40)   centerX=100  centerY=120  (sidebar)
 *   btn-rename  (220, 100, 150, 40)   centerX=295  centerY=120  (manage actions row)
 *   btn-delete  (380, 100, 150, 40)   centerX=455  centerY=120  (right of rename)
 *   watch-card-1 (220, 200, 172, 250) centerX=306  centerY=325  (row below manage actions)
 */
function buildWatchlistFixture() {
  var screen = createElement('div');
  screen.className = 'screen watchlist-screen';

  var hubHome = createElement('button');
  hubHome.className = 'browsing-hub-item';
  hubHome.id = 'hub-home';
  hubHome.setAttribute('tabindex', '0');
  layout(hubHome, 0, 100, 200, 40);

  var rename = createElement('button');
  rename.className = 'btn';
  rename.id = 'btn-rename';
  rename.setAttribute('tabindex', '0');
  layout(rename, 220, 100, 150, 40);

  var del = createElement('button');
  del.className = 'btn';
  del.id = 'btn-delete';
  del.setAttribute('tabindex', '0');
  layout(del, 380, 100, 150, 40);

  var card = createElement('button');
  card.className = 'card row-item';
  card.id = 'watch-card-1';
  card.setAttribute('tabindex', '0');
  layout(card, 220, 200, 172, 250);

  screen.appendChild(hubHome);
  screen.appendChild(rename);
  screen.appendChild(del);
  screen.appendChild(card);

  return screen;
}

// ---------------------------------------------------------------------------

test('Right from btn-rename focuses btn-delete', function () {
  installMinimalDom();
  var screen = buildWatchlistFixture();
  document.registerTree(screen);

  screen.querySelector('#btn-rename').focus();
  var handled = handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  assert.equal(handled, true);
  assert.equal(document.activeElement.id, 'btn-delete');
});

test('Down from btn-delete focuses watch-card-1', function () {
  installMinimalDom();
  var screen = buildWatchlistFixture();
  document.registerTree(screen);

  screen.querySelector('#btn-delete').focus();
  var handled = handleKeyNav(screen, keyEvent(ARROW_DOWN));
  assert.equal(handled, true);
  assert.equal(document.activeElement.id, 'watch-card-1');
});

test('Left from btn-rename focuses hub-home', function () {
  installMinimalDom();
  var screen = buildWatchlistFixture();
  document.registerTree(screen);

  screen.querySelector('#btn-rename').focus();
  var handled = handleKeyNav(screen, keyEvent(ARROW_LEFT));
  assert.equal(handled, true);
  assert.equal(document.activeElement.id, 'hub-home');
});

test('Right from hub-home focuses btn-rename (aligned on Y)', function () {
  installMinimalDom();
  var screen = buildWatchlistFixture();
  document.registerTree(screen);

  screen.querySelector('#hub-home').focus();
  var handled = handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  assert.equal(handled, true);
  // hub-home centerY=120, btn-rename centerY=120 — perfect cross-axis alignment
  assert.equal(document.activeElement.id, 'btn-rename');
});
