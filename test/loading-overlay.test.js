import test from 'node:test';
import assert from 'node:assert/strict';

import { installMinimalDom } from './helpers/minimal-dom.js';

installMinimalDom();

var overlayModule;

test('loading overlay: hideLoadingOverlay does not clear buffering refcount', async function () {
  overlayModule = await import('../src/ui/loadingOverlay.js');
  overlayModule.resetBufferingOverlay();

  overlayModule.showBuffering('Buffering…');
  overlayModule.showBuffering('Buffering…');
  overlayModule.hideLoadingOverlay();

  var overlay = document.getElementById('loading-overlay');
  assert.ok(overlay);
  assert.equal(overlay.classList.contains('hidden'), true);

  overlayModule.hideBuffering();
  assert.equal(overlay.classList.contains('hidden'), true);

  overlayModule.hideBuffering();
  assert.equal(overlay.classList.contains('hidden'), true);
});

test('loading overlay: route loading and buffering are independent modes', async function () {
  overlayModule.resetBufferingOverlay();

  overlayModule.showLoadingOverlay('Preparing playback…', 'loading');
  var overlay = document.getElementById('loading-overlay');
  assert.equal(overlay.getAttribute('data-mode'), 'loading');
  assert.equal(overlay.classList.contains('hidden'), false);

  overlayModule.showBuffering('Buffering…');
  assert.equal(overlay.getAttribute('data-mode'), 'buffering');

  overlayModule.hideLoadingOverlay();
  assert.equal(overlay.classList.contains('hidden'), true);

  overlayModule.hideBuffering();
  assert.equal(overlay.classList.contains('hidden'), true);
});

test('resetBufferingOverlay clears refcount and hides overlay', function () {
  overlayModule.showBuffering('Buffering…');
  overlayModule.resetBufferingOverlay();
  var overlay = document.getElementById('loading-overlay');
  assert.equal(overlay.classList.contains('hidden'), true);
  overlayModule.showBuffering('Again');
  overlayModule.hideBuffering();
  assert.equal(overlay.classList.contains('hidden'), true);
});

test('loading overlay: hide inside the show-delay window hides at once (fast load never paints)', function () {
  overlayModule.resetBufferingOverlay();
  var realNow = Date.now;
  var t = 100000;
  Date.now = function () { return t; };
  try {
    overlayModule.showLoadingOverlay('Preparing playback…', 'loading');
    t += overlayModule.SHOW_DELAY_MS - 10;
    overlayModule.hideLoadingOverlay();
    var overlay = document.getElementById('loading-overlay');
    assert.equal(overlay.classList.contains('hidden'), true);
  } finally {
    Date.now = realNow;
  }
});

test('loading overlay: once painted, hide is held for the minimum-visible time', function () {
  overlayModule.resetBufferingOverlay();
  var realNow = Date.now;
  var t = 200000;
  Date.now = function () { return t; };
  var overlay = document.getElementById('loading-overlay');
  try {
    overlayModule.showLoadingOverlay('Preparing playback…', 'loading');
    // Painted at +SHOW_DELAY; hide requested 50ms after that.
    t += overlayModule.SHOW_DELAY_MS + 50;
    overlayModule.hideLoadingOverlay();
    assert.equal(overlay.classList.contains('hidden'), false, 'hide is deferred');
    // A second show cancels the pending hide and keeps the same paint clock.
    overlayModule.showLoadingOverlay('Still loading…', 'loading');
    t += overlayModule.MIN_VISIBLE_MS;
    overlayModule.hideLoadingOverlay();
    assert.equal(overlay.classList.contains('hidden'), true, 'past the hold: hides at once');
  } finally {
    Date.now = realNow;
  }
});

test('loading overlay: deferred hide fires after the hold; reset cancels it', async function () {
  overlayModule.resetBufferingOverlay();
  var realNow = Date.now;
  var t = 300000;
  Date.now = function () { return t; };
  var overlay = document.getElementById('loading-overlay');
  try {
    overlayModule.showBuffering('Buffering…');
    t += overlayModule.SHOW_DELAY_MS + overlayModule.MIN_VISIBLE_MS - 20;
    overlayModule.hideBuffering();
    assert.equal(overlay.classList.contains('hidden'), false);
  } finally {
    Date.now = realNow;
  }
  await new Promise(function (r) { setTimeout(r, 40); });
  assert.equal(overlay.classList.contains('hidden'), true, 'timer hid it');

  overlayModule.showBuffering('Buffering…');
  overlayModule.resetBufferingOverlay();
  assert.equal(overlay.classList.contains('hidden'), true, 'teardown hides immediately');
});
