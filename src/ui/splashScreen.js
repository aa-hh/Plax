import { plaxWordmarkSvg } from './brand/plaxLogo.js';

/**
 * Splash screen — full-viewport black overlay with the centred Plax wordmark.
 *
 * Usage:
 *   var splash = createSplash();   // inject immediately (before first navigate)
 *   splash.dismiss();              // call once the first screen is mounted
 *
 * The element is appended to document.body so it sits above #app-root.
 * z-index 9999 ensures it floats above every other layer (loading overlay is
 * --z-loading: 1005; perf HUD is --z-hud: 1800).
 */
function createSplash() {
  var el = document.createElement('div');
  el.id = 'splash-screen';
  el.className = 'splash-screen';

  var logo = document.createElement('div');
  logo.className = 'splash-logo';
  logo.innerHTML = plaxWordmarkSvg();
  el.appendChild(logo);

  document.body.appendChild(el);

  var dismissed = false;

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    el.classList.add('splash-screen--out');
    // Remove from DOM after the fade-out transition completes.
    // 400ms matches the CSS transition duration.
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 450);
  }

  return { dismiss: dismiss };
}

export { createSplash };
