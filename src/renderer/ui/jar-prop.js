// The donation jar as an object on screen, bottom-right of the work area.
// Single click opens the jar panel; double-click donates the quick amount
// (1k tokens by default) through the same path as the panel, so the plan-limit
// guard's ceiling and pledges apply. Right-click opens the usual menu.
(function () {
  const W = 84;
  const MARGIN = 14;
  const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.max(0, Math.round(n))));

  const SVG = `
<svg viewBox="0 0 84 104" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="jar-inside"><path d="M14,30 Q10,34 10,44 L10,88 Q10,98 22,98 L62,98 Q74,98 74,88 L74,44 Q74,34 70,30 Z"/></clipPath>
    <linearGradient id="jar-glass" x1="0" x2="1">
      <stop offset="0" stop-color="#dff4ff" stop-opacity="0.55"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0.15"/>
      <stop offset="1" stop-color="#bfe3ff" stop-opacity="0.5"/>
    </linearGradient>
    <linearGradient id="jar-tokens" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9fe0ff"/>
      <stop offset="1" stop-color="#3f8fdc"/>
    </linearGradient>
  </defs>
  <ellipse cx="42" cy="100" rx="30" ry="3.5" fill="rgba(0,0,0,0.28)"/>
  <g clip-path="url(#jar-inside)">
    <rect id="jar-fill" x="8" y="98" width="68" height="0" fill="url(#jar-tokens)"/>
    <g id="jar-coins" fill="#e9f8ff" stroke="#3f8fdc" stroke-width="0.8">
      <circle cx="24" cy="92" r="4"/><circle cx="38" cy="94" r="4"/><circle cx="54" cy="91" r="4"/><circle cx="64" cy="94" r="4"/>
    </g>
  </g>
  <path d="M14,30 Q10,34 10,44 L10,88 Q10,98 22,98 L62,98 Q74,98 74,88 L74,44 Q74,34 70,30 Z" fill="url(#jar-glass)" stroke="#1f2a40" stroke-width="1.8"/>
  <path d="M18,40 Q16,60 18,84" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
  <rect x="16" y="20" width="52" height="11" rx="3" fill="#33508e" stroke="#1f2a40" stroke-width="1.6"/>
  <rect x="34" y="16" width="16" height="5" rx="1.5" fill="#1f2a40"/>
  <rect id="jar-label-bg" x="22" y="56" width="40" height="15" rx="4" fill="#0d1626" opacity="0.82"/>
  <text id="jar-label" x="42" y="67" text-anchor="middle" font-size="10" font-weight="700" fill="#eaf6ff" font-family="Segoe UI, sans-serif">0</text>
</svg>`;

  let el = null;
  let state = { balance: 0, progress: 0, quick: 1000, show: true };
  let clickTimer = null;

  function render() {
    if (!el) return;
    el.classList.toggle('hidden', state.show === false);
    if (window.BuddyApp) BuddyApp.jarZone = state.show === false ? 0 : W + MARGIN + 6;
    const pct = Math.max(0.04, Math.min(1, state.progress || 0));
    const h = Math.round(64 * pct);
    const fill = el.querySelector('#jar-fill');
    fill.setAttribute('y', String(98 - h));
    fill.setAttribute('height', String(h));
    el.querySelector('#jar-coins').setAttribute('transform', `translate(0 ${-Math.max(0, h - 10)})`);
    el.querySelector('#jar-label').textContent = fmt(state.balance);
    el.title = `Jar: ${Math.round(state.balance).toLocaleString()} tokens. Click to open, double-click to donate ${fmt(state.quick)}.`;
  }

  function floatText(text) {
    const f = document.createElement('div');
    f.className = 'jar-float';
    f.textContent = text;
    el.appendChild(f);
    setTimeout(() => f.remove(), 1400);
  }

  async function quickDonate() {
    el.classList.remove('jar-bump');
    void el.offsetWidth;
    el.classList.add('jar-bump');
    try {
      const r = await buddy.quickDonate();
      if (r && r.accepted) floatText(`+${fmt(r.accepted)}`);
      else if (r && r.pledged) floatText('pledged');
    } catch (e) { buddy.log(`quick donate failed: ${e.message}`); }
  }

  function mount(initial) {
    el = document.createElement('div');
    el.id = 'jar-prop';
    el.innerHTML = SVG;
    document.getElementById('stage').appendChild(el);
    el.addEventListener('click', () => {
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => buddy.openJar(), 260);
    });
    el.addEventListener('dblclick', (e) => {
      e.preventDefault();
      clearTimeout(clickTimer);
      quickDonate();
    });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); buddy.popupMenu(e.screenX, e.screenY); });
    update(initial || {});
  }

  function update(s) {
    state = { ...state, ...(s || {}) };
    render();
  }

  window.BuddyJarProp = { mount, update, width: W, margin: MARGIN };
})();
