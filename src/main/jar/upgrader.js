'use strict';
// Spends a funded goal: spawns a capped headless Claude Code run that writes a
// mod, audits what it touched, commits or reverts, reloads the pet, and books
// the real token usage.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { runClaude } = require('./claude');
const { capUsdForTokens } = require('./pricing');

const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    slug: { type: 'string', description: 'The mod folder name you created under mods/' },
    summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    announcement: { type: 'string', description: "One short line in Askin's lazy voice announcing the new trick" },
  },
  required: ['title', 'slug', 'summary', 'files', 'announcement'],
};

const ALLOWED_PREFIXES = ['mods/', 'content/'];

function slugify(s) {
  return String(s || 'upgrade').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'upgrade';
}

function nodeCheck(file) {
  return new Promise((resolve) => {
    execFile(process.execPath, ['--check', file], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true }, (err, _out, stderr) => {
      resolve(err ? String(stderr || err.message) : null);
    });
  });
}

class Upgrader {
  constructor({ projectRoot, ledger, guard, settings, git, log, emit, reloadAndAwaitMods }) {
    this.projectRoot = projectRoot;
    this.ledger = ledger;
    this.guard = guard;
    this.settings = settings;
    this.git = git;
    this.log = log || (() => {});
    this.emit = emit || (() => {});
    this.reloadAndAwaitMods = reloadAndAwaitMods;
    this.active = null; // { goalId, run }
  }

  isBusy() { return !!this.active; }

  cancel() {
    if (this.active) this.active.run.kill('cancelled by user');
  }

  modelFor(goal) {
    const lvl = this.ledger.level().level;
    const configured = this.settings.get('upgradeModel') || 'haiku';
    if (configured !== 'haiku') return configured;
    if (lvl >= 4 || goal.size === 'L' || goal.size === 'XL') return 'sonnet';
    return 'haiku';
  }

  buildPrompt(goal, { resume, extraTokens }) {
    if (resume) {
      return [
        `Continue the upgrade "${goal.title}". The previous attempt stopped because the token budget ran out.`,
        `You have about ${extraTokens} more tokens. Finish the mod with as few file reads as possible, then reply with the JSON summary.`,
      ].join('\n');
    }
    return [
      `# Upgrade request: ${goal.title}`,
      goal.summary,
      goal.request ? `\nOriginal words from the human: "${goal.request}"` : '',
      '',
      '## Rules',
      `- Read docs/MOD_API.md first, then write exactly one mod folder: mods/${slugify(goal.title)}/mod.js (plus an optional NOTES.md). You may also add a quip pack under content/quips/.`,
      '- Never create or edit anything under src/, docs/, prompts/, package.json, or any file outside mods/ and content/. Such a run is reverted automatically.',
      '- The mod must be self-contained browser JavaScript calling AskinMods.register(...). No require, no fetch, no eval, no network, no timers longer than needed.',
      `- Token budget for this run: about ${goal.goalTokens} tokens total. Be economical: read MOD_API.md and at most one existing mod, then write.`,
      '- Keep Askin in character: lazy, dry, unbothered, fond of the words "deluxe" and "lethal dose".',
      '- When done, reply with the JSON summary the schema asks for. The announcement is one short line Askin will say out loud.',
    ].join('\n');
  }

  async build(goalId, { resume = false } = {}) {
    const goal = this.ledger.goal(goalId);
    if (!goal) return { ok: false, reason: 'no such goal' };
    if (this.active) return { ok: false, reason: 'another upgrade is already running' };
    if (!['funded', 'paused', 'failed'].includes(goal.status)) return { ok: false, reason: `goal is ${goal.status}` };
    const available = goal.funded - goal.spent;
    if (available < 1000) return { ok: false, reason: 'not enough funded tokens' };
    if (goal.touchesCore) return { ok: false, reason: 'this idea needs core changes; mods cannot do it yet' };

    // Guard first.
    const status = await this.guard.refresh();
    const gate = this.guard.canStart();
    if (!gate.ok) {
      this.ledger.updateGoal(goalId, { note: `blocked: ${gate.reason}` });
      this.emit({ phase: 'blocked', goalId, title: goal.title, reason: gate.reason });
      return { ok: false, reason: gate.reason };
    }
    const utilBefore = status.utilization;

    // Clean tree so a revert is exact.
    try {
      await this.git.ensureRepo();
      if (!(await this.git.hasCommits())) await this.git.commitAll('chore: initial snapshot before first upgrade');
      if (!(await this.git.isClean())) return { ok: false, reason: 'the project has uncommitted changes; commit or discard them first' };
    } catch (e) {
      return { ok: false, reason: `git not ready: ${e.message}` };
    }

    const model = goal.model || this.modelFor(goal);
    const useResume = resume && goal.sessionId;
    const budgetTokens = available;
    const capUsd = capUsdForTokens(budgetTokens, model);
    const args = [
      '--model', model,
      '--effort', this.settings.get('upgradeEffort') || 'medium',
      '--max-budget-usd', String(capUsd),
      '--max-turns', String(this.settings.get('maxTurns') || 30),
      '--allowedTools', 'Read,Glob,Grep,Edit,Write',
      '--disallowedTools', 'Bash,PowerShell,WebFetch,WebSearch,Agent,NotebookEdit',
      '--permission-mode', 'acceptEdits',
      '--permission-prompts', 'none',
      '--append-system-prompt-file', path.join(this.projectRoot, 'prompts', 'upgrade-system.md'),
      '--json-schema', JSON.stringify(RESULT_SCHEMA),
    ];
    if (useResume) args.push('--resume', goal.sessionId);

    this.ledger.updateGoal(goalId, { status: 'building', note: '', model });
    this.emit({ phase: 'start', goalId, title: goal.title, model, budgetTokens });
    this.log(`upgrade "${goal.title}": model=${model} budget=${budgetTokens} tokens cap=$${capUsd}`);

    let killReason = null;
    const run = runClaude({
      prompt: this.buildPrompt(goal, { resume: useResume, extraTokens: budgetTokens }),
      cwd: this.projectRoot,
      args,
      onLog: this.log,
      timeoutMs: 25 * 60 * 1000,
      onRateLimit: (info) => {
        this.guard.observe(info);
        const why = this.guard.killReason(info);
        if (why && !killReason) { killReason = why; run.kill(why); }
      },
      onUsage: ({ tokens }) => {
        this.emit({ phase: 'progress', goalId, tokens, budgetTokens });
        if (tokens > budgetTokens * 1.1 && !killReason) { killReason = 'spent more than the funded tokens'; run.kill(killReason); }
      },
    });
    this.active = { goalId, run };
    const res = await run.promise;
    this.active = null;

    const tokens = res.tokens || res.liveTokens || 0;
    const g = this.ledger.goal(goalId);
    g.spent += tokens;
    g.sessionId = res.sessionId || g.sessionId;
    g.history.push({ at: Date.now(), subtype: res.subtype, tokens, usd: res.totalCostUsd, killReason: res.killReason });
    this.ledger.recordSpend({ kind: 'upgrade', goalId, tokens, usd: res.totalCostUsd, model, sessionId: res.sessionId, subtype: res.subtype });
    if (res.rateLimit && typeof res.rateLimit.utilization === 'number') {
      const after = res.rateLimit.utilization <= 1 ? res.rateLimit.utilization * 100 : res.rateLimit.utilization;
      this.guard.learn(utilBefore, after, tokens);
    }

    if (res.ok) return this._finishSuccess(g, res, model, tokens);
    return this._finishFailure(g, res, tokens);
  }

  async _finishSuccess(goal, res, model, tokens) {
    // Audit: only mods/ and content/ may change.
    let changed = [];
    try { changed = (await this.git.status()).map((s) => s.file.replace(/\\/g, '/')); } catch (_) { /* ignore */ }
    const illegal = changed.filter((f) => !ALLOWED_PREFIXES.some((p) => f.startsWith(p)));
    if (illegal.length) {
      await this.git.discardRunChanges();
      return this._fail(goal, `run touched forbidden files: ${illegal.slice(0, 5).join(', ')}`);
    }
    if (!changed.length) {
      return this._fail(goal, 'run finished without changing any files');
    }
    // Syntax check every JS file it wrote.
    for (const f of changed.filter((x) => x.endsWith('.js'))) {
      const err = await nodeCheck(path.join(this.projectRoot, f));
      if (err) {
        await this.git.discardRunChanges();
        return this._fail(goal, `syntax error in ${f}: ${err.split('\n').slice(0, 3).join(' ')}`);
      }
    }
    const out = res.structuredOutput || {};
    const slugs = [...new Set(changed.filter((f) => f.startsWith('mods/')).map((f) => f.split('/')[1]).filter(Boolean))];
    let hash;
    try {
      hash = await this.git.commitAll(`upgrade: ${out.title || goal.title} (${tokens} tokens, ${model})`);
    } catch (e) {
      await this.git.discardRunChanges();
      return this._fail(goal, `commit failed: ${e.message}`);
    }
    // Load it for real; a mod that throws on load is reverted.
    const statuses = await this.reloadAndAwaitMods(slugs, 15000);
    const broken = statuses.find((s) => s && s.ok === false);
    if (broken) {
      try { await this.git.revert(hash); } catch (e) { this.log(`revert failed: ${e.message}`); }
      await this.reloadAndAwaitMods([], 3000);
      return this._fail(goal, `mod ${broken.slug} failed to load: ${broken.error}`);
    }
    const leftover = Math.max(0, goal.funded - goal.spent);
    this.ledger.data.balance += leftover;
    goal.funded = goal.spent;
    const upgrade = this.ledger.recordUpgrade({
      goalId: goal.id,
      title: out.title || goal.title,
      summary: out.summary || goal.summary,
      slugs,
      files: changed,
      commit: hash,
      tokens,
      usd: res.totalCostUsd,
      model,
      announcement: out.announcement || `New trick acquired. Don't expect me to use it often.`,
    });
    this.ledger.updateGoal(goal.id, { status: 'done', note: `built in ${tokens} tokens`, upgradeId: upgrade.id });
    this.emit({ phase: 'done', goalId: goal.id, title: upgrade.title, announcement: upgrade.announcement, tokens });
    return { ok: true, upgrade };
  }

  async _finishFailure(goal, res, tokens) {
    try { await this.git.discardRunChanges(); } catch (e) { this.log(`discard failed: ${e.message}`); }
    const budgetish = ['error_max_budget_usd', 'error_max_turns'].includes(res.subtype) || (res.killed && /funded tokens|budget/.test(res.killReason || ''));
    const guardKill = res.killed && /plan/.test(res.killReason || '');
    if (budgetish || guardKill) {
      const need = Math.max(5000, Math.round(goal.goalTokens * 0.5 / 1000) * 1000);
      this.ledger.updateGoal(goal.id, {
        status: 'paused',
        needTokens: need,
        note: guardKill ? `paused: ${res.killReason}. Needs +${need} tokens once the plan window resets.` : `paused: ran out of budget (${res.subtype || res.killReason}). Needs +${need} tokens to resume.`,
      });
      this.emit({ phase: 'paused', goalId: goal.id, title: goal.title, need, reason: res.killReason || res.subtype });
      return { ok: false, paused: true, need };
    }
    const err = (res.errors && res.errors[0]) || res.killReason || res.subtype || 'unknown error';
    return this._fail(goal, `${err}${res.stderr ? ' | ' + res.stderr.slice(-200) : ''}`);
  }

  _fail(goal, reason) {
    const need = Math.max(5000, Math.round(goal.goalTokens * 0.5 / 1000) * 1000);
    this.ledger.updateGoal(goal.id, { status: 'failed', needTokens: need, note: `failed: ${reason}. Fund +${need} tokens to retry.` });
    this.emit({ phase: 'failed', goalId: goal.id, title: goal.title, reason });
    this.log(`upgrade "${goal.title}" failed: ${reason}`);
    return { ok: false, reason };
  }

  async undo(upgradeId) {
    const up = this.ledger.upgrade(upgradeId);
    if (!up || up.reverted) return { ok: false, reason: 'nothing to undo' };
    if (this.active) return { ok: false, reason: 'wait for the running upgrade to finish' };
    try {
      if (!(await this.git.isClean())) return { ok: false, reason: 'uncommitted changes in the project' };
      const hash = await this.git.revert(up.commit);
      up.reverted = true;
      up.revertCommit = hash;
      this.ledger.save();
      await this.reloadAndAwaitMods([], 3000);
      this.emit({ phase: 'undone', title: up.title });
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: `revert failed: ${e.message}` };
    }
  }
}

module.exports = { Upgrader, slugify };
