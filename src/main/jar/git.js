'use strict';
const { execFile } = require('child_process');

function git(cwd, args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        return reject(err);
      }
      resolve(String(stdout));
    });
  });
}

class Git {
  constructor(cwd) { this.cwd = cwd; }
  run(args) { return git(this.cwd, args); }

  async available() {
    try { await this.run(['--version']); return true; } catch (_) { return false; }
  }

  async ensureRepo() {
    try { await this.run(['rev-parse', '--is-inside-work-tree']); }
    catch (_) { await this.run(['init', '-b', 'main']); }
    try { await this.run(['config', 'user.name']); }
    catch (_) {
      await this.run(['config', 'user.name', 'Askin Buddy']);
      await this.run(['config', 'user.email', 'askin-buddy@localhost']);
    }
  }

  async status() {
    const out = await this.run(['status', '--porcelain', '--untracked-files=all']);
    return out.split(/\r?\n/).filter(Boolean).map((l) => ({ code: l.slice(0, 2), file: l.slice(3).replace(/^"|"$/g, '') }));
  }

  async isClean() { return (await this.status()).length === 0; }

  async hasCommits() {
    try { await this.run(['rev-parse', '--verify', 'HEAD']); return true; } catch (_) { return false; }
  }

  async commitAll(message) {
    await this.run(['add', '-A']);
    await this.run(['commit', '-m', message, '--no-verify']);
    return (await this.run(['rev-parse', 'HEAD'])).trim();
  }

  async revert(hash) {
    await this.run(['revert', '--no-edit', '--no-verify', hash]);
    return (await this.run(['rev-parse', 'HEAD'])).trim();
  }

  // Throw away everything a run left uncommitted under the directories it may touch.
  async discardRunChanges(dirs = ['mods', 'content']) {
    try { await this.run(['checkout', '--', '.']); } catch (_) { /* no HEAD yet */ }
    await this.run(['clean', '-fd', '--', ...dirs]);
  }

  async log(n = 20) {
    try {
      const out = await this.run(['log', `-${n}`, '--pretty=format:%H%x09%s']);
      return out.split(/\r?\n/).filter(Boolean).map((l) => { const [hash, ...rest] = l.split('\t'); return { hash, subject: rest.join('\t') }; });
    } catch (_) { return []; }
  }
}

module.exports = { Git };
