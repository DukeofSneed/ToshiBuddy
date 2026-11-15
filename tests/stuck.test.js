'use strict';
// A goal left as "building" after the app closed mid-build must come back to a
// state the user can act on: fundable, startable, removable.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Ledger } = require('../src/main/jar/ledger.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toshi-stuck-'));
const ledger = new Ledger(dir);
ledger.data.balance = 20000;
const mk = (title, patch) => {
  const g = { id: title, title, goalTokens: 4000, funded: 0, spent: 0, status: 'open', ...patch };
  ledger.data.goals.push(g);
  return g;
};
const rich = mk('rich', { funded: 4000, spent: 1500, status: 'building', waiting: true });
const broke = mk('broke', { funded: 4000, spent: 3800, status: 'building' });
const done = mk('done', { funded: 4000, spent: 3000, status: 'done' });
const open = mk('open', {});

// the stuck state really is a dead end
assert.strictEqual(ledger.fundGoal('broke', 5000).moved, 0, 'a building goal takes no tokens');
assert.strictEqual(ledger.removeGoal('broke'), false);

const changed = ledger.recoverInterrupted().map((g) => g.id);
assert.deepStrictEqual(changed, ['rich', 'broke']);

// enough tokens left: ready to start again
assert.strictEqual(rich.status, 'funded');
assert.strictEqual(rich.waiting, false);
assert.ok(/cut off/.test(rich.note));

// not enough: paused, asks for more, and a top-up makes it ready
assert.strictEqual(broke.status, 'paused');
assert.strictEqual(broke.needTokens, 5000);
assert.strictEqual(ledger.fundGoal('broke', 13000).moved, 4800, 'takes only what it still needs');
assert.strictEqual(broke.status, 'funded');

// others untouched, and nothing more to recover
assert.strictEqual(done.status, 'done');
assert.strictEqual(open.status, 'open');
assert.deepStrictEqual(ledger.recoverInterrupted(), []);

// saved to disk
assert.strictEqual(new Ledger(dir).goal('rich').status, 'funded');

fs.rmSync(dir, { recursive: true, force: true });
console.log('stuck.test.js: ok');

// A run that booked more than the goal held must not swallow top-ups.
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'toshi-gap-'));
  const l = new Ledger(d);
  l.data.balance = 20000;
  // old data: 30k booked against 4k funding, then the user moved 13k in
  l.data.goals.push({ id: 'gap', title: 'gap', goalTokens: 4000, funded: 17000, spent: 30000, needTokens: 5000, status: 'paused' });
  const fixed = l.repairOverspent();
  assert.strictEqual(fixed.length, 1);
  assert.strictEqual(fixed[0].refund, 13000, 'the top-up comes back');
  assert.strictEqual(l.data.balance, 33000);
  const g = l.goal('gap');
  assert.strictEqual(g.funded - g.spent, 0);
  // now funding goes toward the build, and only what it needs
  assert.strictEqual(l.fundGoal('gap', 99999).moved, 5000);
  assert.strictEqual(g.funded - g.spent, 5000);
  assert.strictEqual(g.status, 'funded');
  assert.deepStrictEqual(l.repairOverspent(), []);
  // even without the repair, a gap never eats a top-up
  l.data.goals.push({ id: 'gap2', title: 'gap2', goalTokens: 4000, funded: 4000, spent: 9000, needTokens: 5000, status: 'paused' });
  assert.strictEqual(l.fundGoal('gap2', 99999).moved, 5000);
  fs.rmSync(d, { recursive: true, force: true });
  console.log('stuck.test.js: gap ok');
}
