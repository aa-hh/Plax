import test from 'node:test';
import assert from 'node:assert/strict';

import { installMinimalDom, createElement, layout } from './helpers/minimal-dom.js';
import { handleKeyNav } from '../src/ui/focus.js';

var ARROW_DOWN  = 40;
var ARROW_UP    = 38;
var ARROW_RIGHT = 39;
var ARROW_LEFT  = 37;

function keyEvent(code) {
  return { keyCode: code, preventDefault: function () {} };
}

function focusable(id, className) {
  var el = createElement('button');
  el.id = id;
  el.className = className || 'btn';
  el.setAttribute('tabindex', '0');
  return el;
}

/**
 * Home screen layout:
 *
 * Sidebar (x=0, w=200):
 *   hub-home      (0, 100, 200, 40)   centerY=120
 *   hub-watchlist (0, 150, 200, 40)   centerY=170
 *
 * Row 1 "Continue Watching" (y=300, h=250):
 *   continue-0  (220, 300, 172, 250)  centerX=306  centerY=425
 *   continue-1  (402, 300, 172, 250)  centerX=488
 *   continue-2  (584, 300, 172, 250)  centerX=670
 *
 * Row 2 "Recent" label link + cards (y=600, h=250):
 *   watchlist-link (220, 560, 120, 30) centerX=280  centerY=575
 *   recent-0  (220, 600, 172, 250)   centerX=306  centerY=725
 *   recent-1  (402, 600, 172, 250)   centerX=488
 *   recent-2  (584, 600, 172, 250)   centerX=670
 *   recent-3  (766, 600, 172, 250)   centerX=852
 */
function buildHomeFixture() {
  var screen = createElement('div');
  screen.className = 'screen screen-home';

  var hubHome      = focusable('hub-home',      'browsing-hub-item active');
  var hubWatchlist = focusable('hub-watchlist',  'browsing-hub-item');
  layout(hubHome,      0,   100, 200, 40);
  layout(hubWatchlist, 0,   150, 200, 40);

  var continue0 = focusable('continue-0', 'media-card card row-item');
  var continue1 = focusable('continue-1', 'media-card card row-item');
  var continue2 = focusable('continue-2', 'media-card card row-item');
  layout(continue0, 220, 300, 172, 250);
  layout(continue1, 402, 300, 172, 250);
  layout(continue2, 584, 300, 172, 250);

  var watchlistLink = focusable('watchlist-link', 'watchlist-row-link');
  layout(watchlistLink, 220, 560, 120, 30);

  var recent0 = focusable('recent-0', 'media-card card row-item');
  var recent1 = focusable('recent-1', 'media-card card row-item');
  var recent2 = focusable('recent-2', 'media-card card row-item');
  var recent3 = focusable('recent-3', 'media-card card row-item');
  layout(recent0, 220, 600, 172, 250);
  layout(recent1, 402, 600, 172, 250);
  layout(recent2, 584, 600, 172, 250);
  layout(recent3, 766, 600, 172, 250);

  [hubHome, hubWatchlist,
   continue0, continue1, continue2,
   watchlistLink, recent0, recent1, recent2, recent3
  ].forEach(function (el) { screen.appendChild(el); });

  return screen;
}

// ---------------------------------------------------------------------------

test('Right from hub-home focuses nearest content card', function () {
  installMinimalDom();
  var screen = buildHomeFixture();
  document.registerTree(screen);

  screen.querySelector('#hub-home').focus();
  var handled = handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  assert.equal(handled, true);
  // continue-0 is directly to the right; hub-watchlist is below hub-home in
  // the sidebar and should NOT win.
  assert.equal(document.activeElement.id, 'continue-0');
});

test('Right from continue-1 focuses continue-2', function () {
  installMinimalDom();
  var screen = buildHomeFixture();
  document.registerTree(screen);

  screen.querySelector('#continue-1').focus();
  handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  assert.equal(document.activeElement.id, 'continue-2');
});

test('Left from continue-2 focuses continue-1', function () {
  installMinimalDom();
  var screen = buildHomeFixture();
  document.registerTree(screen);

  screen.querySelector('#continue-2').focus();
  handleKeyNav(screen, keyEvent(ARROW_LEFT));
  assert.equal(document.activeElement.id, 'continue-1');
});

test('Left from continue-1 focuses continue-0', function () {
  installMinimalDom();
  var screen = buildHomeFixture();
  document.registerTree(screen);

  screen.querySelector('#continue-1').focus();
  handleKeyNav(screen, keyEvent(ARROW_LEFT));
  assert.equal(document.activeElement.id, 'continue-0');
});

test('Down from continue-2 focuses recent-2 (same column)', function () {
  installMinimalDom();
  var screen = buildHomeFixture();
  document.registerTree(screen);

  screen.querySelector('#continue-2').focus();
  handleKeyNav(screen, keyEvent(ARROW_DOWN));
  // continue-2 and recent-2 share centerX≈670; misalign penalty picks recent-2
  assert.equal(document.activeElement.id, 'recent-2');
});

test('Up from recent-1 focuses continue-1 (same column)', function () {
  installMinimalDom();
  var screen = buildHomeFixture();
  document.registerTree(screen);

  screen.querySelector('#recent-1').focus();
  handleKeyNav(screen, keyEvent(ARROW_UP));
  assert.equal(document.activeElement.id, 'continue-1');
});

test('Left from recent-0 focuses watchlist-link before sidebar', function () {
  installMinimalDom();
  var screen = buildHomeFixture();
  document.registerTree(screen);

  screen.querySelector('#recent-0').focus();
  handleKeyNav(screen, keyEvent(ARROW_LEFT));
  // watchlist-link cross-offset=150 beats hub-home cross-offset=605
  assert.equal(document.activeElement.id, 'watchlist-link');
});

test('Left from watchlist-link focuses hub-watchlist (closer Y)', function () {
  installMinimalDom();
  var screen = buildHomeFixture();
  document.registerTree(screen);

  screen.querySelector('#watchlist-link').focus();
  handleKeyNav(screen, keyEvent(ARROW_LEFT));
  // hub-watchlist centerY=170 cross=405; hub-home centerY=120 cross=455
  assert.equal(document.activeElement.id, 'hub-watchlist');
});

test('Down from hub-home focuses hub-watchlist (within sidebar)', function () {
  installMinimalDom();
  var screen = buildHomeFixture();
  document.registerTree(screen);

  screen.querySelector('#hub-home').focus();
  handleKeyNav(screen, keyEvent(ARROW_DOWN));
  assert.equal(document.activeElement.id, 'hub-watchlist');
});

test('Up from hub-watchlist focuses hub-home (within sidebar)', function () {
  installMinimalDom();
  var screen = buildHomeFixture();
  document.registerTree(screen);

  screen.querySelector('#hub-watchlist').focus();
  handleKeyNav(screen, keyEvent(ARROW_UP));
  assert.equal(document.activeElement.id, 'hub-home');
});

test('Right from hub-watchlist focuses a content element (not another sidebar item)', function () {
  installMinimalDom();
  var screen = buildHomeFixture();
  document.registerTree(screen);

  screen.querySelector('#hub-watchlist').focus();
  var handled = handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  assert.equal(handled, true);
  var activeId = document.activeElement.id;
  assert.notEqual(activeId, 'hub-home');
  assert.notEqual(activeId, 'hub-watchlist');
});
