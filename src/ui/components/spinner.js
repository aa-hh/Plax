/**
 * Reusable circular spinner (rotating partial border ring).
 *
 * API:
 *   createSpinner(options?) -> HTMLElement (.xplay-spinner-wrap)
 *     options.size   — 'small' | 'medium' | 'large' | 'em' (default 'medium'; 'em' = 1em ring, set font-size on wrap/parent)
 *     options.className — extra class on the wrap element
 *     options.label  — aria-label (default 'Loading')
 *     options.hidden — start hidden (default false)
 *
 * Toggle: set wrap.hidden = true/false, or add/remove a parent .hidden class.
 */

function createSpinner(options) {
  options = options || {};
  var size = options.size || 'medium';

  var wrap = document.createElement('span');
  wrap.className = 'xplay-spinner-wrap xplay-spinner-' + size;
  if (options.className) wrap.className += ' ' + options.className;
  if (options.hidden) wrap.hidden = true;

  var spinner = document.createElement('span');
  spinner.className = 'xplay-spinner';
  spinner.setAttribute('role', 'status');
  spinner.setAttribute('aria-label', options.label || 'Loading');

  wrap.appendChild(spinner);
  return wrap;
}

export { createSpinner };
