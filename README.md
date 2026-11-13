# ToshiBuddy

A BonziBuddy-style desktop buddy. ToshiToshi walks your taskbar in frame-by-frame
sprite animatio. A donation jar of Claude tokens sits in the corner of your screen and the tokens pay for headless Claude Code runs that teach him new tricks.

Bring your own characters too: a sprite sheet, a personality, and quips are all it takes.

## Install

1. Get the ToshiBuddy folder (zip it and send it; unzip it anywhere).
2. Double-click **Setup ToshiBuddy.cmd** once. It installs Node.js if needed (asking
   first), downloads the runtime, and puts a **ToshiBuddy** snowflake shortcut on the
   desktop and in the Start menu.
3. Start it from the snowflake from then on. If you move the folder, run Setup again.

Right-click the pet or the tray snowflake for the menu. Click him, drag him, drop him,
double-click him. `start.cmd` also starts it without a shortcut.

## The jar on screen

The jar in the bottom-right corner fills up as tokens come in. **Double-click** it to
donate 1k tokens (change the amount in the jar's Settings), **click** it to open the
jar panel, right-click it for the menu. Donations go through the same plan-limit
guard as the panel.

## Characters

- **Import character…** (right-click menu): name, personality, sprite sheet, optional
  ultimate sheet / still images / quips. Drag and drop works.
- **Edit animations and personality…**: every pose numbered `row:frame`, and a table
  to choose which poses play when he walks, talks, sleeps, and so on.
- **Export…** zips a character for a friend; they import the .zip.
- Switch under **Character** in the menu. `kori-test` is the built-in drawn test
  character.

Details: [characters/README.md](characters/README.md).

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

## Name and quips

Right-click the pet or the tray icon and choose **Rename character…** or
**Edit quips…**. The window lets you rename the character (shown in the menus, the
jar, and wherever a quip says `{name}`), add your own quips with tags that decide
when they play, edit or remove built-in ones (removed ones can be restored), and
preview any line out loud. Changes apply immediately. They're saved per character
in the app's data folder, so the pack files stay untouched.

## The jar

1. **Install Git and Claude Code, and log in once.** Run `claude` in a terminal and finish `/login` with your
   subscription. Upgrade runs use that login.
2. **Check plan usage** in the jar. A tiny probe reads your plan's usage window.
3. **Donate tokens.** The jar never accepts more than your plan can safely spend
   right now. The rest becomes a pledge that unlocks as your usage window resets.
4. **Suggest an upgrade.** He prices it and adds a goal bar.
5. **Fill a goal and press Build it.** A capped headless run writes a mod under
   `mods/`, which is checked, committed to git, and loaded live. Undo reverts it.

## Files
- `src/main/` Electron main process: overlay window, tray, activity watcher, jar
  (ledger, guard, estimator, upgrader, git).
- `src/renderer/` sprite-sheet player, the drawn test character (SVG), animations
  (CSS), brain, animalese voice, synthesized sound effects, mod loader, jar on screen.
- `characters/` character packs. `assets/` the snowflake icon. `scripts/` icon and
  shortcut helpers.
- `docs/MOD_API.md` the contract every upgrade follows.
- State lives in `%APPDATA%\ToshiBuddy` (`ledger.json`, `settings.json`).
