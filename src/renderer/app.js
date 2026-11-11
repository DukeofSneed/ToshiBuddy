// Renderer entry: builds the sprite (Kori or the user's skin), loads content and
// mods, starts the brain, and listens to the main process.
(async function () {
  window.AskinApp = { level: null, balance: 0 };

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
    askin.log(`skin ${name}: ${img.naturalWidth}x${img.naturalHeight}, background ${s.removedPct}% removed, border ${s.borderPct}% clear (key rgb ${s.key}, tolerance ${s.tol})`);
    return { url: keyed, aspect, config: cfg };
  }

  async function prepareSkin(skin) {
    if (!skin) return null;
    const base = skin.config || {};
    // A sprite sheet, when present, replaces the still image (frames are played
    // by AskinSheet); a broken sheet falls back to the still image.
    let sheet = null, ultimateSheet = null;
    if (skin.sheet) {
      try {
        sheet = await AskinSheet.prepare(skin.sheet.url, skin.sheet.config, { skinName: skin.name, indexKind: 'sheet', scale: base.scale });
      } catch (e) { askin.log(`skin "${skin.name}" sheet failed: ${e.message}`); if (!skin.url) throw e; }
    }
    if (skin.ultimateSheet) {
      try {
        ultimateSheet = await AskinSheet.prepare(skin.ultimateSheet.url, skin.ultimateSheet.config, { skinName: skin.name, indexKind: 'ultimate-sheet', scale: (base.ultimate || {}).scale });
      } catch (e) { askin.log(`skin "${skin.name}" ultimate sheet failed: ${e.message}`); }
    }
    const primary = sheet ? AskinSheet.asImage(sheet, base.anchors) : await prepareImage(skin.url, base);
    let ultimate = null;
    if (ultimateSheet) {
      ultimate = AskinSheet.asImage(ultimateSheet, (base.ultimate || {}).anchors);
    } else if (skin.ultimate) {
      try {
        // The ultimate image inherits keying settings unless it sets its own.
        const ucfg = { keyMode: base.keyMode, keyTolerance: base.keyTolerance, ...skin.ultimate.config };
        ultimate = await prepareImage(skin.ultimate.url, ucfg);
      } catch (e) { askin.log(`skin "${skin.name}" ultimate image failed: ${e.message}`); }
    }
    return { name: skin.name, primary, ultimate, sheet, ultimateSheet, ultimateSeconds: Number(base.ultimateSeconds) || null };
  }

  const boot = await askin.getBootstrap();
  let skin = null;
  if (boot.skin) {
    try { skin = await prepareSkin(boot.skin); } catch (e) { askin.log(`skin "${boot.skin.name}" failed: ${e.message}; using Kori`); }
  }
  document.getElementById('sprite').innerHTML = PetSprite.svg(skin);
  document.getElementById('pet').classList.toggle('skin', !!skin);
  document.getElementById('pet').classList.toggle('has-ultimate', !!(skin && skin.ultimate));
  document.getElementById('pet').classList.toggle('show-anchors', !!boot.settings.showAnchors);
  document.getElementById('pet').classList.toggle('sheet', !!(skin && skin.sheet));
  document.getElementById('pet').classList.toggle('ultimate-sheet', !!(skin && skin.ultimateSheet));
  AskinApp.skin = skin;
  AskinApp.sheetPlayers = AskinSheet.start(skin);
  AskinApp.ultimateSeconds = (skin && skin.ultimateSeconds) || Number(boot.settings.ultimateSeconds) || 30;

  AskinApp.name = boot.settings.characterName || 'Kori';
  AskinApp.level = boot.level;
  AskinApp.balance = boot.balance;
  AskinQuips.setBase(boot.quips);
  AskinVoice.setMuted(!!boot.settings.muted);
  AskinSfx.setEnabled(boot.settings.sfx !== false);
  AskinSfx.setVolume(boot.settings.sfxVolume ?? 0.5);

  await AskinMods.loadAll(boot.mods);
  AskinQuips.setFromMods(AskinMods.quips());

  AskinBrain.start({ workArea: boot.workArea });
  AskinBrain.setPaused(!!boot.settings.paused);
  AskinBrain.setDeskEnabled(boot.settings.deskMode !== false);

  askin.on('work-area', (wa) => AskinBrain.resize(wa));
  askin.on('idle-seconds', (sec) => AskinBrain.onIdleSeconds(sec));
  askin.on('activity', (a) => AskinBrain.onActivity(a));
  askin.on('quips', (list) => AskinQuips.setBase(list));
  askin.on('settings', (s) => {
    AskinApp.name = s.characterName || 'Kori';
    AskinVoice.setMuted(!!s.muted);
    AskinBrain.setPaused(!!s.paused);
    AskinBrain.setDeskEnabled(s.deskMode !== false);
    document.getElementById('pet').classList.toggle('show-anchors', !!s.showAnchors);
    AskinSfx.setEnabled(s.sfx !== false);
    AskinSfx.setVolume(s.sfxVolume ?? 0.5);
  });
  askin.on('sfx', ({ name }) => AskinSfx.play(name));
  askin.on('say', ({ text, animate }) => AskinBrain.say(text, { animate }));
  askin.on('animate', ({ name, durationMs }) => AskinBrain.playAnimation(name, durationMs));
  askin.on('reload-content', () => { try { localStorage.setItem('askin.pos', JSON.stringify({ x: AskinBrain.state.x, dir: AskinBrain.state.dir })); } catch (_) {} location.reload(); });

  askin.on('upgrade-event', (ev) => {
    switch (ev.phase) {
      case 'start':
        AskinBrain.setWorking(true);
        AskinSfx.play('hum');
        AskinBrain.say(`Request received: "${ev.title}". Filing it properly. ${ev.model === 'sonnet' ? 'This one needs senior review.' : 'Do not hover.'}`, { animate: 'think' });
        break;
      case 'progress':
        if (ev.tokens && ev.budgetTokens) AskinBubble.toast(`Upgrading… ${Math.round(ev.tokens / 1000)}k / ${Math.round(ev.budgetTokens / 1000)}k tokens`, 2500);
        break;
      case 'done':
        AskinBrain.setWorking(false);
        AskinSfx.play('fanfare');
        AskinBrain.fire('upgrade', { title: ev.title });
        AskinBrain.say(ev.announcement || `"${ev.title}" is approved and in effect.`, { animate: 'frost' });
        break;
      case 'paused':
        AskinBrain.setWorking(false);
        AskinSfx.play('womp');
        AskinBrain.say(`"${ev.title}" is half filed. The budget ran out. I need ${Math.round((ev.need || 0) / 1000)}k more tokens to finish it.`, { animate: 'shrug' });
        break;
      case 'failed':
        AskinBrain.setWorking(false);
        AskinSfx.play('womp');
        AskinBrain.say(`"${ev.title}" was rejected. ${String(ev.reason || '').slice(0, 120)}. I am writing that down.`, { animate: 'huff' });
        break;
      case 'blocked':
        AskinSfx.play('womp');
        AskinBrain.say(`"${ev.title}" is on hold: ${ev.reason}.`, { animate: 'shrug' });
        break;
      default:
        break;
    }
  });
})().catch((e) => { if (window.askin) askin.log(`boot failed: ${e.message}`); console.error(e); });
