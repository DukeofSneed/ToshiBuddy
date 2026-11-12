const assert = require('assert');
const fs = require('fs');
const root = require('path').join(__dirname, '..');
const { RUN_SETTINGS, runSettingsFile } = require(root + '/src/main/jar/upgrader.js');
const { spawnSync } = require('child_process');
const os = require('os');
const file = runSettingsFile();
assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), JSON.parse(RUN_SETTINGS));
// Same spawn path the app uses (no shell); --version exits before any model call.
const exe = os.homedir() + '/.local/bin/claude.exe';
// Optional: only when Claude Code is installed (friends may not have it).
if (fs.existsSync(exe)) {
  const r = spawnSync(exe, ['--settings', file, '--version'], { encoding: 'utf8', windowsHide: true });
  console.log('claude --settings <file> --version ->', (r.stdout || r.stderr).trim(), '| exit', r.status);
  assert.strictEqual(r.status, 0, 'CLI rejected the settings file');
} else console.log('(Claude Code not installed: skipped the CLI check)');
const s = JSON.parse(RUN_SETTINGS);
const deny = s.permissions.deny;
for (const rule of ['Bash', 'PowerShell', 'WebFetch', 'Edit(src/**)', 'Write(src/**)', 'Edit(.claude/**)', 'Write(package.json)']) {
  assert.ok(deny.includes(rule), 'missing ' + rule);
}
const src = fs.readFileSync(root + '/src/main/jar/upgrader.js', 'utf8');
assert.ok(src.includes("'--settings', runSettingsFile()"), 'not passed to the run');
assert.ok(!fs.existsSync(root + '/.claude/settings.json'), 'project settings file is back');
console.log(`ok: ${deny.length} deny rules, passed to upgrade runs via --settings, project settings file absent`);
