/* ==========================================================================
   tools/prism.js — Prism: pixel aurora.

   1. Grid: Pixels square cells across the frame's width (rows follow the
      frame's shape). Everything is drawn in whole cells, with a fine grid of
      dots at the cell centres on top (Dot grid).
   2. Streams: broad arms fan out from a source (usually near an edge, now
      and then further in), one arm per stream, each running Reach of the way
      across the frame, bending and meandering, a little narrower at its tip,
      with wavy edges. Where a stream runs the cells glow: a white core, then
      the fringe (warm inks next to the core, then hot pinks, blues and deep
      indigo), then the black ground. Where arms run close their glows add up,
      so the gap between them fills with fringe.
   3. Fringe sets how far the glow spreads: the core and every fringe band
      widen with it, so a high Fringe floods the frame and a low one keeps the
      streams thin and crisp. Sizes go by the frame's short side.
   4. Every cell carries its own fixed random offset, so the bands break up
      into scattered pixels, and its own tint (a touch darker); now and then a
      cell out in the ground lights up too. Within a band the inks gather in
      patches that follow a slow noise, with a few strays.
   5. Animation: each cell's glow swings up and down once per loop, every
      cell at its own timing, so pixels shimmer across the band edges (never
      more than two bands either way). The loop starts calm, close to the still
      image, and stirs up mid-way. The streams hold still. Seamless; Intensity
      sets the swing.
   ========================================================================== */
(() => {
  const { hash } = PL.rng;

  // Ground, core, then the fringe inks from the core outwards. The default look's colors first.
  const SPECTRUM = ['#FFE800', '#FFC400', '#FF9E00', '#FF3B00', '#FF2D55', '#FF00A8', '#E600D8', '#00C8FF', '#2E7CFF', '#6A2BD9', '#0038FF', '#2B0FA8', '#3A1ED8', '#5A0FB0'];
  const PALETTES = [
    { name: 'Aurora', colors: ['#08080A', '#FFFFFF', ...SPECTRUM] },
    { name: 'Ember', colors: ['#0B0605', '#FFF6E8', '#FFD166', '#FFB703', '#FB8500', '#F94144', '#E5383B', '#C9184A', '#9D0208', '#6A040F', '#370617'] },
    { name: 'Glacier', colors: ['#050A12', '#F2FBFF', '#C8F7FF', '#7FE7FF', '#3FC1FF', '#2E7CFF', '#2F4CDF', '#3A2BC0', '#3B1E92', '#2A0F5E'] },
    { name: 'Toxic', colors: ['#070B05', '#F7FFE8', '#E9FF70', '#B6FF3B', '#6EF06A', '#2EE6A8', '#00C2D1', '#1478D4', '#2C3FB0', '#311D80'] },
    { name: 'Candy', colors: ['#0D0612', '#FFF4FB', '#FFE5A3', '#FFC2D1', '#FF8FC2', '#FF4DA6', '#D63AF9', '#9B5CFF', '#5B6CFF', '#2F3BB8'] },
    { name: 'Sunprint', colors: ['#F4EEE4', '#0D153F', '#2735A6', '#0077CC', '#09B7DC', '#74E2C6', '#EBE696'] }, // on paper: a deep 270 core, then out through 270, 250, 220 and 175 to a pale 105
    { name: 'Lagoon', colors: ['#03100F', '#F2FFF9', '#D7FFE9', '#9DF7D2', '#5FE6C1', '#26C6B4', '#1398A8', '#156E96', '#1D4A7E', '#1C2B5E'] },
    { name: 'Gold', colors: ['#0A0805', '#FFFDF2', '#FFF1B8', '#FFE07A', '#FFC94A', '#F2A93B', '#D98A2B', '#A86A26', '#6E4A21', '#3D2A16'] },
    { name: 'Mono', colors: ['#08080A', '#FFFFFF', '#D9D9D9', '#A6A6A6', '#737373', '#4D4D4D', '#2E2E2E'] },
    { name: 'Dusk', colors: ['#040411', '#FFF8EA', '#FACF9E', '#FB906A', '#DE5388', '#853397', '#361B73'] }, // a sunset: a cream core, then 70, 40, 0, 320 and 290 down into the night
  ];

  /* ---- color roles: ground, core, fringe inks (core outwards) ----------------------- */
  const roles = (n) => ['Ground', 'Core', ...Array.from({ length: n - 2 }, (_, i) => (n === 3 ? 'Fringe' : 'Fringe ' + (i + 1)))];
  const spec = (n) => ({ ramp: Math.max(1, n - 2), accents: 0 });
  const isLight = (hex) => PL.color.luminance(hex) > 0.35;

  // The fringe has four bands; the inks are shared out between them in order, the
  // middle bands taking the extra ones (14 inks: 3, 4, 4, 3).
  const BANDS = 4;
  function bandInks(m) {
    const g = Math.min(BANDS, m);
    const cut = (k) => (k * 2 < g ? Math.floor((k * m) / g) : k * 2 > g ? Math.ceil((k * m) / g) : Math.round((k * m) / g));
    const out = [];
    for (let k = 0; k < g; k++) out.push(Array.from({ length: cut(k + 1) - cut(k) }, (_, i) => cut(k) + i));
    // fewer inks than bands: the outer bands share the last inks
    while (out.length < BANDS) out.push(out[out.length - 1]);
    return out;
  }

  // The most vivid lightness for each hue (where the sRGB gamut reaches furthest out in
  // OKLCh), in 10-degree steps, worked out once.
  let CUSP = null;
  function cuspL(h) {
    if (!CUSP) {
      CUSP = [];
      for (let k = 0; k < 36; k++) {
        let bl = 0.6, bc = -1;
        for (let L = 0.3; L <= 0.985; L += 0.015) { const c = PL.color.hexToLch(PL.color.lch(L, 0.4, k * 10))[1]; if (c > bc) { bc = c; bl = L; } }
        CUSP.push(bl);
      }
    }
    const x = (((h % 360) + 360) % 360) / 10, i = Math.floor(x) % 36, f = x - Math.floor(x);
    return CUSP[i] * (1 - f) + CUSP[(i + 1) % 36] * f;
  }

  // "New colors": a near-black ground (now and then a pale one) and a near-white core, then a
  // fringe of vivid inks whose hues run round the wheel from a light hue (yellow, cyan, green)
  // towards the deep ones, each as rich as it can be, getting darker from the core outwards.
  function generate(n, rng) {
    const C = PL.color;
    const m = Math.max(1, n - 2);
    const pale = rng.chance(0.12);
    const paths = [[100, -1, 160, 230], [90, -1, 130, 190], [200, 1, 110, 160], [150, 1, 120, 170], [70, -1, 110, 170]];
    const [hs, dir, s0, s1] = rng.pick(paths);
    const h0 = hs + rng.float(-10, 10), sweep = rng.float(s0, s1), tint = rng.float(0, 360);
    const out = pale
      ? [C.lch(rng.float(0.93, 0.97), rng.float(0.005, 0.025), tint), C.lch(rng.float(0.13, 0.2), rng.float(0.01, 0.04), tint)]
      : [C.lch(rng.float(0.08, 0.14), rng.float(0, 0.025), tint), C.lch(rng.float(0.97, 1), rng.float(0, 0.02), tint)];
    for (let i = 0; i < m; i++) {
      const k = m === 1 ? 0.5 : i / (m - 1);
      const kk = pale ? 1 - k : k; // on a pale ground the fringe runs deep (by the core) to light (by the ground)
      const h = h0 + dir * sweep * kk;
      const L = Math.min(cuspL(h), 0.96 - 0.5 * kk ** 1.15) + rng.float(-0.02, 0.02);
      out.push(C.lch(L, 0.4, h));
    }
    return out;
  }

  // + adds a fringe ink (outermost) in a hue the fringe doesn't have yet, bright enough to read.
  function add(colors) {
    const C = PL.color;
    const c = colors.slice();
    const hues = c.slice(2).filter((x) => C.hexToLch(x)[1] > 0.04).map((x) => C.hexToLch(x)[2]);
    let best = 0, bd = -1;
    for (let h = 0; h < 360; h += 10) {
      const d = hues.length ? Math.min(...hues.map((x) => Math.abs((((h - x) % 360) + 540) % 360 - 180))) : 180;
      if (d > bd) { bd = d; best = h; }
    }
    c.push(C.lch(isLight(c[0]) ? 0.58 : 0.7, 0.19, best));
    return c;
  }

  function fit(colors, n) {
    let c = (colors || []).map(PL.color.normHex).filter(Boolean);
    if (!c.length) c = PALETTES[0].colors.slice();
    if (c.length === 1) c.push(PL.color.mix(c[0], isLight(c[0]) ? '#000000' : '#FFFFFF', 0.92));
    if (c.length === 2) c.push(PL.color.lch(0.7, 0.2, PL.color.hexToLch(c[1])[2] + 40));
    if (c.length === n) return c;
    if (c.length > n) {
      // keep the ground and the core; take the fringe inks evenly from the ones given
      const f = c.slice(2), m = n - 2;
      return [c[0], c[1], ...Array.from({ length: m }, (_, i) => f[Math.round((i * (f.length - 1)) / Math.max(1, m - 1))])];
    }
    while (c.length < n) c = add(c);
    return c;
  }

  const S = (section, key, label, min, max, def, extra = {}) => ({ section, key, label, type: 'range', min, max, def, step: 1, ...extra });
  const PARAMS = [
    S('Artwork', 'pixels', 'Pixels', 24, 72, 52, { step: 2, rand: [38, 70], hint: 'Cells across the frame' }),
    S('Artwork', 'streams', 'Streams', 1, 5, 2, { rand: [2, 4], hint: 'How many streams fan out from the source' }),
    S('Artwork', 'reach', 'Reach', 30, 85, 75, { unit: '%', rand: [45, 75], hint: 'How far the streams run across the frame' }),
    S('Artwork', 'fringe', 'Fringe', 50, 160, 81, { unit: '%', rand: [75, 125], hint: 'How far the glow spreads round each stream' }),
    S('Artwork', 'dotgrid', 'Dot grid', 0, 100, 55, { unit: '%', rand: false, hint: 'Brightness of the dots at the cell centres' }),
  ];

  // Constants. Lengths in units of the frame's short side.
  const K = {
    unit: 0.047,        // one fringe band is this wide at Fringe 100 %
    core: 2.4,          // a stream's core reaches this many band widths from its centre line (at its base)
    taper: 0.3,         // ... narrowing to (1 - taper) of that at the tip
    bands: [1, 1, 0.7, 0.35], // widths of the four fringe bands, core outwards (the ground fades like the last)
    scatter: 0.68,      // each cell's fixed offset (sd, in bands)
    scatterCorr: 0.35,  // ... part of it shared with neighbouring cells
    spark: 0.35, sparkL: 1.4, // stray lit cells out in the ground: chance by the glow's edge, and how far out they reach (band widths)
    swing: 1.05,        // animation: each cell swings this many bands either way at Intensity 1 ...
    still: 0.65,        // ... mostly about its place in the still frame, so the loop starts calm and stirs up mid-way
    tint: 0.06,         // cells are up to this much darker
    tints: 5,           // ... in this many steps
    hueF: 2.0,          // ink patches: noise cycles per short side
    inkJit: 0.28,       // ... and how much each cell strays from its patch
    blend: 1.2,         // where streams meet their glows add up (soft minimum, in band widths)
    warpA: 0.035, warpF: 2.6, // wavy stream edges: displacement and noise frequency
    lenK: [0.85, 1.3],  // arm length: Reach x frame diagonal x this range
    sep: 0.95,          // arms keep at least this far apart (radians) where they can
    fan: [3.6, 4.8], fanPad: 0.06, // a source by an edge fans its arms over this much (radians), not quite to the ends
    bendK: 0.9,         // arms bend steadily up to this much per unit length (radians) ...
    meander: 1.6, meanderF: 1.2, // ... and meander: turn rate (sd, radians per unit length) and how often it changes
    widthK: [0.8, 1.2], // streams differ in width by this range
    edgeP: 0.85, edgeD: [0.03, 0.28], // chance the source sits near an edge, and how far in from it
    dot: 0.07, dotA: 0.8, // dot size (x cell) and opacity at Dot grid 100 %
  };

  /* ---- geometry --------------------------------------------------------------------- */
  // Grid of whole cells: Pixels across the width.
  // The rows go by the frame's exact shape (aspect, from the app), so the preview has the export's rows.
  function grid(W, H, p, aspect) {
    const cols = Math.max(2, Math.round(p.pixels));
    const cw = W / cols, rows = Math.max(2, aspect > 0 ? Math.floor(cols / aspect + 0.5 + 1e-6) : Math.round(H / cw));
    return { cols, rows, cw, ch: H / rows };
  }

  // The streams for a seed and frame shape: a source, and from it one arm per stream, fanning
  // out (into the frame when the source sits by an edge, all round when it is further in).
  // Each arm bends and meanders as it runs on. An arm is a centre line (a polyline in width
  // units: the frame is 1 wide and A tall) with its core radius at each point (band widths).
  function streams(seed, A, p) {
    const r = PL.rng.create((seed ^ 0x6d2b79f5) >>> 0);
    const Sn = Math.max(1, Math.min(5, Math.round(p.streams)));
    const TAU = Math.PI * 2;
    let sx, sy, centre, arc;
    if (r.next() < K.edgeP) {
      const e = Math.floor(r.next() * 4), t = r.float(0.1, 0.9), d = r.float(K.edgeD[0], K.edgeD[1]);
      [sx, sy, centre] = e === 0 ? [t, d, Math.PI / 2] : e === 1 ? [1 - d, t, Math.PI] : e === 2 ? [t, 1 - d, -Math.PI / 2] : [d, t, 0];
      centre += r.float(-0.3, 0.3);
      arc = r.float(K.fan[0], K.fan[1]);
    } else { sx = r.float(0.2, 0.8); sy = r.float(0.2, 0.8); centre = r.float(0, TAU); arc = TAU; }
    const full = arc >= TAU - 1e-9;
    const diag = Math.hypot(1, A), m = Math.min(1, A); // m: the frame's short side (width units)
    const NM = PL.noise.get((seed ^ 0x3c6ef372) >>> 0);
    // arms one after another at random angles in the fan, each kept clear of the earlier ones
    // where it can be (so adding a stream keeps the others where they were)
    const rel = [];
    const rays = [];
    const apart = (o) => (rel.length ? Math.min(...rel.map((x) => { const d = Math.abs(o - x) % TAU; return Math.min(d, TAU - d); })) : TAU);
    for (let k = 0; k < 5; k++) {
      let o = 0, od = -1; // offset from the fan's start
      for (let tries = 0; tries < 12; tries++) {
        const c = r.float(K.fanPad, 1 - K.fanPad) * arc, d = apart(c);
        if (d > od) { o = c; od = d; }
        if (d >= K.sep) break;
      }
      rel.push(o);
      const len = (p.reach / 100) * diag * r.float(K.lenK[0], K.lenK[1]);
      const c1 = r.float(-K.bendK, K.bendK), off = r.float(0, 97);
      const width = r.float(K.widthK[0], K.widthK[1]);
      if (k >= Sn) continue;
      // the arm sets off at its fan angle (taken in the frame's own proportions, so the fan
      // stretches with the frame), then turns as it runs on: a steady bend plus a slow meander
      const a = centre - arc / 2 + o;
      const steps = Math.max(12, Math.ceil(len / 0.035)), ds = len / steps;
      let x = sx, y = sy * A, h = Math.atan2(Math.sin(a) * A, Math.cos(a));
      const pts = [x, y], rad = [K.core * width];
      for (let i = 1; i <= steps; i++) {
        const s = (i - 0.5) * ds, u = i / steps;
        h += (c1 + K.meander * NM.noise4(off + (s / m) * K.meanderF, off * 0.37, 0.5, 0.5) / 0.295) * (ds / m);
        x += Math.cos(h) * ds; y += Math.sin(h) * ds;
        pts.push(x, y); rad.push(K.core * width * (1 - K.taper * u * u));
      }
      rays.push({ pts, rad });
    }
    return { rays, source: [sx, sy * A] };
  }

  /* ---- the field: each cell's fixed glow level q, in bands ---------------------------
     q < 0: core; 0..4: the four fringe bands; >= 4: ground. Distance past the core edge
     maps to q piecewise (the outer bands are narrower), then each cell gets its own fixed
     offset. Cached per seed / settings.                                                   */
  // R (General's Rotation and Size): the part of the world to cover; the grid runs on past the frame, the
  // streams are where they are, and the dark ground with its dot grid carries on round them.
  const cache = new Map();
  function span(g, W, H, R) {
    const { cols, rows } = g;
    if (!R) return { c0: 0, c1: cols, r0: 0, r1: rows };
    return { c0: Math.floor((R.x0 * cols) / W), c1: Math.ceil((R.x1 * cols) / W), r0: Math.floor((R.y0 * rows) / H), r1: Math.ceil((R.y1 * rows) / H) };
  }
  function field(W, H, seed, p, aspect, R) {
    const g = grid(W, H, p, aspect), A = H / W;
    const sp = span(g, W, H, R);
    const key = [seed, g.cols, g.rows, A.toFixed(5), p.streams, p.reach, p.fringe, sp.c0, sp.c1, sp.r0, sp.r1, ...Object.values(K).flat()].join('|');
    const hit = cache.get(key);
    if (hit) return hit;
    const { cols, rows } = g, nc = sp.c1 - sp.c0, n = nc * (sp.r1 - sp.r0);
    const { rays } = streams(seed, A, p);
    const NW = PL.noise.get((seed ^ 0x2545f491) >>> 0), NS = PL.noise.get((seed ^ 0x9e3779b9) >>> 0);
    // Fringe scales the whole glow (the core and the bands); sizes go by the frame's short side
    const m = Math.min(1, A), unit = K.unit * (p.fringe / 100) * m;
    const B = [0]; for (const w of K.bands) B.push(B[B.length - 1] + w);
    const toBands = (x) => {
      // x: distance past the core edge, in band widths -> q
      if (x < 0) return x / K.bands[0];
      for (let k = 0; k < 4; k++) if (x < B[k + 1]) return k + (x - B[k]) / K.bands[k];
      return 4 + (x - B[4]) / K.bands[3];
    };
    const Q = new Float32Array(n);
    // scatter: a per-cell value plus a little shared with neighbours (a smooth noise at cell scale)
    const gs = (i, j, s) => { const a = hash(i, j, seed, s), b = hash(i, j, seed, s + 1), c = hash(i, j, seed, s + 2); return (a + b + c - 1.5) * 2; };
    const sc = K.scatter / Math.hypot(1, K.scatterCorr);
    const D = new Float64Array(rays.length);
    for (let j = sp.r0; j < sp.r1; j++) {
      for (let i = sp.c0; i < sp.c1; i++) {
        let x = (i + 0.5) / cols, y = ((j + 0.5) / rows) * A;
        // wavy edges: move the sample point a little
        x += K.warpA * m * NW.noise4((x / m) * K.warpF + 5.3, (y / m) * K.warpF - 2.1, 0.7, 0.3);
        y += K.warpA * m * NW.noise4((x / m) * K.warpF - 8.9, (y / m) * K.warpF + 4.4, 2.3, 1.9);
        // distance past each stream's core edge, in band widths; where streams run close
        // together their glows add up (a soft minimum), so the gaps between them fill in
        for (let r = 0; r < rays.length; r++) {
          const P = rays[r].pts, R = rays[r].rad;
          let v = Infinity;
          for (let s = 0, m = 0; s + 3 < P.length; s += 2, m++) {
            const ax = P[s], ay = P[s + 1], bx = P[s + 2] - ax, by = P[s + 3] - ay;
            const t = Math.max(0, Math.min(1, ((x - ax) * bx + (y - ay) * by) / (bx * bx + by * by || 1)));
            const ex = x - ax - bx * t, ey = y - ay - by * t;
            const e = Math.sqrt(ex * ex + ey * ey) / unit - (R[m] + (R[m + 1] - R[m]) * t);
            if (e < v) v = e;
          }
          D[r] = v;
        }
        let best = Infinity;
        for (let r = 0; r < rays.length; r++) if (D[r] < best) best = D[r];
        if (rays.length > 1) {
          let sum = 0;
          for (let r = 0; r < rays.length; r++) sum += Math.exp(-(D[r] - best) / K.blend);
          best -= K.blend * Math.log(sum);
        }
        const shared = NS.noise4(i * 0.62 + 3.7, j * 0.62 - 1.9, 0.5, 0.5) * 4.2; // ~unit sd at the cell scale
        let q = toBands(best) + sc * (gs(i, j, 11) + K.scatterCorr * shared);
        // sparks: now and then a cell out in the ground near a stream lights up in a fringe colour
        if (best > B[4] && hash(i, j, seed, 0x5a7) < K.spark * Math.exp(-(((best - B[4]) / K.sparkL) ** 2))) {
          const u = hash(i, j, seed, 0x5a8);
          q = 4 - 2 * u * u; // the outer bands (never bright enough to flash white)
        }
        Q[(j - sp.r0) * nc + (i - sp.c0)] = q;
      }
    }
    const out = { Q, g, sp };
    if (cache.size > 12) cache.delete(cache.keys().next().value);
    cache.set(key, out);
    return out;
  }

  // Per cell: band index for a frame (0 core, 1..4 fringe, 5 ground). In the animation each
  // cell's level swings once a loop, at its own timing.
  function tiers(W, H, seed, p, t, amt, aspect, R) {
    const { Q, g, sp } = field(W, H, seed, p, aspect, R);
    const { cols, rows } = g, nc = sp.c1 - sp.c0, n = Q.length;
    const T = new Uint8Array(n);
    const sw = K.swing * Math.max(0, amt || 0), tt = ((t % 1) + 1) % 1;
    for (let k = 0; k < n; k++) {
      let q = Q[k];
      if (sw > 0) {
        // each cell's own timing (cells past the frame: by their place, so none share one)
        const i = sp.c0 + (k % nc), j = sp.r0 + Math.floor(k / nc), inside = i >= 0 && i < cols && j >= 0 && j < rows;
        const ph = 2 * Math.PI * (inside ? hash(j * cols + i, seed, 0x51, 0x7e) : hash(i, j, seed, 0x517e));
        q += sw * (Math.sin(2 * Math.PI * tt + ph) - K.still * Math.sin(ph));
      }
      T[k] = q < 0 ? 0 : q < 4 ? 1 + Math.floor(q) : 5;
    }
    return { T, g, sp };
  }

  /* ---- build ------------------------------------------------------------------------ */
  function build({ W, H, aspect, seed, p, colors, t = 0, anim, region }) {
    const n = colors.length;
    const scene = new PL.Scene(W, H, colors[0], 0);
    const { T, g, sp } = tiers(W, H, seed, p, t, anim ? anim.amount : 0, aspect, region);
    const { cols, rows, cw } = g, nc = sp.c1 - sp.c0;
    const m = Math.max(1, n - 2);
    const bands = bandInks(m);
    const NH = PL.noise.get((seed ^ 0x68e31da4) >>> 0), hm = Math.min(1, H / W);
    // layers: core, then fringe inks, each in a few tints; dots on top
    const C = PL.color;
    const tintOf = (hex, k) => (k === 0 ? hex : C.mix(hex, '#000000', (K.tint * k) / (K.tints - 1)));
    const layers = new Map();
    const layer = (ci, k) => {
      const key = ci * 16 + k;
      let L = layers.get(key);
      if (!L) {
        const name = (ci === 1 ? 'Core' : m === 1 ? 'Fringe' : 'Fringe ' + (ci - 1)) + (k ? ' · ' + (k + 1) : '');
        L = scene.layer('c' + ci + '-' + k, tintOf(colors[ci], k), name, k ? undefined : ci);
        layers.set(key, L);
      }
      return L;
    };
    // create the layers in drawing order: core first, then fringe inks core outwards
    for (let ci = 1; ci < n; ci++) for (let k = 0; k < K.tints; k++) layer(ci, k);
    // cells snap to the output's whole pixels: zs of them to a frame pixel (zoomed in by General's Size, more)
    const zs = region && region.z > 1 ? region.z : 1, snap = (v) => Math.round(v * zs) / zs;
    let lit = 0;
    for (let j = sp.r0; j < sp.r1; j++) {
      const y0 = snap((j * H) / rows), y1 = snap(((j + 1) * H) / rows);
      for (let i = sp.c0; i < sp.c1; i++) {
        const b = T[(j - sp.r0) * nc + (i - sp.c0)];
        if (b === 5) continue;
        let ci;
        if (b === 0) ci = 1;
        else {
          const inks = bands[b - 1];
          if (inks.length === 1) ci = 2 + inks[0];
          else {
            // patches: a slow noise, a different one per band, split into the band's inks
            // (the noise, plus a little of each cell's own, spread evenly over the inks)
            const v = NH.noise4(((i + 0.5) / cols / hm) * K.hueF + b * 7.31, ((j + 0.5) / cols / hm) * K.hueF - b * 3.17, b * 1.7, 0.4);
            const z = (v / 0.295 + K.inkJit * 3.46 * (hash(i, j, seed, 0x4b1d + b) - 0.5)) / Math.hypot(1, K.inkJit);
            const u = Math.min(0.999, 1 / (1 + Math.exp(-1.702 * z)));
            ci = 2 + inks[Math.floor(u * inks.length)];
          }
        }
        const k = Math.min(K.tints - 1, Math.floor(hash(i, j, seed, 0x7171) * K.tints));
        const x0 = snap((i * W) / cols), x1 = snap(((i + 1) * W) / cols);
        PL.Scene.rect(layer(ci, k), x0, y0, x1 - x0, y1 - y0);
        lit++;
      }
    }
    // the dot grid
    const dg = Math.max(0, Math.min(100, p.dotgrid)) / 100;
    if (dg > 0) {
      const D = scene.layer('dots', colors[1], 'Dot grid', 1, K.dotA * dg);
      const s = Math.max(1 / zs, K.dot * cw); // at least a whole (output) pixel
      for (let j = sp.r0; j < sp.r1; j++) {
        const cy = ((j + 0.5) * H) / rows;
        for (let i = sp.c0; i < sp.c1; i++) {
          if (T[(j - sp.r0) * nc + (i - sp.c0)] === 0) continue; // invisible on the core anyway
          PL.Scene.rect(D, ((i + 0.5) * W) / cols - s / 2, cy - s / 2, s, s);
        }
      }
    }
    // drop empty layers so the SVG stays tidy
    scene.layers = scene.layers.filter((L) => L.r.length);
    scene.status = `${cols} × ${rows} pixels · ${lit.toLocaleString()} lit`;
    return scene;
  }

  PL.tools.register({
    id: 'prism',
    name: 'Prism',
    kind: 'Backgrounds',
    tagline: 'Pixel aurora',
    about: 'Chunky pixel streams fanning across a black dot-grid field: a white core with a rainbow fringe that breaks up into scattered pixels. In the animation every pixel shimmers across the band edges.',
    inks: {
      min: 3, max: 16, roles, fit, spec, add, generate,
      span: () => 2, // Invert swaps the ground and the core
      hint: 'Ground, then the core, then the fringe inks from the core outwards (shared out over four bands).',
    },
    palettes: PALETTES,
    params: PARAMS,
    recolorable: false, // tints are mixed from the inks, so a recolour rebuilds the scene
    animLabel: 'Intensity',
    animHint: 'How far each pixel swings across the band edges as it shimmers (0: still)',
    defaults: {
      anim: { amount: 0.8, fps: 8, frames: 12 },
      fx: {},
    },
    build,
    zoom: true, // draws any region of its world (General's Rotation and Size)
    _K: K,
    _clear: () => cache.clear(),
    _tiers: tiers,
    _field: field,
    _streams: streams,
    _bandInks: bandInks,
  });
})();
