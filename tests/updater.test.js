// The updater: which copy can be updated, what an update replaces, and what of
// the user's it keeps. No network: versions are made up and "downloads" are
// folders built here.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const up = require(path.join(__dirname, '..', 'src', 'main', 'updater.js'));

let passed = 0;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'toshi-upd-'));
const check = (name, fn) => { try { fn(); passed++; } catch (e) { console.log(`FAIL ${name}: ${e.stack}`); process.exitCode = 1; } };
const V1 = 'a'.repeat(40), V2 = 'b'.repeat(40);
function make(dir, version, files) {
  for (const [rel, text] of Object.entries({ 'package.json': '{"repository":"github:someone/thing","devDependencies":{"electron":"^45.0.0"}}', 'src/main/main.js': '// app', ...files })) {
    const f = path.join(dir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
  }
  if (version) fs.writeFileSync(path.join(dir, 'version.txt'), `${version}\n2026-11-14T00:00:00Z\n`);
  return dir;
}
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');

check('a git checkout or unmarked copy is a dev copy and is never updated', () => {
  const dev = make(path.join(work, 'dev'), null, {});
  fs.writeFileSync(path.join(dev, 'version.txt'), '$Format:%H%n%cI$\n');
  assert.strictEqual(up.localVersion(dev).dev, true);
  assert.strictEqual(up.localVersion(path.join(work, 'nowhere')).dev, true);
  assert.strictEqual(up.ensureManifest(dev), false);
  const zipCopy = make(path.join(work, 'zipcopy'), V1, {});
  assert.deepStrictEqual(up.localVersion(zipCopy), { sha: V1, date: '2026-11-14T00:00:00Z', dev: false });
  assert.strictEqual(up.repoOf(zipCopy), 'someone/thing');
});

check('the plan: app files replaced, the user\'s kept, untouched bundled files refreshed', () => {
  const recorded = { 'src/a.js': 'A1', 'characters/toshi/character.json': 'T1', 'characters/bambi/character.json': 'B1', 'mods/sample/mod.js': 'M1', 'docs/old.md': 'O1', 'docs/edited-old.md': 'E1' };
  const local = { 'src/a.js': 'A1-user-tinkered', 'characters/toshi/character.json': 'T1', 'characters/bambi/character.json': 'B1-user-edit', 'characters/mine/character.json': 'MINE', 'mods/sample/mod.js': 'M1', 'mods/built-here/mod.js': 'BUILT', 'docs/old.md': 'O1', 'docs/edited-old.md': 'E1-edit' };
  const incoming = { 'src/a.js': 'A2', 'src/new.js': 'N2', 'characters/toshi/character.json': 'T2', 'characters/bambi/character.json': 'B2', 'mods/sample/mod.js': 'M1', 'node_modules/x/index.js': 'EVIL', '.git/config': 'EVIL' };
  const p = up.plan(local, incoming, recorded);
  assert.deepStrictEqual(p.write, ['characters/toshi/character.json', 'src/a.js', 'src/new.js']);
  assert.deepStrictEqual(p.keep, ['characters/bambi/character.json']);
  assert.deepStrictEqual(p.remove, ['docs/old.md']);
  // With no record of the install, anything of the user's folders that differs is kept.
  assert.deepStrictEqual(up.plan(local, incoming, null).keep, ['characters/bambi/character.json', 'characters/toshi/character.json']);
});

check('applying an update keeps imported characters, edits, and built tricks', () => {
  const root = make(path.join(work, 'install'), V1, {
    'src/main/main.js': '// app v1', 'src/old-file.js': '// gone in v2',
    'characters/toshi/character.json': '{"v":1}', 'characters/bambi/character.json': '{"v":1}',
    'mods/sample/mod.js': '// sample v1',
  });
  assert.strictEqual(up.ensureManifest(root), true);
  // What the user did since installing:
  fs.writeFileSync(path.join(root, 'characters/bambi/character.json'), '{"v":1,"mine":true}');
  make(root, null, { 'characters/my-pal/character.json': '{"name":"My Pal"}', 'mods/built-here/mod.js': '// a trick I paid for', 'characters/toshi/sheet-index.png': 'preview' });
  fs.mkdirSync(path.join(root, 'node_modules', 'electron'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'electron', 'package.json'), '{"version":"45.3.0"}');

  const next = make(path.join(work, 'download'), V2, {
    'src/main/main.js': '// app v2', 'src/new-file.js': '// new in v2',
    'characters/toshi/character.json': '{"v":2}', 'characters/bambi/character.json': '{"v":2}',
    'mods/sample/mod.js': '// sample v2',
  });
  const r = up.apply(root, next, { expectSha: V2 });
  assert.strictEqual(read(root, 'src/main/main.js'), '// app v2');
  assert.ok(fs.existsSync(path.join(root, 'src/new-file.js')));
  assert.ok(!fs.existsSync(path.join(root, 'src/old-file.js')), 'a file the new version dropped is removed');
  assert.strictEqual(read(root, 'characters/toshi/character.json'), '{"v":2}', 'an untouched bundled character is refreshed');
  assert.strictEqual(read(root, 'characters/bambi/character.json'), '{"v":1,"mine":true}', 'an edited character is kept');
  assert.strictEqual(read(root, 'characters/my-pal/character.json'), '{"name":"My Pal"}', 'an imported character is kept');
  assert.strictEqual(read(root, 'mods/built-here/mod.js'), '// a trick I paid for', 'a built trick is kept');
  assert.strictEqual(read(root, 'mods/sample/mod.js'), '// sample v2');
  assert.ok(fs.existsSync(path.join(root, 'node_modules', 'electron', 'package.json')), 'installed packages are not touched');
  assert.deepStrictEqual(r.keep, ['characters/bambi/character.json']);
  assert.strictEqual(up.localVersion(root).sha, V2);
  assert.strictEqual(up.readManifest(root).version, V2);
  // The next update still treats the edited file as the user's.
  const again = make(path.join(work, 'download3'), 'c'.repeat(40), { 'characters/bambi/character.json': '{"v":3}' });
  up.apply(root, again, {});
  assert.strictEqual(read(root, 'characters/bambi/character.json'), '{"v":1,"mine":true}');
});

check('a download that is not this app, or not the version asked for, is refused', () => {
  const root = make(path.join(work, 'install2'), V1, {});
  const junk = path.join(work, 'junk'); fs.mkdirSync(junk); fs.writeFileSync(path.join(junk, 'readme.txt'), 'hi');
  assert.throws(() => up.apply(root, junk, {}), /does not look like this app/);
  const other = make(path.join(work, 'other'), V2, {});
  assert.throws(() => up.apply(root, other, { expectSha: 'd'.repeat(40) }), /not the version that was asked for/);
  const unmarked = make(path.join(work, 'unmarked'), null, {});
  assert.throws(() => up.apply(root, unmarked, {}), /not the version/);
  assert.strictEqual(up.localVersion(root).sha, V1, 'nothing changed');
});

(async () => {
  const fake = (body, ok = true, status = 200) => async () => ({ ok, status, json: async () => body });
  const root = path.join(work, 'zipcopy');
  try {
    let c = await up.check(root, { fetchImpl: fake({ sha: V1, commit: { message: 'Same', committer: { date: 'x' } } }) });
    assert.strictEqual(c.available, false);
    c = await up.check(root, { fetchImpl: fake({ sha: V2, commit: { message: 'Fix the thing\n\nlong text', committer: { date: '2026-11-15T00:00:00Z' } } }) });
    assert.strictEqual(c.available, true);
    assert.strictEqual(c.latest.summary, 'Fix the thing');
    await assert.rejects(up.check(root, { fetchImpl: fake({}, false, 403) }), /limiting requests/);
    await assert.rejects(up.check(root, { fetchImpl: fake({ sha: 'nope' }) }), /unexpected answer/);
    const dev = await up.check(path.join(work, 'dev'), { fetchImpl: async () => { throw new Error('a dev copy must not call out'); } });
    assert.strictEqual(dev.dev, true);
    passed++;
  } catch (e) { console.log(`FAIL checking for a newer version: ${e.stack}`); process.exitCode = 1; }
  console.log(`${passed} passed, ${process.exitCode ? 'some' : 0} failed`);
  fs.rmSync(work, { recursive: true, force: true });
})();
