/* ==========================================================================
   core/fx.js
   The two finishing effects every style shares, in one pass over the pixels:

   Grain   film-style noise, dust specks, Roughness (uneven, clumpy grain) and a
           Vignette, mixed into the art by a blend mode: Mix (lightens and darkens),
           Multiply (darkens, like ink soaking into paper), Add (a fine glitter that
           lifts dark grounds), Overlay and Soft Light (contrast in the midtones,
           leaving pure black and white alone) and Screen (a soft, even lift).
   Dither  the picture printed again in a few colors through an ordered (Bayer
           8 / 4 / 2) or random (Noise) threshold, in cells of Pixel size, mixed
           in by Amount (Mist's dither, for every style). Tone 2–8 = that many
           levels of red, green and blue; Tone 1 = only the style's own colors;
           Tone 0 = only its darkest and lightest color.

   Grain goes on first, then the dither prints the grained picture.
   Grain sizes are in "1080 units" (px at a 1080 px long edge); dither cells in
   px at a 713 px short side (Pixel size 2 = 2 px there), so a look holds at
   every export size. Transparent pixels stay transparent.
   ========================================================================== */
PL.fx = (() => {
  function bayer(n) {
    let m = [[0]];
    while (m.length < n) {
      const s = m.length, next = [];
      for (let y = 0; y < s * 2; y++) {
        const row = [];
        for (let x = 0; x < s * 2; x++) {
          const q = y < s ? (x < s ? 0 : 2) : x < s ? 3 : 1;
          row.push(4 * m[y % s][x % s] + q);
        }
        next.push(row);
      }
      m = next;
    }
    return Float32Array.from(m.flat(), (v) => (v + 0.5) / (n * n));
  }
  const BAYER2 = bayer(2);
  const BAYER4 = bayer(4);
  const BAYER8 = bayer(8);
  const NOISE64 = Float32Array.from({ length: 64 }, (_, k) => (k + 0.5) / 64); // Noise: one of 64 thresholds per cell, at random

  const PATTERNS = [
    { value: 'bayer8', label: 'Bayer 8' },
    { value: 'bayer4', label: 'Bayer 4' },
    { value: 'bayer2', label: 'Bayer 2' },
    { value: 'noise', label: 'Noise' },
  ];
  const BLENDS = [
    { value: 'mix', label: 'Mix' },
    { value: 'multiply', label: 'Multiply' },
    { value: 'add', label: 'Add' },
    { value: 'overlay', label: 'Overlay' },
    { value: 'softlight', label: 'Soft Light' },
    { value: 'screen', label: 'Screen' },
  ];
  // the Pattern choice: its thresholds and size (Bayer 8 unless set; Noise = 0)
  const pattern = (fx) => (fx.ditherPattern === 'bayer4' ? [BAYER4, 4] : fx.ditherPattern === 'bayer2' ? [BAYER2, 2] : fx.ditherPattern === 'noise' ? [NOISE64, 0] : [BAYER8, 8]);

  const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  // Every style starts from these; a style's own defaults.fx overrides some of them.
  const DEFAULTS = {
    ditherOn: false, ditherPattern: 'bayer8', ditherPx: 2, tones: 3, ditherAmt: 100,
    grainOn: false, grainBlend: 'mix', grainSize: 1, grainSpecks: 30, grainRough: 0, vignette: 20, grain: 30,
  };
  const DITHER_KEYS = ['ditherPattern', 'ditherPx', 'tones', 'ditherAmt'];
  const GRAIN_KEYS = ['grainBlend', 'grainSize', 'grainSpecks', 'grainRough', 'vignette', 'grain'];

  const grainActive = (fx) => !!fx && !!fx.grainOn && (fx.grain > 0 || fx.grainSpecks > 0 || fx.vignette > 0);
  const ditherActive = (fx) => !!fx && !!fx.ditherOn && fx.ditherAmt > 0;
  const isActive = (fx) => grainActive(fx) || ditherActive(fx);

  /* ------------------------------------------------------------------ grain */
  const lattice = (ix, iy, sd) => {
    let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ sd;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  // one row of smooth value noise (0..1) on a lattice L px apart
  function valueRow(out, W, y, L, sd) {
    const fy = y / L, iy = Math.floor(fy);
    let ty = fy - iy;
    ty = ty * ty * (3 - 2 * ty);
    let ix = -2147483648, v0 = 0, v1 = 0;
    for (let x = 0; x < W; x++) {
      const fx = x / L, jx = Math.floor(fx);
      if (jx !== ix) {
        ix = jx;
        const a = lattice(ix, iy, sd), b = lattice(ix + 1, iy, sd), c = lattice(ix, iy + 1, sd), d = lattice(ix + 1, iy + 1, sd);
        v0 = a + (c - a) * ty;
        v1 = b + (d - b) * ty;
      }
      let tx = fx - jx;
      tx = tx * tx * (3 - 2 * tx);
      out[x] = v0 + (v1 - v0) * tx;
    }
  }

  // Soft light and overlay per channel value (0..255), as tables: c + e * table[c]
  const OVL = new Float32Array(256), SL_DARK = new Float32Array(256), SL_LIGHT = new Float32Array(256);
  for (let c = 0; c < 256; c++) {
    const b = c / 255;
    OVL[c] = c <= 127.5 ? c : 255 - c;
    SL_DARK[c] = 255 * b * (1 - b);
    const D = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
    SL_LIGHT[c] = 255 * (D - b);
  }

  // The grain of one frame as two numbers per pixel: s, a shade laid on as black (s < 0) or
  // white (s > 0) at that strength (vignette, specks, and the grain of Mix / Multiply / Add /
  // Screen), and e, the grain of Overlay / Soft Light (a grey layer 0.5 + e / 2 in that mode).
  function grainMaker(W, H, fx, unit, frame, seed) {
    const blend = fx.grainBlend;
    const mult = blend === 'multiply', add = blend === 'add', screen = blend === 'screen';
    const contrast = blend === 'overlay' || blend === 'softlight';
    const mode = mult ? 1 : add ? 2 : screen ? 3 : contrast ? 4 : 0;
    const g = Math.min(1, Math.max(0, fx.grain / 100));
    // Amount: Mix lightens and darkens by up to 30 % of it; Multiply darkens by up to Amount; Add lifts
    // by up to a third of Amount in rare sparks; Screen lifts by up to 3/4 of Amount, densely; Overlay
    // and Soft Light push the midtones by up to about half of Amount.
    const grain = mult || add ? g : screen ? g * 0.75 : blend === 'softlight' ? g * 1.2 : contrast ? g * 0.9 : g * 0.3;
    const sp = Math.min(1, Math.max(0, fx.grainSpecks / 100));
    const speckP = mult ? sp * 0.035 : Math.pow(sp, 1.5) * 0.0035;
    const vig = (Math.min(100, Math.max(0, fx.vignette)) / 100) * 0.19; // 30 % darkens the far corners by about 5 %
    const rough = Math.min(1, Math.max(0, (fx.grainRough || 0) / 100));
    const gs = Math.max(0.75, fx.grainSize * unit);
    const gs2 = gs * 2.6; // Roughness: coarser grains mixed in...
    const L1 = Math.max(6, gs * 9), L2 = Math.max(16, gs * 30); // ...clumps and blotches
    const nrm = 1 / Math.hypot(1 - 0.5 * rough, 0.5 * rough);
    const cx = W / 2, cy = H / 2, invR = 2 / Math.hypot(W, H);
    const s0 = (seed * 747796405 + 2891336453) | 0;
    const f = frame | 0;
    const doGrain = grain > 0, doSpeck = speckP > 0, doVig = vig > 0, doRough = doGrain && rough > 0;
    // per column: the grain cell, its coarse cell and the distance from the centre (squared)
    const GX = new Int32Array(W), GX2 = new Int32Array(W), DX2 = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      const xc = Math.min(W - 1, x + 0.5);
      GX[x] = Math.floor(xc / gs); GX2[x] = Math.floor(xc / gs2); DX2[x] = (xc - cx) * (xc - cx);
    }
    const kf = Math.imul(f + 1, 0xcb1ab31f) ^ s0, kf2 = kf ^ 0x2545f491; // the frame's part of the cell hashes
    const R1 = doRough ? new Float32Array(W) : null, R2 = doRough ? new Float32Array(W) : null;

    return function row(y, S, E, o) {
      const yc = Math.min(H - 1, y + 0.5);
      const dy2 = (yc - cy) * (yc - cy);
      const ky = Math.imul(Math.floor(yc / gs), 0xd8163841) ^ kf, ky2 = Math.imul(Math.floor(yc / gs2), 0xd8163841) ^ kf2;
      if (doRough) { valueRow(R1, W, yc, L1, s0 ^ Math.imul(f + 1, 0x632be5ab) ^ 0x1b873593); valueRow(R2, W, yc, L2, s0 ^ Math.imul(f + 1, 0x1b56c4e9) ^ 0x7a2c51e3); }
      let lastGx = -2147483648, lastGx2 = -2147483648, tri = 0, u1 = 0, tri2 = 0, u2 = 0, cg = 0, ce = 0, ck = 0;
      for (let x = 0; x < W; x++) {
        let sv = 0;
        if (doVig) { // Vignette: smooth darkening toward the corners
          let t = (Math.sqrt(DX2[x] + dy2) * invR - 0.28) * 1.25;
          if (t > 0) { if (t > 1) t = 1; sv = -vig * t * t * (3 - 2 * t); }
        }
        const gx = GX[x];
        if (gx !== lastGx) { // a new grain cell: its 32-bit hash (the same numbers as ever, so a saved look keeps its grain)
          lastGx = gx;
          let h = Math.imul(gx, 0x8da6b343) ^ ky;
          h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
          h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
          h ^= h >>> 16;
          tri = ((h & 0xffff) + (h >>> 16)) / 131070; // 0..1, bell-shaped
          u1 = (h & 0xffff) / 65536;
          ck = 0;
          if (doSpeck) { // Dust: rare single-cell specks, light or dark (pale flecks in Multiply, bright in Add / Screen)
            let k = Math.imul(h ^ 0x9e3779b9, 0x85ebca6b);
            k = Math.imul(k ^ (k >>> 13), 0xc2b2ae35);
            k ^= k >>> 16;
            let m = Math.imul(k ^ 0x51ed270b, 0x2c1b3c6d);
            m ^= m >>> 15;
            if ((m >>> 1) / 2147483648 < speckP) ck = mult ? 0.14 + 0.1 * (m & 1) : add || screen ? 0.6 + 0.3 * (m & 1) : m & 1 ? 0.9 : -0.9;
          }
          cg = 0; ce = 0;
          if (doGrain && !doRough) {
            if (mode === 1) cg = -grain * (0.22 + 0.55 * tri);
            else if (mode === 2) cg = grain * 0.36 * u1 * u1 * u1;
            else if (mode === 3) cg = grain * tri * tri;
            else if (mode === 4) ce = grain * (tri * 2 - 1);
            else cg = grain * (tri * 2 - 1);
          }
        }
        let sg = cg, se = ce;
        if (doRough) {
          // uneven grain: some coarser grains, clumps where it is strong or faint, soft blotches
          const gx2 = GX2[x];
          if (gx2 !== lastGx2) {
            lastGx2 = gx2;
            let h = Math.imul(gx2, 0x8da6b343) ^ ky2;
            h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
            h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
            h ^= h >>> 16;
            tri2 = ((h & 0xffff) + (h >>> 16)) / 131070;
            u2 = (h >>> 16) / 65536;
          }
          const t = 0.5 + ((tri - 0.5) * (1 - 0.5 * rough) + (tri2 - 0.5) * 0.5 * rough) * nrm;
          const u = u1 * (1 - 0.5 * rough) + u2 * 0.5 * rough;
          let amp = 1 + rough * 1.6 * (R1[x] * 2 - 1);
          if (amp < 0) amp = 0;
          const blot = rough * (R2[x] * 2 - 1);
          if (mode === 1) { sg = -grain * (0.22 + 0.55 * t) * amp - grain * 0.3 * blot; if (sg > 0) sg = 0; }
          else if (mode === 2) { sg = grain * 0.36 * u * u * u * amp + grain * 0.06 * blot; if (sg < 0) sg = 0; }
          else if (mode === 3) { sg = grain * t * t * amp + grain * 0.25 * blot; if (sg < 0) sg = 0; }
          else if (mode === 4) se = grain * ((t * 2 - 1) * amp + 0.6 * blot);
          else sg = grain * ((t * 2 - 1) * amp + 0.6 * blot);
        }
        const a = (sv + sg + ck) * 255; // the shade's alpha, signed: black below 0, white above
        S[o + x] = a >= 255 ? 255 : a <= -255 ? -255 : a >= 0 ? (a + 0.5) | 0 : -((0.5 - a) | 0);
        if (E !== null) E[o + x] = se;
      }
    };
  }

  let gcache = null; // the last preview-sized grain (still grain during playback is made once)
  const CACHE_MAX = 2800000;
  const LE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1; // pixel byte order (little-endian everywhere in practice)
  const RS = LE ? 0 : 24, GS = LE ? 8 : 16, BS = LE ? 16 : 8, AS = LE ? 24 : 0, AM = (255 << AS) >>> 0;
  const div255 = (x) => (x + 128 + ((x + 128) >> 8)) >> 8; // x / 255, rounded, for 0..65535

  function grainPass(d, W, H, fx, unit, frame, seed) {
    const contrast = fx.grainBlend === 'overlay' || fx.grainBlend === 'softlight';
    const soft = fx.grainBlend === 'softlight';
    const key = [W, H, frame | 0, seed | 0, fx.grain, fx.grainSize, fx.grainSpecks, fx.grainRough, fx.vignette, fx.grainBlend, unit].join('|');
    let S, E, row = null, full = false;
    if (gcache && gcache.key === key) { S = gcache.S; E = gcache.E; full = true; }
    else if (W * H <= CACHE_MAX) {
      S = new Int16Array(W * H); E = contrast ? new Float32Array(W * H) : null;
      const mk = grainMaker(W, H, fx, unit, frame, seed);
      for (let y = 0; y < H; y++) mk(y, S, E, y * W);
      gcache = { key, S, E };
      full = true;
    } else {
      S = new Int16Array(W); E = contrast ? new Float32Array(W) : null; // big exports: a row at a time
      row = grainMaker(W, H, fx, unit, frame, seed);
    }
    const T1 = soft ? SL_DARK : OVL, T2 = soft ? SL_LIGHT : OVL;
    const px32 = new Uint32Array(d.buffer, d.byteOffset, d.length >> 2);
    for (let y = 0; y < H; y++) {
      const o = full ? y * W : 0;
      if (row) row(y, S, E, 0);
      let q = y * W;
      for (let x = 0; x < W; x++, q++) {
        const px = px32[q];
        if (((px >>> AS) & 255) === 0) continue; // never paints onto transparent areas
        let r = (px >>> RS) & 255, g = (px >>> GS) & 255, b = (px >>> BS) & 255;
        if (E !== null) { // Overlay / Soft Light: c + e * table[c], per channel
          const e = E[o + x];
          if (e !== 0) {
            const T = e < 0 ? T1 : T2;
            let v = r + e * T[r]; r = v <= 0 ? 0 : v >= 255 ? 255 : (v + 0.5) | 0;
            v = g + e * T[g]; g = v <= 0 ? 0 : v >= 255 ? 255 : (v + 0.5) | 0;
            v = b + e * T[b]; b = v <= 0 ? 0 : v >= 255 ? 255 : (v + 0.5) | 0;
          }
        }
        const a = S[o + x];
        if (a < 0) { const k = 255 + a; r = div255(r * k); g = div255(g * k); b = div255(b * k); } // black at that alpha
        else if (a > 0) { r += div255((255 - r) * a); g += div255((255 - g) * a); b += div255((255 - b) * a); } // white at that alpha
        else if (E === null) continue;
        px32[q] = ((px & AM) | (r << RS) | (g << GS) | (b << BS)) >>> 0;
      }
    }
  }

  /* ----------------------------------------------------------------- dither */
  const QL = new Map(); // quantising tables: threshold index x 256 -> level
  function levelTable(PM, pn, tones) {
    const key = (pn || 'n') + '|' + tones;
    let LUT = QL.get(key);
    if (!LUT) {
      const N1 = tones - 1, n = PM.length;
      LUT = new Uint8Array(n * 256);
      for (let k = 0; k < n; k++) for (let v = 0; v < 256; v++) LUT[k * 256 + v] = Math.round((Math.min(N1, Math.floor((v / 255) * N1 + PM[k])) * 255) / N1);
      QL.set(key, LUT);
    }
    return LUT;
  }
  const noiseIdx = (bx, by) => {
    let h = Math.imul(bx, 0x9e3779b1) ^ Math.imul(by, 0x85ebca77);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    return (h ^ (h >>> 15)) & 63;
  };

  // Palette tones (Tone 0 / 1): each color as a mix of two of the style's own colors.
  const W3 = [0.299, 0.587, 0.114];
  let palKey = '', palMemo = new Map();
  function palettePair(r, g, b, P, two) {
    if (two) { // darkest -> lightest by brightness
      const Y = W3[0] * r + W3[1] * g + W3[2] * b, y0 = P[0][3], y1 = P[1][3];
      return [0, 1, y1 > y0 ? Math.min(1, Math.max(0, (Y - y0) / (y1 - y0))) : 0];
    }
    let a = 0, bd = Infinity;
    for (let k = 0; k < P.length; k++) {
      const p = P[k], dr = r - p[0], dg = g - p[1], db = b - p[2], dd = W3[0] * dr * dr + W3[1] * dg * dg + W3[2] * db * db;
      if (dd < bd) { bd = dd; a = k; }
    }
    let best = a, bt = 0, be = bd;
    const A = P[a];
    for (let k = 0; k < P.length; k++) {
      if (k === a) continue;
      const B = P[k], ur = B[0] - A[0], ug = B[1] - A[1], ub = B[2] - A[2];
      const uu = W3[0] * ur * ur + W3[1] * ug * ug + W3[2] * ub * ub;
      if (uu <= 0) continue;
      const t = Math.min(1, Math.max(0, (W3[0] * (r - A[0]) * ur + W3[1] * (g - A[1]) * ug + W3[2] * (b - A[2]) * ub) / uu));
      const er = r - A[0] - t * ur, eg = g - A[1] - t * ug, eb = b - A[2] - t * ub;
      const e = W3[0] * er * er + W3[1] * eg * eg + W3[2] * eb * eb;
      if (e < be - 1e-9) { be = e; best = k; bt = t; }
    }
    return [a, best, bt];
  }
  function paletteOf(colors, two) {
    const P = (colors || []).map((c) => {
      const m = /^#?([0-9a-f]{6})$/i.exec(String(c || '').trim());
      if (!m) return null;
      const v = parseInt(m[1], 16), r = v >> 16, g = (v >> 8) & 255, b = v & 255;
      return [r, g, b, W3[0] * r + W3[1] * g + W3[2] * b];
    }).filter(Boolean);
    if (!P.length) P.push([0, 0, 0, 0], [255, 255, 255, 255]);
    if (!two) return P;
    let lo = P[0], hi = P[0];
    for (const p of P) { if (p[3] < lo[3]) lo = p; if (p[3] > hi[3]) hi = p; }
    return [lo, hi];
  }

  // Every channel of every cell (cells of `cell` px laid from the top-left corner, sampled at their
  // centre) printed through the threshold pattern, its rows counted upward,
  // then mixed over the art by Amount.
  function ditherPass(d, W, H, fx, cell, colors) {
    const amt = Math.min(1, Math.max(0, fx.ditherAmt / 100));
    const [PM, pn] = pattern(fx);
    const tones = Math.min(8, Math.max(0, Math.round(fx.tones)));
    const levels = tones >= 2;
    const LUT = levels ? levelTable(PM, pn, tones) : null;
    let P = null, two = false;
    if (!levels) {
      two = tones === 0;
      P = paletteOf(colors, two);
      const key = (two ? '2|' : '1|') + P.map((p) => p.join(',')).join(';');
      if (key !== palKey || palMemo.size > 300000) { palKey = key; palMemo = new Map(); }
    }
    const half = cell >> 1;
    for (let cy = 0, by = 0; cy < H; cy += cell, by++) {
      const ys = Math.min(H - 1, cy + half), y1 = Math.min(H, cy + cell);
      const row = pn ? (pn - 1 - (by % pn)) * pn : 0;
      for (let cx = 0, bx = 0; cx < W; cx += cell, bx++) {
        const s = (ys * W + Math.min(W - 1, cx + half)) * 4;
        if (d[s + 3] === 0) continue; // transparent stays transparent
        const ti = pn ? row + (bx % pn) : noiseIdx(bx, by);
        let qr, qg, qb;
        if (levels) {
          const t = ti * 256;
          qr = LUT[t + d[s]]; qg = LUT[t + d[s + 1]]; qb = LUT[t + d[s + 2]];
        } else {
          const key = (d[s] << 16) | (d[s + 1] << 8) | d[s + 2];
          let pr = palMemo.get(key);
          if (!pr) { pr = palettePair(d[s], d[s + 1], d[s + 2], P, two); palMemo.set(key, pr); }
          const q = P[pr[2] > PM[ti] ? pr[1] : pr[0]];
          qr = q[0]; qg = q[1]; qb = q[2];
        }
        const x1 = Math.min(W, cx + cell);
        for (let y = cy; y < y1; y++) {
          let i = (y * W + cx) * 4;
          for (let x = cx; x < x1; x++, i += 4) {
            if (amt >= 1) { d[i] = qr; d[i + 1] = qg; d[i + 2] = qb; }
            else { d[i] += (qr - d[i]) * amt; d[i + 1] += (qg - d[i + 1]) * amt; d[i + 2] += (qb - d[i + 2]) * amt; }
          }
        }
      }
    }
  }

  /* ----------------------------------------------------------------- apply */
  // opts: { unit: px per 1080-unit (grain), cell: dither cell in px, frame, seed, colors: the style's inks }
  function apply(ctx, W, H, fx, opts = {}) {
    const gOn = grainActive(fx), dOn = ditherActive(fx);
    if (!gOn && !dOn) return;
    const img = ctx.getImageData(0, 0, W, H), d = img.data;
    if (gOn) grainPass(d, W, H, fx, opts.unit || Math.max(W, H) / 1080, opts.frame | 0, opts.seed | 0);
    if (dOn) ditherPass(d, W, H, fx, Math.max(1, Math.round(opts.cell || fx.ditherPx || 2)), opts.colors);
    ctx.putImageData(img, 0, 0);
  }
  // The dither cell for a frame: Pixel size in px at a 713 px short side.
  const ditherCell = (fx, W, H) => Math.max(1, Math.round((fx.ditherPx || 2) * (Math.min(W, H) / 713)));

  // The dither alone (kept for tools and tests that call it): cellUnit = px per Pixel size step.
  function colorDither(ctx, W, H, fx, opts = {}) {
    if (!ditherActive(fx)) return;
    const img = ctx.getImageData(0, 0, W, H);
    ditherPass(img.data, W, H, fx, Math.max(1, Math.round((fx.ditherPx || 2) * (opts.cellUnit || 1))), opts.colors);
    ctx.putImageData(img, 0, 0);
  }

  return { apply, colorDither, ditherCell, isActive, grainActive, ditherActive, DEFAULTS, DITHER_KEYS, GRAIN_KEYS, PATTERNS, BLENDS, BAYER2, BAYER4, BAYER8, smooth };
})();
