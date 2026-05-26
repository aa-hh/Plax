import { createLoadingIndicator, setLoadingLabel } from './components/loadingIndicator.js';

var splashEl = null;
var loaderWrap = null;
var hideTimer = null;

function getSplash() {
  if (!splashEl) splashEl = document.getElementById('splash-screen');
  return splashEl;
}

function initSplash() {
  var el = getSplash();
  if (!el || el.getAttribute('data-init') === '1') return;
  el.setAttribute('data-init', '1');
  var slot = el.querySelector('.splash-loader-slot');
  if (slot) {
    loaderWrap = createLoadingIndicator({ size: 'large', label: 'Loading…' });
    slot.appendChild(loaderWrap);
  }
}

function setSplashStatus(text) {
  initSplash();
  var status = document.getElementById('splash-status');
  if (status) status.textContent = text;
  if (loaderWrap) setLoadingLabel(loaderWrap, text);
}

function showSplash() {
  initSplash();
  var el = getSplash();
  if (el) {
    el.classList.remove('hidden');
  }
}

function hideSplash() {
  var el = getSplash();
  if (!el) return;
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = null;
  el.classList.add('hidden');
}

export { initSplash, setSplashStatus, showSplash, hideSplash };
