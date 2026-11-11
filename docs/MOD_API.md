# Kori Buddy Mod API

A mod is one folder `mods/<slug>/` containing `mod.js` (and optionally `NOTES.md`).
`mod.js` is plain browser JavaScript, loaded with a `<script>` tag into the pet's
page. It has no Node, no `require`, no network. It must call
`AskinMods.register({...})` exactly once at top level. (The `Askin` prefix is a
historical name kept for compatibility.)

The pet is Kori, an original plush-style ice chibi (huge head, tiny body, stubby
limbs) drawn as an SVG with id `pet-svg` inside `#pet > #flip > #sprite`. Part ids
you can target from CSS: `#head`, `#face`, `#lids`, `#mouth`, `#hair-front`,
`#hair-back`, `#cowlick`, `#clip`, `#torso`, `#pin`, `#arm-l`, `#arm-r`, `#leg-l`,
`#leg-r`, `#orb` (an ice crystal, shown during the `frost` trick and while an
upgrade runs), `#quill` and `#stamp` (shown at the desk), `#desk`, `#papers`,
`#halo`, `#snow-cloak`, `#sigil`, `#shadow`, `#zzz`.

Prop anchors are empty `<g>` elements: `#props-head`, `#props-hand-r`,
`#props-hand-l`, `#props-back` (behind everything), `#props-front` (in front of
everything), `#props-desk` (on the desk, visible only in desk mode).

If the user has picked a skin (their own image), limb parts don't exist; props and
the desk still work, and limb animations simply do nothing.

After a donation the pet enters the **ultimate form** for about 30 seconds: the
`ultimate` class is on `#pet` (plus `has-ultimate` when the skin has its own
ultimate image), with the halo, snow cloak, and sigil held up. Mods can react with
the `ultimate` trigger or style `#pet.ultimate ...`.

## register(def)

```js
AskinMods.register({
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
- `quips[].text` <= 240 chars; `tags` is an array. Useful tags: `idle`, `greet`,
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
- `behaviors[]`: `trigger` is one of `idle`, `click`, `dblclick`, `drop`, `hour`,
  `wake`, `sleep`, `lean`, `desk` (Kori sits down at the desk), `ultimate` (the
  ultimate form begins), `donate`, `upgrade`, `interval` (needs `every` >= 30000 ms). `chance` 0-1 (default 1). `action` may
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

### What a mod cannot do
- Touch anything under `src/`, `docs/`, `prompts/`, `skins/`, `package.json`, or
  `.claude/`. Runs that do are reverted automatically.
- Use `fetch`, `XMLHttpRequest`, `WebSocket`, `import`, `require`, `eval`, timers
  outside `interval` behaviors, or DOM access outside the API. Keep `mod.js` to
  the single `register` call plus constants.
- Depend on other mods.
- Reproduce copyrighted characters, artwork, dialogue, or audio. Kori and every
  mod must be original.

### Style guide
Kori is a young, serious officer of the (fictional) Frost Registry: mature beyond
his years, diligent, prickly about being called small or cute, irritated by
showing off and goofing around, cool toward most people but quietly protective of
the few he trusts, and miserable in hot weather. He works fast so he can get back to
his hobby: cataloging unique snowflake specimens. Speaks in short, clipped sentences
with dry humor, procedure jokes, and cold puns. Tolerates teasing without lashing
out. Never cruel. Short lines land best.
