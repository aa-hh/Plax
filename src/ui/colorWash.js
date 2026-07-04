/**
 * Native corner-wash backdrop — replaces the ultrablur JPEG upgrade.
 *
 * The detail screen background used to fetch 4 corner colors from PMS
 * (`/services/ultrablur/colors`), paint a cheap CSS gradient with them, then
 * "upgrade" to a 1280×720 JPEG that PMS renders server-side from those SAME
 * colors plus a noise-dither layer (to hide 8-bit gradient banding on OLED).
 * That JPEG's decode was measured on a real B8 at 1212ms — a synchronous
 * main-thread stall the app never needed, because both of its ingredients
 * (corner-anchored color blending + noise dithering) are reproducible
 * natively, near-instantly, with CSS: 4 radial gradients anchored at the
 * corners + a small tiled noise PNG layered on top.
 *
 * Dependency-free by design (same rule as transitionGate.js) — this is a pure
 * string-building module, safe to import from anywhere without cycle risk.
 */

// Small (48x48) transparent PNG, generated once by scripts/gen-noise-png.cjs:
// random per-pixel alpha in [0, 13] (~5% max) over solid white. Tiled via
// `repeat` as the top background-image layer, it breaks up the smooth radial
// gradients below just enough to avoid visible banding on OLED panels,
// without ever reading as its own visible texture.
var NOISE_TILE_URL =
  'url(data:image/png;base64,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) repeat';

/**
 * Parse `#rgb`/`#rrggbb`/`rgb`/`rrggbb` (tolerant of a leading `#`) into an
 * `rgba(r, g, b, a)` string. Returns '' for unparseable input so a bad color
 * never produces a broken `background-image` layer.
 */
function hexToRgba(hex, alpha) {
  if (typeof hex !== 'string') return '';
  var h = hex.trim().replace(/^#/, '');
  if (h.length === 3) {
    h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return '';
  var r = parseInt(h.slice(0, 2), 16);
  var g = parseInt(h.slice(2, 4), 16);
  var b = parseInt(h.slice(4, 6), 16);
  var a = alpha == null ? 1 : alpha;
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + a + ')';
}

// Corner anchor → CSS radial-gradient position. Each gradient fades from the
// corner's color to fully transparent by ~62% of its radius, so adjacent
// corners blend across the middle instead of leaving hard edges (the same
// bilinear-blend effect the JPEG produced, done on the compositor instead of
// a decode).
var CORNERS = [
  { key: 'topLeft', pos: '0% 0%' },
  { key: 'topRight', pos: '100% 0%' },
  { key: 'bottomRight', pos: '100% 100%' },
  { key: 'bottomLeft', pos: '0% 100%' }
];

/**
 * Build a `background-image` value from 4 corner colors: the noise tile
 * layer on top, then one radial gradient per corner underneath. Callers
 * should also set `background-color` to one of the corner colors (bottomLeft
 * is the convention here) so any uncovered center pixel never shows through
 * as the raw surface color.
 *
 * @param {{topLeft:string, topRight:string, bottomRight:string, bottomLeft:string}} colors
 *   Hex strings, `#` optional.
 * @returns {string} CSS `background-image` value, or '' if colors is falsy.
 */
function buildCornerWashCss(colors) {
  if (!colors) return '';
  var layers = [NOISE_TILE_URL];
  for (var i = 0; i < CORNERS.length; i++) {
    var corner = CORNERS[i];
    var rgba = hexToRgba(colors[corner.key], 1);
    if (!rgba) continue;
    var transparent = hexToRgba(colors[corner.key], 0);
    layers.push(
      'radial-gradient(circle at ' + corner.pos + ', ' + rgba + ' 0%, ' + transparent + ' 62%)'
    );
  }
  if (layers.length === 1) return ''; // no valid corners — nothing to paint
  return layers.join(', ');
}

/**
 * Number of `background-image` layers `buildCornerWashCss(colors)` would
 * produce (noise tile + one radial-gradient per valid corner), so callers
 * can build a matching per-layer `background-repeat`/`background-size`
 * WITHOUT parsing the generated CSS string (which contains its own internal
 * `, ` separators inside every `rgba(r, g, b, a)` term, making naive
 * `.split(', ')` unsafe). Returns 0 if buildCornerWashCss would return ''.
 *
 * @param {{topLeft:string, topRight:string, bottomRight:string, bottomLeft:string}} colors
 * @returns {number}
 */
function cornerWashLayerCount(colors) {
  if (!colors) return 0;
  var count = 1; // noise tile
  for (var i = 0; i < CORNERS.length; i++) {
    if (hexToRgba(colors[CORNERS[i].key], 1)) count++;
  }
  return count === 1 ? 0 : count; // no valid corners — buildCornerWashCss returns ''
}

export { buildCornerWashCss, cornerWashLayerCount, hexToRgba, NOISE_TILE_URL };
