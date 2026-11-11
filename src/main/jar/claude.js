'use strict';
// Spawns Claude Code in headless (-p) mode with stream-json output and turns the
// stream into: live token usage, rate-limit events, and a final result object.
const { spawn, execSync } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

function findClaude() {
  const candidates = [
    process.env.TOSHI_CLAUDE_PATH,
    path.join(os.homedir(), '.local', 'bin', 'claude.exe'),
    path.join(os.homedir(), '.local', 'bin', 'claude'),
  ].filter(Boolean);
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch (_) { /* ignore */ }
  }
  try {
    const out = execSync(process.platform === 'win32' ? 'where claude' : 'which claude', { encoding: 'utf8' });
    const first = out.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    if (first) return first;
  } catch (_) { /* not on PATH */ }
  return null;
}

// Runs always bill the subscription login, never an API key that happens to be
// in the environment. --bare is deliberately not used: it skips OAuth.
function cleanEnv() {
  const env = { ...process.env };
  for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY']) {
    delete env[k];
  }
  // Variables that tie a process to a parent Claude Code session (e.g. when the app
  // is launched from inside one) must not leak into upgrade runs.
  for (const k of Object.keys(env)) {
    if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_AGENT_SDK_') || /^CLAUDE_CODE_(ENTRYPOINT|SESSION_|CHILD_SESSION|HOST_|MESSAGING_|SDK_|DESKTOP_|ACCOUNT_UUID|ORGANIZATION_UUID|USER_EMAIL|OAUTH_SCOPES|SIMPLE|TERMINAL_MCP_TOOLS|ENABLE_|EMIT_|REPORT_FINDINGS|STARTUP_FAILURE_RESULTS|DISABLE_CRON|EAGER_FLUSH)/.test(k)) {
      delete env[k];
    }
  }
  delete env.CLAUDE_PID;
  // A localhost base URL is a parent host's proxy, not the user's own setting.
  if (env.ANTHROPIC_BASE_URL && /\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(env.ANTHROPIC_BASE_URL)) delete env.ANTHROPIC_BASE_URL;
  // Do not let a run sit and wait for a usage window to reset; the jar handles that.
  delete env.CLAUDE_CODE_RETRY_WATCHDOG;
  env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC || '1';
  return env;
}

function sumUsage(u) {
  if (!u) return 0;
  return (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
}

function tokensFromModelUsage(modelUsage) {
  let total = 0;
  const perModel = {};
  for (const [model, mu] of Object.entries(modelUsage || {})) {
    const t = (mu.inputTokens || 0) + (mu.outputTokens || 0) + (mu.cacheCreationInputTokens || 0) + (mu.cacheReadInputTokens || 0);
    perModel[model] = { ...mu, tokens: t };
    total += t;
  }
  return { total, perModel };
}

function killTree(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      child.kill('SIGTERM');
    }
  } catch (_) { /* ignore */ }
}

/**
 * @param {object} opts
 * @param {string} opts.prompt            Sent on stdin.
 * @param {string[]} opts.args            Extra CLI args (model, caps, tools...).
 * @param {string} opts.cwd
 * @param {(info: object) => void} [opts.onRateLimit]
 * @param {(live: {tokens:number, turns:number}) => void} [opts.onUsage]
 * @param {(line: string) => void} [opts.onLog]
 * @param {number} [opts.timeoutMs]       Hard wall clock limit.
 * @returns {{ promise: Promise<object>, kill: (reason?: string) => void }}
 */
function runClaude(opts) {
  const exe = findClaude();
  if (!exe) {
    return {
      kill() {},
      promise: Promise.resolve({ ok: false, error: 'claude.exe not found. Install Claude Code and log in.', subtype: 'not_installed', tokens: 0 }),
    };
  }
  const args = ['-p', '--output-format', 'stream-json', '--verbose', ...(opts.args || [])];
  const log = opts.onLog || (() => {});
  log(`$ claude ${args.join(' ')}`);

  const child = spawn(exe, args, {
    cwd: opts.cwd,
    env: cleanEnv(),
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const state = {
    liveTokens: 0,
    turns: 0,
    rateLimit: null,
    result: null,
    sessionId: null,
    killed: false,
    killReason: null,
    stderr: '',
    events: [],
  };

  const kill = (reason) => {
    if (state.killed) return;
    state.killed = true;
    state.killReason = reason || 'killed';
    log(`! killing run: ${state.killReason}`);
    killTree(child);
  };

  const timer = opts.timeoutMs ? setTimeout(() => kill('timeout'), opts.timeoutMs) : null;

  const promise = new Promise((resolve) => {
    let buf = '';
    const handleLine = (line) => {
      line = line.trim();
      if (!line) return;
      let msg;
      try { msg = JSON.parse(line); } catch (_) { log(line.slice(0, 300)); return; }
      state.events.push(msg.type === 'assistant' ? { type: 'assistant' } : msg);
      if (msg.session_id && !state.sessionId) state.sessionId = msg.session_id;
      switch (msg.type) {
        case 'system':
          if (msg.subtype === 'init') log(`session ${msg.session_id} model=${msg.model || '?'}`);
          break;
        case 'assistant': {
          const u = msg.message && msg.message.usage;
          if (u) {
            state.liveTokens += sumUsage(u);
            state.turns += 1;
            if (opts.onUsage) opts.onUsage({ tokens: state.liveTokens, turns: state.turns });
          }
          const blocks = (msg.message && msg.message.content) || [];
          for (const b of blocks) {
            if (b.type === 'text' && b.text) log(`> ${b.text.slice(0, 200).replace(/\s+/g, ' ')}`);
            if (b.type === 'tool_use') log(`tool ${b.name}${b.input && b.input.file_path ? ' ' + b.input.file_path : ''}`);
          }
          break;
        }
        case 'rate_limit_event': {
          const info = msg.rate_limit_info || {};
          state.rateLimit = { ...info, at: Date.now() };
          log(`rate limit: status=${info.status} utilization=${info.utilization ?? '?'} overage=${info.overageEnabled ?? '?'}`);
          if (opts.onRateLimit) opts.onRateLimit(state.rateLimit);
          break;
        }
        case 'result':
          state.result = msg;
          break;
        default:
          break;
      }
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        handleLine(line);
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { state.stderr += chunk; if (state.stderr.length > 20000) state.stderr = state.stderr.slice(-20000); });

    const finish = (exitCode, spawnError) => {
      if (timer) clearTimeout(timer);
      if (buf.trim()) handleLine(buf);
      const r = state.result || {};
      const mu = tokensFromModelUsage(r.modelUsage);
      const tokens = mu.total || state.liveTokens;
      const subtype = state.killed ? 'killed' : (r.subtype || (spawnError ? 'spawn_error' : 'no_result'));
      const ok = !state.killed && subtype === 'success' && !r.is_error;
      resolve({
        ok,
        subtype,
        killed: state.killed,
        killReason: state.killReason,
        exitCode,
        sessionId: r.session_id || state.sessionId,
        result: typeof r.result === 'string' ? r.result : '',
        structuredOutput: r.structured_output,
        errors: r.errors || (spawnError ? [String(spawnError)] : []),
        totalCostUsd: r.total_cost_usd || 0,
        numTurns: r.num_turns || state.turns,
        tokens,
        perModel: mu.perModel,
        liveTokens: state.liveTokens,
        rateLimit: state.rateLimit,
        stderr: state.stderr.trim(),
        permissionDenials: r.permission_denials || [],
      });
    };
    child.on('error', (err) => finish(null, err));
    child.on('close', (code) => finish(code, null));

    try {
      child.stdin.on('error', () => {});
      child.stdin.end(opts.prompt || '');
    } catch (e) { log(`stdin error: ${e.message}`); }
  });

  return { promise, kill, pid: child.pid };
}

module.exports = { runClaude, findClaude, cleanEnv };
