/* ==========================================================================
   tools/warp.js — Warp: op-art patterns, bent.

   1. Pattern: a checkerboard of square cells (anchored at the frame's top-left
      corner), or slashes: diagonal stripes cut into bands across their length,
      each band slid along by its own random amount, so the stripes step at
      every band edge. Scale sets the cell (or stripe) size; every variation
      has its own base size, stripe angle, stripe weight and band length.
   2. Two colors: the base and one of the inks (each variation picks one, the
      first ink most often), and which of them is drawn on top of the other.
   3. Warp bends the pattern, one of three ways (Auto picks per variation):
        waves  - every point slides across by a sine of its height and up and
                 down by a sine of its position across;
        taper  - the columns fan out like a floor in perspective (the cells keep
                 their height, the width changes from top to bottom);
        pinch  - everything is pulled toward the centre: the screen radius goes
                 as a power of the pattern radius, so cells shrink into the middle.
      Warp sets how strongly. The shapes are true vector polygons: every side
      of a cell or stripe is cut into five straight steps and each step's ends
      are bent.
   4. Animation: the warp breathes. Its strength swings once per loop around
      the still level (Intensity x 0.55 either way, in step with the first wave),
      so the pattern bends further, eases back and bends
      again. Seamless; Intensity 0 holds everything still.
   ========================================================================== */
(() => {
  const { hash } = PL.rng;

  // Two colors each: the base and its ink (the default look uses Rust: defaults.palette). + adds inks for the variations to pick from.
  const PALETTES = [
    { name: 'Neon', colors: ['#0E0B0B', '#A5E8FC'] },
    { name: 'Acid', colors: ['#0C0E0A', '#D7FF3D'] },
    { name: 'Sunset', colors: ['#170A1C', '#FF8A3D'] },
    { name: 'Lagoon', colors: ['#06141A', '#3DF2E0'] },
    { name: 'Paper', colors: ['#F1ECE2', '#151515'] },
    { name: 'Rust', colors: ['#F0F5F0', '#D67523'] },
    { name: 'Candy', colors: ['#FFF4F8', '#FF4F9A'] },
    { name: 'Midnight', colors: ['#0A1030', '#7AA2FF'] },
    { name: 'Mono', colors: ['#0E0E0E', '#F2F2F2'] },
    { name: 'Duo', colors: ['#14213D', '#FCA311'] },
  ];

  /* ---- color roles ---------------------------------------------------------------- */
  const roles = (n) => ['Base', ...Array.from({ length: n - 1 }, (_, i) => (n === 2 ? 'Ink' : 'Ink ' + (i + 1)))];
  const spec = (n) => ({ ramp: 1, accents: Math.max(1, n - 1) });
  const isLight = (hex) => PL.color.luminance(hex) > 0.35;

  // "New colors": a near-black base and bright, saturated inks round the wheel (now and then
  // a pale base with deep inks).
  function generate(n, rng) {
    const C = PL.color;
    const pale = rng.chance(0.15);
    const h0 = rng.float(0, 360);
    const out = [pale ? C.lch(rng.float(0.94, 0.97), rng.float(0.01, 0.03), h0) : C.lch(rng.float(0.1, 0.15), rng.float(0, 0.02), h0)];
    const m = n - 1, step = 360 / Math.max(1, m), h1 = rng.float(0, 360);
    for (let i = 0; i < m; i++) {
      let h = h1 + i * step * rng.float(0.85, 1.1) + rng.float(-14, 14);
      if (pale && ((h % 360) + 360) % 360 > 55 && ((h % 360) + 360) % 360 < 120) h += 65; // no muddy olives on a pale base
      out.push(pale ? C.lch(rng.float(0.45, 0.6), rng.float(0.16, 0.23), h) : C.lch(rng.float(0.72, 0.9), rng.float(0.14, 0.24), h));
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
    c.push(isLight(c[0]) ? C.lch(0.52, 0.19, best) : C.lch(0.8, 0.19, best));
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
    { section: 'Artwork', key: 'style', label: 'Style', type: 'select', def: 'auto',
      options: [{ value: 'auto', label: 'Auto' }, { value: 'checker', label: 'Checker' }, { value: 'slash', label: 'Slash' }] },
    { section: 'Artwork', key: 'bend', label: 'Warp shape', type: 'select', def: 'auto',
      options: [{ value: 'auto', label: 'Auto' }, { value: 'waves', label: 'Waves' }, { value: 'taper', label: 'Taper' }, { value: 'pinch', label: 'Pinch' }] },
    S('Artwork', 'scale', 'Scale', 50, 200, 100, { unit: '%', rand: [75, 135], hint: 'Size of the cells or stripes' }),
    S('Artwork', 'warp', 'Warp', 0, 100, 70, { unit: '%', rand: [40, 90], hint: 'How strongly the pattern bends (0: flat)' }),
  ];

  // Constants. Lengths are shares of the frame's short side unless noted.
  const K = {
    cell: [0.1, 0.17],      // cell (or stripe pitch) at Scale 100 %: this range, per variation
    duty: [0.43, 0.6],      // slash: share of the pitch the drawn stripe takes
    band: [1.3, 5.5],       // slash: band length, x the pitch (log-uniform)
    tilt: 16,               // slash: stripe angle = a diagonal +/- this (degrees)
    inkW: [0.5, 0.27, 0.15, 0.08], // the chance of each ink (later ones share the last weight)
    kinds: [['waves', 0.4], ['taper', 0.35], ['pinch', 0.25]],
    // waves: x slides by a sine of y, y by a sine of x
    waveLen: [0.6, 1.15],   // wavelength of the across-sine (x the short side) ...
    waveRatio: [1.15, 1.35],// ... the other one this much longer
    slope: [0.5, 1.5],      // steepest slope of the across-sine at Warp 100 % (at Warp w: w x this)
    ampRatio: [0.45, 0.6],  // the up-and-down sine's amplitude, x the across one's
    // taper: x' = cx + (x - cx) (1 + k (y - cy) / (H / 2)), k = Warp x this (fanning out downwards mostly)
    taper: [0.2, 0.7], taperUp: 0.15, taperMin: 0.1,
    reach: 3.2,             // taper: the pattern runs this many cells past the frame's sides, so a strong taper
                            // opens a strip of plain ground in the top corners, like a horizon
    // pinch: screen radius = R (r / R)^e, e = 1 + Warp x this, R = half the diagonal x [0.95, 1.1]
    pinch: [0.75, 1.25],
    mod: 0.55,              // animation: the warp swings by Intensity x this either way
    sub: 5,                 // every side of a cell or stripe is bent in this many straight steps
  };

  const pickW = (table, u) => { let s = 0, tot = 0; for (const [, w] of table) tot += w; for (const [v, w] of table) { s += w / tot; if (u < s) return v; } return table[table.length - 1][0]; };
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---- per-variation settings (each from its own hash, so changing one setting never
     reshuffles the others: Style and Warp shape keep the same cells and bend) ---------- */
  function setup(W, H, seed, p, n) {
    const u = (k) => hash(seed, 0x57a9, k, 3);
    const Sd = Math.min(W, H);
    const style = p.style === 'checker' || p.style === 'slash' ? p.style : u(1) < 0.5 ? 'checker' : 'slash';
    const bend = p.bend === 'waves' || p.bend === 'taper' || p.bend === 'pinch' ? p.bend : pickW(K.kinds, u(2));
    const scale = Math.max(50, Math.min(200, p.scale)) / 100;
    const cell = Sd * lerp(K.cell[0], K.cell[1], u(3)) * scale;
    // colors: which ink, and which of the two is drawn on top
    const inks = Math.max(1, n - 1);
    const wts = Array.from({ length: inks }, (_, i) => [i + 1, K.inkW[Math.min(i, K.inkW.length - 1)]]);
    const ink = n > 1 ? pickW(wts, u(4)) : 0;
    const swap = u(5) < 0.5;
    // slash geometry
    const ang = ((u(6) < 0.5 ? 45 : -45) + lerp(-K.tilt, K.tilt, u(7))) * (Math.PI / 180);
    const duty = lerp(K.duty[0], K.duty[1], u(8));
    const band = cell * Math.exp(lerp(Math.log(K.band[0]), Math.log(K.band[1]), u(9)));
    const bandPhase = u(10);
    // warp settings (the strengths are multiplied by Warp and by the breathing in fwd())
    const lam1 = Sd * lerp(K.waveLen[0], K.waveLen[1], u(11)), lam2 = lam1 * lerp(K.waveRatio[0], K.waveRatio[1], u(12));
    const slope = lerp(K.slope[0], K.slope[1], u(13));
    const ax = (slope * lam1) / (2 * Math.PI), ay = ax * lerp(K.ampRatio[0], K.ampRatio[1], u(14));
    const ph1 = u(15) * 2 * Math.PI, ph2 = u(16) * 2 * Math.PI;
    const taperK = lerp(K.taper[0], K.taper[1], u(17)) * (u(18) < K.taperUp ? -1 : 1);
    const pinchK = lerp(K.pinch[0], K.pinch[1], u(19)), R = 0.5 * Math.hypot(W, H) * lerp(0.95, 1.1, u(20));
    const modPh = bend === 'waves' ? ph1 : u(21) * 2 * Math.PI; // the breathing keeps step with the first wave
    return { style, bend, cell, ink, swap, ang, duty, band, bandPhase, lam1, lam2, ax, ay, ph1, ph2, taperK, pinchK, R, modPh, Sd };
  }

  // The bend for one frame: forward map pattern -> screen, and a box in pattern space that is
  // sure to cover the frame (or, for General's Rotation and Size, region T of the world: the bends
  // carry on past the frame, so zooming out shows more of the same picture).
  function bender(W, H, P, warp, t, amount, T) {
    const w = Math.max(0, Math.min(100, warp)) / 100;
    const m = 1 + K.mod * Math.max(0, amount || 0) * Math.sin(2 * Math.PI * t + P.modPh);
    const cx = W / 2, cy = H / 2, pad = P.cell * 1.5;
    const X0 = T ? T.x0 : 0, X1 = T ? T.x1 : W, Y0 = T ? T.y0 : 0, Y1 = T ? T.y1 : H;
    if (w === 0 || m === 0) return { fwd: (x, y) => [x, y], box: [X0 - pad, X1 + pad, Y0 - pad, Y1 + pad], m };
    if (P.bend === 'waves') {
      const ax = P.ax * w * m, ay = P.ay * w * m, k1 = (2 * Math.PI) / P.lam1, k2 = (2 * Math.PI) / P.lam2;
      const e = Math.abs(ax) + Math.abs(ay) + pad;
      return { fwd: (x, y) => [x + ax * Math.sin(k1 * y + P.ph1), y + ay * Math.sin(k2 * x + P.ph2)], box: [X0 - e, X1 + e, Y0 - e, Y1 + e], m };
    }
    if (P.bend === 'taper') {
      const k = P.taperK * w * m;
      const f = (y) => Math.max(K.taperMin, 1 + (k * (y - cy)) / (H / 2));
      const half = W / 2 + K.reach * P.cell;
      return { fwd: (x, y) => [cx + (x - cx) * f(y), y], box: [cx - half, cx + half, Y0 - pad, Y1 + pad], m, fixed: true };
    }
    // pinch: pulled toward the centre
    const e = Math.max(0.35, 1 + P.pinchK * w * m), R = P.R;
    const far = T ? Math.max(...[[X0, Y0], [X1, Y0], [X0, Y1], [X1, Y1]].map(([x, y]) => Math.hypot(x - cx, y - cy))) : 0.5 * Math.hypot(W, H);
    const rmax = R * Math.pow((far + pad) / R, 1 / e) + pad;
    return {
      fwd: (x, y) => {
        const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy);
        if (r < 1e-9) return [cx, cy];
        const s = Math.pow(r / R, e - 1); // rho / r
        return [cx + dx * s, cy + dy * s];
      },
      box: [cx - rmax, cx + rmax, cy - rmax, cy + rmax], m,
    };
  }

  /* ---- build ------------------------------------------------------------------------ */
  let FORCE = null; // tests: override per-variation settings
  function build({ W, H, seed, p, colors, t = 0, anim, region }) {
    const n = colors.length;
    const P = Object.assign(setup(W, H, seed, p, n), FORCE || {});
    const tt = ((t % 1) + 1) % 1;
    const B = bender(W, H, P, p.warp, tt, anim ? anim.amount : 0, region);
    const X0 = region ? region.x0 : 0, X1 = region ? region.x1 : W, Y0 = region ? region.y0 : 0, Y1 = region ? region.y1 : H;
    const top = P.swap ? P.ink : 0, under = P.swap ? 0 : P.ink;
    const scene = new PL.Scene(W, H, colors[under], under);
    const L = scene.layer(P.style === 'checker' ? 'cells' : 'stripes', colors[top], P.style === 'checker' ? 'Cells' : 'Stripes', top);
    const [bx0, bx1, by0, by1] = B.box;
    const margin = P.cell * 0.5;
    let count = 0;
    // one outline: corners in pattern space (a parallelogram: o, o + e1, o + e1 + e2, o + e2)
    const quad = (ox, oy, e1x, e1y, e2x, e2y) => {
      const n1 = K.sub, n2 = K.sub; // five straight steps a side, bent at their ends
      const pts = [];
      let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
      const put = (x, y) => { const q = B.fwd(x, y); pts.push(q[0], q[1]); if (q[0] < minx) minx = q[0]; if (q[0] > maxx) maxx = q[0]; if (q[1] < miny) miny = q[1]; if (q[1] > maxy) maxy = q[1]; };
      for (let i = 0; i < n1; i++) put(ox + (e1x * i) / n1, oy + (e1y * i) / n1);
      for (let i = 0; i < n2; i++) put(ox + e1x + (e2x * i) / n2, oy + e1y + (e2y * i) / n2);
      for (let i = 0; i < n1; i++) put(ox + e1x + e2x - (e1x * i) / n1, oy + e1y + e2y - (e1y * i) / n1);
      for (let i = 0; i < n2; i++) put(ox + e2x - (e2x * i) / n2, oy + e2y - (e2y * i) / n2);
      if (maxx < X0 - 1 || minx > X1 + 1 || maxy < Y0 - 1 || miny > Y1 + 1) return; // off the frame (or region)
      // clockwise on screen (the nonzero rule then never punches holes where outlines overlap)
      let area = 0;
      for (let i = 0, k = pts.length - 2; i < pts.length; k = i, i += 2) area += (pts[k] - pts[i]) * (pts[k + 1] + pts[i + 1]);
      if (area < 0) { const r = []; for (let i = pts.length - 2; i >= 0; i -= 2) r.push(pts[i], pts[i + 1]); PL.Scene.poly(L, r); } else PL.Scene.poly(L, pts);
      count++;
    };
    if (P.style === 'checker') {
      const s = P.cell;
      const i0 = B.fixed ? Math.floor(bx0 / s) : Math.floor((bx0 - margin) / s), i1 = B.fixed ? Math.ceil(bx1 / s) : Math.ceil((bx1 + margin) / s);
      const j0 = Math.floor((by0 - margin) / s), j1 = Math.ceil((by1 + margin) / s);
      for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) if (((i + j) & 1) === 0) quad(i * s, j * s, s, 0, 0, s);
    } else {
      // slashes: a = across the stripes, b = along them, both from the frame's centre
      const ca = Math.cos(P.ang), sa = Math.sin(P.ang), cx = W / 2, cy = H / 2;
      const pitch = P.cell, Lb = P.band, wS = P.duty * pitch;
      // the pattern box's corners in (a, b)
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const [x, y] of [[bx0, by0], [bx1, by0], [bx1, by1], [bx0, by1]]) {
        const a = (x - cx) * ca + (y - cy) * sa, b = -(x - cx) * sa + (y - cy) * ca;
        a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b);
      }
      const k0 = Math.floor(b0 / Lb - P.bandPhase) - 1, k1 = Math.ceil(b1 / Lb - P.bandPhase) + 1;
      for (let k = k0; k < k1; k++) {
        const off = P.offsets ? P.offsets(k) : hash(seed, k, 0x5a5b, 7); // each band slides by its own share of the pitch
        const bs = (k + P.bandPhase) * Lb;
        const j0 = Math.floor(a0 / pitch - off) - 1, j1 = Math.ceil(a1 / pitch - off) + 1;
        for (let j = j0; j < j1; j++) {
          const as = (j + off) * pitch;
          // corner (as, bs) in screen-space pattern coordinates; e1 across (wS), e2 along (Lb)
          quad(cx + as * ca - bs * sa, cy + as * sa + bs * ca, wS * ca, wS * sa, -Lb * sa, Lb * ca);
        }
      }
    }
    scene.status = `${P.style === 'checker' ? 'checker' : 'slash'} · ${P.bend} · ${count.toLocaleString()} ${P.style === 'checker' ? 'cells' : 'stripes'}`;
    return scene;
  }

  PL.tools.register({
    id: 'warp',
    name: 'Warp',
    kind: 'Backgrounds',
    tagline: 'Op-art pattern',
    about: 'Checkerboards and slashed stripes in a bright ink on black, bent by waves, a taper or a pinch. In the animation the warp breathes: the pattern bends further, eases back and bends again.',
    inks: {
      min: 2, max: 8, roles, fit, spec, add, generate,
      span: () => 2, // Invert swaps the base and the first ink
      hint: 'Base first, then the inks. Each variation pairs the base with one of the inks (the first one most often).',
    },
    palettes: PALETTES,
    params: PARAMS,
    recolorable: false,
    animLabel: 'Intensity',
    animHint: 'How far the warp swings as it breathes (0: still)',
    defaults: {
      anim: { amount: 0.8, fps: 12, frames: 72 },
      fx: {},
      palette: 'Rust', // the preset the style opens on (its card's colors)
    },
    build,
    zoom: true, // draws any region of its world (General's Rotation and Size)
    _K: K,
    _setup: setup,
    _bender: bender,
    _force: (o) => { FORCE = o; },
  });
})();
