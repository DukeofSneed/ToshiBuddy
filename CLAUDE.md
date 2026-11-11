# Kori Buddy

Electron desktop pet: Kori, an original chibi ice officer who walks the taskbar,
talks in synthesized animalese, does paperwork at a desk while the user writes or
does labs, and carries a "Claude token" donation jar. Donations trigger the Frost
Release animation; the jar spawns headless `claude -p` upgrade runs that write mods.


## If you are an upgrade run (headless, spawned by the jar)
- Read `docs/MOD_API.md`, then write exactly one mod under `mods/<slug>/`.
- Only `mods/` and `content/` may change. Anything else is reverted automatically.
- No Bash, no network, no dependencies. Finish within the token budget in your prompt.
- Everything must be original: no copyrighted characters, art, dialogue, or audio.

## If you are a developer session
- `npm.cmd start` (or `start.cmd`) runs the app. No build step. Zero runtime dependencies.
- Main process: `src/main/` (windows, tray, activity watcher for desk mode, ledger,
  guard, estimator, upgrader, git).
- Renderer: `src/renderer/` (SVG sprite, animation CSS, brain, quips, animalese
  voice, synthesized sound effects, mod loader).
- State lives in Electron's userData folder (`settings.json`, `ledger.json`), not in the repo.
- `skins/` holds the user's own images and is git-ignored; never commit or read
  them into prompts.
- Desk mode reads the foreground app name and window title locally to classify
  coding, lab, writing, reading, or leisure, and infers typing from input-while-the-
  mouse-is-still counts (never which keys). Never log, store, or send those values,
  and never add real keyboard capture (hooks, GetAsyncKeyState on keys).
- A skin's own dialogue lives in `skins/<name>/quips.json` (git-ignored). Like the
  rest of `skins/`, never read it into upgrade-run prompts.
- The plan-limit guard must never be weakened: runs are refused above the configured
  utilization cap, killed on rate-limit warnings, and capped by `--max-budget-usd`.
- Upgrade-run permission rules live in `RUN_SETTINGS` in `src/main/jar/upgrader.js`
  and are passed with `--settings`. Do not put deny rules in `.claude/settings.json`:
  that file applies to every session in this folder, developer sessions included.
