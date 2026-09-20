// First-run / sign-in / picker hardening guards (pairing, Jellyfin login + user
// picker, profile picker, server picker). Covers the plain-language error copy,
// the initials fallback, and the CSS/source invariants that keep motion gated
// and states legible on webOS 4.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describePairingError } from '../src/ui/screens/pairingScreen.js';
import { describeJellyfinError } from '../src/ui/screens/jellyfinLoginScreen.js';
import { initialsFromName } from '../src/ui/screens/profilePickerScreen.js';

var here = dirname(fileURLToPath(import.meta.url));
function read(rel) { return readFileSync(join(here, rel), 'utf8'); }
var css = read('../src/styles/app.css');
var pairingSrc = read('../src/ui/screens/pairingScreen.js');
var loginSrc = read('../src/ui/screens/jellyfinLoginScreen.js');
var pickerSrc = read('../src/ui/screens/profilePickerScreen.js');
var jfPickerSrc = read('../src/ui/screens/jellyfinUserPickerScreen.js');
var serverSrc = read('../src/ui/screens/serverPickerScreen.js');

function httpErr(status) { var e = new Error('HTTP ' + status); e.status = status; return e; }

test('pairing copy: names the problem and the recovery, never a raw error', function () {
  assert.match(describePairingError(new Error('Pairing timed out')), /expired.*Refresh code/);
  assert.match(describePairingError(new Error('Request timeout')), /network.*Refresh code/i);
  assert.match(describePairingError(httpErr(429)), /slow down/);
  assert.match(describePairingError(httpErr(503)), /HTTP 503/);
  assert.match(describePairingError(new TypeError('Failed to fetch')), /reach plex\.tv/);
  [null, undefined, {}, new Error('')].forEach(function (e) {
    var msg = describePairingError(e);
    assert.ok(msg.length > 20);
    assert.doesNotMatch(msg, /^Error/);
  });
});

test('jellyfin copy: 401/403/timeout/network map per context; raw HTTP never leaks alone', function () {
  assert.equal(describeJellyfinError(httpErr(401), 'signin'), 'Incorrect username or password.');
  assert.match(describeJellyfinError(httpErr(401), 'server'), /refused/);
  assert.match(describeJellyfinError(httpErr(403), 'signin'), /allowed to sign in/);
  assert.match(describeJellyfinError(httpErr(404), 'server'), /address and port/);
  assert.match(describeJellyfinError(new Error('Request timeout'), 'server'), /No answer/);
  assert.match(describeJellyfinError(new Error('Request timeout'), 'signin'), /timed out/);
  assert.match(describeJellyfinError(new TypeError('Failed to fetch'), 'signin'), /network/);
  assert.equal(describeJellyfinError(new Error('That address is not a Jellyfin server'), 'server'),
    'That address is not a Jellyfin server');
  assert.match(describeJellyfinError(null, 'signin'), /Sign-in failed/);
  assert.doesNotMatch(describeJellyfinError(httpErr(500), 'server'), /^HTTP/);
});

test('initials: two words, one word, empty, CJK, emoji (surrogate-safe)', function () {
  assert.equal(initialsFromName('Alec Henderson'), 'AH');
  assert.equal(initialsFromName('alec'), 'AL');
  assert.equal(initialsFromName('x'), 'X');
  assert.equal(initialsFromName(''), '?');
  assert.equal(initialsFromName(null), '?');
  assert.equal(initialsFromName('李雷'), '李雷');
  assert.equal(initialsFromName('😀 Bob'), '😀B');
  assert.equal(initialsFromName('😀'), '😀');
});

test('pairing: refresh/poll results are generation-guarded and errors focus Refresh code', function () {
  assert.match(pairingSrc, /var generation = 0/);
  assert.match(pairingSrc, /gen === generation/);
  assert.match(pairingSrc, /if \(requesting\) return/);
  assert.match(pairingSrc, /describePairingError\(err\)/);
  assert.match(pairingSrc, /pairing--no-qr/);
  assert.doesNotMatch(pairingSrc, /'Error: ' \+/);
  assert.match(css, /\.pairing--no-qr \.pairing-qr \{ display: none; \}/);
  assert.match(css, /html\.caps-motion \.pairing-qr,\s*html\.caps-motion \.pairing-code \{\s*transition: opacity var\(--dur-short4\)/);
});

test('jellyfin login: field-level errors, busy guards, stale-address guard', function () {
  assert.match(loginSrc, /login-field__error/);
  assert.match(loginSrc, /login-field--error/);
  assert.match(loginSrc, /if \(connecting\) return/);
  assert.match(loginSrc, /if \(signingIn\) return/);
  assert.match(loginSrc, /gen !== addressGen/);
  assert.match(css, /\.jellyfin-login \.login-field--error \.login-field__btn \{ border-color: var\(--color-error-light\); \}/);
  assert.match(css, /html\.caps-motion \.jellyfin-login \.login-step\.is-active \{\s*animation: gt-sheet-in var\(--dur-short4\) var\(--ease-standard-decelerate\)/);
});

test('profile picker: hidden PIN panel really hides; shake + reveals are caps-motion gated', function () {
  assert.match(css, /\.profile-picker-pin\[hidden\] \{\s*display: none;\s*\}/);
  assert.match(css, /html\.caps-motion \.profile-picker--pin-error \.pin-display \{\s*animation: pin-shake var\(--dur-medium2\) var\(--ease-standard\)/);
  assert.doesNotMatch(css, /animation: pin-shake 0\.35s ease/);
  assert.match(css, /html\.caps-motion \.profile-picker-row--enter \{\s*animation: gt-sheet-in var\(--dur-short4\)/);
  assert.match(css, /html\.caps-motion \.profile-picker--pin-mode \.profile-picker-pin \{\s*animation: gt-sheet-in var\(--dur-medium1\) var\(--ease-emphasized-decelerate\)/);
  assert.match(css, /\.profile-picker-screen \{[^}]*overflow-y: auto/);
  assert.match(pickerSrc, /profile-picker-row--enter/);
  assert.match(jfPickerSrc, /profile-picker-row--enter/);
});

test('profile picker: load is stale-guarded, timers cleared on destroy, retry always offered', function () {
  assert.match(pickerSrc, /var loadGen = \+\+switchGeneration/);
  assert.match(pickerSrc, /if \(loadTimeout\) \{ clearTimeout\(loadTimeout\); loadTimeout = null; \}/);
  var destroyBlock = pickerSrc.match(/destroy: function \(\) \{[\s\S]*?\}\s*\};/)[0];
  assert.match(destroyBlock, /destroyed = true/);
  assert.match(destroyBlock, /clearTimeout\(loadTimeout\)/);
  // bootstrap-without-profiles failure must land on showLoadError (focusable Try again)
  var bwp = pickerSrc.match(/function bootstrapWithoutProfiles\(\) \{[\s\S]*?\n  \}/)[0];
  assert.match(bwp, /showLoadError\(/);
  assert.doesNotMatch(bwp, /showPinFlowMessage\(msg, true\)/);
  // Back during "Verifying PIN" abandons that attempt
  var exitBlock = pickerSrc.match(/function exitPinMode\(\) \{[\s\S]*?\n  \}/)[0];
  assert.match(exitBlock, /switchGeneration \+= 1/);
});

test('status-msg error modifier outranks the muted base colour', function () {
  var base = css.indexOf('.status-msg {');
  var fix = css.indexOf('.status-msg.watch-status-error {');
  assert.ok(base > 0 && fix > base, 'compound error rule declared after .status-msg');
});

test('server picker: 2-line label clamp, scrollable overflow, switch guard, 0-link copy', function () {
  var label = css.match(/\.server-card__label \{[^}]*\}/)[0];
  assert.match(label, /-webkit-line-clamp: 2/);
  assert.doesNotMatch(label, /white-space: nowrap/);
  assert.doesNotMatch(label, /transition/);
  assert.match(css, /\.server-picker-screen \{\s*justify-content: flex-start;\s*overflow-y: auto;/);
  assert.match(serverSrc, /if \(destroyed \|\| switching\) return/);
  assert.match(serverSrc, /No saved servers yet/);
});

test('no bare `ease` timing or color transitions left on picker/login selectors', function () {
  var mine = css.split('\n').filter(function (line) {
    return /(profile-card|server-card|pin-display|pairing|login-field|login-step)/.test(line) ||
      /transition: color 0\.18s ease/.test(line);
  });
  mine.forEach(function (line) {
    assert.doesNotMatch(line, /\bease;|\bease\b\s*[,;]/, 'bare ease: ' + line.trim());
    assert.doesNotMatch(line, /transition: color/, 'paint transition: ' + line.trim());
  });
});
