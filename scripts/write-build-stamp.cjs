/**
 * Writes dist/.xplay-build-stamp.json after rollup build for sim verification.
 */
var fs = require('fs');
var path = require('path');

var dist = path.join(__dirname, '..', 'dist');
var appJsPath = path.join(dist, 'app.js');
var cssPath = path.join(dist, 'app.css');

if (!fs.existsSync(appJsPath)) {
  console.error('write-build-stamp: dist/app.js missing — run npm run build first');
  process.exit(1);
}

var appJs = fs.readFileSync(appJsPath, 'utf8');
var css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';

var markers = {
  selectUser: appJs.indexOf('Select User') >= 0,
  enterPin: appJs.indexOf('Enter PIN') >= 0,
  profileSpinner: appJs.indexOf('profile-spinner') >= 0,
  fetchHomeSize: appJs.indexOf('fetchHomeSize') >= 0,
  xplaySpinner: appJs.indexOf('xplay-spinner') >= 0,
  profilePickerCss: css.indexOf('.profile-picker-header') >= 0
};

var missing = Object.keys(markers).filter(function (k) { return !markers[k]; });
if (missing.length) {
  console.error('write-build-stamp: dist bundle missing expected markers:', missing.join(', '));
  process.exit(1);
}

var stamp = {
  builtAt: new Date().toISOString(),
  markers: markers
};

fs.writeFileSync(path.join(dist, '.xplay-build-stamp.json'), JSON.stringify(stamp, null, 2) + '\n');
console.log('Build stamp:', stamp.builtAt);
