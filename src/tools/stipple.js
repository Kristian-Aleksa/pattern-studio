/* ==========================================================================
   tools/stipple.js — Stipple: halftone dots read from a noise field.

   1. Grid: Resolution dots across the width, on a square or hex lattice. The
      field is read in units of the frame's width from the top-left corner, so
      a taller frame shows more of the same pattern below.
   2. Field: domain-warped fractal noise (Field scale, Warp, Detail). It is
      stretched so its lowest and highest values in the frame become 0 and 1,
      pulled part of the way towards an even balance, and pushed apart about
      the middle by Contrast, giving a value v from 0 to 1 at every dot. The
      dot inks split v into bands: the first ink holds the lowest band, the
      last the highest. Symmetry mirrors the field left to right (Mirror) or
      into four (Quad).
   3. Lattice mode: every dot whose v is above Cutout is drawn, sized like a
      halftone: bigger where v is higher (Size variation sets how much).
   4. Contour mode: dots gather where the field changes fastest, which is
      along the band edges. Each cell has its own fixed random number and
      draws a dot when that is below
         Loose scatter + Edge pull x (a little + steepness + closeness to an edge),
      so edges fill in while the open areas keep a loose scatter. Dots on
      steep ground are drawn bigger.
   5. Accent rate: that share of the dots (fixed cells) take the accent ink.
   6. Animation: one steady speed all the way round the loop, with no pauses.
      The field moves round a small loop through the noise (so its fine detail
      shifts in place and Contour dots blink), and a broad wave rolls across
      it, every place a little behind its neighbours, so somewhere a band edge
      is always moving: dots change color and, in Lattice mode, swell, shrink
      and blink at the Cutout edge. Both come back to where they started, so
      the loop is seamless. Intensity sets how far things move (0 = still).
   ========================================================================== */
(() => {
  const { hash } = PL.rng;

  // Ground, the dot inks (lowest band first), then the accent. The default look uses Ember (defaults.palette).
  const PALETTES = [
    { name: 'Lagoon', colors: ['#12BBDA', '#12D473', '#63F1C6', '#599EE7', '#FF8421'] },
    { name: 'Midnight', colors: ['#0B132B', '#12D473', '#63F1C6', '#599EE7', '#FFD166'] },
    { name: 'Terracotta', colors: ['#F7EDE0', '#502515', '#A54A28', '#D78951', '#EEC59E', '#008287'] }, // a 40-65 ramp from deep brown to peach, a 200 teal accent across the wheel
    { name: 'Tidepool', colors: ['#ECF8F8', '#003441', '#00717A', '#30B4AD', '#A0E1CE', '#EF6856'] }, // a 220-175 ramp from deep sea to mint, a 30 coral accent across the wheel
    { name: 'Ember', colors: ['#1A0F0A', '#E85D04', '#F48C06', '#FFBA08', '#F1F1F1'] },
    { name: 'Forest', colors: ['#0F1A14', '#2D6A4F', '#52B788', '#B7E4C7', '#F4A261'] },
    { name: 'Ultraviolet', colors: ['#100A2B', '#7209B7', '#F72585', '#4CC9F0', '#FFD60A'] },
    { name: 'Blush', colors: ['#FDE2E4', '#B5838D', '#E5989B', '#6D6875', '#2A9D8F'] },
    { name: 'Iris', colors: ['#F3F0FB', '#2B1E66', '#6741B1', '#AC78D2', '#DFBCE7', '#D5D637'] }, // a 285-320 ramp from indigo to lilac, a 110 lime accent across the wheel
    { name: 'Duo', colors: ['#0E1116', '#F2F2F2', '#F25F5C'] },
  ];

  /* ---- color roles: ground, dot inks, accent ----------------------------------- */
  const nDots = (n) => Math.max(1, n - 2);
  function roles(n) {
    const m = nDots(n);
    return ['Ground', ...Array.from({ length: m }, (_, i) => (m === 1 ? 'Dots' : 'Dots ' + (i + 1))), 'Accent'];
  }
  const spec = (n) => ({ ramp: Math.min(3, nDots(n)), accents: 1 });
  const isLight = (hex) => PL.color.luminance(hex) > 0.35;

  // "New colors": a ground (deep, vivid or pale), dot inks in one hue family and a
  // contrasting accent.
  function generate(n, rng) {
    const C = PL.color;
    const m = nDots(n);
    const kind = rng.float(0, 1);
    const hd = rng.float(0, 360), span = rng.float(50, 110);
    let ground;
    if (kind < 0.4) ground = C.lch(rng.float(0.16, 0.23), rng.float(0.03, 0.07), hd + rng.float(-40, 40));
    else if (kind < 0.7) ground = C.lch(rng.float(0.68, 0.76), rng.float(0.11, 0.15), hd + rng.float(-30, 30));
    else ground = C.lch(rng.float(0.93, 0.97), rng.float(0.01, 0.03), hd + rng.float(-60, 60));
    const pale = kind >= 0.7;
    const out = [ground];
    const G = C.hexToOklab(ground);
    // a dot ink must stand off the ground: if it is too close, move its lightness away
    const apart = (L, Ch, h) => {
      let hex = C.lch(L, Ch, h);
      for (let k = 0; k < 4; k++) {
        const [l, a2, b2] = C.hexToOklab(hex);
        if (Math.hypot(l - G[0], a2 - G[1], b2 - G[2]) >= 0.13) break;
        L += G[0] > 0.6 ? -0.06 : 0.06;
        hex = C.lch(L, Ch, h);
      }
      return hex;
    };
    for (let i = 0; i < m; i++) {
      const k = m === 1 ? 0.5 : i / (m - 1);
      const L = pale ? 0.42 + 0.3 * k + rng.float(-0.04, 0.04) : 0.74 + 0.16 * Math.sin(Math.PI * k) + rng.float(-0.04, 0.04);
      out.push(apart(L, rng.float(0.13, 0.19), hd - span / 2 + span * k + rng.float(-10, 10)));
    }
    out.push(apart(pale ? rng.float(0.6, 0.68) : rng.float(0.76, 0.86), rng.float(0.16, 0.2), hd + 180 + rng.float(-35, 35)));
    return out;
  }

  // + adds a dot ink just before the accent: a step further round the dot inks' hue family
  // (a gentle one, so the inks stay a family), at their typical lightness and chroma, kept
  // clear of the ground.
  function add(colors) {
    const C = PL.color;
    const c = colors.slice();
    const dots = c.slice(1, -1).map((x) => C.hexToLch(x));
    const last = dots[dots.length - 1] || C.hexToLch(c[0]);
    const prev = dots.length > 1 ? dots[dots.length - 2] : null;
    const dh = prev ? ((((last[2] - prev[2]) % 360) + 540) % 360) - 180 : 30;
    const step = Math.sign(dh || 1) * Math.max(18, Math.min(36, Math.abs(dh)));
    const meanL = dots.reduce((a, d) => a + d[0], 0) / Math.max(1, dots.length);
    const meanC = dots.reduce((a, d) => a + d[1], 0) / Math.max(1, dots.length);
    const G = C.hexToLch(c[0]);
    let L = meanL + (dots.length % 2 ? 0.07 : -0.07);
    if (Math.abs(L - G[0]) < 0.1) L = G[0] + (G[0] > 0.6 ? -0.12 : 0.12);
    c.splice(c.length - 1, 0, C.lch(Math.min(0.94, Math.max(0.28, L)), Math.max(0.08, meanC), last[2] + step));
    return c;
  }

  function fit(colors, n) {
    let c = (colors || []).map(PL.color.normHex).filter(Boolean);
    if (!c.length) c = PALETTES[0].colors.slice();
    if (c.length === 1) c.push(PL.color.mix(c[0], isLight(c[0]) ? '#000000' : '#FFFFFF', 0.8));
    if (c.length === 2) c.push(PL.color.lch(0.72, 0.18, PL.color.hexToLch(c[1])[2] + 180));
    if (c.length === n) return c;
    if (c.length > n) {
      // keep the ground and the accent; take the dot inks evenly from the ones given
      const dots = c.slice(1, -1), m = nDots(n);
      const pick = Array.from({ length: m }, (_, i) => dots[Math.round((i * (dots.length - 1)) / Math.max(1, m - 1))]);
      return [c[0], ...pick, c[c.length - 1]];
    }
    while (c.length < n) c = add(c);
    return c;
  }

  const S = (section, key, label, min, max, def, extra = {}) => ({ section, key, label, type: 'range', min, max, def, step: 1, ...extra });
  const contour = (p) => p.mode !== 'lattice';
  const PARAMS = [
    { section: 'Dots', key: 'mode', label: 'Mode', type: 'seg', def: 'lattice', rand: false,
      options: [{ value: 'contour', label: 'Contour' }, { value: 'lattice', label: 'Lattice' }] },
    { section: 'Dots', key: 'lattice', label: 'Lattice', type: 'seg', def: 'square', rand: false,
      options: [{ value: 'square', label: 'Square' }, { value: 'hex', label: 'Hex' }] },
    { section: 'Dots', key: 'shape', label: 'Shape', type: 'seg', def: 'circle', rand: false,
      options: [{ value: 'circle', label: 'Circle' }, { value: 'square', label: 'Square' }, { value: 'diamond', label: 'Diamond' }] },
    S('Dots', 'res', 'Resolution', 12, 220, 84, { rand: [56, 96], hint: 'Dots across the width' }),
    S('Dots', 'dotsize', 'Dot size', 10, 150, 62, { unit: '%', rand: [50, 80], hint: 'Largest dot, as a share of the grid spacing' }),
    S('Dots', 'sizevar', 'Size variation', 0, 100, 48, { unit: '%', rand: [40, 85], hint: 'How much smaller dots get where the field is weak' }),
    S('Dots', 'cutout', 'Cutout', 0, 100, 29, { unit: '%', rand: [22, 46], hint: 'Leaves out dots where the field is below this' }),
    S('Dots', 'jitter', 'Jitter', 0, 100, 0, { unit: '%', rand: false, hint: 'Nudges each dot off the grid' }),
    S('Dots', 'edge', 'Edge pull', 0, 100, 85, { unit: '%', rand: [60, 100], when: contour, hint: 'Gathers dots along the band edges' }),
    S('Dots', 'loose', 'Loose scatter', 0, 100, 12, { unit: '%', rand: [5, 30], when: contour, hint: 'Loose dots scattered away from the edges' }),
    S('Field', 'fscale', 'Field scale', 0.3, 8, 2.0, { step: 0.1, rand: [1.6, 3.4], hint: 'Higher packs more, smaller regions into the frame' }),
    S('Field', 'warp', 'Warp', 0, 200, 70, { unit: '%', rand: [40, 130], hint: 'Swirls the regions' }),
    S('Field', 'detail', 'Detail', 1, 6, 4, { rand: false, hint: 'Layers of finer detail along the edges' }),
    S('Field', 'contrast', 'Contrast', 50, 300, 130, { unit: '%', rand: [120, 200], hint: 'Pushes the field apart into clearer regions' }),
    { section: 'Field', key: 'symmetry', label: 'Symmetry', type: 'seg', def: 'off', rand: false,
      options: [{ value: 'off', label: 'Off' }, { value: 'mirror', label: 'Mirror' }, { value: 'quad', label: 'Quad' }] },
    S('Color', 'accent', 'Accent rate', 0, 30, 5.5, { unit: '%', step: 0.5, rand: [3, 9], hint: 'Share of dots in the accent ink' }),
  ];

  // Constants. Field units: the frame's width = 1.
  const K = {
    freq: 0.42,         // noise cycles per frame width at Field scale 1
    warpA: 1.3,         // warp displacement (noise units) at Warp 100 %
    warpF: 0.7,         // the warp noise's frequency relative to the field's
    normN: 64,          // the field's range is measured on a grid this many samples wide
    cgain: 0.7,         // Contrast 100 % scales the stretched field by this (about the middle)
    recenter: 0.6,      // share of the field's off-centre average that is taken out
    gain: 0.4,          // each finer octave of Detail is this much weaker
    bandC: 0.488, bandS: 0.87, // band edges: bandC + (k / m - 0.5) * bandS
    dw: 2.32,           // closeness to a band edge falls off over this many cells
    lp: 1.027,          // loose dots: Loose scatter x this
    b0: 0.034,          // edge dots: Edge pull x (b0 + bg x steepness + be x closeness to a band edge)
    bg: 0.822, be: 0.062, //   steepness = 1 - exp(-(|gradient| / gs) ^ gk), closeness = exp(-(d / dw) ^ q)
    gs: 7.3, gk: 1.32, q: 2,
    uw: 0.98,           // dot strength mixes steepness (this share) and closeness
    u0: 0.665, du: 0.305, // contour dot strength (sizes them like v in Lattice mode)
    loopR: 0.07,        // Intensity 1 moves the field round a loop this big through the noise
    driftA: 0.2,        // ... and rolls a wave this high (v units) across it,
    driftF: 0.5,        //   its phase map's frequency relative to the field's,
    phaseK: 25,         //   and how far (radians per unit of noise) the phase turns across the frame
  };

  /* ---- grid -------------------------------------------------------------------------- */
  function grid(W, H, p) {
    const cols = Math.max(1, Math.round(p.res));
    const hex = p.lattice === 'hex';
    const rows = Math.max(1, Math.round((cols * H) / W / (hex ? Math.sqrt(3) / 2 : 1)));
    return { cols, rows, hex, cw: W / cols, ch: H / rows };
  }

  /* ---- the field ---------------------------------------------------------------------
     The still field (warped fbm) is read once per seed and field setting at every grid
     point, plus a step right and a step down for the gradient. The animation adds a
     broad, slowly turning wash of noise on top, so the band edges shift (dots change
     band and blink along them) while the field's texture stays put.                    */
  const stillCache = new Map(), frameCache = new Map();
  let cachedCells = 0;
  const trim = (cache, n, cap) => {
    while (cache.size && (cache.size >= cap || cachedCells + n > 3e6)) {
      const k0 = cache.keys().next().value;
      cachedCells -= cache.get(k0).n;
      cache.delete(k0);
    }
    cachedCells += n;
  };
  // The grid points to read: the frame's, or (General's Rotation and Size) every one region R reaches; the
  // grid and the field run on past the frame (Symmetry folds about the frame's middle, out to any distance).
  function span(g, R) {
    if (!R) return { c0: 0, c1: g.cols, r0: 0, r1: g.rows };
    return { c0: Math.floor(R.x0 / g.cw) - 1, c1: Math.ceil(R.x1 / g.cw) + 1, r0: Math.floor(R.y0 / g.ch) - 1, r1: Math.ceil(R.y1 / g.ch) + 1 };
  }
  // Grid points in field units (width = 1), folded for Symmetry.
  function points(W, H, g, p, sp) {
    const { hex } = g, nc = sp.c1 - sp.c0, n = nc * (sp.r1 - sp.r0), ah = H / W, sym = p.symmetry;
    const X = new Float32Array(n), Y = new Float32Array(n);
    for (let j = sp.r0; j < sp.r1; j++) {
      const off = hex && j % 2 ? 0.5 : 0;
      for (let i = sp.c0; i < sp.c1; i++) {
        let x = ((i + 0.5 + off) * g.cw) / W, y = ((j + 0.5) * g.ch) / W;
        if (sym === 'mirror' || sym === 'quad') x = 0.5 - Math.abs(x - 0.5);
        if (sym === 'quad') y = ah / 2 - Math.abs(y - ah / 2);
        const k = (j - sp.r0) * nc + (i - sp.c0);
        X[k] = x; Y[k] = y;
      }
    }
    return { X, Y };
  }
  function still(W, H, seed, p, R) {
    const g = grid(W, H, p), sp = span(g, R);
    const key = [seed, g.cols, g.rows, g.hex, (H / W).toFixed(5), p.symmetry, sp.c0, sp.c1, sp.r0, sp.r1].join('|');
    const hit = stillCache.get(key);
    if (hit) return hit;
    // (the grid spacing is kept in field units: the cache serves every size of this frame shape)
    const out = Object.assign(points(W, H, g, p, sp), { g, sp, n: (sp.c1 - sp.c0) * (sp.r1 - sp.r0), dx: g.cw / W, dy: g.ch / W });
    trim(stillCache, out.n, 8);
    stillCache.set(key, out);
    return out;
  }
  // The raw field (warped fbm) at a point; z, w move it through the noise for the loop.
  function rawField(seed, p) {
    const NV = PL.noise.get((seed ^ 0x3c6ef372) >>> 0), NW = PL.noise.get((seed ^ 0x510e527f) >>> 0);
    const oct = Math.max(1, Math.min(6, Math.round(p.detail)));
    const f = K.freq * Math.max(0.05, p.fscale), fw = f * K.warpF;
    const wa = K.warpA * (p.warp / 100);
    const fn = (x, y, z, w) => {
      let px = x * f, py = y * f;
      if (wa > 0) {
        px += wa * NW.fbm4(x * fw + 13.1, y * fw + 7.3, z, w, 2, 0.5);
        py += wa * NW.fbm4(x * fw - 5.9, y * fw + 21.4, z + 9.7, w + 4.1, 2, 0.5);
      }
      return NV.fbm4(px + 31.7, py - 17.3, z + 3.3, w - 6.1, oct, K.gain);
    };
    return { fn, f };
  }
  // The field is stretched so its lowest and highest values across the frame (sampled on
  // a fixed grid, so Resolution doesn't move the bands) become 0 and 1.
  const rangeCache = new Map();
  function fieldRange(W, H, seed, p) {
    const ah = H / W;
    const key = [seed, ah.toFixed(5), p.fscale, p.warp, p.detail, p.symmetry, K.freq, K.warpA, K.warpF, K.gain, K.normN, K.recenter].join('|');
    const hit = rangeCache.get(key);
    if (hit) return hit;
    const { fn } = rawField(seed, p);
    const nx = K.normN, ny = Math.max(2, Math.min(4 * nx, Math.round(nx * ah)));
    let lo = Infinity, hi = -Infinity, sum = 0;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        let x = (i + 0.5) / nx, y = ((j + 0.5) / ny) * ah;
        if (p.symmetry === 'mirror' || p.symmetry === 'quad') x = 0.5 - Math.abs(x - 0.5);
        if (p.symmetry === 'quad') y = ah / 2 - Math.abs(y - ah / 2);
        const v = fn(x, y, 0, 0);
        sum += v;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    // ... and is pulled part of the way (recenter) towards having its average in the middle.
    const span = Math.max(1e-6, hi - lo), mean = (sum / (nx * ny) - lo) / span;
    const out = { lo, span, shift: K.recenter * (mean - 0.5) };
    if (rangeCache.size > 32) rangeCache.delete(rangeCache.keys().next().value);
    rangeCache.set(key, out);
    return out;
  }
  // v (0..1) and the size of its gradient at every grid point, for one frame. Contrast
  // pushes v away from the middle. The animation runs at one steady speed: the field moves
  // round a small loop through the noise (so it shifts a little in place, and dots blink),
  // and a broad wave rolls across it, each place a little behind its neighbours (a phase
  // map from a second noise), so band edges are shifting somewhere at every moment.
  function field(W, H, seed, p, t, amt, R) {
    const P0 = still(W, H, seed, p, R);
    const A = Math.max(0, amt || 0);
    const ang = A > 0 ? 2 * Math.PI * (((t % 1) + 1) % 1) : 0;
    const key = [seed, P0.g.cols, P0.g.rows, P0.g.hex, (H / W).toFixed(5), p.fscale, p.warp, p.detail, p.contrast, p.symmetry, A.toFixed(4), ang.toFixed(5), P0.sp.c0, P0.sp.c1, P0.sp.r0, P0.sp.r1,
      K.loopR, K.driftA, K.driftF, K.phaseK, K.freq, K.warpA, K.warpF, K.cgain, K.gain, K.normN, K.recenter].join('|');
    const hit = frameCache.get(key);
    if (hit) return hit;
    const { X, Y, g, sp, n, dx, dy } = P0;
    const { fn, f } = rawField(seed, p);
    const { lo, span, shift } = fieldRange(W, H, seed, p);
    const ND = PL.noise.get((seed ^ 0x6a09e667) >>> 0);
    const C = K.cgain * (p.contrast / 100), fd = f * K.driftF;
    // Both are the same at every moment of the loop (only shifted along it), so the motion
    // never speeds up or slows down, and t = 1 brings everything back to t = 0.
    const rho = K.loopR * A, z = rho * (Math.cos(ang) - 1), w = rho * Math.sin(ang);
    const drift = K.driftA * A;
    const cl = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
    // The rolling wave moves v (the bands and, in Lattice mode, the dot sizes) but not the
    // steepness the Contour dots gather on: its ripples would add steepness of their own.
    const B = new Float32Array(n), V = new Float32Array(n), G = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const x = X[k], y = Y[k];
      const v = 0.5 + ((fn(x, y, z, w) - lo) / span - 0.5 - shift) * C;
      const r = drift > 0 ? drift * Math.sin(ang + K.phaseK * ND.noise4(x * fd, y * fd, 0.37, 0.71)) : 0;
      B[k] = cl(v); V[k] = cl(v + r);
    }
    // the size of the gradient, from the neighbouring grid points
    const cols = sp.c1 - sp.c0, rows = sp.r1 - sp.r0;
    for (let j = 0; j < rows; j++) {
      const j0 = j > 0 ? j - 1 : j, j1 = j < rows - 1 ? j + 1 : j;
      for (let i = 0; i < cols; i++) {
        const i0 = i > 0 ? i - 1 : i, i1 = i < cols - 1 ? i + 1 : i;
        const gx = (B[j * cols + i1] - B[j * cols + i0]) / ((i1 - i0) * dx || 1);
        const gy = (B[j1 * cols + i] - B[j0 * cols + i]) / ((j1 - j0) * dy || 1);
        G[j * cols + i] = Math.hypot(gx, gy);
      }
    }
    const out = { V, G, g, sp, n };
    trim(frameCache, n, 72);
    frameCache.set(key, out);
    return out;
  }

  /* ---- dots: per cell, which (if any), its band and size ------------------------------ */
  function dots(W, H, seed, p, nInks, t, amt, R) {
    const { V, G, sp } = field(W, H, seed, p, t, amt, R);
    const g = grid(W, H, p); // pixel sizes come from this frame (the cached field is in width units)
    const { cols, rows, cw } = g, nc = sp.c1 - sp.c0;
    const m = Math.max(1, nInks);
    const T = Array.from({ length: m - 1 }, (_, k) => K.bandC + ((k + 1) / m - 0.5) * K.bandS);
    const mc = Math.max(3, m), TC = Array.from({ length: mc - 1 }, (_, k) => K.bandC + ((k + 1) / mc - 0.5) * K.bandS);
    const cut = p.cutout / 100, sv = p.sizevar / 100, rMax = (p.dotsize / 100) * cw * 0.5;
    const lat = p.mode === 'lattice';
    const loose = K.lp * (p.loose / 100), edge = p.edge / 100;
    const sym = p.symmetry;
    const out = [];
    for (let j = sp.r0; j < sp.r1; j++) {
      const jj = sym === 'quad' ? Math.min(j, rows - 1 - j) : j;
      for (let i = sp.c0; i < sp.c1; i++) {
        const k = (j - sp.r0) * nc + (i - sp.c0), v = V[k];
        const ii = sym === 'mirror' || sym === 'quad' ? Math.min(i, cols - 1 - i) : i;
        let u;
        if (lat) {
          if (v < cut) continue;
          u = v;
        } else {
          // closeness to the nearest band edge, from the distance to it (v gap / gradient)
          let gap = 1;
          for (let q = 0; q < TC.length; q++) { const d = Math.abs(v - TC[q]); if (d < gap) gap = d; }
          const d = (gap * cols) / Math.max(G[k], 1e-4); // in cells
          const near = Math.exp(-Math.pow(d / K.dw, K.q));
          const steep = 1 - Math.exp(-Math.pow(G[k] / K.gs, K.gk));
          if (hash(seed, ii, jj, 0x57d1) >= loose + edge * (K.b0 + K.bg * steep + K.be * near)) continue;
          u = K.u0 + K.du * (K.uw * steep + (1 - K.uw) * near);
          if (u < cut) continue;
        }
        const tt = cut < 1 ? Math.min(1, Math.max(0, (u - cut) / (1 - cut))) : 1;
        let band = 0;
        while (band < T.length && v >= T[band]) band++;
        out.push({ i, j, ii, jj, band, r: rMax * (1 - sv * (1 - tt)) });
      }
    }
    return { list: out, g };
  }

  /* ---- build ------------------------------------------------------------------------ */
  function build({ W, H, seed, p, colors, t = 0, anim, crisp, region }) {
    // Tiny previews (like the kept thumbnails) use a coarser grid so their dots stay visible.
    const L0 = Math.max(W, H);
    if (crisp === false && L0 < 200 && p.res > L0 / 4) p = Object.assign({}, p, { res: Math.max(8, Math.round(L0 / 4)) });
    const n = colors.length;
    const m = nDots(n);
    const scene = new PL.Scene(W, H, colors[0], 0);
    const layers = [];
    for (let k = 0; k < m; k++) layers.push(scene.layer('dots-' + (k + 1), colors[1 + k], m === 1 ? 'Dots' : 'Dots ' + (k + 1), 1 + k));
    const accent = n >= 3 ? scene.layer('accent', colors[n - 1], 'Accent', n - 1) : null;
    const amt = anim ? anim.amount : 0;
    const { list, g } = dots(W, H, seed, p, m, t, amt, region);
    const { cw, ch, hex } = g;
    const rate = p.accent / 100, jit = p.jitter / 100;
    const shape = p.shape;
    for (const d of list) {
      const L = accent && hash(seed, d.ii, d.jj, 0xacce) < rate ? accent : layers[Math.min(m - 1, d.band)];
      let x = (d.i + 0.5 + (hex && d.j % 2 ? 0.5 : 0)) * cw, y = (d.j + 0.5) * ch;
      if (jit > 0) {
        x += (hash(seed, d.ii, d.jj, 0x71e1) - 0.5) * jit * cw;
        y += (hash(seed, d.ii, d.jj, 0x71e2) - 0.5) * jit * cw;
      }
      if (shape === 'square') PL.Scene.rect(L, x - d.r, y - d.r, 2 * d.r, 2 * d.r);
      else if (shape === 'diamond') { const q = d.r * 1.2533; PL.Scene.quad(L, x, y - q, x + q, y, x, y + q, x - q, y); } // same area as the circle
      else PL.Scene.circle(L, x, y, d.r);
    }
    scene.status = `${list.length.toLocaleString()} dots`;
    return scene;
  }

  PL.tools.register({
    id: 'stipple',
    name: 'Stipple',
    kind: 'Backgrounds',
    tagline: 'Halftone dots',
    about: 'Dot fields read from a noise field: halftone lattices and contour scatters that gather along the color-band edges, with a few accent dots. The edges drift in the animation, so dots blink on and off along them.',
    inks: {
      min: 3, max: 8, roles, fit, spec, add, generate,
      span: () => 2, // Invert swaps the ground and the first dot ink
      hint: 'Ground first, then the dot inks from the lowest band to the highest, then the accent.',
    },
    palettes: PALETTES,
    params: PARAMS,
    animLabel: 'Intensity',
    animHint: 'How far the field drifts over the loop: dots blink on and off as the band edges shift',
    defaults: {
      anim: { amount: 0.3, fps: 14, frames: 30 },
      fx: {},
      palette: 'Ember', // the preset the style opens on (its card's colors)
    },
    build,
    zoom: true, // draws any region of its world (General's Rotation and Size)
    _K: K,
    _clear: () => { stillCache.clear(); frameCache.clear(); rangeCache.clear(); cachedCells = 0; },
    _dots: dots,
    _field: field,
  });
})();
