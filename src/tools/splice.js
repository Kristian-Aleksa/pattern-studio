/* ==========================================================================
   tools/splice.js — Splice: cut-up riso.

   1. Field: one field of soft hills (fractal noise), banded into Steps inks.
   2. Cut: the frame is cut into columns, rows or blocks. Every piece prints
      the field slid along by its own amount (Shift) in its own inks, and most
      pieces (Mix) print through a screen: round dots, mountain lines or an
      ordered pixel mosaic. A screen spreads each step into the next, so the
      bands melt into each other in dots, lines or blocks.
   3. Outlines: the key ink (the first color) traces a contour line through
      the middle of every step. Lines thicken where the hills flatten out.
   4. Arcs: thin circular arcs in the inks run across the whole frame.
   5. Grain: a fine riso mottle in every ink.
   6. Animation: the field drifts slowly in one direction behind the cuts,
      screens and arcs, which stay put. Over a loop every hill drifts one
      stride and melts into the one that followed it, so the loop is seamless.
   General's Size and Rotation show more or less of the same world: the
   frame's cuts carry on past it at the same spacing (one piece: no cuts at
   all), every piece past the frame with its own screen, inks and slide, and
   arcs of their own (never a repeat); the mottle stays as fine at any Size.
   ========================================================================== */
(() => {
  const { hash } = PL.rng;

  // The key (outline) ink first, then the print inks.
  const PALETTES = [
    { name: 'Night', colors: ['#191919', '#FF2879', '#8B0051', '#ECC4F1', '#DABCE7', '#24148E', '#4064F6'] },
    { name: 'Sunset', colors: ['#1C111A', '#FC3162', '#FF574B', '#CA9874', '#F9CD6E', '#D4DBC2'] },
    { name: 'Mint', colors: ['#14211C', '#00A88F', '#7FE0C2', '#F4F1E4', '#FFB238', '#E8505B'] },
    { name: 'Cobalt', colors: ['#121426', '#2747D9', '#7FA4FF', '#F2EEE3', '#FF6B4A', '#FFD3C2'] },
    { name: 'Citrus', colors: ['#1E1A12', '#FFC933', '#FF7A1A', '#F6EFD8', '#8DC63F', '#2E7D5B'] },
    { name: 'Grape', colors: ['#1A1023', '#7B3FE4', '#C9A7FF', '#FF5FA2', '#FFE3F0', '#3A1A6B'] },
    { name: 'Lagoon', colors: ['#0E1D24', '#00B2C9', '#A6EEF5', '#F5F0E6', '#FF8C69', '#0B5D73'] },
    { name: 'Rust', colors: ['#20140F', '#C2462B', '#F28C54', '#EFD9B4', '#6E8B74', '#F4F1EA'] },
    { name: 'Mono', colors: ['#141414', '#4A4A4A', '#8F8F8F', '#CFCFCF', '#F2F2F0'] },
    { name: 'Duo', colors: ['#16161D', '#FF4F79', '#F3EEE6'] },
  ];

  const roles = (n) => ['Key', ...Array.from({ length: n - 1 }, (_, i) => 'Ink ' + (i + 2))];
  const spec = (n) => ({ ramp: Math.min(3, n), accents: Math.max(0, n - 3) });

  // "New colors": riso sets: a near-black key, two vivid inks, a deep one and two pale ones.
  function generate(n, rng) {
    const C = PL.color;
    const h = rng.float(0, 360);
    const key = C.lch(rng.float(0.15, 0.2), rng.float(0.01, 0.04), h + rng.float(-40, 40));
    const pool = [
      C.lch(rng.float(0.62, 0.7), rng.float(0.2, 0.25), h),                       // vivid
      C.lch(rng.float(0.55, 0.68), rng.float(0.17, 0.24), h + rng.pick([120, 150, 180, 210])), // vivid, across the wheel
      C.lch(rng.float(0.3, 0.4), rng.float(0.12, 0.18), h + rng.float(-30, 30)),  // deep
      C.lch(rng.float(0.88, 0.94), rng.float(0.03, 0.07), h + rng.float(-40, 40)), // pale
      C.lch(rng.float(0.82, 0.9), rng.float(0.05, 0.1), h + rng.pick([90, 180, 270])), // pale, another hue
      C.lch(rng.float(0.74, 0.84), rng.float(0.12, 0.18), h + rng.float(40, 80)),  // bright
      C.lch(rng.float(0.45, 0.55), rng.float(0.15, 0.21), h + rng.float(200, 260)),
    ];
    const out = [key];
    for (let i = 0; out.length < n; i++) out.push(i < pool.length ? pool[i] : C.lch(rng.float(0.4, 0.9), rng.float(0.08, 0.22), rng.float(0, 360)));
    return out.slice(0, n);
  }

  // + adds an ink that stands apart from the others in hue and lightness.
  function add(colors) {
    const C = PL.color;
    const c = colors.slice();
    const hs = c.slice(1).map((x) => C.hexToLch(x)[2]);
    let best = 0, bd = -1;
    for (let k = 0; k < 24; k++) {
      const hh = k * 15;
      const d = hs.length ? Math.min(...hs.map((x) => Math.abs((((hh - x) % 360) + 540) % 360 - 180))) : 180;
      if (d > bd) { bd = d; best = hh; }
    }
    c.push(C.lch(c.length % 2 ? 0.66 : 0.86, c.length % 2 ? 0.2 : 0.08, best));
    return c;
  }

  function fit(colors, n) {
    let c = (colors || []).map(PL.color.normHex).filter(Boolean);
    if (!c.length) c = PALETTES[0].colors.slice();
    if (c.length > n) return c.slice(0, n);
    while (c.length < n) c = add(c);
    return c;
  }

  const S = (section, key, label, min, max, def, extra = {}) => ({ section, key, label, type: 'range', min, max, def, step: 1, ...extra });
  const PARAMS = [
    { section: 'Cut', key: 'into', label: 'Into', type: 'seg', def: 'columns', rand: false,
      options: [{ value: 'columns', label: 'Columns' }, { value: 'rows', label: 'Rows' }, { value: 'blocks', label: 'Blocks' }] },
    S('Cut', 'pieces', 'Pieces', 1, 32, 1, { rand: false, hint: 'How many pieces the frame is cut into' }),
    S('Cut', 'shift', 'Shift', 0, 100, 35, { unit: '%', rand: [20, 55], hint: 'How far each piece slides the field along its cut' }),
    S('Field', 'scale', 'Scale', 0, 100, 50, { unit: '%', rand: [35, 65], hint: 'Size of the hills' }),
    S('Field', 'steps', 'Steps', 2, 14, 5, { rand: false, hint: 'How many ink bands the hills are cut into' }),
    S('Field', 'outlines', 'Outlines', 0, 100, 40, { unit: '%', rand: [25, 55], hint: 'Weight of the contour lines in the key ink' }),
    S('Screen', 'size', 'Size', 0, 100, 40, { unit: '%', rand: [30, 55], hint: 'Size of the dots, lines and pixels' }),
    S('Screen', 'mix', 'Mix', 0, 100, 70, { unit: '%', rand: [55, 90], hint: 'How many pieces print through a screen (the rest print flat)' }),
    S('Screen', 'grain', 'Grain', 0, 100, 18, { unit: '%', rand: false, hint: 'Riso mottle in the inks' }),
    S('Arcs', 'arcs', 'Arcs', 0, 12, 5, { rand: [3, 7], hint: 'Thin arcs across the frame' }),
    S('Arcs', 'weight', 'Weight', 0, 100, 45, { unit: '%', rand: false, hint: 'Arc line weight' }),
    S('Arcs', 'bend', 'Bend', 0, 100, 55, { unit: '%', rand: [40, 70], hint: 'From straight lines to tight curves' }),
  ];

  // Shape constants: lengths in units of the frame's long edge (L).
  const K = {
    // field
    lam0: 0.2, lamK: 0.0065, // widest hills: lam0 + lamK * Scale (x L)
    oct: 5, gain: 0.55, warp: 0.25,
    band: 1.45,       // step width in standard deviations of the field (5 steps or fewer)
    cells: 7,         // field samples per finest wavelength
    // cut
    vary: 0.9,        // piece sizes vary by up to this much
    shift: 0.7,       // a piece slides up to Shift * this (x L)
    // screens
    p0: 0.006, pK: 0.00033, // screen period: p0 + pK * Size (x L)
    mults: [0.4, 0.7, 1, 1.35], multW: [0.12, 0.25, 0.33, 0.3],
    lineK: 1, pixK: 1, // lines and pixels relative to the dot pitch
    amp: [0.65, 0.85, 0.92], // how far each screen (dots, lines, pixels) spreads a step into its neighbours (in steps)
    // outlines
    out0: 0.006, outK: 0.1, // half-width of an outline in steps: out0 + outK * Outlines^1.2
    // arcs
    arcR: [4, 0.22],  // radius from Bend 0 to 100 (x L)
    arcLen: [0.45, 1.3],
    arcW0: 0.0006, arcWK: 0.005, // arc width: arcW0 + arcWK * Weight (x L)
    // grain
    grainRes: 900,    // grain cells across L
    grainA: 0.3,      // brightness swing at Grain 100 %
    // animation
    drift: 0.2,       // the field drifts Amount * this per loop (x L)
  };

  /* ---- layout: pieces, their screens, inks and slides ------------------------ */
  const layoutCache = new Map();
  function layoutFor(aw, ah, seed, p) {
    const key = [aw.toFixed(4), ah.toFixed(4), seed, p.into, p.pieces, p.shift, p.mix, p.size].join('|');
    const hit = layoutCache.get(key);
    if (hit) return hit;
    const r = PL.rng.create((seed ^ 0x2f6b9a13) >>> 0);
    const N = Math.max(1, Math.round(p.pieces));
    // n parts over [a, b] with varied sizes
    const split = (n, a, b) => {
      const w = [];
      for (let k = 0; k < n; k++) w.push(1 - K.vary / 2 + K.vary * r.next());
      const sum = w.reduce((x, y) => x + y, 0);
      const out = [a];
      let acc = 0;
      for (let k = 0; k < n; k++) { acc += w[k]; out.push(k === n - 1 ? b : a + ((b - a) * acc) / sum); }
      return out;
    };
    const rects = [];
    let C = 0, counts = null; // blocks: the columns and the blocks in each
    if (p.into === 'rows') {
      const ys = split(N, 0, ah);
      for (let k = 0; k < N; k++) rects.push([0, ys[k], aw, ys[k + 1], 'x']);
    } else if (p.into === 'blocks') {
      C = Math.max(1, Math.min(N, Math.round(Math.sqrt(1.5 * N * (aw / ah)))));
      counts = Array(C).fill(Math.floor(N / C));
      for (let k = 0; k < N - C * Math.floor(N / C); k++) counts[(k * 7 + Math.floor(r.next() * C)) % C]++;
      const xs = split(C, 0, aw);
      for (let c = 0; c < C; c++) {
        const ys = split(counts[c], 0, ah);
        for (let k = 0; k < counts[c]; k++) rects.push([xs[c], ys[k], xs[c + 1], ys[k + 1], 'xy']);
      }
    } else {
      const xs = split(N, 0, aw);
      for (let k = 0; k < N; k++) rects.push([xs[k], 0, xs[k + 1], ah, 'y']);
    }
    const base = K.p0 + K.pK * p.size;
    let prev = '';
    const pieces = rects.map(([x0, y0, x1, y1, axis]) => {
      const q = pieceProps(r, axis, prev, N, base, p);
      prev = q.screen;
      return Object.assign({ x0, y0, x1, y1 }, q);
    });
    const out = { pieces, dir: hash(seed, 5, 3, 0xd21f7) * Math.PI * 2, C, counts };
    if (layoutCache.size > 24) layoutCache.delete(layoutCache.keys().next().value);
    layoutCache.set(key, out);
    return out;
  }
  // A piece's screen, inks and slide, from r. Mix: the share of pieces that print through a screen;
  // neighbours (prev: the one before) rarely repeat one.
  const KINDS = ['dots', 'lines', 'pixels'];
  function pieceProps(r, axis, prev, N, base, p) {
    let screen = 'flat';
    const u0 = r.next(), u1 = r.next();
    if (u0 < p.mix / 100) {
      screen = KINDS[Math.floor(u1 * 3) % 3];
      if (screen === prev && r.next() < 0.7) screen = KINDS[(KINDS.indexOf(screen) + 1 + Math.floor(r.next() * 2)) % 3];
    }
    let u = r.next(), mult = K.mults[K.mults.length - 1];
    for (let k = 0; k < K.mults.length; k++) { if (u < K.multW[k]) { mult = K.mults[k]; break; } u -= K.multW[k]; }
    const period = base * mult * (screen === 'lines' ? K.lineK : screen === 'pixels' ? K.pixK : 1);
    // Slide: columns slide up or down, rows sideways, blocks any way.
    const mag = (N > 1 ? (p.shift / 100) * K.shift : 0) * (0.35 + 0.65 * r.next()) * (r.next() < 0.5 ? -1 : 1);
    const ang = r.next() * Math.PI * 2;
    const off = axis === 'x' ? [mag, 0] : axis === 'y' ? [0, mag] : [mag * Math.cos(ang), mag * Math.sin(ang)];
    return { screen, period, phase: [r.next(), r.next()], off, inkU: r.next(), inkDir: r.next() < 0.5 ? 1 : -1 };
  }

  // The world's pieces over a part of it, R (L units; General's Size and Rotation). The frame's cuts
  // carry on past it at the same spacing, the frame's outer pieces reaching on past its edges to the
  // next cut (so the frame's edges are no cuts); every piece past the frame takes its own screen, inks
  // and slide from its own hashes. One piece: no cuts at all, the frame's piece everywhere.
  function worldPieces(aw, ah, seed, p, R) {
    const lay = layoutFor(aw, ah, seed, p), fp = lay.pieces;
    const N = Math.max(1, Math.round(p.pieces));
    const at = (pc, x0, y0, x1, y1) => Object.assign({}, pc, { x0, y0, x1, y1, sx0: pc.x0, sy0: pc.y0 }); // (sx0, sy0: its screen's seed, the frame's)
    if (N === 1) return [at(fp[0], -Infinity, -Infinity, Infinity, Infinity)];
    const base = K.p0 + K.pK * p.size;
    const rngOf = (a, b) => PL.rng.create((Math.imul(seed | 0, 0x7feb352d) ^ Math.imul(a, 0x9e3779b1) ^ Math.imul(b, 0x85ebca77) ^ 0x2f6b9a13) >>> 0);
    const raw = (a, b) => { const r = rngOf(a, b), u0 = r.next(), u1 = r.next(); return u0 < p.mix / 100 ? KINDS[Math.floor(u1 * 3) % 3] : 'flat'; };
    // the cuts along one axis over [lo, hi]: the frame's (fc: 0 .. len; null for a strip that misses
    // the frame) carried on both ways, typ apart give or take Vary; strips numbered from the frame's first
    const strips = (fc, typ, lo, hi, salt) => {
      const step = (k) => typ * (1 - K.vary / 2 + K.vary * hash(seed, k, salt, 0x5b1));
      const n = fc ? fc.length - 1 : 0, len = fc ? fc[n] : 0;
      // the frame's outer strips reach past its edges by a share of a step (a strip off the frame: its
      // first cut anywhere within a step of 0)
      const left = fc ? -step(-1) * (0.15 + 0.85 * hash(seed, -1, salt, 0x5b2)) : -step(-1) * hash(seed, -1, salt, 0x5b2);
      const right = fc ? len + step(n) * (0.15 + 0.85 * hash(seed, n, salt, 0x5b2)) : left;
      const out = [];
      if (fc) for (let k = 0; k < n; k++) out.push({ k, a: k ? fc[k] : left, b: k < n - 1 ? fc[k + 1] : right });
      // on to the right, then to the left
      for (let k = n, a = right; a < hi && k < n + 4096; k++) { const b = a + step(k); if (b > lo) out.push({ k, a, b }); a = b; }
      for (let k = -1, b = left; b > lo && k > -4096; k--) { const a = b - step(k); if (a < hi) out.push({ k, a, b }); b = a; }
      return out.filter((q) => q.b > lo && q.a < hi);
    };
    const out = [];
    // a piece: the frame's own (own) or one of the world's (kx, ky: its strip and block numbers; prev:
    // the piece before it, the frame's own or one of the world's)
    const piece = (own, kx, ky, axis, x0, y0, x1, y1, prevOwn, pkx, pky) => {
      if (own) return out.push(at(own, x0, y0, x1, y1));
      const q = pieceProps(rngOf(kx, ky), axis, prevOwn ? prevOwn.screen : raw(pkx, pky), N, base, p);
      out.push(Object.assign(q, { x0, y0, x1, y1, sx0: 7.7 + 0.0131 * kx, sy0: 3.3 + 0.0173 * ky }));
    };
    if (p.into === 'rows') {
      const fc = fp.map((pc) => pc.y0).concat([fp[N - 1].y1]);
      for (const q of strips(fc, ah / N, R.y0, R.y1, 0x71)) piece(q.k >= 0 && q.k < N ? fp[q.k] : null, 0, q.k, 'x', -Infinity, q.a, Infinity, q.b, q.k === N ? fp[N - 1] : null, 0, q.k - 1);
    } else if (p.into === 'blocks') {
      const { C, counts } = lay;
      const firsts = counts.map((_, c) => counts.slice(0, c).reduce((a, b) => a + b, 0));
      const xc = firsts.map((i) => fp[i].x0).concat([fp[N - 1].x1]);
      for (const q of strips(xc, aw / C, R.x0, R.x1, 0x72)) {
        const own = q.k >= 0 && q.k < C;
        const cnt = own ? counts[q.k] : Math.max(1, Math.floor(N / C) + (hash(seed, q.k, 0x73, 0x5b3) < (N % C) / C ? 1 : 0));
        const yc = own ? fp.slice(firsts[q.k], firsts[q.k] + cnt).map((pc) => pc.y0).concat([ah]) : null;
        for (const v of strips(yc, ah / cnt, R.y0, R.y1, 0x9000 + q.k)) {
          piece(own && v.k >= 0 && v.k < cnt ? fp[firsts[q.k] + v.k] : null, q.k, v.k, 'xy', q.a, v.a, q.b, v.b, own && v.k === cnt ? fp[firsts[q.k] + cnt - 1] : null, q.k, v.k - 1);
        }
      }
    } else {
      const fc = fp.map((pc) => pc.x0).concat([fp[N - 1].x1]);
      for (const q of strips(fc, aw / N, R.x0, R.x1, 0x70)) piece(q.k >= 0 && q.k < N ? fp[q.k] : null, q.k, 0, 'y', q.a, -Infinity, q.b, Infinity, q.k === N ? fp[N - 1] : null, q.k - 1, 0);
    }
    return out;
  }

  // Each piece's inks: a run of neighbouring palette inks, starting anywhere and running
  // either way round the palette, one ink per step (wrapping round if there are more steps).
  function rampFor(piece, n, S) {
    const start = Math.floor(piece.inkU * n) % n, dir = piece.inkDir;
    return Int32Array.from({ length: S }, (_, k) => (((start + dir * k) % n) + n) % n);
  }

  // Round dots: the share of a screen cell a circle of radius r (r^2 indexed, cell units)
  // covers, so a dot's area grows in step with the field; past touching, the gaps shrink to stars.
  const DOT = (() => {
    const n = 1024, t = new Float32Array(n + 1);
    for (let k = 0; k <= n; k++) {
      const r2 = (k / n) * 0.5, r = Math.sqrt(r2);
      let a = Math.PI * r2;
      if (r > 0.5) a -= 4 * (r2 * Math.acos(0.5 / r) - 0.5 * Math.sqrt(r2 - 0.25));
      t[k] = 1 - Math.min(1, a);
    }
    return t;
  })();

  /* ---- the field ----------------------------------------------------------------
     Samples of the (standardised) field on a lattice of G points per L, shared by
     every piece, frame and export size. The lattice is computed in 32 x 32 tiles on
     demand and cached, so sliding a piece (Shift) or animating reuses what's there. */
  const TILE = 32;
  const statCache = new Map(), tileCache = new Map(), rhoCache = new Map();
  const fieldFn = (seed, scale) => {
    const N = PL.noise.get((seed ^ 0x6c8e9cf5) >>> 0);
    const f0 = 1 / (K.lam0 + K.lamK * scale);
    return (x, y) => {
      const u = x * f0, v = y * f0;
      const wx = N.fbm4(u * 0.9 + 31.7, v * 0.9 - 12.9, 4.1, 0, 2, 0.5), wy = N.fbm4(u * 0.9 - 17.3, v * 0.9 + 25.1, 7.3, 0, 2, 0.5);
      return N.fbm4(u + K.warp * wx, v + K.warp * wy, 0.37, 0, K.oct, K.gain);
    };
  };
  const gridRes = (scale) => {
    const finest = (K.lam0 + K.lamK * scale) / 2 ** (K.oct - 1);
    return Math.max(80, Math.min(420, Math.round(K.cells / finest)));
  };
  // Mean and spread of the field, so every piece and every export bands it the same way.
  function stats(seed, scale) {
    const key = seed + '|' + scale;
    let s = statCache.get(key);
    if (s) return s;
    const F = fieldFn(seed, scale), r = PL.rng.create(0x51a7);
    const M = 1200, xs = new Float64Array(M), ys = new Float64Array(M), vs = new Float64Array(M);
    let m = 0;
    for (let i = 0; i < M; i++) { xs[i] = r.float(-0.5, 1.5); ys[i] = r.float(-0.5, 1.5); vs[i] = F(xs[i], ys[i]); m += vs[i]; }
    m /= M;
    let v = 0;
    for (let i = 0; i < M; i++) v += (vs[i] - m) ** 2;
    s = { mu: m, sd: Math.sqrt(v / M) || 1, xs, ys, vs, F, G: gridRes(scale) };
    if (statCache.size > 16) statCache.delete(statCache.keys().next().value);
    statCache.set(key, s);
    return s;
  }
  // How alike the field is to itself one drift stride away (keeps the loop's contrast steady).
  function rhoAt(st, seed, scale, vx, vy) {
    const key = [seed, scale, vx.toFixed(5), vy.toFixed(5)].join('|');
    let r = rhoCache.get(key);
    if (r !== undefined) return r;
    let acc = 0;
    for (let i = 0; i < 300; i++) acc += ((st.vs[i] - st.mu) / st.sd) * ((st.F(st.xs[i] + vx, st.ys[i] + vy) - st.mu) / st.sd);
    r = Math.max(-0.5, Math.min(0.99, acc / 300));
    if (rhoCache.size > 32) rhoCache.delete(rhoCache.keys().next().value);
    rhoCache.set(key, r);
    return r;
  }
  function tile(st, seed, scale, ti, tj) {
    const key = seed + '|' + scale + '|' + ti + '|' + tj;
    let t = tileCache.get(key);
    if (t) { tileCache.delete(key); tileCache.set(key, t); return t; } // most recently used last
    const { F, mu, sd, G } = st, inv = 1 / sd;
    t = new Float32Array(TILE * TILE);
    for (let j = 0; j < TILE; j++) {
      const y = (tj * TILE + j) / G;
      for (let i = 0; i < TILE; i++) t[j * TILE + i] = (F((ti * TILE + i) / G, y) - mu) * inv;
    }
    if (tileCache.size > 900) tileCache.delete(tileCache.keys().next().value);
    tileCache.set(key, t);
    return t;
  }
  // The lattice over a window [wx0, wx1] x [wy0, wy1] (in L), with a margin for bicubic taps.
  // It's assembled in a scratch buffer that the next piece reuses.
  let gridBuf = new Float32Array(1 << 16), blendBuf = new Float32Array(1 << 16);
  function grid(st, seed, scale, wx0, wy0, wx1, wy1) {
    const G = st.G;
    const i0 = Math.floor(wx0 * G) - 2, j0 = Math.floor(wy0 * G) - 2, i1 = Math.ceil(wx1 * G) + 3, j1 = Math.ceil(wy1 * G) + 3;
    const gw = i1 - i0 + 1, gh = j1 - j0 + 1;
    if (gridBuf.length < gw * gh) gridBuf = new Float32Array(gw * gh * 1.25);
    const z = gridBuf;
    const ti0 = Math.floor(i0 / TILE), ti1 = Math.floor(i1 / TILE), tj0 = Math.floor(j0 / TILE), tj1 = Math.floor(j1 / TILE);
    for (let tj = tj0; tj <= tj1; tj++) {
      for (let ti = ti0; ti <= ti1; ti++) {
        const t = tile(st, seed, scale, ti, tj);
        const ia = Math.max(i0, ti * TILE), ib = Math.min(i1, ti * TILE + TILE - 1);
        const ja = Math.max(j0, tj * TILE), jb = Math.min(j1, tj * TILE + TILE - 1);
        for (let j = ja; j <= jb; j++) {
          const src = (j - tj * TILE) * TILE + (ia - ti * TILE);
          z.set(t.subarray(src, src + (ib - ia + 1)), (j - j0) * gw + (ia - i0));
        }
      }
    }
    return { z, i0, j0, gw, gh, G };
  }

  // A fine riso mottle: 256 x 256 levels (0-31), tiled.
  const GRAIN = (() => {
    const r = PL.rng.create(0x9a17), n = 256, a = new Float32Array(n * n), out = new Uint8Array(n * n);
    for (let k = 0; k < n * n; k++) a[k] = r.next();
    // a touch of clumping: blend each value with its neighbours
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const k = y * n + x, s = (a[k] * 2 + a[y * n + ((x + 1) & 255)] + a[((y + 1) & 255) * n + x]) / 4;
      out[k] = Math.max(0, Math.min(31, Math.round((s - 0.5) * 2.4 * 15.5 + 15.5)));
    }
    return out;
  })();

  /* ---- arcs ------------------------------------------------------------------------ */
  function arcsFor(aw, ah, seed, p, n) {
    const out = [];
    const bend = p.bend / 100;
    for (let i = 0; i < Math.round(p.arcs); i++) {
      const h = (k) => hash(seed, i, k, 0xa2c5);
      const R = K.arcR[0] * Math.pow(K.arcR[1] / K.arcR[0], Math.pow(bend, 0.8)) * (0.7 + 0.6 * h(1));
      const px = aw * (0.1 + 0.8 * h(2)), py = ah * (0.1 + 0.8 * h(3));
      const tang = h(4) * Math.PI * 2, side = h(5) < 0.5 ? -1 : 1;
      const cx = px - Math.sin(tang) * R * side, cy = py + Math.cos(tang) * R * side;
      const len = K.arcLen[0] + (K.arcLen[1] - K.arcLen[0]) * h(6);
      const sweep = Math.min(Math.PI * 1.8, len / R), at = Math.atan2(py - cy, px - cx), u = h(7);
      out.push({ cx, cy, R, a0: at - sweep * u, a1: at + sweep * (1 - u), ink: Math.floor(h(8) * n) % n, w: 0.8 + 0.4 * h(9) });
    }
    return out;
  }

  // The world's arcs over a part of it, R (L units; General's Size and Rotation): the frame's own, and past
  // it frame-sized tiles with arcs of their own (their own seeds). A tile's arc that would cross the
  // frame is left out, so the frame keeps just its own arcs at any Size.
  function worldArcs(aw, ah, seed, p, n, R) {
    const out = arcsFor(aw, ah, seed, p, n), reach = K.arcLen[1] + 0.02;
    const crosses = (a) => {
      for (let k = 0; k <= 256; k++) {
        const t = a.a0 + ((a.a1 - a.a0) * k) / 256, x = a.cx + a.R * Math.cos(t), y = a.cy + a.R * Math.sin(t);
        if (x > 0 && x < aw && y > 0 && y < ah) return true;
      }
      return false;
    };
    for (let tj = Math.floor((R.y0 - reach) / ah); tj <= Math.floor((R.y1 + reach) / ah); tj++) {
      for (let ti = Math.floor((R.x0 - reach) / aw); ti <= Math.floor((R.x1 + reach) / aw); ti++) {
        if (!ti && !tj) continue;
        const ts = (Math.imul(seed | 0, 0x3c6ef372) ^ Math.imul(ti, 0x9e3779b1) ^ Math.imul(tj, 0x85ebca77)) | 0;
        for (const a of arcsFor(aw, ah, ts, p, n)) {
          a.cx += ti * aw; a.cy += tj * ah;
          if (!crosses(a)) out.push(a);
        }
      }
    }
    return out;
  }

  /* ---- paint ------------------------------------------------------------------------- */
  let pvImg = null;
  function previewImage(ctx, W, H) {
    if (!pvImg || pvImg.width !== W || pvImg.height !== H) pvImg = ctx.createImageData(W, H);
    return pvImg;
  }

  // map (General's Rotation and Size): the canvas (cw x ch) and the part of the world it shows (its pixel
  // (x, y) shows the world at (mx + x ms, my + y ms), frame px). The pieces, screens, outlines and arcs are
  // the world's; the mottle stays one cell per canvas pixel or so.
  function paint({ ctx, W, H, seed, p, colors, t = 0, anim, preview = false, map }) {
    const L = Math.max(W, H), aw = W / L, ah = H / L;
    const cw = map ? map.cw : W, ch = map ? map.ch : H, mx = map ? map.x0 : 0, my = map ? map.y0 : 0, ms = map ? map.s : 1;
    const n = colors.length;
    const S = Math.max(2, Math.round(p.steps));
    const lay = layoutFor(aw, ah, seed, p);
    const st = stats(seed, p.scale);
    const amt = Math.max(0, anim ? anim.amount : 0);
    const vx = amt * K.drift * Math.cos(lay.dir), vy = amt * K.drift * Math.sin(lay.dir);
    const tt = ((t % 1) + 1) % 1;
    const w1 = Math.cos((tt * Math.PI) / 2), w2 = Math.sin((tt * Math.PI) / 2);
    const two = amt > 0 && tt > 1e-9;
    const nrm = two ? 1 / Math.sqrt(1 + 2 * w1 * w2 * rhoAt(st, seed, p.scale, vx, vy)) : 1;
    const a1 = two ? w1 * nrm : 1, a2 = two ? w2 * nrm : 0;

    // Inks with the riso mottle baked in: 32 levels each.
    const grainA = K.grainA * (p.grain / 100);
    const rgb = colors.map(PL.color.hexToRgb);
    const LUT = new Uint32Array(n * 32);
    const c8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
    for (let i = 0; i < n; i++) {
      for (let l = 0; l < 32; l++) {
        const f = 1 + grainA * ((l - 15.5) / 15.5) * 0.5;
        const [r, g, b] = rgb[i];
        // darken by multiplying, lighten towards white: ink that's thinner or thicker
        const m = (v) => (f >= 1 ? v + (255 - v) * (f - 1) * 0.6 : v * f);
        LUT[i * 32 + l] = ((255 << 24) | (c8(m(b)) << 16) | (c8(m(g)) << 8) | c8(m(r))) >>> 0;
      }
    }
    const gc = L / K.grainRes;
    const gX = new Int32Array(cw), gY = new Int32Array(ch);
    const gox = Math.round(mx / ms), goy = Math.round(my / ms); // (counted from the frame's corner, so a turned view keeps it)
    for (let x = 0; x < cw; x++) gX[x] = Math.floor((x + gox + 0.5) / gc) & 255;
    for (let y = 0; y < ch; y++) gY[y] = (Math.floor((y + goy + 0.5) / gc) & 255) << 8;

    const img = preview ? previewImage(ctx, cw, ch) : ctx.createImageData(cw, ch);
    const buf = new Uint32Array(img.data.buffer);
    const wo = p.outlines > 0 ? K.out0 + K.outK * Math.pow(p.outlines / 100, 1.2) : -1;
    // Steps: equal bands of the field, two wide ones either side of its mean and narrower tails.
    const bw = K.band * Math.min(1, Math.sqrt(4 / (S - 1))), bc = Math.floor((S - 2) / 2) + 1, ib = 1 / bw;
    const w4 = [0, 0, 0, 0];
    const crw = (x) => { const t2 = x * x, t3 = t2 * x; w4[0] = -0.5 * t3 + t2 - 0.5 * x; w4[1] = 1.5 * t3 - 2.5 * t2 + 1; w4[2] = -1.5 * t3 + 2 * t2 + 0.5 * x; w4[3] = 0.5 * t3 - 0.5 * t2; };

    // a part of the world: its pieces, each over the canvas pixels whose middles it holds
    const pieces = map ? worldPieces(aw, ah, seed, p, { x0: mx / L, y0: my / L, x1: (mx + cw * ms) / L, y1: (my + ch * ms) / L }) : lay.pieces;
    const toC = (v, o, n) => Math.max(0, Math.min(n, Math.round((v * L - o) / ms))); // L units -> canvas px (edges)
    for (const pc of pieces) {
      const X0 = map ? toC(pc.x0, mx, cw) : Math.round(pc.x0 * L), X1 = map ? toC(pc.x1, mx, cw) : Math.round(pc.x1 * L);
      const Y0 = map ? toC(pc.y0, my, ch) : Math.round(pc.y0 * L), Y1 = map ? toC(pc.y1, my, ch) : Math.round(pc.y1 * L);
      const pw = X1 - X0, ph = Y1 - Y0;
      if (pw <= 0 || ph <= 0) continue;
      const ramp = rampFor(pc, n, S);
      // The lattice this piece needs over the whole loop (it drifts by up to one stride).
      const vx0 = map ? (mx + X0 * ms) / L : pc.x0, vy0 = map ? (my + Y0 * ms) / L : pc.y0, vx1 = map ? (mx + X1 * ms) / L : pc.x1, vy1 = map ? (my + Y1 * ms) / L : pc.y1;
      const g = grid(st, seed, p.scale, vx0 + pc.off[0] - Math.abs(vx) - 0.01, vy0 + pc.off[1] - Math.abs(vy) - 0.01,
        vx1 + pc.off[0] + Math.abs(vx) + 0.01, vy1 + pc.off[1] + Math.abs(vy) + 0.01);
      const { i0, j0, gw, gh, G } = g;
      // This frame's field: a1 * field + a2 * (field one stride on), resampled onto the lattice.
      let z = g.z;
      if (a2 !== 0) {
        if (blendBuf.length < gw * gh) blendBuf = new Float32Array(gw * gh * 1.25);
        const blend = blendBuf;
        const sx = vx * G, sy = vy * G, ix = Math.floor(sx), iy = Math.floor(sy);
        crw(sx - ix); const hx0 = w4[0], hx1 = w4[1], hx2 = w4[2], hx3 = w4[3];
        crw(sy - iy); const hy0 = w4[0], hy1 = w4[1], hy2 = w4[2], hy3 = w4[3];
        const src = g.z;
        for (let j = 0; j < gh; j++) {
          const r = [-1, 0, 1, 2].map((d) => Math.max(0, Math.min(gh - 1, j + iy + d)) * gw);
          for (let i = 0; i < gw; i++) {
            const c0 = Math.max(0, Math.min(gw - 1, i + ix - 1)), c1 = Math.max(0, Math.min(gw - 1, i + ix)), c2 = Math.max(0, Math.min(gw - 1, i + ix + 1)), c3 = Math.max(0, Math.min(gw - 1, i + ix + 2));
            let v = 0;
            for (let b = 0; b < 4; b++) {
              const o = r[b], wb = b === 0 ? hy0 : b === 1 ? hy1 : b === 2 ? hy2 : hy3;
              v += wb * (src[o + c0] * hx0 + src[o + c1] * hx1 + src[o + c2] * hx2 + src[o + c3] * hx3);
            }
            blend[j * gw + i] = a1 * src[j * gw + i] + a2 * v;
          }
        }
        z = blend;
      }
      const ox = pc.off[0] - vx * tt, oy = pc.off[1] - vy * tt;
      // Bicubic taps per column (horizontal) and per row (vertical), applied separably.
      const cI = new Int32Array(pw), cW0 = new Float64Array(pw), cW1 = new Float64Array(pw), cW2 = new Float64Array(pw), cW3 = new Float64Array(pw);
      let ciMin = Infinity, ciMax = -Infinity;
      // the world's place of a canvas column's or row's middle (frame px)
      const wX = (x) => (map ? mx + (X0 + x + 0.5) * ms : X0 + x + 0.5), wY = (y) => (map ? my + (Y0 + y + 0.5) * ms : Y0 + y + 0.5);
      for (let x = 0; x < pw; x++) {
        const ux = (wX(x) / L + ox) * G - i0, k = Math.floor(ux);
        crw(ux - k); cI[x] = k - 1; cW0[x] = w4[0]; cW1[x] = w4[1]; cW2[x] = w4[2]; cW3[x] = w4[3];
        if (k - 1 < ciMin) ciMin = k - 1;
        if (k + 2 > ciMax) ciMax = k + 2;
      }
      ciMin = Math.max(0, ciMin); ciMax = Math.min(gw - 1, ciMax);
      const colV = new Float64Array(gw + 4), rz = new Float64Array(pw);
      // the screen, fixed to the paper; s in 0..1 per pixel (0.5 = no screen)
      const kind = pc.screen === 'dots' ? 1 : pc.screen === 'lines' ? 2 : pc.screen === 'pixels' ? 3 : 0;
      const amp = kind ? K.amp[kind - 1] : 0;
      const per = pc.period * L;
      const sC = new Int32Array(pw), bC = new Int32Array(pw), sR = new Float64Array(ph), bR = new Int32Array(ph);
      for (let x = 0; x < pw; x++) {
        const u = wX(x) / per + pc.phase[0], f = u - Math.floor(u) - 0.5;
        sC[x] = Math.round(f * f * 2048); // (distance to the cell centre)^2, as a DOT index
        bC[x] = Math.floor(u);
      }
      for (let y = 0; y < ph; y++) {
        const u = wY(y) / per + pc.phase[1], f = u - Math.floor(u);
        sR[y] = kind === 2 ? f : Math.round((f - 0.5) * (f - 0.5) * 2048);
        bR[y] = Math.floor(u);
      }
      const cellSeed = Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(Math.round((map ? pc.sx0 : pc.x0) * 1e4) + 7 * Math.round((map ? pc.sy0 : pc.y0) * 1e4), 0x85ebca6b);
      const sv = new Float64Array(pw); // this row's screen offsets: amp * (s - 0.5) + 64
      const S1 = S - 1, wo2 = wo > 0 ? wo * wo : -1, gx0 = X0, LUTg = LUT, GR = GRAIN;

      for (let y = 0; y < ph; y++) {
        const uy = (wY(y) / L + oy) * G - j0, k = Math.floor(uy);
        crw(uy - k);
        const a0 = w4[0], a1w = w4[1], a2w = w4[2], a3 = w4[3];
        const r0 = Math.max(0, Math.min(gh - 1, k - 1)) * gw, r1 = Math.max(0, Math.min(gh - 1, k)) * gw, r2 = Math.max(0, Math.min(gh - 1, k + 1)) * gw, r3 = Math.max(0, Math.min(gh - 1, k + 2)) * gw;
        for (let i = ciMin; i <= ciMax; i++) colV[i] = a0 * z[r0 + i] + a1w * z[r1 + i] + a2w * z[r2 + i] + a3 * z[r3 + i];
        for (let x = 0; x < pw; x++) { const c = cI[x]; rz[x] = cW0[x] * colV[c] + cW1[x] * colV[c + 1] + cW2[x] * colV[c + 2] + cW3[x] * colV[c + 3]; }
        // screen offsets for this row
        if (kind === 0) sv.fill(64);
        else if (kind === 1) { const sy = sR[y]; for (let x = 0; x < pw; x++) sv[x] = amp * (DOT[sC[x] + sy] - 0.5) + 64; }
        else if (kind === 2) { const v = amp * (sR[y] - 0.5) + 64; sv.fill(v); }
        else {
          const hy = Math.imul(bR[y], 0xd8163841) ^ cellSeed;
          let last = -1e9, lv = 64;
          for (let x = 0; x < pw; x++) {
            const cb = bC[x];
            if (cb !== last) { // every cell of the mosaic gets its own threshold
              let h = Math.imul(cb, 0x8da6b343) ^ hy;
              h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b); h ^= h >>> 16;
              lv = amp * ((h >>> 8) / 16777216 - 0.5) + 64; last = cb;
            }
            sv[x] = lv;
          }
        }
        const row = (Y0 + y) * cw + gx0, gy = gY[Y0 + y];
        for (let x = 0; x < pw; x++) {
          const gg = rz[x] * ib + bc;
          const g64 = gg + 64, gi = g64 | 0, d = g64 - gi - 0.5;
          let ink;
          if (d * d < wo2) ink = 0;
          else {
            let q = ((gg + sv[x]) | 0) - 64;
            if (q < 0) q = 0; else if (q > S1) q = S1;
            ink = ramp[q];
          }
          buf[row + x] = LUTg[(ink << 5) + GR[gy | gX[gx0 + x]]];
        }
      }
    }
    ctx.putImageData(img, 0, 0);

    // Arcs over everything.
    const arcs = map ? worldArcs(aw, ah, seed, p, n, { x0: mx / L, y0: my / L, x1: (mx + cw * ms) / L, y1: (my + ch * ms) / L }) : arcsFor(aw, ah, seed, p, n);
    if (arcs.length && p.weight > 0) {
      ctx.save();
      if (map) ctx.setTransform(1 / ms, 0, 0, 1 / ms, -mx / ms, -my / ms); // world (frame px) -> canvas
      ctx.lineCap = 'butt';
      for (const a of arcs) {
        ctx.beginPath();
        ctx.arc(a.cx * L, a.cy * L, a.R * L, a.a0, a.a1);
        ctx.strokeStyle = colors[a.ink];
        ctx.lineWidth = Math.max(0.6 * ms, (K.arcW0 + K.arcWK * (p.weight / 100)) * a.w * L); // (never under 0.6 canvas px)
        ctx.stroke();
      }
      ctx.restore();
    }
    return { count: lay.pieces.length, label: lay.pieces.length === 1 ? 'piece' : 'pieces' };
  }

  PL.tools.register({
    id: 'splice',
    name: 'Splice',
    kind: 'Backgrounds',
    tagline: 'Cut-up riso',
    about: 'One field of soft hills, cut into pieces that each print it in their own screen and inks: dots, lines, pixels or flat, with contour outlines, thin arcs and riso grain.',
    raster: true,
    inks: {
      min: 2, max: 8, roles, fit, spec, add, generate,
      span: (n) => n,
      hint: 'The first color (Key) draws the outlines; every color prints in the pieces.',
    },
    palettes: PALETTES,
    params: PARAMS,
    defaults: {
      anim: { amount: 0.6, fps: 12, frames: 36 },
      fx: {},
      palette: 'Sunset', // the preset the style opens on (its card's colors)
    },
    paint,
    zoom: true, // paints any part of its world (General's Rotation and Size)
    stillGrain: true,
    _K: K,
    _clear: () => { layoutCache.clear(); statCache.clear(); tileCache.clear(); rhoCache.clear(); },
    _layout: layoutFor,
  });
})();
