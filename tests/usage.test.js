// Plan-usage readings in the format Claude Code reports today (per-window
// fractions in unifiedWindows) and the older single-number format. No Claude calls.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const root = path.join(__dirname, '..', 'src', 'main');
const { Ledger } = require(path.join(root, 'jar/ledger.js'));
const { Guard, normalizeRateLimit } = require(path.join(root, 'jar/guard.js'));
const { Settings } = require(path.join(root, 'settings.js'));

let passed = 0;
const check = (name, fn) => { fn(); passed++; };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toshi-usage-'));
const ledger = new Ledger(dir);
const settings = new Settings(dir);
const guard = new Guard({ ledger, settings, projectRoot: dir, log: () => {} });
const sec = (h) => Math.floor(Date.now() / 1000) + h * 3600;
const event = (five, week, extra = {}) => ({
  status: 'allowed', resetsAt: sec(3), rateLimitType: 'five_hour', overageStatus: 'rejected', isUsingOverage: false,
  unifiedWindows: {
    five_hour: { utilization: five, resetsAt: sec(3), status: 'allowed' },
    seven_day: { utilization: week, resetsAt: sec(100), status: 'allowed' },
  },
  ...extra,
});

check('new format: binding window is the fullest one, in percent', () => {
  const n = normalizeRateLimit(event(0.02, 0.14));
  assert.strictEqual(Math.round(n.utilization), 14);
  assert.strictEqual(Math.round(n.windows.five_hour.utilization), 2);
  assert.strictEqual(n.resetsAt, sec(100) * 1000);
  assert.strictEqual(n.overageEnabled, false);
});
check('stale 98% is replaced by the new reading', () => {
  ledger.data.guard.last = { at: Date.now() - 3 * 86400000, source: 'rate_limit_event', status: 'allowed_warning', utilization: 98, resetsAt: null, overageEnabled: false, errorCode: null, windows: null };
  guard.observe(event(0.02, 0.14));
  const s = guard.status();
  assert.strictEqual(Math.round(s.utilization), 14);
  assert.strictEqual(s.status, 'allowed');
  assert.ok(s.fresh);
  assert.ok(s.windows.five_hour && s.windows.seven_day);
  assert.ok(guard.canStart().ok);
});
check('a reading with no usage number does not make an old one look fresh', () => {
  ledger.data.guard.last = { at: Date.now() - 3 * 86400000, source: 'rate_limit_event', status: 'allowed', utilization: 40, resetsAt: null, overageEnabled: false, errorCode: null, windows: null };
  guard.observe({ status: 'allowed' });
  assert.strictEqual(guard.status().fresh, false);
  assert.strictEqual(guard.canStart().ok, false);
});
check('over the cap in either window refuses runs and stops a running one', () => {
  guard.observe(event(0.85, 0.30));
  assert.strictEqual(guard.canStart().ok, false);
  assert.match(guard.killReason(event(0.85, 0.30)), /cap/);
  assert.match(guard.killReason(event(0.10, 0.90)), /cap/);
  assert.strictEqual(guard.killReason(event(0.10, 0.20)), null);
});
check('a warning or rejection in any window counts', () => {
  const warn = event(0.5, 0.5); warn.unifiedWindows.seven_day.status = 'allowed_warning';
  assert.match(guard.killReason(warn), /warning/);
  const rej = event(0.5, 0.5); rej.unifiedWindows.five_hour.status = 'rejected';
  assert.match(guard.killReason(rej), /limit reached/);
  guard.observe(rej);
  assert.ok(guard.status().frozenUntil > Date.now());
  assert.strictEqual(guard.maxSafeDonation(), 0);
  ledger.data.guard.frozenUntil = 0;
});
check('overage on tightens the cap', () => {
  guard.observe(event(0.1, 0.1, { overageStatus: 'allowed' }));
  assert.strictEqual(guard.maxUtilization, 70);
});
check('old format still works (fraction and percent)', () => {
  assert.strictEqual(normalizeRateLimit({ status: 'allowed', utilization: 0.5 }).utilization, 50);
  assert.strictEqual(normalizeRateLimit({ status: 'allowed', utilization: 62 }).utilization, 62);
});
check('usage-endpoint readings are already percents', () => {
  guard.observe({ status: 'allowed', utilization: 0.8, windows: null }, 'usage_endpoint');
  assert.strictEqual(guard.status().utilization, 0.8);
});
console.log(`${passed} passed, 0 failed`);
