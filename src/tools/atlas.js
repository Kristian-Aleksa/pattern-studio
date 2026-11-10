/* ==========================================================================
   tools/atlas.js — Atlas: text-mode terrain (vector: PNG, SVG, video).

   1. Terrain: a warped noise elevation over the frame, cut into Terraces
      levels. Every cell of a character grid takes its level's ink, the inks in
      turn from low to high (with more terraces than inks they come round
      again). Scale sets how many hills fit across the frame, Warp how much the
      contours swirl, Contrast how far the land reaches toward the lowest and
      highest terraces (0: mostly the middle ones).
   2. Grid: Columns cells across the frame and as many rows as fill its height
      (a cell is 5:3, the shape of a monospace character). The terrain is
      anchored at the top-left corner and scales with the frame's width, so
      another frame shape crops or extends the same map.
   3. Type: a character in about Density of the cells (more of them on high
      ground) from the Character set: each terrace starts its own run of the
      set, from low to high (0 or 1 on the lowest terrace up to 8 or 9 on the
      highest, with Digits), and Variety lets every cell stray further along
      it (0: always the first; 100 %: anything in the set). Dark type on the
      light inks, light type on the dark ones. The type is real outlines
      (core/glyphs.js), so the SVG needs no fonts.
   4. Animation: the land rises and sinks slowly through a loop of its own (the
      noise turns round a small circle in two extra dimensions that starts and
      ends at the still picture), so the terraces swell and shrink and the type
      changes with them; seamless. Intensity sets how far it drifts (0 holds
      everything still); the first frame is the still picture at any Intensity.
   ========================================================================== */
(() => {
  const { hash } = PL.rng;

  // Low to high. The default look's colours first.
  const PALETTES = [
    { name: 'Atlas', colors: ['#98B613', '#ECA02D', '#D88F58', '#CE493F', '#5B132B', '#221A22', '#9B819D', '#8B56CE'] },
    { name: 'Topo', colors: ['#2F6B4F', '#5E9E5B', '#A8C686', '#E9E1B5', '#D2A86E', '#9C6B44', '#5B3A2A', '#F4F1EA'] },
    { name: 'Lichen', colors: ['#2C1751', '#273776', '#0E5E8A', '#00818C', '#1EA381', '#68C36D', '#B1DD54', '#F7ED6C'] }, // one ramp from dark to light, its hue turning from 295 down to 105
    { name: 'Ember', colors: ['#FFF6DE', '#FBE3A1', '#F7B35C', '#F2792B', '#D4471F', '#9E2A1B', '#5C1A14', '#2B0F0E'] },
    { name: 'Mint', colors: ['#E7F6EE', '#BFE6D2', '#8ACFB3', '#4FAF8C', '#2A8467', '#175743', '#0C3328', '#F2C14E'] },
    { name: 'Magma', colors: ['#1C0934', '#480A55', '#870C62', '#C72C4C', '#E9622E', '#F99532', '#FFC761', '#FDEFBA'] }, // one ramp from dark to light, its hue turning from 300 through 345 and 15 to 95
    { name: 'Night', colors: ['#0D0F1A', '#1B2240', '#2E3A75', '#4F5FB0', '#8C9BEA', '#D8DEFF', '#FFD166', '#EF476F'] },
    { name: 'Dune', colors: ['#2E1F1A', '#5C3B2E', '#8E5A3C', '#C07F4E', '#E3A96B', '#F2CF9A', '#FAEBCB', '#FFF8EC'] },
    { name: 'Berry', colors: ['#1A0B1E', '#3D1240', '#6B1D5E', '#A3286F', '#D94C7F', '#F08FA0', '#F9C6C2', '#FFF0E6'] },
    { name: 'Mono', colors: ['#F2F2F0', '#D6D6D3', '#B3B3AF', '#8C8C88', '#666662', '#40403D', '#1E1E1C', '#0A0A09'] },
  ];

  const SETS = { digits: '0123456789', dos: "0369#%&@!;,'()", stipple: '.,;:\'"^~*', code: '/\\|_-+=<>[]{}' };

  /* ---- colour roles -------------------------------------------------------------------- */
  const roles = (n) => Array.from({ length: n }, (_, i) => 'Ink ' + (i + 1));
  const spec = (n) => ({ ramp: Math.max(2, n - 2), accents: Math.min(2, n - 2) });

  // "New colors": a ramp from a light lowland down to dark peaks (the hue drifting as it climbs),
  // then a couple of accents for the highest terraces.
  function generate(n, rng) {
    const C = PL.color;
    const m = Math.max(2, Math.min(n, Math.round(n * 0.75)));
    const h0 = rng.float(0, 360), drift = rng.sign() * rng.float(70, 150), c0 = rng.float(0.13, 0.2);
    const out = [];
    for (let k = 0; k < m; k++) {
      const t = m > 1 ? k / (m - 1) : 0;
      out.push(C.lch(0.74 - 0.6 * t, c0 * (1 - 0.55 * t * t), h0 + drift * t + rng.float(-8, 8)));
    }
    for (let k = m; k < n; k++) out.push(C.lch(rng.float(0.46, 0.62), rng.float(0.1, 0.18), h0 + drift + rng.float(120, 240)));
    return out;
  }

  // + adds an ink in a hue the palette doesn't have yet (one more terrace colour).
  function add(colors) {
    const C = PL.color;
    const c = colors.slice();
    const hues = c.filter((x) => C.hexToLch(x)[1] > 0.04).map((x) => C.hexToLch(x)[2]);
    let best = 0, bd = -1;
    for (let h = 0; h < 360; h += 10) {
      const d = hues.length ? Math.min(...hues.map((x) => Math.abs((((h - x) % 360) + 540) % 360 - 180))) : 180;
      if (d > bd) { bd = d; best = h; }
    }
    c.push(C.lch(0.58, 0.14, best));
    return c;
  }

  function fit(colors, n) {
    let c = (colors || []).map(PL.color.normHex).filter(Boolean);
    if (!c.length) c = PALETTES[0].colors.slice();
    if (c.length === 1) c.push(PL.color.mix(c[0], PL.color.luminance(c[0]) > 0.2 ? '#000000' : '#FFFFFF', 0.85));
    if (c.length >= n) return c.slice(0, n);
    while (c.length < n) c = add(c);
    return c;
  }

  /* ---- settings -------------------------------------------------------------------------- */
  const R = (section, key, label, min, max, def, extra = {}) => ({ section, key, label, type: 'range', min, max, def, step: 1, ...extra });
  const PARAMS = [
    R('Terrain', 'scale', 'Scale', 1, 9, 2.4, { step: 0.1, rand: [1.6, 4.4], hint: 'How many hills fit across the frame' }),
    R('Terrain', 'warp', 'Warp', 0, 100, 31, { unit: '%', rand: [10, 60], hint: 'How much the contours swirl' }),
    R('Terrain', 'terraces', 'Terraces', 2, 14, 6, { rand: [4, 10], hint: 'Levels the land is cut into (the inks come round again when there are more terraces than inks)' }),
    R('Terrain', 'contrast', 'Contrast', 0, 100, 55, { unit: '%', rand: [35, 80], hint: 'How far the land reaches to the lowest and highest terraces' }),
    {
      section: 'Type', key: 'charset', label: 'Character set', type: 'select', def: 'digits',
      options: [{ value: 'digits', label: 'Digits' }, { value: 'dos', label: 'DOS' }, { value: 'stipple', label: 'Stipple' }, { value: 'code', label: 'Code' }, { value: 'custom', label: 'Custom' }],
      hint: 'The characters printed on the terrain, from low to high ground',
    },
    { section: 'Type', key: 'chars', label: 'Your characters', type: 'text', def: '.:-=+*#%@', maxLength: 48, placeholder: '.:-=+*#%@', when: (p) => p.charset === 'custom', hint: 'From low to high ground. Letters, digits, punctuation, ░▒▓█ and box lines' },
    R('Type', 'columns', 'Columns', 24, 260, 110, { rand: [70, 150], hint: 'Characters across the frame (the rows follow its shape)' }),
    R('Type', 'density', 'Density', 0, 100, 62, { unit: '%', rand: [40, 85], hint: 'How many cells carry a character (more on high ground)' }),
    R('Type', 'variety', 'Variety', 0, 100, 35, { unit: '%', rand: [15, 70], hint: 'How far each character may stray from its terrace (100 %: any in the set)' }),
  ];

  // Constants. Terrain lengths are in noise units: the frame's width spans Scale x freq of them.
  const K = {
    freq: 0.4,                 // noise cycles across the frame's width per unit of Scale
    oct: 4, gain: 0.5,         // terrain octaves and their gain
    wFreq: 1.0,                // warp field frequency (x the terrain's)
    wOct: 3,                   // warp field octaves
    warp: 0.45,                // warp reach at Warp 100 % (noise units, x the warp field's spread)
    nsd: 0.2,                  // the noise sum's spread (it is divided by it)
    mid: 0.5,                  // elevation of the average ground
    spread: [0.1, 0.232],      // elevation spread (sd) at Contrast 0 and the rise to 100 %
    fill: [0.5, 0.75],         // type: share of the cells with a character at Density 100 %, lowest terrace and the rise to the highest
    cell: 0.6,                 // cell width / height (rows = Columns x this x frame height / width)
    font: 1.555,               // type size, x the cell width (px per em)
    base: 0.8,                 // baseline, from the top of the cell (share of its height)
    bold: 0.2,                 // an outline round the type, px: small type as sturdy as the browser's own text (big type barely changes)
    loop: 0.14,                // loop circle radius at Intensity 1 (noise units): about 6 % of the cells change terrace from frame to frame at 0.5
  };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* ---- the grid ------------------------------------------------------------------------- */
  function grid(p, aspect) {
    const cols = clamp(Math.round(p.columns), 1, 1000);
    const rows = Math.max(1, Math.round((cols * K.cell) / aspect + 1e-9));
    return { cols, rows };
  }

  // The level of every cell (row by row), and the elevation behind it: the frame's cells, or with sp
  // (General's Rotation and Size) columns c0..c1 and rows r0..r1 of the grid, which runs on past the frame.
  function levels(seed, p, cols, rows, aspect, t, amount, sp) {
    const c0 = sp ? sp.c0 : 0, c1 = sp ? sp.c1 : cols, r0 = sp ? sp.r0 : 0, r1 = sp ? sp.r1 : rows, nc = c1 - c0;
    const N = PL.noise.get(seed);
    const T = clamp(Math.round(p.terraces), 2, 64);
    const sc = Math.max(0.05, p.scale) * K.freq;
    const warp = clamp(p.warp / 100, 0, 1) * K.warp;
    const spread = K.spread[0] + K.spread[1] * clamp(p.contrast / 100, 0, 1);
    // round a circle through the still picture's point (0, 0): frame 0 looks the same at every Intensity
    const th = 2 * Math.PI * (((t % 1) + 1) % 1), r = Math.max(0, amount || 0) * K.loop;
    const z = r * (Math.cos(th) - 1), w = r * Math.sin(th);
    const L = new Int16Array(nc * (r1 - r0)), E = new Float32Array(nc * (r1 - r0));
    const ch = 1 / aspect / rows; // a cell's height in frame widths
    for (let j = r0; j < r1; j++) {
      const y = (j + 0.5) * ch * sc;
      for (let i = c0; i < c1; i++) {
        const x = ((i + 0.5) / cols) * sc;
        let px = x, py = y;
        if (warp > 0) {
          px += (warp * N.fbm4(x * K.wFreq + 5.2, y * K.wFreq + 1.3, z + 3.7, w - 2.9, K.wOct)) / K.nsd;
          py += (warp * N.fbm4(x * K.wFreq - 7.7, y * K.wFreq + 3.1, z - 6.1, w + 4.3, K.wOct)) / K.nsd;
        }
        const e = K.mid + (N.fbm4(px, py, z, w, K.oct, K.gain) / K.nsd) * spread;
        const o = (j - r0) * nc + (i - c0);
        E[o] = e;
        L[o] = clamp(Math.floor(e * T), 0, T - 1);
      }
    }
    return { L, E, T };
  }

  // The characters to print, from low to high ground.
  function charsOf(p) {
    if (p.charset === 'custom') return Array.from(String(p.chars || ''));
    return Array.from(SETS[p.charset] || SETS.digits);
  }

  /* ---- build ------------------------------------------------------------------------------- */
  // region (General's Rotation and Size): the part of the world to cover; the terrain and its grid run on
  // past the frame, so zooming out shows more of the same map.
  function build({ W, H, aspect, seed, p, colors, t = 0, anim, region }) {
    const asp = aspect > 0 ? aspect : W / H;
    const { cols, rows } = grid(p, asp);
    const R = region;
    const c0 = R ? Math.floor((R.x0 * cols) / W) : 0, c1 = R ? Math.ceil((R.x1 * cols) / W) : cols;
    const r0 = R ? Math.floor((R.y0 * rows) / H) : 0, r1 = R ? Math.ceil((R.y1 * rows) / H) : rows, nc = c1 - c0;
    const n = colors.length;
    const { L, T } = levels(seed, p, cols, rows, asp, t, anim ? anim.amount : 0, R ? { c0, c1, r0, r1 } : undefined);
    const scene = new PL.Scene(W, H, colors[0], 0);
    // cells, one layer per ink, merged into runs along each row; edges snapped to whole pixels
    const X = (i) => (i === cols ? W : Math.floor((i * W) / cols + 1e-9)), Y = (j) => (j === rows ? H : Math.floor((j * H) / rows + 1e-9));
    const inkL = colors.map((c, k) => scene.layer('ink' + k, c, 'Ink ' + (k + 1), k));
    for (let j = r0; j < r1; j++) {
      const row = (j - r0) * nc - c0;
      let i0 = c0;
      for (let i = c0 + 1; i <= c1; i++) {
        const a = L[row + i0] % n;
        if (i < c1 && L[row + i] % n === a) continue;
        PL.Scene.rect(inkL[a], X(i0), Y(j), X(i) - X(i0), Y(j + 1) - Y(j));
        i0 = i;
      }
    }
    // type: dark on the light inks, light on the dark ones (whichever contrasts more)
    const lum = colors.map((c) => PL.color.luminance(c));
    let dk = 0, lt = 0;
    lum.forEach((v, k) => { if (v < lum[dk]) dk = k; if (v > lum[lt]) lt = k; });
    const cr = (a, b) => (Math.max(lum[a], lum[b]) + 0.05) / (Math.min(lum[a], lum[b]) + 0.05);
    const typeInk = colors.map((_, k) => (cr(k, dk) >= cr(k, lt) ? dk : lt));
    const typeL = {};
    const layerFor = (k) => typeL[k] || (typeL[k] = scene.layer('type' + k, colors[k], k === dk ? 'Type dark' : k === lt ? 'Type light' : 'Type ' + (k + 1), k));
    const set = charsOf(p), N = set.length;
    let count = 0;
    if (N) {
      const D = clamp(p.density / 100, 0, 1), V = clamp(p.variety / 100, 0, 1);
      const span = Math.max(1, Math.round(1 + V * (N - 1)));
      const cw = W / cols, chh = H / rows, F = K.font * cw;
      const dx = (cw - (PL.glyphs.ADV / PL.glyphs.UPM) * F) / 2;
      const s = seed | 0;
      for (let j = r0; j < r1; j++) {
        for (let i = c0; i < c1; i++) {
          const lv = L[(j - r0) * nc + (i - c0)];
          if (hash(s, i, j, 0xa72) >= D * (K.fill[0] + K.fill[1] * (lv / (T - 1)))) continue;
          const ch = set[(Math.floor((N * lv) / T) + Math.floor(hash(s, i, j, 0xa71) * span)) % N];
          if (ch === ' ' || !PL.glyphs.has(ch)) continue;
          const TL = layerFor(typeInk[lv % n]);
          PL.Scene.glyph(TL, ch, i * cw + dx, j * chh + K.base * chh, F);
          TL.gw = K.bold;
          count++;
        }
      }
    }
    scene.status = `${cols} × ${rows} cells · ${T} terraces · ${count.toLocaleString()} characters`;
    return scene;
  }

  PL.tools.register({
    id: 'atlas',
    name: 'Atlas',
    kind: 'Backgrounds',
    tagline: 'Text-mode terrain',
    about: 'A map in a character grid: warped noise terrain cut into terraces, each cell in its terrace\'s ink, with characters that climb their set as the land rises.',
    inks: {
      min: 2, max: 12, roles, fit, spec, add, generate,
      span: (n) => n, // Invert turns the land upside down (the inks in reverse)
      hint: 'The inks go to the terraces from low to high, in turn. The type takes the darkest or the lightest ink, whichever stands out more.',
    },
    palettes: PALETTES,
    params: PARAMS,
    animLabel: 'Intensity',
    animHint: 'How far the land rises and sinks round its loop (0: still)',
    defaults: {
      anim: { amount: 0.5, fps: 12, frames: 72 },
      fx: {},
    },
    recolorable: false, // the type's ink depends on the colours
    opaque: true,
    build,
    zoom: true, // draws any region of its world (General's Rotation and Size)
    _K: K,
    _grid: grid,
    _levels: levels,
    _chars: charsOf,
    _sets: SETS,
  });
})();
