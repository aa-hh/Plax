import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { installMinimalDom, createElement } from './helpers/minimal-dom.js';
import { handleKeyNav, getFocusables } from '../src/ui/focus.js';

var ARROW_DOWN = 40;
var ARROW_UP = 38;
var ARROW_RIGHT = 39;

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

test('pairing screen uses sequential focus mode', function () {
  assert.match(pairingSrc, /setAttribute\('data-focus-mode',\s*'sequential'\)/);
  assert.match(pairingSrc, /attachFocusNav\(screen\)/);
});

test('sequential mode: Down moves to next focusable in DOM order', function () {
  installMinimalDom();
  var screen = createElement('div');
  screen.className = 'screen pairing-screen';
  screen.setAttribute('data-focus-mode', 'sequential');
  screen.appendChild(btn('first'));
  screen.appendChild(btn('second'));
  document.registerTree(screen);

  screen.querySelector('#first').focus();
  var ev = keyEvent(ARROW_DOWN);
  var handled = handleKeyNav(screen, ev);
  assert.equal(handled, true);
  assert.equal(document.activeElement.id, 'second');
});

test('sequential mode: Up moves to previous focusable', function () {
  installMinimalDom();
  var screen = createElement('div');
  screen.setAttribute('data-focus-mode', 'sequential');
  screen.appendChild(btn('first'));
  screen.appendChild(btn('second'));
  document.registerTree(screen);

  screen.querySelector('#second').focus();
  handleKeyNav(screen, keyEvent(ARROW_UP));
  assert.equal(document.activeElement.id, 'first');
});

test('sequential mode: Right advances like Down', function () {
  installMinimalDom();
  var screen = createElement('div');
  screen.setAttribute('data-focus-mode', 'sequential');
  screen.appendChild(btn('a'));
  screen.appendChild(btn('b'));
  document.registerTree(screen);

  screen.querySelector('#a').focus();
  handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  assert.equal(document.activeElement.id, 'b');
});

test('sequential mode: single focusable does not trap arrow keys', function () {
  installMinimalDom();
  var screen = createElement('div');
  screen.setAttribute('data-focus-mode', 'sequential');
  screen.appendChild(btn('only'));
  document.registerTree(screen);

  screen.querySelector('#only').focus();
  var ev = keyEvent(ARROW_DOWN);
  assert.equal(handleKeyNav(screen, ev), false);
  assert.equal(document.activeElement.id, 'only');
});

test('sequential root requires active element inside sequential zone', function () {
  installMinimalDom();
  var overlay = createElement('div');
  overlay.className = 'player-overlay';
  var seek = btn('player-seek');
  seek.className = 'player-seek-bar';
  var taskbar = createElement('div');
  taskbar.setAttribute('data-focus-mode', 'sequential');
  taskbar.appendChild(btn('btn-pause'));
  overlay.appendChild(seek);
  overlay.appendChild(taskbar);
  document.registerTree(overlay);

  seek.focus();
  var ev = keyEvent(ARROW_RIGHT);
  var handled = handleKeyNav(overlay, ev);
  assert.equal(handled, false);
  assert.equal(document.activeElement.id, 'player-seek');
});

test('sequential mode: zone nav does not apply on pairing fixture', function () {
  installMinimalDom();
  var screen = createElement('div');
  screen.className = 'screen screen-center pairing-screen';
  screen.setAttribute('data-focus-mode', 'sequential');
  var actions = createElement('div');
  actions.className = 'pairing-actions';
  actions.appendChild(btn('retry'));
  screen.appendChild(actions);
  document.registerTree(screen);

  assert.equal(getFocusables(screen).length, 1);
  screen.querySelector('#retry').focus();
  var ev = keyEvent(ARROW_DOWN);
  assert.equal(handleKeyNav(screen, ev), false);
});
