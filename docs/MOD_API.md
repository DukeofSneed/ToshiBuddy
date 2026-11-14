# ToshiBuddy Mod API

A mod is one folder `mods/<slug>/` containing `mod.js` (and optionally `NOTES.md`).
`mod.js` is plain browser JavaScript, loaded with a `<script>` tag into the pet's
page. It has no Node, no `require`, no network. It must call
`BuddyMods.register({...})` exactly once at top level.

The main character is a **sprite-sheet character** (ToshiToshi by default; users can
import their own). The built-in **test character** is Kori, an original plush-style
ice chibi (huge head, tiny body, stubby limbs) drawn as an SVG with id `pet-svg` inside `#pet > #flip > #sprite`. Part ids
you can target from CSS: `#head`, `#face`, `#lids`, `#mouth`, `#hair-front`,
`#hair-back`, `#cowlick`, `#clip`, `#torso`, `#pin`, `#arm-l`, `#arm-r`, `#leg-l`,
`#leg-r`, `#orb` (an ice crystal, shown during the `frost` trick and while an
upgrade runs), `#quill` and `#stamp` (shown at the desk), `#desk`, `#papers`,
`#halo`, `#snow-cloak`, `#sigil`, `#shadow`, `#zzz`.

Prop anchors are empty `<g>` elements: `#props-head`, `#props-hand-r`,
`#props-hand-l`, `#props-back` (behind everything), `#props-front` (in front of
everything), `#props-desk` (on the desk, visible only in desk mode).

**The active character is usually a sprite-sheet character** (images, no separate
limbs); the drawn test character is Kori. Every upgrade must work on both:
- **Props:** draw them against Kori's coordinates (below). On a sprite-sheet
  character, the `head`, `hand-r`, and `hand-l` anchors are mapped onto its own head
  and hands, scaled to fit, so a hat drawn for Kori sits on the character's head too. `back`,
  `front`, and `desk` stay in place.
- **Animations:** animate the whole body with `#pet.anim-<name> #sprite { ... }`;
  that works on any character. Limb animations (`#arm-r`, `#head`, `#lids`...)
  only show on Kori; treat them as a bonus.
- **Don't describe the character's images.** You can't see them and shouldn't guess.
  Lines use the established voice in the style guide.

After a donation the pet enters the **ultimate form** for about 30 seconds: the
`ultimate` class is on `#pet` (plus `has-ultimate` when the character has its own
ultimate image), with the halo, snow cloak, and sigil held up. Mods can react with
the `ultimate` trigger or style `#pet.ultimate ...`.

## register(def)

```js
BuddyMods.register({
  id: 'party-hat',                 // must equal the folder slug: a-z, 0-9, -
  name: 'Party hat',
  quips: [                         // optional, max 200
    { text: 'This hat is a formality.', tags: ['idle', 'hat'] },
  ],
  animations: {                    // optional; name: a-z, 0-9, -
    'hat-tip': {
      durationMs: 1500,            // 100-20000; the class is removed after this
      css: `#pet.anim-hat-tip #props-head { animation: hatTip 1.5s ease-in-out; transform-origin: 80px 30px; }
            @keyframes hatTip { 0%,100% { transform: rotate(0); } 50% { transform: rotate(-25deg) translateY(-6px); } }`,
    },
  },
  props: [                         // optional, max 20
    { id: 'cone', anchor: 'head', hidden: false,
      svg: '<polygon points="80,-6 64,22 96,22" fill="#7cc4f5" stroke="#1f2a40" stroke-width="1.6"/>' },
  ],
  behaviors: [                     // optional, max 30
    { trigger: 'click', chance: 0.3, action: { animate: 'hat-tip', sound: 'chirp', say: ['Hat tip.', 'Acknowledged.'] } },
    { trigger: 'hour', action: { prop: { id: 'cone', toggle: true } } },
    { trigger: 'interval', every: 600000, chance: 0.5, action: { say: 'Still wearing it. Officially.' } },
  ],
});
```

### Rules the loader enforces
- `id`: required, 2-40 chars of `a-z0-9-`.
- `characters`: optional, `['kori']`, `['skin']`, or both (the default). A mod
  limited to `kori` is skipped entirely (props, animations, quips, behaviors) while
  a sprite-sheet character is active. Leave it out for upgrades: they should work on both.
- `quips[].text` <= 240 chars; write `{name}` wherever the character's name goes
  (the user can rename him, and every character has its own name); `tags` is an array. Useful tags: `idle`, `greet`,
  `lean`, `click`, `drag`, `drop`, `drop-hard`, `wake`, `hour`, `trick`, `upgrade`,
  `desk` (any desk session), `desk-writing`, `desk-lab`, `desk-enter`, `desk-exit`,
  `desk-click`, `desk-break`, `slacking`, `annoyed-1`/`annoyed-2`/`annoyed-3`
  (escalating reactions to repeated pokes), `snowflakes` (his hobby), `ultimate-end`,
  `time:morning`, `time:afternoon`, `time:evening`, `time:night`, and
  `season:winter`/`season:spring`/`season:summer`/`season:autumn` (only played in
  that season). Untagged quips count as `idle`.
- `animations[name].css`: full CSS text, <= 20k chars, no `@import`, no `url(`.
  Play it by adding the class `anim-<name>` to `#pet`, which the brain does for you
  when a behavior's `action.animate` names it. Scope every selector under
  `#pet.anim-<name>` so it cannot leak. Reserved names include every built-in
  state and animation: idle, walk, lean, sleep, drag, fall, land, talk, blink,
  desk, release, stamp, frost, huff, shrug, think, wave, surprised, working, skin.
- `props[]`: `svg` is an SVG fragment (<= 20k chars) placed inside the anchor group;
  no `<script>`, `<foreignObject>`, event attributes, `href`, or `url(`. Coordinates
  are in the pet's 160x200 viewBox: the face spans x 38-122, y 30-108 (eyes at
  (62, 82) and (98, 82), mouth at (80, 98)); the top of the hair is at y=12, so a
  hat sits around y 0-24; the hands are at (53, 135) and (107, 135); the waist is at
  y=148; the feet are at y=187. In desk mode the desk top runs from (29, 125) to
  (131, 138); put desk ornaments around y 110-136 on `desk`. The pet faces right by
  default; the whole sprite is mirrored when walking left.
  `hidden: true` starts the prop invisible; toggle it from a behavior.
- **Picture props.** When the human attached a picture to the upgrade, it is already in
  `mods/<slug>/assets/` and the prompt names it. Show it with `image` on a prop,
  alone or together with `svg` (the svg is drawn first, the picture on top, so a
  frame or stand goes in `svg`):
  `{ id: 'photo', anchor: 'desk', svg: '<rect x="93" y="107" width="24" height="20" rx="1.5" fill="#6b4a2f"/>', image: { file: 'photo.png', x: 95, y: 109, width: 20, height: 16 } }`
  `file` is the bare file name; `x`, `y`, `width`, `height` are in the same 160x200
  coordinates; `fit` is `'contain'` (default, whole picture) or `'cover'` (fills the
  box, cropped); `rotate` is optional degrees. Keep the picture's proportions: pick
  `width`/`height` from its pixel size. Only attached pictures can be shown; a mod
  cannot add image files of its own, and must never redraw an attached picture.
- `behaviors[]`: `trigger` is one of `idle`, `click`, `dblclick`, `drop`, `hour`,
  `wake`, `sleep`, `lean`, `desk` (Kori sits down at the desk), `ultimate` (the
  ultimate form begins), `donate`, `upgrade`, `desk-done` (a typing session at the desk
  ends; `{minutes}` in `say`), `desk-long` (the same, for sessions of 20 minutes or
  more), `app-switch` (the user moved to another app; at most once per 20 seconds),
  `interval` (needs `every` >= 30000 ms). `chance` 0-1 (default 1). `action` may
  combine:
  - `animate`: built-in `frost`, `huff`, `shrug`, `think`, `wave`, `surprised`,
    `stamp` (desk only), `release` (the full Frost Release, use sparingly), or one
    of your animation names;
  - `say`: a string or array of strings (`{hour}` is substituted on `hour`);
  - `prop`: `{ id, show: true|false }` or `{ id, toggle: true }`;
  - `sound`: one built-in sound effect: `pop`, `boop`, `whee`, `land`, `land-hard`,
    `shimmer`, `coin`, `yawn`, `chirp`, `fanfare`, `womp`, `hum`, `tick`, `freeze`,
    `chime`, `blizzard`, `stamp`, `scribble`, `huff`. Mods cannot add audio files.
  When a mod handles `idle`, `click`, `dblclick`, `drop`, `wake`, `hour`, or `desk`,
  the built-in reaction for that event is skipped that time.

### Counting (the only memory a mod has)
A behavior may carry `count: { name: 'sessions', every: 5 }` and/or
`count: { name: 'sessions', at: [10, 50, 100] }`. Each time its trigger fires, the
saved count `name` (per mod, kept on the user's computer across restarts and sleep)
goes up by one, and the action runs only when the count is a multiple of `every` or
equals a number in `at`. `{count}` in `say` is replaced with the number. Example:
`{ trigger: 'desk-done', count: { name: 'sessions', every: 5 }, action: { animate: 'wave', say: 'Session {count}. Acceptable.' } }`
There is no other storage: no dates, scores, or settings.

### Poses and props
- `action.animate` may name a built-in pose only if the prompt lists it as one the
  character has drawn. Never ask for a pose that is not listed, and never imitate one
  (a "nod", a "blink") with shapes or motion.
- Props are small add-ons on top of or beside the character (a hat, something held,
  something on the desk). Never clothing or anything that covers the body or face or
  changes the outfit.

### What a mod cannot do
- Touch anything under `src/`, `docs/`, `prompts/`, `characters/`, `package.json`, or
  `.claude/`. Runs that do are reverted automatically.
- Use `fetch`, `XMLHttpRequest`, `WebSocket`, `import`, `require`, `eval`, timers
  outside `interval` behaviors, or DOM access outside the API. Keep `mod.js` to
  the single `register` call plus constants.
- Depend on other mods.
- Reproduce copyrighted characters, artwork, dialogue, or audio. Every
  mod must be original.

### Style guide
The upgrade request gives the active character's name and personality; write every
line in that voice. For the test character, Kori is a young, serious officer of the (fictional) Frost Registry: mature beyond
his years, diligent, prickly about being called small or cute, irritated by
showing off and goofing around, cool toward most people but quietly protective of
the few he trusts, and miserable in hot weather. He works fast so he can get back to
his hobby: cataloging unique snowflake specimens. Speaks in short, clipped sentences
with dry humor, procedure jokes, and cold puns. Tolerates teasing without lashing
out. Never cruel. Short lines land best.
