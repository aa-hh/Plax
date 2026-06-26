/**
 * Packages dist/ into a Plax webOS IPK (requires ares-package from @webos-tools/cli).
 */
var fs = require('fs');
var path = require('path');
var { execSync } = require('child_process');

var dist = path.join(__dirname, '..', 'dist');
var out = path.join(__dirname, '..', 'build');
var localAresPackage = path.join(__dirname, '..', 'node_modules', '.bin', 'ares-package');

// @webos-tools/cli 3.2.4 calls require('rimraf') as a function but pins rimraf 6.x
// (named exports only) → "rimraf is not a function". scripts/ensure-webos-cli-rimraf
// pins a nested rimraf 3.x to shadow it, but that runs only on `postinstall` and a
// later `npm install <anything>` can prune the --no-save copy. Re-assert it here so
// packaging is self-healing regardless of what touched node_modules since install.
function ensureCompatibleRimraf() {
  var cliRoot = path.join(__dirname, '..', 'node_modules', '@webos-tools/cli');
  if (!fs.existsSync(cliRoot)) return;
  var rimrafPkg = path.join(cliRoot, 'node_modules', 'rimraf', 'package.json');
  if (fs.existsSync(rimrafPkg)) {
    var version = '';
    try { version = JSON.parse(fs.readFileSync(rimrafPkg, 'utf8')).version || ''; } catch (e) { /* refetch */ }
    if (version.startsWith('2.') || version.startsWith('3.')) return; // already compatible
  }
  console.log('Repairing @webos-tools/cli rimraf pin (was pruned since install)…');
  execSync('node ' + JSON.stringify(path.join(__dirname, 'ensure-webos-cli-rimraf.cjs')), { stdio: 'inherit' });
}

function resolveAresPackageCommand() {
  if (process.platform === 'win32') {
    if (fs.existsSync(localAresPackage + '.cmd')) {
      return '"' + localAresPackage + '.cmd"';
    }
  } else if (fs.existsSync(localAresPackage)) {
    return '"' + localAresPackage + '"';
  }
  return 'ares-package';
}

// ares-package 3.x treats "#" in appinfo.json color fields as path anchors.
var staging = path.join(out, '.package-staging');

function stripTvDebugArtifacts(stagingDir) {
  var appJs = path.join(stagingDir, 'app.js');
  if (fs.existsSync(appJs)) {
    var js = fs.readFileSync(appJs, 'utf8');
    js = js.replace(/\n\/\/# sourceMappingURL=.*$/m, '').replace(/\/\/# sourceMappingURL=.*$/m, '');
    fs.writeFileSync(appJs, js);
  }
  try {
    var names = fs.readdirSync(stagingDir);
    names.forEach(function (name) {
      if (name.endsWith('.map')) {
        fs.rmSync(path.join(stagingDir, name), { force: true });
      }
    });
  } catch (e) { /* ignore */ }
}

// Fail loudly if a critical runtime file is missing from the build. rollup-plugin-copy
// silently skips missing source globs, so a pruned dependency (e.g. webostvjs) would
// otherwise ship an IPK with no webOSTV.js — making the real TV misdetect as a browser
// (webOS undefined → isSimulatorRuntime), which breaks webOS4 transcode/remux delivery
// and the version gate. See memory webos4-transcode-delivery.
var CRITICAL_DIST_FILES = ['index.html', 'app.js', 'webOSTV.js'];

/** Pure: which CRITICAL_DIST_FILES are absent from distDir. Testable without a build. */
function findMissingCriticalAssets(distDir) {
  return CRITICAL_DIST_FILES.filter(function (name) {
    return !fs.existsSync(path.join(distDir, name));
  });
}

function assertCriticalAssets() {
  var missing = findMissingCriticalAssets(dist);
  if (missing.length) {
    console.error('Refusing to package: dist is missing critical file(s): ' + missing.join(', '));
    if (missing.indexOf('webOSTV.js') !== -1) {
      console.error('  webOSTV.js is copied from node_modules/webostvjs during build.');
      console.error('  Run: npm install webostvjs && npm run build');
    }
    process.exit(1);
  }
}

function prepareStaging() {
  if (fs.existsSync(staging)) {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  fs.cpSync(dist, staging, { recursive: true });
  var appinfoPath = path.join(staging, 'appinfo.json');
  var appinfo = JSON.parse(fs.readFileSync(appinfoPath, 'utf8'));
  delete appinfo.bgColor;
  delete appinfo.iconColor;
  delete appinfo.splashBackground;
  fs.writeFileSync(appinfoPath, JSON.stringify(appinfo, null, 2) + '\n');
  stripTvDebugArtifacts(staging);
}

function cleanupStaging() {
  if (fs.existsSync(staging)) {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

function main() {
  if (!fs.existsSync(dist)) {
    console.error('Run npm run build first');
    process.exit(1);
  }
  if (!fs.existsSync(out)) fs.mkdirSync(out, { recursive: true });

  var aresPackageCmd = resolveAresPackageCommand();
  try {
    ensureCompatibleRimraf();
    assertCriticalAssets();
    prepareStaging();
    execSync(aresPackageCmd + ' -o "' + out + '" "' + staging + '"', { stdio: 'inherit' });
    cleanupStaging();
    var ipks = fs.readdirSync(out).filter(function (name) {
      return name.endsWith('.ipk');
    });
    if (!ipks.length) {
      console.error('ares-package finished but no .ipk was written to', out);
      process.exit(1);
    }
    console.log('IPK written to', out, '(' + ipks.join(', ') + ')');
  } catch (e) {
    cleanupStaging();
    var msg = e && e.message ? String(e.message) : String(e);
    if (/ENOENT|not found/i.test(msg)) {
      console.error('ares-package not found. Run: npm install');
      console.error('  (installs @webos-tools/cli with a compatible rimraf pin)');
      process.exit(1);
    }
    console.error('ares-package failed:', msg);
    process.exit(e.status || 1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  CRITICAL_DIST_FILES: CRITICAL_DIST_FILES,
  findMissingCriticalAssets: findMissingCriticalAssets
};
