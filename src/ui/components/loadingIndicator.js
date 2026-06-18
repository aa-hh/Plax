/**
 * Reusable static loading indicator (bootstrap, inline loading states).
 * No CSS animations — middle dot highlighted for visual hierarchy.
 */

function createLoadingIndicator(options) {
  options = options || {};
  var size = options.size || 'medium';
  var label = options.label || '';

  var wrap = document.createElement('div');
  wrap.className = 'plax-loader-wrap plax-loader-' + size;
  if (options.className) wrap.className += ' ' + options.className;

  var loader = document.createElement('div');
  loader.className = 'plax-loader';
  loader.setAttribute('role', 'status');
  loader.setAttribute('aria-live', 'polite');
  loader.setAttribute('aria-label', label || 'Loading');
  loader.innerHTML =
    '<span class="plax-loader-dot"></span>' +
    '<span class="plax-loader-dot plax-loader-dot-active"></span>' +
    '<span class="plax-loader-dot"></span>';

  wrap.appendChild(loader);

  if (label) {
    var text = document.createElement('p');
    text.className = 'plax-loader-label';
    text.textContent = label;
    wrap.appendChild(text);
  }

  return wrap;
}

function setLoadingLabel(el, text) {
  if (!el) return;
  var label = el.querySelector('.plax-loader-label');
  if (label) label.textContent = text;
}

export { createLoadingIndicator, setLoadingLabel };
