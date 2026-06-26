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

  var showTime = Date.now();
  // Minimum time the splash stays visible. Prevents it from being created and
  // destroyed in the same JS tick (before the browser has painted even one frame),
  // which is what happens when the startup screen mounts synchronously.
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
    var remaining = MIN_MS - (Date.now() - showTime);
    if (remaining > 0) {
      setTimeout(doFade, remaining);
    } else {
      // At least defer to the next animation frame so the browser has painted
      // the splash at least once before we begin the fade.
      requestAnimationFrame(doFade);
    }
  }

  return { dismiss: dismiss };
}

export { createSplash };
