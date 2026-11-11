// Chibi Askin Nakk le Vaar as layered SVG, styled after the official TYBW mascot
// plush: huge wide head, simple flat face, tiny body with short stubby limbs.
// Every movable part has an id so CSS keyframes (styles.css) and mods (props)
// can address it.
//
// Design checklist (plush style + Sternritter outfit):
// - Head: wide, rounded, wider than tall; pale skin; small ears at eye level.
// - Hair: black, slicked back with an M-shaped hairline; wavy top; jagged locks
//   falling behind the ears to jaw level; one thin strand from the part with a
//   zigzag at the end.
// - Face: big sleepy oval eyes under a flat heavy lid line, short kinked brows,
//   tiny cat mouth with the tongue out. No nose, no realistic lines.
// - Body: short and stubby. White shirt with a lavender-gray ribbed V collar,
//   curved waist bands meeting at a gray disc brooch, puffy white harem pants
//   tucked into short black boots with knob hoops, three bracers (magenta, pink,
//   orange) on his left wrist (viewer's right).
(function () {
  const SKIN = '#f6e7dc';
  const SKIN_SHADE = '#e8cfc1';
  const LINE = '#262028';
  const HAIR = '#1b2320';
  const HAIR_HI = '#3d4a45';
  const WHITE = '#fdfcf9';
  const WHITE_SHADE = '#e6e3ec';
  const RIB = '#cbc5de';
  const RIB_LINE = '#8a83a6';
  const IRIS = '#7d6aa8';
  const IRIS_DARK = '#3e3157';
  const BOOT = '#1a181d';

  function svg() {
    return `
<svg id="askin-svg" viewBox="0 0 160 200" xmlns="http://www.w3.org/2000/svg" stroke-linejoin="round" stroke-linecap="round">
  <defs>
    <radialGradient id="orbGrad" cx="38%" cy="32%" r="70%">
      <stop offset="0" stop-color="#e2c6ff"/>
      <stop offset="0.55" stop-color="#6a2bbf"/>
      <stop offset="1" stop-color="#1a0630"/>
    </radialGradient>
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="3.5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <ellipse id="shadow" cx="80" cy="191" rx="30" ry="4" fill="rgba(0,0,0,0.3)"/>
  <g id="props-back"></g>

  <!-- hair mass behind the head: wavy swept-back top, jagged locks to the jaw -->
  <g id="hair-back">
    <path d="M80,8 C88,4 98,6.5 104,9 C112,8 118,12 121,18 C128,25 133,35 133,46 C134.5,60 134.5,72 132.5,80.5
             L136.5,88.5 L131,88.5 C131,94 129.5,99 126.5,103 L129.5,111 L121,105.5 L116,104 L44,104 L39,105.5 L30.5,111 L33.5,103
             C30.5,99 29,94 29,88.5 L23.5,88.5 L27.5,80.5 C25.5,72 25.5,60 27,46 C27,35 32,25 39,18
             C42,12 48,8 56,9 C62,6.5 72,4 80,8 Z"
          fill="${HAIR}" stroke="${LINE}" stroke-width="1.6"/>
    <path d="M126,86 L131,90" stroke="${HAIR_HI}" stroke-width="1.4" fill="none"/>
    <path d="M34,86 L29,90" stroke="${HAIR_HI}" stroke-width="1.4" fill="none"/>
  </g>

  <!-- stubby legs: puffy harem pants tucked into short pointed boots -->
  <g id="leg-l" class="leg">
    <path d="M58,140 L80.5,141 C82,151 81.5,159 78.5,165.5 L62,165.5 C53.5,161.5 51.5,149.5 58,140 Z" fill="${WHITE}" stroke="${LINE}" stroke-width="1.6"/>
    <path d="M60,150 C58.5,156 60,161 63,164" stroke="${WHITE_SHADE}" stroke-width="2" fill="none"/>
    <path d="M72.5,148 C74,154 73.5,160 71.5,164" stroke="${WHITE_SHADE}" stroke-width="1.8" fill="none"/>
    <rect x="62" y="163.5" width="16" height="4.2" rx="1.5" fill="${RIB}" stroke="${RIB_LINE}" stroke-width="1"/>
    <path d="M62.5,167.5 L77.5,167.5 L78,179 C78.5,183.5 73.5,185.8 66,185.8 C61,185.8 59,184 60.5,180.5 Z" fill="${BOOT}" stroke="${LINE}" stroke-width="1.4"/>
    <path d="M59.8,184.2 C65,186 73,186 78,183" stroke="#77727f" stroke-width="1.4" fill="none"/>
    <circle cx="70" cy="171" r="2.3" fill="#9c97a8" stroke="#5c5866" stroke-width="1"/>
  </g>
  <g id="leg-r" class="leg">
    <path d="M102,140 L79.5,141 C78,151 78.5,159 81.5,165.5 L98,165.5 C106.5,161.5 108.5,149.5 102,140 Z" fill="${WHITE}" stroke="${LINE}" stroke-width="1.6"/>
    <path d="M100,150 C101.5,156 100,161 97,164" stroke="${WHITE_SHADE}" stroke-width="2" fill="none"/>
    <path d="M87.5,148 C86,154 86.5,160 88.5,164" stroke="${WHITE_SHADE}" stroke-width="1.8" fill="none"/>
    <rect x="82" y="163.5" width="16" height="4.2" rx="1.5" fill="${RIB}" stroke="${RIB_LINE}" stroke-width="1"/>
    <path d="M97.5,167.5 L82.5,167.5 L82,179 C81.5,183.5 86.5,185.8 94,185.8 C99,185.8 101,184 99.5,180.5 Z" fill="${BOOT}" stroke="${LINE}" stroke-width="1.4"/>
    <path d="M100.2,184.2 C95,186 87,186 82,183" stroke="#77727f" stroke-width="1.4" fill="none"/>
    <circle cx="90" cy="171" r="2.3" fill="#9c97a8" stroke="#5c5866" stroke-width="1"/>
  </g>

  <!-- stubby torso: white shirt, ribbed V collar, curved waist bands, disc brooch -->
  <g id="torso">
    <path d="M60,104 L100,104 C103,116 104.5,128 104.5,141 Q80,146 55.5,141 C55.5,128 57,116 60,104 Z" fill="${WHITE}" stroke="${LINE}" stroke-width="1.6"/>
    <path d="M56.5,104 L103.5,104 L80,127 Z" fill="${RIB}" stroke="${LINE}" stroke-width="1.5"/>
    <path d="M63,105.5 L80,122 L97,105.5" stroke="${RIB_LINE}" stroke-width="1.2" fill="none"/>
    <path d="M69.5,105.5 L80,116.5 L90.5,105.5" stroke="${RIB_LINE}" stroke-width="1.2" fill="none"/>
    <path d="M74.5,104 L80,111 L85.5,104 Z" fill="${SKIN}" stroke="${LINE}" stroke-width="1.1"/>
    <path d="M57,133 Q80,147 103,133" stroke="${LINE}" stroke-width="6" fill="none"/>
    <path d="M57,133 Q80,147 103,133" stroke="${RIB}" stroke-width="3.6" fill="none"/>
    <circle cx="80" cy="140" r="4.6" fill="#9c97a8" stroke="${LINE}" stroke-width="1.4"/>
    <circle cx="80" cy="140" r="2" fill="none" stroke="#5c5866" stroke-width="1.1"/>
  </g>

  <!-- short stubby arms; bracers on his left wrist (viewer's right) -->
  <g id="arm-l">
    <path d="M61,107 C54.5,111 50.5,119 49,128 L57.5,130 C58.5,123 60.5,117 64,112.5 Z" fill="${WHITE}" stroke="${LINE}" stroke-width="1.5"/>
    <circle cx="53" cy="132" r="4.8" fill="${SKIN}" stroke="${LINE}" stroke-width="1.3"/>
    <g id="props-hand-l"></g>
  </g>
  <g id="arm-r">
    <path d="M99,107 C105.5,111 109.5,119 111,128 L102.5,130 C101.5,123 99.5,117 96,112.5 Z" fill="${WHITE}" stroke="${LINE}" stroke-width="1.5"/>
    <path d="M100.6,120 L108.6,118.4" stroke="${LINE}" stroke-width="3.8" fill="none"/>
    <path d="M100.6,120 L108.6,118.4" stroke="#c2185b" stroke-width="2.4" fill="none"/>
    <path d="M101.4,123.4 L109.6,121.8" stroke="${LINE}" stroke-width="3.8" fill="none"/>
    <path d="M101.4,123.4 L109.6,121.8" stroke="#f06292" stroke-width="2.4" fill="none"/>
    <path d="M102,126.8 L110.4,125.2" stroke="${LINE}" stroke-width="3.8" fill="none"/>
    <path d="M102,126.8 L110.4,125.2" stroke="#ff9800" stroke-width="2.4" fill="none"/>
    <circle cx="110.6" cy="121.8" r="2.1" fill="#9c97a8" stroke="${LINE}" stroke-width="0.9"/>
    <circle cx="107" cy="132" r="4.8" fill="${SKIN}" stroke="${LINE}" stroke-width="1.3"/>
    <g id="orb"><circle cx="107" cy="137" r="9" fill="url(#orbGrad)" filter="url(#glow)"/><circle cx="104" cy="133" r="1.9" fill="#fff" opacity="0.85"/></g>
    <g id="props-hand-r"></g>
  </g>

  <!-- big plush head -->
  <g id="head">
    <ellipse cx="36.5" cy="76" rx="5" ry="7" fill="${SKIN}" stroke="${LINE}" stroke-width="1.4"/>
    <ellipse cx="123.5" cy="76" rx="5" ry="7" fill="${SKIN}" stroke="${LINE}" stroke-width="1.4"/>
    <path d="M38,60 C38,40 54,30 80,30 C106,30 122,40 122,60 L122,82 C122,98 108,108 80,108 C52,108 38,98 38,82 Z"
          fill="${SKIN}" stroke="${LINE}" stroke-width="1.8"/>

    <g id="face">
      <!-- short kinked brows -->
      <path d="M54.5,62.5 L60,59.6 L64.5,62 L70.5,59.2" stroke="${LINE}" stroke-width="2.2" fill="none"/>
      <path d="M89.5,59.2 L95.5,62 L100,59.6 L105.5,62.5" stroke="${LINE}" stroke-width="2.2" fill="none"/>
      <!-- big sleepy oval eyes -->
      <ellipse cx="62" cy="78" rx="10.5" ry="9" fill="#ffffff" stroke="${LINE}" stroke-width="1.2"/>
      <ellipse cx="98" cy="78" rx="10.5" ry="9" fill="#ffffff" stroke="${LINE}" stroke-width="1.2"/>
      <ellipse cx="62.5" cy="80" rx="7.6" ry="7.4" fill="${IRIS}"/>
      <ellipse cx="97.5" cy="80" rx="7.6" ry="7.4" fill="${IRIS}"/>
      <ellipse cx="62.5" cy="80.8" rx="4" ry="4" fill="${IRIS_DARK}"/>
      <ellipse cx="97.5" cy="80.8" rx="4" ry="4" fill="${IRIS_DARK}"/>
      <circle cx="59.5" cy="77.6" r="1.9" fill="#ffffff"/>
      <circle cx="94.5" cy="77.6" r="1.9" fill="#ffffff"/>
      <circle cx="65.3" cy="84" r="1" fill="#ffffff" opacity="0.8"/>
      <circle cx="100.3" cy="84" r="1" fill="#ffffff" opacity="0.8"/>
      <!-- heavy flat upper lids; scaleY closes them -->
      <g id="lids">
        <path d="M50,66 L74,66 L74,73.6 L50,74.6 Z" fill="${SKIN}"/>
        <path d="M86,66 L110,66 L110,74.6 L86,73.6 Z" fill="${SKIN}"/>
        <path d="M50.2,74.8 L73.8,72.8" stroke="${LINE}" stroke-width="2.8" fill="none" vector-effect="non-scaling-stroke"/>
        <path d="M86.2,72.8 L109.8,74.8" stroke="${LINE}" stroke-width="2.8" fill="none" vector-effect="non-scaling-stroke"/>
      </g>
      <!-- tiny cat mouth, tongue out -->
      <g id="mouth">
        <path d="M77.6,96.4 Q80,101.8 82.4,96.4 Z" fill="#e8909c" stroke="${LINE}" stroke-width="1.1"/>
        <path d="M73,94.6 Q76.5,98.4 80,95 Q83.5,98.4 87,94.6" stroke="${LINE}" stroke-width="1.7" fill="none"/>
      </g>
    </g>

    <!-- slicked-back hair over the top of the head: M-shaped hairline -->
    <g id="hair-front">
      <path d="M37,68 C33,42 50,18 80,18 C110,18 127,42 123,68 L119.5,66 C118.5,55 114,48 106,45 C98,42.5 90,43.5 84,48.5
               C79,43.5 70,41.5 61,43.5 C51,46.5 43.5,54 40.5,66 Z"
            fill="${HAIR}" stroke="${LINE}" stroke-width="1.5"/>
      <path d="M52,40 C54,32 60,26 68,22" stroke="${HAIR_HI}" stroke-width="2" fill="none"/>
      <path d="M108,40 C106,32 100,26 92,22" stroke="${HAIR_HI}" stroke-width="2" fill="none"/>
      <path d="M78,26 C80,23 83,21 87,20" stroke="${HAIR_HI}" stroke-width="1.6" fill="none"/>
      <!-- the thin strand from the part, ending in a little zigzag -->
      <path id="strand" d="M83.6,46.5 C87.2,53 88.8,60 88,67 C87.5,71 86.2,73.4 88.4,76 L85.8,79.6 L88.8,82.6 L86.8,86.2"
            stroke="${HAIR}" stroke-width="2.4" fill="none"/>
    </g>
    <g id="props-head"></g>
  </g>
  <g id="props-front"></g>
  <text id="zzz" x="118" y="28">z z z</text>
</svg>`;
  }

  window.AskinSprite = { svg };
})();
