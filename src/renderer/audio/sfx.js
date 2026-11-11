// Sound effects synthesized with the Web Audio API. No audio files, no deps.
// Shared by the overlay (pet) and the jar window. Mods can trigger these by
// name through a behavior's action.sound (see docs/MOD_API.md).
(function () {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let enabled = true;
  let volume = 0.5;
  const lastPlayed = {};

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  // One enveloped oscillator note, optionally sliding in pitch.
  function tone(t, { freq, to = freq, dur, type = 'sine', gain = 0.5, attack = 0.005, filter = null }) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type || 'lowpass';
      f.frequency.value = filter.freq;
      if (filter.q) f.Q.value = filter.q;
      osc.connect(f);
      node = f;
    }
    node.connect(env);
    env.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // A burst of filtered noise, optionally sweeping the filter.
  function noise(t, { dur, type = 'bandpass', freq = 1000, to = freq, q = 1, gain = 0.3, attack = 0.005 }) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (to !== freq) f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(env);
    env.connect(master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  const SOUNDS = {
    // Speech bubble appears.
    pop(t) {
      tone(t, { freq: 520, to: 1150, dur: 0.07, gain: 0.35 });
      noise(t, { dur: 0.02, freq: 3000, q: 2, gain: 0.08 });
    },
    // The character gets clicked.
    boop(t) {
      tone(t, { freq: 440, to: 290, dur: 0.14, type: 'triangle', gain: 0.45 });
    },
    // Picked up.
    whee(t) {
      tone(t, { freq: 300, to: 950, dur: 0.28, type: 'triangle', gain: 0.3, attack: 0.02 });
      tone(t + 0.02, { freq: 450, to: 1400, dur: 0.24, gain: 0.12, attack: 0.02 });
    },
    // Lands on the taskbar.
    land(t) {
      tone(t, { freq: 150, to: 55, dur: 0.18, gain: 0.55 });
      noise(t, { dur: 0.07, type: 'lowpass', freq: 600, gain: 0.25 });
    },
    'land-hard'(t) {
      tone(t, { freq: 170, to: 40, dur: 0.32, gain: 0.8 });
      noise(t, { dur: 0.14, type: 'lowpass', freq: 900, to: 200, gain: 0.45 });
      tone(t + 0.12, { freq: 900, to: 700, dur: 0.12, type: 'triangle', gain: 0.1 });
    },
    // Ice-crystal trick.
    shimmer(t) {
      noise(t, { dur: 0.7, freq: 700, to: 6500, q: 4, gain: 0.16, attack: 0.08 });
      [880, 1109, 1319, 1760, 2217].forEach((f, i) => tone(t + 0.05 + i * 0.075, { freq: f, dur: 0.45, gain: 0.16 }));
    },
    // Tokens into the jar.
    coin(t) {
      tone(t, { freq: 988, dur: 0.09, type: 'square', gain: 0.12, filter: { freq: 3500 } });
      tone(t + 0.08, { freq: 1319, dur: 0.42, type: 'square', gain: 0.12, filter: { freq: 3500 } });
      tone(t + 0.08, { freq: 2637, dur: 0.3, gain: 0.05 });
    },
    // Drifts off to sleep.
    yawn(t) {
      tone(t, { freq: 330, to: 170, dur: 1.0, type: 'sawtooth', gain: 0.16, attack: 0.15, filter: { type: 'lowpass', freq: 900, q: 3 } });
      noise(t + 0.1, { dur: 0.9, type: 'lowpass', freq: 700, to: 300, gain: 0.06, attack: 0.2 });
    },
    // Wakes up.
    chirp(t) {
      tone(t, { freq: 520, to: 900, dur: 0.09, gain: 0.3 });
      tone(t + 0.11, { freq: 700, to: 1150, dur: 0.11, gain: 0.3 });
    },
    // Upgrade landed.
    fanfare(t) {
      const notes = [[523, 0], [659, 0.1], [784, 0.2], [1047, 0.32]];
      notes.forEach(([f, d], i) => tone(t + d, { freq: f, dur: i === 3 ? 0.65 : 0.16, type: 'triangle', gain: 0.32 }));
      tone(t + 0.32, { freq: 1568, dur: 0.6, gain: 0.08 });
    },
    // Upgrade failed or was blocked.
    womp(t) {
      tone(t, { freq: 311, to: 294, dur: 0.28, type: 'sawtooth', gain: 0.2, filter: { freq: 1100 } });
      tone(t + 0.3, { freq: 277, to: 185, dur: 0.6, type: 'sawtooth', gain: 0.2, filter: { freq: 900 } });
    },
    // Upgrade starting / thinking it over.
    hum(t) {
      tone(t, { freq: 220, to: 247, dur: 0.35, type: 'triangle', gain: 0.22, attack: 0.05 });
      tone(t + 0.3, { freq: 247, to: 196, dur: 0.4, type: 'triangle', gain: 0.18, attack: 0.05 });
    },
    // Jar buttons.
    tick(t) {
      tone(t, { freq: 1800, to: 1500, dur: 0.035, gain: 0.15 });
    },
    // Ice forming: a fast run of crackles over a falling sparkle.
    freeze(t) {
      for (let i = 0; i < 14; i++) {
        noise(t + i * 0.028 + Math.random() * 0.01, { dur: 0.03, type: 'highpass', freq: 3000 + Math.random() * 3000, gain: 0.12 + Math.random() * 0.08 });
      }
      tone(t, { freq: 2600, to: 900, dur: 0.5, gain: 0.08 });
      tone(t + 0.05, { freq: 3900, to: 1400, dur: 0.45, gain: 0.05 });
    },
    // Crystal bell: inharmonic partials with a long ring.
    chime(t) {
      const base = 1320;
      [[1, 0.2, 1.6], [2.76, 0.09, 1.1], [5.4, 0.05, 0.7], [8.93, 0.03, 0.45]].forEach(([r, g, d]) => tone(t, { freq: base * r, dur: d, gain: g, attack: 0.002 }));
      [[1, 0.12, 1.4], [2.76, 0.06, 0.9]].forEach(([r, g, d]) => tone(t + 0.16, { freq: base * 1.5 * r, dur: d, gain: g, attack: 0.002 }));
    },
    // Blizzard gust.
    blizzard(t) {
      noise(t, { dur: 2.4, type: 'bandpass', freq: 400, to: 1800, q: 0.8, gain: 0.22, attack: 0.5 });
      noise(t + 0.3, { dur: 2.0, type: 'bandpass', freq: 2500, to: 700, q: 2, gain: 0.08, attack: 0.4 });
    },
    // Rubber stamp on paper.
    stamp(t) {
      tone(t, { freq: 140, to: 70, dur: 0.12, gain: 0.5 });
      noise(t, { dur: 0.06, type: 'bandpass', freq: 1800, q: 1.5, gain: 0.3 });
    },
    // Quill scratching.
    scribble(t) {
      for (let i = 0; i < 5; i++) {
        noise(t + i * 0.09 + Math.random() * 0.03, { dur: 0.06 + Math.random() * 0.04, type: 'bandpass', freq: 4500 + Math.random() * 2500, q: 6, gain: 0.05 });
      }
    },
    // An annoyed little huff.
    huff(t) {
      noise(t, { dur: 0.32, type: 'bandpass', freq: 900, to: 500, q: 1.2, gain: 0.2, attack: 0.02 });
      tone(t, { freq: 300, to: 220, dur: 0.2, type: 'triangle', gain: 0.08 });
    },
  };

  function play(name) {
    if (!enabled || !SOUNDS[name]) return false;
    if (!ensure()) return false;
    // Don't stack the same sound on itself (rapid clicks).
    const now = performance.now();
    if (lastPlayed[name] && now - lastPlayed[name] < 60) return false;
    lastPlayed[name] = now;
    if (ctx.state === 'suspended') ctx.resume();
    try { SOUNDS[name](ctx.currentTime + 0.01); return true; } catch (_) { return false; }
  }

  window.BuddySfx = {
    play,
    names: Object.keys(SOUNDS),
    setEnabled(on) { enabled = on !== false; },
    setVolume(v) {
      volume = Math.max(0, Math.min(1, Number(v)));
      if (master) master.gain.value = volume;
    },
    isEnabled() { return enabled; },
  };
})();
