/* ==========================================================================
   tools/stitch.js — Stitch: glitched pixel grid.

   1. Grid: Columns across the frame; the rows follow the frame's shape
      (cells are as near square as the frame allows). Every cell has a thin
      line of the palette's darkest color on its left and top (Gutter sets
      how thick), so the grid reads like stitches on canvas.
   2. Field: a smooth noise, stretched upright by Streak (tall streaks),
      sized by Scale, measured in frame widths from the top-left corner so a
      variation keeps its shapes in every frame shape and at any Columns.
      The rows are cut into bands (Band height rows each) and each band is
      slid sideways by its own amount (Slip): the glitch.
   3. Inks: the field is cut into Steps levels of about equal share. The
      lowest ones (Ground x Steps of them) show the ground; the others take
      the inks in turn, in an order of their own for every variation, so
      neighbouring levels make thin contour rings.
   4. Blobs: round patches of the second color laid over the field (Blobs
      sets how much they cover, Blob size how big they are). They aren't
      slipped. Stray cells: single cells in a random color of the palette,
      over everything (Stray cells sets how many).
   5. Animation: the view drifts once round a small circle. The field and
      the blobs drift with it (the field mostly up and down, as it is
      stretched), so cells step through the levels while the bands, stray
      cells and grid hold still. Steady speed all the way round; seamless;
      Amount 0 holds everything still.
   ========================================================================== */
(() => {
  const { hash } = PL.rng;

  // Ground, blobs, then the field inks. The default look's colors first.
  const PALETTES = [
    { name: 'Fern', colors: ['#F7FBF1', '#1ED001', '#1FAB46', '#2DCD8E', '#99EAEE', '#161616'] },
    { name: 'Ember', colors: ['#FBF4EA', '#FF5A1F', '#B8321E', '#FFB13B', '#F4D3A6', '#171211'] },
    { name: 'Lagoon', colors: ['#F1F7FA', '#2E5BFF', '#173C8C', '#36B6F0', '#A9DCF7', '#0F141C'] },
    { name: 'Candy', colors: ['#FFF4F8', '#FF3D9A', '#8A4DFF', '#FF9CCB', '#FFD76A', '#1B1320'] },
    { name: 'Triad', colors: ['#F6F5EF', '#C952A8', '#0095B5', '#E2CC47', '#EFCBE2', '#101D21'] }, // triad 340/100/220: blobs, two inks, a tint of the blobs; grid lines a deep shade
    { name: 'Reef', colors: ['#EEF7F6', '#EF675A', '#007176', '#41C1BA', '#F5C5B4', '#031A1E'] },
    { name: 'Plum', colors: ['#FAF5FF', '#8A3FFC', '#4B1D8F', '#D18BFF', '#FFB3D9', '#170F22'] },
    { name: 'Citrus', colors: ['#FFFBEA', '#FFB000', '#F05A28', '#FFE066', '#9BE15D', '#1A1712'] },
    { name: 'Mono', colors: ['#F3F3F0', '#E8432E', '#2A2A2A', '#7C7C7C', '#BEBEBE', '#121212'] },
    { name: 'Berry', colors: ['#FEF1F6', '#C5256D', '#60194E', '#EE8AB2', '#FCD1DC', '#EEB154', '#1F111A'] },
  ];

  /* ---- color roles -------------------------------------------------------------------- */
  const roles = (n) => ['Ground', 'Blobs', ...Array.from({ length: n - 2 }, (_, i) => (n === 3 ? 'Ink' : 'Ink ' + (i + 1)))];
  const spec = (n) => ({ ramp: 1, accents: Math.max(1, n - 1) });
  const isLight = (hex) => PL.color.luminance(hex) > 0.35;

  // "New colors": a pale ground (now and then a deep one), a vivid blob color, then inks in
  // neighbouring hues, light, mid and deep by turns, the last one near-black (on a deep
  // ground: near-white) for the darkest level and the grid lines.
  function generate(n, rng) {
    const C = PL.color;
    const dark = rng.chance(0.12);
    const hb = rng.float(0, 360);
    const out = [
      dark ? C.lch(rng.float(0.16, 0.21), rng.float(0.01, 0.03), hb) : C.lch(rng.float(0.965, 0.985), rng.float(0.01, 0.03), hb),
      C.lch(dark ? rng.float(0.82, 0.9) : rng.float(0.66, 0.78), rng.float(0.2, 0.27), hb),
    ];
    const m = n - 2;
    const Ls = [0.56, 0.78, 0.89];
    const off = rng.int(0, 2);
    for (let i = 0; i < m; i++) {
      if (i === m - 1 && m >= 2) {
        out.push(dark ? C.lch(rng.float(0.93, 0.96), rng.float(0.01, 0.03), hb) : C.lch(rng.float(0.16, 0.2), rng.float(0, 0.01), hb));
        continue;
      }
      const L = Ls[(i + off) % 3] + rng.float(-0.04, 0.04);
      out.push(C.lch(L, L > 0.85 ? rng.float(0.06, 0.1) : rng.float(0.13, 0.2), hb + rng.sign() * rng.float(25, 75))); // near the blobs' hue, never on it
    }
    return out;
  }

  // + adds an ink in a hue the palette doesn't have yet.
  function add(colors) {
    const C = PL.color;
    const c = colors.slice();
    const hues = c.slice(1).filter((x) => C.hexToLch(x)[1] > 0.04).map((x) => C.hexToLch(x)[2]);
    let best = 0, bd = -1;
    for (let h = 0; h < 360; h += 10) {
      const d = hues.length ? Math.min(...hues.map((x) => Math.abs((((h - x) % 360) + 540) % 360 - 180))) : 180;
      if (d > bd) { bd = d; best = h; }
    }
    c.push(C.lch(isLight(c[0]) ? 0.66 : 0.82, 0.16, best));
    return c;
  }

  function fit(colors, n) {
    let c = (colors || []).map(PL.color.normHex).filter(Boolean);
    if (!c.length) c = PALETTES[0].colors.slice();
    if (c.length === 1) c.push(PL.color.mix(c[0], isLight(c[0]) ? '#000000' : '#FFFFFF', 0.85));
    if (c.length >= n) return c.slice(0, n);
    while (c.length < n) c = add(c);
    return c;
  }

  const S = (section, key, label, min, max, def, extra = {}) => ({ section, key, label, type: 'range', min, max, def, step: 1, ...extra });
  const PARAMS = [
    S('Grid', 'cols', 'Columns', 16, 96, 48, { rand: [34, 64], hint: 'Cells across the frame' }),
    S('Grid', 'gutter', 'Gutter', 0, 100, 20, { unit: '%', hint: 'Thickness of the grid lines between the cells' }),
    S('Field', 'streak', 'Streak', 0, 100, 80, { unit: '%', rand: [50, 92], hint: 'Stretches the field upright into tall streaks (0: round shapes)' }),
    S('Field', 'scale', 'Scale', 0, 100, 50, { unit: '%', rand: [33, 77], hint: 'Size of the shapes in the field' }),
    S('Field', 'slip', 'Slip', 0, 100, 40, { unit: '%', rand: [20, 70], hint: 'How far each band of rows slides sideways (0: no glitch)' }),
    S('Field', 'band', 'Band height', 1, 16, 5, { rand: [3, 10], hint: 'Rows in each sliding band' }),
    S('Field', 'blobs', 'Blobs', 0, 100, 35, { unit: '%', rand: [26, 60], hint: 'How much of the frame the round blobs cover (0: none)' }),
    S('Field', 'blobSize', 'Blob size', 0, 100, 50, { unit: '%', rand: [36, 79], hint: 'Size of the blobs: many small ones or a few big ones' }),
    S('Inks', 'steps', 'Steps', 2, 12, 7, { rand: [7, 10], hint: 'Levels the field is cut into; past the ground they take the inks in turn' }),
    S('Inks', 'ground', 'Ground', 0, 100, 35, { unit: '%', rand: [21, 47], hint: 'Share of the levels that show the ground' }),
    S('Inks', 'stray', 'Stray cells', 0, 100, 30, { unit: '%', rand: [12, 45], hint: 'Single cells in a random color, scattered over everything' }),
  ];

  // Constants. Lengths in frame widths unless noted.
  const K = {
    gutter: 0.39,         // line thickness: Gutter x this x the cell width (20 %: about 8 %)
    freq: [5.4, 1.8],     // field: noise frequency (per frame width) at Scale 0 -> 100 (log scale)
    oct: 3, gain: 0.5,    // field: fractal octaves and their fall-off
    noiseSd: 0.297,       // the spread of one octave of noise (for even levels)
    stretch: [6.5, 2.5],  // Streak: the field's shapes grow taller by 1 + a x Streak^b ...
    squeeze: 1.75,        // ... and narrower by 1 + this x Streak
    slip: 0.28,           // Slip 100 %: bands slide up to this far either way
    blobF: [7, 1.2],      // blobs: noise frequency at Blob size 0 -> 100 (log scale)
    blobT: [2.35, 1.9],   // blobs: they cover P(z > a - b x Blobs) of the frame (z: a normal variate) ...
    blobCover: [0.72, 0.56], // ... times a + b x Blob size (small blobs cover less) ...
    blobSd: 0.295,
    bar: [3.2, 1.6],      // ... a share of it in wide bars: a field this many times wider and less tall ...
    barShare: 0.25,       // ... (this share; the rest in round blobs)
    stray: 0.066,         // Stray cells 100 %: the chance a cell is stray
    drift: 0.18,          // animation: the view circles this far (in noise units) x Amount ...
    driftX: 1.5,          // ... the field's view this many times further across (it changes faster then)
  };

  const lerp = (a, b, t) => a + (b - a) * t;
  const loglerp = (a, b, t) => Math.exp(lerp(Math.log(a), Math.log(b), t));
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  // Normal CDF (a logistic fit, within 1 % everywhere): turns the noise into even levels.
  const Phi = (z) => 1 / (1 + Math.exp(-1.7017 * z - 0.0794 * z * z * z));
  // ... and its inverse (by halving the interval)
  const invPhi = (q) => { let a = -6, b = 6; for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (Phi(m) < q) a = m; else b = m; } return (a + b) / 2; };

  /* ---- grid ---------------------------------------------------------------------------- */
  // The rows go by the frame's exact shape (aspect, from the app), so the preview has the export's rows.
  function grid(W, H, p, aspect) {
    const cols = Math.max(2, Math.round(p.cols));
    const rows = Math.max(1, aspect > 0 ? Math.floor(cols / aspect + 0.5 + 1e-6) : Math.round((cols * H) / W));
    return { cols, rows, cw: W / cols, ch: H / rows };
  }

  /* ---- per-variation settings (each from its own hash: changing one setting never
     reshuffles the others) ------------------------------------------------------------- */
  function setup(seed, p, n) {
    const u = (k) => hash(seed, 0x57c7, k, 5);
    const inks = Math.max(1, n - 2);
    // the inks' order through the levels: a shuffle of their own for every variation
    const order = Array.from({ length: inks }, (_, i) => i + 2);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(u(100 + i) * (i + 1));
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
    const scale = clamp01(p.scale / 100), streak = clamp01(p.streak / 100), bs = clamp01(p.blobSize / 100);
    return {
      order,
      F: loglerp(K.freq[0], K.freq[1], scale),
      squeeze: 1 + K.squeeze * streak,
      stretch: 1 + K.stretch[0] * Math.pow(streak, K.stretch[1]),
      Fb: loglerp(K.blobF[0], K.blobF[1], bs),
      // the noise views: a far-off corner of noise space for every variation
      fx: u(1) * 200 - 100, fy: u(2) * 200 - 100, bx: u(3) * 200 - 100, by: u(4) * 200 - 100,
      z: u(5) * 7, w: u(6) * 7,
    };
  }

  // The color index (0 ground, 1 blobs, 2.. inks) of every cell at time t: the frame's cells, or (General's
  // Rotation and Size) every cell of the grid running on past the frame that region R reaches.
  function cells(W, H, seed, p, n, t, amount, aspect, R) {
    const g = grid(W, H, p, aspect);
    const { cols, rows, cw, ch } = g;
    const c0 = R ? Math.floor(R.x0 / cw) : 0, c1 = R ? Math.ceil(R.x1 / cw) : cols, r0 = R ? Math.floor(R.y0 / ch) : 0, r1 = R ? Math.ceil(R.y1 / ch) : rows;
    const nc = c1 - c0, nr = r1 - r0;
    const P = setup(seed, p, n);
    const NF = PL.noise.get((seed ^ 0x2f6b9d31) >>> 0), NB = PL.noise.get((seed ^ 0x6a09e667) >>> 0);
    const steps = Math.max(2, Math.round(p.steps));
    const G = Math.round(clamp01(p.ground / 100) * steps);
    const slip = clamp01(p.slip / 100) * K.slip;
    const band = Math.max(1, Math.round(p.band));
    const blobs = clamp01(p.blobs / 100);
    // blob thresholds: the round ones and the bars share the cover between them
    const cover = blobs > 0 ? Math.min(0.97, (1 - Phi(K.blobT[0] - K.blobT[1] * blobs)) * (K.blobCover[0] + K.blobCover[1] * clamp01(p.blobSize / 100))) : 0;
    const T = cover > 0 ? K.blobSd * invPhi(1 - cover * (1 - K.barShare)) : Infinity;
    const T2 = cover > 0 && K.barShare > 0 ? K.blobSd * invPhi(1 - cover * K.barShare) : Infinity;
    const stray = clamp01(p.stray / 100) * K.stray;
    // the drift round the loop (noise units): the view circles, starting upward
    const th = 2 * Math.PI * (((t % 1) + 1) % 1), rho = K.drift * Math.max(0, amount || 0);
    const dx = -rho * (1 - Math.cos(th)), dy = rho * Math.sin(th), dxf = dx * K.driftX;
    const out = new Uint8Array(nc * nr);
    const F = P.F * P.squeeze, Fy = P.F / P.stretch, Fb = P.Fb;
    let a2 = 0, a1 = 0;
    for (let o = 0, a = 1; o < K.oct; o++, a *= K.gain) { a1 += a; a2 += a * a; }
    const sd = (K.noiseSd * Math.sqrt(a2)) / a1;
    let blobCells = 0;
    for (let r = r0; r < r1; r++) {
      const Y = ((r + 0.5) * ch) / W;
      const b = Math.floor(r / band);
      const off = slip * (2 * hash(seed, b, 0x51a9, 9) - 1);
      const yn = Y * Fy + P.fy + dy, yb = Y * Fb + P.by + dy, yb2 = (Y * Fb + dy) * K.bar[1] + P.by + 41.7;
      for (let c = c0; c < c1; c++) {
        const X = (c + 0.5) / cols;
        const k = (r - r0) * nc + (c - c0);
        // stray cells: fixed in place, over everything
        if (stray > 0 && hash(seed, c, r, 0x5e1f) < stray) { out[k] = Math.floor(hash(seed, c, r, 0x5e2f) * n); continue; }
        // blobs (not slipped)
        if (cover > 0 && (NB.noise4(X * Fb + P.bx + dx, yb, P.z + 3.3, P.w) > T || NB.noise4((X * Fb + dx) / K.bar[0] + P.bx - 37.3, yb2, P.z + 9.1, P.w) > T2)) { out[k] = 1; blobCells++; continue; }
        // the field: levels of about equal share; the lowest ones show the ground
        const v = NF.fbm4((X + off) * F + P.fx + dxf, yn, P.z, P.w, K.oct, K.gain);
        const q = Math.min(steps - 1, Math.floor(Phi(v / sd) * steps));
        out[k] = q < G ? 0 : P.order[(q - G) % P.order.length];
      }
    }
    return { g, out, steps, blobCells, c0, r0, c1, r1 };
  }

  /* ---- build ------------------------------------------------------------------------ */
  function build({ W, H, aspect, seed, p, colors, t = 0, anim, region }) {
    const n = colors.length;
    const { g, out, steps, c0, r0, c1, r1 } = cells(W, H, seed, p, n, t, anim ? anim.amount : 0, aspect, region);
    const { cols, rows, cw, ch } = g;
    // the grid lines: the palette's darkest color
    let dark = 0;
    for (let i = 1; i < n; i++) if (PL.color.luminance(colors[i]) < PL.color.luminance(colors[dark])) dark = i;
    const gw = Math.max(0, Math.min(100, p.gutter)) / 100;
    const gl = gw > 0 ? Math.max(Math.min(1, W / 900), K.gutter * gw * cw) : 0; // at least a hairline at small sizes
    const scene = new PL.Scene(W, H, colors[dark], dark);
    const names = roles(n);
    const layers = colors.map((col, i) => scene.layer(i === 0 ? 'ground' : i === 1 ? 'blobs' : 'ink-' + (i - 1), col, names[i], i));
    const seam = gl > 0 ? 0 : 0.5; // no gutter: overlap a hair so no seams show between cells
    const nc = c1 - c0;
    for (let r = r0; r < r1; r++) {
      const y0 = r * ch, y1 = r === rows - 1 ? H : (r + 1) * ch;
      for (let c = c0; c < c1; c++) {
        const x0 = c * cw, x1 = c === cols - 1 ? W : (c + 1) * cw;
        PL.Scene.rect(layers[out[(r - r0) * nc + (c - c0)]], x0 + gl, y0 + gl, x1 - x0 - gl + (c < c1 - 1 ? seam : 0), y1 - y0 - gl + (r < r1 - 1 ? seam : 0));
      }
    }
    scene.layers = scene.layers.filter((L) => L.r.length);
    scene.status = `${cols} × ${rows} cells · ${steps} steps`;
    return scene;
  }

  PL.tools.register({
    id: 'stitch',
    name: 'Stitch',
    kind: 'Backgrounds',
    tagline: 'Glitched pixel grid',
    about: 'A grid of square cells colored from a noise field cut into levels: tall streaks, bands of rows slid sideways like a glitch, round blobs of one color and a scatter of stray cells, all ruled with thin dark lines. In the animation the field drifts round a small circle, so the cells step through the colors.',
    inks: {
      min: 3, max: 12, roles, fit, spec, add, generate,
      span: () => 2, // Invert swaps the ground and the blobs
      hint: 'Ground first, then the blobs, then the inks the levels take in turn (in an order of their own for every variation). The darkest color also draws the grid lines.',
    },
    palettes: PALETTES,
    params: PARAMS,
    animLabel: 'Amount',
    animHint: 'How far the field drifts round its loop (0: still)',
    defaults: {
      anim: { amount: 0.6, fps: 12, frames: 36 },
      fx: {},
    },
    build,
    zoom: true, // draws any region of its world (General's Rotation and Size)
    _K: K,
    _cells: cells,
    _setup: setup,
  });
})();
