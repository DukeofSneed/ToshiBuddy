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
    await this.run(['revert', '--no-edit', hash]);
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

// The jar's own history of mods/ and content/: a private git folder in userData
// whose work tree is the project. Tricks belong to whoever built them, so the
// shared repo ignores them (.gitignore) and they are recorded only here, never
// in the project's .git and never pushed. Because the project's .gitignore
// applies to any git using this work tree, ignored files are listed and added
// on purpose (--ignored, -f, clean -x), and only under mods/ and content/.
class ModHistory {
  constructor(gitDir, workTree) { this.gitDir = gitDir; this.cwd = workTree; }
  dirs(dirs = RUN_DIRS) { return dirs.filter((d) => fs.existsSync(path.join(this.cwd, d))); }
  run(args) { return git(this.cwd, ['--git-dir', this.gitDir, '--work-tree', this.cwd, ...args]); }

  async available() {
    try { await git(this.cwd, ['--version']); return true; } catch (_) { return false; }
  }

  async ensureRepo() {
    if (!fs.existsSync(path.join(this.gitDir, 'HEAD'))) {
      fs.mkdirSync(this.gitDir, { recursive: true });
      await this.run(['init', '-q', '-b', 'main']);
    }
    // Its own name, so a missing global git identity never blocks a commit.
    await this.run(['config', 'user.name', 'ToshiBuddy']);
    await this.run(['config', 'user.email', 'toshibuddy@localhost']);
    await this.run(['config', 'core.autocrlf', 'false']);
  }

  async hasCommits() {
    try { await this.run(['rev-parse', '--verify', '-q', 'HEAD']); return true; } catch (_) { return false; }
  }

  async hasCommit(hash) {
    if (!/^[0-9a-f]{7,40}$/i.test(String(hash || ''))) return false;
    try { await this.run(['cat-file', '-e', `${hash}^{commit}`]); return true; } catch (_) { return false; }
  }

  // Changed, new, or deleted files under mods/ and content/ (ignored ones included).
  async status() {
    const spec = this.dirs();
    if (!spec.length) return [];
    const out = await this.run(['status', '--porcelain', '--untracked-files=all', '--ignored=traditional', '--', ...spec]);
    return out.split(/\r?\n/).filter(Boolean)
      .map((l) => ({ code: l.slice(0, 2) === '!!' ? '??' : l.slice(0, 2), file: l.slice(3).replace(/^"|"$/g, '') }))
      .filter((s) => !s.file.endsWith('/'));
  }

  async isClean() { return (await this.status()).length === 0; }

  // Record mods/ and content/ as they are now. Returns the commit, or null if
  // nothing changed.
  async commitAll(message) {
    const spec = this.dirs();
    if (spec.length) await this.run(['add', '-A', '-f', '--', ...spec]);
    try { await this.run(['diff', '--cached', '--quiet']); if (await this.hasCommits()) return null; } catch (_) { /* staged changes */ }
    await this.run(['commit', '-q', '--no-verify', '--allow-empty', '-m', message]);
    return (await this.run(['rev-parse', 'HEAD'])).trim();
  }

  async revert(hash) {
    try {
      await this.run(['revert', '--no-edit', hash]);
    } catch (e) {
      try { await this.run(['revert', '--abort']); } catch (_) { /* nothing to abort */ }
      throw e;
    }
    return (await this.run(['rev-parse', 'HEAD'])).trim();
  }

  // Throw away what a run left unrecorded under mods/ and content/. Never before
  // the first snapshot: until then nothing there is known, so nothing is removed.
  async discardRunChanges() {
    if (!(await this.hasCommits())) return;
    const spec = this.dirs();
    if (!spec.length) return;
    try { await this.run(['checkout', '--', ...spec]); } catch (_) { /* nothing recorded there */ }
    await this.run(['clean', '-fdxq', '--', ...spec]);
  }

  async log(n = 20) {
    try {
      const out = await this.run(['log', `-${n}`, '--pretty=format:%H%x09%s']);
      return out.split(/\r?\n/).filter(Boolean).map((l) => { const [hash, ...rest] = l.split('\t'); return { hash, subject: rest.join('\t') }; });
    } catch (_) { return []; }
  }
}

module.exports = { Git, ModHistory, RUN_DIRS };
