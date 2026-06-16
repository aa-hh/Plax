import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldExitToLauncher } from '../src/core/router.js';
import { activateAppForeground } from '../src/platform/webos.js';

describe('shouldExitToLauncher', function () {
  it('exits from top-level browse routes', function () {
    assert.equal(shouldExitToLauncher('home', {}), true);
    assert.equal(shouldExitToLauncher('library', {}), true);
    assert.equal(shouldExitToLauncher('watchlist', {}), true);
    assert.equal(shouldExitToLauncher('pairing', {}), true);
  });

  it('does not exit from nested routes', function () {
    assert.equal(shouldExitToLauncher('detail', {}), false);
    assert.equal(shouldExitToLauncher('player', {}), false);
    assert.equal(shouldExitToLauncher('settings', { _from: 'home' }), false);
    assert.equal(shouldExitToLauncher('search', { _from: 'home' }), false);
  });

  it('profile-picker exits only without _from', function () {
    assert.equal(shouldExitToLauncher('profile-picker', {}), true);
    assert.equal(shouldExitToLauncher('profile-picker', { _from: 'settings' }), false);
  });
});

describe('activateAppForeground', function () {
  it('prefers webOSSystem.activate on webOS 5+', function () {
    var calls = [];
    var prev = globalThis.webOSSystem;
    var prevPalm = globalThis.PalmSystem;
    globalThis.webOSSystem = {
      activate: function () { calls.push('webOSSystem'); }
    };
    globalThis.PalmSystem = {
      activate: function () { calls.push('PalmSystem'); }
    };
    try {
      assert.equal(activateAppForeground(), true);
      assert.deepEqual(calls, ['webOSSystem']);
    } finally {
      if (prev === undefined) delete globalThis.webOSSystem;
      else globalThis.webOSSystem = prev;
      if (prevPalm === undefined) delete globalThis.PalmSystem;
      else globalThis.PalmSystem = prevPalm;
    }
  });

  it('falls back to PalmSystem.activate', function () {
    var prev = globalThis.webOSSystem;
    var prevPalm = globalThis.PalmSystem;
    delete globalThis.webOSSystem;
    globalThis.PalmSystem = {
      activate: function () {}
    };
    try {
      assert.equal(activateAppForeground(), true);
    } finally {
      if (prev === undefined) delete globalThis.PalmSystem;
      else globalThis.PalmSystem = prevPalm;
      if (prev !== undefined) globalThis.webOSSystem = prev;
    }
  });
});
