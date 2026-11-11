# ToshiBuddy

Electron desktop buddy: a sprite-sheet character (ToshiToshi by default, users can
import their own) walks the taskbar, talks in synthesized animalese, does paperwork at
a desk during sustained typing, and has a "Claude token" donation jar in the screen
corner. Donations trigger the ultimate form; the jar spawns headless `claude -p`
upgrade runs that write mods. Kori (`characters/kori-test`, drawn in
`src/renderer/pet/sprite.js`) is the built-in test character.


## If you are an upgrade run (headless, spawned by the jar)
- Read `docs/MOD_API.md`, then write exactly one mod under `mods/<slug>/`.
- Only `mods/` and `content/` may change. Anything else is reverted automatically.
- No Bash, no network, no dependencies. Finish within the token budget in your prompt.
- Everything must be original: no copyrighted characters, art, dialogue, or audio.

## If you are a developer session
- `Setup ToshiBuddy.cmd` installs and makes the desktop shortcut; `npm.cmd start` (or
  `start.cmd`) runs the app. No build step. Zero runtime dependencies.
- Main process: `src/main/` (windows, tray, activity watcher for desk mode, ledger,
  guard, estimator, upgrader, git).
- Renderer: `src/renderer/` (SVG sprite, animation CSS, brain, quips, animalese
  voice, synthesized sound effects, mod loader).
- State lives in Electron's userData folder (`settings.json`, `ledger.json`), not in the repo.
- `characters/<id>/` packs (character.json, quips.json, images) are tracked so a
  shared folder includes ToshiToshi. Never read their images, sheets, or quips into
  upgrade-run prompts; only the name and `personality` text from character.json go to
  estimates and upgrade runs (see `characterInfo()` in `src/main/main.js`).
- Character import (`src/main/character-import.js`) validates everything: allowed file
  names, image magic bytes, size caps, whitelisted config keys. Keep it that way.
- Never draw new art based on a user's character images.
- Desk mode reads the foreground app name and window title locally to classify
  coding, lab, writing, reading, or leisure, and infers typing from input-while-the-
  mouse-is-still counts (never which keys). Never log, store, or send those values,
  and never add real keyboard capture (hooks, GetAsyncKeyState on keys).
- The plan-limit guard must never be weakened: runs are refused above the configured
  utilization cap, killed on rate-limit warnings, and capped by `--max-budget-usd`.
- Upgrade-run permission rules live in `RUN_SETTINGS` in `src/main/jar/upgrader.js`
  and are passed with `--settings`. Do not put deny rules in `.claude/settings.json`:
  that file applies to every session in this folder, developer sessions included.
