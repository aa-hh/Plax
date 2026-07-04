import test from 'node:test';
import assert from 'node:assert/strict';

import { averageCorners } from '../src/ui/palette.js';

// ── averageCorners: pure corner-block averaging on synthetic ImageData ──────

// Build an RGBA ImageData-like object from a per-pixel color function.
function makeImageData(w, h, colorAt) {
  var data = new Array(w * h * 4);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var c = colorAt(x, y);
      var i = (y * w + x) * 4;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }
  return { data: data, width: w, height: h };
}

test('averageCorners: solid-color image → all corners equal that color', function () {
  var img = makeImageData(8, 8, function () { return [18, 52, 86]; }); // #123456
  var p = averageCorners(img, 2);
  assert.deepEqual(p, {
    topLeft: '123456',
    topRight: '123456',
    bottomRight: '123456',
    bottomLeft: '123456'
  });
});

test('averageCorners: distinct solid corner quadrants sample the right corner', function () {
  // 8×8 split into 4 quadrants; a 2×2 corner block sits fully inside one.
  var img = makeImageData(8, 8, function (x, y) {
    var left = x < 4;
    var top = y < 4;
    if (top && left) return [255, 0, 0];   // topLeft red
    if (top && !left) return [0, 255, 0];   // topRight green
    if (!top && !left) return [0, 0, 255];  // bottomRight blue
    return [255, 255, 0];                   // bottomLeft yellow
  });
  var p = averageCorners(img, 2);
  assert.equal(p.topLeft, 'ff0000');
  assert.equal(p.topRight, '00ff00');
  assert.equal(p.bottomRight, '0000ff');
  assert.equal(p.bottomLeft, 'ffff00');
});

test('averageCorners: averages within the corner block and rounds', function () {
  // topLeft 2×2 block = [0, 2, 254, 256] avg = 128 → 80 hex; keep others 0.
  var vals = { '0,0': 0, '1,0': 2, '0,1': 254, '1,1': 256 };
  var img = makeImageData(8, 8, function (x, y) {
    var v = vals[x + ',' + y];
    if (v == null) return [0, 0, 0];
    return [v, v, v];
  });
  var p = averageCorners(img, 2);
  // (0 + 2 + 254 + 255[clamped]) / 4 = 127.75 → round 128 = 0x80
  assert.equal(p.topLeft, '808080');
});

test('averageCorners: pads single-digit hex channels to two digits', function () {
  var img = makeImageData(8, 8, function () { return [1, 2, 3]; });
  var p = averageCorners(img, 2);
  assert.equal(p.topLeft, '010203');
});

test('averageCorners: null / degenerate input returns null (never throws)', function () {
  assert.equal(averageCorners(null), null);
  assert.equal(averageCorners({}), null);
  assert.equal(averageCorners({ data: [], width: 1, height: 1 }), null); // < 2px
  assert.equal(averageCorners({ width: 8, height: 8 }), null); // no data
});

test('averageCorners: block larger than image is clamped, still samples', function () {
  var img = makeImageData(2, 2, function () { return [10, 20, 30]; });
  var p = averageCorners(img, 8); // block clamps to 2
  assert.equal(p.topLeft, '0a141e');
  assert.equal(p.bottomRight, '0a141e');
});

// ── getPalette LRU: eviction + revoke ordering ──────────────────────────────
//
// Drive the full fetch→objectURL→decode→sample path with fakes so we can assert
// (a) each distinct URL creates exactly one objectURL, (b) eviction revokes the
// LEAST-recently-used first, and (c) a URL kept "current" by re-touching is
// never revoked while others churn past it.

async function withFakeEnv(run) {
  var created = [];   // objectUrls handed out, in order
  var revoked = [];   // objectUrls revoked, in order
  var seq = 0;

  var prevURL = globalThis.URL;
  var prevXHR = globalThis.XMLHttpRequest;
  var prevImage = globalThis.Image;
  var prevDoc = globalThis.document;

  globalThis.URL = {
    createObjectURL: function () {
      var u = 'blob:obj-' + (seq++);
      created.push(u);
      return u;
    },
    revokeObjectURL: function (u) { revoked.push(u); }
  };

  // XHR that immediately "loads" with a truthy blob.
  globalThis.XMLHttpRequest = function () {
    this.open = function () {};
    this.send = function () {
      this.status = 200;
      this.response = { fake: 'blob' };
      var self = this;
      Promise.resolve().then(function () { if (self.onload) self.onload(); });
    };
  };

  // Image that decodes successfully on next microtask.
  globalThis.Image = function () {
    var self = this;
    Object.defineProperty(this, 'src', {
      set: function () { Promise.resolve().then(function () { if (self.onload) self.onload(); }); },
      get: function () { return ''; }
    });
  };

  // Canvas whose getImageData returns a solid image so averageCorners succeeds.
  globalThis.document = {
    createElement: function () {
      return {
        getContext: function () {
          return {
            drawImage: function () {},
            getImageData: function (x, y, w, h) {
              var data = new Array(w * h * 4).fill(0);
              for (var i = 0; i < data.length; i += 4) {
                data[i] = 16; data[i + 1] = 32; data[i + 2] = 48; data[i + 3] = 255;
              }
              return { data: data, width: w, height: h };
            }
          };
        }
      };
    }
  };

  try {
    await run({ created: created, revoked: revoked });
  } finally {
    globalThis.URL = prevURL;
    globalThis.XMLHttpRequest = prevXHR;
    globalThis.Image = prevImage;
    globalThis.document = prevDoc;
  }
}

test('getPalette: caches per URL (one objectURL per distinct url), returns colors', async function () {
  var mod = await import('../src/ui/palette.js');
  mod.__resetForTest();
  await withFakeEnv(async function (env) {
    var r1 = await mod.getPalette('http://x/art?u=1');
    assert.ok(r1.objectUrl, 'objectUrl created');
    assert.deepEqual(r1.colors, {
      topLeft: '102030', topRight: '102030', bottomRight: '102030', bottomLeft: '102030'
    });
    // Second call for the SAME url is a cache hit — no new objectURL.
    var r2 = await mod.getPalette('http://x/art?u=1');
    assert.equal(r2.objectUrl, r1.objectUrl);
    assert.equal(env.created.length, 1, 'cache hit did not create a second objectURL');
  });
  mod.clearPaletteCache();
});

test('getPalette: LRU evicts + revokes the least-recently-used first', async function () {
  var mod = await import('../src/ui/palette.js');
  mod.__resetForTest();
  await withFakeEnv(async function (env) {
    var max = mod.LRU_MAX;
    // Fill the cache exactly to capacity.
    for (var i = 0; i < max; i++) {
      await mod.getPalette('http://x/art?u=' + i);
    }
    assert.equal(env.revoked.length, 0, 'no eviction at capacity');
    // One more distinct url → evicts u=0 (the oldest), revoking ITS objectUrl.
    await mod.getPalette('http://x/art?u=' + max);
    assert.equal(env.revoked.length, 1, 'exactly one eviction');
    assert.equal(env.revoked[0], env.created[0], 'the OLDEST objectUrl was revoked');
  });
  mod.clearPaletteCache();
});

test('getPalette: re-touching a URL protects it from eviction (LRU order respected)', async function () {
  var mod = await import('../src/ui/palette.js');
  mod.__resetForTest();
  await withFakeEnv(async function (env) {
    var max = mod.LRU_MAX;
    for (var i = 0; i < max; i++) {
      await mod.getPalette('http://x/art?u=' + i);
    }
    // Re-touch u=0 so it becomes most-recently-used; u=1 is now the oldest.
    await mod.getPalette('http://x/art?u=0');
    // Push one new url → should evict u=1, NOT u=0.
    await mod.getPalette('http://x/art?u=' + max);
    assert.equal(env.revoked.length, 1);
    assert.equal(env.revoked[0], env.created[1], 'u=1 (new oldest) revoked, not the re-touched u=0');
  });
  mod.clearPaletteCache();
});

test('clearPaletteCache: revokes every live objectURL', async function () {
  var mod = await import('../src/ui/palette.js');
  mod.__resetForTest();
  await withFakeEnv(async function (env) {
    await mod.getPalette('http://x/art?u=a');
    await mod.getPalette('http://x/art?u=b');
    assert.equal(env.revoked.length, 0);
    mod.clearPaletteCache();
    assert.equal(env.revoked.length, 2, 'both cached objectURLs revoked on clear');
    assert.deepEqual(env.revoked.slice().sort(), env.created.slice().sort());
  });
});
