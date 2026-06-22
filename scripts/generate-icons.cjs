/**
 * Generate webOS TV app icons.
 *
 * Per LG appinfo.json reference:
 *   - icon       : 80x80 PNG  (launcher tile)
 *   - largeIcon  : 130x130 PNG (app list)
 *
 * Produces solid brand-colored PNGs with a centered play triangle.
 * No external dependencies — uses only zlib + Buffer.
 */
var fs = require('fs');
var path = require('path');
var zlib = require('zlib');

var BG = [0x0a, 0x0a, 0x0f, 0xff];       // #0a0a0f
var FG = [0xe5, 0xa0, 0x0d, 0xff];       // Plex amber

function makePng(size) {
  var pixels = Buffer.alloc(size * size * 4);
  for (var y = 0; y < size; y++) {
    for (var x = 0; x < size; x++) {
      var i = (y * size + x) * 4;
      pixels[i + 0] = BG[0];
      pixels[i + 1] = BG[1];
      pixels[i + 2] = BG[2];
      pixels[i + 3] = BG[3];
    }
  }

  // Centered play triangle (pointing right). Spans ~55% of the canvas.
  var inset = Math.round(size * 0.28);
  var leftX = inset;
  var rightX = size - inset;
  var topY = inset;
  var botY = size - inset;
  var height = botY - topY;
  for (var py = topY; py < botY; py++) {
    var t = (py - topY) / height;       // 0 at top, 1 at bottom
    var taper = t < 0.5 ? t : 1 - t;    // narrows toward apex (right)
    var rowRight = Math.round(leftX + (rightX - leftX) * (1 - Math.abs((py - (topY + botY) / 2) / (height / 2))));
    for (var px = leftX; px < rowRight; px++) {
      var i2 = (py * size + px) * 4;
      pixels[i2 + 0] = FG[0];
      pixels[i2 + 1] = FG[1];
      pixels[i2 + 2] = FG[2];
      pixels[i2 + 3] = FG[3];
    }
  }

  // Encode PNG: signature + IHDR + IDAT + IEND
  var sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  function chunk(type, data) {
    var len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    var typeBuf = Buffer.from(type, 'ascii');
    var crcInput = Buffer.concat([typeBuf, data]);
    var crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcInput) >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }

  var ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;     // bit depth
  ihdr[9] = 6;     // color type RGBA
  ihdr[10] = 0;    // compression
  ihdr[11] = 0;    // filter
  ihdr[12] = 0;    // interlace

  // Raw scanlines with filter byte 0 prepended to each row
  var raw = Buffer.alloc((size * 4 + 1) * size);
  for (var ry = 0; ry < size; ry++) {
    raw[ry * (size * 4 + 1)] = 0; // filter: None
    pixels.copy(raw, ry * (size * 4 + 1) + 1, ry * size * 4, (ry + 1) * size * 4);
  }
  var idat = zlib.deflateSync(raw);

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// CRC-32 (PNG)
var crcTable = (function () {
  var t = new Uint32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  var c = 0xffffffff;
  for (var i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

var assets = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(assets)) fs.mkdirSync(assets, { recursive: true });

// Generate placeholder icons ONLY when none are committed — never clobber a real
// (e.g. branded) icon checked into the repo. To regenerate, delete the asset first.
var iconPath = path.join(assets, 'icon.png');
var largeIconPath = path.join(assets, 'icon-large.png');
var wrote = [];
if (!fs.existsSync(iconPath)) { fs.writeFileSync(iconPath, makePng(80)); wrote.push('icon.png'); }
if (!fs.existsSync(largeIconPath)) { fs.writeFileSync(largeIconPath, makePng(130)); wrote.push('icon-large.png'); }
console.log(wrote.length ? ('Generated placeholder ' + wrote.join(' + ')) : 'Kept committed icons (no placeholders generated).');
