/**
 * Same rimraf downgrade as ensure-webos-cli-rimraf.cjs, for a global @webos-tools/cli install.
 */
var fs = require('fs');
var path = require('path');
var { execSync } = require('child_process');

function ensureRimrafV3(cliRoot) {
  if (!fs.existsSync(cliRoot)) {
    console.warn('@webos-tools/cli not found at', cliRoot);
    return;
  }

  var rimrafPkg = path.join(cliRoot, 'node_modules', 'rimraf', 'package.json');
  if (fs.existsSync(rimrafPkg)) {
    var version = JSON.parse(fs.readFileSync(rimrafPkg, 'utf8')).version || '';
    if (version.startsWith('2.') || version.startsWith('3.')) {
      console.log('Global @webos-tools/cli already uses rimraf', version);
      return;
    }
  }

  var rimrafDir = path.join(cliRoot, 'node_modules', 'rimraf');
  if (fs.existsSync(rimrafDir)) {
    fs.rmSync(rimrafDir, { recursive: true, force: true });
  }

  execSync('npm install rimraf@3.0.2 --no-save', {
    cwd: cliRoot,
    stdio: 'inherit'
  });
  console.log('Pinned rimraf@3.0.2 under global @webos-tools/cli');
}

var globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
ensureRimrafV3(path.join(globalRoot, '@webos-tools/cli'));
