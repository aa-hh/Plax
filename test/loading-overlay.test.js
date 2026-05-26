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
