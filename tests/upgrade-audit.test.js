// The upgrade audit (src/main/jar/upgrader.js + git.js), in a throwaway git repo:
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
const { Git, RUN_DIRS } = require(path.join(__dirname, '..', 'src', 'main', 'jar', 'git.js'));
const { Upgrader } = require(path.join(__dirname, '..', 'src', 'main', 'jar', 'upgrader.js'));

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-audit-'));
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
    write('mods/.keep', '');
    write('content/quips/.keep', '');
    g('add', '-A'); g('commit', '-q', '-m', 'start');

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
      projectRoot: repo, ledger, guard: {}, settings: { get: () => null }, git,
      log: () => {}, emit: () => {}, reloadAndAwaitMods: async (slugs) => slugs.map((slug) => ({ slug, ok: true })),
    });

    // Run 1: a well-behaved run writes a mod.
    up.preRun = await up.dirtySnapshot();
    write('mods/hat/mod.js', "BuddyMods.register({ id: 'hat' });\n");
    const r1 = await up._finishSuccess(goal, { structuredOutput: { title: 'Hat' } }, 'haiku', 1000);
    ok(r1.ok, 'a good run succeeds: ' + JSON.stringify(r1));
    const committed = g('show', '--name-only', '--pretty=format:', 'HEAD').split('\n').filter(Boolean);
    ok(committed.length === 1 && committed[0] === 'mods/hat/mod.js', 'the upgrade commit holds only the mod: ' + committed.join(','));
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

    console.log(`${pass} passed, 0 failed`);
  } catch (e) {
    console.log('FAIL', e.message);
    process.exitCode = 1;
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
})();
