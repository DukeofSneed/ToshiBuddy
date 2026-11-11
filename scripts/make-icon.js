// Builds assets/icon.png and assets/icon.ico from a snowflake image on a dark
// background (assets/icon-source.png by default). Run with Electron, which
// brings the image decoder/encoder, so there are no extra dependencies:
//   node_modules\electron\dist\electron.exe scripts\make-icon.js [source.png]
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = process.argv.find((a, i) => i > 1 && /\.(png|jpe?g)$/i.test(a)) || path.join(root, 'assets', 'icon-source.png');

function keyDark(img) {
  // The background is black and the snowflake is one bright color, so alpha
  // comes from brightness and every visible pixel takes the snowflake's color.
  const { width, height } = img.getSize();
  const px = img.toBitmap(); // BGRA
  let best = [0, 0, 0], bestV = 0;
  for (let i = 0; i < px.length; i += 4) {
    const v = Math.max(px[i], px[i + 1], px[i + 2]);
    if (v > bestV) { bestV = v; best = [px[i], px[i + 1], px[i + 2]]; }
  }
  for (let i = 0; i < px.length; i += 4) {
    const v = Math.max(px[i], px[i + 1], px[i + 2]);
    const a = Math.max(0, Math.min(255, Math.round(((v - 24) / Math.max(1, bestV * 0.85 - 24)) * 255)));
    // Electron bitmaps are premultiplied: color channels scale with alpha.
    px[i] = Math.round(best[0] * a / 255); px[i + 1] = Math.round(best[1] * a / 255); px[i + 2] = Math.round(best[2] * a / 255); px[i + 3] = a;
  }
  return nativeImage.createFromBitmap(px, { width, height });
}

// ICO container holding PNG images (supported since Windows Vista).
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach(({ size, data }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2); dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(data.length, o + 8); dir.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.data)]);
}

app.whenReady().then(() => {
  try {
    const keyed = keyDark(nativeImage.createFromPath(src));
    if (keyed.isEmpty()) throw new Error(`could not read ${src}`);
    fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(root, 'assets', 'icon.png'), keyed.resize({ width: 256, height: 256, quality: 'best' }).toPNG());
    const sizes = [16, 24, 32, 48, 64, 128, 256];
    const pngs = sizes.map((size) => ({ size, data: keyed.resize({ width: size, height: size, quality: 'best' }).toPNG() }));
    fs.writeFileSync(path.join(root, 'assets', 'icon.ico'), ico(pngs));
    console.log(`icon.png and icon.ico written (${sizes.join(', ')} px)`);
  } catch (e) {
    console.error(`make-icon failed: ${e.message}`);
    process.exitCode = 1;
  }
  app.quit();
});
