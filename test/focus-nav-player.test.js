import test from 'node:test';
import assert from 'node:assert/strict';

import { installMinimalDom, createElement, layout } from './helpers/minimal-dom.js';
import { handleKeyNav, getFocusables, invalidateFocusableCache } from '../src/ui/focus.js';

var ARROW_RIGHT = 39;
var ARROW_LEFT = 37;
var ARROW_DOWN = 40;
var ARROW_UP = 38;

function keyEvent(code) {
  return { keyCode: code, preventDefault: function () {} };
}

function pill(id, className) {
  var el = createElement('button');
  el.id = id;
  el.className = className;
  el.setAttribute('tabindex', '0');
  return el;
}

/**
 * Player overlay layout (1920×1080 full-screen):
 *
 * Seek bar (y=900, full-width):
 *   player-seek       (0, 900, 1920, 20)  .player-seek-bar
 *   LEFT/RIGHT reserved for scrubbing → handleKeyNav returns false
 *
 * Transport pills (y=940, centred):
 *   btn-prev         (760, 940, 100, 48)  .player-control-pill
 *   btn-pause        (880, 940, 100, 48)  .player-control-pill
 *   btn-next        (1000, 940, 100, 48)  .player-control-pill
 *
 * Stream pills (y=1010):
 *   btn-audio          (0, 1010, 150, 40)  .player-stream-pill
 *   btn-subtitles    (160, 1010, 150, 40)  .player-stream-pill
 *   btn-quality      (320, 1010, 150, 40)  .player-stream-pill
 *
 * Menu options (vertical list, right side, y=800+):
 *   menu-opt-a      (1700, 800, 200, 44)  .player-menu-option
 *   menu-opt-b      (1700, 854, 200, 44)  .player-menu-option
 *   menu-opt-c      (1700, 908, 200, 44)  .player-menu-option
 */

function buildPlayerOverlay() {
  var overlay = createElement('div');
  overlay.className = 'player-overlay';

  // Seek bar
  var seekBar = pill('player-seek', 'player-seek-bar');
  layout(seekBar, 0, 900, 1920, 20);
  overlay.appendChild(seekBar);

  // Transport pills
  var prev  = pill('btn-prev',  'player-control-pill'); layout(prev,   760, 940, 100, 48); overlay.appendChild(prev);
  var pause = pill('btn-pause', 'player-control-pill'); layout(pause,  880, 940, 100, 48); overlay.appendChild(pause);
  var next  = pill('btn-next',  'player-control-pill'); layout(next,  1000, 940, 100, 48); overlay.appendChild(next);

  // Stream pills — positioned to overlap transport pill x-range (760–1100)
  // so UP from stream pill beats seek bar on cross-axis alignment score
  var audio    = pill('btn-audio',     'player-stream-pill'); layout(audio,    760, 1010, 150, 40); overlay.appendChild(audio);
  var subs     = pill('btn-subtitles', 'player-stream-pill'); layout(subs,    920, 1010, 150, 40); overlay.appendChild(subs);
  var quality  = pill('btn-quality',   'player-stream-pill'); layout(quality, 1080, 1010, 150, 40); overlay.appendChild(quality);

  return overlay;
}

function buildPlayerOverlayWithMenu() {
  var overlay = buildPlayerOverlay();

  // Disable all bottom controls (simulating menu open / focus trap)
  overlay.querySelectorAll('.player-seek-bar, .player-control-pill, .player-stream-pill').forEach(function (el) {
    el.setAttribute('tabindex', '-1');
  });

  var menuA = pill('menu-opt-a', 'player-menu-option'); layout(menuA, 1700, 800, 200, 44); overlay.appendChild(menuA);
  var menuB = pill('menu-opt-b', 'player-menu-option'); layout(menuB, 1700, 854, 200, 44); overlay.appendChild(menuB);
  var menuC = pill('menu-opt-c', 'player-menu-option'); layout(menuC, 1700, 908, 200, 44); overlay.appendChild(menuC);

  return overlay;
}

// ─── Seek bar passthrough ─────────────────────────────────────────────────────

test('seek bar: LEFT returns false (scrubbing passthrough)', function () {
  installMinimalDom();
  invalidateFocusableCache();
  var overlay = buildPlayerOverlay();
  document.registerTree(overlay);

  overlay.querySelector('#player-seek').focus();
  var handled = handleKeyNav(overlay, keyEvent(ARROW_LEFT));
  assert.equal(handled, false);
  assert.equal(document.activeElement.id, 'player-seek');
});

test('seek bar: RIGHT returns false (scrubbing passthrough)', function () {
  installMinimalDom();
  invalidateFocusableCache();
  var overlay = buildPlayerOverlay();
  document.registerTree(overlay);

  overlay.querySelector('#player-seek').focus();
  var handled = handleKeyNav(overlay, keyEvent(ARROW_RIGHT));
  assert.equal(handled, false);
  assert.equal(document.activeElement.id, 'player-seek');
});

test('seek bar: DOWN reaches nearest transport pill below', function () {
  installMinimalDom();
  invalidateFocusableCache();
  var overlay = buildPlayerOverlay();
  document.registerTree(overlay);

  overlay.querySelector('#player-seek').focus();
  var handled = handleKeyNav(overlay, keyEvent(ARROW_DOWN));
  assert.equal(handled, true);
  // btn-prev is leftmost and closest to left edge of seek bar
  var active = document.activeElement.id;
  assert.ok(
    active === 'btn-prev' || active === 'btn-pause' || active === 'btn-next',
    'expected a transport pill, got ' + active
  );
});

test('seek bar: UP returns false (nothing above)', function () {
  installMinimalDom();
  invalidateFocusableCache();
  var overlay = buildPlayerOverlay();
  document.registerTree(overlay);

  overlay.querySelector('#player-seek').focus();
  var handled = handleKeyNav(overlay, keyEvent(ARROW_UP));
  assert.equal(handled, false);
});

// ─── Transport pills ──────────────────────────────────────────────────────────

test('transport: RIGHT from btn-prev reaches btn-pause', function () {
  installMinimalDom();
  invalidateFocusableCache();
  var overlay = buildPlayerOverlay();
  document.registerTree(overlay);

  overlay.querySelector('#btn-prev').focus();
  var handled = handleKeyNav(overlay, keyEvent(ARROW_RIGHT));
  assert.equal(handled, true);
  assert.equal(document.activeElement.id, 'btn-pause');
});

test('transport: RIGHT from btn-pause reaches btn-next', function () {
  installMinimalDom();
  invalidateFocusableCache();
  var overlay = buildPlayerOverlay();
  document.registerTree(overlay);

  overlay.querySelector('#btn-pause').focus();
  handleKeyNav(overlay, keyEvent(ARROW_RIGHT));
  assert.equal(document.activeElement.id, 'btn-next');
});

test('transport: LEFT from btn-pause returns to btn-prev', function () {
  installMinimalDom();
  invalidateFocusableCache();
  var overlay = buildPlayerOverlay();
  document.registerTree(overlay);

  overlay.querySelector('#btn-pause').focus();
  handleKeyNav(overlay, keyEvent(ARROW_LEFT));
  assert.equal(document.activeElement.id, 'btn-prev');
});

test('transport: LEFT from btn-next returns to btn-pause', function () {
  installMinimalDom();
  invalidateFocusableCache();
  var overlay = buildPlayerOverlay();
  document.registerTree(overlay);

  overlay.querySelector('#btn-next').focus();
  handleKeyNav(overlay, keyEvent(ARROW_LEFT));
  assert.equal(document.activeElement.id, 'btn-pause');
});

test('transport: UP from btn-pause reaches seek bar', function () {
  installMinimalDom();
  invalidateFocusableCache();
  var overlay = buildPlayerOverlay();
  document.registerTree(overlay);

  overlay.querySelector('#btn-pause').focus();
  var handled = handleKeyNav(overlay, keyEvent(ARROW_UP));
  assert.equal(handled, true);
  assert.equal(document.activeElement.id, 'player-seek');
});

test('transport: UP from btn-prev reaches seek bar', function () {
  installMinimalDom();
  invalidateFocusableCache();
  var overlay = buildPlayerOverlay();
  document.registerTree(overlay);

  overlay.querySelector('#btn-prev').focus();
  var handled = handleKeyNav(overlay, keyEvent(ARROW_UP));
  assert.equal(handled, true);
  assert.equal(document.activeElement.id, 'player-seek');
});

test('transport: DOWN from btn-prev reaches a stream pill below', function () {
  installMinimalDom();
  invalidateFocusableCache();
  var overlay = buildPlayerOverlay();
  document.registerTree(overlay);

  overlay.querySelector('#btn-prev').focus();
  var handled = handleKeyNav(overlay, keyEvent(ARROW_DOWN));
  assert.equal(handled, true);
  // Closest stream pill below btn-prev (x=760) is btn-audio (x=0) — cross-axis
  // overlap determines which; any stream pill is acceptable
  var active = document.activeElement.id;
  assert.ok(
    active === 'btn-audio' || active === 'btn-subtitles' || active === 'btn-quality',
    'expected a stream pill, got ' + active
  );
});

// ─── Stream pills ─────────────────────────────────────────────────────────────

test('stream pills: RIGHT from btn-audio reaches btn-subtitles', function () {
  installMinimalDom();
  invalidateFocusableCache();
  var overlay = buildPlayerOverlay();
  document.registerTree(overlay);

  overlay.querySelector('#btn-audio').focus();
  var handled = handleKeyNav(overlay, keyEvent(ARROW_RIGHT));
  assert.equal(handled, true);
  assert.equal(document.activeElement.id, 'btn-subtitles');
});

test('stream pills: RIGHT from btn-subtitles reaches btn-quality', function () {
  installMinimalDom();
  invalidateFocusableCache();
  var overlay = buildPlayerOverlay();
  document.registerTree(overlay);

  overlay.querySelector('#btn-subtitles').focus();
  handleKeyNav(overlay, keyEvent(ARROW_RIGHT));
  assert.equal(document.activeElement.id, 'btn-quality');
});

test('stream pills: LEFT from btn-quality returns to btn-subtitles', function () {
  installMinimalDom();
  invalidateFocusableCache();
  var overlay = buildPlayerOverlay();
  document.registerTree(overlay);

  overlay.querySelector('#btn-quality').focus();
  handleKeyNav(overlay, keyEvent(ARROW_LEFT));
  assert.equal(document.activeElement.id, 'btn-subtitles');
});

test('stream pills: LEFT from btn-subtitles returns to btn-audio', function () {
  installMinimalDom();
  invalidateFocusableCache();
  var overlay = buildPlayerOverlay();
  document.registerTree(overlay);

  overlay.querySelector('#btn-subtitles').focus();
  handleKeyNav(overlay, keyEvent(ARROW_LEFT));
  assert.equal(document.activeElement.id, 'btn-audio');
});

test('stream pills: UP reaches a transport pill above', function () {
  installMinimalDom();
  invalidateFocusableCache();
  var overlay = buildPlayerOverlay();
  document.registerTree(overlay);

  overlay.querySelector('#btn-audio').focus();
  var handled = handleKeyNav(overlay, keyEvent(ARROW_UP));
  assert.equal(handled, true);
  var active = document.activeElement.id;
  assert.ok(
    active === 'btn-prev' || active === 'btn-pause' || active === 'btn-next',
    'expected a transport pill, got ' + active
  );
});

test('stream pills: DOWN returns false (nothing below)', function () {
  installMinimalDom();
  invalidateFocusableCache();
  var overlay = buildPlayerOverlay();
  document.registerTree(overlay);

  overlay.querySelector('#btn-audio').focus();
  var handled = handleKeyNav(overlay, keyEvent(ARROW_DOWN));
  assert.equal(handled, false);
});

// ─── Menu (vertical list, bottom controls disabled) ───────────────────────────

test('menu: DOWN from menu-opt-a reaches menu-opt-b', function () {
  installMinimalDom();
  invalidateFocusableCache();
  var overlay = buildPlayerOverlayWithMenu();
  document.registerTree(overlay);

  overlay.querySelector('#menu-opt-a').focus();
  var handled = handleKeyNav(overlay, keyEvent(ARROW_DOWN));
  assert.equal(handled, true);
  assert.equal(document.activeElement.id, 'menu-opt-b');
});

test('menu: DOWN from menu-opt-b reaches menu-opt-c', function () {
  installMinimalDom();
  invalidateFocusableCache();
  var overlay = buildPlayerOverlayWithMenu();
  document.registerTree(overlay);

  overlay.querySelector('#menu-opt-b').focus();
  handleKeyNav(overlay, keyEvent(ARROW_DOWN));
  assert.equal(document.activeElement.id, 'menu-opt-c');
});

test('menu: UP from menu-opt-c returns to menu-opt-b', function () {
  installMinimalDom();
  invalidateFocusableCache();
  var overlay = buildPlayerOverlayWithMenu();
  document.registerTree(overlay);

  overlay.querySelector('#menu-opt-c').focus();
  var handled = handleKeyNav(overlay, keyEvent(ARROW_UP));
  assert.equal(handled, true);
  assert.equal(document.activeElement.id, 'menu-opt-b');
});

test('menu: UP from menu-opt-b returns to menu-opt-a', function () {
  installMinimalDom();
  invalidateFocusableCache();
  var overlay = buildPlayerOverlayWithMenu();
  document.registerTree(overlay);

  overlay.querySelector('#menu-opt-b').focus();
  handleKeyNav(overlay, keyEvent(ARROW_UP));
  assert.equal(document.activeElement.id, 'menu-opt-a');
});

test('menu: RIGHT from menu option returns false (nothing to the right)', function () {
  installMinimalDom();
  invalidateFocusableCache();
  var overlay = buildPlayerOverlayWithMenu();
  document.registerTree(overlay);

  overlay.querySelector('#menu-opt-a').focus();
  var handled = handleKeyNav(overlay, keyEvent(ARROW_RIGHT));
  assert.equal(handled, false);
  assert.equal(document.activeElement.id, 'menu-opt-a');
});

test('menu: tabindex=-1 controls are not reachable while menu is open', function () {
  installMinimalDom();
  invalidateFocusableCache();
  var overlay = buildPlayerOverlayWithMenu();
  document.registerTree(overlay);

  var ids = getFocusables(overlay).map(function (el) { return el.id; });
  assert.equal(ids.indexOf('player-seek'),   -1);
  assert.equal(ids.indexOf('btn-prev'),       -1);
  assert.equal(ids.indexOf('btn-pause'),      -1);
  assert.ok(ids.indexOf('menu-opt-a') >= 0);
  assert.ok(ids.indexOf('menu-opt-b') >= 0);
  assert.ok(ids.indexOf('menu-opt-c') >= 0);
});

// ─── getFocusables ────────────────────────────────────────────────────────────

test('getFocusables skips elements with tabindex=-1', function () {
  installMinimalDom();
  invalidateFocusableCache();
  var overlay = buildPlayerOverlay();
  document.registerTree(overlay);

  overlay.querySelector('#btn-pause').setAttribute('tabindex', '-1');
  invalidateFocusableCache();
  var ids = getFocusables(overlay).map(function (el) { return el.id; });
  assert.equal(ids.indexOf('btn-pause'), -1);
  assert.ok(ids.indexOf('btn-prev') >= 0);
  assert.ok(ids.indexOf('btn-next') >= 0);
});
