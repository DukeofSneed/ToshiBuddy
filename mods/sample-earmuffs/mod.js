// Sample mod: proves the pipeline. Fluffy earmuffs that Kori puts on or takes
// off when clicked, a "salute" animation, and a few quips.
AskinMods.register({
  id: 'sample-earmuffs',
  name: 'Earmuffs and salute',
  quips: [
    { text: 'These are regulation earmuffs. They are not cute. Stop saying that.', tags: ['idle', 'earmuffs'] },
    { text: 'Salute received. Now get back to work.', tags: ['click', 'salute'] },
  ],
  animations: {
    salute: {
      durationMs: 1500,
      css: `#pet.anim-salute #arm-r { animation: koriSalute 1.5s ease-in-out; }
            #pet.anim-salute #head { transform: rotate(-3deg); transition: transform 300ms ease; }
            @keyframes koriSalute { 0% { transform: rotate(0); } 25% { transform: rotate(-150deg); } 75% { transform: rotate(-155deg); } 100% { transform: rotate(0); } }`,
    },
  },
  props: [
    {
      id: 'earmuffs',
      anchor: 'head',
      hidden: true,
      svg: '<g stroke="#1f2a40" stroke-width="1.4"><path d="M40,60 C40,28 120,28 120,60" fill="none" stroke="#33508e" stroke-width="4"/><circle cx="39" cy="72" r="11" fill="#ffffff"/><circle cx="121" cy="72" r="11" fill="#ffffff"/><circle cx="39" cy="72" r="5" fill="#bfe3ff" stroke="none"/><circle cx="121" cy="72" r="5" fill="#bfe3ff" stroke="none"/></g>',
    },
  ],
  behaviors: [
    { trigger: 'click', chance: 0.3, action: { animate: 'salute', say: ['Salute received. Now get back to work.', 'Acknowledged.'] } },
    { trigger: 'click', chance: 0.25, action: { prop: { id: 'earmuffs', toggle: true }, sound: 'chirp', say: ['Earmuffs. For the draft. Not for style.', 'It is cold in here. Do not comment.'] } },
  ],
});
