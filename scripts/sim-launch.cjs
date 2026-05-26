/**
 * Launch XPlay Lite in the webOS TV Simulator.
 *
 * Prefers `ares-launch -s <version> <APP_DIR> -sp <INSTALL_DIR>` (official CLI).
 * `-sp` must be the simulator *install folder* (contains a `webOS_TV_*_Simulator_*.app`),
 * not the `.app` bundle — nested LG installs use e.g.
 * `/Applications/webOS_TV_26_Simulator_1.5.0/webOS_TV_26_Simulator_1.5.0.app`.
 * Falls back to macOS `open -n -a <.app> --args <APP_DIR>` when ares-launch fails.
 *
 * The simulator caches apps on its home screen; re-launching from an old icon can
 * show a stale bundle even after `npm run build`. This script quits running
 * simulators on macOS, verifies dist markers, then launches fresh.
 *
 * Usage:
 *   node scripts/sim-launch.cjs                       # auto-detect simulator
 *   node scripts/sim-launch.cjs --version 6           # match a specific webOS version
 *   node scripts/sim-launch.cjs --simulator-path "/Applications/webOS_TV_6.0_Simulator_1.4.1.app"
 *   WEBOS_SIM_PATH=... node scripts/sim-launch.cjs
 */
var path = require('path');
var fs = require('fs');
var cp = require('child_process');

var APP_ID = 'com.xplay.lite';
var stampLib = require('./build-stamp-lib.cjs');

function parseArg(name, fallback) {
  var idx = process.argv.indexOf('--' + name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function hasAresLaunch() {
  try {
    cp.execSync('command -v ares-launch', { stdio: 'ignore' });
    return true;
  } catch (_) {
    return false;
  }
}

function verifyDistBundle(appDir) {
  var appJsPath = path.join(appDir, 'app.js');
  var indexPath = path.join(appDir, 'index.html');
  var stampPath = path.join(appDir, '.xplay-build-stamp.json');
  var buildInfoPath = path.join(appDir, 'build-info.js');

  if (!fs.existsSync(appJsPath)) {
    console.error('Missing dist/app.js. Run `npm run build` from the project root first.');
    process.exit(1);
  }
  if (!fs.existsSync(indexPath)) {
    console.error('Missing dist/index.html. Run `npm run build`.');
    process.exit(1);
  }

  var appJs = fs.readFileSync(appJsPath, 'utf8');
  if (appJs.indexOf("Who's watching?") >= 0) {
    console.error('dist/app.js still contains the old profile-picker title (stale bundle).');
    console.error('Run `npm run build` from the project root (not an older clone).');
    process.exit(1);
  }

  var stamp = null;
  if (fs.existsSync(stampPath)) {
    try { stamp = JSON.parse(fs.readFileSync(stampPath, 'utf8')); } catch (_) {}
  } else {
    console.warn('No .xplay-build-stamp.json in dist — run `npm run build` for change summary.');
  }
  if (!fs.existsSync(buildInfoPath)) {
    console.warn('No build-info.js in dist — run `npm run build` (runtime build check unavailable).');
  }

  stampLib.formatStampDetail(stamp).forEach(function (line) {
    console.log(line);
  });
}

function printStaleSimHints() {
  console.log('');
  console.log('If the simulator still shows "Who\'s watching?" (old UI):');
  console.log('  1. Simulator menu: File → Close App');
  console.log('  2. Right-click the XPlay icon on the simulator home screen → Remove');
  console.log('  3. Action → Database Reset, then run `npm run sim` again');
  console.log('  4. Or File → Launch App and pick THIS dist folder:');
  console.log('     ' + path.resolve(process.cwd(), parseArg('app-dir', process.env.WEBOS_APP_DIR || 'dist')));
  console.log('');
  console.log('Do not rely on the home-screen app icon after moving or renaming the project folder.');
  console.log('In devtools: window.__XPLAY_BUILD__ should match the build stamp above.');
}

function quitRunningSimulators() {
  if (process.platform !== 'darwin') return;
  try {
    var running = cp.execSync('pgrep -f "webOS_TV_[0-9.]+_Simulator" || true', {
      encoding: 'utf8'
    }).trim();
    if (!running) return;
    console.log('Closing already-running simulator(s)...');
    cp.execSync('pkill -f "webOS_TV_[0-9.]+_Simulator"', { stdio: 'ignore' });
    try {
      cp.execSync(
        'osascript -e \'tell application "System Events" to set procs to name of every process whose name contains "Simulator" and name contains "webOS"\' -e \'repeat with p in procs\' -e \'tell application p to quit\' -e \'end repeat\'',
        { stdio: 'ignore' }
      );
    } catch (_) {}
    cp.execSync('sleep 2');
  } catch (_) {}
}

function closeSimApp(version) {
  if (!hasAresLaunch()) return;
  try {
    cp.execSync('ares-launch -s ' + version + ' -c ' + APP_ID, { stdio: 'ignore' });
  } catch (_) {}
}

/**
 * ares-launch -sp expects a directory that contains webOS_TV_<ver>_Simulator_*.app.
 * Users often pass the .app bundle; normalize to { appPath, aresDir }.
 */
function resolveSimulatorPaths(simulatorPath) {
  var resolved = path.resolve(simulatorPath);
  var ext = path.extname(resolved).toLowerCase();
  if (ext === '.app') {
    return { appPath: resolved, aresDir: path.dirname(resolved) };
  }

  if (!fs.existsSync(resolved)) {
    return { appPath: resolved, aresDir: resolved };
  }

  if (!fs.statSync(resolved).isDirectory()) {
    return { appPath: resolved, aresDir: path.dirname(resolved) };
  }

  var entries;
  try { entries = fs.readdirSync(resolved); } catch (_) { entries = []; }
  var appName = null;
  for (var i = 0; i < entries.length; i++) {
    if (/^webOS_TV_[0-9.]+\_Simulator.*\.app$/i.test(entries[i])) {
      appName = entries[i];
      break;
    }
  }
  if (appName) {
    return { appPath: path.join(resolved, appName), aresDir: resolved };
  }
  return { appPath: resolved, aresDir: resolved };
}

function launchViaAres(version, appDir, aresDir) {
  var args = ['-s', String(version), appDir, '-sp', aresDir];
  console.log('Launching via ares-launch ' + args.join(' '));
  return cp.spawnSync('ares-launch', args, { stdio: 'inherit' });
}

function launchViaOpen(appPath, appDir) {
  console.log('Launching via open -n -a "' + appPath + '" --args "' + appDir + '"');
  var result = cp.spawnSync('open', ['-n', '-a', appPath, '--args', appDir], {
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('open exited with code ' + result.status);
}

function findSimulator(ver) {
  var roots = [];
  if (process.platform === 'darwin') {
    roots = ['/Applications', path.join(process.env.HOME || '', 'Applications')];
  } else if (process.platform === 'win32') {
    roots = [
      path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'LG Electronics'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'LG Electronics')
    ];
  } else {
    roots = [
      path.join(process.env.HOME || '', 'webOS_TV_Simulator'),
      '/opt/webOS_TV_Simulator'
    ];
  }
  var ext = process.platform === 'darwin' ? '.app'
          : process.platform === 'win32' ? '.exe'
          : '.AppImage';
  var verPart = ver
    ? String(ver).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:\\.[0-9]+)?'
    : '[0-9]+(?:\\.[0-9]+)?';
  var prefixPattern = new RegExp('^webOS_TV_(' + verPart + ')_Simulator', 'i');
  var execPattern = new RegExp('^webOS_TV_(' + verPart + ')_Simulator[^/]*\\' + ext + '$', 'i');

  function isExecMatch(name) {
    return execPattern.test(name);
  }

  function scanDir(dir, depth) {
    var found = [];
    var entries;
    try { entries = fs.readdirSync(dir); } catch (_) { return found; }
    for (var i = 0; i < entries.length; i++) {
      var name = entries[i];
      var full = path.join(dir, name);
      var m;
      if (isExecMatch(name)) {
        m = name.match(prefixPattern);
        if (m) {
          found.push({
            version: m[1],
            appPath: full,
            aresDir: path.dirname(full)
          });
        }
        continue;
      }
      if (depth > 0 && prefixPattern.test(name)) {
        try {
          var st = fs.statSync(full);
          if (st.isDirectory()) {
            found = found.concat(scanDir(full, depth - 1));
          }
        } catch (_) {}
      }
    }
    return found;
  }

  var matches = [];
  for (var r = 0; r < roots.length; r++) {
    if (!roots[r]) continue;
    matches = matches.concat(scanDir(roots[r], 1));
  }
  if (matches.length === 0) return null;
  matches.sort(function (a, b) {
    var pa = a.version.split('.').map(Number);
    var pb = b.version.split('.').map(Number);
    for (var k = 0; k < Math.max(pa.length, pb.length); k++) {
      var x = pa[k] || 0;
      var y = pb[k] || 0;
      if (x !== y) return y - x;
    }
    return 0;
  });
  return matches[0];
}

function runLaunch(version, appDir, paths) {
  if (hasAresLaunch()) {
    var aresResult = launchViaAres(version, appDir, paths.aresDir);
    if (!aresResult.error && (aresResult.status === 0 || aresResult.status === null)) {
      return;
    }
    var aresErr = aresResult.error
      ? (aresResult.error.message || String(aresResult.error))
      : 'exit code ' + aresResult.status;
    console.warn('ares-launch failed (' + aresErr + '), trying open fallback...');
  }

  if (process.platform === 'darwin') {
    launchViaOpen(paths.appPath, appDir);
    return;
  }
  if (process.platform === 'win32') {
    cp.spawnSync(paths.appPath, [appDir], { stdio: 'inherit' });
    return;
  }
  cp.spawnSync(paths.appPath, [appDir], { stdio: 'inherit' });
}

function main() {
  var version = parseArg('version', process.env.WEBOS_SIM_VERSION || '');
  var appDirArg = parseArg('app-dir', process.env.WEBOS_APP_DIR || 'dist');
  var simulatorPath = parseArg('simulator-path', process.env.WEBOS_SIM_PATH || '');
  var appDir = path.resolve(process.cwd(), appDirArg);

  if (!fs.existsSync(path.join(appDir, 'appinfo.json'))) {
    console.error('Simulator app dir must contain appinfo.json:', appDir);
    console.error('Run `npm run build` first, or pass --app-dir to a valid app root.');
    process.exit(1);
  }

  verifyDistBundle(appDir);

  var paths;
  if (!simulatorPath) {
    var detected = findSimulator(version);
    if (detected) {
      paths = { appPath: detected.appPath, aresDir: detected.aresDir };
      if (!version) version = detected.version;
      console.log('Detected webOS TV ' + detected.version + ' Simulator: ' + paths.appPath);
    }
  } else {
    paths = resolveSimulatorPaths(simulatorPath);
  }

  if (!paths) {
    console.error('No webOS TV Simulator found.');
    console.error('');
    if (process.platform === 'darwin') {
      console.error('Install one from:');
      console.error('  https://webostv.developer.lge.com/develop/tools/simulator-installation');
      console.error('Then install to /Applications and re-run, or pass --simulator-path.');
      console.error('LG often installs a folder such as:');
      console.error('  /Applications/webOS_TV_26_Simulator_1.5.0/webOS_TV_26_Simulator_1.5.0.app');
    } else {
      console.error('Set WEBOS_SIM_PATH or pass --simulator-path to your simulator install.');
    }
    process.exit(1);
  }

  if (!fs.existsSync(paths.appPath)) {
    console.error('Simulator app does not exist:', paths.appPath);
    process.exit(1);
  }

  if (!version) {
    var m = path.basename(paths.appPath).match(/webOS_TV_([0-9.]+)_Simulator/i);
    version = m ? m[1] : '23';
  }

  quitRunningSimulators();
  closeSimApp(version);

  console.log('Loading app from: ' + appDir);
  if (paths.aresDir !== paths.appPath) {
    console.log('ares-launch install dir (-sp): ' + paths.aresDir);
  }

  try {
    runLaunch(version, appDir, paths);
  } catch (e) {
    console.error('Simulator launch failed:', e.message || e);
    console.error('Open the Simulator manually and use File → Launch App on:', appDir);
    process.exit(1);
  }

  printStaleSimHints();
}

if (require.main === module) {
  main();
}

module.exports = {
  findSimulator: findSimulator,
  resolveSimulatorPaths: resolveSimulatorPaths
};
