/* ==========================================================================
   tools/mist.js — Mist: neon wash (pixel texture: PNG, video).

   1. Streaks: a smooth noise field stretched along the frame's height, so it
      runs in long vertical streaks that lean and sway a little as they go
      down. Streaks sets how streaky it is (more, thinner and longer streaks
      at 200 %; broader, blotchier ones at 40 %).
   2. Cover: the first ink (the wash) fills the field above a level, so Cover
      sets how much of the frame it covers; Softness how gently it fades into
      the tints (a hard edge at 10 %, a soft blur at 100 %).
   3. Blot: under the wash the other inks (the tints) drift in soft patches;
      Blot sets how clearly they separate (one even pastel at the low end,
      distinct pink, sage and aqua patches at 100 %).
   4. Grain: a fine grain over everything (it stays put).
   5. Rotation turns the whole pattern on the artboard (clockwise for
      positive angles); it always fills the frame.
   6. The colour dither (Effects → Dither, on by default: Bayer 8, Pixel
      size 2, 3 tones, 100 %) prints the wash with a few levels of red, green
      and blue in an ordered pattern, which is what turns the pastels neon.
   7. Animation: the streaks swing slowly up and back down along their length
      once a loop (the tints drift the same way, a third as far), through the
      fixed grain and dither, so the dots shimmer as the wash passes. At
      Intensity 0.80 the streaks reach 0.15 of the short side from where they
      started. Seamless; Intensity sets how far.
   Lengths are a share of the frame's short side, so another frame shape
   crops or extends the same wash around the centre.
   ========================================================================== */
(() => {
  const { hash } = PL.rng;

  // Wash first, then the tints. The default look's colours first.
  const PALETTES = [
    { name: 'Neon wash', colors: ['#2B81FF', '#E9C6C3', '#D8DBBC', '#B8E8DF'] },
    { name: 'Coral', colors: ['#FF5B4A', '#F6E2C4', '#F3D3DE', '#D5E6F2'] },
    { name: 'Violet', colors: ['#7A4DFF', '#F2CDE3', '#CFE6F5', '#E9E4C4'] },
    { name: 'Emerald', colors: ['#14B37D', '#F4E5C6', '#D4EAF5', '#F1D0DD'] },
    { name: 'Sun', colors: ['#FFAA00', '#F6D5E3', '#D7E3FF', '#DFF2D4'] },
    { name: 'Magenta', colors: ['#F0368C', '#D9E7F7', '#F5E6C7', '#D9F0E1'] },
    { name: 'Plum', colors: ['#481645', '#FEB9B8', '#CBBAEB', '#ECD69B'] },
    { name: 'Teal', colors: ['#0FA3B1', '#F6E2D3', '#E4DCF5', '#DFF3E4'] },
    { name: 'Lime', colors: ['#BBEC4C', '#FFDEE7', '#E0DDFF', '#CCEFFB'] },
    { name: 'Mono', colors: ['#2A2A2A', '#E9E9E7', '#D3D3D0', '#F5F5F3'] },
  ];

  /* ---- colour roles -------------------------------------------------------------------- */
  const roles = (n) => ['Wash', ...(n === 2 ? ['Tint'] : Array.from({ length: n - 1 }, (_, i) => 'Tint ' + (i + 1)))];
  const spec = (n) => ({ ramp: 1, accents: Math.max(1, n - 1) });

  // "New colors": a vivid wash and pale tints spread round the colour wheel (now and then a deep
  // wash under brighter tints).
  function generate(n, rng) {
    const C = PL.color;
    const h0 = rng.float(0, 360);
    const deep = rng.chance(0.12);
    // yellows and greens only read as vivid when light (dark they turn olive)
    const hh = ((h0 % 360) + 360) % 360, light = hh > 40 && hh < 160 ? 0.18 : 0;
    const out = [deep ? C.lch(rng.float(0.16, 0.24), rng.float(0.05, 0.12), h0) : C.lch(rng.float(0.55, 0.66) + light, rng.float(0.17, 0.26), h0)];
    const t0 = rng.float(0, 360), dir = rng.sign();
    for (let i = 0; i < n - 1; i++) {
      const hk = t0 + dir * ((360 / Math.max(2, n - 1)) * i + rng.float(-20, 20));
      out.push(deep ? C.lch(rng.float(0.7, 0.84), rng.float(0.1, 0.16), hk) : C.lch(rng.float(0.86, 0.92), rng.float(0.03, 0.07), hk));
    }
    return out;
  }

  // + adds a tint in a hue the palette doesn't have yet.
  function add(colors) {
    const C = PL.color;
    const c = colors.slice();
    const hues = c.slice(1).map((x) => C.hexToLch(x)[2]);
    let best = 0, bd = -1;
    for (let h = 0; h < 360; h += 10) {
      const d = hues.length ? Math.min(...hues.map((x) => Math.abs((((h - x) % 360) + 540) % 360 - 180))) : 180;
      if (d > bd) { bd = d; best = h; }
    }
    c.push(C.lch(0.88, 0.05, best));
    return c;
  }

  function fit(colors, n) {
    let c = (colors || []).map(PL.color.normHex).filter(Boolean);
    if (!c.length) c = PALETTES[0].colors.slice();
    if (c.length >= n) return c.slice(0, n);
    while (c.length < n) c = add(c);
    return c;
  }

  /* ---- settings -------------------------------------------------------------------------- */
  const S = (key, label, min, max, def, extra = {}) => ({ section: 'Artwork', key, label, type: 'range', min, max, def, step: 1, unit: '%', ...extra });
  const PARAMS = [
    S('streaks', 'Streaks', 40, 200, 100, { rand: [60, 170], hint: 'How streaky the wash is: broad blots at 40 %, long thin streaks at 200 %' }),
    S('cover', 'Cover', 20, 85, 55, { rand: [42, 70], hint: 'How much of the frame the wash (the first ink) covers' }),
    S('soft', 'Softness', 10, 100, 50, { rand: [30, 78], hint: 'How gently the wash fades into the tints' }),
    S('blot', 'Blot', 20, 100, 50, { rand: [30, 95], hint: 'How clearly the tints separate into patches' }),
    S('grain', 'Grain', 0, 100, 40, { rand: [20, 60], hint: 'A fine grain over everything' }),
    S('rotate', 'Rotation', -180, 180, 0, { unit: '°', hint: 'Turns the whole pattern on the artboard (positive: clockwise)' }),
  ];

  // Constants. Lengths are a share of the frame's short side (m).
  const K = {
    fx: 3.1,                   // streak noise cells across m at Streaks 100 % ...
    fxPow: [0.3, 0.75],        // ... times (Streaks / 100)^this (below / above 100 %)
    ar: 9.5,                   // the streaks' stretch (length / width of their noise cells) at 100 % ...
    arPow: [0.9, 0.56],        // ... times (Streaks / 100)^this (below / above 100 %)
    oct: 4, gain: 0.6,         // streak noise octaves and their gain
    nsd: 0.3,                  // the noise sums' spread (they are divided by it)
    sway: 0.07,                // how far the streaks sway sideways, x m at 100 % ...
    swayF: 0.9,                // ... over this many noise cells down m
    zc: [0.15, -0.07],          // the wash's level in the field (field sds): z = a + b (Cover - 55)
    soft: [1.2, 5.2],          // the fade's width (field sds) at Softness 10 % and 100 %
    softSkew: 0.6,             // where the cover level sits in the fade (0: its bottom, 1: its top)
    wpow: 2.0,                 // the fade's ease-in (wash = ramp^this)
    tf: 2.6,                   // tint patches: noise cells across m ...
    tAr: 1.4,                  // ... stretched down by this
    tOct: 2,
    blot: [0.35, 1.3],         // tint contrast (softmax sharpness) at Blot 20 % and 100 %
    grain: 7.0,                // grain std in levels at Grain 100 %
    flowX: 0.004, flowY: 0.1936, // the wash's loop path at Intensity 1, x m: sideways (1 - cos) and down (sin)
    tintFlow: 0.3,             // the tints drift this much of the way with it (slower: they lag behind)
    step: 200,                 // the streak field is worked out every m / step px, then smoothed between
    tstep: 90,                 // the tints every m / tstep px
  };

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

  /* ---- noise: seeded 2D gradient noise (quintic fade), about -1 ... 1 ------------------- */
  const NOISE = new Map();
  function noise2(seed) {
    let f = NOISE.get(seed);
    if (f) return f;
    const r = PL.rng.mulberry32((seed ^ 0x2c1b3c6d) >>> 0);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    const P = new Uint16Array(512);
    for (let i = 0; i < 512; i++) P[i] = p[i & 255];
    const GX = new Float32Array(256), GY = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const a = r() * 2 * Math.PI; GX[i] = Math.cos(a); GY[i] = Math.sin(a); }
    f = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
      const X = xi & 255, Y = yi & 255;
      const a = P[P[X] + Y], b = P[P[X + 1] + Y], c = P[P[X] + Y + 1], d = P[P[X + 1] + Y + 1];
      const na = GX[a] * fx + GY[a] * fy, nb = GX[b] * (fx - 1) + GY[b] * fy;
      const nc = GX[c] * fx + GY[c] * (fy - 1), nd = GX[d] * (fx - 1) + GY[d] * (fy - 1);
      const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
      const ab = na + (nb - na) * u, cd = nc + (nd - nc) * u;
      return (ab + (cd - ab) * v) * 1.42;
    };
    if (NOISE.size > 64) NOISE.clear();
    NOISE.set(seed, f);
    return f;
  }
  // fractal sum (each octave shifted, never turned: a turn would tilt the stretched streaks)
  function fbm(n, x, y, oct, gain) {
    let s = 0, a = 1, norm = 0, f = 1;
    for (let o = 0; o < oct; o++) {
      s += a * n(x * f + o * 31.7, y * f - o * 17.3);
      norm += a * a; a *= gain; f *= 2;
    }
    return s / Math.sqrt(norm);
  }

  /* ---- the field ---------------------------------------------------------------------------- */
  // Everything the field needs for one seed and settings.
  function fieldSpec(seed, p, n) {
    const st = Math.max(0.2, (p.streaks ?? 100) / 100);
    const hi1 = st >= 1 ? 1 : 0, arS = Math.pow(st, K.arPow[hi1]);
    const kx = K.fx * Math.pow(st, K.fxPow[hi1]), ky = kx / (K.ar * arS);
    const soft = lerp(K.soft[0], K.soft[1], clamp01(((p.soft ?? 50) - 10) / 90));
    const z = K.zc[0] + K.zc[1] * ((p.cover ?? 55) - 55);
    const lo = z - soft * K.softSkew, hi = lo + soft;
    const beta = lerp(K.blot[0], K.blot[1], clamp01(((p.blot ?? 50) - 20) / 80));
    return {
      st, kx, ky, lo, hi, beta, nT: Math.max(1, n - 1),
      ns: noise2(seed * 7 + 1), nw: noise2(seed * 7 + 2), nt: Array.from({ length: Math.max(1, n - 1) }, (_, k) => noise2(seed * 7 + 3 + k)),
      sway: K.sway / arS,
    };
  }
  // the streak value at pattern point (u, v) (units of m)
  function streak(F, u, v) {
    const sw = F.sway * F.nw(v * K.swayF + 3.7, 0.5);
    return fbm(F.ns, (u + sw) * F.kx, v * F.ky, K.oct, K.gain) / K.nsd;
  }
  // the tints' weights at (u, v), written into w
  function tints(F, u, v, w) {
    let sum = 0;
    for (let k = 0; k < F.nT; k++) {
      const e = Math.exp((F.beta / K.nsd) * fbm(F.nt[k], u * K.tf, v * K.tf / K.tAr, K.tOct, 0.5));
      w[k] = e; sum += e;
    }
    for (let k = 0; k < F.nT; k++) w[k] /= sum;
  }

  // The loop path: how far the streaks have moved at time t (units of m, in the pattern's own
  // frame, so they always move along their length; the tints move K.tintFlow of this).
  function flow(t, I) {
    const th = 2 * Math.PI * (((t % 1) + 1) % 1);
    return { du: I * K.flowX * (Math.cos(th) - 1), dv: -I * K.flowY * Math.sin(th) };
  }

  /* ---- grain: a still per-pixel noise ------------------------------------------------------------ */
  const LUM = new Float32Array(4096);
  {
    const r = PL.rng.mulberry32(0x3243f6a8);
    for (let i = 0; i < 4096; i++) LUM[i] = r() + r() + r() - 1.5; // std 1/2
  }

  /* ---- paint ------------------------------------------------------------------------------------- */
  let pvImg = null;
  // the fade from the tints into the wash: a ramp across the field's levels, eased in (a light veil
  // first, then quickly to the full wash)
  const RAMP = new Float32Array(1025);
  let RAMP_POW = -1;
  // map (General's Rotation and Size): the canvas (cw x ch) and the part of the world it shows; the grids
  // are as fine on the canvas as at 100 %, so zoomed in the streaks are read again at full detail.
  function paint({ ctx, W, H, seed, p, colors, t = 0, anim, preview = false, map }) {
    const n = colors.length;
    const m = Math.min(W, H);
    const cw = map ? map.cw : W, ch = map ? map.ch : H, mx = map ? map.x0 : 0, my = map ? map.y0 : 0, ms = map ? map.s : 1;
    const F = fieldSpec(seed, p, n);
    const rgb = colors.map(PL.color.hexToRgb);
    // rotation (pattern = R(-a) screen) and the loop path
    const a = ((p.rotate || 0) * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    const { du, dv } = flow(t, anim ? anim.amount || 0 : 0);
    const cx = W / 2, cy = H / 2;
    const pu = (x, y, k = 1) => (ca * (x - cx) + sa * (y - cy)) / m - du * k;
    const pv = (x, y, k = 1) => (-sa * (x - cx) + ca * (y - cy)) / m - dv * k;

    // the streak field on a coarse grid
    const g = Math.max(1, Math.round(m / K.step));
    const gw = Math.ceil(cw / g) + 2, gh = Math.ceil(ch / g) + 2;
    const SF = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) { const x = mx + i * g * ms, y = my + j * g * ms; SF[j * gw + i] = streak(F, pu(x, y), pv(x, y)); }
    // the tints' colour on a coarser grid
    const tg = Math.max(1, Math.round(m / K.tstep));
    const tw = Math.ceil(cw / tg) + 2, thh = Math.ceil(ch / tg) + 2;
    const TC = new Float32Array(tw * thh * 3), wk = new Float32Array(F.nT);
    for (let j = 0; j < thh; j++) for (let i = 0; i < tw; i++) {
      const x = mx + i * tg * ms, y = my + j * tg * ms;
      tints(F, pu(x, y, K.tintFlow), pv(x, y, K.tintFlow), wk);
      let r = 0, gg = 0, b = 0;
      for (let k = 0; k < F.nT; k++) { const c = rgb[1 + k] || rgb[0]; r += wk[k] * c[0]; gg += wk[k] * c[1]; b += wk[k] * c[2]; }
      const o = (j * tw + i) * 3; TC[o] = r; TC[o + 1] = gg; TC[o + 2] = b;
    }

    if (preview) { if (!pvImg || pvImg.width !== cw || pvImg.height !== ch) pvImg = ctx.createImageData(cw, ch); }
    const img = preview ? pvImg : ctx.createImageData(cw, ch);
    const d = img.data;
    const [wr, wg, wb] = rgb[0];
    const lo = F.lo, inv = 1 / Math.max(1e-6, F.hi - F.lo);
    if (RAMP_POW !== K.wpow) { RAMP_POW = K.wpow; for (let k = 0; k <= 1024; k++) RAMP[k] = Math.pow(k / 1024, K.wpow); }
    const amp = K.grain * clamp01((p.grain ?? 40) / 100) * 2; // LUM has std 1/2
    const gsz = Math.max(1, m / 713); // grain cell: one pixel of a 713 px frame
    const gox = Math.round(mx / ms), goy = Math.round(my / ms); // counted from the frame's corner (so a turned view keeps it)
    const sm = Math.imul(seed | 0, 0x9e3779b1);
    // per column: where it falls in the two grids, and its grain column hash
    const XI = new Int32Array(cw), XT = new Float32Array(cw), XL = new Int32Array(cw), XU = new Float32Array(cw), XH = new Int32Array(cw);
    for (let x = 0; x < cw; x++) {
      const fx = x / g, ftx = x / tg;
      XI[x] = fx | 0; XT[x] = fx - XI[x]; XL[x] = (ftx | 0) * 3; XU[x] = ftx - (ftx | 0);
      XH[x] = Math.imul(Math.floor((x + gox) / gsz), 0x85ebca77) ^ sm; // (the grain is the canvas's own: as fine at every Size)
    }
    const rowS = new Float32Array(gw), rowT = new Float32Array(tw * 3);
    for (let y = 0; y < ch; y++) {
      // this row of both grids, between their grid rows
      const fy = y / g, j0 = fy | 0, ty = fy - j0, o0 = j0 * gw;
      for (let i = 0; i < gw; i++) rowS[i] = SF[o0 + i] + (SF[o0 + gw + i] - SF[o0 + i]) * ty;
      const fty = y / tg, k0 = fty | 0, tty = fty - k0, q0 = k0 * tw * 3, q1 = q0 + tw * 3;
      for (let i = 0; i < tw * 3; i++) rowT[i] = TC[q0 + i] + (TC[q1 + i] - TC[q0 + i]) * tty;
      const gyh = Math.imul(Math.floor((y + goy) / gsz), 0xc2b2ae3d);
      let i4 = y * cw * 4;
      for (let x = 0; x < cw; x++, i4 += 4) {
        const i0 = XI[x], sv = rowS[i0] + (rowS[i0 + 1] - rowS[i0]) * XT[x];
        const wt = (sv - lo) * inv;
        const w = wt <= 0 ? 0 : wt >= 1 ? 1 : RAMP[(wt * 1024) | 0];
        const l = XL[x], u = XU[x];
        const tr = rowT[l] + (rowT[l + 3] - rowT[l]) * u, tgn = rowT[l + 1] + (rowT[l + 4] - rowT[l + 1]) * u, tb = rowT[l + 2] + (rowT[l + 5] - rowT[l + 2]) * u;
        let h = XH[x] ^ gyh;
        h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h ^= h >>> 13;
        const gn = amp * LUM[h & 4095];
        d[i4] = tr + (wr - tr) * w + gn;
        d[i4 + 1] = tgn + (wg - tgn) * w + gn;
        d[i4 + 2] = tb + (wb - tb) * w + gn;
        d[i4 + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const deg = Math.round(p.rotate || 0);
    return { status: `${Math.round(p.streaks ?? 100)} % streaks · ${Math.round(p.cover ?? 55)} % cover${deg ? ` · ${deg}°` : ''}` };
  }

  PL.tools.register({
    id: 'mist',
    name: 'Mist',
    kind: 'Backgrounds',
    tagline: 'Neon wash',
    about: 'A soft wash of vertical streaks over pastel tints, printed with an ordered color dither that turns it neon. Rotation turns the whole pattern. In the animation the streaks swing slowly up and down along their length, the tints trailing behind, through the fixed dither, so the dots shimmer.',
    raster: true,
    colorDither: true,   // opens with the color dither on (and kept on in looks saved before every style had it)
    opaque: true,        // no background colour to leave out
    inks: {
      min: 2, max: 8, roles, fit, spec, add, generate,
      span: () => 2, // Invert swaps the wash and the first tint
      hint: 'The wash first, then the tints it fades into.',
    },
    palettes: PALETTES,
    params: PARAMS,
    animLabel: 'Intensity',
    animHint: 'How far the wash swings down and back (0: still)',
    defaults: {
      anim: { amount: 0.8, fps: 12, frames: 72 },
      fx: { ditherOn: true, ditherPattern: 'bayer8', ditherPx: 2, tones: 3, ditherAmt: 100 },
    },
    paint,
    zoom: true, // paints any part of its world (General's Rotation and Size)
    _K: K,
    _fieldSpec: fieldSpec,
    _streak: streak,
    _tints: tints,
    _flow: flow,
  });
})();
