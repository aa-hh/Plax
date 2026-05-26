import test from 'node:test';
import assert from 'node:assert/strict';

import { installMinimalDom, createElement } from './helpers/minimal-dom.js';
import {
  handleKeyNav,
  getZones,
  resolveZoneIndex,
  focusSidebar
} from '../src/ui/focus.js';

var ARROW_DOWN = 40;
var ARROW_RIGHT = 39;
var ARROW_LEFT = 37;
var ARROW_UP = 38;

function keyEvent(code) {
  return { keyCode: code, preventDefault: function () {} };
}

function btn(id, className) {
  var el = createElement('button');
  el.id = id;
  el.className = className || 'btn';
  el.setAttribute('tabindex', '0');
  return el;
}

function zone(name, className) {
  var el = createElement('div');
  el.className = className || '';
  el.setAttribute('data-focus-zone', name);
  return el;
}

function buildDetailFixture(opts) {
  opts = opts || {};
  var screen = createElement('div');
  screen.className = 'screen';

  var layout = createElement('div');
  layout.className = 'home-layout detail-screen-layout';

  if (opts.withHub !== false) {
    var hub = createElement('nav');
    hub.className = 'browsing-hub-nav-host';
    hub.appendChild(btn('hub-home', 'browsing-hub-item'));
    hub.appendChild(btn('hub-settings', 'browsing-hub-item'));
    layout.appendChild(hub);
  }

  var main = createElement('div');
  main.className = 'home-main detail-home-main';

  var topBar = zone('detail-top-bar', 'detail-top-bar');
  topBar.appendChild(btn('detail-season-crumb', 'detail-breadcrumb-trail__btn'));
  topBar.appendChild(btn('detail-episode-picker', 'detail-breadcrumb-trail__btn detail-episode-picker'));
  main.appendChild(topBar);

  if (opts.withEpisodeMain !== false) {
    var episodeMain = createElement('div');
    episodeMain.className = 'detail-episode-main';
    main.appendChild(episodeMain);
  }

  var actions = zone('detail-episode-actions', 'detail-actions detail-episode-actions');
  actions.setAttribute('data-cols', '4');
  actions.appendChild(btn('btn-start', 'btn btn-primary'));
  actions.appendChild(btn('btn-mark-watched', 'btn'));
  actions.appendChild(btn('btn-mark-unwatched', 'btn'));
  actions.appendChild(btn('detail-watchlist-btn', 'detail-watchlist-btn'));
  main.appendChild(actions);

  var playback = zone('detail-playback-columns', 'detail-playback-columns');
  var file = createElement('section');
  file.className = 'detail-file-section';
  file.appendChild(btn('detail-file-video', 'detail-file-row'));
  file.appendChild(btn('detail-file-audio', 'detail-file-row'));
  file.appendChild(btn('detail-file-subtitles', 'detail-file-row'));
  file.appendChild(btn('detail-file-quality', 'detail-file-row'));
  var network = createElement('section');
  network.className = 'detail-network-section';
  if (opts.withNetworkInfo !== false) {
    network.appendChild(btn('btn-network-info', 'btn detail-network-info-btn'));
  }
  network.appendChild(btn('btn-test-connection', 'btn detail-network-retest'));
  playback.appendChild(file);
  playback.appendChild(network);
  main.appendChild(playback);

  layout.appendChild(main);
  screen.appendChild(layout);
  return screen;
}

function buildFilmDetailFixture(opts) {
  var screen = buildDetailFixture(opts);
  var main = screen.querySelector('.detail-home-main');

  var rails = zone('detail-rails', 'detail-rails detail-rails--movie');
  rails.id = 'detail-rails';
  var row = createElement('div');
  row.className = 'row-scroll';
  row.appendChild(btn('related-card-1', 'card row-item'));
  rails.appendChild(row);
  main.appendChild(rails);

  return screen;
}

test('Down from breadcrumb reaches sidebar first when hub present', function () {
  installMinimalDom();
  var screen = buildDetailFixture();
  document.registerTree(screen);

  var breadcrumb = screen.querySelector('#detail-season-crumb');
  breadcrumb.focus();

  var zones = getZones(screen);
  var zIdx = resolveZoneIndex(zones, screen, breadcrumb);
  assert.ok(zIdx >= 0);

  var ev = keyEvent(ARROW_DOWN);
  var handled = handleKeyNav(screen, ev);
  assert.equal(handled, true);
  assert.equal(document.activeElement.id, 'hub-home');
});

test('Down from content can reach settings hub item', function () {
  installMinimalDom();
  var screen = buildDetailFixture();
  document.registerTree(screen);

  screen.querySelector('#hub-home').focus();
  var ev = keyEvent(ARROW_DOWN);
  handleKeyNav(screen, ev);
  assert.equal(document.activeElement.id, 'hub-settings');
});

test('Left from first main focusable focuses sidebar', function () {
  installMinimalDom();
  var screen = buildDetailFixture();
  document.registerTree(screen);

  screen.querySelector('#btn-start').focus();
  var ev = keyEvent(ARROW_LEFT);
  handleKeyNav(screen, ev);
  assert.ok(document.activeElement.className.indexOf('browsing-hub-item') >= 0);
});

test('Episode action row cycles left and right', function () {
  installMinimalDom();
  var screen = buildDetailFixture();
  document.registerTree(screen);

  screen.querySelector('#btn-start').focus();
  handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  assert.equal(document.activeElement.id, 'btn-mark-watched');
  handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  assert.equal(document.activeElement.id, 'btn-mark-unwatched');
  handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  assert.equal(document.activeElement.id, 'detail-watchlist-btn');
});

test('Right from last file row focuses first network control', function () {
  installMinimalDom();
  var screen = buildDetailFixture();
  document.registerTree(screen);

  screen.querySelector('#detail-file-quality').focus();
  handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  assert.equal(document.activeElement.id, 'btn-network-info');
});

test('Left from first network control returns to last file row', function () {
  installMinimalDom();
  var screen = buildDetailFixture();
  document.registerTree(screen);

  screen.querySelector('#btn-network-info').focus();
  handleKeyNav(screen, keyEvent(ARROW_LEFT));
  assert.equal(document.activeElement.id, 'detail-file-quality');
});

test('Down from action row reaches playback columns', function () {
  installMinimalDom();
  var screen = buildDetailFixture();
  document.registerTree(screen);

  screen.querySelector('#detail-watchlist-btn').focus();
  var zones = getZones(screen);
  var actionZone = screen.querySelector('[data-focus-zone="detail-episode-actions"]');
  var playZone = screen.querySelector('[data-focus-zone="detail-playback-columns"]');
  assert.ok(zones.indexOf(actionZone) < zones.indexOf(playZone));

  handleKeyNav(screen, keyEvent(ARROW_DOWN));
  assert.equal(document.activeElement.id, 'detail-file-video');
});

test('focusSidebar helper focuses first hub item', function () {
  installMinimalDom();
  var screen = buildDetailFixture();
  document.registerTree(screen);

  assert.equal(focusSidebar(screen), true);
  assert.equal(document.activeElement.id, 'hub-home');
});

test('without hub Down from breadcrumb reaches actions not sidebar', function () {
  installMinimalDom();
  var screen = buildDetailFixture({ withHub: false });
  document.registerTree(screen);

  screen.querySelector('#detail-season-crumb').focus();
  handleKeyNav(screen, keyEvent(ARROW_DOWN));
  assert.equal(document.activeElement.id, 'btn-start');
});

test('episode breadcrumb trail cycles left and right', function () {
  installMinimalDom();
  var screen = buildDetailFixture();
  document.registerTree(screen);

  screen.querySelector('#detail-season-crumb').focus();
  handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  assert.equal(document.activeElement.id, 'detail-episode-picker');
  handleKeyNav(screen, keyEvent(ARROW_LEFT));
  assert.equal(document.activeElement.id, 'detail-season-crumb');
});

test('without hub Down from breadcrumb skips non-focusable hero to actions', function () {
  installMinimalDom();
  var screen = buildDetailFixture({ withHub: false, withEpisodeMain: true });
  document.registerTree(screen);

  screen.querySelector('#detail-season-crumb').focus();
  handleKeyNav(screen, keyEvent(ARROW_DOWN));
  assert.equal(document.activeElement.id, 'btn-start');
});

test('getZones does not duplicate row-scroll inside detail rails', function () {
  installMinimalDom();
  var screen = buildFilmDetailFixture();
  document.registerTree(screen);

  var zones = getZones(screen);
  var railsZone = screen.querySelector('[data-focus-zone="detail-rails"]');
  var rowScroll = railsZone.querySelector('.row-scroll');
  assert.ok(zones.indexOf(railsZone) >= 0);
  assert.equal(zones.indexOf(rowScroll), -1);
});

test('Down from middle file row focuses next file row', function () {
  installMinimalDom();
  var screen = buildDetailFixture();
  document.registerTree(screen);

  screen.querySelector('#detail-file-audio').focus();
  handleKeyNav(screen, keyEvent(ARROW_DOWN));
  assert.equal(document.activeElement.id, 'detail-file-subtitles');
});

test('Up from middle file row focuses previous file row', function () {
  installMinimalDom();
  var screen = buildDetailFixture();
  document.registerTree(screen);

  screen.querySelector('#detail-file-audio').focus();
  handleKeyNav(screen, keyEvent(ARROW_UP));
  assert.equal(document.activeElement.id, 'detail-file-video');
});

test('Down from middle file row does not focus network', function () {
  installMinimalDom();
  var screen = buildDetailFixture();
  document.registerTree(screen);

  screen.querySelector('#detail-file-audio').focus();
  handleKeyNav(screen, keyEvent(ARROW_DOWN));
  assert.notEqual(document.activeElement.id, 'btn-network-info');
  assert.notEqual(document.activeElement.id, 'btn-test-connection');
});

test('Up from middle file row does not focus sidebar', function () {
  installMinimalDom();
  var screen = buildDetailFixture();
  document.registerTree(screen);

  screen.querySelector('#detail-file-audio').focus();
  handleKeyNav(screen, keyEvent(ARROW_UP));
  assert.ok(document.activeElement.className.indexOf('browsing-hub-item') < 0);
});

test('Right between network controls focuses next network control', function () {
  installMinimalDom();
  var screen = buildDetailFixture();
  document.registerTree(screen);

  screen.querySelector('#btn-network-info').focus();
  handleKeyNav(screen, keyEvent(ARROW_RIGHT));
  assert.equal(document.activeElement.id, 'btn-test-connection');
});

test('Left between network controls focuses previous network control', function () {
  installMinimalDom();
  var screen = buildDetailFixture();
  document.registerTree(screen);

  screen.querySelector('#btn-test-connection').focus();
  handleKeyNav(screen, keyEvent(ARROW_LEFT));
  assert.equal(document.activeElement.id, 'btn-network-info');
});

test('getZones orders playback columns before detail rails', function () {
  installMinimalDom();
  var screen = buildFilmDetailFixture();
  document.registerTree(screen);

  var zones = getZones(screen);
  var playZone = screen.querySelector('[data-focus-zone="detail-playback-columns"]');
  var railsZone = screen.querySelector('[data-focus-zone="detail-rails"]');
  assert.ok(zones.indexOf(playZone) < zones.indexOf(railsZone));
});

test('Down from last file row reaches first related rail card', function () {
  installMinimalDom();
  var screen = buildFilmDetailFixture();
  document.registerTree(screen);

  screen.querySelector('#detail-file-quality').focus();
  handleKeyNav(screen, keyEvent(ARROW_DOWN));
  assert.equal(document.activeElement.id, 'related-card-1');
});

test('Down from last network control reaches first related rail card', function () {
  installMinimalDom();
  var screen = buildFilmDetailFixture();
  document.registerTree(screen);

  screen.querySelector('#btn-test-connection').focus();
  handleKeyNav(screen, keyEvent(ARROW_DOWN));
  assert.equal(document.activeElement.id, 'related-card-1');
});

test('Up from first network control focuses last file row', function () {
  installMinimalDom();
  var screen = buildDetailFixture();
  document.registerTree(screen);

  screen.querySelector('#btn-network-info').focus();
  handleKeyNav(screen, keyEvent(ARROW_UP));
  assert.equal(document.activeElement.id, 'detail-file-quality');
});
