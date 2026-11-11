'use strict';
// Turns a free-text suggestion into a Goal with a token price tag, using one
// cheap haiku turn with an enforced JSON schema.
const fs = require('fs');
const path = require('path');
const { runClaude } = require('./claude');

const SIZE_RANGE = {
  S: [8000, 40000],
  M: [40000, 120000],
  L: [120000, 300000],
  XL: [300000, 800000],
};

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', description: 'Short upgrade title, 3-6 words' },
    summary: { type: 'string', description: 'What will be built, concretely, in 1-3 sentences' },
    size: { type: 'string', enum: ['S', 'M', 'L', 'XL'] },
    estimated_tokens: { type: 'integer', description: 'Total tokens (input+output+cache) a haiku Claude Code run needs to implement it' },
    feasible: { type: 'boolean', description: 'False if it cannot be done within the Mod API' },
    touches_core: { type: 'boolean', description: 'True if it would need changes outside mods/ and content/' },
    risk_note: { type: 'string' },
    reply: { type: 'string', description: "One short sentence in the character's voice (see the personality in the prompt) reacting to the request; if it names the character, use the name given in the prompt" },
  },
  required: ['title', 'summary', 'size', 'estimated_tokens', 'feasible', 'touches_core', 'risk_note', 'reply'],
};

function listModSlugs(projectRoot) {
  try {
    return fs.readdirSync(path.join(projectRoot, 'mods'), { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(projectRoot, 'mods', d.name, 'mod.js')))
      .map((d) => d.name);
  } catch (_) { return []; }
}

function buildPrompt(projectRoot, request, ledger, character = { name: 'Kori', isSkin: false }) {
  const { name, isSkin, personality } = character;
  const api = fs.readFileSync(path.join(projectRoot, 'docs', 'MOD_API.md'), 'utf8');
  const mods = listModSlugs(projectRoot);
  const done = ledger.data.upgrades.filter((u) => !u.reverted).map((u) => `- ${u.title} (${u.tokens} tokens)`).join('\n') || '- none yet';
  return [
    `You are the pricing brain of a desktop pet (Electron) that does paperwork at a desk. The character is called ${name}${isSkin ? ' and is shown as a user-supplied skin image (no limbs)' : ', the built-in drawn character'}; upgrades must work on whichever character is active, through props on anchors and whole-body animations. Write the title, summary, and reply about ${name}${isSkin ? '; never use the name Kori, which is only the built-in test character the Mod API describes' : ''}.`,
    personality ? `${name}'s personality, written by the user (use it for the reply): ${personality}` : '',
    'Requests to reproduce copyrighted characters, art, dialogue, or audio are not feasible; set feasible to false for those.',
    'A human has suggested an upgrade. Estimate what it would take for a separate headless Claude Code run (model: haiku) to implement it as a mod.',
    'Mods can only add quips, CSS animations, SVG props, and simple behaviors through the Mod API below; they cannot touch src/.',
    'Be realistic about tokens: a run reads docs/MOD_API.md (~2k tokens), one or two existing mods, then writes one mod.js. Small cosmetic mods land in 10k-30k tokens; animation-heavy or behavior-heavy mods 40k-120k; anything needing new core support is not feasible (set touches_core true).',
    '',
    '## Mod API',
    api,
    '',
    `## Existing mods: ${mods.join(', ') || 'none'}`,
    '## Upgrades already built',
    done,
    '',
    '## The suggestion',
    request,
  ].join('\n');
}

async function estimate({ projectRoot, ledger, request, log, character }) {
  const run = runClaude({
    prompt: buildPrompt(projectRoot, request, ledger, character),
    cwd: projectRoot,
    args: ['--model', 'haiku', '--effort', 'low', '--max-turns', '1', '--max-budget-usd', '0.05',
      '--disallowedTools', 'Bash,PowerShell,Edit,Write,Read,Glob,Grep,WebFetch,WebSearch,Agent,NotebookEdit',
      '--permission-prompts', 'none', '--no-session-persistence',
      '--json-schema', JSON.stringify(SCHEMA)],
    onLog: log,
    timeoutMs: 120 * 1000,
  });
  const res = await run.promise;
  if (res.tokens) ledger.chargeFee(res.tokens, 'estimate');
  let out = res.structuredOutput;
  if (!out && res.result) {
    try { out = JSON.parse(res.result.slice(res.result.indexOf('{'), res.result.lastIndexOf('}') + 1)); } catch (_) { out = null; }
  }
  if (!res.ok && !out) {
    return { ok: false, error: (res.errors && res.errors[0]) || res.subtype || 'estimate failed', rateLimit: res.rateLimit, feeTokens: res.tokens };
  }
  const size = SIZE_RANGE[out.size] ? out.size : 'M';
  const [lo, hi] = SIZE_RANGE[size];
  const est = Math.min(hi, Math.max(lo, Math.floor(Number(out.estimated_tokens) || lo)));
  return {
    ok: true,
    goal: {
      title: String(out.title || request).slice(0, 80),
      summary: String(out.summary || ''),
      request,
      size,
      goalTokens: Math.round(est / 1000) * 1000,
      risk: String(out.risk_note || ''),
      touchesCore: !!out.touches_core,
      feasible: out.feasible !== false,
      source: 'user',
    },
    reply: String(out.reply || ''),
    feeTokens: res.tokens,
    rateLimit: res.rateLimit,
  };
}

module.exports = { estimate, SIZE_RANGE };
