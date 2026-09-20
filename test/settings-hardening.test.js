// Settings screen + on-TV debug strip hardening guards:
//   - log-sink URL validation (Inline Edit-Toggle Field, Save/Test gate)
//   - debug strip line cap, per-line length cap, and no-op re-append
import test from 'node:test';
import assert from 'node:assert/strict';

import { validateLogSinkUrl } from '../src/ui/screens/settingsScreen.js';
import { initTvDebug, tvLog } from '../src/utils/tvDebug.js';

test('validateLogSinkUrl: empty clears the setting (no error)', function () {
  assert.equal(validateLogSinkUrl(''), '');
  assert.equal(validateLogSinkUrl('   '), '');
  assert.equal(validateLogSinkUrl(null), '');
});

test('validateLogSinkUrl: accepts http/https with a host', function () {
  assert.equal(validateLogSinkUrl('http://192.168.4.1:8765/log'), '');
  assert.equal(validateLogSinkUrl('  https://mac.local/log  '), '');
});

test('validateLogSinkUrl: names the problem for bad input', function () {
  assert.match(validateLogSinkUrl('192.168.4.1:8765/log'), /must start with http:\/\//);
  assert.match(validateLogSinkUrl('ftp://mac/log'), /must start with http:\/\//);
  assert.match(validateLogSinkUrl('http://'), /Add a host/);
  assert.match(validateLogSinkUrl('http://my mac/log'), /spaces/);
  var tooLong = 'http://h/' + new Array(2100).join('a');
  assert.match(validateLogSinkUrl(tooLong), /too long/);
});

function installDebugDom() {
  var appended = 0;
  var overlay = null;
  var body = {
    lastChild: null,
    appendChild: function (el) { appended += 1; overlay = el; body.lastChild = el; }
  };
  global.document = {
    readyState: 'complete',
    body: body,
    createElement: function (tag) {
      return {
        tagName: tag.toUpperCase(),
        id: '',
        className: '',
        classList: { add: function () {}, remove: function () {} },
        setAttribute: function () {},
        textContent: '',
        parentNode: null
      };
    },
    addEventListener: function () {}
  };
  global.localStorage = {
    _data: { plax_debug_enabled: '1' },
    getItem: function (k) { return this._data[k] || null; },
    setItem: function (k, v) { this._data[k] = v; },
    removeItem: function (k) { delete this._data[k]; }
  };
  global.window = {
    location: { search: '' },
    __XPLAY_DEBUG__: false,
    PalmSystem: { launchParams: '' },
    __plaxDebug: null
  };
  global.globalThis = global.window;
  global.console = { log: function () {}, warn: function () {}, error: function () {} };
  return { count: function () { return appended; }, overlay: function () { return overlay; } };
}

test('debug strip: thousands of lines keep only the last 14, one DOM node', function () {
  var dom = installDebugDom();
  initTvDebug();
  for (var i = 0; i < 3000; i++) tvLog('burst', 'line ' + i);
  var lines = global.window.__plaxDebug.getLines();
  assert.equal(lines.length, 14);
  assert.match(lines[13], /line 2999$/);
  assert.match(lines[0], /line 2986$/);
  assert.match(String(dom.overlay().textContent), /line 2999$/);
  // The strip is appended to <body> once; later lines must not re-append it.
  assert.equal(dom.count(), 1);
});

test('debug strip: a runaway detail is cut to 400 chars', function () {
  installDebugDom();
  initTvDebug();
  tvLog('big', 'payload', { blob: new Array(5000).join('x') });
  var lines = global.window.__plaxDebug.getLines();
  var last = lines[lines.length - 1];
  assert.equal(last.length, 400);
  assert.equal(last.charAt(399), '…');
});
