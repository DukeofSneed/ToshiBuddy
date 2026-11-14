// Pictures attached to an upgrade goal: validation, where they are placed for a
// run, what is kept afterwards, and what the prompts say. No Claude calls.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const root = path.join(__dirname, '..', 'src', 'main');
const att = require(path.join(root, 'jar/attachments.js'));
const { Upgrader } = require(path.join(root, 'jar/upgrader.js'));
const { Ledger } = require(path.join(root, 'jar/ledger.js'));

let passed = 0;
const check = (name, fn) => { try { fn(); passed++; } catch (e) { console.log(`FAIL ${name}: ${e.stack}`); process.exitCode = 1; } };
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'toshi-att-'));
const userData = path.join(work, 'ud'); const project = path.join(work, 'proj'); const src = path.join(work, 'src');
for (const d of [userData, project, src]) fs.mkdirSync(d, { recursive: true });
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const file = (name, buf) => { const f = path.join(src, name); fs.writeFileSync(f, buf); return f; };
const sizeOf = () => ({ width: 640, height: 480 });
const ledger = new Ledger(userData);
const goal = ledger.addGoal({ title: 'Desk photo', goalTokens: 20000, characterId: 'toshitoshi' });

check('a real picture is accepted and stored outside the project under a safe name', () => {
  const a = att.add({ userData, goal, source: file('My Photo (1).PNG', PNG), use: 'asset', sizeOf });
  assert.deepStrictEqual({ file: a.file, use: a.use, width: a.width, height: a.height }, { file: 'my-photo-1.png', use: 'asset', width: 640, height: 480 });
  assert.ok(fs.existsSync(path.join(userData, 'attachments', goal.id, 'my-photo-1.png')));
  att.add({ userData, goal, source: file('idea.png', PNG), use: 'reference', sizeOf });
  assert.strictEqual(goal.attachments.length, 2);
});
check('anything that is not a real image is refused', () => {
  assert.throws(() => att.add({ userData, goal, source: file('tool.exe', Buffer.from('MZ')), use: 'asset', sizeOf }), /PNG, WebP, GIF, or JPG/);
  assert.throws(() => att.add({ userData, goal, source: file('fake.png', Buffer.from('MZ not an image')), use: 'asset', sizeOf }), /not a valid image/);
  assert.throws(() => att.add({ userData, goal, source: file('big.png', Buffer.concat([PNG, Buffer.alloc(att.MAX_BYTES)])), use: 'asset', sizeOf }), /larger than/);
  assert.throws(() => att.add({ userData, goal, source: file('ok.png', PNG), use: 'whatever', sizeOf }), /how the picture is used/);
  assert.throws(() => att.add({ userData, goal, source: file('broken.png', PNG), use: 'asset', sizeOf: () => ({ width: 0, height: 0 }) }), /could not be opened/);
  assert.throws(() => att.add({ userData, goal: { id: '..\evil', attachments: [] }, source: file('ok2.png', PNG), use: 'asset', sizeOf }), /bad goal id/);
  assert.strictEqual(goal.attachments.length, 2);
});
check('at most three pictures per goal', () => {
  att.add({ userData, goal, source: file('third.png', PNG), use: 'reference', sizeOf });
  assert.throws(() => att.add({ userData, goal, source: file('fourth.png', PNG), use: 'asset', sizeOf }), /up to 3/);
  att.remove({ userData, goal, file: 'third.png' });
  assert.strictEqual(goal.attachments.length, 2);
  assert.ok(!fs.existsSync(path.join(userData, 'attachments', goal.id, 'third.png')));
});

let placed;
check('for a run, assets and references go into the mod folder', () => {
  placed = att.place({ userData, projectRoot: project, goal, slug: 'desk-photo' });
  assert.deepStrictEqual(placed.map((p) => p.rel), ['mods/desk-photo/assets/my-photo-1.png', 'mods/desk-photo/reference/idea.png']);
  assert.ok(fs.existsSync(path.join(project, 'mods/desk-photo/assets/my-photo-1.png')));
});
check('a tampered attachment record is ignored', () => {
  const evil = { id: goal.id, attachments: [{ file: '../../x.png', use: 'asset' }, { file: 'my-photo-1.png', use: 'nope' }] };
  assert.deepStrictEqual(att.usable(userData, evil), []);
});
check('the upgrade prompt says to use the picture itself and not to redraw it', () => {
  const up = new Upgrader({ projectRoot: project, ledger, guard: {}, settings: { get: () => undefined }, git: {}, userData, character: () => ({ id: 'toshitoshi', name: 'ToshiToshi', isSkin: true, personality: 'Calm.' }) });
  const p = up.buildPrompt(goal, { placed });
  assert.match(p, /mods\/desk-photo\/assets\/my-photo-1\.png \(640x480 pixels\): USE THIS PICTURE ITSELF/);
  assert.match(p, /Do not redraw, trace, or replace it/);
  assert.match(p, /mods\/desk-photo\/reference\/idea\.png.*reference only/);
  assert.ok(!/attached pictures/.test(up.buildPrompt(goal, {})), 'no picture lines without pictures');
  assert.match(att.pricingLine(goal), /1 picture to be shown as-is as a prop.*1 reference picture/);
  assert.strictEqual(att.pricingLine({ attachments: [] }), '');
});
check('after a run that wrote the mod: the asset stays, the reference is gone', () => {
  fs.writeFileSync(path.join(project, 'mods/desk-photo/mod.js'), '//');
  att.tidy({ projectRoot: project, slug: 'desk-photo' });
  assert.ok(fs.existsSync(path.join(project, 'mods/desk-photo/assets/my-photo-1.png')));
  assert.ok(!fs.existsSync(path.join(project, 'mods/desk-photo/reference')));
});
check('after a run that wrote nothing: no picture is left in the project', () => {
  att.place({ userData, projectRoot: project, goal, slug: 'empty-run' });
  att.tidy({ projectRoot: project, slug: 'empty-run' });
  assert.ok(!fs.existsSync(path.join(project, 'mods/empty-run')));
});
check('removing the goal removes its stored pictures', () => {
  att.removeAll(userData, goal.id);
  assert.ok(!fs.existsSync(path.join(userData, 'attachments', goal.id)));
});

console.log(`${passed} passed, ${process.exitCode ? 'some' : 0} failed`);
fs.rmSync(work, { recursive: true, force: true });
