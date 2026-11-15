'use strict';
// Stopping a child process must never crash the app, and must still stop the
// child when taskkill can't be started (the guard relies on it to end a run).
const assert = require('assert');
const { EventEmitter } = require('events');
const path = require('path');
const { killTree, taskkillPath } = require('../src/main/kill');

// full path, so a PATH without System32 doesn't matter
assert.strictEqual(taskkillPath({ SystemRoot: 'C:\\Windows' }), path.join('C:\\Windows', 'System32', 'taskkill.exe'));
assert.ok(path.isAbsolute(taskkillPath({})) || process.platform !== 'win32');

const child = () => ({ pid: 4242, killed: false, exitCode: null, kills: 0, kill() { this.kills++; } });

// normal case: taskkill is started with the child's pid
{ const c = child(); let got = null;
  killTree(c, { platform: 'win32', spawnFn: (exe, args) => { got = [exe, args]; return new EventEmitter(); } });
  assert.ok(/taskkill\.exe$/.test(got[0])); assert.deepStrictEqual(got[1], ['/PID', '4242', '/T', '/F']); assert.strictEqual(c.kills, 0); }

// taskkill missing (the error comes later, as an event): handled, child stopped directly
{ const c = child(); const k = new EventEmitter(); const lines = [];
  killTree(c, { platform: 'win32', spawnFn: () => k, log: (l) => lines.push(l) });
  assert.doesNotThrow(() => k.emit('error', Object.assign(new Error('spawn taskkill ENOENT'), { code: 'ENOENT' })));
  assert.strictEqual(c.kills, 1); assert.strictEqual(lines.length, 1); }

// spawn itself throws: same
{ const c = child();
  killTree(c, { platform: 'win32', spawnFn: () => { throw new Error('nope'); } });
  assert.strictEqual(c.kills, 1); }

// nothing to do for a finished or missing child
assert.strictEqual(killTree(null), false);
assert.strictEqual(killTree({ pid: 1, killed: false, exitCode: 0 }, { spawnFn: () => { throw new Error('must not spawn'); } }), false);

// other systems: a plain signal
{ const c = child(); killTree(c, { platform: 'linux', spawnFn: () => { throw new Error('must not spawn'); } }); assert.strictEqual(c.kills, 1); }

console.log('kill.test.js: ok');
