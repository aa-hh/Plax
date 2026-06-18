import { setLoadingLabel } from './components/loadingIndicator.js';
import { createSpinner } from './components/spinner.js';

var overlayEl = null;
var loaderWrap = null;
var bufferDepth = 0;

function ensureOverlay() {
  if (overlayEl) return overlayEl;
  overlayEl = document.getElementById('loading-overlay');
  if (!overlayEl) {
    overlayEl = document.createElement('div');
    overlayEl.id = 'loading-overlay';
    overlayEl.className = 'loading-overlay hidden';
    var inner = document.createElement('div');
    inner.className = 'loading-overlay-inner';
    overlayEl.appendChild(inner);
    document.body.appendChild(overlayEl);
  }
  var inner = overlayEl.querySelector('.loading-overlay-inner');
  if (inner && !loaderWrap) {
    loaderWrap = document.createElement('div');
    loaderWrap.className = 'plax-loader-wrap plax-loader-large';
    loaderWrap.appendChild(createSpinner({ size: 'large', label: 'Buffering…' }));
    var label = document.createElement('p');
    label.className = 'plax-loader-label';
    label.textContent = 'Buffering…';
    loaderWrap.appendChild(label);
    inner.appendChild(loaderWrap);
  }
  return overlayEl;
}

function showLoadingOverlay(message, mode) {
  var el = ensureOverlay();
  mode = mode || 'loading';
  el.setAttribute('data-mode', mode);
  if (loaderWrap) setLoadingLabel(loaderWrap, message || 'Loading…');
  el.classList.remove('hidden');
}

function hideLoadingOverlay() {
  if (!overlayEl) return;
  overlayEl.classList.add('hidden');
}

/** Player teardown: hide overlay and drop any buffering refcount. */
function resetBufferingOverlay() {
  bufferDepth = 0;
  hideLoadingOverlay();
}

function showBuffering(message) {
  bufferDepth += 1;
  showLoadingOverlay(message || 'Buffering…', 'buffering');
}

function hideBuffering() {
  bufferDepth = Math.max(0, bufferDepth - 1);
  if (bufferDepth === 0 && overlayEl) {
    overlayEl.classList.add('hidden');
  }
}

export {
  showLoadingOverlay,
  hideLoadingOverlay,
  showBuffering,
  hideBuffering,
  resetBufferingOverlay
};
