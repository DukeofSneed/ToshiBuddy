'use strict';
// Updates for copies of the app that came as a zip (friends' installs). It asks
// GitHub which version is newest, and on the user's say-so downloads that version
// and copies it over this folder. What belongs to the user is kept: characters
// they imported or edited, tricks they built, and everything in userData (jar,
// settings), which this never touches. A git checkout (a developer copy) is left
// alone: update that with git.
//
// How "which version am I" works: version.txt holds "$Format:...$", which git
// fills in with the commit id and date when it makes a zip (export-subst in
// .gitattributes). In a git checkout it stays unfilled, which marks a dev copy.
//
// How "what is the user's" works: .install-manifest.json records a hash of every
// file as it was installed. A file under characters/, mods/ or content/ that no
// longer matches its recorded hash was changed by the user, and is kept.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const VERSION_FILE = 'version.txt';
const MANIFEST_FILE = '.install-manifest.json';
const USER_DIRS = ['characters/', 'mods/', 'content/'];
const MAX_ZIP = 300 * 1024 * 1024;
const NEVER = (p) => p.startsWith('.git/') || p === '.git' || p.startsWith('node_modules/') || p.startsWith('dist/')
  || p === MANIFEST_FILE || /\.log$/i.test(p) || /^characters\/[^/]+\/[^/]*-index\.png$/i.test(p);

const sha = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
const posix = (p) => p.split(path.sep).join('/');

// "owner/name" from package.json's repository ("github:owner/name" or a URL).
function repoOf(root) {
  try {
    const r = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).repository;
    const s = typeof r === 'string' ? r : (r && r.url) || '';
    const m = /(?:github:|github\.com[/:])([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(s);
    return m ? `${m[1]}/${m[2]}` : null;
  } catch (_) { return null; }
}

// { sha, date, dev }. dev: a git checkout or an unmarked copy; never updated here.
function localVersion(root) {
  let text = '';
  try { text = fs.readFileSync(path.join(root, VERSION_FILE), 'utf8'); } catch (_) { /* older copy without the file */ }
  const [id, date] = text.split(/\r?\n/).map((s) => s.trim());
  if (!/^[0-9a-f]{40}$/.test(id || '')) return { sha: null, date: null, dev: true };
  return { sha: id, date: date || null, dev: false };
}

async function latestVersion(repo, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`https://api.github.com/repos/${repo}/commits/main`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ToshiBuddy-updater' },
  });
  if (!res.ok) throw new Error(res.status === 403 ? 'GitHub is limiting requests right now; try again in an hour' : `GitHub answered ${res.status}`);
  const j = await res.json();
  if (!j || !/^[0-9a-f]{40}$/.test(String(j.sha))) throw new Error('unexpected answer from GitHub');
  const c = j.commit || {};
  return {
    sha: j.sha,
    date: (c.committer && c.committer.date) || (c.author && c.author.date) || null,
    summary: String(c.message || '').split('\n')[0].replace(/[\u0000-\u001f]/g, ' ').slice(0, 120),
  };
}

// { dev, repo, current, latest, available }
async function check(root, opts) {
  const current = localVersion(root);
  const repo = repoOf(root);
  if (current.dev || !repo) return { dev: true, repo, current, latest: null, available: false };
  const latest = await latestVersion(repo, opts);
  return { dev: false, repo, current, latest, available: latest.sha !== current.sha };
}

// Every file under root that the updater manages, as posix paths.
function walk(root) {
  const out = [];
  const visit = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const rel = posix(path.relative(root, full));
      if (NEVER(e.isDirectory() ? `${rel}/` : rel) || NEVER(rel)) continue;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) visit(full);
      else if (e.isFile()) out.push(rel);
    }
  };
  visit(root);
  return out.sort();
}
function hashAll(root, files) {
  const out = {};
  for (const f of files) out[f] = sha(fs.readFileSync(path.join(root, f)));
  return out;
}
function readManifest(root) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(root, MANIFEST_FILE), 'utf8'));
    return m && typeof m.files === 'object' ? m : null;
  } catch (_) { return null; }
}
// On a zip install with no record yet: note the files as they are now, so later
// edits by the user can be told apart from the installed versions.
function ensureManifest(root) {
  const v = localVersion(root);
  if (v.dev || readManifest(root)) return false;
  fs.writeFileSync(path.join(root, MANIFEST_FILE), JSON.stringify({ version: v.sha, files: hashAll(root, walk(root)) }));
  return true;
}

// What an update would do. Pure: hashes in, lists out.
//   local, incoming, recorded: { path: hash }. recorded may be null (no manifest).
function plan(local, incoming, recorded) {
  const write = [], keep = [], remove = [];
  const mine = (p) => USER_DIRS.some((d) => p.startsWith(d));
  for (const [p, h] of Object.entries(incoming)) {
    if (NEVER(p)) continue;
    if (!(p in local)) { write.push(p); continue; }
    if (local[p] === h) continue;
    // App files are always replaced. A file in the user's folders is replaced
    // only if it is still exactly as installed; otherwise it is the user's.
    if (!mine(p) || (recorded && recorded[p] === local[p])) write.push(p);
    else keep.push(p);
  }
  // Files the new version no longer has: removed only if untouched since install.
  for (const [p, h] of Object.entries(recorded || {})) {
    if (!(p in incoming) && p in local && local[p] === h && !NEVER(p)) remove.push(p);
  }
  return { write: write.sort(), keep: keep.sort(), remove: remove.sort() };
}

// Unpack GitHub's zip (one top folder) into dest, refusing anything that would
// land outside it.
const UNZIP = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$dest = [System.IO.Path]::GetFullPath($env:TB_DEST)
$zip = [System.IO.Compression.ZipFile]::OpenRead($env:TB_ZIP)
try {
  if ($zip.Entries.Count -gt 20000) { throw 'too many files in the update' }
  $total = 0
  foreach ($e in $zip.Entries) {
    $name = $e.FullName -replace '\\\\', '/'
    $i = $name.IndexOf('/')
    if ($i -lt 0) { continue }
    $rel = $name.Substring($i + 1)
    if (-not $rel -or $rel.EndsWith('/')) { continue }
    $target = [System.IO.Path]::GetFullPath((Join-Path $dest $rel))
    if (-not $target.StartsWith($dest + [System.IO.Path]::DirectorySeparatorChar)) { throw "unsafe path in the update: $rel" }
    $total += $e.Length
    if ($total -gt 600MB) { throw 'the update is too large' }
    [void][System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($target))
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($e, $target, $true)
  }
} finally { $zip.Dispose() }
`;
function unzip(zipFile, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const encoded = Buffer.from(UNZIP, 'utf16le').toString('base64');
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
    env: { ...process.env, TB_ZIP: zipFile, TB_DEST: dest }, windowsHide: true, encoding: 'utf8', timeout: 300000,
  });
  if (r.status !== 0) throw new Error(((r.stderr || r.stdout || 'could not unpack the update').trim().split('\n')[0]).slice(0, 200));
}

async function download(repo, sha1, file, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`https://codeload.github.com/${repo}/zip/${sha1}`, { headers: { 'User-Agent': 'ToshiBuddy-updater' } });
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_ZIP) throw new Error('the update is too large');
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error('the download is not a zip file');
  fs.writeFileSync(file, buf);
}

// Copy an unpacked version (srcDir) over root according to the plan.
function apply(root, srcDir, { expectSha = null } = {}) {
  const incomingFiles = walk(srcDir);
  if (!incomingFiles.includes('package.json') || !incomingFiles.includes('src/main/main.js')) throw new Error('the download does not look like this app');
  const got = localVersion(srcDir);
  if (got.dev || (expectSha && got.sha !== expectSha)) throw new Error('the download is not the version that was asked for');
  const incoming = hashAll(srcDir, incomingFiles);
  const local = hashAll(root, walk(root));
  const recorded = (readManifest(root) || {}).files || null;
  const p = plan(local, incoming, recorded);
  const inside = (rel) => {
    const full = path.resolve(root, rel);
    if (!full.startsWith(path.resolve(root) + path.sep)) throw new Error(`unsafe path: ${rel}`);
    return full;
  };
  for (const rel of p.write) {
    const to = inside(rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(srcDir, rel), to);
  }
  for (const rel of p.remove) { try { fs.rmSync(inside(rel), { force: true }); } catch (_) { /* in use: harmless leftover */ } }
  fs.writeFileSync(path.join(root, MANIFEST_FILE), JSON.stringify({ version: got.sha, files: incoming }));
  return { ...p, version: got };
}

// The Electron version the app wants vs the one installed (a mismatch means Setup must run again).
function electronMismatch(root) {
  try {
    const want = String(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).devDependencies.electron || '').replace(/^[^0-9]*/, '');
    const have = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', 'electron', 'package.json'), 'utf8')).version;
    return want.split('.')[0] !== String(have).split('.')[0];
  } catch (_) { return false; }
}

// Check, download, unpack, apply. Returns what happened.
async function update(root, { log = () => {}, fetchImpl } = {}) {
  const c = await check(root, { fetchImpl });
  if (c.dev) return { ok: false, dev: true };
  if (!c.available) return { ok: true, upToDate: true, current: c.current };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'toshibuddy-update-'));
  try {
    const zip = path.join(tmp, 'update.zip');
    log(`update: downloading ${c.latest.sha.slice(0, 7)}`);
    await download(c.repo, c.latest.sha, zip, { fetchImpl });
    const src = path.join(tmp, 'new');
    unzip(zip, src);
    const r = apply(root, src, { expectSha: c.latest.sha });
    log(`update: ${r.write.length} files updated, ${r.keep.length} of yours kept, ${r.remove.length} removed`);
    return { ok: true, updated: true, from: c.current, to: c.latest, written: r.write.length, kept: r.keep, removed: r.remove.length, needsSetup: electronMismatch(root) };
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* temp folder */ }
  }
}

module.exports = { check, update, apply, plan, walk, hashAll, localVersion, latestVersion, ensureManifest, readManifest, repoOf, unzip, VERSION_FILE, MANIFEST_FILE };
