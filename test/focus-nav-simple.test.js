import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { installMinimalDom, createElement, layout } from './helpers/minimal-dom.js';
import { handleKeyNav, getFocusables } from '../src/ui/focus.js';

var ARROW_DOWN  = 40;
var ARROW_UP    = 38;
var ARROW_RIGHT = 39;
var ARROW_LEFT  = 37;

var pairingSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/ui/screens/pairingScreen.js'),
  'utf8'
);

function keyEvent(code) {
  return { keyCode: code, preventDefault: function () {} };
}

function btn(id) {
  var el = createElement('button');
  el.id = id;
  el.className = 'btn';
  el.setAttribute('tabindex', '0');
  return el;
}

// ---------------------------------------------------------------------------
// Source-level check (attribute is harmless markup now but still present)
// ---------------------------------------------------------------------------

test('pairing screen uses sequential focus mode', function () {
  assert.match(pairingSrc, /setAttribute\('data-focus-mode',\s*'sequential'\)/);
  assert.match(pairingSrc, /attachFocusNav\(screen\)/);
});

// ---------------------------------------------------------------------------
// Geometric navigation — vertical stack
//
//   btn-first  (300, 100, 200, 50)  centerY=125
//   btn-second (300, 180, 200, 50)  centerY=205
// ---------------------------------------------------------------------------

test('Down moves to next focusable below', function () {
  installMinimalDom();
  var screen = createElement('div');
  screen.className = 'screen';

  var first  = btn('btn-first');
  var second = btn('btn-second');
  layout(first,  300, 100, 200, 50);
  layout(second, 300, 180, 200, 50);
  screen.appendChild(first);
  screen.appendChild(second);
  document.registerTree(screen);

  first.focus();
  var handled = handleKeyNav(screen, keyEvent(ARROW_DOWN));
  assert.equal(handled, true);
  assert.equal(document.activeElement.id, 'btn-second');
});

test('Up moves to previous focusable above', function () {
  installMinimalDom();
  var screen = createElement('div');
  screen.className = 'screen';

  var first  = btn('btn-first');
  var second = btn('btn-second');
  layout(first,  300, 100, 200, 50);
  layout(second, 300, 180, 200, 50);
  screen.appendChild(first);
  screen.appendChild(second);
  document.registerTree(screen);

  second.focus();
  var handled = handleKeyNav(screen, keyEvent(ARROW_UP));
  assert.equal(handled, true);
  assert.equal(document.activeElement.id, 'btn-first');
});

// ---------------------------------------------------------------------------
// Seek-bar absorption — player-seek-bar class blocks horizontal arrows
// ---------------------------------------------------------------------------

test('Right on seek bar does not move focus', function () {
  installMinimalDom();
  var screen = createElement('div');
  screen.className = 'screen';

  var seek = createElement('div');
  seek.id = 'seek';
  seek.className = 'player-seek-bar';
  seek.setAttribute('tabindex', '0');
  layout(seek, 100, 100, 400, 20);

  var other = btn('other');
  layout(other, 520, 100, 100, 20);

  screen.appendChild(seek);
  screen.appendChild(other);
  document.registerTree(screen);

  seek.focus();
  var handled = handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  // The seek bar should absorb horizontal arrows
  assert.equal(handled, false);
  assert.equal(document.activeElement.id, 'seek');
});

test('Left on seek bar does not move focus', function () {
  installMinimalDom();
  var screen = createElement('div');
  screen.className = 'screen';

  var other = btn('other');
  layout(other, 0, 100, 100, 20);

  var seek = createElement('div');
  seek.id = 'seek';
  seek.className = 'player-seek-bar';
  seek.setAttribute('tabindex', '0');
  layout(seek, 110, 100, 400, 20);

  screen.appendChild(other);
  screen.appendChild(seek);
  document.registerTree(screen);

  seek.focus();
  var handled = handleKeyNav(screen, keyEvent(ARROW_LEFT));
  assert.equal(handled, false);
  assert.equal(document.activeElement.id, 'seek');
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test('No candidates in direction returns false without crash', function () {
  installMinimalDom();
  var screen = createElement('div');
  screen.className = 'screen';

  var lone = btn('lone');
  layout(lone, 300, 100, 200, 50);
  screen.appendChild(lone);
  document.registerTree(screen);

  lone.focus();
  var handled = handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  assert.equal(handled, false);
  assert.equal(document.activeElement.id, 'lone');
});

test('getFocusables excludes elements with tabindex=-1', function () {
  installMinimalDom();
  var screen = createElement('div');
  screen.className = 'screen';

  var visible = btn('visible');
  layout(visible, 100, 100, 200, 50);

  var hidden = btn('excluded');
  hidden.setAttribute('tabindex', '-1');
  layout(hidden, 100, 200, 200, 50);

  screen.appendChild(visible);
  screen.appendChild(hidden);
  document.registerTree(screen);

  var focusables = getFocusables(screen);
  var ids = focusables.map(function (el) { return el.id; });
  assert.ok(ids.indexOf('visible') >= 0, 'visible element should be focusable');
  assert.equal(ids.indexOf('excluded'), -1, 'tabindex=-1 element should be excluded');
});
