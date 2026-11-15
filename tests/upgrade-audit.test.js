// The upgrade audit (src/main/jar/upgrader.js + git.js), in a throwaway git repo
// that uses the real .gitignore:
// - built tricks are committed only to the private history (ModHistory, in
//   userData), never to the project's repo, which ignores them;
// - undo reverts in that history, and for a trick recorded before it existed
//   removes the trick's own files, never files the app ships;
// - unsaved edits outside mods/ and content/ (an imported character, a mapper
//   save) must not block a run, get committed with it, or be wiped by cleanup;
// - a run that changes a file outside mods/ and content/ fails, and that change
//   is undone.
// Needs git on PATH. No Claude calls.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { Git, ModHistory, RUN_DIRS } = require(path.join(__dirname, '..', 'src', 'main', 'jar', 'git.js'));
const { Upgrader } = require(path.join(__dirname, '..', 'src', 'main', 'jar', 'upgrader.js'));

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-audit-'));
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-audit-ud-'));
const g = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const write = (rel, text) => { fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true }); fs.writeFileSync(path.join(repo, rel), text); };
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');

let pass = 0;
const ok = (c, m) => { assert.ok(c, m); pass++; };

(async () => {
  try {
    g('init', '-q', '-b', 'main');
    g('config', 'user.name', 'test'); g('config', 'user.email', 'test@localhost');
    g('config', 'core.autocrlf', 'false'); // compare file text exactly
    write('characters/hero/character.json', '{"name":"Hero"}\n');
    write('src/app.js', '// app\n');
    fs.copyFileSync(path.join(__dirname, '..', '.gitignore'), path.join(repo, '.gitignore'));
    write('mods/sample-earmuffs/mod.js', '// shipped\n');
    write('content/catalog.json', '[]\n');
    write('mods/old-trick/mod.js', '// built before tricks had their own history\n');
    g('add', '-A'); g('commit', '-q', '-m', 'start');
    const tracked = g('ls-files').split('\n');
    ok(tracked.includes('mods/sample-earmuffs/mod.js') && tracked.includes('content/catalog.json'), 'what ships with the app is tracked');
    ok(!tracked.some((f) => f.startsWith('mods/old-trick/')), 'a built trick is not tracked by the shared repo');
    const projectCommits = () => Number(g('rev-list', '--count', 'HEAD'));
    const before = projectCommits();
    const history = new ModHistory(path.join(userData, 'mod-history'), repo);
    await history.ensureRepo();
    await history.commitAll('chore: as found');

    const git = new Git(repo);
    // The user saves in the mapper: an unsaved change outside the run folders.
    write('characters/hero/character.json', '{"name":"Hero","edited":true}\n');
    ok(await git.isClean(RUN_DIRS), 'an unsaved character edit does not count as dirty for upgrades');
    ok(!(await git.isClean()), 'the whole project is dirty (sanity)');

    const goal = { id: 'g1', title: 'Hat', summary: '', goalTokens: 20000, funded: 20000, spent: 0, history: [] };
    const ledger = {
      data: { balance: 0 },
      goal: () => goal,
      updateGoal: (id, patch) => Object.assign(goal, patch),
      recordUpgrade: (u) => ({ id: 'u1', ...u }),
    };
    const up = new Upgrader({
      projectRoot: repo, ledger, guard: {}, settings: { get: () => null }, git, history,
      log: () => {}, emit: () => {}, reloadAndAwaitMods: async (slugs) => slugs.map((slug) => ({ slug, ok: true })),
    });

    // Run 1: a well-behaved run writes a mod.
    up.preRun = await up.dirtySnapshot();
    write('mods/hat/mod.js', "BuddyMods.register({ id: 'hat' });\n");
    const r1 = await up._finishSuccess(goal, { structuredOutput: { title: 'Hat' } }, 'haiku', 1000);
    ok(r1.ok, 'a good run succeeds: ' + JSON.stringify(r1));
    const committed = (await history.run(['show', '--name-only', '--pretty=format:', 'HEAD'])).split(/\r?\n/).filter(Boolean);
    ok(committed.length === 1 && committed[0] === 'mods/hat/mod.js', 'the private history holds the trick: ' + committed.join(','));
    ok(projectCommits() === before && g('status', '--porcelain') === 'M characters/hero/character.json', 'the shared repo got no commit and sees nothing of the trick: ' + g('status', '--porcelain'));
    ok(read('characters/hero/character.json').includes('"edited":true'), 'the unsaved character edit survives');

    // Run 2: a run that breaks the rules and edits app code.
    goal.status = 'funded';
    up.preRun = await up.dirtySnapshot();
    write('mods/bad/mod.js', "BuddyMods.register({ id: 'bad' });\n");
    write('src/app.js', '// changed by the run\n');
    write('src/new-file.js', '// added by the run\n');
    const r2 = await up._finishSuccess(goal, { structuredOutput: { title: 'Bad' } }, 'haiku', 1000);
    ok(!r2.ok && /outside mods\/ and content\//.test(r2.reason), 'a run touching src/ fails: ' + r2.reason);
    ok(read('src/app.js') === '// app\n', "the run's change to src/app.js is undone");
    ok(!fs.existsSync(path.join(repo, 'src/new-file.js')), "the run's new file is removed");
    ok(!fs.existsSync(path.join(repo, 'mods/bad')), "the run's mod is removed");
    ok(read('characters/hero/character.json').includes('"edited":true'), 'the unsaved character edit still survives');

    // Undo, both ways.
    const records = {
      u1: { id: 'u1', title: 'Hat', commit: r1.upgrade.commit, slugs: ['hat'], files: ['mods/hat/mod.js'] },
      u0: { id: 'u0', title: 'Old trick', commit: 'abc1234', slugs: ['old-trick', 'sample-earmuffs'], files: ['mods/old-trick/mod.js', 'content/catalog.json'] },
    };
    ledger.upgrade = (id) => records[id];
    ledger.save = () => {};
    const u1 = await up.undo('u1');
    ok(u1.ok && !fs.existsSync(path.join(repo, 'mods/hat')), 'undo reverts the trick in the private history: ' + JSON.stringify(u1));
    const u0 = await up.undo('u0');
    ok(u0.ok && !fs.existsSync(path.join(repo, 'mods/old-trick')), 'an older trick is undone by removing its files: ' + JSON.stringify(u0));
    ok(fs.existsSync(path.join(repo, 'mods/sample-earmuffs/mod.js')) && fs.existsSync(path.join(repo, 'content/catalog.json')), 'files the app ships are never removed');
    ok(projectCommits() === before, 'still no commit in the shared repo');

    console.log(`${pass} passed, 0 failed`);
  } catch (e) {
    console.log('FAIL', e.message);
    process.exitCode = 1;
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(userData, { recursive: true, force: true });
  }
})();
