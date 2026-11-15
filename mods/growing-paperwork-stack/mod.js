BuddyMods.register({
  id: 'growing-paperwork-stack',
  name: 'Growing paperwork stack',
  quips: [
    { text: 'The pile does not shrink while I watch it.', tags: ['desk'] },
    { text: '{name} does not look at the pile. The pile is patient.', tags: ['desk'] },
    { text: 'Every form in this stack needs a signature. Mine.', tags: ['desk-writing'] },
    { text: 'Filing is not optional. Neither is the pile.', tags: ['desk-break'] },
  ],
  props: [
    {
      id: 'paper-pile',
      anchor: 'desk',
      hidden: true,
      svg: '<g fill="#efe9d8" stroke="#6f6656" stroke-width="0.6">' +
           '<rect x="100" y="124" width="22" height="10" rx="0.8"/>' +
           '<rect x="101" y="119" width="21" height="5.5" rx="0.8"/>' +
           '<rect x="102" y="113" width="20" height="5.5" rx="0.8"/>' +
           '</g>',
    },
  ],
  behaviors: [
    {
      trigger: 'desk-done',
      count: { name: 'sheets', at: [3, 6, 9] },
      action: {
        prop: { id: 'paper-pile', show: true },
        say: 'Sheet {count} on the pile. The backlog is no longer a rumour.',
      },
    },
  ],
});
