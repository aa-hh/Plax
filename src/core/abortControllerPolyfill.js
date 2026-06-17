/**
 * webOS TV 4.x (Chromium ~53) lacks AbortController (Chrome 66+).
 * Load first from app.js before fetch timeouts run.
 */
var polyfilled = false;

function getGlobalRoot() {
  if (typeof globalThis !== 'undefined') return globalThis;
  if (typeof window !== 'undefined') return window;
  if (typeof self !== 'undefined') return self;
  return {};
}

function installAbortControllerPolyfill() {
  if (typeof AbortController !== 'undefined') return false;

  function AbortSignalPolyfill() {
    this.aborted = false;
    this._abortListeners = [];
  }

  AbortSignalPolyfill.prototype.addEventListener = function (type, listener) {
    if (type === 'abort' && typeof listener === 'function') {
      this._abortListeners.push(listener);
    }
  };

  AbortSignalPolyfill.prototype.removeEventListener = function (type, listener) {
    if (type !== 'abort') return;
    var idx = this._abortListeners.indexOf(listener);
    if (idx >= 0) this._abortListeners.splice(idx, 1);
  };

  function AbortControllerPolyfill() {
    this.signal = new AbortSignalPolyfill();
  }

  AbortControllerPolyfill.prototype.abort = function () {
    if (this.signal.aborted) return;
    this.signal.aborted = true;
    var listeners = this.signal._abortListeners.slice();
    var event = { type: 'abort', target: this.signal };
    var i;
    for (i = 0; i < listeners.length; i++) {
      try {
        listeners[i].call(this.signal, event);
      } catch (e) { /* ignore listener errors */ }
    }
  };

  var root = getGlobalRoot();
  root.AbortController = AbortControllerPolyfill;
  root.AbortSignal = AbortSignalPolyfill;
  polyfilled = true;
  return true;
}

function isAbortControllerPolyfilled() {
  return polyfilled;
}

installAbortControllerPolyfill();

export { installAbortControllerPolyfill, isAbortControllerPolyfilled };
