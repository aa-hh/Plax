import test from 'node:test';
import assert from 'node:assert/strict';

import { bindPosterImage } from '../src/ui/posterImages.js';
import { installMinimalDom, createElement } from './helpers/minimal-dom.js';

// A poster that fails to load must turn its wrap into a blank surface tile
// (card-poster-wrap--no-art) from the SHARED load path, so deferred/viewport
// hydration gets the same fallback as the initial bind. A later successful
// load clears it again.

function makeWrapAndImg() {
  var wrap = createElement('div');
  wrap.className = 'card-poster-wrap';
  var img = createElement('img');
  img.className = 'poster';
  img.dataset = Object.create(null);
  img.naturalWidth = 0;
  img.complete = false;
  wrap.appendChild(img);
  return { wrap: wrap, img: img };
}

test('load failure marks the poster wrap as no-art', function () {
  installMinimalDom();
  var n = makeWrapAndImg();
  bindPosterImage(n.img, 'https://plex.example/fails.jpg', { priority: true });
  assert.equal(typeof n.img.onerror, 'function', 'load handler attached');
  n.img.onerror();
  assert.ok(n.wrap.classList.contains('card-poster-wrap--no-art'));
  assert.ok(!n.img.classList.contains('poster--loaded'));
});

test('a successful load clears the no-art tile and reveals the image', function () {
  installMinimalDom();
  var n = makeWrapAndImg();
  n.wrap.classList.add('card-poster-wrap--no-art');
  bindPosterImage(n.img, 'https://plex.example/ok.jpg', { priority: true });
  n.img.naturalWidth = 210;
  n.img.complete = true;
  n.img.onload();
  assert.ok(!n.wrap.classList.contains('card-poster-wrap--no-art'));
  assert.ok(n.img.classList.contains('poster--loaded'));
});

test('an image outside a poster wrap never touches its parent', function () {
  installMinimalDom();
  var host = createElement('div');
  host.className = 'detail-hero';
  var img = createElement('img');
  img.dataset = Object.create(null);
  img.naturalWidth = 0;
  img.complete = false;
  host.appendChild(img);
  bindPosterImage(img, 'https://plex.example/hero-fails.jpg', { priority: true });
  img.onerror();
  assert.ok(!host.classList.contains('card-poster-wrap--no-art'));
});
