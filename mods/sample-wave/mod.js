// Sample mod: proves the pipeline. A lazy two-finger salute on click, a tiny
// red Hagal rune pin (from his Soul King Palace cloak) on his chest, and a few quips.
AskinMods.register({
  id: 'sample-wave',
  name: 'Lazy salute',
  quips: [
    { text: 'That was a salute. The lazy kind. The only kind.', tags: ['click', 'salute'] },
    { text: 'The pin is a Hagal rune. It means "hail". I mean "nap".', tags: ['idle'] },
  ],
  animations: {
    'lazy-salute': {
      durationMs: 1600,
      css: `#pet.anim-lazy-salute #arm-r { animation: lazySalute 1.6s ease-in-out; }
            #pet.anim-lazy-salute #head { transform: rotate(-4deg); transition: transform 300ms ease; }
            @keyframes lazySalute { 0% { transform: rotate(0); } 30% { transform: rotate(-150deg); } 70% { transform: rotate(-160deg); } 100% { transform: rotate(0); } }`,
    },
  },
  props: [
    {
      id: 'hagal-pin',
      anchor: 'front',
      svg: '<g transform="translate(64,121) scale(0.8)" stroke="#b3122e" stroke-width="1.8" stroke-linecap="round" fill="none"><line x1="-3" y1="-4.5" x2="-3" y2="4.5"/><line x1="3" y1="-4.5" x2="3" y2="4.5"/><line x1="-3" y1="-1.5" x2="3" y2="1.5"/></g>',
    },
    {
      // The amber shades from his casual look; toggled on click.
      id: 'shades',
      anchor: 'head',
      hidden: true,
      svg: '<g stroke="#a8843c" stroke-width="1.6"><rect x="49" y="68" width="27" height="19" rx="7" fill="rgba(196,146,70,0.55)"/><rect x="84" y="68" width="27" height="19" rx="7" fill="rgba(196,146,70,0.55)"/><path d="M76,73 L84,73" fill="none"/><path d="M49,72 L39,70" fill="none"/><path d="M111,72 L121,70" fill="none"/></g>',
    },
  ],
  behaviors: [
    { trigger: 'click', chance: 0.3, action: { animate: 'lazy-salute', say: ['Salute. Minimal.', 'Two fingers. All you get.'] } },
    { trigger: 'click', chance: 0.25, action: { prop: { id: 'shades', toggle: true }, say: ['Deluxe shades.', 'Shades. For the glare of your monitor.'] } },
  ],
});
