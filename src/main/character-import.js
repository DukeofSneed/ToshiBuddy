'use strict';
// Importing and exporting character packs.
//
// A pack is a folder under characters/<id>/ with character.json, quips.json, and
// images named sheet / ultimate-sheet / skin / ultimate (.png .webp .gif .jpg).
// Everything that comes in is checked: only those file names, image extensions,
// a size cap, JSON parsed and re-written, quips normalized. Paths inside a zip
// are never trusted; only allowed base names are extracted.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseQuipList, charactersRoot, readJson, ID_RE, IMG_RE } = require('./mods');

const MAX_IMAGE = 25 * 1024 * 1024;
const MAX_JSON = 2 * 1024 * 1024;
const IMAGE_SLOTS = ['sheet', 'ultimate-sheet', 'skin', 'ultimate'];
const PACK_FILE_RE = /^(character\.json|quips\.json|(sheet|ultimate-sheet|skin|ultimate)\.(png|webp|gif|jpe?g))$/i;

// Animation names the pet understands (plus anim-<mod animation>).
const ANIM_KEYS = ['idle', 'blink', 'walk', 'talk', 'sleep', 'drag', 'fall', 'land', 'lean', 'desk', 'working', 'scribbling',
  'think', 'surprised', 'huff', 'shrug', 'wave', 'frost', 'release', 'stamp'];

function slug(name) {
  const s = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  return s || 'character';
}

function uniqueId(root, base) {
  let id = slug(base);
  if (!ID_RE.test(id)) id = `c-${id}`.slice(0, 40);
  let n = 1, out = id;
  while (fs.existsSync(path.join(root, out))) out = `${id}-${++n}`;
  return out;
}

function checkFile(file, max) {
  const st = fs.lstatSync(file);
  if (!st.isFile()) throw new Error(`${path.basename(file)} is not a regular file`);
  if (st.size > max) throw new Error(`${path.basename(file)} is larger than ${Math.round(max / 1048576)} MB`);
  return st;
}

function checkImage(file) {
  if (!IMG_RE.test(file)) throw new Error(`${path.basename(file)}: images must be PNG, WebP, GIF, or JPG`);
  checkFile(file, MAX_IMAGE);
  // Magic bytes, so a renamed file of another kind is refused.
  const fd = fs.openSync(file, 'r');
  const head = Buffer.alloc(12);
  fs.readSync(fd, head, 0, 12, 0);
  fs.closeSync(fd);
  const isPng = head.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpg = head[0] === 0xff && head[1] === 0xd8;
  const isGif = head.slice(0, 3).toString('ascii') === 'GIF';
  const isWebp = head.slice(0, 4).toString('ascii') === 'RIFF' && head.slice(8, 12).toString('ascii') === 'WEBP';
  if (!(isPng || isJpg || isGif || isWebp)) throw new Error(`${path.basename(file)} is not a valid image`);
}

// Quips from a .json pack (array or { quips }) or a .txt file (one line each).
function readQuipsFile(file) {
  checkFile(file, MAX_JSON);
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  let list;
  if (/\.txt$/i.test(file)) {
    list = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((t) => ({ text: t, tags: ['random'] }));
  } else {
    list = parseQuipList(JSON.parse(text), 'import');
  }
  return list
    .filter((q) => q && q.text)
    .slice(0, 2000)
    .map((q, i) => {
      const out = { id: q.id ? String(q.id).slice(0, 60) : `line_${String(i + 1).padStart(3, '0')}`, tags: (q.tags || ['random']).map((t) => String(t).toLowerCase().slice(0, 30)), text: String(q.text).slice(0, 240) };
      if (Number.isFinite(q.cooldown)) out.cooldown = Math.max(0, Math.min(86400, q.cooldown));
      if (Number.isFinite(q.priority)) out.priority = Math.max(0, Math.min(3, q.priority));
      if (q.weight && q.weight !== 1) out.weight = Math.max(0.1, Math.min(10, Number(q.weight) || 1));
      return out;
    });
}

// Keep only known, sane settings from a character.json.
function cleanConfig(cfg) {
  const out = {};
  const str = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n) : undefined);
  const num = (v, lo, hi) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : undefined);
  const set = (k, v) => { if (v !== undefined && v !== '') out[k] = v; };
  set('name', str(cfg.name, 40));
  set('personality', str(cfg.personality, 600));
  set('scale', num(cfg.scale, 0.2, 4));
  set('offsetX', num(cfg.offsetX, -200, 200));
  set('offsetY', num(cfg.offsetY, -200, 200));
  set('keyMode', ['edges', 'color', 'none'].includes(cfg.keyMode) ? cfg.keyMode : undefined);
  set('keyColor', /^#?[0-9a-f]{6}$/i.test(cfg.keyColor || '') ? cfg.keyColor : undefined);
  set('keyTolerance', num(cfg.keyTolerance, 0, 255));
  set('ultimateSeconds', num(cfg.ultimateSeconds, 5, 600));
  if (cfg.theme && /^#[0-9a-f]{6}$/i.test(cfg.theme.accent || '')) out.theme = { accent: cfg.theme.accent };
  if (cfg.effects === 'explosion' || cfg.effects === 'ice') out.effects = cfg.effects;
  if (cfg.ultimateForm === false) out.ultimateForm = false;
  if (cfg.ownQuipsOnly === true) out.ownQuipsOnly = true;
  if (cfg.mods === false || Array.isArray(cfg.mods)) out.mods = cfg.mods === false ? false : cfg.mods.map(String).filter((m) => /^[a-z0-9-]{2,40}$/.test(m)).slice(0, 50);
  if (cfg.anchors && typeof cfg.anchors === 'object') out.anchors = cleanAnchors(cfg.anchors);
  if (cfg.ultimate && typeof cfg.ultimate === 'object') {
    const u = cleanConfig(cfg.ultimate);
    delete u.name; delete u.personality; delete u.sheet; delete u.ultimateSheet; delete u.ultimate;
    out.ultimate = u;
  }
  for (const k of ['sheet', 'ultimateSheet']) if (cfg[k] && typeof cfg[k] === 'object') out[k] = cleanSheet(cfg[k]);
  return out;
}

function cleanAnchors(a) {
  const out = {};
  for (const k of ['head', 'hand-r', 'hand-l']) {
    if (!a[k] || typeof a[k] !== 'object') continue;
    const p = {};
    for (const f of ['x', 'y', 'size']) if (Number.isFinite(Number(a[k][f]))) p[f] = Math.max(-400, Math.min(400, Number(a[k][f])));
    out[k] = p;
  }
  return out;
}

function cleanAnimations(anims) {
  const out = {};
  for (const [k, d] of Object.entries(anims || {})) {
    if (!(ANIM_KEYS.includes(k) || /^anim-[a-z0-9-]{1,40}$/.test(k)) || !d || typeof d !== 'object') continue;
    const frames = String(d.frames == null ? '' : d.frames).replace(/\s+/g, '');
    if (frames && !/^[0-9:,-]{1,300}$/.test(frames)) throw new Error(`"${k}": frames can only use numbers, ":", "-" and ","`);
    const a = {};
    if (frames) a.frames = frames;
    if (Number.isFinite(Number(d.row))) a.row = Math.max(0, Math.min(99, Math.floor(Number(d.row))));
    if (Number.isFinite(Number(d.fps)) && Number(d.fps) > 0) a.fps = Math.max(0.2, Math.min(30, Number(d.fps)));
    // One mirror mode only: both together would cancel out on the figure.
    if (d.flipBody) a.flipBody = true;
    else if (d.flip) a.flip = true;
    if (d.loop === false) a.loop = false;
    if (Number.isFinite(Number(d.loopFrom)) && Number(d.loopFrom) > 0) a.loopFrom = Math.floor(Number(d.loopFrom));
    if (Number.isFinite(Number(d.speed)) && Number(d.speed) > 0) a.speed = Math.min(400, Number(d.speed));
    if (a.frames || a.row !== undefined) out[k] = a;
  }
  return out;
}

function cleanSheet(s) {
  const out = {};
  for (const k of ['scale', 'offsetX', 'offsetY', 'keyTolerance', 'keyMax']) if (Number.isFinite(Number(s[k]))) out[k] = Number(s[k]);
  if (Array.isArray(s.moveMarks)) {
    out.moveMarks = s.moveMarks.filter((p) => Array.isArray(p) && p.length === 2 && p.every((x) => /^\d{1,2}:\d{1,2}$/.test(String(x)))).slice(0, 50).map((p) => p.map(String));
  }
  if (out.scale !== undefined) out.scale = Math.max(0.2, Math.min(4, out.scale));
  if (s.keyMode === 'none') out.keyMode = 'none';
  const rows = cleanRows(s.rows);
  if (rows) out.rows = rows;
  if (s.animations) out.animations = cleanAnimations(s.animations);
  return out;
}

// How many poses each row of the sheet has (found when the sheet is sliced).
function cleanRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  return rows.slice(0, 50).map((n) => Math.max(0, Math.min(99, Math.floor(Number(n) || 0))));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

// ---- quick import: separate files plus name and personality ----
function importFiles(projectRoot, { name, personality, scale, files = {} }) {
  const root = charactersRoot(projectRoot);
  const display = String(name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40);
  if (!display) throw new Error('Give the character a name.');
  if (!files.sheet && !files.skin) throw new Error('Choose a sprite sheet (or at least a still image).');
  for (const slot of IMAGE_SLOTS) if (files[slot]) checkImage(files[slot]);
  const quips = files.quips ? readQuipsFile(files.quips) : null;

  fs.mkdirSync(root, { recursive: true });
  const id = uniqueId(root, display);
  const dir = path.join(root, id);
  fs.mkdirSync(dir);
  try {
    for (const slot of IMAGE_SLOTS) {
      if (!files[slot]) continue;
      const ext = path.extname(files[slot]).toLowerCase().replace('.jpeg', '.jpg');
      fs.copyFileSync(files[slot], path.join(dir, `${slot}${ext}`));
    }
    const s = Number(scale) > 0 ? Math.max(0.2, Math.min(4, Number(scale))) : 1;
    const cfg = { name: display };
    const p = String(personality || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 600);
    if (p) cfg.personality = p;
    if (files.sheet) cfg.sheet = { scale: s };
    else cfg.scale = s;
    if (files['ultimate-sheet']) cfg.ultimateSheet = { scale: s };
    writeJson(path.join(dir, 'character.json'), cfg);
    writeJson(path.join(dir, 'quips.json'), { quips: quips || [] });
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw e;
  }
  return id;
}

// ---- pack import: a folder or .zip containing character.json ----
function runPowerShell(script, env) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
    env: { ...process.env, ...env }, windowsHide: true, encoding: 'utf8', timeout: 120000,
  });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'PowerShell failed').trim().split('\n').slice(-1)[0]);
  return r.stdout;
}

// Extract only allowed file names (by base name) from a zip into dest.
const UNZIP = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($env:TB_ZIP)
try {
  foreach ($e in $zip.Entries) {
    $name = [System.IO.Path]::GetFileName($e.FullName)
    if ($name -notmatch '${PACK_FILE_RE.source.replace(/'/g, "''")}') { continue }
    if ($e.Length -gt ${MAX_IMAGE}) { throw "$name is too large" }
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($e, (Join-Path $env:TB_DEST $name), $true)
  }
} finally { $zip.Dispose() }
`;

function importPack(projectRoot, source) {
  const root = charactersRoot(projectRoot);
  let srcDir = source;
  let tmp = null;
  const st = fs.lstatSync(source);
  if (st.isFile()) {
    if (!/\.zip$/i.test(source)) throw new Error('A character pack is a folder or a .zip file.');
    checkFile(source, 200 * 1024 * 1024);
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'toshibuddy-pack-'));
    runPowerShell(UNZIP, { TB_ZIP: source, TB_DEST: tmp });
    srcDir = tmp;
  } else if (!st.isDirectory()) {
    throw new Error('A character pack is a folder or a .zip file.');
  } else if (!fs.existsSync(path.join(srcDir, 'character.json'))) {
    // Allow a folder that wraps the pack in one subfolder.
    const subs = fs.readdirSync(srcDir, { withFileTypes: true }).filter((d) => d.isDirectory());
    const inner = subs.find((d) => fs.existsSync(path.join(srcDir, d.name, 'character.json')));
    if (inner) srcDir = path.join(srcDir, inner.name);
  }
  try {
    const cfgFile = path.join(srcDir, 'character.json');
    if (!fs.existsSync(cfgFile)) throw new Error('No character.json found in the pack.');
    checkFile(cfgFile, MAX_JSON);
    const cfg = cleanConfig(readJson(cfgFile));
    if (!cfg.name) cfg.name = path.basename(source).replace(/\.zip$/i, '');
    const names = fs.readdirSync(srcDir).filter((f) => PACK_FILE_RE.test(f));
    const images = names.filter((f) => IMG_RE.test(f));
    if (!images.some((f) => /^(sheet|skin)\./i.test(f))) throw new Error('The pack needs a sheet or skin image.');
    for (const f of images) checkImage(path.join(srcDir, f));
    const quips = names.some((f) => /^quips\.json$/i.test(f)) ? readQuipsFile(path.join(srcDir, names.find((f) => /^quips\.json$/i.test(f)))) : [];

    fs.mkdirSync(root, { recursive: true });
    const id = uniqueId(root, cfg.name);
    const dir = path.join(root, id);
    fs.mkdirSync(dir);
    try {
      for (const f of images) {
        const base = f.toLowerCase().replace('.jpeg', '.jpg');
        fs.copyFileSync(path.join(srcDir, f), path.join(dir, base));
      }
      writeJson(path.join(dir, 'character.json'), cfg);
      writeJson(path.join(dir, 'quips.json'), { quips });
    } catch (e) {
      fs.rmSync(dir, { recursive: true, force: true });
      throw e;
    }
    return id;
  } finally {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---- export: zip the pack's own files (not the regenerated previews) ----
const ZIP = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path -LiteralPath $env:TB_ZIP) { Remove-Item -LiteralPath $env:TB_ZIP -Force }
$zip = [System.IO.Compression.ZipFile]::Open($env:TB_ZIP, 'Create')
try {
  foreach ($f in ($env:TB_FILES -split '\\|')) {
    if (-not $f) { continue }
    [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $env:TB_SRC $f), $f)
  }
} finally { $zip.Dispose() }
`;

function exportPack(projectRoot, id, destZip) {
  if (!ID_RE.test(id)) throw new Error('Unknown character.');
  const dir = path.join(charactersRoot(projectRoot), id);
  if (!fs.existsSync(path.join(dir, 'character.json'))) throw new Error('That character has no character.json.');
  const files = fs.readdirSync(dir).filter((f) => PACK_FILE_RE.test(f));
  runPowerShell(ZIP, { TB_ZIP: destZip, TB_SRC: dir, TB_FILES: files.join('|') });
  return files;
}

// ---- edits from the animation mapper ----
function saveCharacter(projectRoot, id, patch) {
  if (!ID_RE.test(id)) throw new Error('Unknown character.');
  const file = path.join(charactersRoot(projectRoot), id, 'character.json');
  if (!fs.existsSync(file)) throw new Error('That character has no character.json.');
  const cfg = readJson(file);
  if (cfg.builtin) throw new Error('The built-in test character has no sprite sheet to map.');
  if (typeof patch.personality === 'string') {
    const p = patch.personality.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 600);
    if (p) cfg.personality = p; else delete cfg.personality;
  }
  for (const kind of ['sheet', 'ultimateSheet']) {
    const p = patch[kind];
    if (!p) continue;
    cfg[kind] = cfg[kind] || {};
    if (p.animations) cfg[kind].animations = cleanAnimations(p.animations);
    if (cleanRows(p.rows)) cfg[kind].rows = cleanRows(p.rows);
    if (Number.isFinite(Number(p.scale)) && Number(p.scale) > 0) cfg[kind].scale = Math.max(0.2, Math.min(4, Number(p.scale)));
  }
  writeJson(file, cfg);
  return cfg;
}

module.exports = { importFiles, importPack, exportPack, saveCharacter, cleanConfig, cleanAnimations, readQuipsFile, slug, ANIM_KEYS, PACK_FILE_RE };
