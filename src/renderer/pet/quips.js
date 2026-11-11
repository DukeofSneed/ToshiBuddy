// Quip store and picker. Lines come from the main process (the active
// character's dialogue: a skin's own quips.json, or content/quips/*.json for
// Kori, plus the user's edits) and from mods via BuddyMods.register({ quips }).
//
// The brain asks for lines by event tag (greet, click, desk-enter, ...). Each
// event also matches the dialogue-library tags in ALIASES, so a character file
// can use either vocabulary. Dialogue data stays separate from trigger logic.
//
// Per line: cooldown (seconds before it may repeat, default 600), priority
// (higher wins over a lower-priority bubble already showing), weight.
(function () {
  let base = [];
  let fromMods = [];
  const recent = [];
  const lastSaid = new Map(); // text -> ms
  const saidOrder = new Map(); // text -> sequence number (ties within a millisecond)
  let seq = 0;

  function setBase(list) { base = Array.isArray(list) ? list : []; }
  function setFromMods(list) { fromMods = Array.isArray(list) ? list : []; }
  function all() { return base.concat(fromMods); }

  function timeTag() {
    const h = new Date().getHours();
    if (h < 5) return 'night';
    if (h < 12) return 'morning';
    if (h < 18) return 'afternoon';
    if (h < 23) return 'evening';
    return 'night';
  }

  function seasonTag() {
    const m = new Date().getMonth(); // 0 = January (northern hemisphere seasons)
    if (m === 11 || m <= 1) return 'winter';
    if (m <= 4) return 'spring';
    if (m <= 7) return 'summer';
    return 'autumn';
  }

  // Event tag -> dialogue-library tags that also answer it.
  const ALIASES = {
    greet: () => [`time_${timeTag()}`],
    'time-change': () => [`time_${timeTag()}`],
    idle: () => (timeTag() === 'night' || Math.random() < 0.15 ? ['random', 'random_sleepy'] : ['random']),
    click: ['click'],
    'desk-click': ['click'],
    'annoyed-1': ['repeated_click'],
    'annoyed-2': ['repeated_click'],
    'annoyed-3': ['repeated_click'],
    drag: ['drag'],
    drop: ['drag'],
    'drop-hard': ['drag'],
    wake: ['inactivity_long'],
    inactive: ['inactivity'],
    'desk-enter': ['desk_spawn'],
    'desk-exit': ['desk_despawn'],
    'desk-exit-long': ['desk_despawn'],
    'desk-pause': ['desk_idle'],
    desk: ['desk_typing'],
    'desk-writing': ['desk_typing', 'activity_work'],
    'desk-coding': ['desk_typing', 'activity_coding'],
    'desk-lab': ['desk_typing', 'activity_study'],
    'desk-break': ['activity_break'],
    reading: ['activity_reading'],
    slacking: ['slacking'],
    'slacking-extended': ['slacking_extended'],
    upgrade: ['achievement'],
    'upgrade-failed': ['failure'],
    'level-up': ['milestone'],
    'jar-grow': ['activity_bonsai'],
  };

  // How important each event is when no line sets its own priority.
  const EVENT_PRIORITY = {
    upgrade: 3, 'upgrade-failed': 3, 'level-up': 3,
    greet: 2, 'time-change': 2, 'desk-enter': 2, 'desk-exit': 2, 'desk-exit-long': 2, slacking: 2, 'slacking-extended': 2, 'desk-break': 2, 'jar-grow': 2,
    click: 1, 'desk-click': 1, drag: 1, drop: 1, 'drop-hard': 1, 'annoyed-1': 1, 'annoyed-2': 1, 'annoyed-3': 1,
    wake: 1, inactive: 1, 'desk-pause': 1, reading: 1, desk: 1, 'desk-writing': 1, 'desk-coding': 1, 'desk-lab': 1,
  };
  const DEFAULT_COOLDOWN_S = 600;

  function expand(tags) {
    const out = new Set();
    for (const t of tags) {
      out.add(t);
      const a = ALIASES[t];
      if (a) for (const x of (typeof a === 'function' ? a() : a)) out.add(x);
    }
    return out;
  }

  // Pick a line for the given event tags. Returns { text, priority } or null.
  // opts.fallback (default true): with no match, use an idle line instead.
  function pickEntry(tags, vars = {}, opts = {}) {
    const list = Array.isArray(tags) ? tags : [tags];
    const wanted = expand(list);
    const ctx = `time:${timeTag()}`;
    const season = `season:${seasonTag()}`;
    let pool = all().filter((q) => q.tags.some((t) => wanted.has(t)));
    if (!pool.length && opts.fallback !== false) {
      const idle = expand(['idle']);
      pool = all().filter((q) => q.tags.some((t) => idle.has(t)));
    }
    pool = pool.filter((q) => !q.tags.some((t) => t.startsWith('season:') && t !== season));
    if (!pool.length) return null;
    // Prefer quips that match the current time of day when they declare one.
    const timed = pool.filter((q) => q.tags.includes(ctx) || q.tags.includes(season));
    if (timed.length && Math.random() < 0.6) pool = timed;
    else pool = pool.filter((q) => !q.tags.some((t) => t.startsWith('time:') && t !== ctx));
    if (!pool.length) return null;
    // Cooldowns: skip lines said too recently; if all are cooling down, take the
    // one said longest ago.
    const t = Date.now();
    const cool = (q) => (Number(q.cooldown) >= 0 ? Number(q.cooldown) : DEFAULT_COOLDOWN_S) * 1000;
    let candidates = pool.filter((q) => !recent.includes(q.text) && t - (lastSaid.get(q.text) || 0) >= cool(q));
    if (!candidates.length) {
      const oldest = pool.reduce((a, b) => ((saidOrder.get(a.text) || 0) <= (saidOrder.get(b.text) || 0) ? a : b));
      candidates = [oldest];
    }
    const total = candidates.reduce((s, q) => s + (q.weight || 1), 0);
    let r = Math.random() * total;
    let chosen = candidates[candidates.length - 1];
    for (const q of candidates) { r -= q.weight || 1; if (r <= 0) { chosen = q; break; } }
    recent.push(chosen.text);
    if (recent.length > 12) recent.shift();
    lastSaid.set(chosen.text, t);
    saidOrder.set(chosen.text, ++seq);
    const priority = Number.isFinite(Number(chosen.priority))
      ? Number(chosen.priority)
      : Math.max(0, ...list.map((x) => EVENT_PRIORITY[x] || 0));
    return { text: fill(chosen.text, vars), priority };
  }

  function pick(tags, vars = {}, opts = {}) {
    const e = pickEntry(tags, vars, opts);
    return e ? e.text : null;
  }

  // Is there any line for these event tags (without falling back to idle)?
  function has(tags) {
    const wanted = expand(Array.isArray(tags) ? tags : [tags]);
    return all().some((q) => q.tags.some((t) => wanted.has(t)));
  }

  function fill(text, vars) {
    return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  }

  window.BuddyQuips = { setBase, setFromMods, pick, pickEntry, has, timeTag, seasonTag, all, ALIASES };
})();
