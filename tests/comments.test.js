'use strict';
// Notes on goals, and nothing the owner typed or picked is lost: a failed or
// interrupted build keeps the notes and pictures, and drafts survive a restart.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const root = path.join(__dirname, '..', 'src', 'main');
const { Ledger } = require(path.join(root, 'jar/ledger.js'));
const { Drafts } = require(path.join(root, 'jar/drafts.js'));
const attachments = require(path.join(root, 'jar/attachments.js'));

let passed = 0;
const check = (name, fn) => { try { fn(); passed++; } catch (e) { console.log(`FAIL ${name}: ${e.stack}`); process.exitCode = 1; } };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toshi-comments-'));
// a real (tiny) PNG
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
const pic = path.join(dir, 'My Picture.png');
fs.writeFileSync(pic, PNG);

check('notes: added, capped, kept through a failure, interruption and retry', () => {
  const ledger = new Ledger(dir);
  const g = ledger.addGoal({ title: 'Paper tower', goalTokens: 60000, characterId: 'toshitoshi' });
  assert.ok(ledger.addComment(g.id, '  make it   lean a bit  '));
  assert.deepStrictEqual(g.comments.map((c) => c.text), ['make it lean a bit']);
  assert.ok(!ledger.addComment(g.id, '   '));
  for (let i = 0; i < 4; i++) ledger.addComment(g.id, `note ${i}`);
  assert.ok(!ledger.addComment(g.id, 'sixth'), 'up to five');
  assert.ok(ledger.removeComment(g.id, 1));
  assert.strictEqual(g.comments.length, 4);
  // a build that was interrupted, then a reload from disk
  g.status = 'building';
  assert.ok(!ledger.addComment(g.id, 'while building'), 'not while it builds');
  ledger.save();
  const again = new Ledger(dir);
  again.recoverInterrupted();
  const g2 = again.goal(g.id);
  assert.notStrictEqual(g2.status, 'building');
  assert.strictEqual(g2.comments.length, 4);
  g2.status = 'failed';
  again.save();
  assert.strictEqual(new Ledger(dir).goal(g.id).comments.length, 4);
});

check('pictures on a goal stay in userData after a run tidies its copies', () => {
  const ledger = new Ledger(dir);
  const g = ledger.addGoal({ title: 'Photo', goalTokens: 60000 });
  attachments.add({ userData: dir, goal: g, source: pic, use: 'reference', sizeOf: () => ({ width: 1, height: 1 }) });
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'toshi-proj-'));
  const placed = attachments.place({ userData: dir, projectRoot: proj, goal: g, slug: 'photo' });
  assert.strictEqual(placed.length, 1);
  attachments.tidy({ projectRoot: proj, slug: 'photo' }); // a run that wrote nothing (failed)
  assert.ok(!fs.existsSync(path.join(proj, 'mods', 'photo')));
  assert.strictEqual(attachments.usable(dir, g).length, 1, 'the original is still there for the retry');
  fs.rmSync(proj, { recursive: true, force: true });
});

check('drafts: suggestion text, half-written notes and picked pictures survive a restart', () => {
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'toshi-drafts-'));
  const d = new Drafts(ud);
  d.setSuggest('a paper tower that rains');
  d.setComment('abcd1234', 'lean left');
  d.setComment('../evil', 'nope');
  d.addPending(pic, 'reference', 'png');
  const r = new Drafts(ud).view();
  assert.strictEqual(r.suggest, 'a paper tower that rains');
  assert.deepStrictEqual(r.comments, { abcd1234: 'lean left' });
  assert.deepStrictEqual(r.pending, [{ name: 'My Picture.png', use: 'reference' }]);
  const files = new Drafts(ud).pendingFiles();
  assert.ok(fs.existsSync(files[0].source), 'a copy, so moving the original does not lose it');
  assert.notStrictEqual(files[0].source, pic);
  // the goal was created: pending pictures move on, drafts for gone goals are dropped
  const d2 = new Drafts(ud);
  d2.clearPending(); d2.prune(['zzzz9999']);
  const after = new Drafts(ud).view();
  assert.deepStrictEqual(after.pending, []);
  assert.deepStrictEqual(after.comments, {});
  assert.strictEqual(after.suggest, 'a paper tower that rains');
  fs.writeFileSync(path.join(ud, 'drafts.json'), '{broken');
  assert.strictEqual(new Drafts(ud).view().suggest, '', 'damaged file starts empty');
  fs.rmSync(ud, { recursive: true, force: true });
});

check('the build prompt (and a resumed run) carries the notes, before the rules', () => {
  const { Upgrader } = require(path.join(root, 'jar/upgrader.js'));
  const ledger = new Ledger(dir);
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  const up = new Upgrader({ projectRoot: dir, ledger, guard: {}, settings: { get: () => undefined }, git: {}, character: () => ({ name: 'Toshi', isSkin: true }) });
  const goal = { title: 'Paper tower', summary: 'A tower.', goalTokens: 60000, comments: [{ text: 'make it lean left' }] };
  const p = up.buildPrompt(goal, {});
  assert.match(p, /Notes from the owner[\s\S]*"make it lean left"[\s\S]*## Rules/);
  assert.match(up.buildPrompt(goal, { resume: true, extraTokens: 9000 }), /make it lean left/);
  assert.ok(!/Notes from the owner/.test(up.buildPrompt({ ...goal, comments: [] }, {})));
});

fs.rmSync(dir, { recursive: true, force: true });
console.log(`${passed} passed, ${process.exitCode ? 'some' : 0} failed`);
