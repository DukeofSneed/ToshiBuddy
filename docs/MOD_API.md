# Askin Buddy Mod API

A mod is one folder `mods/<slug>/` containing `mod.js` (and optionally `NOTES.md`).
`mod.js` is plain browser JavaScript, loaded with a `<script>` tag into the pet's
page. It has no Node, no `require`, no network. It must call
`AskinMods.register({...})` exactly once at top level.

The pet is a plush-style chibi (huge head, tiny body, stubby limbs) drawn as an SVG
with id `askin-svg` inside `#pet > #flip > #sprite`. Part ids you can target from
CSS: `#head`, `#face`, `#lids`, `#mouth`, `#hair-front`, `#hair-back`, `#strand`,
`#torso`, `#arm-l`, `#arm-r`, `#leg-l`, `#leg-r`, `#orb` (the Gift Ball, hidden
unless the `giftball` or `working` class is on `#pet`), `#shadow`, `#zzz`.
Prop anchors are empty `<g>` elements: `#props-head`, `#props-hand-r`, `#props-hand-l`,
`#props-back` (behind everything), `#props-front` (in front of everything).

## register(def)

```js
AskinMods.register({
  id: 'party-hat',                 // must equal the folder slug: a-z, 0-9, -
  name: 'Party hat',
  quips: [                         // optional, max 200
    { text: 'A hat. On me. Deluxe.', tags: ['idle', 'hat'] },
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
      svg: '<polygon points="80,-10 62,30 98,30" fill="#ff5fa2" stroke="#26262a" stroke-width="2"/>' },
  ],
  behaviors: [                     // optional, max 30
    { trigger: 'click', chance: 0.3, action: { animate: 'hat-tip', say: ['Hat tip.', 'Deluxe tip.'] } },
    { trigger: 'hour', action: { prop: { id: 'cone', toggle: true } } },
    { trigger: 'interval', every: 600000, chance: 0.5, action: { say: 'Still wearing it.' } },
  ],
});
```

### Rules the loader enforces
- `id`: required, 2-40 chars of `a-z0-9-`.
- `quips[].text` <= 240 chars; `tags` is an array. Useful tags: `idle`, `greet`, `lean`,
  `click`, `drag`, `drop`, `wake`, `hour`, `trick`, `upgrade`, `time:morning`,
  `time:afternoon`, `time:evening`, `time:night`. Untagged quips count as `idle`.
- `animations[name].css`: full CSS text, <= 20k chars, no `@import`, no `url(`.
  Play it by adding the class `anim-<name>` to `#pet`, which the brain does for you
  when a behavior's `action.animate` names it. Scope every selector under
  `#pet.anim-<name>` so it cannot leak. Reserved names: idle, walk, lean, sleep,
  drag, fall, land, talk, blink, face-left, face-right.
- `props[]`: `svg` is an SVG fragment (<= 20k chars) placed inside the anchor group;
  no `<script>`, `<foreignObject>`, event attributes, `href`, or `url(`. Coordinates
  are in the pet's 160x200 viewBox: the face spans x 38-122, y 30-108 (eyes at
  (62, 78) and (98, 78), mouth at (80, 96)); the top of the hair is at y=8, so a hat
  sits around y 0-20; the hands are at (53, 132) and (107, 132); the waist is at
  y=140; the feet are at y=186. The pet faces right by default; the whole sprite
  is mirrored when walking left. Voice is synthesized animalese, not speech.
  `hidden: true` starts the prop invisible; toggle it from a behavior.
- `behaviors[]`: `trigger` is one of `idle`, `click`, `dblclick`, `drop`, `hour`,
  `wake`, `sleep`, `lean`, `donate`, `upgrade`, `interval` (needs `every` >= 30000 ms).
  `chance` 0-1 (default 1). `action` may combine `animate` (built-in: `giftball`,
  `shrug`, `think`, `wave`, `surprised`, or one of your animation names), `say`
  (string or array of strings; `{hour}` is substituted on `hour`), and
  `prop: { id, show: true|false }` or `prop: { id, toggle: true }`, and `sound`
  (one built-in sound effect: `pop`, `boop`, `whee`, `land`, `land-hard`, `shimmer`,
  `coin`, `yawn`, `chirp`, `fanfare`, `womp`, `hum`, `tick`). Mods cannot add audio files.
  When a mod handles `idle`, `click`, `dblclick`, `drop`, `wake`, or `hour`, the
  built-in reaction for that event is skipped that time.

### What a mod cannot do
- Touch anything under `src/`, `docs/`, `prompts/`, `package.json`, or `.claude/`.
  Runs that do are reverted automatically.
- Use `fetch`, `XMLHttpRequest`, `WebSocket`, `import`, `require`, `eval`, timers
  outside `interval` behaviors, or DOM access outside the API. Keep `mod.js` to
  the single `register` call plus constants.
- Depend on other mods.

### Style guide
Askin Nakk le Vaar is lazy, dry, unbothered, quietly smug, fond of the words
"deluxe" and "lethal dose", and never raises his voice. Short lines land best.
