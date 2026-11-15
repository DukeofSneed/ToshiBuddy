'use strict';
// A reply streams as several events that each repeat the whole reply's usage.
// The live counter must count each reply once, or builds are stopped early for
// "spending more than funded".
const assert = require('assert');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const cp = require('child_process');
const fs = require('fs');

// a fake claude process, swapped in before claude.js picks up spawn
let fake;
cp.spawn = () => {
  fake = new EventEmitter();
  fake.stdout = new PassThrough(); fake.stderr = new PassThrough(); fake.stdin = new PassThrough();
  fake.pid = 1; fake.exitCode = null; fake.kill = () => {};
  return fake;
};
process.env.TOSHI_CLAUDE_PATH = process.execPath; // any existing file
const { runClaude, sumUsage } = require('../src/main/jar/claude.js');
assert.ok(fs.existsSync(process.env.TOSHI_CLAUDE_PATH));

const usage = { input_tokens: 10, output_tokens: 500, cache_creation_input_tokens: 20000, cache_read_input_tokens: 0 };
const later = { input_tokens: 12, output_tokens: 300, cache_creation_input_tokens: 1000, cache_read_input_tokens: 21000 };
const seen = [];
const run = runClaude({ prompt: 'x', onUsage: ({ tokens }) => seen.push(tokens) });
const send = (o) => fake.stdout.write(JSON.stringify(o) + '\n');
// reply 1 in three events (thinking, text, tool_use), same id, same usage
for (const kind of ['thinking', 'text', 'tool_use']) send({ type: 'assistant', message: { id: 'msg_1', usage, content: [{ type: kind, text: 'a', name: 'Read', input: {} }] } });
// reply 2 in two events
for (const kind of ['text', 'tool_use']) send({ type: 'assistant', message: { id: 'msg_2', usage: later, content: [{ type: kind, text: 'b', name: 'Write', input: {} }] } });
send({ type: 'result', subtype: 'success', is_error: false, session_id: 's' });
fake.stdout.end();
setTimeout(() => fake.emit('close', 0), 20);

run.promise.then((res) => {
  const want = sumUsage(usage) + sumUsage(later);
  assert.strictEqual(seen[seen.length - 1], want, `counted once per reply (${seen.join(', ')})`);
  assert.strictEqual(res.liveTokens, want);
  assert.strictEqual(res.numTurns, 2);
  console.log(`usage-count.test.js: ok (${want} tokens for 2 replies sent as 5 events)`);
});
