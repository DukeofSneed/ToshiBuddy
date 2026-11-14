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
- `npm.cmd test` runs tests/*.test.js (jar and guard, usage readings, waiting queue,
  importer checks, character check and auto-map, profiles, dialogue engine, upgrade audit). The app self-test lives in `src/main/selftest.js` (`TOSHI_SELFTEST=<dir>`,
  with `TOSHI_USERDATA=<dir>` so it never touches real data).
- Upgrade runs only ever check, clean, and commit `mods/` and `content/` (`RUN_DIRS` in
  `src/main/jar/git.js`); never widen that to the whole project.
- Main process: `src/main/` (windows, tray, activity watcher for desk mode, ledger,
  guard, estimator, upgrader, git).
- Renderer: `src/renderer/` (SVG sprite, animation CSS, brain, quips, animalese
  voice, synthesized sound effects, mod loader).
- State lives in Electron's userData folder (`settings.json`, `ledger.json`), not in the repo.
- `characters/<id>/` packs (character.json, quips.json, images) are tracked so a
  shared folder includes ToshiToshi. Never read their images, sheets, or quips into
  upgrade-run prompts; only the name, the `personality` text from character.json, and
  the stored profile notes go to estimates and upgrade runs (see `characterInfo()` in
  `src/main/main.js`).
- Prompts also get a list of what the character already does (`src/main/abilities.js`:
  app behaviors, the names of its mapped animations, built tricks, listed ideas) with a
  rule not to repeat or imitate them. Animation names only; never what a pose looks like.
- Upgrades may play only poses the character's sheet already has (`playablePoses` and
  `limits` in `src/main/abilities.js`), add only small props that don't cover or change
  the outfit, and keep only simple saved counts (`count` on a behavior; stored in the
  pet window's localStorage). Ideas outside that are tossed (`clean` in `profile.js`).
- The `app-switch` event is a yes/no computed in memory from the foreground app name;
  the name itself still never leaves the activity handler.
- A user can attach pictures to a goal (`src/main/jar/attachments.js`): validated like
  character images, kept in userData, copied into `mods/<slug>/assets/` (shown as-is by
  a picture prop) or `mods/<slug>/reference/` (removed after the run). These are the
  only images an upgrade run may see, and only because the user attached them to that
  goal. Mods can show only attached pictures (`props[].image`; the loader builds the tag).
- Profile notes and upgrade ideas come from one search-only run per character
  (`src/main/jar/profile.js`): its only tool is WebSearch, it runs in an empty temp
  folder, it is told to search for the name only, and its answer is cleaned and capped
  before it is stored in userData (`profiles/<id>.json`, never in the repo). Upgrade
  runs themselves stay offline.
- Goals and built tricks belong to a character (`characterId` on goals and upgrade
  records): the jar shows, builds, and retries only the active character's goals, and
  `modsFor()` in `src/main/mods.js` loads a trick only for the character it was built for.
- A funded goal the guard refuses is marked `waiting` and retried after the plan resets
  (`src/main/jar/waiting.js`); it must only ever start through `guard.canStart()`.
- Marks beside a pose ("?", "!", swirls) are cut out as their own images (`findMarks`,
  `groupMarks` in `src/renderer/pet/sheet.js`) and drawn on a separate layer that is
  never mirrored; a mirrored or left-facing figure only moves them to the other side.
  Keep it a rule with no setting: do not add an option that can mirror a mark.
- New sheets are mapped automatically from row counts (`src/main/character-check.js`:
  `autoMap`, `checkCharacter`); it never looks at the image.
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
