import { plaxWordmarkSvg } from './brand/plaxLogo.js';

/**
 * Splash screen — full-viewport black overlay with the centred Plax wordmark.
 *
 * Two-part dismiss contract:
 *   1. Screens call signalReady() after their first meaningful render (user list
 *      shown, home hubs visible, etc.). This is the PRIMARY dismiss trigger.
 *   2. app.js registers an onFirstMount fallback so the splash always clears
 *      even if a screen never calls signalReady() — e.g. the pairing screen or
 *      any screen added later without the signal wired up. The fallback fires
 *      3 s after the factory returns (long enough for most async renders).
 *
 * Usage:
 *   // app.js — before first navigate():
 *   var splash = createSplash();
 *   onFirstMount(function () { setTimeout(splash.dismiss, 3000); }); // fallback
 *
 *   // startup screen — after first render():
 *   import { signalReady } from '../splashScreen.js';
 *   signalReady();
 */

// Module-level dismiss fn — set by createSplash(), cleared on dismiss.
var _dismiss = null;

/**
 * Called by startup screens after their first meaningful render.
 * No-ops if the splash is already gone or was never created.
 */
function signalReady() {
  if (_dismiss) _dismiss();
}

function createSplash() {
  var el = document.createElement('div');
  el.id = 'splash-screen';
  el.className = 'splash-screen';

  var logo = document.createElement('div');
  logo.className = 'splash-logo';
  logo.innerHTML = plaxWordmarkSvg();
  el.appendChild(logo);

  document.body.appendChild(el);

  var showTime = Date.now();
  var MIN_MS = 600;
  var dismissed = false;

  function doFade() {
    el.classList.add('splash-screen--out');
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 450);
  }

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    _dismiss = null;
    var remaining = MIN_MS - (Date.now() - showTime);
    if (remaining > 0) {
      setTimeout(doFade, remaining);
    } else {
      requestAnimationFrame(doFade);
    }
  }

  _dismiss = dismiss;

  return { dismiss: dismiss };
}

export { createSplash, signalReady };
