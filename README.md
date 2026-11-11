# Askin Buddy

A BonziBuddy-style desktop pet: a plush-style chibi **Askin Nakk le Vaar** who
wanders your taskbar, leans on screen edges, naps when you're idle, and mutters in
Animal Crossing-style gibberish. He carries a **donation jar** of Claude tokens
that pays for headless Claude Code runs that teach him new tricks.

![Askin](docs/askin-preview.png)

## Run it

Double-click `start.cmd`, or:

```bat
npm.cmd install
npm.cmd start
```

Right-click Askin or the purple tray orb for the menu. Click him, drag him, drop
him, double-click him.

## The jar

1. **Log in once.** Run `claude` in a terminal and finish `/login` with your
   subscription. Upgrade runs use that login, never an API key.
2. **Check plan usage** in the jar. A tiny probe reads your plan's usage window.
3. **Donate tokens.** The jar never accepts more than your plan can safely spend
   right now. The rest becomes a pledge that unlocks as your usage window resets.
4. **Suggest an upgrade.** Askin prices it and adds a goal bar.
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
- `src/main/` Electron main process: overlay window, tray, jar (ledger, guard,
  estimator, upgrader, git).
- `src/renderer/` the sprite (SVG), animations (CSS), brain, animalese voice, mod loader.
- `docs/MOD_API.md` the contract every upgrade follows.
- State lives in `%APPDATA%\askin-buddy` (`ledger.json`, `settings.json`).
