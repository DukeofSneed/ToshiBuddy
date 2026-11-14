// Saved counts for upgrades (the mod loader's side): they add up, survive the
// pet window being replaced (after sleep) and a restart, and say when to act.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'mods', 'loader.js'), 'utf8');

// The storage outlives a window; each "window" is a fresh copy of the loader.
const disk = {};
function openWindow() {
  const el = () => ({ setAttribute() {}, appendChild() {}, dataset: {}, set innerHTML(v) {}, getAttribute: () => null });
  const win = {
    localStorage: { getItem: (k) => (k in disk ? disk[k] : null), setItem: (k, v) => { disk[k] = String(v); } },
    document: { getElementById: () => el(), createElement: el, createElementNS: el, head: el(), body: el() },
    BuddySfx: { names: ['pop'] },
  };
  win.window = win;
  vm.runInNewContext(src, win);
  return win.BuddyMods;
}
let passed = 0;
const check = (name, fn) => { try { fn(); passed++; } catch (e) { console.log(`FAIL ${name}: ${e.stack}`); process.exitCode = 1; } };

check('every Nth time', () => {
  const m = openWindow();
  const hits = [];
  for (let i = 1; i <= 10; i++) { const r = m.bump('praise', { name: 'sessions', every: 5 }); if (r.hit) hits.push(r.n); }
  assert.deepStrictEqual(hits, [5, 10]);
});
check('the count survives the window being replaced (wake from sleep) and a restart', () => {
  const again = openWindow();
  const r = again.bump('praise', { name: 'sessions', every: 5 });
  assert.strictEqual(r.n, 11);
  assert.strictEqual(r.hit, false);
  for (let i = 0; i < 3; i++) again.bump('praise', { name: 'sessions', every: 5 });
  assert.strictEqual(openWindow().bump('praise', { name: 'sessions', every: 5 }).hit, true); // 15
});
check('milestones, and counts kept apart per upgrade and per name', () => {
  const m = openWindow();
  const hits = [];
  for (let i = 1; i <= 12; i++) if (m.bump('other', { name: 'clicks', at: [3, 10] }).hit) hits.push(i);
  assert.deepStrictEqual(hits, [3, 10]);
  assert.strictEqual(m.bump('other', { name: 'sessions', every: 2 }).n, 1);
  assert.strictEqual(JSON.parse(disk['buddy.counts']).praise.sessions, 15);
});
check('damaged storage starts over instead of breaking', () => {
  disk['buddy.counts'] = '{not json';
  assert.strictEqual(openWindow().bump('praise', { name: 'sessions', every: 5 }).n, 1);
});
check('a mod may use the new events and a count; a bad count is refused', () => {
  const m = openWindow();
  const reg = (b) => m.register({ id: 'praise', behaviors: [b] });
  reg({ trigger: 'desk-done', count: { name: 'sessions', every: 5 }, action: { say: 'Session {count}.' } });
  reg({ trigger: 'app-switch', count: { name: 'swaps', at: [10, 50] }, action: { say: 'Focus.' } });
  reg({ trigger: 'desk-long', action: { say: 'Long one.' } });
  assert.throws(() => reg({ trigger: 'desk-done', count: { name: 'Bad Name', every: 5 }, action: {} }), /count\.name/);
  assert.throws(() => reg({ trigger: 'desk-done', count: { name: 'x' }, action: {} }), /needs every/);
  assert.throws(() => reg({ trigger: 'desk-done', count: { name: 'x', every: 1 }, action: {} }), /needs every/);
  assert.throws(() => reg({ trigger: 'tasks-finished', action: {} }), /trigger must be one of/);
});
console.log(`${passed} passed, ${process.exitCode ? 'some' : 0} failed`);
