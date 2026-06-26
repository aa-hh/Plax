/**
 * Generate webOS TV app icons — the compact Plax "x" mark on a black tile.
 *
 * Per LG appinfo.json:
 *   icon      : 80×80 PNG  (launcher tile)
 *   largeIcon : 130×130 PNG (app list)
 *
 * Geometry mirrors src/ui/brand/plaxLogo.js → plaxMarkSvg()
 * (Figma file JZ0qDjpVZrGhgxHDHgsBCZ node 51-56, content region 98 55 → 395 339).
 * No external dependencies — only zlib + Buffer.
 */
var fs   = require('fs');
var path = require('path');
var zlib = require('zlib');

// ── Palette ─────────────────────────────────────────────────────────────────
var BG       = [0xff, 0xff, 0xff]; // #ffffff — white tile (iconColor in appinfo.json)
var GRAD_TOP = [0xAA, 0x5C, 0xC3]; // #AA5CC3 purple
var GRAD_BOT = [0x00, 0xA4, 0xDC]; // #00A4DC blue
var GOLD     = [0xEB, 0xAF, 0x00]; // #EBAF00 amber

// ── Icon geometry — Figma node 51-56, content region x:98-395 y:55-339 ───────
// Rasteriser works in Figma coordinates; offX/offY centering handles the offset.
var VB_W = 297, VB_H = 284; // content size (395-98, 339-55)
var VB_X0 = 98, VB_Y0 = 55; // content origin in Figma space

// Left gradient chevron (polygon)
var GRAD_POLY = [
  [191.243, 192.838], [98, 55], [193.946, 55],
  [286.514, 192.838], [193.946, 330], [98, 192.838]
];
var GRAD_Y0 = 55, GRAD_Y1 = 330;

// Gold upper triangle (polygon)
var GOLD_UP = [
  [311.514, 177.297], [394.622, 55], [298.676, 55], [264.216, 105.676]
];

// Gold lower shape — cubic bezier path flattened into polygon
// M264.216,280 L280.432,302.297
// C295.973,326.622 316.243,338.784 339.892,338.784
// C364.892,338.108 382.459,316.487 389.216,308.378
// C389.216,308.378 377.054,297.568 361.514,279.324
// C340.568,255 312.865,210.405 312.189,208.378
// L264.216,280 Z
var GOLD_LO = (function () {
  function bez(p0, p1, p2, p3) {
    var pts = [];
    for (var i = 1; i <= 24; i++) {
      var t = i / 24, m = 1 - t;
      pts.push([
        m*m*m*p0[0] + 3*m*m*t*p1[0] + 3*m*t*t*p2[0] + t*t*t*p3[0],
        m*m*m*p0[1] + 3*m*m*t*p1[1] + 3*m*t*t*p2[1] + t*t*t*p3[1]
      ]);
    }
    return pts;
  }
  var poly = [[264.216, 280], [280.432, 302.297]]; // start + first L point
  var segs = [
    [[280.432,302.297],[295.973,326.622],[316.243,338.784],[339.892,338.784]],
    [[339.892,338.784],[364.892,338.108],[382.459,316.487],[389.216,308.378]],
    [[389.216,308.378],[389.216,308.378],[377.054,297.568],[361.514,279.324]],
    [[361.514,279.324],[340.568,255],    [312.865,210.405],[312.189,208.378]]
  ];
  for (var i = 0; i < segs.length; i++) {
    var s = segs[i];
    var pts = bez(s[0], s[1], s[2], s[3]);
    for (var j = 0; j < pts.length; j++) poly.push(pts[j]);
  }
  return poly;
}());

// ── Rasteriser helpers ───────────────────────────────────────────────────────
function inPoly(px, py, poly) {
  var n = poly.length, inside = false;
  for (var i = 0, j = n - 1; i < n; j = i++) {
    var xi = poly[i][0], yi = poly[i][1];
    var xj = poly[j][0], yj = poly[j][1];
    if ((yi > py) !== (yj > py) &&
        px < ((xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function gradColor(vy) {
  var t = Math.max(0, Math.min(1, (vy - GRAD_Y0) / (GRAD_Y1 - GRAD_Y0)));
  return [
    GRAD_TOP[0] + (GRAD_BOT[0] - GRAD_TOP[0]) * t,
    GRAD_TOP[1] + (GRAD_BOT[1] - GRAD_TOP[1]) * t,
    GRAD_TOP[2] + (GRAD_BOT[2] - GRAD_TOP[2]) * t
  ];
}

// Returns 0=bg, 1=gradient, 2=gold
function classify(vx, vy) {
  if (inPoly(vx, vy, GOLD_UP)) return 2;
  if (inPoly(vx, vy, GOLD_LO)) return 2;
  if (inPoly(vx, vy, GRAD_POLY)) return 1;
  return 0;
}

var SS = 4; // supersampling factor (SS² samples/pixel)

function makePng(size) {
  // Scale to fill ~88% of tile, centered; shift out the Figma coordinate origin
  var scale = (size * 0.88) / Math.max(VB_W, VB_H);
  var offX  = (size - VB_W * scale) / 2 - VB_X0 * scale;
  var offY  = (size - VB_H * scale) / 2 - VB_Y0 * scale;
  var samples = SS * SS;
  var pixels = Buffer.alloc(size * size * 4);

  for (var y = 0; y < size; y++) {
    for (var x = 0; x < size; x++) {
      var rAcc = 0, gAcc = 0, bAcc = 0, wAcc = 0;
      for (var sy = 0; sy < SS; sy++) {
        for (var sx = 0; sx < SS; sx++) {
          var vx = (x + (sx + 0.5) / SS - offX) / scale;
          var vy = (y + (sy + 0.5) / SS - offY) / scale;
          var kind = classify(vx, vy);
          if (kind === 1) {
            var c = gradColor(vy);
            rAcc += c[0]; gAcc += c[1]; bAcc += c[2]; wAcc++;
          } else if (kind === 2) {
            rAcc += GOLD[0]; gAcc += GOLD[1]; bAcc += GOLD[2]; wAcc++;
          }
        }
      }
      var idx = (y * size + x) * 4;
      if (wAcc > 0) {
        var cov = wAcc / samples;
        pixels[idx + 0] = Math.round(BG[0] * (1 - cov) + (rAcc / wAcc) * cov);
        pixels[idx + 1] = Math.round(BG[1] * (1 - cov) + (gAcc / wAcc) * cov);
        pixels[idx + 2] = Math.round(BG[2] * (1 - cov) + (bAcc / wAcc) * cov);
      } else {
        pixels[idx + 0] = BG[0]; pixels[idx + 1] = BG[1]; pixels[idx + 2] = BG[2];
      }
      pixels[idx + 3] = 0xff;
    }
  }
  return encodePng(size, pixels);
}

// ── Minimal PNG encoder ──────────────────────────────────────────────────────
var CRC_TABLE = (function () {
  var t = new Uint32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
}());

function crc32(buf) {
  var c = 0xffffffff;
  for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  var len  = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  var tb   = Buffer.from(type, 'ascii');
  var crc  = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tb, data])) >>> 0, 0);
  return Buffer.concat([len, tb, data, crc]);
}

function encodePng(size, pixels) {
  var ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

  var raw = Buffer.alloc((size * 4 + 1) * size);
  for (var ry = 0; ry < size; ry++) {
    raw[ry * (size * 4 + 1)] = 0; // filter: None
    pixels.copy(raw, ry * (size * 4 + 1) + 1, ry * size * 4, (ry + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ── Wordmark-on-white icon via rsvg-convert ──────────────────────────────────
// Figma node 53-59: white background, black letters, gradient+gold x.
// Content bounds in Figma space: x=156 y=77 w=1015 h=457.
var RSVG = '/opt/homebrew/bin/rsvg-convert';

function wordmarkSvg(size) {
  // Scale content to 84% of tile width, centered vertically.
  var fw = size * 0.84, fh = fw * 457 / 1015;
  var tx = ((size - fw) / 2 - 156 * fw / 1015).toFixed(3);
  var ty = ((size - fh) / 2 - 77  * fh / 457).toFixed(3);
  var sx = (fw / 1015).toFixed(6), sy = (fh / 457).toFixed(6);
  var g  = '<g transform="translate(' + tx + ',' + ty + ') scale(' + sx + ',' + sy + ')">';
  return (
    '<svg width="' + size + '" height="' + size + '" xmlns="http://www.w3.org/2000/svg">' +
    '<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="968.257" y1="167" x2="968.257" y2="442">' +
    '<stop offset="0" stop-color="#AA5CC3"/><stop offset="1" stop-color="#00A4DC"/></linearGradient></defs>' +
    '<rect width="' + size + '" height="' + size + '" fill="white"/>' +
    g +
      '<path d="M967.243 304.838L874 167H969.946L1062.51 304.838L969.946 442H874L967.243 304.838Z" fill="url(#g)"/>' +
      '<path fill="black" d="M320.189 159.431C280.324 159.431 254.649 170.918 233.027 197.945V168.215H156V534.433C156 534.433 157.351 535.108 161.405 535.784C166.811 537.135 195.189 543.216 216.135 525.649C234.378 510.108 238.432 491.864 238.432 471.594V418.891C260.73 442.54 285.73 452.675 320.865 452.675C396.541 452.675 454.649 391.188 454.649 309.431C454.649 220.918 398.568 159.431 320.189 159.431ZM305.324 383.081C262.757 383.081 228.973 347.945 228.973 305.377C228.973 263.485 268.838 229.702 305.324 229.702C348.568 229.702 381.676 262.81 381.676 306.053C381.676 349.296 347.892 383.081 305.324 383.081Z"/>' +
      '<path fill="black" fill-rule="evenodd" clip-rule="evenodd" d="M704.215 452C742.525 452 767.199 441.014 787.977 415.166C805 440 838 450.66 857 442.26V167C850 167 822.5 167 816.69 167C782.783 167 782.783 218 782.783 218C761.355 181.242 737.33 171.549 703.566 171.549C630.842 171.549 575 230.353 575 308.543C575 393.196 628.894 452 704.215 452ZM772.025 313.339C772.025 278.093 743.917 249 708.5 249C673.083 249 644.975 276.974 644.975 312.78C644.975 348.586 672.521 376 708.5 376C738.857 376 772.025 348.027 772.025 313.339Z"/>' +
      '<path fill="black" d="M548.73 300.649C548.73 332.405 552.108 370.919 583.189 412.811C583.865 413.486 585.216 415.513 585.216 415.513C572.378 437.135 556.838 452 535.892 452C519.676 452 503.459 443.216 489.946 428.351C475.757 412.135 469 391.189 469 368.892V77H548.054L548.73 300.649Z"/>' +
      '<path d="M1087.51 289.297L1170.62 167H1074.68L1040.22 217.676L1087.51 289.297Z" fill="#EBAF00"/>' +
      '<path d="M1040.22 392L1056.43 414.297C1071.97 438.622 1092.24 450.784 1115.89 450.784C1140.89 450.108 1158.46 428.487 1165.22 420.378C1165.22 420.378 1153.05 409.568 1137.51 391.324C1116.57 367 1088.86 322.405 1088.19 320.378L1040.22 392Z" fill="#EBAF00"/>' +
      '<path d="M967.243 304.838L874 167H969.946L1062.51 304.838L969.946 442H874L967.243 304.838Z" fill="url(#g)"/>' +
    '</g>' +
    '</svg>'
  );
}

var CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function makeWordmarkPng(size) {
  var cp     = require('child_process');
  var os     = require('os');
  var SS     = 8; // render at 8× — Chrome Skia renderer, then Lanczos downscale
  var big    = size * SS;
  var html   = path.join(os.tmpdir(), 'plax-icon-' + size + '.html');
  var bigPng = path.join(os.tmpdir(), 'plax-icon-' + size + '-big.png');
  var outPng = path.join(os.tmpdir(), 'plax-icon-' + size + '-out.png');
  fs.writeFileSync(html,
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<style>*{margin:0;padding:0}html,body{width:' + big + 'px;height:' + big + 'px;overflow:hidden}</style>' +
    '</head><body>' + wordmarkSvg(big) + '</body></html>');
  cp.execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--screenshot=' + bigPng,
    '--window-size=' + big + ',' + big,
    '--hide-scrollbars', '--force-device-scale-factor=1',
    'file://' + html
  ]);
  cp.execFileSync('/usr/bin/sips', ['-z', String(size), String(size), bigPng, '--out', outPng]);
  return fs.readFileSync(outPng);
}

// ── Write assets ─────────────────────────────────────────────────────────────
var assets = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(assets)) fs.mkdirSync(assets, { recursive: true });

// Only generate when files are absent — delete to force regeneration.
var iconPath      = path.join(assets, 'icon.png');
var largeIconPath = path.join(assets, 'icon-large.png');
var wrote = [];
if (!fs.existsSync(iconPath)) {
  fs.writeFileSync(iconPath, makeWordmarkPng(80));
  wrote.push('icon.png');
}
if (!fs.existsSync(largeIconPath)) {
  fs.writeFileSync(largeIconPath, makeWordmarkPng(130));
  wrote.push('icon-large.png');
}
console.log(wrote.length ? ('Generated Plax icons [wordmark, Chrome 8× → sips]: ' + wrote.join(' + ')) : 'Kept committed icons (delete to regenerate).');
