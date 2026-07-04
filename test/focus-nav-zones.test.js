import test from 'node:test';
import assert from 'node:assert/strict';

import { installMinimalDom, createElement, layout } from './helpers/minimal-dom.js';
import { handleKeyNav, invalidateFocusableCache } from '../src/ui/focus.js';

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

function zone(id, name, x, y, w, h) {
  var el = createElement('div');
  if (id) el.id = id;
  el.setAttribute('data-focus-zone', name);
  layout(el, x, y, w, h);
  return el;
}

// ---------------------------------------------------------------------------
// 1. Flat screens unchanged — rebuild buildHomeFixture geometry from
// focus-nav-home.test.js WITHOUT zones; a handful of representative moves
// must match today's results (belt-and-braces on top of the untouched suites).
// ---------------------------------------------------------------------------

function buildHomeFixtureNoZones() {
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

  var recent0 = focusable('recent-0', 'media-card card row-item');
  var recent1 = focusable('recent-1', 'media-card card row-item');
  var recent2 = focusable('recent-2', 'media-card card row-item');
  layout(recent0, 220, 600, 172, 250);
  layout(recent1, 402, 600, 172, 250);
  layout(recent2, 584, 600, 172, 250);

  [hubHome, hubWatchlist, continue0, continue1, continue2,
   recent0, recent1, recent2
  ].forEach(function (el) { screen.appendChild(el); });

  return screen;
}

test('flat screens unchanged', function () {
  installMinimalDom();
  var screen = buildHomeFixtureNoZones();
  document.registerTree(screen);

  screen.querySelector('#hub-home').focus();
  handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  assert.equal(document.activeElement.id, 'continue-0');

  screen.querySelector('#continue-1').focus();
  handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  assert.equal(document.activeElement.id, 'continue-2');

  screen.querySelector('#continue-2').focus();
  handleKeyNav(screen, keyEvent(ARROW_DOWN));
  assert.equal(document.activeElement.id, 'recent-2');

  screen.querySelector('#recent-1').focus();
  handleKeyNav(screen, keyEvent(ARROW_UP));
  assert.equal(document.activeElement.id, 'continue-1');
});

// ---------------------------------------------------------------------------
// 2. Intra-zone containment — two stacked rail zones; RIGHT from the last
// card of rail 1 must NOT jump to a geometrically-near card in rail 2 when
// rail 1 has no right-candidate and rail 2's zone is not to the right
// (expect no move -> null).
// ---------------------------------------------------------------------------

function buildTwoRailFixture() {
  var screen = createElement('div');
  screen.className = 'screen';

  var rail1 = zone('rail1', 'rail-1', 200, 100, 400, 200);
  var r1c0 = focusable('r1c0', 'card row-item');
  var r1c1 = focusable('r1c1', 'card row-item');
  layout(r1c0, 200, 100, 180, 200);
  layout(r1c1, 400, 100, 180, 200);
  rail1.appendChild(r1c0);
  rail1.appendChild(r1c1);

  var rail2 = zone('rail2', 'rail-2', 200, 400, 400, 200);
  var r2c0 = focusable('r2c0', 'card row-item');
  var r2c1 = focusable('r2c1', 'card row-item');
  layout(r2c0, 200, 400, 180, 200);
  layout(r2c1, 400, 400, 180, 200);
  rail2.appendChild(r2c0);
  rail2.appendChild(r2c1);

  screen.appendChild(rail1);
  screen.appendChild(rail2);
  return screen;
}

test('intra-zone containment', function () {
  installMinimalDom();
  var screen = buildTwoRailFixture();
  document.registerTree(screen);

  screen.querySelector('#r1c1').focus();
  var handled = handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  // r1c1 is the last card of rail 1: no right-candidate inside the zone, and
  // rail 2 (stacked directly below, not to the right) is not a valid
  // cross-zone RIGHT candidate either. No move.
  assert.equal(handled, false);
  assert.equal(document.activeElement.id, 'r1c1');
});

// ---------------------------------------------------------------------------
// 3. Cross-zone alignment entry — rails vertically stacked with rail 2
// offset 90px right of rail 1; DOWN from rail-1 card N lands the rail-2
// card whose center-x is nearest (NOT the flat-geometry winner).
// ---------------------------------------------------------------------------

function buildOffsetRailFixture() {
  var screen = createElement('div');
  screen.className = 'screen';

  // Rail 1: cards at x=200 (centerX=290) and x=400 (centerX=490).
  var rail1 = zone('rail1', 'rail-1', 200, 100, 400, 200);
  var r1c0 = focusable('r1c0', 'card row-item');
  var r1c1 = focusable('r1c1', 'card row-item');
  layout(r1c0, 200, 100, 180, 200);
  layout(r1c1, 400, 100, 180, 200);
  rail1.appendChild(r1c0);
  rail1.appendChild(r1c1);

  // Rail 2 offset +90px right: cards at x=290 (centerX=380) and x=490 (centerX=580).
  var rail2 = zone('rail2', 'rail-2', 290, 400, 400, 200);
  var r2c0 = focusable('r2c0', 'card row-item');
  var r2c1 = focusable('r2c1', 'card row-item');
  layout(r2c0, 290, 400, 180, 200);
  layout(r2c1, 490, 400, 180, 200);
  rail2.appendChild(r2c0);
  rail2.appendChild(r2c1);

  screen.appendChild(rail1);
  screen.appendChild(rail2);
  return screen;
}

test('cross-zone alignment entry', function () {
  installMinimalDom();
  var screen = buildOffsetRailFixture();
  document.registerTree(screen);

  // r1c0 centerX=290. Flat geometry over ALL cards (ignoring zones) would
  // score r2c0 (centerX=380, gap=90) as the nearest card overlapping/closest
  // in the cross axis vs r2c1 (centerX=580); but entry is via the ZONE's
  // container rect (rail2 spans x=290..690, so it's the sole DOWN zone
  // candidate) and then cross-axis alignment inside it picks the child whose
  // center-x is nearest r1c0's center-x (290): r2c0 (380) beats r2c1 (580).
  screen.querySelector('#r1c0').focus();
  handleKeyNav(screen, keyEvent(ARROW_DOWN));
  assert.equal(document.activeElement.id, 'r2c0');
});

test('cross-zone alignment entry picks the nearer child from a different column', function () {
  installMinimalDom();
  // Fresh DOM/fresh zone memory: from r1c1 (centerX=490), the nearest rail-2
  // child by center-x is r2c1 (580, delta 90) vs r2c0 (380, delta 110).
  var screen = buildOffsetRailFixture();
  document.registerTree(screen);

  screen.querySelector('#r1c1').focus();
  handleKeyNav(screen, keyEvent(ARROW_DOWN));
  assert.equal(document.activeElement.id, 'r2c1');
});

// ---------------------------------------------------------------------------
// 4. Focus memory round-trip — navigate RIGHT twice inside rail 1 (memory =
// card 2), DOWN to rail 2, UP again -> focus returns to rail-1 card 2, not
// the aligned card.
// ---------------------------------------------------------------------------

function buildThreeCardRailFixture() {
  var screen = createElement('div');
  screen.className = 'screen';

  var rail1 = zone('rail1', 'rail-1', 200, 100, 600, 200);
  var r1c0 = focusable('r1c0', 'card row-item');
  var r1c1 = focusable('r1c1', 'card row-item');
  var r1c2 = focusable('r1c2', 'card row-item');
  layout(r1c0, 200, 100, 180, 200);
  layout(r1c1, 400, 100, 180, 200);
  layout(r1c2, 600, 100, 180, 200);
  rail1.appendChild(r1c0);
  rail1.appendChild(r1c1);
  rail1.appendChild(r1c2);

  // Rail 2 aligned directly under rail 1 (same x span); its card centered
  // under r1c0 so plain alignment would pick r2c0 if memory didn't win.
  var rail2 = zone('rail2', 'rail-2', 200, 400, 600, 200);
  var r2c0 = focusable('r2c0', 'card row-item');
  layout(r2c0, 200, 400, 180, 200);
  rail2.appendChild(r2c0);

  screen.appendChild(rail1);
  screen.appendChild(rail2);
  return screen;
}

test('focus memory round-trip', function () {
  installMinimalDom();
  var screen = buildThreeCardRailFixture();
  document.registerTree(screen);

  screen.querySelector('#r1c0').focus();
  handleKeyNav(screen, keyEvent(ARROW_RIGHT)); // -> r1c1
  handleKeyNav(screen, keyEvent(ARROW_RIGHT)); // -> r1c2 (memory = r1c2)
  assert.equal(document.activeElement.id, 'r1c2');

  handleKeyNav(screen, keyEvent(ARROW_DOWN)); // -> rail 2 (only one child)
  assert.equal(document.activeElement.id, 'r2c0');

  handleKeyNav(screen, keyEvent(ARROW_UP)); // -> back into rail 1 via memory
  assert.equal(document.activeElement.id, 'r1c2');
});

// ---------------------------------------------------------------------------
// 5. Enter-selector pins entry and beats memory — sidebar zone
// (data-focus-zone-enter=".browsing-hub-item") containing two hub items;
// navigate into the sidebar, out, and back in via LEFT from a bottom-row
// card -> always lands the FIRST hub item.
// ---------------------------------------------------------------------------

function buildSidebarEnterFixture() {
  var screen = createElement('div');
  screen.className = 'screen';

  var sidebar = zone('sidebar', 'sidebar', 0, 0, 200, 400);
  sidebar.setAttribute('data-focus-zone-enter', '.browsing-hub-item');
  var hubHome      = focusable('hub-home',      'browsing-hub-item');
  var hubWatchlist = focusable('hub-watchlist', 'browsing-hub-item');
  layout(hubHome,      0, 0,   200, 40);
  layout(hubWatchlist, 0, 100, 200, 40);
  sidebar.appendChild(hubHome);
  sidebar.appendChild(hubWatchlist);

  var topCard = focusable('top-card', 'card row-item');
  layout(topCard, 220, 0, 180, 200);

  var bottomCard = focusable('bottom-card', 'card row-item');
  layout(bottomCard, 220, 300, 180, 200);

  screen.appendChild(sidebar);
  screen.appendChild(topCard);
  screen.appendChild(bottomCard);
  return screen;
}

test('enter-selector pins entry and beats memory', function () {
  installMinimalDom();
  var screen = buildSidebarEnterFixture();
  document.registerTree(screen);

  // Enter the sidebar once and move to the second item, building memory on
  // hub-watchlist (if entry policy didn't pin, memory would win next time).
  screen.querySelector('#top-card').focus();
  handleKeyNav(screen, keyEvent(ARROW_LEFT));
  assert.equal(document.activeElement.id, 'hub-home');
  handleKeyNav(screen, keyEvent(ARROW_DOWN));
  assert.equal(document.activeElement.id, 'hub-watchlist');

  // Leave the sidebar, then re-enter via LEFT from the bottom card.
  handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  assert.notEqual(document.activeElement.id, 'hub-watchlist');

  screen.querySelector('#bottom-card').focus();
  handleKeyNav(screen, keyEvent(ARROW_LEFT));
  // enter-selector always wins over the remembered hub-watchlist.
  assert.equal(document.activeElement.id, 'hub-home');
});

// ---------------------------------------------------------------------------
// 6. Memory dies with the element — build memory on a card, removeChild it,
// re-enter the zone -> alignment fallback picks a surviving card (call
// invalidateFocusableCache() after the removal, as the app does).
// ---------------------------------------------------------------------------

test('memory dies with the element', function () {
  installMinimalDom();
  var screen = buildThreeCardRailFixture();
  document.registerTree(screen);

  screen.querySelector('#r1c0').focus();
  handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  assert.equal(document.activeElement.id, 'r1c2'); // memory = r1c2

  handleKeyNav(screen, keyEvent(ARROW_DOWN));
  assert.equal(document.activeElement.id, 'r2c0');

  // Remove the remembered card from the DOM (as a re-render might).
  var rail1 = screen.querySelector('#rail1');
  var r1c2 = screen.querySelector('#r1c2');
  rail1.removeChild(r1c2);
  invalidateFocusableCache();

  handleKeyNav(screen, keyEvent(ARROW_UP));
  // r1c2 is gone; alignment fallback picks a surviving rail-1 card.
  var activeId = document.activeElement.id;
  assert.ok(activeId === 'r1c0' || activeId === 'r1c1');
});

// ---------------------------------------------------------------------------
// 7. Empty zone skipped — a skeleton zone (no focusables) between two rails
// never wins; DOWN skips over it to the next real rail.
// ---------------------------------------------------------------------------

function buildSkeletonZoneFixture() {
  var screen = createElement('div');
  screen.className = 'screen';

  var rail1 = zone('rail1', 'rail-1', 200, 100, 400, 150);
  var r1c0 = focusable('r1c0', 'card row-item');
  layout(r1c0, 200, 100, 180, 150);
  rail1.appendChild(r1c0);

  // Skeleton zone with no focusable children.
  var skeleton = zone('skeleton', 'rail-skeleton', 200, 300, 400, 150);

  var rail2 = zone('rail2', 'rail-2', 200, 500, 400, 150);
  var r2c0 = focusable('r2c0', 'card row-item');
  layout(r2c0, 200, 500, 180, 150);
  rail2.appendChild(r2c0);

  screen.appendChild(rail1);
  screen.appendChild(skeleton);
  screen.appendChild(rail2);
  return screen;
}

test('empty zone skipped', function () {
  installMinimalDom();
  var screen = buildSkeletonZoneFixture();
  document.registerTree(screen);

  screen.querySelector('#r1c0').focus();
  handleKeyNav(screen, keyEvent(ARROW_DOWN));
  assert.equal(document.activeElement.id, 'r2c0');
});

// ---------------------------------------------------------------------------
// 8. Sidebar wall holds across zones — full-height sidebar zone left of
// content; UP from the top rail with nothing above in content -> no move
// (and never the sidebar).
// ---------------------------------------------------------------------------

function buildSidebarWallFixture() {
  var screen = createElement('div');
  screen.className = 'screen';

  // Full-height sidebar, a browsing-hub-nav-host so isInSideNav() recognizes it.
  var sidebar = createElement('nav');
  sidebar.id = 'sidebar';
  sidebar.className = 'browsing-hub-nav-host';
  sidebar.setAttribute('data-focus-zone', 'sidebar');
  layout(sidebar, 0, 0, 200, 800);
  var hubHome = focusable('hub-home', 'browsing-hub-item');
  layout(hubHome, 0, 0, 200, 40);
  sidebar.appendChild(hubHome);

  var rail1 = zone('rail1', 'rail-1', 220, 0, 400, 150);
  var r1c0 = focusable('r1c0', 'card row-item');
  layout(r1c0, 220, 0, 180, 150);
  rail1.appendChild(r1c0);

  screen.appendChild(sidebar);
  screen.appendChild(rail1);
  return screen;
}

test('sidebar wall holds across zones', function () {
  installMinimalDom();
  var screen = buildSidebarWallFixture();
  document.registerTree(screen);

  screen.querySelector('#r1c0').focus();
  var handled = handleKeyNav(screen, keyEvent(ARROW_UP));
  assert.equal(handled, false);
  assert.equal(document.activeElement.id, 'r1c0');
});

// ---------------------------------------------------------------------------
// 9. Sequential axis keys — host with data-focus-mode="sequential",
// data-focus-sequential-axis="horizontal", three buttons laid out so flat
// geometry would pick button 3 from button 1; RIGHT steps 1->2 (DOM order),
// RIGHT at button 3 returns no move (clamp), DOWN falls through to cross-zone.
// ---------------------------------------------------------------------------

function buildSequentialFixture(withAxis) {
  var screen = createElement('div');
  screen.className = 'screen';

  var host = createElement('div');
  host.id = 'seq-host';
  host.setAttribute('data-focus-mode', 'sequential');
  if (withAxis) host.setAttribute('data-focus-sequential-axis', 'horizontal');
  layout(host, 200, 100, 600, 60);

  var btn1 = focusable('btn1', 'btn');
  var btn2 = focusable('btn2', 'btn');
  var btn3 = focusable('btn3', 'btn');
  // Deliberately out of visual left-to-right order vs DOM order: btn3 sits
  // physically closest to btn1 so flat geometry would pick btn3, but
  // sequential mode must step to btn2 (DOM order) instead.
  layout(btn1, 200, 100, 100, 60);
  layout(btn3, 320, 100, 100, 60);
  layout(btn2, 440, 100, 100, 60);
  host.appendChild(btn1);
  host.appendChild(btn2);
  host.appendChild(btn3);

  var below = focusable('below', 'btn');
  layout(below, 200, 300, 100, 60);

  screen.appendChild(host);
  screen.appendChild(below);
  return screen;
}

test('sequential axis keys', function () {
  installMinimalDom();
  var screen = buildSequentialFixture(true);
  document.registerTree(screen);

  screen.querySelector('#btn1').focus();
  handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  // DOM order step, not geometric nearest (would be btn3).
  assert.equal(document.activeElement.id, 'btn2');

  handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  assert.equal(document.activeElement.id, 'btn3');

  // Clamped at the end: no move.
  var handled = handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  assert.equal(handled, false);
  assert.equal(document.activeElement.id, 'btn3');

  // Perpendicular key falls through to cross-zone geometry.
  handleKeyNav(screen, keyEvent(ARROW_DOWN));
  assert.equal(document.activeElement.id, 'below');
});

// ---------------------------------------------------------------------------
// 10. Sequential without axis is inert — same fixture minus the axis
// attribute -> geometry applies.
// ---------------------------------------------------------------------------

test('sequential without axis is inert', function () {
  installMinimalDom();
  var screen = buildSequentialFixture(false);
  document.registerTree(screen);

  screen.querySelector('#btn1').focus();
  handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  // No axis declared: falls through to flat geometry, which picks the
  // nearest candidate by primary/cross-axis gap — btn3 (adjacent, x=320)
  // rather than DOM-order btn2 (x=440).
  assert.equal(document.activeElement.id, 'btn3');
});

// ---------------------------------------------------------------------------
// 11. Zoneless elements stay reachable on a mixed screen — one zoned rail +
// one zoneless button below it; DOWN from the rail reaches the button; UP
// from the button re-enters the rail via entry policy.
// ---------------------------------------------------------------------------

function buildMixedFixture() {
  var screen = createElement('div');
  screen.className = 'screen';

  var rail1 = zone('rail1', 'rail-1', 200, 100, 400, 150);
  var r1c0 = focusable('r1c0', 'card row-item');
  var r1c1 = focusable('r1c1', 'card row-item');
  layout(r1c0, 200, 100, 180, 150);
  layout(r1c1, 400, 100, 180, 150);
  rail1.appendChild(r1c0);
  rail1.appendChild(r1c1);

  var zonelessBtn = focusable('zoneless-btn', 'btn');
  layout(zonelessBtn, 200, 300, 180, 60);

  screen.appendChild(rail1);
  screen.appendChild(zonelessBtn);
  return screen;
}

test('zoneless elements stay reachable on a mixed screen', function () {
  installMinimalDom();
  var screen = buildMixedFixture();
  document.registerTree(screen);

  screen.querySelector('#r1c0').focus();
  handleKeyNav(screen, keyEvent(ARROW_DOWN));
  assert.equal(document.activeElement.id, 'zoneless-btn');

  handleKeyNav(screen, keyEvent(ARROW_UP));
  // Re-enters rail1 via entry policy (no memory recorded yet on this specific
  // navigation path beyond r1c0, so alignment picks the nearest card by
  // center-x: r1c0 at centerX=290 vs the button's centerX=290).
  assert.equal(document.activeElement.id, 'r1c0');
});
