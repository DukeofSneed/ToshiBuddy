'use strict';
// Plan-limit guard. Its one job: never let the jar push the subscription past
// its included usage. Primary signal is the rate_limit_event Claude Code emits
// in stream-json for subscription accounts. Secondary, opt-in signal is the
// same endpoint the CLI's /usage screen reads.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runClaude } = require('./claude');

const FRESH_MS = 15 * 60 * 1000;

class Guard {
  constructor({ ledger, settings, projectRoot, log }) {
    this.ledger = ledger;
    this.settings = settings;
    this.projectRoot = projectRoot;
    this.log = log || (() => {});
    this.probing = null;
  }

  get maxUtilization() {
    const base = Number(this.settings.get('maxUtilization')) || 80;
    const last = this.ledger.data.guard.last;
    // Usage credits on = overage is possible; tighten the margin.
    return last && last.overageEnabled ? Math.min(base, 70) : base;
  }

  status() {
    const g = this.ledger.data.guard;
    const last = g.last;
    const now = Date.now();
    const frozenUntil = g.frozenUntil > now ? g.frozenUntil : 0;
    return {
      utilization: last ? last.utilization : null,
      resetsAt: last ? last.resetsAt : null,
      overageEnabled: last ? !!last.overageEnabled : null,
      status: last ? last.status : null,
      source: last ? last.source : null,
      at: last ? last.at : null,
      fresh: !!(last && now - last.at < FRESH_MS),
      windows: last ? last.windows || null : null,
      frozenUntil,
      maxUtilization: this.maxUtilization,
      calibrated: !!this.ledger.data.calibration.tokensPerPercent,
      tokensPerPercent: this.ledger.data.calibration.tokensPerPercent,
      maxSafeDonation: this.maxSafeDonation(),
    };
  }

  // Record a rate_limit_event (or endpoint reading) as the current truth.
  observe(info, source = 'rate_limit_event') {
    if (!info) return;
    const prev = this.ledger.data.guard.last;
    let utilization = typeof info.utilization === 'number' ? info.utilization : null;
    // The event reports utilization as a fraction on some builds and a percent on others.
    if (utilization !== null && utilization <= 1 && source === 'rate_limit_event') utilization = utilization * 100;
    let resetsAt = info.resetsAt || info.resets_at || null;
    if (resetsAt && resetsAt < 1e12) resetsAt = resetsAt * 1000; // epoch seconds -> ms
    const last = {
      at: Date.now(),
      source,
      status: info.status || (prev && prev.status) || 'allowed',
      utilization: utilization !== null ? utilization : (prev ? prev.utilization : null),
      resetsAt: resetsAt || (prev ? prev.resetsAt : null),
      overageEnabled: typeof info.overageEnabled === 'boolean' ? info.overageEnabled : (prev ? prev.overageEnabled : null),
      errorCode: info.errorCode || null,
      windows: info.windows || (prev ? prev.windows : null),
    };
    this.ledger.data.guard.last = last;
    if (last.status === 'rejected' || last.errorCode === 'credits_required') {
      this.ledger.data.guard.frozenUntil = last.resetsAt || Date.now() + 60 * 60 * 1000;
      this.log(`guard: FROZEN until ${new Date(this.ledger.data.guard.frozenUntil).toLocaleString()} (${last.errorCode || last.status})`);
    } else if (last.utilization !== null && last.utilization < this.maxUtilization) {
      this.ledger.data.guard.frozenUntil = 0;
    }
    this.ledger.save();
  }

  // Why a run must stop right now, or null.
  killReason(info) {
    if (!info) return null;
    if (info.status === 'rejected' || info.errorCode === 'credits_required') return 'plan limit reached';
    if (info.status === 'allowed_warning') return 'plan usage warning from Claude';
    let u = typeof info.utilization === 'number' ? info.utilization : null;
    if (u !== null && u <= 1) u = u * 100;
    if (u !== null && u >= this.maxUtilization) return `plan usage ${u.toFixed(0)}% >= cap ${this.maxUtilization}%`;
    return null;
  }

  canStart() {
    const s = this.status();
    if (s.frozenUntil) return { ok: false, reason: `plan limit hit; frozen until ${new Date(s.frozenUntil).toLocaleTimeString()}` };
    if (s.utilization === null) return { ok: false, reason: 'plan usage unknown; run a usage check first' };
    if (!s.fresh) return { ok: false, reason: 'plan usage reading is stale; refresh first' };
    if (s.utilization >= s.maxUtilization) {
      return { ok: false, reason: `plan usage at ${s.utilization.toFixed(0)}%, cap is ${s.maxUtilization}%` + (s.resetsAt ? `; resets ${new Date(s.resetsAt).toLocaleTimeString()}` : '') };
    }
    return { ok: true };
  }

  // Donation ceiling right now, in tokens.
  maxSafeDonation() {
    const g = this.ledger.data.guard;
    const cal = this.ledger.data.calibration.tokensPerPercent;
    const calibrationCap = Number(this.settings.get('calibrationRunTokens')) || 20000;
    if (g.frozenUntil > Date.now()) return 0;
    const last = g.last;
    if (!last || last.utilization === null || last.utilization === undefined) return calibrationCap;
    const headroom = Math.max(0, this.maxUtilization - last.utilization);
    if (headroom <= 0) return 0;
    if (!cal) return calibrationCap;
    return Math.floor(headroom * cal);
  }

  // Refresh utilization: cached if fresh, else a tiny haiku probe. Returns status().
  async refresh({ force = false } = {}) {
    const s = this.status();
    if (s.fresh && !force) return s;
    if (this.probing) return this.probing;
    this.probing = this._probe().finally(() => { this.probing = null; });
    return this.probing;
  }

  async _probe() {
    this.log('guard: probing plan usage with a 1-turn haiku run');
    const run = runClaude({
      prompt: 'Reply with exactly: OK',
      cwd: this.projectRoot,
      args: ['--model', 'haiku', '--max-turns', '1', '--max-budget-usd', '0.02', '--effort', 'low',
        '--disallowedTools', 'Bash,PowerShell,Edit,Write,Read,Glob,Grep,WebFetch,WebSearch,Agent,NotebookEdit',
        '--permission-prompts', 'none', '--no-session-persistence'],
      onLog: this.log,
      timeoutMs: 90 * 1000,
    });
    const res = await run.promise;
    if (res.tokens) this.ledger.chargeFee(res.tokens, 'probe');
    if (res.rateLimit) {
      this.observe(res.rateLimit, 'rate_limit_event');
    } else if (!res.ok && res.subtype === 'not_installed') {
      this.log('guard: claude not installed');
    } else if (this.settings.get('allowUsageEndpointFallback')) {
      const ep = await this.readUsageEndpoint();
      if (ep) this.observe(ep, 'usage_endpoint');
    } else {
      this.log('guard: no rate_limit_event in probe output; enable the /usage endpoint fallback in settings if this persists');
      // Remember that we tried so the UI can explain.
      this.ledger.data.guard.lastProbeNoEvent = Date.now();
      this.ledger.data.guard.lastProbeDetail = res.ok ? 'ok, no event' : `${res.subtype}: ${(res.errors || []).join('; ') || res.stderr.slice(-300)}`;
      this.ledger.save();
    }
    return this.status();
  }

  // Opt-in fallback: the same numbers the CLI's /usage screen shows.
  async readUsageEndpoint() {
    try {
      const credFile = path.join(os.homedir(), '.claude', '.credentials.json');
      const creds = JSON.parse(fs.readFileSync(credFile, 'utf8'));
      const token = creds && creds.claudeAiOauth && creds.claudeAiOauth.accessToken;
      if (!token) return null;
      const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
        headers: {
          Authorization: `Bearer ${token}`,
          'anthropic-beta': 'oauth-2025-04-20',
          'User-Agent': 'claude-code/2.1.322',
          Accept: 'application/json',
        },
      });
      if (!res.ok) { this.log(`guard: usage endpoint HTTP ${res.status}`); return null; }
      const j = await res.json();
      const five = j.five_hour || {};
      const week = j.seven_day || {};
      const util5 = Number(five.utilization || 0);
      const util7 = Number(week.utilization || 0);
      const binding = util7 >= util5 ? week : five;
      return {
        status: 'allowed',
        utilization: Math.max(util5, util7),
        resetsAt: binding.resets_at ? Date.parse(binding.resets_at) : null,
        overageEnabled: j.extra_usage ? !!j.extra_usage.is_enabled : undefined,
        windows: {
          five_hour: { utilization: util5, resetsAt: five.resets_at ? Date.parse(five.resets_at) : null },
          seven_day: { utilization: util7, resetsAt: week.resets_at ? Date.parse(week.resets_at) : null },
        },
      };
    } catch (e) {
      this.log(`guard: usage endpoint failed: ${e.message}`);
      return null;
    }
  }

  // Learn tokens-per-percent from a completed run.
  learn(utilBefore, utilAfter, tokens) {
    if (typeof utilBefore !== 'number' || typeof utilAfter !== 'number') return;
    const delta = utilAfter - utilBefore;
    if (delta >= 0.5 && tokens > 0) {
      this.ledger.calibrate(tokens, delta);
      this.log(`guard: learned ${Math.round(tokens / delta)} tokens per percent`);
    }
  }
}

module.exports = { Guard };
