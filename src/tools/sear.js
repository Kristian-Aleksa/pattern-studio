/* ==========================================================================
   tools/sear.js — Sear: thermal smear (pixel texture: PNG, video).

   1. Field: a smooth value-noise field (soft, slightly boxy blobs) summed
      over Detail octaves (1: one smooth layer, 5: fine filaments), its
      blobs Blob size big, pushed round by a second, broader field (Bend:
      0 plain, 100 swirled into long streams). Positions are a share of the
      frame's width from its top-left corner, so another frame shape crops
      or extends the same picture.
   2. Levels: every frame is evened out so each colour covers the same share
      of it (the coldest and hottest a little less), then cut into Steps
      flat bands, coloured along the inks from the first (cold) to the last
      (hot) in plain RGB steps. Grain scatters the band edges with a fine
      grain that stays put (100: up to about three steps either way).
   3. Smear: Streak 0 reads the field in upright columns a fiftieth of the
      frame wide (each takes the value at its left edge); they narrow as
      Streak rises and are gone by about 80. Drag swings each row sideways
      along a wavy, zigzag curve, stretches the field across and tears a
      few thin rows (a few hairs at small Drag). Tear smears random
      horizontal bands into long flat streaks, slid and torn off.
   4. Animation: the field sways up and back down once a loop (up first) as
      it slowly changes, and small bumps run along the column edges; Amount
      sets how far (0.30: about a tenth of the width at Blob size 62).
      Seamless.
   ========================================================================== */
(() => {
  const { hash } = PL.rng;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const clamp01 = (v) => clamp(v, 0, 1);

  // Inks run cold to hot. The default look's colours first.
  const PALETTES = [
    { name: 'Sear', colors: ['#18041C', '#26013F', '#1400AB', '#055BD9', '#008DEB', '#4AF5F9'] },
    { name: 'Ironbow', colors: ['#0B0614', '#3B0A5E', '#9A1C6E', '#E2462B', '#F9A41B', '#FFF4B0'] },
    { name: 'Lava', colors: ['#0A0807', '#3A0A08', '#8F1B0C', '#E04A12', '#FFB238', '#FFF6D8'] },
    { name: 'Night vision', colors: ['#020804', '#0A2410', '#145C22', '#2FA43B', '#8BE36A', '#E6FFD4'] },
    { name: 'Spectrum', colors: ['#120626', '#2A1FA0', '#0A8FD8', '#1FD17A', '#F6E127', '#F2462A'] },
    { name: 'Rose', colors: ['#170510', '#4B0B35', '#A3156A', '#F0458F', '#FF9AC1', '#FFE8F1'] },
    { name: 'Glacier', colors: ['#0E1424', '#21406E', '#3C7DBA', '#7CC1E6', '#C6ECF5', '#F7FDFF'] },
    { name: 'Ocean', colors: ['#03111A', '#06324A', '#0A6A7A', '#18A8A0', '#6FE0C2', '#E2FFF2'] },
    { name: 'Copper', colors: ['#0D0907', '#2E1A12', '#5E3420', '#9C5A32', '#D88D55', '#FFE2C2'] },
    { name: 'Mono', colors: ['#0C0C0C', '#2E2E2E', '#5A5A5A', '#8C8C8C', '#C2C2C2', '#F4F4F4'] },
  ];

  /* ---- colour roles -------------------------------------------------------------------- */
  const roles = (n) => (n === 2 ? ['Cold', 'Hot'] : ['Cold', ...Array.from({ length: n - 2 }, (_, i) => 'Ink ' + (i + 2)), 'Hot']);
  const spec = (n) => ({ ramp: n, accents: 0 });

  // "New colors": a thermal ramp, from a near-black through deep, vivid hues to a bright one.
  function generate(n, rng) {
    const C = PL.color;
    const h0 = rng.float(0, 360), span = rng.sign() * rng.float(70, 200);
    const cmax = rng.float(0.14, 0.24), light = rng.chance(0.15);
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      const L = light ? 0.97 - 0.82 * t : 0.13 + 0.83 * Math.pow(t, 0.9);
      const Cc = 0.02 + cmax * Math.sin(Math.PI * Math.min(1, t * 1.15));
      out.push(C.lch(L, Cc, h0 + span * t));
    }
    return out;
  }

  // + adds an ink halfway along the biggest step of the ramp.
  function add(colors) {
    const C = PL.color;
    const c = colors.slice();
    if (c.length < 2) return [...c, '#FFFFFF'];
    let best = 0, bd = -1;
    for (let i = 0; i < c.length - 1; i++) {
      const a = C.hexToOklab(c[i]), b = C.hexToOklab(c[i + 1]);
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      if (d > bd) { bd = d; best = i; }
    }
    c.splice(best + 1, 0, C.mix(c[best], c[best + 1], 0.5));
    return c;
  }

  // Another number of inks: the same ramp, resampled.
  function fit(colors, n) {
    let c = (colors || []).map(PL.color.normHex).filter(Boolean);
    if (!c.length) c = PALETTES[0].colors.slice();
    if (c.length === 1) c.push(PL.color.mix(c[0], PL.color.luminance(c[0]) > 0.4 ? '#000000' : '#FFFFFF', 0.9));
    if (c.length === n) return c;
    return PL.color.ramp(c, n);
  }

  /* ---- settings -------------------------------------------------------------------------- */
  // New variation keeps every setting (it reshuffles every shape): no rand ranges.
  const S = (section, key, label, min, max, def, extra = {}) => ({ section, key, label, type: 'range', min, max, def, step: 1, rand: false, ...extra });
  const PARAMS = [
    S('Field', 'blob', 'Blob size', 0, 100, 62, { unit: '%', hint: 'How big the blobs are' }),
    S('Field', 'bend', 'Bend', 0, 100, 35, { unit: '%', hint: 'How far the field is pushed round (100: swirled into long streams)' }),
    S('Field', 'detail', 'Detail', 1, 5, 4, { hint: 'Layers of finer detail (1: smooth)' }),
    S('Smear', 'streak', 'Streak', 0, 100, 0, { unit: '%', hint: 'Upright columns at 0, narrowing as it rises (gone by about 80)' }),
    S('Smear', 'drag', 'Drag', 0, 100, 0, { unit: '%', hint: 'Swings the rows sideways along a wavy curve, stretching and tearing them' }),
    S('Smear', 'tear', 'Tear', 0, 100, 0, { unit: '%', hint: 'Smears random bands into long horizontal streaks' }),
    S('Levels', 'steps', 'Steps', 2, 24, 16, { hint: 'How many flat color bands' }),
    S('Levels', 'grain', 'Grain', 0, 100, 12, { unit: '%', hint: 'Scatters the band edges with a fine grain that stays put' }),
  ];

  // Constants. Lengths are a share of the frame's width unless noted.
  const K = {
    s62: 0.297,              // the field's lattice step at Blob size 62 % ...
    blobK: [0.01772, 0.0000476], // ... times exp(a d + b d^2), d = Blob size - 62 (about x0.4 at 0, x2.1 at 100)
    gain: 0.58,              // each octave's weight against the one before (twice as fine)
    warp: 1.5,               // Bend 100 %: how far the field is pushed (lattice steps) ...
    warpF: 0.38,             // ... by a field this much broader than the base octave
    warpPow: 1.3,            // the push grows like Bend^warpPow
    zR: 1.5,                 // the field changes along a circle Amount x zR wide (lattice steps) as it sways Amount up and down
    zPow: 0,                 // the circle grows like 2^(octave x zPow) (0: every octave changes alike)
    grid: 320,               // field samples across the width (read between them)
    ends: 0.32,              // the coldest and hottest bands cover (1 - ends) of a middle band's share
    grain: 0.24, grainPow: 1, // grain's reach at 100 % (a share of the whole range), growing like Grain^grainPow ...
    grainMix: 0.5,           // ... with a soft-edged spread: a uniform draw plus this much of a second one
    col: 1 / 50, colPow: 2,  // Streak 0: columns a fiftieth wide, narrowing like (1 - Streak)^colPow
    drag: { amp: 0.09, wave: 0.31, wobble: 0.5, stretch: 0.25, span: 1.8, rows: 14, rowH: [0.002, 0.009], shift: 0.07 },
    tear: { n: 64, span: 1.8, h: [0.008, 0.04], k: [0.05, 0.3], ky: [0.15, 0.4], full: 0.55, dy: 1.2, dx: 0.15 },
    shim: { amp: 0.05, wave: 0.045, thr: 0.32, r: 0.9 },
  };

  /* ---- value noise (3D, smoothstep): soft, slightly boxy blobs ------------------------------- */
  const noiseCache = new Map();
  function vnoise(seed) {
    let n = noiseCache.get(seed);
    if (n) return n;
    if (noiseCache.size > 16) noiseCache.clear();
    const rand = PL.rng.mulberry32((seed ^ 0x2c1b3c6d) >>> 0);
    const p = new Uint8Array(256), V = new Float32Array(256), P = new Uint8Array(512);
    for (let i = 0; i < 256; i++) { p[i] = i; V[i] = rand() * 2 - 1; }
    for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 512; i++) P[i] = p[i & 255];
    n = (x, y, z) => {
      const xf = Math.floor(x), yf = Math.floor(y), zf = Math.floor(z);
      let u = x - xf, v = y - yf, w = z - zf;
      u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v); w = w * w * (3 - 2 * w);
      const X = xf & 255, Y = yf & 255, Z = zf & 255;
      const A = P[X] + Y, B = P[X + 1] + Y;
      const AA = P[A] + Z, AB = P[A + 1] + Z, BA = P[B] + Z, BB = P[B + 1] + Z;
      const a0 = V[P[AA]], b0 = V[P[BA]], c0 = V[P[AB]], d0 = V[P[BB]];
      const a1 = V[P[AA + 1]], b1 = V[P[BA + 1]], c1 = V[P[AB + 1]], d1 = V[P[BB + 1]];
      const e0 = a0 + (b0 - a0) * u, f0 = c0 + (d0 - c0) * u, e1 = a1 + (b1 - a1) * u, f1 = c1 + (d1 - c1) * u;
      const g0 = e0 + (f0 - e0) * v, g1 = e1 + (f1 - e1) * v;
      return g0 + (g1 - g0) * w;
    };
    noiseCache.set(seed, n);
    return n;
  }

  // the lattice step in px
  const stepPx = (p, W) => {
    const d = clamp(p.blob, 0, 100) - 62;
    return K.s62 * Math.exp(K.blobK[0] * d + K.blobK[1] * d * d) * W;
  };

  /* ---- the field on a grid (px), evened out to ranks in [0, 1] ------------------------------- */
  // Covers x0..x1, y0..y1 (px) every h px; the ranks come from the samples inside the frame.
  // hs (General's Rotation and Size): the grid's spacing x this (finer when zoomed in); ranks: even it out
  // as the frame's own samples do (default: from this grid's samples inside the frame)
  function field(seed, p, W, H, t, amount, x0, x1, y0, y1, hs = 1, ranks = null) {
    const h = (W / K.grid) * hs;
    const gx0 = Math.floor(x0 / h) * h, gy0 = Math.floor(y0 / h) * h;
    const gw = Math.ceil((x1 - gx0) / h) + 2, gh = Math.ceil((y1 - gy0) / h) + 2;
    const F = new Float32Array(gw * gh);
    const nF = vnoise(seed | 0), nA = vnoise((seed * 7 + 101) | 0), nB = vnoise((seed * 13 + 202) | 0);
    const fp = 1 / stepPx(p, W);                       // lattice steps per px
    const oct = clamp(Math.round(p.detail), 1, 5);
    const bend = Math.pow(clamp01(p.bend / 100), K.warpPow) * K.warp, wf = K.warpF;
    const th = 2 * Math.PI * t, sy = amount * Math.sin(th), cz = amount * K.zR * Math.cos(th);
    const zo = new Float64Array(oct), amp = new Float64Array(oct);
    let norm = 0;
    for (let o = 0, a = 1; o < oct; o++, a *= K.gain) { amp[o] = a; norm += a; zo[o] = cz * Math.pow(2, o * K.zPow) + o * 13.7; }
    for (let o = 0; o < oct; o++) amp[o] /= norm;
    for (let j = 0; j < gh; j++) {
      const py = (gy0 + j * h) * fp + sy;
      for (let i = 0; i < gw; i++) {
        let qx = (gx0 + i * h) * fp, qy = py;
        if (bend > 0) {
          const ax = qx * wf, ay = qy * wf, az = cz * wf;
          const wx = nA(ax + 31.4, ay + 7.7, az) + 0.5 * nA(2 * ax + 3.1, 2 * ay - 11.3, 2 * az + 5.5);
          const wy = nB(ax - 17.2, ay + 23.9, az) + 0.5 * nB(2 * ax - 8.4, 2 * ay + 4.6, 2 * az - 9.1);
          qx += bend * wx; qy += bend * wy;
        }
        let s = 0;
        for (let o = 0, f = 1; o < oct; o++, f *= 2) s += amp[o] * nF(qx * f + o * 19.13, qy * f - o * 7.31, zo[o]);
        F[j * gw + i] = s;
      }
    }
    // even it out: each value becomes its rank among the samples inside the frame
    const NB = 4096;
    let lo, hi, hist, sc, tot, cum;
    if (ranks) ({ lo, hi, hist, sc, tot, cum } = ranks);
    else {
      lo = Infinity; hi = -Infinity;
      const i0 = Math.max(0, Math.ceil(-gx0 / h)), i1 = Math.min(gw - 1, Math.floor((W - gx0) / h));
      const j0 = Math.max(0, Math.ceil(-gy0 / h)), j1 = Math.min(gh - 1, Math.floor((H - gy0) / h));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const v = F[j * gw + i]; if (v < lo) lo = v; if (v > hi) hi = v; }
      hist = new Float64Array(NB + 1); sc = NB / Math.max(1e-9, hi - lo);
      tot = 0;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { hist[Math.min(NB - 1, Math.floor((F[j * gw + i] - lo) * sc))]++; tot++; }
      cum = new Float64Array(NB + 1);
      for (let b = 0; b < NB; b++) cum[b + 1] = cum[b] + hist[b];
    }
    const out = { gw, gh, gx0, gy0, h, ranks: { lo, hi, hist, sc, tot, cum } };
    for (let k = 0; k < F.length; k++) {
      const x = (F[k] - lo) * sc;
      if (x <= 0) { F[k] = 0; continue; }
      if (x >= NB) { F[k] = 1; continue; }
      const b = Math.floor(x);
      F[k] = (cum[b] + (x - b) * hist[b]) / tot;
    }
    out.F = F;
    return out;
  }

  /* ---- the band colours: Steps colours along the inks, in plain RGB steps -------------------- */
  function levels(colors, N) {
    const rgb = colors.map(PL.color.hexToRgb), n = rgb.length;
    const out = [];
    for (let k = 0; k < N; k++) {
      const x = (N === 1 ? 0 : k / (N - 1)) * (n - 1), j = Math.min(n - 2, Math.floor(x)), f = x - j;
      const a = rgb[Math.max(0, j)], b = rgb[Math.min(n - 1, j + 1)];
      out.push(n === 1 ? a.slice() : [0, 1, 2].map((c) => Math.round(a[c] + (b[c] - a[c]) * f)));
    }
    return out;
  }

  /* ---- the smear: where each pixel reads the field ---------------------------------------- */
  // Column width (px) at a Streak: 0 means none.
  const colWidth = (p, W) => {
    const cw = Math.round(W * K.col * Math.pow(1 - clamp01(p.streak / 100), K.colPow));
    return cw >= 2 ? cw : 0;
  };
  // Drag: a wavy, zigzag shift of every row and a few thin torn rows (px), with how much the field is stretched.
  // Rows: the world rows ys[0..] (the row's middle; default: the frame's, 0.5, 1.5 ... H - 0.5). Past the
  // frame (General's Rotation and Size) the torn rows carry on in tiles span x W tall, each its own.
  const tileSeed = (seed, k) => (k === 0 ? seed : (Math.imul(seed | 0, 0x2f6b9d31) ^ Math.imul(k, 0x9e3779b1)) | 0);
  function dragRows(seed, d, W, H, ys) {
    const nY = ys ? ys.length : H;
    const D = new Float32Array(nY);
    if (d <= 0) return D;
    const n = vnoise((seed * 3 + 77) | 0), A = K.drag, ph = hash(seed, 0x57, 1, 2);
    for (let y = 0; y < nY; y++) {
      // a zigzag with slightly rounded turns, its pace and reach wandering a little
      const v = (ys ? ys[y] : y + 0.5) / W, s = v / A.wave + ph + A.wobble * n(v * 3.1, 3.3, 0.5);
      const z = (2 / Math.PI) * Math.asin(0.985 * Math.sin(2 * Math.PI * s)) / 0.89;
      D[y] = d * A.amp * W * z * (1 + 0.45 * n(v * 2.3, 9.1, 1.5));
    }
    const nr = Math.ceil(A.rows * A.span), T = A.span * W;
    if (!ys) {
      for (let i = 0; i < nr; i++) {
        if (hash(i, seed, 0x51) >= d) continue;
        const y0 = Math.floor(hash(i, seed, 0x52) * A.span * W);
        if (y0 >= H) continue;
        const hh = Math.max(1, Math.round((A.rowH[0] + (A.rowH[1] - A.rowH[0]) * Math.pow(hash(i, seed, 0x53), 2)) * W));
        const s = (hash(i, seed, 0x54) < 0.5 ? -1 : 1) * A.shift * d * d * (0.3 + 0.7 * hash(i, seed, 0x55)) * W;
        for (let y = y0; y < Math.min(H, y0 + hh); y++) D[y] += s;
      }
      return D;
    }
    const yr0 = Math.floor(ys[0]), yr1 = Math.floor(ys[nY - 1]), step = nY > 1 ? (ys[nY - 1] - ys[0]) / (nY - 1) : 1;
    for (let k = Math.floor(yr0 / T) - 1; k <= Math.floor(yr1 / T); k++) {
      const sk = tileSeed(seed, k);
      for (let i = 0; i < nr; i++) {
        if (hash(i, sk, 0x51) >= d) continue;
        const y0 = k * Math.floor(T) + Math.floor(hash(i, sk, 0x52) * A.span * W);
        const hh = Math.max(1, Math.round((A.rowH[0] + (A.rowH[1] - A.rowH[0]) * Math.pow(hash(i, sk, 0x53), 2)) * W));
        if (y0 + hh <= yr0 || y0 > yr1) continue;
        const s = (hash(i, sk, 0x54) < 0.5 ? -1 : 1) * A.shift * d * d * (0.3 + 0.7 * hash(i, sk, 0x55)) * W;
        const a = Math.max(0, Math.ceil((y0 - ys[0]) / step - 1e-9)), b = Math.min(nY, Math.ceil((y0 + hh - ys[0]) / step - 1e-9));
        for (let y = a; y < b; y++) { const r = Math.floor(ys[y]); if (r >= y0 && r < y0 + hh) D[y] += s; }
      }
    }
    return D;
  }
  // Tear: bands smeared sideways: rows y0..y1, columns xa..xb read the field stretched 1/k times across round xc
  // and squeezed ky times round row yc (a little above or below the band).
  // R (General's Rotation and Size: world rows y0..y1, columns x0..x1): past the frame the bands carry on in
  // tiles span x W tall and W wide, each its own; a band right across the frame runs right across the world.
  function tearBands(seed, tr, W, H, R) {
    const out = [];
    if (tr <= 0) return out;
    const T = K.tear, n = Math.ceil(T.n * T.span), Th = Math.floor(T.span * W);
    const ks = R ? [Math.floor(R.y0 / Th) - 1, Math.floor(R.y1 / Th)] : [0, 0], cs = R ? [Math.floor(R.x0 / W) - 1, Math.floor(R.x1 / W) + 1] : [0, 0];
    for (let kr = ks[0]; kr <= ks[1]; kr++) for (let kc = cs[0]; kc <= cs[1]; kc++) {
      const sd = tileSeed(seed, kr * 4099 + kc), oy = kr * Th, ox = kc * W;
      for (let i = 0; i < n; i++) {
        if (hash(i, sd, 0x61) >= tr) continue;
        const hh = Math.max(2, Math.round((T.h[0] + (T.h[1] - T.h[0]) * Math.pow(hash(i, sd, 0x62), 1.3)) * W));
        const y0 = oy + Math.floor(hash(i, sd, 0x63) * T.span * W) - (hh >> 1);
        if (R ? y0 > R.y1 || y0 + hh <= R.y0 : y0 >= H || y0 + hh <= 0) continue;
        let xa = 0, xb = W;
        if (hash(i, sd, 0x64) >= T.full) {
          const len = (0.2 + 0.65 * hash(i, sd, 0x65)) * W;
          xa = ox + Math.round(hash(i, sd, 0x66) * (W + len) - len); xb = Math.round(xa + len);
        } else if (R) {
          if (kc !== 0) continue; // a full band: one per row of tiles, right across
          xa = -Infinity; xb = Infinity;
        }
        out.push({
          y0, y1: y0 + hh, xa, xb,
          xc: ox + hash(i, sd, 0x67) * W,
          dx: (hash(i, sd, 0x6b) * 2 - 1) * T.dx * W,                    // read this far along
          k: T.k[0] + (T.k[1] - T.k[0]) * hash(i, sd, 0x68),
          ym: y0 + hh / 2,                                               // the band's middle ...
          yc: y0 + hh / 2 + (hash(i, sd, 0x69) * 2 - 1) * T.dy * hh,     // ... reads round this row,
          ky: T.ky[0] + (T.ky[1] - T.ky[0]) * hash(i, sd, 0x6a),         // squeezed: flat streaks with round ends
        });
      }
    }
    return out;
  }
  // The animation's shimmer: small bumps that shift the rows (and the column edges) sideways (px).
  function shimmer(seed, amount, t, W, H, ys) {
    const nY = ys ? ys.length : H;
    const S = new Float32Array(nY);
    if (amount <= 0) return S;
    const n = vnoise((seed * 5 + 303) | 0), A = K.shim, th = 2 * Math.PI * t;
    const cx = A.r * Math.cos(th), cz = A.r * Math.sin(th);
    for (let y = 0; y < nY; y++) {
      const v = (ys ? ys[y] : y + 0.5) / W / A.wave;
      const b = n(v, cx + 4.2, cz) * 0.7 + 0.3 * n(2.3 * v, cz - 3.3, cx), e = Math.abs(b) - A.thr;
      S[y] = e > 0 ? (Math.sign(b) * amount * A.amp * W * e) / (1 - A.thr) : 0;
    }
    return S;
  }

  /* ---- grain: a fixed tile of fine noise (-1 … 1, soft-edged) ----------------------------------- */
  const grainCache = new Map();
  function grainTile(seed) {
    let g = grainCache.get(seed);
    if (g) return g;
    if (grainCache.size > 8) grainCache.clear();
    g = new Float32Array(512 * 512);
    const r = PL.rng.mulberry32((seed ^ 0x1b873593) >>> 0);
    const m = K.grainMix, k = 2 / (1 + m);
    for (let i = 0; i < g.length; i++) g[i] = (r() + m * r()) * k - 1;
    grainCache.set(seed, g);
    return g;
  }

  /* ---- paint ------------------------------------------------------------------------------- */
  // map (General's Rotation and Size): the canvas (cw x ch) and the part of the world it shows. Every pixel
  // reads the world at its middle, the field's grid as fine on the canvas as at 100 % (so zoomed in it is
  // read again at full detail), evened out as the frame's own samples are.
  let pvImg = null;
  function paint({ ctx, W, H, seed, p, colors, t = 0, anim, preview = false, map }) {
    const amount = anim ? Math.max(0, anim.amount) : 0;
    const N = clamp(Math.round(p.steps), 2, 24);
    const d = clamp01(p.drag / 100), tr = clamp01(p.tear / 100);
    const cw = colWidth(p, W);
    const st = 1 - K.drag.stretch * d, cx = W / 2;
    const CW = map ? map.cw : W, CH = map ? map.ch : H, ms = map ? map.s : 1, mx = map ? map.x0 : 0, my = map ? map.y0 : 0;
    // the canvas rows' world rows (their middles) and columns
    const ys = map ? Float64Array.from({ length: CH }, (_, y) => my + (y + 0.5) * ms) : null;
    const xl = mx, xr = mx + CW * ms;
    const DR = dragRows(seed, d, W, H, ys), SH = shimmer(seed, amount, t, W, H, ys);
    const TB = tearBands(seed, tr, W, H, map ? { x0: xl, x1: xr, y0: my, y1: my + CH * ms } : undefined);
    // where the rows read the field: x range (px) and y range
    let xmin = xl, xmax = xr, ymin = map ? my : 0, ymax = map ? my + CH * ms : H;
    for (let y = 0; y < CH; y++) {
      const off = DR[y] + SH[y];
      const a = cx + (xl - cx) * st + off, b = cx + (xr - cx) * st + off;
      if (a < xmin) xmin = a; if (b > xmax) xmax = b;
    }
    for (const b of TB) {
      ymin = Math.min(ymin, b.yc - b.y1 + b.y0); ymax = Math.max(ymax, b.yc + b.y1 - b.y0);
      const xa = map ? Math.max(b.xa, xl) : 0, xb = map ? Math.min(b.xb, xr) : W; // (the frame: as at 100 %)
      xmin = Math.min(xmin, b.xc + b.dx + (xa - b.xc) * b.k - 2); xmax = Math.max(xmax, b.xc + b.dx + (xb - b.xc) * b.k + 2);
    }
    let fd;
    if (!map) fd = field(seed, p, W, H, t, amount, xmin - 2, xmax + 2, ymin - 2, ymax + 2);
    else {
      // evened out as the frame's own samples are (the frame at 100 %, this frame of the loop)
      const ranks = field(seed, p, W, H, t, amount, -2, W + 2, -2, H + 2).ranks;
      fd = field(seed, p, W, H, t, amount, xmin - 2 * ms, xmax + 2 * ms, ymin - 2 * ms, ymax + 2 * ms, ms, ranks);
    }
    const { F, gw, gh, gx0, gy0, h } = fd;
    const LV = levels(colors, N);
    const lr = new Uint8Array(N), lg = new Uint8Array(N), lb = new Uint8Array(N);
    for (let k = 0; k < N; k++) { lr[k] = LV[k][0]; lg[k] = LV[k][1]; lb[k] = LV[k][2]; }
    const c0 = K.ends, span = N - 2 * K.ends;
    const ga = K.grain * Math.pow(clamp01(p.grain / 100), K.grainPow) * span;
    const G = ga > 0 ? grainTile(seed | 0) : null;
    const gox = Math.round(mx / ms), goy = Math.round(my / ms); // the grain: one speck per canvas pixel, counted from the frame's corner
    // the bands that cover each row (later ones on top)
    const rowBands = TB.length ? Array.from({ length: CH }, () => null) : null;
    if (rowBands) {
      if (!map) TB.forEach((b) => { for (let y = Math.max(0, b.y0); y < Math.min(H, b.y1); y++) (rowBands[y] || (rowBands[y] = [])).unshift(b); });
      else TB.forEach((b) => {
        const a = Math.max(0, Math.ceil((b.y0 - ys[0]) / ms - 1e-9)), e = Math.min(CH, Math.ceil((b.y1 - ys[0]) / ms - 1e-9) + 1);
        for (let y = a; y < e; y++) { const r = Math.floor(ys[y]); if (r >= b.y0 && r < b.y1) (rowBands[y] || (rowBands[y] = [])).unshift(b); }
      });
    }
    if (preview) { if (!pvImg || pvImg.width !== CW || pvImg.height !== CH) pvImg = ctx.createImageData(CW, CH); }
    const img = preview ? pvImg : ctx.createImageData(CW, CH);
    const d8 = img.data;
    const ih = 1 / h, gwm = gw - 2, ghm = gh - 2;
    // a row of the grid and the weight between it and the next, for a y (px)
    let RJ = 0, RT = 0;
    const rowAt = (yy) => {
      let fy = (yy - gy0) * ih, j = Math.floor(fy);
      if (j < 0) { j = 0; fy = 0; } else if (j > ghm) { j = ghm; fy = ghm + 1; }
      RJ = j * gw; RT = fy - j;
    };
    // per column: its world middle and the world column it falls in (the grain is the canvas's own:
    // as fine at every Size)
    const XS = new Float64Array(CW), XI = new Int32Array(CW);
    for (let x = 0; x < CW; x++) { XS[x] = map ? mx + (x + 0.5) * ms : x + 0.5; XI[x] = map ? Math.floor(XS[x]) : x; }
    for (let y = 0; y < CH; y++) {
      const off = DR[y] + SH[y], bands = rowBands && rowBands[y];
      const yw = map ? ys[y] : y + 0.5;
      rowAt(yw);
      const r0 = RJ, t0 = RT, grow = ((y + goy) & 511) * 512;
      let o = y * CW * 4;
      for (let x = 0; x < CW; x++, o += 4) {
        const xw = XS[x], xi = XI[x];
        let xs = cx + (xw - cx) * st + off, rj = r0, ty = t0;
        if (bands) {
          for (let m = 0; m < bands.length; m++) {
            const b = bands[m];
            if (xi >= b.xa && xi < b.xb) { xs = b.xc + b.dx + (xs - b.xc) * b.k; rowAt(b.yc + (yw - b.ym) * b.ky); rj = RJ; ty = RT; break; }
          }
        }
        if (cw) xs = Math.floor(xs / cw) * cw;  // a column reads the field at its left edge
        let fx = (xs - gx0) * ih, i = Math.floor(fx);
        if (i < 0) { i = 0; fx = 0; } else if (i > gwm) { i = gwm; fx = gwm + 1; }
        const tx = fx - i, k = rj + i;
        const a = F[k] + (F[k + 1] - F[k]) * tx, b = F[k + gw] + (F[k + gw + 1] - F[k + gw]) * tx;
        let q = c0 + (a + (b - a) * ty) * span;
        if (G) q += G[grow + ((x + gox) & 511)] * ga;
        let L = Math.floor(q);
        if (L < 0) L = 0; else if (L >= N) L = N - 1;
        d8[o] = lr[L]; d8[o + 1] = lg[L]; d8[o + 2] = lb[L]; d8[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const oct = clamp(Math.round(p.detail), 1, 5);
    return { status: `${N} steps · detail ${oct}${cw ? ` · ${cw} px columns` : ''}` };
  }

  PL.tools.register({
    id: 'sear',
    name: 'Sear',
    kind: 'Backgrounds',
    tagline: 'Thermal smear',
    about: 'A heat map: a smooth noise field cut into flat bands from cold to hot, read in upright columns or smeared and torn sideways, with a fine grain on the band edges. In the animation the field sways up and back as it slowly changes.',
    raster: true,
    opaque: true, // no background colour to leave out
    inks: {
      min: 2, max: 10, roles, fit, spec, add, generate,
      span: (n) => n, // Invert runs the ramp the other way
      hint: 'Cold to hot: the bands step through the inks in order.',
    },
    palettes: PALETTES,
    params: PARAMS,
    animHint: 'How far the field sways and changes over a loop (0: still)',
    defaults: {
      anim: { amount: 0.3, fps: 12, frames: 48 },
      fx: {},
    },
    paint,
    zoom: true, // paints any part of its world (General's Rotation and Size)
    _K: K,
    _field: field,
    _levels: levels,
    _colWidth: colWidth,
    _stepPx: stepPx,
    _dragRows: dragRows,
    _tearBands: tearBands,
    _shimmer: shimmer,
  });
})();
