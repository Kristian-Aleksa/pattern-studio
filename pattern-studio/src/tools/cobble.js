/* ==========================================================================
   tools/cobble.js — Cobble: patterned pixel cobbles.

   1. Pixels: the whole picture sits on a grid of square pixels (Pixels across
      the frame; the rows follow the frame's shape), like pixel art.
   2. Cells: a jittered seed in every Cell size square; every pixel belongs to
      its nearest seed. Gap opens a lane of ground between neighbours and
      Corners cuts back their corners (where three cells meet), so the cells
      read as rounded cobbles.
   3. Cluster: a lumpy mass around the middle of the frame: a smooth noise field
      (Shape: one round mass or many lobes) less a falloff from the centre.
      Coverage is the share of the frame it covers, exactly (100 %: all of it).
      A cell joins when its seed is inside; Fray lets the field cut the cells
      along the edge, so they break into ragged bits and stray fragments.
   4. Colors: the ground, then two families of inks (the first half of the inks
      and the second half), each from the cluster's middle to its edge. A
      second noise field gives every cell its family (Mix: the second one's
      share). Depth: cells deepen toward the middle of the cluster and pale
      toward its edge (0: shades at random); some of the outermost keep only
      their pattern, on the ground.
   5. Patterns: every cell is patterned in a neighbouring shade of its family:
      stripes across, upright or slanted, grids, checks, dots, pluses, crosses,
      squares, diamonds, rings, spirals, zigzags, steps and bricks. Patterns
      sets how many kinds a variation uses, Plain cells keeps some solid and
      Pattern scale sets their size.
   6. Animation: the cluster's field and the families' field drift round a
      small circle in noise space while every seed circles its own home, so the
      cluster breathes and the cells shift and reshape; the patterns scroll,
      ripple and turn a whole number of times. Seamless; Amount 0 holds
      everything still.
   ========================================================================== */
(() => {
  const { hash } = PL.rng;

  // Ground, then two families of inks, each from the cluster's middle to its edge (the first half of the
  // inks is one family, the second half the other). The default look uses Ember (defaults.palette).
  const PALETTES = [
    { name: 'Tide', colors: ['#EAEAE4', '#111C6E', '#2442E4', '#8C9BEA', '#C9D3FB', '#073824', '#23895A', '#93D6B4', '#D3EEE2'] },
    { name: 'Ember', colors: ['#F4F0E9', '#4A1208', '#D8431D', '#F09A6E', '#F7D4BE', '#3B2A05', '#C8890F', '#EBC86A', '#F6E7BE'] },
    { name: 'Orchid', colors: ['#F2EFF4', '#34105A', '#8340F2', '#BE9BF5', '#E5D9FB', '#5A0E37', '#D2337C', '#EE9CC3', '#F9DDEA'] },
    { name: 'Lagoon', colors: ['#EDF3F2', '#073A4B', '#1188B0', '#76C4DE', '#CDEAF3', '#0A3C2D', '#07A57B', '#82D7BF', '#D4F1E8'] },
    { name: 'Rust', colors: ['#F3F0EA', '#3B1B0F', '#A6461F', '#D8966D', '#F0D7C4', '#1D293A', '#3D5B85', '#93A9CA', '#D8E2EF'] },
    { name: 'Moss', colors: ['#F1F0E8', '#26330E', '#5E7F1E', '#A9C46A', '#DDE8BE', '#3A2A12', '#8A6A2E', '#C9AE76', '#EBDFC4'] },
    { name: 'Sorbet', colors: ['#FBF6EE', '#7A1E3A', '#F05A7E', '#F7A8BC', '#FCDDE5', '#7A4A0A', '#F2A33A', '#F8CF8A', '#FDEBCB'] },
    { name: 'Night', colors: ['#14161C', '#DCE3FF', '#7C93FF', '#3A4DB0', '#242C5C', '#D9F5E6', '#5CD69D', '#1F8A5A', '#173B2C'] },
    { name: 'Blue', colors: ['#EAEAE4', '#111C6E', '#2442E4', '#8C9BEA', '#C9D3FB'] },
    { name: 'Mono', colors: ['#EEEEEB', '#161616', '#555555', '#A2A2A2', '#D6D6D3'] },
  ];

  /* ---- color roles -------------------------------------------------------------------- */
  // The inks split into two families once there are four or more (the first one takes the odd ink).
  const split = (m) => (m >= 4 ? [Math.ceil(m / 2), Math.floor(m / 2)] : [m, 0]);
  function roles(n) {
    const [a, b] = split(n - 1);
    return ['Ground', ...Array.from({ length: a }, (_, i) => (b ? 'A' : 'Ink ') + (i + 1)), ...Array.from({ length: b }, (_, i) => 'B' + (i + 1))];
  }
  const spec = (n) => ({ ramp: Math.max(1, n - 1), accents: 0 });
  const isLight = (hex) => PL.color.luminance(hex) > 0.35;

  // A family: from the middle (deep on a light ground, bright on a dark one) to the edge (near the ground).
  function family(T, hue, light, rng) {
    const C = PL.color;
    const out = [];
    for (let i = 0; i < T; i++) {
      const f = T === 1 ? 0 : i / (T - 1);
      const L = light ? 0.27 + f * 0.62 : 0.9 - f * 0.62;
      const ch = (light ? 0.17 - f * 0.11 : 0.12 - f * 0.05) + rng.float(-0.015, 0.015);
      out.push(C.lch(Math.min(0.97, L + rng.float(-0.025, 0.025)), Math.max(0.02, ch), hue + rng.float(-8, 8)));
    }
    return out;
  }
  // "New colors": a pale ground (now and then a deep one) and two families in hues far apart.
  function generate(n, rng) {
    const C = PL.color;
    const dark = rng.chance(0.12);
    const ha = rng.float(0, 360), hb = ha + rng.sign() * rng.float(95, 165);
    const ground = dark ? C.lch(rng.float(0.15, 0.2), rng.float(0.01, 0.03), ha) : C.lch(rng.float(0.93, 0.96), rng.float(0.004, 0.015), ha + 40);
    const [a, b] = split(n - 1);
    return [ground, ...family(a, ha, !dark, rng), ...(b ? family(b, hb, !dark, rng) : [])];
  }

  // + adds a shade to the smaller family (the first one when they're even; at four inks the second family
  // starts from the last one), on its ramp from its middle shade out to the ground: the new shade goes where
  // it stands furthest from every color there is (most often halfway across the widest step), so every
  // shade stays distinct and visible and the colors already there keep their order.
  function add(colors) {
    const C = PL.color;
    const c = colors.slice();
    const m = c.length - 1;
    const [a, b] = split(m);
    const from = m === 3 ? 3 : m < 3 || a === b ? 1 : 1 + a, T = m === 3 ? 1 : m < 3 ? m : a === b ? a : b;
    const labs = c.map((h) => C.hexToOklab(h));
    const far = (h) => { const p = C.hexToOklab(h); return Math.min(...labs.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]))); };
    let best = null, score = -1;
    for (let i = from; i < from + T; i++) {
      const next = i + 1 < from + T ? c[i + 1] : c[0]; // the next shade, or the ground after the last
      for (const t of [0.5, 0.33, 0.67]) {
        const h = C.mix(c[i], next, t), s = far(h);
        if (s > score + 1e-9) { score = s; best = [i + 1, h]; }
      }
    }
    c.splice(best[0], 0, best[1]);
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
    S('Cluster', 'coverage', 'Coverage', 5, 100, 91, { unit: '%', rand: [40, 95], hint: 'How much of the frame the cluster covers (100 %: all of it, no empty ground around it)' }),
    S('Cluster', 'shape', 'Shape', 0, 100, 48, { unit: '%', rand: [20, 75], hint: "The cluster's outline: one round mass (0) or many lobes and bays (100)" }),
    S('Cluster', 'fray', 'Fray', 0, 100, 25, { unit: '%', rand: [15, 60], hint: "How ragged the cluster's edge is: cells cut short and stray bits around it" }),
    S('Cells', 'cell', 'Cell size', 6, 30, 15, { rand: [10, 17], hint: 'How big the cells are, in pixels' }),
    S('Cells', 'gap', 'Gap', 0, 100, 48, { unit: '%', rand: [30, 62], hint: 'Space between the cells' }),
    S('Cells', 'corners', 'Corners', 0, 100, 41, { unit: '%', rand: [25, 65], hint: "How far the cells' corners are cut back" }),
    S('Cells', 'pixels', 'Pixels', 60, 260, 140, { step: 2, rand: [130, 200], hint: 'Pixels across the frame: the grain of the whole picture' }),
    S('Fill', 'kinds', 'Patterns', 1, 16, 16, { rand: [10, 16], hint: 'How many kinds of pattern the cells use' }),
    S('Fill', 'psize', 'Pattern scale', 0, 100, 40, { unit: '%', rand: [18, 55], hint: 'Size of the stripes, checks, dots and rings' }),
    S('Fill', 'plain', 'Plain cells', 0, 100, 39, { unit: '%', rand: [4, 42], hint: 'Share of the cells with no pattern' }),
    S('Fill', 'depth', 'Depth', 0, 100, 75, { unit: '%', rand: [55, 92], hint: 'How much the cells deepen toward the middle of the cluster (0: shades at random)' }),
    S('Fill', 'mix', 'Mix', 0, 100, 50, { unit: '%', rand: [30, 70], hint: 'Share of the second color family (four or more inks)' }),
  ];

  // Constants. Field lengths in frame widths; cell lengths in pixels unless noted.
  const K = {
    shapeF: [1.3, 3.8],   // the cluster's field: noise frequency at Shape 0 -> 100 (log scale)
    oct: 3, gain: 0.5,    // ... fractal octaves and their fall-off
    fall: 2.4,            // the pull toward the middle: this x r^2 (r: 0 at the centre, 1 at a corner)
    calib: 44,            // Coverage is measured on a grid this many samples across the frame
    jitter: 0.42,         // seeds: up to this far from their square's centre (cell sizes)
    wobble: 0.17,         // animation: every seed circles this far (cell sizes) x Amount
    drift: 0.24,          // animation: the fields' view circles this far (noise units) x Amount
    gap: 2.7,             // Gap 100 %: lanes this wide
    corner: 0.22,         // Corners 100 %: corners cut back this far (cell sizes)
    fray: 0.8,            // Fray 100 %: a pixel's own field counts this much (its cell's, the rest) ...
    frayN: 0.09,          // ... plus this much fine noise, for stray bits
    frayF: 9,             // ... at this frequency
    period: [2, 6.5],     // Pattern size 0 -> 100: the patterns' period
    hueF: 1.7,            // the families' field: noise frequency
    shadeF: 2.6,          // a shade field mixed into the depth (so a full frame still has every shade)
    shadeW: 0.3,          // ... this much of it
    hollow: 0.35,         // the outermost cells: this share keep only their pattern, on the ground
    turns: 2,             // the patterns move this many periods round the loop at Amount 1 (whole numbers)
  };
  const KINDS = ['across', 'upright', 'slant', 'slant back', 'grid', 'checks', 'dots', 'pluses', 'crosses', 'squares', 'diamonds', 'rings', 'spiral', 'zigzag', 'steps', 'bricks'];

  const lerp = (a, b, t) => a + (b - a) * t;
  const loglerp = (a, b, t) => Math.exp(lerp(Math.log(a), Math.log(b), t));
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const mod = (a, m) => ((a % m) + m) % m;
  // Normal CDF (a logistic fit): turns noise into an even share
  const Phi = (z) => 1 / (1 + Math.exp(-1.7017 * z - 0.0794 * z * z * z));

  /* ---- the patterns: true where pixel (x, y) (whole pixels from the cell's centre) takes the
     pattern's ink. P: period; w: line width; o: how far the pattern has moved (whole pixels); a: turns. */
  function inPattern(k, x, y, P, w, o, a) {
    switch (k) {
      case 0: return mod(y + o, P) < w;                                         // stripes across
      case 1: return mod(x + o, P) < w;                                         // upright
      case 2: return mod(x + y + o, P) < w;                                     // slant
      case 3: return mod(x - y + o, P) < w;                                     // slant back
      case 4: return mod(x + o, P) === 0 || mod(y + o, P) === 0;                // grid
      case 5: { const q = Math.max(1, P >> 1); return ((Math.floor((x + o) / q) + Math.floor(y / q)) & 1) === 1; } // checks
      case 6: return mod(x + o, P) < w && mod(y + o, P) < w;                    // dots
      case 7: { const u = mod(x + o, P), v = mod(y + o, P), c = P >> 1; return (u === c && Math.abs(v - c) <= 1) || (v === c && Math.abs(u - c) <= 1); } // pluses
      case 8: { const u = mod(x + o, P) - (P >> 1), v = mod(y + o, P) - (P >> 1); return Math.abs(u) === Math.abs(v) && Math.abs(u) <= 1; } // crosses
      case 9: return mod(Math.max(Math.abs(x), Math.abs(y)) - o, P) < w;        // squares (rippling out)
      case 10: return mod(Math.abs(x) + Math.abs(y) - o, P) < w;               // diamonds
      case 11: return mod(Math.round(Math.hypot(x, y)) - o, P) < w;            // rings
      case 12: { const r = Math.hypot(x, y), t = Math.atan2(y, x) / (2 * Math.PI) + a; return mod(Math.round(r + t * P), P) < w; } // spiral
      case 13: { const z = Math.abs(mod(x + o, 2 * P) - P); return mod(y + z, P) < w; } // zigzag
      case 14: return mod(x + o, P) > mod(y, P);                                // steps
      default: { const row = Math.floor(y / P); return mod(y, P) === 0 || mod(x + o + (row & 1) * P, 2 * P) === 0; } // bricks
    }
  }
  const NEEDS3 = new Set([4, 7, 8, 14, 15]); // these want a period of 3 or more
  // how far a pattern moves before it looks the same again (checks, zigzags and bricks repeat over more)
  const repeat = (k, P) => (k === 5 ? 2 * Math.max(1, P >> 1) : k === 13 || k === 15 ? 2 * P : P);

  /* ---- per-variation settings (each from its own hash: changing one setting never
     reshuffles the others) ------------------------------------------------------------- */
  function setup(seed, p) {
    const u = (k) => hash(seed, 0xc0bb, k, 7);
    // the kinds of pattern in play: a shuffle of their own for every variation; Patterns takes the first ones
    const order = KINDS.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(u(100 + i) * (i + 1));
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
    return {
      order,
      F: loglerp(K.shapeF[0], K.shapeF[1], clamp01(p.shape / 100)),
      // the noise views: a far-off corner of noise space for every variation
      fx: u(1) * 200 - 100, fy: u(2) * 200 - 100, hx: u(3) * 200 - 100, hy: u(4) * 200 - 100,
      sx: u(5) * 200 - 100, sy: u(6) * 200 - 100, z: u(7) * 7, w: u(8) * 7,
    };
  }

  // The color index (0: ground) of every pixel at time t: the frame's pixels, or (General's Rotation
  // and Size) every pixel of the grid running on past the frame that region R reaches.
  function pixels(W, H, seed, p, n, t, amount, aspect, R) {
    const cols = Math.max(16, Math.round(p.pixels));
    const rows = Math.max(1, aspect > 0 ? Math.floor(cols / aspect + 0.5 + 1e-6) : Math.round((cols * H) / W));
    const pw = W / cols, ph = H / rows;
    const c0 = R ? Math.floor(R.x0 / pw) : 0, c1 = R ? Math.ceil(R.x1 / pw) : cols;
    const r0 = R ? Math.floor(R.y0 / ph) : 0, r1 = R ? Math.ceil(R.y1 / ph) : rows;
    const nc = c1 - c0, nr = r1 - r0;
    const P = setup(seed, p);
    const NF = PL.noise.get((seed ^ 0x1b873593) >>> 0), NH = PL.noise.get((seed ^ 0x85ebca6b) >>> 0);
    const am = Math.max(0, amount || 0);
    const tt = ((t % 1) + 1) % 1, th = 2 * Math.PI * tt;
    // the fields' view circles in noise space, starting where the still picture is
    const rho = K.drift * am, dz = rho * (Math.cos(th) - 1), dw = rho * Math.sin(th);
    const yc = rows / (2 * cols), diag2 = 0.25 + yc * yc;
    // the cluster's field at (X, Y) (frame widths), without its level B
    const field = (X, Y) => NF.fbm4(X * P.F + P.fx, Y * P.F + P.fy, P.z + dz, P.w + dw, K.oct, K.gain) - (K.fall * ((X - 0.5) * (X - 0.5) + (Y - yc) * (Y - yc))) / diag2;

    // Coverage: the level that puts exactly that share of the frame inside (a grid of samples over the frame)
    const cov = clamp01((p.coverage == null ? 50 : p.coverage) / 100);
    const gx = K.calib, gy = Math.max(2, Math.round((K.calib * rows) / cols));
    const samples = new Float64Array(gx * gy);
    let top = -Infinity;
    for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
      const v = field((i + 0.5) / gx, ((j + 0.5) / gy) * (rows / cols));
      samples[j * gx + i] = v;
      if (v > top) top = v;
    }
    const sorted = Array.from(samples).sort((a, b) => a - b);
    const B = cov >= 0.999 ? -sorted[0] + 0.25 : -sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((1 - cov) * sorted.length)))];
    const deep = Math.max(1e-3, top + B); // the field's highest point above the edge

    // Cells: a seed in every S x S square (pixels), circling its home in the animation
    const Sz = Math.max(4, Math.round(p.cell));
    const a0 = Math.floor(c0 / Sz) - 2, a1 = Math.floor((c1 - 1) / Sz) + 2, b0 = Math.floor(r0 / Sz) - 2, b1 = Math.floor((r1 - 1) / Sz) + 2;
    const na = a1 - a0 + 1, nb = b1 - b0 + 1;
    const sxs = new Float64Array(na * nb), sys = new Float64Array(na * nb);
    const wob = K.wobble * am * Sz;
    for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) {
      const k = (b - b0) * na + (a - a0);
      const ph = 2 * Math.PI * hash(seed, a, b, 0xc31);
      sxs[k] = (a + 0.5 + (2 * hash(seed, a, b, 0xc11) - 1) * K.jitter) * Sz + wob * (Math.cos(th + ph) - Math.cos(ph));
      sys[k] = (b + 0.5 + (2 * hash(seed, a, b, 0xc21) - 1) * K.jitter) * Sz + wob * (Math.sin(th + ph) - Math.sin(ph));
    }
    // per cell (lazily): its level in the cluster, family, shades and pattern
    const m = Math.max(1, n - 1), [fa, fb] = split(m);
    const mixShare = clamp01(p.mix / 100), depthW = clamp01(p.depth / 100), plain = clamp01(p.plain / 100);
    const kinds = Math.max(1, Math.min(KINDS.length, Math.round(p.kinds)));
    const P0 = lerp(K.period[0], K.period[1], clamp01(p.psize / 100));
    const turns = Math.round(K.turns * am);
    const cellLevel = new Float64Array(na * nb).fill(NaN);
    const cellBase = new Int16Array(na * nb).fill(-1), cellInk = new Int16Array(na * nb), cellKind = new Int8Array(na * nb), cellP = new Int8Array(na * nb), cellW = new Int8Array(na * nb), cellO = new Int16Array(na * nb);
    const cellA = new Float64Array(na * nb);
    let shown = 0;
    const cell = (k, a, b) => {
      if (!Number.isNaN(cellLevel[k])) return;
      const X = (sxs[k] / cols), Y = (sys[k] / cols);
      const lv = field(X, Y) + B;
      cellLevel[k] = lv;
      // family: the second one where the families' field is low enough
      const hv = Phi(NH.fbm4(X * K.hueF + P.hx, Y * K.hueF + P.hy, P.z + dz, P.w + dw, 2, 0.5) / 0.22);
      const second = fb > 0 && hv < mixShare;
      const T = second ? fb : fa, first = second ? 1 + fa : 1;
      // shade: deeper toward the middle (with a shade field of its own), or at random (Depth 0)
      const sv = Phi(NH.noise4(X * K.shadeF + P.sx, Y * K.shadeF + P.sy, P.z + 5.1 + dz, P.w + dw) / 0.3);
      const dv = depthW * ((1 - K.shadeW) * clamp01(lv / deep) + K.shadeW * sv) + (1 - depthW) * hash(seed, a, b, 0xc41);
      const tier = Math.max(0, Math.min(T - 1, Math.floor((1 - dv) * T + (hash(seed, a, b, 0xc51) - 0.5) * 0.7)));
      let base = first + tier, ink;
      if (T === 1) ink = 0;
      else if (tier === 0) ink = first + 1;
      else ink = first + Math.max(0, tier - 1 - (tier === T - 1 && T >= 4 && hash(seed, a, b, 0xc61) < 0.5 ? 1 : 0));
      // the outermost cells: some keep only their pattern, on the ground
      if (T >= 3 && tier === T - 1 && hash(seed, a, b, 0xc71) < K.hollow) base = 0;
      cellBase[k] = base;
      cellInk[k] = ink;
      // pattern: a kind among the variation's first ones, or plain
      const solid = base !== 0 && hash(seed, a, b, 0xc81) < plain;
      let kind = solid ? -1 : P.order[Math.floor(hash(seed, a, b, 0xc91) * kinds)];
      let per = Math.max(2, Math.round(P0 + (hash(seed, a, b, 0xca1) - 0.5) * 2.2));
      if (kind >= 0 && NEEDS3.has(kind)) per = Math.max(3, per);
      cellKind[k] = kind;
      cellP[k] = per;
      cellW[k] = Math.max(1, Math.round(per * (hash(seed, a, b, 0xcb1) < 0.5 ? 0.34 : 0.5)));
      // movement: a whole number of periods round the loop, one way or the other (some hold still); every
      // cell steps on its own beat, so the patterns never all jump on the same frame
      const dir = hash(seed, a, b, 0xcc1) < 0.5 ? -1 : 1, moves = hash(seed, a, b, 0xcd1) < 0.7 ? 1 : 0;
      const steps = turns * repeat(kind, per) * moves, beat = hash(seed, a, b, 0xce1);
      cellO[k] = kind >= 0 ? (Math.floor((tt + beat) * steps) - Math.floor(beat * steps)) * dir : 0;
      cellA[k] = tt * turns * moves * dir; // the spiral's turns
    };

    // pixels
    const out = new Uint8Array(nc * nr);
    const gap = K.gap * clamp01(p.gap / 100), cut = gap + K.corner * clamp01(p.corners / 100) * Sz;
    const fray = clamp01(p.fray / 100), fw = K.fray * fray, fn = K.frayN * fray;
    const margin = 0.35; // only cells this near the edge look at the field pixel by pixel
    for (let r = r0; r < r1; r++) {
      const y = r + 0.5, bq = Math.floor(y / Sz);
      for (let c = c0; c < c1; c++) {
        const x = c + 0.5, aq = Math.floor(x / Sz);
        // the three nearest seeds
        let d1 = Infinity, d2 = Infinity, d3 = Infinity, k1 = -1, A1 = 0, B1 = 0;
        for (let b = bq - 2; b <= bq + 2; b++) {
          const row = (b - b0) * na;
          for (let a = aq - 2; a <= aq + 2; a++) {
            const k = row + (a - a0);
            const ddx = x - sxs[k], ddy = y - sys[k], d = ddx * ddx + ddy * ddy;
            if (d < d1) { d3 = d2; d2 = d1; d1 = d; k1 = k; A1 = a; B1 = b; } else if (d < d2) { d3 = d2; d2 = d; } else if (d < d3) d3 = d;
          }
        }
        d1 = Math.sqrt(d1); d2 = Math.sqrt(d2); d3 = Math.sqrt(d3);
        if (d2 - d1 < gap || d3 - d1 < cut) continue; // the lanes and the cut corners
        cell(k1, A1, B1);
        let lv = cellLevel[k1];
        if (fray > 0 && Math.abs(lv) < margin) { // near the edge: the field cuts the cell
          const X = x / cols, Y = y / cols;
          lv = (1 - fw) * lv + fw * (field(X, Y) + B) + fn * NH.noise4(X * K.frayF * P.F + 31.7, Y * K.frayF * P.F - 12.9, P.z + dz, P.w + dw);
        }
        if (!(lv > 0)) continue;
        const kind = cellKind[k1];
        const ix = Math.floor(x - sxs[k1]), iy = Math.floor(y - sys[k1]);
        const on = kind >= 0 && inPattern(kind, ix, iy, cellP[k1], cellW[k1], cellO[k1], cellA[k1]);
        const ci = on ? cellInk[k1] : cellBase[k1];
        if (ci > 0) out[(r - r0) * nc + (c - c0)] = ci;
      }
    }
    for (let k = 0; k < na * nb; k++) if (cellLevel[k] > 0) shown++;
    return { cols, rows, out, c0, c1, r0, r1, shown, P };
  }

  /* ---- build ------------------------------------------------------------------------ */
  function build({ W, H, aspect, seed, p, colors, t = 0, anim, region }) {
    const n = colors.length;
    const { cols, rows, out, c0, c1, r0, r1, shown } = pixels(W, H, seed, p, n, t, anim ? anim.amount : 0, aspect, region);
    const nc = c1 - c0;
    const scene = new PL.Scene(W, H, colors[0], 0);
    const names = roles(n);
    const layers = [];
    const layerFor = (ci) => layers[ci] || (layers[ci] = scene.layer('ink-' + ci, colors[ci], names[ci], ci));
    // pixels snap to the output's whole pixels: zs of them to a frame pixel (zoomed in by General's Size, more)
    const zs = region && region.z > 1 ? region.z : 1;
    const X = (c) => Math.round(((c * W) / cols) * zs) / zs, Y = (r) => Math.round(((r * H) / rows) * zs) / zs;
    for (let y = r0; y < r1; y++) {
      const y0 = Y(y), y1 = Y(y + 1), row = (y - r0) * nc - c0;
      let x = c0;
      while (x < c1) {
        const ci = out[row + x];
        let e = x + 1;
        while (e < c1 && out[row + e] === ci) e++;
        if (ci > 0) PL.Scene.rect(layerFor(ci), X(x), y0, X(e) - X(x), y1 - y0);
        x = e;
      }
    }
    scene.layers = scene.layers.filter((L) => L.r.length).sort((a, b) => a.ci - b.ci);
    scene.status = `${cols} × ${rows} pixels · ${shown} cells`;
    return scene;
  }

  PL.tools.register({
    id: 'cobble',
    name: 'Cobble',
    kind: 'Pixel & glyphs',
    tagline: 'Patterned pixel cobbles',
    about: 'A lumpy cluster of rounded pixel cells, each filled with a pattern of its own (stripes, grids, checks, dots, rings, spirals, bricks …) in two families of color that deepen toward the middle. Coverage sets how much of the frame it fills. In the animation the cluster breathes and the patterns move.',
    inks: {
      min: 3, max: 12, roles, fit, spec, add, generate,
      span: () => 2, // Invert swaps the ground and the first ink
      rotateFrom: 1, // Rotate keeps the ground
      hint: 'Ground first, then the inks: with four or more, the first half is one family and the second half another (A and B), each from the middle of the cluster (1) to its edge. Every cell is filled with its shade and patterned with a neighbouring one.',
    },
    palettes: PALETTES,
    params: PARAMS,
    animLabel: 'Amount',
    animHint: 'How much the cluster breathes, the cells shift and the patterns move (0: still)',
    defaults: {
      palette: 'Ember', // the preset the style opens on (its card's colors)
      anim: { amount: 0.6, fps: 12, frames: 72 },
      fx: {},
    },
    build,
    zoom: true, // draws any region of its world (General's Rotation and Size)
    _K: K,
    _pixels: pixels,
    _setup: setup,
    _kinds: KINDS,
  });
})();
