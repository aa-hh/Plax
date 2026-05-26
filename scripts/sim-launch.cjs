/**
 * Launch XPlay Lite in the webOS TV Simulator.
 *
 * The simulator app is a regular macOS/Windows/Linux binary that accepts
 * an app directory as a command-line argument. On macOS that's:
 *
 *   open -a "<Simulator.app>" --args "<APP_DIR>"
 *
 * This script bypasses `ares-launch -s` for that path because its discovery
 * logic is finicky across versions/macOS bundles. If you also want to install
 * onto a real TV, that's still `ares-install` from @webos-tools/cli.
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

function parseArg(name, fallback) {
  var idx = process.argv.indexOf('--' + name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

var version = parseArg('version', process.env.WEBOS_SIM_VERSION || '');
var appDirArg = parseArg('app-dir', process.env.WEBOS_APP_DIR || 'dist');
var simulatorPath = parseArg('simulator-path', process.env.WEBOS_SIM_PATH || '');
var appDir = path.resolve(process.cwd(), appDirArg);

if (!fs.existsSync(path.join(appDir, 'appinfo.json'))) {
  console.error('Simulator app dir must contain appinfo.json:', appDir);
  console.error('Run `npm run build` first, or pass --app-dir to a valid app root.');
  process.exit(1);
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
        if (m) found.push({ version: m[1], fullPath: full });
        continue;
      }
      // Recurse one level for newer simulators that ship the .app inside a wrapper folder
      // (e.g. /Applications/webOS_TV_26_Simulator_1.5.0/webOS_TV_26_Simulator_1.5.0.app).
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

if (!simulatorPath) {
  var detected = findSimulator(version);
  if (detected) {
    simulatorPath = detected.fullPath;
    console.log('Detected webOS TV ' + detected.version + ' Simulator: ' + simulatorPath);
  }
}

if (!simulatorPath) {
  console.error('No webOS TV Simulator found.');
  console.error('');
  if (process.platform === 'darwin') {
    console.error('Install one from:');
    console.error('  https://webostv.developer.lge.com/develop/tools/simulator-installation');
    console.error('Then drop the .app into /Applications and re-run, or pass --simulator-path.');
  } else {
    console.error('Set WEBOS_SIM_PATH or pass --simulator-path to point at your simulator binary.');
  }
  process.exit(1);
}

if (!fs.existsSync(simulatorPath)) {
  console.error('Simulator path does not exist:', simulatorPath);
  process.exit(1);
}

// macOS `open --args` ignores args when the target app is already running. Quit any
// running simulator first so the fresh app directory is actually picked up.
if (process.platform === 'darwin') {
  try {
    var running = cp.execSync('pgrep -f "webOS_TV_[0-9.]+_Simulator" || true', {
      encoding: 'utf8'
    }).trim();
    if (running) {
      console.log('Closing already-running simulator(s)...');
      cp.execSync('pkill -f "webOS_TV_[0-9.]+_Simulator"', { stdio: 'ignore' });
      // Give it a moment to release the window/state.
      cp.execSync('sleep 1');
    }
  } catch (_) {
    // pkill exits non-zero when nothing to kill; safe to ignore.
  }
}

var cmd;
if (process.platform === 'darwin') {
  // -n forces a new instance, -W waits for it to quit (we drop -W so the npm script returns).
  cmd = 'open -n -a "' + simulatorPath + '" --args "' + appDir + '"';
} else if (process.platform === 'win32') {
  cmd = '"' + simulatorPath + '" "' + appDir + '"';
} else {
  cmd = '"' + simulatorPath + '" "' + appDir + '"';
}

console.log('Loading app from: ' + appDir);
try {
  cp.execSync(cmd, { stdio: 'inherit' });
} catch (e) {
  console.error('Simulator launch failed. You can also open the Simulator manually and use');
  console.error('its "File > Open" menu to load:', appDir);
  process.exit(1);
}
