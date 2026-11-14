'use strict';
// Funded goals that couldn't start because the plan had no room wait here and
// start by themselves once it does. Plan capacity can't be reserved, so this is
// what keeps donated tokens from being stranded. The guard decides, as always:
// nothing starts unless guard.canStart() passes on a fresh reading.

const MIN_MS = 60 * 1000;
const DEFAULT_MS = 30 * 60 * 1000;
const MAX_MS = 6 * 60 * 60 * 1000;

class WaitingQueue {
  constructor({ ledger, guard, upgrader, settings, log, onStart, filter, timers, now }) {
    this.ledger = ledger;
    this.guard = guard;
    this.upgrader = upgrader;
    this.settings = settings;
    this.log = log || (() => {});
    this.onStart = onStart || (() => {});
    this.filter = filter || (() => true); // which goals count right now (the active character's)
    this.timers = timers || { set: (fn, ms) => setTimeout(fn, ms), clear: (t) => clearTimeout(t) };
    this.now = now || Date.now;
    this.timer = null;
    this.dueAt = 0;
    this.ticking = false;
  }

  enabled() { return this.settings.get('autoRetry') !== false; }

  goals() {
    return this.ledger.data.goals.filter((g) => g.waiting && !g.touchesCore && ['funded', 'paused', 'failed'].includes(g.status) && this.filter(g));
  }

  // Just after the plan window resets (or the freeze ends) when that time is
  // known; otherwise every half hour. Never sooner than a minute.
  delayMs() {
    const s = this.guard.status();
    const at = s.frozenUntil || s.resetsAt || 0;
    const n = this.now();
    const d = at > n ? at - n + MIN_MS : DEFAULT_MS;
    return Math.max(MIN_MS, Math.min(MAX_MS, d));
  }

  schedule() {
    if (this.ticking) return;
    if (this.timer) { this.timers.clear(this.timer); this.timer = null; this.dueAt = 0; }
    if (!this.enabled() || !this.goals().length) return;
    const ms = this.delayMs();
    this.dueAt = this.now() + ms;
    this.timer = this.timers.set(() => { this.timer = null; this.tick(); }, ms);
  }

  async tick() {
    if (this.ticking) return 'busy';
    this.ticking = true;
    let outcome = 'idle';
    try {
      if (this.enabled() && this.goals().length) {
        if (this.upgrader.isBusy()) outcome = 'busy';
        else {
          await this.guard.refresh({ force: true });
          const gate = this.guard.canStart();
          if (!gate.ok) outcome = 'still-blocked';
          else {
            const goal = this.goals()[0];
            this.log(`waiting goal "${goal.title}": the plan has room, starting`);
            this.onStart(goal);
            const r = await this.upgrader.build(goal.id, { resume: !!goal.sessionId });
            outcome = r && r.ok === false && /^(plan|blocked)/.test(String(r.reason || '')) ? 'still-blocked' : 'started';
          }
        }
      }
    } catch (e) {
      this.log(`waiting queue: ${e.message}`);
      outcome = 'error';
    } finally {
      this.ticking = false;
    }
    this.schedule();
    return outcome;
  }
}

module.exports = { WaitingQueue };
