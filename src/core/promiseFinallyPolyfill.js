/**
 * webOS TV 4.x (Chromium ~53) lacks Promise.prototype.finally (Chrome 63+).
 * Load first from app.js before any fetch/cache code runs.
 */
function installPromiseFinallyPolyfill() {
  if (typeof Promise === 'undefined' || Promise.prototype.finally) return false;

  Promise.prototype.finally = function (onFinally) {
    var handler = typeof onFinally === 'function' ? onFinally : function () {};
    var C = this.constructor;
    return this.then(
      function (value) {
        return C.resolve(handler()).then(function () {
          return value;
        });
      },
      function (reason) {
        return C.resolve(handler()).then(function () {
          throw reason;
        });
      }
    );
  };
  return true;
}

installPromiseFinallyPolyfill();

export { installPromiseFinallyPolyfill };
