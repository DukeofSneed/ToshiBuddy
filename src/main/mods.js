'use strict';
// Lists installed mods (mods/<slug>/mod.js) for the renderer to load.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

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
      const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const list = Array.isArray(data) ? data : data.quips || [];
      for (const q of list) {
        if (typeof q === 'string') quips.push({ text: q, tags: ['idle'], pack: f });
        else if (q && q.text) quips.push({ text: q.text, tags: q.tags || ['idle'], weight: q.weight || 1, pack: f });
      }
    } catch (e) { console.error(`quips: bad pack ${f}: ${e.message}`); }
  }
  return quips;
}

// User skins: skins/<name>/ with an image (skin.png, or the first .png/.webp/.gif)
// and an optional skin.json { scale, offsetX, offsetY, keyColor, keyTolerance }.
function listSkins(projectRoot) {
  const dir = path.join(projectRoot, 'skins');
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return []; }
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const folder = path.join(dir, e.name);
    let files = [];
    try { files = fs.readdirSync(folder); } catch (_) { continue; }
    const img = files.includes('skin.png') ? 'skin.png' : files.find((f) => /\.(png|webp|gif)$/i.test(f));
    if (!img) continue;
    let config = {};
    try { config = JSON.parse(fs.readFileSync(path.join(folder, 'skin.json'), 'utf8')); } catch (_) { /* optional */ }
    const file = path.join(folder, img);
    out.push({ name: e.name, url: pathToFileURL(file).href + `?v=${fs.statSync(file).mtimeMs}`, config });
  }
  return out;
}

module.exports = { listMods, readQuipPacks, listSkins };
