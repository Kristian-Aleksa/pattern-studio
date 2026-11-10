/* ==========================================================================
   tools/whorl.js — Whorl: warped op-art.

   1. Field: a few invisible centres. Pull centres draw the stripes into rings
      around them (eyes where two sit close together); push centres bend the
      stripes away into bulges and saddles. The field is a sum of cones with
      rounded tips, so rings open into a wide eye at the core, and the stripes
      tighten (up to 3x) away from the main centre. Pull and Push only set the
      balance between the centres; Count alone sets how dense the stripes are.
   2. Warp: the whole field is bent by a smooth, turbulent or rippled warp.
      Amount sets how far, Detail how fine.
   3. Stripes: Count sets how many, Weight how thick the stripe ink is. Every
      stripe is a filled band between two contour lines, so edges stay crisp
      at any size and the SVG is clean vector.
   4. Animation: the stripes flow into the pull centres, slowly far out and
      faster near the core, and each ring vanishes into the centre as the
      next one arrives, like falling into a black hole. Each loop moves whole
      color cycles (one stripe of every ink), so it is seamless.
   ========================================================================== */
(() => {
  const { hash } = PL.rng;

  // Ground first, then the stripe inks (the default pair first).
  const PALETTES = [
    { name: 'Acid', colors: ['#223414', '#F3FF76'] },
    { name: 'Ink', colors: ['#121212', '#F2EEE6'] },
    { name: 'Flame', colors: ['#E23726', '#FAD957'] }, // no white or grey: vermilion and sun yellow
    { name: 'Cobalt', colors: ['#EEEBE4', '#2340C8'] },
    { name: 'Grape', colors: ['#2B1640', '#F6B9E6'] },
    { name: 'Mint', colors: ['#0D2B26', '#A6F2CF'] },
    { name: 'Ember', colors: ['#2A0E08', '#FF9442'] },
    { name: 'Sky', colors: ['#14284B', '#BFE3FF'] },
    { name: 'Complement', colors: ['#F5F1E9', '#D95448', '#0097A8'] }, // complement 28/208: two stripe inks at one lightness
    { name: 'Candy', colors: ['#FFF3E6', '#FF5D7A', '#FFB52E', '#2FA3FF'] },
    { name: 'Indigo', colors: ['#1F1976', '#FBA962'] }, // no white or grey: deep indigo and apricot
  ];

  /* ---- color roles: ground, then stripe inks (stripes take turns through them) */
  const roles = (n) => (n <= 2 ? ['Ground', 'Stripes'] : ['Ground', ...Array.from({ length: n - 1 }, (_, i) => 'Stripes ' + (i + 1))]);
  const spec = (n) => ({ ramp: 2, accents: Math.max(0, n - 2) });
  const isLight = (hex) => PL.color.luminance(hex) > 0.35;

  // "New colors": op-art pairs with a strong light / dark contrast.
  function generate(n, rng) {
    const C = PL.color;
    const h = rng.float(0, 360);
    const darkGround = rng.chance(0.6);
    const ground = darkGround
      ? C.lch(rng.float(0.17, 0.3), rng.float(0.03, 0.08), h)
      : C.lch(rng.float(0.93, 0.97), rng.float(0.01, 0.035), rng.float(60, 100));
    const hs = darkGround ? h + rng.pick([60, 90, 120, 180, 200]) : rng.float(0, 360);
    const stripeL = darkGround ? rng.float(0.86, 0.96) : rng.float(0.42, 0.62);
    const stripeC = darkGround ? rng.float(0.1, 0.19) : rng.float(0.15, 0.24);
    const out = [ground];
    for (let i = 1; i < n; i++) out.push(C.lch(stripeL + rng.float(-0.04, 0.04), stripeC, hs + (i - 1) * rng.float(95, 140)));
    return out;
  }

  // + adds another stripe ink, turned round the hue wheel from the last one.
  function add(colors) {
    const C = PL.color;
    const c = colors.slice();
    if (c.length < 2) c.push(isLight(c[0] || '#FFFFFF') ? '#1A1A1A' : '#F2EEE6');
    else {
      const [l, ch, hh] = C.hexToLch(c[c.length - 1]);
      c.push(C.lch(l, Math.max(0.1, ch), hh + 125));
    }
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
    S('Field', 'centres', 'Centres', 1, 8, 4, { rand: [2, 6], hint: 'Invisible centres the stripes bend around' }),
    S('Field', 'pull', 'Pull', 0, 100, 62, { unit: '%', rand: [45, 85], hint: 'Strength of the centres that draw the stripes into rings' }),
    S('Field', 'push', 'Push', 0, 100, 35, { unit: '%', rand: [15, 60], hint: 'Strength of the centres that push the stripes aside into bulges and saddles' }),
    S('Stripes', 'count', 'Count', 2, 64, 16, { rand: [11, 24], hint: 'How many stripes' }),
    S('Stripes', 'weight', 'Weight', 5, 95, 50, { unit: '%', rand: false, hint: 'Thickness of the stripe ink' }),
    { section: 'Warp', key: 'kind', label: 'Kind', type: 'seg', def: 'smooth', rand: false,
      options: [{ value: 'smooth', label: 'Smooth' }, { value: 'turbulent', label: 'Turbulent' }, { value: 'ripple', label: 'Ripple' }] },
    S('Warp', 'amount', 'Amount', 0, 100, 50, { unit: '%', rand: [30, 70], hint: 'How far the warp bends the stripes' }),
    S('Warp', 'detail', 'Detail', 0, 100, 30, { unit: '%', rand: [15, 55], hint: 'How fine the warp is' }),
  ];

  // Shape constants: lengths in units of the frame's long edge (L).
  const K = {
    // centres
    spanMain: [-0.05, 1.05], // the main centre lands within this span of the frame
    span: [-0.5, 1.5],      // the others within this span
    wMain: [0.9, 1.3],      // cone weights (the main centre is the strongest)
    w: [0.25, 0.75],
    pushShare: 0.5,         // share of the other centres that push
    base: 0.03,             // weight left when Pull or Push is at 0 %
    total: 1.45,            // the weights are scaled to add up to this
    per: 0.03,              // stripe period at Count 16 on a cone of weight 1 (x L)
    accel: 2,               // stripes tighten away from the main centre (how fast) ...
    dense: 3,               // ... up to this many times as tight
    core: 2.5,              // rounded tip of each cone, in its own ring spacings
    coreMax: 0.35,
    // warp
    aS: 0.26, fS: 1.25,     // smooth bend of the whole field: amplitude at Amount 100 % (x L), frequency (cycles per L)
    aT: 0.07, fT: 3.5,      // turbulent: mid-scale fbm on top (amplitude x L, base frequency)
    aR: 0.02, fR: [4, 16],  // ripple: crossed sine waves on top (amplitude x L, frequency over Detail)
    rTilt: 0.35,            // ripple axes turn up to this much (radians) from upright
    coarse: 200,            // warp samples per L (bicubic in between)
    // contours
    cellPx: 2,              // contour grid cell (px) in the preview, at least 1/520 of its long edge
    cellPxOut: 2.5,         // ... and in exports
    maxCells: 2.2e6,
    simplify: 0.12,         // exports drop contour points that lie within this many px of the line
  };

  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---- centres ------------------------------------------------------------ */
  function centresFor(aw, ah, seed, p, P) {
    const out = [];
    const N = Math.max(1, Math.round(p.centres));
    const pull = K.base + (1 - K.base) * (p.pull / 100), push = K.base + (1 - K.base) * (p.push / 100);
    let sum = 0;
    for (let i = 0; i < N; i++) {
      const h = (k) => hash(seed, i, k, 0x51ed);
      const main = i === 0;
      const sp = main ? K.spanMain : K.span;
      const x = aw * lerp(sp[0], sp[1], h(1)), y = ah * lerp(sp[0], sp[1], h(2));
      const s = !main && h(3) < K.pushShare ? -1 : 1;
      const w = main ? lerp(K.wMain[0], K.wMain[1], h(4)) : lerp(K.w[0], K.w[1], h(4));
      const m = w * (s > 0 ? pull : push);
      sum += m;
      out.push({ x, y, m: s * m, a: 0 });
    }
    // Pull and Push set the balance between the centres; Count alone sets how dense the stripes are.
    const k = K.total / Math.max(1e-6, sum);
    for (const c of out) {
      c.m *= k;
      c.a = Math.min(K.coreMax, (K.core * P) / Math.abs(c.m));
    }
    return out;
  }

  /* ---- warp (coarse grid, cached) -------------------------------------------
     Every kind bends the field smoothly. Turbulent adds a finer, restless bend;
     Ripple adds crossed sine waves (each axis shifts with the other), so upright
     stripes wave sideways and level ones up and down. Where the stripes are
     wide, near a centre, the same bends fold the rings into lobes.            */
  // (ox, oy): where the grid starts, aw x ah: how far it reaches (units of L; the frame: 0, 0 and its size);
  // zc < 1 (zoomed out): coarser, as fine on the screen as the frame's
  const warpCache = new Map();
  function warpGrid(aw, ah, seed, kind, detail, ox = 0, oy = 0, zc = 1) {
    const key = [aw.toFixed(4), ah.toFixed(4), seed, kind, detail, ox, oy, zc].join('|');
    const hit = warpCache.get(key);
    if (hit) return hit;
    const c = 1 / (K.coarse * zc), m = 2;
    const cx = Math.ceil(aw / c) + 2 * m, cy = Math.ceil(ah / c) + 2 * m;
    const n = (cx + 1) * (cy + 1);
    const Dx = new Float32Array(n), Dy = new Float32Array(n);
    const N = PL.noise.get(seed ^ 0x7f4a7c15);
    const d = detail / 100;
    const fS = K.fS * (1 + 0.8 * d), oS = 1 + Math.round(2 * d);
    const fT = K.fT * (1 + 0.8 * d), oT = 2 + Math.round(2 * d);
    const fR = lerp(K.fR[0], K.fR[1], d);
    // Ripple axes: near upright, turned a little per seed.
    const tilt = (hash(seed, 7, 1, 3) * 2 - 1) * K.rTilt, ct = Math.cos(tilt), st = Math.sin(tilt);
    for (let j = 0; j <= cy; j++) {
      const y = oy + (j - m) * c;
      for (let i = 0; i <= cx; i++) {
        const x = ox + (i - m) * c, k = j * (cx + 1) + i;
        let dx = K.aS * N.fbm4(x * fS + 3.1, y * fS - 1.7, 0.31, 0, oS, 0.5);
        let dy = K.aS * N.fbm4(x * fS - 8.3, y * fS + 5.9, 1.73, 0, oS, 0.5);
        if (kind === 'turbulent') {
          dx += K.aT * N.fbm4(x * fT + 11.3, y * fT - 2.9, 4.4, 0, oT, 0.5);
          dy += K.aT * N.fbm4(x * fT - 6.2, y * fT + 9.4, 6.6, 0, oT, 0.5);
        } else if (kind === 'ripple') {
          const u = x * ct + y * st, v = -x * st + y * ct; // rotated axes
          const pu = N.fbm4(x * 1.3 + 21.1, y * 1.3, 8.8, 0, 2, 0.5), pv = N.fbm4(x * 1.3, y * 1.3 - 17.3, 9.9, 0, 2, 0.5);
          const env = 0.8 + 0.2 * N.noise4(x * 1.1 - 4.4, y * 1.1 + 2.2, 12.1, 0);
          const wu = K.aR * env * Math.sin(Math.PI * 2 * (v * fR + 0.35 * pu)); // shift along u, waving along v
          const wv = K.aR * env * Math.sin(Math.PI * 2 * (u * fR + 0.35 * pv));
          dx += wu * ct - wv * st;
          dy += wu * st + wv * ct;
        }
        Dx[k] = dx; Dy[k] = dy;
      }
    }
    const out = { Dx, Dy, cx, cy, c, m };
    if (warpCache.size > 8) warpCache.delete(warpCache.keys().next().value);
    warpCache.set(key, out);
    return out;
  }

  // Catmull-Rom weights.
  function crw(t, w) {
    const t2 = t * t, t3 = t2 * t;
    w[0] = -0.5 * t3 + t2 - 0.5 * t;
    w[1] = 1.5 * t3 - 2.5 * t2 + 1;
    w[2] = -1.5 * t3 + 2 * t2 + 0.5 * t;
    w[3] = 0.5 * t3 - 0.5 * t2;
  }

  /* ---- the field on the contour grid (cached) ---------------------------------- */
  // The frame (aw x ah, units of L), or with o (General's Rotation and Size) the part of the world from
  // (o.x, o.y), o.w x o.h: the centres stay where they are and the field runs on past the frame.
  const fieldCache = new Map();
  function fieldGrid(aw, ah, nx, ny, seed, p, o) {
    const ox = o ? o.x : 0, oy = o ? o.y : 0, rw = o ? o.w : aw, rh = o ? o.h : ah, zc = o ? Math.min(1, o.z) : 1;
    const key = [aw.toFixed(4), ah.toFixed(4), nx, ny, seed, p.centres, p.pull, p.push, p.count, p.kind, p.amount, p.detail, ox, oy, rw, rh, zc].join('|');
    const hit = fieldCache.get(key);
    if (hit) return hit;
    const P = (K.per * 16) / Math.max(1, p.count);
    const cs = centresFor(aw, ah, seed, p, P);
    const Wg = warpGrid(rw, rh, seed, p.kind, p.detail, ox, oy, zc);
    const A = p.amount / 100;
    const gx = rw / nx, gy = rh / ny;
    // Precompute the bicubic taps for every column and row.
    const colI = new Int32Array(nx + 1), colW = new Float64Array((nx + 1) * 4);
    const rowI = new Int32Array(ny + 1), rowW = new Float64Array((ny + 1) * 4);
    const w4 = [0, 0, 0, 0];
    for (let i = 0; i <= nx; i++) {
      const u = (i * gx) / Wg.c + Wg.m, i0 = Math.floor(u);
      colI[i] = i0 - 1; crw(u - i0, w4); colW.set(w4, i * 4);
    }
    for (let j = 0; j <= ny; j++) {
      const v = (j * gy) / Wg.c + Wg.m, j0 = Math.floor(v);
      rowI[j] = j0 - 1; crw(v - j0, w4); rowW.set(w4, j * 4);
    }
    const phi = new Float64Array((nx + 1) * (ny + 1));
    const stride = Wg.cx + 1, Dx = Wg.Dx, Dy = Wg.Dy;
    const nC = cs.length;
    const CX = cs.map((c) => c.x), CY = cs.map((c) => c.y), CM = cs.map((c) => c.m), CA = cs.map((c) => c.a), B = K.accel;
    // The field's value at the main centre: stripes are widest there and tighten with distance.
    let F0 = 0;
    const G = K.dense - 1, us = G / (2 * B); // g'(u) = 1 + G * tanh(|u| / us)
    for (let c = 0; c < nC; c++) { const ex = CX[0] - CX[c], ey = CY[0] - CY[c], a = CA[c]; F0 += CM[c] * (Math.sqrt(ex * ex + ey * ey + a * a) - a); }
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j <= ny; j++) {
      const y = oy + j * gy, rI = rowI[j], rw4 = j * 4;
      for (let i = 0; i <= nx; i++) {
        const x = ox + i * gx, cI = colI[i], cw = i * 4;
        let dx = 0, dy = 0;
        if (A > 0) {
          for (let b = 0; b < 4; b++) {
            const wy = rowW[rw4 + b], base = (rI + b) * stride + cI;
            const w0 = colW[cw], w1 = colW[cw + 1], w2 = colW[cw + 2], w3 = colW[cw + 3];
            dx += wy * (Dx[base] * w0 + Dx[base + 1] * w1 + Dx[base + 2] * w2 + Dx[base + 3] * w3);
            dy += wy * (Dy[base] * w0 + Dy[base + 1] * w1 + Dy[base + 2] * w2 + Dy[base + 3] * w3);
          }
        }
        const qx = x + A * dx, qy = y + A * dy;
        let f = 0;
        for (let c = 0; c < nC; c++) {
          const ex = qx - CX[c], ey = qy - CY[c], a = CA[c];
          f += CM[c] * (Math.sqrt(ex * ex + ey * ey + a * a) - a);
        }
        const u = f - F0, au = Math.min(40, Math.abs(u) / us);
        const v = (u + Math.sign(u) * G * us * (au + Math.log1p(Math.exp(-2 * au)) - Math.LN2)) / P; // g(u) = integral of 1 + G * tanh
        phi[j * (nx + 1) + i] = v;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    const out = { phi, lo, hi, centres: cs, P };
    if (fieldCache.size > 6) fieldCache.delete(fieldCache.keys().next().value);
    fieldCache.set(key, out);
    return out;
  }

  /* ---- band contours ------------------------------------------------------------
     Stripes are the bands where frac(phi) < w. Every band boundary is a contour
     line at level k (lower edge) or k + w (upper edge) of the bilinear surface
     through the grid values. Lower edges run with phi > level on their right,
     upper edges the other way, and lines that leave the frame are closed along
     its edge, so filling all loops with the nonzero rule paints exactly the
     bands, holes and all. Level index q: 2k = level k, 2k + 1 = level k + w.   */
  // (ox, oy): the grid's top-left corner (the frame: 0, 0); W x H: its size
  function bandContours(phi, nx, ny, W, H, w, shift, ox = 0, oy = 0) {
    const lv = (q) => (q >> 1) + (q & 1 ? w : 0);
    const qLo = (x) => { const k = Math.floor(x), fr = x - k; return fr === 0 ? 2 * k : fr <= w ? 2 * k + 1 : 2 * k + 2; };
    const qHi = (x) => { const k = Math.floor(x), fr = x - k; return fr > w ? 2 * k + 1 : fr > 0 ? 2 * k : 2 * k - 1; };
    const sx = W / nx, sy = H / ny, row = nx + 1;
    const V = (i, j) => phi[j * row + i] + shift;
    // Edges: horizontal (i, j)-(i+1, j) first, then vertical (i, j)-(i, j+1).
    const nH = nx * (ny + 1), nE = nH + row * ny;
    const off = new Int32Array(nE + 1), q0 = new Int32Array(nE);
    let M = 0;
    for (let e = 0; e < nE; e++) {
      let a, b;
      if (e < nH) { const j = (e / nx) | 0, i = e - j * nx; a = V(i, j); b = V(i + 1, j); }
      else { const r = e - nH, j = (r / row) | 0, i = r - j * row; a = V(i, j); b = V(i, j + 1); }
      off[e] = M;
      if (a === b) { q0[e] = 0; continue; }
      const lo = Math.min(a, b), hi = Math.max(a, b);
      const ql = qLo(lo), qh = qHi(hi);
      q0[e] = ql;
      if (qh >= ql) M += qh - ql + 1;
    }
    off[nE] = M;
    const X = new Float64Array(M), Y = new Float64Array(M), nq = new Int32Array(M), ne = new Int32Array(M);
    for (let e = 0; e < nE; e++) {
      const cnt = off[e + 1] - off[e];
      if (!cnt) continue;
      let ax, ay, bx, by, a, b;
      if (e < nH) { const j = (e / nx) | 0, i = e - j * nx; a = V(i, j); b = V(i + 1, j); ax = ox + i * sx; ay = oy + j * sy; bx = ax + sx; by = ay; }
      else { const r = e - nH, j = (r / row) | 0, i = r - j * row; a = V(i, j); b = V(i, j + 1); ax = ox + i * sx; ay = oy + j * sy; bx = ax; by = ay + sy; }
      for (let k = 0; k < cnt; k++) {
        const n = off[e] + k, q = q0[e] + k, t = (lv(q) - a) / (b - a);
        X[n] = ax + (bx - ax) * t; Y[n] = ay + (by - ay) * t; nq[n] = q; ne[n] = e;
      }
    }
    const next = new Int32Array(M).fill(-1), hasPrev = new Uint8Array(M);
    // One contour segment through a cell, from edge ea to edge eb (reversed for upper edges).
    const seg = (ea, eb, q) => {
      let s = off[ea] + (q - q0[ea]), t = off[eb] + (q - q0[eb]);
      if (q & 1) { const z = s; s = t; t = z; }
      next[s] = t; hasPrev[t] = 1;
    };
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const v0 = V(i, j), v1 = V(i + 1, j), v2 = V(i + 1, j + 1), v3 = V(i, j + 1);
        const lo = Math.min(v0, v1, v2, v3), hi = Math.max(v0, v1, v2, v3);
        if (lo === hi) continue;
        const ql = qLo(lo), qh = qHi(hi);
        if (qh < ql) continue;
        const eT = j * nx + i, eB = (j + 1) * nx + i, eL = nH + j * row + i, eR = eL + 1;
        for (let q = ql; q <= qh; q++) {
          const l = lv(q);
          const code = (v0 > l ? 8 : 0) | (v1 > l ? 4 : 0) | (v2 > l ? 2 : 0) | (v3 > l ? 1 : 0);
          switch (code) {
            case 8: seg(eT, eL, q); break;
            case 4: seg(eR, eT, q); break;
            case 2: seg(eB, eR, q); break;
            case 1: seg(eL, eB, q); break;
            case 7: seg(eL, eT, q); break;
            case 11: seg(eT, eR, q); break;
            case 13: seg(eR, eB, q); break;
            case 14: seg(eB, eL, q); break;
            case 12: seg(eR, eL, q); break;
            case 6: seg(eB, eT, q); break;
            case 3: seg(eL, eR, q); break;
            case 9: seg(eT, eB, q); break;
            case 10: if ((v0 + v1 + v2 + v3) / 4 > l) { seg(eT, eR, q); seg(eB, eL, q); } else { seg(eT, eL, q); seg(eB, eR, q); } break;
            case 5: if ((v0 + v1 + v2 + v3) / 4 > l) { seg(eL, eT, q); seg(eR, eB, q); } else { seg(eR, eT, q); seg(eL, eB, q); } break;
          }
        }
      }
    }
    // Trace: open pieces start on the frame edge (no predecessor); the rest are closed loops.
    const seen = new Uint8Array(M);
    const loops = [], loopQ = [];
    const open = new Map(); // level -> [{ pts, s0, s1 }]
    const per = (n) => { // position along the frame edge, clockwise from the top-left corner
      const e = ne[n];
      if (e < nH) return e < nx ? X[n] - ox : W + H + (W - (X[n] - ox));
      const r = e - nH, i = r % row;
      return i === nx ? W + (Y[n] - oy) : 2 * W + H + (H - (Y[n] - oy));
    };
    for (let n = 0; n < M; n++) {
      if (seen[n] || next[n] < 0 || hasPrev[n]) continue;
      const pts = [];
      let c = n, end = n;
      while (c >= 0 && !seen[c]) { seen[c] = 1; pts.push(X[c], Y[c]); end = c; c = next[c]; }
      const q = nq[n];
      if (!open.has(q)) open.set(q, []);
      open.get(q).push({ pts, s0: per(n), s1: per(end) });
    }
    for (let n = 0; n < M; n++) {
      if (seen[n] || next[n] < 0) continue;
      const pts = [];
      let c = n;
      while (c >= 0 && !seen[c]) { seen[c] = 1; pts.push(X[c], Y[c]); c = next[c]; }
      if (pts.length >= 6) { loops.push(pts); loopQ.push(nq[n]); }
    }
    // Close open pieces along the frame edge: clockwise for lower edges, anticlockwise for upper.
    const P4 = 2 * (W + H);
    const corners = [[0, ox, oy], [W, ox + W, oy], [W + H, ox + W, oy + H], [2 * W + H, ox, oy + H]];
    for (const [q, pieces] of open) {
      const cw = !(q & 1);
      const used = new Uint8Array(pieces.length);
      for (let s = 0; s < pieces.length; s++) {
        if (used[s]) continue;
        const pts = [];
        let cur = s, guard = 0;
        while (!used[cur] && guard++ < pieces.length + 2) {
          used[cur] = 1;
          const pc = pieces[cur];
          for (let k = 0; k < pc.pts.length; k++) pts.push(pc.pts[k]);
          // the next piece start along the edge in the walking direction
          let best = -1, bd = Infinity;
          for (let t = 0; t < pieces.length; t++) {
            const d = cw ? (pieces[t].s0 - pc.s1 + P4) % P4 : (pc.s1 - pieces[t].s0 + P4) % P4;
            if (d < bd && (t === s || !used[t])) { bd = d; best = t; }
          }
          if (best < 0) break;
          // corners passed on the way
          const from = pc.s1;
          const cs = corners.map((c) => [cw ? (c[0] - from + P4) % P4 : (from - c[0] + P4) % P4, c[1], c[2]]).filter((c) => c[0] > 0 && c[0] < bd).sort((a, b) => a[0] - b[0]);
          for (const c of cs) pts.push(c[1], c[2]);
          cur = best;
        }
        if (pts.length >= 6) { loops.push(pts); loopQ.push(q); }
      }
    }
    // Levels that never touch the frame edge but have it on their high side add the frame itself.
    let gLo = Infinity, gHi = -Infinity;
    for (let k = 0; k < phi.length; k++) { const v = phi[k] + shift; if (v < gLo) gLo = v; if (v > gHi) gHi = v; }
    const vEdge = V(0, 0);
    for (let q = 2 * Math.floor(gLo); q <= qHi(gHi); q++) {
      if (open.has(q) || !(vEdge > lv(q))) continue;
      loops.push(q & 1 ? [ox, oy, ox, oy + H, ox + W, oy + H, ox + W, oy] : [ox, oy, ox + W, oy, ox + W, oy + H, ox, oy + H]);
      loopQ.push(q);
    }
    return { loops, loopQ, crossings: M };
  }

  // Contour grid for a W x H render. The preview passes crisp: false.
  function gridFor(W, H, crisp) {
    let cell = crisp === false ? Math.max(K.cellPx, Math.max(W, H) / 520) : K.cellPxOut;
    if ((W / cell) * (H / cell) > K.maxCells) cell = Math.sqrt((W * H) / K.maxCells);
    return [Math.max(8, Math.round(W / cell)), Math.max(8, Math.round(H / cell))];
  }

  // Ramer-Douglas-Peucker on a closed loop (flat [x, y, ...]); keeps at least 3 points.
  function simplify(pts, tol) {
    const n = pts.length >> 1;
    if (n < 8) return pts;
    const keep = new Uint8Array(n);
    const t2 = tol * tol;
    // split the loop at its first point and the point farthest from it
    let far = 0, fd = -1;
    for (let i = 1; i < n; i++) { const d = (pts[2 * i] - pts[0]) ** 2 + (pts[2 * i + 1] - pts[1]) ** 2; if (d > fd) { fd = d; far = i; } }
    keep[0] = keep[far] = 1;
    const stack = [0, far, far, n];
    while (stack.length) {
      const b = stack.pop(), a = stack.pop();
      const ax = pts[2 * a], ay = pts[2 * a + 1], bi = b % n, bx = pts[2 * bi], by = pts[2 * bi + 1];
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1e-12;
      let best = -1, bd = t2;
      for (let i = a + 1; i < b; i++) {
        const px = pts[2 * i] - ax, py = pts[2 * i + 1] - ay;
        const cr = px * dy - py * dx, d = (cr * cr) / len2;
        if (d > bd) { bd = d; best = i; }
      }
      if (best >= 0) { keep[best] = 1; stack.push(a, best, best, b); }
    }
    const out = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[2 * i], pts[2 * i + 1]);
    return out.length >= 6 ? out : pts;
  }

  /* ---- build ------------------------------------------------------------------- */
  // region (General's Rotation and Size): the part of the world to cover, its contour grid as fine on the
  // screen as the frame's (z: screen pixels per frame unit there).
  function build({ W, H, seed, p, colors, t = 0, anim, crisp, region }) {
    const n = colors.length;
    const scene = new PL.Scene(W, H, colors[0], 0);
    const L = Math.max(W, H), aw = W / L, ah = H / L;
    const R = region, z = R ? R.z || 1 : 1;
    const RW = R ? R.x1 - R.x0 : W, RH = R ? R.y1 - R.y0 : H;
    // Contour grid: about cellPx pixels per cell, within a budget.
    const [nx, ny] = R ? gridFor(RW * z, RH * z, crisp) : gridFor(W, H, crisp);
    const F = fieldGrid(aw, ah, nx, ny, seed, p, R ? { x: R.x0 / L, y: R.y0 / L, w: RW / L, h: RH / L, z } : undefined);
    // The loop moves whole color cycles (one stripe of each ink), so it ends where it began.
    const inks = Math.max(1, n - 1);
    const amt = Math.max(0, anim ? anim.amount : 0);
    const flow = Math.round(amt * 1.67) * inks * t;
    const w = Math.min(0.98, Math.max(0.02, p.weight / 100));
    const { loops, loopQ } = R ? bandContours(F.phi, nx, ny, RW, RH, w, flow, R.x0, R.y0) : bandContours(F.phi, nx, ny, W, H, w, flow);
    const layers = [];
    for (let k = 0; k < inks; k++) layers.push(scene.layer('stripes-' + (k + 1), colors[k + 1] || colors[0], inks > 1 ? `Stripes ${k + 1}` : 'Stripes', k + 1));
    const tol = crisp === false ? 0 : K.simplify / z;
    for (let i = 0; i < loops.length; i++) {
      const band = loopQ[i] >> 1;
      layers[((band % inks) + inks) % inks].p.push(tol > 0 ? simplify(loops[i], tol) : loops[i]);
    }
    return scene;
  }

  PL.tools.register({
    id: 'whorl',
    name: 'Whorl',
    kind: 'Backgrounds',
    tagline: 'Warped op-art',
    about: 'Stripes bend around invisible centres into rings, eyes and saddles, then a smooth, turbulent or rippled warp bends them further. Flat color, crisp vector edges.',
    inks: {
      min: 2, max: 6, roles, fit, spec, add, generate,
      span: () => 2, // Invert swaps the ground and the stripes
      hint: 'The first color is the ground; the others are the stripes, taking turns.',
    },
    palettes: PALETTES,
    params: PARAMS,
    defaults: {
      anim: { amount: 0.6, fps: 12, frames: 36 },
      fx: {},
    },
    build,
    zoom: true, // draws any region of its world (General's Rotation and Size)
    _K: K,
    _clear: () => { warpCache.clear(); fieldCache.clear(); },
    _field: (aw, ah, nx, ny, seed, p) => fieldGrid(aw, ah, nx, ny, seed, p),
    _grid: gridFor,
  });
})();
