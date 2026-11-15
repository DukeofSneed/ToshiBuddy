'use strict';
// List prices in USD per million tokens (Claude API, Nov 2026). Used only to
// turn a token goal into a --max-budget-usd cap and to show a USD figure next
// to token counts. Subscription usage is not billed in dollars; the cap is an
// enforcement mechanism, the token ledger is the real currency.
const PRICES = {
  'claude-haiku-5-5':  { input: 0.10, output: 0.50,  cacheWrite: 0.125, cacheRead: 0.01 },
  'claude-sonnet-5-5': { input: 2.00, output: 10.00, cacheWrite: 2.50,  cacheRead: 0.10 },
  'claude-opus-5-5':   { input: 4.00, output: 20.00, cacheWrite: 5.00,  cacheRead: 0.20 },
};

function priceFor(model) {
  const m = String(model || '').toLowerCase();
  if (m.includes('haiku')) return PRICES['claude-haiku-5-5'];
  if (m.includes('sonnet')) return PRICES['claude-sonnet-5-5'];
  if (m.includes('opus') || m.includes('fable')) return PRICES['claude-opus-5-5'];
  return PRICES['claude-sonnet-5-5'];
}

// Generous cap: every token priced at the output rate, plus headroom. The jar's
// own live token counter is the tight limit; this only stops a runaway.
function capUsdForTokens(tokens, model, headroom = 1.25) {
  const p = priceFor(model);
  const usd = (tokens / 1e6) * p.output * headroom;
  return Math.max(0.01, Math.round(usd * 100) / 100);
}

function usdForUsage(usage, model) {
  const p = priceFor(model);
  const u = usage || {};
  return (
    ((u.inputTokens || 0) * p.input +
      (u.outputTokens || 0) * p.output +
      (u.cacheCreationInputTokens || 0) * p.cacheWrite +
      (u.cacheReadInputTokens || 0) * p.cacheRead) /
    1e6
  );
}

function formatTokens(n) {
  n = Math.round(n || 0);
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1).replace(/\.?0+$/, '') + 'k';
  return String(n);
}

// The least a build can finish on, in jar tokens. Claude Code starts every run
// with its own instructions and tool list (many thousands of tokens) before it
// reads docs/MOD_API.md and writes the mod, so a 13k or 25k budget was used up
// before the work began and the run was stopped every time.
const MIN_RUN_TOKENS = 60000;
// What a stopped or new build must hold, unspent, before it starts.
function runNeed(goal) { return Math.max(MIN_RUN_TOKENS, Math.round(((goal && goal.goalTokens) || 0) / 1000) * 1000); }

module.exports = { MIN_RUN_TOKENS, runNeed, PRICES, priceFor, capUsdForTokens, usdForUsage, formatTokens };
