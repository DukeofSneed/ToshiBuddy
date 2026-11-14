// A funded goal that the plan has no room for waits and starts by itself after
// the plan resets. Real ledger, guard and upgrader gate; no Claude calls (the
// usage probe and the build itself are stubbed).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const root = path.join(__dirname, '..', 'src', 'main');
const { Ledger } = require(path.join(root, 'jar/ledger.js'));
const { Guard } = require(path.join(root, 'jar/guard.js'));
const { Settings } = require(path.join(root, 'settings.js'));
const { Upgrader } = require(path.join(root, 'jar/upgrader.js'));
const { WaitingQueue } = require(path.join(root, 'jar/waiting.js'));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toshi-wait-'));
const ledger = new Ledger(dir);
const settings = new Settings(dir);
const guard = new Guard({ ledger, settings, projectRoot: dir, log: () => {} });

// The next reading a usage probe will return (fractions, as Claude Code reports).
let reading = { five: 0.9, week: 0.3, resetIn: 2 * 3600 };
const sec = (s) => Math.floor(Date.now() / 1000) + s;
const observe = () => guard.observe({
  status: 'allowed',
  unifiedWindows: {
    five_hour: { utilization: reading.five, resetsAt: sec(reading.resetIn), status: 'allowed' },
    seven_day: { utilization: reading.week, resetsAt: sec(100 * 3600), status: 'allowed' },
  },
});
let probes = 0;
guard._probe = async () => { probes++; observe(); return guard.status(); };

const events = [];
const upgrader = new Upgrader({ projectRoot: dir, ledger, guard, settings, log: () => {}, emit: (e) => events.push(e), git: {}, character: () => ({ name: 'T', isSkin: true }) });
// Past the guard gate, a real build would start Claude: stop there and record it.
const built = [];
upgrader.git = { ensureRepo: async () => { throw new Error('stub: build would start here'); } };
const realBuild = upgrader.build.bind(upgrader);
upgrader.build = async (id, opts) => { const r = await realBuild(id, opts); if (/stub/.test(r.reason || '')) { built.push(id); ledger.updateGoal(id, { waiting: false, status: 'building' }); return { ok: true }; } return r; };

const timers = { set: (fn, ms) => { timers.last = { fn, ms }; return timers.last; }, clear: () => { timers.last = null; }, last: null };
const started = [];
const queue = new WaitingQueue({ ledger, guard, upgrader, settings, log: () => {}, onStart: (g) => started.push(g.title), timers });

// A usage check reuses a reading younger than 90 seconds; the queue's checks come later than that.
const age = () => { if (ledger.data.guard.last) ledger.data.guard.last.at -= 2 * 60 * 1000; };
let passed = 0;
const step = async (name, fn) => { try { await fn(); passed++; } catch (e) { console.log(`FAIL ${name}: ${e.stack}`); process.exitCode = 1; } };

(async () => {
  const goal = ledger.addGoal({ title: 'Party hat', goalTokens: 20000 });
  ledger.donate(20000, { goalId: goal.id });

  await step('over the cap: the build is refused and the goal waits', async () => {
    observe();
    const r = await upgrader.build(goal.id);
    assert.strictEqual(r.ok, false);
    const g = ledger.goal(goal.id);
    assert.strictEqual(g.waiting, true);
    assert.strictEqual(g.status, 'funded');
    assert.strictEqual(g.funded, 20000, 'the tokens stay on the goal');
    assert.match(g.note, /Waiting for room in your plan/);
    assert.strictEqual(events.filter((e) => e.phase === 'blocked').length, 1);
    assert.strictEqual(events[0].willRetry, true);
  });

  await step('it is scheduled for just after the reset', async () => {
    queue.schedule();
    assert.ok(timers.last, 'a timer is set');
    const twoHours = 2 * 3600 * 1000;
    assert.ok(timers.last.ms > twoHours && timers.last.ms <= twoHours + 2 * 60 * 1000, `delay ${timers.last.ms}`);
  });

  await step('still over the cap at the check: nothing starts, no second notice', async () => {
    const out = await (age(), queue.tick());
    assert.strictEqual(out, 'still-blocked');
    assert.strictEqual(built.length, 0);
    assert.ok(probes >= 1, 'usage was re-read');
    assert.strictEqual(events.filter((e) => e.phase === 'blocked').length, 1);
    assert.ok(timers.last, 'it is scheduled again');
  });

  await step('frozen by a plan limit: nothing starts', async () => {
    guard.observe({ status: 'rejected', resetsAt: sec(3600) });
    guard._probe = async () => { probes++; return guard.status(); };
    assert.strictEqual(await (age(), queue.tick()), 'still-blocked');
    assert.strictEqual(built.length, 0);
    const hour = 3600 * 1000;
    assert.ok(timers.last.ms > hour - 5000 && timers.last.ms <= hour + 2 * 60 * 1000, 'waits for the freeze to end');
    ledger.data.guard.frozenUntil = 0;
    guard._probe = async () => { probes++; observe(); return guard.status(); };
  });

  await step('turned off: nothing is scheduled or started', async () => {
    settings.set('autoRetry', false);
    queue.schedule();
    assert.strictEqual(timers.last, null);
    reading = { five: 0.05, week: 0.3, resetIn: 5 * 3600 };
    assert.strictEqual(await (age(), queue.tick()), 'idle');
    assert.strictEqual(built.length, 0);
    settings.set('autoRetry', true);
  });

  await step('after the reset the goal starts by itself', async () => {
    reading = { five: 0.05, week: 0.3, resetIn: 5 * 3600 };
    const out = await (age(), queue.tick());
    assert.strictEqual(out, 'started');
    assert.deepStrictEqual(built, [goal.id]);
    assert.deepStrictEqual(started, ['Party hat']);
    assert.strictEqual(ledger.goal(goal.id).waiting, false);
    assert.strictEqual(timers.last, null, 'nothing left to wait for');
  });

  console.log(`${passed} passed, ${process.exitCode ? 'some' : 0} failed`);
  fs.rmSync(dir, { recursive: true, force: true });
})();
