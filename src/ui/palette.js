/**
 * Client-side corner-palette sampler for the immersive home hero.
 *
 * Feeds `colorWash.js` (`buildCornerWashCss`) with 4 corner colors derived from
 * the hero art itself — so the ambient wash tints to the focused title with NO
 * server round-trip (the PMS `/services/ultrablur/colors` endpoint measured
 * ~1.8s on cache-miss). The bytes are fetched ONCE and reused three ways: the
 * crisp corner box, the soft full-bleed layer, and this palette.
 *
 * ── THE file:// CANVAS-TAINT LANDMINE ──────────────────────────────────────
 * The app runs over `file://`, so every network image is cross-origin. Drawing
 * a plain `new Image()` (loaded from an http(s) URL) onto a canvas TAINTS that
 * canvas, and `getImageData` then throws SecurityError — there is no CORS header
 * dance that fixes it from a file:// origin. The escape hatch: fetch the art as
 * a **Blob via XHR** (the Plex token already rides in the URL query from
 * `getArtUrl`, so no custom headers are needed), wrap it in a
 * `URL.createObjectURL(blob)` — a `blob:` URL is SAME-ORIGIN — and draw THAT
 * image. Same-origin canvas → `getImageData` is allowed.
 *
 * On ANY failure (network, decode, taint, canvas unavailable) we resolve
 * `{ colors: null, objectUrl }` — the wash simply doesn't update (today's
 * behavior), never an error state. `objectUrl` may still be non-null on a
 * palette-read failure so the caller can use the decoded bytes for the image
 * layers even when sampling failed.
 *
 * Dependency-free (no imports) so it is safe to pull in from anywhere.
 */

// LRU of decoded entries keyed by art URL. Sized LARGER than homeScreen's
// 6-entry backdrop `ilCacheKeys` so a URL still referenced by a live a/b
// background layer can NEVER be evicted (and thus never `revokeObjectURL`'d)
// while it is on screen. Eviction is the ONLY place a blob URL is revoked
// (plus destroy) — the two-layer crossfade keeps at most 2 URLs live at once,
// far under this ceiling.
var LRU_MAX = 12;

// url -> { colors, objectUrl }. Insertion order in `order` is the LRU order
// (most-recently-touched at the end).
var cache = Object.create(null);
var order = [];
// url -> Promise<{colors, objectUrl}> for in-flight reads, so concurrent
// getPalette(url) calls share ONE fetch/decode.
var inflight = Object.create(null);

function touch(url) {
  var i = order.indexOf(url);
  if (i >= 0) order.splice(i, 1);
  order.push(url);
}

function revokeEntry(entry) {
  if (entry && entry.objectUrl) {
    try { URL.revokeObjectURL(entry.objectUrl); } catch (e) { /* ignore */ }
  }
}

function evictIfNeeded() {
  while (order.length > LRU_MAX) {
    var oldest = order.shift();
    var entry = cache[oldest];
    delete cache[oldest];
    revokeEntry(entry);
  }
}

/**
 * Average the corner blocks of a decoded image's pixels into 4 hex colors.
 * Pure and DOM-free so it is unit-testable on a synthetic ImageData: pass any
 * `{ data: Uint8ClampedArray|number[], width, height }` where `data` is RGBA
 * row-major (4 bytes/pixel). Averages a `block × block` square anchored at each
 * corner (default 2×2 — matches an 8×8 downscale, which is what the sampler
 * draws to). Returns `{ topLeft, topRight, bottomRight, bottomLeft }` as
 * 6-digit hex WITHOUT a leading '#' (colorWash's convention). Returns null if
 * the image data is too small/degenerate to sample.
 */
function averageCorners(imageData, block) {
  if (!imageData || !imageData.data || !imageData.width || !imageData.height) return null;
  var w = imageData.width;
  var h = imageData.height;
  var data = imageData.data;
  if (w < 2 || h < 2) return null;
  var b = block || 2;
  if (b > w) b = w;
  if (b > h) b = h;

  function avg(x0, y0) {
    var r = 0, g = 0, bl = 0, n = 0;
    for (var y = y0; y < y0 + b; y++) {
      for (var x = x0; x < x0 + b; x++) {
        var idx = (y * w + x) * 4;
        r += data[idx];
        g += data[idx + 1];
        bl += data[idx + 2];
        n++;
      }
    }
    if (!n) return '000000';
    return toHex(Math.round(r / n)) + toHex(Math.round(g / n)) + toHex(Math.round(bl / n));
  }

  return {
    topLeft: avg(0, 0),
    topRight: avg(w - b, 0),
    bottomRight: avg(w - b, h - b),
    bottomLeft: avg(0, h - b)
  };
}

function toHex(v) {
  if (v < 0) v = 0;
  if (v > 255) v = 255;
  var s = v.toString(16);
  return s.length === 1 ? '0' + s : s;
}

// Downscale target: draw the full art into an 8×8 canvas so each 2×2 corner
// block averages a quarter of the corner region — cheap, and the browser's
// bilinear downscale already blends the corner neighbourhood for us.
var SAMPLE_SIZE = 8;
var CORNER_BLOCK = 2;

/**
 * Fetch `url` as a Blob (XHR), build a same-origin objectURL, decode it, and
 * sample its corner palette. Resolves `{ colors, objectUrl }`:
 *   - success → colors is the 4-corner hex object, objectUrl the decoded blob.
 *   - sample/taint failure but image decoded → colors null, objectUrl set
 *     (caller can still use the bytes for the image layers).
 *   - fetch/decode failure → colors null, objectUrl null.
 * Never rejects.
 */
function loadAndSample(url) {
  return new Promise(function (resolve) {
    var xhr;
    try {
      xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'blob';
    } catch (e) {
      resolve({ colors: null, objectUrl: null });
      return;
    }
    xhr.onload = function () {
      if (xhr.status && (xhr.status < 200 || xhr.status >= 300)) {
        resolve({ colors: null, objectUrl: null });
        return;
      }
      var blob = xhr.response;
      if (!blob) { resolve({ colors: null, objectUrl: null }); return; }
      var objectUrl;
      try {
        objectUrl = URL.createObjectURL(blob);
      } catch (e) {
        resolve({ colors: null, objectUrl: null });
        return;
      }
      var img = new Image();
      img.onload = function () {
        var colors = null;
        try {
          var canvas = document.createElement('canvas');
          canvas.width = SAMPLE_SIZE;
          canvas.height = SAMPLE_SIZE;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
          var imageData = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
          colors = averageCorners(imageData, CORNER_BLOCK);
        } catch (e) {
          // Tainted canvas, no 2d context, or getImageData unsupported: keep
          // the decoded objectUrl (image layers can still use it), drop colors.
          colors = null;
        }
        resolve({ colors: colors, objectUrl: objectUrl });
      };
      img.onerror = function () {
        // Decode failed — the objectUrl is useless; revoke it here so a failed
        // read never leaks (it is not going into the cache).
        try { URL.revokeObjectURL(objectUrl); } catch (e) { /* ignore */ }
        resolve({ colors: null, objectUrl: null });
      };
      img.src = objectUrl;
    };
    xhr.onerror = function () { resolve({ colors: null, objectUrl: null }); };
    try { xhr.send(); } catch (e) { resolve({ colors: null, objectUrl: null }); }
  });
}

/**
 * Get the corner palette + a same-origin objectURL for `url`, cached (LRU).
 * @param {string} url  art URL (token already in query, from getArtUrl)
 * @returns {Promise<{colors:?{topLeft,topRight,bottomRight,bottomLeft}, objectUrl:?string}>}
 *   Never rejects; `colors`/`objectUrl` may be null on failure.
 */
function getPalette(url) {
  if (!url) return Promise.resolve({ colors: null, objectUrl: null });
  if (cache[url]) {
    touch(url);
    return Promise.resolve(cache[url]);
  }
  if (inflight[url]) return inflight[url];

  var p = loadAndSample(url).then(function (result) {
    delete inflight[url];
    // Only cache entries that produced a usable objectUrl (a hard failure with
    // null objectUrl is not worth an LRU slot and has nothing to revoke).
    if (result.objectUrl) {
      cache[url] = result;
      touch(url);
      evictIfNeeded();
    }
    return result;
  });
  inflight[url] = p;
  return p;
}

/**
 * Revoke every cached objectURL and clear the cache. Call from the owning
 * screen's destroy(). In-flight reads are left to resolve and self-clean (their
 * objectUrls simply won't be cached once the cache is cleared — a tiny,
 * bounded transient leak that a single destroy can't avoid without cancelling
 * XHRs mid-flight; the next getPalette re-populates cleanly).
 */
/**
 * True if `url` is already in the LRU cache (its bytes are decoded and its
 * palette sampled) — a `getPalette(url)` call will resolve without a network
 * fetch. Used for the `home:hero-swap {cached}` breadcrumb and the "color leads"
 * fast path.
 */
function hasPalette(url) {
  return !!(url && cache[url]);
}

function clearPaletteCache() {
  for (var i = 0; i < order.length; i++) {
    revokeEntry(cache[order[i]]);
  }
  cache = Object.create(null);
  order = [];
}

// __resetForTest lets the unit test start from a known-empty LRU without
// touching real objectURLs (jsdom-free environment has no URL.createObjectURL).
function __resetForTest() {
  cache = Object.create(null);
  order = [];
  inflight = Object.create(null);
}

export {
  getPalette,
  hasPalette,
  clearPaletteCache,
  averageCorners,
  LRU_MAX,
  __resetForTest
};
