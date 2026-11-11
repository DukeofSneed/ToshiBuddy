// Animal Crossing style "animalese" voice, synthesized with the Web Audio API.
// Each letter becomes a short pitched syllable shaped by two vowel formants;
// consonants add a soft noise click. No audio files, no text-to-speech.
(function () {
  let muted = false;
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let onStart = null;
  let onEnd = null;
  let endTimer = null;
  let playing = [];

  // Kori: young, brisk, clipped.
  const VOICE = {
    basePitch: 255,     // Hz
    pitchSpread: 0.28,  // fraction of base pitch letters wander over
    letterMs: 52,       // time per letter
    syllableMs: 60,     // length of each blip (slight overlap = smoother)
    volume: 0.2,
    maxLetters: 140,
  };

  // Rough formant pairs (F1, F2) per vowel sound.
  const FORMANTS = {
    a: [800, 1200], e: [500, 1900], i: [320, 2300], o: [500, 900], u: [350, 800], y: [320, 2100],
  };
  // Which vowel color each letter borrows.
  const LETTER_VOWEL = {
    a: 'a', b: 'i', c: 'i', d: 'i', e: 'e', f: 'e', g: 'i', h: 'a', i: 'i', j: 'a', k: 'a', l: 'e', m: 'e',
    n: 'e', o: 'o', p: 'i', q: 'u', r: 'a', s: 'e', t: 'i', u: 'u', v: 'i', w: 'u', x: 'e', y: 'y', z: 'i',
  };
  const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y']);

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = VOICE.volume;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function pitchFor(ch, i, n) {
    // Stable per-letter pitch, a gentle downward drift across the sentence,
    // and a lift at the end of questions.
    const code = ch.charCodeAt(0) - 97;
    const letterOffset = ((code * 7) % 13) / 12 - 0.5;
    const drift = -0.12 * (i / Math.max(1, n));
    return VOICE.basePitch * (1 + letterOffset * VOICE.pitchSpread + drift + (Math.random() - 0.5) * 0.06);
  }

  function blip(t, ch, pitch, emphasis) {
    const dur = VOICE.syllableMs / 1000;
    const [f1, f2] = FORMANTS[LETTER_VOWEL[ch] || 'a'];

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(pitch * 1.06, t);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.94, t + dur);

    const bp1 = ctx.createBiquadFilter();
    bp1.type = 'bandpass'; bp1.frequency.value = f1; bp1.Q.value = 6;
    const bp2 = ctx.createBiquadFilter();
    bp2.type = 'bandpass'; bp2.frequency.value = f2; bp2.Q.value = 9;
    const g2 = ctx.createGain(); g2.gain.value = 0.55;

    const env = ctx.createGain();
    const peak = 0.9 * emphasis;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    env.gain.exponentialRampToValueAtTime(peak * 0.6, t + dur * 0.55);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(bp1); osc.connect(bp2);
    bp1.connect(env); bp2.connect(g2); g2.connect(env);
    env.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    playing.push(osc);

    if (!VOWELS.has(ch)) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = ch === 's' || ch === 'z' || ch === 'x' ? 4000 : 2200;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.exponentialRampToValueAtTime(0.25 * emphasis, t + 0.004);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
      src.connect(hp); hp.connect(ng); ng.connect(master);
      src.start(t);
      src.stop(t + 0.03);
      playing.push(src);
    }
  }

  function speak(text) {
    if (muted || !text) return false;
    if (!ensureCtx()) return false;
    stop();
    if (ctx.state === 'suspended') ctx.resume();

    const clean = String(text).toLowerCase().slice(0, 400);
    const isQuestion = /\?\s*$/.test(clean);
    const step = VOICE.letterMs / 1000;
    let t = ctx.currentTime + 0.03;
    const letters = clean.replace(/[^a-z]/g, '').length;
    let count = 0;
    for (const ch of clean) {
      if (count >= VOICE.maxLetters) break;
      if (ch >= 'a' && ch <= 'z') {
        let p = pitchFor(ch, count, letters);
        if (isQuestion && count > letters - 5) p *= 1.18;
        blip(t, ch, p, VOWELS.has(ch) ? 1 : 0.85);
        t += step;
        count++;
      } else if (ch === ' ') {
        t += step * 0.6;
      } else if (/[.!?…]/.test(ch)) {
        t += step * 3.5;
      } else if (/[,;:]/.test(ch)) {
        t += step * 2;
      }
    }
    if (!count) return false;
    const totalMs = (t - ctx.currentTime) * 1000;
    if (onStart) onStart();
    clearTimeout(endTimer);
    endTimer = setTimeout(() => { playing = []; if (onEnd) onEnd(); }, totalMs);
    return true;
  }

  function stop() {
    for (const n of playing) { try { n.stop(); } catch (_) { /* already stopped */ } }
    playing = [];
    clearTimeout(endTimer);
  }

  window.AskinVoice = {
    speak,
    stop,
    setMuted(m) { muted = !!m; if (muted) { stop(); if (onEnd) onEnd(); } },
    isMuted() { return muted; },
    setHandlers(start, end) { onStart = start; onEnd = end; },
  };
})();
