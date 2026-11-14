'use strict';
// Pictures the user attaches to an upgrade goal. Two kinds:
//   asset     - the picture itself becomes a prop (a photo on the desk). It is
//               copied into the mod's own folder and shown as-is; nothing is redrawn.
//   reference - something for the upgrade run to look at; removed after the run.
// Originals are kept in userData/attachments/<goalId>/ (never in the project),
// validated like character images: real image files only, size-capped, with a
// safe generated file name. Attaching a picture means it is shown to Claude when
// that goal is built; the jar panel says so.
const fs = require('fs');
const path = require('path');

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PER_GOAL = 3;
const EXT_RE = /\.(png|webp|gif|jpe?g)$/i;
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,39}\.(png|webp|gif|jpg)$/;
const GOAL_RE = /^[a-z0-9]{4,40}$/i;
const USES = ['asset', 'reference'];

function kindOf(file) {
  const fd = fs.openSync(file, 'r');
  const head = Buffer.alloc(12);
  try { fs.readSync(fd, head, 0, 12, 0); } finally { fs.closeSync(fd); }
  if (head.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (head[0] === 0xff && head[1] === 0xd8) return 'jpg';
  if (head.slice(0, 3).toString('ascii') === 'GIF') return 'gif';
  if (head.slice(0, 4).toString('ascii') === 'RIFF' && head.slice(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

function goalDir(userData, goalId) {
  if (!GOAL_RE.test(String(goalId))) throw new Error('bad goal id');
  return path.join(userData, 'attachments', String(goalId));
}

// Copy a picked file in. sizeOf(file) -> { width, height } (Electron's nativeImage in the app).
function add({ userData, goal, source, use, sizeOf }) {
  if (!USES.includes(use)) throw new Error('Choose how the picture is used.');
  const list = Array.isArray(goal.attachments) ? goal.attachments : [];
  if (list.length >= MAX_PER_GOAL) throw new Error(`A goal can have up to ${MAX_PER_GOAL} pictures.`);
  if (!EXT_RE.test(source)) throw new Error('Pictures must be PNG, WebP, GIF, or JPG.');
  const st = fs.lstatSync(source);
  if (!st.isFile()) throw new Error('That is not a file.');
  if (st.size > MAX_BYTES) throw new Error(`The picture is larger than ${MAX_BYTES / 1048576} MB.`);
  const kind = kindOf(source);
  if (!kind) throw new Error('That file is not a valid image.');
  const base = path.basename(source).replace(EXT_RE, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'picture';
  let name = `${base}.${kind}`;
  for (let i = 2; list.some((a) => a.file === name); i++) name = `${base}-${i}.${kind}`;
  const dir = goalDir(userData, goal.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(source, path.join(dir, name));
  let size = { width: 0, height: 0 };
  try { size = sizeOf ? sizeOf(path.join(dir, name)) : size; } catch (_) { /* size is a hint only */ }
  if (sizeOf && !(size.width > 0 && size.height > 0)) { fs.rmSync(path.join(dir, name), { force: true }); throw new Error('That picture could not be opened.'); }
  const entry = { file: name, use, width: size.width || 0, height: size.height || 0, bytes: st.size };
  goal.attachments = [...list, entry];
  return entry;
}

function remove({ userData, goal, file }) {
  const list = Array.isArray(goal.attachments) ? goal.attachments : [];
  if (!list.some((a) => a.file === file)) return false;
  goal.attachments = list.filter((a) => a.file !== file);
  if (NAME_RE.test(file)) fs.rmSync(path.join(goalDir(userData, goal.id), file), { force: true });
  return true;
}

function removeAll(userData, goalId) {
  try { fs.rmSync(goalDir(userData, goalId), { recursive: true, force: true }); } catch (_) { /* nothing stored */ }
}

// The goal's pictures that are still on disk and still valid.
function usable(userData, goal) {
  const out = [];
  for (const a of Array.isArray(goal.attachments) ? goal.attachments : []) {
    if (!a || !NAME_RE.test(String(a.file)) || !USES.includes(a.use)) continue;
    const src = path.join(goalDir(userData, goal.id), a.file);
    try { if (fs.statSync(src).size <= MAX_BYTES && kindOf(src)) out.push({ ...a, src }); } catch (_) { /* missing */ }
  }
  return out.slice(0, MAX_PER_GOAL);
}

// Before a run: put the pictures where the run may read them. Returns what was
// placed, with project-relative paths for the prompt.
function place({ userData, projectRoot, goal, slug }) {
  const placed = [];
  for (const a of usable(userData, goal)) {
    const sub = a.use === 'asset' ? 'assets' : 'reference';
    const dir = path.join(projectRoot, 'mods', slug, sub);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(a.src, path.join(dir, a.file));
    placed.push({ file: a.file, use: a.use, width: a.width, height: a.height, rel: `mods/${slug}/${sub}/${a.file}` });
  }
  return placed;
}

// After a run, before the audit: reference pictures never stay in the project,
// and asset pictures stay only if the run actually wrote the mod.
function tidy({ projectRoot, slug }) {
  const dir = path.join(projectRoot, 'mods', slug);
  try { fs.rmSync(path.join(dir, 'reference'), { recursive: true, force: true }); } catch (_) { /* none */ }
  if (!fs.existsSync(path.join(dir, 'mod.js'))) {
    try { fs.rmSync(path.join(dir, 'assets'), { recursive: true, force: true }); } catch (_) { /* none */ }
    try { if (fs.existsSync(dir) && !fs.readdirSync(dir).length) fs.rmdirSync(dir); } catch (_) { /* not empty */ }
  }
}

// Lines for the upgrade prompt.
function promptLines(placed) {
  if (!placed.length) return [];
  const dims = (p) => (p.width && p.height ? ` (${p.width}x${p.height} pixels)` : '');
  const lines = ['- The human attached pictures for this upgrade. Look at each one with the Read tool before writing the mod:'];
  for (const p of placed) {
    lines.push(p.use === 'asset'
      ? `  - ${p.rel}${dims(p)}: USE THIS PICTURE ITSELF as a prop, through props[].image with file "${p.file}" (see "Picture props" in docs/MOD_API.md). Do not redraw, trace, or replace it with shapes; you may draw a simple frame or stand around it. Choose a size that keeps its proportions.`
      : `  - ${p.rel}${dims(p)}: reference only, to understand what is wanted (shape, colours, mood). It is deleted after this run, so the mod must not use this file.`);
  }
  lines.push('  Do not modify, move, or delete these files, and do not describe a picture in the character\'s lines unless the request asks for that.');
  return lines;
}

// One line for the pricing prompt (the pictures themselves are not sent for pricing).
function pricingLine(goalOrList) {
  const list = Array.isArray(goalOrList) ? goalOrList : (goalOrList && goalOrList.attachments) || [];
  const assets = list.filter((a) => a.use === 'asset').length;
  const refs = list.filter((a) => a.use === 'reference').length;
  if (!assets && !refs) return '';
  const parts = [];
  if (assets) parts.push(`${assets} picture${assets === 1 ? '' : 's'} to be shown as-is as a prop (the Mod API's picture props; no drawing needed for it)`);
  if (refs) parts.push(`${refs} reference picture${refs === 1 ? '' : 's'} to look at`);
  return `The human attached ${parts.join(' and ')}. Showing an attached picture as a prop is feasible and cheap.`;
}

module.exports = { add, remove, removeAll, usable, place, tidy, promptLines, pricingLine, kindOf, MAX_BYTES, MAX_PER_GOAL, NAME_RE, USES };
