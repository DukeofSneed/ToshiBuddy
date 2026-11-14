'use strict';
// Checks a character's animation map against the poses found on its sheet, and
// guesses a map for a new sheet. Works on row counts only (how many poses each
// row has); it never looks at the image.

const ANIM_KEYS = ['idle', 'blink', 'walk', 'talk', 'sleep', 'drag', 'fall', 'land', 'lean', 'desk', 'working', 'scribbling',
  'think', 'surprised', 'huff', 'shrug', 'wave', 'frost', 'release', 'stamp'];
const DEFAULT_FPS = { idle: 3, walk: 9, talk: 6 };

// "1:0-5,0:3-1" -> [{ row, col }]. Same grammar as parseFrames in sheet.js.
function cellsOf(spec, defaultRow) {
  const out = [];
  for (let it of String(spec == null ? '' : spec).split(',')) {
    it = it.trim();
    if (!it) continue;
    let row = Number(defaultRow) || 0;
    let part = it;
    if (it.includes(':')) { const [a, b] = it.split(':'); row = Number(a); part = b; }
    let [a, b] = part.split('-').map(Number);
    if (!Number.isFinite(a)) continue;
    if (!Number.isFinite(b)) b = a;
    const step = a <= b ? 1 : -1;
    for (let c = a; step > 0 ? c <= b : c >= b; c += step) out.push({ row, col: c });
    if (out.length > 500) break;
  }
  return out;
}

function cellsOfAnim(d, rows) {
  if (d.frames == null || d.frames === '') {
    const row = Number(d.row) || 0;
    return cellsOf(`0-${Math.max(0, ((rows && rows[row]) || 1) - 1)}`, row);
  }
  return cellsOf(d.frames, d.row);
}

const exists = (rows, c) => Number.isInteger(c.row) && Number.isInteger(c.col) && c.row >= 0 && c.col >= 0 && c.row < rows.length && c.col < rows[c.row];

function checkSheet(sheetCfg, rows, label, near = [], kind = 'sheet') {
  const items = [];
  const add = (level, text, extra) => items.push({ level, text: label ? `${label}: ${text}` : text, ...(extra || {}) });
  const anims = (sheetCfg && sheetCfg.animations) || {};
  const keys = Object.keys(anims);
  if (!keys.length) { add('error', 'no animations are mapped yet (use Auto-map)'); return items; }
  if (!anims.idle) add('error', 'idle is not mapped; every unmapped animation falls back to it');
  for (const k of ['walk', 'talk']) if (!anims[k]) add('warn', `${k} is not mapped, so the idle pose is shown instead`);
  if (!rows || !rows.length) add('warn', 'the poses have not been counted yet; make this the active character once, then check again');
  let good = 0;
  for (const k of keys) {
    const d = anims[k] || {};
    const cells = cellsOfAnim(d, rows);
    if (!cells.length) { add('error', `${k}: "${d.frames}" has no frames`); continue; }
    if (d.fps != null && !(Number(d.fps) >= 0.2 && Number(d.fps) <= 30)) add('warn', `${k}: fps ${d.fps} is outside 0.2 to 30`);
    if (Number(d.loopFrom) >= cells.length) add('warn', `${k}: "loop from" ${d.loopFrom} is past its last frame`);
    if (rows && rows.length) {
      const missing = cells.filter((c) => !exists(rows, c));
      if (missing.length === cells.length) { add('error', `${k}: none of its frames exist on the sheet (${d.frames})`); continue; }
      if (missing.length) add('warn', `${k}: ${missing.length} of ${cells.length} frames don't exist: ${[...new Set(missing.map((c) => `${c.row}:${c.col}`))].slice(0, 6).join(', ')}`);
    }
    good++;
  }
  if (good) add('ok', `${good} animation${good === 1 ? '' : 's'} mapped`);
  // A mark ("?", "!", a swirl) drawn about as close to the pose next door: it
  // may be showing on the wrong pose. Only for poses that are actually used.
  const used = new Set(keys.flatMap((k) => cellsOfAnim(anims[k] || {}, rows).map((c) => `${c.row}:${c.col}`)));
  // Pairs the user looked at and marked as fine (marksOk), or already moved, are not repeated.
  const same = (p, n) => Array.isArray(p) && ((String(p[0]) === n.from && String(p[1]) === n.near) || (String(p[0]) === n.near && String(p[1]) === n.from));
  const settled = (n) => [...((sheetCfg && sheetCfg.marksOk) || []), ...((sheetCfg && sheetCfg.moveMarks) || [])].some((p) => same(p, n));
  for (const n of Array.isArray(near) ? near : []) {
    if (!n || settled(n) || !(used.has(n.from) || used.has(n.near))) continue;
    add('warn', `a mark beside pose ${n.from} sits about as close to pose ${n.near}. Look at both in Preview all; if it shows on the wrong one, add a move from ${n.from} to ${n.near} under "Marks on the wrong pose"`, { pair: { kind, from: n.from, near: n.near } });
  }
  const unmapped = ANIM_KEYS.filter((k) => !anims[k] && !['idle', 'walk', 'talk'].includes(k));
  if (unmapped.length) add('info', `shown as idle: ${unmapped.join(', ')}`);
  return items;
}

// config: character.json. rows: { sheet: [..], ultimateSheet: [..] }.
function checkCharacter(config, { rows = {}, near = {}, quipCount = null, hasSheet = true, hasUltimateSheet = false } = {}) {
  const items = [];
  if (!config.personality) items.push({ level: 'warn', text: 'no personality text: upgrades and replies use a generic voice' });
  if (quipCount === 0) items.push({ level: 'warn', text: 'no lines: the character will not say anything' });
  else if (quipCount) items.push({ level: 'ok', text: `${quipCount} line${quipCount === 1 ? '' : 's'}` });
  if (hasSheet) items.push(...checkSheet(config.sheet, rows.sheet, hasUltimateSheet ? 'Main sheet' : '', near.sheet, 'sheet'));
  else items.push({ level: 'info', text: 'no sprite sheet: shown as a still image' });
  if (hasUltimateSheet) items.push(...checkSheet(config.ultimateSheet, rows.ultimateSheet, 'Ultimate sheet', near.ultimateSheet, 'ultimateSheet'));
  const errors = items.filter((i) => i.level === 'error').length;
  const warnings = items.filter((i) => i.level === 'warn').length;
  return { ok: errors === 0, errors, warnings, items };
}

// Keep an animation map's frames that exist on a sheet with these row counts.
function clip(animations, rows) {
  const out = {};
  for (const [k, d] of Object.entries(animations || {})) {
    if (!d || k.startsWith('anim-')) continue;
    const cells = cellsOfAnim(d, rows);
    const kept = cells.filter((c) => exists(rows, c));
    if (!kept.length) continue;
    const a = { ...d };
    delete a.row;
    a.frames = kept.length === cells.length && d.frames != null && d.frames !== '' ? String(d.frames) : kept.map((c) => `${c.row}:${c.col}`).join(',');
    if (Number(a.loopFrom) >= kept.length) delete a.loopFrom;
    out[k] = a;
  }
  return out;
}

// A first guess for a sheet nobody has mapped: idle from the start of row 0,
// walk from the longest run left over, talk from the last row.
function guess(rows) {
  const out = {};
  const n0 = rows[0] || 0;
  if (!n0) return out;
  const idleN = Math.min(4, n0);
  out.idle = { frames: idleN >= 3 ? `0:0-${idleN - 1},0:${idleN - 2}-1` : `0:0-${idleN - 1}`, fps: DEFAULT_FPS.idle };
  const rest0 = n0 - idleN;
  let walk = rest0 >= 4 ? { row: 0, from: idleN, to: n0 - 1 } : null;
  for (let r = 1; r < rows.length - (rows.length >= 3 ? 1 : 0); r++) {
    if (rows[r] >= 4 && (!walk || rows[r] > walk.to - walk.from + 1)) walk = { row: r, from: 0, to: rows[r] - 1 };
  }
  if (walk) out.walk = { frames: `${walk.row}:${walk.from}-${walk.to}`, fps: DEFAULT_FPS.walk };
  const last = rows.length - 1;
  if (rows.length >= 3 && rows[last] >= 2) out.talk = { frames: `${last}:0-${Math.min(4, rows[last]) - 1}`, fps: DEFAULT_FPS.talk };
  return out;
}

// templates: [{ id, name, rows, animations }] from characters that are already
// mapped. A sheet with the same number of rows and nearly the same pose counts
// gets that character's map; anything else gets a guess.
function autoMap(rows, templates = [], { from = null } = {}) {
  rows = (rows || []).map((n) => Math.max(0, Math.floor(Number(n) || 0)));
  if (!rows.length) return { animations: {}, source: null, guessed: false };
  const usable = templates.filter((t) => t && Array.isArray(t.rows) && t.rows.length && t.animations && Object.keys(t.animations).length);
  let pick = from ? usable.find((t) => t.id === from) : null;
  if (!pick && !from) {
    const scored = usable.filter((t) => t.rows.length === rows.length)
      .map((t) => ({ t, d: t.rows.reduce((s, n, i) => s + Math.abs(n - rows[i]), 0) }))
      .sort((a, b) => a.d - b.d);
    if (scored.length && scored[0].d <= rows.length * 2) pick = scored[0].t;
  }
  if (pick) {
    const animations = clip(pick.animations, rows);
    if (animations.idle) return { animations, source: pick.id, sourceName: pick.name || pick.id, guessed: false };
  }
  return { animations: guess(rows), source: null, guessed: true };
}

module.exports = { checkCharacter, checkSheet, autoMap, clip, guess, cellsOf, ANIM_KEYS };
