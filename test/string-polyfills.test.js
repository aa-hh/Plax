import test from 'node:test';
import assert from 'node:assert/strict';

// Import the polyfill module (side-effect only)
import '../src/core/stringPolyfills.js';

// Tests exercise the behavior of padEnd and padStart regardless of whether
// the runtime already had native implementations or the polyfill installed them.

test('padEnd pads with the given fill character', function () {
  assert.equal('5'.padEnd(3, '0'), '500');
});

test('padEnd pads with spaces by default', function () {
  assert.equal('hi'.padEnd(5), 'hi   ');
});

test('padEnd returns string unchanged when already at target length', function () {
  assert.equal('abc'.padEnd(3, 'x'), 'abc');
});

test('padEnd returns string unchanged when longer than target length', function () {
  assert.equal('abcde'.padEnd(3, 'x'), 'abcde');
});

test('padEnd truncates pad string to exactly fill the gap', function () {
  assert.equal('1'.padEnd(5, 'ab'), '1abab');
});

test('padEnd returns string as-is when fill character is empty string', function () {
  assert.equal('hi'.padEnd(10, ''), 'hi');
});

test('padEnd works with multi-character fill that wraps', function () {
  assert.equal(''.padEnd(6, '123'), '123123');
});

test('padStart pads with the given fill character on the left', function () {
  assert.equal('5'.padStart(3, '0'), '005');
});

test('padStart pads with spaces by default', function () {
  assert.equal('hi'.padStart(5), '   hi');
});

test('padStart returns string unchanged when already at target length', function () {
  assert.equal('abc'.padStart(3, 'x'), 'abc');
});

test('padStart returns string unchanged when longer than target length', function () {
  assert.equal('abcde'.padStart(3, 'x'), 'abcde');
});

test('padStart truncates pad string to exactly fill the gap', function () {
  assert.equal('1'.padStart(5, 'ab'), 'abab1');
});

test('padStart returns string as-is when fill character is empty string', function () {
  assert.equal('hi'.padStart(10, ''), 'hi');
});

test('padStart works with multi-character fill that wraps', function () {
  assert.equal(''.padStart(6, '123'), '123123');
});

test('padEnd with targetLength 0 returns original string', function () {
  assert.equal('hi'.padEnd(0, 'x'), 'hi');
});

test('padStart with targetLength 0 returns original string', function () {
  assert.equal('hi'.padStart(0, 'x'), 'hi');
});

test('SRT-style timestamp formatting with padStart', function () {
  // This is the real use-case: formatting "5" as "05" for subtitle timestamps
  assert.equal(String(5).padStart(2, '0'), '05');
  assert.equal(String(10).padStart(2, '0'), '10');
  assert.equal(String(100).padStart(3, '0'), '100');
  assert.equal(String(5).padEnd(3, '0'), '500');
});
