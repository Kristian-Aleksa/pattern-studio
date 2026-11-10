/* ==========================================================================
   tools/motley.js — Motley: glyph patchwork.

   1. Grid: square cells, Cells across the frame (rows follow the frame's
      shape; the last row may be cut by the bottom edge). Each cell holds at
      most one glyph, sized by Glyph size: a square, circle, target (a circle
      with a dot of a second ink in the middle), plus, stripes (three bars) or
      a small dot.
   2. Patches: ragged blobs and stepped blocks spread over the frame and laid
      over one another (bigger ones first, loosely), each filled with one glyph
      in one ink. Size sets how big they are, Ragged how lumpy the blobs and
      how cut-about the blocks (stepped notches and staircase corners), Blocks
      the share of blocks among them.
   3. Sparse patches fill only every other cell (a checkerboard) or every
      other row, so the patch beneath shows through. Stitched patches get an
      outline of small pluses and dots in another ink just outside their edge.
      Gaps are patches that cut back to the plain ground.
   4. Animation: now and then a glyph of a sparse patch drops out for a frame,
      at random, showing what lies beneath, so the woven areas twinkle while
      everything else holds still. Amount sets how often. The flicker repeats
      exactly every loop, so it is seamless.
   ========================================================================== */
(() => {
  const { hash } = PL.rng;

  // Ground first, then the inks.
  const PALETTES = [
    { name: 'Spring', colors: ['#DBF3DB', '#151D15', '#E64343', '#284CAC', '#F2D935', '#00BBC3', '#D179CA', '#3E8343'] }, // tomato, blue, lemon, aqua, orchid and green on mint
    { name: 'Frost', colors: ['#EDF7FC', '#0D1E3B', '#1570D1', '#6AC5E8', '#91E2DC', '#EC7380', '#9274C3', '#F7DD7D'] },
    { name: 'Cream', colors: ['#F3F1DC', '#1C1C1C', '#EA9D48', '#1C4763', '#E2323C', '#2F9785', '#F03899', '#9DB9AD'] },
    { name: 'Citrine', colors: ['#F6F4CE', '#17170C', '#EC7C0E', '#D33D2C', '#589A28', '#0070A6', '#F0C543', '#7A3430'] },
    { name: 'Blush', colors: ['#F8F4F6', '#1C1C1C', '#3B2792', '#4E86D8', '#1FD33A', '#561C1C', '#85A69A', '#EFB752'] },
    { name: 'Moss', colors: ['#301705', '#E7D5C1', '#D2F408', '#B1FD5A', '#61F733', '#3EE767', '#41DEBF', '#389ABA'] },
    { name: 'Gelato', colors: ['#FFF3E9', '#2F1C19', '#EE79A1', '#FBBB87', '#A6E599', '#AA8DDE', '#D8BD51', '#0097AA'] },
    { name: 'Neon', colors: ['#0B0C1A', '#F4EEE0', '#FB40AD', '#CFEF46', '#00D0D9', '#845CF7', '#FF9D20', '#1C69E3'] }, // neon inks on a night ground
    { name: 'Mono', colors: ['#F2F0EA', '#1C1C1C', '#5E5E5E', '#9B9B9B', '#C8C6C0'] },
    { name: 'Duo', colors: ['#F4EFE6', '#1B3BFF', '#FF5A36'] },
  ];

  /* ---- color roles -------------------------------------------------------------------- */
  const roles = (n) => ['Ground', ...Array.from({ length: n - 1 }, (_, i) => (n === 2 ? 'Ink' : 'Ink ' + (i + 1)))];
  const spec = (n) => ({ ramp: 1, accents: Math.max(1, n - 1) });
  const isLight = (hex) => PL.color.luminance(hex) > 0.35;

  // "New colors": a pale tinted ground (now and then a deep one), a near-black first ink (on a
  // deep ground: a pale one), then vivid inks spread round the wheel, light and deep by turns,
  // with one muted ink among them.
  function generate(n, rng) {
    const C = PL.color;
    const dark = rng.chance(0.14);
    const h0 = rng.float(0, 360);
    const out = dark
      ? [C.lch(rng.float(0.2, 0.27), rng.float(0.04, 0.07), h0), C.lch(rng.float(0.88, 0.92), rng.float(0.02, 0.04), h0 + 40)]
      : [C.lch(rng.float(0.94, 0.975), rng.float(0.015, 0.05), h0), C.lch(rng.float(0.16, 0.2), rng.float(0, 0.01), h0)];
    const m = n - 2;
    const h1 = rng.float(0, 360), step = dark ? rng.float(18, 34) : (360 / Math.max(1, m)) * rng.float(0.8, 1.05);
    const muted = m >= 4 ? Math.floor(rng.float(1, m)) : -1;
    for (let i = 0; i < m; i++) {
      const h = h1 + i * step + rng.float(-12, 12);
      if (i === muted) { out.push(C.lch(rng.float(0.62, 0.72), rng.float(0.03, 0.06), h)); continue; }
      const L = dark ? rng.float(0.72, 0.9) : i % 2 ? rng.float(0.42, 0.6) : rng.float(0.74, 0.9);
      out.push(C.lch(L, rng.float(0.14, 0.24), h));
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
    c.push(C.lch(isLight(c[0]) ? 0.62 : 0.8, 0.17, best));
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
    S('Grid', 'cells', 'Cells across', 16, 120, 62, { rand: [41, 76], hint: 'Cells across the frame' }),
    S('Grid', 'glyph', 'Glyph size', 40, 100, 77, { unit: '%', rand: [73, 94], hint: 'How much of its cell each glyph fills' }),
    S('Patches', 'patches', 'Patches', 4, 60, 27, { rand: [18, 32], hint: 'How many shapes are laid over one another' }),
    S('Patches', 'size', 'Size', 0, 100, 64, { unit: '%', rand: [35, 65], hint: 'How big the shapes are' }),
    S('Patches', 'ragged', 'Ragged', 0, 100, 43, { unit: '%', rand: [35, 75], hint: 'How lumpy the blobs are, and how stepped and cut-about the blocks' }),
    S('Patches', 'blocks', 'Blocks', 0, 100, 51, { unit: '%', rand: [20, 60], hint: 'Share of the shapes that are stepped blocks rather than blobs' }),
    S('Patches', 'sparse', 'Sparse', 0, 100, 21, { unit: '%', rand: [20, 50], hint: 'Share of the shapes with glyphs in every other cell or every other row only (these twinkle in the animation)' }),
    S('Patches', 'stitched', 'Stitched', 0, 100, 38, { unit: '%', rand: [25, 55], hint: 'Share of the shapes outlined with small pluses and dots in another ink' }),
    S('Patches', 'gaps', 'Gaps', 0, 100, 0, { unit: '%', rand: [0, 20], hint: 'Share of the shapes that cut back to the plain ground' }),
  ];

  // Constants. Glyph sizes are shares of the glyph box (Glyph size x cell x box); shape sizes
  // are in units of the frame's width (radii: of its mean side).
  const K = {
    box: 0.92,          // glyph box: Glyph size x cell x this
    circle: 1.02,       // circle and target diameter
    cen: 0.425,         // a target's centre dot diameter
    dot: 0.37,          // dot diameter
    plus: 0.263,        // plus arm thickness (the arms span the box)
    bar: 0.185, pitch: 0.345, barLen: 0.98, // stripes: three bars
    kinds: [['square', 0.19], ['circle', 0.26], ['dot', 0.15], ['plus', 0.19], ['stripes', 0.13], ['target', 0.08]],
    rows: 0.38,         // sparse patches: share woven in rows (the rest: a checkerboard)
    sparseK: 1.4,       // Sparse ^ this = the chance a shape is sparse (0.23 at the default 35 %)
    stitchPlus: 0.55,   // stitches: share of pluses (the rest are dots)
    r0: 0.06, r1: 0.3,  // patch radius: (r0 + r1 x Size) x the frame's mean side ...
    rJit: [0.45, 1.5], rPow: 1.4, // ... times a random factor in this range (weighted toward the small end)
    stretch: 0.7,       // shapes stretch up to e^(this/2) one way
    blobA: 0.3,         // blob outline: lobes, depth (x Ragged) ...
    blobF: 1.0,         // ... and how many round the blob
    bumpA: 0.05, bumpF: 2.6, // ... plus smaller bumps
    square: [2, 3.6],   // blobs range from round to squarish (superellipse exponent)
    stitchK: 1.47,      // Stitched ^ this = the chance a shape is outlined (0.26 at the default 40 %)
    cut: 0.55,          // blocks: chance per corner of a cut (x Ragged) ...
    chamfer: 0.55,      // ... a staircase (diagonal) cut, otherwise a stepped notch
    reach: 0.06,        // patch centres may sit this far outside the frame
    spread: 1.2,        // centres: jitter round their evenly spread places (x the spacing of 24 shapes)
    mix: 0.35,          // stacking: big shapes first, small ones on top, this loosely
    flicker: 0.215,     // animation: chance a sparse glyph drops out in a frame, x Amount
  };

  const pick = (table, u) => { let s = 0; for (const [v, w] of table) { s += w; if (u < s) return v; } return table[table.length - 1][0]; };
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---- grid ---------------------------------------------------------------------------- */
  function grid(W, H, p) {
    const cols = Math.max(2, Math.round(p.cells));
    const cw = W / cols;
    const rows = Math.max(1, Math.ceil(H / cw - 1e-6)); // square cells; the last row may be cut
    return { cols, rows, cw };
  }

  /* ---- the patches ----------------------------------------------------------------------
     Every patch takes the same 24 random numbers whatever the sliders say, so moving a slider
     only changes what it has to, and adding patches keeps the others where they are.         */
  const DRAWS = 24;
  function makePatches(seed, A, p, n) {
    const r = PL.rng.create((seed ^ 0x51ab7e3d) >>> 0);
    const M = Math.sqrt(A); // the frame is 1 wide and A tall; M = its mean side
    const P = Math.max(1, Math.min(60, Math.round(p.patches)));
    const f = (v) => Math.max(0, Math.min(100, v)) / 100;
    const size = f(p.size), rag = f(p.ragged), blocks = f(p.blocks), sparse = f(p.sparse), stitched = f(p.stitched), gaps = f(p.gaps);
    const inks = Math.max(1, n - 1);
    const other = (ink, u) => { if (inks < 2) return ink; const o = 1 + Math.min(inks - 2, Math.floor(u * (inks - 1))); return o >= ink ? o + 1 : o; };
    const out = [];
    const sx0 = r.next(), sy0 = r.next();
    for (let k = 0; k < 60; k++) {
      const u = []; for (let q = 0; q < DRAWS; q++) u.push(r.next());
      if (k >= P) continue;
      const pt = { k };
      pt.gap = u[0] < gaps;
      pt.block = u[1] < blocks;
      // centres spread evenly over the frame (a low-discrepancy sequence from a random start,
      // jittered), so the shapes tile it like a patchwork rather than piling up
      const qx = (sx0 + (k + 1) * 0.7548776662466927) % 1, qy = (sy0 + (k + 1) * 0.5698402909980532) % 1;
      const jit = K.spread / Math.sqrt(24);
      pt.cx = lerp(-K.reach, 1 + K.reach, Math.min(1, Math.max(0, qx + (u[2] - 0.5) * jit)));
      pt.cy = lerp(-K.reach, 1 + K.reach, Math.min(1, Math.max(0, qy + (u[3] - 0.5) * jit))) * A;
      pt.R = (K.r0 + K.r1 * size) * M * lerp(K.rJit[0], K.rJit[1], Math.pow(u[4], K.rPow));
      pt.sx = Math.exp((u[5] - 0.5) * K.stretch);
      pt.kind = pick(K.kinds, u[6]);
      pt.ink = 1 + Math.min(inks - 1, Math.floor(u[7] * inks));
      pt.ink2 = other(pt.ink, u[8]);
      pt.mode = u[9] < Math.pow(sparse, K.sparseK) ? (u[10] < K.rows ? 'rows' : 'checker') : 'full';
      pt.par = u[11] < 0.5 ? 0 : 1;
      pt.stitch = u[12] < Math.pow(stitched, K.stitchK);
      pt.sink = other(pt.ink, u[13]);
      pt.nz = u[14] * 97;
      pt.rot = u[15] * Math.PI;
      pt.rag = rag;
      pt.ex = lerp(K.square[0], K.square[1], u[18]);
      if (pt.block) {
        // a rectangle (not rotated), with cuts at its corners: notches (one or two steps) or
        // staircase corners (a diagonal cut, which the grid turns into steps)
        pt.hw = pt.R * pt.sx * lerp(0.7, 1, u[16]);
        pt.hh = (pt.R / pt.sx) * lerp(0.7, 1, u[17]);
        pt.cuts = [];
        for (let c = 0; c < 4; c++) {
          const v = hash(seed, k, c, 0x3c7a1); // per corner, outside the main draws
          if (v >= K.cut * rag) continue;
          const w = hash(seed, k, c, 0x3c7a2), h = hash(seed, k, c, 0x3c7a3), t = hash(seed, k, c, 0x3c7a4);
          if (t < K.chamfer) pt.cuts.push({ c, type: 0, a: lerp(0.15, 0.55, w) * 2 * pt.hw, b: lerp(0.15, 0.55, h) * 2 * pt.hh });
          else {
            const v5 = hash(seed, k, c, 0x3c7a5), steps = v5 < 0.45 ? 1 : v5 < 0.8 ? 2 : 3;
            pt.cuts.push({ c, type: 1, a: lerp(0.15, 0.5, w) * 2 * pt.hw, b: lerp(0.15, 0.5, h) * 2 * pt.hh, steps });
          }
        }
      }
      pt.order = pt.R * (pt.block ? Math.sqrt(pt.hw * pt.hh) / pt.R : 1) * lerp(1 - K.mix, 1 + K.mix, u[19]);
      out.push(pt);
    }
    // bigger shapes go down first and smaller ones on top (loosely), so most of them show
    return out.sort((a, b) => b.order - a.order);
  }

  // Is (x, y) (width units) inside patch pt?
  function makeInside(NZ) {
    return (pt, x, y) => {
      if (pt.block) {
        const dx0 = x - (pt.cx - pt.hw), dx1 = pt.cx + pt.hw - x, dy0 = y - (pt.cy - pt.hh), dy1 = pt.cy + pt.hh - y;
        if (dx0 < 0 || dx1 < 0 || dy0 < 0 || dy1 < 0) return false;
        for (const q of pt.cuts) {
          const ex = q.c === 0 || q.c === 3 ? dx0 : dx1, ey = q.c < 2 ? dy0 : dy1; // distance in from the corner
          if (q.type === 0) { if (ex / q.a + ey / q.b < 1) return false; } // staircase corner
          else if (ex < q.a && ey < q.b && Math.floor((ex / q.a) * q.steps) + Math.floor((ey / q.b) * q.steps) < q.steps) return false; // stepped notch
        }
        return true;
      }
      // a blob: an ellipse whose radius wanders round its outline (lobes, then smaller bumps)
      const ox = x - pt.cx, oy = y - pt.cy;
      const c = Math.cos(pt.rot), s = Math.sin(pt.rot);
      const lx = (ox * c + oy * s) / (pt.R * pt.sx), ly = (-ox * s + oy * c) / (pt.R / pt.sx);
      const d = pt.ex === 2 ? Math.hypot(lx, ly) : Math.pow(Math.pow(Math.abs(lx), pt.ex) + Math.pow(Math.abs(ly), pt.ex), 1 / pt.ex);
      const lim = 1 + pt.rag * (K.blobA + K.bumpA) * 2.2;
      if (d > lim) return false;
      if (d < 1 - pt.rag * (K.blobA + K.bumpA) * 2.2) return true;
      const ux = d > 1e-9 ? lx / d : 1, uy = d > 1e-9 ? ly / d : 0;
      const r = 1 + pt.rag * (K.blobA * NZ.noise4(ux * K.blobF + pt.nz, uy * K.blobF - pt.nz, pt.nz * 0.31, 0.5)
        + K.bumpA * NZ.noise4(ux * K.bumpF - pt.nz, uy * K.bumpF + pt.nz, 0.5, pt.nz * 0.17)) / 0.3;
      return d < r;
    };
  }

  // Bounding box of a patch (width units), generous for blobs.
  function bbox(pt) {
    if (pt.block) return [pt.cx - pt.hw, pt.cx + pt.hw, pt.cy - pt.hh, pt.cy + pt.hh];
    const e = (1 + pt.rag * (K.blobA + K.bumpA) * 2.2) * Math.SQRT2 * pt.R * Math.max(pt.sx, 1 / pt.sx); // squarish blobs reach into the corners
    return [pt.cx - e, pt.cx + e, pt.cy - e, pt.cy + e];
  }

  /* ---- per-cell stacks (cached): from the top down, the patches a cell can show, ending at
     the first one that always shows (a full patch or a stitch). Sparse patches' glyphs can
     drop out for a frame; their empty cells are see-through.                                 */
  // Past the frame (General's Rotation and Size, region R) the patchwork carries on: the world is laid out
  // in tiles the size of the box the frame's patch centres spread over (so the patches are as dense
  // everywhere), the frame's own patches in its tile and every other tile with patches of its own (a seed
  // of its own), stacked big ones first, and the frame's own patches on top of all the others (so in the
  // frame the patchwork stays the frame's own).
  function patchesFor(seed, A, p, n, R, W) {
    if (!R) return makePatches(seed, A, p, n);
    const TS = 1 + 2 * K.reach, M = Math.sqrt(A), size = Math.max(0, Math.min(100, p.size)) / 100;
    const E = 3 * (K.r0 + K.r1 * size) * M * K.rJit[1] + 0.05; // further than any patch reaches from its centre
    const X0 = R.x0 / W - E, X1 = R.x1 / W + E, Y0 = R.y0 / W - E, Y1 = R.y1 / W + E; // width units
    const others = [];
    let own = [];
    for (let tj = Math.ceil((Y0 / A - 1 - K.reach) / TS); tj <= Math.floor((Y1 / A + K.reach) / TS); tj++) {
      for (let ti = Math.ceil((X0 - 1 - K.reach) / TS); ti <= Math.floor((X1 + K.reach) / TS); ti++) {
        if (ti === 0 && tj === 0) { own = makePatches(seed, A, p, n); continue; }
        const sd = (Math.imul(seed | 0, 0x2c1b3c6d) ^ Math.imul(ti, 0x9e3779b1) ^ Math.imul(tj, 0x85ebca77) ^ 0x6d2b79f5) | 0;
        const id = 61 * (1 + (((ti + 512) & 1023) << 10 | ((tj + 512) & 1023)));
        for (const pt of makePatches(sd, A, p, n)) {
          pt.cx += ti * TS; pt.cy += tj * TS * A; pt.k += id;
          if (pt.cx > X0 && pt.cx < X1 && pt.cy > Y0 && pt.cy < Y1) others.push(pt);
        }
      }
    }
    return others.sort((a, b) => b.order - a.order).concat(own);
  }

  const cache = new Map();
  const OPAQUE = 1, STITCH = 2;
  // sp (General's Rotation and Size): the columns c0..c1 and rows r0..r1 to lay out (default: the frame's)
  function layout(W, H, seed, p, n, R) {
    const g = grid(W, H, p);
    const sp = R ? { c0: Math.floor(R.x0 / g.cw), c1: Math.ceil(R.x1 / g.cw), r0: Math.floor(R.y0 / g.cw), r1: Math.ceil(R.y1 / g.cw) } : { c0: 0, c1: g.cols, r0: 0, r1: g.rows };
    const key = [seed, g.cols, g.rows, (H / W).toFixed(5), n, p.patches, p.size, p.ragged, p.blocks, p.sparse, p.stitched, p.gaps, sp.c0, sp.c1, sp.r0, sp.r1, ...Object.values(K).flat(2)].join('|');
    const hit = cache.get(key);
    if (hit) return hit;
    const { cols } = g, nc = sp.c1 - sp.c0, N = nc * (sp.r1 - sp.r0);
    const pts = patchesFor(seed, H / W, p, n, R, W);
    const NZ = PL.noise.get((seed ^ 0x6c8e9cf5) >>> 0);
    const inside = makeInside(NZ);
    const lists = Array.from({ length: N }, () => []);
    const done = new Uint8Array(N); // a cell whose stack already ends in an opaque entry
    for (let q = pts.length - 1; q >= 0; q--) {
      const pt = pts[q];
      const [x0, x1, y0, y1] = bbox(pt);
      // the patch's cells over its bounding box (one cell more all round, even past the frame)
      const i0 = Math.floor(x0 * cols) - 2, i1 = Math.ceil(x1 * cols) + 2, j0 = Math.floor(y0 * cols) - 2, j1 = Math.ceil(y1 * cols) + 2;
      const bw = i1 - i0 + 1, bh = j1 - j0 + 1;
      const m = new Uint8Array(bw * bh);
      for (let j = Math.max(j0, sp.r0 - 1); j <= Math.min(j1, sp.r1); j++) {
        for (let i = Math.max(i0, sp.c0 - 1); i <= Math.min(i1, sp.c1); i++) m[(j - j0) * bw + (i - i0)] = inside(pt, (i + 0.5) / cols, (j + 0.5) / cols) ? 1 : 0;
      }
      const In = (i, j) => i >= i0 && i <= i1 && j >= j0 && j <= j1 && m[(j - j0) * bw + (i - i0)] === 1;
      for (let j = Math.max(sp.r0, j0); j <= Math.min(sp.r1 - 1, j1); j++) {
        for (let i = Math.max(sp.c0, i0); i <= Math.min(sp.c1 - 1, i1); i++) {
          const c = (j - sp.r0) * nc + (i - sp.c0);
          if (done[c]) continue;
          if (!In(i, j)) {
            // stitches: the cells just outside the patch's edge
            if (pt.stitch && (In(i - 1, j) || In(i + 1, j) || In(i, j - 1) || In(i, j + 1))) { lists[c].push(q, STITCH); done[c] = 1; }
            continue;
          }
          if (pt.mode === 'full') { lists[c].push(q, OPAQUE); done[c] = 1; continue; }
          const on = (pt.mode === 'checker' ? i + j : j) % 2 === pt.par;
          if (on) lists[c].push(q, 0);
        }
      }
    }
    const out = { g, sp, pts, lists };
    if (cache.size > 8) cache.delete(cache.keys().next().value);
    cache.set(key, out);
    return out;
  }

  // What each cell shows in frame f: the patch (its place in the stack, or -1 for the ground)
  // and whether it shows as a stitch, packed as index * 2 + stitch.
  function cellsAt(W, H, seed, p, n, t, anim, R) {
    const L = layout(W, H, seed, p, n, R);
    const { cols, rows } = L.g, { sp } = L, nc = sp.c1 - sp.c0, N = L.lists.length;
    const F = Math.max(1, (anim && anim.frames) | 0 || 36);
    const f = ((Math.round((((t % 1) + 1) % 1) * F) % F) + F) % F;
    const pf = Math.min(0.9, K.flicker * Math.max(0, anim ? anim.amount : 0));
    const show = new Int16Array(N).fill(-1);
    for (let c = 0; c < N; c++) {
      const l = L.lists[c];
      for (let q = 0; q < l.length; q += 2) {
        const k = l[q], s = l[q + 1];
        // (a cell past the frame: its own number from its place)
        let cid = c;
        if (R) { const i = sp.c0 + (c % nc), j = sp.r0 + Math.floor(c / nc); cid = i >= 0 && i < cols && j >= 0 && j < rows ? j * cols + i : (Math.imul(i, 0x27d4eb2f) ^ Math.imul(j, 0x165667b1)) | 0; }
        if (s === 0 && pf > 0 && hash(cid, L.pts[k].k * 131 + f, seed, 0x7f1c) < pf) continue; // dropped out this frame
        show[c] = k * 2 + (s === STITCH ? 1 : 0);
        break;
      }
    }
    return { L, show, f };
  }

  /* ---- build ------------------------------------------------------------------------ */
  // region (General's Rotation and Size): the part of the world to cover (see patchesFor)
  function build({ W, H, seed, p, colors, t = 0, anim, region }) {
    const n = colors.length;
    const scene = new PL.Scene(W, H, colors[0], 0);
    const { L, show } = cellsAt(W, H, seed, p, n, t, anim, region);
    const { cols, rows, cw } = grid(W, H, p); // (not the cached grid: the same cells can come at another size)
    const { sp } = L, nc = sp.c1 - sp.c0;
    const gl = Math.max(40, Math.min(100, p.glyph)) / 100;
    const b = K.box * gl * cw, hb = b / 2;
    // one layer per ink, then the targets' middles on top
    const layers = [], centres = [];
    for (let ci = 1; ci < n; ci++) layers[ci] = scene.layer('ink-' + ci, colors[ci], n === 2 ? 'Ink' : 'Ink ' + ci, ci);
    const centre = (ci) => centres[ci] || (centres[ci] = scene.layer('ink-' + ci + '-middles', colors[ci], (n === 2 ? 'Ink' : 'Ink ' + ci) + ' · target middles', ci));
    const t2 = (K.plus * b) / 2, bh = (K.bar * b) / 2, pitch = K.pitch * b, bl = (K.barLen * b) / 2;
    const rc = (K.circle * b) / 2, rd = (K.dot * b) / 2, rk = (K.cen * b) / 2;
    const plus = (Ly, x, y) => PL.Scene.poly(Ly, [x - t2, y - hb, x + t2, y - hb, x + t2, y - t2, x + hb, y - t2, x + hb, y + t2, x + t2, y + t2,
      x + t2, y + hb, x - t2, y + hb, x - t2, y + t2, x - hb, y + t2, x - hb, y - t2, x - t2, y - t2]);
    let drawn = 0;
    for (let j = sp.r0; j < sp.r1; j++) {
      const y = (j + 0.5) * cw;
      for (let i = sp.c0; i < sp.c1; i++) {
        const v = show[(j - sp.r0) * nc + (i - sp.c0)];
        if (v < 0) continue;
        const pt = L.pts[v >> 1], x = (i + 0.5) * cw;
        if (v & 1) { // a stitch: a small plus or a dot
          const Ly = layers[pt.sink];
          if (hash(i, j, seed + pt.k * 7919, 0x57c4) < K.stitchPlus) plus(Ly, x, y); else PL.Scene.circle(Ly, x, y, rd);
          drawn++;
          continue;
        }
        if (pt.gap) continue;
        const Ly = layers[pt.ink];
        switch (pt.kind) {
          case 'square': PL.Scene.rect(Ly, x - hb, y - hb, b, b); break;
          case 'circle': PL.Scene.circle(Ly, x, y, rc); break;
          case 'dot': PL.Scene.circle(Ly, x, y, rd); break;
          case 'target': PL.Scene.circle(Ly, x, y, rc); PL.Scene.circle(centre(pt.ink2), x, y, rk); break;
          case 'stripes': for (const o of [-pitch, 0, pitch]) PL.Scene.rect(Ly, x - bl, y + o - bh, 2 * bl, 2 * bh); break;
          default: plus(Ly, x, y);
        }
        drawn++;
      }
    }
    // the target middles last; drop empty layers so the SVG stays tidy
    scene.layers = scene.layers.filter((Ly) => Ly.c.length || Ly.r.length || Ly.p.length);
    const ord = (Ly) => (/-middles$/.test(Ly.key) ? 1 : 0);
    scene.layers.sort((a, c) => ord(a) - ord(c));
    const np = region ? Math.max(1, Math.min(60, Math.round(p.patches))) : L.pts.length; // the frame's own patches
    scene.status = `${cols} × ${rows} cells · ${np} patches · ${drawn.toLocaleString()} glyphs`;
    return scene;
  }

  PL.tools.register({
    id: 'motley',
    name: 'Motley',
    kind: 'Backgrounds',
    tagline: 'Glyph patchwork',
    about: 'Ragged blobs and stepped blocks laid over one another on a grid, each filled with squares, circles, targets, pluses, stripes or dots in one ink; some woven into the shape below, some outlined in stitches, some cut back to the ground. In the animation the woven glyphs twinkle as they drop out for a moment.',
    inks: {
      min: 2, max: 12, roles, fit, spec, add, generate,
      span: () => 2, // Invert swaps the ground and the first ink
      hint: 'Ground first, then the inks. Each shape takes one ink (a target takes a second one for the dot in its middle, a stitched outline another).',
    },
    palettes: PALETTES,
    params: PARAMS,
    animLabel: 'Amount',
    animHint: 'How often the glyphs of the woven shapes drop out for a moment (0: still)',
    defaults: {
      anim: { amount: 0.6, fps: 6, frames: 36 }, // 36 frames in about 6 s
      fx: {},
      palette: 'Cream', // the preset the style opens on (its card's colors)
    },
    build,
    zoom: true, // draws any region of its world (General's Rotation and Size)
    _K: K,
    _clear: () => cache.clear(),
    _cells: cellsAt,
    _layout: layout,
  });
})();
