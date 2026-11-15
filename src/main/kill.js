'use strict';
// Stops a child process and everything it started.
//
// On Windows that needs taskkill. It is called by its full path: the app can be
// started with a PATH that lacks System32 (a shortcut, a login item), and then a
// bare "taskkill" fails with ENOENT. That failure arrives later as an 'error'
// event, so it must be handled or it takes the whole app down, and the child
// must still be stopped another way: the plan-limit guard relies on this to end
// a run.
const { spawn } = require('child_process');
const path = require('path');

function taskkillPath(env = process.env) {
  const root = env.SystemRoot || env.windir || 'C:\\Windows';
  return path.join(root, 'System32', 'taskkill.exe');
}

function killTree(child, { platform = process.platform, spawnFn = spawn, log = () => {} } = {}) {
  if (!child || !child.pid || child.killed || (child.exitCode !== null && child.exitCode !== undefined)) return false;
  const direct = () => { try { child.kill(); } catch (_) { /* already gone */ } };
  if (platform !== 'win32') { try { child.kill('SIGTERM'); } catch (_) { /* already gone */ } return true; }
  try {
    const k = spawnFn(taskkillPath(), ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    k.on('error', (e) => { log(`taskkill failed (${e.message}); stopping the process directly`); direct(); });
  } catch (e) {
    log(`taskkill failed (${e.message}); stopping the process directly`);
    direct();
  }
  return true;
}

module.exports = { killTree, taskkillPath };
