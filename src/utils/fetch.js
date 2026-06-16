/**
 * Thin fetch wrapper with timeout and XML/JSON parsing.
 */

import { isAbortControllerPolyfilled } from '../core/abortControllerPolyfill.js';

var DEFAULT_TIMEOUT_MS = 20000;

function timeoutPromise(ms) {
  return new Promise(function (_, reject) {
    setTimeout(function () { reject(new Error('Request timeout')); }, ms);
  });
}

function resolveTimeoutMs(options) {
  if (!options) return DEFAULT_TIMEOUT_MS;
  if (options.timeout === 0) return 0;
  if (options.timeout > 0) return options.timeout;
  return DEFAULT_TIMEOUT_MS;
}

function fetchWithTimeout(url, init, timeoutMs) {
  if (!timeoutMs) return fetch(url, init);
  // Polyfilled AbortController does not make legacy fetch honor signal; race instead.
  if (typeof AbortController !== 'undefined' && !isAbortControllerPolyfilled()) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs);
    var merged = Object.assign({}, init, { signal: controller.signal });
    return fetch(url, merged).finally(function () {
      clearTimeout(timer);
    }).catch(function (err) {
      if (err && err.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw err;
    });
  }
  return Promise.race([fetch(url, init), timeoutPromise(timeoutMs)]);
}

function fetchJson(url, options) {
  options = options || {};
  var headers = options.headers || {};
  if (!headers.Accept) headers.Accept = 'application/json';
  var init = {
    method: options.method || 'GET',
    headers: headers,
    body: options.body || undefined
  };
  var timeoutMs = resolveTimeoutMs(options);
  return fetchWithTimeout(url, init, timeoutMs).then(function (res) {
    if (!res.ok) {
      return res.text().then(function (t) {
        var err = new Error('HTTP ' + res.status + ': ' + (t || res.statusText));
        err.status = res.status;
        err.body = t;
        throw err;
      });
    }
    var ct = res.headers.get('content-type') || '';
    if (ct.indexOf('json') >= 0) return res.json();
    return res.text().then(function (text) {
      try { return JSON.parse(text); } catch (e) { return { _raw: text }; }
    });
  });
}

function fetchText(url, options) {
  options = options || {};
  var headers = options.headers || {};
  var init = {
    method: options.method || 'GET',
    headers: headers,
    body: options.body
  };
  var timeoutMs = resolveTimeoutMs(options);
  return fetchWithTimeout(url, init, timeoutMs).then(function (res) {
    if (!res.ok) {
      return res.text().then(function (t) {
        var err = new Error('HTTP ' + res.status);
        err.status = res.status;
        err.body = t;
        throw err;
      });
    }
    return res.text();
  });
}

function buildQuery(params) {
  var parts = [];
  var k;
  for (k in params) {
    if (Object.prototype.hasOwnProperty.call(params, k) && params[k] != null) {
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
    }
  }
  return parts.join('&');
}

export { fetchJson, fetchText, buildQuery, DEFAULT_TIMEOUT_MS };
