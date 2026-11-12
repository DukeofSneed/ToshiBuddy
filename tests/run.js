// Runs every tests/*.test.js and reports. `npm test`.
// Tests that need Electron's image tools (import.test.js) run under Electron.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const NEEDS_ELECTRON = new Set(['import.test.js']);
let electron = null;
try { electron = require('electron'); } catch (_) { /* not installed */ }

let failed = 0;
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.test.js')).sort()) {
  const usesElectron = NEEDS_ELECTRON.has(file);
  if (usesElectron && typeof electron !== 'string') { console.log(`- ${file}: skipped (Electron not installed)`); continue; }
  const cmd = usesElectron ? electron : process.execPath;
  const r = spawnSync(cmd, [path.join(dir, file)], { encoding: 'utf8', windowsHide: true, timeout: 180000 });
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim().split(/\r?\n/).filter((l) => l.trim());
  const good = r.status === 0;
  if (!good) failed++;
  console.log(`${good ? 'ok  ' : 'FAIL'} ${file}: ${out[out.length - 1] || '(no output)'}`);
  if (!good) for (const l of out.slice(-15)) console.log(`       ${l}`);
}
console.log(failed ? `\n${failed} test file(s) failed` : '\nall tests passed');
process.exitCode = failed ? 1 : 0;
