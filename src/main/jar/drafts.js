'use strict';
// What the owner has typed or picked in the jar but not yet turned into a goal
// or a note: the suggestion text, half-written notes per goal, and pictures
// picked with a suggestion. Kept in userData so closing the jar, a failed
// estimate, a failed build, or a restart never loses them.
//   drafts.json              { suggest, comments: { <goalId>: text }, pending: [{ file, use, name }] }
//   pending-pictures/<file>  copies of pictures picked before the goal exists
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_TEXT = 600;
const MAX_NOTE = 500;
const GOAL_RE = /^[a-z0-9]{4,40}$/i;
const FILE_RE = /^p-[a-f0-9]{12}\.(png|webp|gif|jpg)$/;

class Drafts {
  constructor(userData) {
    this.file = path.join(userData, 'drafts.json');
    this.dir = path.join(userData, 'pending-pictures');
    this.data = { suggest: '', comments: {}, pending: [] };
    try {
      const d = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (typeof d.suggest === 'string') this.data.suggest = d.suggest.slice(0, MAX_TEXT);
      if (d.comments && typeof d.comments === 'object') {
        for (const [k, v] of Object.entries(d.comments)) if (GOAL_RE.test(k) && typeof v === 'string') this.data.comments[k] = v.slice(0, MAX_NOTE);
      }
      if (Array.isArray(d.pending)) this.data.pending = d.pending.filter((p) => p && FILE_RE.test(String(p.file)) && ['asset', 'reference'].includes(p.use) && fs.existsSync(path.join(this.dir, p.file))).slice(0, 3);
    } catch (_) { /* none yet, or damaged: start empty */ }
  }
  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.data, null, 1));
      fs.renameSync(this.file + '.tmp', this.file);
    } catch (_) { /* disk trouble: drafts stay in memory for this session */ }
  }
  view() { return { suggest: this.data.suggest, comments: { ...this.data.comments }, pending: this.pendingView() }; }
  setSuggest(text) { this.data.suggest = String(text || '').slice(0, MAX_TEXT); this.save(); }
  setComment(goalId, text) {
    if (!GOAL_RE.test(String(goalId))) return;
    const t = String(text || '').slice(0, MAX_NOTE);
    if (t) this.data.comments[goalId] = t; else delete this.data.comments[goalId];
    this.save();
  }
  // Drop half-written notes for goals that no longer exist.
  prune(goalIds) {
    const keep = new Set(goalIds);
    let changed = false;
    for (const k of Object.keys(this.data.comments)) if (!keep.has(k)) { delete this.data.comments[k]; changed = true; }
    if (changed) this.save();
  }
  // ---- pictures picked with a suggestion ----
  pendingView() { return this.data.pending.map((p) => ({ name: p.name, use: p.use })); }
  pendingFiles() { return this.data.pending.map((p) => ({ ...p, source: path.join(this.dir, p.file) })); }
  // source has already been validated (real image, size cap) by the caller.
  addPending(source, use, ext) {
    fs.mkdirSync(this.dir, { recursive: true });
    const file = `p-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    fs.copyFileSync(source, path.join(this.dir, file));
    this.data.pending.push({ file, use, name: path.basename(source).slice(0, 60) });
    this.save();
  }
  removePending(i) {
    const p = this.data.pending[i];
    if (!p) return;
    try { fs.rmSync(path.join(this.dir, p.file), { force: true }); } catch (_) { /* gone */ }
    this.data.pending.splice(i, 1);
    this.save();
  }
  clearPending() {
    for (const p of this.data.pending) { try { fs.rmSync(path.join(this.dir, p.file), { force: true }); } catch (_) { /* gone */ } }
    this.data.pending = [];
    this.save();
  }
}

module.exports = { Drafts, MAX_NOTE };
