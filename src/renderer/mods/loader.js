// Mod loader and the BuddyMods API that generated upgrades call.
// A mod is mods/<slug>/mod.js: plain browser JS that calls BuddyMods.register({...}).
// See docs/MOD_API.md for the contract this file enforces.
(function () {
  const registry = []; // { slug, def }
  let currentSlug = null;
  let currentRegistered = false;
  let currentBase = null; // URL of the folder the mod being loaded lives in
  const IMAGE_FILE = /^[a-z0-9][a-z0-9-]{0,39}\.(png|webp|gif|jpg)$/;
  const ANCHORS = new Set(['head', 'hand-r', 'hand-l', 'back', 'front', 'desk']);
  const TRIGGERS = new Set(['idle', 'click', 'dblclick', 'drop', 'hour', 'wake', 'sleep', 'interval', 'donate', 'upgrade', 'lean', 'desk', 'ultimate', 'desk-done', 'desk-long', 'app-switch']);
  const RESERVED_ANIMS = new Set(['idle', 'walk', 'lean', 'sleep', 'drag', 'fall', 'land', 'talk', 'blink', 'face-left', 'face-right',
    'desk', 'desk-in', 'release', 'stamp', 'stamped', 'scribbling', 'skin', 'working', 'frost', 'huff', 'shrug', 'think', 'wave', 'surprised',
    'ultimate', 'ultimate-in', 'ultimate-out', 'has-ultimate']);

  function fail(msg) { throw new Error(msg); }

  function validate(def) {
    if (!def || typeof def !== 'object') fail('register() needs an object');
    if (!def.id || typeof def.id !== 'string' || !/^[a-z0-9-]{2,40}$/.test(def.id)) fail('id must be 2-40 chars of a-z, 0-9, -');
    if (def.quips !== undefined) {
      if (!Array.isArray(def.quips) || def.quips.length > 200) fail('quips must be an array (max 200)');
      for (const q of def.quips) {
        if (!q || typeof q.text !== 'string' || q.text.length > 240) fail('each quip needs text (<=240 chars)');
        if (q.tags !== undefined && !Array.isArray(q.tags)) fail('quip.tags must be an array');
      }
    }
    if (def.animations !== undefined) {
      if (typeof def.animations !== 'object') fail('animations must be an object');
      for (const [name, a] of Object.entries(def.animations)) {
        if (!/^[a-z0-9-]{2,30}$/.test(name)) fail(`bad animation name ${name}`);
        if (RESERVED_ANIMS.has(name)) fail(`animation name ${name} is reserved`);
        if (!a || typeof a.css !== 'string' || a.css.length > 20000) fail(`animation ${name} needs css (<=20k chars)`);
        if (a.durationMs !== undefined && !(a.durationMs >= 100 && a.durationMs <= 20000)) fail(`animation ${name} durationMs must be 100-20000`);
        if (/@import|url\(|expression\(/i.test(a.css)) fail(`animation ${name} css may not import or load urls`);
      }
    }
    if (def.props !== undefined) {
      if (!Array.isArray(def.props) || def.props.length > 20) fail('props must be an array (max 20)');
      for (const p of def.props) {
        if (!p || (p.svg === undefined && !p.image)) fail('each prop needs svg and/or image');
        if (p.svg !== undefined && (typeof p.svg !== 'string' || p.svg.length > 20000)) fail('prop svg must be a string (<=20k chars)');
        if (!ANCHORS.has(p.anchor)) fail(`prop anchor must be one of ${[...ANCHORS].join(', ')}`);
        if (p.svg && /<script|<foreignObject|on\w+=|href\s*=|url\(/i.test(p.svg)) fail('prop svg may not contain scripts, links, or urls');
        if (p.image !== undefined) {
          // A picture the user attached to the upgrade, in the mod's own assets folder.
          const im = p.image;
          if (!im || typeof im !== 'object' || !IMAGE_FILE.test(String(im.file))) fail('prop image.file must be a picture file name in the mod\'s assets folder');
          for (const k of ['x', 'y']) if (!(Number(im[k]) >= -200 && Number(im[k]) <= 400)) fail(`prop image.${k} must be a number from -200 to 400`);
          for (const k of ['width', 'height']) if (!(Number(im[k]) >= 1 && Number(im[k]) <= 300)) fail(`prop image.${k} must be 1-300`);
          if (im.fit !== undefined && im.fit !== 'contain' && im.fit !== 'cover') fail('prop image.fit must be "contain" or "cover"');
          if (im.rotate !== undefined && !(Number(im.rotate) >= -180 && Number(im.rotate) <= 180)) fail('prop image.rotate must be -180 to 180');
        }
        if (p.id !== undefined && !/^[a-z0-9-]{2,40}$/.test(p.id)) fail('prop id must be a-z, 0-9, -');
      }
    }
    if (def.behaviors !== undefined) {
      if (!Array.isArray(def.behaviors) || def.behaviors.length > 30) fail('behaviors must be an array (max 30)');
      for (const b of def.behaviors) {
        if (!b || !TRIGGERS.has(b.trigger)) fail(`behavior trigger must be one of ${[...TRIGGERS].join(', ')}`);
        if (b.trigger === 'interval' && !(b.every >= 30000)) fail('interval behaviors need every >= 30000 ms');
        if (b.chance !== undefined && !(b.chance >= 0 && b.chance <= 1)) fail('behavior chance must be 0-1');
        if (!b.action || typeof b.action !== 'object') fail('behavior needs an action object');
        if (b.count !== undefined) {
          // A saved count of how often this event happened; the action runs every N times or at milestones.
          const c = b.count;
          if (!c || typeof c !== 'object' || !/^[a-z0-9-]{1,30}$/.test(String(c.name))) fail('behavior count.name must be 1-30 chars of a-z, 0-9, -');
          const every = c.every === undefined || (Number.isInteger(c.every) && c.every >= 2 && c.every <= 100000);
          const at = c.at === undefined || (Array.isArray(c.at) && c.at.length >= 1 && c.at.length <= 20 && c.at.every((n) => Number.isInteger(n) && n >= 1 && n <= 1000000));
          if (!every || !at || (c.every === undefined && c.at === undefined)) fail('behavior count needs every (2-100000) and/or at (a list of up to 20 whole numbers)');
        }
        const a = b.action;
        if (a.animate !== undefined && typeof a.animate !== 'string') fail('action.animate must be a string');
        if (a.say !== undefined && typeof a.say !== 'string' && !Array.isArray(a.say)) fail('action.say must be a string or array');
        if (a.prop !== undefined && (typeof a.prop !== 'object' || !a.prop.id)) fail('action.prop needs { id, show|toggle }');
        if (a.sound !== undefined && (!window.BuddySfx || !BuddySfx.names.includes(a.sound))) fail(`action.sound must be one of ${window.BuddySfx ? BuddySfx.names.join(', ') : 'the built-in sounds'}`);
      }
    }
    if (def.onTick !== undefined) fail('onTick is not part of the API; use behaviors');
    if (def.characters !== undefined && (!Array.isArray(def.characters) || !def.characters.every((c) => c === 'kori' || c === 'skin'))) fail('characters must be an array of "kori" and/or "skin"');
  }

  // Does this mod apply to the active character?
  //  - a mod with characters: ['kori'] only runs on the built-in Kori;
  //  - a skin's skin.json can set "mods": false (none) or a list of mod ids.
  const skipped = [];
  function allowed(def, slug) {
    const skin = window.BuddyApp && BuddyApp.skin;
    const who = skin ? 'skin' : 'kori';
    if (def.characters && !def.characters.includes(who)) return false;
    if (skin) {
      const m = skin.mods;
      if (m === false) return false;
      if (Array.isArray(m) && !m.includes(slug) && !m.includes(def.id)) return false;
    }
    return true;
  }

  function register(def) {
    validate(def);
    if (currentSlug && def.id !== currentSlug) {
      // Allow it, but keep the folder slug as the identity for reporting.
      def.declaredId = def.id;
    }
    def.slug = currentSlug || def.id;
    def.base = currentBase;
    if (!allowed(def, def.slug)) {
      // Loaded fine, just not for this character: no props, animations, quips, or behaviors.
      skipped.push(def.slug);
      currentRegistered = true;
      return;
    }
    registry.push({ slug: def.slug, def });
    currentRegistered = true;
    apply(def);
  }

  function apply(def) {
    const slug = def.slug;
    if (def.animations) {
      const style = document.createElement('style');
      style.dataset.mod = slug;
      style.textContent = Object.values(def.animations).map((a) => a.css).join('\n');
      document.head.appendChild(style);
    }
    if (def.props) {
      for (const p of def.props) {
        const g = document.getElementById(`props-${p.anchor}`);
        if (!g) continue;
        const wrap = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        wrap.setAttribute('data-mod', slug);
        if (p.id) wrap.setAttribute('id', `prop-${slug}-${p.id}`);
        if (p.hidden) wrap.setAttribute('display', 'none');
        wrap.innerHTML = p.svg || '';
        if (p.image && def.base) {
          // Built here, never from mod-written markup: the file name was checked
          // and can only point into this mod's own assets folder.
          const im = document.createElementNS('http://www.w3.org/2000/svg', 'image');
          im.setAttribute('href', `${def.base}assets/${p.image.file}`);
          for (const k of ['x', 'y', 'width', 'height']) im.setAttribute(k, String(Number(p.image[k])));
          im.setAttribute('preserveAspectRatio', p.image.fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet');
          if (p.image.rotate) im.setAttribute('transform', `rotate(${Number(p.image.rotate)} ${Number(p.image.x) + Number(p.image.width) / 2} ${Number(p.image.y) + Number(p.image.height) / 2})`);
          wrap.appendChild(im);
        }
        g.appendChild(wrap);
      }
    }
  }

  function quips() {
    const out = [];
    for (const { slug, def } of registry) {
      for (const q of def.quips || []) out.push({ text: q.text, tags: q.tags && q.tags.length ? q.tags : ['idle'], weight: q.weight || 1, pack: `mod:${slug}` });
    }
    return out;
  }

  function animations() {
    const out = {};
    for (const { def } of registry) for (const [name, a] of Object.entries(def.animations || {})) out[name] = { durationMs: a.durationMs || 1500 };
    return out;
  }

  function behaviors(trigger) {
    const out = [];
    for (const { slug, def } of registry) for (const b of def.behaviors || []) if (b.trigger === trigger) out.push({ ...b, slug });
    return out;
  }

  // Saved counts, kept in this window's storage (it survives restarts, sleep,
  // and the window being replaced). { slug: { name: n } }
  const COUNT_KEY = 'buddy.counts';
  function readCounts() { try { return JSON.parse(localStorage.getItem(COUNT_KEY) || '{}') || {}; } catch (_) { return {}; } }
  // Add one to a behavior's count. Returns { n, hit }: hit is true when the action should run.
  function bump(slug, count) {
    const all = readCounts();
    const mine = all[slug] && typeof all[slug] === 'object' ? all[slug] : (all[slug] = {});
    const n = Math.min(1e9, (Number(mine[count.name]) || 0) + 1);
    mine[count.name] = n;
    try { localStorage.setItem(COUNT_KEY, JSON.stringify(all)); } catch (_) { /* storage full or blocked: counts just don't persist */ }
    const hit = (count.every ? n % count.every === 0 : false) || (Array.isArray(count.at) && count.at.includes(n));
    return { n, hit };
  }

  function setProp(slug, id, show) {
    const el = document.getElementById(`prop-${slug}-${id}`);
    if (!el) return;
    const visible = el.getAttribute('display') !== 'none';
    const next = show === 'toggle' ? !visible : !!show;
    el.setAttribute('display', next ? 'inline' : 'none');
  }

  // Load each mod script in turn and report success or failure to the main process.
  function loadAll(mods) {
    return mods.reduce((p, mod) => p.then(() => loadOne(mod)), Promise.resolve());
  }

  function loadOne(mod) {
    if (!mod.enabled) return Promise.resolve();
    return new Promise((resolve) => {
      currentSlug = mod.slug;
      currentBase = String(mod.url).split('?')[0].replace(/[^/]*$/, '');
      currentRegistered = false;
      let error = null;
      const onError = (ev) => { error = (ev.error && ev.error.message) || ev.message || 'script error'; };
      window.addEventListener('error', onError);
      const s = document.createElement('script');
      s.src = mod.url;
      s.dataset.mod = mod.slug;
      const done = () => {
        window.removeEventListener('error', onError);
        if (!error && !currentRegistered) error = 'mod loaded but never called BuddyMods.register()';
        const status = { slug: mod.slug, ok: !error, error };
        if (window.buddy) window.buddy.reportMod(status);
        currentSlug = null;
        currentBase = null;
        resolve(status);
      };
      s.onload = () => setTimeout(done, 0);
      s.onerror = () => { error = error || 'failed to load mod.js'; done(); };
      document.body.appendChild(s);
    });
  }

  window.BuddyMods = { register, loadAll, quips, animations, behaviors, setProp, bump, list: () => registry.map((r) => r.slug), skipped: () => skipped.slice() };
})();
