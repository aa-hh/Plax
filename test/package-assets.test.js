import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

var require = createRequire(import.meta.url);
var repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Regression guard for the "embedded SRT stuck on Buffering" root cause (2026-06-26):
// webostvjs was undeclared + pruned, so webOSTV.js silently never shipped, the B8
// misdetected as a browser (webOS undefined → isSimulatorRuntime), and webOS4
// transcode/remux delivery broke. See memory webostvjs-missing-dep-misdetect.
describe('packaged webOS runtime assets', function () {
  it('webostvjs is a declared dependency (so npm ci always installs it)', function () {
    var pkg = require(path.join(repoRoot, 'package.json'));
    var deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
    assert.ok(
      deps.webostvjs,
      'webostvjs must be a declared dependency — webOSTV.js 404s on the TV without it'
    );
  });

  it('rollup build copies webOSTV.js from node_modules/webostvjs into dist', function () {
    var cfg = fs.readFileSync(path.join(repoRoot, 'build', 'rollup.config.js'), 'utf8');
    assert.match(
      cfg,
      /node_modules\/webostvjs\/webOSTV\.js/,
      'rollup.config.js must copy node_modules/webostvjs/webOSTV.js to dist'
    );
  });

  it('index.html loads webOSTV.js before app.js', function () {
    var html = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
    var webosIdx = html.indexOf('webOSTV.js');
    var appIdx = html.indexOf('app.js');
    assert.ok(webosIdx !== -1, 'index.html must include the webOSTV.js script tag');
    assert.ok(appIdx !== -1, 'index.html must include the app.js script tag');
    assert.ok(webosIdx < appIdx, 'webOSTV.js must load before app.js (webOS global needed at startup)');
  });
});

describe('package-ipk critical-asset guard', function () {
  var pkgScript = require(path.join(repoRoot, 'scripts', 'package-ipk.cjs'));

  it('treats webOSTV.js as a critical packaged file', function () {
    assert.ok(
      pkgScript.CRITICAL_DIST_FILES.indexOf('webOSTV.js') !== -1,
      'webOSTV.js must be in the critical packaged-file list'
    );
  });

  it('flags webOSTV.js as missing when absent from a build dir', function () {
    var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plax-dist-'));
    try {
      // index.html + app.js present, webOSTV.js missing → the exact silent regression.
      fs.writeFileSync(path.join(tmp, 'index.html'), '<html></html>');
      fs.writeFileSync(path.join(tmp, 'app.js'), '/* app */');
      var missing = pkgScript.findMissingCriticalAssets(tmp);
      assert.deepEqual(missing, ['webOSTV.js']);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('passes when all critical files are present', function () {
    var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plax-dist-'));
    try {
      pkgScript.CRITICAL_DIST_FILES.forEach(function (name) {
        fs.writeFileSync(path.join(tmp, name), 'x');
      });
      assert.deepEqual(pkgScript.findMissingCriticalAssets(tmp), []);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('tvpush.sh deploy path', function () {
  // tvpush.sh is the deploy entrypoint. The webOSTV.js guard only protects us if the
  // deploy keeps building through `npm run package` (which runs assertCriticalAssets).
  // If it's ever changed to build with bare `npm run build` or to call ares-package
  // directly, the guard is bypassed and a broken IPK can reach the TV again. These
  // assertions run against the script body with comment-only lines stripped.
  var raw = fs.readFileSync(path.join(repoRoot, 'tvpush.sh'), 'utf8');
  var activeBody = raw.split(/\r?\n/).filter(function (line) {
    return line.trim().charAt(0) !== '#';
  }).join('\n');

  it('builds via the guarded `npm run package`', function () {
    assert.match(
      activeBody,
      /npm run package/,
      'tvpush.sh must build via `npm run package` so the critical-asset guard runs before deploy'
    );
  });

  it('does not bypass the guard with bare `npm run build`', function () {
    assert.doesNotMatch(
      activeBody,
      /npm run build\b/,
      '`npm run build` skips the package guard (writes dist only) — deploy must use `npm run package`'
    );
  });

  it('does not call ares-package directly (would bypass the guard)', function () {
    assert.doesNotMatch(
      activeBody,
      /ares-package/,
      'packaging must go through scripts/package-ipk.cjs (the guard), not ares-package directly'
    );
  });

  it('installs an IPK from build/', function () {
    assert.match(activeBody, /ares-install/, 'tvpush.sh must install via ares-install');
    assert.match(activeBody, /build\/\*\.ipk/, 'tvpush.sh must install the freshest build/*.ipk');
  });
});
