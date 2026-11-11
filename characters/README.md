# Characters

Each folder here is one character pack. ToshiToshi (`toshitoshi/`) is the main
character; `kori-test/` is the built-in drawn test character.

**The easy way:** right-click the pet or the tray icon and choose
**Import character…**. Give it a name and personality, drop in a sprite sheet (plus
optional ultimate sheet, still images, and quips), and press Import. Then use
**Edit animations and personality…** to pick which poses play when he walks, talks,
sleeps, and so on. **Export…** in that window zips a pack to share with friends; they
import the .zip the same way.

## Pack layout

```
characters/<id>/
  character.json      name, personality, size, background removal, sheet mapping
  quips.json          his lines (optional)
  sheet.png           sprite sheet (frame animation)
  ultimate-sheet.png  sprite sheet for the 30-second ultimate form (optional)
  skin.png            still image, used when there is no sheet (optional)
  ultimate.png        still image for the ultimate form (optional)
```

Images can be PNG, WebP, GIF, or JPG. The pet uses the sheet when there is one.

## character.json

```json
{
  "name": "ToshiToshi",
  "personality": "Serious, blunt, secretly caring. Short lines.",
  "scale": 1.15,
  "offsetY": 6,
  "keyMode": "edges",
  "keyTolerance": 40,
  "ultimateSeconds": 30,
  "ultimate": { "scale": 1.3, "offsetY": 10 },
  "sheet": { "scale": 1.0, "animations": { "idle": { "frames": "0:0-4", "fps": 3 } } },
  "ultimateSheet": { "scale": 1.1, "animations": { "idle": { "frames": "0:0-4" } } }
}
```

   - `name`: shown in menus and the jar (**Rename character…** overrides it on your PC).
   - `personality`: how he talks and acts, up to 600 characters. It is the only
     thing from a pack that upgrade runs see: they write his new lines in this voice.
     Images, sheets, and quips are never sent.
   - `ownQuipsOnly`: `true` means the character only ever says lines from its own
     `quips.json` (and your edits), never lines that upgrades or mods add. App
     information (usage, pledges, upgrade status) always shows as a small notice,
     not as speech.
   - `theme`: `{ "accent": "#d92b22" }` recolors the speech bubble, the jar on screen,
     and the app's windows while this character is out.
   - `effects`: `"explosion"` swaps the ice effects for blasts, sparks, and booms.
   - `ultimateForm`: `false` means donations play the show-off animation but never
     switch to an ultimate form.
   - `scale`: image height relative to the pet (1.0 = 188 pet units).
     The image keeps its proportions; wide images extend past the sides.
   - `offsetX`, `offsetY`: nudge the image in pet units (positive y moves it down).
   - `keyMode`: background removal for images without transparency. `"edges"`
     (the default for JPGs) removes only background connected to the image border,
     so white hair or clothes inside the outline stay. `"color"` removes every pixel
     close to `keyColor`. `"none"` turns it off.
   - `keyColor`: the background color as `#rrggbb`. With `"edges"` it defaults to
     the average corner color.
   - `keyTolerance`: how close a color must be to the background to be removed
     (0-255). Raise it if a gradient background leaves a halo; lower it if parts of
     the character disappear.
   - `ultimateSeconds`: how long the ultimate form lasts (5-600).
   - `mods`: which upgrade mods this character uses. Leave it out for all of them,
     `false` for none, or a list of mod folder names, like `["party-hat"]`. Mods
     made only for the drawn test character (such as the sample earmuffs) never show.
   - `ultimate`: the same `scale`, `offsetX`, `offsetY`, `keyMode`, `keyColor`,
     `keyTolerance`, and `anchors` settings for the ultimate image.
   - `anchors`: where upgrades attach props, in pet units (the pet is 160 wide, the
     ground is at y=188). Example:
     `"anchors": { "head": { "x": 80, "y": 70, "size": 70 }, "hand-r": { "x": 104, "y": 128 }, "hand-l": { "x": 56, "y": 128 } }`.
     `size` is the width of the face; props scale with it. Turn on **Show prop anchors**
     in the tray's Character menu to see pink crosshairs where they currently land, then
     adjust until they sit on the head and hands. Without `anchors`, positions are
     estimated from the image size.
Switch characters from **Character** in the tray or right-click menu, or in the jar's
Settings. File changes apply when you re-pick the character or choose
**Reload mods and quips**.

## Dialogue (quips.json)

Each character has its own lines in `quips.json` (plus any quip packs from upgrades).
Edits made in **Edit quips…** are kept separately for each character.

```json
{
  "quips": [
    { "id": "morning_001", "tags": ["time_morning"], "text": "Good morning.", "cooldown": 0, "priority": 2 },
    { "id": "click_001", "tags": ["click"], "text": "Was that necessary?", "cooldown": 300, "priority": 1 }
  ]
}
```

- `cooldown`: seconds before the same line can play again (default 600).
- `priority`: 0-3. A line never interrupts a more important one still on screen.
- `{name}` in a line becomes the character's name.
- Tags and when they play:

| Tag | When |
|---|---|
| `time_morning`, `time_afternoon`, `time_evening`, `time_night` | the greeting at startup, then the first time each part of the day comes around (once per session) |
| `random`, `random_sleepy` | idle remarks every few minutes (sleepy ones more often at night) |
| `click`, `drag`, `repeated_click` | clicking him, picking him up or putting him down, clicking him again and again |
| `inactivity` | about 2.5 minutes without any input, once per stretch |
| `inactivity_long` | waking up after you've been away 5+ minutes |
| `desk_spawn`, `desk_typing`, `desk_idle`, `desk_despawn` | the desk comes out after sustained typing; now and then while you type; a 25-second pause; the desk goes away after 2 minutes without typing |
| `activity_coding`, `activity_study`, `activity_work` | at the desk in a code editor, a lab (VMs, terminals), or a writing app |
| `activity_reading` | a PDF or e-book in front for 8+ minutes without typing |
| `activity_break` | after about 50 minutes at the desk |
| `donation`, `activity_bonsai` | donating to the jar or funding a goal (without them, a built-in line plays) |
| `slacking`, `slacking_extended` | a long stretch of games or videos (only with "Nudge me when I slack off" on), and if it keeps going |
| `achievement`, `milestone`, `failure` | an upgrade is built, the jar reaches a new level, an upgrade fails |

The older tags (`greet`, `idle`, `desk-writing`, `annoyed-1`...) work too.

## Sprite sheets (frame animation)

Add `sheet.png` (and optionally `ultimate-sheet.png` for the ultimate form) to the
pack folder. A sheet is a grid of poses with space between them; transparent or
plain/gradient backgrounds both work. On load the app removes the background,
finds every figure, numbers them by row and column, and writes
`sheet-index.png` / `ultimate-sheet-index.png` next to your sheet with a
`row:frame` label on each pose. Map poses to animations in **Edit animations and
personality…**, or by hand in `character.json`:

```json
"sheet": {
  "scale": 1.0,
  "offsetY": 2,
  "animations": {
    "idle":  { "frames": "0:0-4,0:3-1", "fps": 3 },
    "blink": { "frames": "0:5" },
    "walk":  { "frames": "1:0-5", "fps": 9, "flip": true },
    "talk":  { "frames": "4:0-4", "fps": 6 },
    "sleep": { "frames": "3:6,3:7,3:8", "fps": 0.7, "loopFrom": 2 },
    "think": { "frames": "3:2", "loop": false }
  }
},
"ultimateSheet": { "scale": 1.1, "animations": { "idle": { "frames": "0:0-4" } } }
```

- `frames`: `"row:frame"`, ranges like `"1:0-5"`, comma lists, or a `row` key plus
  `"0-5"`.
- `fps` (default 6), `loop` (`false` holds the last frame), `loopFrom` (where a loop
  restarts, so sleep can yawn once and then stay asleep).
- `flip: true` when the poses face left (the pet faces right by default).
- `scale`: height of the first idle frame relative to the pet (1.0 = 188 units).
- Animation names: `idle`, `blink`, `walk`, `talk`, `sleep`, `drag`, `fall`, `land`,
  `lean`, `desk`, `working` (an upgrade is running), `think`, `surprised`, `huff`,
  `shrug`, `wave`, `frost`, `release` (the donation transformation), `stamp`, and
  `anim-<name>` for mod animations. Anything not mapped falls back to `idle`.
- Small marks floating near a pose ("?", "!", sparkles) are attached to the nearest
  figure. If one lands on the wrong pose, add `"moveMarks": [["3:4", "3:3"]]` to the
  sheet settings to move the marks beside pose 3:4 over to pose 3:3.
- `keyMax`: for a character with colors close to the background (dark hair on black),
  set it (for example 22) so background removal stops before reaching those colors.

A sheet replaces the still `skin.<ext>` / `ultimate.<ext>` images; those are used
again if the sheet is removed or fails to load.

Without a sheet, a still image gets whole-body motion instead: walking bounce, landing
squash, dangling when dragged, leaning, and napping.
