import { setLoadingLabel } from './components/loadingIndicator.js';
import { createSpinner } from './components/spinner.js';

var overlayEl = null;
var loaderWrap = null;
var bufferDepth = 0;

// Flicker guard. The CSS (html.caps-motion .loading-overlay) delays the show
// by SHOW_DELAY_MS, so a load that finishes inside that window never paints the
// overlay at all. Once it HAS painted, hold it for MIN_VISIBLE_MS before hiding
// so a 20ms buffering blip can't blink it on/off. Both are measured from the
// show request; the two constants must stay in step with the CSS delay.
var SHOW_DELAY_MS = 150;
var MIN_VISIBLE_MS = 400;
var shownAt = 0;
var hideTimer = null;

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

function cancelPendingHide() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
}

function hideNow() {
  cancelPendingHide();
  if (overlayEl) overlayEl.classList.add('hidden');
}

function showLoadingOverlay(message, mode) {
  var el = ensureOverlay();
  mode = mode || 'loading';
  el.setAttribute('data-mode', mode);
  if (loaderWrap) setLoadingLabel(loaderWrap, message || 'Loading…');
  cancelPendingHide();
  if (el.classList.contains('hidden')) shownAt = Date.now();
  el.classList.remove('hidden');
}

function hideLoadingOverlay() {
  if (!overlayEl || hideTimer) return;
  var paintedFor = Date.now() - shownAt - SHOW_DELAY_MS;
  if (paintedFor <= 0 || paintedFor >= MIN_VISIBLE_MS) {
    hideNow();
    return;
  }
  hideTimer = setTimeout(function () {
    hideTimer = null;
    hideNow();
  }, MIN_VISIBLE_MS - paintedFor);
}

/** Player teardown: hide overlay and drop any buffering refcount. */
function resetBufferingOverlay() {
  bufferDepth = 0;
  hideNow();
}

function showBuffering(message) {
  bufferDepth += 1;
  showLoadingOverlay(message || 'Buffering…', 'buffering');
}

function hideBuffering() {
  bufferDepth = Math.max(0, bufferDepth - 1);
  if (bufferDepth === 0) hideLoadingOverlay();
}

export {
  SHOW_DELAY_MS,
  MIN_VISIBLE_MS,
  showLoadingOverlay,
  hideLoadingOverlay,
  showBuffering,
  hideBuffering,
  resetBufferingOverlay
};
