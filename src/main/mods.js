'use strict';
// Lists installed mods (mods/<slug>/mod.js) for the renderer to load.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

// JSON files people edit by hand on Windows often start with a byte-order mark.
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
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

function readQuipPacks(projectRoot) {
  const dir = path.join(projectRoot, 'content', 'quips');
  const quips = [];
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')); } catch (_) { return quips; }
  for (const f of files) {
    try {
      const data = readJson(path.join(dir, f));
      const list = Array.isArray(data) ? data : data.quips || [];
      for (const q of list) {
        if (typeof q === 'string') quips.push({ text: q, tags: ['idle'], pack: f });
        else if (q && q.text) quips.push({ text: q.text, tags: q.tags || ['idle'], weight: q.weight || 1, pack: f });
      }
    } catch (e) { console.error(`quips: bad pack ${f}: ${e.message}`); }
  }
  return quips;
}

// User skins: skins/<name>/ with a primary image (skin.<ext>, or the first image
// not named ultimate.<ext>), an optional ultimate.<ext> shown for a while after a
// donation, and an optional skin.json (see skins/README.md).
const IMG_RE = /\.(png|webp|gif|jpe?g)$/i;

function fileUrl(file) {
  return pathToFileURL(file).href + `?v=${fs.statSync(file).mtimeMs}`;
}

function skinsRoot(projectRoot) {
  return process.env.ASKIN_SKINS_DIR || path.join(projectRoot, 'skins');
}

function listSkins(projectRoot) {
  const dir = skinsRoot(projectRoot);
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return []; }
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const folder = path.join(dir, e.name);
    let files = [];
    try { files = fs.readdirSync(folder).filter((f) => IMG_RE.test(f)); } catch (_) { continue; }
    const byBase = (base) => files.find((f) => f.toLowerCase().replace(IMG_RE, '') === base);
    // sheet.<ext> / ultimate-sheet.<ext> are sprite sheets; *-index.png are the
    // numbered previews the app writes next to them.
    const special = (f) => /^ultimate\./i.test(f) || /sheet/i.test(f) || /-index\.png$/i.test(f);
    const primary = byBase('skin') || files.find((f) => !special(f));
    const sheet = byBase('sheet');
    const ultimateSheet = byBase('ultimate-sheet');
    if (!primary && !sheet) continue;
    const ultimate = byBase('ultimate');
    let config = {};
    try { config = readJson(path.join(folder, 'skin.json')); } catch (_) { /* optional */ }
    out.push({
      name: e.name,
      url: primary ? fileUrl(path.join(folder, primary)) : null,
      config,
      ultimate: ultimate ? { url: fileUrl(path.join(folder, ultimate)), config: config.ultimate || {} } : null,
      sheet: sheet ? { url: fileUrl(path.join(folder, sheet)), config: config.sheet || {} } : null,
      ultimateSheet: ultimateSheet ? { url: fileUrl(path.join(folder, ultimateSheet)), config: config.ultimateSheet || {} } : null,
    });
  }
  return out;
}

module.exports = { listMods, readQuipPacks, listSkins, skinsRoot };
