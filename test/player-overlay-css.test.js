// Guards for the player overlay's state/motion CSS (src/styles/app.css).
// Text-level checks in the style of webos4-css-compat.test.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

var cssSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/styles/app.css'),
  'utf8'
);

function rule(selector) {
  var idx = cssSrc.indexOf('\n' + selector + ' {');
  assert.ok(idx >= 0, selector + ' rule present');
  var start = cssSrc.indexOf('{', idx);
  var depth = 0;
  for (var i = start; i < cssSrc.length; i++) {
    if (cssSrc[i] === '{') depth++;
    else if (cssSrc[i] === '}') {
      depth--;
      if (depth === 0) return cssSrc.slice(start + 1, i);
    }
  }
  assert.fail(selector + ' rule not closed');
}

test('player overlay: skip prompt survives the auto-hide (parent opacity stays 1)', function () {
  // Regression: .player-overlay--hidden gained opacity:0 after the skip-prompt
  // rules were written, which faded the prompt (a child) out with the transport.
  var hidden = rule('.player-overlay--hidden');
  assert.match(hidden, /opacity:\s*0/);
  var skipActive = rule('.player-overlay--hidden.player-overlay--skip-intro-active');
  assert.match(skipActive, /opacity:\s*1/);
  assert.match(skipActive, /visibility:\s*visible/);
  var bottom = rule('.player-overlay--hidden.player-overlay--skip-intro-active .player-bottom');
  assert.match(bottom, /opacity:\s*0/);
});

test('player overlay: exit is shorter than enter and uses accelerate/decelerate tokens', function () {
  var base = rule('.player-overlay');
  assert.match(base, /transition:\s*opacity var\(--dur-short4\) var\(--ease-emphasized-decelerate\)/);
  var hidden = rule('.player-overlay--hidden');
  assert.match(hidden, /opacity var\(--dur-short3\) var\(--ease-standard-accelerate\)/);
  assert.match(hidden, /visibility 0s linear var\(--dur-short3\)/);
});

test('player overlay: prompt/toast entrances are gated, transform+opacity only, reduced-motion safe', function () {
  ['player-skip-prompt-in', 'player-autoplay-in'].forEach(function (name) {
    var defs = cssSrc.split('@keyframes ' + name + ' {');
    assert.equal(defs.length, 3, name + ' defined once normally + once under prefers-reduced-motion');
    defs.slice(1).forEach(function (body) {
      var block = body.slice(0, body.indexOf('}\n'));
      assert.doesNotMatch(block, /\b(width|height|top|left|margin|box-shadow|filter)\s*:/, name + ' animates transform/opacity only');
    });
  });
  assert.match(cssSrc, /html\.caps-motion \.player-skip-intro-prompt \{\s*animation: player-skip-prompt-in/);
  assert.match(cssSrc, /html\.caps-motion \.player-autoplay-panel \{\s*animation: player-autoplay-in/);
  // The reduced-motion redefinitions keep the prompt's translateX(-50%) centering.
  var reduced = cssSrc.slice(cssSrc.indexOf('@media (prefers-reduced-motion: reduce) {\n  @keyframes player-skip-prompt-in'));
  var reducedSkip = reduced.slice(0, reduced.indexOf('@keyframes player-autoplay-in'));
  assert.doesNotMatch(reducedSkip, /12px/);
  assert.match(reducedSkip, /from \{ opacity: 0; transform: translateX\(-50%\); \}/);
});

test('player overlay: disabled transport pills are visibly dimmed and unclickable', function () {
  var disabled = rule('.player-control-pill:disabled');
  assert.match(disabled, /opacity:\s*0\.38/);
  assert.match(disabled, /pointer-events:\s*none/);
});

test('player overlay: status and error banner wrap unbroken tokens', function () {
  assert.match(rule('.player-status'), /overflow-wrap:\s*break-word/);
  assert.match(rule('.player-playback-error'), /overflow-wrap:\s*break-word/);
});
