/**
 * TV-friendly debug logging (webOS 4 ares-inspect is flaky).
 * Enabled when:
 *  - URL contains ?debug=1
 *  - localStorage xplay_debug_enabled === "1"
 *  - PalmSystem.launchParams includes debug (ares-launch -p '{"debug":1}')
 *  - window.__XPLAY_DEBUG__ === true
 *
 * Remote HTTP sink (Mac `npm run log:receive`) when a sink URL is set.
 * tvLog() only mirrors remotely when debug is on; tvError() always mirrors if a sink URL is set.
 *  - localStorage xplay_log_sink_url
 *  - PalmSystem.launchParams logSink (ares-launch -p '{"debug":1,"logSink":"http://…/log"}')
 *  - window.__XPLAY_LOG_SINK_URL__ (build / dev injection)
 */

var STORAGE_KEY = 'xplay_debug_enabled';
var LOG_SINK_STORAGE_KEY = 'xplay_log_sink_url';
var MAX_LINES = 14;
var enabled = false;
var lines = [];
var overlayEl = null;
var relaunchHookInstalled = false;

function getRuntimeRoot() {
  if (typeof globalThis !== 'undefined') return globalThis;
  if (typeof window !== 'undefined') return window;
  return null;
}

function safeLocalGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function safeLocalSet(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch (e) { /* ignore */ }
}

function debugFlagTruthy(value) {
  return value === 1 || value === true || value === '1' || value === 'true';
}

function parseLaunchParamsObject(value) {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) return null;
  return value;
}

function launchParamsDebugOn() {
  try {
    var root = getRuntimeRoot();
    var ps = root && root.PalmSystem;
    if (!ps || ps.launchParams == null || ps.launchParams === '') return false;
    var lp = ps.launchParams;
    var parsedObject = parseLaunchParamsObject(lp);
    if (parsedObject && debugFlagTruthy(parsedObject.debug)) return true;
    var raw = String(lp);
    if (/debug\s*[=:]\s*1/i.test(raw)) return true;
    if (raw.charAt(0) === '{' || raw.charAt(0) === '[') {
      var parsed = JSON.parse(raw);
      if (parsed && debugFlagTruthy(parsed.debug)) return true;
    }
  } catch (e) { /* ignore */ }
  return false;
}

function describeLaunchParams() {
  try {
    var root = getRuntimeRoot();
    var ps = root && root.PalmSystem;
    if (!ps || ps.launchParams == null || ps.launchParams === '') return '(empty)';
    var lp = ps.launchParams;
    if (typeof lp === 'object') {
      try {
        return JSON.stringify(lp);
      } catch (e) {
        return '[object]';
      }
    }
    return String(lp);
  } catch (e) {
    return '(unavailable)';
  }
}

function getDebugEnableState() {
  var root = getRuntimeRoot();
  try {
    if (root && root.__XPLAY_DEBUG__ === true) {
      return { enabled: true, source: '__XPLAY_DEBUG__' };
    }
    if (launchParamsDebugOn()) {
      return { enabled: true, source: 'launchParams', launchParams: describeLaunchParams() };
    }
    if (root && root.location && root.location.search &&
      /(?:\?|&)debug=1(?:&|$)/.test(root.location.search)) {
      return { enabled: true, source: 'url' };
    }
    if (safeLocalGet(STORAGE_KEY) === '1') {
      return { enabled: true, source: 'localStorage' };
    }
    return {
      enabled: false,
      source: 'none',
      launchParams: describeLaunchParams(),
      localStorage: safeLocalGet(STORAGE_KEY)
    };
  } catch (e) {
    return { enabled: false, source: 'error', error: String(e && e.message ? e.message : e) };
  }
}

function shouldEnableDebug() {
  return getDebugEnableState().enabled;
}

function formatDisableHelp(state) {
  state = state || getDebugEnableState();
  var lp = state.launchParams != null ? state.launchParams : describeLaunchParams();
  return 'Debug overlay off (source=' + state.source + ', launchParams=' + lp + '). ' +
    'Enable: ares-launch -p \'{"debug":1}\' --device Alec-TV com.xplay.lite ' +
    'or Settings → Debug log overlay → On.';
}

function pad2(n) {
  n = n | 0;
  return n < 10 ? '0' + n : String(n);
}

function formatDetail(detail) {
  if (detail == null) return '';
  if (detail instanceof Error) return detail.message || String(detail);
  if (typeof detail === 'string') return detail;
  try {
    return JSON.stringify(detail);
  } catch (e) {
    return String(detail);
  }
}

function renderOverlay() {
  if (!enabled || !overlayEl) return;
  overlayEl.textContent = lines.join('\n');
}

function ensureOverlay() {
  if (!enabled || overlayEl) return;
  if (typeof document === 'undefined') return;
  var body = document.body;
  if (!body) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function onReady() {
        document.removeEventListener('DOMContentLoaded', onReady);
        ensureOverlay();
      });
    }
    return;
  }
  overlayEl = document.createElement('pre');
  overlayEl.id = 'xplay-debug-overlay';
  overlayEl.className = 'xplay-debug-overlay';
  overlayEl.setAttribute('aria-live', 'polite');
  body.appendChild(overlayEl);
  renderOverlay();
}

/** Re-append overlay as last body child so it stays above fullscreen video/player chrome. */
function ensureDebugOverlayOnTop() {
  if (!enabled) return;
  ensureOverlay();
  if (overlayEl && typeof document !== 'undefined' && document.body) {
    document.body.appendChild(overlayEl);
  }
}

function setDebugOverlayPlayerMode(active) {
  if (!overlayEl || !overlayEl.classList) return;
  if (active) overlayEl.classList.add('xplay-debug-overlay--player');
  else overlayEl.classList.remove('xplay-debug-overlay--player');
}

function pushLine(tag, message, detail) {
  var ts = new Date();
  var line = pad2(ts.getHours()) + ':' + pad2(ts.getMinutes()) + ':' + pad2(ts.getSeconds()) +
    ' [' + tag + '] ' + message;
  var extra = formatDetail(detail);
  if (extra) line += ' ' + extra;
  lines.push(line);
  if (lines.length > MAX_LINES) lines.shift();
  if (enabled) {
    ensureOverlay();
    ensureDebugOverlayOnTop();
    renderOverlay();
  }
}

function getLogSinkFromLaunchParams() {
  try {
    var root = getRuntimeRoot();
    var ps = root && root.PalmSystem;
    if (!ps || ps.launchParams == null || ps.launchParams === '') return null;
    var lp = ps.launchParams;
    var parsedObject = parseLaunchParamsObject(lp);
    if (parsedObject && parsedObject.logSink != null && String(parsedObject.logSink).trim()) {
      return String(parsedObject.logSink).trim();
    }
    var raw = String(lp);
    if (raw.charAt(0) === '{' || raw.charAt(0) === '[') {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.logSink != null && String(parsed.logSink).trim()) {
        return String(parsed.logSink).trim();
      }
    }
  } catch (e) { /* ignore */ }
  return null;
}

function getLogSinkUrl() {
  var fromLaunch = getLogSinkFromLaunchParams();
  if (fromLaunch) return fromLaunch;
  var stored = safeLocalGet(LOG_SINK_STORAGE_KEY);
  if (stored && String(stored).trim()) return String(stored).trim();
  var root = getRuntimeRoot();
  if (root && root.__XPLAY_LOG_SINK_URL__ != null && String(root.__XPLAY_LOG_SINK_URL__).trim()) {
    return String(root.__XPLAY_LOG_SINK_URL__).trim();
  }
  return null;
}

function setLogSinkUrl(url) {
  var trimmed = url == null ? '' : String(url).trim();
  safeLocalSet(LOG_SINK_STORAGE_KEY, trimmed || null);
}

function shouldRemoteLog() {
  return enabled && !!getLogSinkUrl();
}

function postToLogSink(payload) {
  var url = getLogSinkUrl();
  if (!url) return;
  var body;
  try {
    body = JSON.stringify(payload);
  } catch (e) {
    return;
  }
  try {
    if (typeof fetch === 'function') {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body
      }).catch(function () { /* fire-and-forget */ });
      return;
    }
  } catch (e) { /* fall through to XHR */ }
  try {
    if (typeof XMLHttpRequest !== 'undefined') {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(body);
    }
  } catch (e) { /* ignore */ }
}

function emitConsole(level, tag, message, detail) {
  var prefix = '[' + tag + '] ' + message;
  try {
    if (level === 'error') {
      if (detail !== undefined) console.error(prefix, detail);
      else console.error(prefix);
    } else if (level === 'warn') {
      if (detail !== undefined) console.warn(prefix, detail);
      else console.warn(prefix);
    } else if (detail !== undefined) {
      console.log(prefix, detail);
    } else {
      console.log(prefix);
    }
  } catch (e) { /* ignore */ }
}

function activateDebugOverlay(source) {
  enabled = true;
  ensureOverlay();
  pushLine('debug', 'Debug overlay active' + (source ? ' (' + source + ')' : ''));
  emitConsole('log', 'XPlay Lite', 'Debug overlay active' + (source ? ' via ' + source : ''));
}

function refreshDebugFromEnvironment(reason) {
  var state = getDebugEnableState();
  if (state.enabled) {
    if (!enabled) {
      if (state.source === 'launchParams' || state.source === '__XPLAY_DEBUG__' || state.source === 'url') {
        activateDebugOverlay(state.source + (reason ? ', ' + reason : ''));
      } else if (window.__xplayDebug && typeof window.__xplayDebug.enable === 'function') {
        window.__xplayDebug.enable();
        if (reason) pushLine('debug', 'Debug refreshed (' + reason + ')');
      } else {
        activateDebugOverlay(state.source + (reason ? ', ' + reason : ''));
      }
    } else {
      ensureDebugOverlayOnTop();
      if (reason) pushLine('debug', 'Debug still on (' + reason + ')');
    }
    return true;
  }
  return false;
}

function installRelaunchDebugRefresh() {
  if (relaunchHookInstalled || typeof document === 'undefined') return;
  relaunchHookInstalled = true;
  document.addEventListener('webOSRelaunch', function () {
    refreshDebugFromEnvironment('webOSRelaunch');
  }, true);
}

function mirrorTvLogRemote(tag, message, detail, level) {
  if (!shouldRemoteLog()) return;
  postToLogSink({
    level: level || 'log',
    tag: tag,
    message: message,
    ts: new Date().toISOString(),
    detail: formatDetail(detail) || undefined
  });
}

/**
 * Always posts to the remote sink if a sink URL is configured,
 * regardless of whether the debug overlay is enabled.
 * Used for errors that must never be silently dropped.
 */
function mirrorErrorRemote(tag, message, detail) {
  if (!getLogSinkUrl()) return;
  postToLogSink({
    level: 'error',
    tag: tag,
    message: message,
    ts: new Date().toISOString(),
    detail: formatDetail(detail) || undefined
  });
}

/** Always hits console; mirrors to on-screen overlay when debug is enabled. */
function tvLog(tag, message, detail) {
  emitConsole('error', tag, message, detail);
  if (!enabled && shouldEnableDebug()) {
    activateDebugOverlay('auto-sync');
  }
  if (enabled) {
    pushLine(tag, message, detail);
    mirrorTvLogRemote(tag, message, detail, 'log');
  }
}

/** Like tvLog but always uses console.error and tags failures prominently.
 *  Always POSTs to the remote sink if a sink URL is configured,
 *  even when the debug overlay is disabled. */
function tvError(tag, message, detail) {
  emitConsole('error', tag, message, detail);
  if (!enabled && shouldEnableDebug()) {
    activateDebugOverlay('auto-sync');
  }
  if (enabled) {
    pushLine(tag, message || 'ERROR', detail);
    mirrorTvLogRemote(tag, message || 'ERROR', detail, 'error');
  } else {
    mirrorErrorRemote(tag, message || 'ERROR', detail);
  }
}

function initTvDebug() {
  installRelaunchDebugRefresh();
  var state = getDebugEnableState();
  enabled = state.enabled;
  window.__xplayDebug = {
    isEnabled: function () { return enabled; },
    enable: function () {
      safeLocalSet(STORAGE_KEY, '1');
      enabled = true;
      ensureOverlay();
      pushLine('debug', 'Debug overlay enabled');
      emitConsole('log', 'XPlay Lite', 'Debug overlay enabled');
    },
    disable: function () {
      safeLocalSet(STORAGE_KEY, null);
      enabled = false;
      lines = [];
      if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl);
      overlayEl = null;
      emitConsole('log', 'XPlay Lite', 'Debug overlay disabled');
    },
    log: tvLog,
    error: tvError,
    getLines: function () { return lines.slice(); },
    getEnableState: getDebugEnableState,
    getLogSinkUrl: getLogSinkUrl,
    setLogSinkUrl: setLogSinkUrl,
    refresh: refreshDebugFromEnvironment
  };
  if (enabled) {
    activateDebugOverlay(state.source);
  } else {
    emitConsole('log', 'XPlay Lite', formatDisableHelp(state));
  }
  return enabled;
}

function isTvDebugEnabled() {
  return enabled;
}

export {
  initTvDebug,
  isTvDebugEnabled,
  tvLog,
  tvError,
  shouldEnableDebug,
  launchParamsDebugOn,
  getDebugEnableState,
  formatDisableHelp,
  refreshDebugFromEnvironment,
  ensureDebugOverlayOnTop,
  setDebugOverlayPlayerMode,
  getLogSinkUrl,
  setLogSinkUrl,
  LOG_SINK_STORAGE_KEY
};
