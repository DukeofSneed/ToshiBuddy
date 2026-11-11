# Askin Buddy

Electron desktop pet: a chibi Askin Nakk le Vaar who walks the taskbar, talks, and
carries a "Claude token" donation jar. The jar spawns headless `claude -p` upgrade
runs that write mods.

## If you are an upgrade run (headless, spawned by the jar)
- Read `docs/MOD_API.md`, then write exactly one mod under `mods/<slug>/`.
- Only `mods/` and `content/` may change. Anything else is reverted automatically.
- No Bash, no network, no dependencies. Finish within the token budget in your prompt.

## If you are a developer session
- `npm start` runs the app. No build step. Zero runtime dependencies by design.
- Main process: `src/main/` (window, tray, ledger, guard, estimator, upgrader, git).
- Renderer: `src/renderer/` (SVG sprite, animator CSS, brain, quips, voice, mod loader).
- State lives in Electron's userData folder (`settings.json`, `ledger.json`), not in the repo.
- The plan-limit guard must never be weakened: runs are refused above the configured
  utilization cap, killed on rate-limit warnings, and capped by `--max-budget-usd`.
