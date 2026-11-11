'use strict';
const { app, Menu, Tray, ipcMain, powerMonitor, screen, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { createOverlay, createJarWindow } = require('./overlay');
const { Settings } = require('./settings');
const { Ledger } = require('./jar/ledger');
const { Guard } = require('./jar/guard');
const { Upgrader } = require('./jar/upgrader');
const { Git } = require('./jar/git');
const { estimate } = require('./jar/estimator');
const { listMods, readQuipPacks } = require('./mods');
const { trayIcon } = require('./tray-icon');
const { findClaude } = require('./jar/claude');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  // The overlay never gets a click before Askin's first line; let Web Audio start anyway.
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  app.whenReady().then(start);
}

function start() {
  const userData = app.getPath('userData');
  const settings = new Settings(userData);
  const ledger = new Ledger(userData);
  const logLines = [];
  const log = (line) => {
    const entry = `[${new Date().toLocaleTimeString()}] ${line}`;
    logLines.push(entry);
    if (logLines.length > 400) logLines.shift();
    console.log(entry);
    if (jarWin && !jarWin.isDestroyed()) jarWin.webContents.send('jar:run-log', entry);
  };
  const git = new Git(PROJECT_ROOT);
  const guard = new Guard({ ledger, settings, projectRoot: PROJECT_ROOT, log });

  let overlay = null;
  let jarWin = null;
  let tray = null;

  // ---- mod load reports from the renderer ----
  const modWaiters = new Map(); // slug -> resolve
  const modStatuses = new Map();
  ipcMain.on('overlay:mod-status', (_e, status) => {
    if (!status || !status.slug) return;
    modStatuses.set(status.slug, status);
    const w = modWaiters.get(status.slug);
    if (w) { w(status); modWaiters.delete(status.slug); }
    if (status.ok === false) log(`mod ${status.slug} failed: ${status.error}`);
  });
  const reloadAndAwaitMods = (slugs, timeoutMs) => new Promise((resolve) => {
    modStatuses.clear();
    const pending = slugs.map((slug) => new Promise((res) => {
      modWaiters.set(slug, res);
    }));
    if (overlay && !overlay.isDestroyed()) overlay.webContents.send('reload-content');
    const timer = setTimeout(() => {
      for (const slug of slugs) if (modWaiters.has(slug)) { modWaiters.get(slug)({ slug, ok: false, error: 'mod did not report loading in time' }); modWaiters.delete(slug); }
    }, timeoutMs);
    Promise.all(pending).then((r) => { clearTimeout(timer); resolve(r); });
  });

  const upgrader = new Upgrader({
    projectRoot: PROJECT_ROOT, ledger, guard, settings, git, log,
    emit: (ev) => {
      if (overlay && !overlay.isDestroyed()) overlay.webContents.send('upgrade-event', ev);
      pushJar();
    },
    reloadAndAwaitMods,
  });

  // ---- windows ----
  overlay = createOverlay();
  jarWin = createJarWindow(overlay);
  ledger.onChange(() => pushJar());

  function pushJar() {
    if (jarWin && !jarWin.isDestroyed()) jarWin.webContents.send('jar:changed', jarState());
  }
  function jarState() {
    return {
      ledger: ledger.snapshot(),
      guard: guard.status(),
      settings: settings.all(),
      busy: upgrader.isBusy(),
      claudeInstalled: !!findClaude(),
      log: logLines.slice(-80),
      projectRoot: PROJECT_ROOT,
    };
  }
  function say(text, opts = {}) {
    if (overlay && !overlay.isDestroyed()) overlay.webContents.send('say', { text, ...opts });
  }

  // Seed the catalog once so there is something to fund on day one.
  if (!ledger.data.seeded) {
    try {
      const catalog = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'content', 'catalog.json'), 'utf8'));
      // addGoal puts new goals first, so seed in reverse to keep the catalog order.
      for (const item of catalog.slice().reverse()) ledger.addGoal({ ...item, source: 'catalog' });
    } catch (e) { log(`catalog seed failed: ${e.message}`); }
    ledger.data.seeded = true;
    ledger.save();
  }

  // ---- overlay IPC ----
  ipcMain.on('overlay:set-ignore', (_e, ignore) => {
    if (overlay && !overlay.isDestroyed()) overlay.setIgnoreMouseEvents(ignore, { forward: true });
  });
  ipcMain.on('overlay:log', (_e, line) => log(`renderer: ${line}`));
  ipcMain.handle('overlay:bootstrap', () => ({
    workArea: screen.getPrimaryDisplay().workArea,
    settings: settings.all(),
    mods: listMods(PROJECT_ROOT, ledger.data.disabledMods),
    quips: readQuipPacks(PROJECT_ROOT),
    level: ledger.level(),
    balance: ledger.data.balance,
  }));
  ipcMain.handle('overlay:content', () => ({
    mods: listMods(PROJECT_ROOT, ledger.data.disabledMods),
    quips: readQuipPacks(PROJECT_ROOT),
    level: ledger.level(),
    balance: ledger.data.balance,
  }));
  ipcMain.on('overlay:popup-menu', () => {
    buildMenu().popup({ window: overlay });
  });
  ipcMain.on('jar:open', () => openJar());
  ipcMain.on('jar:close', () => { if (jarWin && !jarWin.isDestroyed()) jarWin.hide(); });
  ipcMain.on('jar:open-external', (_e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });

  // ---- jar IPC ----
  ipcMain.handle('jar:state', () => jarState());
  ipcMain.handle('jar:donate', (_e, { tokens, goalId }) => {
    const ceiling = guard.maxSafeDonation();
    const r = ledger.donate(tokens, { ceiling, goalId });
    if (r.accepted) say(pickDonationLine(r.accepted), { tags: ['donate'], animate: 'giftball' });
    if (r.pledged) say(`I'll only take ${fmt(r.accepted)} right now. The other ${fmt(r.pledged)} waits until your plan window breathes again. Lethal doses are my thing, not yours.`, { tags: ['guard'] });
    return { ...r, ceiling, state: jarState() };
  });
  ipcMain.handle('jar:fund', (_e, { goalId, tokens }) => ({ ...ledger.fundGoal(goalId, tokens), state: jarState() }));
  ipcMain.handle('jar:remove-goal', (_e, { goalId }) => ({ ok: ledger.removeGoal(goalId), state: jarState() }));
  ipcMain.handle('jar:settings', (_e, patch) => {
    const allowed = ['muted', 'paused', 'autostart', 'maxUtilization', 'calibrationRunTokens', 'autoBuild', 'allowUsageEndpointFallback', 'upgradeModel', 'upgradeEffort', 'maxTurns'];
    const clean = {};
    for (const k of allowed) if (k in patch) clean[k] = patch[k];
    if ('maxUtilization' in clean) clean.maxUtilization = Math.min(95, Math.max(10, Number(clean.maxUtilization) || 80));
    settings.update(clean);
    if ('autostart' in clean) applyAutostart();
    if (overlay && !overlay.isDestroyed()) overlay.webContents.send('settings', settings.all());
    refreshTray();
    return jarState();
  });
  ipcMain.handle('jar:check-usage', async () => {
    const s = await guard.refresh({ force: true });
    if (s.utilization !== null) {
      const freed = ledger.data.pledged ? ledger.releasePledges(guard.maxSafeDonation()) : 0;
      say(usageLine(s, freed), { tags: ['guard'] });
    } else {
      say(`I asked Claude how tired your plan is and got no answer. Check the jar for details.`, { tags: ['guard'] });
    }
    return jarState();
  });
  ipcMain.handle('jar:suggest', async (_e, { text }) => {
    text = String(text || '').trim().slice(0, 600);
    if (!text) return { ok: false, error: 'empty suggestion' };
    if (!findClaude()) return { ok: false, error: 'Claude Code is not installed or not logged in' };
    say(`Hmm. "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}" Let me think about what that costs. Thinking costs tokens too, you know.`, { tags: ['suggest'], animate: 'think' });
    const r = await estimate({ projectRoot: PROJECT_ROOT, ledger, request: text, log });
    if (r.rateLimit) guard.observe(r.rateLimit);
    if (!r.ok) { say(`Couldn't price that one: ${r.error}`, { tags: ['guard'] }); return { ok: false, error: r.error, state: jarState() }; }
    if (!r.goal.feasible || r.goal.touchesCore) {
      const goal = ledger.addGoal({ ...r.goal, touchesCore: true });
      say(r.reply || `That needs surgery on my insides, not a mod. Not happening from the jar.`, { tags: ['suggest'] });
      return { ok: true, goal, reply: r.reply, infeasible: true, state: jarState() };
    }
    const goal = ledger.addGoal(r.goal);
    say(`${r.reply || 'Fine.'} That's about ${fmt(goal.goalTokens)} tokens of effort. Fill the bar and I'll consider it.`, { tags: ['suggest'] });
    return { ok: true, goal, reply: r.reply, state: jarState() };
  });
  ipcMain.handle('jar:build', async (_e, { goalId }) => {
    const r = await upgrader.build(goalId);
    if (!r.ok && r.reason) say(`No upgrade today: ${r.reason}.`, { tags: ['guard'], animate: 'shrug' });
    return { ...r, state: jarState() };
  });
  ipcMain.handle('jar:resume', async (_e, { goalId }) => {
    const r = await upgrader.build(goalId, { resume: true });
    if (!r.ok && r.reason) say(`Can't resume: ${r.reason}.`, { tags: ['guard'], animate: 'shrug' });
    return { ...r, state: jarState() };
  });
  ipcMain.handle('jar:cancel-run', () => { upgrader.cancel(); return jarState(); });
  ipcMain.handle('jar:undo', async (_e, { upgradeId }) => {
    const r = await upgrader.undo(upgradeId);
    if (r.ok) say(`Fine. Forgotten. Like it never happened. Deluxe amnesia.`, { tags: ['upgrade'] });
    return { ...r, state: jarState() };
  });

  // Auto-build funded goals if the user opted in.
  ledger.onChange(() => {
    if (!settings.get('autoBuild') || upgrader.isBusy()) return;
    const next = ledger.data.goals.find((g) => g.status === 'funded' && !g.touchesCore);
    if (next) setTimeout(() => { if (!upgrader.isBusy()) upgrader.build(next.id); }, 1500);
  });

  // ---- idle detection ----
  setInterval(() => {
    if (overlay && !overlay.isDestroyed()) overlay.webContents.send('idle-seconds', powerMonitor.getSystemIdleTime());
  }, 10000);

  // ---- tray + menus ----
  function buildMenu() {
    return Menu.buildFromTemplate([
      { label: 'Open the jar', click: openJar },
      { label: 'Check plan usage', click: () => ipcMain.emit('__check-usage') },
      { type: 'separator' },
      { label: 'Mute voice', type: 'checkbox', checked: !!settings.get('muted'), click: (m) => toggleSetting('muted', m.checked) },
      { label: 'Pause wandering', type: 'checkbox', checked: !!settings.get('paused'), click: (m) => toggleSetting('paused', m.checked) },
      { label: 'Start with Windows', type: 'checkbox', checked: !!settings.get('autostart'), click: (m) => toggleSetting('autostart', m.checked) },
      { type: 'separator' },
      { label: 'Reload mods and quips', click: () => reloadAndAwaitMods([], 1000) },
      { label: 'Open project folder', click: () => shell.openPath(PROJECT_ROOT) },
      { type: 'separator' },
      { label: 'Quit', click: () => { if (jarWin) jarWin.__reallyClose = true; app.quit(); } },
    ]);
  }
  ipcMain.on('__check-usage', async () => {
    const s = await guard.refresh({ force: true });
    say(s.utilization !== null ? usageLine(s, 0) : 'No usage reading came back. Check the jar.', { tags: ['guard'] });
  });
  function toggleSetting(key, value) {
    settings.set(key, value);
    if (key === 'autostart') applyAutostart();
    if (overlay && !overlay.isDestroyed()) overlay.webContents.send('settings', settings.all());
    refreshTray();
    pushJar();
  }
  function refreshTray() { if (tray) tray.setContextMenu(buildMenu()); }
  function applyAutostart() {
    try {
      app.setLoginItemSettings({ openAtLogin: !!settings.get('autostart'), path: process.execPath, args: [app.getAppPath()] });
    } catch (e) { log(`autostart failed: ${e.message}`); }
  }
  function openJar() {
    if (!jarWin || jarWin.isDestroyed()) jarWin = createJarWindow(overlay);
    jarWin.show();
    jarWin.focus();
    pushJar();
  }
  try {
    tray = new Tray(trayIcon());
    tray.setToolTip('Askin Buddy');
    tray.setContextMenu(buildMenu());
    tray.on('click', openJar);
  } catch (e) { log(`tray failed: ${e.message}`); }

  app.on('second-instance', () => openJar());
  app.on('window-all-closed', (e) => { /* keep running in the tray */ });
  app.on('before-quit', () => { if (jarWin) jarWin.__reallyClose = true; });

  if (!findClaude()) {
    log('Claude Code CLI not found; the jar can hold tokens but cannot spend them until it is installed and logged in.');
  }
  log(`Askin Buddy started. userData=${userData}`);

  // ---- self-test: ASKIN_SELFTEST=<dir> captures both windows and quits ----
  const selftestDir = process.env.ASKIN_SELFTEST;
  for (const [name, w] of [['overlay', overlay], ['jar', jarWin]]) {
    w.webContents.on('console-message', (ev, legacyLevel, legacyMessage) => {
      // Electron 35+ passes one event object; older versions pass (event, level, message).
      const level = ev && ev.level !== undefined ? ev.level : legacyLevel;
      const message = ev && ev.message !== undefined ? ev.message : legacyMessage;
      if (level === 'error' || level === 'warning' || (typeof level === 'number' && level >= 2)) log(`${name} console: ${message}`);
    });
    w.webContents.on('render-process-gone', (_e, d) => log(`${name} renderer gone: ${d.reason}`));
    w.webContents.on('did-fail-load', (_e, code, desc) => log(`${name} failed to load: ${code} ${desc}`));
  }
  if (selftestDir) {
    fs.mkdirSync(selftestDir, { recursive: true });
    setTimeout(async () => {
      try {
        jarWin.showInactive();
        await new Promise((r) => setTimeout(r, 1500));
        const wa = screen.getPrimaryDisplay().workArea;
        const ov = await overlay.webContents.capturePage({ x: 0, y: wa.height - 420, width: wa.width, height: 420 });
        fs.writeFileSync(path.join(selftestDir, 'overlay.png'), ov.toPNG());
        // Plain close-up at 3x: freeze him in idle with no bubble.
        const pos = JSON.parse(await overlay.webContents.executeJavaScript(`AskinBrain.setPaused(true); AskinBubble.hide(); AskinVoice.stop(); const p=document.getElementById('pet'); p.className='idle face-right'; p.style.setProperty('--x',0); document.querySelectorAll('#pet *').forEach(e=>e.style.animationPlayState='paused'); JSON.stringify({x: AskinBrain.state.x, y: AskinBrain.state.y})`));
        await new Promise((r) => setTimeout(r, 400));
        // A blink may still be in flight; wait it out.
        await overlay.webContents.executeJavaScript(`document.getElementById('pet').classList.remove('blink'); 1`);
        await new Promise((r) => setTimeout(r, 200));
        const plain = await overlay.webContents.capturePage({ x: Math.max(0, Math.round(pos.x)), y: Math.max(0, Math.round(pos.y)), width: 160, height: 200 });
        fs.writeFileSync(path.join(selftestDir, 'plain.png'), plain.resize({ width: 480, quality: 'best' }).toPNG());
        // Then a bubble and the Gift Ball, cropped wider.
        await overlay.webContents.executeJavaScript(`document.querySelectorAll('#pet *').forEach(e=>e.style.animationPlayState=''); AskinBrain.say('Gift Ball Deluxe. Try not to stare.'); AskinBrain.playAnimation('giftball'); 1`);
        await new Promise((r) => setTimeout(r, 900));
        const cx = Math.max(0, Math.round(pos.x) - 120);
        const close = await overlay.webContents.capturePage({ x: cx, y: Math.max(0, Math.round(pos.y) - 130), width: 400, height: 330 });
        fs.writeFileSync(path.join(selftestDir, 'closeup.png'), close.resize({ width: 800 }).toPNG());
        const jp = await jarWin.webContents.capturePage();
        fs.writeFileSync(path.join(selftestDir, 'jar.png'), jp.toPNG());
        const probe = await overlay.webContents.executeJavaScript(`JSON.stringify({ mods: AskinMods.list(), quips: AskinQuips.all().length, mode: AskinBrain.state.mode, x: AskinBrain.state.x, y: AskinBrain.state.y, bubble: AskinBubble.isVisible(), text: document.getElementById('bubble-text').textContent, petClass: document.getElementById('pet').className, lidsTransform: getComputedStyle(document.getElementById('lids')).transform, lidsBox: (() => { const r = document.getElementById('lids').getBoundingClientRect(); return [r.top, r.height]; })(), irisBox: (() => { const r = document.querySelector('#face circle').getBoundingClientRect(); return [r.top, r.height]; })(), idle: AskinBrain.state.idleSeconds })`);
        fs.writeFileSync(path.join(selftestDir, 'state.json'), probe);
        fs.writeFileSync(path.join(selftestDir, 'log.txt'), logLines.join('\n'));
      } catch (e) {
        fs.writeFileSync(path.join(selftestDir, 'log.txt'), logLines.join('\n') + `\nSELFTEST ERROR: ${e.stack}`);
      }
      if (jarWin) jarWin.__reallyClose = true;
      app.exit(0);
    }, 5000);
  }
}

function fmt(n) {
  n = Math.round(n || 0);
  if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.?0+$/, '') + 'k';
  return String(n);
}
function pickDonationLine(tokens) {
  const lines = [
    `${fmt(tokens)} tokens. Generous. Suspiciously generous. I'll allow it.`,
    `Oh, ${fmt(tokens)} tokens? For me? I'd clap, but that's effort.`,
    `${fmt(tokens)} tokens in the jar. One step closer to Deluxe.`,
    `Donation received. ${fmt(tokens)} tokens. Don't expect gratitude, expect results. Eventually.`,
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}
function usageLine(s, freed) {
  const pct = s.utilization.toFixed(0);
  const reset = s.resetsAt ? ` It breathes again around ${new Date(s.resetsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` : '';
  const freedLine = freed ? ` I also let ${fmt(freed)} pledged tokens into the jar.` : '';
  if (s.utilization >= s.maxUtilization) return `Your plan is at ${pct}% and my cap is ${s.maxUtilization}%. I'm not spending another token.${reset}${freedLine}`;
  if (s.utilization >= s.maxUtilization - 15) return `Plan's at ${pct}%. Getting close to my ${s.maxUtilization}% line. Careful dosage from here.${reset}${freedLine}`;
  return `Your plan is only ${pct}% used. Plenty of room for... moderate effort.${freedLine}`;
}
