#!/usr/bin/env node
/* Generate a small grayscale noise PNG (centered ~128) as a base64 data URI for
   the CSS dither overlay. Centered at 128 so it pairs with mix-blend-mode:overlay
   (neutral midpoint = no net brightness lift; perturbs around it to kill banding).
   Pure Node — no deps. Prints the data: URI to stdout. */
const zlib = require('zlib');

const SIZE = 96;        // tile size (repeats)
const SPREAD = 70;      // +/- noise amplitude around 128

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

// IHDR: 8-bit grayscale (color type 0)
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;   // bit depth
ihdr[9] = 0;   // color type grayscale
// 10,11,12 = compression/filter/interlace = 0

// raw scanlines: filter byte 0 + SIZE gray bytes
const raw = Buffer.alloc((SIZE + 1) * SIZE);
let p = 0;
for (let y = 0; y < SIZE; y++) {
  raw[p++] = 0; // filter: none
  for (let x = 0; x < SIZE; x++) {
    const v = 128 + Math.round((Math.random() * 2 - 1) * SPREAD);
    raw[p++] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);

process.stdout.write('data:image/png;base64,' + png.toString('base64'));
