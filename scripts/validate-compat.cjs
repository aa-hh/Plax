/**
 * Static validation against webOS TV 4+ and LG platform specifications.
 */
var fs = require('fs');
var path = require('path');

var distDir = path.join(__dirname, '..', 'dist');
var distJs = path.join(distDir, 'app.js');
var appinfoPath = path.join(distDir, 'appinfo.json');
var indexPath = path.join(distDir, 'index.html');
var webosTvJs = path.join(distDir, 'webOSTV.js');
var errors = [];

function check(name, ok, msg) {
  if (!ok) errors.push(name + ': ' + msg);
  else console.log('OK', name);
}

if (!fs.existsSync(distJs)) {
  console.error('Build dist/ first (npm run build)');
  process.exit(1);
}

var code = fs.readFileSync(distJs, 'utf8');
var sizeKb = Buffer.byteLength(code, 'utf8') / 1024;
var appinfo = JSON.parse(fs.readFileSync(appinfoPath, 'utf8'));
var indexHtml = fs.readFileSync(indexPath, 'utf8');

check('bundle_size', sizeKb < 700, 'bundle ' + sizeKb.toFixed(1) + 'KB exceeds 700KB raw budget');
check('webostv_js', fs.existsSync(webosTvJs), 'missing dist/webOSTV.js (LG webOSTV.js library)');
check('index_loads_webostv', indexHtml.indexOf('webOSTV.js') >= 0, 'index.html must load webOSTV.js before app.js');
check('appinfo_resolution', appinfo.resolution === '1920x1080', 'appinfo.json resolution must be 1920x1080 per LG App Resolution spec');
check('appinfo_required_fields', !!(appinfo.id && appinfo.version && appinfo.vendor && appinfo.type && appinfo.main && appinfo.title && appinfo.icon),
  'appinfo.json missing required fields');
check('appinfo_back_key', appinfo.disableBackHistoryAPI === true, 'disableBackHistoryAPI should be true for TV apps');
check('min_webos_gate', code.indexOf('MIN_WEBOS_TV_MAJOR') >= 0 || code.indexOf('versionMajor') >= 0, 'missing webOS 4+ version gate');
check('has_plex_pin', code.indexOf('/api/v2/pins') >= 0, 'missing Plex PIN auth');
check('has_player', code.indexOf('native-player') >= 0, 'missing native player hook');
check('has_hls_transcode', code.indexOf('.m3u8') >= 0 || code.indexOf('transcode/universal') >= 0, 'missing HLS transcode path');
check('has_direct_play', code.indexOf('directPlay') >= 0, 'missing direct play path');
check('has_home_feed', code.indexOf('continueWatching') >= 0, 'missing home feed');
check('has_subtitle_offset', code.indexOf('subtitleOffset') >= 0, 'missing subtitle timing');
check('single_video_element', (indexHtml.match(/<video/g) || []).length === 1, 'LG spec: only one video element in index.html');
check('splash_screen', indexHtml.indexOf('splash-screen') >= 0, 'missing splash screen in index.html');
check('loading_overlay', indexHtml.indexOf('loading-overlay') >= 0, 'missing loading overlay in index.html');

/* Content-Security-Policy hardening (security review): keep the strict policy
   and the externalized error shim from silently regressing. The XSS backstop
   relies on `script-src 'self'` WITHOUT 'unsafe-inline'. */
var cspTag = indexHtml.match(/<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i);
var cspContent = cspTag && (cspTag[0].match(/content="([^"]*)"/i) || cspTag[0].match(/content='([^']*)'/i));
var csp = cspContent ? cspContent[1] : '';
var scriptSrc = (csp.match(/script-src([^;]*)/) || [])[1] || '';
check('csp_present', !!csp, 'index.html missing Content-Security-Policy meta tag');
check('csp_script_src_self', /'self'/.test(scriptSrc), "CSP script-src must include 'self'");
check('csp_no_unsafe_inline_script', !!csp && !/'unsafe-inline'/.test(scriptSrc),
  "CSP script-src must not allow 'unsafe-inline' (defeats the DOM-XSS backstop)");
check('early_errors_external',
  fs.existsSync(path.join(distDir, 'early-errors.js')) && indexHtml.indexOf('early-errors.js') >= 0,
  'early-errors.js must be external (in dist) and referenced by index.html');
check('no_inline_script', !/<script(?![^>]*\bsrc=)[^>]*>/i.test(indexHtml),
  'index.html must not contain an inline <script> (blocked by CSP script-src \'self\')');
check('bitrate_probe', code.indexOf('bitrateCheck') >= 0, 'missing bitrate direct-play probe');
check('hls_fallback', code.indexOf('transcodeProtocol') >= 0, 'missing HLS/HTTP transcode fallback');

/* Icon sanity for LG Simulator / Content Store */
var iconRel = appinfo.icon || '';
var largeRel = appinfo.largeIcon || '';
var iconPath = path.join(distDir, iconRel);
var largePath = path.join(distDir, largeRel);
check('icon_exists', iconRel && fs.existsSync(iconPath), 'appinfo.icon file missing in dist: ' + iconRel);
check('icon_large_exists', largeRel && fs.existsSync(largePath), 'appinfo.largeIcon file missing in dist: ' + largeRel);
function readPngDims(p) {
  try {
    var buf = fs.readFileSync(p);
    if (buf.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  } catch (e) { return null; }
}
var iconDims = readPngDims(iconPath);
var largeDims = readPngDims(largePath);
check('icon_size', iconDims && iconDims.w >= 80 && iconDims.h >= 80,
  'icon should be at least 80x80 (got ' + (iconDims ? iconDims.w + 'x' + iconDims.h : 'unknown') + ')');
check('icon_large_size', largeDims && largeDims.w >= 130 && largeDims.h >= 130,
  'largeIcon should be at least 130x130 (got ' + (largeDims ? largeDims.w + 'x' + largeDims.h : 'unknown') + ')');

var matrix = [
  { platform: 'webOS TV', min: '4.0', engine: 'Chromium (4.x–6.x+)', status: 'required' },
  { spec: 'App Resolution', graphics: '1920x1080', status: 'appinfo.json' },
  { spec: 'Streaming', primary: 'HLS (Plex transcode)', status: 'implemented' },
  { spec: 'Streaming', direct: 'HTTP progressive', status: 'implemented' },
  { spec: 'Subtitles', pgs_vobsub: 'unsupported', status: 'documented' },
  { spec: 'TLS', https: 'default', lan_http: 'optional setting' }
];

console.log('\nSpecification compliance matrix:');
matrix.forEach(function (row) {
  console.log(' ', JSON.stringify(row));
});

if (errors.length) {
  console.error('\nValidation failed:');
  errors.forEach(function (e) { console.error(' -', e); });
  process.exit(1);
}

console.log('\nAll webOS TV 4+ specification checks passed.');
