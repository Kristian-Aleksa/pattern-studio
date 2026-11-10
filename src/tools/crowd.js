/* ==========================================================================
   tools/crowd.js — Crowd: blurred crowd (pixel texture: PNG, video).

   1. Crowd: Figures people — a round head joined to a pill-shaped body by
      a narrower neck (one person, never a dot over a bar like an i) — stand
      about the frame (some partly outside it), mostly small with a few big
      ones, seldom straight above one another. Density sets how close they
      stand (50: where they were placed; lower: evened out and spread wider;
      higher: gathered into tight groups). Size sets how big they are; Wobble
      how far they lean and bend. Rotation turns the whole crowd, figures and
      glows, round the frame's centre; the crowd always fills the frame and
      keeps about as many figures in it at any angle. Positions are a share
      of the frame's width and height, sizes go with its area, so another
      frame shape keeps the same crowd.
   2. Glow: every figure is a red core (its silhouette, softened by Blur) in
      an opaque green glow that reaches Halo far out. The glows are laid one
      over another, back to front (the lower in the frame, the nearer), each
      darker toward its own edge (Dark rim), so a front figure's rim shows as
      a darker line over the glows behind it; the cores, worked out from all
      the silhouettes together, go on top.
   3. Arrows: small arrows in the core's colour stand on a loose grid over
      everything, each pointing along a smooth flow (a little off it), in
      soft patches that cover about Arrows of the frame; Size sets how big
      they are, and bigger ones sit further apart; Rotation turns the way
      they point (each stays in its place). On the red they vanish.
   4. Animation: every figure drifts round its own small loop (an ellipse,
      its own way round, from its own point on it) and is back where it
      started at the loop's end; Amount sets how far (1.95: a loop about a
      twentieth of the frame across). The arrows and
      the grain stay put. Seamless.
   ========================================================================== */
(() => {
  const { hash } = PL.rng;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const clamp01 = (v) => clamp(v, 0, 1);
  const sstep = (e0, e1, x) => {
    let t = (x - e0) / (e1 - e0);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return t * t * (3 - 2 * t);
  };

  // Ground, core (and the arrows), glow; more inks are more core colours. The default look uses Sunset (defaults.palette).
  const PALETTES = [
    { name: 'Crowd', colors: ['#0A0C0C', '#DD3C41', '#10784F'] },
    { name: 'Infrared', colors: ['#0B0717', '#FFD23F', '#C2185B'] },
    { name: 'Sodium', colors: ['#0E1220', '#FF9A3C', '#2E5FA8'] },
    { name: 'Neon', colors: ['#060911', '#FF4FB2', '#2351DE', '#EDEE45'] }, // hot pink and acid yellow figures in an electric blue glow
    { name: 'Lime', colors: ['#101310', '#D7F542', '#1F8A70'] },
    { name: 'Ocean', colors: ['#06141D', '#3FE0D0', '#1D4E89'] },
    { name: 'Blush', colors: ['#F3EEE6', '#E6455A', '#F2B8B5'] },
    { name: 'Violet', colors: ['#0C0814', '#FF7AE0', '#5B2BB5'] },
    { name: 'Sunset', colors: ['#1A0F1E', '#FF8A5B', '#6A2C70'] },
    { name: 'Mono', colors: ['#0D0D0D', '#F0F0EE', '#6E6E6C'] },
  ];

  /* ---- colour roles -------------------------------------------------------------------- */
  const roles = (n) => (n === 3 ? ['Ground', 'Core', 'Glow'] : ['Ground', 'Core 1', 'Glow', ...Array.from({ length: n - 3 }, (_, i) => 'Core ' + (i + 2))]);
  const spec = (n) => ({ ramp: 1, accents: Math.max(2, n - 1) });

  // "New colors": a deep ground, a vivid core and a glow some way round the colour wheel (now and then a pale ground).
  function generate(n, rng) {
    const C = PL.color;
    const hc = rng.float(0, 360), light = rng.chance(0.15);
    const ground = light ? C.lch(rng.float(0.92, 0.96), rng.float(0.01, 0.03), hc + rng.float(-40, 40)) : C.lch(rng.float(0.1, 0.17), rng.float(0.005, 0.03), rng.float(0, 360));
    const out = [ground, C.lch(rng.float(0.58, 0.82), rng.float(0.16, 0.24), hc), C.lch(light ? rng.float(0.78, 0.88) : rng.float(0.42, 0.6), rng.float(0.08, 0.14), hc + rng.sign() * rng.float(110, 200))];
    for (let i = 3; i < n; i++) out.push(C.lch(rng.float(0.6, 0.85), rng.float(0.15, 0.22), hc + (i - 2) * rng.float(50, 90)));
    return out;
  }
  // + adds a core colour in a hue the palette doesn't have yet.
  function add(colors) {
    const C = PL.color;
    const c = colors.slice();
    const hues = c.filter((x) => C.hexToLch(x)[1] > 0.04).map((x) => C.hexToLch(x)[2]);
    let best = 0, bd = -1;
    for (let h = 0; h < 360; h += 10) {
      const d = hues.length ? Math.min(...hues.map((x) => Math.abs((((h - x) % 360) + 540) % 360 - 180))) : 180;
      if (d > bd) { bd = d; best = h; }
    }
    c.push(C.lch(0.72, 0.2, best));
    return c;
  }
  function fit(colors, n) {
    let c = (colors || []).map(PL.color.normHex).filter(Boolean);
    if (!c.length) c = PALETTES[0].colors.slice();
    if (c.length === 1) c.push(PL.color.lch(0.65, 0.2, 20));
    if (c.length === 2) c.push(PL.color.mix(c[0], c[1], 0.45));
    if (c.length > n) return c.slice(0, n);
    while (c.length < n) c = add(c);
    return c;
  }

  /* ---- settings -------------------------------------------------------------------------- */
  // New variation picks a new crowd and new Figures, Size, Wobble, Blur and Halo (in their usual ranges); Density, the
  // rotations, Dark rim and the arrows stay.
  const S = (section, key, label, min, max, def, extra = {}) => ({ section, key, label, type: 'range', min, max, def, step: 1, ...extra });
  const PARAMS = [
    S('Crowd', 'figures', 'Figures', 1, 48, 27, { rand: [21, 40], hint: 'How many figures' }),
    S('Crowd', 'density', 'Density', 0, 100, 50, { unit: '%', rand: false, hint: 'How close the figures stand (0: spread out evenly, 100: packed into tight groups)' }),
    S('Crowd', 'size', 'Size', 0, 100, 32, { unit: '%', rand: [26, 53], hint: 'How big the figures are' }),
    S('Crowd', 'wobble', 'Wobble', 0, 100, 88, { unit: '%', rand: [21, 48], hint: 'How much the figures lean and bend' }),
    S('Crowd', 'rotate', 'Rotation', -180, 180, 0, { unit: '°', rand: false, aria: 'Crowd rotation', hint: 'Turns the whole crowd, figures and glows (positive: clockwise); it always fills the frame' }),
    S('Glow', 'blur', 'Blur', 0, 100, 65, { unit: '%', rand: [36, 74], hint: 'How soft the figures are' }),
    S('Glow', 'halo', 'Halo', 0, 100, 61, { unit: '%', rand: [32, 66], hint: 'How far the glow reaches round each figure' }),
    S('Glow', 'rim', 'Dark rim', 0, 100, 29, { unit: '%', rand: false, hint: 'Darkens each glow toward its edge' }),
    S('Arrows', 'arrows', 'Arrows', 0, 100, 49, { unit: '%', rand: false, hint: 'How much of the frame the arrows cover' }),
    S('Arrows', 'asize', 'Size', 0, 100, 55, { unit: '%', rand: false, aria: 'Arrow size', hint: 'How big the arrows are (bigger ones sit further apart)' }),
    S('Arrows', 'arotate', 'Rotation', -180, 180, 0, { unit: '°', rand: false, aria: 'Arrow rotation', hint: 'Turns the way every arrow points (positive: clockwise); they stay where they are' }),
  ];

  // Constants. Lengths are a share of R = sqrt(W x H) unless noted.
  const K = {
    grid: 280,                    // the glow is worked out on a grid this many steps across R, then read between them
    max: 48,                      // figures at most (the slider's end) ...
    pool: 160,                    // ... and the figures drawn, so a turned crowd (a bigger box) shows as many in the frame
    spread: 0.22,                 // figures stand up to this far past the frame's edges (share of its width / height)
    tries: 4,                     // each figure's place: the best of this many random spots (more: more even) ...
    stackY: 2.2,                  // ... height counting this many times less than width, so figures seldom stand on one another
    dens0: 0.5,                   // Density at which the figures stand where they were placed; below it they even out ...
    densOut: 0.35,                // ... and the crowd spreads this much wider at 0; above it they gather toward their group ...
    densIn: 0.3, densPow: 1.2,    // ... to this share of their distance at 100 (curve power), in groups of about
    perGroup: 5,                  // this many figures
    fig: [0.16, 0.41, 1.15],      // figure height at Size 0, its rise to 100 (and the curve's power)
    scale: [0.5, 1.3, 1.5],       // each figure's own size: from this, plus up to this times u^power (mostly small, a few big)
    head: 0.135, body: 0.3,       // head radius and body width (share of the figure's height) ...
    headK: [0.85, 0.3],           // ... each head from this, plus up to this, times the radius,
    headX: 0.04,                  // ... up to this far off-centre,
    gap: [0.005, 0.04],           // ... this far above the body (from this, plus up to this),
    neck: [0.5, 0.2],             // ... joined to it by a neck this wide (x the head's radius: from this, plus up to this),
    fillet: 0.035,                // ... with smooth fillets this big: one person, never a dot over a bar (an i)
    lean: 0.32, bend: 0.07,       // Wobble 100: lean (rad) and bend (x height)
    ref: 713.6,                   // lengths below in px of a base frame (824 x 618, R = 713.6)
    sig: [2.6, 28.5],             // the core's softness (sd) at Blur 0 and its rise to 100
    red: [18, 0, 14, 5],          // red from this far outside the edge (and its rise with Halo) to this far inside (and its rise)
    reach: [15.5, 22.7, 21],      // the glow reaches this far out at Halo 0, its rise to 100, and its rise with Blur
    edge: [5, 10],                // the glow's edge softness (half width) at Blur 0 and its rise to 100
    rimW: 12,                     // the dark rim's band inside the glow's edge ...
    rimK: [0.7, 0.7, 0.3],        // ... darkening red, green and blue this much at Dark rim 100
    orbit: 0.0113,                // the figures' drift: the loop's radius (x R) per Amount ...
    orbitR: [0.7, 0.6],           // ... times each figure's own factor (across and down): from this, plus up to this
    arrow: [0.0061, 0.0086],      // arrow length at Size 0 and its rise to 100
    gapA: 1.95,                   // arrow spacing / length
    stroke: 0.22,                 // stroke width / length
    headL: 0.5, headA: 0.8,       // arrow head: length (x length) and half angle (rad)
    flowL: 0.85, flowTurn: 0.45, jitter: 0.08, // the flow: its scale, how far it turns (turns), each arrow's own turn (rad)
    patchL: 0.3, patchMid: 0.448, patchSd: 0.18, // arrow patches: their scale; Arrows covers half the frame at patchMid
  };

  /* ---- smooth 2D value noise (flow, patches) ------------------------------------------------ */
  const nCache = new Map();
  function vnoise(seed) {
    let n = nCache.get(seed);
    if (n) return n;
    if (nCache.size > 24) nCache.clear();
    const rand = PL.rng.mulberry32((seed ^ 0x3c6ef372) >>> 0);
    const p = new Uint8Array(256), V = new Float32Array(256), P = new Uint8Array(512);
    for (let i = 0; i < 256; i++) { p[i] = i; V[i] = rand() * 2 - 1; }
    for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 512; i++) P[i] = p[i & 255];
    n = (x, y) => {
      const xf = Math.floor(x), yf = Math.floor(y);
      let u = x - xf, v = y - yf;
      u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
      const X = xf & 255, Y = yf & 255;
      const a = V[P[P[X] + Y]], b = V[P[P[X + 1] + Y]], c = V[P[P[X] + Y + 1]], d = V[P[P[X + 1] + Y + 1]];
      const e = a + (b - a) * u, f = c + (d - c) * u;
      return e + (f - e) * v;
    };
    nCache.set(seed, n);
    return n;
  }

  /* ---- the crowd: every figure's place, size, shape and drift (the same at any frame) ---------- */
  // Places are a share of the crowd's box (the frame, or the box round it when the crowd is turned), spread out like
  // people in a square: each next figure takes the best of a few random spots, the one furthest from those already
  // placed, with height counting for less than width, so figures seldom stand straight above one another. Any first
  // n figures are evenly spread, without a pattern.
  const baseCache = new Map();
  function layout(seed, p) {
    const wob = clamp01(p.wobble / 100), key = seed + '|' + wob;
    const hit = baseCache.get(key);
    if (hit) return hit;
    const r = PL.rng.mulberry32((seed * 2654435761) >>> 0);
    const figs = [], pts = [], ky = 1 / K.stackY;
    for (let i = 0; i < K.pool; i++) {
      let u = 0, v = 0, best = -1;
      for (let c = 0; c < K.tries; c++) {
        const cu = -K.spread + (1 + 2 * K.spread) * r(), cv = -K.spread + (1 + 2 * K.spread) * r();
        let dmin = 1e9;
        for (const [pu, pv] of pts) { const dv = (cv - pv) * ky, d = (cu - pu) * (cu - pu) + dv * dv; if (d < dmin) dmin = d; }
        if (dmin > best) { best = dmin; u = cu; v = cv; }
      }
      pts.push([u, v]);
      const hd = (k) => hash(i, seed | 0, k, 0x6d);              // the head's own draws
      figs.push({
        i, u, v,
        k: K.scale[0] + K.scale[1] * Math.pow(r(), K.scale[2]),
        lean: wob * K.lean * (r() * 2 - 1),
        bend: wob * K.bend * (r() * 2 - 1), bendPh: r() * Math.PI * 2,
        hk: K.headK[0] + K.headK[1] * hd(1), hx: K.headX * (hd(2) * 2 - 1), gap: K.gap[0] + K.gap[1] * hd(3), nk: K.neck[0] + K.neck[1] * hd(4),
        oa: K.orbitR[0] + K.orbitR[1] * r(), ob: K.orbitR[0] + K.orbitR[1] * r(), oph: r() * Math.PI * 2, odir: r() < 0.5 ? -1 : 1,
      });
    }
    if (baseCache.size > 64) baseCache.delete(baseCache.keys().next().value);
    baseCache.set(key, figs);
    return figs;
  }

  // Density: where the first n figures stand (a share of the crowd's box). At dens0 they stand where they were placed;
  // below it they even out (each pushed off its nearest neighbours) and the crowd spreads a little wider; above it they
  // gather toward the nearest of a few group leaders (the first figures, which are spread evenly), so the gaps open
  // between tight groups. Every step is smooth, so moving the slider moves the figures, never reshuffles them.
  const placeCache = new Map();
  function places(figs, seed, n, dens) {
    const d = clamp01(dens / 100), key = [seed, n, d, figs[0].u, figs[0].v].join('|');
    const hit = placeCache.get(key);
    if (hit) return hit;
    const U = new Float64Array(n), V = new Float64Array(n), ky = 1 / K.stackY;
    for (let i = 0; i < n; i++) { U[i] = figs[i].u; V[i] = figs[i].v; }
    if (d < K.dens0) {
      const w = (K.dens0 - d) / K.dens0, [EU, EV] = evened(U, V, n), sp = 1 + K.densOut * w;
      for (let i = 0; i < n; i++) {
        U[i] = 0.5 + (U[i] + (EU[i] - U[i]) * w - 0.5) * sp;
        V[i] = 0.5 + (V[i] + (EV[i] - V[i]) * w - 0.5) * sp;
      }
    } else if (d > K.dens0 && n > 1) {
      const c = 1 - (1 - K.densIn) * Math.pow((d - K.dens0) / (1 - K.dens0), K.densPow);
      const ng = Math.max(1, Math.round(n / K.perGroup)), U0 = U.slice(0, ng), V0 = V.slice(0, ng);
      for (let i = ng; i < n; i++) {
        let a = 0, bd = 1e9;
        for (let q = 0; q < ng; q++) { const du = U[i] - U0[q], dv = (V[i] - V0[q]) * ky, dd = du * du + dv * dv; if (dd < bd) { bd = dd; a = q; } }
        U[i] = U0[a] + (U[i] - U0[a]) * c; V[i] = V0[a] + (V[i] - V0[a]) * c;
      }
    }
    if (placeCache.size > 64) placeCache.delete(placeCache.keys().next().value);
    placeCache.set(key, [U, V]);
    return [U, V];
  }
  // The same figures evened out: pushed apart until no two stand closer than an even spread's spacing.
  function evened(U0, V0, n) {
    const U = Float64Array.from(U0), V = Float64Array.from(V0), ky = 1 / K.stackY;
    const lo = -K.spread, hi = 1 + K.spread, side = hi - lo;
    const r0 = 0.93 * Math.sqrt((2 * side * side * ky) / (Math.sqrt(3) * n)); // a hexagonal packing's spacing
    for (let it = 0; it < 48; it++) {
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
        const du = U[b] - U[a], dv = (V[b] - V[a]) * ky, dd = Math.sqrt(du * du + dv * dv) || 1e-9;
        if (dd >= r0) continue;
        const m = (0.25 * (r0 - dd)) / dd;
        U[a] -= du * m; U[b] += du * m; V[a] -= (dv * m) / ky; V[b] += (dv * m) / ky;
      }
      for (let a = 0; a < n; a++) { U[a] = clamp(U[a], lo, hi); V[a] = clamp(V[a], lo, hi); }
    }
    return [U, V];
  }

  // Figure sizes (px) for a frame
  const figHeight = (p, R) => R * (K.fig[0] + K.fig[1] * Math.pow(clamp01(p.size / 100), K.fig[2]));

  /* ---- the glow on a grid: each figure's core and halo laid back to front --------------------- */
  // Box blur (3 passes ~ a Gaussian of sd s cells) of a w x h float grid, zero outside.
  function blur3(A, w, h, s, tmp) {
    if (s < 0.35) return;
    const bw = Math.max(1, Math.round(Math.sqrt((12 * s * s) / 3 + 1))), r = bw >> 1, inv = 1 / (2 * r + 1);
    for (let pass = 0; pass < 3; pass++) {
      for (let y = 0; y < h; y++) {           // rows
        const o = y * w;
        let acc = 0;
        for (let x = -r; x <= r; x++) if (x >= 0 && x < w) acc += A[o + x];
        for (let x = 0; x < w; x++) {
          tmp[o + x] = acc * inv;
          const xa = x + r + 1, xr = x - r;
          if (xa < w) acc += A[o + xa];
          if (xr >= 0) acc -= A[o + xr];
        }
      }
      for (let x = 0; x < w; x++) {           // columns
        let acc = 0;
        for (let y = -r; y <= r; y++) if (y >= 0 && y < h) acc += tmp[y * w + x];
        for (let y = 0; y < h; y++) {
          A[y * w + x] = acc * inv;
          const ya = y + r + 1, yr = y - r;
          if (ya < h) acc += tmp[ya * w + x];
          if (yr >= 0) acc -= tmp[yr * w + x];
        }
      }
    }
  }

  // Inverse of the normal CDF on [0, 1] (a table): a blurred straight edge's level -> its distance from the edge in sd.
  const QN = 8192, Q = new Float32Array(QN + 1);
  (() => {
    const erfinv = (x) => { // Giles' approximation
      let w = -Math.log((1 - x) * (1 + x)), p;
      if (w < 5) { w -= 2.5; p = 2.81022636e-8; p = 3.43273939e-7 + p * w; p = -3.5233877e-6 + p * w; p = -4.39150654e-6 + p * w; p = 0.00021858087 + p * w; p = -0.00125372503 + p * w; p = -0.00417768164 + p * w; p = 0.246640727 + p * w; p = 1.50140941 + p * w; }
      else { w = Math.sqrt(w) - 3; p = -0.000200214257; p = 0.000100950558 + p * w; p = 0.00134934322 + p * w; p = -0.00367342844 + p * w; p = 0.00573950773 + p * w; p = -0.0076224613 + p * w; p = 0.00943887047 + p * w; p = 1.00167406 + p * w; p = 2.83297682 + p * w; }
      return p * x;
    };
    for (let i = 0; i <= QN; i++) { const f = Math.min(1 - 1e-6, Math.max(1e-6, i / QN)); Q[i] = Math.SQRT2 * erfinv(2 * f - 1); }
  })();
  const zOf = (f) => { const x = f * QN, i = x | 0; return i >= QN ? Q[QN] : Q[i] + (Q[i + 1] - Q[i]) * (x - i); };

  // The glow on a grid. Every figure's halo is laid over the ground back to front (the lower in the frame, the nearer),
  // each darker toward its own edge, so a front figure's rim shows over the halos behind it; the red cores, worked out
  // from all the figures' soft silhouettes together, go on top.
  // MP (General's Rotation and Size): the canvas (cw x ch) and the part of the world it shows. The grid is as
  // fine on the canvas as at 100 %, and past the frame the crowd carries on: the world is laid out in tiles the
  // size of the crowd's box, the frame's own in its tile and every other tile a crowd of its own (a seed of its
  // own), all laid back to front together.
  function glow(seed, p, W, H, t, amount, rgb, MP) {
    const R = Math.sqrt(W * H), gc = R / K.grid, g = MP ? gc * MP.s : gc;
    const b = clamp01(p.blur / 100), hl = clamp01(p.halo / 100), rim = clamp01(p.rim / 100);
    const px = R / K.ref;                                       // px per reference px (824 x 618)
    const sc = px * (K.sig[0] + K.sig[1] * b);                  // the core's softness (sd, px)
    const Do = px * (K.red[0] + K.red[1] * hl), Di = px * (K.red[2] + K.red[3] * hl); // red from Do outside to Di inside
    const Dh = px * (K.reach[0] + K.reach[1] * hl + K.reach[2] * b), ww = px * (K.edge[0] + K.edge[1] * b), rw = px * K.rimW;
    // a blurred edge tells its distance up to about 2.6 sd away: soften the fields enough to reach the red's and the glow's ends
    const sr = Math.max(sc, Math.max(Do, Di) / 2.6), sh = Math.max(sr, (Dh + 2 * ww) / 2.6);
    const reach = Dh + ww + 3 * sh + 2 * g;                     // px round a figure that its halo can touch
    // MP: the grid reaches past the canvas by that much (mc steps), so the glows at its edges are whole (a figure half out of
    // the view glows as it does in the middle of it). The frame alone keeps its usual look, its glows cut at its edges.
    const mc = MP ? Math.ceil(reach / g) : 0, gx0 = MP ? MP.x0 - mc * g : 0, gy0 = MP ? MP.y0 - mc * g : 0;
    const gw = Math.ceil((MP ? MP.cw : W) / gc) + 2 + 2 * mc, gh = Math.ceil((MP ? MP.ch : H) / gc) + 2 + 2 * mc, N = gw * gh;
    // Rotation turns the crowd's box round the frame's centre; the box always covers the frame, and holds as many more
    // figures as it is bigger than the frame, so the frame shows about Figures of them at any angle
    const rot = (((p.rotate || 0) % 360) * Math.PI) / 180, rc = Math.cos(rot), rs = Math.sin(rot);
    const BW = Math.abs(W * rc) + Math.abs(H * rs), BH = Math.abs(W * rs) + Math.abs(H * rc);
    const n0 = clamp(Math.round(p.figures), 1, K.max), n = clamp(Math.round((n0 * BW * BH) / (W * H)), n0, K.pool);
    let figs;
    if (!MP) {
      const all = layout(seed, p), [PU, PV] = places(all, seed, n, p.density == null ? 50 : p.density);
      figs = all.slice(0, n).map((f, i) => ({ f, u: PU[i], v: PV[i], key: f.i })).sort((a, b) => a.v - b.v || a.key - b.key); // back to front
    } else {
      // the tiles (in the box's own turned frame) the region reaches, half a tile more all round for figures reaching in;
      // a tile is as wide as the spread of a crowd (its figures stand a little past its box), so the crowds just meet
      const TS = 1 + 2 * K.spread;
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const [x, y] of [[gx0, gy0], [gx0 + gw * g, gy0], [gx0, gy0 + gh * g], [gx0 + gw * g, gy0 + gh * g]]) {
        const bx = (x - W / 2) * rc + (y - H / 2) * rs, by = -(x - W / 2) * rs + (y - H / 2) * rc;
        u0 = Math.min(u0, bx / BW + 0.5); u1 = Math.max(u1, bx / BW + 0.5); v0 = Math.min(v0, by / BH + 0.5); v1 = Math.max(v1, by / BH + 0.5);
      }
      figs = [];
      for (let tj = Math.floor((v0 - 0.5) / TS) - 1; tj <= Math.floor((v1 - 0.5) / TS) + 1; tj++) {
        for (let ti = Math.floor((u0 - 0.5) / TS) - 1; ti <= Math.floor((u1 - 0.5) / TS) + 1; ti++) {
          const own = ti === 0 && tj === 0;
          const sd = own ? seed : (Math.imul(seed | 0, 0x7feb352d) ^ Math.imul(ti, 0x9e3779b1) ^ Math.imul(tj, 0x85ebca77)) | 0;
          const all = layout(sd, p), [PU, PV] = places(all, sd, n, p.density == null ? 50 : p.density);
          const base = own ? 0 : 1000 * (1 + (((ti + 512) & 1023) << 10 | ((tj + 512) & 1023)));
          for (let i = 0; i < n; i++) figs.push({ f: all[i], u: PU[i] + ti * TS, v: PV[i] + tj * TS, key: base + all[i].i });
        }
      }
      figs.sort((a, b) => a.v - b.v || a.key - b.key);
    }
    const nc = Math.max(1, rgb.length - 2), groups = nc > 1;
    const U = new Float32Array(N), Gc = groups ? Array.from({ length: nc }, () => new Float32Array(N)) : null;
    const G0 = rgb[0], GL = rgb[2], cores = [rgb[1], ...rgb.slice(3)];
    const acc = new Float32Array(N * 3);
    for (let k = 0; k < N; k++) { acc[3 * k] = G0[0]; acc[3 * k + 1] = G0[1]; acc[3 * k + 2] = G0[2]; }
    const Hb = figHeight(p, R), th = 2 * Math.PI * t, orb = amount * K.orbit * R;
    let M = new Float32Array(0), T = new Float32Array(0);
    for (const { f, u, v } of figs) {
      const Hf = Hb * f.k, hr = K.head * f.hk * Hf, bwh = 0.5 * K.body * Hf, hx = f.hx * Hf, kf = K.fillet * Hf, rn = f.nk * hr;
      const yHead = -Hf / 2 + hr, yTop = yHead + hr + f.gap * Hf + bwh, yBot = Math.max(yTop, Hf / 2 - bwh);
      const nx = -hx, ny = yTop - bwh * 0.5 - yHead, nl = 1 / (nx * nx + ny * ny);   // the neck: from the head's centre into the body
      // where it stands this frame (its own loop, back home at the loop's end), in the crowd's turned box
      const bx = (u - 0.5) * BW + orb * f.oa * (Math.sin(f.oph + f.odir * th) - Math.sin(f.oph));
      const by = (v - 0.5) * BH + orb * f.ob * (Math.cos(f.oph + f.odir * th) - Math.cos(f.oph));
      const cx = W / 2 + bx * rc - by * rs, cy = H / 2 + bx * rs + by * rc;
      const ca = Math.cos(f.lean + rot), sa = Math.sin(f.lean + rot);
      const ext = 0.5 * Hf + Hf * Math.abs(f.bend) + reach;
      const i0 = Math.max(0, Math.floor((cx - ext - gx0) / g)), i1 = Math.min(gw - 1, Math.ceil((cx + ext - gx0) / g));
      const j0 = Math.max(0, Math.floor((cy - ext - gy0) / g)), j1 = Math.min(gh - 1, Math.ceil((cy + ext - gy0) / g));
      if (i1 < i0 || j1 < j0) continue;
      const w = i1 - i0 + 1, h = j1 - j0 + 1, NN = w * h;
      if (M.length < NN) { M = new Float32Array(NN); T = new Float32Array(NN); }
      M.fill(0, 0, NN);
      const bendA = f.bend * Hf;
      const G = groups ? Gc[f.i % nc] : null;
      for (let j = 0; j < h; j++) {
        const y = gy0 + (j0 + j) * g - cy;
        for (let i = 0; i < w; i++) {
          const x = gx0 + (i0 + i) * g - cx;
          const ly = -x * sa + y * ca;
          let lx = x * ca + y * sa;                             // in the figure's leaning frame
          lx -= bendA * Math.sin((ly / Hf) * 3.4 + f.bendPh);    // bent along its height
          const dx0 = lx - hx, dy0 = ly - yHead, dh = Math.sqrt(dx0 * dx0 + dy0 * dy0) - hr;
          const yy = ly < yTop ? yTop : ly > yBot ? yBot : ly;
          const dy1 = ly - yy, db = Math.sqrt(lx * lx + dy1 * dy1) - bwh;
          // the head joins the body through a narrower neck, with smooth fillets (smooth unions of the three shapes)
          const tn = clamp01((dx0 * nx + dy0 * ny) * nl), ex = dx0 - tn * nx, ey = dy0 - tn * ny, dn = Math.sqrt(ex * ex + ey * ey) - rn;
          let hh = clamp01(0.5 + (0.5 * (dn - dh)) / kf);
          const dhn = dn + (dh - dn) * hh - kf * hh * (1 - hh);
          hh = clamp01(0.5 + (0.5 * (db - dhn)) / kf);
          const d = db + (dhn - db) * hh - kf * hh * (1 - hh);
          if (d >= 0.5 * g) continue;
          const m = d <= -0.5 * g ? 1 : 0.5 - d / g, k = (j0 + j) * gw + i0 + i;
          M[j * w + i] = m;
          if (m > U[k]) U[k] = m;
          if (G && m > G[k]) G[k] = m;
        }
      }
      // this figure's halo, darker toward its edge, over what's behind it
      blur3(M, w, h, sh / g, T);
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const mv = M[j * w + i];
          if (mv < 1e-5) continue;
          const dh = -sh * zOf(mv);
          if (dh >= Dh + ww) continue;
          const ag = dh <= Dh - ww ? 1 : 1 - sstep(Dh - ww, Dh + ww, dh);
          const rt = rim > 0 ? rim * sstep(Dh - ww - rw, Dh - ww, dh) : 0;
          const o = 3 * ((j0 + j) * gw + i0 + i);
          acc[o] += (GL[0] * (1 - rt * K.rimK[0]) - acc[o]) * ag;
          acc[o + 1] += (GL[1] * (1 - rt * K.rimK[1]) - acc[o + 1]) * ag;
          acc[o + 2] += (GL[2] * (1 - rt * K.rimK[2]) - acc[o + 2]) * ag;
        }
      }
    }
    // the red cores on top, from all the silhouettes together
    const Tn = new Float32Array(N);
    blur3(U, gw, gh, sr / g, Tn);
    if (groups) for (const G of Gc) blur3(G, gw, gh, sr / g, Tn);
    for (let k = 0; k < N; k++) {
      const fc = U[k];
      if (fc < 1e-5) continue;
      const dc = -sr * zOf(fc);
      const tr = dc >= Do ? 0 : dc <= -Di ? 1 : sstep(Do, -Di, dc);
      if (tr <= 0) continue;
      let cr = cores[0][0], cg = cores[0][1], cb = cores[0][2];
      if (groups) {
        let s = 0; cr = cg = cb = 0;
        for (let q = 0; q < nc; q++) { const v = Gc[q][k] + 1e-6; s += v; cr += cores[q][0] * v; cg += cores[q][1] * v; cb += cores[q][2] * v; }
        cr /= s; cg /= s; cb /= s;
      }
      const o = 3 * k;
      acc[o] += (cr - acc[o]) * tr; acc[o + 1] += (cg - acc[o + 1]) * tr; acc[o + 2] += (cb - acc[o + 2]) * tr;
    }
    return { acc, gw, gh, g: gc, mc };
  }

  /* ---- arrows: a loose grid in soft patches, each along the flow (the same at any frame) -------- */
  // R (General's Rotation and Size): the part of the world to cover (the grid runs on past the frame)
  let arrCache = null;
  function arrows(seed, p, W, H, R0) {
    const A = clamp01(p.arrows / 100), s = clamp01(p.asize / 100), turn = (((p.arotate || 0) % 360) * Math.PI) / 180;
    const key = [seed, W, H, A, s, turn, R0 ? [R0.x0, R0.y0, R0.x1, R0.y1].join(',') : ''].join('|');
    if (arrCache && arrCache.key === key) return arrCache.list;
    const list = [];
    if (A > 0) {
      const R = Math.sqrt(W * H), L = R * (K.arrow[0] + K.arrow[1] * s), gp = K.gapA * L;
      const nf = vnoise((seed * 13 + 5) | 0), np = vnoise((seed * 17 + 11) | 0), np2 = vnoise((seed * 19 + 23) | 0);
      const thr = (K.patchMid - A) / K.patchSd, ox = W / 2, oy = H / 2; // present where the patch noise (sd 1) is above thr
      const ni = Math.ceil(W / 2 / gp) + 2, nj = Math.ceil(H / 2 / gp) + 2;
      const X0 = R0 ? R0.x0 : 0, X1 = R0 ? R0.x1 : W, Y0 = R0 ? R0.y0 : 0, Y1 = R0 ? R0.y1 : H;
      const ia = R0 ? Math.floor((X0 - ox) / gp) - 2 : -ni, ib = R0 ? Math.ceil((X1 - ox) / gp) + 2 : ni;
      const ja = R0 ? Math.floor((Y0 - oy) / gp) - 2 : -nj, jb = R0 ? Math.ceil((Y1 - oy) / gp) + 2 : nj;
      for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) {
        const x = ox + (i + (hash(i, j, seed, 0x41) - 0.5) * 0.8) * gp, y = oy + (j + (hash(i, j, seed, 0x42) - 0.5) * 0.8) * gp;
        if (x < X0 - L || y < Y0 - L || x > X1 + L || y > Y1 + L) continue;
        const u = (x - ox) / R, v = (y - oy) / R;
        const pv = (np(u / K.patchL + 7.3, v / K.patchL - 3.1) + 0.5 * np2(2 * u / K.patchL, 2 * v / K.patchL)) / 1.5;
        if (A < 1 && pv * KP < thr) continue;
        const ang = K.flowTurn * Math.PI * 2 * nf(u / K.flowL + 1.7, v / K.flowL + 9.2) + (hash(i, j, seed, 0x43) * 2 - 1) * K.jitter + turn;
        list.push([x, y, ang]);
      }
    }
    arrCache = { key, list };
    return list;
  }
  // the patch noise's spread, measured once so the cover follows Arrows (see _K.patchSd)
  let KP = 1;
  (() => {
    const n1 = vnoise(12345), n2 = vnoise(54321);
    let s2 = 0, m = 0, c = 0;
    for (let j = 0; j < 120; j++) for (let i = 0; i < 120; i++) {
      const v = (n1(i * 0.37, j * 0.37) + 0.5 * n2(i * 0.74, j * 0.74)) / 1.5;
      m += v; s2 += v * v; c++;
    }
    m /= c; KP = 1 / Math.sqrt(s2 / c - m * m);
  })();

  // Draw one stroke (a capsule from (x0, y0) to (x1, y1), radius rad px) into the image, antialiased.
  function stroke(d8, W, H, x0, y0, x1, y1, rad, col) {
    const xa = Math.max(0, Math.floor(Math.min(x0, x1) - rad - 1)), xb = Math.min(W - 1, Math.ceil(Math.max(x0, x1) + rad + 1));
    const ya = Math.max(0, Math.floor(Math.min(y0, y1) - rad - 1)), yb = Math.min(H - 1, Math.ceil(Math.max(y0, y1) + rad + 1));
    const dx = x1 - x0, dy = y1 - y0, ll = dx * dx + dy * dy || 1;
    for (let y = ya; y <= yb; y++) {
      const py = y + 0.5 - y0;
      for (let x = xa; x <= xb; x++) {
        const px = x + 0.5 - x0;
        let t = (px * dx + py * dy) / ll;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = px - t * dx, ey = py - t * dy;
        const cov = rad + 0.5 - Math.sqrt(ex * ex + ey * ey);
        if (cov <= 0) continue;
        const a = cov >= 1 ? 1 : cov, o = (y * W + x) * 4;
        d8[o] += (col[0] - d8[o]) * a; d8[o + 1] += (col[1] - d8[o + 1]) * a; d8[o + 2] += (col[2] - d8[o + 2]) * a;
      }
    }
  }

  /* ---- paint ------------------------------------------------------------------------------- */
  let pvImg = null;
  // map (General's Rotation and Size): the canvas (cw x ch) and the part of the world it shows
  function paint({ ctx, W, H, seed, p, colors, t = 0, anim, preview = false, map }) {
    const amount = anim ? Math.max(0, anim.amount) : 0;
    const rgb = colors.map(PL.color.hexToRgb);
    const { acc, gw, g, mc } = glow(seed | 0, p, W, H, t, amount, rgb, map);
    const CW = map ? map.cw : W, CH = map ? map.ch : H, ms = map ? map.s : 1, mx = map ? map.x0 : 0, my = map ? map.y0 : 0;
    if (preview) { if (!pvImg || pvImg.width !== CW || pvImg.height !== CH) pvImg = ctx.createImageData(CW, CH); }
    const img = preview ? pvImg : ctx.createImageData(CW, CH);
    const d8 = img.data, ig = 1 / g;
    // read the grid between its steps
    const IX = new Int32Array(CW), TX = new Float32Array(CW);
    for (let x = 0; x < CW; x++) { const fx = (x + 0.5) * ig + mc, i = Math.floor(fx); IX[x] = 3 * i; TX[x] = fx - i; }
    for (let y = 0; y < CH; y++) {
      const fy = (y + 0.5) * ig + mc, j = Math.floor(fy), ty = fy - j, r0 = 3 * j * gw, r1 = r0 + 3 * gw;
      let o = y * CW * 4;
      for (let x = 0; x < CW; x++, o += 4) {
        const a = r0 + IX[x], b = r1 + IX[x], tx = TX[x];
        for (let c = 0; c < 3; c++) {
          const top = acc[a + c] + (acc[a + 3 + c] - acc[a + c]) * tx, bot = acc[b + c] + (acc[b + 3 + c] - acc[b + c]) * tx;
          d8[o + c] = top + (bot - top) * ty;
        }
        d8[o + 3] = 255;
      }
    }
    // arrows, in the core's colour, over everything (on the canvas: sizes in its pixels)
    const list = arrows(seed | 0, p, W, H, map ? { x0: mx, y0: my, x1: mx + CW * ms, y1: my + CH * ms } : undefined);
    if (list.length) {
      const R = Math.sqrt(W * H), L = (R * (K.arrow[0] + K.arrow[1] * clamp01(p.asize / 100))) / ms;
      const rad = Math.max(0.45, 0.5 * K.stroke * L), hl = K.headL * L, col = rgb[1];
      for (const [x0, y0, a] of list) {
        const x = map ? (x0 - mx) / ms : x0, y = map ? (y0 - my) / ms : y0;
        const c = Math.cos(a), s = Math.sin(a);
        const tx = x + 0.5 * L * c, ty = y + 0.5 * L * s, bx = x - 0.5 * L * c, by = y - 0.5 * L * s;
        stroke(d8, CW, CH, bx, by, tx, ty, rad, col);
        for (const sg of [-1, 1]) {
          const b2 = a + Math.PI - sg * K.headA;
          stroke(d8, CW, CH, tx, ty, tx + hl * Math.cos(b2), ty + hl * Math.sin(b2), rad, col);
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    const n = clamp(Math.round(p.figures), 1, K.max);
    return { status: `${n} figure${n === 1 ? '' : 's'} · ${list.length.toLocaleString()} arrows` };
  }

  PL.tools.register({
    id: 'crowd',
    name: 'Crowd',
    kind: 'Backgrounds',
    tagline: 'Blurred crowd',
    about: 'A crowd seen through a heat camera: soft red figures, each wrapped in a green glow with a darker rim, laid one over another, under a field of small arrows that follow the flow. In the animation every figure drifts round its own small loop.',
    raster: true,
    opaque: true,      // the ground is part of the picture
    stillGrain: true,  // the grain holds still while the figures drift
    inks: {
      min: 3, max: 8, roles, fit, spec, add, generate,
      span: () => 2, // Invert swaps the ground and the core
      hint: 'Ground, then the core (and the arrows), then the glow. More inks are more core colors, dealt out to the figures in turn.',
    },
    palettes: PALETTES,
    params: PARAMS,
    animHint: 'How far the figures drift round their loops (0: still)',
    defaults: {
      anim: { amount: 1.95, fps: 12, frames: 36 },
      fx: { grainOn: true, grainBlend: 'add', grain: 30, grainSize: 1, grainSpecks: 30, vignette: 20 },
      palette: 'Sunset', // the preset the style opens on (its card's colors)
    },
    paint,
    zoom: true, // paints any part of its world (General's Rotation and Size)
    _K: K,
    _layout: layout,
    _places: places,
    _glow: glow,
    _arrows: arrows,
    _figHeight: figHeight,
  });
})();
