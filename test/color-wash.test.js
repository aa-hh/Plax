import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCornerWashCss,
  cornerWashLayerCount,
  hexToRgba,
  NOISE_TILE_URL
} from '../src/ui/colorWash.js';

var COLORS = {
  topLeft: '1a1a2e',
  topRight: '16213e',
  bottomRight: '0f3460',
  bottomLeft: 'e94560'
};

test('hexToRgba: 6-digit hex, default alpha 1', function () {
  assert.equal(hexToRgba('e94560'), 'rgba(233, 69, 96, 1)');
});

test('hexToRgba: leading # is tolerated', function () {
  assert.equal(hexToRgba('#e94560'), 'rgba(233, 69, 96, 1)');
});

test('hexToRgba: 3-digit hex expands per-channel', function () {
  // #abc -> #aabbcc
  assert.equal(hexToRgba('abc', 1), 'rgba(170, 187, 204, 1)');
});

test('hexToRgba: explicit alpha is honored (including 0)', function () {
  assert.equal(hexToRgba('ffffff', 0), 'rgba(255, 255, 255, 0)');
  assert.equal(hexToRgba('ffffff', 0.5), 'rgba(255, 255, 255, 0.5)');
});

test('hexToRgba: invalid input returns empty string, never throws', function () {
  assert.equal(hexToRgba(''), '');
  assert.equal(hexToRgba('not-a-color'), '');
  assert.equal(hexToRgba(null), '');
  assert.equal(hexToRgba(undefined), '');
  assert.equal(hexToRgba(12345), '');
});

test('buildCornerWashCss: null/undefined colors returns empty string', function () {
  assert.equal(buildCornerWashCss(null), '');
  assert.equal(buildCornerWashCss(undefined), '');
});

test('buildCornerWashCss: empty object (no valid corners) returns empty string', function () {
  assert.equal(buildCornerWashCss({}), '');
});

test('buildCornerWashCss: includes the noise tile url as the first layer', function () {
  var css = buildCornerWashCss(COLORS);
  assert.ok(css.indexOf(NOISE_TILE_URL) === 0, 'noise tile is the first (topmost) layer');
});

test('buildCornerWashCss: contains exactly 4 radial-gradient( layers for 4 valid corners', function () {
  var css = buildCornerWashCss(COLORS);
  var matches = css.match(/radial-gradient\(/g);
  assert.equal(matches && matches.length, 4);
});

test('buildCornerWashCss: each radial-gradient is anchored at its own corner', function () {
  var css = buildCornerWashCss(COLORS);
  assert.match(css, /radial-gradient\(circle at 0% 0%,/);   // topLeft
  assert.match(css, /radial-gradient\(circle at 100% 0%,/); // topRight
  assert.match(css, /radial-gradient\(circle at 100% 100%,/); // bottomRight
  assert.match(css, /radial-gradient\(circle at 0% 100%,/);   // bottomLeft
});

test('buildCornerWashCss: each gradient fades from full color to transparent', function () {
  var css = buildCornerWashCss(COLORS);
  // topLeft = #1a1a2e -> rgb(26, 26, 46)
  assert.match(css, /rgba\(26, 26, 46, 1\) 0%/);
  assert.match(css, /rgba\(26, 26, 46, 0\) 62%/);
});

test('buildCornerWashCss: partial colors only emit gradients for valid corners', function () {
  var css = buildCornerWashCss({ topLeft: '111111' });
  var matches = css.match(/radial-gradient\(/g);
  assert.equal(matches && matches.length, 1);
  assert.match(css, /circle at 0% 0%/);
});

test('buildCornerWashCss: output has no Chrome53-unsafe CSS shorthand', function () {
  var css = buildCornerWashCss(COLORS);
  // The Chrome53 lint bans `inset:` shorthand and flex `gap` in .css files;
  // this string lands in an inline style, but keep it conservative anyway.
  assert.doesNotMatch(css, /\binset\s*:/);
  assert.doesNotMatch(css, /(^|[^-])\bgap\s*:/);
});

test('cornerWashLayerCount: matches the number of radial-gradient layers + noise tile', function () {
  assert.equal(cornerWashLayerCount(COLORS), 5); // 1 noise tile + 4 radials
  assert.equal(cornerWashLayerCount({ topLeft: '111111' }), 2); // 1 noise tile + 1 radial
});

test('cornerWashLayerCount: 0 when buildCornerWashCss would return empty', function () {
  assert.equal(cornerWashLayerCount(null), 0);
  assert.equal(cornerWashLayerCount({}), 0);
});

test('NOISE_TILE_URL: is a url(data:image/png;base64,...) repeat-ready value', function () {
  assert.match(NOISE_TILE_URL, /^url\(data:image\/png;base64,[A-Za-z0-9+/=]+\)/);
});
