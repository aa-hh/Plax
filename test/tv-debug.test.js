import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldEnableDebug,
  launchParamsDebugOn,
  getDebugEnableState,
  formatDisableHelp,
  refreshDebugFromEnvironment,
  isTvDebugEnabled,
  initTvDebug,
  tvLog,
  getLogSinkUrl,
  setLogSinkUrl,
  ensureDebugOverlayOnTop,
  setDebugOverlayPlayerMode
} from '../src/utils/tvDebug.js';

test('shouldEnableDebug: localStorage flag', function () {
  global.localStorage = {
    _data: { xplay_debug_enabled: '1' },
    getItem: function (k) { return this._data[k] || null; }
  };
  global.window = { location: { search: '' }, __XPLAY_DEBUG__: false, PalmSystem: {} };
  global.globalThis = global.window;
  assert.equal(shouldEnableDebug(), true);
});

test('launchParamsDebugOn: JSON debug param string', function () {
  global.window = {
    PalmSystem: { launchParams: '{"debug":1}' }
  };
  global.globalThis = global.window;
  assert.equal(launchParamsDebugOn(), true);
});

test('launchParamsDebugOn: debug param object (webOS 4)', function () {
  global.window = {
    PalmSystem: { launchParams: { debug: 1 } }
  };
  global.globalThis = global.window;
  assert.equal(launchParamsDebugOn(), true);
});

test('launchParamsDebugOn: debug=1 query-style string', function () {
  global.window = {
    PalmSystem: { launchParams: 'debug=1' }
  };
  global.globalThis = global.window;
  assert.equal(launchParamsDebugOn(), true);
});

test('getDebugEnableState: reports disable reason', function () {
  global.localStorage = {
    getItem: function () { return null; }
  };
  global.window = {
    location: { search: '' },
    __XPLAY_DEBUG__: false,
    PalmSystem: { launchParams: '' }
  };
  global.globalThis = global.window;
  var state = getDebugEnableState();
  assert.equal(state.enabled, false);
  assert.equal(state.source, 'none');
  assert.match(formatDisableHelp(state), /ares-launch -p/);
});

test('refreshDebugFromEnvironment: enables on relaunch params without reload', function () {
  global.localStorage = {
    _data: {},
    getItem: function (k) { return this._data[k] || null; },
    setItem: function (k, v) { this._data[k] = v; },
    removeItem: function (k) { delete this._data[k]; }
  };
  global.document = {
    readyState: 'complete',
    createElement: function (tag) {
      return {
        tagName: tag.toUpperCase(),
        id: '',
        className: '',
        classList: {
          _classes: {},
          add: function (c) { this._classes[c] = true; },
          remove: function (c) { delete this._classes[c]; }
        },
        textContent: '',
        setAttribute: function () {},
        parentNode: null
      };
    },
    body: {
      appendChild: function (el) { this.lastChild = el; }
    },
    addEventListener: function () {}
  };
  global.window = {
    location: { search: '' },
    __XPLAY_DEBUG__: false,
    PalmSystem: { launchParams: '' },
    __xplayDebug: null
  };
  global.globalThis = global.window;
  assert.equal(refreshDebugFromEnvironment('boot'), false);
  global.window.PalmSystem.launchParams = '{"debug":1}';
  assert.equal(refreshDebugFromEnvironment('webOSRelaunch'), true);
  assert.equal(isTvDebugEnabled(), true);
});

test('ensureDebugOverlayOnTop: re-appends overlay as last body child', function () {
  var overlay = null;
  global.document = {
    readyState: 'complete',
    createElement: function (tag) {
      return {
        tagName: tag.toUpperCase(),
        id: '',
        className: '',
        classList: {
          _classes: {},
          add: function (c) { this._classes[c] = true; },
          remove: function (c) { delete this._classes[c]; }
        },
        textContent: '',
        setAttribute: function () {},
        parentNode: null
      };
    },
    body: {
      children: [],
      appendChild: function (el) {
        overlay = el;
        el.parentNode = this;
        this.lastChild = el;
      },
      removeChild: function (el) {
        if (this.lastChild === el) this.lastChild = null;
        el.parentNode = null;
        return el;
      }
    },
    addEventListener: function () {}
  };
  global.localStorage = {
    _data: { xplay_debug_enabled: '1' },
    getItem: function (k) { return this._data[k] || null; },
    setItem: function (k, v) { this._data[k] = v; },
    removeItem: function (k) { delete this._data[k]; }
  };
  global.window = {
    location: { search: '' },
    __XPLAY_DEBUG__: false,
    PalmSystem: { launchParams: '' },
    __xplayDebug: null
  };
  global.globalThis = global.window;
  global.console = { log: function () {}, warn: function () {}, error: function () {} };
  initTvDebug();
  ensureDebugOverlayOnTop();
  var el = document.body.lastChild;
  assert.ok(el);
  setDebugOverlayPlayerMode(true);
  assert.ok(el.classList._classes['xplay-debug-overlay--player']);
  tvLog('playback', 'test line');
  assert.match(String(el.textContent), /\[playback\] test line/);
});

test('tvLog: POSTs to log sink when debug on', function () {
  var posts = [];
  global.fetch = function (url, init) {
    posts.push({ url: url, body: init && init.body });
    return { catch: function () {} };
  };
  global.localStorage = {
    _data: { xplay_debug_enabled: '1', xplay_log_sink_url: 'http://192.168.1.2:8765/log' },
    getItem: function (k) { return this._data[k] || null; },
    setItem: function (k, v) { this._data[k] = v; },
    removeItem: function (k) { delete this._data[k]; }
  };
  global.document = {
    readyState: 'complete',
    createElement: function () {
      return {
        classList: { add: function () {}, remove: function () {} },
        setAttribute: function () {},
        parentNode: null
      };
    },
    body: { appendChild: function () {} },
    addEventListener: function () {}
  };
  global.window = {
    location: { search: '' },
    __XPLAY_DEBUG__: false,
    PalmSystem: { launchParams: '' },
    __xplayDebug: null
  };
  global.globalThis = global.window;
  global.console = { log: function () {}, warn: function () {}, error: function () {} };
  initTvDebug();
  assert.equal(getLogSinkUrl(), 'http://192.168.1.2:8765/log');
  tvLog('remote', 'ship it', { ok: true });
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, 'http://192.168.1.2:8765/log');
  var parsed = JSON.parse(posts[0].body);
  assert.equal(parsed.tag, 'remote');
  assert.equal(parsed.message, 'ship it');
  assert.match(parsed.detail, /ok/);
  setLogSinkUrl('');
  assert.equal(getLogSinkUrl(), null);
  delete global.fetch;
});

test('getLogSinkUrl: launchParams logSink wins over storage', function () {
  global.localStorage = {
    _data: { xplay_log_sink_url: 'http://10.0.0.1:8765/log' },
    getItem: function (k) { return this._data[k] || null; }
  };
  global.window = {
    PalmSystem: { launchParams: '{"debug":1,"logSink":"http://192.168.9.9:8765/log"}' }
  };
  global.globalThis = global.window;
  assert.equal(getLogSinkUrl(), 'http://192.168.9.9:8765/log');
});
