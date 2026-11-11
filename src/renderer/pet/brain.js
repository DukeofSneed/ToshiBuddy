// The behavior loop: where Askin walks, when he naps, what he says, and how he
// reacts to being poked, dragged, or dropped.
(function () {
  const PET_W = 160;
  const PET_H = 200;
  const WALK_SPEED = 42; // px per second
  const GRAVITY = 2400;  // px per second squared

  const st = {
    x: 300, y: 0, dir: 1,
    mode: 'idle',       // idle | walk | lean | sleep | drag | fall | trick
    vy: 0,
    stageW: 1920, stageH: 1152,
    paused: false,
    idleSeconds: 0,
    nextDecision: 0,
    nextQuip: 0,
    lastHour: new Date().getHours(),
    dragging: null,
    tempClasses: new Set(),
    working: false,
    lastTs: 0,
  };

  const pet = () => document.getElementById('pet');
  const floor = () => st.stageH - PET_H;
  const rand = (a, b) => a + Math.random() * (b - a);
  const now = () => performance.now();

  function setMode(mode) {
    const el = pet();
    for (const m of ['idle', 'walk', 'lean', 'sleep', 'drag', 'fall']) el.classList.remove(m);
    el.classList.add(mode === 'trick' ? 'idle' : mode);
    st.mode = mode;
  }
  function face(dir) {
    st.dir = dir;
    pet().classList.toggle('face-left', dir < 0);
    pet().classList.toggle('face-right', dir > 0);
  }
  function place() {
    const el = pet();
    el.style.left = `${Math.round(st.x)}px`;
    el.style.top = `${Math.round(st.y)}px`;
    if (window.AskinBubble) AskinBubble.position();
  }
  function save() {
    try { localStorage.setItem('askin.pos', JSON.stringify({ x: st.x, dir: st.dir })); } catch (_) { /* ignore */ }
  }

  // ---- speaking ----
  function say(text, { tags = [], animate = null, ms } = {}) {
    if (!text) return;
    AskinBubble.show(text, { ms });
    pet().classList.add('talk');
    const spoke = AskinVoice.speak(text);
    if (!spoke) setTimeout(() => pet().classList.remove('talk'), Math.min(4000, 900 + text.length * 40));
    if (animate) playAnimation(animate);
  }
  function quip(tags, opts = {}) {
    const text = AskinQuips.pick(tags, vars());
    if (text) say(text, { tags, ...opts });
    st.nextQuip = now() + rand(120000, 300000);
  }
  function vars() {
    return { hour: new Date().getHours(), level: (window.AskinApp && AskinApp.level && AskinApp.level.title) || 'Lazy' };
  }

  // ---- one-shot animations (built-in or from mods) ----
  const BUILTIN_ANIMS = { giftball: 2600, shrug: 1600, think: 2600, wave: 1800, surprised: 900, land: 450 };
  function playAnimation(name, durationMs) {
    const modAnims = AskinMods.animations();
    const dur = durationMs || BUILTIN_ANIMS[name] || (modAnims[name] && modAnims[name].durationMs);
    if (!dur) return false;
    const cls = BUILTIN_ANIMS[name] ? name : `anim-${name}`;
    if (name === 'giftball') AskinSfx.play('shimmer');
    const el = pet();
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    st.tempClasses.add(cls);
    setTimeout(() => { el.classList.remove(cls); st.tempClasses.delete(cls); }, dur);
    return true;
  }

  // ---- mod behaviors ----
  function fire(trigger, extra = {}) {
    let handled = false;
    for (const b of AskinMods.behaviors(trigger)) {
      const chance = b.chance === undefined ? 1 : b.chance;
      if (Math.random() > chance) continue;
      runAction(b, extra);
      handled = true;
    }
    return handled;
  }
  function runAction(b, extra) {
    const a = b.action;
    try {
      if (a.animate) playAnimation(a.animate);
      if (a.sound) AskinSfx.play(a.sound);
      if (a.say) {
        const text = Array.isArray(a.say) ? a.say[Math.floor(Math.random() * a.say.length)] : a.say;
        say(String(text).replace(/\{(\w+)\}/g, (m, k) => (k in extra ? extra[k] : m)));
      }
      if (a.prop) AskinMods.setProp(b.slug, a.prop.id, a.prop.toggle ? 'toggle' : a.prop.show !== false);
    } catch (e) { if (window.askin) askin.log(`behavior error in ${b.slug}: ${e.message}`); }
  }
  const intervalTimers = [];
  function armIntervals() {
    for (const t of intervalTimers) clearInterval(t);
    intervalTimers.length = 0;
    for (const b of AskinMods.behaviors('interval')) {
      intervalTimers.push(setInterval(() => { if (st.mode !== 'sleep' && st.mode !== 'drag' && !st.paused) { const c = b.chance === undefined ? 1 : b.chance; if (Math.random() <= c) runAction(b, {}); } }, b.every));
    }
  }

  // ---- decisions ----
  function decide() {
    if (st.paused || st.working) { setMode('idle'); st.nextDecision = now() + 4000; return; }
    const atLeft = st.x <= 4;
    const atRight = st.x >= st.stageW - PET_W - 4;
    const r = Math.random();
    if ((atLeft || atRight) && r < 0.45) {
      face(atLeft ? 1 : -1);
      setMode('lean');
      st.nextDecision = now() + rand(5000, 12000);
      if (Math.random() < 0.5) quip(['lean']);
      return;
    }
    if (r < 0.48) {
      setMode('walk');
      if (atLeft) face(1); else if (atRight) face(-1); else if (Math.random() < 0.35) face(-st.dir);
      st.nextDecision = now() + rand(2000, 6500);
      return;
    }
    if (r < 0.9) {
      setMode('idle');
      st.nextDecision = now() + rand(3000, 10000);
      return;
    }
    setMode('idle');
    const tricks = ['shrug', 'think', 'giftball', 'wave'];
    playAnimation(tricks[Math.floor(Math.random() * tricks.length)]);
    st.nextDecision = now() + 3000;
  }

  // ---- main loop ----
  function tick(ts) {
    const dt = Math.min(0.05, (ts - (st.lastTs || ts)) / 1000);
    st.lastTs = ts;
    if (st.mode === 'walk') {
      st.x += st.dir * WALK_SPEED * dt;
      if (st.x < 0) { st.x = 0; face(1); st.nextDecision = Math.min(st.nextDecision, now() + 400); }
      if (st.x > st.stageW - PET_W) { st.x = st.stageW - PET_W; face(-1); st.nextDecision = Math.min(st.nextDecision, now() + 400); }
      place();
    } else if (st.mode === 'fall') {
      st.vy += GRAVITY * dt;
      st.y += st.vy * dt;
      if (st.y >= floor()) {
        st.y = floor();
        const hard = st.vy > 900;
        st.vy = 0;
        setMode('idle');
        playAnimation('land');
        AskinSfx.play(hard ? 'land-hard' : 'land');
        save();
        st.nextDecision = now() + 1500;
        if (!fire('drop', {})) quip(hard ? ['drop-hard', 'drop'] : ['drop']);
      }
      place();
    }
    if (st.mode !== 'drag' && st.mode !== 'fall' && st.mode !== 'sleep' && now() >= st.nextDecision) decide();
    if (st.mode !== 'sleep' && st.mode !== 'drag' && !AskinBubble.isVisible() && now() >= st.nextQuip && !st.working) {
      if (!fire('idle', {})) quip(['idle', `time:${AskinQuips.timeTag()}`]);
    }
    const h = new Date().getHours();
    if (h !== st.lastHour) { st.lastHour = h; if (st.mode !== 'sleep' && !fire('hour', { hour: h })) quip(['hour', `time:${AskinQuips.timeTag()}`]); }
    requestAnimationFrame(tick);
  }

  // ---- blinking ----
  function blinkLoop() {
    const el = pet();
    if (st.mode !== 'sleep') {
      el.classList.add('blink');
      setTimeout(() => el.classList.remove('blink'), 130);
      if (Math.random() < 0.25) setTimeout(() => { el.classList.add('blink'); setTimeout(() => el.classList.remove('blink'), 110); }, 260);
    }
    setTimeout(blinkLoop, rand(2500, 6500));
  }

  // ---- sleep / wake ----
  function onIdleSeconds(sec) {
    st.idleSeconds = sec;
    if (sec >= 300 && st.mode !== 'sleep' && st.mode !== 'drag' && !st.working) {
      setMode('sleep');
      AskinVoice.stop();
      AskinBubble.hide();
      AskinSfx.play('yawn');
      fire('sleep', {});
    } else if (sec < 8 && st.mode === 'sleep') {
      wake();
    }
  }
  function wake() {
    setMode('idle');
    AskinSfx.play('chirp');
    st.nextDecision = now() + 2500;
    if (!fire('wake', {})) quip(['wake']);
  }

  // ---- pointer interaction ----
  let hovering = false;
  function setHover(on) {
    if (on === hovering) return;
    hovering = on;
    if (window.askin) askin.setIgnoreMouse(!on && !st.dragging);
  }
  function wire() {
    const el = pet();
    document.addEventListener('mousemove', (e) => {
      const over = !!(e.target && e.target.closest && e.target.closest('#pet, #bubble'));
      setHover(over || !!st.dragging);
      if (st.dragging) {
        const dx = e.clientX - st.dragging.sx;
        const dy = e.clientY - st.dragging.sy;
        if (!st.dragging.moved && Math.hypot(dx, dy) > 6) {
          st.dragging.moved = true;
          setMode('drag');
          AskinSfx.play('whee');
          AskinBubble.hide();
          if (Math.random() < 0.6) quip(['drag']);
        }
        if (st.dragging.moved) {
          st.x = Math.max(-40, Math.min(st.stageW - PET_W + 40, st.dragging.ox + dx));
          st.y = Math.max(-40, Math.min(floor(), st.dragging.oy + dy));
          place();
        }
      }
    });
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (st.mode === 'sleep') wake();
      st.dragging = { sx: e.clientX, sy: e.clientY, ox: st.x, oy: st.y, moved: false, t: now() };
      e.preventDefault();
    });
    document.addEventListener('mouseup', (e) => {
      if (!st.dragging) return;
      const d = st.dragging;
      st.dragging = null;
      if (d.moved) {
        st.x = Math.max(0, Math.min(st.stageW - PET_W, st.x));
        if (st.y < floor() - 2) { setMode('fall'); st.vy = 0; }
        else { setMode('idle'); st.nextDecision = now() + 1500; save(); }
        place();
      } else {
        // A plain click.
        AskinSfx.play('boop');
        if (!fire('click', {})) { playAnimation(Math.random() < 0.5 ? 'surprised' : 'shrug'); quip(['click']); }
        st.nextDecision = now() + 2500;
      }
      setHover(!!(e.target && e.target.closest && e.target.closest('#pet, #bubble')));
    });
    el.addEventListener('dblclick', () => {
      if (!fire('dblclick', {})) { playAnimation('giftball'); quip(['trick']); }
    });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); if (window.askin) askin.popupMenu(e.screenX, e.screenY); });
    document.getElementById('bubble').addEventListener('click', () => AskinBubble.hide());
  }

  // ---- public ----
  function start({ workArea }) {
    st.stageW = workArea.width;
    st.stageH = workArea.height;
    try {
      const saved = JSON.parse(localStorage.getItem('askin.pos') || 'null');
      if (saved && typeof saved.x === 'number') { st.x = Math.max(0, Math.min(st.stageW - PET_W, saved.x)); if (saved.dir) st.dir = saved.dir; }
    } catch (_) { /* ignore */ }
    st.y = floor();
    face(st.dir);
    place();
    setMode('idle');
    st.nextDecision = now() + 2000;
    st.nextQuip = now() + rand(6000, 15000);
    wire();
    armIntervals();
    AskinVoice.setHandlers(() => pet().classList.add('talk'), () => pet().classList.remove('talk'));
    requestAnimationFrame(tick);
    setTimeout(blinkLoop, 1500);
    if (!fire('wake', {})) setTimeout(() => quip(['greet']), 1200);
  }
  function resize(workArea) {
    st.stageW = workArea.width;
    st.stageH = workArea.height;
    st.x = Math.max(0, Math.min(st.stageW - PET_W, st.x));
    if (st.mode !== 'drag' && st.mode !== 'fall') st.y = floor();
    place();
  }
  function setPaused(p) { st.paused = !!p; if (p && st.mode === 'walk') setMode('idle'); }
  function setWorking(on) {
    st.working = !!on;
    pet().classList.toggle('working', !!on);
    if (on && st.mode === 'walk') setMode('idle');
  }

  window.AskinBrain = { start, resize, say, quip, playAnimation, fire, setPaused, setWorking, onIdleSeconds, armIntervals, state: st };
})();
