// Character theme: one accent color (character.json "theme": { "accent": "#d92b22" })
// becomes a full palette for the speech bubble, the jar on screen, and the
// app's windows. Without a theme the default ice-blue colors stay.
(function () {
  function hexToHsl(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
  }
  const hsl = (h, s, l, a) => (a == null ? `hsl(${h} ${s}% ${l}%)` : `hsl(${h} ${s}% ${l}% / ${a})`);

  function palette(accent) {
    const c = hexToHsl(accent);
    if (!c) return null;
    const { h } = c;
    const s = Math.max(40, c.s);
    return {
      // overlay (styles.css)
      '--tb-accent': accent,
      '--tb-accent-deep': hsl(h, s, Math.max(25, c.l - 12)),
      '--tb-bubble-bg': hsl(h, 35, 9, 0.95),
      '--tb-bubble-text': hsl(h, 100, 96),
      '--tb-glow': hsl(h, s, 55, 0.55),
      '--tb-glow-strong': hsl(h, s, 60, 0.9),
      '--tb-fill-top': hsl(h, 100, 72),
      '--tb-fill-bottom': accent,
      // windows (ui/jar.css)
      '--bg': hsl(h, 30, 7),
      '--panel': hsl(h, 32, 11),
      '--card': hsl(h, 30, 15),
      '--line': hsl(h, 32, 27),
      '--text': hsl(h, 100, 96),
      '--muted': hsl(h, 35, 74),
      '--accent': accent,
      '--accent2': hsl(h, 100, 72),
    };
  }

  const DEFAULT_KEYS = Object.keys(palette('#3f8fdc'));
  function apply(theme) {
    const root = document.documentElement;
    const p = theme && theme.accent ? palette(theme.accent) : null;
    for (const k of DEFAULT_KEYS) {
      if (p) root.style.setProperty(k, p[k]);
      else root.style.removeProperty(k);
    }
  }

  window.BuddyTheme = { apply, palette };
  // Windows with an API that can report the active character's theme.
  const api = window.jar || window.custom || window.chars;
  if (api && typeof api.theme === 'function') api.theme().then(apply).catch(() => {});
})();
