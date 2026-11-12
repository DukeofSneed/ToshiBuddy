'use strict';
// Lists installed mods (mods/<slug>/mod.js) for the renderer to load.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

// JSON files people edit by hand on Windows often start with a byte-order mark.
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function listMods(projectRoot, disabled = []) {
  const dir = path.join(projectRoot, 'mods');
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return []; }
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const file = path.join(dir, e.name, 'mod.js');
    if (!fs.existsSync(file)) continue;
    out.push({
      slug: e.name,
      url: pathToFileURL(file).href + `?v=${fs.statSync(file).mtimeMs}`,
      enabled: !disabled.includes(e.name),
    });
  }
  return out;
}

// A quip pack is an array, or { quips: [...] }. Entries are strings or
// { id?, text, tags?, weight?, cooldown? (seconds), priority? }.
function parseQuipList(data, pack) {
  const list = Array.isArray(data) ? data : (data && data.quips) || [];
  const out = [];
  for (const q of list) {
    if (typeof q === 'string') { out.push({ text: q, tags: ['idle'], pack }); continue; }
    if (!q || !q.text) continue;
    const e = { text: String(q.text), tags: Array.isArray(q.tags) && q.tags.length ? q.tags.map(String) : ['idle'], weight: Number(q.weight) || 1, pack };
    if (q.id) e.id = String(q.id);
    if (Number.isFinite(Number(q.cooldown))) e.cooldown = Number(q.cooldown);
    if (Number.isFinite(Number(q.priority))) e.priority = Number(q.priority);
    out.push(e);
  }
  return out;
}

// content/quips/*.json: quip packs added by upgrades. They apply to every character.
function readQuipPacks(projectRoot) {
  const dir = path.join(projectRoot, 'content', 'quips');
  const quips = [];
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')); } catch (_) { return quips; }
  for (const f of files) {
    try { quips.push(...parseQuipList(readJson(path.join(dir, f)), f)); } catch (e) { console.error(`quips: bad pack ${f}: ${e.message}`); }
  }
  return quips;
}

// Character packs: characters/<id>/ holding character.json (name, personality,
// layout, sheet mapping; see characters/README.md), quips.json, and images:
// sheet.<ext> / ultimate-sheet.<ext> (sprite sheets), skin.<ext> / ultimate.<ext>
// (still images). A pack with "builtin": "kori" is the drawn test character.
const IMG_RE = /.(png|webp|gif|jpe?g)$/i;
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

function fileUrl(file) {
  return pathToFileURL(file).href + `?v=${fs.statSync(file).mtimeMs}`;
}

function charactersRoot(projectRoot) {
  return process.env.TOSHI_CHARACTERS_DIR || path.join(projectRoot, 'characters');
}

function readCharacterConfig(folder) {
  for (const name of ['character.json', 'skin.json']) {
    try { return readJson(path.join(folder, name)); } catch (_) { /* try the next */ }
  }
  return {};
}

// The list is read from disk once and reused; invalidateCharacters() after an
// import, a mapper save, or a reload (the only times packs change on disk).
let charactersCache = null;
function invalidateCharacters() { charactersCache = null; }

function listCharacters(projectRoot) {
  const dir = charactersRoot(projectRoot);
  if (charactersCache && charactersCache.dir === dir) return charactersCache.list;
  const list = scanCharacters(dir);
  charactersCache = { dir, list };
  return list;
}

function scanCharacters(dir) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return []; }
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory() || !ID_RE.test(e.name)) continue;
    const folder = path.join(dir, e.name);
    const config = readCharacterConfig(folder);
    const base = {
      name: e.name, // the pack id (folder name)
      displayName: String(config.name || e.name).slice(0, 40),
      test: !!config.test,
      builtin: config.builtin === 'kori' ? 'kori' : null,
      config,
    };
    if (base.builtin) { out.push(base); continue; }
    let files = [];
    try { files = fs.readdirSync(folder).filter((f) => IMG_RE.test(f)); } catch (_) { continue; }
    const byBase = (b) => files.find((f) => f.toLowerCase().replace(IMG_RE, '') === b);
    const special = (f) => /^ultimate./i.test(f) || /sheet/i.test(f) || /-index.png$/i.test(f);
    const primary = byBase('skin') || files.find((f) => !special(f));
    const sheet = byBase('sheet');
    const ultimateSheet = byBase('ultimate-sheet');
    if (!primary && !sheet) continue;
    const ultimate = byBase('ultimate');
    out.push({
      ...base,
      url: primary ? fileUrl(path.join(folder, primary)) : null,
      ultimate: ultimate ? { url: fileUrl(path.join(folder, ultimate)), config: config.ultimate || {} } : null,
      sheet: sheet ? { url: fileUrl(path.join(folder, sheet)), config: config.sheet || {} } : null,
      ultimateSheet: ultimateSheet ? { url: fileUrl(path.join(folder, ultimateSheet)), config: config.ultimateSheet || {} } : null,
    });
  }
  // Regular characters first, test characters last.
  return out.sort((a, b) => (a.test - b.test) || a.displayName.localeCompare(b.displayName));
}

// A character's own dialogue: characters/<id>/quips.json. Used only by the pet
// itself; never sent to upgrade runs.
function readCharacterDialogue(projectRoot, id) {
  if (!id || !ID_RE.test(id)) return null;
  const file = path.join(charactersRoot(projectRoot), id, 'quips.json');
  if (!fs.existsSync(file)) return null;
  try {
    return { quips: parseQuipList(readJson(file), `character:${id}`) };
  } catch (e) {
    console.error(`quips: bad dialogue for ${id}: ${e.message}`);
    return null;
  }
}

module.exports = { listMods, readQuipPacks, readCharacterDialogue, readCharacterConfig, parseQuipList, listCharacters, invalidateCharacters, charactersRoot, readJson, ID_RE, IMG_RE };
