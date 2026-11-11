// Mod loader and the AskinMods API that generated upgrades call.
// A mod is mods/<slug>/mod.js: plain browser JS that calls AskinMods.register({...}).
// See docs/MOD_API.md for the contract this file enforces.
(function () {
  const registry = []; // { slug, def }
  let currentSlug = null;
  let currentRegistered = false;
  const ANCHORS = new Set(['head', 'hand-r', 'hand-l', 'back', 'front']);
  const TRIGGERS = new Set(['idle', 'click', 'dblclick', 'drop', 'hour', 'wake', 'sleep', 'interval', 'donate', 'upgrade', 'lean']);
  const RESERVED_ANIMS = new Set(['idle', 'walk', 'lean', 'sleep', 'drag', 'fall', 'land', 'talk', 'blink', 'face-left', 'face-right']);

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
        if (!p || typeof p.svg !== 'string' || p.svg.length > 20000) fail('each prop needs svg (<=20k chars)');
        if (!ANCHORS.has(p.anchor)) fail(`prop anchor must be one of ${[...ANCHORS].join(', ')}`);
        if (/<script|<foreignObject|on\w+=|href\s*=|url\(/i.test(p.svg)) fail('prop svg may not contain scripts, links, or urls');
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
        const a = b.action;
        if (a.animate !== undefined && typeof a.animate !== 'string') fail('action.animate must be a string');
        if (a.say !== undefined && typeof a.say !== 'string' && !Array.isArray(a.say)) fail('action.say must be a string or array');
        if (a.prop !== undefined && (typeof a.prop !== 'object' || !a.prop.id)) fail('action.prop needs { id, show|toggle }');
      }
    }
    if (def.onTick !== undefined) fail('onTick is not part of the API; use behaviors');
  }

  function register(def) {
    validate(def);
    if (currentSlug && def.id !== currentSlug) {
      // Allow it, but keep the folder slug as the identity for reporting.
      def.declaredId = def.id;
    }
    def.slug = currentSlug || def.id;
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
        wrap.innerHTML = p.svg;
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
      currentRegistered = false;
      let error = null;
      const onError = (ev) => { error = (ev.error && ev.error.message) || ev.message || 'script error'; };
      window.addEventListener('error', onError);
      const s = document.createElement('script');
      s.src = mod.url;
      s.dataset.mod = mod.slug;
      const done = () => {
        window.removeEventListener('error', onError);
        if (!error && !currentRegistered) error = 'mod loaded but never called AskinMods.register()';
        const status = { slug: mod.slug, ok: !error, error };
        if (window.askin) window.askin.reportMod(status);
        currentSlug = null;
        resolve(status);
      };
      s.onload = () => setTimeout(done, 0);
      s.onerror = () => { error = error || 'failed to load mod.js'; done(); };
      document.body.appendChild(s);
    });
  }

  window.AskinMods = { register, loadAll, quips, animations, behaviors, setProp, list: () => registry.map((r) => r.slug) };
})();
