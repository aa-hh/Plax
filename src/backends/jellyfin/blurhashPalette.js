/**
 * Jellyfin ambient palette — decode an item's BlurHash to a 4-corner color
 * palette ({topLeft,topRight,bottomRight,bottomLeft}, hex WITHOUT leading '#'),
 * matching the shape Plex's PMS /services/ultrablur/colors returns.
 *
 * WHY pure JS math (no canvas/getImageData/blob-XHR/network): the real B8
 * (webOS 4, Chrome 53) was proven to return null from the canvas byte-read path
 * (see src/ui/palette.js history), and backdrop art often isn't decoded yet when
 * the wash needs to fade in. A BlurHash is a tiny string already carried on the
 * item — decoding it is a handful of cos()/pow() calls over at most 9×9 DCT
 * components, sampled at only 4 points. No pixels, no I/O, no allocation churn.
 *
 * The decode follows the reference BlurHash algorithm (base83 → DCT components →
 * inverse cosine transform), sampling the CENTER of each corner quadrant so each
 * corner reads as a representative regional color rather than an extreme edge
 * value (analogous to averageCorners sampling a corner block in palette.js).
 */

// Base83 alphabet used by BlurHash (order is significant).
var DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';

// Decode the base83 substring [from, to). Returns -1 on any invalid character
// so callers can bail to null instead of producing a garbage color.
function decode83(str, from, to) {
  var value = 0;
  for (var i = from; i < to; i++) {
    var idx = DIGITS.indexOf(str.charAt(i));
    if (idx < 0) return -1;
    value = value * 83 + idx;
  }
  return value;
}

function srgbToLinear(v255) {
  var v = v255 / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

// Inverse of srgbToLinear, quantised to a 0-255 byte. Mirrors the reference
// linearTosRGB (truncate-with-+0.5 rounding, not Math.round, so 0 stays 0).
function linearToSrgb(value) {
  var x = value < 0 ? 0 : (value > 1 ? 1 : value);
  var raw = x <= 0.0031308
    ? x * 12.92 * 255
    : (1.055 * Math.pow(x, 1 / 2.4) - 0.055) * 255;
  return Math.floor(raw + 0.5);
}

function signPow(val, exp) {
  var s = val < 0 ? -1 : 1;
  return s * Math.pow(Math.abs(val), exp);
}

/**
 * Decode a BlurHash string into its DCT component grid.
 * @returns {{numX:number, numY:number, colors:number[][]}|null} linear-RGB
 *   components, or null if the hash is malformed/absent.
 */
function decodeBlurHashComponents(hash) {
  if (typeof hash !== 'string' || hash.length < 6) return null;

  var sizeFlag = decode83(hash, 0, 1);
  if (sizeFlag < 0) return null;
  var numX = (sizeFlag % 9) + 1;
  var numY = Math.floor(sizeFlag / 9) + 1;

  // Each component is 2 base83 chars; the DC (component 0) shares the header's
  // 4-char field. A hash of the wrong length is corrupt — bail.
  if (hash.length !== 4 + 2 * numX * numY) return null;

  var quantMax = decode83(hash, 1, 2);
  if (quantMax < 0) return null;
  var maximumValue = (quantMax + 1) / 166;

  var count = numX * numY;
  var colors = new Array(count);
  for (var i = 0; i < count; i++) {
    if (i === 0) {
      var dc = decode83(hash, 2, 6);
      if (dc < 0) return null;
      colors[i] = [
        srgbToLinear((dc >> 16) & 255),
        srgbToLinear((dc >> 8) & 255),
        srgbToLinear(dc & 255)
      ];
    } else {
      var start = 4 + i * 2;
      var ac = decode83(hash, start, start + 2);
      if (ac < 0) return null;
      var quantR = Math.floor(ac / (19 * 19));
      var quantG = Math.floor(ac / 19) % 19;
      var quantB = ac % 19;
      colors[i] = [
        signPow((quantR - 9) / 9, 2) * maximumValue,
        signPow((quantG - 9) / 9, 2) * maximumValue,
        signPow((quantB - 9) / 9, 2) * maximumValue
      ];
    }
  }
  return { numX: numX, numY: numY, colors: colors };
}

// Reconstruct the color at a normalized position (px, py in [0,1]) via the
// inverse cosine transform. Returns a 0-255 [r,g,b] byte triple.
function sampleAt(decoded, px, py) {
  var numX = decoded.numX;
  var numY = decoded.numY;
  var colors = decoded.colors;
  var r = 0, g = 0, b = 0;
  for (var j = 0; j < numY; j++) {
    var cosY = Math.cos(Math.PI * py * j);
    for (var i = 0; i < numX; i++) {
      var basis = Math.cos(Math.PI * px * i) * cosY;
      var c = colors[j * numX + i];
      r += c[0] * basis;
      g += c[1] * basis;
      b += c[2] * basis;
    }
  }
  return [linearToSrgb(r), linearToSrgb(g), linearToSrgb(b)];
}

function toHex2(n) {
  var s = n.toString(16);
  return s.length === 1 ? '0' + s : s;
}

function rgbToHex(rgb) {
  return toHex2(rgb[0]) + toHex2(rgb[1]) + toHex2(rgb[2]);
}

/**
 * @param {string} hash  a BlurHash string
 * @returns {{topLeft:string, topRight:string, bottomRight:string, bottomLeft:string}|null}
 *   4-corner palette (hex without '#'), or null on any failure/absent hash.
 */
function blurHashToCorners(hash) {
  var decoded = decodeBlurHashComponents(hash);
  if (!decoded) return null;
  return {
    topLeft: rgbToHex(sampleAt(decoded, 0.25, 0.25)),
    topRight: rgbToHex(sampleAt(decoded, 0.75, 0.25)),
    bottomRight: rgbToHex(sampleAt(decoded, 0.75, 0.75)),
    bottomLeft: rgbToHex(sampleAt(decoded, 0.25, 0.75))
  };
}

export { blurHashToCorners, decodeBlurHashComponents, decode83 };
