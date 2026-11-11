// Renderer entry: boots the sprite, loads content and mods, starts the brain,
// and listens to the main process.
(async function () {
  window.AskinApp = { level: null, balance: 0 };
  document.getElementById('sprite').innerHTML = AskinSprite.svg();

  const boot = await askin.getBootstrap();
  AskinApp.level = boot.level;
  AskinApp.balance = boot.balance;
  AskinQuips.setBase(boot.quips);
  AskinVoice.setMuted(!!boot.settings.muted);

  await AskinMods.loadAll(boot.mods);
  AskinQuips.setFromMods(AskinMods.quips());

  AskinBrain.start({ workArea: boot.workArea });
  AskinBrain.setPaused(!!boot.settings.paused);

  askin.on('work-area', (wa) => AskinBrain.resize(wa));
  askin.on('idle-seconds', (sec) => AskinBrain.onIdleSeconds(sec));
  askin.on('settings', (s) => { AskinVoice.setMuted(!!s.muted); AskinBrain.setPaused(!!s.paused); });
  askin.on('say', ({ text, tags, animate }) => AskinBrain.say(text, { tags: tags || [], animate }));
  askin.on('animate', ({ name, durationMs }) => AskinBrain.playAnimation(name, durationMs));
  askin.on('reload-content', () => { try { localStorage.setItem('askin.pos', JSON.stringify({ x: AskinBrain.state.x, dir: AskinBrain.state.dir })); } catch (_) {} location.reload(); });

  askin.on('upgrade-event', (ev) => {
    switch (ev.phase) {
      case 'start':
        AskinBrain.setWorking(true);
        AskinBrain.say(`Fine. Working on "${ev.title}". ${ev.model === 'sonnet' ? 'Using the big brain for this one.' : 'Minimal effort, maximum deluxe.'}`, { animate: 'think' });
        break;
      case 'progress':
        if (ev.tokens && ev.budgetTokens) AskinBubble.toast(`Upgrading… ${Math.round(ev.tokens / 1000)}k / ${Math.round(ev.budgetTokens / 1000)}k tokens`, 2500);
        break;
      case 'done':
        AskinBrain.setWorking(false);
        AskinBrain.fire('upgrade', { title: ev.title });
        AskinBrain.say(ev.announcement || `New trick: ${ev.title}.`, { animate: 'giftball' });
        break;
      case 'paused':
        AskinBrain.setWorking(false);
        AskinBrain.say(`I got halfway through "${ev.title}" and ran dry. Top up ${Math.round((ev.need || 0) / 1000)}k tokens and I'll finish. Eventually.`, { animate: 'shrug' });
        break;
      case 'failed':
        AskinBrain.setWorking(false);
        AskinBrain.say(`"${ev.title}" didn't take. ${String(ev.reason || '').slice(0, 120)}. Not my fault. Probably.`, { animate: 'shrug' });
        break;
      case 'blocked':
        AskinBrain.say(`Not building "${ev.title}" right now: ${ev.reason}.`, { animate: 'shrug' });
        break;
      case 'undone':
        break;
      default:
        break;
    }
  });
})().catch((e) => { if (window.askin) askin.log(`boot failed: ${e.message}`); console.error(e); });
