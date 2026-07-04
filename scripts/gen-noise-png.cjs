#!/usr/bin/env node
/* Generate a small TRANSPARENT RGBA noise tile as a base64 PNG data URI, for
   the detail-screen corner-wash's dither layer (src/ui/colorWash.js
   NOISE_TILE_URL). Unlike scripts/gen-noise.cjs (opaque grayscale, full-screen
   soft-light dither), this tile carries an ALPHA channel: random per-pixel
   alpha in a low range so it can sit ON TOP of the corner-wash gradients as a
   `repeat` background-image layer and break up OLED banding without adding
   its own visible color. White pixels at ≤5% alpha (channel value ~ White,
   alpha ~0-13/255).

   Pure Node built-ins only (zlib + hand-rolled PNG chunks/CRC) — no npm dep.
   Run once, paste the printed data: URI into NOISE_TILE_URL in colorWash.js.

   Usage: node scripts/gen-noise-png.cjs > /tmp/noise-tile.txt
          (or just eyeball stdout and copy the data: URI out) */
const zlib = require('zlib');

const SIZE = 48;       // tile size (repeats via `background-repeat: repeat`)
const MAX_ALPHA = 13;  // ~5% of 255 — subtle, never a visible tint

function crc32(buf) {
  let c, table = crc32.t || (crc32.t = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// IHDR: 8-bit grayscale + alpha (color type 4) — 2 bytes/pixel (gray, alpha)
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;   // bit depth
ihdr[9] = 4;   // color type: grayscale + alpha
// 10,11,12 = compression/filter/interlace = 0

// raw scanlines: filter byte 0 + SIZE * (gray, alpha) pairs
const raw = Buffer.alloc((SIZE * 2 + 1) * SIZE);
let p = 0;
for (let y = 0; y < SIZE; y++) {
  raw[p++] = 0; // filter: none
  for (let x = 0; x < SIZE; x++) {
    raw[p++] = 255; // gray channel: always white — alpha carries the noise
    raw[p++] = Math.round(Math.random() * MAX_ALPHA); // alpha: 0..MAX_ALPHA
  }
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);

process.stdout.write('data:image/png;base64,' + png.toString('base64'));
