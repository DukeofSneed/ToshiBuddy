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
    const primary = byBase('skin') || files.find((f) => !/^ultimate\./i.test(f));
    if (!primary) continue;
    const ultimate = byBase('ultimate');
    let config = {};
    try { config = JSON.parse(fs.readFileSync(path.join(folder, 'skin.json'), 'utf8')); } catch (_) { /* optional */ }
    out.push({
      name: e.name,
      url: fileUrl(path.join(folder, primary)),
      config,
      ultimate: ultimate ? { url: fileUrl(path.join(folder, ultimate)), config: config.ultimate || {} } : null,
    });
  }
  return out;
}

module.exports = { listMods, readQuipPacks, listSkins, skinsRoot };
