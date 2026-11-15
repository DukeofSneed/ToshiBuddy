// Each finished typing session at the desk adds one sheet to a stack beside
// him (up to nine). The stack is drawn from the saved count, so it is still
// there after a restart. At 3, 6 and 9 sheets he says a line about it.
(() => {
const SHEETS = 9;
const sheet = (i) => {
  const y = 132 - i * 2.2;
  const x = 100 + ((i * 7) % 3) - 1; // slightly uneven, like a real pile
  return {
    id: `sheet-${i + 1}`,
    anchor: 'desk',
    showAfter: { count: 'sheets', at: i + 1 },
    svg: `<rect x="${x}" y="${y}" width="22" height="2.6" rx="0.5" fill="#efe9d8" stroke="#6f6656" stroke-width="0.5"/>`,
  };
};

BuddyMods.register({
  id: 'growing-paperwork-stack',
  name: 'Growing paperwork stack',
  quips: [
    { text: 'The pile does not shrink while I watch it.', tags: ['desk'] },
    { text: '{name} does not look at the pile. The pile is patient.', tags: ['desk'] },
    { text: 'Every form in this stack needs a signature. Mine.', tags: ['desk-writing'] },
    { text: 'Filing is not optional. Neither is the pile.', tags: ['desk-break'] },
  ],
  props: Array.from({ length: SHEETS }, (_, i) => sheet(i)),
  behaviors: [
    {
      trigger: 'desk-done',
      count: { name: 'sheets', at: [3, 6, 9] },
      action: {
        say: 'Sheet {count} on the pile. The backlog is no longer a rumour.',
      },
    },
  ],
});
})();
