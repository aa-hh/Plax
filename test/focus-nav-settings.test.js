import test from 'node:test';
import assert from 'node:assert/strict';

import { installMinimalDom, createElement, layout } from './helpers/minimal-dom.js';
import {
  handleKeyNav
} from '../src/ui/focus.js';

var ARROW_DOWN = 40;
var ARROW_RIGHT = 39;
var ARROW_LEFT = 37;
var ARROW_UP = 38;

function keyEvent(code) {
  return { keyCode: code, preventDefault: function () {} };
}

/**
 * Settings screen layout:
 *
 *   Sidebar:
 *     sidebar-home      (0,  50, 200, 40)
 *     sidebar-settings  (0, 100, 200, 40)
 *
 *   Row 1 — video quality chips (y=50):
 *     chip-auto  (220,  50, 120, 40)
 *     chip-4k    (360,  50, 120, 40)
 *
 *   Row 2 — audio chips (y=110):
 *     chip-surround  (220, 110, 120, 40)
 *     chip-stereo    (360, 110, 120, 40)
 *
 *   Actions row (y=170):
 *     btn-clear  (220, 170, 120, 40)
 *     btn-reset  (360, 170, 120, 40)
 */
function buildSettingsFixture() {
  var screen = createElement('div');
  screen.className = 'screen settings-screen';

  // Sidebar
  var sidebarHome = createElement('button');
  sidebarHome.id = 'sidebar-home';
  sidebarHome.className = 'browsing-hub-item';
  sidebarHome.setAttribute('tabindex', '0');
  layout(sidebarHome, 0, 50, 200, 40);

  var sidebarSettings = createElement('button');
  sidebarSettings.id = 'sidebar-settings';
  sidebarSettings.className = 'browsing-hub-item';
  sidebarSettings.setAttribute('tabindex', '0');
  layout(sidebarSettings, 0, 100, 200, 40);

  // Video quality chips (row 1)
  var chipAuto = createElement('button');
  chipAuto.id = 'chip-auto';
  chipAuto.className = 'detail-setting-chip';
  chipAuto.setAttribute('tabindex', '0');
  layout(chipAuto, 220, 50, 120, 40);

  var chip4k = createElement('button');
  chip4k.id = 'chip-4k';
  chip4k.className = 'detail-setting-chip';
  chip4k.setAttribute('tabindex', '0');
  layout(chip4k, 360, 50, 120, 40);

  // Audio chips (row 2)
  var chipSurround = createElement('button');
  chipSurround.id = 'chip-surround';
  chipSurround.className = 'detail-setting-chip';
  chipSurround.setAttribute('tabindex', '0');
  layout(chipSurround, 220, 110, 120, 40);

  var chipStereo = createElement('button');
  chipStereo.id = 'chip-stereo';
  chipStereo.className = 'detail-setting-chip';
  chipStereo.setAttribute('tabindex', '0');
  layout(chipStereo, 360, 110, 120, 40);

  // Actions row (row 3)
  var btnClear = createElement('button');
  btnClear.id = 'btn-clear';
  btnClear.className = 'btn';
  btnClear.setAttribute('tabindex', '0');
  layout(btnClear, 220, 170, 120, 40);

  var btnReset = createElement('button');
  btnReset.id = 'btn-reset';
  btnReset.className = 'btn';
  btnReset.setAttribute('tabindex', '0');
  layout(btnReset, 360, 170, 120, 40);

  screen.appendChild(sidebarHome);
  screen.appendChild(sidebarSettings);
  screen.appendChild(chipAuto);
  screen.appendChild(chip4k);
  screen.appendChild(chipSurround);
  screen.appendChild(chipStereo);
  screen.appendChild(btnClear);
  screen.appendChild(btnReset);

  return screen;
}

// --- Sidebar vertical navigation ---------------------------------------------

test('Down from sidebar-home moves to sidebar-settings', function () {
  installMinimalDom();
  var screen = buildSettingsFixture();
  document.registerTree(screen);

  screen.querySelector('#sidebar-home').focus();
  assert.equal(handleKeyNav(screen, keyEvent(ARROW_DOWN)), true);
  assert.equal(document.activeElement.id, 'sidebar-settings');
});

// --- Sidebar → settings row (RIGHT) -----------------------------------------

test('Right from sidebar-home enters chip-auto (row 1, same y)', function () {
  installMinimalDom();
  var screen = buildSettingsFixture();
  document.registerTree(screen);

  screen.querySelector('#sidebar-home').focus();
  assert.equal(handleKeyNav(screen, keyEvent(ARROW_RIGHT)), true);
  assert.equal(document.activeElement.id, 'chip-auto');
});

// --- Chip row 1 horizontal navigation ----------------------------------------

test('Right from chip-auto moves to chip-4k', function () {
  installMinimalDom();
  var screen = buildSettingsFixture();
  document.registerTree(screen);

  screen.querySelector('#chip-auto').focus();
  assert.equal(handleKeyNav(screen, keyEvent(ARROW_RIGHT)), true);
  assert.equal(document.activeElement.id, 'chip-4k');
});

test('Left from chip-4k returns to chip-auto', function () {
  installMinimalDom();
  var screen = buildSettingsFixture();
  document.registerTree(screen);

  screen.querySelector('#chip-4k').focus();
  assert.equal(handleKeyNav(screen, keyEvent(ARROW_LEFT)), true);
  assert.equal(document.activeElement.id, 'chip-auto');
});

// --- Chip → sidebar (LEFT from first column) ---------------------------------

test('Left from chip-auto (leftmost chip) returns to sidebar', function () {
  installMinimalDom();
  var screen = buildSettingsFixture();
  document.registerTree(screen);

  screen.querySelector('#chip-auto').focus();
  assert.equal(handleKeyNav(screen, keyEvent(ARROW_LEFT)), true);
  var activeId = document.activeElement.id;
  assert.ok(
    activeId === 'sidebar-home' || activeId === 'sidebar-settings',
    'expected sidebar element, got ' + activeId
  );
});

// --- Vertical navigation between rows ----------------------------------------

test('Down from chip-auto moves to chip-surround (row 2, same column)', function () {
  installMinimalDom();
  var screen = buildSettingsFixture();
  document.registerTree(screen);

  screen.querySelector('#chip-auto').focus();
  assert.equal(handleKeyNav(screen, keyEvent(ARROW_DOWN)), true);
  assert.equal(document.activeElement.id, 'chip-surround');
});

test('Up from chip-surround returns to chip-auto (row 1, same column)', function () {
  installMinimalDom();
  var screen = buildSettingsFixture();
  document.registerTree(screen);

  screen.querySelector('#chip-surround').focus();
  assert.equal(handleKeyNav(screen, keyEvent(ARROW_UP)), true);
  assert.equal(document.activeElement.id, 'chip-auto');
});

test('Down from chip-surround moves to btn-clear (actions row, same column)', function () {
  installMinimalDom();
  var screen = buildSettingsFixture();
  document.registerTree(screen);

  screen.querySelector('#chip-surround').focus();
  assert.equal(handleKeyNav(screen, keyEvent(ARROW_DOWN)), true);
  assert.equal(document.activeElement.id, 'btn-clear');
});

test('Up from btn-clear returns to chip-surround (same column)', function () {
  installMinimalDom();
  var screen = buildSettingsFixture();
  document.registerTree(screen);

  screen.querySelector('#btn-clear').focus();
  assert.equal(handleKeyNav(screen, keyEvent(ARROW_UP)), true);
  assert.equal(document.activeElement.id, 'chip-surround');
});
