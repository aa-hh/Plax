/**
 * addEventListener with once semantics for Chromium 53 (webOS 4).
 * { once: true } is silently ignored on Chrome < 55.
 */
function addOnceEventListener(el, event, handler) {
  function wrapper() {
    el.removeEventListener(event, wrapper);
    handler.apply(this, arguments);
  }
  el.addEventListener(event, wrapper);
  return wrapper; // return wrapper in case caller needs to remove it early
}

export { addOnceEventListener };
