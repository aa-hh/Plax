/**
 * Reusable static loading indicator (splash, bootstrap, buffering).
 * No CSS animations — middle dot highlighted for visual hierarchy.
 */

function createLoadingIndicator(options) {
  options = options || {};
  var size = options.size || 'medium';
  var label = options.label || '';

  var wrap = document.createElement('div');
  wrap.className = 'xplay-loader-wrap xplay-loader-' + size;
  if (options.className) wrap.className += ' ' + options.className;

  var loader = document.createElement('div');
  loader.className = 'xplay-loader';
  loader.setAttribute('role', 'progressbar');
  loader.setAttribute('aria-label', label || 'Loading');
  loader.innerHTML =
    '<span class="xplay-loader-dot"></span>' +
    '<span class="xplay-loader-dot xplay-loader-dot-active"></span>' +
    '<span class="xplay-loader-dot"></span>';

  wrap.appendChild(loader);

  if (label) {
    var text = document.createElement('p');
    text.className = 'xplay-loader-label';
    text.textContent = label;
    wrap.appendChild(text);
  }

  return wrap;
}

function setLoadingLabel(el, text) {
  if (!el) return;
  var label = el.querySelector('.xplay-loader-label');
  if (label) label.textContent = text;
}

export { createLoadingIndicator, setLoadingLabel };
