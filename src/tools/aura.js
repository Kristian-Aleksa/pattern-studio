/* ==========================================================================
   tools/aura.js — Aura: soft gradient (pixel texture: PNG, video).

   1. Every ink has its own smooth noise field, and each point of the frame
      takes a soft mix of the inks (blended in OKLab), the ink whose field is
      highest there weighing most. Punch sets how sharply one ink wins (0:
      an even mix, one soft flat colour; 100: clear patches with soft edges).
   2. Style sets the fields. Clouds: turbulent clouds at every scale. Mesh:
      a few broad patches of each ink, with the clouds' detail inside them.
      Sweep: the inks lie in broad bands across the frame, in their own
      order, their borders frayed by the clouds. Auto: every variation picks
      its own style and its own blend of them.
   3. Churn swirls the fields (a domain warp): 0 leaves soft round blobs,
      100 folds them into marbled ridges. Scale zooms the whole picture
      round the frame's centre (50: big soft shapes, 200: more, smaller ones).
      Positions are measured in the frame's short side from its centre, so
      another frame shape crops or extends the same picture.
   4. The colour dither (Effects → Dither, on by default: Bayer 8, Pixel
      size 2, 8 tones, 100 %) prints every channel in an ordered pattern.
   5. Animation: the whole picture drifts round a small circle once a loop
      (up first, then right, down and left: clockwise) while every ink's
      field slowly changes shape, so the clouds roll and boil and come back
      to where they started. Intensity sets how far and how much. Seamless.
   ========================================================================== */
(() => {
  const { hash } = PL.rng;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const clamp01 = (v) => clamp(v, 0, 1);

  // The default look's four inks first.
  const PALETTES = [
    { name: 'Aura', colors: ['#E79AFF', '#B148D2', '#691883', '#AA4AC8'] },
    { name: 'Peach', colors: ['#FFD3B5', '#FF8C6B', '#B83A4B', '#F2A07B'] },
    { name: 'Lagoon', colors: ['#A8F0E8', '#2FB7C9', '#0E4E6B', '#4FC3B0'] },
    { name: 'Dusk', colors: ['#FFC2A8', '#C76BB0', '#3B2A6B', '#7E5BC9'] },
    { name: 'Lime', colors: ['#EFFFB0', '#9BE15D', '#2E7D4F', '#C7F06A'] },
    { name: 'Ice', colors: ['#F3F8FF', '#AFC8F2', '#4A6FB5', '#D7E3F8'] },
    { name: 'Ember', colors: ['#FFE08A', '#FF7A3D', '#8E1B2C', '#FFB347'] },
    { name: 'Rose', colors: ['#FFE1EC', '#FF6FA5', '#9E1F57', '#FF9CC2'] },
    { name: 'Cobalt', colors: ['#B3C6FF', '#4D6BFF', '#17207A', '#7389FF'] },
    { name: 'Mono', colors: ['#F2F2F0', '#9A9A98', '#3A3A39', '#C8C8C6'] },
  ];

  /* ---- colour roles -------------------------------------------------------------------- */
  const roles = (n) => Array.from({ length: n }, (_, i) => 'Ink ' + (i + 1));
  const spec = (n) => ({ ramp: n, accents: 0 });

  // "New colors": a light, a mid and a deep ink in one family of hues, and more in between.
  function generate(n, rng) {
    const C = PL.color;
    const h0 = rng.float(0, 360), dh = rng.sign() * rng.float(10, 60), cm = rng.float(0.1, 0.2);
    const out = [];
    for (let i = 0; i < n; i++) {
      const k = i === 0 ? 0.9 : i === 2 % n ? 0.32 : rng.float(0.5, 0.72);
      out.push(C.lch(k + rng.float(-0.04, 0.04), cm * (k > 0.85 ? 0.6 : 1), h0 + dh * (k - 0.6)));
    }
    return out;
  }
  // + adds the new ink furthest from all the others: the best of the midpoints between two inks (and a little lighter or
  // darker than each ink), so every ink added is new.
  function add(colors) {
    const C = PL.color;
    const c = colors.slice(), labs = c.map((x) => C.hexToOklab(x));
    const cands = [];
    for (let i = 0; i < c.length; i++) {
      for (let j = i + 1; j < c.length; j++) cands.push(C.mix(c[i], c[j], 0.5), C.mix(c[i], c[j], 0.25), C.mix(c[i], c[j], 0.75));
      cands.push(C.mix(c[i], '#FFFFFF', 0.35), C.mix(c[i], '#000000', 0.35));
    }
    let best = cands[0], bd = -1;
    for (const x of cands) {
      const q = C.hexToOklab(x);
      const d = Math.min(...labs.map((l) => Math.hypot(l[0] - q[0], l[1] - q[1], l[2] - q[2])));
      if (d > bd) { bd = d; best = x; }
    }
    c.push(best);
    return c;
  }
  function fit(colors, n) {
    let c = (colors || []).map(PL.color.normHex).filter(Boolean);
    if (!c.length) c = PALETTES[0].colors.slice();
    if (c.length === 1) c.push(PL.color.mix(c[0], '#000000', 0.5));
    if (c.length > n) return c.slice(0, n);
    while (c.length < n) c = add(c);
    return c;
  }

  /* ---- settings -------------------------------------------------------------------------- */
  // New variation reshuffles the shapes and keeps every setting.
  const S = (section, key, label, min, max, def, extra = {}) => ({ section, key, label, type: 'range', min, max, def, step: 1, rand: false, ...extra });
  const PARAMS = [
    {
      section: 'Artwork', key: 'style', label: 'Style', type: 'select', def: 'clouds', rand: false,
      options: [{ value: 'auto', label: 'Auto' }, { value: 'clouds', label: 'Clouds' }, { value: 'mesh', label: 'Mesh' }, { value: 'sweep', label: 'Sweep' }],
      hint: 'Clouds: turbulent clouds; Mesh: broad patches of each ink; Sweep: broad bands across the frame; Auto: each variation picks',
    },
    S('Artwork', 'scale', 'Scale', 50, 200, 200, { unit: '%', hint: 'Zooms the whole picture round the centre (50: big soft shapes, 200: more, smaller ones)' }),
    S('Artwork', 'churn', 'Churn', 0, 100, 100, { unit: '%', hint: 'How much the clouds swirl and fold (0: soft round blobs)' }),
    S('Artwork', 'punch', 'Punch', 0, 100, 100, { unit: '%', hint: 'How sharply the inks separate (0: one soft, even mix)' }),
  ];

  // Constants. Field lengths are in lattice steps; the frame's short side holds base x Scale / 100 of them.
  const K = {
    base: 1.7,                  // lattice steps across the short side at Scale 100
    grid: 230,                  // field samples across the short side (read between them)
    oct: 4, gain: 0.45,         // the clouds: octaves and each one's weight against the one before
    warp: [0, 0.8], warpF: 1.0, warpPow: 1, // Churn 100: how far the fields are pushed, by a field of this frequency ...
    warpOct: 3, warpGain: 0.7,  // ... summed over this many octaves
    punch: [1.6, 6.8], punchPow: 1.3, // the mix's sharpness at Punch 0 and 100 (curve power)
    mesh: [0.6, 1.35, 0.8],     // Mesh: the patches' frequency (x the clouds'), their weight, the clouds' weight
    sweep: [0.8, 0.55, 0.9],    // Sweep: the bands' weight, the clouds' weight, each band's width (x the frame)
    sway: 0.072,                // the drift's radius per Intensity (short sides, at Scale 200)
    morph: 0.8,                 // how far every field changes over a loop per Intensity (lattice steps)
  };

  /* ---- 3D value noise (smoothstep), cheap and soft --------------------------------------------- */
  const nCache = new Map();
  function vnoise(seed) {
    let n = nCache.get(seed);
    if (n) return n;
    if (nCache.size > 16) nCache.clear();
    const rand = PL.rng.mulberry32((seed ^ 0x6a09e667) >>> 0);
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
    nCache.set(seed, n);
    return n;
  }

  /* ---- colour: OKLab ------------------------------------------------------------------------ */
  const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  function rgbToLab([r, g, b]) {
    r = toLin(r / 255); g = toLin(g / 255); b = toLin(b / 255);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  }
  // linear light -> sRGB 0..255, through a table
  const GT = new Uint8Array(4097);
  for (let i = 0; i <= 4096; i++) { const c = i / 4096; GT[i] = Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)); }
  const toS = (c) => GT[c <= 0 ? 0 : c >= 1 ? 4096 : (c * 4096 + 0.5) | 0];

  /* ---- the picture's plan: the style (Auto picks one per variation) and its layout --------------- */
  function plan(seed, p, n) {
    let style = p.style || 'clouds';
    if (style === 'auto') style = ['clouds', 'mesh', 'sweep'][Math.floor(hash(seed, 0xa7, 1, 2) * 3)];
    // Sweep: a direction and every ink's place along it (each variation its own order)
    const ang = hash(seed, 0xa8, 3, 4) * Math.PI * 2, order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(hash(seed, 0xa9, i, 5) * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
    const at = new Float64Array(n);
    order.forEach((ink, k) => (at[ink] = n === 1 ? 0 : (k / (n - 1) - 0.5) * 1.25 + (hash(seed, 0xaa, ink, 6) - 0.5) * 0.18));
    return { style, dx: Math.cos(ang), dy: Math.sin(ang), at };
  }

  /* ---- the field on a grid: each sample's mixed colour (sRGB 0..255) --------------------------- */
  // M (General's Rotation and Size): the canvas (cw x ch) and the part of the world it shows; the grid is
  // as fine on the canvas as at 100 %, so zoomed in the clouds are read again at full detail.
  function field(seed, p, W, H, t, amount, labs, M) {
    const n = labs.length, S0 = Math.min(W, H), g = S0 / K.grid;
    const cw = M ? M.cw : W, ch = M ? M.ch : H, mx = M ? M.x0 : 0, my = M ? M.y0 : 0, ms = M ? M.s : 1;
    const gw = Math.ceil(cw / g) + 2, gh = Math.ceil(ch / g) + 2;
    const zoom = K.base * clamp(p.scale, 50, 200) / 100;          // lattice steps per short side
    const churn = Math.pow(clamp01(p.churn / 100), K.warpPow), wamt = K.warp[0] + (K.warp[1] - K.warp[0]) * churn;
    const pk = clamp01(p.punch / 100), kmix = K.punch[0] + (K.punch[1] - K.punch[0]) * Math.pow(pk, K.punchPow);
    const pl = plan(seed, p, n);
    const N = vnoise(seed | 0), NW = vnoise((seed * 7 + 11) | 0), NM = vnoise((seed * 13 + 29) | 0);
    // time: the drift round its circle (up first, clockwise) and the fields' change (each its own phase)
    const th = 2 * Math.PI * t, sw = amount * K.sway * K.base * 2, mz = amount * K.morph;
    const ox = sw * (1 - Math.cos(th)), oy = -sw * Math.sin(th);
    const zOf = (k) => mz * Math.cos(th + hash(seed, 0xb0, k, 7) * Math.PI * 2) + k * 7.31;
    const zI = [], zW = [zOf(900), zOf(901)], zM = [];
    for (let i = 0; i < n; i++) { zI.push(Array.from({ length: K.oct }, (_, o) => zOf(i * 10 + o))); zM.push(zOf(500 + i)); }
    const amp = [];
    let norm = 0;
    for (let o = 0, a = 1; o < K.oct; o++, a *= K.gain) { amp.push(a); norm += a; }
    for (let o = 0; o < K.oct; o++) amp[o] /= norm;
    const mf = K.mesh[0], wF = K.warpF;
    const out = new Float32Array(gw * gh * 3), f = new Float64Array(n);
    const sweepW = 1 / (K.sweep[2] * K.sweep[2]);
    for (let j = 0; j < gh; j++) {
      const v0 = ((my + j * g * ms - H / 2) / S0) * zoom;
      for (let i = 0; i < gw; i++) {
        const u = ((mx + i * g * ms - W / 2) / S0) * zoom - ox, v = v0 - oy;
        // Churn: push the point along a broader field
        let qx = u, qy = v;
        if (wamt > 0) {
          let ax = u * wF + 41.3, ay = v * wF - 17.9, wx = 0, wy = 0;
          for (let o = 0, a = 1; o < K.warpOct; o++, a *= K.warpGain) {
            wx += a * NW(ax, ay, zW[0] + o * 3.3); wy += a * NW(ax - 63.1, ay + 28.4, zW[1] - o * 4.1);
            const nx = 1.6 * ax + 1.2 * ay + 5.1, ny = -1.2 * ax + 1.6 * ay + 9.7; ax = nx; ay = ny;
          }
          qx += wamt * wx; qy += wamt * wy;
        }
        let fmax = -1e9;
        for (let k = 0; k < n; k++) {
          // the clouds: a fractal sum, each octave turned a little to hide the lattice
          let s = 0, x = qx + k * 31.7, y = qy - k * 19.3;
          const zk = zI[k];
          for (let o = 0; o < K.oct; o++) {
            s += amp[o] * N(x, y, zk[o]);
            const nx = 1.6 * x - 1.2 * y + 3.1, ny = 1.2 * x + 1.6 * y - 1.7; x = nx; y = ny; // x2, turned ~37°
          }
          let fk = s;
          if (pl.style === 'mesh') fk = K.mesh[1] * NM(u * mf + k * 13.9, v * mf - k * 7.7, zM[k]) + K.mesh[2] * s;
          else if (pl.style === 'sweep') {
            const d = (u * pl.dx + v * pl.dy) / zoom - pl.at[k];
            fk = K.sweep[0] * (0.5 - 0.5 * d * d * sweepW) + K.sweep[1] * s;
          }
          f[k] = fk; if (fk > fmax) fmax = fk;
        }
        // a soft mix of the inks (softmax), blended in OKLab
        let ws = 0, L = 0, A = 0, B = 0;
        for (let k = 0; k < n; k++) { const w = Math.exp(kmix * (f[k] - fmax)); ws += w; L += w * labs[k][0]; A += w * labs[k][1]; B += w * labs[k][2]; }
        L /= ws; A /= ws; B /= ws;
        const l_ = L + 0.3963377774 * A + 0.2158037573 * B, m_ = L - 0.1055613458 * A - 0.0638541728 * B, s_ = L - 0.0894841775 * A - 1.291485548 * B;
        const l3 = l_ * l_ * l_, m3 = m_ * m_ * m_, s3 = s_ * s_ * s_;
        const o3 = 3 * (j * gw + i);
        out[o3] = toS(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3);
        out[o3 + 1] = toS(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3);
        out[o3 + 2] = toS(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3);
      }
    }
    return { out, gw, gh, g, style: pl.style };
  }

  /* ---- paint ------------------------------------------------------------------------------- */
  let pvImg = null;
  function paint({ ctx, W, H, seed, p, colors, t = 0, anim, preview = false, map }) {
    const amount = anim ? Math.max(0, anim.amount) : 0;
    const labs = colors.map((c) => rgbToLab(PL.color.hexToRgb(c)));
    const { out, gw, g, style } = field(seed | 0, p, W, H, t, amount, labs, map);
    const cw = map ? map.cw : W, ch = map ? map.ch : H; // the canvas (with map: the part of the world it shows)
    if (preview) { if (!pvImg || pvImg.width !== cw || pvImg.height !== ch) pvImg = ctx.createImageData(cw, ch); }
    const img = preview ? pvImg : ctx.createImageData(cw, ch);
    const d8 = img.data, ig = 1 / g;
    const IX = new Int32Array(cw), TX = new Float32Array(cw);
    for (let x = 0; x < cw; x++) { const fx = (x + 0.5) * ig, i = Math.floor(fx); IX[x] = 3 * i; TX[x] = fx - i; }
    for (let y = 0; y < ch; y++) {
      const fy = (y + 0.5) * ig, j = Math.floor(fy), ty = fy - j, r0 = 3 * j * gw, r1 = r0 + 3 * gw;
      let o = y * cw * 4;
      for (let x = 0; x < cw; x++, o += 4) {
        const a = r0 + IX[x], b = r1 + IX[x], tx = TX[x];
        for (let c = 0; c < 3; c++) {
          const top = out[a + c] + (out[a + 3 + c] - out[a + c]) * tx, bot = out[b + c] + (out[b + 3 + c] - out[b + c]) * tx;
          d8[o + c] = top + (bot - top) * ty;
        }
        d8[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const names = { clouds: 'Clouds', mesh: 'Mesh', sweep: 'Sweep' };
    return { status: `${p.style === 'auto' ? 'Auto: ' : ''}${names[style]} · ${colors.length} inks` };
  }

  PL.tools.register({
    id: 'aura',
    name: 'Aura',
    kind: 'Backgrounds',
    tagline: 'Soft gradient',
    about: 'A soft gradient: every ink drifts in its own cloudy field and the inks blend where they meet, as turbulent clouds, broad patches or a sweep across the frame, printed with a fine color dither. In the animation the clouds roll round a small circle and slowly change shape.',
    raster: true,
    colorDither: true,   // opens with the color dither on (kept in looks saved before every style had it)
    opaque: true,        // no background to leave out
    inks: {
      min: 2, max: 8, roles, fit, spec, add, generate,
      span: (n) => n, // Invert reverses the inks
      hint: 'Every ink gets its own cloudy field; the mix blends them where they meet.',
    },
    palettes: PALETTES,
    params: PARAMS,
    animLabel: 'Intensity',
    animHint: 'How far the clouds drift and how much they change over a loop (0: still)',
    defaults: {
      anim: { amount: 1.25, fps: 12, frames: 72 },
      fx: { ditherOn: true, ditherPattern: 'bayer8', ditherPx: 2, tones: 8, ditherAmt: 100 },
    },
    paint,
    zoom: true, // paints any part of its world (General's Rotation and Size)
    _K: K,
    _field: field,
    _plan: plan,
  });
})();
