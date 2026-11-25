/* ==========================================================================
   tools/vein.js — Vein: a maze of beaded veins.

   1. Waves: the world is covered with small overlapping patches of parallel
      waves, each with its own heading and timing, summed into one field
      (Veins: how many waves cross the frame). Where neighbouring patches
      agree the crests run on for a long way; where they disagree a crest
      ends, as in a fingerprint (Order: long, unbroken veins or a busier maze
      of short ones).
   2. Flow: a patch takes its heading from the domain it lies in (Domains:
      how big; their borders curve), each domain its own (Turn: how far the
      headings stray from one another), bent a little within it; round each
      domain's middle the veins turn to run in to it like spokes (Hubs). So
      families of parallel veins meet in seams and hubs.
   3. Veins: every crest (where the waves' phase is 0) is traced on a fine
      grid (marching squares) and drawn as one outline, Weight thick, swelling
      into lopsided beads and narrowing between them (Beads) and zigzagging a
      little (Wobble). Where a crest ends, the vein reaches for the next one
      ahead (Joins: how far) or ends in a round tip (Tips: how big).
   4. Colors: Ground, then the veins: one color, or a few, each taken by
      patches of the world (a vein that crosses patches changes color there).
   5. Animation: every patch of waves sways back and forth by its own timing
      and the bends drift, so veins slide, reach out, part and join again,
      while the beads swell and shrink. Frame 1 is the same at any Amount.
      Seamless; Amount 0 holds still.
   ========================================================================== */
(() => {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const clamp01 = (v) => clamp(v, 0, 1);
  const lerp = (a, b, t) => a + (b - a) * t;
  const TAU = Math.PI * 2;
  const hash = PL.rng.hash;
  const len = (x, y) => Math.sqrt(x * x + y * y);

  // Ground first, then the veins. The default look uses Berry (defaults.palette).
  const PALETTES = [
    { name: 'Marigold', colors: ['#FF6A28', '#FDC942'] },
    { name: 'Coral', colors: ['#B3202E', '#FF9E8F'] },
    { name: 'Leaf', colors: ['#1F5A36', '#C5E37A'] },
    { name: 'Ink', colors: ['#F3EFE6', '#1C1B19'] },
    { name: 'Lagoon', colors: ['#0B5F66', '#E4F6EF', '#7FD6C8'] },
    { name: 'Lava', colors: ['#170A06', '#FF5A1F', '#FFC53D'] },
    { name: 'Berry', colors: ['#5B1240', '#FF6FA8', '#FFD1E3'] },
    { name: 'Night', colors: ['#0D1230', '#4CD6F0', '#B6F2FF'] },
    { name: 'Moss', colors: ['#2E3A1F', '#A8B856', '#E6E2B8'] },
    { name: 'Bloom', colors: ['#FFE6D8', '#E8546B', '#F29E4C', '#7A4FB5'] },
  ];

  /* ---- color roles -------------------------------------------------------------------- */
  const roles = (n) => ['Ground', ...(n === 2 ? ['Veins'] : Array.from({ length: n - 1 }, (_, i) => 'Veins ' + (i + 1)))];
  const spec = (n) => ({ ramp: 1, accents: n - 1 });
  const isLight = (hex) => PL.color.luminance(hex) > 0.35;

  // "New colors": a ground and veins that stand out from it (light on dark or dark on light), the extra
  // vein colors near the first.
  function generate(n, rng) {
    const C = PL.color, h = rng.float(0, 360), dark = rng.chance(0.55);
    const gL = dark ? rng.float(0.2, 0.34) : rng.float(0.6, 0.7), gC = rng.float(0.1, 0.17);
    const hv = h + rng.float(25, 70) * rng.sign();
    const veins = Array.from({ length: n - 1 }, (_, i) => C.lch(
      dark ? rng.float(0.8, 0.93) : rng.float(0.88, 0.95),
      rng.float(0.08, 0.15),
      hv + i * rng.float(25, 55) * (i % 2 ? -1 : 1)));
    return [C.lch(gL, gC, h), ...veins];
  }

  // + adds a vein color: one of the veins' own colors turned round the hue circle (as light and as vivid),
  // the turn that stands furthest from every color there is (the ground counting double, so the new veins
  // still stand out from it). The others keep their places.
  function add(colors) {
    const C = PL.color, c = colors.slice();
    const labs = c.map((x) => C.hexToOklab(x));
    const score = (hex) => {
      const q = C.hexToOklab(hex);
      return Math.min(...labs.map((r, i) => Math.hypot(q[0] - r[0], q[1] - r[1], q[2] - r[2]) / (i === 0 ? 2 : 1)));
    };
    let best = null, top = -1;
    for (let i = 1; i < c.length; i++) {
      const [L, Ch, h] = C.hexToLch(c[i]);
      for (const dh of [40, -40, 75, -75, 110, -110, 150, -150, 180]) {
        const hx = C.lch(L, Math.max(Ch, 0.06), h + dh), sc = score(hx);
        if (sc > top + 1e-9) { top = sc; best = hx; }
      }
    }
    c.push(best || C.mix(c[c.length - 1], c[0], 0.3));
    return c;
  }

  // A palette of any length fitted to n colors: the ground stays first; a long one gives up vein colors
  // from its end, a short one gets veins that stand out from its ground.
  function fit(colors, n) {
    const C = PL.color;
    let c = (colors || []).map(C.normHex).filter(Boolean);
    if (!c.length) c = PALETTES[0].colors.slice();
    if (c.length < 2) c = [c[0], C.mix(c[0], isLight(c[0]) ? '#000000' : '#FFFFFF', 0.82)];
    while (c.length > n) c.pop();
    while (c.length < n) c = add(c);
    return c;
  }

  /* ---- settings ----------------------------------------------------------------------- */
  const S = (section, key, label, min, max, def, extra = {}) => ({ section, key, label, type: 'range', min, max, def, step: 1, ...extra });
  const PARAMS = [
    S('Veins', 'veins', 'Veins', 8, 48, 22, { rand: [14, 32], hint: 'How many veins cross the frame (more: closer together)' }),
    S('Veins', 'weight', 'Weight', 0, 100, 55, { unit: '%', rand: [35, 75], hint: 'How thick the veins are' }),
    S('Veins', 'beads', 'Beads', 0, 100, 95, { unit: '%', rand: [55, 100], hint: 'How much the veins swell into beads and narrow between them (0: smooth)' }),
    S('Veins', 'wobble', 'Wobble', 0, 100, 70, { unit: '%', rand: [35, 90], hint: 'How much the veins zigzag' }),
    S('Ends', 'tips', 'Tips', 0, 100, 50, { unit: '%', rand: [25, 75], hint: 'How big the round tips are where veins end (0: none)' }),
    S('Ends', 'joins', 'Joins', 0, 100, 65, { unit: '%', rand: [30, 85], hint: 'How far a vein reaches to join the next one where it ends (0: never)' }),
    S('Flow', 'domains', 'Domains', 0, 100, 45, { unit: '%', rand: [25, 70], hint: 'How big the families of parallel veins are' }),
    S('Flow', 'turn', 'Turn', 0, 100, 45, { unit: '%', rand: [25, 75], hint: 'How far the families turn from one another (0: all parallel)' }),
    S('Flow', 'hubs', 'Hubs', 0, 100, 50, { unit: '%', rand: [10, 80], hint: 'How much the veins near the middle of each family turn to run in to it, meeting like spokes' }),
    S('Flow', 'order', 'Order', 0, 100, 12, { unit: '%', rand: [0, 45], hint: 'Long, unbroken veins (100) or a busy maze of short ones that end and meet (0)' }),
  ];

  // Constants. Lengths in wavelengths (the distance from one vein to the next) unless noted.
  const K = {
    sig: [0.55, 1.25],    // each patch of waves: a soft disc this wide (sigma) at Order 0 -> 100 ...
    cellPer: 1.25,        // ... one per square cell this many sigmas across ...
    reach: 3,             // ... summed out to this many sigmas
    per: 6,               // the grid: this many points per wavelength ...
    maxCells: 150000,     // ... and at most this many in all (General's Size zoomed far out samples coarser)
    patch: 5,             // with more than one vein color: patches of veins this wide take one each
    dom: [3, 18],         // domains this wide at Domains 0 -> 100 ...
    domWarp: 0.35,        // ... their borders pushed about by up to this much of that (so they curve) ...
    hubR: 0.45,           // ... and round their centres (Hubs) the veins turn to run in to it, out to this far
    bendL: 7,             // within a domain the heading bends over this distance ...
    bend: 0.6,            // ... by up to about this much (radians)
    half: [0.03, 0.14],   // a vein's half-width at Weight 0 -> 100
    beadF: 2.6,           // beads: noise cycles per wavelength ...
    bead: 1.0,            // ... swelling or narrowing a vein by up to this much of its width at Beads 100 ...
    neck: 0.22,           // ... never narrower than this much of it ...
    lobe: 0.6,            // ... and swelling more on one side than the other by up to this much (lopsided)
    tip: [0.8, 2.6],      // a tip's radius: this many half-widths at Tips 0 -> 100 (0: none) ...
    tipVar: 0.3,          // ... give or take this much; tips closer than a few radii shrink (a vein just parting)
    join: 0.8,            // a vein's end joins the next vein ahead of it within this much at Joins 100 ...
    joinCos: 0.25,        // ... as long as it lies within about 75 degrees of straight ahead
    wobF: 1.6,            // wobble: noise cycles per wavelength ...
    wob: 0.16,            // ... moving a vein sideways by up to this much at Wobble 100
    step: 0.07,           // a vein's outline has a point every this much along it
    swing: 1.1,           // animation: each patch's waves swing this far (radians) x Amount ...
    drift: 0.22,          // ... the bends, beads and wobble change along a circle this big (noise units) x Amount
  };

  /* ---- the waves ---------------------------------------------------------------------- */
  // The nearest site of a jittered grid of sites D apart, to a point pushed about a little first (so the
  // borders between cells bend): its cell [a, b].
  function cells(seed, D) {
    const s2 = (seed * 104729 + 33) | 0, NW = PL.noise.get((seed ^ 0x6c8e9cf5) >>> 0), fd = 1 / D, dw = K.domWarp * D;
    return (x0, y0) => {
      const x = x0 + dw * NW.noise4(x0 * fd, y0 * fd, 1.7, 0), y = y0 + dw * NW.noise4(x0 * fd + 13.1, y0 * fd - 7.7, 4.2, 0);
      const si = Math.floor(x / D), sj = Math.floor(y / D);
      let best = Infinity, a0 = 0, b0 = 0;
      for (let b = sj - 1; b <= sj + 1; b++) for (let a = si - 1; a <= si + 1; a++) {
        const dx = (a + hash(a, b, s2, 1)) * D - x, dy = (b + hash(a, b, s2, 2)) * D - y, d = dx * dx + dy * dy;
        if (d < best) { best = d; a0 = a; b0 = b; }
      }
      return [a0, b0];
    };
  }
  // Directions: every point takes the heading of its domain (Domains: how big; Turn: how far the headings
  // stray from one another round the frame's own).
  function headings(seed, p, lam) {
    const D = lam * lerp(K.dom[0], K.dom[1], clamp01((p.domains ?? 45) / 100));
    const turn = clamp01((p.turn ?? 45) / 100) * Math.PI, s2 = (seed * 104729 + 33) | 0;
    const th0 = TAU * hash(s2, 7, 3, 1);
    const site = cells(seed, D), hub = clamp01((p.hubs ?? 50) / 100);
    // a patch at (x, y): its domain's heading, turned (Hubs) toward running round the domain's centre, so the
    // veins there run in to it like spokes and meet
    const heading = (x, y) => {
      const [a, b] = site(x, y), th = th0 + turn * (2 * hash(a, b, s2, 3) - 1);
      if (!(hub > 0)) return th;
      const rx = x - (a + hash(a, b, s2, 1)) * D, ry = y - (b + hash(a, b, s2, 2)) * D, rl = len(rx, ry) || 1;
      const f = hub * Math.exp(-(rl * rl) / (K.hubR * K.hubR * D * D));
      return Math.atan2((1 - f) * Math.sin(th) + (f * rx) / rl, (1 - f) * Math.cos(th) - (f * ry) / rl);
    };
    return { D, turn, hub, heading };
  }

  let HEAD = null; // the patches' domain headings, by patch: { key, map }
  let CX = null, SX = null; // one patch's factors along x
  // S = sum of w(x - p) e^(i (k n.(x - p) + phase)) over the patches p near x, on (nx + 1) x (ny + 1) points
  // g apart from (X0, Y0) (frame units). lam: the wavelength. Returns { re, im }.
  function waves(seed, p, lam, X0, Y0, g, nx, ny, t, amount) {
    const W1 = nx + 1, re = new Float64Array(W1 * (ny + 1)), im = new Float64Array(W1 * (ny + 1));
    const sig = lam * lerp(K.sig[0], K.sig[1], clamp01((p.order ?? 12) / 100)), cell = sig * K.cellPer, Rw = sig * K.reach;
    const k = TAU / lam, i2 = 1 / (2 * sig * sig), Q = Math.exp(-2 * g * g * i2);
    const s1 = (seed * 7919 + 17) | 0;
    const H = headings(seed, p, lam);
    // each patch's domain heading stays the same from frame to frame: kept, so a frame only adds the bends
    const hk = [seed, lam, cell, H.D, H.turn, H.hub].join();
    if (!HEAD || HEAD.key !== hk || HEAD.map.size > 400000) HEAD = { key: hk, map: new Map() };
    const NB = PL.noise.get((seed ^ 0x51a3c2d7) >>> 0), fb = 1 / (lam * K.bendL);
    // time: the bends travel round a circle in noise; every patch swings by its own timing
    const th = TAU * t, R = K.drift * amount, zc = R * (Math.cos(th) - 1), wc = R * Math.sin(th);
    const sw = K.swing * amount;
    const ci0 = Math.floor((X0 - Rw) / cell), ci1 = Math.floor((X0 + nx * g + Rw) / cell);
    const cj0 = Math.floor((Y0 - Rw) / cell), cj1 = Math.floor((Y0 + ny * g + Rw) / cell);
    let count = 0;
    for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) {
      const px = (ci + hash(ci, cj, s1, 1)) * cell, py = (cj + hash(ci, cj, s1, 2)) * cell;
      const hid = ci * 1048576 + cj;
      let a0 = HEAD.map.get(hid);
      if (a0 === undefined) { a0 = H.heading(px, py); HEAD.map.set(hid, a0); }
      const ang = a0 + K.bend * NB.noise4(px * fb, py * fb, zc, wc);
      const rho = TAU * hash(ci, cj, s1, 4);
      const ph = TAU * hash(ci, cj, s1, 3) + sw * (Math.sin(th + rho) - Math.sin(rho));
      const kx = Math.cos(ang) * k, ky = Math.sin(ang) * k;
      // the patch reaches Rw each way (a square): its weight and wave split into a factor along x and one
      // along y, each worked out by running products (no trig per point), then multiplied together
      const i0 = Math.max(0, Math.ceil((px - Rw - X0) / g)), i1 = Math.min(nx, Math.floor((px + Rw - X0) / g));
      const j0 = Math.max(0, Math.ceil((py - Rw - Y0) / g)), j1 = Math.min(ny, Math.floor((py + Rw - Y0) / g));
      if (i1 < i0 || j1 < j0) continue;
      count++;
      const nc = i1 - i0 + 1;
      if (!CX || CX.length < nc) { CX = new Float64Array(nc + 64); SX = new Float64Array(nc + 64); }
      {
        const dx = X0 + i0 * g - px, cr = Math.cos(kx * g), sr = Math.sin(kx * g);
        let w = Math.exp(-dx * dx * i2), q = Math.exp(-(2 * dx * g + g * g) * i2), c = Math.cos(kx * dx + ph), s = Math.sin(kx * dx + ph);
        for (let i = 0; i < nc; i++) {
          CX[i] = w * c; SX[i] = w * s;
          const c2 = c * cr - s * sr; s = c * sr + s * cr; c = c2;
          w *= q; q *= Q;
        }
      }
      const dy = Y0 + j0 * g - py, cr = Math.cos(ky * g), sr = Math.sin(ky * g);
      let w = Math.exp(-dy * dy * i2), q = Math.exp(-(2 * dy * g + g * g) * i2), c = Math.cos(ky * dy), s = Math.sin(ky * dy);
      for (let j = j0; j <= j1; j++) {
        const a = w * c, b = w * s;
        for (let i = 0, o = j * W1 + i0; i < nc; i++, o++) {
          re[o] += a * CX[i] - b * SX[i];
          im[o] += a * SX[i] + b * CX[i];
        }
        const c2 = c * cr - s * sr; s = c * sr + s * cr; c = c2;
        w *= q; q *= Q;
      }
    }
    return { re, im, count };
  }

  /* ---- the crests --------------------------------------------------------------------- */
  // Where the phase is 0: Im S crosses 0 with Re S > 0. Traced cell by cell (marching squares) and joined
  // into lines [{ pts, closed, tipA, tipB }]. A crest ends where S passes through 0 (a wave ends there):
  // that end is a tip. Two cells that share an edge work out the same point on it, so the pieces join.
  let BUF = null;
  function crests(re, im, nx, ny, X0, Y0, g) {
    const W1 = nx + 1, nH = nx * (ny + 1), nE = nH + W1 * ny;
    const P = []; // pieces: [eA, xA, yA, eB, xB, yB]; e < 0: a tip (unique)
    let tip = -1;
    const X = [0, 0, 0, 0], Y = [0, 0, 0, 0], E = [0, 0, 0, 0], RE = [0, 0, 0, 0];
    for (let j = 0; j < ny; j++) {
      const y0 = Y0 + j * g, y1 = y0 + g;
      for (let i = 0; i < nx; i++) {
        const ka = j * W1 + i, kb = ka + 1, kc = ka + W1 + 1, kd = ka + W1;
        const a = im[ka], b = im[kb], c = im[kc], d = im[kd];
        const cas = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (c > 0 ? 4 : 0) | (d > 0 ? 8 : 0);
        if (cas === 0 || cas === 15) continue;
        const x0 = X0 + i * g, x1 = x0 + g;
        // the crossing on side sd (0 top, 1 right, 2 bottom, 3 left): where, which edge, and Re S there
        const at = (sd, o) => {
          let t;
          if (sd === 0) { t = a / (a - b); X[o] = x0 + t * g; Y[o] = y0; E[o] = j * nx + i; RE[o] = re[ka] + t * (re[kb] - re[ka]); }
          else if (sd === 1) { t = b / (b - c); X[o] = x1; Y[o] = y0 + t * g; E[o] = nH + j * W1 + i + 1; RE[o] = re[kb] + t * (re[kc] - re[kb]); }
          else if (sd === 2) { t = d / (d - c); X[o] = x0 + t * g; Y[o] = y1; E[o] = (j + 1) * nx + i; RE[o] = re[kd] + t * (re[kc] - re[kd]); }
          else { t = a / (a - d); X[o] = x0; Y[o] = y0 + t * g; E[o] = nH + j * W1 + i; RE[o] = re[ka] + t * (re[kd] - re[ka]); }
        };
        // one piece from crossing u to crossing v: kept where Re S > 0, cut where it changes sign
        const piece = (u, v) => {
          const ru = RE[u], rv = RE[v];
          if (ru > 0 && rv > 0) P.push(E[u], X[u], Y[u], E[v], X[v], Y[v]);
          else if (ru > 0 || rv > 0) {
            const f = ru / (ru - rv), xm = X[u] + f * (X[v] - X[u]), ym = Y[u] + f * (Y[v] - Y[u]);
            if (ru > 0) P.push(E[u], X[u], Y[u], tip--, xm, ym);
            else P.push(tip--, xm, ym, E[v], X[v], Y[v]);
          }
        };
        let s1, s2, s3 = -1, s4 = -1;
        switch (cas) {
          case 1: case 14: s1 = 0; s2 = 3; break;
          case 2: case 13: s1 = 0; s2 = 1; break;
          case 3: case 12: s1 = 3; s2 = 1; break;
          case 4: case 11: s1 = 1; s2 = 2; break;
          case 6: case 9: s1 = 0; s2 = 2; break;
          case 7: case 8: s1 = 3; s2 = 2; break;
          case 5: // a and c above: joined through the middle (b and d cut off), or apart
            if (a + b + c + d > 0) { s1 = 0; s2 = 1; s3 = 3; s4 = 2; } else { s1 = 0; s2 = 3; s3 = 1; s4 = 2; }
            break;
          default: // 10: b and d above
            if (a + b + c + d > 0) { s1 = 0; s2 = 3; s3 = 1; s4 = 2; } else { s1 = 0; s2 = 1; s3 = 3; s4 = 2; }
        }
        at(s1, 0); at(s2, 1); piece(0, 1);
        if (s3 >= 0) { at(s3, 2); at(s4, 3); piece(2, 3); }
      }
    }
    if (!BUF || BUF.mark.length < nE) BUF = { mark: new Int32Array(nE).fill(-1), A: new Int32Array(nE), B: new Int32Array(nE), lv: 0 };
    const { mark, A, B } = BUF, lv = ++BUF.lv, n = P.length / 6;
    for (let s = 0; s < n; s++) for (let h = 0; h < 2; h++) {
      const e = P[6 * s + 3 * h];
      if (e < 0) continue;
      if (mark[e] !== lv) { mark[e] = lv; A[e] = s; B[e] = -1; } else B[e] = s;
    }
    const used = new Uint8Array(n), lines = [];
    // from piece s, entering by its crossing h
    const walk = (s, h) => {
      const e0 = P[6 * s + 3 * h], pts = [P[6 * s + 3 * h + 1], P[6 * s + 3 * h + 2]];
      let e = e0, tipB = false;
      while (s >= 0 && !used[s]) {
        used[s] = 1;
        const x = P[6 * s] === e ? 1 : 0; // its other crossing
        e = P[6 * s + 3 * x];
        pts.push(P[6 * s + 3 * x + 1], P[6 * s + 3 * x + 2]);
        if (e < 0) { tipB = true; break; }
        s = A[e] === s ? B[e] : A[e];
      }
      const closed = e0 >= 0 && e === e0 && !tipB && pts.length > 6;
      if (closed) pts.length -= 2;
      return { pts, closed, tipA: e0 < 0, tipB };
    };
    // open lines first (from a tip, or a crossing only one piece reaches: the grid's border), then the loops
    for (let s = 0; s < n; s++) {
      if (used[s]) continue;
      for (let h = 0; h < 2; h++) {
        const e = P[6 * s + 3 * h];
        if (e < 0 || B[e] === -1) { lines.push(walk(s, h)); break; }
      }
    }
    for (let s = 0; s < n; s++) if (!used[s]) lines.push(walk(s, 0));
    return lines;
  }

  // Round a line off (corner cutting), keeping an open line's ends.
  function smoothLine(pts, closed) {
    const n = pts.length / 2;
    if (n < 3) return pts;
    const q = [];
    if (!closed) q.push(pts[0], pts[1]);
    const m = closed ? n : n - 1;
    for (let i = 0; i < m; i++) {
      const x0 = pts[2 * i], y0 = pts[2 * i + 1], j = (i + 1) % n, x1 = pts[2 * j], y1 = pts[2 * j + 1];
      q.push(0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1, 0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1);
    }
    if (!closed) { q.splice(2, 2); q.splice(q.length - 2, 2); q.push(pts[2 * n - 2], pts[2 * n - 1]); }
    return q;
  }

  // Points evenly spaced along a line, about ds apart (an open line keeps both ends).
  function resample(pts, closed, ds) {
    const n = pts.length / 2;
    if (n < 2) return pts.slice();
    const segs = closed ? n : n - 1;
    let L = 0;
    for (let i = 0; i < segs; i++) { const j = (i + 1) % n; L += len(pts[2 * j] - pts[2 * i], pts[2 * j + 1] - pts[2 * i + 1]); }
    if (!(L > 0)) return [pts[0], pts[1]];
    const m = Math.max(closed ? 6 : 1, Math.round(L / ds)), step = L / m, out = [];
    let i = 0, s0 = 0, segL = len(pts[2] - pts[0], pts[3] - pts[1]);
    const count = closed ? m : m + 1;
    for (let k = 0; k < count; k++) {
      const target = Math.min(L, k * step);
      while (s0 + segL < target && i < segs - 1) {
        s0 += segL; i++;
        const j = (i + 1) % n;
        segL = len(pts[2 * j] - pts[2 * i], pts[2 * j + 1] - pts[2 * i + 1]);
      }
      const j = (i + 1) % n, f = segL > 0 ? clamp01((target - s0) / segL) : 0;
      out.push(pts[2 * i] + f * (pts[2 * j] - pts[2 * i]), pts[2 * i + 1] + f * (pts[2 * j + 1] - pts[2 * i + 1]));
    }
    return out;
  }

  /* ---- outlines ---------------------------------------------------------------------- */
  // The outline of a vein: a crest c (flat [x, y, …]) with a half-width on either side (rl on its left,
  // rr on its right, as it runs) and round ends; a loop gives its outer side and its inner one joined by a
  // seam (so the inside stays a hole). One polygon, clockwise, so a vein is one shape however lumpy.
  // Where the crest bends tighter than a side is wide, that side is held in (it would fold over itself).
  const CAP = 7; // points round each end
  function outline(c, rl, rr, closed) {
    const n = c.length / 2;
    if (n < 2) return null;
    let L0 = 0, rmax = 0;
    for (let i = 1; i < n; i++) L0 += len(c[2 * i] - c[2 * i - 2], c[2 * i + 1] - c[2 * i - 1]);
    for (let i = 0; i < n; i++) rmax = Math.max(rmax, rl[i], rr[i]);
    if (closed) L0 += len(c[0] - c[2 * n - 2], c[1] - c[2 * n - 1]);
    // (shorter than it is wide, or a ring too small to have a hole: the caller draws a dot)
    if (closed ? L0 < 3 * TAU * rmax : L0 < 0.5 * rmax) return null;
    const L = [], Rt = [];
    let lx = NaN, ly = NaN, rx = NaN, ry = NaN;
    const nrm = new Float64Array(2 * n);
    for (let i = 0; i < n; i++) {
      const a = closed ? (i - 1 + n) % n : Math.max(0, i - 1), b = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
      let tx = c[2 * b] - c[2 * a], ty = c[2 * b + 1] - c[2 * a + 1];
      const tl = len(tx, ty) || 1;
      tx /= tl; ty /= tl;
      const nx = -ty, ny = tx;
      nrm[2 * i] = nx; nrm[2 * i + 1] = ny;
      let hl = rl[i], hr = rr[i];
      if (a !== i && b !== i) {
        // signed curvature (> 0: turning toward the left side)
        const ux = c[2 * i] - c[2 * a], uy = c[2 * i + 1] - c[2 * a + 1], vx = c[2 * b] - c[2 * i], vy = c[2 * b + 1] - c[2 * i + 1];
        const lu = len(ux, uy), lv = len(vx, vy);
        if (lu > 0 && lv > 0) {
          const kp = (2 * (ux * vy - uy * vx)) / (lu * lv * (lu + lv));
          if (kp > 0) hl = Math.min(hl, 0.9 / kp); else if (kp < 0) hr = Math.min(hr, -0.9 / kp);
        }
      }
      const x = c[2 * i], y = c[2 * i + 1];
      // each side only moves on (a point that falls back behind the last is where it would fold)
      const plx = x + nx * hl, ply = y + ny * hl, prx = x - nx * hr, pry = y - ny * hr;
      if (!(L.length && (plx - lx) * tx + (ply - ly) * ty < 0)) { L.push(plx, ply); lx = plx; ly = ply; }
      if (!(Rt.length && (prx - rx) * tx + (pry - ry) * ty < 0)) { Rt.push(prx, pry); rx = prx; ry = pry; }
    }
    if (closed) {
      const A = area(L), B = area(Rt);
      let outer = Math.abs(A) >= Math.abs(B) ? L : Rt, inner = outer === L ? Rt : L;
      if (area(outer) < 0) outer = reverse(outer);
      if (area(inner) > 0) inner = reverse(inner);
      return outer.concat(outer[0], outer[1], inner, inner[0], inner[1]);
    }
    // left side on, round the end, right side back, round the start
    const out = L.slice();
    const cap = (i, from) => { // (from 0: left side to right, round the front; 1: right to left, round the back)
      const x = c[2 * i], y = c[2 * i + 1], a0 = Math.atan2(nrm[2 * i + 1], nrm[2 * i]);
      for (let k = 1; k < CAP; k++) {
        const f = k / CAP, ang = a0 + from * Math.PI - f * Math.PI, rad = lerp(from === 0 ? rl[i] : rr[i], from === 0 ? rr[i] : rl[i], f);
        out.push(x + Math.cos(ang) * rad, y + Math.sin(ang) * rad);
      }
    };
    cap(n - 1, 0);
    for (let k = Rt.length - 2; k >= 0; k -= 2) out.push(Rt[k], Rt[k + 1]);
    cap(0, 1);
    return area(out) < 0 ? reverse(out) : out;
  }
  function area(p) {
    let s = 0;
    for (let i = 0, n = p.length / 2; i < n; i++) { const j = (i + 1) % n; s += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1]; }
    return s / 2;
  }
  function reverse(p) {
    const q = new Array(p.length);
    for (let i = 0, n = p.length / 2; i < n; i++) { q[2 * i] = p[2 * (n - 1 - i)]; q[2 * i + 1] = p[2 * (n - 1 - i) + 1]; }
    return q;
  }

  /* ---- the picture -------------------------------------------------------------------- */
  const smooth01 = (a, b, v) => { const x = clamp01((v - a) / (b - a)); return x * x * (3 - 2 * x); };

  function build({ W, H, seed, p, colors, t = 0, anim, region }) {
    const n = colors.length, names = roles(n), m = n - 1;
    const amount = anim ? Math.max(0, anim.amount || 0) : 0;
    const R = PL.tools.region({ W, H, region });
    const Sz = Math.sqrt(W * H), lam = Sz / clamp(p.veins ?? 22, 4, 200);
    const half = lam * lerp(K.half[0], K.half[1], clamp01((p.weight ?? 55) / 100));
    const tips = clamp01((p.tips ?? 50) / 100), tipR = tips > 0 ? half * lerp(K.tip[0], K.tip[1], tips) : 0;
    const joinR = lam * K.join * clamp01((p.joins ?? 65) / 100);
    const wob = lam * K.wob * clamp01((p.wobble ?? 70) / 100), bead = K.bead * clamp01((p.beads ?? 95) / 100);
    // the grid over the region, with room for the tips, the joins and the wobble (finer when zoomed in)
    const z = region && region.z > 1 ? Math.min(region.z, 4) : 1;
    let g = lam / K.per / z;
    const pad = Math.max(tipR * (1 + K.tipVar), half * (1 + bead) * (1 + K.lobe)) + wob + joinR + 2 * g;
    const rw = R.x1 - R.x0 + 2 * pad, rh = R.y1 - R.y0 + 2 * pad;
    if (((rw / g) + 3) * ((rh / g) + 3) > K.maxCells) g = Math.sqrt((rw * rh) / K.maxCells) * 1.02;
    const X0 = R.x0 - pad, Y0 = R.y0 - pad, nx = Math.ceil(rw / g) + 1, ny = Math.ceil(rh / g) + 1;
    const F = waves(seed | 0, p, lam, X0, Y0, g, nx, ny, t, amount);
    const lines = crests(F.re, F.im, nx, ny, X0, Y0, g);

    // beads, wobble and tips: smooth noise over the world, changing round a circle in time
    const N = PL.noise.get((seed ^ 0x2f6b9e13) >>> 0), n4 = N.noise4;
    const th = TAU * t, Rt = K.drift * amount, zc = Rt * (Math.cos(th) - 1), wc = Rt * Math.sin(th);
    const fB = K.beadF / lam, fW = K.wobF / lam, fT = 0.35 / lam;
    const ds = Math.max((lam * K.step) / clamp(region && region.z > 0 ? region.z : 1, 0.25, 4), 0.35 * g); // (finer zoomed in, coarser zoomed out)
    // 1. every vein: points along its crest (moved sideways by the wobble), a half-width either side of
    //    each (beads; lopsided ones swell more on one side)
    const V = [];
    for (const ln of lines) {
      if (ln.pts.length < 4) continue;
      const c = resample(smoothLine(smoothLine(ln.pts, ln.closed), ln.closed), ln.closed, ds), cnt = c.length / 2;
      const q = c.slice(), rl = new Float64Array(cnt), rr = new Float64Array(cnt);
      for (let k = 0; k < cnt; k++) {
        const x = c[2 * k], y = c[2 * k + 1];
        const r = half * Math.max(K.neck, 1 + bead * n4(x * fB + 31.7, y * fB - 17.3, zc * 2, wc * 2));
        const lop = K.lobe * n4(x * fB - 11.9, y * fB + 23.5, zc * 2, wc * 2);
        rl[k] = r * (1 + lop); rr[k] = r * (1 - lop);
        if (cnt < 2 || !(wob > 0)) continue;
        const a = ln.closed ? (k - 1 + cnt) % cnt : Math.max(0, k - 1), b = ln.closed ? (k + 1) % cnt : Math.min(cnt - 1, k + 1);
        let tx = c[2 * b] - c[2 * a], ty = c[2 * b + 1] - c[2 * a + 1];
        const tl = len(tx, ty);
        if (!(tl > 0)) continue;
        const d = (wob * n4(x * fW + 7.3, y * fW - 3.1, zc * 1.5, wc * 1.5)) / tl;
        q[2 * k] = x - ty * d; q[2 * k + 1] = y + tx * d;
      }
      V.push({ q, rl, rr, cnt, closed: ln.closed, tipA: ln.tipA, tipB: ln.tipB });
    }
    const rad = (v, k) => 0.5 * (v.rl[k] + v.rr[k]);
    // 2. the tips (where a wave ends), and every point of every vein in a coarse grid, for finding what
    //    lies near a tip
    const cs = Math.max(lam * 0.5, joinR * 0.5);
    const gx0 = X0 - cs, gy0 = Y0 - cs, gnx = Math.ceil((nx * g + 2 * cs) / cs) + 1, gny = Math.ceil((ny * g + 2 * cs) / cs) + 1;
    const cellOf = (x, y) => clamp(Math.floor((y - gy0) / cs), 0, gny - 1) * gnx + clamp(Math.floor((x - gx0) / cs), 0, gnx - 1);
    let total = 0;
    for (const v of V) total += v.cnt;
    const start = new Int32Array(gnx * gny + 1), PV = new Int32Array(total), PK = new Int32Array(total);
    for (const v of V) for (let k = 0; k < v.cnt; k++) start[cellOf(v.q[2 * k], v.q[2 * k + 1]) + 1]++;
    for (let i = 0; i < gnx * gny; i++) start[i + 1] += start[i];
    const fill = start.slice(0, gnx * gny);
    const T = [];
    V.forEach((v, vi) => {
      for (let k = 0; k < v.cnt; k++) { const o = fill[cellOf(v.q[2 * k], v.q[2 * k + 1])]++; PV[o] = vi; PK[o] = k; }
      if (v.closed) return;
      for (const [isTip, k, k2] of [[v.tipA, 0, Math.min(v.cnt - 1, 5)], [v.tipB, v.cnt - 1, Math.max(0, v.cnt - 6)]]) {
        if (!isTip) continue;
        const x = v.q[2 * k], y = v.q[2 * k + 1];
        let dx = x - v.q[2 * k2], dy = y - v.q[2 * k2 + 1];
        const dl = len(dx, dy);
        if (dl > 0) { dx /= dl; dy /= dl; }
        T.push({ vi, k, x, y, dx, dy, rt: tipR * (1 + K.tipVar * n4(x * fT - 5.9, y * fT + 8.3, zc, wc)), js: 0 });
      }
    });
    // 3. joins: a tip reaches for the nearest vein ahead of it (not its own end); the join thins away as
    //    that vein gets out of reach, or when two veins are about as near (so it never jumps between them)
    const own = Math.ceil(1.5 / K.step);
    const bridges = [];
    if (joinR > 0) {
      for (const tp of T) {
        let best = Infinity, bv = -1, bk = -1, second = Infinity;
        const ix0 = clamp(Math.floor((tp.x - joinR - gx0) / cs), 0, gnx - 1), ix1 = clamp(Math.floor((tp.x + joinR - gx0) / cs), 0, gnx - 1);
        const iy0 = clamp(Math.floor((tp.y - joinR - gy0) / cs), 0, gny - 1), iy1 = clamp(Math.floor((tp.y + joinR - gy0) / cs), 0, gny - 1);
        for (let iy = iy0; iy <= iy1; iy++) for (let ix = ix0; ix <= ix1; ix++) {
          const cell = iy * gnx + ix;
          for (let u = start[cell]; u < start[cell + 1]; u++) {
            const vi = PV[u], k = PK[u];
            if (vi === tp.vi && Math.abs(k - tp.k) < own) continue;
            const v = V[vi], dx = v.q[2 * k] - tp.x, dy = v.q[2 * k + 1] - tp.y, d = len(dx, dy);
            if (!(d > 0) || d > joinR) continue;
            const cos = (dx * tp.dx + dy * tp.dy) / d;
            if (cos <= K.joinCos) continue;
            // (the score rises smoothly to nothing toward the edge of the cone ahead, so the best never jumps)
            const sc = d / ((0.6 + 0.4 * cos) * smooth01(K.joinCos, K.joinCos + 0.3, cos));
            if (sc < best) {
              if (bv >= 0 && bv !== vi) second = best;
              best = sc; bv = vi; bk = k;
            } else if (vi !== bv && sc < second) second = sc;
          }
        }
        if (bv < 0) continue;
        const js = (1 - smooth01(0.7 * joinR, joinR, best)) * smooth01(1.04, 1.3, second / best);
        if (js <= 0.02) continue;
        tp.js = js;
        bridges.push({ tp, v: V[bv], k: bk, js });
      }
    }
    // tips that lie close together (a vein just parting, or a short piece) shrink
    const tc = new Map(), tk = (x, y) => Math.floor((x - gx0) / cs) * 100003 + Math.floor((y - gy0) / cs);
    for (const tp of T) { const k = tk(tp.x, tp.y); let a = tc.get(k); if (!a) tc.set(k, (a = [])); a.push(tp); }
    for (const tp of T) {
      let near = Infinity;
      const ix = Math.floor((tp.x - gx0) / cs), iy = Math.floor((tp.y - gy0) / cs);
      for (let b = iy - 1; b <= iy + 1; b++) for (let a = ix - 1; a <= ix + 1; a++) {
        const L = tc.get(a * 100003 + b);
        if (L) for (const o of L) if (o !== tp) { const d = len(o.x - tp.x, o.y - tp.y); if (d < near) near = d; }
      }
      tp.rt *= smooth01(tp.rt, 3 * tp.rt, Math.min(near, cs)) * (1 - tp.js);
    }

    // 4. draw: the veins and the joins (one outline each), then the tips
    const scene = new PL.Scene(W, H, colors[0], 0);
    const layers = Array.from({ length: m }, (_, i) => scene.layer('veins-' + i, colors[1 + i], names[1 + i], 1 + i));
    // with more than one vein color, every patch of the world takes one (patches stay put as the veins move)
    const patch = m > 1 ? cells((seed ^ 0x3e1) | 0, lam * K.patch) : null, s3 = (seed * 31337 + 7) | 0;
    const tone = (x, y) => { const [a, b] = patch(x, y); return Math.min(m - 1, Math.floor(hash(a, b, s3, 5) * m)); };
    const layerAt = m === 1 ? () => layers[0] : (x, y) => layers[tone(x, y)];
    // a vein shorter than it is wide: a dot at its middle
    const dot = (v) => {
      let x = 0, y = 0, r = 0, d = 0;
      for (let j = 0; j < v.cnt; j++) { x += v.q[2 * j]; y += v.q[2 * j + 1]; r = Math.max(r, rad(v, j)); }
      x /= v.cnt; y /= v.cnt;
      if (v.closed) { for (let j = 0; j < v.cnt; j++) d += len(v.q[2 * j] - x, v.q[2 * j + 1] - y); d /= v.cnt; } // (a tiny ring: a dot as wide)
      PL.Scene.circle(layerAt(x, y), x, y, r + d);
    };
    for (const v of V) {
      if (v.cnt === 1) { PL.Scene.circle(layerAt(v.q[0], v.q[1]), v.q[0], v.q[1], rad(v, 0)); continue; }
      if (m === 1) { const o = outline(v.q, v.rl, v.rr, v.closed); if (o) PL.Scene.poly(layers[0], o); else dot(v); continue; }
      // the patch of every point (looked up every few points, and point by point between two that differ);
      // a vein that crosses patches is drawn in pieces, one per patch, each reaching a point into the next
      const n = v.cnt, ci = new Int8Array(n), at = (k) => tone(v.q[2 * k], v.q[2 * k + 1]);
      ci[0] = at(0);
      for (let k0 = 0; k0 < n - 1;) {
        const k1 = Math.min(n - 1, k0 + 4), c1 = at(k1);
        for (let j = k0 + 1; j < k1; j++) ci[j] = c1 === ci[k0] ? c1 : at(j);
        ci[k1] = c1; k0 = k1;
      }
      let first = 0;
      while (first < n && ci[first] === ci[0]) first++;
      if (first === n) { const o = outline(v.q, v.rl, v.rr, v.closed); if (o) PL.Scene.poly(layers[ci[0]], o); else dot(v); continue; }
      // (a loop is cut where its color changes, then drawn like an open vein)
      const off = v.closed ? first : 0, total = v.closed ? n + 1 : n;
      const idx = (j) => (j + off) % n;
      for (let a = 0; a < total - 1;) {
        let b = a;
        while (b + 1 < total - 1 && ci[idx(b + 1)] === ci[idx(a)]) b++;
        const lo = Math.max(0, a - (a > 0 ? 1 : 0)), hi = Math.min(total - 1, b + 1), c = [], rl = [], rr = [];
        for (let j = lo; j <= hi; j++) { const k = idx(j); c.push(v.q[2 * k], v.q[2 * k + 1]); rl.push(v.rl[k]); rr.push(v.rr[k]); }
        const o = outline(c, rl, rr, false);
        if (o) PL.Scene.poly(layers[ci[idx(a)]], o);
        else { const h = (c.length >> 2) << 1; PL.Scene.circle(layers[ci[idx(a)]], c[h], c[h + 1], Math.max(...rl, ...rr)); }
        a = b + 1;
      }
    }
    for (const B of bridges) {
      const { tp, v, k, js } = B, v0 = V[tp.vi];
      const ex = v.q[2 * k], ey = v.q[2 * k + 1], d = len(ex - tp.x, ey - tp.y);
      // a curve that leaves the tip straight ahead and meets the other vein's crest; it grows out of the tip
      // as that vein comes into reach (js: how far along it gets), its round end carrying what is left of
      // the tip
      const cx = tp.x + tp.dx * d * 0.5, cy = tp.y + tp.dy * d * 0.5, ue = js;
      const steps = Math.max(2, Math.ceil((d * ue) / ds));
      const r0 = rad(v0, tp.k), r1 = Math.max(rad(v, k), half);
      const c = [], rr = new Float64Array(steps + 1);
      for (let s = 0; s <= steps; s++) {
        const u = (s / steps) * ue, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), cc = u * u;
        c.push(a * tp.x + b * cx + cc * ex, a * tp.y + b * cy + cc * ey);
        rr[s] = lerp(r0, r1, u) * (1 - 0.25 * Math.sin(Math.PI * u));
      }
      // (a bridge only just setting out is left to the tip)
      if (d * ue > 0.6 * r0) { const o = outline(c, rr, rr, false); if (o) PL.Scene.poly(layerAt(tp.x, tp.y), o); }
      tp.x = c[2 * steps]; tp.y = c[2 * steps + 1]; tp.end = rr[steps];
    }
    let tipsN = 0;
    for (const tp of T) {
      if (tp.rt > (tp.end ?? rad(V[tp.vi], tp.k))) { PL.Scene.circle(layerAt(tp.x, tp.y), tp.x, tp.y, tp.rt); tipsN++; }
    }
    scene.layers = scene.layers.filter((L) => L.p.length || L.c.length);
    scene.status = `${V.length.toLocaleString()} vein${V.length === 1 ? '' : 's'} · ${bridges.length.toLocaleString()} joins · ${tipsN.toLocaleString()} tips`;
    return scene;
  }

  PL.tools.register({
    id: 'vein',
    name: 'Vein',
    kind: 'Organic',
    tagline: 'Beaded maze',
    about: 'A maze of beaded veins over a flat ground, like a leaf, a fingerprint or a coral: families of parallel veins sweep across the frame and meet in seams and hubs, swelling into beads along the way; where a vein ends it reaches for the next one or ends in a round tip. In the animation the veins slide, reach out, part and join again while the beads swell and shrink.',
    inks: {
      min: 2, max: 6, roles, fit, spec, add, generate,
      span: () => 2, // Invert swaps the ground and the first vein color
      hint: 'Ground first, then the veins: one color, or a few (each family of veins takes one).',
    },
    palettes: PALETTES,
    params: PARAMS,
    animLabel: 'Amount',
    animHint: 'How much the veins move over the loop (0: still)',
    defaults: {
      palette: 'Berry', // the preset the style opens on (its card's colors)
      anim: { amount: 0.5, fps: 30, frames: 240 }, // an 8 s loop
      fx: {},
    },
    build,
    zoom: true, // draws any region of its world (General's Rotation and Size)
    _K: K,
    _waves: waves,
    _crests: crests,
  });
})();
