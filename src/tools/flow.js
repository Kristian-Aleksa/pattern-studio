/* ==========================================================================
   tools/flow.js — Flow: soft color fields (pixel texture: PNG, video).

   1. Fields: a few soft blobs of color (Blobs) melt into one another: each
      point of the frame is a mix of them (blended in OKLab), the nearest
      weighing most. Blend sets how softly (0: soft-edged patches; 100: one
      even haze); Warp bends and swirls the fields. Positions are measured
      in the frame's short side from its centre, so another frame shape
      crops or extends the same picture.
   2. Stretch draws the blobs out along Angle into long bands (100: straight
      bands across the frame, like a linear gradient). Streaks drags fine
      lines along them, each line's color taken from a little to one side,
      so they show most where the colors change.
   3. Grain: a fine film grain over everything. In the animation it holds
      still (Flicker: new every frame, like film).
   4. Colors: one for each blob, dealt out in turn. Transparent leaves the
      first color out (see-through where it shows).
   5. Animation: every blob drifts and breathes round its own loop while the
      warp slowly turns, so the colors flow into one another and back; the
      streaks slide along their bands. The softer the Blend, the further the
      colors move (a soft field hardly shows a small move): the blobs swirl
      round the frame together, and drawn out into bands, the bands sway
      across. Amount: how far. Frame 1 is the same at any Amount. Seamless.
   ========================================================================== */
(() => {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const clamp01 = (v) => clamp(v, 0, 1);
  const lerp = (a, b, t) => a + (b - a) * t;
  const TAU = Math.PI * 2;

  // The default look uses Lagoon (defaults.palette).
  const PALETTES = [
    { name: 'Poppy', colors: ['#D8342C', '#4A6690', '#A6D6CC', '#A9736A'] },
    { name: 'Ember', colors: ['#C9363A', '#EA5A28', '#7A4C3E', '#A84A34'] },
    { name: 'Lagoon', colors: ['#145F78', '#2E8796', '#7E9C90', '#C9B49A'] },
    { name: 'Meadow', colors: ['#6F87A8', '#B6A94E', '#D79F78', '#58708E'] },
    { name: 'Ocean', colors: ['#1E9CCB', '#2E3644', '#7A5C60', '#4A7E95'] },
    { name: 'Tangerine', colors: ['#E35A2B', '#D2643F', '#F2A27C', '#E8502A'] },
    { name: 'Cocoa', colors: ['#C4CDD2', '#CFB27E', '#6B3E1F', '#A47A2C'] },
    { name: 'Rouge', colors: ['#D6D4D0', '#C49A84', '#BE3A2A', '#8E2E25'] },
    { name: 'Dusk', colors: ['#25304E', '#7F94B2', '#B8B24E', '#D0973A'] },
    { name: 'Garden', colors: ['#8C6A64', '#3A7D8E', '#E05A38', '#7DAE4C'] },
    { name: 'Wine', colors: ['#D0CFD2', '#7A2232', '#B4283C', '#2A2234'] },
    { name: 'Sage', colors: ['#455A5C', '#C3D4B8', '#8A9C8C'] },
    { name: 'Horizon', colors: ['#E8613F', '#050505', '#EEECE6', '#6E6A66'] },
    { name: 'Night', colors: ['#050608', '#3C4F82', '#BAB5AD', '#F6F4F0'] },
  ];

  /* ---- color roles -------------------------------------------------------------------- */
  const roles = (n) => Array.from({ length: n }, (_, i) => 'Color ' + (i + 1));
  const spec = (n) => ({ ramp: n, accents: 0 });

  // "New colors": a strong color, a second family of hues (now and then across the wheel), a pale one and a
  // deep one, and more in between: the mix of a blurred color photograph.
  function generate(n, rng) {
    const C = PL.color, h0 = rng.float(0, 360), h1 = h0 + (rng.chance(0.5) ? rng.float(150, 210) : rng.sign() * rng.float(30, 70));
    const out = [
      C.lch(rng.float(0.55, 0.66), rng.float(0.14, 0.2), h0),
      C.lch(rng.float(0.5, 0.66), rng.float(0.07, 0.14), h1),
      C.lch(rng.float(0.84, 0.93), rng.float(0.02, 0.07), h0 + rng.float(-40, 40)),
      C.lch(rng.float(0.28, 0.42), rng.float(0.03, 0.09), h1 + rng.float(-30, 30)),
    ];
    for (let i = 4; i < n; i++) out.push(C.lch(rng.float(0.45, 0.75), rng.float(0.06, 0.18), (i % 2 ? h0 : h1) + rng.float(-35, 35)));
    return out.slice(0, n);
  }
  // + adds a color: one of the colors there turned round the hue circle, the turn that stands furthest from
  // every color there is. The others keep their places.
  function add(colors) {
    const C = PL.color, c = colors.slice();
    const labs = c.map((x) => C.hexToOklab(x));
    let best = null, top = -1;
    for (let i = 0; i < c.length; i++) {
      const [L, Ch, h] = C.hexToLch(c[i]);
      for (const dh of [35, -35, 70, -70, 110, -110, 150, -150, 180]) {
        const hx = C.lch(clamp(L, 0.35, 0.85), Math.max(Ch, 0.06), h + dh), q = C.hexToOklab(hx);
        const sc = Math.min(...labs.map((r) => Math.hypot(q[0] - r[0], q[1] - r[1], q[2] - r[2])));
        if (sc > top + 1e-9) { top = sc; best = hx; }
      }
    }
    c.push(best || C.mix(c[c.length - 1], '#808080', 0.4));
    return c;
  }
  // A palette of any length fitted to n colors.
  function fit(colors, n) {
    const C = PL.color;
    let c = (colors || []).map(C.normHex).filter(Boolean);
    if (!c.length) c = PALETTES[0].colors.slice();
    if (c.length === 1) c.push(C.mix(c[0], C.luminance(c[0]) > 0.35 ? '#000000' : '#FFFFFF', 0.7));
    while (c.length > n) c.pop();
    while (c.length < n) c = add(c);
    return c;
  }

  /* ---- settings ----------------------------------------------------------------------- */
  const S = (section, key, label, min, max, def, extra = {}) => ({ section, key, label, type: 'range', min, max, def, step: 1, ...extra });
  const PARAMS = [
    S('Fields', 'blobs', 'Blobs', 2, 8, 5, { rand: [3, 6], hint: 'How many soft fields of color melt into one another' }),
    S('Fields', 'blend', 'Blend', 0, 100, 45, { unit: '%', rand: [25, 95], hint: 'How softly the colors melt together (0: soft-edged patches; 100: one even haze)' }),
    S('Fields', 'warp', 'Warp', 0, 100, 69, { unit: '%', rand: [0, 80], hint: 'How much the fields bend and swirl' }),
    S('Stretch', 'stretch', 'Stretch', 0, 100, 48, { unit: '%', rand: [0, 100], hint: 'Draws the colors out into long bands (100: straight bands across the frame)' }),
    S('Stretch', 'angle', 'Angle', -90, 90, 11, { unit: '°', rand: [-90, 90], hint: 'Which way the bands and streaks run (0°: across; 90°: up and down)' }),
    S('Stretch', 'streaks', 'Streaks', 0, 100, 69, { unit: '%', rand: [0, 80], hint: 'Fine lines dragged along the bands, showing most where the colors change' }),
    S('Texture', 'grain', 'Grain', 0, 100, 66, { unit: '%', rand: [10, 70], hint: 'A fine film grain over everything' }),
    { section: 'Texture', key: 'flicker', label: 'Flicker', type: 'seg', def: 'off', rand: false, hint: 'On: the grain is new every frame of the animation, like film (Off: it holds still; smaller video files)',
      options: [{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }] },
  ];
  const DEF = Object.fromEntries(PARAMS.map((d) => [d.key, d.def])); // (a setting missing from p reads as its default)

  // Constants. Lengths in the frame's short side unless noted.
  const K = {
    grid: 90,             // the field's samples across the canvas's short side (read between them), at most ...
    perEdge: 4,           // ... and at least this many across the softest edge between two colors (but never closer than 3 px)
    size: [0.65, 1.35],   // a blob's size, x the room each has (the frame shared out between them)
    aspect: 0.25,         // how much wider than tall (or the other way) a blob may be
    sharp: [14, 0.8],     // how sharply the nearest blob wins (Blend 0 .. 100)
    warp: 0.45,           // how far the warp pushes the fields at Warp 100
    warpBands: 0.8,       // ... less by this much in straight bands (Stretch 100)
    waves: 5,             // sine waves in the warp (each way)
    freq: [0.8, 2.2],     // their frequencies (waves per short side)
    stretch: 0.035,       // at Stretch 100 a blob is this times as wide (across the bands) as long ...
    band: 0.65,           // ... and this times as wide as its band
    streak: 0.025,        // a streak's color is taken from up to this far across (at Streaks 100) ...
    line: 3.5 / 1080,     // ... the finest streaks this wide (others 2.7 and 7.3 times as wide) ...
    lineLen: 0.3,         // ... running about this far before they fade ...
    lineTone: 0.02,       // ... and each a little lighter or darker (x full white at Streaks 100)
    grain: 0.2,           // the grain's strength at Grain 100 (of full white) ...
    chroma: 0.45,         // ... its color part (x that)
    drift: 0.22,          // the blobs' drift round their loops at Amount 1 (x their size) ...
    swell: 0.1,           // ... how much they breathe ...
    turn: 1.1,            // ... how far the warp turns (radians) ...
    slide: 0.35,          // ... and how far the streaks slide along their bands
    soft: [0.15, 0.65],   // from this Blend on, the softer the edges between colors, the further the colors move (as
                          // the edges' width, to this power), so soft fields flow as visibly as sharp ones: the warp
                          // turns further (by its root), ...
    swirl: [0.45, 1.2],   // ... all the blobs swirl round the frame together (radians, x that growth less 1; at most) ...
    sway: [0.15, 3],      // ... and drawn out into bands, the bands sway across together (x a band's width, x that growth up to 3)
  };

  /* ---- the blobs and the warp ------------------------------------------------------------- */
  let LAY = null;
  function layout(seed, p, W, H) {
    const n = clamp(Math.round(p.blobs ?? DEF.blobs), 1, 12), keyStr = JSON.stringify([seed, W, H, n]);
    if (LAY && LAY.key === keyStr) return LAY;
    const rng = PL.rng.create(((seed | 0) * 2654435761 + 0x5f10) >>> 0);
    const Sh = Math.min(W, H), ax = W / Sh / 2, ay = H / Sh / 2; // the frame's half-size
    const room = Math.sqrt((4 * ax * ay) / n); // (the side of each blob's share of the frame)
    const blobs = [];
    for (let i = 0; i < n; i++) {
      // the best of a few tries: the furthest from the blobs already placed (a little past the frame's edges too)
      let best = null, bd = -1;
      for (let tries = 0; tries < 12; tries++) {
        const u = rng.float(-1.08, 1.08) * ax, v = rng.float(-1.08, 1.08) * ay;
        const d = blobs.length ? Math.min(...blobs.map((b) => Math.hypot(b.u - u, b.v - v))) : 1;
        if (d > bd) { bd = d; best = [u, v]; }
      }
      const s = room * rng.float(K.size[0], K.size[1]), asp = Math.exp(rng.float(-K.aspect, K.aspect));
      blobs.push({ u: best[0], v: best[1], sa: s * asp, sb: s / asp, color: i, jit: rng.float(-0.22, 0.22),
        ph: [rng.float(0, TAU), rng.float(0, TAU), rng.float(0, TAU)], dr: rng.float(0.6, 1.3) });
    }
    // the warp: a few slow sine waves each way, the broadest pushing furthest
    const waves = [];
    for (let k = 0; k < 2 * K.waves; k++) {
      const f = TAU * rng.float(K.freq[0], K.freq[1]), a = rng.float(0, TAU);
      waves.push({ fx: f * Math.cos(a), fy: f * Math.sin(a), amp: 1 / f, ph: rng.float(0, TAU), ps: rng.float(0, TAU) });
    }
    let norm = 0;
    for (let k = 0; k < K.waves; k++) norm += waves[k].amp;
    for (const w of waves) w.amp /= norm;
    LAY = { key: keyStr, blobs, waves, room, slidePh: rng.float(0, TAU), spin: rng.sign(), spinPh: rng.float(0, TAU), swayPh: rng.float(0, TAU) };
    return LAY;
  }

  // linear light (0..1) -> sRGB (0..255), from a table
  const GAM = new Float32Array(4097);
  for (let i = 0; i <= 4096; i++) {
    const x = i / 4096;
    GAM[i] = 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
  }
  const toSrgb = (x) => {
    if (!(x > 0)) return 0;
    if (x >= 1) return 255;
    const f = x * 4096, i = f | 0;
    return GAM[i] + (GAM[i + 1] - GAM[i]) * (f - i);
  };

  /* ---- the field on a grid: every sample's color (sRGB), and with Transparent how much of it isn't the
     first color -------------------------------------------------------------------------------------- */
  // M (General's Rotation and Size): the canvas (cw x ch) and the part of the world it shows; the samples are
  // as close on the canvas at any zoom. The grid reaches a little past the canvas, for the streaks.
  function field(seed, p, W, H, t, amount, colors, M, transparent) {
    const lay = layout(seed, p, W, H), B = lay.blobs, n = B.length, Sh = Math.min(W, H);
    const cw = M ? M.cw : W, ch = M ? M.ch : H, mx = M ? M.x0 : 0, my = M ? M.y0 : 0, ms = M ? M.s : 1;
    const toPx = Sh / ms; // short sides -> canvas px
    const v01 = (k) => clamp01((p[k] ?? DEF[k]) / 100);
    const blend = v01('blend'), stretch = v01('stretch'), streaks = v01('streaks'), line = stretch * stretch;
    const warp = v01('warp') * K.warp * (1 - K.warpBands * line); // (bands bend less: they stay long and straight)
    const beta = K.sharp[0] * Math.pow(K.sharp[1] / K.sharp[0], blend), hb = -0.5 * beta;
    // the bands' way (along), and how long a blob grows along it
    const ang = ((p.angle ?? DEF.angle) * Math.PI) / 180, ca = Math.cos(ang), sa = Math.sin(ang);
    const su = lerp(1, K.stretch, Math.pow(stretch, 1.4));
    // Drawn out into bands, the blobs line up across the frame: each moves towards its own band (in the order
    // they lie across it), and grows thinner across than that band is wide, so each color keeps a band of its own.
    const ax = W / Sh / 2, ay = H / Sh / 2, ext = 2 * (ax * Math.abs(sa) + ay * Math.abs(ca)), band = ext / n;
    const order = B.map((b, i) => [-b.u * sa + b.v * ca, i]).sort((x, y) => x[0] - y[0]), place = new Float64Array(n);
    order.forEach(([, i], r) => (place[i] = -ext / 2 + band * (r + 0.5 + B[i].jit)));
    const thin = lerp(1, (K.band * band) / lay.room, line);
    // the samples: K.grid across, closer where the edges between colors are sharp (Blend low, Warp high, thin bands)
    const edge = ((lay.room * 0.8 * thin) / beta / (1 + (2 * warp) / K.warp)) * toPx; // (a band's edge narrows as the band does)
    const g = Math.max(3, Math.min(Math.round(Math.min(cw, ch) / K.grid), Math.floor(edge / K.perEdge)));
    const pad = Math.ceil(K.streak * streaks * toPx) + 2 * g; // (room for the streaks to reach in from outside)
    const gw = Math.ceil((cw + 2 * pad) / g) + 2, gh = Math.ceil((ch + 2 * pad) / g) + 2;
    // the blobs where they are at time t (setting off round their loops from where they start; drawn out into
    // bands, they drift mostly along them, so the bands keep their order), and their colors
    const th = TAU * t, m = colors.length, labs = colors.map((c) => PL.color.hexToOklab(c)), keep = 1 - 0.75 * stretch;
    // Softer fields move further (their edges are wider, so the same move hardly shows): they all swirl round the
    // frame together, which keeps them as far apart (no two colors run together into one haze), and drawn out
    // into bands, the bands sway across together (which keeps their order)
    const reach = Math.pow(K.sharp[0] / K.sharp[1], K.soft[1] * Math.max(0, blend - K.soft[0])), rr = Math.sqrt(reach), lp = Math.sin(th + lay.spinPh) - Math.sin(lay.spinPh);
    const wb = (1 - line) * (1 - line), spin = amount * Math.min(K.swirl[0] * (reach - 1), K.swirl[1]) * wb * lay.spin * lp, cs = Math.cos(spin), sn = Math.sin(spin); // (not the bands ...)
    const sway = amount * K.sway[0] * band * Math.min(reach, K.sway[1]) * (1 - wb) * (Math.sin(th + lay.swayPh) - Math.sin(lay.swayPh)); // (... which sway)
    const BU = new Float64Array(n), BV = new Float64Array(n), IA = new Float64Array(n), IB = new Float64Array(n), CI = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const b = B[i], d = amount * K.drift * lay.room * b.dr, sw = 1 + amount * K.swell * (Math.sin(th + b.ph[2]) - Math.sin(b.ph[2]));
      const du = d * (Math.sin(th + b.ph[0]) - Math.sin(b.ph[0])), dv = d * (Math.cos(th + b.ph[1]) - Math.cos(b.ph[1]));
      const x = b.u / ax, y = b.v / ay, hu = (x * cs - y * sn) * ax, hv = (x * sn + y * cs) * ay; // (swirled round the frame, along its shape)
      BU[i] = hu * ca + hv * sa + (du * ca + dv * sa) / Math.max(su, 0.25); // (in the bands' frame: further along the longer they are ...
      BV[i] = lerp(-hu * sa + hv * ca, place[i], line) + (-du * sa + dv * ca) * keep + sway; // ... and less across)
      IA[i] = su / (b.sa * sw); IB[i] = 1 / (b.sb * sw * thin);
      CI[i] = b.color % m;
    }
    const WV = lay.waves, nw = WV.length, WP = new Float64Array(nw);
    for (let k = 0; k < nw; k++) WP[k] = WV[k].ph + amount * K.turn * rr * (Math.sin(th + WV[k].ps) - Math.sin(WV[k].ps));
    const RGB = new Float32Array(gw * gh * 3), AL = transparent ? new Float32Array(gw * gh) : null;
    const F0 = PL.color.hexToRgb(colors[0]);
    const wt = new Float64Array(n);
    for (let j = 0; j < gh; j++) {
      const y = j * g - pad, v0 = (my + y * ms - H / 2) / Sh;
      for (let i = 0; i < gw; i++) {
        const x = i * g - pad, u0 = (mx + x * ms - W / 2) / Sh;
        // the warp
        let u = u0, v = v0;
        if (warp > 0) {
          let du = 0, dv = 0;
          for (let k = 0; k < K.waves; k++) {
            const a = WV[k], b = WV[k + K.waves];
            du += a.amp * Math.sin(a.fx * u0 + a.fy * v0 + WP[k]);
            dv += b.amp * Math.sin(b.fx * u0 + b.fy * v0 + WP[k + K.waves]);
          }
          u += warp * du; v += warp * dv;
        }
        // into the bands' frame; each blob's weight (the nearest heaviest), relative to the nearest's
        const pu = u * ca + v * sa, pv = -u * sa + v * ca;
        let qmin = 1e30;
        for (let k = 0; k < n; k++) {
          const a = (pu - BU[k]) * IA[k], b = (pv - BV[k]) * IB[k], q = a * a + b * b;
          wt[k] = q;
          if (q < qmin) qmin = q;
        }
        let sw = 0, L = 0, A = 0, Bb = 0, w0 = 0;
        for (let k = 0; k < n; k++) {
          const w = Math.exp(hb * (wt[k] - qmin)), c = labs[CI[k]];
          sw += w; L += w * c[0]; A += w * c[1]; Bb += w * c[2];
          if (CI[k] === 0) w0 += w;
        }
        L /= sw; A /= sw; Bb /= sw;
        // OKLab -> linear sRGB -> sRGB
        const l_ = L + 0.3963377774 * A + 0.2158037573 * Bb, m_ = L - 0.1055613458 * A - 0.0638541728 * Bb, s_ = L - 0.0894841775 * A - 1.291485548 * Bb;
        const l3 = l_ * l_ * l_, m3 = m_ * m_ * m_, s3 = s_ * s_ * s_;
        let r = toSrgb(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3);
        let gg = toSrgb(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3);
        let bb = toSrgb(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3);
        const o = j * gw + i;
        if (AL) {
          // Transparent: the first color left out, the rest's color such that, laid over the first color, it
          // gives the same picture
          const al = 1 - w0 / sw;
          AL[o] = al;
          if (al > 1e-4) { const ia = 1 / al; r = (r - (1 - al) * F0[0]) * ia; gg = (gg - (1 - al) * F0[1]) * ia; bb = (bb - (1 - al) * F0[2]) * ia; }
        }
        RGB[3 * o] = r; RGB[3 * o + 1] = gg; RGB[3 * o + 2] = bb;
      }
    }
    return { RGB, AL, g, gw, gh, pad, toPx, ca, sa, streaks };
  }

  /* ---- paint ------------------------------------------------------------------------------- */
  let pvImg = null;
  function paint({ ctx, W, H, seed, p, colors, t = 0, anim, frame = 0, preview = false, map, transparent = false }) {
    const amount = anim ? Math.max(0, anim.amount) : 0;
    const cw = map ? map.cw : W, ch = map ? map.ch : H, mx = map ? map.x0 : 0, my = map ? map.y0 : 0, ms = map ? map.s : 1;
    const F = field(seed | 0, p, W, H, t, amount, colors, map, transparent);
    const { RGB, AL, g, gw, gh, pad, toPx, ca, sa, streaks } = F;
    if (preview) { if (!pvImg || pvImg.width !== cw || pvImg.height !== ch) pvImg = ctx.createImageData(cw, ch); }
    const img = preview ? pvImg : ctx.createImageData(cw, ch);
    const d8 = img.data, ig = 1 / g, Sh = Math.min(W, H), lay = layout(seed | 0, p, W, H);
    const v01 = (k) => clamp01((p[k] ?? DEF[k]) / 100);
    // the grain: as fine at any export size; Flicker: new every frame of a loop (a still keeps frame 1's)
    const unit = Math.max(cw, ch) / 1080, gs = Math.max(1, Math.round(unit));
    const gA = K.grain * v01('grain') * 255, gC = gA * K.chroma;
    const frames = anim && anim.frames > 0 ? anim.frames : 1, fs = amount > 0 && p.flicker === 'on' ? ((((frame | 0) % frames) + frames) % frames) : 0;
    const salt = Math.imul((seed | 0) ^ 0x6a09e667, 0x27d4eb2d) ^ Math.imul(fs + 1, 0x165667b1);
    const HX = new Int32Array(cw);
    for (let x = 0; x < cw; x++) HX[x] = Math.imul(Math.floor(x / gs), 0x9e3779b1);
    // the streaks (in the world, so they zoom with the picture): each line takes its color from up to
    // `reach` across, fading in and out along its length; three widths of line laid over one another
    const reach = K.streak * streaks, lw = K.line, lw2 = 2.7 * K.line, lw3 = 7.3 * K.line, ilen = 1 / K.lineLen, tone = K.lineTone * streaks * 255;
    const th = TAU * t, slide = amount * K.slide * (Math.sin(th + lay.slidePh) - Math.sin(lay.slidePh));
    const lineSalt = Math.imul((seed | 0) + 0x3c6ef372, 0x85ebca77);
    const lineH = (i, s) => { let h = Math.imul(i ^ s, 0x2c1b3c6d) ^ lineSalt; h = Math.imul(h ^ (h >>> 15), 0x297a2d39); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
    const gmax = gw - 1.001, hmax = gh - 1.001, il1 = 1 / lw, il2 = 1 / lw2, il3 = 1 / lw3, dwu = ms / Sh, rpx = reach * toPx;
    // (pixel x's place on the grid, with no streaks)
    const IX = new Int32Array(cw), TX = new Float32Array(cw);
    for (let x = 0; x < cw; x++) { const fx = (x + 0.5 + pad) * ig, i = Math.floor(fx); IX[x] = i; TX[x] = fx - i; }
    for (let y = 0; y < ch; y++) {
      const hy = Math.imul(Math.floor(y / gs), 0x85ebca77) ^ salt, fyc = (y + 0.5 + pad) * ig, jc = Math.floor(fyc), tyc = fyc - jc;
      // the row in the world: across and along the bands at its first pixel, and their steps along it
      const wv = (my + (y + 0.5) * ms - H / 2) / Sh, wu0 = (mx + 0.5 * ms - W / 2) / Sh;
      const A0 = (wu0 * ca + wv * sa + slide) * ilen, dA = dwu * ca * ilen, C0 = -wu0 * sa + wv * ca, dC = -dwu * sa;
      let pL1 = NaN, pL2 = NaN, pL3 = NaN, h1 = 0, h2 = 0, h3 = 0, t1 = 0;
      let o = y * cw * 4;
      for (let x = 0; x < cw; x++, o += 4) {
        let i, j, tx, ty, shade = 0;
        if (reach > 0) {
          // this pixel's lines (each width's hash kept while the pixel stays on the same line)
          const acr = C0 + x * dC, L1 = Math.floor(acr * il1), L2 = Math.floor(acr * il2), L3 = Math.floor(acr * il3);
          if (L1 !== pL1) { pL1 = L1; h1 = lineH(L1, 0x1234567); t1 = (lineH(L1, 0x2468ace) - 0.5) * 2 * tone; }
          if (L2 !== pL2) { pL2 = L2; h2 = lineH(L2, 0x7654321); }
          if (L3 !== pL3) { pL3 = L3; h3 = lineH(L3, 0x0badcafe); }
          // each fades in and out along its length (a smooth wave of its own: a parabola for a sine)
          let ph = A0 + x * dA + h2 * 6.37;
          ph -= Math.floor(ph);
          const sq = ph < 0.5 ? 16 * ph * (0.5 - ph) : -16 * (ph - 0.5) * (1 - ph), e = 0.25 + 0.375 * (1 + sq);
          const off = ((h1 - 0.5) + (h2 - 0.5) * 0.8 + (h3 - 0.5) * 0.6) * e * rpx; // (canvas px)
          let fx = (x + 0.5 + pad - off * sa) * ig, fy = (y + 0.5 + pad + off * ca) * ig;
          fx = fx < 0 ? 0 : fx > gmax ? gmax : fx; fy = fy < 0 ? 0 : fy > hmax ? hmax : fy;
          i = fx | 0; j = fy | 0; tx = fx - i; ty = fy - j;
          shade = t1 * e;
        } else { i = IX[x]; j = jc; tx = TX[x]; ty = tyc; }
        const a = j * gw + i, b = a + gw, a3 = 3 * a, b3 = 3 * b;
        const r0 = RGB[a3] + (RGB[a3 + 3] - RGB[a3]) * tx, r1 = RGB[b3] + (RGB[b3 + 3] - RGB[b3]) * tx;
        const g0 = RGB[a3 + 1] + (RGB[a3 + 4] - RGB[a3 + 1]) * tx, g1 = RGB[b3 + 1] + (RGB[b3 + 4] - RGB[b3 + 1]) * tx;
        const b0 = RGB[a3 + 2] + (RGB[a3 + 5] - RGB[a3 + 2]) * tx, b1 = RGB[b3 + 2] + (RGB[b3 + 5] - RGB[b3 + 2]) * tx;
        const r = r0 + (r1 - r0) * ty, gg = g0 + (g1 - g0) * ty, bb = b0 + (b1 - b0) * ty;
        let al = 1;
        if (AL) { const t0 = AL[a] + (AL[a + 1] - AL[a]) * tx, t1 = AL[b] + (AL[b + 1] - AL[b]) * tx; al = t0 + (t1 - t0) * ty; }
        // the grain: a shade over all three channels, a little stronger in the light, with a little color of
        // its own (and always a faint one, so smooth gradients never band). With Transparent it is as strong
        // where the colors are partly see-through: laid over anything, the grain is even.
        let h = HX[x] + hy;
        h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); h ^= h >>> 15;
        const lum = (r + gg + bb) * (1 / 765), s1 = ((h & 0xff) + ((h >>> 8) & 0xff)) / 255 - 1, ka = al < 1 ? 1 / Math.max(al, 0.2) : 1;
        const d = (s1 * (gA * (0.55 + 0.45 * lum) + 0.75) + shade) * ka, cl = gC * (0.4 + 0.6 * lum) * ka;
        d8[o] = r + d + ((((h >>> 16) & 0x3f) / 31.5) - 1) * cl;
        d8[o + 1] = gg + d + ((((h >>> 22) & 0x3f) / 31.5) - 1) * cl;
        d8[o + 2] = bb + d + ((((h >>> 26) & 0x3f) / 31.5) - 1) * cl;
        d8[o + 3] = al * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const n = lay.blobs.length, st = Math.round(100 * v01('stretch'));
    return { status: `${n} blob${n === 1 ? '' : 's'}${st ? ` · stretched ${st} %` : ''}` };
  }

  PL.tools.register({
    id: 'flow',
    name: 'Flow',
    kind: 'Gradients',
    tagline: 'Color flow',
    about: 'Soft fields of color melting into one another like a blurred photograph, bent and swirled, or drawn out into long bands with fine streaks dragged along them, all under a fine film grain. In the animation the colors flow into one another and back.',
    raster: true,
    inks: {
      min: 2, max: 8, roles, fit, spec, add, generate,
      span: (n) => n, // Invert reverses the colors
      hint: 'One color for each blob, dealt out in turn; with Transparent the first color is left out.',
    },
    palettes: PALETTES,
    params: PARAMS,
    animHint: 'How far the colors flow over a loop (0: still)',
    defaults: {
      palette: 'Lagoon', // the preset the style opens on (its card's colors)
      anim: { amount: 2, fps: 24, frames: 192 }, // an 8 s loop
      frame: 50, // the default look shows (and opens on) frame 51 of its loop
      fx: {},
    },
    paint,
    zoom: true, // paints any part of its world (General's Rotation and Size)
    _K: K,
    _layout: layout,
    _field: field,
  });
})();
