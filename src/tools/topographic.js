/* ==========================================================================
   tools/topographic.js — Topographic: contour lines of a moving terrain.

   1. Terrain: a height field over the frame: fractal noise (Scale: how big the
      hills are, Detail: how rough the ground is) whose coordinates a second,
      smoother field pushes about (Warp), so the hills bend and run into ridges
      and valleys.
   2. Contours: lines of equal height at a fixed interval (Contours: how many
      from the lowest ground to the highest); every Index every-th one is an
      index line, drawn thicker (Index weight). They are traced on a fine square
      grid (marching squares) and smoothed into curves: real strokes in SVG.
   3. Colors: a line takes its color from its height, low to high (Lines 1, 2
      …); the index lines take Index, and the highest of them (Peaks: from the
      top down) take Marks. Halfway between index lines the lines of the high
      ground (Dashes: from the top down) are drawn as dashes or dots (Dash
      length) in Marks.
   4. Grid: a faint square map grid in Grid (Grid: cells across the frame's
      long side; 0: none), still while the terrain moves.
   5. Animation: the terrain rises and falls in place (its noise travels round
      a circle in two more dimensions), so hills swell and sink and rings appear
      and vanish; the fine detail changes faster than the big hills. Every level
      keeps its color and line, so nothing flickers. Frame 1 is the same terrain
      at any Amount. Seamless; Amount 0 holds still.
   ========================================================================== */
(() => {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const clamp01 = (v) => clamp(v, 0, 1);
  const lerp = (a, b, t) => a + (b - a) * t;

  // The ground, the grid, the lines from the low ground to the high, the index lines, then the marks.
  // The default look uses Forest (defaults.palette).
  const PALETTES = [
    { name: 'Forest', colors: ['#092300', '#1F3B15', '#57723F', '#738D5C', '#9DB063', '#D5E8B1'] },
    { name: 'Survey', colors: ['#F3ECDD', '#E3D7C2', '#C7A47B', '#A97C4F', '#6B4426', '#2D6CB0'] },
    { name: 'Blueprint', colors: ['#0E2E5B', '#1B4177', '#4C76B0', '#7EA2D5', '#D6E5FA', '#FFFFFF'] },
    { name: 'Ember', colors: ['#160B09', '#2A1611', '#6D2B19', '#A6421E', '#E87A35', '#FFD8A0'] },
    { name: 'Glacier', colors: ['#EEF3F6', '#DCE6EC', '#A8C1D2', '#7EA1B9', '#2E5D80', '#D9534F'] },
    { name: 'Dusk', colors: ['#13112A', '#221F44', '#4B3F86', '#7A5FB6', '#E28CB8', '#FFE3A6'] },
    { name: 'Desert', colors: ['#EADBBE', '#DCC9A6', '#C29A68', '#A2764A', '#6A4425', '#2E6F73'] },
    { name: 'Moss', colors: ['#1D2317', '#2B3321', '#5C6A3C', '#7E8E4E', '#C8C17A', '#F2EEDB'] },
    { name: 'Ink', colors: ['#F4F3EE', '#E3E2DB', '#9A9993', '#6F6E69', '#1E1E1C', '#C8402F'] },
    { name: 'Night', colors: ['#0A0A0C', '#18181D', '#44444E', '#6B6B77', '#D0D0D8', '#FFFFFF'] },
  ];

  /* ---- color roles -------------------------------------------------------------------- */
  const nLines = (n) => Math.max(1, n - 4);
  function roles(n) {
    const m = nLines(n);
    return ['Ground', 'Grid', ...Array.from({ length: m }, (_, i) => (m === 1 ? 'Lines' : 'Lines ' + (i + 1))), 'Index', 'Marks'];
  }
  const spec = (n) => ({ ramp: nLines(n) + 2, accents: 2 });
  const isLight = (hex) => PL.color.luminance(hex) > 0.35;

  // "New colors": mostly a deep ground with luminous lines, now and then a pale map with dark ones and an
  // accent for the marks.
  function generate(n, rng) {
    const C = PL.color, m = nLines(n), h = rng.float(0, 360);
    if (rng.chance(0.65)) {
      const gL = rng.float(0.15, 0.21), gC = rng.float(0.02, 0.06);
      const lines = Array.from({ length: m }, (_, i) => {
        const f = m === 1 ? 0.5 : i / (m - 1);
        return C.lch(0.43 + 0.17 * f + rng.float(-0.02, 0.02), rng.float(0.05, 0.09), h + rng.float(-12, 12) + 12 * f);
      });
      return [C.lch(gL, gC, h), C.lch(gL + 0.06, gC * 1.15, h), ...lines,
        C.lch(rng.float(0.7, 0.79), rng.float(0.08, 0.13), h + rng.float(-25, 25)), C.lch(rng.float(0.9, 0.95), rng.float(0.03, 0.06), h + rng.float(-30, 30))];
    }
    const h2 = h + rng.float(-25, 25);
    const lines = Array.from({ length: m }, (_, i) => {
      const f = m === 1 ? 0.5 : i / (m - 1);
      return C.lch(0.74 - 0.16 * f + rng.float(-0.02, 0.02), rng.float(0.04, 0.08), h2 + rng.float(-10, 10));
    });
    return [C.lch(rng.float(0.93, 0.96), rng.float(0.008, 0.02), h), C.lch(rng.float(0.86, 0.89), rng.float(0.015, 0.03), h), ...lines,
      C.lch(rng.float(0.34, 0.43), rng.float(0.06, 0.1), h2), C.lch(rng.float(0.5, 0.6), rng.float(0.12, 0.16), h + 180 + rng.float(-40, 40))];
  }

  // + adds a line color, on the ramp from the low lines up to the index color: where it stands furthest
  // from every color there is (most often halfway across the widest step), so the others keep their order.
  function add(colors) {
    const C = PL.color, c = colors.slice(), m = nLines(c.length);
    const labs = c.map((x) => C.hexToOklab(x));
    const far = (hex) => { const q = C.hexToOklab(hex); return Math.min(...labs.map((r) => Math.hypot(q[0] - r[0], q[1] - r[1], q[2] - r[2]))); };
    let best = null, score = -1;
    for (let i = 2; i <= m + 1; i++) { // between two lines, or the last line and the index color
      for (const t of [0.5, 0.33, 0.67]) {
        const hx = C.mix(c[i], c[i + 1], t), s = far(hx);
        if (s > score + 1e-9) { score = s; best = [i + 1, hx]; }
      }
    }
    c.splice(best[0], 0, best[1]);
    return c;
  }

  // A palette of any length fitted to n colors: a short one fills its roles from the ground (first) and the
  // marks (last); a long one gives up lines from the middle of its ramp.
  function fit(colors, n) {
    const C = PL.color;
    let c = (colors || []).map(C.normHex).filter(Boolean);
    if (!c.length) c = PALETTES[0].colors.slice();
    if (c.length < 5) {
      const g = c[0], away = isLight(g) ? '#000000' : '#FFFFFF';
      const marks = c.length > 1 ? c[c.length - 1] : C.mix(g, away, 0.92);
      const index = c.length > 2 ? c[c.length - 2] : C.mix(g, marks, 0.78);
      const line = c.length > 3 ? c[1] : C.mix(g, index, 0.55);
      c = [g, C.mix(g, line, 0.2), line, index, marks];
    }
    while (c.length > n) c.splice(2 + Math.floor(nLines(c.length) / 2), 1);
    while (c.length < n) c = add(c);
    return c;
  }

  /* ---- settings ----------------------------------------------------------------------- */
  const S = (section, key, label, min, max, def, extra = {}) => ({ section, key, label, type: 'range', min, max, def, step: 1, ...extra });
  const PARAMS = [
    S('Terrain', 'scale', 'Scale', 0, 100, 70, { unit: '%', rand: [45, 85], hint: 'How big the hills are: many small ones (0) or a few broad ones (100)' }),
    S('Terrain', 'detail', 'Detail', 0, 100, 30, { unit: '%', rand: [15, 55], hint: 'How rough the ground is: smooth slopes (0) or rugged ones full of small bumps (100)' }),
    S('Terrain', 'warp', 'Warp', 0, 100, 25, { unit: '%', rand: [10, 55], hint: 'How much the hills bend and stretch into ridges and valleys' }),
    S('Contours', 'contours', 'Contours', 6, 60, 18, { rand: [12, 30], hint: 'How many contour lines there are from the lowest ground to the highest' }),
    S('Contours', 'index', 'Index every', 2, 10, 5, { rand: [4, 6], hint: 'Every this many lines, one is an index line (drawn thicker)' }),
    S('Contours', 'weight', 'Line weight', 10, 100, 45, { unit: '%', rand: [30, 58], hint: 'How thick the lines are' }),
    S('Contours', 'iweight', 'Index weight', 100, 400, 250, { unit: '%', rand: [170, 300], hint: 'How thick the index lines are, against the others' }),
    S('Marks', 'dashes', 'Dashes', 0, 100, 50, { unit: '%', rand: [25, 80], hint: 'How far down from the highest ground the lines halfway between index lines are dashed (0: none)' }),
    S('Marks', 'dash', 'Dash length', 0, 100, 55, { unit: '%', rand: [0, 80], hint: 'Dots (0) or longer dashes' }),
    S('Marks', 'peaks', 'Peaks', 0, 100, 15, { unit: '%', rand: [0, 35], hint: 'How far down from the highest ground the index lines are drawn in the Marks color (0: none)' }),
    S('Grid', 'grid', 'Grid', 0, 16, 7, { rand: [4, 9], hint: "Cells across the frame's long side in the map grid (0: none)" }),
  ];

  // Constants. Lengths in px at a 1080 x 1080 frame (they go with the frame's size) unless noted.
  const K = {
    freq: [5, 1.2],       // the terrain: noise cycles across the frame's size at Scale 0 -> 100 (log scale) ...
    oct: 4,               // ... in this many octaves, each this much of the last at Detail 0 -> 100 ...
    gain: [0.3, 0.56],
    fine: [25, 75],       // ... the last one fading in from Detail 25 to 75 %
    warpF: 0.55,          // the warp's field: this much of the terrain's frequency ...
    warp: 0.9,            // ... moving the terrain up to this far at Warp 100 (in the terrain's noise units)
    warpStep: 4,          // ... sampled every this many cells (it is smooth)
    relief: 2.6,          // the contours span this much height (the terrain is scaled to about ±1)
    cells: 160,           // the sampling grid: this many cells across the frame's size ...
    maxCells: 420000,     // ... and at most this many in all (General's Size zoomed far out samples coarser)
    smooth: 2,            // the traced lines are rounded off this many times (corner cutting)
    tol: 0.2,             // ... then thinned where they run straight, to within this many output px
    weight: [0.7, 6.2],   // a line's width at Line weight 10 -> 100
    markW: 1.15,          // dashes and dots: this x a line's width ...
    dashL: [0, 5.5],      // ... dashes this long at Dash length 0 -> 100 (x their width; 0: dots) ...
    gap: [2.2, 2.4],      // ... gaps this long (x their width; dots: from centre to centre, plus the dot)
    gridW: 2.2,           // the grid's lines
    drift: 0.12,          // animation: the terrain's noise circles this far (noise units) x Amount
  };

  /* ---- the terrain -------------------------------------------------------------------- */
  // The heights on a grid of (nx + 1) x (ny + 1) points, cs apart, from (X0, Y0) (frame units), scaled to
  // about ±1 (Detail changes how rough it is, not how high). Sz: the frame's size.
  function heights(seed, p, Sz, X0, Y0, cs, nx, ny, t, amount) {
    const N = PL.noise.get(seed >>> 0), NW = PL.noise.get((seed ^ 0x2c1b3c6d) >>> 0), n4 = N.noise4;
    const f = Math.exp(lerp(Math.log(K.freq[0]), Math.log(K.freq[1]), clamp01((p.scale ?? 70) / 100))) / Sz; // (noise units per frame unit)
    const det = clamp((p.detail ?? 30), 0, 100), gain = lerp(K.gain[0], K.gain[1], det / 100);
    // the octaves' weights (the finest fades in with Detail), scaled so the terrain spans about ±1
    const amp = [];
    for (let o = 0, a = 1; o < K.oct; o++, a *= gain) amp.push(o < K.oct - 1 ? a : a * clamp01((det - K.fine[0]) / (K.fine[1] - K.fine[0])));
    while (amp.length > 1 && amp[amp.length - 1] < 1e-3) amp.pop();
    const norm = 1.4 / Math.sqrt(amp.reduce((q, a) => q + a * a, 0)) / 1.05;
    // (the circle passes through the still terrain at frame 1, so frame 1 is the same at any Amount)
    const R = K.drift * amount, th = 2 * Math.PI * t, zc = R * (Math.cos(th) - 1), wc = R * Math.sin(th);
    const wa = K.warp * clamp01((p.warp ?? 25) / 100), fw = K.warpF, ws = K.warpStep;
    const W1 = nx + 1, out = new Float32Array(W1 * (ny + 1));
    // the warp, on a coarser grid
    const wx = Math.ceil(nx / ws) + 2, wy = Math.ceil(ny / ws) + 2;
    let WX = null, WY = null;
    if (wa > 0) {
      WX = new Float32Array(wx * wy); WY = new Float32Array(wx * wy);
      for (let j = 0; j < wy; j++) for (let i = 0; i < wx; i++) {
        const x = (X0 + i * ws * cs) * f * fw, y = (Y0 + j * ws * cs) * f * fw;
        WX[j * wx + i] = wa * NW.fbm4(x, y, zc * fw, wc * fw, 2, 0.5) * 2;
        WY[j * wx + i] = wa * NW.fbm4(x + 31.7, y - 12.9, zc * fw + 5.3, wc * fw - 7.1, 2, 0.5) * 2;
      }
    }
    const no = amp.length;
    for (let j = 0; j <= ny; j++) {
      const gy = j / ws, j0 = Math.floor(gy), fy = gy - j0, y = (Y0 + j * cs) * f;
      for (let i = 0; i <= nx; i++) {
        let dx = 0, dy = 0;
        if (WX) {
          const gx = i / ws, i0 = Math.floor(gx), fx = gx - i0, k = j0 * wx + i0;
          dx = (WX[k] * (1 - fx) + WX[k + 1] * fx) * (1 - fy) + (WX[k + wx] * (1 - fx) + WX[k + wx + 1] * fx) * fy;
          dy = (WY[k] * (1 - fx) + WY[k + 1] * fx) * (1 - fy) + (WY[k + wx] * (1 - fx) + WY[k + wx + 1] * fx) * fy;
        }
        const X = (X0 + i * cs) * f + dx, Y = y + dy;
        // fractal noise; the time circle scales with each octave, so fine detail changes faster than the hills
        let h = 0;
        for (let o = 0, q = 1; o < no; o++, q *= 2) h += amp[o] * n4(X * q + o * 17.13, Y * q - o * 9.71, zc * q, wc * q);
        out[j * W1 + i] = norm * h;
      }
    }
    return out;
  }

  /* ---- the contours ------------------------------------------------------------------- */
  // Every level off + k * step the heights cross, traced cell by cell (marching squares) and joined into
  // lines: a Map from k to [{ pts: [x0, y0, …] (frame units), closed }]. Two cells that share an edge work
  // out the same point on it, so the pieces join exactly.
  let BUF = null; // per edge, for joining one level at a time: which pieces reach it
  function contours(Hs, nx, ny, X0, Y0, cs, step, off) {
    const W1 = nx + 1, nH = nx * (ny + 1), nE = nH + W1 * ny;
    const segs = new Map(); // k -> [edge, x, y, edge, x, y, …]: one piece = two crossings
    for (let j = 0; j < ny; j++) {
      const y0 = Y0 + j * cs, y1 = y0 + cs;
      for (let i = 0; i < nx; i++) {
        const a = Hs[j * W1 + i], b = Hs[j * W1 + i + 1], c = Hs[(j + 1) * W1 + i + 1], d = Hs[(j + 1) * W1 + i];
        const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d);
        const kA = Math.ceil((lo - off) / step), kB = Math.ceil((hi - off) / step) - 1;
        if (kB < kA) continue;
        const x0 = X0 + i * cs, x1 = x0 + cs;
        const eT = j * nx + i, eB = (j + 1) * nx + i, eL = nH + j * W1 + i, eR = eL + 1;
        for (let k = kA; k <= kB; k++) {
          const L = off + k * step;
          if (!(L >= lo && L < hi)) continue;
          const cas = (a > L ? 1 : 0) | (b > L ? 2 : 0) | (c > L ? 4 : 0) | (d > L ? 8 : 0);
          if (cas === 0 || cas === 15) continue;
          let o = segs.get(k);
          if (!o) segs.set(k, (o = []));
          // the crossings on the cell's edges: 0 top, 1 right, 2 bottom, 3 left
          let s1, s2, s3 = -1, s4 = -1;
          switch (cas) {
            case 1: case 14: s1 = 0; s2 = 3; break;
            case 2: case 13: s1 = 0; s2 = 1; break;
            case 3: case 12: s1 = 3; s2 = 1; break;
            case 4: case 11: s1 = 1; s2 = 2; break;
            case 6: case 9: s1 = 0; s2 = 2; break;
            case 7: case 8: s1 = 3; s2 = 2; break;
            case 5: // a and c above: joined through the middle (b and d cut off), or apart
              if (a + b + c + d > 4 * L) { s1 = 0; s2 = 1; s3 = 3; s4 = 2; } else { s1 = 0; s2 = 3; s3 = 1; s4 = 2; }
              break;
            default: // 10: b and d above
              if (a + b + c + d > 4 * L) { s1 = 0; s2 = 3; s3 = 1; s4 = 2; } else { s1 = 0; s2 = 1; s3 = 3; s4 = 2; }
          }
          for (const sd of s3 < 0 ? [s1, s2] : [s1, s2, s3, s4]) {
            if (sd === 0) o.push(eT, x0 + ((L - a) / (b - a)) * cs, y0);
            else if (sd === 1) o.push(eR, x1, y0 + ((L - b) / (c - b)) * cs);
            else if (sd === 2) o.push(eB, x0 + ((L - d) / (c - d)) * cs, y1);
            else o.push(eL, x0, y0 + ((L - a) / (d - a)) * cs);
          }
        }
      }
    }
    if (!BUF || BUF.mark.length < nE) BUF = { mark: new Int32Array(nE).fill(-1), A: new Int32Array(nE), B: new Int32Array(nE), lv: 0 };
    const { mark, A, B } = BUF;
    const out = new Map();
    for (const [k, E] of segs) {
      const lv = ++BUF.lv, n = E.length / 6;
      for (let s = 0; s < n; s++) for (let h = 0; h < 2; h++) {
        const e = E[6 * s + 3 * h];
        if (mark[e] !== lv) { mark[e] = lv; A[e] = s; B[e] = -1; } else B[e] = s;
      }
      const used = new Uint8Array(n), lines = [];
      // from piece s, entering by its crossing h
      const walk = (s, h) => {
        const e0 = E[6 * s + 3 * h], pts = [E[6 * s + 3 * h + 1], E[6 * s + 3 * h + 2]];
        let e = e0;
        while (s >= 0 && !used[s]) {
          used[s] = 1;
          const x = E[6 * s] === e ? 1 : 0; // its other crossing
          e = E[6 * s + 3 * x];
          pts.push(E[6 * s + 3 * x + 1], E[6 * s + 3 * x + 2]);
          s = A[e] === s ? B[e] : A[e];
        }
        const closed = e === e0 && pts.length > 6;
        if (closed) pts.length -= 2;
        return { pts, closed };
      };
      // open lines first (from a crossing only one piece reaches: the grid's border), then the loops
      for (let s = 0; s < n; s++) {
        if (used[s]) continue;
        if (B[E[6 * s]] === -1) lines.push(walk(s, 0));
        else if (B[E[6 * s + 3]] === -1) lines.push(walk(s, 1));
      }
      for (let s = 0; s < n; s++) if (!used[s]) lines.push(walk(s, 0));
      out.set(k, lines);
    }
    return out;
  }

  // Round a line off (corner cutting), keeping an open line's ends.
  function smoothLine(pts, closed, times) {
    let p = pts;
    for (let it = 0; it < times; it++) {
      const n = p.length / 2;
      if (n < 3) break;
      const q = [];
      if (!closed) q.push(p[0], p[1]);
      const m = closed ? n : n - 1;
      for (let i = 0; i < m; i++) {
        const x0 = p[2 * i], y0 = p[2 * i + 1], j = (i + 1) % n, x1 = p[2 * j], y1 = p[2 * j + 1];
        q.push(0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1, 0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1);
      }
      if (!closed) { q.splice(2, 2); q.splice(q.length - 2, 2); q.push(p[2 * n - 2], p[2 * n - 1]); }
      p = q;
    }
    return p;
  }
  // Drop the points a line runs straight through (to within tol), for lean SVG.
  function thin(pts, closed, tol) {
    const n = pts.length / 2;
    if (n < 4 || !(tol > 0)) return pts;
    const keep = new Uint8Array(n);
    keep[0] = keep[n - 1] = 1;
    const t2 = tol * tol, stack = [0, n - 1];
    while (stack.length) {
      const b = stack.pop(), a = stack.pop();
      const ax = pts[2 * a], ay = pts[2 * a + 1], dx = pts[2 * b] - ax, dy = pts[2 * b + 1] - ay, L2 = dx * dx + dy * dy;
      let best = -1, far = t2;
      for (let i = a + 1; i < b; i++) {
        const px = pts[2 * i] - ax, py = pts[2 * i + 1] - ay;
        const cr = px * dy - py * dx, d2 = L2 > 0 ? (cr * cr) / L2 : px * px + py * py;
        if (d2 > far) { far = d2; best = i; }
      }
      if (best >= 0) { keep[best] = 1; stack.push(a, best, best, b); }
    }
    if (closed && n > 6) keep[Math.floor(n / 2)] = 1; // (a loop keeps a point across from its start)
    const out = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[2 * i], pts[2 * i + 1]);
    return out;
  }

  // Dashes (or dots) along a line, anchored where it is steady from frame to frame: a loop from its
  // topmost point, always the same way round; an open line from its end that comes first (top, then left).
  // A dash covers [k P, k P + D] along it (P = D + G); D = 0: a dot at every k P.
  function dashes(pts, closed, D, G, onDash, onDot) {
    let p = pts, n = p.length / 2;
    if (n < 2) return;
    if (closed) {
      let area = 0, top = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1];
        if (p[2 * i + 1] < p[2 * top + 1]) top = i;
      }
      const q = [];
      for (let k = 0; k <= n; k++) { const i = (area >= 0 ? top + k : top - k + 2 * n) % n; q.push(p[2 * i], p[2 * i + 1]); }
      p = q; n += 1;
    } else if (p[1] > p[2 * n - 1] || (p[1] === p[2 * n - 1] && p[0] > p[2 * n - 2])) {
      const q = [];
      for (let i = n - 1; i >= 0; i--) q.push(p[2 * i], p[2 * i + 1]);
      p = q;
    }
    const P = D + G;
    if (!(P > 0)) return;
    let s0 = 0, next = 0, cur = null; // (arc length at the segment's start; where the next dash or dot starts)
    for (let i = 0; i + 1 < n; i++) {
      const x0 = p[2 * i], y0 = p[2 * i + 1], dx = p[2 * i + 2] - x0, dy = p[2 * i + 3] - y0, len = Math.hypot(dx, dy);
      if (!(len > 0)) continue;
      const at = (sl) => { const f = (sl - s0) / len; return [x0 + dx * f, y0 + dy * f]; };
      const s1 = s0 + len;
      if (D <= 0) {
        while (next <= s1) { const q = at(next); onDot(q[0], q[1]); next += P; }
      } else {
        for (;;) {
          if (cur) { // finish the dash under way
            const end = next + D;
            if (end <= s1) { cur.push(...at(end)); onDash(cur); cur = null; next += P; continue; }
            cur.push(p[2 * i + 2], p[2 * i + 3]);
            break;
          }
          if (next >= s1) break;
          cur = at(Math.max(next, s0));
        }
      }
      s0 = s1;
    }
    if (cur && cur.length >= 4) onDash(cur);
  }

  /* ---- the picture -------------------------------------------------------------------- */
  function build({ W, H, seed, p, colors, t = 0, anim, region }) {
    const n = colors.length, m = nLines(n), names = roles(n);
    const amount = anim ? Math.max(0, anim.amount || 0) : 0;
    const R = PL.tools.region({ W, H, region });
    const Sz = Math.sqrt(W * H), u = Sz / 1080;
    // the sampling grid over the region (finer when zoomed in, coarser when zoomed far out)
    const z = region && region.z > 1 ? region.z : 1;
    let cs = Sz / K.cells / z;
    const rw = R.x1 - R.x0, rh = R.y1 - R.y0;
    if (((rw / cs) + 3) * ((rh / cs) + 3) > K.maxCells) cs = Math.sqrt((rw * rh) / K.maxCells) * 1.02;
    const X0 = R.x0 - cs, Y0 = R.y0 - cs, nx = Math.ceil(rw / cs) + 2, ny = Math.ceil(rh / cs) + 2;
    const Hs = heights(seed | 0, p, Sz, X0, Y0, cs, nx, ny, t, amount);
    const levels = Math.max(2, Math.round(p.contours ?? 18)), step = K.relief / levels, off = 0;
    const lines = contours(Hs, nx, ny, X0, Y0, cs, step, off);

    const scene = new PL.Scene(W, H, colors[0], 0);
    // the grid, under everything
    const gridN = Math.round(p.grid ?? 7);
    if (gridN > 0) {
      const L = scene.layer('grid', colors[1], names[1], 1), cell = Math.max(W, H) / gridN, gw = K.gridW * u;
      for (let k = Math.floor(R.x0 / cell - 0.5); k <= Math.ceil(R.x1 / cell); k++) { const x = (k + 0.5) * cell; if (x >= R.x0 - gw && x <= R.x1 + gw) PL.Scene.stroke(L, [x, R.y0 - gw, x, R.y1 + gw], gw); }
      for (let k = Math.floor(R.y0 / cell - 0.5); k <= Math.ceil(R.y1 / cell); k++) { const y = (k + 0.5) * cell; if (y >= R.y0 - gw && y <= R.y1 + gw) PL.Scene.stroke(L, [R.x0 - gw, y, R.x1 + gw, y], gw); }
      L.cap = 'butt';
    }
    // the layers, bottom to top: the lines (low to high), the index lines, the marks
    const lineL = Array.from({ length: m }, (_, i) => scene.layer('lines-' + i, colors[2 + i], names[2 + i], 2 + i));
    const indexL = scene.layer('index', colors[n - 2], 'Index lines', n - 2);
    const dashL = scene.layer('dashes', colors[n - 1], 'Dashed lines', n - 1);
    dashL.cap = 'butt';
    const dotL = scene.layer('dots', colors[n - 1], 'Dotted lines', n - 1);
    const peakL = scene.layer('peaks', colors[n - 1], 'Peak lines', n - 1);
    const lw = lerp(K.weight[0], K.weight[1], clamp01(((p.weight ?? 45) - 10) / 90)) * u;
    const iw = lw * clamp((p.iweight ?? 250) / 100, 1, 4), mw = lw * K.markW;
    const dl = lerp(K.dashL[0], K.dashL[1], clamp01((p.dash ?? 55) / 100)) * mw, gap = lerp(K.gap[0], K.gap[1], clamp01((p.dash ?? 55) / 100)) * mw;
    const every = clamp(Math.round(p.index ?? 5), 2, 10), half = Math.floor(every / 2);
    const peakFrom = 1 - clamp01((p.peaks ?? 15) / 100), dashFrom = 1 - clamp01((p.dashes ?? 50) / 100);
    const tol = K.tol / (z > 1 ? z : 1);
    let count = 0;
    const ks = [...lines.keys()].sort((a, b) => a - b);
    for (const k of ks) {
      const e01 = clamp01((off + k * step + K.relief / 2) / K.relief); // how high the level is (0: low, 1: high)
      const tier = ((k % every) + every) % every;
      const isIndex = tier === 0, isDash = !isIndex && tier === half && (p.dashes ?? 50) > 0 && e01 >= dashFrom;
      const isPeak = isIndex && (p.peaks ?? 15) > 0 && e01 >= peakFrom;
      for (const ln of lines.get(k)) {
        const pts = smoothLine(ln.pts, ln.closed, K.smooth);
        count++;
        if (isDash) {
          if (dl > 0.01) dashes(pts, ln.closed, dl, gap, (d) => PL.Scene.stroke(dashL, d, mw), null);
          else dashes(pts, ln.closed, 0, gap + mw, null, (x, y) => PL.Scene.circle(dotL, x, y, mw * 0.62));
          continue;
        }
        const thinned = thin(pts, ln.closed, tol);
        if (isPeak) PL.Scene.stroke(peakL, thinned, iw, ln.closed);
        else if (isIndex) PL.Scene.stroke(indexL, thinned, iw, ln.closed);
        else PL.Scene.stroke(lineL[Math.min(m - 1, Math.floor(e01 * m))], thinned, lw, ln.closed);
      }
    }
    scene.layers = scene.layers.filter((L) => L.s.length || L.c.length);
    scene.status = `${ks.length} level${ks.length === 1 ? '' : 's'} · ${count.toLocaleString()} lines`;
    return scene;
  }

  PL.tools.register({
    id: 'topographic',
    name: 'Topographic',
    kind: 'Organic',
    tagline: 'Contour map',
    about: 'The contour lines of a rolling terrain, like a map: fine lines at every step in height, thicker index lines among them, dashed lines on the high ground and the highest rings picked out, over a faint map grid. In the animation the terrain rises and falls in place: hills swell and sink and rings appear and vanish.',
    inks: {
      min: 5, max: 9, roles, fit, spec, add, generate,
      span: (n) => n, // Invert turns the whole palette round: light lines on a dark ground <-> dark on light
      rotateFrom: 2, // Rotate keeps the ground and the grid
      hint: 'Ground and Grid first, then the lines from the low ground to the high (one or more), then the index lines and the marks (dashed lines and the highest index lines).',
    },
    palettes: PALETTES,
    params: PARAMS,
    animLabel: 'Amount',
    animHint: 'How much the terrain rises and falls over the loop (0: still)',
    defaults: {
      palette: 'Forest', // the preset the style opens on (its card's colors)
      anim: { amount: 0.6, fps: 30, frames: 240 }, // an 8 s loop
      fx: {},
    },
    build,
    zoom: true, // draws any region of its world (General's Rotation and Size)
    _K: K,
    _heights: heights,
    _contours: contours,
  });
})();
