import test from 'node:test';
import assert from 'node:assert/strict';

import { installMinimalDom, createElement } from './helpers/minimal-dom.js';
import {
  handleKeyNav,
  getZones,
  getFocusables
} from '../src/ui/focus.js';

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

function buildPlayerOverlayFixture() {
  var overlay = createElement('div');
  overlay.className = 'player-overlay';

  var bottom = createElement('div');
  bottom.className = 'player-bottom';

  var seekRow = createElement('div');
  seekRow.className = 'player-seek-row';
  seekRow.setAttribute('data-focus-zone', 'player-seek');
  seekRow.appendChild(pill('player-seek', 'player-seek-bar'));

  var controlBar = createElement('div');
  controlBar.className = 'player-control-bar';

  var taskbar = createElement('div');
  taskbar.className = 'player-taskbar';
  taskbar.setAttribute('data-focus-zone', 'player-taskbar');
  taskbar.setAttribute('data-focus-mode', 'sequential');
  taskbar.setAttribute('data-focus-sequential-axis', 'horizontal');

  var transport = createElement('div');
  transport.className = 'player-transport-col';
  var wingLeft = createElement('div');
  wingLeft.className = 'player-transport-wing player-transport-wing--left';
  var wingRight = createElement('div');
  wingRight.className = 'player-transport-wing player-transport-wing--right';
  var transportCenter = createElement('div');
  transportCenter.className = 'player-transport-center';
  ['btn-prev', 'btn-rewind'].forEach(function (id) {
    wingLeft.appendChild(pill(id, 'player-control-pill'));
  });
  transportCenter.appendChild(pill('btn-pause', 'player-control-pill'));
  ['btn-forward', 'btn-next', 'btn-stop'].forEach(function (id) {
    wingRight.appendChild(pill(id, 'player-control-pill'));
  });
  transport.appendChild(wingLeft);
  transport.appendChild(transportCenter);
  transport.appendChild(wingRight);

  var settings = createElement('div');
  settings.className = 'player-settings-col';
  ['btn-quality', 'btn-audio', 'btn-subtitles'].forEach(function (id) {
    settings.appendChild(pill(id, 'player-stream-pill'));
  });

  taskbar.appendChild(transport);
  taskbar.appendChild(settings);
  controlBar.appendChild(taskbar);
  bottom.appendChild(seekRow);
  bottom.appendChild(controlBar);
  overlay.appendChild(bottom);
  return overlay;
}

test('player zones order seek row before taskbar', function () {
  installMinimalDom();
  var overlay = buildPlayerOverlayFixture();
  document.registerTree(overlay);

  var zones = getZones(overlay);
  var seekZone = overlay.querySelector('[data-focus-zone="player-seek"]');
  var taskbarZone = overlay.querySelector('[data-focus-zone="player-taskbar"]');
  assert.ok(zones.indexOf(seekZone) < zones.indexOf(taskbarZone));
});

test('player taskbar includes transport and settings controls', function () {
  installMinimalDom();
  var overlay = buildPlayerOverlayFixture();
  document.registerTree(overlay);

  var taskbar = overlay.querySelector('[data-focus-zone="player-taskbar"]');
  var ids = getFocusables(taskbar).map(function (el) { return el.id; });
  assert.deepEqual(ids, [
    'btn-prev',
    'btn-rewind',
    'btn-pause',
    'btn-forward',
    'btn-next',
    'btn-stop',
    'btn-quality',
    'btn-audio',
    'btn-subtitles'
  ]);
});

test('Right from last transport control reaches first settings pill', function () {
  installMinimalDom();
  var overlay = buildPlayerOverlayFixture();
  document.registerTree(overlay);

  overlay.querySelector('#btn-stop').focus();
  var handled = handleKeyNav(overlay, keyEvent(ARROW_RIGHT));
  assert.equal(handled, true);
  assert.equal(document.activeElement.id, 'btn-quality');
});

test('Left from first settings pill returns to last transport control', function () {
  installMinimalDom();
  var overlay = buildPlayerOverlayFixture();
  document.registerTree(overlay);

  overlay.querySelector('#btn-quality').focus();
  var handled = handleKeyNav(overlay, keyEvent(ARROW_LEFT));
  assert.equal(handled, true);
  assert.equal(document.activeElement.id, 'btn-stop');
});

test('Left/Right on seek bar does not move focus to taskbar', function () {
  installMinimalDom();
  var overlay = buildPlayerOverlayFixture();
  document.registerTree(overlay);
  overlay.addEventListener('keydown', function (e) {
    if ([ARROW_LEFT, ARROW_UP, ARROW_RIGHT, ARROW_DOWN].indexOf(e.keyCode) >= 0) {
      handleKeyNav(overlay, e);
    }
  });

  overlay.querySelector('#player-seek').focus();
  var handled = handleKeyNav(overlay, keyEvent(ARROW_RIGHT));
  assert.equal(handled, false);
  assert.equal(document.activeElement.id, 'player-seek');

  handled = handleKeyNav(overlay, keyEvent(ARROW_LEFT));
  assert.equal(handled, false);
  assert.equal(document.activeElement.id, 'player-seek');
});

test('Down from seek row focuses first taskbar control', function () {
  installMinimalDom();
  var overlay = buildPlayerOverlayFixture();
  document.registerTree(overlay);

  overlay.querySelector('#player-seek').focus();
  handleKeyNav(overlay, keyEvent(ARROW_DOWN));
  assert.equal(document.activeElement.id, 'btn-prev');
});

test('Up from taskbar returns to seek bar', function () {
  installMinimalDom();
  var overlay = buildPlayerOverlayFixture();
  document.registerTree(overlay);

  overlay.querySelector('#btn-pause').focus();
  handleKeyNav(overlay, keyEvent(ARROW_UP));
  assert.equal(document.activeElement.id, 'player-seek');
});

test('Right steps through every taskbar control in order', function () {
  installMinimalDom();
  var overlay = buildPlayerOverlayFixture();
  document.registerTree(overlay);

  var expected = [
    'btn-prev',
    'btn-rewind',
    'btn-pause',
    'btn-forward',
    'btn-next',
    'btn-stop',
    'btn-quality',
    'btn-audio',
    'btn-subtitles'
  ];

  overlay.querySelector('#btn-prev').focus();
  var i;
  for (i = 1; i < expected.length; i++) {
    var handled = handleKeyNav(overlay, keyEvent(ARROW_RIGHT));
    assert.equal(handled, true, 'step ' + i);
    assert.equal(document.activeElement.id, expected[i]);
  }
});

test('Left steps backward through taskbar controls', function () {
  installMinimalDom();
  var overlay = buildPlayerOverlayFixture();
  document.registerTree(overlay);

  overlay.querySelector('#btn-subtitles').focus();
  handleKeyNav(overlay, keyEvent(ARROW_LEFT));
  assert.equal(document.activeElement.id, 'btn-audio');
  handleKeyNav(overlay, keyEvent(ARROW_LEFT));
  assert.equal(document.activeElement.id, 'btn-quality');
  handleKeyNav(overlay, keyEvent(ARROW_LEFT));
  assert.equal(document.activeElement.id, 'btn-stop');
});

test('getFocusables skips controls with tabindex -1', function () {
  installMinimalDom();
  var overlay = buildPlayerOverlayFixture();
  document.registerTree(overlay);

  overlay.querySelector('#btn-pause').setAttribute('tabindex', '-1');
  overlay.querySelector('#btn-quality').setAttribute('tabindex', '-1');

  var taskbar = overlay.querySelector('[data-focus-zone="player-taskbar"]');
  var ids = getFocusables(taskbar).map(function (el) { return el.id; });
  assert.equal(ids.indexOf('btn-pause'), -1);
  assert.equal(ids.indexOf('btn-quality'), -1);
  assert.ok(ids.indexOf('btn-prev') >= 0);
});

test('Right from open menu does not reach trapped taskbar controls', function () {
  installMinimalDom();
  var overlay = buildPlayerOverlayFixture();

  var menuSheet = createElement('div');
  menuSheet.setAttribute('data-focus-zone', 'player-menu');
  var menuList = createElement('div');
  menuList.id = 'player-menu-list';
  menuList.appendChild(pill('menu-opt-a', 'player-menu-option'));
  menuList.appendChild(pill('menu-opt-b', 'player-menu-option'));
  menuSheet.appendChild(menuList);
  menuSheet.appendChild(pill('btn-menu-cancel', 'btn btn-player-modal-cancel'));
  overlay.appendChild(menuSheet);

  overlay.querySelectorAll('.player-bottom button, .player-bottom .player-seek-bar').forEach(function (el) {
    el.setAttribute('tabindex', '-1');
  });

  document.registerTree(overlay);
  overlay.querySelector('#menu-opt-a').focus();
  handleKeyNav(overlay, keyEvent(ARROW_RIGHT));
  assert.equal(document.activeElement.id, 'menu-opt-b');
});
