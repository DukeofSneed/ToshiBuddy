'use strict';
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

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

// Upgrade runs may only touch these folders, so that's all the jar ever checks,
// cleans, or commits. Character packs and other files can have unsaved edits
// (from Import or the animation mapper) without blocking or losing anything.
const RUN_DIRS = ['mods', 'content'];

class Git {
  constructor(cwd) { this.cwd = cwd; }
  // Only folders that exist: a pathspec for a missing folder is an error.
  dirs(dirs = RUN_DIRS) { return dirs.filter((d) => fs.existsSync(path.join(this.cwd, d))); }
  run(args) { return git(this.cwd, args); }

  async available() {
    try { await this.run(['--version']); return true; } catch (_) { return false; }
  }

  async ensureRepo() {
    try { await this.run(['rev-parse', '--is-inside-work-tree']); }
    catch (_) { await this.run(['init', '-b', 'main']); }
    try { await this.run(['config', 'user.name']); }
    catch (_) {
      await this.run(['config', 'user.name', 'ToshiBuddy']);
      await this.run(['config', 'user.email', 'toshibuddy@localhost']);
    }
  }

  // dirs: limit to these folders; omitted = the whole project.
  async status(dirs) {
    const spec = dirs ? ['--', ...this.dirs(dirs)] : [];
    if (dirs && spec.length === 1) return [];
    const out = await this.run(['status', '--porcelain', '--untracked-files=all', ...spec]);
    return out.split(/\r?\n/).filter(Boolean).map((l) => ({ code: l.slice(0, 2), file: l.slice(3).replace(/^"|"$/g, '') }));
  }

  async isClean(dirs) { return (await this.status(dirs)).length === 0; }

  async hasCommits() {
    try { await this.run(['rev-parse', '--verify', 'HEAD']); return true; } catch (_) { return false; }
  }

  // Commit everything (first snapshot) or only the given folders.
  async commitAll(message, dirs) {
    const spec = dirs ? ['--', ...this.dirs(dirs)] : [];
    await this.run(['add', '-A', ...spec]);
    await this.run(['commit', '-m', message, '--no-verify', ...spec]);
    return (await this.run(['rev-parse', 'HEAD'])).trim();
  }

  async revert(hash) {
    await this.run(['revert', '--no-edit', '--no-verify', hash]);
    return (await this.run(['rev-parse', 'HEAD'])).trim();
  }

  // Throw away everything a run left uncommitted under the directories it may touch.
  async discardRunChanges(dirs = RUN_DIRS) {
    const spec = this.dirs(dirs);
    if (!spec.length) return;
    try { await this.run(['checkout', '--', ...spec]); } catch (_) { /* nothing tracked there yet */ }
    await this.run(['clean', '-fd', '--', ...spec]);
  }

  // Put specific files back the way the last commit has them (deleting ones git
  // doesn't track). Used for files a run changed outside its folders.
  async restoreFiles(files) {
    if (!files.length) return;
    const tracked = new Set((await this.run(['ls-files', '--', ...files])).split(/\r?\n/).filter(Boolean));
    for (const f of files) {
      if (tracked.has(f)) await this.run(['checkout', '--', f]);
      else { try { fs.unlinkSync(path.join(this.cwd, f)); } catch (_) { /* already gone */ } }
    }
  }

  async log(n = 20) {
    try {
      const out = await this.run(['log', `-${n}`, '--pretty=format:%H%x09%s']);
      return out.split(/\r?\n/).filter(Boolean).map((l) => { const [hash, ...rest] = l.split('\t'); return { hash, subject: rest.join('\t') }; });
    } catch (_) { return []; }
  }
}

module.exports = { Git, RUN_DIRS };
