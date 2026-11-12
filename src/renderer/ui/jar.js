// Jar panel UI. All state comes from the main process via window.jar.
(function () {
  const $ = (id) => document.getElementById(id);
  let S = null;

  const fmt = (n) => {
    n = Math.round(n || 0);
    const sign = n < 0 ? '-' : '';
    n = Math.abs(n);
    if (n >= 1e6) return sign + (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
    if (n >= 1e3) return sign + (n / 1e3).toFixed(1).replace(/\.?0+$/, '') + 'k';
    return sign + String(n);
  };
  const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const time = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  function render(state) {
    if (window.BuddyTheme) BuddyTheme.apply(state.theme);
    S = state;
    const L = state.ledger;
    const G = state.guard;

    $('balance').textContent = fmt(L.balance);
    $('balance').style.color = L.balance < 0 ? 'var(--bad)' : '';
    $('pledged').textContent = L.pledged ? `· ${fmt(L.pledged)} pledged, waiting for plan room` : '';
    $('jar-fill').style.height = `${Math.max(0, Math.min(100, (L.balance / 200000) * 100))}%`;
    const lv = L.level;
    $('level-title').textContent = `L${lv.level} ${lv.title}`;
    $('xp-fill').style.width = `${Math.round(lv.progress * 100)}%`;
    $('xp-text').textContent = lv.next ? `${fmt(lv.xp)} / ${fmt(lv.next.xp)} XP` : `${fmt(lv.xp)} XP · max`;

    // Guard
    const u = G.utilization;
    $('usage-cap').style.left = `${G.maxUtilization}%`;
    if (u === null || u === undefined) {
      $('usage-fill').style.width = '0%';
      const g = L.guard || {};
      $('guard-text').textContent = g.lastProbeNoEvent
        ? `The last probe returned no usage reading (${g.lastProbeDetail || 'no detail'}). Turn on the /usage fallback in Settings, or make sure Claude Code is logged in with your subscription.`
        : 'Usage unknown. Check it before donating or building.';
    } else {
      $('usage-fill').style.width = `${Math.min(100, u)}%`;
      $('usage-fill').style.background = u >= G.maxUtilization ? 'var(--bad)' : u >= G.maxUtilization - 15 ? 'var(--warn)' : 'var(--good)';
      const parts = [`Plan window ${u.toFixed(0)}% used (cap ${G.maxUtilization}%)`];
      if (G.windows && G.windows.five_hour && G.windows.seven_day) parts[0] = `5-hour ${G.windows.five_hour.utilization.toFixed(0)}% · weekly ${G.windows.seven_day.utilization.toFixed(0)}% (cap ${G.maxUtilization}%)`;
      if (G.resetsAt) parts.push(`resets ${time(G.resetsAt)}`);
      if (G.at) parts.push(`checked ${time(G.at)}${G.fresh ? '' : ' (stale)'}`);
      if (G.frozenUntil) parts.push(`FROZEN until ${time(G.frozenUntil)}`);
      if (G.calibrated) parts.push(`~${fmt(G.tokensPerPercent)} tokens per 1%`);
      $('guard-text').textContent = parts.join(' · ');
    }
    $('overage-warning').classList.toggle('hidden', !G.overageEnabled);
    $('claude-missing').classList.toggle('hidden', !!state.claudeInstalled);
    $('max-safe').textContent = fmt(G.maxSafeDonation);

    // Goals
    const goals = L.goals || [];
    $('goals').innerHTML = goals.length ? goals.map(goalHtml).join('') : '<div class="muted">No goals. Suggest something.</div>';
    const charName = state.settings.characterName || 'Kori';
    $('jar-title').textContent = `${charName}'s Donation Jar`;
    document.title = `${charName}'s Jar`;
    document.querySelectorAll('.char-name').forEach((el) => { el.textContent = charName; });
    $('auto-build').checked = !!state.settings.autoBuild;

    // Upgrades
    const ups = L.upgrades || [];
    $('upgrades').innerHTML = ups.length
      ? ups.map((up) => `<div class="upgrade ${up.reverted ? 'reverted' : ''}"><div><div class="t">${esc(up.title)}</div><div class="muted" style="font-size:11px">${fmt(up.tokens)} tokens · ${esc(up.model)} · ${new Date(up.at).toLocaleDateString()}</div></div>${up.reverted ? '<span class="muted">undone</span>' : `<button class="small ghost" data-undo="${up.id}">Undo</button>`}</div>`).join('')
      : 'None yet.';

    // Settings
    $('maxutil').value = state.settings.maxUtilization;
    $('maxutil-val').textContent = state.settings.maxUtilization;
    $('endpoint-fallback').checked = !!state.settings.allowUsageEndpointFallback;
    $('upgrade-model').value = state.settings.upgradeModel || 'haiku';
    const sfxOn = state.settings.sfx !== false;
    const vol = Math.round((state.settings.sfxVolume ?? 0.5) * 100);
    $('sfx-on').checked = sfxOn;
    $('sfx-vol').value = vol;
    $('sfx-vol-val').textContent = vol;
    $('voice-muted').checked = !!state.settings.muted;
    $('desk-mode').checked = state.settings.deskMode !== false;
    $('jar-prop-show').checked = state.settings.showJarProp !== false;
    $('quick-donate').value = String(state.settings.quickDonateTokens || 1000);
    const skinSel = $('skin');
    const chars = state.characters || [];
    const sig = chars.map((c) => `${c.id}=${c.name}`).join('|');
    if (skinSel.dataset.sig !== sig) {
      skinSel.dataset.sig = sig;
      skinSel.innerHTML = chars.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}${c.test ? ' (test)' : ''}</option>`).join('');
    }
    skinSel.value = state.activeCharacter || '';
    BuddySfx.setEnabled(sfxOn);
    BuddySfx.setVolume(vol / 100);

    $('log').textContent = (state.log || []).join('\n');
  }

  function goalHtml(g) {
    const avail = Math.max(0, g.funded - g.spent);
    const target = ['paused', 'failed'].includes(g.status) && g.needTokens ? g.needTokens : g.goalTokens;
    const shown = ['paused', 'failed'].includes(g.status) ? avail : g.funded;
    const pct = Math.min(100, Math.round((shown / Math.max(1, target)) * 100));
    const busy = S.busy;
    let actions = '';
    if (g.touchesCore) {
      actions = `<span class="muted">Needs core changes; mods can't do this yet.</span><button class="small ghost" data-remove="${g.id}">Remove</button>`;
    } else if (g.status === 'done') {
      actions = `<span class="muted">Built.</span>`;
    } else if (g.status === 'building') {
      actions = `<button class="small danger" data-cancel="1">Stop run</button>`;
    } else {
      actions = `<input type="number" min="1000" step="1000" placeholder="tokens" data-amt-for="${g.id}" />
        <button class="small ghost" data-fund="${g.id}" title="Move tokens from the jar balance">Fund from jar</button>
        <button class="small ghost" data-donate-goal="${g.id}" title="Donate new tokens straight into this goal">Donate</button>`;
      if (g.status === 'funded') actions += `<button class="small" data-build="${g.id}" ${busy ? 'disabled' : ''}>${g.sessionId ? 'Resume build' : 'Build it'}</button>`;
      actions += `<button class="small ghost" data-remove="${g.id}" title="Remove; unspent tokens go back to the jar">✕</button>`;
    }
    return `<div class="goal ${g.status}">
      <div class="head"><div class="title">${esc(g.title)}</div><span class="badge ${g.status}">${g.status}${g.size ? ' · ' + g.size : ''}</span></div>
      <div class="summary">${esc(g.summary)}</div>
      <div class="bar"><div style="width:${pct}%"></div></div>
      <div class="meta"><span>${fmt(shown)} / ${fmt(target)} tokens${['paused', 'failed'].includes(g.status) ? ' to continue' : ''}</span><span>${g.spent ? `spent ${fmt(g.spent)}` : g.source === 'catalog' ? 'catalog idea' : 'your idea'}</span></div>
      ${g.note ? `<div class="note">${esc(g.note)}</div>` : ''}
      <div class="actions">${actions}</div>
    </div>`;
  }

  async function act(p) { const r = await p; if (r && r.state) render(r.state); return r; }

  // ---- events ----
  $('close').onclick = () => jar.close();
  $('check-usage').onclick = async () => {
    $('check-usage').disabled = true;
    $('check-usage').textContent = 'Checking…';
    try { render(await jar.checkUsage()); } finally { $('check-usage').disabled = false; $('check-usage').textContent = 'Check plan usage'; }
  };
  $('donate-btn').onclick = async () => {
    const amt = Number($('donate-amount').value);
    if (!(amt > 0)) { $('donate-msg').textContent = 'Enter a token amount.'; return; }
    const r = await act(jar.donate(amt));
    $('donate-msg').textContent = r.pledged
      ? `Took ${fmt(r.accepted)} now (max safe was ${fmt(r.ceiling)}). ${fmt(r.pledged)} pledged for when your plan has room.`
      : `Donated ${fmt(r.accepted)} tokens.`;
    $('donate-amount').value = '';
  };
  document.querySelectorAll('.chip').forEach((c) => {
    c.onclick = () => { $('donate-amount').value = c.dataset.amt === 'max' ? Math.max(0, S ? S.guard.maxSafeDonation : 0) : c.dataset.amt; };
  });
  $('suggest-btn').onclick = async () => {
    const text = $('suggest-text').value.trim();
    if (!text) return;
    $('suggest-btn').disabled = true;
    $('suggest-msg').textContent = 'Pricing it…';
    try {
      const r = await act(jar.suggest(text));
      $('suggest-msg').textContent = r.ok
        ? (r.infeasible ? `Not doable as a mod: ${r.goal.risk || 'needs core changes'}` : `Priced at ${fmt(r.goal.goalTokens)} tokens (${r.goal.size}). Goal added below.`)
        : `Couldn't price it: ${r.error}`;
      if (r.ok) $('suggest-text').value = '';
    } finally { $('suggest-btn').disabled = false; }
  };
  $('suggest-text').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('suggest-btn').click(); });
  $('auto-build').onchange = (e) => act(jar.updateSettings({ autoBuild: e.target.checked }).then((s) => ({ state: s })));
  $('maxutil').oninput = (e) => { $('maxutil-val').textContent = e.target.value; };
  $('maxutil').onchange = (e) => jar.updateSettings({ maxUtilization: Number(e.target.value) }).then(render);
  $('endpoint-fallback').onchange = (e) => jar.updateSettings({ allowUsageEndpointFallback: e.target.checked }).then(render);
  $('upgrade-model').onchange = (e) => jar.updateSettings({ upgradeModel: e.target.value }).then(render);
  $('sfx-on').onchange = (e) => jar.updateSettings({ sfx: e.target.checked }).then(render);
  $('sfx-vol').oninput = (e) => { $('sfx-vol-val').textContent = e.target.value; BuddySfx.setVolume(e.target.value / 100); };
  $('sfx-vol').onchange = (e) => jar.updateSettings({ sfxVolume: Number(e.target.value) / 100 }).then((s) => { render(s); BuddySfx.play('tick'); });
  $('voice-muted').onchange = (e) => jar.updateSettings({ muted: e.target.checked }).then(render);
  $('desk-mode').onchange = (e) => jar.updateSettings({ deskMode: e.target.checked }).then(render);
  $('jar-prop-show').onchange = (e) => jar.updateSettings({ showJarProp: e.target.checked }).then(render);
  $('quick-donate').onchange = (e) => jar.updateSettings({ quickDonateTokens: Number(e.target.value) }).then(render);
  $('skin').onchange = (e) => jar.updateSettings({ character: e.target.value }).then(render);
  // Soft tick on every jar button.
  document.addEventListener('click', (e) => { if (e.target.closest('button')) BuddySfx.play('tick'); }, true);

  $('goals').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const amtFor = (id) => Number((document.querySelector(`[data-amt-for="${id}"]`) || {}).value) || 0;
    if (b.dataset.fund) await act(jar.fund(b.dataset.fund, amtFor(b.dataset.fund) || (S ? S.ledger.balance : 0)));
    else if (b.dataset.donateGoal) {
      const amt = amtFor(b.dataset.donateGoal);
      if (!amt) return;
      const r = await act(jar.donate(amt, b.dataset.donateGoal));
      if (r.pledged) $('donate-msg').textContent = `Took ${fmt(r.accepted)} into the goal; ${fmt(r.pledged)} pledged for later.`;
    } else if (b.dataset.build) {
      b.disabled = true;
      const g = S.ledger.goals.find((x) => x.id === b.dataset.build);
      act(g && g.sessionId ? jar.resume(b.dataset.build) : jar.build(b.dataset.build));
    } else if (b.dataset.remove) await act(jar.removeGoal(b.dataset.remove));
    else if (b.dataset.cancel) render(await jar.cancelRun());
  });
  $('upgrades').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-undo]');
    if (b) { b.disabled = true; await act(jar.undo(b.dataset.undo)); }
  });

  jar.on('jar:changed', render);
  jar.on('jar:run-log', (line) => {
    const pre = $('log');
    pre.textContent += (pre.textContent ? '\n' : '') + line;
    pre.scrollTop = pre.scrollHeight;
  });
  jar.state().then(render);
})();
