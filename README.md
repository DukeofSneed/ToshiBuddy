# Kori Buddy

A BonziBuddy-style desktop pet: **Kori**, an original plush-style chibi ice officer
who patrols your taskbar, leans on screen edges, naps when you're idle, and mutters
in Animal Crossing-style gibberish. While you write or do labs, he pulls out a desk
and does paperwork. He carries a **donation jar** of Claude tokens: every donation
triggers his **Frost Release**, and the tokens pay for headless Claude Code runs
that teach him new tricks.

![Kori](docs/kori-preview.png)

## Run it

Double-click `start.cmd`, or:

```bat
npm.cmd install
npm.cmd start
```

Right-click Kori or the tray crystal for the menu. Click him, drag him, drop him,
double-click him.

## Desk mode

After sustained typing (roughly 15 seconds of actual typing within 45 seconds), the
pet sets up a desk, scribbles, stamps forms, and grows a paper stack. Short pauses
are fine; he packs up after 2 minutes without typing. Clicking around or typing in a
game never brings it out.

Typing is detected without reading the keyboard: every quarter second the app checks
whether there was input while the mouse stayed still, and keeps only a count. The
foreground app's name and title are also checked locally (to tell coding, labs,
writing, and reading apart, and to skip games). None of it is logged, stored, or sent
anywhere. Turn desk mode off from the tray menu or the jar's Settings.

## Skins

Drop your own image into `skins/<name>/` and pick it under **Skin** in the tray
menu. Add an `ultimate` image too, and every donation switches to it for 30 seconds
after the Frost Release. JPGs work: the background is removed automatically. See
[skins/README.md](skins/README.md). Skins stay on your PC. A `sheet.png` sprite sheet
animates the skin frame by frame (walking, talking, napping, and more).

## Name and quips

Right-click the pet or the tray icon and choose **Rename character…** or
**Edit quips…**. The window lets you rename the character (shown in the menus, the
jar, and wherever a quip says `{name}`), add your own quips with tags that decide
when they play, edit or remove built-in ones (removed ones can be restored), and
preview any line out loud. Changes apply immediately. They're saved in
`quips-custom.json` in the app's data folder, so the repo's quip files stay
untouched.

## The jar

1. **Log in once.** Run `claude` in a terminal and finish `/login` with your
   subscription. Upgrade runs use that login, never an API key.
2. **Check plan usage** in the jar. A tiny probe reads your plan's usage window.
3. **Donate tokens.** The jar never accepts more than your plan can safely spend
   right now. The rest becomes a pledge that unlocks as your usage window resets.
4. **Suggest an upgrade.** Kori prices it and adds a goal bar.
5. **Fill a goal and press Build it.** A capped headless run writes a mod under
   `mods/`, which is checked, committed to git, and loaded live. Undo reverts it.

### The guard
- Refuses to start a run without a fresh usage reading, or above the cap
  (default 80% of the plan window, 70% if usage credits are on).
- Kills a run on any plan-limit warning, at the cap, or when it spends more than
  its funded tokens. `--max-budget-usd` is a second hard stop.
- Upgrade runs cannot use Bash or the web, and anything they write outside
  `mods/` and `content/` is reverted.
- The only absolute guarantee against overage is turning **usage credits off** at
  claude.ai → Settings → Usage.

## Files
- `src/main/` Electron main process: overlay window, tray, activity watcher, jar
  (ledger, guard, estimator, upgrader, git).
- `src/renderer/` the sprite (SVG), animations (CSS), brain, animalese voice,
  synthesized sound effects, mod loader.
- `docs/MOD_API.md` the contract every upgrade follows.
- State lives in `%APPDATA%\askin-buddy` (`ledger.json`, `settings.json`).
