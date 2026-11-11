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

module.exports = { listMods, readQuipPacks };
