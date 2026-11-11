// The behavior loop: where Kori walks, when he naps, when he does paperwork at
// his desk, what he says, and how he reacts to being poked, dragged, or dropped.
(function () {
  const PET_W = 160;
  const PET_H = 200;
  const WALK_SPEED = 42;        // px per second
  const GRAVITY = 2400;         // px per second squared
  const DESK_ENTER_MS = 45000;  // continuous busy time before the desk comes out
  const DESK_EXIT_MS = 40000;   // quiet time before the desk goes away
  const PAPER_EVERY_MS = 120000;

  const st = {
    x: 300, y: 0, dir: 1,
    mode: 'idle',       // idle | walk | lean | sleep | drag | fall | desk
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
    deskEnabled: true,
    busySince: 0,
    lastBusyAt: 0,
    deskKind: 'writing',
    deskSince: 0,
    papers: 0,
    deskTimers: [],
    clickTimes: [],      // recent plain clicks, for escalating annoyance
    leisureSince: 0,     // when the current games/videos stretch began
    lastSlackNudge: 0,
    lastDeskBreak: 0,
  };
  const SLACK_AFTER_MS = 25 * 60 * 1000;   // continuous leisure before a nudge
  const SLACK_COOLDOWN_MS = 45 * 60 * 1000;
  const DESK_BREAK_MS = 50 * 60 * 1000;    // desk time before a break reminder

  const pet = () => document.getElementById('pet');
  const floor = () => st.stageH - PET_H;
  const rand = (a, b) => a + Math.random() * (b - a);
  const now = () => performance.now();

  function setMode(mode) {
    const el = pet();
    if (st.mode === 'desk' && mode !== 'desk') leaveDeskVisuals();
    for (const m of ['idle', 'walk', 'lean', 'sleep', 'drag', 'fall', 'desk']) el.classList.remove(m);
    el.classList.add(mode);
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
  function say(text, { animate = null, ms } = {}) {
    if (!text) return;
    AskinBubble.show(text, { ms });
    pet().classList.add('talk');
    const spoke = AskinVoice.speak(text);
    if (!spoke) setTimeout(() => pet().classList.remove('talk'), Math.min(4000, 900 + text.length * 40));
    if (animate) playAnimation(animate);
  }
  function quip(tags, opts = {}) {
    const text = AskinQuips.pick(tags, vars());
    if (text) say(text, opts);
    st.nextQuip = now() + rand(120000, 300000);
  }
  function vars() {
    return { hour: new Date().getHours(), level: (window.AskinApp && AskinApp.level && AskinApp.level.title) || 'Recruit' };
  }

  // ---- one-shot animations (built-in or from mods) ----
  const BUILTIN_ANIMS = { frost: 2600, shrug: 1600, think: 2600, wave: 1800, surprised: 900, land: 450, huff: 900, release: 4200, stamp: 900 };
  function playAnimation(name, durationMs) {
    if (name === 'giftball') name = 'frost'; // old name from before the character change
    if (name === 'stamp') return stamp();
    if (name === 'ultimate') return enterUltimate();
    const modAnims = AskinMods.animations();
    const dur = durationMs || BUILTIN_ANIMS[name] || (modAnims[name] && modAnims[name].durationMs);
    if (!dur) return false;
    const cls = BUILTIN_ANIMS[name] ? name : `anim-${name}`;
    if (name === 'frost') AskinSfx.play('shimmer');
    if (name === 'huff') AskinSfx.play('huff');
    if (name === 'release') releaseFx();
    const el = pet();
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    st.tempClasses.add(cls);
    setTimeout(() => { el.classList.remove(cls); st.tempClasses.delete(cls); }, dur);
    return true;
  }

  // ---- Frost Release: screen-level burst around the pet ----
  function petCenter() {
    return { x: st.x + PET_W / 2, y: st.y + PET_H * 0.55 };
  }
  function releaseFx() {
    const stage = document.getElementById('stage');
    const c = petCenter();
    AskinSfx.play('freeze');
    setTimeout(() => AskinSfx.play('chime'), 450);
    setTimeout(() => AskinSfx.play('blizzard'), 700);
    const ring = (delay) => setTimeout(() => {
      const r = document.createElement('div');
      r.className = 'frost-ring';
      r.style.left = `${c.x}px`;
      r.style.top = `${c.y}px`;
      stage.appendChild(r);
      setTimeout(() => r.remove(), 1100);
    }, delay);
    ring(500);
    ring(800);
    const flakeSvg = (size) => `<svg viewBox="-10 -10 20 20">${PetSprite.snowflake(0, 0, 8, 'stroke="#e9f8ff" stroke-width="1.8" fill="none" stroke-linecap="round"')}</svg>`;
    setTimeout(() => {
      for (let i = 0; i < 28; i++) {
        const f = document.createElement('div');
        f.className = 'flake';
        const size = rand(10, 26);
        const ang = rand(0, Math.PI * 2);
        const dist = rand(90, 360);
        f.style.width = f.style.height = `${size}px`;
        f.style.left = `${c.x - size / 2}px`;
        f.style.top = `${c.y - size / 2}px`;
        f.style.setProperty('--dx', `${Math.cos(ang) * dist}px`);
        f.style.setProperty('--dy', `${Math.sin(ang) * dist * 0.7 - 60}px`);
        f.style.setProperty('--fall', `${rand(120, 260)}px`);
        f.style.setProperty('--rot', `${rand(-180, 180)}deg`);
        f.style.setProperty('--dur', `${rand(2200, 3400)}ms`);
        f.innerHTML = flakeSvg(size);
        stage.appendChild(f);
        setTimeout(() => f.remove(), 3600);
      }
    }, 550);
  }

  // ---- ultimate form: Frost Release, then a held powered-up state ----
  // With a skin that has an ultimate image, the image swaps for the duration.
  let ultimateTimer = null;
  function enterUltimate(seconds) {
    const el = pet();
    const ms = Math.max(5, Math.min(600, seconds || (window.AskinApp && AskinApp.ultimateSeconds) || 30)) * 1000;
    const already = el.classList.contains('ultimate');
    if (!already) {
      playAnimation('release');
      setTimeout(() => {
        el.classList.add('ultimate', 'ultimate-in');
        setTimeout(() => el.classList.remove('ultimate-in'), 650);
        fire('ultimate', {});
      }, 550);
    } else {
      // Another donation mid-form: a smaller flourish and a fresh timer.
      AskinSfx.play('chime');
    }
    clearTimeout(ultimateTimer);
    ultimateTimer = setTimeout(exitUltimate, ms + (already ? 0 : 550));
    return true;
  }
  function exitUltimate() {
    const el = pet();
    if (!el.classList.contains('ultimate')) return;
    el.classList.add('ultimate-out');
    AskinSfx.play('freeze');
    setTimeout(() => {
      el.classList.remove('ultimate', 'ultimate-out');
      AskinSfx.play('shimmer');
      if (st.mode !== 'sleep') quip(['ultimate-end']);
    }, 350);
  }

  // ---- desk mode: paperwork while the user writes or does labs ----
  function enterDesk(kind = 'writing') {
    if (st.mode === 'desk') return;
    st.deskKind = kind;
    st.deskSince = now();
    st.papers = 1;
    setMode('desk');
    const el = pet();
    el.dataset.papers = String(st.papers);
    el.classList.add('desk-in');
    setTimeout(() => el.classList.remove('desk-in'), 600);
    AskinSfx.play('stamp');
    if (!fire('desk', { kind })) quip([`desk-enter-${kind}`, 'desk-enter']);
    st.nextQuip = now() + rand(150000, 300000);
    scheduleDeskWork();
  }
  function scheduleDeskWork() {
    clearDeskTimers();
    const loop = (fn, min, max) => {
      const run = () => {
        if (st.mode !== 'desk') return;
        fn();
        st.deskTimers.push(setTimeout(run, rand(min, max)));
      };
      st.deskTimers.push(setTimeout(run, rand(min, max)));
    };
    // Scribble in bursts.
    loop(() => {
      const el = pet();
      el.classList.add('scribbling');
      AskinSfx.play('scribble');
      setTimeout(() => el.classList.remove('scribbling'), rand(1800, 3600));
    }, 3500, 7000);
    loop(() => stamp(), 11000, 24000);
    loop(() => {
      st.papers = Math.min(8, st.papers + 1);
      pet().dataset.papers = String(st.papers);
    }, PAPER_EVERY_MS, PAPER_EVERY_MS + 20000);
  }
  function stamp() {
    if (st.mode !== 'desk') return false;
    const el = pet();
    el.classList.remove('stamp');
    void el.offsetWidth;
    el.classList.add('stamp');
    setTimeout(() => { AskinSfx.play('stamp'); el.classList.add('stamped'); }, 470);
    setTimeout(() => el.classList.remove('stamp'), 900);
    setTimeout(() => el.classList.remove('stamped'), 2600);
    return true;
  }
  function clearDeskTimers() {
    for (const t of st.deskTimers) clearTimeout(t);
    st.deskTimers = [];
  }
  function leaveDeskVisuals() {
    clearDeskTimers();
    const el = pet();
    el.classList.remove('scribbling', 'stamp', 'stamped', 'desk-in');
    delete el.dataset.papers;
  }
  function exitDesk({ quiet = false } = {}) {
    if (st.mode !== 'desk') return;
    const minutes = Math.round((now() - st.deskSince) / 60000);
    setMode('idle');
    st.nextDecision = now() + 3000;
    if (!quiet) quip(minutes >= 20 ? ['desk-exit-long', 'desk-exit'] : ['desk-exit'], {});
  }
  // Called by the main process every couple of seconds.
  function onActivity({ busy, kind, leisure }) {
    const t = now();
    // A long, uninterrupted stretch of games or videos earns one dry remark.
    if (leisure) {
      if (!st.leisureSince) st.leisureSince = t;
      const due = t - st.leisureSince >= SLACK_AFTER_MS && t - st.lastSlackNudge >= SLACK_COOLDOWN_MS;
      if (due && ['idle', 'walk', 'lean'].includes(st.mode) && !AskinBubble.isVisible()) {
        st.lastSlackNudge = t;
        playAnimation('think');
        quip(['slacking']);
      }
    } else {
      st.leisureSince = 0;
    }
    // At the desk for a long time: remind the user to take a break.
    if (st.mode === 'desk' && t - st.deskSince >= DESK_BREAK_MS && t - st.lastDeskBreak >= DESK_BREAK_MS && !AskinBubble.isVisible()) {
      st.lastDeskBreak = t;
      quip(['desk-break']);
    }
    if (!st.deskEnabled) { if (st.mode === 'desk') exitDesk({ quiet: true }); return; }
    if (busy) {
      st.lastBusyAt = t;
      if (!st.busySince) st.busySince = t;
      if (kind) st.deskKind = kind;
      const ready = ['idle', 'walk', 'lean'].includes(st.mode) && !st.working && !st.dragging;
      if (ready && t - st.busySince >= DESK_ENTER_MS) enterDesk(st.deskKind);
    } else {
      st.busySince = 0;
      if (st.mode === 'desk' && t - st.lastBusyAt >= DESK_EXIT_MS) exitDesk();
    }
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
    const tricks = ['shrug', 'think', 'frost', 'huff'];
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
    const free = !['drag', 'fall', 'sleep', 'desk'].includes(st.mode);
    if (free && now() >= st.nextDecision) decide();
    if (st.mode !== 'sleep' && st.mode !== 'drag' && !AskinBubble.isVisible() && now() >= st.nextQuip && !st.working) {
      if (st.mode === 'desk') quip([`desk-${st.deskKind}`, 'desk']);
      else if (!fire('idle', {})) quip(['idle', `time:${AskinQuips.timeTag()}`]);
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
          st.busySince = 0; // pulled away from the desk; start the timer over
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
        // A plain click. Repeated pokes make him progressively more irritated;
        // he puts up with it, but he makes sure you know.
        AskinSfx.play('boop');
        const t = now();
        st.clickTimes = st.clickTimes.filter((c) => t - c < 12000);
        st.clickTimes.push(t);
        const pokes = st.clickTimes.length;
        if (pokes >= 7) { playAnimation('huff'); quip(['annoyed-3']); st.clickTimes = []; }
        else if (pokes === 5) { playAnimation('huff'); quip(['annoyed-2']); }
        else if (pokes === 3) { playAnimation('shrug'); quip(['annoyed-1']); }
        else if (pokes > 3) { /* pointedly ignoring you */ }
        else if (st.mode === 'desk') { if (!fire('click', {})) { stamp(); quip(['desk-click', 'click']); } }
        else if (!fire('click', {})) { playAnimation(Math.random() < 0.5 ? 'surprised' : 'huff'); quip(['click']); }
        st.nextDecision = now() + 2500;
      }
      setHover(!!(e.target && e.target.closest && e.target.closest('#pet, #bubble')));
    });
    el.addEventListener('dblclick', () => {
      if (st.mode === 'desk') return;
      if (!fire('dblclick', {})) { playAnimation('frost'); quip(['trick']); }
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
  function setDeskEnabled(on) { st.deskEnabled = on !== false; if (!st.deskEnabled) exitDesk({ quiet: true }); }
  function setWorking(on) {
    st.working = !!on;
    pet().classList.toggle('working', !!on);
    if (on && st.mode === 'walk') setMode('idle');
  }

  window.AskinBrain = {
    start, resize, say, quip, playAnimation, fire, setPaused, setWorking, setDeskEnabled,
    onIdleSeconds, onActivity, enterDesk, exitDesk, enterUltimate, exitUltimate, armIntervals, state: st,
  };
})();
