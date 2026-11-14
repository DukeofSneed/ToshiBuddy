// Characters window: quick import, pack import, and the animation mapper.
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const IMG = /\.(png|webp|gif|jpe?g)$/i;

  const HELP = {
    idle: 'standing around', blink: 'a quick blink while idle', walk: 'walking (frames should face right, or tick Flip)',
    talk: 'while a speech bubble is up', sleep: 'napping (use Loop from the last frame to stay asleep)', drag: 'picked up by the mouse',
    fall: 'falling after being dropped', land: 'landing', lean: 'leaning on a screen edge', desk: 'at the desk',
    working: 'while an upgrade runs', scribbling: 'writing at the desk', think: 'thinking ("?")', surprised: 'surprised ("!")',
    huff: 'annoyed (repeated clicks)', shrug: 'shrugging', wave: 'waving', frost: 'double-click trick',
    release: 'the donation transformation', stamp: 'stamping a form at the desk',
  };

  function note(id, text, err) {
    const el = $(id);
    el.textContent = text || '';
    el.classList.toggle('err', !!err);
  }

  // ---- tabs ----
  function showTab(name) {
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    $('tab-choose').classList.toggle('hidden', name !== 'choose');
    $('tab-import').classList.toggle('hidden', name !== 'import');
    $('tab-edit').classList.toggle('hidden', name !== 'edit');
    if (name === 'edit') loadCharacters();
    if (name === 'choose') loadChooser();
  }
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  const tabFor = (hash) => (['edit', 'choose'].includes(String(hash).replace('#', '')) ? String(hash).replace('#', '') : 'import');
  chars.onGoto((hash) => showTab(tabFor(hash)));

  // ---- choose your buddy (first run, or any time) ----
  async function loadChooser() {
    const r = await chars.list();
    const list = r.characters.filter((c) => !c.test).concat(r.characters.filter((c) => c.test));
    $('choose-list').innerHTML = list.map((c) => `
      <button class="buddy ${c.id === r.active ? 'active' : ''}" data-id="${esc(c.id)}">
        <div class="pic ${c.cover && c.cover.kind === 'sheet' ? 'sheet' : ''}" data-cover="${c.cover ? esc(c.cover.url) : ''}"></div>
        <div class="nm">${esc(c.name)}</div>
        ${c.test ? '<span class="tag">test character</span>' : ''}
        <div class="ps">${esc(c.personality || '')}</div>
      </button>`).join('');
    // Set through the DOM: the page's security policy blocks inline style attributes.
    document.querySelectorAll('#choose-list .pic').forEach((p) => {
      if (p.dataset.cover) p.style.backgroundImage = 'url("' + p.dataset.cover.replace(/"/g, '%22') + '")';
    });
  }
  $('choose-list').addEventListener('click', async (e) => {
    const b = e.target.closest('.buddy');
    if (!b) return;
    const r = await chars.choose(b.dataset.id);
    if (r.error) { note('choose-msg', r.error, true); return; }
    note('choose-msg', 'Done. Your buddy is on the desktop now.');
    loadChooser();
  });

  // ---- quick import ----
  const chosen = {};
  function setSlot(slot, file) {
    chosen[slot] = file;
    const row = document.querySelector(`.file[data-slot="${slot}"]`);
    row.classList.toggle('set', !!file);
    row.querySelector('.val').textContent = file ? base(file) : 'none';
    if (slot === 'sheet' && file && !$('imp-name').value) {
      $('imp-name').value = base(file).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/sprite ?sheet|spritesheet|sheet/ig, '').trim().slice(0, 40);
    }
  }
  document.querySelectorAll('.file button[data-pick]').forEach((btn) => btn.addEventListener('click', async () => {
    const slot = btn.closest('.file').dataset.slot;
    const p = await chars.pick(btn.dataset.pick);
    if (p) setSlot(slot, p);
  }));
  // Dropped files go to the first fitting empty slot (or by name: "ultimate", "quips").
  function placeDropped(paths) {
    for (const p of paths) {
      const n = base(p).toLowerCase();
      if (/\.(json|txt)$/.test(n)) { setSlot('quips', p); continue; }
      if (!IMG.test(n)) continue;
      const ult = /ult/.test(n);
      const sheet = /sheet|sprite/.test(n);
      const order = ult ? (sheet ? ['ultimate-sheet', 'ultimate'] : ['ultimate', 'ultimate-sheet'])
        : (sheet ? ['sheet', 'skin'] : ['sheet', 'skin', 'ultimate-sheet', 'ultimate']);
      const slot = order.find((s) => !chosen[s]) || order[0];
      setSlot(slot, p);
    }
  }
  function dropZone(el, onPaths) {
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag');
      const paths = [...e.dataTransfer.files].map((f) => chars.pathFor(f)).filter(Boolean);
      if (paths.length) onPaths(paths);
    });
  }
  dropZone($('drop-files'), placeDropped);
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => e.preventDefault());

  $('imp-go').addEventListener('click', async () => {
    note('imp-msg', 'Importing…');
    $('imp-go').disabled = true;
    try {
      const r = await chars.importFiles({
        name: $('imp-name').value,
        personality: $('imp-personality').value,
        scale: Number($('imp-scale').value) || 1,
        files: { ...chosen },
      });
      if (r.error) { note('imp-msg', r.error, true); return; }
      note('imp-msg', 'Imported. He is on screen now; next, choose his animations.');
      for (const k of Object.keys(chosen)) setSlot(k, null);
      $('imp-name').value = ''; $('imp-personality').value = '';
      openEditor(r.id);
    } finally { $('imp-go').disabled = false; }
  });

  // ---- pack import ----
  async function importPack(source) {
    if (!source) return;
    note('pack-msg', 'Importing pack…');
    const r = await chars.importPack(source);
    if (r.error) { note('pack-msg', r.error, true); return; }
    note('pack-msg', `Imported "${r.id}".`);
    openEditor(r.id);
  }
  $('pack-zip').addEventListener('click', async () => importPack(await chars.pick('zip')));
  $('pack-folder').addEventListener('click', async () => importPack(await chars.pick('folder')));
  dropZone($('drop-pack'), (paths) => importPack(paths[0]));

  // ---- animation mapper ----
  let current = null; // details for the selected character
  let kind = 'sheet';

  async function loadCharacters(selectId) {
    const r = await chars.list();
    const sel = $('ed-char');
    sel.innerHTML = r.characters.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}${c.test ? ' (test)' : ''}</option>`).join('');
    sel.value = selectId || (current && current.id) || r.active;
    await loadDetails(sel.value);
  }

  async function loadDetails(id, { waitForPreview = false } = {}) {
    let d = await chars.details(id);
    // A freshly imported sheet is sliced by the pet window; wait for its preview.
    for (let i = 0; waitForPreview && i < 20 && !d.error && d.hasSheet && !(d.sheet.rows && d.sheet.preview); i++) {
      note('ed-msg', 'Slicing the sprite sheet…');
      await new Promise((r) => setTimeout(r, 500));
      d = await chars.details(id);
    }
    if (d.error) { note('ed-msg', d.error, true); return; }
    current = d;
    edited = {};
    renderCheck(null);
    note('ed-msg', d.builtin ? 'The built-in test character is drawn in code, so it has no sheet to map.' : '');
    $('ed-body').classList.toggle('hidden', !!d.builtin);
    $('ed-personality').value = d.personality || '';
    $('ed-kind').querySelector('option[value="ultimateSheet"]').disabled = !d.hasUltimateSheet;
    if (kind === 'ultimateSheet' && !d.hasUltimateSheet) kind = 'sheet';
    $('ed-kind').value = kind;
    renderSheet();
  }

  function renderSheet() {
    const s = current[kind];
    const has = kind === 'sheet' ? current.hasSheet : current.hasUltimateSheet;
    $('ed-sheet-card').classList.toggle('hidden', !has && kind === 'sheet' && !current.hasSheet);
    $('ed-rows').textContent = s.rows ? `Found ${s.rows.reduce((a, b) => a + b, 0)} poses in ${s.rows.length} rows: ${s.rows.map((n, i) => `row ${i} has ${n}`).join(', ')}.` : 'Poses appear here once he is the active character (use "Use this character").';
    const img = $('ed-preview');
    if (s.preview) img.src = s.preview; else img.removeAttribute('src');
    $('ed-scale').value = s.scale || 1;
    renderMoves();
    $('ed-template').innerHTML = '<option value="">Best match</option>' + (s.templates || []).map((t) => `<option value="${esc(t.id)}">Like ${esc(t.name)}</option>`).join('');
    $('ed-anims').innerHTML = current.animKeys.map((k) => {
      const a = s.animations[k] || {};
      const frames = a.frames != null ? a.frames : (a.row != null ? `${a.row}:0-99` : '');
      return `<tr data-key="${k}">
        <td>${k}<small>${esc(HELP[k] || '')}</small></td>
        <td><input type="text" class="f" value="${esc(frames)}" placeholder="${k === 'idle' ? '0:0-3' : ''}" /></td>
        <td><input type="number" class="fps" min="0.2" max="30" step="0.5" value="${a.fps != null ? a.fps : ''}" placeholder="6" /></td>
        <td><select class="flip">${[['', 'No'], ['body', 'Figure'], ['all', 'Everything']].map(([v, l]) => `<option value="${v}" ${v === mirrorOf(a) ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
        <td><select class="marks"><option value="">Readable</option><option value="turn" ${a.marksTurn ? 'selected' : ''}>Turn</option></select></td>
        <td><input type="checkbox" class="loop" ${a.loop === false ? '' : 'checked'} /></td>
      </tr>`;
    }).join('');
  }

  // One mirror mode per animation: the figure only (marks stay readable) or everything.
  const mirrorOf = (a) => (a.flipBody ? 'body' : a.flip ? 'all' : '');

  function renderCheck(r) {
    const mark = { ok: '\u2713', info: '\u00b7', warn: '!', error: '\u2715' };
    const head = !r ? '' : r.ok ? (r.warnings ? `Works, with ${r.warnings} thing${r.warnings === 1 ? '' : 's'} to look at` : 'Everything checks out') : `${r.errors} problem${r.errors === 1 ? '' : 's'} to fix`;
    $('ed-check-list').innerHTML = !r ? '' : [`<li class="${r.ok ? (r.warnings ? 'warn' : 'ok') : 'error'}"><b>${head}</b></li>`]
      .concat(r.items.map((i) => `<li class="${i.level}"><span>${mark[i.level] || ''}</span> ${esc(i.text)}${i.pair ? ` <button class="x add" data-fine="${esc(i.pair.kind)}|${esc(i.pair.from)}|${esc(i.pair.near)}" title="I looked: the mark is on the right pose">It's fine</button>` : ''}</li>`)).join('');
  }

  // Marks moved from one pose to the one they belong to.
  function renderMoves() {
    const list = (current && current[kind] && current[kind].moveMarks) || [];
    $('mm-list').innerHTML = list.map((p, i) => `<span class="attach">${esc(p[0])} → ${esc(p[1])}<button class="x" data-unmove="${i}" title="Remove">✕</button></span>`).join('') || '<span class="muted small-note">None.</span>';
  }

  function collect() {
    const existing = current[kind].animations || {};
    const anims = {};
    document.querySelectorAll('#ed-anims tr').forEach((tr) => {
      const k = tr.dataset.key;
      const frames = tr.querySelector('.f').value.replace(/\s+/g, '');
      if (!frames) return;
      const a = { ...(existing[k] || {}), frames };
      delete a.row;
      const fps = Number(tr.querySelector('.fps').value);
      if (fps > 0) a.fps = fps; else delete a.fps;
      const mirror = tr.querySelector('.flip').value;
      delete a.flip; delete a.flipBody;
      if (mirror === 'body') a.flipBody = true; else if (mirror === 'all') a.flip = true;
      if (tr.querySelector('.marks').value === 'turn') a.marksTurn = true; else delete a.marksTurn;
      if (!tr.querySelector('.loop').checked) a.loop = false; else delete a.loop;
      anims[k] = a;
    });
    // Keep mod animations mapped by hand in character.json.
    for (const [k, v] of Object.entries(existing)) if (k.startsWith('anim-')) anims[k] = v;
    return anims;
  }

  function openEditor(id) {
    showTab('edit');
    setTimeout(() => loadCharacters(id).then(() => loadDetails(id, { waitForPreview: true })), 300);
  }

  $('ed-char').addEventListener('change', (e) => loadDetails(e.target.value));
  // Switching sheets keeps what was typed on the other one until Save.
  let edited = {};
  const stash = () => { if (current && current[kind]) { current[kind].animations = collect(); current[kind].scale = Number($('ed-scale').value) || 1; edited[kind] = true; } };
  $('ed-kind').addEventListener('change', (e) => { stash(); kind = e.target.value; renderSheet(); });
  $('ed-use').addEventListener('click', async () => {
    const r = await chars.switchTo($('ed-char').value);
    if (r.error) { note('ed-msg', r.error, true); return; }
    note('ed-msg', 'Switched.');
    loadDetails($('ed-char').value, { waitForPreview: true });
  });
  $('mm-add').addEventListener('click', () => {
    if (!current) return;
    const cell = /^\d{1,2}:\d{1,2}$/;
    const from = $('mm-from').value.trim(), to = $('mm-to').value.trim();
    if (!cell.test(from) || !cell.test(to) || from === to) { note('ed-msg', 'Use pose numbers like 3:4 and 3:3 (row:pose), and two different poses.', true); return; }
    stash();
    const list = current[kind].moveMarks || [];
    if (!list.some((p) => p[0] === from && p[1] === to)) current[kind].moveMarks = [...list, [from, to]];
    $('mm-from').value = ''; $('mm-to').value = '';
    renderMoves();
    note('ed-msg', 'Added. Press "Save and reload" to apply it.');
  });
  $('mm-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-unmove]');
    if (!b || !current) return;
    stash();
    current[kind].moveMarks = (current[kind].moveMarks || []).filter((_p, i) => i !== Number(b.dataset.unmove));
    renderMoves();
    note('ed-msg', 'Removed. Press "Save and reload" to apply it.');
  });
  $('ed-automap').addEventListener('click', async () => {
    if (!current) return;
    const r = await chars.autoMap(current.id, kind, $('ed-template').value || null);
    if (r.error) { note('ed-msg', r.error, true); return; }
    if (!Object.keys(r.animations).length) { note('ed-msg', 'Nothing could be mapped on this sheet.', true); return; }
    const mods = Object.fromEntries(Object.entries(current[kind].animations || {}).filter(([k]) => k.startsWith('anim-')));
    current[kind].animations = { ...r.animations, ...mods };
    edited[kind] = true;
    renderSheet();
    note('ed-msg', r.guessed ? 'Guessed idle, walk and talk. Adjust the frames, then Save.' : `Filled in from ${r.sourceName}'s layout. Check the frames, then Save.`);
  });
  async function runCheck() {
    if (!current) return;
    stash();
    const draft = {};
    for (const k of Object.keys(edited)) draft[k] = { animations: current[k].animations, marksOk: current[k].marksOk || [], moveMarks: current[k].moveMarks || [] };
    const r = await chars.check(current.id, draft);
    if (r.error) { note('ed-msg', r.error, true); return; }
    renderCheck(r);
  }
  $('ed-check').addEventListener('click', runCheck);
  // "It's fine": this mark is on the right pose; don't mention it again.
  $('ed-check-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fine]');
    if (!b || !current) return;
    const [k, from, near] = b.dataset.fine.split('|');
    if (!current[k]) return;
    stash();
    current[k].marksOk = [...(current[k].marksOk || []), [from, near]];
    edited[k] = true;
    note('ed-msg', 'Noted. Press "Save and reload" to keep it.');
    runCheck();
  });
  $('ed-preview-all').addEventListener('click', async () => {
    if (!current) return;
    note('ed-msg', 'Playing each saved animation on the pet…');
    const r = await chars.preview(current.id);
    note('ed-msg', r.error ? r.error : `Played ${r.played.length} animations, each facing right and then left.`, !!r.error);
  });
  $('ed-export').addEventListener('click', async () => {
    const r = await chars.exportPack($('ed-char').value);
    if (r.error) note('ed-msg', r.error, true);
    else if (!r.canceled) note('ed-msg', `Exported to ${r.file}`);
  });
  $('ed-save').addEventListener('click', async () => {
    if (!current) return;
    const patch = { personality: $('ed-personality').value };
    stash();
    for (const k of Object.keys(edited)) patch[k] = { animations: current[k].animations, scale: current[k].scale, moveMarks: current[k].moveMarks || [], marksOk: current[k].marksOk || [] };
    edited = {};
    const r = await chars.save(current.id, patch);
    if (r.error) { note('ed-msg', r.error, true); return; }
    note('ed-msg', 'Saved. The pet reloads with the new animations.');
    setTimeout(() => loadDetails(current.id), 1500);
  });

  showTab(tabFor(location.hash));
})();
