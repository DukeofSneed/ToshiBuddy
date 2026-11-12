// Offline checks for the jar's ledger and guard rules. No Claude calls.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const root = path.join(__dirname, '..', 'src', 'main');
const { Ledger } = require(path.join(root, 'jar/ledger.js'));
const { Guard } = require(path.join(root, 'jar/guard.js'));
const { Settings } = require(path.join(root, 'settings.js'));
const { capUsdForTokens } = require(path.join(root, 'jar/pricing.js'));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'askin-test-'));
const settings = new Settings(dir);
const ledger = new Ledger(dir);
const guard = new Guard({ ledger, settings, projectRoot: dir, log: () => {} });
let n = 0;
const ok = (name) => { n++; console.log('ok', n, name); };

// 1. Unknown usage: refuse to start, donation ceiling = calibration cap.
assert.strictEqual(guard.canStart().ok, false); ok('refuses to start with unknown usage');
assert.strictEqual(guard.maxSafeDonation(), 20000); ok('uncalibrated ceiling is calibrationRunTokens');

// 2. Donations clamp to the ceiling and pledge the rest.
let r = ledger.donate(50000000, { ceiling: guard.maxSafeDonation() });
assert.deepStrictEqual(r, { accepted: 20000, pledged: 49980000 }); ok('huge donation clamped, remainder pledged');
assert.strictEqual(ledger.data.balance, 20000);

// 3. Fraction vs percent utilization from rate_limit_event.
guard.observe({ status: 'allowed', utilization: 0.42, resetsAt: Math.floor(Date.now() / 1000) + 3600 });
assert.strictEqual(Math.round(guard.status().utilization), 42); ok('fraction utilization normalized to percent');
assert.ok(guard.status().resetsAt > Date.now()); ok('epoch seconds resetsAt converted to ms');
assert.strictEqual(guard.canStart().ok, true); ok('fresh 42% reading allows a run');

// 4. Calibration: 200k tokens moved the window 4% -> 50k tokens per percent.
ledger.calibrate(200000, 4);
assert.strictEqual(ledger.data.calibration.tokensPerPercent, 50000);
assert.strictEqual(guard.maxSafeDonation(), (80 - 42) * 50000); ok('calibrated ceiling = headroom x tokens-per-percent');

// 5. Kill rules during a run.
assert.ok(guard.killReason({ status: 'allowed_warning' })); ok('kills on allowed_warning');
assert.ok(guard.killReason({ status: 'rejected' })); ok('kills on rejected');
assert.ok(guard.killReason({ status: 'allowed', utilization: 0.81 })); ok('kills at 81% (cap 80)');
assert.strictEqual(guard.killReason({ status: 'allowed', utilization: 0.5 }), null); ok('keeps going at 50%');

// 6. Usage credits on -> cap tightens to 70.
guard.observe({ status: 'allowed', utilization: 0.72, overageEnabled: true });
assert.strictEqual(guard.status().maxUtilization, 70);
assert.strictEqual(guard.canStart().ok, false); ok('overage enabled tightens cap to 70 and blocks at 72%');
assert.strictEqual(guard.maxSafeDonation(), 0); ok('no donations past the cap');

// 7. Rejection freezes until reset.
guard.observe({ status: 'rejected', errorCode: 'credits_required', resetsAt: Math.floor(Date.now() / 1000) + 7200 });
assert.ok(guard.status().frozenUntil > Date.now());
assert.strictEqual(guard.canStart().ok, false); ok('credits_required freezes the jar');

// 8. Stale reading refuses.
ledger.data.guard = { last: { at: Date.now() - 20 * 60 * 1000, utilization: 10, status: 'allowed' }, frozenUntil: 0 };
assert.strictEqual(guard.canStart().ok, false); ok('stale reading refuses to start');

// 9. Goals: funding never exceeds what the goal needs; status flips to funded.
const g = ledger.addGoal({ title: 'Party hat', goalTokens: 25000 });
const before = ledger.data.balance;
const moved = ledger.fundGoal(g.id, 999999).moved;
assert.strictEqual(moved, Math.min(before, 25000)); ok('fund-from-jar capped at goal size');
ledger.donate(25000 - moved, { goalId: g.id });
assert.strictEqual(ledger.goal(g.id).status, 'funded'); ok('goal flips to funded when full');

// 10. Removing an unbuilt goal refunds the jar.
const bal = ledger.data.balance;
ledger.removeGoal(g.id);
assert.strictEqual(ledger.data.balance, bal + 25000); ok('removing a goal refunds unspent tokens');

// 11. Pledges release only up to the allowed amount.
const pledged = ledger.data.pledged;
assert.strictEqual(ledger.releasePledges(10000), 10000);
assert.strictEqual(ledger.data.pledged, pledged - 10000); ok('pledges release up to the ceiling');

// 12. Budget cap math.
assert.strictEqual(capUsdForTokens(25000, 'haiku'), 0.02); ok('25k haiku tokens -> $0.02 cap');
assert.strictEqual(capUsdForTokens(140000, 'sonnet'), 1.75); ok('140k sonnet tokens -> $1.75 cap');

// 13. Persistence round-trip.
const again = new Ledger(dir);
assert.strictEqual(again.data.balance, ledger.data.balance); ok('ledger persists to disk');

console.log(`\nALL ${n} CHECKS PASSED`);
