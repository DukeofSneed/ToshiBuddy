// Quip store and picker. Base quips come from content/quips/*.json (read by the
// main process); mods add theirs through AskinMods.register({ quips }).
(function () {
  let base = [];
  let fromMods = [];
  const recent = [];

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

  // Pick a quip matching any of the given tags. Falls back to 'idle'.
  // Quips tagged time:<part> or season:<name> only play in that time/season.
  function pick(tags, vars = {}) {
    const wanted = new Set(Array.isArray(tags) ? tags : [tags]);
    const ctx = `time:${timeTag()}`;
    const season = `season:${seasonTag()}`;
    let pool = all().filter((q) => q.tags.some((t) => wanted.has(t)));
    if (!pool.length) pool = all().filter((q) => q.tags.includes('idle'));
    pool = pool.filter((q) => !q.tags.some((t) => t.startsWith('season:') && t !== season));
    if (!pool.length) return null;
    // Prefer quips that match the current time of day when they declare one.
    const timed = pool.filter((q) => q.tags.includes(ctx) || q.tags.includes(season));
    if (timed.length && Math.random() < 0.6) pool = timed;
    else pool = pool.filter((q) => !q.tags.some((t) => t.startsWith('time:') && t !== ctx));
    if (!pool.length) return null;
    const fresh = pool.filter((q) => !recent.includes(q.text));
    const candidates = fresh.length ? fresh : pool;
    const total = candidates.reduce((s, q) => s + (q.weight || 1), 0);
    let r = Math.random() * total;
    let chosen = candidates[candidates.length - 1];
    for (const q of candidates) { r -= q.weight || 1; if (r <= 0) { chosen = q; break; } }
    recent.push(chosen.text);
    if (recent.length > 12) recent.shift();
    return fill(chosen.text, vars);
  }

  function fill(text, vars) {
    return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  }

  window.AskinQuips = { setBase, setFromMods, pick, timeTag, seasonTag, all };
})();
