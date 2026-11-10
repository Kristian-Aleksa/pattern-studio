/* ==========================================================================
   tools/modular.js — Modular: modular grid.

   1. Grid: Modules across the frame; the rows follow its shape (modules fill
      the frame, halves round up). Every module is cut into Units per module
      across and down, and Merging joins neighbouring modules into 2 x 1, 1 x 2
      and 2 x 2 pieces.
   2. Treatments: every piece draws one of six, picked by the Treatments weights
      (each piece keeps its place along the weights, so moving one slider only
      shifts the pieces near that boundary): Empty (the
      background), Solid (one ink), Blocks (a two-colour pixel field on the unit
      grid), Dot matrix (dots where the field is on), Line grid (thin lines on
      the unit grid) and Gradient (two inks across, down or corner to corner).
      A piece keeps its two colours whatever its treatment.
   3. Detail: Block fill sets how much of the field is on, Dot size the dots,
      Grid lines how strongly the rules between the modules show, Line weight
      the rules and the line grids (in px at a 2400 px frame).
   4. Animation: the field under the blocks and the
      dots drifts, so units flick on and off, in four eased beats per loop
      (slow at each beat, quick between). Seamless; Intensity sets how far the
      field moves (0 holds everything still).
   ========================================================================== */
(() => {
  const { hash } = PL.rng;

  // Background, rules, then the inks. The default look uses Bauhaus (defaults.palette).
  const PALETTES = [
    { name: 'Clay', colors: ['#2B1D16', '#F1E4D8', '#D9734E', '#E8B04B', '#8FB59A', '#F4E9D8'] },
    { name: 'Sorbet', colors: ['#151316', '#EEE8EA', '#E36487', '#D76632', '#EFEA75', '#E6FCA3'] },
    { name: 'Midnight', colors: ['#000000', '#FFFFFF', '#E36487', '#D76632', '#EFEA75', '#E6FCA3'] },
    { name: 'Tetrad', colors: ['#F6F3EC', '#1B1D23', '#E36650', '#EBC751', '#0097AC', '#39489E'] }, // rectangle tetrad 32/92/212/272
    { name: 'Ocean', colors: ['#0B1320', '#D7E3F4', '#1F6FEB', '#58A6FF', '#A5D6FF', '#F78166'] },
    { name: 'Mint', colors: ['#0F1A17', '#DDEDE6', '#3DDC97', '#1B998B', '#F7F7F2', '#FFC857'] },
    { name: 'Bauhaus', colors: ['#F3EEE4', '#161616', '#E2432C', '#2450C8', '#F4B400', '#1F8A5B'] },
    { name: 'Dusk', colors: ['#1B1530', '#F4E8FF', '#FF7A9A', '#FFB86B', '#7C6CFF', '#3DD6C6'] },
    { name: 'Mono', colors: ['#111111', '#F5F5F5', '#FFFFFF', '#BBBBBB', '#6B6B6B', '#2E2E2E'] },
    { name: 'Duo', colors: ['#F2EEE6', '#1B1B1B', '#1B3BFF', '#FF5A36'] },
  ];

  /* ---- colour roles -------------------------------------------------------------------- */
  const roles = (n) => ['Background', 'Rules', ...Array.from({ length: n - 2 }, (_, i) => (n === 3 ? 'Ink' : 'Ink ' + (i + 1)))];
  const spec = (n) => ({ ramp: 1, accents: Math.max(1, n - 2) });
  const isLight = (hex) => PL.color.luminance(hex) > 0.35;

  // "New colors": a deep background (now and then a pale one) with rules in its opposite, then
  // inks round one part of the colour wheel (pink, orange, yellow and lime, say):
  // two mid inks and two light ones by turns.
  function generate(n, rng) {
    const C = PL.color;
    const light = rng.chance(0.2);
    const h0 = rng.float(0, 360), dir = rng.sign(), step = rng.float(22, 48);
    const out = light
      ? [C.lch(rng.float(0.94, 0.97), rng.float(0.005, 0.02), h0), C.lch(rng.float(0.16, 0.22), rng.float(0.005, 0.02), h0)]
      : [C.lch(rng.float(0.12, 0.17), rng.float(0.005, 0.015), h0), C.lch(rng.float(0.92, 0.95), rng.float(0.006, 0.015), h0)];
    const Ls = light ? [0.62, 0.5, 0.74, 0.4] : [0.62, 0.6, 0.91, 0.95]; // on a pale ground: mid and deep inks
    for (let i = 0; i < n - 2; i++) {
      const L = (i < 4 ? Ls[i] : light ? rng.float(0.4, 0.75) : rng.float(0.6, 0.93)) + rng.float(-0.03, 0.03);
      out.push(C.lch(L, L > 0.85 ? rng.float(0.12, 0.17) : rng.float(0.15, 0.2), h0 + dir * step * i + rng.float(-8, 8)));
    }
    return out;
  }

  // + adds an ink in a hue the palette doesn't have yet.
  function add(colors) {
    const C = PL.color;
    const c = colors.slice();
    const hues = c.slice(2).filter((x) => C.hexToLch(x)[1] > 0.04).map((x) => C.hexToLch(x)[2]);
    let best = 0, bd = -1;
    for (let h = 0; h < 360; h += 10) {
      const d = hues.length ? Math.min(...hues.map((x) => Math.abs((((h - x) % 360) + 540) % 360 - 180))) : 180;
      if (d > bd) { bd = d; best = h; }
    }
    c.push(C.lch(0.72, 0.16, best));
    return c;
  }

  function fit(colors, n) {
    let c = (colors || []).map(PL.color.normHex).filter(Boolean);
    if (!c.length) c = PALETTES[0].colors.slice();
    if (c.length === 1) c.push(PL.color.mix(c[0], isLight(c[0]) ? '#000000' : '#FFFFFF', 0.9));
    if (c.length >= n) return c.slice(0, n);
    while (c.length < n) c = add(c);
    return c;
  }

  /* ---- settings -------------------------------------------------------------------------- */
  const S = (section, key, label, min, max, def, extra = {}) => ({ section, key, label, type: 'range', min, max, def, step: 1, ...extra });
  const W8 = 'Weight: how often a piece gets this treatment';
  const PARAMS = [
    S('Layout', 'modules', 'Modules across', 2, 12, 9, { rand: [6, 12], hint: 'Modules across the frame (the rows follow its shape)' }),
    S('Layout', 'units', 'Units', 2, 12, 7, { rand: [4, 12], hint: 'Units per module: each module is cut into this many across and down' }),
    S('Layout', 'merging', 'Merging', 0, 100, 45, { unit: '%', rand: [25, 65], hint: 'Share of modules joined into 2 x 1, 1 x 2 and 2 x 2 pieces' }),
    S('Treatments', 'empty', 'Empty', 0, 100, 34, { rand: [20, 45], hint: W8 + ' (the background shows)' }),
    S('Treatments', 'solid', 'Solid', 0, 100, 20, { rand: [10, 32], hint: W8 + ' (one ink)' }),
    S('Treatments', 'blocks', 'Blocks', 0, 100, 24, { rand: [14, 34], hint: W8 + ' (a two-color pixel field)' }),
    S('Treatments', 'dots', 'Dot matrix', 0, 100, 11, { rand: [6, 22], hint: W8 + ' (dots on the unit grid)' }),
    S('Treatments', 'lines', 'Line grid', 0, 100, 0, { rand: [0, 18], hint: W8 + ' (thin lines on the unit grid)' }),
    S('Treatments', 'gradient', 'Gradient', 0, 100, 10, { rand: [4, 16], hint: W8 + ' (two inks blended)' }),
    S('Detail', 'fill', 'Block fill', 10, 90, 50, { unit: '%', rand: [35, 65], hint: 'How much of the blocks and dot matrices is on' }),
    S('Detail', 'dot', 'Dot size', 20, 100, 76, { unit: '%', rand: [50, 90], hint: 'Dot diameter, as a share of a unit' }),
    S('Detail', 'grid', 'Grid lines', 0, 100, 32, { unit: '%', rand: [12, 45], hint: 'How strongly the rules between the modules show' }),
    S('Detail', 'weight', 'Line weight', 0.5, 4, 1, { step: 0.5, rand: [0.5, 1.5], hint: 'Thickness of the rules and the line grids (px at 2400 px)' }),
  ];
  const TREAT = ['empty', 'solid', 'blocks', 'dots', 'lines', 'gradient'];

  const K = {
    freq: 0.3,        // field frequency, per unit: neighbouring units share a colour about 68 % of the time,
                      // two apart 53 %, then no more than chance (whatever the units per module)
    oct: 1,           // octaves of the field
    gain: 0.5,
    levels: 4000,     // samples of the field behind its fill levels (Block fill = the share on)
    merge: [0.5, 0.25, 0.25], // a merged piece: 2 x 2, 2 x 1 or 1 x 2
    bgBase: 0.4,      // share of blocks, dot matrices and line grids drawn on the background
    beats: 4,         // the field moves in this many eased beats per loop
    radius: 0.6,      // how far the field travels round the loop at Intensity 1 (noise units); at the
                      // default 0.5 a unit flicks on and off about once a loop (2.2 changes)
    lineAlpha: 0.85,  // line grid opacity
    ref: 2400,        // Line weight is in px at a frame this size
  };

  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

  // The field's levels: sorted samples of it (far apart, at random times), so a share of units
  // on maps to a threshold exactly (Block fill 10 % turns a tenth of the units on).
  let LEVELS = null;
  function cutFor(fill) {
    if (!LEVELS) {
      const NF = PL.noise.get(0x2b1d), v = new Float64Array(K.levels);
      for (let i = 0; i < K.levels; i++) {
        const h = (k) => hash(0x2b1d, i, k, 3) * 1000;
        v[i] = NF.fbm4(h(1), h(2), h(3), h(4), K.oct, K.gain);
      }
      LEVELS = v.sort();
    }
    const q = clamp01(1 - fill) * (LEVELS.length - 1), i = Math.floor(q), f = q - i;
    return i >= LEVELS.length - 1 ? LEVELS[LEVELS.length - 1] + 1 : LEVELS[i] + (LEVELS[i + 1] - LEVELS[i]) * f;
  }

  /* ---- grid and pieces ---------------------------------------------------------------- */
  // The rows go by the frame's exact shape (aspect, from the app); halves round up
  // (12 -> 21 rows at 9:16, 10 at 5:4, 7 at 16:9; 2 -> 2 and 7 -> 5 at 4:3).
  function grid(W, H, p, aspect) {
    const cols = Math.max(1, Math.round(p.modules));
    const a = aspect > 0 ? aspect : W / H;
    const rows = Math.max(1, Math.floor(cols / a + 0.5 + 1e-6));
    return { cols, rows, U: Math.max(1, Math.round(p.units)) };
  }

  // Merging: modules in reading order; a free one starts a merged piece when its own number is
  // under Merging (the shape by a second number, the first that fits), else stays single.
  // (ox, oy): past the frame (General's Rotation and Size) the grid carries on in frame-sized blocks of
  // modules, each merged the same way from its own place in the grid (so no two blocks are alike).
  function pieces(seed, cols, rows, merging, ox = 0, oy = 0) {
    const own = new Int32Array(cols * rows).fill(-1);
    const out = [];
    const free = (x, y, w, h) => {
      if (x + w > cols || y + h > rows) return false;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (own[(y + j) * cols + x + i] >= 0) return false;
      return true;
    };
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (own[y * cols + x] >= 0) continue;
        let w = 1, h = 1;
        if (hash(seed, ox + x, oy + y, 0x3e17) < merging) {
          const r = hash(seed, ox + x, oy + y, 0x3e18), m = K.merge;
          const order = r < m[0] ? [[2, 2], [2, 1], [1, 2]] : r < m[0] + m[1] ? [[2, 1], [1, 2], [2, 2]] : [[1, 2], [2, 1], [2, 2]];
          for (const [sw, sh] of order) if (free(x, y, sw, sh)) { w = sw; h = sh; break; }
        }
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) own[(y + j) * cols + x + i] = out.length;
        out.push({ x: ox + x, y: oy + y, w, h });
      }
    }
    return out;
  }

  // Each piece: a treatment from its place along the weights, an ink, a base (the background
  // or a second ink), a gradient direction and its own patch of the field.
  function dress(seed, P, p, nInk) {
    const wts = TREAT.map((k) => Math.max(0, +p[k] || 0));
    const tot = wts.reduce((a, b) => a + b, 0);
    const u = (k) => hash(seed, P.x, P.y, 0x7a10 + k);
    let t = 'empty';
    if (tot > 0) {
      let v = u(0) * tot;
      for (let i = 0; i < TREAT.length; i++) { if (v < wts[i] || i === TREAT.length - 1) { t = TREAT[i]; break; } v -= wts[i]; }
    }
    const a = Math.floor(u(1) * nInk) % nInk;
    const other = nInk > 1 ? (a + 1 + Math.floor(u(3) * (nInk - 1))) % nInk : a;
    const onBg = nInk < 2 || u(2) < K.bgBase;
    return {
      t,
      ink: 2 + a,                              // palette index of the piece's ink
      base: onBg ? 0 : 2 + other,              // under the blocks, dots and lines
      ink2: 2 + other,                         // the gradient's second ink
      dir: Math.floor(u(4) * 4) % 4,           // across, down, corner to corner either way
      ox: u(5) * 97.3, oy: u(6) * 61.7, oz: u(7) * 37.1, ow: u(8) * 53.9,
    };
  }

  // Seamless time: four beats per loop, each eased in and out.
  function beatTime(t) {
    const tt = ((t % 1) + 1) % 1, b = tt * K.beats, k = Math.floor(b), f = b - k;
    return (k + (1 - Math.cos(Math.PI * f)) / 2) / K.beats;
  }

  // The field's on / off state for every unit of a piece at time t (Block fill = share on).
  function field(NF, D, P, U, fill, t, amount) {
    const nx = P.w * U, ny = P.h * U, out = new Uint8Array(nx * ny);
    const th = 2 * Math.PI * beatTime(t), R = K.radius * Math.max(0, amount || 0);
    const z = D.oz + R * (Math.cos(th) - 1), w = D.ow + R * Math.sin(th);
    const cut = cutFor(fill);
    for (let j = 0; j < ny; j++) {
      const Y = (P.y * U + j + 0.5) * K.freq + D.oy;
      for (let i = 0; i < nx; i++) {
        const X = (P.x * U + i + 0.5) * K.freq + D.ox;
        if (NF.fbm4(X, Y, z, w, K.oct, K.gain) > cut) out[j * nx + i] = 1;
      }
    }
    return out;
  }

  /* ---- build ---------------------------------------------------------------------------- */
  // region (General's Rotation and Size): the part of the world to cover (see pieces)
  function build({ W, H, aspect, seed, p, colors, t = 0, anim, crisp, refL, region }) {
    const n = colors.length, nInk = Math.max(1, n - 2);
    const { cols, rows, U } = grid(W, H, p, aspect);
    const mw = W / cols, mh = H / rows, uw = mw / U, uh = mh / U;
    const snap = crisp !== false;
    const zs = region && region.z > 1 ? region.z : 1; // output pixels to a frame pixel (zoomed in by General's Size, more)
    const X = (v) => (snap ? Math.round(v * uw * zs) / zs : v * uw); // v in units, from the left edge (on whole output pixels)
    const Y = (v) => (snap ? Math.round(v * uh * zs) / zs : v * uh);
    const L = Math.max(W, H);
    const weight = Math.max(0.1, +p.weight || 1);
    // line width: true to the frame in exports; previews keep the rules visible (a pixel at least)
    let lw = (weight * L) / K.ref;
    if (refL && L < 0.95 * refL) lw = Math.max(lw, Math.min(1, weight, 0.22 * Math.min(uw, uh))); // never more than a fifth of a unit
    const NF = PL.noise.get((seed ^ 0x4d0d1a7) >>> 0);
    const merging = clamp01((+p.merging || 0) / 100);
    let list;
    const R = region;
    const mx0 = R ? Math.floor(R.x0 / mw) : 0, mx1 = R ? Math.ceil(R.x1 / mw) : cols, my0 = R ? Math.floor(R.y0 / mh) : 0, my1 = R ? Math.ceil(R.y1 / mh) : rows;
    if (!R) list = pieces(seed, cols, rows, merging);
    else {
      list = [];
      for (let tj = Math.floor(my0 / rows); tj <= Math.floor((my1 - 1) / rows); tj++) {
        for (let ti = Math.floor(mx0 / cols); ti <= Math.floor((mx1 - 1) / cols); ti++) {
          for (const P of pieces(seed, cols, rows, merging, ti * cols, tj * rows)) if (P.x + P.w > mx0 && P.x < mx1 && P.y + P.h > my0 && P.y < my1) list.push(P);
        }
      }
    }
    const fill = clamp01((p.fill == null ? 50 : p.fill) / 100);
    const amount = anim ? anim.amount : 0;
    const rDot = (clamp01((p.dot == null ? 62 : p.dot) / 100) * Math.min(uw, uh)) / 2;

    // collect the geometry first, then make the layers in drawing order:
    // fills, gradients, blocks and dots, line grids, rules
    const fills = new Map(), marks = new Map(), lines = new Map(), grads = [];
    const get = (m, ci) => { let a = m.get(ci); if (!a) m.set(ci, (a = { r: [], c: [], s: [] })); return a; };
    let count = { empty: 0, solid: 0, blocks: 0, dots: 0, lines: 0, gradient: 0 };
    for (const P of list) {
      const D = dress(seed, P, p, nInk);
      count[D.t]++;
      const x0 = X(P.x * U), x1 = X((P.x + P.w) * U), y0 = Y(P.y * U), y1 = Y((P.y + P.h) * U);
      if (D.t === 'empty') continue;
      if (D.t === 'solid') { get(fills, D.ink).r.push(x0, y0, x1 - x0, y1 - y0); continue; }
      if (D.t === 'gradient') {
        const c0 = D.ink, c1 = D.ink2 === D.ink ? 0 : D.ink2;
        const g = [[x0, y0, x1, y0], [x0, y0, x0, y1], [x0, y0, x1, y1], [x1, y0, x0, y1]][D.dir];
        grads.push({ rect: [x0, y0, x1 - x0, y1 - y0], g, c0, c1 });
        continue;
      }
      if (D.base) get(fills, D.base).r.push(x0, y0, x1 - x0, y1 - y0);
      if (D.t === 'lines') {
        const S = get(lines, D.ink).s;
        for (let i = 1; i < P.w * U; i++) { const x = X(P.x * U + i); S.push([x, y0, x, y1]); }
        for (let j = 1; j < P.h * U; j++) { const y = Y(P.y * U + j); S.push([x0, y, x1, y]); }
        continue;
      }
      const on = field(NF, D, P, U, fill, t, amount);
      const nx = P.w * U, ny = P.h * U, M = get(marks, D.ink);
      if (D.t === 'blocks') {
        for (let j = 0; j < ny; j++) {
          let i = 0;
          while (i < nx) {
            if (!on[j * nx + i]) { i++; continue; }
            let e = i + 1;
            while (e < nx && on[j * nx + e]) e++;
            const a = X(P.x * U + i), b = X(P.x * U + e), c = Y(P.y * U + j), d = Y(P.y * U + j + 1);
            M.r.push(a, c, b - a, d - c);
            i = e;
          }
        }
      } else {
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          if (on[j * nx + i]) M.c.push((P.x * U + i + 0.5) * uw, (P.y * U + j + 0.5) * uh, rDot);
        }
      }
    }

    const scene = new PL.Scene(W, H, colors[0], 0);
    const role = (ci) => roles(n)[ci] || 'Ink';
    for (const [ci, a] of [...fills].sort((p1, p2) => p1[0] - p2[0])) {
      const Ly = scene.layer('fill-' + ci, colors[ci], 'Fill ' + role(ci), ci);
      Ly.r.push(...a.r);
    }
    grads.forEach((G, k) => {
      const Ly = scene.layer('gradient-' + k, colors[G.c0], 'Gradient ' + (k + 1), G.c0);
      Ly.r.push(...G.rect);
      PL.Scene.gradient(Ly, G.g[0], G.g[1], G.g[2], G.g[3], colors[G.c0], colors[G.c1], G.c0, G.c1);
    });
    for (const [ci, a] of [...marks].sort((p1, p2) => p1[0] - p2[0])) {
      if (!a.r.length && !a.c.length) continue;
      const Ly = scene.layer('marks-' + ci, colors[ci], 'Blocks and dots ' + role(ci), ci);
      Ly.r.push(...a.r);
      Ly.c.push(...a.c);
    }
    // thin lines: centred on a whole pixel when they are about one pixel wide, so they stay sharp
    const lz = lw * zs, half = snap && Math.abs(lz - Math.round(lz)) < 0.05 && Math.round(lz) % 2 === 1 ? 0.5 / zs : 0;
    for (const [ci, a] of [...lines].sort((p1, p2) => p1[0] - p2[0])) {
      const Ly = scene.layer('lines-' + ci, colors[ci], 'Line grid ' + role(ci), ci, K.lineAlpha);
      Ly.cap = 'butt';
      for (const [ax, ay, bx, by] of a.s) PL.Scene.stroke(Ly, ax === bx ? [ax - half, ay, bx - half, by] : [ax, ay - half, bx, by - half], lw);
    }
    const ruleA = clamp01((p.grid == null ? 22 : p.grid) / 100);
    if (ruleA > 0 && n > 1) {
      const Ly = scene.layer('rules', colors[1], 'Rules', 1, ruleA);
      Ly.cap = 'butt';
      if (!R) {
        for (let c = 1; c < cols; c++) { const x = X(c * U) - half; PL.Scene.stroke(Ly, [x, 0, x, H], lw); }
        for (let r = 1; r < rows; r++) { const y = Y(r * U) - half; PL.Scene.stroke(Ly, [0, y, W, y], lw); }
      } else { // every module edge in the region
        for (let c = mx0; c <= mx1; c++) { const x = X(c * U) - half; PL.Scene.stroke(Ly, [x, R.y0, x, R.y1], lw); }
        for (let r = my0; r <= my1; r++) { const y = Y(r * U) - half; PL.Scene.stroke(Ly, [R.x0, y, R.x1, y], lw); }
      }
    }
    scene.status = `${cols} × ${rows} modules · ${list.length} pieces`;
    scene._count = count;
    return scene;
  }

  PL.tools.register({
    id: 'modular',
    name: 'Modular',
    kind: 'Backgrounds',
    tagline: 'Modular grid',
    about: 'A modular grid: modules joined into bigger pieces, each one empty, solid, a pixel field, a dot matrix, a line grid or a gradient, over fine rules. In the animation the pixel fields and the dots flicker as their field drifts, in four soft beats per loop.',
    inks: {
      min: 4, max: 10, roles, fit, spec, add, generate,
      span: () => 2,      // Invert swaps the background and the rules
      rotateFrom: 2,      // Rotate deals the inks only (background and rules stay)
      hint: 'Background, then Rules (the lines between the modules), then the inks: every piece takes one ink, or two.',
    },
    palettes: PALETTES,
    params: PARAMS,
    animLabel: 'Intensity',
    animHint: 'How far the pixel fields and the dots move (0: still)',
    defaults: {
      anim: { amount: 0.5, fps: 6, frames: 24 },
      fx: {},
      palette: 'Bauhaus', // the preset the style opens on (its card's colors)
    },
    build,
    zoom: true, // draws any region of its world (General's Rotation and Size)
    _K: K,
    _pieces: pieces,
    _dress: dress,
    _field: field,
    _grid: grid,
    _beat: beatTime,
  });
})();
