// Run with Electron (for PNG encoding): draws an original sample sheet, then
// tests importFiles / exportPack / importPack / saveCharacter and the refusals.
const { app, nativeImage } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-import-test-'));
process.env.TOSHI_CHARACTERS_DIR = path.join(work, 'characters');
const imp = require(path.join(ROOT, 'src', 'main', 'character-import.js'));
const { listCharacters, readCharacterDialogue } = require(path.join(ROOT, 'src', 'main', 'mods.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const throws = (fn, re, m) => { try { fn(); ok(false, `${m} (no error)`); } catch (e) { ok(re.test(e.message), `${m}: ${e.message}`); } };

function sampleSheet(file) {
  // 4 columns x 2 rows of simple blob figures on transparent background (premultiplied BGRA).
  const W = 400, H = 220, px = Buffer.alloc(W * H * 4);
  const dot = (cx, cy, r, c) => {
    for (let y = Math.max(0, cy - r); y < Math.min(H, cy + r); y++) for (let x = Math.max(0, cx - r); x < Math.min(W, cx + r); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) { const i = (y * W + x) * 4; px[i] = c[2]; px[i + 1] = c[1]; px[i + 2] = c[0]; px[i + 3] = 255; }
    }
  };
  for (let row = 0; row < 2; row++) for (let col = 0; col < 4; col++) {
    const cx = 50 + col * 100, base = 100 + row * 110;
    for (let y = base - 50; y < base; y++) dot(cx + ((col % 2) ? 3 : -3), y, 14, [80, 160, 220]); // body
    dot(cx, base - 62, 18, [240, 200, 160]); // head
  }
  fs.writeFileSync(file, nativeImage.createFromBitmap(px, { width: W, height: H }).toPNG());
}

app.whenReady().then(() => {
  try {
    const src = path.join(work, 'src');
    fs.mkdirSync(src);
    sampleSheet(path.join(src, 'blob-sheet.png'));
    fs.writeFileSync(path.join(src, 'lines.txt'), 'First line.\nSecond line.\n\n');
    fs.writeFileSync(path.join(src, 'fake.png'), 'MZ this is not an image');
    fs.writeFileSync(path.join(src, 'tool.exe'), 'MZ');

    // Quick import
    const id = imp.importFiles(ROOT, { name: 'Blob Buddy', personality: 'Cheerful\u0007 blob.', scale: 1.2, files: { sheet: path.join(src, 'blob-sheet.png'), quips: path.join(src, 'lines.txt') } });
    ok(id === 'blob-buddy', 'id from name: ' + id);
    const dir = path.join(work, 'characters', id);
    ok(fs.existsSync(path.join(dir, 'sheet.png')), 'sheet copied');
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'character.json'), 'utf8'));
    ok(cfg.name === 'Blob Buddy' && cfg.personality === 'Cheerful  blob.' && cfg.sheet.scale === 1.2, 'character.json written and cleaned');
    const d = readCharacterDialogue(ROOT, id);
    ok(d && d.quips.length === 2 && d.quips[0].tags[0] === 'random', 'txt quips -> random');
    ok(listCharacters(ROOT).some((c) => c.name === id && c.sheet), 'listed with a sheet');

    // Same name again gets a new id, never overwrites
    const id2 = imp.importFiles(ROOT, { name: 'Blob Buddy', files: { sheet: path.join(src, 'blob-sheet.png') } });
    ok(id2 === 'blob-buddy-2', 'unique id: ' + id2);

    // Refusals
    throws(() => imp.importFiles(ROOT, { name: '', files: { sheet: path.join(src, 'blob-sheet.png') } }), /name/, 'empty name');
    throws(() => imp.importFiles(ROOT, { name: 'X', files: {} }), /sprite sheet/, 'no images');
    throws(() => imp.importFiles(ROOT, { name: 'X', files: { sheet: path.join(src, 'fake.png') } }), /not a valid image/, 'fake png');
    throws(() => imp.importFiles(ROOT, { name: 'X', files: { sheet: path.join(src, 'tool.exe') } }), /PNG, WebP/, 'exe');
    ok(!fs.existsSync(path.join(work, 'characters', 'x')), 'failed import leaves nothing behind');

    // Mapper save
    imp.saveCharacter(ROOT, id, { personality: 'Calm.', sheet: { scale: 1.5, animations: { idle: { frames: '0:0-3', fps: 4 }, walk: { frames: '1:0-3', flip: true }, bogus: { frames: '0:0' } } } });
    const cfg2 = JSON.parse(fs.readFileSync(path.join(dir, 'character.json'), 'utf8'));
    ok(cfg2.personality === 'Calm.' && cfg2.sheet.scale === 1.5 && cfg2.sheet.animations.walk.flip === true && !cfg2.sheet.animations.bogus, 'mapper save cleaned');
    // Mirror modes: figure only, everything, none; never both at once.
    const mir = imp.saveCharacter(ROOT, id, { sheet: { animations: { idle: { frames: '0:0' }, think: { frames: '0:1', flipBody: true }, wave: { frames: '0:2', flip: true }, surprised: { frames: '0:3', flip: true, flipBody: true } } } }).sheet.animations;
    ok(mir.think.flipBody === true && !mir.think.flip, 'figure-only mirror saved');
    ok(mir.wave.flip === true && !mir.wave.flipBody, 'full mirror saved');
    ok(mir.surprised.flipBody === true && !mir.surprised.flip, 'both mirrors collapse to one');
    ok(!mir.idle.flip && !mir.idle.flipBody, 'no mirror saved as none');
    const un = imp.saveCharacter(ROOT, id, { sheet: { animations: { idle: { frames: '0:0' }, think: { frames: '0:1' } } } }).sheet.animations;
    ok(!un.think.flip && !un.think.flipBody, 'mirror can be turned off');
    imp.saveCharacter(ROOT, id, { sheet: { animations: { idle: { frames: '0:0-3', fps: 4 }, walk: { frames: '1:0-3', flip: true } } } });
    throws(() => imp.saveCharacter(ROOT, id, { sheet: { animations: { idle: { frames: '0:0; rm -rf' } } } }), /frames/, 'bad frames');
    throws(() => imp.saveCharacter(ROOT, '..\\evil', {}), /Unknown/, 'path traversal id');

    // Export, then import the zip
    const zip = path.join(work, 'blob.zip');
    const files = imp.exportPack(ROOT, id, zip);
    ok(fs.existsSync(zip) && files.includes('sheet.png') && files.includes('character.json'), 'exported: ' + files.join(','));
    const id3 = imp.importPack(ROOT, zip);
    ok(/^blob-buddy-\d$/.test(id3) && fs.existsSync(path.join(work, 'characters', id3, 'sheet.png')), 'zip re-imported as ' + id3);
    const cfg3 = JSON.parse(fs.readFileSync(path.join(work, 'characters', id3, 'character.json'), 'utf8'));
    ok(cfg3.sheet.animations.walk.frames === '1:0-3', 'mapping survived the round trip');

    // Folder pack with junk files: only allowed names are copied
    const packDir = path.join(work, 'pack', 'inner');
    fs.mkdirSync(packDir, { recursive: true });
    fs.copyFileSync(path.join(src, 'blob-sheet.png'), path.join(packDir, 'sheet.png'));
    fs.writeFileSync(path.join(packDir, 'character.json'), JSON.stringify({ name: 'Folder Pal', evil: 'x', sheet: { animations: { idle: { frames: '0:0-1' } } } }));
    fs.writeFileSync(path.join(packDir, 'run.exe'), 'MZ');
    const id4 = imp.importPack(ROOT, path.join(work, 'pack'));
    const got = fs.readdirSync(path.join(work, 'characters', id4)).sort();
    ok(id4 === 'folder-pal' && got.join(',') === 'character.json,quips.json,sheet.png', 'folder pack: ' + got.join(','));
    ok(!('evil' in JSON.parse(fs.readFileSync(path.join(work, 'characters', id4, 'character.json'), 'utf8'))), 'unknown config keys dropped');
    throws(() => imp.importPack(ROOT, path.join(src, 'tool.exe')), /folder or a \.zip/, 'non-zip file');

  } catch (e) {
    fail++; console.log('ERROR', e.stack);
  }
  console.log(`${pass} passed, ${fail} failed`);
  fs.rmSync(work, { recursive: true, force: true });
  process.exitCode = fail ? 1 : 0;
  app.exit(fail ? 1 : 0); // app.quit() would report success even after a failure
});
