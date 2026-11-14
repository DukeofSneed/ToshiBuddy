// The built-in character check and the automatic animation mapping. No images
// are read: both work on how many poses each row of a sheet has.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { checkCharacter, autoMap, clip, guess, cellsOf } = require(path.join(ROOT, 'src', 'main', 'character-check.js'));

let passed = 0;
const check = (name, fn) => { try { fn(); passed++; } catch (e) { console.log(`FAIL ${name}: ${e.message}`); process.exitCode = 1; } };
const pack = (id) => JSON.parse(fs.readFileSync(path.join(ROOT, 'characters', id, 'character.json'), 'utf8'));
const quips = (id) => JSON.parse(fs.readFileSync(path.join(ROOT, 'characters', id, 'quips.json'), 'utf8')).quips.length;

check('frame grammar', () => {
  assert.deepStrictEqual(cellsOf('0:0-2,0:1'), [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 1 }]);
  assert.deepStrictEqual(cellsOf('3-1', 2), [{ row: 2, col: 3 }, { row: 2, col: 2 }, { row: 2, col: 1 }]);
});

// Every bundled character must pass its own check.
for (const id of fs.readdirSync(path.join(ROOT, 'characters')).filter((d) => fs.existsSync(path.join(ROOT, 'characters', d, 'character.json')))) {
  const cfg = pack(id);
  if (cfg.builtin) continue;
  check(`bundled character ${id} checks out`, () => {
    assert.ok(cfg.sheet.rows, 'row counts are stored in the pack');
    const r = checkCharacter(cfg, { rows: { sheet: cfg.sheet.rows, ultimateSheet: (cfg.ultimateSheet || {}).rows }, quipCount: quips(id), hasSheet: true, hasUltimateSheet: !!cfg.ultimateSheet });
    const bad = r.items.filter((i) => i.level === 'error' || i.level === 'warn').map((i) => i.text);
    assert.deepStrictEqual(bad, []);
    assert.ok(r.ok);
  });
}

const toshi = pack('toshitoshi');
const templates = [{ id: 'toshitoshi', name: 'ToshiToshi', rows: toshi.sheet.rows, animations: toshi.sheet.animations }];

check('problems are reported', () => {
  const cfg = { personality: 'x', sheet: { animations: { walk: { frames: '9:0-3' }, talk: { frames: '0:0-20' }, sleep: { frames: '0:0', fps: 99 } } } };
  const r = checkCharacter(cfg, { rows: { sheet: [4, 4] }, quipCount: 0 });
  const text = r.items.map((i) => `${i.level} ${i.text}`).join('\n');
  assert.strictEqual(r.ok, false);
  assert.match(text, /error idle is not mapped/);
  assert.match(text, /error walk: none of its frames exist/);
  assert.match(text, /warn talk: 17 of 21 frames don't exist/);
  assert.match(text, /warn sleep: fps 99/);
  assert.match(text, /warn no lines/);
});
check('an unmapped sheet is an error, and unknown row counts only a warning', () => {
  assert.strictEqual(checkCharacter({ sheet: {} }, { rows: { sheet: [4] } }).ok, false);
  const r = checkCharacter({ personality: 'x', sheet: { animations: { idle: { frames: '0:0' }, walk: { frames: '0:1' }, talk: { frames: '0:2' } } } }, { rows: {} });
  assert.ok(r.ok && r.warnings === 1);
});

check('a sheet with the same layout gets the full map', () => {
  const r = autoMap([11, 12, 11, 11, 9], templates);
  assert.strictEqual(r.source, 'toshitoshi');
  assert.strictEqual(r.guessed, false);
  assert.deepStrictEqual(Object.keys(r.animations).sort(), Object.keys(toshi.sheet.animations).sort());
  assert.strictEqual(r.animations.walk.frames, toshi.sheet.animations.walk.frames);
  assert.strictEqual(r.animations.walk.fps, 9);
  assert.ok(checkCharacter({ personality: 'x', sheet: r }, { rows: { sheet: [11, 12, 11, 11, 9] } }).ok);
});
check('a slightly smaller sheet keeps only frames that exist', () => {
  const rows = [10, 12, 11, 11, 8];
  const r = autoMap(rows, templates);
  assert.strictEqual(r.source, 'toshitoshi');
  assert.ok(!/0:10/.test(r.animations.walk.frames), 'the missing 11th pose of row 0 is dropped');
  assert.ok(!r.animations.wave, 'an animation with no frames left is dropped');
  const res = checkCharacter({ personality: 'x', sheet: { animations: r.animations } }, { rows: { sheet: rows } });
  assert.deepStrictEqual(res.items.filter((i) => i.level === 'error'), []);
});
check('an unfamiliar sheet gets a guess for idle, walk and talk', () => {
  const r = autoMap([6, 8, 4], templates);
  assert.strictEqual(r.guessed, true);
  assert.strictEqual(r.animations.idle.frames, '0:0-3,0:2-1');
  assert.strictEqual(r.animations.walk.frames, '1:0-7');
  assert.strictEqual(r.animations.talk.frames, '2:0-3');
  assert.strictEqual(r.animations.walk.fps, 9);
  assert.ok(checkCharacter({ personality: 'x', sheet: { animations: r.animations } }, { rows: { sheet: [6, 8, 4] } }).ok);
});
check('a one-row sheet still gets idle and walk', () => {
  const g = guess([10]);
  assert.strictEqual(g.idle.frames, '0:0-3,0:2-1');
  assert.strictEqual(g.walk.frames, '0:4-9');
  assert.deepStrictEqual(guess([]), {});
});
check('a mark close to the pose next door is pointed out, for poses in use', () => {
  const cfg = { personality: 'x', sheet: { animations: { idle: { frames: '0:0' }, walk: { frames: '0:1' }, talk: { frames: '0:2' }, think: { frames: '1:2' } } } };
  const near = { sheet: [{ from: '1:3', near: '1:2' }, { from: '2:0', near: '2:1' }] };
  const r = checkCharacter(cfg, { rows: { sheet: [4, 4, 4] }, near });
  const warns = r.items.filter((i) => i.level === 'warn').map((i) => i.text);
  assert.strictEqual(warns.length, 1, 'only the pair that touches a used pose');
  assert.match(warns[0], /mark beside pose 1:3 sits about as close to pose 1:2.*move from 1:3 to 1:2/);
  assert.ok(r.ok, 'a hint, not an error');
});
check('a named layout can be forced', () => {
  const r = autoMap([6, 8, 4], templates, { from: 'toshitoshi' });
  assert.strictEqual(r.source, 'toshitoshi');
  assert.deepStrictEqual(clip({ idle: { frames: '5:0' } }, [3]), {});
});

console.log(`${passed} passed, ${process.exitCode ? 'some' : 0} failed`);

// A mark hint the user marked as fine, or already moved, is not repeated.
{
  const cfg = { personality: 'x', sheet: { marksOk: [['1:2', '1:3']], moveMarks: [['2:0', '2:1']], animations: { idle: { frames: '0:0' }, walk: { frames: '0:1' }, talk: { frames: '0:2' }, think: { frames: '1:2' }, wave: { frames: '2:1' }, shrug: { frames: '1:0' } } } };
  const near = { sheet: [{ from: '1:3', near: '1:2' }, { from: '2:0', near: '2:1' }, { from: '1:0', near: '1:1' }] };
  const r = checkCharacter(cfg, { rows: { sheet: [4, 4, 4] }, near });
  const hints = r.items.filter((i) => i.pair);
  assert.strictEqual(hints.length, 1);
  assert.deepStrictEqual(hints[0].pair, { kind: 'sheet', from: '1:0', near: '1:1' });
  console.log('mark hint checks passed');
}
