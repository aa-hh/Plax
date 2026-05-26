import test from 'node:test';
import assert from 'node:assert/strict';

import { hydrateRowViewport } from '../src/ui/posterImages.js';
import { installMinimalDom, createElement } from './helpers/minimal-dom.js';

function mockRect(left, right, top, bottom) {
  return {
    left: left,
    right: right,
    top: top != null ? top : 0,
    bottom: bottom != null ? bottom : 100
  };
}

function makeCard(thumbUrl, rect) {
  var card = createElement('div');
  card.className = 'media-card';
  card.setAttribute('data-thumb', thumbUrl);
  card.getBoundingClientRect = function () { return rect; };
  var img = createElement('img');
  img.className = 'poster';
  img.dataset = Object.create(null);
  img.getAttribute = function (name) {
    if (name === 'src') return img.src || null;
    return null;
  };
  img.setAttribute = function (name, value) {
    if (name === 'src') img.src = value;
  };
  img.removeAttribute = function () {};
  Object.defineProperty(img, 'complete', { value: false });
  Object.defineProperty(img, 'naturalWidth', { value: 0 });
  card.appendChild(img);
  card.querySelector = function (sel) {
    if (sel === 'img.poster') return img;
    return null;
  };
  return { card: card, img: img };
}

test('hydrateRowViewport binds posters for horizontally visible deferred cards', function () {
  installMinimalDom();
  var row = createElement('div');
  row.className = 'row-scroll';
  row.getBoundingClientRect = function () { return mockRect(0, 800); };

  var visible = makeCard('https://plex.example/poster-visible.jpg', mockRect(400, 560));
  var offscreen = makeCard('https://plex.example/poster-offscreen.jpg', mockRect(1200, 1360));
  row.appendChild(visible.card);
  row.appendChild(offscreen.card);

  row.querySelectorAll = function (sel) {
    if (sel === '.media-card') return [visible.card, offscreen.card];
    return [];
  };

  hydrateRowViewport(row);

  assert.equal(visible.img.src, 'https://plex.example/poster-visible.jpg');
  assert.equal(offscreen.img.src, '');
});
