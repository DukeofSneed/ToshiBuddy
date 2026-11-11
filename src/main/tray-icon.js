'use strict';
// Builds a small icy-blue crystal orb PNG at runtime so the tray needs no asset file.
const zlib = require('zlib');
const { nativeImage } = require('electron');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function iceOrbPng(size = 16) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const cx = (size - 1) / 2, cy = (size - 1) / 2, r = size / 2 - 0.5;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const o = y * (size * 4 + 1) + 1 + x * 4;
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r) {
        const t = d / r;
        const hl = Math.max(0, 1 - Math.hypot(x - cx + r * 0.35, y - cy + r * 0.35) / (r * 0.8));
        raw[o] = Math.round(40 + 190 * hl - 20 * t);      // R
        raw[o + 1] = Math.round(120 + 125 * hl - 30 * t); // G
        raw[o + 2] = Math.round(200 + 55 * hl - 30 * t);  // B
        raw[o + 3] = d > r - 1 ? Math.round(255 * (r - d + 1)) : 255;
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function trayIcon() {
  const img = nativeImage.createFromBuffer(iceOrbPng(32), { scaleFactor: 2 });
  return img.resize({ width: 16, height: 16 });
}

module.exports = { trayIcon, iceOrbPng };
