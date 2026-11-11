// Kori: an original ice-themed chibi drawn as layered SVG in plush proportions
// (huge head, tiny body, stubby limbs). Every movable part has an id so CSS
// keyframes (styles.css) and mods (props) can address it.
//
// Design: navy bob with frosted tips and blunt choppy bangs, an icicle-curl
// cowlick, a snowflake hair clip; serious frost-blue eyes under furrowed brows,
// pink cold cheeks, a small pout; puffy pale-blue duffel coat with wooden
// toggles and a white fur collar; navy mittens; navy leggings and fluffy white
// snow boots. Props: an ice crystal (tricks), an icicle quill and a stamp (desk).
//
// A user skin (skins/<name>/) swaps the drawn body for the user's own image while
// keeping the desk, Frost Release effects, props, and shadow. A skin may also have
// an ultimate image that replaces the primary one during the ultimate form.
(function () {
  const SKIN = '#fbeee6';
  const LINE = '#1f2a40';
  const HAIR_DARK = '#1f3466';
  const COAT = '#c4e2fa';
  const COAT_SHADE = '#a2cdef';
  const COAT_LINE = '#6f9fca';
  const FUR = '#ffffff';
  const MITTEN = '#33508e';
  const LEGGING = '#2b3f73';
  const WOOD = '#c58b55';
  const WOOD_DARK = '#6d4524';

  const DEFS = `
  <defs>
    <linearGradient id="hairBack" x1="0" y1="12" x2="0" y2="106" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#1c2f5e"/><stop offset="0.74" stop-color="#2a4a8c"/><stop offset="1" stop-color="#a9dcff"/>
    </linearGradient>
    <linearGradient id="hairFront" x1="0" y1="18" x2="0" y2="66" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#22386c"/><stop offset="0.8" stop-color="#2d4f92"/><stop offset="1" stop-color="#8fcdfb"/>
    </linearGradient>
    <radialGradient id="irisGrad" cx="50%" cy="72%" r="65%">
      <stop offset="0" stop-color="#b9e4ff"/><stop offset="0.55" stop-color="#5fb1ef"/><stop offset="1" stop-color="#2a6fb3"/>
    </radialGradient>
    <linearGradient id="crystalGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#bfe8ff"/><stop offset="1" stop-color="#5aa9e6"/>
    </linearGradient>
    <linearGradient id="cloakGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e9f7ff" stop-opacity="0.95"/><stop offset="1" stop-color="#7cc4f5" stop-opacity="0.35"/>
    </linearGradient>
    <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="3" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>`;

  // ---- Frost Release pieces (hidden unless #pet.release) ----
  function snowflake(cx, cy, r, extra = '') {
    let d = '';
    for (let i = 0; i < 3; i++) {
      const a = (Math.PI / 3) * i;
      const dx = Math.cos(a) * r, dy = Math.sin(a) * r;
      d += `M${(cx - dx).toFixed(1)},${(cy - dy).toFixed(1)} L${(cx + dx).toFixed(1)},${(cy + dy).toFixed(1)} `;
      for (const s of [-1, 1]) {
        const bx = cx + s * dx * 0.6, by = cy + s * dy * 0.6;
        const b = r * 0.28;
        d += `M${bx.toFixed(1)},${by.toFixed(1)} L${(bx + Math.cos(a + s * 2.4) * b).toFixed(1)},${(by + Math.sin(a + s * 2.4) * b).toFixed(1)} `;
        d += `M${bx.toFixed(1)},${by.toFixed(1)} L${(bx + Math.cos(a - s * 2.4) * b).toFixed(1)},${(by + Math.sin(a - s * 2.4) * b).toFixed(1)} `;
      }
    }
    return `<path d="${d}" ${extra}/>`;
  }

  const RELEASE_BACK = `
  <g id="release-back">
    <g id="sigil" transform="translate(80,189) scale(1,0.16)">
      <circle cx="0" cy="0" r="66" fill="none" stroke="#9fd8ff" stroke-width="5" opacity="0.8"/>
      <circle cx="0" cy="0" r="52" fill="none" stroke="#e6f7ff" stroke-width="3" opacity="0.7"/>
      ${snowflake(0, 0, 60, 'stroke="#c9ecff" stroke-width="5" fill="none" stroke-linecap="round"')}
    </g>
    <g id="snow-cloak">
      <path d="M62,104 C40,112 22,140 14,186 C40,178 58,184 80,180 C102,184 120,178 146,186 C138,140 120,112 98,104 Z"
            fill="url(#cloakGrad)" stroke="#bfe6ff" stroke-width="1.6"/>
      <path d="M40,150 C46,160 44,172 36,180" stroke="#ffffff" stroke-width="1.4" fill="none" opacity="0.8"/>
      <path d="M120,150 C114,160 116,172 124,180" stroke="#ffffff" stroke-width="1.4" fill="none" opacity="0.8"/>
      ${snowflake(32, 168, 5, 'stroke="#ffffff" stroke-width="1.2" fill="none"')}
      ${snowflake(128, 164, 4, 'stroke="#ffffff" stroke-width="1.2" fill="none"')}
      ${snowflake(48, 136, 3.5, 'stroke="#ffffff" stroke-width="1" fill="none"')}
      ${snowflake(113, 132, 3.5, 'stroke="#ffffff" stroke-width="1" fill="none"')}
    </g>
  </g>`;

  function shard(x, y, s, rot) {
    return `<path d="M${x},${y - 6 * s} L${x + 2.6 * s},${y} L${x},${y + 6 * s} L${x - 2.6 * s},${y} Z" transform="rotate(${rot} ${x} ${y})"
                  fill="url(#crystalGrad)" stroke="#5aa9e6" stroke-width="0.9"/>`;
  }
  const HALO = `
  <g id="halo" filter="url(#glow)">
    <ellipse cx="80" cy="4" rx="30" ry="6" fill="none" stroke="#bfe9ff" stroke-width="1.4" opacity="0.8"/>
    ${shard(52, 4, 0.9, -20)}${shard(64, -1, 1, -8)}${shard(80, -3, 1.2, 0)}${shard(96, -1, 1, 8)}${shard(108, 4, 0.9, 20)}
    ${shard(66, 9, 0.7, -12)}${shard(94, 9, 0.7, 12)}
  </g>`;

  // ---- Desk (hidden unless #pet.desk) ----
  function paperStack() {
    let s = '';
    for (let i = 0; i < 8; i++) {
      const y = 134 - i * 2.3;
      const j = (i % 3) - 1;
      s += `<path class="sheet s${i + 1}" d="M${30 + j},${y} L${55 + j},${y} L${52.5 + j},${y - 4} L${32.5 + j},${y - 4} Z" fill="#fffdf6" stroke="#bdb6a3" stroke-width="0.8"/>`;
    }
    return s;
  }
  const DESK = `
  <g id="desk">
    <path d="M20,138 L140,138 L131,125 L29,125 Z" fill="#b8875a" stroke="#5a3a1e" stroke-width="1.5"/>
    <rect x="18" y="138" width="124" height="6" rx="1.5" fill="#8f5f35" stroke="#5a3a1e" stroke-width="1.4"/>
    <path d="M22,144 L138,144 L138,189 L22,189 Z" fill="#7f5430" stroke="#5a3a1e" stroke-width="1.5"/>
    <rect x="56" y="151" width="48" height="15" rx="2.5" fill="#94643a" stroke="#5a3a1e" stroke-width="1.3"/>
    <circle cx="80" cy="158.5" r="2.2" fill="#e8c792" stroke="#5a3a1e" stroke-width="0.8"/>
    <path d="M28,176 L132,176" stroke="#6d4626" stroke-width="1.2"/>
    <g id="papers">${paperStack()}</g>
    <path id="work-sheet" d="M62,136 L98,136 L94.5,128.5 L65.5,128.5 Z" fill="#fffdf7" stroke="#c9c2ae" stroke-width="0.9"/>
    <path d="M68,131 L91.5,131 M67.2,133.4 L92.8,133.4" stroke="#9fb7d6" stroke-width="0.8"/>
    <g id="stamp-mark" opacity="0">
      <circle cx="88" cy="132" r="2.8" fill="none" stroke="#3f7fd0" stroke-width="1.2"/>
      ${snowflake(88, 132, 1.8, 'stroke="#3f7fd0" stroke-width="0.7" fill="none"')}
    </g>
    <g id="ink">
      <rect x="114" y="118" width="13" height="10" rx="2.5" fill="#22345f" stroke="${LINE}" stroke-width="1.1"/>
      <rect x="117.5" y="114.5" width="6" height="4" rx="1" fill="#3c568c" stroke="${LINE}" stroke-width="0.9"/>
      <path d="M116,121 L125,121" stroke="#7fb3ff" stroke-width="0.9" opacity="0.7"/>
    </g>
    <g id="props-desk"></g>
  </g>`;

  // ---- Kori's drawn body ----
  const HAIR_BACK = `
  <g id="hair-back">
    <path d="M80,12 C106,12 126,28 127,54 C128,72 127,88 123,99 L119,106 L113,101 C111,103 107,104 104,103 L56,103
             C53,104 49,103 47,101 L41,106 L37,99 C33,88 32,72 33,54 C34,28 54,12 80,12 Z"
          fill="url(#hairBack)" stroke="${LINE}" stroke-width="1.6"/>
    <path d="M39,60 C37,74 38,86 41,96" stroke="#3d62a8" stroke-width="1.8" fill="none" opacity="0.8"/>
    <path d="M121,60 C123,74 122,86 119,96" stroke="#3d62a8" stroke-width="1.8" fill="none" opacity="0.8"/>
  </g>`;

  const LEGS = `
  <g id="leg-l" class="leg">
    <rect x="62" y="146" width="15" height="22" rx="4" fill="${LEGGING}" stroke="${LINE}" stroke-width="1.4"/>
    <path d="M59.5,165 L78.5,165 L79,180 C79.5,185 74,187.5 66.5,187.5 C60.5,187.5 58,185.5 59.3,181 Z" fill="#f4f8fc" stroke="#7d95b0" stroke-width="1.4"/>
    <path d="M58.6,184.6 C64,187.4 73,187.4 79,184" stroke="#9fb2c8" stroke-width="1.6" fill="none"/>
    <rect x="58.5" y="161.5" width="21" height="7" rx="3.5" fill="${FUR}" stroke="${LINE}" stroke-width="1.2"/>
    <path d="M61,163 Q62.5,161 64,163 Q65.5,161 67,163 Q68.5,161 70,163 Q71.5,161 73,163 Q74.5,161 76,163" stroke="#d7e6f3" stroke-width="1" fill="none"/>
  </g>
  <g id="leg-r" class="leg">
    <rect x="83" y="146" width="15" height="22" rx="4" fill="${LEGGING}" stroke="${LINE}" stroke-width="1.4"/>
    <path d="M100.5,165 L81.5,165 L81,180 C80.5,185 86,187.5 93.5,187.5 C99.5,187.5 102,185.5 100.7,181 Z" fill="#f4f8fc" stroke="#7d95b0" stroke-width="1.4"/>
    <path d="M101.4,184.6 C96,187.4 87,187.4 81,184" stroke="#9fb2c8" stroke-width="1.6" fill="none"/>
    <rect x="80.5" y="161.5" width="21" height="7" rx="3.5" fill="${FUR}" stroke="${LINE}" stroke-width="1.2"/>
    <path d="M84,163 Q85.5,161 87,163 Q88.5,161 90,163 Q91.5,161 93,163 Q94.5,161 96,163 Q97.5,161 99,163" stroke="#d7e6f3" stroke-width="1" fill="none"/>
  </g>`;

  const TORSO = `
  <g id="torso">
    <path d="M60,106 L100,106 C104,120 106,134 107,148 Q80,152 53,148 C54,134 56,120 60,106 Z" fill="${COAT}" stroke="${LINE}" stroke-width="1.6"/>
    <path d="M97,110 C101,122 103,134 104,146 Q99,148.5 94,149 C96,136 96,122 95,110 Z" fill="${COAT_SHADE}" opacity="0.8"/>
    <path d="M80,112 L80,150" stroke="${COAT_LINE}" stroke-width="1.4"/>
    <rect x="76" y="118" width="8" height="3.6" rx="1.8" fill="${WOOD}" stroke="${WOOD_DARK}" stroke-width="1"/>
    <rect x="76" y="127" width="8" height="3.6" rx="1.8" fill="${WOOD}" stroke="${WOOD_DARK}" stroke-width="1"/>
    <rect x="76" y="136" width="8" height="3.6" rx="1.8" fill="${WOOD}" stroke="${WOOD_DARK}" stroke-width="1"/>
    <path d="M72.5,119.8 Q74,117.6 76,119.8 M72.5,128.8 Q74,126.6 76,128.8 M72.5,137.8 Q74,135.6 76,137.8" stroke="${WOOD_DARK}" stroke-width="0.9" fill="none"/>
    <rect x="58" y="139" width="12" height="3.2" rx="1.2" fill="${COAT_SHADE}" stroke="${COAT_LINE}" stroke-width="0.9"/>
    <rect x="90" y="139" width="12" height="3.2" rx="1.2" fill="${COAT_SHADE}" stroke="${COAT_LINE}" stroke-width="0.9"/>
    <g id="pin">
      ${snowflake(66, 121, 3.6, 'stroke="#ffffff" stroke-width="2.6" fill="none" stroke-linecap="round"')}
      ${snowflake(66, 121, 3.6, 'stroke="#3f7fd0" stroke-width="1.1" fill="none" stroke-linecap="round"')}
    </g>
    <path d="M54,106 C54,100 60,99 64,101 C67,97 73,97 76,100 C79,97 85,97 88,100 C91,97 97,97 100,101 C104,99 108,102 106,107
             C108,111 104,115 100,113 C97,116 91,116 88,113 C85,116 79,116 76,113 C73,116 67,116 64,113 C60,115 54,112 56,108 Z"
          fill="${FUR}" stroke="${LINE}" stroke-width="1.4"/>
    <path d="M62,106 Q64,104 66,106 M74,105 Q76,103 78,105 M86,105 Q88,103 90,105 M96,106 Q98,104 100,106" stroke="#d9e8f5" stroke-width="1" fill="none"/>
  </g>`;

  const ARMS = `
  <g id="arm-l">
    <path d="M61,108 C54.5,112 50.5,120 49,129 L57.5,131 C58.5,124 60.5,118 64,113.5 Z" fill="${COAT}" stroke="${LINE}" stroke-width="1.5"/>
    <ellipse cx="53.3" cy="130.4" rx="6.2" ry="3.3" fill="${FUR}" stroke="${LINE}" stroke-width="1.2"/>
    <circle cx="53" cy="135" r="5" fill="${MITTEN}" stroke="${LINE}" stroke-width="1.3"/>
    <circle cx="57.4" cy="133.2" r="1.9" fill="${MITTEN}" stroke="${LINE}" stroke-width="1"/>
    <g id="stamp">
      <rect x="47.5" y="137.5" width="11" height="4" rx="1" fill="#3f7fd0" stroke="${LINE}" stroke-width="1"/>
      <rect x="51" y="131" width="4" height="7" rx="1.5" fill="${WOOD}" stroke="${WOOD_DARK}" stroke-width="0.9"/>
      <circle cx="53" cy="130" r="3" fill="${WOOD}" stroke="${WOOD_DARK}" stroke-width="0.9"/>
    </g>
    <g id="props-hand-l"></g>
  </g>
  <g id="arm-r">
    <path d="M99,108 C105.5,112 109.5,120 111,129 L102.5,131 C101.5,124 99.5,118 96,113.5 Z" fill="${COAT}" stroke="${LINE}" stroke-width="1.5"/>
    <ellipse cx="106.7" cy="130.4" rx="6.2" ry="3.3" fill="${FUR}" stroke="${LINE}" stroke-width="1.2"/>
    <g id="quill">
      <path d="M104,136 L119,108 L121.5,109.4 L107.5,137.5 Z" fill="url(#crystalGrad)" stroke="#5aa9e6" stroke-width="0.9"/>
      <path d="M119,108 L121.5,109.4 L122.5,104.5 Z" fill="#ffffff" stroke="#5aa9e6" stroke-width="0.7"/>
    </g>
    <circle cx="107" cy="135" r="5" fill="${MITTEN}" stroke="${LINE}" stroke-width="1.3"/>
    <circle cx="102.6" cy="133.2" r="1.9" fill="${MITTEN}" stroke="${LINE}" stroke-width="1"/>
    <g id="orb" filter="url(#glow)">
      <path d="M107,124 L113.5,134 L107,150 L100.5,134 Z" fill="url(#crystalGrad)" stroke="#5aa9e6" stroke-width="1.1"/>
      <path d="M107,124 L107,150 M100.5,134 L113.5,134" stroke="#ffffff" stroke-width="0.8" opacity="0.8"/>
    </g>
    <g id="props-hand-r"></g>
  </g>`;

  const HEAD = `
  <g id="head">
    <path d="M38,60 C38,40 54,30 80,30 C106,30 122,40 122,60 L122,82 C122,98 108,108 80,108 C52,108 38,98 38,82 Z"
          fill="${SKIN}" stroke="${LINE}" stroke-width="1.8"/>
    <g id="face">
      <ellipse cx="62" cy="82" rx="10" ry="9.6" fill="#ffffff" stroke="${LINE}" stroke-width="1.2"/>
      <ellipse cx="98" cy="82" rx="10" ry="9.6" fill="#ffffff" stroke="${LINE}" stroke-width="1.2"/>
      <ellipse cx="62.5" cy="83.6" rx="7.4" ry="7.8" fill="url(#irisGrad)"/>
      <ellipse cx="97.5" cy="83.6" rx="7.4" ry="7.8" fill="url(#irisGrad)"/>
      <ellipse cx="62.5" cy="84.2" rx="3.7" ry="4" fill="#173a63"/>
      <ellipse cx="97.5" cy="84.2" rx="3.7" ry="4" fill="#173a63"/>
      <circle cx="59.6" cy="80" r="2.2" fill="#ffffff"/>
      <circle cx="94.6" cy="80" r="2.2" fill="#ffffff"/>
      <circle cx="65.4" cy="87.6" r="1.1" fill="#ffffff" opacity="0.85"/>
      <circle cx="100.4" cy="87.6" r="1.1" fill="#ffffff" opacity="0.85"/>
      <!-- serious lids: the inner corners sit lower; scaleY closes them -->
      <g id="lids">
        <path d="M50,70 L75,70 L75,76.6 L50,73.6 Z" fill="${SKIN}"/>
        <path d="M85,70 L110,70 L110,73.6 L85,76.6 Z" fill="${SKIN}"/>
        <path d="M50.5,73.6 L74.5,76.6" stroke="${LINE}" stroke-width="2.6" fill="none" vector-effect="non-scaling-stroke"/>
        <path d="M85.5,76.6 L109.5,73.6" stroke="${LINE}" stroke-width="2.6" fill="none" vector-effect="non-scaling-stroke"/>
      </g>
      <!-- furrowed brows -->
      <path d="M54,66.5 L71.5,70" stroke="${LINE}" stroke-width="2.6" fill="none"/>
      <path d="M106,66.5 L88.5,70" stroke="${LINE}" stroke-width="2.6" fill="none"/>
      <ellipse cx="49.5" cy="94" rx="5.5" ry="2.6" fill="#f6b9c6" opacity="0.8"/>
      <ellipse cx="110.5" cy="94" rx="5.5" ry="2.6" fill="#f6b9c6" opacity="0.8"/>
      <g id="mouth">
        <path d="M74.5,99 Q80,95.8 85.5,99" stroke="${LINE}" stroke-width="1.9" fill="none"/>
      </g>
    </g>
    <g id="hair-front">
      <path d="M38,64 C35,36 55,18 80,18 C105,18 125,36 122,64 L117,58 L113,65 L107,56 L101,63 L94,55 L88,62 L82,54
               L77,62 L70,55 L64,63 L57,56 L52,65 L46,58 L42,66 Z"
            fill="url(#hairFront)" stroke="${LINE}" stroke-width="1.5"/>
      <path d="M40,58 C37,72 38,84 42,94 L46,86 L45,63 Z" fill="url(#hairBack)" stroke="${LINE}" stroke-width="1.2"/>
      <path d="M120,58 C123,72 122,84 118,94 L114,86 L115,63 Z" fill="url(#hairBack)" stroke="${LINE}" stroke-width="1.2"/>
      <path d="M56,30 C60,25 66,22 72,21" stroke="#4a72bd" stroke-width="2" fill="none" opacity="0.9"/>
      <path d="M100,28 C104,32 107,37 108,42" stroke="#4a72bd" stroke-width="2" fill="none" opacity="0.9"/>
      <!-- icicle-curl cowlick -->
      <path id="cowlick" d="M85,19.5 C90,7 103,6 101,15.5 C99.5,21 92.5,18.5 95.5,13.5" stroke="${HAIR_DARK}" stroke-width="3.4" fill="none"/>
      <path d="M99,9.5 L101.5,4 L102.5,10.5 Z" fill="#bfe6ff" stroke="#5aa9e6" stroke-width="0.7"/>
      <!-- snowflake hair clip -->
      <g id="clip">
        ${snowflake(108, 40, 5, 'stroke="#ffffff" stroke-width="3.2" fill="none" stroke-linecap="round"')}
        ${snowflake(108, 40, 5, 'stroke="#5aa9e6" stroke-width="1.4" fill="none" stroke-linecap="round"')}
      </g>
    </g>
    <g id="props-head"></g>
  </g>`;

  // A prepared skin image is { url, aspect, config }. It is sized by height (188
  // pet units x scale), keeps its own proportions, stands on the ground line, and
  // may overflow the pet box (wide images with wings, for example).
  function imageBox(img) {
    const c = img.config || {};
    const scale = Number(c.scale) || 1;
    const h = 188 * scale;
    const w = h * (img.aspect || 160 / 188);
    const x = 80 - w / 2 + (Number(c.offsetX) || 0);
    const y = 188 - h + (Number(c.offsetY) || 0);
    return { x, y, w, h };
  }
  function skinImage(img, id) {
    const b = imageBox(img);
    // The wrapper lets sprite-sheet animations mirror frames that face left.
    return `<g id="${id}-wrap"><image id="${id}" href="${img.url}" x="${b.x.toFixed(1)}" y="${b.y.toFixed(1)}" width="${b.w.toFixed(1)}" height="${b.h.toFixed(1)}" preserveAspectRatio="xMidYMax meet"/></g>`;
  }

  // ---- prop anchors on skins ----
  // Mods draw props against Kori's body: head centered at (80, 69) with a face
  // 84 units wide, hands at (53, 135) and (107, 135). On a skin, each anchor group
  // is transformed so those reference points land on the skin's own head and
  // hands. Positions come from skin.json "anchors" (pet units), or default to
  // typical chibi proportions of the image box.
  const REF = { head: { x: 80, y: 69 }, 'hand-r': { x: 107, y: 135 }, 'hand-l': { x: 53, y: 135 } };
  const REF_HEAD_SIZE = 84;
  function skinAnchors(img) {
    const b = imageBox(img);
    const a = (img.config && img.config.anchors) || {};
    const headSize = Number(a.head && a.head.size) || b.h * 0.36;
    const s = headSize / REF_HEAD_SIZE;
    const pick = (name, dx, dy) => ({
      x: Number(a[name] && a[name].x) || 80 + dx,
      y: Number(a[name] && a[name].y) || b.y + dy,
    });
    const pts = {
      head: pick('head', 0, b.h * 0.27),
      'hand-r': pick('hand-r', b.h * 0.15, b.h * 0.64),
      'hand-l': pick('hand-l', -b.h * 0.15, b.h * 0.64),
    };
    const out = {};
    for (const [k, p] of Object.entries(pts)) {
      out[k] = { ...p, s, transform: `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${s.toFixed(3)}) translate(${-REF[k].x} ${-REF[k].y})` };
    }
    return out;
  }
  function skinAnchorGroups(anchors) {
    const marker = (k) => {
      const p = anchors[k];
      return `<g class="anchor-marker" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})">
        <circle r="4" fill="none" stroke="#ff3b7a" stroke-width="1.2"/><path d="M-7,0 L7,0 M0,-7 L0,7" stroke="#ff3b7a" stroke-width="1"/>
        <text x="6" y="-6" font-size="7" fill="#ff3b7a" stroke="#ffffff" stroke-width="0.4">${k}</text></g>`;
    };
    return `
  <g id="anchor-hand-l" transform="${anchors['hand-l'].transform}"><g id="props-hand-l"></g></g>
  <g id="anchor-hand-r" transform="${anchors['hand-r'].transform}"><g id="props-hand-r"></g></g>
  <g id="anchor-head" transform="${anchors.head.transform}"><g id="head"><g id="props-head"></g></g></g>
  <g id="anchor-markers">${['head', 'hand-r', 'hand-l'].map(marker).join('')}</g>`;
  }
  // Re-aim the anchors at the primary or ultimate image (called when the
  // ultimate form starts and ends).
  function applySkinAnchors(skin, useUltimate) {
    if (!skin) return;
    const img = useUltimate && skin.ultimate ? skin.ultimate : skin.primary;
    const anchors = skinAnchors(img);
    for (const k of ['head', 'hand-r', 'hand-l']) {
      const g = document.getElementById(`anchor-${k}`);
      if (g) g.setAttribute('transform', anchors[k].transform);
    }
    const m = document.getElementById('anchor-markers');
    if (m) m.outerHTML = skinAnchorGroups(anchors).match(/<g id="anchor-markers">[\s\S]*<\/g>\s*$/)[0];
  }

  function svg(skin) {
    const body = skin
      ? `${skinImage(skin.primary, 'skin-img')}${skin.ultimate ? skinImage(skin.ultimate, 'skin-ultimate') : ''}${DESK}${skinAnchorGroups(skinAnchors(skin.primary))}`
      : `${HAIR_BACK}${LEGS}${TORSO}${DESK}${ARMS}${HEAD}`;
    return `
<svg id="pet-svg" viewBox="0 0 160 200" xmlns="http://www.w3.org/2000/svg" stroke-linejoin="round" stroke-linecap="round">
  ${DEFS}
  <ellipse id="shadow" cx="80" cy="191" rx="30" ry="4" fill="rgba(0,0,0,0.3)"/>
  ${skin ? '' /* the halo, snow cloak, and sigil are Kori's own art */ : RELEASE_BACK}
  <g id="props-back"></g>
  ${body}
  ${skin ? '' : HALO}
  <g id="props-front"></g>
  <text id="zzz" x="118" y="28">z z z</text>
</svg>`;
  }

  window.PetSprite = { svg, snowflake, skinAnchors, applySkinAnchors };
})();
