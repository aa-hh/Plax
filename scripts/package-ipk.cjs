/**
 * Packages dist/ into a webOS IPK (requires ares-package from @webos-tools/cli).
 */
var fs = require('fs');
var path = require('path');
var { execSync } = require('child_process');

var dist = path.join(__dirname, '..', 'dist');
var out = path.join(__dirname, '..', 'build');
var localAresPackage = path.join(__dirname, '..', 'node_modules', '.bin', 'ares-package');

if (!fs.existsSync(dist)) {
  console.error('Run npm run build first');
  process.exit(1);
}

if (!fs.existsSync(out)) fs.mkdirSync(out, { recursive: true });

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

var aresPackageCmd = resolveAresPackageCommand();
try {
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
