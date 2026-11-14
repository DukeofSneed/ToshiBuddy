// Sprite-sheet skins.
//
// prepare(): loads a sheet (sheet.png / ultimate-sheet.png in a skin folder),
// removes the background, finds every drawn figure, groups the figures into rows
// (left to right, top to bottom), and cuts each into its own frame image.
// Small detached bits ("?", "!", sparkles) join the nearest figure.
//
// start(): plays frames on the skin's <image> elements. It watches the classes
// the brain puts on #pet (walk, sleep, talk, think, ...) and picks the
// animation configured for the most important one.
//
// skin.json:
//   "sheet": {
//     "scale": 1.0,                 // idle height relative to the pet (1.0 = 188 units)
//     "offsetX": 0, "offsetY": 0,
//     "keyTolerance": 12,           // background removal (see keyFlood)
//     "animations": {
//       "idle": { "row": 0, "frames": "0-4", "fps": 3 },
//       "walk": { "row": 1, "frames": "0-5", "fps": 9, "flip": true },
//       "think": { "frames": "3:2" , "loop": false }
//     }
//   },
//   "ultimateSheet": { ...same, used during the ultimate form }
//
// frames: "0-4", "0,1,2,1", "3:2" (row 3, frame 2), "1:0-5", or an array of
// those. flip: the frames face left, so mirror them (the pet faces right by
// default). loop: false holds the last frame. loopFrom: index to loop back to.
(function () {
  'use strict';

  // Most important first. anim-* (mod animations) are checked before these.
  const ORDER = [
    'release', 'frost', 'shrug', 'think', 'wave', 'surprised', 'huff', 'stamp', 'land',
    'drag', 'fall', 'sleep', 'walk', 'working', 'scribbling', 'talk', 'desk', 'lean', 'blink', 'idle',
  ];

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('sheet image failed to load'));
      i.src = url;
    });
  }

  // Background removal for sheets: flood from the border, spreading to a
  // neighbor whose color is within `tol` of the pixel it came from. That follows
  // gradients and vignettes in the background but stops at the line art.
  // keyMax (optional): a pixel must also be within keyMax of the background
  // color (the corner average). Use it when the character has colors close to
  // the background, like dark hair on black, so the fill can't creep into them.
  function keyFlood(px, w, h, tol, keyMax) {
    const n = w * h;
    const seen = new Uint8Array(n);
    const stack = new Int32Array(n);
    let sp = 0;
    const corners = [0, w - 1, (h - 1) * w, n - 1];
    const key = [0, 1, 2].map((c) => corners.reduce((s, p) => s + px[p * 4 + c], 0) / 4);
    const capped = Number(keyMax) > 0;
    const nearKey = (b) => !capped || (Math.abs(px[b * 4] - key[0]) <= keyMax
      && Math.abs(px[b * 4 + 1] - key[1]) <= keyMax && Math.abs(px[b * 4 + 2] - key[2]) <= keyMax);
    const near = (a, b) => Math.abs(px[a * 4] - px[b * 4]) <= tol
      && Math.abs(px[a * 4 + 1] - px[b * 4 + 1]) <= tol
      && Math.abs(px[a * 4 + 2] - px[b * 4 + 2]) <= tol
      && nearKey(b);
    const seed = (p) => { if (!seen[p]) { seen[p] = 1; stack[sp++] = p; } };
    for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
    while (sp) {
      const p = stack[--sp];
      const x = p % w;
      const tryq = (q) => { if (!seen[q] && near(p, q)) { seen[q] = 1; stack[sp++] = q; } };
      if (x > 0) tryq(p - 1);
      if (x < w - 1) tryq(p + 1);
      if (p >= w) tryq(p - w);
      if (p < n - w) tryq(p + w);
    }
    let cleared = 0;
    for (let p = 0; p < n; p++) if (seen[p]) { px[p * 4 + 3] = 0; cleared++; }
    // Soften the one-pixel rim left against the cleared area.
    for (let p = 0; p < n; p++) {
      if (seen[p]) continue;
      const x = p % w;
      const edge = (x > 0 && seen[p - 1]) || (x < w - 1 && seen[p + 1]) || (p >= w && seen[p - w]) || (p < n - w && seen[p + w]);
      if (edge) px[p * 4 + 3] = Math.min(px[p * 4 + 3], 170);
    }
    return cleared / n;
  }

  // Connected figures (8-neighbor) on the alpha mask.
  function components(px, w, h) {
    const n = w * h;
    const label = new Int32Array(n).fill(-1);
    const stack = new Int32Array(n);
    const comps = [];
    for (let s = 0; s < n; s++) {
      if (label[s] !== -1 || px[s * 4 + 3] < 100) continue;
      const id = comps.length;
      const c = { id, minx: w, miny: h, maxx: 0, maxy: 0, area: 0 };
      let sp = 0;
      stack[sp++] = s; label[s] = id;
      while (sp) {
        const p = stack[--sp];
        const x = p % w, y = (p / w) | 0;
        c.area++;
        if (x < c.minx) c.minx = x; if (x > c.maxx) c.maxx = x;
        if (y < c.miny) c.miny = y; if (y > c.maxy) c.maxy = y;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            const q = yy * w + xx;
            if (label[q] === -1 && px[q * 4 + 3] >= 100) { label[q] = id; stack[sp++] = q; }
          }
        }
      }
      comps.push(c);
    }
    return { label, comps };
  }

  const median = (arr) => { const a = arr.slice().sort((x, y) => x - y); return a.length ? a[a.length >> 1] : 0; };

  // Which detached pieces of a pose are marks ("?", "!", a swirl, "z z z") and
  // not part of the figure: small, up by the head, and beside or above the figure
  // (or, inside its outline box, clear of the body by a few pixels). They are
  // never mirrored. Anything else detached (a sword arc, dust, a hair fragment)
  // stays with the figure and mirrors with it. Pieces the user moved from another
  // pose (moveMarks) always count.
  //   fr: { main, bits }, label: per-pixel component ids, w: image width,
  //   medH: typical figure height, moved: Set of component ids.
  function findMarks(fr, label, w, medH, moved) {
    const m = fr.main;
    const midY = (m.miny + m.maxy) / 2;
    const GAP = 3;
    const clearOfBody = (c) => {
      for (let y = c.miny; y <= c.maxy; y++) {
        for (let x = c.minx; x <= c.maxx; x++) {
          if (label[y * w + x] !== c.id) continue;
          for (let dy = -GAP; dy <= GAP; dy++) {
            for (let dx = -GAP; dx <= GAP; dx++) {
              const xx = x + dx, q = (y + dy) * w + xx;
              if (xx < 0 || xx >= w || q < 0 || q >= label.length) continue;
              if (label[q] === m.id) return false;
            }
          }
        }
      }
      return true;
    };
    return (fr.bits || []).filter((c) => {
      if (moved && moved.has(c.id)) return true;
      const big = Math.max(c.maxx - c.minx + 1, c.maxy - c.miny + 1);
      if (big > medH * 0.25 || c.area < 30) return false;
      const cx = (c.minx + c.maxx) / 2, cy = (c.miny + c.maxy) / 2;
      if (cy > midY) return false;
      // Beside or above the figure: a mark. Inside the figure's outline box
      // (between hair spikes, say) it must also be clear of the body, or it is
      // just a loose fragment of the drawing.
      if (cx < m.minx || cx > m.maxx || cy < m.miny) return true;
      // Inside the box: a piece of real size (a swirl tucked beside the hair) is
      // a mark; a tiny one only if it stands clear of the body.
      return c.area >= 80 || clearOfBody(c);
    });
  }

  // Pieces that belong together (the hook and dot of "?", the strokes of a
  // swirl) form one mark, so it moves as one piece and keeps its shape.
  function groupMarks(pieces, gap) {
    const groups = pieces.map((c) => ({ ids: [c.id], minx: c.minx, miny: c.miny, maxx: c.maxx, maxy: c.maxy }));
    const apart = (a, b) => Math.max(a.minx - b.maxx, b.minx - a.maxx, a.miny - b.maxy, b.miny - a.maxy, 0);
    for (let merged = true; merged;) {
      merged = false;
      for (let i = 0; i < groups.length && !merged; i++) {
        for (let j = i + 1; j < groups.length; j++) {
          if (apart(groups[i], groups[j]) > gap) continue;
          const a = groups[i], b = groups[j];
          groups[i] = { ids: [...a.ids, ...b.ids], minx: Math.min(a.minx, b.minx), miny: Math.min(a.miny, b.miny), maxx: Math.max(a.maxx, b.maxx), maxy: Math.max(a.maxy, b.maxy) };
          groups.splice(j, 1);
          merged = true;
          break;
        }
      }
    }
    return groups;
  }

  // moveMarks: [["3:4", "3:3"], ...] moves the small detached bits ("?", "!")
  // that sit beside pose 3:4 over to pose 3:3, for sheets where a mark was
  // drawn closer to the neighboring pose than to its own.
  function detectFrames(px, w, h, moveMarks) {
    const { label, comps } = components(px, w, h);
    const sizable = comps.filter((c) => c.area >= w * h * 0.0015);
    const medArea = median(sizable.map((c) => c.area));
    const big = comps.filter((c) => c.area >= medArea * 0.3);
    const medH = median(big.map((c) => c.maxy - c.miny + 1));
    // Group figures into rows by vertical center.
    big.sort((a, b) => (a.miny + a.maxy) - (b.miny + b.maxy));
    const rows = [];
    for (const c of big) {
      const cy = (c.miny + c.maxy) / 2;
      let row = rows.find((r) => Math.abs(r.cy - cy) < medH * 0.45);
      if (!row) { row = { cy, items: [] }; rows.push(row); }
      row.items.push(c);
      row.cy = row.items.reduce((s, i) => s + (i.miny + i.maxy) / 2, 0) / row.items.length;
    }
    rows.sort((a, b) => a.cy - b.cy);
    for (const r of rows) r.items.sort((a, b) => a.minx - b.minx);
    // Each figure becomes a frame; small bits join the nearest figure.
    const frames = [];
    const frameOf = new Int32Array(comps.length).fill(-1);
    rows.forEach((r, ri) => r.items.forEach((c, ci) => {
      frameOf[c.id] = frames.length;
      frames.push({ row: ri, col: ci, main: c, minx: c.minx, miny: c.miny, maxx: c.maxx, maxy: c.maxy });
    }));
    const maxGap = medH * 0.35;
    // Marks that sit about as close to the pose next door as to their own: the
    // character check points these out, since they may belong to the other pose.
    let near = [];
    for (const c of comps) {
      if (frameOf[c.id] !== -1 || c.area < 25) continue;
      const cx = (c.minx + c.maxx) / 2, cy = (c.miny + c.maxy) / 2;
      let best = -1, bestD = Infinity, second = -1, secondD = Infinity;
      frames.forEach((f, i) => {
        const m = f.main;
        const dx = Math.max(m.minx - cx, 0, cx - m.maxx);
        const dy = Math.max(m.miny - cy, 0, cy - m.maxy);
        const d = Math.hypot(dx, dy);
        if (d < bestD) { second = best; secondD = bestD; bestD = d; best = i; }
        else if (d < secondD) { secondD = d; second = i; }
      });
      if (best < 0 || bestD > maxGap) continue;
      const own = frames[best].main;
      const beside = cx < own.minx || cx > own.maxx;
      if (beside && second >= 0 && frames[second].row === frames[best].row && secondD <= maxGap * 1.5 && secondD <= Math.max(bestD * 2, bestD + medH * 0.1) && c.area >= 60) {
        near.push({ from: `${frames[best].row}:${frames[best].col}`, near: `${frames[second].row}:${frames[second].col}` });
      }
      frameOf[c.id] = best;
      (frames[best].bits = frames[best].bits || []).push(c);
      const f = frames[best];
      f.minx = Math.min(f.minx, c.minx); f.miny = Math.min(f.miny, c.miny);
      f.maxx = Math.max(f.maxx, c.maxx); f.maxy = Math.max(f.maxy, c.maxy);
    }
    // Row baseline: where the feet are (median bottom of the main figures).
    const moved = new Set(); // pieces the user moved to another pose: always marks
    const at = (rc) => { const [r, c] = String(rc).split(':').map(Number); return frames.findIndex((fr) => fr.row === r && fr.col === c); };
    const refit = (fr) => {
      const all = [fr.main, ...(fr.bits || [])];
      fr.minx = Math.min(...all.map((c) => c.minx)); fr.miny = Math.min(...all.map((c) => c.miny));
      fr.maxx = Math.max(...all.map((c) => c.maxx)); fr.maxy = Math.max(...all.map((c) => c.maxy));
    };
    for (const pair of Array.isArray(moveMarks) ? moveMarks : []) {
      const from = at(pair[0]), to = at(pair[1]);
      if (from < 0 || to < 0 || from === to) continue;
      const src = frames[from], dst = frames[to];
      // Only bits beside the figure (center outside its body), not stray pieces of it.
      const moving = (src.bits || []).filter((c) => { const cx = (c.minx + c.maxx) / 2; return cx < src.main.minx || cx > src.main.maxx; });
      if (!moving.length) continue;
      src.bits = src.bits.filter((c) => !moving.includes(c));
      dst.bits = [...(dst.bits || []), ...moving];
      for (const c of moving) { frameOf[c.id] = to; moved.add(c.id); }
      refit(src); refit(dst);
    }
    const baselines = rows.map((r) => median(r.items.map((c) => c.maxy)));
    // Marks ("?", "!", a swirl) are cut out of the pose: each pose keeps a body
    // box (figure only) and a list of mark clusters drawn on their own layer.
    for (const fr of frames) {
      fr.marks = groupMarks(findMarks(fr, label, w, medH, moved), medH * 0.08);
      const ids = new Set(fr.marks.flatMap((k) => k.ids));
      const body = [fr.main, ...(fr.bits || []).filter((c) => !ids.has(c.id))];
      fr.body = {
        minx: Math.min(...body.map((c) => c.minx)), miny: Math.min(...body.map((c) => c.miny)),
        maxx: Math.max(...body.map((c) => c.maxx)), maxy: Math.max(...body.map((c) => c.maxy)),
      };
    }
    // A pair the user already sorted out with moveMarks needs no hint.
    const settled = (n) => (Array.isArray(moveMarks) ? moveMarks : []).some((p) => (String(p[0]) === n.from && String(p[1]) === n.near) || (String(p[0]) === n.near && String(p[1]) === n.from));
    const seen = new Set();
    near = near.filter((n) => !settled(n) && !seen.has(`${n.from}>${n.near}`) && seen.add(`${n.from}>${n.near}`)).slice(0, 40);
    return { label, frameOf, frames, rows: rows.map((r) => r.items.length), baselines, near };
  }

  // One image of the figure per pose, and one small image per mark beside it.
  function cutFrames(px, w, det) {
    const cut = (box, keep) => {
      const bw = box.maxx - box.minx + 1, bh = box.maxy - box.miny + 1;
      const c = document.createElement('canvas');
      c.width = bw; c.height = bh;
      const g = c.getContext('2d');
      const out = g.createImageData(bw, bh);
      for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
          const p = (box.miny + y) * w + (box.minx + x);
          const l = det.label[p];
          if (l < 0 || !keep(l)) continue;
          const o = (y * bw + x) * 4;
          out.data[o] = px[p * 4]; out.data[o + 1] = px[p * 4 + 1]; out.data[o + 2] = px[p * 4 + 2]; out.data[o + 3] = px[p * 4 + 3];
        }
      }
      g.putImageData(out, 0, 0);
      return { url: c.toDataURL('image/png'), w: bw, h: bh };
    };
    return det.frames.map((f, i) => {
      const markIds = new Set(f.marks.flatMap((k) => k.ids));
      const body = cut(f.body, (l) => det.frameOf[l] === i && !markIds.has(l));
      const base = det.baselines[f.row];
      // Horizontal anchor: the center of the head (top 30% of the figure), not the
      // bounding box. A swinging leg or an outstretched sword widens the box and
      // would make the body jitter sideways from frame to frame.
      const m = f.main;
      const headBottom = m.miny + Math.round((m.maxy - m.miny) * 0.3);
      let hmin = Infinity, hmax = -Infinity;
      for (let y = m.miny; y <= headBottom; y++) {
        for (let x = m.minx; x <= m.maxx; x++) {
          if (det.label[y * w + x] === m.id) { if (x < hmin) hmin = x; if (x > hmax) hmax = x; }
        }
      }
      const cx = Number.isFinite(hmin) ? (hmin + hmax) / 2 : (m.minx + m.maxx) / 2;
      return {
        row: f.row, col: f.col, url: body.url, w: body.w, h: body.h,
        ox: cx - f.body.minx,   // head center, from the body image's left edge
        top: base - f.body.miny, // baseline to the body image's top
        // Each mark: its own image, placed by its center relative to the head
        // center (dx) and its top above the baseline. Never mirrored when drawn.
        marks: f.marks.map((k) => {
          const im = cut(k, (l) => k.ids.includes(l));
          return { url: im.url, w: im.w, h: im.h, dx: (k.minx + k.maxx + 1) / 2 - cx, top: base - k.miny };
        }),
      };
    });
  }

  // A numbered preview of the detected frames ("row:frame") for mapping them.
  function indexImage(canvas, frames, det) {
    const s = Math.min(1, 1600 / canvas.width);
    const c = document.createElement('canvas');
    c.width = Math.round(canvas.width * s); c.height = Math.round(canvas.height * s);
    const g = c.getContext('2d');
    // Checkerboard so removed background is visible.
    for (let y = 0; y < c.height; y += 16) for (let x = 0; x < c.width; x += 16) {
      g.fillStyle = ((x + y) / 16) % 2 ? '#d8dde6' : '#f4f6fa';
      g.fillRect(x, y, 16, 16);
    }
    g.drawImage(canvas, 0, 0, c.width, c.height);
    g.font = 'bold 15px Segoe UI, sans-serif';
    det.frames.forEach((f, i) => {
      g.strokeStyle = '#ff3b7a'; g.lineWidth = 1.5;
      g.strokeRect(f.minx * s, f.miny * s, (f.maxx - f.minx + 1) * s, (f.maxy - f.miny + 1) * s);
      const t = `${frames[i].row}:${frames[i].col}`;
      g.fillStyle = '#ff3b7a'; g.fillRect(f.minx * s, f.miny * s, g.measureText(t).width + 8, 19);
      g.fillStyle = '#fff'; g.fillText(t, f.minx * s + 4, f.miny * s + 15);
      // Marks (drawn on their own layer, never mirrored) get a teal outline.
      for (const k of f.marks || []) {
        g.strokeStyle = '#12b5a6'; g.lineWidth = 1.5;
        g.strokeRect((k.minx - 2) * s, (k.miny - 2) * s, (k.maxx - k.minx + 5) * s, (k.maxy - k.miny + 5) * s);
      }
    });
    det.baselines.forEach((b) => { g.strokeStyle = 'rgba(40,120,255,0.5)'; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(0, b * s); g.lineTo(c.width, b * s); g.stroke(); });
    return c.toDataURL('image/png');
  }

  // "0-4" | "0,2,1" | "3:2" | "1:0-5" | [..] -> frame indexes into the flat list.
  function parseFrames(spec, row, sheet) {
    const out = [];
    const items = Array.isArray(spec) ? spec : String(spec == null ? '' : spec).split(',');
    for (let it of items) {
      if (typeof it === 'number') it = String(it);
      it = String(it).trim();
      if (!it) continue;
      let r = Number(row) || 0;
      let part = it;
      if (it.includes(':')) { const [a, b] = it.split(':'); r = Number(a); part = b; }
      let [a, b] = part.split('-').map(Number);
      if (!Number.isFinite(b)) b = a;
      const step = a <= b ? 1 : -1;
      for (let c = a; step > 0 ? c <= b : c >= b; c += step) {
        const idx = sheet.frames.findIndex((f) => f.row === r && f.col === c);
        if (idx >= 0) out.push(idx);
      }
    }
    return out;
  }

  // ---- cache of sliced sheets ----
  // Slicing a big sheet takes about a second; reloads (switching characters,
  // saving in the mapper) reuse the result. The key is the sheet's path; the
  // signature is its file version plus the settings that affect slicing.
  const DB_NAME = 'toshibuddy-sheets';
  function openDb() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('sheets');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function cacheGet(key) {
    try {
      const db = await openDb();
      return await new Promise((resolve) => {
        const q = db.transaction('sheets').objectStore('sheets').get(key);
        q.onsuccess = () => resolve(q.result || null);
        q.onerror = () => resolve(null);
      });
    } catch (_) { return null; }
  }
  async function cachePut(key, value) {
    try {
      const db = await openDb();
      await new Promise((resolve) => {
        const tx = db.transaction('sheets', 'readwrite');
        tx.objectStore('sheets').put(value, key);
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      });
    } catch (_) { /* cache is optional */ }
  }

  // Load, remove the background, find and cut the frames, draw the index preview.
  async function slice(url, cfg) {
    const img = await loadImage(url);
    const w = img.naturalWidth, h = img.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, w, h);
    const px = data.data;
    // Already transparent? Then skip background removal.
    const corners = [0, w - 1, (h - 1) * w, h * w - 1];
    const transparent = corners.every((p) => px[p * 4 + 3] < 20);
    let removed = null;
    if (!transparent && cfg.keyMode !== 'none') {
      removed = keyFlood(px, w, h, Math.max(1, Math.min(80, Number(cfg.keyTolerance) || 12)), Math.max(0, Math.min(255, Number(cfg.keyMax) || 0)));
      g.putImageData(data, 0, 0);
    }
    const det = detectFrames(px, w, h, cfg.moveMarks);
    if (!det.frames.length) throw new Error('no figures found on the sheet');
    const frames = cutFrames(px, w, det);
    return { w, h, removed, rows: det.rows, near: det.near, frames, index: indexImage(canvas, frames, det) };
  }

  function buildAnims(cfg, rows, sheet) {
    const anims = {};
    const defs = cfg.animations || { idle: { row: 0, frames: `0-${rows[0] - 1}`, fps: 4 } };
    for (const [key, d] of Object.entries(defs)) {
      if (!d) continue;
      const list = parseFrames(d.frames == null ? `0-${(rows[Number(d.row) || 0] || 1) - 1}` : d.frames, d.row, sheet);
      if (!list.length) continue;
      anims[key] = {
        frames: list,
        fps: Math.max(0.2, Math.min(30, Number(d.fps) || 6)),
        // Mirror the pose (the figure faces the other way). Older packs wrote this
        // as "flip" or "flipBody"; both mean the same now. Marks are never mirrored.
        mirror: !!(d.flip || d.flipBody),
        loop: d.loop !== false,
        loopFrom: Math.max(0, Math.min(list.length - 1, Number(d.loopFrom) || 0)),
        speed: Number(d.speed) > 0 ? Math.min(400, Number(d.speed)) : null, // walk: pixels per second
      };
    }
    if (!anims.idle) anims.idle = { frames: [0], fps: 1, mirror: false, loop: true, loopFrom: 0 };
    return anims;
  }

  async function prepare(url, cfg, opts = {}) {
    cfg = cfg || {};
    const key = url.split('?')[0];
    const sig = JSON.stringify(['layers-v1', url, cfg.keyMode, cfg.keyTolerance, cfg.keyMax, cfg.moveMarks]);

    let sliced = null;
    let fromCache = false;
    const hit = await cacheGet(key);
    if (hit && hit.sig === sig) { sliced = hit.data; fromCache = true; }
    if (!sliced) { sliced = await slice(url, cfg); cachePut(key, { sig, data: sliced }); }

    const sheet = { frames: sliced.frames, rows: sliced.rows, cfg };
    sheet.anims = buildAnims(cfg, sliced.rows, sheet);

    // Size: the first idle frame is `scale` x 188 pet units tall.
    const f0 = sheet.frames[sheet.anims.idle.frames[0]];
    const scale = Number(cfg.scale) || Number(opts.scale) || 1;
    sheet.u = (188 * scale) / f0.top;
    sheet.offX = Number(cfg.offsetX) || 0;
    sheet.offY = Number(cfg.offsetY) || 0;

    const name = decodeURIComponent(key.split('/').pop());
    const { w, h, removed, rows } = sliced;
    buddy.log(`sheet ${name}: ${w}x${h}, ${fromCache ? 'from cache' : removed == null ? 'already transparent' : `background ${Math.round(removed * 100)}% removed`}, ${rows.length} rows [${rows.join(', ')}] = ${sheet.frames.length} frames; animations: ${Object.keys(sheet.anims).join(', ')}`);
    if (opts.indexKind && opts.skinName) {
      try { buddy.saveSheetIndex(opts.skinName, opts.indexKind, sliced.index, rows, sliced.near || []); } catch (_) { /* preview only */ }
    }
    return sheet;
  }

  // Box for a frame in pet units: body centered on x=80, row baseline on y=188.
  function frameBox(sheet, f) {
    const u = sheet.u;
    return { x: 80 - f.ox * u + sheet.offX, y: 188 + sheet.offY - f.top * u, w: f.w * u, h: f.h * u };
  }

  // What skinAnchors()/imageBox() expect, matching the first idle frame.
  function asImage(sheet, anchorsCfg) {
    const f = sheet.frames[sheet.anims.idle.frames[0]];
    const b = frameBox(sheet, f);
    const scale = b.h / 188;
    return {
      url: f.url,
      aspect: f.w / f.h,
      config: { scale, offsetX: b.x - (80 - b.w / 2), offsetY: b.y - (188 - b.h), anchors: anchorsCfg },
    };
  }

  function resolveKey(pet, anims) {
    for (const c of pet.classList) if (c.startsWith('anim-') && anims[c]) return c;
    for (const k of ORDER) if (anims[k] && pet.classList.contains(k)) return k;
    return 'idle';
  }

  // Drives one <image> (wrapped in a <g> for mirroring) from one sheet.
  function player(sheet, imageId) {
    const pet = document.getElementById('pet');
    const img = document.getElementById(imageId);
    const wrap = document.getElementById(`${imageId}-wrap`);
    if (!img || !wrap) return null;
    let key = null, i = 0, timer = null;
    // Marks live in their own group right after the figure's wrapper.
    const NS = 'http://www.w3.org/2000/svg';
    let marksG = document.getElementById(`${imageId}-marks`);
    if (!marksG) {
      marksG = document.createElementNS(NS, 'g');
      marksG.setAttribute('id', `${imageId}-marks`);
      wrap.parentNode.insertBefore(marksG, wrap.nextSibling);
    }
    function draw() {
      const a = sheet.anims[key];
      const f = sheet.frames[a.frames[i]];
      const u = sheet.u;
      const b = frameBox(sheet, f);
      img.setAttribute('href', f.url);
      img.setAttribute('x', b.x.toFixed(1)); img.setAttribute('y', b.y.toFixed(1));
      img.setAttribute('width', b.w.toFixed(1)); img.setAttribute('height', b.h.toFixed(1));
      // The figure: mirrored around the pet's middle when the animation says so.
      wrap.setAttribute('transform', a.mirror ? 'translate(160 0) scale(-1 1)' : '');
      // The marks: they go to the other side with a mirrored figure, but the
      // mark itself is never mirrored. Facing left mirrors the whole pet (CSS on
      // #flip), so each mark is mirrored once more here to cancel that out.
      const left = pet.classList.contains('face-left');
      while (marksG.firstChild) marksG.removeChild(marksG.firstChild);
      for (const mk of f.marks || []) {
        const head = 80 + sheet.offX;
        const cx = a.mirror ? 160 - (head + mk.dx * u) : head + mk.dx * u;
        const mw = mk.w * u, mh = mk.h * u;
        const el = document.createElementNS(NS, 'image');
        el.setAttribute('href', mk.url);
        el.setAttribute('x', (cx - mw / 2).toFixed(1));
        el.setAttribute('y', (188 + sheet.offY - mk.top * u).toFixed(1));
        el.setAttribute('width', mw.toFixed(1)); el.setAttribute('height', mh.toFixed(1));
        if (left) el.setAttribute('transform', `translate(${(2 * cx).toFixed(1)} 0) scale(-1 1)`);
        el.dataset.mark = '1';
        marksG.appendChild(el);
      }
    }
    function step() {
      const a = sheet.anims[key];
      timer = null;
      if (i < a.frames.length - 1) i++;
      else if (a.loop) i = a.loopFrom;
      else return;
      draw();
      timer = setTimeout(step, 1000 / a.fps);
    }
    let facing = null;
    function update(force) {
      const k = resolveKey(pet, sheet.anims);
      const left = pet.classList.contains('face-left');
      if (k === key && !force) { if (left !== facing) { facing = left; draw(); } return; }
      facing = left;
      if (window.BUDDY_SHEET_DEBUG) buddy.log(`sheet ${imageId}: ${key} -> ${k} (${pet.className})`);
      key = k; i = 0;
      clearTimeout(timer);
      draw();
      const a = sheet.anims[key];
      if (a.frames.length > 1) timer = setTimeout(step, 1000 / a.fps);
    }
    new MutationObserver(() => update(false)).observe(pet, { attributes: true, attributeFilter: ['class'] });
    update(true);
    return { update, get key() { return key; }, get frame() { return key && sheet.anims[key] ? sheet.anims[key].frames[i] : -1; } };
  }

  function start(skin) {
    const out = {};
    if (skin && skin.sheet) out.base = player(skin.sheet, 'skin-img');
    if (skin && skin.ultimateSheet) out.ultimate = player(skin.ultimateSheet, 'skin-ultimate');
    return out;
  }

  window.BuddySheet = { prepare, asImage, start, parseFrames, findMarks, groupMarks };
})();
