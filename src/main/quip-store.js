'use strict';
// The user's own quip changes for one character, kept in userData so they never
// touch the repo (upgrade runs commit and revert content/ with git):
// quips-custom.json for Kori, quips-custom-<skin>.json for each skin.
//   added:  quips the user wrote             [{ id, text, tags }]
//   hidden: built-in quips the user removed  [key]
//   edits:  built-in quips the user changed  { key: { text, tags } }
// A built-in quip's key is "<pack file>|<original text>".
const fs = require('fs');
const path = require('path');

const TAG_RE = /^[a-z0-9][a-z0-9:_-]{0,29}$/;

function cleanText(text) {
  const t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  if (!t) throw new Error('A quip needs some text.');
  if (t.length > 240) throw new Error('Keep quips to 240 characters or fewer.');
  return t;
}
function cleanTags(tags) {
  const list = (Array.isArray(tags) ? tags : String(tags || '').split(','))
    .map((t) => String(t).trim().toLowerCase())
    .filter((t) => TAG_RE.test(t));
  const uniq = [...new Set(list)].slice(0, 10);
  return uniq.length ? uniq : ['idle'];
}

class QuipStore {
  constructor(userData, character = 'kori') {
    const safe = String(character).replace(/[^a-z0-9_-]/gi, '_').slice(0, 60);
    this.file = path.join(userData, safe === 'kori' ? 'quips-custom.json' : `quips-custom-${safe}.json`);
    this.data = { added: [], hidden: [], edits: {} };
    try {
      const d = JSON.parse(fs.readFileSync(this.file, 'utf8').replace(/^﻿/, ''));
      this.data.added = Array.isArray(d.added) ? d.added.filter((q) => q && q.id && q.text) : [];
      this.data.hidden = Array.isArray(d.hidden) ? d.hidden.filter((k) => typeof k === 'string') : [];
      this.data.edits = d.edits && typeof d.edits === 'object' ? d.edits : {};
    } catch (_) { /* first run */ }
  }

  save() {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  static key(q) { return `${q.pack}|${q.text}`; }

  // What the pet uses: packs with edits and removals applied, plus the user's own.
  merged(packQuips) {
    const hidden = new Set(this.data.hidden);
    const out = [];
    for (const q of packQuips) {
      const k = QuipStore.key(q);
      if (hidden.has(k)) continue;
      const e = this.data.edits[k];
      out.push(e ? { ...q, text: e.text, tags: e.tags } : q);
    }
    for (const q of this.data.added) out.push({ text: q.text, tags: q.tags, weight: 1, pack: 'custom' });
    return out;
  }

  // Everything, for the editor window.
  editorList(packQuips) {
    const hidden = new Set(this.data.hidden);
    const items = this.data.added.map((q) => ({ key: `c:${q.id}`, source: 'yours', text: q.text, tags: q.tags, removed: false, edited: false }));
    for (const q of packQuips) {
      const k = QuipStore.key(q);
      const e = this.data.edits[k];
      items.push({
        key: `p:${k}`,
        source: q.pack === 'base.json' ? 'built-in' : q.pack.startsWith('skin:') ? 'dialogue file' : q.pack.replace(/\.json$/, ''),
        text: e ? e.text : q.text,
        tags: e ? e.tags : q.tags,
        original: e ? q.text : undefined,
        edited: !!e,
        removed: hidden.has(k),
      });
    }
    return items;
  }

  add({ text, tags }) {
    const q = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, text: cleanText(text), tags: cleanTags(tags) };
    this.data.added.unshift(q);
    this.save();
    return q;
  }

  update(key, { text, tags }) {
    const t = cleanText(text), g = cleanTags(tags);
    if (key.startsWith('c:')) {
      const q = this.data.added.find((x) => `c:${x.id}` === key);
      if (!q) throw new Error('That quip no longer exists.');
      q.text = t; q.tags = g;
    } else if (key.startsWith('p:')) {
      this.data.edits[key.slice(2)] = { text: t, tags: g };
    } else throw new Error('Unknown quip.');
    this.save();
  }

  remove(key) {
    if (key.startsWith('c:')) {
      this.data.added = this.data.added.filter((x) => `c:${x.id}` !== key);
    } else if (key.startsWith('p:')) {
      const k = key.slice(2);
      if (!this.data.hidden.includes(k)) this.data.hidden.push(k);
    } else throw new Error('Unknown quip.');
    this.save();
  }

  // Bring back a removed built-in quip, or undo an edit to one.
  restore(key) {
    if (!key.startsWith('p:')) return;
    const k = key.slice(2);
    this.data.hidden = this.data.hidden.filter((x) => x !== k);
    delete this.data.edits[k];
    this.save();
  }
}

module.exports = { QuipStore, cleanTags, cleanText };
