/**
 * Regression: player drawer open/close must not leave a stale focusable cache
 * that dead-ends D-pad DOWN from the seek bar.
 *
 * Drives the REAL focus.js engine and the REAL setPlayerBottomFocusable() trap
 * through the exact sequence a user hits:
 *   1. Normal D-pad nav populates the focusable cache with the full chrome.
 *   2. A settings drawer opens. In the live app, onOverlayActivity →
 *      setOverlayVisible(true) calls invalidateFocusableCache(), and openMenu →
 *      setPlayerBottomFocusable(overlay, false) traps the chrome at tabindex=-1.
 *   3. Switching drawers (LEFT/RIGHT) churns focus; the focusout watchdog
 *      repopulates the cache via getFocusables(overlay) WHILE the chrome is
 *      trapped — so the rebuilt list omits the transport row.
 *   4. The drawer closes: setPlayerBottomFocusable(overlay, true) restores
 *      tabindex AND invalidates the cache (the fix). Without that invalidate the
 *      stale, transport-less list survives and DOWN from the seek bar goes
 *      nowhere.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { installMinimalDom, createElement, layout } from './helpers/minimal-dom.js';
import { handleKeyNav, getFocusables, invalidateFocusableCache } from '../src/ui/focus.js';
import { setPlayerBottomFocusable } from '../src/ui/screens/playerChromeFocus.js';

var ARROW_DOWN = 40;
var ARROW_UP = 38;

function keyEvent(code) {
  return { keyCode: code, preventDefault: function () {} };
}

function pill(id, className) {
  var el = createElement('button');
  el.id = id;
  el.className = className;
  el.setAttribute('tabindex', '0');
  return el;
}

// overlay → .player-bottom → seek bar (full-width) above a centred transport
// row, matching the shipping player so the real setPlayerBottomFocusable()
// (which scopes to `.player-bottom`) finds the controls.
function buildPlayerOverlay() {
  var overlay = createElement('div');
  overlay.className = 'player-overlay';
  var bottom = createElement('div');
  bottom.className = 'player-bottom';
  overlay.appendChild(bottom);

  var seekBar = pill('player-seek', 'player-seek-bar');
  layout(seekBar, 0, 900, 1920, 20);
  bottom.appendChild(seekBar);

  var prev  = pill('btn-prev',  'player-control-pill'); layout(prev,   760, 940, 100, 48); bottom.appendChild(prev);
  var pause = pill('btn-pause', 'player-control-pill'); layout(pause,  880, 940, 100, 48); bottom.appendChild(pause);
  var next  = pill('btn-next',  'player-control-pill'); layout(next,  1000, 940, 100, 48); bottom.appendChild(next);

  return overlay;
}

test('player drawer: DOWN from seek bar still reaches transport after a drawer open/close', function () {
  installMinimalDom();
  invalidateFocusableCache();
  var overlay = buildPlayerOverlay();
  document.registerTree(overlay);

  // 1. Normal nav: pause → seek (populates the cache with the full chrome).
  overlay.querySelector('#btn-pause').focus();
  handleKeyNav(overlay, keyEvent(ARROW_UP));
  assert.equal(document.activeElement.id, 'player-seek', 'precondition: UP reaches seek bar');

  // 2. Drawer opens: overlay-activity invalidates the cache; chrome is trapped.
  invalidateFocusableCache();
  setPlayerBottomFocusable(overlay, false);

  // 3. Switching drawers churns focus → watchdog repopulates the cache while
  //    the chrome is trapped (the transport is excluded by isNavFocusable).
  getFocusables(overlay);

  // 4. Drawer closes: tabindex restored AND cache invalidated (the fix).
  setPlayerBottomFocusable(overlay, true);

  // 5. Back on the seek bar, DOWN must reach the transport row.
  overlay.querySelector('#player-seek').focus();
  var handled = handleKeyNav(overlay, keyEvent(ARROW_DOWN));
  assert.equal(handled, true, 'DOWN from seek bar should move into the transport row');
  assert.ok(
    ['btn-prev', 'btn-pause', 'btn-next'].indexOf(document.activeElement.id) >= 0,
    'expected a transport pill after DOWN, got ' + document.activeElement.id
  );
});
