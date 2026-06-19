import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseHomeSize } from '../src/plex/auth/pinAuth.js';
import { profilePickerCols, clampProfilePickerCols } from '../src/ui/screens/profilePickerScreen.js';
import { installMinimalDom, createElement, layout } from './helpers/minimal-dom.js';
import {
  handleKeyNav,
  getFocusables
} from '../src/ui/focus.js';

var ARROW_LEFT = 37;
var ARROW_UP = 38;
var ARROW_RIGHT = 39;
var ARROW_DOWN = 40;

function keyEvent(code) {
  return { keyCode: code, preventDefault: function () {} };
}

function profileCard(id) {
  var el = createElement('button');
  el.id = id;
  el.className = 'profile-card card';
  el.setAttribute('tabindex', '0');
  return el;
}

function pinBtn(id, label) {
  var el = createElement('button');
  el.id = id;
  el.className = 'pin-pad-btn btn';
  el.setAttribute('tabindex', '0');
  el.textContent = label;
  return el;
}

var PIN_SIZE = 80, PIN_STEP = 90;

function buildPinPadGrid(yOffset) {
  yOffset = yOffset || 0;
  var grid = createElement('div');
  grid.className = 'pin-pad-grid';
  grid.setAttribute('data-cols', '3');
  var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  var row;
  for (row = 0; row < 3; row++) {
    var rowEl = createElement('div');
    rowEl.className = 'pin-pad-row';
    var col;
    for (col = 0; col < 3; col++) {
      var b = pinBtn('pin-' + keys[row * 3 + col], keys[row * 3 + col]);
      layout(b, col * PIN_STEP, yOffset + row * PIN_STEP, PIN_SIZE, PIN_SIZE);
      rowEl.appendChild(b);
    }
    grid.appendChild(rowEl);
  }
  var bottomRow = createElement('div');
  bottomRow.className = 'pin-pad-row pin-pad-row-bottom';
  var spacer = createElement('span');
  spacer.className = 'pin-pad-spacer';
  bottomRow.appendChild(spacer);
  var pin0 = pinBtn('pin-0', '0');
  layout(pin0, PIN_STEP, yOffset + 3 * PIN_STEP, PIN_SIZE, PIN_SIZE);
  var pinDel = pinBtn('pin-del', 'Delete');
  layout(pinDel, 2 * PIN_STEP, yOffset + 3 * PIN_STEP, PIN_SIZE, PIN_SIZE);
  bottomRow.appendChild(pin0);
  bottomRow.appendChild(pinDel);
  grid.appendChild(bottomRow);
  return grid;
}

var CARD_W = 172, CARD_H = 250, CARD_GAP = 24;

function buildProfilePickerFocusFixture(opts) {
  opts = opts || {};
  var cols = opts.cols != null ? opts.cols : 3;
  var userCount = opts.userCount != null ? opts.userCount : 6;

  var screen = createElement('div');
  screen.className = 'screen profile-picker-screen';

  var row = createElement('div');
  row.className = 'profile-picker-row';
  row.id = 'profile-row';
  row.setAttribute('data-focus-zone', 'profile-picker-profiles');
  row.setAttribute('data-cols', String(cols));
  var i;
  for (i = 0; i < userCount; i++) {
    var c = profileCard('user-' + i);
    var col = i % cols, r = Math.floor(i / cols);
    layout(c, col * (CARD_W + CARD_GAP), r * (CARD_H + CARD_GAP), CARD_W, CARD_H);
    row.appendChild(c);
  }
  screen.appendChild(row);

  if (opts.withPinPad) {
    var numRows = Math.ceil(userCount / cols);
    var pinY = numRows * (CARD_H + CARD_GAP) + CARD_GAP;
    var pinPanel = createElement('div');
    pinPanel.className = 'profile-picker-pin';
    pinPanel.appendChild(buildPinPadGrid(pinY));
    screen.appendChild(pinPanel);
  }

  return screen;
}

var screenSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/ui/screens/profilePickerScreen.js'),
  'utf8'
);

var cssSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/styles/app.css'),
  'utf8'
);

var PROFILE_CARD_MIN = 160;
var PROFILE_PICKER_GAP = 24;

function profilePickerMaxWidthPx(cols) {
  return cols * PROFILE_CARD_MIN + (cols - 1) * PROFILE_PICKER_GAP;
}

test('profile picker: Select User title and immediate header structure', function () {
  assert.match(screenSrc, />Select User</);
  assert.doesNotMatch(screenSrc, /Who'?s watching/i);
  assert.match(screenSrc, /profile-picker-header/);
  assert.match(screenSrc, /profile-picker-title/);
  assert.doesNotMatch(screenSrc, /profile-picker-subtitle/);
  assert.match(screenSrc, /createSpinner/);
  assert.doesNotMatch(screenSrc, /setStatus\(['"]Loading profiles/);
  assert.match(screenSrc, /label:\s*'Loading profiles'/);
  assert.match(screenSrc, /fetchHomeSize/);
  assert.match(screenSrc, /readSessionHomeSize/);
  assert.match(screenSrc, /writeSessionHomeSize/);
  assert.match(screenSrc, /--profile-picker-cols/);
});

test('profile picker: PIN mode header title and header spinner during switch', function () {
  assert.match(screenSrc, /Enter PIN/);
  assert.match(screenSrc, /syncHeaderTitle/);
  assert.match(screenSrc, /syncHeaderSpinner/);
  assert.match(screenSrc, /profilesLoading \|\| switching/);
  assert.match(screenSrc, /mode === 'pinEntry' && switching/);
  assert.match(screenSrc, /Verifying PIN/);
  assert.match(screenSrc, /runAppBootstrap/);
  assert.doesNotMatch(screenSrc, /hubPrefetch:\s*false/);
  assert.doesNotMatch(screenSrc, /navigate\(['"]bootstrap/);
  assert.doesNotMatch(screenSrc, /Switching profile/);
  assert.doesNotMatch(screenSrc, /loading user/i);
  assert.match(screenSrc, /function openHomeAfterBootstrap/);
  assert.match(screenSrc, /return openHomeAfterBootstrap\(op\)/);
});

test('profile picker: starts loading with empty grid hidden until users arrive', function () {
  assert.match(screenSrc, /var profilesLoading = true/);
  assert.match(screenSrc, /profile-picker--loading/);
  assert.match(cssSrc, /\.profile-picker--loading \.profile-picker-row/);
});

test('profile picker: hides chrome until column width is known', function () {
  assert.match(screenSrc, /profile-picker--awaiting-size/);
  assert.match(screenSrc, /function revealPickerChrome/);
  assert.match(screenSrc, /function commitPickerSize/);
  assert.match(screenSrc, /if \(resolvedHomeSize != null\)[\s\S]*commitPickerSize[\s\S]*revealPickerChrome/);
  var loadProfilesStart = screenSrc.indexOf('function loadProfiles()');
  var loadProfilesBlock = screenSrc.slice(loadProfilesStart, loadProfilesStart + 1200);
  assert.match(loadProfilesBlock, /commitPickerSize\(homeSize\)[\s\S]*revealPickerChrome\(\)[\s\S]*fetchHomeUsers/);
  assert.doesNotMatch(screenSrc, /syncHeaderSpinner\(\);\s*\n\s*var pinEntry/);
  assert.match(cssSrc, /\.profile-picker--awaiting-size \.profile-picker-main/);
  assert.match(screenSrc, /if \(!sizeReady\) return/);
});

test('profile picker: flex row and dynamic max-width (webOS 4 safe)', function () {
  assert.match(cssSrc, /--profile-picker-cols:\s*1/);
  assert.match(cssSrc, /\.profile-picker-row[\s\S]*display:\s*flex/);
  assert.doesNotMatch(cssSrc, /grid-template-columns:\s*repeat\(var\(--profile-picker-cols\)/);
  assert.match(cssSrc, /--profile-picker-max-w:\s*calc\(/);
  assert.match(cssSrc, /var\(--profile-picker-cols\) \* var\(--profile-card-min\)/);
});

test('profile picker: card spacing uses margins not flex gap (webOS 4 safe)', function () {
  var rowBlock = cssSrc.match(/\.profile-picker-row\s*\{[\s\S]*?\}/);
  assert.ok(rowBlock, 'profile-picker-row rule present');
  assert.doesNotMatch(rowBlock[0], /\bgap\s*:/);
  assert.match(cssSrc, /\.profile-picker-row[\s\S]*margin:\s*-12px/);
  assert.match(
    cssSrc,
    /\.profile-picker-row \.profile-card[\s\S]*margin:\s*12px/
  );
});

test('profile picker: PIN pad uses explicit rows (webOS 4 safe)', function () {
  assert.match(screenSrc, /pin-pad-row/);
  assert.match(screenSrc, /row \* 3 \+ col/);
  assert.match(cssSrc, /\.pin-pad-grid[\s\S]*display:\s*flex/);
  assert.match(cssSrc, /\.pin-pad-grid[\s\S]*flex-direction:\s*column/);
  assert.match(cssSrc, /\.pin-pad-row[\s\S]*flex-wrap:\s*nowrap/);
  assert.doesNotMatch(cssSrc, /\.pin-pad-grid[\s\S]*flex-wrap:\s*wrap/);
  assert.doesNotMatch(cssSrc, /\.pin-pad-grid[\s\S]*display:\s*grid/);
  assert.match(cssSrc, /\.pin-pad-row > \*[\s\S]*width:\s*84px/);
  assert.match(cssSrc, /\.pin-pad-btn[\s\S]*padding:\s*0/);
});

test('parseHomeSize: valid, missing, and invalid values', function () {
  assert.equal(parseHomeSize({ homeSize: 2 }), 2);
  assert.equal(parseHomeSize({ homeSize: '5' }), 5);
  assert.equal(parseHomeSize({ homeSize: 0 }), null);
  assert.equal(parseHomeSize({ homeSize: -1 }), null);
  assert.equal(parseHomeSize({}), null);
  assert.equal(parseHomeSize(null), null);
});

test('profilePickerCols: homeSize 2 vs 5 width behavior', function () {
  assert.equal(profilePickerCols(2, null), 2);
  assert.equal(profilePickerMaxWidthPx(profilePickerCols(2, null)), 344);

  assert.equal(profilePickerCols(5, null), 4);
  assert.equal(profilePickerMaxWidthPx(profilePickerCols(5, null)), 712);

  assert.equal(profilePickerCols(5, 3), 4);
  assert.equal(profilePickerCols(2, 3), 3);
  assert.equal(profilePickerCols(2, 2), 2);
  assert.equal(profilePickerCols(4, 2), 4);
  assert.equal(profilePickerCols(null, 2), 2);
  assert.equal(clampProfilePickerCols(9), 4);
});

test('profile picker screen: sequential homeSize then users load', function () {
  assert.match(screenSrc, /commitPickerSize\(resolvedHomeSize\)/);
  assert.match(screenSrc, /commitPickerSize\(homeSize\)/);
  assert.doesNotMatch(screenSrc, /Promise\.all\(\[\s*homeSizePromise,\s*fetchHomeUsers/);
  assert.doesNotMatch(screenSrc, /Promise\.all\(\[\s*[\s\S]*fetchHomeSize[\s\S]*fetchHomeUsers/);
  var homeSizeIdx = screenSrc.indexOf('fetchHomeSize(ownerToken, clientId)');
  var usersIdx = screenSrc.indexOf('fetchHomeUsers(ownerToken, clientId)');
  assert.ok(homeSizeIdx >= 0 && usersIdx > homeSizeIdx, 'fetchHomeUsers runs after fetchHomeSize');
  var loadProfilesStart = screenSrc.indexOf('function loadProfiles()');
  var loadProfilesBlock = screenSrc.slice(loadProfilesStart, loadProfilesStart + 2500);
  assert.match(
    loadProfilesBlock,
    /fetchHomeSize\(ownerToken, clientId\)[\s\S]*commitPickerSize\(homeSize\)[\s\S]*revealPickerChrome\(\)[\s\S]*fetchHomeUsers\(ownerToken, clientId\)/
  );
});

test('profile picker screen: profile row and PIN pad use grid focus attrs', function () {
  assert.match(screenSrc, /rowEl\.setAttribute\('data-cols'/);
  assert.match(screenSrc, /data-focus-zone="profile-picker-profiles"/);
  assert.doesNotMatch(screenSrc, /data-focus-zone="profile-picker-pin"/);
  assert.match(screenSrc, /grid\.setAttribute\('data-cols', '3'\)/);
  assert.doesNotMatch(screenSrc, /id="pin-pad" data-cols/);
});

test('profile picker: user grid Right/Left moves within row', function () {
  installMinimalDom();
  var screen = buildProfilePickerFocusFixture({ cols: 3, userCount: 6 });
  document.registerTree(screen);

  var row = screen.querySelector('#profile-row');
  var list = getFocusables(row);
  list[0].focus();

  assert.equal(handleKeyNav(screen, keyEvent(ARROW_RIGHT)), true);
  assert.equal(document.activeElement.id, 'user-1');

  assert.equal(handleKeyNav(screen, keyEvent(ARROW_RIGHT)), true);
  assert.equal(document.activeElement.id, 'user-2');

  assert.equal(handleKeyNav(screen, keyEvent(ARROW_LEFT)), true);
  assert.equal(document.activeElement.id, 'user-1');
});

test('profile picker: user grid Down/Up moves between rows', function () {
  installMinimalDom();
  var screen = buildProfilePickerFocusFixture({ cols: 3, userCount: 6 });
  document.registerTree(screen);

  var row = screen.querySelector('#profile-row');
  getFocusables(row)[1].focus();

  assert.equal(handleKeyNav(screen, keyEvent(ARROW_DOWN)), true);
  assert.equal(document.activeElement.id, 'user-4');

  assert.equal(handleKeyNav(screen, keyEvent(ARROW_UP)), true);
  assert.equal(document.activeElement.id, 'user-1');
});

test('profile picker: user grid does not wrap past row edge', function () {
  installMinimalDom();
  var screen = buildProfilePickerFocusFixture({ cols: 3, userCount: 6 });
  document.registerTree(screen);

  var row = screen.querySelector('#profile-row');
  getFocusables(row)[2].focus();

  assert.equal(handleKeyNav(screen, keyEvent(ARROW_RIGHT)), false);
  assert.equal(document.activeElement.id, 'user-2');
});

test('profile picker: PIN pad grid Down from 8 reaches 0', function () {
  installMinimalDom();
  var screen = buildProfilePickerFocusFixture({ withPinPad: true });
  document.registerTree(screen);

  screen.querySelector('#pin-8').focus();

  assert.equal(handleKeyNav(screen, keyEvent(ARROW_DOWN)), true);
  assert.equal(document.activeElement.id, 'pin-0');
});

test('profile picker: PIN pad grid Down from 9 reaches Delete', function () {
  installMinimalDom();
  var screen = buildProfilePickerFocusFixture({ withPinPad: true });
  document.registerTree(screen);

  screen.querySelector('#pin-9').focus();

  assert.equal(handleKeyNav(screen, keyEvent(ARROW_DOWN)), true);
  assert.equal(document.activeElement.id, 'pin-del');
});

test('profile picker: Down from profile row to PIN pad in pin mode', function () {
  installMinimalDom();
  var screen = buildProfilePickerFocusFixture({ cols: 1, userCount: 1, withPinPad: true });
  document.registerTree(screen);

  screen.querySelector('#user-0').focus();
  assert.equal(handleKeyNav(screen, keyEvent(ARROW_DOWN)), true);
  assert.ok(/^pin-/.test(document.activeElement.id), 'should enter pin pad from profile row');
});
