// Renderer entry: builds the sprite (Kori or the user's skin), loads content and
// mods, starts the brain, and listens to the main process.
(async function () {
  window.AskinApp = { level: null, balance: 0 };

  // Optional background keying for user skins: pixels near keyColor become
  // transparent, so an image on a solid background stands on the taskbar cleanly.
  async function prepareSkin(skin) {
    if (!skin || !skin.config || !skin.config.keyColor) return skin;
    const hex = String(skin.config.keyColor).replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(hex)) return skin;
    const key = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const tol = Math.max(0, Math.min(255, Number(skin.config.keyTolerance) || 48));
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('skin image failed to load'));
      i.src = skin.url;
    });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, c.width, c.height);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const d = Math.max(Math.abs(px[i] - key[0]), Math.abs(px[i + 1] - key[1]), Math.abs(px[i + 2] - key[2]));
      if (d <= tol) px[i + 3] = 0;
      else if (d <= tol * 1.5) px[i + 3] = Math.round(px[i + 3] * ((d - tol) / (tol * 0.5)));
    }
    g.putImageData(data, 0, 0);
    return { ...skin, url: c.toDataURL('image/png') };
  }

  const boot = await askin.getBootstrap();
  let skin = null;
  if (boot.skin) {
    try { skin = await prepareSkin(boot.skin); } catch (e) { askin.log(`skin "${boot.skin.name}" failed: ${e.message}; using Kori`); }
  }
  document.getElementById('sprite').innerHTML = PetSprite.svg(skin);
  document.getElementById('pet').classList.toggle('skin', !!skin);

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
  askin.on('settings', (s) => {
    AskinVoice.setMuted(!!s.muted);
    AskinBrain.setPaused(!!s.paused);
    AskinBrain.setDeskEnabled(s.deskMode !== false);
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
