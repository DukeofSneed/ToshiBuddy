'use strict';
// Self-test (TOSHI_SELFTEST=<dir>: captures the windows and pet states, writes
// reports, then quits) and the pose demo (--demo-poses). Development tools:
// main.js loads this file only when one of them is asked for.
const fs = require('fs');
const path = require('path');

function runSelftest(ctx, selftestDir) {
  const { app, screen, ledger, guard, logLines, charName, buildMenu, openCustomize, openImport, overlay, jarWin } = ctx;
  // A window that hasn't drawn yet can make capturePage wait forever; give up
  // after 10 s with an empty image so the test always finishes.
  const { nativeImage } = require('electron');
  const capture = (win, rect) => new Promise((resolve) => {
    const timer = setTimeout(() => { ctx.log('selftest: a window capture timed out'); resolve(nativeImage.createEmpty()); }, 10000);
    win.webContents.capturePage(rect).then((img) => { clearTimeout(timer); resolve(img); }, () => { clearTimeout(timer); resolve(nativeImage.createEmpty()); });
  });
  fs.mkdirSync(selftestDir, { recursive: true });
  setTimeout(async () => {
    try {
      jarWin.showInactive();
      await new Promise((r) => setTimeout(r, 1500));
      const wa = screen.getPrimaryDisplay().workArea;
      const ov = await capture(overlay, { x: 0, y: wa.height - 420, width: wa.width, height: 420 });
      fs.writeFileSync(path.join(selftestDir, 'overlay.png'), ov.toPNG());
      // Plain close-up at 3x: freeze him in idle with no bubble.
      const pos = JSON.parse(await overlay.webContents.executeJavaScript(`BuddyBrain.setPaused(true); BuddyBubble.hide(); BuddyVoice.stop(); const p=document.getElementById('pet'); const keep=['skin','has-ultimate','sheet','ultimate-sheet'].filter(c=>p.classList.contains(c)); p.className=['idle','face-right',...keep].join(' '); document.querySelectorAll('#pet *').forEach(e=>e.style.animationPlayState='paused'); JSON.stringify({x: BuddyBrain.state.x, y: BuddyBrain.state.y})`));
      await new Promise((r) => setTimeout(r, 400));
      // A blink may still be in flight; wait it out.
      await overlay.webContents.executeJavaScript(`document.getElementById('pet').classList.remove('blink'); 1`);
      await new Promise((r) => setTimeout(r, 200));
      if (process.env.TOSHI_SELFTEST_PROPS) {
        // Show every hidden mod prop and the anchor markers for this capture.
        await overlay.webContents.executeJavaScript(`document.querySelectorAll('[data-mod]').forEach(g => g.setAttribute('display','inline')); document.getElementById('pet').classList.add('show-anchors'); 1`);
        await new Promise((r) => setTimeout(r, 200));
      }
      const plain = await capture(overlay, { x: Math.max(0, Math.round(pos.x)), y: Math.max(0, Math.round(pos.y)), width: 160, height: 200 });
      fs.writeFileSync(path.join(selftestDir, 'plain.png'), plain.resize({ width: 480, quality: 'best' }).toPNG());
      // Sprite-sheet skins: one capture per pet state, to check the frame mapping.
      if (await overlay.webContents.executeJavaScript(`window.BUDDY_SHEET_DEBUG = true; document.getElementById('pet').classList.contains('sheet')`)) {
        for (const [k, wait] of [['walk', 500], ['talk', 500], ['think', 300], ['surprised', 300], ['huff', 300], ['drag', 300], ['fall', 300], ['sleep', 3400], ['frost', 900]]) {
          const mode = ['walk', 'sleep', 'drag', 'fall'].includes(k) ? k : 'idle';
          const extra = mode === k ? '' : ` ${k}`;
          await overlay.webContents.executeJavaScript(k === 'sleep'
            ? `BuddyBrain.onIdleSeconds(400); BuddyBubble.hide(); 1` // a real nap, so the brain doesn't undo it
            : `(() => { const p=document.getElementById('pet'); const keep=['skin','has-ultimate','sheet','ultimate-sheet'].filter(c=>p.classList.contains(c)); p.className=['${mode}${extra}','face-right',...keep].join(' '); return 1; })()`);
          await new Promise((r) => setTimeout(r, wait));
          const shot = await capture(overlay, { x: Math.max(0, Math.round(pos.x) - 40), y: Math.max(0, Math.round(pos.y) - 20), width: 240, height: 220 });
          fs.writeFileSync(path.join(selftestDir, `state-${k}.png`), shot.toPNG());
        }
        await overlay.webContents.executeJavaScript(`BuddyBrain.onIdleSeconds(0); (() => { const p=document.getElementById('pet'); const keep=['skin','has-ultimate','sheet','ultimate-sheet'].filter(c=>p.classList.contains(c)); p.className=['idle','face-right',...keep].join(' '); return 1; })()`);
      }
      // Then a bubble and the ice-crystal trick, cropped wider.
      await overlay.webContents.executeJavaScript(`document.querySelectorAll('#pet *').forEach(e=>e.style.animationPlayState=''); BuddyBrain.quip(['click']); BuddyBrain.playAnimation('frost'); 1`);
      await new Promise((r) => setTimeout(r, 900));
      const cx = Math.max(0, Math.round(pos.x) - 120);
      const close = await capture(overlay, { x: cx, y: Math.max(0, Math.round(pos.y) - 130), width: 400, height: 330 });
      fs.writeFileSync(path.join(selftestDir, 'closeup.png'), close.resize({ width: 800 }).toPNG());
      // Desk mode with a full paper stack, mid-stamp.
      await overlay.webContents.executeJavaScript(`BuddyBubble.hide(); BuddyBrain.enterDesk('lab'); document.getElementById('pet').dataset.papers='8'; 1`);
      await new Promise((r) => setTimeout(r, 1500));
      await overlay.webContents.executeJavaScript(`BuddyBrain.playAnimation('stamp'); 1`);
      await new Promise((r) => setTimeout(r, 1000));
      const desk = await capture(overlay, { x: cx, y: Math.max(0, Math.round(pos.y) - 130), width: 400, height: 330 });
      fs.writeFileSync(path.join(selftestDir, 'desk.png'), desk.resize({ width: 800 }).toPNG());
      // Frost Release, captured mid-transformation.
      await overlay.webContents.executeJavaScript(`BuddyBubble.hide(); BuddyBrain.exitDesk({ quiet: true }); BuddyBrain.playAnimation('release'); 1`);
      await new Promise((r) => setTimeout(r, 1700));
      const rx = Math.max(0, Math.round(pos.x) - 220);
      const rel = await capture(overlay, { x: rx, y: Math.max(0, Math.round(pos.y) - 260), width: 600, height: 460 });
      fs.writeFileSync(path.join(selftestDir, 'release.png'), rel.toPNG());
      // Ultimate form, captured while held after the release finishes.
      await new Promise((r) => setTimeout(r, 3000));
      await overlay.webContents.executeJavaScript(`BuddyBubble.hide(); BuddyBrain.enterUltimate(12); 1`);
      await new Promise((r) => setTimeout(r, 5200));
      const ult = await capture(overlay, { x: rx, y: Math.max(0, Math.round(pos.y) - 260), width: 600, height: 460 });
      fs.writeFileSync(path.join(selftestDir, 'ultimate.png'), ult.toPNG());
      const ultState = await overlay.webContents.executeJavaScript(`JSON.stringify({ classes: document.getElementById('pet').className, primaryShown: (() => { const e = document.getElementById('skin-img'); return e ? getComputedStyle(e).display : 'n/a'; })(), ultimateShown: (() => { const e = document.getElementById('skin-ultimate'); return e ? getComputedStyle(e).display : 'n/a'; })() })`);
      fs.writeFileSync(path.join(selftestDir, 'ultimate.json'), ultState);
      const jp = await capture(jarWin);
      fs.writeFileSync(path.join(selftestDir, 'jar.png'), jp.toPNG());
      openCustomize();
      await new Promise((r) => setTimeout(r, 1500));
      const cp = await capture(ctx.customizeWin);
      fs.writeFileSync(path.join(selftestDir, 'customize.png'), cp.toPNG());
      openImport('edit');
      await new Promise((r) => setTimeout(r, 3500));
      if (ctx.importWin) { const ip = await capture(ctx.importWin); fs.writeFileSync(path.join(selftestDir, 'characters-edit.png'), ip.toPNG()); await ctx.importWin.webContents.executeJavaScript("document.querySelector('.tab[data-tab=import]').click(); 1"); await new Promise((r) => setTimeout(r, 400)); const ip2 = await capture(ctx.importWin); fs.writeFileSync(path.join(selftestDir, 'characters-import.png'), ip2.toPNG()); await ctx.importWin.webContents.executeJavaScript("document.querySelector('.tab[data-tab=choose]').click(); 1"); await new Promise((r) => setTimeout(r, 1200)); const ip3 = await capture(ctx.importWin); fs.writeFileSync(path.join(selftestDir, 'characters-choose.png'), ip3.toPNG()); }
      const sfxCheck = await overlay.webContents.executeJavaScript(`JSON.stringify(BuddySfx.names.map((n) => { try { return [n, BuddySfx.play(n)]; } catch (e) { return [n, 'ERR ' + e.message]; } }))`);
      fs.writeFileSync(path.join(selftestDir, 'sfx.json'), sfxCheck);
      const probe = await overlay.webContents.executeJavaScript(`JSON.stringify({ mods: BuddyMods.list(), skippedMods: BuddyMods.skipped(), modProps: document.querySelectorAll('#pet [data-mod]').length, surprisedAnim: (() => { const p = document.getElementById('pet'); p.classList.add('surprised'); const a = getComputedStyle(document.getElementById('sprite')).animationName; p.classList.remove('surprised'); return a; })(), quips: BuddyQuips.all().length, mode: BuddyBrain.state.mode, x: BuddyBrain.state.x, y: BuddyBrain.state.y, bubble: BuddyBubble.isVisible(), text: document.getElementById('bubble-text').textContent, petClass: document.getElementById('pet').className, skin: document.getElementById('pet').classList.contains('skin'), skinImg: !!document.getElementById('skin-img'), ultimateImg: !!document.getElementById('skin-ultimate'), idle: BuddyBrain.state.idleSeconds })`);
      fs.writeFileSync(path.join(selftestDir, 'state.json'), probe);
      // Desk and dialogue, driven with simulated typing samples.
      const deskProbe = await overlay.webContents.executeJavaScript(`(() => {
        const B = BuddyBrain, st = B.state, txt = () => document.getElementById('bubble-text').textContent, r = {};
        document.getElementById('pet').classList.remove('ultimate'); B.exitDesk({ quiet: true }); BuddyBubble.hide(); st.typingLog = [];
        for (let i = 0; i < 30; i++) B.onActivity({ typing: 1, kind: 'writing' });
        r.clickingAround = st.mode;
        st.typingLog = [];
        for (let i = 0; i < 10; i++) B.onActivity({ typing: 8, kind: 'coding' });
        r.afterTyping = st.mode; r.deskKind = st.deskKind; r.spawnLine = txt();
        BuddyBubble.hide(); st.bubblePriority = 0; st.lastTypingAt -= 30000; Math.random = () => 0.1;
        B.onActivity({ typing: 0, kind: 'coding' });
        r.pauseLine = txt(); r.stillAtDesk = st.mode;
        BuddyBubble.hide(); st.lastTypingAt -= 100000; B.onActivity({ typing: 0 });
        r.afterLongPause = st.mode; r.despawnLine = txt();
        r.greet = BuddyQuips.pick(['greet']); r.idle = BuddyQuips.pick(['idle']); r.click = BuddyQuips.pick(['click']);
        return JSON.stringify(r, null, 1);
      })()`);
      fs.writeFileSync(path.join(selftestDir, 'desk-dialogue.json'), deskProbe);
      // Walk check: let the brain walk him for 3 s and record each frame shown.
      const walkProbe = await overlay.webContents.executeJavaScript(`(async () => {
        const B = BuddyBrain, st = B.state, p = document.getElementById('pet');
        B.exitDesk({ quiet: true }); BuddyBubble.hide(); B.setPaused(false);
        st.x = 300; st.nextDecision = performance.now() + 60000;
        for (const m of ['idle', 'walk', 'lean', 'sleep', 'drag', 'fall', 'desk']) p.classList.remove(m);
        p.classList.add('walk'); st.mode = 'walk';
        const pl = BuddyApp.sheetPlayers && BuddyApp.sheetPlayers.base;
        const seq = []; const t0 = performance.now(); const x0 = st.x;
        while (performance.now() - t0 < 3000) {
          const fr = pl ? pl.frame : -1;
          if (!seq.length || seq[seq.length - 1].f !== fr) seq.push({ f: fr, t: Math.round(performance.now() - t0), key: pl && pl.key });
          await new Promise((r) => setTimeout(r, 40));
        }
        B.setPaused(true);
        return JSON.stringify({ moved: Math.round(st.x - x0), speed: BuddyApp.walkSpeed, seq });
      })()`);
      fs.writeFileSync(path.join(selftestDir, 'walk-probe.json'), walkProbe);
      // The jar on screen: where it sits, and (only with a throwaway data
      // folder) that a double-click donates the quick amount.
      const jarRect = JSON.parse(await overlay.webContents.executeJavaScript(`JSON.stringify((() => { const r = document.getElementById('jar-prop').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, stageW: innerWidth, stageH: innerHeight, label: document.getElementById('jar-label').textContent, zone: BuddyApp.jarZone }; })())`));
      const jarShot = await capture(overlay, { x: Math.max(0, Math.round(jarRect.x) - 260), y: Math.max(0, Math.round(jarRect.y) - 120), width: 360, height: 230 });
      fs.writeFileSync(path.join(selftestDir, 'jar-prop.png'), jarShot.toPNG());
      const jarTest = { rect: jarRect };
      if (process.env.TOSHI_USERDATA) {
        jarTest.before = ledger.data.balance;
        jarTest.ceiling = guard.maxSafeDonation();
        await overlay.webContents.executeJavaScript(`document.getElementById('jar-prop').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); 1`);
        await new Promise((r) => setTimeout(r, 1500));
        jarTest.after = ledger.data.balance;
        jarTest.pledged = ledger.data.pledged;
        jarTest.labelAfter = await overlay.webContents.executeJavaScript(`document.getElementById('jar-label').textContent`);
      }
      fs.writeFileSync(path.join(selftestDir, 'jar-prop.json'), JSON.stringify(jarTest, null, 1));
      // Wake from sleep: a drag stuck from before sleeping must be cleared and the
      // overlay re-armed (same handlers the system's resume event runs).
      const oldOverlay = ctx.overlay;
      // Put the pet somewhere specific so we can check it stays put.
      const before = JSON.parse(await oldOverlay.webContents.executeJavaScript(`(() => { BuddyBrain.setPaused(true); BuddyBrain.state.x = 640; BuddyBrain.state.dir = -1; return JSON.stringify({ x: BuddyBrain.state.x, dir: BuddyBrain.state.dir }); })()`));
      require('electron').powerMonitor.emit('resume');
      await new Promise((r) => setTimeout(r, 7000)); // recreate after 1.5 s, page load, old one closed at +2 s
      const fresh = ctx.overlay;
      const wake = {
        recreated: fresh !== oldOverlay && logLines.some((l) => l.includes('overlay recreated (resume, drawn)')),
        samePosition: await fresh.webContents.executeJavaScript(`Math.round(BuddyBrain.state.startX) === ${before.x}`),
        noGreeting: await fresh.webContents.executeJavaScript('!BuddyBubble.isVisible()'),
        oldClosed: oldOverlay.isDestroyed(),
        petLoaded: await fresh.webContents.executeJavaScript('!!(window.BuddyBrain && document.getElementById("pet") && document.querySelector("#pet svg"))'),
        visible: fresh.isVisible(),
        onTop: fresh.isAlwaysOnTop(),
      };
      // Click-through by cursor position: a point on the pet is clickable, an
      // empty spot isn't (asked of the same check the cursor poll uses).
      await new Promise((r) => setTimeout(r, 300));
      const petRect = JSON.parse(await ctx.overlay.webContents.executeJavaScript(`JSON.stringify((() => { const r = document.getElementById('pet').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })())`));
      const cb = ctx.overlay.getContentBounds();
      wake.hitAreas = ctx.hitAreas.rects.length;
      wake.petClickable = ctx.overAt({ x: cb.x + petRect.x + petRect.w / 2, y: cb.y + petRect.y + petRect.h / 2 });
      wake.emptySpotClickThrough = !ctx.overAt({ x: cb.x + 5, y: cb.y + 5 });
      fs.writeFileSync(path.join(selftestDir, 'wake.json'), JSON.stringify(wake, null, 1));
      const labels = (m) => m.items.flatMap((i) => [i.label, ...(i.submenu ? labels(i.submenu) : [])]).filter(Boolean);
      if (ctx.checkActive) fs.writeFileSync(path.join(selftestDir, 'character-check.json'), JSON.stringify(ctx.checkActive(), null, 1));
      fs.writeFileSync(path.join(selftestDir, 'menu.json'), JSON.stringify({ name: charName(), tooltipName: `${charName()} Buddy`, menu: labels(buildMenu()) }, null, 1));
      fs.writeFileSync(path.join(selftestDir, 'log.txt'), logLines.join('\n'));
    } catch (e) {
      fs.writeFileSync(path.join(selftestDir, 'log.txt'), logLines.join('\n') + `\nSELFTEST ERROR: ${e.stack}`);
    }
    if (jarWin) jarWin.__reallyClose = true;
    app.exit(0);
  }, 5000);
}

// --demo-poses: hold the confused, surprised, and dizzy poses for 5 s each on
// ToshiToshi and then Bambietta (with a label), then switch back.
async function demoPoses(ctx) {
  const { overlay, settings, activeCharacterId, reloadAndAwaitMods } = ctx;
  const original = activeCharacterId();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const id of ['toshitoshi', 'bambietta'].filter((x) => ctx.listCharacters().some((c) => c.name === x))) {
    settings.set('character', id);
    await reloadAndAwaitMods([], 1500);
    await wait(3500);
    for (const pose of ['think', 'surprised', 'drag']) {
      const label = { think: 'confused (row 4, spot 3)', surprised: 'surprised (row 4, spot 4)', drag: 'dizzy (row 4, spot 6)' }[pose];
      await overlay.webContents.executeJavaScript(`(() => { BuddyBrain.setPaused(true); BuddyBubble.hide(); const p = document.getElementById('pet'); for (const m of ['idle','walk','lean','sleep','drag','fall','desk','think','surprised']) p.classList.remove(m); p.classList.add(${JSON.stringify(pose === 'drag' ? 'drag' : 'idle')}); ${pose === 'drag' ? '' : `p.classList.add('${pose}');`} BuddyBubble.toast(${JSON.stringify(id + ': ' + label)}, 5000); return 1; })()`);
      await wait(5000);
    }
    await overlay.webContents.executeJavaScript(`(() => { const p = document.getElementById('pet'); for (const m of ['drag','think','surprised']) p.classList.remove(m); p.classList.add('idle'); BuddyBrain.setPaused(false); return 1; })()`);
  }
  settings.set('character', original);
  await reloadAndAwaitMods([], 1500);
}

module.exports = { runSelftest, demoPoses };
