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

When you've been actively using a writing app (Word, Google Docs, VS Code, Obsidian,
Notion...) or a lab app (VMware, VirtualBox, Wireshark, PuTTY, Windows Terminal...)
for about 45 seconds, Kori sets up a desk, scribbles with an icicle quill, stamps
forms, and grows a paper stack. He packs up after about 40 quiet seconds. The
foreground app is checked locally every 2 seconds and never logged, stored, or sent
anywhere. Turn it off from the tray menu or the jar's Settings.

## Skins

Drop your own image into `skins/<name>/` and pick it under **Skin** in the tray
menu. See [skins/README.md](skins/README.md). Skins stay on your PC.

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
