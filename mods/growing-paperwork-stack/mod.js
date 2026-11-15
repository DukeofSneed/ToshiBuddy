// A paper tower on the desk. Every 45 seconds of typing at the desk adds a
// bundle of pages (desk-active fires every 15 s; three of them per bundle).
// After eight bundles the tower is taller than he is; half a minute later it
// rains down over him, he gets up, huffs, says so, and sits back down at an
// empty desk. About six and a half minutes of typing per round. The pile is
// drawn from the saved count, so it survives restarts.
(() => {
const SLUG = 'growing-paperwork-stack';
const BUNDLES = 8;
const TICKS_PER_BUNDLE = 3; // 3 x 15 s = 45 s
const RAIN_AT = 26; // 8 bundles at 24, then the tower stands for 30 s

const PAPER = 'fill="#efe9d8" stroke="#6f6656" stroke-width="0.5"';
const bundle = (i) => {
  const base = 128 - i * 19;
  let svg = '';
  for (let k = 0; k < 6; k++) {
    const y = base - (k + 1) * 3.15;
    const x = 23 + (((i * 5 + k * 3) % 5) - 2) * 0.5; // slightly uneven
    svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="15" height="2.7" rx="0.4" ${PAPER}/>`;
  }
  // the higher it gets, the more it leans (away from him)
  const tilt = (-i * 0.3).toFixed(2);
  return {
    id: `bundle-${i + 1}`,
    anchor: 'desk',
    showAfter: { count: 'ticks', at: (i + 1) * TICKS_PER_BUNDLE },
    svg: `<g transform="rotate(${tilt} 30 ${base})">${svg}</g>`,
  };
};

// Loose pages falling across the desk and over him; each starts at its own spot.
const DROPS = [
  [24, -10, 0.0, -6, 210], [40, -30, 0.15, 10, -160], [56, -18, 0.3, -4, 260], [72, -40, 0.1, 8, -220],
  [88, -12, 0.35, -10, 180], [104, -34, 0.2, 6, -240], [120, -20, 0.45, -8, 200], [34, -50, 0.55, 12, -180],
  [64, -60, 0.6, -6, 230], [96, -55, 0.7, 4, -200], [128, -45, 0.5, -12, 250], [48, -70, 0.8, 8, -210],
];
const rain = {
  id: 'rain',
  anchor: 'desk',
  hidden: true,
  svg: `<g class="gps-rain">${DROPS.map(([x, y, delay, dx, r]) =>
    `<rect x="${x}" y="${y}" width="12" height="9" rx="0.6" ${PAPER} style="--dx:${dx}px;--r:${r}deg;animation-delay:${delay}s"/>`).join('')}</g>`,
};

BuddyMods.register({
  id: SLUG,
  name: 'Growing paperwork stack',
  animations: {
    'paper-rain': {
      durationMs: 2600,
      css: `#pet .gps-rain rect { transform-box: fill-box; transform-origin: center; opacity: 0; animation: gpsFall 1.8s ease-in forwards; }
            @keyframes gpsFall {
              0% { transform: translate(0, 0) rotate(0deg); opacity: 0; }
              12% { opacity: 1; }
              85% { opacity: 1; }
              100% { transform: translate(var(--dx), 190px) rotate(var(--r)); opacity: 0; }
            }`,
    },
  },
  quips: [
    { text: 'The pile does not shrink while I watch it.', tags: ['desk'] },
    { text: '{name} does not look at the pile. The pile is patient.', tags: ['desk'] },
    { text: 'Every form in this stack needs a signature. Mine.', tags: ['desk-writing'] },
    { text: 'Filing is not optional. Neither is the pile.', tags: ['desk-break'] },
  ],
  props: [...Array.from({ length: BUNDLES }, (_, i) => bundle(i)), rain],
  behaviors: [
    {
      trigger: 'desk-active',
      count: { name: 'ticks', at: [RAIN_AT], cycle: RAIN_AT },
      action: {
        prop: { id: 'rain', show: true, for: 2600 },
        standUp: { after: 1700 },
        animate: 'huff',
        say: 'Damn it! Work never ends',
      },
    },
  ],
});
})();
