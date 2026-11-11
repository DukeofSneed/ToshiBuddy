'use strict';
const { app, Menu, Tray, ipcMain, powerMonitor, screen, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { createOverlay, createJarWindow, createCustomizeWindow } = require('./overlay');
const { QuipStore } = require('./quip-store');
const { Settings } = require('./settings');
const { Ledger } = require('./jar/ledger');
const { Guard } = require('./jar/guard');
const { Upgrader } = require('./jar/upgrader');
const { Git } = require('./jar/git');
const { estimate } = require('./jar/estimator');
const { listMods, readQuipPacks, readSkinDialogue, listSkins, skinsRoot } = require('./mods');
const { trayIcon } = require('./tray-icon');
const { findClaude } = require('./jar/claude');
const { ActivityWatcher, classify } = require('./activity');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  // The overlay never gets a click before the pet's first line; let Web Audio start anyway.
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  app.whenReady().then(start);
}

// Data from before the rename lived in %APPDATA%\askin-buddy (older package name).
// Copy it over once so balances, names, and edited quips survive.
function migrateOldUserData(userData) {
  try {
    if (fs.existsSync(path.join(userData, 'settings.json'))) return;
    const old = path.join(path.dirname(userData), ['ask', 'in-buddy'].join(''));
    if (!fs.existsSync(path.join(old, 'settings.json'))) return;
    fs.mkdirSync(userData, { recursive: true });
    for (const f of fs.readdirSync(old)) {
      if (f === 'settings.json' || f === 'ledger.json' || /^quips-custom.*\.json$/.test(f)) {
        fs.copyFileSync(path.join(old, f), path.join(userData, f));
      }
    }
  } catch (e) { console.error(`userData migration failed: ${e.message}`); }
}

function start() {
  const userData = app.getPath('userData');
  migrateOldUserData(userData);
  try { app.setAppUserModelId('ToshiBuddy'); } catch (_) { /* Windows only */ }
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
  // Dialogue belongs to the active character: a skin with its own quips.json uses
  // that (plus upgrade packs) instead of Kori's base.json; edits are per character.
  const quipStores = new Map();
  const quipStore = () => {
    const who = activeSkinName();
    if (!quipStores.has(who)) quipStores.set(who, new QuipStore(userData, who));
    return quipStores.get(who);
  };
  const activePacks = () => {
    const d = readSkinDialogue(PROJECT_ROOT, activeSkinName());
    return d ? [...d.quips, ...readQuipPacks(PROJECT_ROOT, { skipBase: true })] : readQuipPacks(PROJECT_ROOT);
  };
  const quipsForPet = () => quipStore().merged(activePacks());

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
    character: () => ({ name: charName(), isSkin: activeSkinName() !== 'kori' }),
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
      settings: publicSettings(),
      busy: upgrader.isBusy(),
      claudeInstalled: !!findClaude(),
      skins: listSkins(PROJECT_ROOT).map((s) => s.name),
      activeSkin: activeSkinName(),
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
  // Which character is active: a user skin is the default when one exists;
  // 'kori' explicitly picks the built-in original character.
  const activeSkinName = () => {
    const want = process.env.TOSHI_CHARACTER || settings.get('skin') || '';
    if (want === 'kori') return 'kori';
    const skins = listSkins(PROJECT_ROOT);
    if (want && skins.some((s) => s.name === want)) return want;
    return skins.length ? skins[0].name : 'kori';
  };
  // The display name belongs to the active character: each skin (and Kori) has its own.
  const prettySkin = (n) => n.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const charName = () => {
    const who = activeSkinName();
    const names = settings.get('characterNames') || {};
    return String(names[who] || '').trim() || (who === 'kori' ? 'Kori' : prettySkin(who));
  };
  const publicSettings = () => ({ ...settings.all(), characterName: charName() });
  const currentSkin = () => {
    const name = activeSkinName();
    return name === 'kori' ? null : listSkins(PROJECT_ROOT).find((s) => s.name === name) || null;
  };
  // The renderer slices sprite sheets and sends back a numbered preview
  // (sheet-index.png / ultimate-sheet-index.png) so the user can map frames.
  ipcMain.on('overlay:sheet-index', (_e, { skin, kind, dataUrl } = {}) => {
    try {
      if (!['sheet', 'ultimate-sheet'].includes(kind)) return;
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) return;
      if (!listSkins(PROJECT_ROOT).some((s) => s.name === skin)) return;
      const file = path.join(skinsRoot(PROJECT_ROOT), skin, `${kind}-index.png`);
      fs.writeFileSync(file, Buffer.from(dataUrl.slice(22), 'base64'));
    } catch (e) { log(`sheet index not saved: ${e.message}`); }
  });
  ipcMain.handle('overlay:bootstrap', () => ({
    workArea: screen.getPrimaryDisplay().workArea,
    settings: publicSettings(),
    skin: currentSkin(),
    mods: listMods(PROJECT_ROOT, ledger.data.disabledMods),
    quips: quipsForPet(),
    level: ledger.level(),
    balance: ledger.data.balance,
  }));
  ipcMain.handle('overlay:content', () => ({
    mods: listMods(PROJECT_ROOT, ledger.data.disabledMods),
    quips: quipsForPet(),
    level: ledger.level(),
    balance: ledger.data.balance,
  }));
  ipcMain.on('overlay:popup-menu', () => {
    buildMenu().popup({ window: overlay });
  });
  ipcMain.on('jar:open', () => openJar());
  ipcMain.on('jar:close', () => { if (jarWin && !jarWin.isDestroyed()) jarWin.hide(); });
  ipcMain.on('jar:open-external', (_e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });

  // ---- name and quip editor ----
  let customizeWin = null;
  const customizeState = () => ({ name: charName(), items: quipStore().editorList(activePacks()) });
  function openCustomize() {
    if (!customizeWin || customizeWin.isDestroyed()) {
      customizeWin = createCustomizeWindow();
      customizeWin.on('closed', () => { customizeWin = null; });
    } else {
      customizeWin.show();
      customizeWin.focus();
    }
  }
  function quipsChanged() {
    if (overlay && !overlay.isDestroyed()) overlay.webContents.send('quips', quipsForPet());
    const s = customizeState();
    if (customizeWin && !customizeWin.isDestroyed()) customizeWin.webContents.send('custom:changed', s);
    return { state: s };
  }
  const guarded = (fn) => (_e, args) => {
    try { return fn(args || {}); } catch (e) { return { error: e.message }; }
  };
  ipcMain.handle('custom:state', () => customizeState());
  ipcMain.handle('custom:set-name', guarded(({ name }) => {
    const clean = String(name || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!clean) throw new Error('The name can\'t be empty.');
    settings.set('characterNames', { ...(settings.get('characterNames') || {}), [activeSkinName()]: clean });
    if (overlay && !overlay.isDestroyed()) overlay.webContents.send('settings', publicSettings());
    refreshTray();
    pushJar();
    return quipsChanged();
  }));
  ipcMain.handle('custom:add', guarded(({ text, tags }) => { quipStore().add({ text, tags }); return quipsChanged(); }));
  ipcMain.handle('custom:update', guarded(({ key, text, tags }) => { quipStore().update(String(key), { text, tags }); return quipsChanged(); }));
  ipcMain.handle('custom:remove', guarded(({ key }) => { quipStore().remove(String(key)); return quipsChanged(); }));
  ipcMain.handle('custom:restore', guarded(({ key }) => { quipStore().restore(String(key)); return quipsChanged(); }));
  ipcMain.on('custom:say', (_e, { text } = {}) => {
    const t = String(text || '').trim().slice(0, 240);
    if (t) say(t.replace(/\{name\}/g, charName()).replace(/\{hour\}/g, new Date().getHours()));
  });

  // ---- jar IPC ----
  ipcMain.handle('jar:state', () => jarState());
  ipcMain.handle('jar:donate', (_e, { tokens, goalId }) => {
    const ceiling = guard.maxSafeDonation();
    const levelBefore = ledger.level().level;
    const r = ledger.donate(tokens, { ceiling, goalId });
    if (r.accepted && overlay && !overlay.isDestroyed()) overlay.webContents.send('sfx', { name: 'coin' });
    // The jar is the thing he tends: a donation is growth (the character's
    // 'activity_bonsai' lines when it has them), a new level is a milestone.
    if (r.accepted) say(pickDonationLine(r.accepted), { animate: 'ultimate', tags: ['jar-grow'] });
    if (r.accepted && ledger.level().level > levelBefore && overlay && !overlay.isDestroyed()) {
      setTimeout(() => overlay.webContents.send('quip', { tags: ['level-up'] }), 7000);
    }
    if (r.pledged) say(`I can only accept ${fmt(r.accepted)} right now. The other ${fmt(r.pledged)} is filed as a pledge until your plan window resets. Regulations.`);
    return { ...r, ceiling, state: jarState() };
  });
  ipcMain.handle('jar:fund', (_e, { goalId, tokens }) => {
    const r = ledger.fundGoal(goalId, tokens);
    if (r && r.moved > 0 && overlay && !overlay.isDestroyed()) overlay.webContents.send('quip', { tags: ['jar-grow'] });
    return { ...r, state: jarState() };
  });
  ipcMain.handle('jar:remove-goal', (_e, { goalId }) => ({ ok: ledger.removeGoal(goalId), state: jarState() }));
  ipcMain.handle('jar:settings', (_e, patch) => {
    const allowed = ['muted', 'sfx', 'sfxVolume', 'paused', 'autostart', 'deskMode', 'slackNudges', 'skin', 'maxUtilization', 'calibrationRunTokens', 'autoBuild', 'allowUsageEndpointFallback', 'upgradeModel', 'upgradeEffort', 'maxTurns'];
    const clean = {};
    for (const k of allowed) if (k in patch) clean[k] = patch[k];
    const skinChanged = 'skin' in clean && clean.skin !== settings.get('skin');
    if ('skin' in clean && clean.skin && clean.skin !== 'kori' && !listSkins(PROJECT_ROOT).some((s) => s.name === clean.skin)) clean.skin = '';
    if ('maxUtilization' in clean) clean.maxUtilization = Math.min(95, Math.max(10, Number(clean.maxUtilization) || 80));
    if ('sfxVolume' in clean) clean.sfxVolume = Math.min(1, Math.max(0, Number(clean.sfxVolume) || 0));
    settings.update(clean);
    if ('autostart' in clean) applyAutostart();
    if (overlay && !overlay.isDestroyed()) overlay.webContents.send('settings', publicSettings());
    if (skinChanged) { reloadAndAwaitMods([], 1000); quipsChanged(); }
    refreshTray();
    return jarState();
  });
  ipcMain.handle('jar:check-usage', async () => {
    const s = await guard.refresh({ force: true });
    if (s.utilization !== null) {
      const freed = ledger.data.pledged ? ledger.releasePledges(guard.maxSafeDonation()) : 0;
      say(usageLine(s, freed), { tags: ['guard'] });
    } else {
      say(`I requested your plan usage and got no reply. The details are in the jar's log.`);
    }
    return jarState();
  });
  ipcMain.handle('jar:suggest', async (_e, { text }) => {
    text = String(text || '').trim().slice(0, 600);
    if (!text) return { ok: false, error: 'empty suggestion' };
    if (!findClaude()) return { ok: false, error: 'Claude Code is not installed or not logged in' };
    say(`"${text.slice(0, 60)}${text.length > 60 ? '…' : ''}" Noted. I'll draft a cost estimate. Estimates cost tokens too.`, { animate: 'think' });
    const r = await estimate({ projectRoot: PROJECT_ROOT, ledger, request: text, log, character: { name: charName(), isSkin: activeSkinName() !== 'kori' } });
    if (r.rateLimit) guard.observe(r.rateLimit);
    if (!r.ok) { say(`I couldn't estimate that one: ${r.error}`); return { ok: false, error: r.error, state: jarState() }; }
    if (!r.goal.feasible || r.goal.touchesCore) {
      const goal = ledger.addGoal({ ...r.goal, touchesCore: true });
      say(r.reply || `That needs changes to my core. Outside what the jar can authorize.`);
      return { ok: true, goal, reply: r.reply, infeasible: true, state: jarState() };
    }
    const goal = ledger.addGoal(r.goal);
    say(`${r.reply || 'Acceptable.'} Estimated cost: ${fmt(goal.goalTokens)} tokens. Fill the bar and I'll file it.`);
    return { ok: true, goal, reply: r.reply, state: jarState() };
  });
  ipcMain.handle('jar:build', async (_e, { goalId }) => {
    const r = await upgrader.build(goalId);
    if (!r.ok && r.reason) say(`Request denied: ${r.reason}.`, { animate: 'shrug' });
    return { ...r, state: jarState() };
  });
  ipcMain.handle('jar:resume', async (_e, { goalId }) => {
    const r = await upgrader.build(goalId, { resume: true });
    if (!r.ok && r.reason) say(`I can't resume that: ${r.reason}.`, { animate: 'shrug' });
    return { ...r, state: jarState() };
  });
  ipcMain.handle('jar:cancel-run', () => { upgrader.cancel(); return jarState(); });
  ipcMain.handle('jar:undo', async (_e, { upgradeId }) => {
    const r = await upgrader.undo(upgradeId);
    if (r.ok) say(`Revoked. I've shredded the paperwork. It never happened.`);
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

  // ---- desk mode: is the user actively writing or doing a lab? ----
  // Samples are classified and dropped; window titles are never logged or stored.
  const activity = new ActivityWatcher({
    log,
    onSample: (sample) => {
      if (!overlay || overlay.isDestroyed()) return;
      const kind = classify(sample, {
        apps: settings.get('deskApps') || undefined,
        titles: settings.get('deskTitles') || undefined,
      });
      const idle = powerMonitor.getSystemIdleTime();
      const leisure = kind === 'leisure' && settings.get('slackNudges') !== false && idle < 120;
      // typing: 0-8, how much of the last 2 seconds looked like typing. The desk
      // decides from a rolling window; typing in a game never counts.
      const typing = kind === 'leisure' ? 0 : Math.max(0, Math.min(8, Number(sample.k) || 0));
      overlay.webContents.send('activity', { typing, kind, leisure, idle });
    },
  });
  const watcherWanted = () => settings.get('deskMode') !== false || settings.get('slackNudges') !== false;
  if (watcherWanted() && !process.env.TOSHI_SELFTEST) activity.start();

  // ---- tray + menus ----
  function buildMenu() {
    const skins = listSkins(PROJECT_ROOT);
    const skinItems = [
      ...skins.map((s) => ({ label: s.name, type: 'radio', checked: activeSkinName() === s.name, click: () => setSkin(s.name) })),
      { label: activeSkinName() === 'kori' ? 'Kori (original character)' : 'Built-in character', type: 'radio', checked: activeSkinName() === 'kori', click: () => setSkin('kori') },
      { type: 'separator' },
      { label: 'Show prop anchors (for tuning skin.json)', type: 'checkbox', checked: !!settings.get('showAnchors'), click: (m) => toggleSetting('showAnchors', m.checked) },
      { label: 'Open skins folder', click: () => { const d = skinsRoot(PROJECT_ROOT); fs.mkdirSync(d, { recursive: true }); shell.openPath(d); } },
    ];
    return Menu.buildFromTemplate([
      { label: `${charName()} Buddy`, enabled: false },
      { label: 'Rename character…', click: openCustomize },
      { label: 'Edit quips…', click: openCustomize },
      { type: 'separator' },
      { label: 'Open the jar', click: openJar },
      { label: 'Check plan usage', click: () => ipcMain.emit('__check-usage') },
      { label: 'Frost Release (ultimate form)', click: () => { if (overlay && !overlay.isDestroyed()) overlay.webContents.send('animate', { name: 'ultimate' }); } },
      { type: 'separator' },
      { label: 'Mute voice', type: 'checkbox', checked: !!settings.get('muted'), click: (m) => toggleSetting('muted', m.checked) },
      { label: 'Sound effects', type: 'checkbox', checked: settings.get('sfx') !== false, click: (m) => toggleSetting('sfx', m.checked) },
      { label: 'Desk mode (writing and labs)', type: 'checkbox', checked: settings.get('deskMode') !== false, click: (m) => toggleSetting('deskMode', m.checked) },
      { label: 'Nudge me when I slack off', type: 'checkbox', checked: settings.get('slackNudges') !== false, click: (m) => toggleSetting('slackNudges', m.checked) },
      { label: 'Skin', submenu: skinItems },
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
  function setSkin(name) {
    settings.set('skin', name);
    reloadAndAwaitMods([], 1000);
    refreshTray();
    pushJar();
    quipsChanged(); // the editor shows the new character's name
  }
  function toggleSetting(key, value) {
    settings.set(key, value);
    if (key === 'autostart') applyAutostart();
    if (key === 'deskMode' || key === 'slackNudges') { if (watcherWanted()) activity.start(); else activity.stop(); }
    if (key === 'showAnchors') reloadAndAwaitMods([], 1000);
    if (overlay && !overlay.isDestroyed()) overlay.webContents.send('settings', publicSettings());
    refreshTray();
    pushJar();
  }
  function refreshTray() { if (tray) { tray.setContextMenu(buildMenu()); tray.setToolTip(`${charName()} Buddy`); } }
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
    tray.setToolTip(`${charName()} Buddy`);
    tray.setContextMenu(buildMenu());
    tray.on('click', openJar);
  } catch (e) { log(`tray failed: ${e.message}`); }

  app.on('second-instance', () => openJar());
  app.on('window-all-closed', (e) => { /* keep running in the tray */ });
  app.on('before-quit', () => { if (jarWin) jarWin.__reallyClose = true; activity.stop(); });

  if (!findClaude()) {
    log('Claude Code CLI not found; the jar can hold tokens but cannot spend them until it is installed and logged in.');
  }
  log(`ToshiBuddy started. userData=${userData}`);

  // ---- self-test: TOSHI_SELFTEST=<dir> captures both windows and quits ----
  const selftestDir = process.env.TOSHI_SELFTEST;
  for (const [name, w] of [['overlay', overlay], ['jar', jarWin]]) {
    w.webContents.on('console-message', (ev) => {
      if (ev.level === 'error' || ev.level === 'warning') log(`${name} console: ${ev.message}`);
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
        const pos = JSON.parse(await overlay.webContents.executeJavaScript(`BuddyBrain.setPaused(true); BuddyBubble.hide(); BuddyVoice.stop(); const p=document.getElementById('pet'); const keep=['skin','has-ultimate','sheet','ultimate-sheet'].filter(c=>p.classList.contains(c)); p.className=['idle','face-right',...keep].join(' '); document.querySelectorAll('#pet *').forEach(e=>e.style.animationPlayState='paused'); JSON.stringify({x: BuddyBrain.state.x, y: BuddyBrain.state.y})`));
        await new Promise((r) => setTimeout(r, 400));
        // A blink may still be in flight; wait it out.
        await overlay.webContents.executeJavaScript(`document.getElementById('pet').classList.remove('blink'); 1`);
        await new Promise((r) => setTimeout(r, 200));
        if (process.env.TOSHI_SELFTEST_PROPS) {
          // Show every hidden mod prop and the anchor markers for this capture.
          await overlay.webContents.executeJavaScript(`document.querySelectorAll('[data-mod]').forEach(g => g.setAttribute('display','inline')); document.getElementById('pet').classList.add('show-anchors'); 1`);
          await new Promise((r) => setTimeout(r, 200));
        }
        const plain = await overlay.webContents.capturePage({ x: Math.max(0, Math.round(pos.x)), y: Math.max(0, Math.round(pos.y)), width: 160, height: 200 });
        fs.writeFileSync(path.join(selftestDir, 'plain.png'), plain.resize({ width: 480, quality: 'best' }).toPNG());
        // Sprite-sheet skins: one capture per pet state, to check the frame mapping.
        if (await overlay.webContents.executeJavaScript(`window.BUDDY_SHEET_DEBUG = true; document.getElementById('pet').classList.contains('sheet')`)) {
          for (const [k, wait] of [['walk', 500], ['talk', 500], ['think', 300], ['surprised', 300], ['huff', 300], ['drag', 300], ['fall', 300], ['sleep', 3400], ['frost', 900]]) {
            const mode = ['walk', 'sleep', 'drag', 'fall'].includes(k) ? k : 'idle';
            const extra = mode === k ? '' : ` ${k}`;
            await overlay.webContents.executeJavaScript(k === 'sleep'
              ? `BuddyBrain.onIdleSeconds(400); BuddyBubble.hide(); 1` // a real nap, so the brain doesn't undo it
              : `(() => { const p=document.getElementById('pet'); const keep=['skin','has-ultimate','sheet','ultimate-sheet'].filter(c=>p.classList.contains(c)); p.className=['${mode}${extra}','face-right',...keep].join(' '); return 1; })()`);
            await new Promise((r) => setTimeout(r, wait));
            const shot = await overlay.webContents.capturePage({ x: Math.max(0, Math.round(pos.x) - 40), y: Math.max(0, Math.round(pos.y) - 20), width: 240, height: 220 });
            fs.writeFileSync(path.join(selftestDir, `state-${k}.png`), shot.toPNG());
          }
          await overlay.webContents.executeJavaScript(`BuddyBrain.onIdleSeconds(0); (() => { const p=document.getElementById('pet'); const keep=['skin','has-ultimate','sheet','ultimate-sheet'].filter(c=>p.classList.contains(c)); p.className=['idle','face-right',...keep].join(' '); return 1; })()`);
        }
        // Then a bubble and the ice-crystal trick, cropped wider.
        await overlay.webContents.executeJavaScript(`document.querySelectorAll('#pet *').forEach(e=>e.style.animationPlayState=''); BuddyBrain.say('Do not touch the crystal. It is evidence.'); BuddyBrain.playAnimation('frost'); 1`);
        await new Promise((r) => setTimeout(r, 900));
        const cx = Math.max(0, Math.round(pos.x) - 120);
        const close = await overlay.webContents.capturePage({ x: cx, y: Math.max(0, Math.round(pos.y) - 130), width: 400, height: 330 });
        fs.writeFileSync(path.join(selftestDir, 'closeup.png'), close.resize({ width: 800 }).toPNG());
        // Desk mode with a full paper stack, mid-stamp.
        await overlay.webContents.executeJavaScript(`BuddyBubble.hide(); BuddyBrain.enterDesk('lab'); document.getElementById('pet').dataset.papers='8'; 1`);
        await new Promise((r) => setTimeout(r, 1500));
        await overlay.webContents.executeJavaScript(`BuddyBrain.playAnimation('stamp'); 1`);
        await new Promise((r) => setTimeout(r, 1000));
        const desk = await overlay.webContents.capturePage({ x: cx, y: Math.max(0, Math.round(pos.y) - 130), width: 400, height: 330 });
        fs.writeFileSync(path.join(selftestDir, 'desk.png'), desk.resize({ width: 800 }).toPNG());
        // Frost Release, captured mid-transformation.
        await overlay.webContents.executeJavaScript(`BuddyBubble.hide(); BuddyBrain.exitDesk({ quiet: true }); BuddyBrain.playAnimation('release'); 1`);
        await new Promise((r) => setTimeout(r, 1700));
        const rx = Math.max(0, Math.round(pos.x) - 220);
        const rel = await overlay.webContents.capturePage({ x: rx, y: Math.max(0, Math.round(pos.y) - 260), width: 600, height: 460 });
        fs.writeFileSync(path.join(selftestDir, 'release.png'), rel.toPNG());
        // Ultimate form, captured while held after the release finishes.
        await new Promise((r) => setTimeout(r, 3000));
        await overlay.webContents.executeJavaScript(`BuddyBubble.hide(); BuddyBrain.enterUltimate(12); 1`);
        await new Promise((r) => setTimeout(r, 5200));
        const ult = await overlay.webContents.capturePage({ x: rx, y: Math.max(0, Math.round(pos.y) - 260), width: 600, height: 460 });
        fs.writeFileSync(path.join(selftestDir, 'ultimate.png'), ult.toPNG());
        const ultState = await overlay.webContents.executeJavaScript(`JSON.stringify({ classes: document.getElementById('pet').className, primaryShown: (() => { const e = document.getElementById('skin-img'); return e ? getComputedStyle(e).display : 'n/a'; })(), ultimateShown: (() => { const e = document.getElementById('skin-ultimate'); return e ? getComputedStyle(e).display : 'n/a'; })() })`);
        fs.writeFileSync(path.join(selftestDir, 'ultimate.json'), ultState);
        const jp = await jarWin.webContents.capturePage();
        fs.writeFileSync(path.join(selftestDir, 'jar.png'), jp.toPNG());
        openCustomize();
        await new Promise((r) => setTimeout(r, 1500));
        const cp = await customizeWin.webContents.capturePage();
        fs.writeFileSync(path.join(selftestDir, 'customize.png'), cp.toPNG());
        const sfxCheck = await overlay.webContents.executeJavaScript(`JSON.stringify(BuddySfx.names.map((n) => { try { return [n, BuddySfx.play(n)]; } catch (e) { return [n, 'ERR ' + e.message]; } }))`);
        fs.writeFileSync(path.join(selftestDir, 'sfx.json'), sfxCheck);
        const probe = await overlay.webContents.executeJavaScript(`JSON.stringify({ mods: BuddyMods.list(), skippedMods: BuddyMods.skipped(), modProps: document.querySelectorAll('#pet [data-mod]').length, surprisedAnim: (() => { const p = document.getElementById('pet'); p.classList.add('surprised'); const a = getComputedStyle(document.getElementById('sprite')).animationName; p.classList.remove('surprised'); return a; })(), quips: BuddyQuips.all().length, mode: BuddyBrain.state.mode, x: BuddyBrain.state.x, y: BuddyBrain.state.y, bubble: BuddyBubble.isVisible(), text: document.getElementById('bubble-text').textContent, petClass: document.getElementById('pet').className, skin: document.getElementById('pet').classList.contains('skin'), skinImg: !!document.getElementById('skin-img'), ultimateImg: !!document.getElementById('skin-ultimate'), idle: BuddyBrain.state.idleSeconds })`);
        fs.writeFileSync(path.join(selftestDir, 'state.json'), probe);
        // Desk and dialogue, driven with simulated typing samples.
        const deskProbe = await overlay.webContents.executeJavaScript(`(() => {
          const B = BuddyBrain, st = B.state, txt = () => document.getElementById('bubble-text').textContent, r = {};
          document.getElementById('pet').classList.remove('ultimate'); B.exitDesk({ quiet: true }); BuddyBubble.hide(); st.typingLog = [];
          for (let i = 0; i < 30; i++) B.onActivity({ typing: 1, kind: 'writing' });
          r.clickingAround = st.mode;
          st.typingLog = [];
          for (let i = 0; i < 10; i++) B.onActivity({ typing: 8, kind: 'coding' });
          r.afterTyping = st.mode; r.deskKind = st.deskKind; r.spawnLine = txt();
          BuddyBubble.hide(); st.bubblePriority = 0; st.lastTypingAt -= 30000; Math.random = () => 0.1;
          B.onActivity({ typing: 0, kind: 'coding' });
          r.pauseLine = txt(); r.stillAtDesk = st.mode;
          BuddyBubble.hide(); st.lastTypingAt -= 100000; B.onActivity({ typing: 0 });
          r.afterLongPause = st.mode; r.despawnLine = txt();
          r.greet = BuddyQuips.pick(['greet']); r.idle = BuddyQuips.pick(['idle']); r.click = BuddyQuips.pick(['click']);
          return JSON.stringify(r, null, 1);
        })()`);
        fs.writeFileSync(path.join(selftestDir, 'desk-dialogue.json'), deskProbe);
        const labels = (m) => m.items.flatMap((i) => [i.label, ...(i.submenu ? labels(i.submenu) : [])]).filter(Boolean);
        fs.writeFileSync(path.join(selftestDir, 'menu.json'), JSON.stringify({ name: charName(), tooltipName: `${charName()} Buddy`, menu: labels(buildMenu()) }, null, 1));
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
    `${fmt(tokens)} tokens. Logged, stamped, and received. Stand back. Frost Release!`,
    `A donation of ${fmt(tokens)}? I... appreciate it. Don't make it weird. Frost Release!`,
    `${fmt(tokens)} tokens, properly declared. Fine. You've earned a demonstration.`,
    `Received ${fmt(tokens)} tokens. This is going in the official record. Watch closely.`,
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}
function usageLine(s, freed) {
  const pct = s.utilization.toFixed(0);
  const reset = s.resetsAt ? ` It resets around ${new Date(s.resetsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` : '';
  const freedLine = freed ? ` I also cleared ${fmt(freed)} pledged tokens into the jar.` : '';
  if (s.utilization >= s.maxUtilization) return `Your plan is at ${pct}%, over my ${s.maxUtilization}% limit. The jar is frozen.${reset}${freedLine}`;
  if (s.utilization >= s.maxUtilization - 15) return `Your plan is at ${pct}%. That's close to my ${s.maxUtilization}% limit. Spend carefully.${reset}${freedLine}`;
  return `Your plan is at ${pct}%. Well within limits. Carry on.${freedLine}`;
}
