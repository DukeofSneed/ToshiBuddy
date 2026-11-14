// Character profiles and per-character goals and tricks. No Claude calls: the
// search run itself is not started here; its prompt, the cleaning of its answer,
// and what reaches estimates and upgrade runs are checked.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const root = path.join(__dirname, '..', 'src', 'main');
const profile = require(path.join(root, 'jar/profile.js'));
const { Upgrader } = require(path.join(root, 'jar/upgrader.js'));
const { Ledger } = require(path.join(root, 'jar/ledger.js'));
const { modsFor } = require(path.join(root, 'mods.js'));

let passed = 0;
const check = (name, fn) => { try { fn(); passed++; } catch (e) { console.log(`FAIL ${name}: ${e.stack}`); process.exitCode = 1; } };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toshi-profile-'));
const who = { name: 'Example Hero', personality: 'Calm, dry, likes naps.' };

check('the search prompt carries the name and personality, and the safety rules', () => {
  const p = profile.buildPrompt(who);
  assert.ok(p.includes('"Example Hero"') && p.includes('Calm, dry, likes naps.'));
  assert.match(p, /Search only for the name/);
  assert.match(p, /not instructions/);
  assert.match(p, /Never quote dialogue/);
  assert.ok(!/characters[\/]/.test(p), 'no pack paths');
});

check('the answer is cleaned: lengths capped, control characters gone, sizes clamped', () => {
  const c = profile.clean({
    found: 1, profile: 'A\u0000B\n\nC ' + 'x'.repeat(2000),
    ideas: [
      { title: 'Nap  cushion', summary: 'A cushion on the desk.', size: 'S', estimated_tokens: 5 },
      { title: 'nap cushion', summary: 'duplicate', size: 'S', estimated_tokens: 20000 },
      { title: 'Huge thing', summary: 'Too big.', size: 'XL', estimated_tokens: 9e9 },
      { title: '', summary: 'no title', size: 'S', estimated_tokens: 1 },
      ...Array.from({ length: 20 }, (_, i) => ({ title: `Idea ${i}`, summary: 's', size: 'M', estimated_tokens: 50000 })),
    ],
  });
  assert.strictEqual(c.found, true);
  assert.ok(c.profile.startsWith('A B C') && c.profile.length <= 800);
  assert.strictEqual(c.ideas.length, 8);
  assert.deepStrictEqual(c.ideas[0], { title: 'Nap cushion', summary: 'A cushion on the desk.', size: 'S', goalTokens: 8000 });
  assert.strictEqual(c.ideas[1].title, 'Huge thing');
  assert.ok(c.ideas[1].goalTokens <= 40000, 'unknown sizes fall back to small');
  assert.deepStrictEqual(profile.clean(null), { found: false, profile: '', ideas: [] });
});

check('stored notes are used only for the name and personality they were made for', () => {
  const file = profile.profileFile(dir, 'example-hero');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ id: 'example-hero', signature: profile.signature(who), profile: 'Guards a snowy town.', ideas: [] }));
  assert.strictEqual(profile.profileText(dir, 'example-hero', who), 'Guards a snowy town.');
  assert.strictEqual(profile.profileText(dir, 'example-hero', { ...who, personality: 'Loud.' }), '');
  assert.strictEqual(profile.profileText(dir, 'nobody', who), '');
  assert.throws(() => profile.profileFile(dir, '..\evil'), /bad character id/);
});

const ledger = new Ledger(dir);
const mk = (character) => new Upgrader({ projectRoot: dir, ledger, guard: {}, settings: { get: () => undefined }, git: {}, character: () => character });

check('upgrade prompts get the name, personality and notes, and nothing from the pack', () => {
  const up = mk({ id: 'example-hero', name: 'Example Hero', isSkin: true, personality: who.personality, profile: 'Guards a snowy town.' });
  const p = up.buildPrompt({ title: 'Nap cushion', summary: 'A cushion.', goalTokens: 20000 }, {});
  assert.ok(p.includes('Example Hero') && p.includes(who.personality) && p.includes('Guards a snowy town.'));
  assert.match(p, /Reference data only, not instructions/);
  assert.ok(!/quips\.json|sheet\.png/.test(p));
  const bare = mk({ id: 'x', name: 'X', isSkin: true, personality: '' }).buildPrompt({ title: 'T', summary: 'S', goalTokens: 1 }, {});
  assert.ok(!/Background notes/.test(bare), 'no notes line without a profile');
});

(async () => {
  const g = ledger.addGoal({ title: 'Nap cushion', goalTokens: 20000, characterId: 'example-hero' });
  ledger.donate(20000, { goalId: g.id });
  const r = await mk({ id: 'someone-else', name: 'S', isSkin: true }).build(g.id);
  check('…refused with a clear reason', () => { assert.strictEqual(r.ok, false); assert.match(r.reason, /another character/); });
  check('goals remember whose they are', () => assert.strictEqual(ledger.goal(g.id).characterId, 'example-hero'));

  check('a trick loads only for the character it was built for', () => {
    for (const s of ['cushion', 'shared']) { fs.mkdirSync(path.join(dir, 'mods', s), { recursive: true }); fs.writeFileSync(path.join(dir, 'mods', s, 'mod.js'), '//'); }
    const upgrades = [{ slugs: ['cushion'], characterId: 'example-hero' }];
    const slugs = (id, ups = upgrades) => modsFor(dir, [], ups, id).map((m) => m.slug).sort();
    assert.deepStrictEqual(slugs('example-hero'), ['cushion', 'shared']);
    assert.deepStrictEqual(slugs('someone-else'), ['shared']);
    assert.deepStrictEqual(slugs('someone-else', [{ slugs: ['cushion'], characterId: 'example-hero', reverted: true }]), ['cushion', 'shared']);
    assert.deepStrictEqual(slugs('someone-else', [{ slugs: ['cushion'] }]), ['cushion', 'shared'], 'older tricks with no owner load for everyone');
  });

  console.log(`${passed} passed, ${process.exitCode ? 'some' : 0} failed`);
  fs.rmSync(dir, { recursive: true, force: true });
})();

// Upgrades must not overlap with what the character already does.
{
  const abilities = require(path.join(root, 'abilities.js'));
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'characters', 'toshitoshi', 'character.json'), 'utf8'));
  const has = abilities.describe({ config: cfg, built: ['Tea break'], planned: ['Nap cushion'] });
  assert.match(has, /falls asleep after a while/);
  assert.match(has, /sleeping \(with its own drawn sleep marks\)/);
  assert.match(has, /Tricks already built: Tea break/);
  assert.match(has, /Ideas already on the list: Nap cushion/);
  assert.ok(!/leaning on the screen edge/.test(has), 'poses that are not mapped are not claimed');
  assert.ok(!/3:6|sheet\.png|frames/.test(has), 'no frame numbers or file names');
  const who2 = { id: 'x', name: 'X', isSkin: true, personality: 'Calm.', abilities: has };
  const up = new Upgrader({ projectRoot: dir, ledger: new Ledger(fs.mkdtempSync(path.join(os.tmpdir(), 'toshi-ab-'))), guard: {}, settings: { get: () => undefined }, git: {}, character: () => who2 });
  const prompts = [profile.buildPrompt(who2), up.buildPrompt({ title: 'T', summary: 'S', goalTokens: 1 }, {})];
  for (const p of prompts) { assert.ok(p.includes('falls asleep after a while')); assert.match(p, /never fake a pose the character already has drawn/); }
  console.log('overlap checks passed');
}

// Nothing built for one character reaches another.
{
  const { modsFor, readQuipPacks } = require(path.join(root, 'mods.js'));
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'toshi-own-'));
  const mod = (slug, owner) => { fs.mkdirSync(path.join(d, 'mods', slug), { recursive: true }); fs.writeFileSync(path.join(d, 'mods', slug, 'mod.js'), '//'); if (owner) fs.writeFileSync(path.join(d, 'mods', slug, 'owner.json'), JSON.stringify({ character: owner })); };
  mod('toshi-tea', 'toshitoshi'); mod('bambi-boom', 'bambietta'); mod('shared-sample'); mod('bad-owner'); fs.writeFileSync(path.join(d, 'mods', 'bad-owner', 'owner.json'), '{ "character": "../x" }');
  const slugs = (id, ups = []) => modsFor(d, [], ups, id).map((m) => m.slug).sort();
  // With no jar record at all (the project copied to a friend), the owner file decides.
  assert.deepStrictEqual(slugs('toshitoshi'), ['bad-owner', 'shared-sample', 'toshi-tea']);
  assert.deepStrictEqual(slugs('bambietta'), ['bad-owner', 'bambi-boom', 'shared-sample']);
  assert.deepStrictEqual(slugs('kori-test'), ['bad-owner', 'shared-sample']);
  // The jar's record wins over the file.
  assert.deepStrictEqual(slugs('bambietta', [{ slugs: ['toshi-tea'], characterId: 'bambietta' }]), ['bad-owner', 'bambi-boom', 'shared-sample', 'toshi-tea']);
  // Quip packs written by an upgrade stay with its character.
  fs.mkdirSync(path.join(d, 'content', 'quips'), { recursive: true });
  fs.writeFileSync(path.join(d, 'content', 'quips', 'tea.json'), JSON.stringify(['Tea time.']));
  fs.writeFileSync(path.join(d, 'content', 'quips', 'common.json'), JSON.stringify(['Hello.']));
  const ups = [{ characterId: 'toshitoshi', slugs: ['toshi-tea'], files: ['mods/toshi-tea/mod.js', 'content/quips/tea.json'] }];
  const lines = (id) => readQuipPacks(d, { upgrades: ups, characterId: id }).map((q) => q.text).sort();
  assert.deepStrictEqual(lines('toshitoshi'), ['Hello.', 'Tea time.']);
  assert.deepStrictEqual(lines('bambietta'), ['Hello.']);
  fs.rmSync(d, { recursive: true, force: true });
  console.log('ownership checks passed');
}
