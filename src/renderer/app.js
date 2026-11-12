// Renderer entry: builds the sprite (Kori or the user's skin), loads content and
// mods, starts the brain, and listens to the main process.
(async function () {
  window.BuddyApp = { level: null, balance: 0 };

  // ---- user skin images ----
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('skin image failed to load'));
      i.src = url;
    });
  }
  function parseHex(hex) {
    hex = String(hex || '').replace('#', '');
    return /^[0-9a-f]{6}$/i.test(hex) ? [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) : null;
  }

  // Background removal for an image without transparency.
  //  keyMode "edges" (default when keying): flood-fills from the image border and
  //    clears only background connected to it, so light areas inside the line art stay.
  //  keyMode "color": clears every pixel near keyColor, anywhere.
  //  keyColor: the background color; for "edges" it defaults to the corner color.
  function keyOut(img, cfg) {
    const w = img.naturalWidth, h = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, w, h);
    const px = data.data;
    const tol = Math.max(0, Math.min(255, Number(cfg.keyTolerance) || 40));
    let key = parseHex(cfg.keyColor);
    if (!key) {
      // Average the four corners.
      const corners = [0, w - 1, (h - 1) * w, h * w - 1];
      key = [0, 1, 2].map((ch) => Math.round(corners.reduce((s, p) => s + px[p * 4 + ch], 0) / 4));
    }
    const dist = (p) => Math.max(Math.abs(px[p * 4] - key[0]), Math.abs(px[p * 4 + 1] - key[1]), Math.abs(px[p * 4 + 2] - key[2]));
    const clear = (p) => {
      const d = dist(p);
      if (d <= tol) px[p * 4 + 3] = 0;
      else if (d <= tol * 1.5) px[p * 4 + 3] = Math.round(px[p * 4 + 3] * ((d - tol) / (tol * 0.5)));
    };
    if ((cfg.keyMode || 'edges') === 'color') {
      for (let p = 0; p < w * h; p++) clear(p);
    } else {
      const seen = new Uint8Array(w * h);
      const stack = [];
      const push = (p) => { if (!seen[p] && dist(p) <= tol * 1.5) { seen[p] = 1; stack.push(p); } };
      for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
      for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
      while (stack.length) {
        const p = stack.pop();
        clear(p);
        if (dist(p) > tol) continue; // soft edge pixel: fade it, but don't spread through it
        const x = p % w;
        if (x > 0) push(p - 1);
        if (x < w - 1) push(p + 1);
        if (p >= w) push(p - w);
        if (p < (h - 1) * w) push(p + w);
      }
    }
    g.putImageData(data, 0, 0);
    // Diagnostics for tuning keyTolerance: how much became transparent, and
    // whether the border (which should be all background) got cleared.
    let cleared = 0, borderCleared = 0, border = 0;
    for (let p = 0; p < w * h; p++) {
      const t = px[p * 4 + 3] === 0;
      if (t) cleared++;
      const x = p % w, y = (p / w) | 0;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { border++; if (t) borderCleared++; }
    }
    keyOut.lastStats = { removedPct: Math.round((cleared / (w * h)) * 100), borderPct: Math.round((borderCleared / border) * 100), key: key.join(','), tol };
    return c.toDataURL('image/png');
  }

  async function prepareImage(url, cfg) {
    const img = await loadImage(url);
    const aspect = img.naturalWidth / img.naturalHeight;
    const wantsKey = cfg.keyColor || cfg.keyMode || /\.jpe?g(\?|$)/i.test(url);
    if (!(wantsKey && cfg.keyMode !== 'none')) return { url, aspect, config: cfg };
    const keyed = keyOut(img, cfg);
    const s = keyOut.lastStats;
    const name = decodeURIComponent(url.split('?')[0].split('/').pop());
    buddy.log(`skin ${name}: ${img.naturalWidth}x${img.naturalHeight}, background ${s.removedPct}% removed, border ${s.borderPct}% clear (key rgb ${s.key}, tolerance ${s.tol})`);
    return { url: keyed, aspect, config: cfg };
  }

  async function prepareSkin(skin) {
    if (!skin) return null;
    const base = skin.config || {};
    // A sprite sheet, when present, replaces the still image (frames are played
    // by BuddySheet); a broken sheet falls back to the still image.
    let sheet = null, ultimateSheet = null;
    if (skin.sheet) {
      try {
        sheet = await BuddySheet.prepare(skin.sheet.url, skin.sheet.config, { skinName: skin.name, indexKind: 'sheet', scale: base.scale });
      } catch (e) { buddy.log(`skin "${skin.name}" sheet failed: ${e.message}`); if (!skin.url) throw e; }
    }
    if (skin.ultimateSheet) {
      try {
        ultimateSheet = await BuddySheet.prepare(skin.ultimateSheet.url, skin.ultimateSheet.config, { skinName: skin.name, indexKind: 'ultimate-sheet', scale: (base.ultimate || {}).scale });
      } catch (e) { buddy.log(`skin "${skin.name}" ultimate sheet failed: ${e.message}`); }
    }
    const primary = sheet ? BuddySheet.asImage(sheet, base.anchors) : await prepareImage(skin.url, base);
    let ultimate = null;
    if (ultimateSheet) {
      ultimate = BuddySheet.asImage(ultimateSheet, (base.ultimate || {}).anchors);
    } else if (skin.ultimate) {
      try {
        // The ultimate image inherits keying settings unless it sets its own.
        const ucfg = { keyMode: base.keyMode, keyTolerance: base.keyTolerance, ...skin.ultimate.config };
        ultimate = await prepareImage(skin.ultimate.url, ucfg);
      } catch (e) { buddy.log(`skin "${skin.name}" ultimate image failed: ${e.message}`); }
    }
    return { name: skin.name, primary, ultimate, sheet, ultimateSheet, mods: base.mods, ultimateSeconds: Number(base.ultimateSeconds) || null };
  }

  const boot = await buddy.getBootstrap();
  let skin = null;
  if (boot.skin) {
    try { skin = await prepareSkin(boot.skin); } catch (e) { buddy.log(`skin "${boot.skin.name}" failed: ${e.message}; using Kori`); }
  }
  document.getElementById('sprite').innerHTML = PetSprite.svg(skin);
  document.getElementById('pet').classList.toggle('skin', !!skin);
  document.getElementById('pet').classList.toggle('has-ultimate', !!(skin && skin.ultimate));
  document.getElementById('pet').classList.toggle('show-anchors', !!boot.settings.showAnchors);
  document.getElementById('pet').classList.toggle('sheet', !!(skin && skin.sheet));
  document.getElementById('pet').classList.toggle('ultimate-sheet', !!(skin && skin.ultimateSheet));
  BuddyApp.skin = skin;
  // Character style: theme colors, ice or explosion effects, ultimate form on/off.
  const style = boot.style || {};
  BuddyApp.effects = style.effects || 'ice';
  BuddyApp.noUltimate = style.ultimateForm === false;
  BuddyApp.ownQuipsOnly = !!style.ownQuipsOnly;
  BuddyTheme.apply(style.theme);
  BuddyApp.sheetPlayers = BuddySheet.start(skin);
  // A sheet's walk can set its own ground speed so the feet match the stride.
  BuddyApp.walkSpeed = (skin && skin.sheet && skin.sheet.anims.walk && skin.sheet.anims.walk.speed) || null;
  BuddyApp.ultimateSeconds = (skin && skin.ultimateSeconds) || Number(boot.settings.ultimateSeconds) || 30;

  BuddyApp.name = boot.settings.characterName || 'Kori';
  BuddyApp.level = boot.level;
  BuddyApp.balance = boot.balance;
  BuddyQuips.setBase(boot.quips);
  BuddyVoice.setMuted(!!boot.settings.muted);
  BuddySfx.setEnabled(boot.settings.sfx !== false);
  BuddySfx.setVolume(boot.settings.sfxVolume ?? 0.5);

  await BuddyMods.loadAll(boot.mods);
  if (BuddyMods.skipped().length) buddy.log(`mods not used on this character: ${BuddyMods.skipped().join(', ')}`);
  // Characters with "ownQuipsOnly" never use lines that mods add.
  BuddyQuips.setFromMods(BuddyApp.ownQuipsOnly ? [] : BuddyMods.quips());

  BuddyJarProp.mount(boot.jar);
  buddy.on('jar-state', (s) => BuddyJarProp.update(s));
  BuddyBrain.start({ workArea: boot.workArea });
  buddy.on('pointer-reset', () => BuddyBrain.resetPointer());

  // Tell the main process where the pet, its speech bubble, and the jar are, so
  // it can let clicks through everywhere else. Sent only when something moved.
  let lastHit = '';
  const HIT_IDS = ['pet', 'bubble', 'jar-prop'];
  setInterval(() => {
    const rects = [];
    for (const id of HIT_IDS) {
      const el = document.getElementById(id);
      if (!el || el.classList.contains('hidden') || getComputedStyle(el).display === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.height) rects.push({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
    }
    const dragging = !!BuddyBrain.state.dragging;
    const sig = JSON.stringify([rects, dragging]);
    if (sig !== lastHit) { lastHit = sig; buddy.reportHitAreas(rects, dragging); }
  }, 80);
  BuddyBrain.setPaused(!!boot.settings.paused);
  BuddyBrain.setDeskEnabled(boot.settings.deskMode !== false);

  buddy.on('work-area', (wa) => BuddyBrain.resize(wa));
  buddy.on('idle-seconds', (sec) => BuddyBrain.onIdleSeconds(sec));
  buddy.on('activity', (a) => BuddyBrain.onActivity(a));
  buddy.on('quips', (list) => BuddyQuips.setBase(list));
  buddy.on('settings', (s) => {
    BuddyApp.name = s.characterName || 'Kori';
    BuddyVoice.setMuted(!!s.muted);
    BuddyBrain.setPaused(!!s.paused);
    BuddyBrain.setDeskEnabled(s.deskMode !== false);
    document.getElementById('pet').classList.toggle('show-anchors', !!s.showAnchors);
    BuddySfx.setEnabled(s.sfx !== false);
    BuddySfx.setVolume(s.sfxVolume ?? 0.5);
  });
  buddy.on('sfx', ({ name }) => BuddySfx.play(name));
  // The main process never supplies speech text: it asks for the character's
  // own line by event tag, and shows app information as a notice.
  buddy.on('quip', ({ tags, animate }) => { if (Array.isArray(tags)) BuddyBrain.quip(tags, { fallback: false, animate }); });
  buddy.on('toast', ({ text, ms }) => BuddyBubble.toast(String(text || ''), ms || 5000));
  // Only for the quip editor's Say button: the user's own line, spoken as written.
  buddy.on('say', ({ text }) => BuddyBrain.say(text));
  buddy.on('animate', ({ name, durationMs }) => BuddyBrain.playAnimation(name, durationMs));
  buddy.on('reload-content', () => { try { localStorage.setItem('buddy.pos', JSON.stringify({ x: BuddyBrain.state.x, dir: BuddyBrain.state.dir })); } catch (_) {} location.reload(); });

  buddy.on('upgrade-event', (ev) => {
    switch (ev.phase) {
      case 'start':
        BuddyBrain.setWorking(true);
        BuddySfx.play('hum');
        BuddyBubble.toast(`Building "${ev.title}"…`, 5000);
        break;
      case 'progress':
        if (ev.tokens && ev.budgetTokens) BuddyBubble.toast(`Upgrading… ${Math.round(ev.tokens / 1000)}k / ${Math.round(ev.budgetTokens / 1000)}k tokens`, 2500);
        break;
      case 'done':
        BuddyBrain.setWorking(false);
        BuddySfx.play('fanfare');
        BuddyBrain.fire('upgrade', { title: ev.title });
        BuddyBubble.toast(`New upgrade: "${ev.title}"`, 7000);
        BuddyBrain.quip(['upgrade'], { fallback: false, animate: 'frost', priority: 3 });
        break;
      case 'paused':
        BuddyBrain.setWorking(false);
        BuddySfx.play('womp');
        BuddyBubble.toast(`"${ev.title}" ran out of budget; it needs ${Math.round((ev.need || 0) / 1000)}k more tokens.`, 8000);
        BuddyBrain.quip(['upgrade-failed'], { fallback: false, animate: 'shrug' });
        break;
      case 'failed':
        BuddyBrain.setWorking(false);
        BuddySfx.play('womp');
        BuddyBubble.toast(`"${ev.title}" failed: ${String(ev.reason || '').slice(0, 120)}`, 8000);
        BuddyBrain.quip(['upgrade-failed'], { fallback: false, animate: 'huff', priority: 3 });
        break;
      case 'blocked':
        BuddySfx.play('womp');
        BuddyBubble.toast(`"${ev.title}" is on hold: ${ev.reason}`, 7000);
        break;
      default:
        break;
    }
  });
})().catch((e) => { if (window.buddy) buddy.log(`boot failed: ${e.message}`); console.error(e); });
