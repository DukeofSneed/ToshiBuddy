// Which detached pieces of a pose are marks ("?", "!", a swirl) and how they are
// grouped. Marks are cut out and never mirrored, so getting this right is what
// keeps a "?" readable. Uses small made-up shapes, no images.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const win = { document: {}, indexedDB: {} };
win.window = win;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'pet', 'sheet.js'), 'utf8'), win);
// Results come from another context: copy them into plain arrays here before comparing.
const plain = (v) => JSON.parse(JSON.stringify(v));
const findMarks = (...a) => Array.from(win.BuddySheet.findMarks(...a));
const groupMarks = (...a) => plain(win.BuddySheet.groupMarks(...a));

// A 200x200 canvas of component ids. Body: id 0, a block from (60,40) to (140,190).
const W = 200, H = 200;
const label = new Int32Array(W * H).fill(-1);
const comps = [];
function piece(minx, miny, maxx, maxy) {
  const id = comps.length;
  let area = 0;
  for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) { label[y * W + x] = id; area++; }
  const c = { id, minx, miny, maxx, maxy, area };
  comps.push(c);
  return c;
}
const medH = 150;
// The body: a narrower top (70-130) on a wider block, so its outline box has empty top corners.
const body = piece(60, 61, 140, 190);
for (let y = 40; y <= 60; y++) for (let x = 70; x <= 130; x++) label[y * W + x] = body.id;
body.miny = 40;
const hook = piece(150, 30, 162, 48);      // "?" hook, right of the head
const dot = piece(154, 53, 158, 57);        // "?" dot just under it (area 25 is too small alone: make it 30+)
const dotBig = piece(153, 60, 159, 65);     // a dot large enough to count
const above = piece(90, 18, 104, 32);       // a swirl above the head, inside the body's left/right edges
const corner = piece(20, 36, 32, 48);       // a swirl by the top-left corner
const arc = piece(150, 80, 199, 130);       // a big sword arc: part of the figure
const dust = piece(150, 170, 160, 180);     // dust by the feet: low, part of the figure
const hair = piece(62, 46, 67, 56);         // a loose fragment inside the outline box, 2 px from the body: part of the figure
const close = piece(50, 50, 58, 58);        // a swirl beside the figure, only 2-3 px from it: still a mark
const speck = piece(170, 20, 172, 22);      // a 9-pixel speck: ignored
const farMoved = piece(20, 150, 30, 160);   // low and far, but the user moved it here: a mark

let passed = 0;
const check = (name, fn) => { try { fn(); passed++; } catch (e) { console.log(`FAIL ${name}: ${e.stack}`); process.exitCode = 1; } };
// (the fragment above is 6x11 = 66 pixels: under the size at which a piece inside the box counts on its own)
const fr = { main: body, bits: [hook, dot, dotBig, above, corner, arc, dust, hair, close, speck, farMoved] };
const ids = (list) => list.map((c) => c.id).sort((a, b) => a - b);

check('marks are the small pieces up by the head, clear of the body', () => {
  const got = findMarks(fr, label, W, medH, new Set());
  assert.deepStrictEqual(ids(got), ids([hook, dotBig, above, corner, close]));
});
check('a mark above the head or by a corner counts (not only beside the figure)', () => {
  const got = ids(findMarks(fr, label, W, medH, new Set()));
  assert.ok(got.includes(above.id) && got.includes(corner.id));
  assert.ok(got.includes(close.id), 'a mark drawn right next to the hair still counts');
});
check('big effects, low pieces, and fragments touching the body stay with the figure', () => {
  const got = ids(findMarks(fr, label, W, medH, new Set()));
  for (const c of [arc, dust, hair, speck]) assert.ok(!got.includes(c.id), `piece ${c.id} must not be a mark`);
});
check('a piece the user moved to this pose is always a mark', () => {
  assert.ok(ids(findMarks(fr, label, W, medH, new Set([farMoved.id]))).includes(farMoved.id));
});
check('the hook and dot of a "?" become one mark; separate marks stay separate', () => {
  const groups = groupMarks(findMarks(fr, label, W, medH, new Set()), medH * 0.08);
  assert.strictEqual(groups.length, 4);
  const q = groups.find((g) => g.ids.includes(hook.id));
  assert.deepStrictEqual(q.ids.slice().sort(), [hook.id, dotBig.id].sort());
  assert.deepStrictEqual([q.minx, q.miny, q.maxx, q.maxy], [150, 30, 162, 65]);
});
check('a pose with no detached pieces has no marks', () => {
  assert.deepStrictEqual(findMarks({ main: body }, label, W, medH, new Set()), []);
  assert.deepStrictEqual(groupMarks([], 10), []);
});
console.log(`${passed} passed, ${process.exitCode ? 'some' : 0} failed`);
