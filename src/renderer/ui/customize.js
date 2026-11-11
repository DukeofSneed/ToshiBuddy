// Name and quip editor.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const TAG_HELP = {
    idle: 'any time he is just standing around',
    greet: 'on startup',
    click: 'when you click him',
    drag: 'when you pick him up',
    drop: 'when you put him down',
    'drop-hard': 'when you drop him from high up',
    lean: 'leaning on a screen edge',
    wake: 'waking from a nap',
    hour: 'on the hour ({hour} is the hour)',
    trick: 'doing a trick',
    desk: 'at the desk (any)',
    'desk-writing': 'at the desk while you write',
    'desk-lab': 'at the desk during a lab',
    'desk-break': 'after a long desk session',
    slacking: 'when you have been gaming or watching a while',
    'annoyed-1': 'after a few quick clicks',
    'annoyed-2': 'after more clicks',
    'annoyed-3': 'when you keep clicking',
    'ultimate-end': 'when the ultimate form ends',
    upgrade: 'after an upgrade',
    broke: 'when the jar is empty',
    'time:morning': 'only in the morning',
    'time:night': 'only at night',
    'season:winter': 'only in winter',
    'season:summer': 'only in summer',
    // Dialogue-library tags (a skin's quips.json can use these instead)
    time_morning: 'greeting, first time in the morning (once per session)',
    time_afternoon: 'greeting, first time in the afternoon',
    time_evening: 'greeting, first time in the evening',
    time_night: 'greeting, first time at night',
    random: 'any time he is just standing around',
    random_sleepy: 'idle remarks, more often at night',
    repeated_click: 'when you keep clicking him',
    inactivity: 'after about 2.5 minutes with no input (once per stretch)',
    inactivity_long: 'when he wakes up after you were away',
    desk_spawn: 'the desk comes out after sustained typing',
    desk_typing: 'now and then while you keep typing at the desk',
    desk_idle: 'you paused typing for a bit, desk still out',
    desk_despawn: 'the desk goes away after 2 minutes without typing',
    activity_coding: 'at the desk while coding',
    activity_study: 'at the desk during a lab',
    activity_work: 'at the desk while writing',
    activity_reading: 'reading a PDF or e-book for a while',
    activity_break: 'after about 50 minutes at the desk',
    activity_bonsai: 'when you donate or fund a goal in the jar',
    slacking_extended: 'when the slacking keeps going',
    achievement: 'after an upgrade is built',
    milestone: 'when the jar reaches a new level',
    failure: 'when an upgrade fails',
  };

  let state = { name: '', items: [] };
  let editing = null;

  function note(id, text, err) {
    const el = $(id);
    el.textContent = text || '';
    el.classList.toggle('err', !!err);
    if (text && !err) setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 2500);
  }

  async function call(fn, msgId, okText) {
    try {
      const r = await fn();
      if (r && r.error) { note(msgId, r.error, true); return false; }
      if (r && r.state) apply(r.state);
      if (okText) note(msgId, okText);
      return true;
    } catch (e) { note(msgId, e.message, true); return false; }
  }

  function apply(s) {
    state = s;
    document.title = `${s.name}: name and quips`;
    if (document.activeElement !== $('name')) $('name').value = s.name;
    const tags = new Set(Object.keys(TAG_HELP));
    for (const q of s.items) for (const t of q.tags) tags.add(t);
    $('tag-list').innerHTML = [...tags].sort().map((t) => `<option value="${esc(t)}">`).join('');
    render();
  }

  function visible() {
    const f = $('filter').value;
    const term = $('search').value.trim().toLowerCase();
    return state.items.filter((q) => {
      if (f === 'active' && q.removed) return false;
      if (f === 'yours' && q.source !== 'yours') return false;
      if (f === 'edited' && !q.edited) return false;
      if (f === 'removed' && !q.removed) return false;
      if (!term) return true;
      return q.text.toLowerCase().includes(term) || q.tags.some((t) => t.includes(term));
    });
  }

  function render() {
    const active = state.items.filter((q) => !q.removed).length;
    const yours = state.items.filter((q) => q.source === 'yours').length;
    $('count').textContent = `Quips: ${active} active, ${yours} yours`;
    const list = visible();
    if (!list.length) { $('list').innerHTML = '<li class="empty">Nothing matches.</li>'; return; }
    $('list').innerHTML = list.map((q) => {
      const k = esc(q.key);
      if (editing === q.key) {
        return `<li data-key="${k}">
          <textarea class="e-text" maxlength="240" rows="2">${esc(q.text)}</textarea>
          <div class="row">
            <input type="text" class="e-tags" list="tag-list" value="${esc(q.tags.join(', '))}" />
            <button class="small ghost" data-act="cancel">Cancel</button>
            <button class="small" data-act="save">Save</button>
          </div>
          ${q.original ? `<div class="muted small-note">Original: ${esc(q.original)}</div>` : ''}
        </li>`;
      }
      const flags = [q.edited ? '<span class="flag">edited</span>' : '', q.removed ? '<span class="flag">removed</span>' : ''].join(' ');
      const actions = q.removed
        ? '<button class="small" data-act="restore">Restore</button>'
        : `<button class="small ghost" data-act="say" title="Hear it from the pet">Say</button>
           <button class="small ghost" data-act="edit">Edit</button>
           ${q.edited ? '<button class="small ghost" data-act="restore" title="Back to the original text">Undo edit</button>' : ''}
           <button class="small danger" data-act="remove">${q.source === 'yours' ? 'Delete' : 'Remove'}</button>`;
      return `<li data-key="${k}" class="${q.removed ? 'removed' : ''}">
        <div class="q-text">${esc(q.text)}</div>
        <div class="q-meta"><span class="src ${q.source === 'yours' ? 'yours' : ''}">${esc(q.source)}</span>
          ${q.tags.map((t) => `<span class="tag" title="${esc(TAG_HELP[t] || '')}">${esc(t)}</span>`).join('')} ${flags}
          <span class="q-actions">${actions}</span></div>
      </li>`;
    }).join('');
    const ta = document.querySelector('#list .e-text');
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }

  $('list').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const li = btn.closest('li');
    const key = li.dataset.key;
    const q = state.items.find((x) => x.key === key);
    switch (btn.dataset.act) {
      case 'edit': editing = key; render(); break;
      case 'cancel': editing = null; render(); break;
      case 'save': {
        const ok = await call(() => custom.update(key, li.querySelector('.e-text').value, li.querySelector('.e-tags').value), 'add-msg', 'Saved.');
        if (ok) { editing = null; render(); }
        break;
      }
      case 'remove': await call(() => custom.remove(key), 'add-msg', q && q.source === 'yours' ? 'Deleted.' : 'Removed. Find it under "Removed" to bring it back.'); break;
      case 'restore': await call(() => custom.restore(key), 'add-msg', 'Restored.'); break;
      case 'say': custom.say(q.text); break;
      default: break;
    }
  });

  $('save-name').addEventListener('click', () => call(() => custom.setName($('name').value), 'name-msg', 'Name saved.'));
  $('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('save-name').click(); });
  $('new-add').addEventListener('click', async () => {
    const ok = await call(() => custom.add($('new-text').value, $('new-tags').value), 'add-msg', 'Added.');
    if (ok) { $('new-text').value = ''; }
  });
  $('new-text').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || !e.shiftKey)) { e.preventDefault(); $('new-add').click(); } });
  $('new-say').addEventListener('click', () => { if ($('new-text').value.trim()) custom.say($('new-text').value); });
  $('search').addEventListener('input', render);
  $('filter').addEventListener('change', render);
  $('tag-help-list').innerHTML = Object.entries(TAG_HELP).map(([t, d]) => `<li><b>${esc(t)}</b>: ${esc(d)}</li>`).join('');

  custom.onChanged(apply);
  custom.state().then(apply);
  if (location.hash === '#name') setTimeout(() => { $('name').focus(); $('name').select(); }, 50);
})();
