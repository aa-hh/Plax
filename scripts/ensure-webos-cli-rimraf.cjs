/**
 * @webos-tools/cli 3.2.4 still calls require('rimraf') as a function, but pins rimraf 6.x
 * (named exports only). Downgrade the CLI's nested rimraf after npm install.
 */
var fs = require('fs');
var path = require('path');
var { execSync } = require('child_process');

var cliRoot = path.join(__dirname, '..', 'node_modules', '@webos-tools/cli');
if (!fs.existsSync(cliRoot)) {
  process.exit(0);
}

var rimrafPkg = path.join(cliRoot, 'node_modules', 'rimraf', 'package.json');
var needsDowngrade = true;

if (fs.existsSync(rimrafPkg)) {
  var version = JSON.parse(fs.readFileSync(rimrafPkg, 'utf8')).version || '';
  if (version.startsWith('2.') || version.startsWith('3.')) {
    needsDowngrade = false;
  }
}

if (!needsDowngrade) {
  process.exit(0);
}

var rimrafDir = path.join(cliRoot, 'node_modules', 'rimraf');
if (fs.existsSync(rimrafDir)) {
  fs.rmSync(rimrafDir, { recursive: true, force: true });
}

execSync('npm install rimraf@3.0.2 --no-save', {
  cwd: cliRoot,
  stdio: 'inherit'
});
