'use strict';
// Watches which app is in the foreground and whether the user is typing, so the
// pet can sit at its desk during sustained typing. Runs one long-lived hidden
// PowerShell process that prints, every 2 seconds, the foreground process name,
// window title, and a typing count.
//
// Typing is inferred without reading the keyboard: every 250 ms it checks
// whether there was any input (GetLastInputInfo) while the mouse cursor stayed
// put. Input with a still cursor is almost always typing. k = how many of the
// last 8 checks looked like that (0-8). Which keys were pressed is never seen.
//
// Nothing here is logged, stored, or sent anywhere; samples are classified and
// dropped immediately.
const { spawn } = require('child_process');

const SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class BuddyFg {
  [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO i);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  public static uint LastInput() { var i = new LASTINPUTINFO(); i.cbSize = 8; GetLastInputInfo(ref i); return i.dwTime; }
}
"@
$prevInput = [BuddyFg]::LastInput()
$prevPos = New-Object BuddyFg+POINT
[void][BuddyFg]::GetCursorPos([ref]$prevPos)
while ($true) {
  $k = 0
  for ($i = 0; $i -lt 8; $i++) {
    Start-Sleep -Milliseconds 250
    $inp = [BuddyFg]::LastInput()
    $pos = New-Object BuddyFg+POINT
    [void][BuddyFg]::GetCursorPos([ref]$pos)
    if ($inp -ne $prevInput -and $pos.X -eq $prevPos.X -and $pos.Y -eq $prevPos.Y) { $k++ }
    $prevInput = $inp
    $prevPos = $pos
  }
  $h = [BuddyFg]::GetForegroundWindow()
  $procId = 0
  [void][BuddyFg]::GetWindowThreadProcessId($h, [ref]$procId)
  $sb = New-Object System.Text.StringBuilder 512
  [void][BuddyFg]::GetWindowText($h, $sb, 512)
  $name = ''
  try { $name = (Get-Process -Id $procId).ProcessName } catch {}
  [Console]::Out.WriteLine((@{ p = $name; t = $sb.ToString(); k = $k } | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}
`;

// Kinds pick which lines play (coding, lab = studying, writing = general work,
// reading). leisure is only used for the opt-in "slacking" nudge, and typing in a
// leisure app (games) never brings out the desk.
const DEFAULT_APPS = {
  coding: ['code', 'cursor', 'windsurf', 'devenv', 'idea64', 'pycharm64', 'webstorm64', 'rider64', 'clion64',
    'goland64', 'studio64', 'eclipse', 'zed'],
  writing: ['winword', 'notepad', 'notepad++', 'wordpad', 'obsidian', 'notion', 'typora', 'onenote',
    'sublime_text', 'soffice.bin', 'scrivener', 'marktext', 'joplin', 'logseq', 'zettlr'],
  lab: ['vmware', 'vmplayer', 'vmware-vmx', 'virtualbox', 'virtualboxvm', 'vmconnect', 'wireshark', 'putty',
    'windowsterminal', 'mobaxterm', 'mstsc', 'packettracer', 'gns3', 'winscp', 'burpsuite'],
  reading: ['acrord32', 'acrobat', 'sumatrapdf', 'foxitpdfreader', 'foxitreader', 'kindle', 'calibre', 'drawboardpdf'],
  leisure: ['robloxplayerbeta', 'steam', 'steamwebhelper', 'epicgameslauncher', 'riotclientservices', 'leagueclient',
    'valorant', 'minecraft', 'javaw', 'battle.net', 'spotify'],
};
const DEFAULT_TITLES = {
  coding: ['github', 'gitlab', 'replit', 'leetcode', 'codepen', 'jupyter', 'colab'],
  writing: ['google docs', 'overleaf', 'word online', 'microsoft word', 'notion', 'grammarly', 'quizlet', 'canvas', 'blackboard'],
  lab: ['kali', 'opnsense', 'pfsense', 'ubuntu', 'vmware', 'wireshark', 'tryhackme', 'hack the box', 'hackthebox', 'labs'],
  reading: ['.pdf', 'kindle', 'epub', 'chapter', 'wattpad', 'archive of our own'],
  leisure: ['youtube', 'netflix', 'twitch', 'crunchyroll', 'hulu', 'disney+', 'tiktok', 'reddit'],
};
const KIND_ORDER = ['lab', 'coding', 'writing', 'reading', 'leisure'];
const IGNORE = ['electron', 'toshibuddy', 'claude', 'explorer', 'shellexperiencehost', 'searchhost', 'lockapp', 'taskmgr'];

function classify(sample, cfg = {}) {
  if (!sample) return null;
  const proc = String(sample.p || '').toLowerCase();
  const title = String(sample.t || '').toLowerCase();
  if (!proc || IGNORE.includes(proc)) return null;
  const apps = cfg.apps || DEFAULT_APPS;
  const titles = cfg.titles || DEFAULT_TITLES;
  // Work kinds win over leisure (a lab tutorial on YouTube still counts as a lab).
  for (const kind of KIND_ORDER) {
    if ((apps[kind] || DEFAULT_APPS[kind] || []).includes(proc)) return kind;
  }
  for (const kind of KIND_ORDER) {
    if ((titles[kind] || DEFAULT_TITLES[kind] || []).some((k) => k && title.includes(k))) return kind;
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
