'use strict';
// The jar's book of record. Everything is in raw tokens (input + output +
// cache writes + cache reads as reported by the run). Persisted as JSON.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LEVELS = [
  { level: 1, xp: 0,        title: 'Recruit' },
  { level: 2, xp: 50000,    title: 'Clerk' },
  { level: 3, xp: 200000,   title: 'Officer' },
  { level: 4, xp: 500000,   title: 'Lieutenant' },
  { level: 5, xp: 1500000,  title: 'Frost Commander' },
];

const EMPTY = {
  balance: 0,
  pledged: 0,
  lifetimeDonated: 0,
  lifetimeSpent: 0,
  donations: [],
  spends: [],
  goals: [],
  upgrades: [],
  disabledMods: [],
  calibration: { tokensPerPercent: null, samples: [] },
  guard: { last: null, frozenUntil: 0 },
};

function id() { return crypto.randomBytes(5).toString('hex'); }

class Ledger {
  constructor(userDataDir) {
    this.file = path.join(userDataDir, 'ledger.json');
    this.data = JSON.parse(JSON.stringify(EMPTY));
    this.listeners = new Set();
    try {
      if (fs.existsSync(this.file)) {
        const loaded = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        this.data = { ...JSON.parse(JSON.stringify(EMPTY)), ...loaded };
      }
    } catch (e) { console.error('ledger: failed to load', e); }
    // Older versions let fees push the balance below zero; that was a bug.
    if (!(this.data.balance >= 0)) this.data.balance = 0;
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (e) { console.error('ledger: failed to save', e); }
    for (const fn of this.listeners) { try { fn(); } catch (_) { /* ignore */ } }
  }

  // ---- XP / level ----
  level() {
    const xp = this.data.lifetimeDonated;
    let cur = LEVELS[0];
    for (const l of LEVELS) if (xp >= l.xp) cur = l;
    const next = LEVELS.find((l) => l.level === cur.level + 1) || null;
    return { ...cur, xp, next, progress: next ? Math.min(1, (xp - cur.xp) / (next.xp - cur.xp)) : 1 };
  }

  // ---- donations ----
  // Accept up to `ceiling` tokens now; queue the remainder as a pledge.
  donate(tokens, { ceiling = Infinity, goalId = null, note = '' } = {}) {
    tokens = Math.max(0, Math.floor(Number(tokens) || 0));
    if (!tokens) return { accepted: 0, pledged: 0 };
    const accepted = Math.min(tokens, Math.max(0, Math.floor(ceiling)));
    const pledged = tokens - accepted;
    if (accepted) {
      this.data.lifetimeDonated += accepted;
      const goal = goalId ? this.goal(goalId) : null;
      if (goal && ['open', 'paused', 'failed'].includes(goal.status)) {
        goal.funded += accepted;
        this._refreshGoalStatus(goal);
      } else {
        this.data.balance += accepted;
      }
      this.data.donations.push({ id: id(), at: Date.now(), tokens: accepted, goalId: goal ? goal.id : null, note });
    }
    if (pledged) this.data.pledged += pledged;
    this.save();
    return { accepted, pledged };
  }

  // Convert queued pledges into balance, up to `maxTokens`.
  releasePledges(maxTokens) {
    const take = Math.min(this.data.pledged, Math.max(0, Math.floor(maxTokens)));
    if (!take) return 0;
    this.data.pledged -= take;
    this.data.balance += take;
    this.data.lifetimeDonated += take;
    this.data.donations.push({ id: id(), at: Date.now(), tokens: take, goalId: null, note: 'released pledge' });
    this.save();
    return take;
  }

  // ---- goals ----
  goal(goalId) { return this.data.goals.find((g) => g.id === goalId) || null; }
  addGoal(g) {
    const goal = {
      id: id(),
      createdAt: Date.now(),
      title: g.title || 'Untitled upgrade',
      summary: g.summary || '',
      request: g.request || '',
      size: g.size || 'M',
      goalTokens: Math.max(1000, Math.floor(g.goalTokens || 0)),
      funded: 0,
      spent: 0,
      status: 'open', // open | funded | building | paused | done | failed
      source: g.source || 'user',
      risk: g.risk || '',
      touchesCore: !!g.touchesCore,
      sessionId: null,
      needTokens: 0,
      note: '',
      model: null,
      history: [],
    };
    this.data.goals.unshift(goal);
    this.save();
    return goal;
  }
  updateGoal(goalId, patch) {
    const goal = this.goal(goalId);
    if (!goal) return null;
    Object.assign(goal, patch);
    this._refreshGoalStatus(goal);
    this.save();
    return goal;
  }
  _refreshGoalStatus(goal) {
    if (['building', 'done'].includes(goal.status)) return;
    if (goal.status === 'paused' || goal.status === 'failed') {
      if (goal.needTokens > 0 && goal.funded - goal.spent >= goal.needTokens) goal.status = 'funded';
      return;
    }
    goal.status = goal.funded >= goal.goalTokens ? 'funded' : 'open';
  }
  fundGoal(goalId, tokens) {
    const goal = this.goal(goalId);
    tokens = Math.max(0, Math.floor(Number(tokens) || 0));
    if (!goal || !tokens) return { moved: 0 };
    // Never move more than the goal still needs.
    const target = ['paused', 'failed'].includes(goal.status) && goal.needTokens ? goal.spent + goal.needTokens : goal.goalTokens;
    const stillNeeded = Math.max(0, target - goal.funded);
    const moved = Math.max(0, Math.min(tokens, this.data.balance, stillNeeded));
    this.data.balance -= moved;
    goal.funded += moved;
    this._refreshGoalStatus(goal);
    this.save();
    return { moved };
  }
  removeGoal(goalId) {
    const goal = this.goal(goalId);
    if (!goal || goal.status === 'building') return false;
    // Unspent funding goes back to the jar.
    const refund = Math.max(0, goal.funded - goal.spent);
    this.data.balance += refund;
    this.data.goals = this.data.goals.filter((g) => g.id !== goalId);
    this.save();
    return true;
  }

  // ---- spends / upgrades ----
  recordSpend(spend) {
    const entry = { id: id(), at: Date.now(), ...spend };
    this.data.spends.unshift(entry);
    this.data.lifetimeSpent += spend.tokens || 0;
    if (this.data.spends.length > 500) this.data.spends.length = 500;
    this.save();
    return entry;
  }
  // Fees (usage checks, estimates) come out of whatever is in the jar, never
  // below zero; the full amount is still logged as a spend.
  chargeFee(tokens, kind) {
    tokens = Math.max(0, Math.floor(tokens || 0));
    if (!tokens) return;
    const paid = Math.min(tokens, Math.max(0, this.data.balance));
    this.data.balance -= paid;
    this.recordSpend({ kind, tokens, paid, goalId: null });
  }
  recordUpgrade(up) {
    const entry = { id: id(), at: Date.now(), reverted: false, ...up };
    this.data.upgrades.unshift(entry);
    this.save();
    return entry;
  }
  upgrade(upgradeId) { return this.data.upgrades.find((u) => u.id === upgradeId) || null; }

  // ---- calibration: tokens per percent of the binding plan window ----
  calibrate(tokens, deltaPercent) {
    if (!(tokens > 0) || !(deltaPercent >= 0.5)) return;
    const s = this.data.calibration.samples;
    s.push({ at: Date.now(), tokens, deltaPercent, tpp: tokens / deltaPercent });
    if (s.length > 8) s.shift();
    const sorted = s.map((x) => x.tpp).sort((a, b) => a - b);
    // Median keeps one odd window from skewing the estimate.
    this.data.calibration.tokensPerPercent = sorted[Math.floor(sorted.length / 2)];
    this.save();
  }

  snapshot() {
    return {
      balance: this.data.balance,
      pledged: this.data.pledged,
      lifetimeDonated: this.data.lifetimeDonated,
      lifetimeSpent: this.data.lifetimeSpent,
      level: this.level(),
      goals: this.data.goals,
      upgrades: this.data.upgrades.slice(0, 50),
      spends: this.data.spends.slice(0, 30),
      donations: this.data.donations.slice(-30).reverse(),
      calibration: this.data.calibration,
      guard: this.data.guard,
      disabledMods: this.data.disabledMods,
    };
  }
}

module.exports = { Ledger, LEVELS };
