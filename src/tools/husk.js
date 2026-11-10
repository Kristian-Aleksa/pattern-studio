/* ==========================================================================
   tools/husk.js — Husk: husk scatter (pixel texture: PNG, video).

   1. Husks: Count lumpy blobs are scattered over the frame. Their centres go
      with the frame (a share of its width and height), their sizes with its
      area, so another frame shape crops or extends the same scatter. Size sets
      the average, Size range how much they vary, Lumpiness how far a smooth
      noise pushes each oval's outline in and out (rounded lobes and fingers).
   2. Bite: every husk is a dark skin over a kernel of the third ink. The depth
      of a point (0 at the husk's edge, 1 at its centre; overlapping husks
      deepen each other) decides how much kernel shows there: Dots prints it
      as a dot screen fixed to the frame, each dot as big as the depth allows;
      Crumble lets it break through in crumbs (a fixed noise, thresholded by
      the depth). Amount: how much of the kernel the skin covers (0: an
      outline). Texture: the dot spacing, or the crumbs' size (a fine stipple
      at 0, big ragged crumbs at 100).
   3. Finish: Grain, a fine grain printed over everything (it stays put).
   General's Size and Rotation show more or less of the same world: past the
   frame the scatter goes on in tiles the size of its own box, every tile
   with husks of its own (never a repeat); the dot screen and the crumbs are
   the world's, and the grain stays one dot per pixel.
   4. Animation: every husk circles its own loop path (the same reach across
      and down, each with its own timing, so the paths range from circles to
      slanted lines) once per loop, through the fixed screen and crumbs: the
      dots swell and shrink and the crumbs open and close as they pass.
      Seamless; Intensity sets how far the husks travel (0 holds them still).
   ========================================================================== */
(() => {
  const { hash } = PL.rng;

  // Ground, husk, then the kernel ink(s). The default look uses Rust (defaults.palette).
  const PALETTES = [
    { name: 'Bubblegum', colors: ['#FC58AC', '#181718', '#DE5EF6'] },
    { name: 'Sky', colors: ['#7AC8F5', '#0B1723', '#F67F2F'] },
    { name: 'Paper', colors: ['#F1ECE2', '#1D1B1A', '#E8452C'] },
    { name: 'Lagoon', colors: ['#20B6C8', '#0D1A22', '#F6E35A'] },
    { name: 'Rust', colors: ['#E8572A', '#1A1110', '#F5C8A3'] },
    { name: 'Mint', colors: ['#8FE3C8', '#11201B', '#FF6B6B'] },
    { name: 'Forest', colors: ['#032617', '#F1EBD5', '#F66D67'] },
    { name: 'Peach', colors: ['#FFB49A', '#2A1416', '#FFF3E6'] },
    { name: 'Violet', colors: ['#8B5CF6', '#140F24', '#C6F432'] },
    { name: 'Mono', colors: ['#EDEDEB', '#151515', '#8C8C8C'] },
  ];

  /* ---- colour roles -------------------------------------------------------------------- */
  const roles = (n) => ['Ground', 'Husk', ...(n === 3 ? ['Kernel'] : Array.from({ length: n - 2 }, (_, i) => 'Kernel ' + (i + 1)))];
  const spec = (n) => ({ ramp: 1, accents: Math.max(1, n - 2) });
  const isLight = (hex) => PL.color.luminance(hex) > 0.35;

  // "New colors": a vivid ground, a near-black husk (now and then the other way round: a deep
  // ground and pale husks), and vivid kernels a step round the colour wheel from the ground.
  function generate(n, rng) {
    const C = PL.color;
    const h0 = rng.float(0, 360);
    const dark = rng.chance(0.15);
    const out = dark
      ? [C.lch(rng.float(0.14, 0.2), rng.float(0.01, 0.03), h0), C.lch(rng.float(0.93, 0.96), rng.float(0.01, 0.03), h0 + 30)]
      : [C.lch(rng.float(0.66, 0.8), rng.float(0.16, 0.24), h0), C.lch(rng.float(0.15, 0.2), rng.float(0.005, 0.02), h0)];
    const dir = rng.sign();
    for (let i = 0; i < n - 2; i++) {
      const hk = h0 + dir * (rng.float(35, 80) + i * rng.float(40, 70));
      out.push(C.lch(rng.float(0.62, 0.74), rng.float(0.17, 0.25), hk));
    }
    return out;
  }

  // + adds a kernel ink in a hue the palette doesn't have yet.
  function add(colors) {
    const C = PL.color;
    const c = colors.slice();
    const hues = c.filter((x) => C.hexToLch(x)[1] > 0.04).map((x) => C.hexToLch(x)[2]);
    let best = 0, bd = -1;
    for (let h = 0; h < 360; h += 10) {
      const d = hues.length ? Math.min(...hues.map((x) => Math.abs((((h - x) % 360) + 540) % 360 - 180))) : 180;
      if (d > bd) { bd = d; best = h; }
    }
    c.push(C.lch(0.68, 0.2, best));
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
  const PARAMS = [
    S('Husks', 'count', 'Count', 1, 70, 48, { rand: [26, 60], hint: 'How many husks are scattered over the frame' }),
    S('Husks', 'size', 'Size', 0, 100, 34, { unit: '%', rand: [26, 66], hint: 'Their average size' }),
    S('Husks', 'range', 'Size range', 0, 100, 100, { unit: '%', rand: [35, 100], hint: 'How much their sizes vary (0: all the same size)' }),
    S('Husks', 'lump', 'Lumpiness', 0, 100, 39, { unit: '%', rand: [22, 66], hint: 'From smooth ovals to lumpy, fingered shapes' }),
    { section: 'Bite', key: 'kind', label: 'Kind', type: 'select', def: 'dots', options: [{ value: 'dots', label: 'Dots' }, { value: 'crumble', label: 'Crumble' }], hint: 'How the kernel shows through the husk' },
    S('Bite', 'amount', 'Amount', 0, 100, 74, { unit: '%', rand: [30, 86], hint: 'How much of the kernel the husk covers (0: just an outline)' }),
    S('Bite', 'texture', 'Texture', 0, 100, 45, { unit: '%', rand: [24, 76], hint: 'Dots: their spacing. Crumble: from a fine stipple to smooth crumbs' }),
    S('Finish', 'grain', 'Grain', 0, 100, 49, { unit: '%', rand: [24, 62], hint: 'A fine grain printed over everything' }),
  ];

  // Constants. Lengths: a share of sqrt(W x H) (s) for the husks, of min(W, H) (m) for the bite.
  const K = {
    margin: 0.06,              // husk centres scatter this far past the frame's edges (share of its width / height)
    r0: 0.051, r1: 0.091,      // average radius (equal-area) at Size 0 and the rise to Size 100, x s
    spread: 1.0,               // Size range 100 %: radii from 0.5 to 1.5 x the average
    elong: [0.04, 0.18],       // stretch of the oval (a share of the radius), plus ...
    elongL: 0.8,               // ... this much more at Lumpiness 100
    lumpF: 0.85,               // lump noise: lattice cells per husk radius (and twice that for the finer octave)
    lumpGain: 0.5,             // the finer octave's weight
    lumpA: 1.4,                // how hard the noise pushes the outline at Lumpiness 100 ...
    lumpPow: 0.65,             // ... growing like Lumpiness^this
    orbit: 0.0692,             // how far a husk swings across and down on its loop path at Intensity 1, x s (46 px at 1280 x 960 at 0.6)
    pitch: [0.004208, 0.029347, 0.000445], // dot spacing: a + b Texture + c Texture^2, x m (3 px at 713 at Texture 0)
    dotCore: [1.03, -0.8, 0.145], // dot size at the husk's centre: a + b A + c A^2 (share of the cell's half diagonal)
    dotGamma: 0.65,            // dots grow with the depth like depth^this
    crumbCell: 0.010,          // the crumbs' coarsest noise cell, x m, at Texture 0 ...
    crumbCellT: 0.045,         // ... plus this much more at Texture 100 (bigger crumbs) ...
    crumbStop: 0.0028,         // ... halving down to this, x m (2 px at 713)
    crumbGain: [0.66, 0.48],   // their roughness at Texture 0 and 100 (gain from one octave to the next)
    crumbDot: 0.0022,          // the stipple's cell, x m (1.6 px at 713) ...
    crumbFine: [0.9, 0.106],   // ... its share of the noise: a exp(-Texture / b) (all stipple at 0, gone by 50)
    cth: [0.0, 0.93],          // crumble: depth where half the kernel shows, at Amount 0 / rise to 100
    cjit: [0.02, 1.1],         // crumble: depth spread of the crumbs, at Amount 0 / rise to 100
    outline: 0.0025,           // the skin is never thinner than this, x s (a 2 px outline at 950 x 713)
    union: 1,                  // where husks overlap, each deepens the other (1 - (1 - a)(1 - b)); 0: the deeper one
    grain: 9.5,                // grain std in levels at Grain 100 %
    nt: 512,                   // samples in each husk's outline table
  };

  const lerp = (a, b, t) => a + (b - a) * t;
  const pitch = (m, T) => Math.max(1.5, m * (K.pitch[0] + K.pitch[1] * T + K.pitch[2] * T * T)); // the dot spacing in px
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

  /* ---- husks ----------------------------------------------------------------------------- */
  // A husk is an oval whose outline a smooth noise pushes in and out: in every direction its radius
  // is the oval's times (1 - lump x noise), the noise being two octaves of gradient noise read round
  // a circle (so it closes on itself), in the husk's own units: a husk keeps its lumps whatever its
  // size. The depth of a point is 1 - its distance from the centre / the radius that way.
  // Directions are looked up by the "diamond angle" (dy / (|dx| + |dy|), no trig per pixel); the
  // outline table holds the radius at the true angle of each diamond-angle step.
  const NT = K.nt;
  const DIA = new Float64Array(NT + 1);
  for (let k = 0; k <= NT; k++) {
    const a = (4 * k) / NT;
    let x, y;
    if (a < 1) { x = 1 - a; y = a; } else if (a < 2) { x = 1 - a; y = 2 - a; } else if (a < 3) { x = a - 3; y = 2 - a; } else { x = a - 3; y = a - 4; }
    DIA[k] = Math.atan2(y, x);
  }
  const dia = (dx, dy) => (dy >= 0 ? (dx >= 0 ? dy / (dx + dy) : 1 - dx / (dy - dx)) : dx < 0 ? 2 - dy / (-dx - dy) : 3 + dx / (dx - dy));

  function lattice(seed, i, oct, gs) {
    const G = new Float32Array(gs * gs * 2);
    for (let b = 0; b < gs; b++) for (let a = 0; a < gs; a++) {
      const ang = 2 * Math.PI * hash(seed, i, b * 131 + a, 0x6c0 + oct);
      G[(b * gs + a) * 2] = Math.cos(ang); G[(b * gs + a) * 2 + 1] = Math.sin(ang);
    }
    return G;
  }
  function grad(G, gs, ux, uy) {
    const i = ux | 0, j = uy | 0, fx = ux - i, fy = uy - j;
    const k = (j * gs + i) * 2, k2 = k + gs * 2;
    const n00 = G[k] * fx + G[k + 1] * fy, n10 = G[k + 2] * (fx - 1) + G[k + 3] * fy;
    const n01 = G[k2] * fx + G[k2 + 1] * (fy - 1), n11 = G[k2 + 2] * (fx - 1) + G[k2 + 3] * (fy - 1);
    const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10), sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const a = n00 + (n10 - n00) * sx;
    return a + (n01 + (n11 - n01) * sx - a) * sy;
  }

  // The husks' shapes (cached: only their places change from frame to frame; one entry per tile of
  // the scatter). Every husk from its own hashes: adding husks (Count) never changes the others.
  const SH = new Map();
  function shapes(seed, p, W, H) {
    const N = Math.max(1, Math.min(70, Math.round(p.count)));
    const key = [seed, N, p.size, p.range, p.lump, W, H].join('|');
    const hit = SH.get(key);
    if (hit) return hit;
    const s = Math.sqrt(W * H);
    const L = clamp01(p.lump / 100), range = clamp01(p.range / 100);
    const R0 = s * (K.r0 + K.r1 * clamp01(p.size / 100));
    const amp = K.lumpA * Math.pow(L, K.lumpPow);
    const list = [];
    for (let i = 0; i < N; i++) {
      const u = (k) => hash(seed, i, k, 0x4b5);
      const R = R0 * Math.max(0.15, 1 + range * K.spread * (u(3) - 0.5));
      const e = lerp(K.elong[0], K.elong[1], u(4)) * (1 + K.elongL * L), te = 2 * Math.PI * u(5);
      const ea = 1 + e, eb = 1 - e;
      const oct = [];
      if (amp) for (let o = 0; o < 2; o++) {
        const f = K.lumpF * (o + 1), gs = Math.ceil(2 * f) + 4;
        oct.push({ f, gs, G: lattice(seed, i, o, gs), ox: f + 1.5 + u(50 + 2 * o), oy: f + 1.5 + u(51 + 2 * o), w: o ? K.lumpGain : 1 });
      }
      const shape = (a) => {
        const c = Math.cos(a - te), sn = Math.sin(a - te), ca = Math.cos(a), sa = Math.sin(a);
        let n = 0;
        for (const q of oct) n += q.w * grad(q.G, q.gs, q.ox + ca * q.f, q.oy + sa * q.f);
        const x = -amp * n; // pushed out where the noise is low, in where it is high (never below 0.4, softly)
        const g = x >= -0.6 ? 1 + x : 0.4 * Math.exp((x + 0.6) / 0.4);
        return ((ea * eb) / Math.sqrt(eb * eb * c * c + ea * ea * sn * sn)) * g;
      };
      // equal area: scale so that the outline encloses pi R^2 whatever its lumps
      let m2 = 0;
      for (let k = 0; k < 256; k++) { const v = shape((2 * Math.PI * k) / 256); m2 += v * v; }
      const sc = R / Math.sqrt(m2 / 256);
      const lut = new Float32Array(NT + 1);
      let rmax = 0;
      for (let k = 0; k <= NT; k++) { const r = sc * shape(DIA[k]); lut[k] = r; if (r > rmax) rmax = r; }
      list.push({ i, R, lut, rmax: rmax * 1.01 + 1, u1: u(1), u2: u(2), ph1: 2 * Math.PI * u(14), ph2: 2 * Math.PI * u(15) });
    }
    if (SH.size >= 160) SH.delete(SH.keys().next().value);
    SH.set(key, list);
    return list;
  }

  // The husks at time t: each circles its own loop path (cos with its own phase in x and in y).
  // R (a part of the world, frame units; General's Size and Rotation): the husks that reach into it.
  // The scatter fills a box (1 + 2 margin) times the frame; past it the plane is cut into tiles of
  // that size, each with a scatter of its own (its own seed; the frame's tile keeps the style's seed): new
  // husks everywhere, at the same density, never a repeat.
  const TILE = 1 + 2 * K.margin;
  const tileSeed = (seed, ti, tj) => (ti || tj ? (Math.imul(seed | 0, 0x2545f491) ^ Math.imul(ti, 0x9e3779b1) ^ Math.imul(tj, 0x85ebca77)) | 0 : seed);
  function setup(seed, p, W, H, t, amount, R) {
    const s = Math.sqrt(W * H);
    const orb = K.orbit * Math.max(0, amount || 0) * s;
    const th = 2 * Math.PI * (((t % 1) + 1) % 1);
    const place = (list, ox, oy) => list.map((h) => {
      const x0 = (-K.margin + TILE * h.u1) * W + ox, y0 = (-K.margin + TILE * h.u2) * H + oy;
      return { i: h.i, R: h.R, lut: h.lut, rmax: h.rmax, x0, y0, cx: x0 + orb * Math.cos(th + h.ph1), cy: y0 + orb * Math.cos(th + h.ph2) };
    });
    if (!R) return place(shapes(seed, p, W, H), 0, 0);
    // no husk reaches further than 2.5 x its radius (3 x, to be safe) or its radius 1.5 x the average
    const R0 = s * (K.r0 + K.r1 * clamp01(p.size / 100));
    const reach = 3 * R0 * (1 + 0.5 * clamp01(p.range / 100) * K.spread) + orb + 2;
    const TW = TILE * W, TH = TILE * H, mW = K.margin * W, mH = K.margin * H;
    const ia = Math.ceil((R.x0 - reach + mW) / TW - 1), ib = Math.floor((R.x1 + reach + mW) / TW);
    const ja = Math.ceil((R.y0 - reach + mH) / TH - 1), jb = Math.floor((R.y1 + reach + mH) / TH);
    const out = [];
    for (let tj = ja; tj <= jb; tj++) for (let ti = ia; ti <= ib; ti++) {
      for (const h of place(shapes(tileSeed(seed, ti, tj), p, W, H), ti * TW, tj * TH)) {
        if (h.cx + h.rmax < R.x0 || h.cx - h.rmax > R.x1 || h.cy + h.rmax < R.y0 || h.cy - h.rmax > R.y1) continue;
        out.push(h);
      }
    }
    return out;
  }

  const radiusAt = (lut, dx, dy) => {
    const f = dia(dx, dy) * (NT / 4), k = f | 0;
    return lut[k] + (lut[k + 1] - lut[k]) * (f - k);
  };

  // Depth of every pixel (0 at a husk's edge, 1 at its centre; -1 outside), which husk it
  // belongs to (the deepest) and its distance in px to that husk's edge along the ray.
  // M (General's Size and Rotation): the canvas is M.cw x M.ch and its pixel (x, y) shows the world
  // at (M.x0 + x M.s, M.y0 + y M.s) (its centre half a pixel on); depths and edges stay in frame units.
  function depthMap(hs, W, H, M) {
    const cw = M ? M.cw : W, ch = M ? M.ch : H, ms = M ? M.s : 1, mx = M ? M.x0 : 0, my = M ? M.y0 : 0;
    const D = new Float32Array(cw * ch).fill(-1), own = new Uint8Array(cw * ch).fill(255), edge = new Float32Array(cw * ch);
    const dmax = new Float32Array(cw * ch).fill(-1); // the deepest husk owns the pixel (its kernel ink)
    for (const h of hs) {
      const rm = h.rmax, rm2 = rm * rm, lut = h.lut;
      const xa = Math.max(0, Math.floor((h.cx - rm - mx) / ms - 0.5)), xb = Math.min(cw - 1, Math.ceil((h.cx + rm - mx) / ms - 0.5));
      const ya = Math.max(0, Math.floor((h.cy - rm - my) / ms - 0.5)), yb = Math.min(ch - 1, Math.ceil((h.cy + rm - my) / ms - 0.5));
      for (let y = ya; y <= yb; y++) {
        const dy = my + (y + 0.5) * ms - h.cy, dy2 = dy * dy;
        if (dy2 >= rm2) continue;
        const row = y * cw;
        for (let x = xa; x <= xb; x++) {
          const dx = mx + (x + 0.5) * ms - h.cx, r2 = dx * dx + dy2;
          if (r2 >= rm2) continue;
          const r = Math.sqrt(r2);
          const rho = r > 1e-6 ? radiusAt(lut, dx, dy) : lut[0];
          if (r >= rho) continue;
          const d = 1 - r / rho, o = row + x, prev = D[o];
          if (K.union && prev > 0) D[o] = 1 - (1 - prev) * (1 - d); // overlapping husks deepen each other
          else if (d > prev) D[o] = d;
          if (d > dmax[o]) { dmax[o] = d; own[o] = h.i; }
          if (rho - r > edge[o]) edge[o] = rho - r;
        }
      }
    }
    return { D, own, edge };
  }

  /* ---- the crumbs: a fixed noise over the world, evened out to [0, 1] ------------------- */
  // value noise octaves (smooth steps between random lattice values), added into v. M (General's Size
  // and Rotation): v is the canvas M.cw x M.ch, its pixel centres the world's points
  // (M.x0 + (x + 0.5) M.s, M.y0 + (y + 0.5) M.s); the lattice is the world's wherever it is read.
  function octaves(v, W, H, seed, c0, cMin, gain, salt, M) {
    const cw = M ? M.cw : W, ch = M ? M.ch : H, ms = M ? M.s : 1, mx = M ? M.x0 : 0, my = M ? M.y0 : 0;
    let amp = 1, c = c0, o = 0;
    while (c >= cMin && o < 9) {
      const ox = hash(seed, o, 1, salt + 0x77) * c, oy = hash(seed, o, 2, salt + 0x77) * c;
      const ia = Math.floor((mx + 0.5 * ms + ox) / c), ja = Math.floor((my + 0.5 * ms + oy) / c); // the lattice the canvas reads
      const gw = Math.floor((mx + (cw - 0.5) * ms + ox) / c) - ia + 2, gh = Math.floor((my + (ch - 0.5) * ms + oy) / c) - ja + 2;
      if (gw * gh > 4 * cw * ch + 4096) {
        // cells far smaller than the canvas's pixels (zoomed far out): read the lattice point by point
        for (let y = 0; y < ch; y++) {
          const f = (my + (y + 0.5) * ms + oy) / c, j0 = Math.floor(f), ty = f - j0, sy = ty * ty * (3 - 2 * ty), row = y * cw;
          for (let x = 0; x < cw; x++) {
            const g = (mx + (x + 0.5) * ms + ox) / c, i0 = Math.floor(g), tx = g - i0, sx = tx * tx * (3 - 2 * tx);
            const a = hash(seed, i0, j0, salt + o) * 2 - 1, b = hash(seed, i0 + 1, j0, salt + o) * 2 - 1;
            const q = hash(seed, i0, j0 + 1, salt + o) * 2 - 1, d = hash(seed, i0 + 1, j0 + 1, salt + o) * 2 - 1;
            const top = a + (b - a) * sx, bot = q + (d - q) * sx;
            v[row + x] += amp * (top + (bot - top) * sy);
          }
        }
      } else {
        const lat = new Float32Array(gw * gh);
        for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) lat[j * gw + i] = hash(seed, ia + i, ja + j, salt + o) * 2 - 1;
        const ix = new Int32Array(cw), sx = new Float32Array(cw);
        for (let x = 0; x < cw; x++) { const f = (mx + (x + 0.5) * ms + ox) / c, i0 = Math.floor(f), tx = f - i0; ix[x] = i0 - ia; sx[x] = tx * tx * (3 - 2 * tx); }
        for (let y = 0; y < ch; y++) {
          const f = (my + (y + 0.5) * ms + oy) / c, j0 = Math.floor(f), ty = f - j0, sy = ty * ty * (3 - 2 * ty);
          const r0 = (j0 - ja) * gw, r1 = r0 + gw, row = y * cw;
          for (let x = 0; x < cw; x++) {
            const i0 = ix[x], s = sx[x];
            const a = lat[r0 + i0], b = lat[r0 + i0 + 1], q = lat[r1 + i0], d = lat[r1 + i0 + 1];
            const top = a + (b - a) * s, bot = q + (d - q) * s;
            v[row + x] += amp * (top + (bot - top) * sy);
          }
        }
      }
      amp *= gain; c /= 2; o++;
    }
  }
  const spread = (v) => { let a = 0, b = 0, n = 0; for (let k = 0; k < v.length; k += 5) { a += v[k]; b += v[k] * v[k]; n++; } const m = a / n; return Math.sqrt(Math.max(1e-9, b / n - m * m)); };
  // The crumbs: smooth clumps (fractal value noise, a little rougher at low Texture) mixed with a
  // fine stipple that takes over as Texture nears 0. Then evened out to [0, 1]. The mix and the
  // evening are the frame's: st collects them from the frame (no M), and a canvas over another part
  // of the world (M) uses them, so the crumbs go on past the frame unchanged.
  function mixNoise(W, H, seed, T, M, st) {
    const m = Math.min(W, H), n = M ? M.cw * M.ch : W * H;
    const v = new Float32Array(n);
    const fine = K.crumbFine[0] * Math.exp(-T / K.crumbFine[1]); // the stipple's share of the variance
    if (fine < 0.999) {
      octaves(v, W, H, seed, Math.max(1, (K.crumbCell + K.crumbCellT * T) * m), Math.max(0.75, K.crumbStop * m), lerp(K.crumbGain[0], K.crumbGain[1], T), 0x51, M);
      if (!M) st.k1 = Math.sqrt(1 - fine) / spread(v);
      const k = st.k1;
      for (let i = 0; i < n; i++) v[i] *= k;
    }
    if (fine > 0.001) {
      const f = new Float32Array(n);
      const cf = Math.max(0.75, K.crumbDot * m);
      octaves(f, W, H, seed ^ 0x5f3759df, cf, cf, 0, 0x91, M); // one octave
      if (!M) st.k2 = Math.sqrt(fine) / spread(f);
      const k = st.k2;
      for (let i = 0; i < n; i++) v[i] += k * f[i];
    }
    return v;
  }
  const B = 2048; // steps in the evening table
  const even = (v, st) => {
    const { lo, span, hist, cnt } = st;
    for (let k = 0; k < v.length; k++) {
      const f = Math.max(0, Math.min(B - 1e-6, ((v[k] - lo) / span) * B)), b = f | 0;
      v[k] = (hist[b] + (hist[b + 1] - hist[b]) * (f - b)) / cnt;
    }
  };
  let NZ = null, NZM = null;
  function crumbs(W, H, seed, T, M) {
    const key = [W, H, seed, T.toFixed(4)].join('|');
    if (!NZ || NZ.key !== key) {
      const st = {};
      const v = mixNoise(W, H, seed, T, null, st), n = W * H;
      // even it out: the share of the frame below a value -> that value (a 2048-step table)
      let lo = Infinity, hi = -Infinity;
      for (let k = 0; k < n; k += 7) { const x = v[k]; if (x < lo) lo = x; if (x > hi) hi = x; }
      const hist = new Float64Array(B + 1), span = hi - lo || 1;
      let cnt = 0;
      for (let k = 0; k < n; k += 3) { const b = Math.max(0, Math.min(B - 1, Math.floor(((v[k] - lo) / span) * B))); hist[b + 1]++; cnt++; }
      for (let b = 1; b <= B; b++) hist[b] += hist[b - 1];
      Object.assign(st, { lo, span, hist, cnt });
      even(v, st);
      NZ = { key, v, st };
      NZM = null;
    }
    if (!M) return NZ.v;
    const mkey = [M.cw, M.ch, M.s, M.x0, M.y0].join('|');
    if (NZM && NZM.key === mkey) return NZM.v;
    const v = mixNoise(W, H, seed, T, M, NZ.st);
    even(v, NZ.st);
    NZM = { key: mkey, v };
    return v;
  }

  /* ---- grain: luminance noise per pixel, the same in every frame ---------------------------- */
  const LUM = new Float32Array(4096);
  {
    const r = PL.rng.mulberry32(0x6a09e667);
    for (let i = 0; i < 4096; i++) LUM[i] = r() + r() + r() - 1.5; // std 1/2
  }

  /* ---- paint ------------------------------------------------------------------------------- */
  // map (General's Rotation and Size): the canvas (cw x ch) and the part of the world it shows. The
  // husks, the dot screen and the crumbs are the world's; the grain stays one speck per canvas pixel.
  let pvImg = null;
  function paint({ ctx, W, H, aspect, seed, p, colors, t = 0, anim, transparent = false, preview = false, map }) {
    const n = colors.length, nK = Math.max(1, n - 2);
    const amount = anim ? anim.amount : 0;
    const cw = map ? map.cw : W, ch = map ? map.ch : H, mx = map ? map.x0 : 0, my = map ? map.y0 : 0, ms = map ? map.s : 1;
    const hs = setup(seed, p, W, H, t, amount, map ? { x0: mx, y0: my, x1: mx + cw * ms, y1: my + ch * ms } : undefined);
    const { D, own, edge } = depthMap(hs, W, H, map);
    const s = Math.sqrt(W * H), m = Math.min(W, H);
    const A = clamp01(p.amount / 100), T = clamp01(p.texture / 100);
    const minEdge = K.outline * s;
    const N = cw * ch;
    const kernel = new Uint8Array(N); // 0 skin, 1 + k kernel ink k
    if (p.kind === 'crumble') {
      const nz = crumbs(W, H, seed, T, map);
      const th = K.cth[0] + K.cth[1] * A, jit = K.cjit[0] + K.cjit[1] * A;
      for (let o = 0; o < N; o++) {
        const d = D[o];
        if (d <= 0 || edge[o] < minEdge) continue;
        if (nz[o] < 0.5 + (d - th) / jit) kernel[o] = 1 + (own[o] % nK);
      }
    } else {
      // the dot screen: fixed to the world, a dot round every cell centre, as big as the depth at
      // each pixel allows (so a dot shrinks on the side that faces the rim). Pixels are sampled at
      // their corners: at the finest spacing (3 px) a dot is 2 x 2 px.
      const P = pitch(m, T);
      const core = Math.max(0, K.dotCore[0] + K.dotCore[1] * A + K.dotCore[2] * A * A) * P * Math.SQRT1_2;
      const RL = new Float32Array(1025); // squared dot radius by depth
      for (let k = 0; k <= 1024; k++) { const r = core * Math.pow(k / 1024, K.dotGamma); RL[k] = r * r; }
      const cy = new Float32Array(ch), cx = new Float32Array(cw);
      for (let y = 0; y < ch; y++) { const f = (my + y * ms) / P; cy[y] = (f - Math.floor(f) - 0.5) * P; }
      for (let x = 0; x < cw; x++) { const f = (mx + x * ms) / P; cx[x] = (f - Math.floor(f) - 0.5) * P; }
      for (let y = 0; y < ch; y++) {
        const dy2 = cy[y] * cy[y];
        for (let x = 0; x < cw; x++) {
          const o = y * cw + x, d = D[o];
          if (d <= 0 || edge[o] < minEdge) continue;
          if (cx[x] * cx[x] + dy2 < RL[(d * 1024) | 0]) kernel[o] = 1 + (own[o] % nK);
        }
      }
    }
    // colours, with the grain
    const rgb = colors.map(PL.color.hexToRgb);
    const sd = K.grain * clamp01(p.grain / 100);
    const c8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
    const LUT = new Uint32Array(n * 256);
    for (let c = 0; c < n; c++) {
      const a = transparent && c === 0 ? 0 : 255;
      for (let q = 0; q < 256; q++) {
        const ln = c === 0 && transparent ? 0 : Math.round(LUM[q * 16] * 2 * sd);
        LUT[c * 256 + q] = ((a << 24) | (c8(rgb[c][2] + ln) << 16) | (c8(rgb[c][1] + ln) << 8) | c8(rgb[c][0] + ln)) >>> 0;
      }
    }
    if (preview) { if (!pvImg || pvImg.width !== cw || pvImg.height !== ch) pvImg = ctx.createImageData(cw, ch); }
    const img = preview ? pvImg : ctx.createImageData(cw, ch);
    const px32 = new Uint32Array(img.data.buffer);
    const sm = Math.imul(seed | 0, 0x9e3779b1);
    const gox = Math.round(mx / ms), goy = Math.round(my / ms); // the grain: one speck per canvas pixel, counted from the frame's corner
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const o = y * cw + x;
        const ci = D[o] <= 0 ? 0 : kernel[o] ? 1 + kernel[o] : 1;
        let h = Math.imul(x + gox, 0x85ebca77) ^ Math.imul(y + goy, 0xc2b2ae3d) ^ sm;
        h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h ^= h >>> 13;
        px32[o] = LUT[ci * 256 + (h & 255)];
      }
    }
    ctx.putImageData(img, 0, 0);
    const nh = Math.max(1, Math.min(70, Math.round(p.count))); // the frame's own husks
    return { status: `${nh} husk${nh === 1 ? '' : 's'} · ${p.kind === 'crumble' ? 'crumble' : 'dots'}` };
  }

  PL.tools.register({
    id: 'husk',
    name: 'Husk',
    kind: 'Backgrounds',
    tagline: 'Husk scatter',
    about: 'Lumpy husks scattered over a ground, each a dark skin over a kernel that shows through as a dot screen or in crumbs, deepest in the middle, with fine grain over everything. In the animation every husk circles its own path through the fixed screen, so the dots swell and the crumbs open and close.',
    raster: true,
    inks: {
      min: 3, max: 8, roles, fit, spec, add, generate,
      span: () => 2, // Invert swaps the ground and the husks
      hint: 'Ground first, then the husks, then the kernel. More kernel inks are dealt out to the husks in turn.',
    },
    palettes: PALETTES,
    params: PARAMS,
    animLabel: 'Intensity',
    animHint: 'How far the husks travel round their paths (0: still)',
    defaults: {
      anim: { amount: 0.6, fps: 12, frames: 36 },
      fx: {},
      palette: 'Rust', // the preset the style opens on (its card's colors)
    },
    paint,
    zoom: true, // paints any part of its world (General's Rotation and Size)
    _K: K,
    _setup: setup,
    _depthMap: depthMap,
    _pitch: pitch,
    _crumbs: crumbs,
  });
})();
