'use strict';
// Watches which app is in the foreground so the pet can sit at its desk while
// the user writes or does labs. Runs one long-lived hidden PowerShell process
// that prints the foreground process name and window title every 2 seconds.
// Nothing here is logged, stored, or sent anywhere; samples are classified and
// dropped immediately.
const { spawn } = require('child_process');

const SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class KoriFg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
}
"@
while ($true) {
  $h = [KoriFg]::GetForegroundWindow()
  $procId = 0
  [void][KoriFg]::GetWindowThreadProcessId($h, [ref]$procId)
  $sb = New-Object System.Text.StringBuilder 512
  [void][KoriFg]::GetWindowText($h, $sb, 512)
  $name = ''
  try { $name = (Get-Process -Id $procId).ProcessName } catch {}
  [Console]::Out.WriteLine((@{ p = $name; t = $sb.ToString() } | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 2000
}
`;

const DEFAULT_APPS = {
  writing: ['winword', 'notepad', 'notepad++', 'wordpad', 'obsidian', 'notion', 'typora', 'onenote', 'code',
    'sublime_text', 'soffice.bin', 'scrivener', 'marktext', 'joplin', 'logseq', 'zettlr', 'acrord32', 'acrobat'],
  lab: ['vmware', 'vmplayer', 'vmware-vmx', 'virtualbox', 'virtualboxvm', 'vmconnect', 'wireshark', 'putty',
    'windowsterminal', 'mobaxterm', 'mstsc', 'packettracer', 'gns3', 'winscp', 'burpsuite'],
};
const DEFAULT_TITLES = {
  writing: ['google docs', 'overleaf', 'word online', 'microsoft word', 'notion', 'grammarly', 'quizlet', 'canvas', 'blackboard'],
  lab: ['kali', 'opnsense', 'pfsense', 'ubuntu', 'vmware', 'wireshark', 'tryhackme', 'hack the box', 'hackthebox', 'labs'],
};
const IGNORE = ['electron', 'askin-buddy', 'claude', 'explorer', 'shellexperiencehost', 'searchhost', 'lockapp', 'taskmgr'];

function classify(sample, cfg = {}) {
  if (!sample) return null;
  const proc = String(sample.p || '').toLowerCase();
  const title = String(sample.t || '').toLowerCase();
  if (!proc || IGNORE.includes(proc)) return null;
  const apps = cfg.apps || DEFAULT_APPS;
  const titles = cfg.titles || DEFAULT_TITLES;
  for (const kind of ['lab', 'writing']) {
    if ((apps[kind] || []).includes(proc)) return kind;
  }
  for (const kind of ['lab', 'writing']) {
    if ((titles[kind] || []).some((k) => k && title.includes(k))) return kind;
  }
  return null;
}

class ActivityWatcher {
  constructor({ onSample, log }) {
    this.onSample = onSample;
    this.log = log || (() => {});
    this.child = null;
    this.stopped = true;
    this.failures = 0;
  }

  start() {
    if (process.platform !== 'win32') { this.log('activity: desk mode needs Windows; skipping'); return; }
    if (this.child) return;
    this.stopped = false;
    const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64');
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded], {
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    this.child = child;
    let buf = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        try { this.onSample(JSON.parse(line)); this.failures = 0; } catch (_) { /* ignore a bad line */ }
      }
    });
    child.on('exit', () => {
      this.child = null;
      if (this.stopped) return;
      this.failures += 1;
      if (this.failures > 5) { this.log('activity: watcher keeps exiting; desk mode paused until restart'); return; }
      setTimeout(() => this.start(), 10000 * this.failures);
    });
    child.on('error', (e) => this.log(`activity: watcher failed to start: ${e.message}`));
  }

  stop() {
    this.stopped = true;
    if (this.child) {
      try { spawn('taskkill', ['/PID', String(this.child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch (_) { /* ignore */ }
      this.child = null;
    }
  }
}

module.exports = { ActivityWatcher, classify, DEFAULT_APPS, DEFAULT_TITLES };
