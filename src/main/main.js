'use strict';
const { app, Menu, Tray, ipcMain, powerMonitor, screen, shell, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { createOverlay, createJarWindow, createCustomizeWindow, createImportWindow } = require('./overlay');
const characterImport = require('./character-import');
const characterCheck = require('./character-check');
const characterProfile = require('./jar/profile');
const abilities = require('./abilities');
const attachments = require('./jar/attachments');
const { QuipStore } = require('./quip-store');
const { Settings } = require('./settings');
const { Ledger } = require('./jar/ledger');
const { Guard } = require('./jar/guard');
const { Upgrader } = require('./jar/upgrader');
const { WaitingQueue } = require('./jar/waiting');
const { Git } = require('./jar/git');
const { estimate } = require('./jar/estimator');
const { listMods, modsFor, readQuipPacks, readCharacterDialogue, listCharacters, invalidateCharacters, charactersRoot } = require('./mods');
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

function start() {
  // Tests can point the app at a throwaway data folder (TOSHI_USERDATA).
  if (process.env.TOSHI_USERDATA) app.setPath('userData', process.env.TOSHI_USERDATA);
  const userData = app.getPath('userData');
  try { app.setAppUserModelId('ToshiBuddy'); } catch (_) { /* Windows only */ }
  const settings = new Settings(userData);
  const ledger = new Ledger(userData);
  const logLines = [];
  const log = (line) => {
    const entry = `[${new Date().toLocaleTimeString()}] ${line}`;
    logLines.push(entry);
    if (logLines.length > 400) logLines.shift();
    console.log(entry);
    // Also kept on disk (userData/toshibuddy.log, ~512 KB, then rotated) so a
    // problem after sleep or a crash can be read back later.
    try {
      const file = path.join(userData, 'toshibuddy.log');
      try { if (fs.statSync(file).size > 512 * 1024) fs.renameSync(file, file + '.old'); } catch (_) { /* new file */ }
      fs.appendFileSync(file, `${new Date().toISOString()} ${line}\n`);
    } catch (_) { /* logging must never break the app */ }
    if (jarWin && !jarWin.isDestroyed()) jarWin.webContents.send('jar:run-log', entry);
  };
  const git = new Git(PROJECT_ROOT);
  const guard = new Guard({ ledger, settings, projectRoot: PROJECT_ROOT, log });
  // Dialogue belongs to the active character (characters/<id>/quips.json, plus
  // quip packs from upgrades); the user's edits are kept per character.
  const quipStores = new Map();
  const quipStore = () => {
    const who = activeCharacterId();
    if (!quipStores.has(who)) quipStores.set(who, new QuipStore(userData, who));
    return quipStores.get(who);
  };
  const activePacks = () => {
    const d = readCharacterDialogue(PROJECT_ROOT, activeCharacterId());
    // "ownQuipsOnly": true in character.json: only the character's own file.
    return [...(d ? d.quips : []), ...(ownQuipsOnly() ? [] : readQuipPacks(PROJECT_ROOT, { upgrades: ledger.data.upgrades, characterId: activeCharacterId() }))];
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
    invalidateCharacters(); // a reload picks up edited or added character packs
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
    projectRoot: PROJECT_ROOT, ledger, guard, settings, git, log, userData,
    character: () => characterInfo(),
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
    if (overlay && !overlay.isDestroyed()) overlay.webContents.send('jar-state', jarPropState());
  }
  // What the jar on screen shows: balance, fill toward the next level, quick amount.
  function jarPropState() {
    const lv = ledger.level();
    return {
      balance: ledger.data.balance,
      progress: lv.progress || 0,
      level: lv.level,
      quick: Number(settings.get('quickDonateTokens')) || 1000,
      show: settings.get('showJarProp') !== false,
      theme: characterStyle().theme,
    };
  }
  function jarState() {
    return {
      ledger: { ...ledger.snapshot(), goals: ledger.data.goals.filter(isActiveGoal), upgrades: ledger.data.upgrades.filter(isActiveGoal).slice(0, 50) },
      ideas: ideasState(),
      guard: guard.status(),
      settings: publicSettings(),
      busy: upgrader.isBusy(),
      claudeInstalled: !!findClaude(),
      characters: listCharacters(PROJECT_ROOT).map((c) => ({ id: c.name, name: displayNameOf(c), test: c.test })),
      activeCharacter: activeCharacterId(),
      log: logLines.slice(-80),
      theme: characterStyle().theme,
      projectRoot: PROJECT_ROOT,
    };
  }
  // The character only ever speaks lines from its own dialogue file. App
  // information (usage, pledges, estimates, upgrade status) is shown as a small
  // on-screen notice instead; quip() asks the pet for one of its own lines.
  function notify(text, ms = 6000) {
    if (overlay && !overlay.isDestroyed()) overlay.webContents.send('toast', { text: String(text), ms });
  }
  function quip(tags, opts = {}) {
    if (overlay && !overlay.isDestroyed()) overlay.webContents.send('quip', { tags, ...opts });
  }

  // Seed the catalog once so there is something to fund on day one.
  if (!ledger.data.seeded) {
    try {
      const catalog = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'content', 'catalog.json'), 'utf8'));
      // addGoal puts new goals first, so seed in reverse to keep the catalog order.
      for (const item of catalog.slice().reverse()) ledger.addGoal({ ...item, source: 'catalog', characterId: 'kori-test' });
    } catch (e) { log(`catalog seed failed: ${e.message}`); }
    ledger.data.seeded = true;
    ledger.data.perCharacter = true;
    ledger.save();
  }
  // The fixed catalog was written for the test character: none of it belongs
  // under anyone else, even with a token in it (the token goes back to the jar).
  if (!ledger.data.catalogMoved) {
    for (const g of ledger.data.goals) {
      if (g.source !== 'catalog' || g.characterId === 'kori-test' || ['building', 'done'].includes(g.status)) continue;
      const back = Math.max(0, (g.funded || 0) - (g.spent || 0));
      ledger.data.balance += back;
      g.funded = g.spent || 0;
      g.waiting = false;
      if (!g.spent) g.status = 'open';
      g.characterId = 'kori-test';
    }
    ledger.data.catalogMoved = true;
    ledger.save();
  }
  // Goals and tricks used to be shared by every character. Once: the fixed
  // catalog goes to the test character it was written for; goals with tokens in
  // them and the user's own ideas stay with whoever is active now.
  if (!ledger.data.perCharacter) {
    const now = settings.get('character') || 'toshitoshi';
    for (const g of ledger.data.goals) {
      if (g.characterId) continue;
      const untouched = g.source === 'catalog' && !g.funded && !g.spent && g.status === 'open';
      g.characterId = untouched ? 'kori-test' : now;
    }
    ledger.data.perCharacter = true;
    ledger.save();
  }

  // ---- overlay IPC ----
  // Click-through: the overlay covers the whole screen and lets clicks pass,
  // except over the pet, its bubble, and the jar. The page reports where those
  // are; here the cursor position is checked ~20 times a second. This doesn't
  // depend on Windows forwarding mouse moves to the window, which can stop after
  // sleep or a lid close. The current state is also re-applied every 2 s.
  let hitAreas = { rects: [], dragging: false };
  let clickable = null;
  let lastApplied = 0;
  ipcMain.on('overlay:hit-areas', (_e, a) => {
    if (a && Array.isArray(a.rects)) hitAreas = { rects: a.rects.slice(0, 10), dragging: !!a.dragging };
  });
  // Is this screen point over something clickable?
  function overAt(p) {
    const b = overlay.getContentBounds();
    const x = p.x - b.x, y = p.y - b.y;
    return hitAreas.dragging || hitAreas.rects.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  }
  setInterval(() => {
    if (!overlay || overlay.isDestroyed()) return;
    const over = overAt(screen.getCursorScreenPoint());
    const now = Date.now();
    if (over !== clickable || now - lastApplied > 2000) {
      if (over !== clickable && clickable !== null) {
        const p = screen.getCursorScreenPoint();
        log(`clicks ${over ? 'on' : 'off'} at ${p.x},${p.y} (${hitAreas.rects.length} areas${hitAreas.dragging ? ', dragging' : ''})`);
      }
      clickable = over;
      lastApplied = now;
      overlay.setIgnoreMouseEvents(!over, { forward: true });
    }
  }, 50);
  ipcMain.on('overlay:log', (_e, line) => log(`renderer: ${line}`));

  // After sleep, a locked screen, or a display change, Windows can drop the
  // overlay's always-on-top level and stop forwarding mouse moves to a
  // click-through window, so the pet never notices the cursor and can't be
  // clicked. Re-apply both, and have the pet forget any stale hover/drag state.
  function wireWindowLogging(w, name) {
    w.webContents.on('console-message', (ev) => {
      if (ev.level === 'error' || ev.level === 'warning') log(`${name} console: ${ev.message}`);
    });
    w.webContents.on('render-process-gone', (_e, d) => log(`${name} renderer gone: ${d.reason}`));
    w.webContents.on('did-fail-load', (_e, code, desc) => log(`${name} failed to load: ${code} ${desc}`));
    w.webContents.on('unresponsive', () => log(`${name} is not responding`));
  }
  function rearmOverlay(reason) {
    if (!overlay || overlay.isDestroyed()) return;
    overlay.setAlwaysOnTop(true, 'screen-saver');
    overlay.setIgnoreMouseEvents(true, { forward: true });
    clickable = null; // the cursor check re-applies the right state on its next tick
    if (!overlay.isVisible()) overlay.showInactive();
    overlay.webContents.send('pointer-reset');
    log(`overlay re-armed (${reason})`);
  }
  // Waking or unlocking: repairing the old window wasn't enough (Windows can
  // leave a transparent click-through window unable to take clicks), so replace
  // it with a new one. Both events often fire together; recreate once.
  // The swap is seamless: the old window first saves where the pet stands and
  // which way it faces; the new one loads hidden at that spot; when its first
  // frame is drawn, the old one hides and the new one shows in the same moment.
  let lastRecreate = 0;
  async function recreateOverlay(reason) {
    if (Date.now() - lastRecreate < 5000) return;
    lastRecreate = Date.now();
    const old = overlay;
    if (old && !old.isDestroyed()) {
      try {
        await Promise.race([
          old.webContents.executeJavaScript(`localStorage.setItem('buddy.pos', JSON.stringify({ x: BuddyBrain.state.x, dir: BuddyBrain.state.dir })); 1`),
          new Promise((r) => setTimeout(r, 1000)),
        ]);
      } catch (_) { /* the old page may not answer; the last saved spot is used */ }
    }
    const fresh = createOverlay({ resumed: true });
    wireWindowLogging(fresh, 'overlay');
    let swapped = false;
    const swap = (why) => {
      if (swapped || fresh.isDestroyed()) return;
      swapped = true;
      ipcMain.removeListener('overlay:ready', onReady);
      overlay = fresh;
      hitAreas = { rects: [], dragging: false };
      clickable = null;
      fresh.showInactive();
      if (old && !old.isDestroyed()) { old.hide(); setTimeout(() => { if (!old.isDestroyed()) old.destroy(); }, 500); }
      log(`overlay recreated (${reason}, ${why})`);
    };
    const onReady = (e) => { if (e.sender === fresh.webContents) swap('drawn'); };
    ipcMain.on('overlay:ready', onReady);
    setTimeout(() => swap('timeout'), 6000); // never leave the pet missing
  }
  for (const ev of ['suspend', 'resume', 'lock-screen', 'unlock-screen']) {
    powerMonitor.on(ev, () => {
      log(`power: ${ev}`);
      if (ev === 'resume' || ev === 'unlock-screen') setTimeout(() => recreateOverlay(ev), 1500);
    });
  }
  for (const ev of ['display-metrics-changed', 'display-added', 'display-removed']) {
    screen.on(ev, () => {
      const wa = screen.getPrimaryDisplay().workArea;
      log(`display: ${ev} (work area ${wa.x},${wa.y} ${wa.width}x${wa.height})`);
      setTimeout(() => rearmOverlay(ev), 500);
    });
  }
  // Which character is active: settings.character (or TOSHI_CHARACTER), else
  // ToshiToshi, else the first regular character, else the first test character.
  const activeCharacterId = () => {
    const chars = listCharacters(PROJECT_ROOT);
    const want = process.env.TOSHI_CHARACTER || settings.get('character') || '';
    if (want && chars.some((c) => c.name === want)) return want;
    if (chars.some((c) => c.name === 'toshitoshi')) return 'toshitoshi';
    const regular = chars.find((c) => !c.test);
    return (regular || chars[0] || { name: 'kori-test' }).name;
  };
  const activeCharacter = () => listCharacters(PROJECT_ROOT).find((c) => c.name === activeCharacterId()) || null;
  // The drawn test character renders from code; every other character is a pack of images.
  const isBuiltinActive = () => { const c = activeCharacter(); return !c || c.builtin === 'kori'; };
  // Display name: the user's rename for this character, else character.json "name".
  const displayNameOf = (c) => String(((settings.get('characterNames') || {})[c.name]) || '').trim() || c.displayName || c.name;
  const charName = () => { const c = activeCharacter(); return c ? displayNameOf(c) : 'Kori'; };
  // What upgrade runs and estimates are told about the character: its name, the
  // personality text from character.json, and the stored profile notes. Never
  // images, sheets, or quips.
  const characterInfo = () => {
    const c = activeCharacter();
    const personality = c && typeof c.config.personality === 'string' ? c.config.personality.replace(/\s+/g, ' ').trim().slice(0, 600) : '';
    const who = { id: activeCharacterId(), name: charName(), isSkin: !isBuiltinActive(), personality };
    // Notes from the search-only profile run (src/main/jar/profile.js), if they
    // were made for this name and personality.
    // What he already does (app behaviors, names of his mapped poses, built
    // tricks, listed ideas), so upgrades add to it instead of repeating it.
    const mine = (x) => !x.characterId || x.characterId === who.id;
    const has = abilities.describe({
      config: c ? c.config : null, builtin: !who.isSkin,
      built: ledger.data.upgrades.filter((u) => !u.reverted && mine(u)).map((u) => u.title),
      planned: ledger.data.goals.filter((g) => mine(g) && g.status !== 'done').map((g) => g.title),
    });
    return { ...who, abilities: has, profile: who.isSkin ? characterProfile.profileText(userData, who.id, who) : '' };
  };
  const publicSettings = () => ({ ...settings.all(), characterName: charName() });
  const ownQuipsOnly = () => { const c = activeCharacter(); return !!(c && c.config && c.config.ownQuipsOnly); };
  // Look and feel from character.json: theme accent, effect style, ultimate form.
  const characterStyle = () => {
    const c = activeCharacter();
    const cfg = (c && c.config) || {};
    const accent = cfg.theme && /^#[0-9a-f]{6}$/i.test(cfg.theme.accent || '') ? cfg.theme.accent : null;
    return {
      theme: accent ? { accent } : null,
      effects: cfg.effects === 'explosion' ? 'explosion' : 'ice',
      ultimateForm: cfg.ultimateForm !== false,
      ownQuipsOnly: !!cfg.ownQuipsOnly,
    };
  };
  ipcMain.handle('app:theme', () => characterStyle().theme);
  const currentSkin = () => (isBuiltinActive() ? null : activeCharacter());
  // The renderer slices sprite sheets and sends back a numbered preview
  // (sheet-index.png / ultimate-sheet-index.png) so the user can map frames.
  const sheetInfo = new Map(); // "<id>/<kind>" -> { rows, at }
  ipcMain.on('overlay:sheet-index', (_e, { skin, kind, dataUrl, rows } = {}) => {
    try {
      if (!['sheet', 'ultimate-sheet'].includes(kind)) return;
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) return;
      if (!listCharacters(PROJECT_ROOT).some((c) => c.name === skin && !c.builtin)) return;
      const file = path.join(charactersRoot(PROJECT_ROOT), skin, `${kind}-index.png`);
      fs.writeFileSync(file, Buffer.from(dataUrl.slice(22), 'base64'));
      if (Array.isArray(rows)) {
        sheetInfo.set(`${skin}/${kind}`, { rows: rows.slice(0, 50).map((n) => Math.max(0, Math.floor(Number(n) || 0))), at: Date.now() });
        autoMapIfNew(skin, kind === 'sheet' ? 'sheet' : 'ultimateSheet');
      }
    } catch (e) { log(`sheet index not saved: ${e.message}`); }
  });
  // A trick built for one character loads only for that character. Mods with no
  // recorded owner (bundled samples, older tricks) load for everyone, as before.
  const modsForActive = () => modsFor(PROJECT_ROOT, ledger.data.disabledMods, ledger.data.upgrades, activeCharacterId());
  // Goals belong to a character; only the active one's are shown, built, or retried.
  function isActiveGoal(g) { return !g.characterId || g.characterId === activeCharacterId(); }
  // IPC handlers that answer { error } instead of throwing.
  const guarded = (fn) => (_e, args) => {
    try { return fn(args || {}); } catch (e) { return { error: e.message }; }
  };
  // ---- animation maps: row counts, auto-mapping, checking ----
  const quipCountOf = (id) => ((readCharacterDialogue(PROJECT_ROOT, id) || {}).quips || []).length;
  const KIND_FILE = { sheet: 'sheet', ultimateSheet: 'ultimate-sheet' };
  const rowsOf = (c, cfgKey) => (sheetInfo.get(`${c.name}/${KIND_FILE[cfgKey]}`) || {}).rows || (c.config[cfgKey] || {}).rows || null;
  // Characters whose map can be copied onto another sheet of the same kind.
  const layoutTemplates = (cfgKey, exceptId) => listCharacters(PROJECT_ROOT)
    .filter((c) => !c.builtin && c.name !== exceptId && rowsOf(c, cfgKey) && Object.keys((c.config[cfgKey] || {}).animations || {}).length)
    .map((c) => ({ id: c.name, name: displayNameOf(c), rows: rowsOf(c, cfgKey), animations: c.config[cfgKey].animations }));
  // A freshly imported sheet has no map: fill one in as soon as its poses are counted.
  function autoMapIfNew(id, cfgKey) {
    const c = listCharacters(PROJECT_ROOT).find((x) => x.name === id && !x.builtin);
    if (!c || Object.keys((c.config[cfgKey] || {}).animations || {}).length) return;
    const rows = rowsOf(c, cfgKey);
    const r = characterCheck.autoMap(rows, layoutTemplates(cfgKey, id));
    if (!Object.keys(r.animations).length) return;
    characterImport.saveCharacter(PROJECT_ROOT, id, { [cfgKey]: { animations: r.animations, rows } });
    invalidateCharacters();
    log(`animations mapped automatically for ${id} (${cfgKey}): ${r.guessed ? 'guessed' : `layout of ${r.source}`}, ${Object.keys(r.animations).length} animations`);
    notify(r.guessed ? 'I guessed the idle, walk and talk poses. Check them in Edit animations.' : `Animations set up automatically (same layout as ${r.sourceName}).`, 8000);
    if (id === activeCharacterId()) reloadAndAwaitMods([], 1500);
  }
  function checkOf(c, draft) {
    const config = { ...c.config };
    for (const k of ['sheet', 'ultimateSheet']) {
      if (draft && draft[k] && draft[k].animations) config[k] = { ...(config[k] || {}), animations: characterImport.cleanAnimations(draft[k].animations) };
    }
    let quipCount = null;
    try { quipCount = quipCountOf(c.name); } catch (_) { /* unknown */ }
    return characterCheck.checkCharacter(config, {
      rows: { sheet: rowsOf(c, 'sheet'), ultimateSheet: rowsOf(c, 'ultimateSheet') },
      quipCount, hasSheet: !!c.sheet, hasUltimateSheet: !!c.ultimateSheet,
    });
  }
  ipcMain.handle('import:automap', guarded(({ id, kind, from } = {}) => {
    const c = listCharacters(PROJECT_ROOT).find((x) => x.name === id && !x.builtin);
    if (!c || !KIND_FILE[kind]) throw new Error('Unknown character.');
    const rows = rowsOf(c, kind);
    if (!rows) throw new Error('The poses have not been counted yet. Press "Use this character" first.');
    return characterCheck.autoMap(rows, layoutTemplates(kind, id), { from: from ? String(from) : null });
  }));
  ipcMain.handle('import:check', guarded(({ id, draft } = {}) => {
    const c = listCharacters(PROJECT_ROOT).find((x) => x.name === id && !x.builtin);
    if (!c) throw new Error('Unknown character.');
    return checkOf(c, draft);
  }));
  // Play each mapped animation on the pet for two seconds, with its name shown.
  let previewing = false;
  ipcMain.handle('import:preview', async (_e, { id } = {}) => {
    if (id !== activeCharacterId()) return { error: 'Press "Use this character" first, then preview.' };
    if (previewing) return { error: 'A preview is already playing.' };
    const c = activeCharacter();
    const keys = Object.keys(((c && c.config.sheet) || {}).animations || {}).filter((k) => characterCheck.ANIM_KEYS.includes(k));
    if (!keys.length) return { error: 'No animations are mapped yet.' };
    previewing = true;
    try {
      await overlay.webContents.executeJavaScript(`(async () => {
        const p = document.getElementById('pet'); const all = ${JSON.stringify(characterCheck.ANIM_KEYS)};
        const clear = () => { for (const k of all) p.classList.remove(k); };
        BuddyBrain.setPaused(true); BuddyBubble.hide();
        try {
          for (const k of ${JSON.stringify(keys)}) { clear(); p.classList.add(k); BuddyBubble.toast(k, 1900); await new Promise((r) => setTimeout(r, 2000)); }
        } finally { clear(); p.classList.add('idle'); BuddyBrain.setPaused(false); }
        return 1;
      })()`);
    } catch (e) { return { error: e.message }; } finally { previewing = false; }
    return { played: keys };
  });
  ipcMain.handle('overlay:bootstrap', () => ({
    workArea: screen.getPrimaryDisplay().workArea,
    settings: publicSettings(),
    skin: currentSkin(),
    style: characterStyle(),
    jar: jarPropState(),
    mods: modsForActive(),
    quips: quipsForPet(),
    level: ledger.level(),
    balance: ledger.data.balance,
  }));
  ipcMain.handle('overlay:content', () => ({
    mods: modsForActive(),
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
  ipcMain.handle('custom:state', () => customizeState());
  ipcMain.handle('custom:set-name', guarded(({ name }) => {
    const clean = String(name || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!clean) throw new Error('The name can\'t be empty.');
    settings.set('characterNames', { ...(settings.get('characterNames') || {}), [activeCharacterId()]: clean });
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
    if (t && overlay && !overlay.isDestroyed()) overlay.webContents.send('say', { text: t.replace(/\{name\}/g, charName()).replace(/\{hour\}/g, new Date().getHours()) });
  });

  // ---- characters: import, export, animation mapper ----
  let importWin = null;
  function openImport(hash) {
    if (importWin && !importWin.isDestroyed()) {
      importWin.webContents.send('import:goto', hash || '');
      importWin.show();
      importWin.focus();
      return;
    }
    importWin = createImportWindow(hash);
    importWin.on('closed', () => { importWin = null; });
  }
  function switchCharacter(id) {
    settings.set('character', id);
    reloadAndAwaitMods([], 1500);
    refreshTray();
    pushJar();
    quipsChanged();
  }
  const PICK_FILTERS = {
    image: [{ name: 'Images', extensions: ['png', 'webp', 'gif', 'jpg', 'jpeg'] }],
    quips: [{ name: 'Quips', extensions: ['json', 'txt'] }],
    zip: [{ name: 'Character pack', extensions: ['zip'] }],
  };
  const importParent = () => (importWin && !importWin.isDestroyed() ? importWin : undefined);
  ipcMain.handle('import:pick', async (_e, { kind } = {}) => {
    if (kind === 'folder') {
      const r = await dialog.showOpenDialog(importParent(), { title: 'Choose a character pack folder', properties: ['openDirectory'] });
      return r.canceled ? null : r.filePaths[0];
    }
    const r = await dialog.showOpenDialog(importParent(), { properties: ['openFile'], filters: PICK_FILTERS[kind] || PICK_FILTERS.image });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('import:files', guarded((args) => {
    const id = characterImport.importFiles(PROJECT_ROOT, args);
    invalidateCharacters();
    log(`character imported: ${id}`);
    switchCharacter(id);
    return { id };
  }));
  ipcMain.handle('import:pack', guarded(({ source }) => {
    const id = characterImport.importPack(PROJECT_ROOT, String(source || ''));
    invalidateCharacters();
    log(`character pack imported: ${id}`);
    switchCharacter(id);
    return { id };
  }));
  ipcMain.handle('import:characters', () => ({
    active: activeCharacterId(),
    characters: listCharacters(PROJECT_ROOT).map((c) => ({
      id: c.name, name: displayNameOf(c), test: c.test, builtin: c.builtin,
      personality: c.config.personality || '', cover: coverOf(c),
    })),
  }));
  // A picture for the chooser: the still image, else the sheet itself (the page
  // crops to its first pose), else the drawn test character's preview.
  function coverOf(c) {
    const dir = path.join(charactersRoot(PROJECT_ROOT), c.name);
    const url = (f) => `${require('url').pathToFileURL(f).href}?v=${fs.statSync(f).mtimeMs}`;
    if (c.builtin) {
      const f = path.join(PROJECT_ROOT, 'assets', 'kori-test', 'kori-preview.png');
      return fs.existsSync(f) ? { url: url(f), kind: 'still' } : null;
    }
    const files = fs.readdirSync(dir);
    const still = files.find((f) => /^skin\.(png|webp|gif|jpe?g)$/i.test(f));
    if (still) return { url: url(path.join(dir, still)), kind: 'still' };
    const sheet = files.find((f) => /^sheet\.(png|webp|gif|jpe?g)$/i.test(f));
    return sheet ? { url: url(path.join(dir, sheet)), kind: 'sheet' } : null;
  }
  ipcMain.handle('import:choose', guarded(({ id }) => {
    if (!listCharacters(PROJECT_ROOT).some((c) => c.name === id)) throw new Error('Unknown character.');
    settings.set('firstRunDone', true);
    switchCharacter(id);
    return { ok: true };
  }));
  ipcMain.handle('import:details', (_e, { id } = {}) => {
    const c = listCharacters(PROJECT_ROOT).find((x) => x.name === id);
    if (!c) return { error: 'Unknown character.' };
    const dir = path.join(charactersRoot(PROJECT_ROOT), c.name);
    const preview = (kind) => {
      const file = path.join(dir, `${kind}-index.png`);
      return fs.existsSync(file) ? `${require('url').pathToFileURL(file).href}?v=${fs.statSync(file).mtimeMs}` : null;
    };
    const sheetOf = (cfgKey, kind) => ({
      scale: (c.config[cfgKey] || {}).scale || 1,
      animations: (c.config[cfgKey] || {}).animations || {},
      rows: rowsOf(c, cfgKey),
      preview: preview(kind),
      templates: layoutTemplates(cfgKey, c.name).map((t) => ({ id: t.id, name: t.name })),
    });
    return {
      id: c.name, name: displayNameOf(c), builtin: c.builtin, test: c.test,
      personality: c.config.personality || '',
      hasSheet: !!c.sheet, hasUltimateSheet: !!c.ultimateSheet,
      sheet: sheetOf('sheet', 'sheet'),
      ultimateSheet: sheetOf('ultimateSheet', 'ultimate-sheet'),
      animKeys: characterImport.ANIM_KEYS,
    };
  });
  ipcMain.handle('import:save', guarded(({ id, patch }) => {
    characterImport.saveCharacter(PROJECT_ROOT, String(id || ''), patch || {});
    invalidateCharacters();
    if (id === activeCharacterId()) reloadAndAwaitMods([], 1500);
    return { ok: true };
  }));
  ipcMain.handle('import:switch', guarded(({ id }) => {
    if (!listCharacters(PROJECT_ROOT).some((c) => c.name === id)) throw new Error('Unknown character.');
    switchCharacter(id);
    return { ok: true };
  }));
  ipcMain.handle('import:export', async (_e, { id } = {}) => {
    try {
      const r = await dialog.showSaveDialog(importParent(), { title: 'Export character', defaultPath: path.join(app.getPath('desktop'), `${id}.zip`), filters: PICK_FILTERS.zip });
      if (r.canceled || !r.filePath) return { canceled: true };
      const files = characterImport.exportPack(PROJECT_ROOT, String(id || ''), r.filePath);
      return { file: r.filePath, files };
    } catch (e) { return { error: e.message }; }
  });

  // ---- jar IPC ----
  ipcMain.handle('jar:state', () => jarState());
  // One donation path for the panel and the jar on screen, so the guard's
  // ceiling, pledges, and the donation reaction are always the same.
  function donate(tokens, goalId) {
    const ceiling = guard.maxSafeDonation();
    const levelBefore = ledger.level().level;
    const r = ledger.donate(tokens, { ceiling, goalId });
    if (r.accepted && overlay && !overlay.isDestroyed()) overlay.webContents.send('sfx', { name: 'coin' });
    // The jar is the thing he tends: a donation is growth (the character's
    // 'activity_bonsai' lines when it has them), a new level is a milestone.
    if (r.accepted) {
      if (overlay && !overlay.isDestroyed()) overlay.webContents.send('animate', { name: 'ultimate' });
      quip(['jar-grow']);
      notify(`+${fmt(r.accepted)} tokens in the jar`, 3500);
    }
    if (r.accepted && ledger.level().level > levelBefore && overlay && !overlay.isDestroyed()) {
      setTimeout(() => overlay.webContents.send('quip', { tags: ['level-up'] }), 7000);
    }
    if (r.pledged) notify(`Only ${fmt(r.accepted)} tokens fit right now; ${fmt(r.pledged)} are pledged until your plan window resets.`, 8000);
    return { ...r, ceiling, state: jarState() };
  }
  ipcMain.handle('jar:donate', (_e, { tokens, goalId } = {}) => donate(tokens, goalId));
  // Double-clicking the jar on screen donates the configured amount (default 1k).
  ipcMain.handle('jar:quick-donate', () => {
    const tokens = Math.max(100, Math.min(1000000, Number(settings.get('quickDonateTokens')) || 1000));
    const r = donate(tokens);
    return { accepted: r.accepted || 0, pledged: r.pledged || 0, balance: ledger.data.balance };
  });
  ipcMain.handle('jar:fund', (_e, { goalId, tokens }) => {
    const r = ledger.fundGoal(goalId, tokens);
    if (r && r.moved > 0 && overlay && !overlay.isDestroyed()) overlay.webContents.send('quip', { tags: ['jar-grow'] });
    return { ...r, state: jarState() };
  });
  ipcMain.handle('jar:remove-goal', (_e, { goalId }) => {
    const ok = ledger.removeGoal(goalId);
    if (ok) attachments.removeAll(userData, String(goalId));
    return { ok, state: jarState() };
  });
  // ---- pictures attached to an upgrade (shown as a prop, or just to look at) ----
  const sizeOfImage = (file) => nativeImage.createFromPath(file).getSize();
  async function pickPicture() {
    const r = await dialog.showOpenDialog(jarWin && !jarWin.isDestroyed() ? jarWin : undefined, {
      title: 'Choose a picture for this upgrade', properties: ['openFile'],
      filters: [{ name: 'Pictures', extensions: ['png', 'webp', 'gif', 'jpg', 'jpeg'] }],
    });
    return r.canceled ? null : r.filePaths[0];
  }
  // Pictures chosen in the "Suggest an upgrade" box wait here until the goal exists.
  let pendingPictures = []; // { source, use, name }
  const pendingView = () => pendingPictures.map((p) => ({ name: p.name, use: p.use }));
  ipcMain.handle('jar:attach-pending', async (_e, { use, remove } = {}) => {
    if (remove !== undefined) { pendingPictures = pendingPictures.filter((_p, i) => i !== Number(remove)); return { ok: true, pending: pendingView() }; }
    if (!attachments.USES.includes(use)) return { ok: false, error: 'Choose how the picture is used.', pending: pendingView() };
    if (pendingPictures.length >= attachments.MAX_PER_GOAL) return { ok: false, error: `Up to ${attachments.MAX_PER_GOAL} pictures.`, pending: pendingView() };
    const source = await pickPicture();
    if (!source) return { ok: true, pending: pendingView() };
    try {
      // Validate now (a throwaway goal object), copy later when the goal exists.
      const st = fs.statSync(source);
      if (st.size > attachments.MAX_BYTES) throw new Error(`The picture is larger than ${attachments.MAX_BYTES / 1048576} MB.`);
      if (!/\.(png|webp|gif|jpe?g)$/i.test(source) || !attachments.kindOf(source)) throw new Error('That file is not a valid image.');
      pendingPictures.push({ source, use, name: path.basename(source).slice(0, 60) });
      return { ok: true, pending: pendingView() };
    } catch (e) { return { ok: false, error: e.message, pending: pendingView() }; }
  });
  ipcMain.handle('jar:attach', async (_e, { goalId, use, remove } = {}) => {
    const goal = ledger.goal(String(goalId || ''));
    if (!goal || ['building', 'done'].includes(goal.status)) return { ok: false, error: 'That goal can\'t take pictures now.', state: jarState() };
    try {
      if (remove) attachments.remove({ userData, goal, file: String(remove) });
      else {
        const source = await pickPicture();
        if (!source) return { ok: true, state: jarState() };
        attachments.add({ userData, goal, source, use, sizeOf: sizeOfImage });
      }
      ledger.save();
      return { ok: true, state: jarState() };
    } catch (e) { return { ok: false, error: e.message, state: jarState() }; }
  });
  ipcMain.handle('jar:settings', (_e, patch) => {
    const allowed = ['muted', 'sfx', 'sfxVolume', 'paused', 'autostart', 'deskMode', 'slackNudges', 'character', 'maxUtilization', 'calibrationRunTokens', 'autoBuild', 'autoRetry', 'allowUsageEndpointFallback', 'upgradeModel', 'upgradeEffort', 'maxTurns', 'showJarProp', 'quickDonateTokens'];
    const clean = {};
    for (const k of allowed) if (k in patch) clean[k] = patch[k];
    if ('character' in clean && !listCharacters(PROJECT_ROOT).some((c) => c.name === clean.character)) delete clean.character;
    const skinChanged = 'character' in clean && clean.character !== activeCharacterId();
    if ('maxUtilization' in clean) clean.maxUtilization = Math.min(95, Math.max(10, Number(clean.maxUtilization) || 80));
    if ('quickDonateTokens' in clean) clean.quickDonateTokens = Math.max(100, Math.min(1000000, Math.round(Number(clean.quickDonateTokens) || 1000)));
    if ('sfxVolume' in clean) clean.sfxVolume = Math.min(1, Math.max(0, Number(clean.sfxVolume) || 0));
    settings.update(clean);
    if ('autostart' in clean) applyAutostart();
    if (overlay && !overlay.isDestroyed()) overlay.webContents.send('settings', publicSettings());
    if (skinChanged) { reloadAndAwaitMods([], 1000); quipsChanged(); }
    refreshTray();
    pushJar();
    return jarState();
  });
  ipcMain.handle('jar:check-usage', async () => {
    const s = await guard.refresh({ force: true });
    if (s.utilization !== null) {
      const freed = ledger.data.pledged ? ledger.releasePledges(guard.maxSafeDonation()) : 0;
      notify(usageLine(s, freed), 8000);
    } else {
      notify('No plan usage reading came back. Details are in the jar\'s log.', 7000);
    }
    return jarState();
  });
  ipcMain.handle('jar:suggest', async (_e, { text }) => {
    text = String(text || '').trim().slice(0, 600);
    if (!text) return { ok: false, error: 'empty suggestion' };
    if (!findClaude()) return { ok: false, error: 'Claude Code is not installed or not logged in' };
    notify('Pricing your suggestion…', 4000);
    const pictures = pendingPictures;
    const r = await estimate({ projectRoot: PROJECT_ROOT, ledger, request: text, log, character: characterInfo(), extra: attachments.pricingLine(pictures) });
    if (r.rateLimit) guard.observe(r.rateLimit);
    if (!r.ok) { notify(`Couldn't price that one: ${r.error}`, 7000); return { ok: false, error: r.error, state: jarState() }; }
    if (!r.goal.feasible || r.goal.touchesCore) {
      const goal = ledger.addGoal({ ...r.goal, touchesCore: true, characterId: activeCharacterId() });
      notify('That idea needs changes to the app itself, which upgrades cannot make.', 7000);
      return { ok: true, goal, reply: r.reply, infeasible: true, state: jarState() };
    }
    const goal = ledger.addGoal({ ...r.goal, characterId: activeCharacterId() });
    // The pictures chosen with the suggestion now belong to the goal.
    let skipped = 0;
    for (const p of pictures) {
      try { attachments.add({ userData, goal, source: p.source, use: p.use, sizeOf: sizeOfImage }); } catch (e) { skipped++; log(`picture not attached: ${e.message}`); }
    }
    pendingPictures = [];
    ledger.save();
    if (skipped) notify(`${skipped} picture${skipped === 1 ? '' : 's'} could not be attached.`, 6000);
    notify(`New goal: ${goal.title}. Estimated cost ${fmt(goal.goalTokens)} tokens.`, 7000);
    return { ok: true, goal, reply: r.reply, state: jarState() };
  });
  ipcMain.handle('jar:build', async (_e, { goalId }) => {
    const r = await upgrader.build(goalId);
    if (!r.ok && r.reason) notify(`Can't build: ${r.reason}.`, 7000);
    return { ...r, state: jarState() };
  });
  ipcMain.handle('jar:resume', async (_e, { goalId }) => {
    const r = await upgrader.build(goalId, { resume: true });
    if (!r.ok && r.reason) notify(`Can't resume: ${r.reason}.`, 7000);
    return { ...r, state: jarState() };
  });
  ipcMain.handle('jar:cancel-run', () => { upgrader.cancel(); return jarState(); });
  ipcMain.handle('jar:undo', async (_e, { upgradeId }) => {
    const r = await upgrader.undo(upgradeId);
    if (r.ok) notify('Upgrade undone.', 4000);
    return { ...r, state: jarState() };
  });

  // ---- ideas tailored to the active character ----
  // One small search-only run (src/main/jar/profile.js) looks up the character's
  // name, writes short background notes, and proposes upgrades that suit it.
  let ideasBusy = false;
  function ideasState() {
    const id = activeCharacterId();
    const c = activeCharacter();
    if (!c || c.builtin) return { available: false };
    const p = characterProfile.readProfile(userData, id);
    const info = characterInfo();
    return {
      available: true, busy: ideasBusy, has: !!p, found: !!(p && p.found), at: p ? p.at : null,
      stale: !!p && p.signature !== characterProfile.signature(info),
      profile: p ? p.profile : '',
    };
  }
  async function getIdeas() {
    const id = activeCharacterId();
    const c = activeCharacter();
    if (!c || c.builtin) return { ok: false, error: 'The test character uses the fixed list.' };
    if (ideasBusy) return { ok: false, error: 'Already looking.' };
    if (!findClaude()) return { ok: false, error: 'Claude Code is not installed or not logged in' };
    if (upgrader.isBusy()) return { ok: false, error: 'An upgrade is running; try again when it finishes.' };
    await guard.refresh();
    const gate = guard.canStart();
    if (!gate.ok) return { ok: false, error: `Your plan has no room right now (${gate.reason}).` };
    const info = characterInfo();
    ideasBusy = true;
    pushJar();
    notify(`Looking up ideas for ${info.name}…`, 5000);
    let r;
    try {
      r = await characterProfile.research({
        userData, id, name: info.name, personality: info.personality, abilities: info.abilities, log,
        onRateLimit: (rl) => guard.observe(rl),
      });
    } catch (e) { r = { ok: false, error: e.message }; } finally { ideasBusy = false; }
    if (r.tokens) ledger.chargeFee(r.tokens, 'ideas');
    if (r.rateLimit) guard.observe(r.rateLimit);
    if (!r.ok) { notify(`Couldn't get ideas: ${r.error}`, 7000); pushJar(); return { ok: false, error: r.error }; }
    // Replace this character's untouched earlier ideas; keep anything with tokens in it.
    ledger.data.goals = ledger.data.goals.filter((g) => !(g.characterId === id && g.source === 'ideas' && !g.funded && !g.spent && g.status === 'open'));
    const have = new Set(ledger.data.goals.filter((g) => g.characterId === id).map((g) => g.title.toLowerCase()));
    let added = 0;
    for (const idea of r.profile.ideas.slice().reverse()) {
      if (have.has(idea.title.toLowerCase())) continue;
      ledger.addGoal({ ...idea, source: 'ideas', characterId: id });
      added++;
    }
    ledger.save();
    log(`ideas for ${id}: ${added} goals, ${r.profile.found ? 'character found by name' : 'from the personality text only'}`);
    notify(`${added} new idea${added === 1 ? '' : 's'} for ${info.name}. Open the jar to see them.`, 7000);
    pushJar();
    return { ok: true, added, found: r.profile.found };
  }
  ipcMain.handle('jar:ideas', async () => ({ ...(await getIdeas()), state: jarState() }));

  // Goals the plan had no room for start by themselves after it resets.
  const waiting = new WaitingQueue({
    ledger, guard, upgrader, settings, log,
    filter: isActiveGoal,
    onStart: (goal) => notify(`Your plan has room again. Starting "${goal.title}".`, 7000),
  });
  ledger.onChange(() => waiting.schedule());
  waiting.schedule();

  // Auto-build funded goals if the user opted in. Goals already waiting for
  // room in the plan are left to the waiting queue.
  ledger.onChange(() => {
    if (!settings.get('autoBuild') || upgrader.isBusy()) return;
    const next = ledger.data.goals.find((g) => g.status === 'funded' && !g.touchesCore && !g.waiting && isActiveGoal(g));
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
    const chars = listCharacters(PROJECT_ROOT);
    const item = (c) => ({ label: displayNameOf(c), type: 'radio', checked: activeCharacterId() === c.name, click: () => setSkin(c.name) });
    const regular = chars.filter((c) => !c.test).map(item);
    const tests = chars.filter((c) => c.test).map(item);
    const skinItems = [
      ...regular,
      ...(tests.length ? [{ type: 'separator' }, { label: 'Test characters', enabled: false }, ...tests] : []),
      { type: 'separator' },
      { label: 'Show prop anchors (for tuning character.json)', type: 'checkbox', checked: !!settings.get('showAnchors'), click: (m) => toggleSetting('showAnchors', m.checked) },
      { label: 'Open characters folder', click: () => { const d = charactersRoot(PROJECT_ROOT); fs.mkdirSync(d, { recursive: true }); shell.openPath(d); } },
    ];
    return Menu.buildFromTemplate([
      { label: `${charName()} Buddy`, enabled: false },
      { label: 'Import character…', click: () => openImport('import') },
      { label: 'Edit animations and personality…', click: () => openImport('edit') },
      { label: 'Rename character…', click: openCustomize },
      { label: 'Edit quips…', click: openCustomize },
      { type: 'separator' },
      { label: 'Open the jar', click: openJar },
      { label: 'Check plan usage', click: () => ipcMain.emit('__check-usage') },
      { label: characterStyle().effects === 'explosion' ? (characterStyle().ultimateForm ? 'Explode (ultimate form)' : 'Explode!') : 'Frost Release (ultimate form)', click: () => { if (overlay && !overlay.isDestroyed()) overlay.webContents.send('animate', { name: 'ultimate' }); } },
      { type: 'separator' },
      { label: 'Mute voice', type: 'checkbox', checked: !!settings.get('muted'), click: (m) => toggleSetting('muted', m.checked) },
      { label: 'Sound effects', type: 'checkbox', checked: settings.get('sfx') !== false, click: (m) => toggleSetting('sfx', m.checked) },
      { label: 'Desk mode (writing and labs)', type: 'checkbox', checked: settings.get('deskMode') !== false, click: (m) => toggleSetting('deskMode', m.checked) },
      { label: 'Nudge me when I slack off', type: 'checkbox', checked: settings.get('slackNudges') !== false, click: (m) => toggleSetting('slackNudges', m.checked) },
      { label: 'Character', submenu: skinItems },
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
    notify(s.utilization !== null ? usageLine(s, 0) : 'No usage reading came back. Check the jar.', 8000);
  });
  function setSkin(name) {
    settings.set('character', name);
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

  // Launching again with --import (or --edit) opens the Characters window; otherwise the jar.
  const openFromArgs = (argv) => { if (argv.includes('--import')) { openImport('import'); return true; } if (argv.includes('--edit')) { openImport('edit'); return true; } if (argv.includes('--demo-poses')) { require('./selftest').demoPoses(testCtx); return true; } return false; };
  app.on('second-instance', (_e, argv) => { if (!openFromArgs(argv)) openJar(); });
  if (!process.env.TOSHI_SELFTEST) setTimeout(() => openFromArgs(process.argv), 2500);
  const firstRun = !settings.get('firstRunDone') && !settings.get('character');
  if (firstRun && !process.env.TOSHI_SELFTEST && listCharacters(PROJECT_ROOT).filter((c) => !c.test).length > 1) {
    setTimeout(() => {
      openImport('choose');
      // Closing the chooser without picking also counts: it shouldn't return every launch.
      if (importWin) importWin.once('closed', () => settings.set('firstRunDone', true));
    }, 3000);
  } else if (!settings.get('firstRunDone')) {
    settings.set('firstRunDone', true);
  }
  app.on('window-all-closed', (e) => { /* keep running in the tray */ });
  app.on('before-quit', () => { if (jarWin) jarWin.__reallyClose = true; activity.stop(); });

  if (!findClaude()) {
    log('Claude Code CLI not found; the jar can hold tokens but cannot spend them until it is installed and logged in.');
  }
  if (settings.get('autostart') && !process.env.TOSHI_SELFTEST) applyAutostart();
  log(`ToshiBuddy started. userData=${userData}`);

  // ---- self-test: TOSHI_SELFTEST=<dir> captures both windows and quits ----
  const selftestDir = process.env.TOSHI_SELFTEST;
  // Everything the self-test and the pose demo need from here.
  const testCtx = {
    app, screen, settings, ledger, guard, logLines, log, charName, buildMenu, openCustomize, openImport, activeCharacterId, reloadAndAwaitMods,
    listCharacters: () => listCharacters(PROJECT_ROOT),
    overAt, get hitAreas() { return hitAreas; }, waiting,
    getIdeas, ideasState, modsForActive: () => modsForActive(),
    checkActive: () => { const c = activeCharacter(); return c && !c.builtin ? checkOf(c) : null; },
    get overlay() { return overlay; }, get jarWin() { return jarWin; },
    get customizeWin() { return customizeWin; }, get importWin() { return importWin; },
  };
  wireWindowLogging(overlay, 'overlay');
  wireWindowLogging(jarWin, 'jar');
  if (selftestDir) require('./selftest').runSelftest(testCtx, selftestDir);
}

function fmt(n) {
  n = Math.round(n || 0);
  if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.?0+$/, '') + 'k';
  return String(n);
}
function usageLine(s, freed) {
  const pct = s.utilization.toFixed(0);
  const reset = s.resetsAt ? ` It resets around ${new Date(s.resetsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` : '';
  const freedLine = freed ? ` ${fmt(freed)} pledged tokens moved into the jar.` : '';
  if (s.utilization >= s.maxUtilization) return `Plan usage ${pct}%, over the ${s.maxUtilization}% cap: the jar is paused.${reset}${freedLine}`;
  if (s.utilization >= s.maxUtilization - 15) return `Plan usage ${pct}%, close to the ${s.maxUtilization}% cap.${reset}${freedLine}`;
  return `Your plan is at ${pct}%. Well within limits. Carry on.${freedLine}`;
}
