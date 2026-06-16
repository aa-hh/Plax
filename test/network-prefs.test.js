import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INSECURE_DEFAULT_MAX_MAJOR,
  defaultAllowInsecure,
  resolveNetworkPrefs,
  resolveNetworkPrefsFromDevice,
  hasExplicitAllowInsecure
} from '../src/settings/networkPrefs.js';

test('defaultAllowInsecure is ON for webOS 4 and below', function () {
  assert.equal(defaultAllowInsecure(4), true);
  assert.equal(defaultAllowInsecure(3), true);
  assert.equal(defaultAllowInsecure(5), false);
  assert.equal(defaultAllowInsecure(6), false);
  assert.equal(defaultAllowInsecure(0), false);
  assert.equal(defaultAllowInsecure(null), false);
});

test('resolveNetworkPrefs applies webOS 4 default when unset', function () {
  var prefs = resolveNetworkPrefs(null, 4);
  assert.equal(prefs.allowInsecure, true);
  assert.equal(prefs.preferDirect, true);
});

test('resolveNetworkPrefs keeps HTTPS-only default on webOS 5+', function () {
  var prefs = resolveNetworkPrefs(null, 5);
  assert.equal(prefs.allowInsecure, false);
});

test('resolveNetworkPrefs respects explicit user choice on webOS 4', function () {
  assert.equal(resolveNetworkPrefs({ allowInsecure: false }, 4).allowInsecure, false);
  assert.equal(resolveNetworkPrefs({ allowInsecure: true }, 5).allowInsecure, true);
});

test('resolveNetworkPrefsFromDevice uses device versionMajor', function () {
  var prefs = resolveNetworkPrefsFromDevice(null, { versionMajor: 4, modelName: 'OLED55B8PUA' });
  assert.equal(prefs.allowInsecure, true);
});

test('hasExplicitAllowInsecure detects saved boolean', function () {
  assert.equal(hasExplicitAllowInsecure(null), false);
  assert.equal(hasExplicitAllowInsecure({}), false);
  assert.equal(hasExplicitAllowInsecure({ allowInsecure: true }), true);
  assert.equal(hasExplicitAllowInsecure({ allowInsecure: false }), true);
});

test('INSECURE_DEFAULT_MAX_MAJOR matches webOS 4 B8 target', function () {
  assert.equal(INSECURE_DEFAULT_MAX_MAJOR, 4);
});
