import test from 'node:test';
import assert from 'node:assert/strict';

import { installMinimalDom, createElement } from './helpers/minimal-dom.js';
import {
  handleKeyNav,
  getZones,
  focusSidebar
} from '../src/ui/focus.js';

var ARROW_DOWN = 40;
var ARROW_RIGHT = 39;
var ARROW_LEFT = 37;
var ARROW_UP = 38;

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

function hubItem(id, active) {
  var el = btn(id);
  el.className = 'browsing-hub-item' + (active ? ' active' : '');
  el.setAttribute('data-hub-id', id.replace('hub-', ''));
  return el;
}

function select(id) {
  var el = createElement('select');
  el.id = id;
  return el;
}

function settingsRow(children) {
  var row = createElement('div');
  row.className = 'settings-row';
  children.forEach(function (child) { row.appendChild(child); });
  return row;
}

function section(id, rows) {
  var block = createElement('div');
  block.id = id;
  rows.forEach(function (row) { block.appendChild(row); });
  return block;
}

function buildSettingsFixture(opts) {
  opts = opts || {};
  var screen = createElement('div');
  screen.className = 'screen settings-screen';

  var layout = createElement('div');
  layout.className = 'home-layout settings-layout';

  var hub = createElement('nav');
  hub.className = 'browsing-hub-nav-host';
  hub.appendChild(hubItem('hub-home', false));
  hub.appendChild(hubItem('hub-search', false));
  hub.appendChild(hubItem('hub-settings', true));
  layout.appendChild(hub);

  var main = createElement('div');
  main.className = 'home-main settings-main';
  var content = createElement('div');
  content.className = 'settings-content';

  content.appendChild(section('account-section', [
    settingsRow([btn('btn-switch-profile')])
  ]));
  content.appendChild(section('playback-section', [
    settingsRow([select('quality-select')]),
    settingsRow([select('subtitle-offset-select')])
  ]));
  content.appendChild(section('about-section', [
    settingsRow([btn('btn-design-review')]),
    settingsRow([select('perf-hud-select')])
  ]));

  if (opts.withWatchlistRow) {
    var wlSection = createElement('div');
    wlSection.id = 'watchlists-section';
    var wlRow = createElement('div');
    wlRow.className = 'settings-watchlist-row';
    wlRow.appendChild(btn('wl-open'));
    wlRow.appendChild(btn('wl-rename'));
    wlRow.appendChild(btn('wl-delete'));
    wlSection.appendChild(wlRow);
    content.appendChild(wlSection);
  }

  var actions = createElement('div');
  actions.className = 'settings-actions detail-actions';
  actions.appendChild(btn('btn-back'));
  actions.appendChild(btn('btn-signout'));
  content.appendChild(actions);

  main.appendChild(content);
  layout.appendChild(main);
  screen.appendChild(layout);
  return screen;
}

test('settings screen uses per-row focus zones in document order', function () {
  installMinimalDom();
  var screen = buildSettingsFixture();
  document.registerTree(screen);

  var zones = getZones(screen);
  var rows = zones.slice(1);
  assert.equal(rows.length, 6);
  assert.equal(zones.length, 7);
  assert.equal(zones[0].className.indexOf('browsing-hub-nav-host') >= 0, true);
  assert.equal(rows[0].querySelector('#btn-switch-profile') != null, true);
  assert.equal(rows[rows.length - 1].className.indexOf('settings-actions') >= 0, true);
});

test('Right from sidebar enters first settings control', function () {
  installMinimalDom();
  var screen = buildSettingsFixture();
  document.registerTree(screen);

  screen.querySelector('#hub-settings').focus();
  handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  assert.equal(document.activeElement.id, 'btn-switch-profile');
  assert.notEqual(document.activeElement.id, 'btn-back');
});

test('Left from first settings control focuses active hub item', function () {
  installMinimalDom();
  var screen = buildSettingsFixture();
  document.registerTree(screen);

  screen.querySelector('#btn-switch-profile').focus();
  handleKeyNav(screen, keyEvent(ARROW_LEFT));
  assert.equal(document.activeElement.id, 'hub-settings');
});

test('Right and Left move sequentially within a settings row', function () {
  installMinimalDom();
  var screen = buildSettingsFixture({ withWatchlistRow: true });
  document.registerTree(screen);

  screen.querySelector('#wl-open').focus();
  handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  assert.equal(document.activeElement.id, 'wl-rename');
  handleKeyNav(screen, keyEvent(ARROW_LEFT));
  assert.equal(document.activeElement.id, 'wl-open');
  handleKeyNav(screen, keyEvent(ARROW_LEFT));
  assert.equal(document.activeElement.id, 'hub-settings');
});

test('Down and Up move between settings rows', function () {
  installMinimalDom();
  var screen = buildSettingsFixture();
  document.registerTree(screen);

  screen.querySelector('#btn-switch-profile').focus();
  handleKeyNav(screen, keyEvent(ARROW_DOWN));
  assert.equal(document.activeElement.id, 'quality-select');
  handleKeyNav(screen, keyEvent(ARROW_UP));
  assert.equal(document.activeElement.id, 'btn-switch-profile');
  handleKeyNav(screen, keyEvent(ARROW_UP));
  assert.equal(document.activeElement.id, 'hub-settings');
});

test('Down from hub reaches first settings row', function () {
  installMinimalDom();
  var screen = buildSettingsFixture();
  document.registerTree(screen);

  screen.querySelector('#hub-settings').focus();
  handleKeyNav(screen, keyEvent(ARROW_DOWN));
  assert.equal(document.activeElement.id, 'btn-switch-profile');
});

test('focusSidebar focuses active settings hub item', function () {
  installMinimalDom();
  var screen = buildSettingsFixture();
  document.registerTree(screen);

  screen.querySelector('#quality-select').focus();
  assert.equal(focusSidebar(screen), true);
  assert.equal(document.activeElement.id, 'hub-settings');
});
