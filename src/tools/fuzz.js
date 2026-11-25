/* ==========================================================================
   tools/fuzz.js — Fuzz: grainy, glowing soft shapes (pixel texture: PNG, video).

   1. Shapes: a few big soft forms laid one over another (Shapes: how many;
      Size; Lumps: from smooth ovals to lumpy, many-lobed waves). Each is a sum
      of soft round bumps, its outline where the sum reaches a level. Form:
      Lobes float about the frame; Hills rise in rows from the bottom, the
      back row highest. Positions are measured in the frame's short side from
      its centre, so another frame shape crops or extends the same picture.
   2. Light: every shape is lit as a soft dome, from Angle (0°: from above)
      and Height (low: grazing, so the edges facing the light shine; high:
      from the front, so the middles glow). Its edges glow in the light's
      color (Glow), its far side sinks into the dark, and the shapes behind it
      darken round its outline (Shadow).
   3. Texture: the edges are hairy (Fuzz: grains scattered across them), soft
      (Softness: blurred) or both, and a colored grain lies over everything
      (Grain), as fine at any export size (it scales with the long side).
      In the animation it holds still (Flicker: new every frame, like film).
   4. Colors: Ground, Glow (the light), then the shapes' colors, dealt out to
      the shapes in turn.
   5. Animation: every bump drifts and swells round its own loop, so the
      shapes roll and breathe under the grain. Amount: how far. Frame 1 is
      the same at any Amount. Seamless.
   ========================================================================== */
(() => {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const clamp01 = (v) => clamp(v, 0, 1);
  const lerp = (a, b, t) => a + (b - a) * t;
  const TAU = Math.PI * 2;

  // Ground, Glow, then the shapes. The default look uses Ember (defaults.palette).
  const PALETTES = [
    { name: 'Ember', colors: ['#0E0C0C', '#E9DD92', '#D7132E', '#C9428A', '#8A7A3E'] },
    { name: 'Sunset', colors: ['#0D0B0B', '#F7C23F', '#EC4E2C', '#EE0438', '#D81E9C'] },
    { name: 'Lagoon', colors: ['#070A14', '#D9ECF8', '#1163DB', '#1BA2E1', '#0F3EA9'] },
    { name: 'Cobalt', colors: ['#090B16', '#C6C8F2', '#0B3DD9', '#4C3EBA'] },
    { name: 'Ultraviolet', colors: ['#0B0B10', '#FF0A88', '#4A2E9C', '#2B1F66'] },
    { name: 'Lime', colors: ['#0A0C08', '#F2FFB4', '#62C23A', '#C9DF3C', '#1D8C6B'] },
    { name: 'Rose', colors: ['#120A0E', '#FFE4EB', '#FF6F9C', '#C2185B'] },
    { name: 'Mint', colors: ['#06110F', '#E0FFF4', '#22C99A', '#0E7C66'] },
    { name: 'Mono', colors: ['#0B0B0B', '#FFFFFF', '#8C8C8C', '#4C4C4C', '#C4C4C4'] },
    { name: 'Paper', colors: ['#EFE9DF', '#FFFFFF', '#F2994A', '#EB5757', '#9B51E0'] },
  ];

  /* ---- color roles -------------------------------------------------------------------- */
  const roles = (n) => ['Ground', 'Glow', ...(n === 3 ? ['Shapes'] : Array.from({ length: n - 2 }, (_, i) => 'Shape ' + (i + 1)))];
  const spec = (n) => ({ ramp: 1, accents: n - 1 });

  // "New colors": a dark ground (now and then a pale one), a pale glow, and shapes in one family of hues.
  function generate(n, rng) {
    const C = PL.color, h = rng.float(0, 360), dh = rng.sign() * rng.float(20, 70), dark = rng.chance(0.85);
    const ground = dark ? C.lch(rng.float(0.13, 0.19), rng.float(0.005, 0.025), h) : C.lch(rng.float(0.93, 0.96), rng.float(0.01, 0.025), h + 40);
    const glow = C.lch(rng.float(0.9, 0.97), rng.float(0.04, 0.12), h + dh * 1.6);
    const shapes = [];
    for (let i = 2; i < n; i++) shapes.push(C.lch(rng.float(0.5, 0.7), rng.float(0.14, 0.22), h + dh * (i - 2) * 0.7 + rng.float(-10, 10)));
    return [ground, glow, ...shapes];
  }
  // + adds a shape color: one of the shapes' own colors turned round the hue circle, the turn that stands
  // furthest from every color there is. The others keep their places.
  function add(colors) {
    const C = PL.color, c = colors.slice();
    const labs = c.map((x) => C.hexToOklab(x));
    let best = null, top = -1;
    for (let i = Math.min(2, c.length - 1); i < c.length; i++) {
      const [L, Ch, h] = C.hexToLch(c[i]);
      for (const dh of [35, -35, 70, -70, 110, -110, 150, -150, 180]) {
        const hx = C.lch(clamp(L, 0.45, 0.75), Math.max(Ch, 0.1), h + dh), q = C.hexToOklab(hx);
        const sc = Math.min(...labs.map((r) => Math.hypot(q[0] - r[0], q[1] - r[1], q[2] - r[2])));
        if (sc > top + 1e-9) { top = sc; best = hx; }
      }
    }
    c.push(best || C.mix(c[c.length - 1], '#808080', 0.4));
    return c;
  }
  // A palette of any length fitted to n colors: the ground and glow first; a short one gets shapes added.
  function fit(colors, n) {
    const C = PL.color;
    let c = (colors || []).map(C.normHex).filter(Boolean);
    if (!c.length) c = PALETTES[0].colors.slice();
    if (c.length < 2) c.push(C.mix(c[0], C.luminance(c[0]) > 0.35 ? '#000000' : '#FFFFFF', 0.9));
    if (c.length < 3) c.push(C.mix(c[1], c[0], 0.45));
    while (c.length > n) c.pop();
    while (c.length < n) c = add(c);
    return c;
  }

  /* ---- settings ----------------------------------------------------------------------- */
  const S = (section, key, label, min, max, def, extra = {}) => ({ section, key, label, type: 'range', min, max, def, step: 1, ...extra });
  const PARAMS = [
    S('Shapes', 'shapes', 'Shapes', 1, 8, 6, { rand: [3, 6], hint: 'How many shapes are laid one over another' }),
    S('Shapes', 'size', 'Size', 0, 100, 76, { unit: '%', rand: [30, 80], hint: 'How big the shapes are' }),
    S('Shapes', 'lumps', 'Lumps', 0, 100, 40, { unit: '%', rand: [20, 90], hint: 'From smooth ovals (0) to lumpy, many-lobed waves' }),
    { section: 'Shapes', key: 'form', label: 'Form', type: 'seg', def: 'lobes', rand: true, hint: 'Lobes float about the frame; Hills rise in rows from the bottom',
      options: [{ value: 'lobes', label: 'Lobes' }, { value: 'hills', label: 'Hills' }] },
    S('Light', 'angle', 'Angle', -180, 180, -69, { unit: '°', rand: [-80, 80], hint: 'Where the light comes from (0°: above; positive: from the right)' }),
    S('Light', 'height', 'Height', 0, 100, 51, { unit: '%', rand: [5, 60], hint: 'How high the light is: low lights up the edges facing it, high makes the middles glow' }),
    S('Light', 'glow', 'Glow', 0, 100, 55, { unit: '%', rand: [35, 90], hint: "How brightly the edges glow in the light's color" }),
    S('Light', 'shadow', 'Shadow', 0, 100, 58, { unit: '%', rand: [35, 90], hint: 'How dark the far sides get, and the shapes behind round each outline' }),
    S('Texture', 'fuzz', 'Fuzz', 0, 100, 28, { unit: '%', rand: [20, 80], hint: 'How hairy the edges are: grains scattered across them' }),
    S('Texture', 'soft', 'Softness', 0, 100, 31, { unit: '%', rand: [0, 40], hint: 'How blurred the edges are (100: soft glows)' }),
    S('Texture', 'grain', 'Grain', 0, 100, 74, { unit: '%', rand: [30, 80], hint: 'A colored grain over everything' }),
    { section: 'Texture', key: 'flicker', label: 'Flicker', type: 'seg', def: 'off', rand: false, hint: 'On: the grain is new every frame of the animation, like film (Off: it holds still while the shapes move; smaller video files)',
      options: [{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }] },
  ];
  const DEF = Object.fromEntries(PARAMS.map((d) => [d.key, d.def])); // (a setting missing from p reads as its default)

  // Constants. Lengths in the frame's short side unless noted.
  const K = {
    grid: 96,             // the field's samples across the canvas's short side (read between them) ...
    cells: 5,             // ... and at least this many across the smallest bump
    level: 0.5,           // a shape's outline: where its bumps reach this ...
    union: [1.7, 5],      // ... joined by a soft maximum this sharp (Lobes, Hills)
    flat: 0.35,           // the least slope the distance to an outline is read with (where bumps part or join, it falls to nothing)
    size: [0.14, 0.48],   // a lobe's size at Size 0 -> 100 (it varies by a quarter either way) ...
    hill: [0.24, 0.55],   // ... a hill's
    round: 0.09,          // how round the domes are (their height's scale)
    elev: [6, 82],        // the light's height at Height 0 -> 100 (degrees above the picture)
    amb: [0.3, 0.02],     // the far side's light at Shadow 0 -> 100
    rim: 1.05,            // the glow round the outline at Glow 100 (it fades in as the surface leans: lean^2.5)
    spec: 0.3,            // the shine where the light faces the surface at Glow 100 (its light^10)
    cast: 0.09,           // shapes darken those behind them this far round their outlines (and a quarter of it inside) ...
    castIn: 0.25,
    castK: 0.8,           // ... this much at Shadow 100
    deep: 0.02,           // where a cell lies this far inside a shape's outline (its sum over the level) or wholly outside it,
    turn: 0.12,           // and the surface turns no more than this across it, its light is read between the samples
    fuzz: 14,             // the edges' scatter (px either way at a 1080 px long side) at Fuzz 100
    soft: 0.06,           // the edges' blur at Softness 100
    grain: 0.42,          // the grain's strength at Grain 100 (of full white) ...
    chroma: 0.55,         // ... its color part (x that)
    drift: 0.16,          // the bumps' drift round their loops at Amount 1 (x the shape's size) ...
    swell: 0.12,          // ... and how much they swell
    top: 1.5,             // the light's scale runs 0 (dark) .. this (white-hot)
  };

  /* ---- the shapes: soft bumps (u, v, sx, sy, angle) in short sides from the frame's centre ------- */
  let LAY = null;
  function layout(seed, p, W, H) {
    const keyStr = JSON.stringify([seed, W, H, p.shapes, p.size, p.lumps, p.form]);
    if (LAY && LAY.key === keyStr) return LAY;
    const rng = PL.rng.create(((seed | 0) * 2246822519 + 0xf022) >>> 0);
    const Sh = Math.min(W, H), ax = W / Sh / 2, ay = H / Sh / 2; // the frame's half-size
    const n = clamp(Math.round(p.shapes ?? DEF.shapes), 1, 12), size = clamp01((p.size ?? DEF.size) / 100), lumps = clamp01((p.lumps ?? DEF.lumps) / 100);
    const hills = p.form === 'hills';
    const shapes = [], centres = [];
    let smin = 1; // (the smallest bump's size)
    const bump = (u, v, sx, sy, a, A = 1) => ({ u, v, sx, sy, a, A, c: Math.cos(a), s: Math.sin(a),
      ph: [rng.float(0, TAU), rng.float(0, TAU), rng.float(0, TAU)], dr: rng.float(0.6, 1.3) });
    for (let k = 0; k < n; k++) {
      const bumps = [];
      let R;
      if (hills) {
        // rows of round hills, the back row highest, each row's hills rising from a broad body below them
        const row = n === 1 ? 0.6 : k / (n - 1), span = 2 * ax + 0.4;
        const top = -ay + 2 * ay * lerp(0.3, 0.68, row) + rng.float(-0.05, 0.05); // (its hilltops, the frame's top at -ay)
        const m = Math.max(1, Math.round(lerp(1.2, 3.4, lumps) * rng.float(0.8, 1.2)));
        R = lerp(K.hill[0], K.hill[1], size) * rng.float(0.85, 1.15);
        let bottom = -1e9;
        for (let i = 0; i < m; i++) {
          const rho = R * rng.float(0.7, 1.2), sg = rho / 1.18, tp = top + rng.float(0, 0.12) * (m > 1 ? 1 : 0);
          bumps.push(bump(-ax - 0.2 + (span * (i + rng.float(0.25, 0.75))) / m, tp + sg * 1.12, sg * rng.float(0.95, 1.3), sg, rng.float(-0.2, 0.2), rng.float(0.95, 1.1)));
          bottom = Math.max(bottom, tp + rho * rng.float(1.35, 1.7)); // (the body stays low, so the hills stand out round)
        }
        const by = ay + 0.6;
        bumps.push(bump(rng.float(-0.2, 0.2), by, 2.2 * ax + 0.6, Math.max(0.15, (by - bottom) / 1.18), 0));
      } else {
        // a lobe: bumps strung along a spine, somewhere about the frame (clear of the others where it can be)
        let best = null, bd = -1;
        for (let tries = 0; tries < 10; tries++) {
          const sp = k === 0 ? 0.6 : 1.05; // (the first one nearer the middle)
          const u = rng.float(-ax, ax) * sp, v = rng.float(-ay, ay) * sp;
          const d = centres.length ? Math.min(...centres.map(([a, b]) => Math.hypot(a - u, b - v))) : 1;
          if (d > bd) { bd = d; best = [u, v]; }
        }
        centres.push(best);
        R = lerp(K.size[0], K.size[1], size) * rng.float(0.75, 1.25);
        const m = 1 + Math.round(lumps * rng.float(1.2, 4.2)), spread = R * lerp(0.2, 1.3, lumps), bend = rng.float(-1.4, 1.4) * lumps;
        let phi = rng.float(0, TAU), pu = best[0] - Math.cos(phi) * spread, pv = best[1] - Math.sin(phi) * spread;
        const stepL = m === 1 ? 0 : (2 * spread) / (m - 1);
        if (m === 1) { pu = best[0]; pv = best[1]; }
        for (let i = 0; i < m; i++) {
          // (along the spine, which curves as it goes; the bumps big and small, off it a little)
          const q = rng.float(-0.3, 0.3) * spread * lumps, sg = R * rng.float(0.5, 0.85) * (1 - 0.35 * lumps * rng.float(0, 1));
          bumps.push(bump(pu - Math.sin(phi) * q, pv + Math.cos(phi) * q, sg * rng.float(0.8, 1.3), sg * rng.float(0.75, 1.2), phi + rng.float(-0.5, 0.5), rng.float(0.75, 1.2)));
          pu += Math.cos(phi) * stepL; pv += Math.sin(phi) * stepL; phi += (bend * stepL) / Math.max(0.05, spread);
        }
      }
      shapes.push({ bumps, R, ink: k, P: hills ? K.union[1] : K.union[0] });
      for (const b of bumps) smin = Math.min(smin, b.sx, b.sy);
    }
    // the colors dealt out from the biggest shape down (the first shape color goes furthest)
    shapes.map((s, i) => [s.R * (hills ? 1 : s.bumps.length ** 0.35), i]).sort((a, b) => b[0] - a[0]).forEach(([, i], r) => (shapes[i].ink = r));
    LAY = { key: keyStr, shapes, ax, ay, smin };
    return LAY;
  }

  /* ---- colors: each shape color's light scale, dark to white-hot, as a table (OKLab blends) -------- */
  const LUTS = new Map();
  function luts(colors) {
    const keyStr = colors.join();
    let L = LUTS.get(keyStr);
    if (L) return L;
    if (LUTS.size > 24) LUTS.clear();
    const C = PL.color, ground = colors[0], glow = colors[1], inks = colors.slice(2), m = inks.length;
    L = [];
    for (let k = 0; k < m; k++) {
      const body = inks[k % m], next = inks[(k + 1) % m];
      const stops = [ // [where on the scale, color]
        [0, C.mix(C.mix(body, next, 0.3), ground, 0.9)],
        [0.35, C.mix(C.mix(body, next, 0.25), ground, 0.55)],
        [0.72, body],
        [1.02, C.mix(body, glow, 0.55)],
        [1.25, glow],
        [K.top, C.mix(glow, '#FFFFFF', 0.55)],
      ];
      const T = new Uint8ClampedArray(256 * 3);
      for (let i = 0; i < 256; i++) {
        const x = (i / 255) * K.top;
        let j = 0;
        while (j < stops.length - 2 && x > stops[j + 1][0]) j++;
        const f = clamp01((x - stops[j][0]) / (stops[j + 1][0] - stops[j][0]));
        const [r, g, b] = C.hexToRgb(C.mix(stops[j][1], stops[j + 1][1], f));
        T[3 * i] = r; T[3 * i + 1] = g; T[3 * i + 2] = b;
      }
      L.push(T);
    }
    LUTS.set(keyStr, L);
    return L;
  }

  // Scratch arrays, kept from frame to frame (new ones every frame keep the garbage collector busy while it plays)
  const BUF = new Map();
  function buf(name, Type, len) {
    let b = BUF.get(name);
    if (!b || b.length < len) { b = new Type(len); BUF.set(name, b); }
    return b;
  }

  /* ---- the field on a grid: for each shape, its bumps' sum and slope, how far inside its outline, and the
     shadow on it from the shapes in front ---------------------------------------------------------------- */
  // M (General's Rotation and Size): the canvas (cw x ch) and the part of the world it shows; the grid is
  // as fine on the canvas as at 100 %, so zoomed in the shapes are read again at full detail. All of these
  // are smooth, so they read well between the samples, and a pixel's light is worked out from them where it
  // turns quickly (round the outlines), so the edges stay clean and steady as the shapes move.
  function field(seed, p, W, H, t, amount, M) {
    const lay = layout(seed, p, W, H), sh = lay.shapes, n = sh.length, Sh = Math.min(W, H);
    const cw = M ? M.cw : W, ch = M ? M.ch : H, mx = M ? M.x0 : 0, my = M ? M.y0 : 0, ms = M ? M.s : 1;
    const toPx = Sh / ms, ipx = 1 / toPx; // short sides <-> canvas px
    // (K.grid across the canvas, or closer where the smallest bump, shrunk as it breathes, would span fewer than K.cells)
    const g = Math.max(3, Math.min(Math.round(Math.min(cw, ch) / K.grid), Math.floor((lay.smin * (1 - 2 * K.swell) * toPx) / K.cells)));
    const gw = Math.ceil(cw / g) + 2, gh = Math.ceil(ch / g) + 2, np = gw * gh;
    // the bumps where they are at time t (they set off round their loops from where they start)
    const th = TAU * t, B = [];
    for (const s of sh) {
      const list = new Float64Array(7 * s.bumps.length);
      s.bumps.forEach((b, i) => {
        const d = amount * K.drift * s.R * b.dr, w = 1 + amount * K.swell * (Math.sin(th + b.ph[2]) - Math.sin(b.ph[2]));
        list.set([b.u + d * (Math.sin(th + b.ph[0]) - Math.sin(b.ph[0])), b.v + d * (Math.cos(th + b.ph[1]) - Math.cos(b.ph[1])),
          1 / (b.sx * w * b.sx * w), 1 / (b.sy * w * b.sy * w), b.c, b.s, Math.pow(b.A, s.P)], 7 * i);
      });
      B.push(list);
    }
    const FV = buf('FV', Float32Array, n * np), GX = buf('GX', Float32Array, n * np), GY = buf('GY', Float32Array, n * np);
    const E = buf('E', Float32Array, n * np), CS = buf('CS', Float32Array, n * np), ef = new Float64Array(n);
    const g02 = (K.flat * ipx) ** 2, cast = K.cast * toPx, cIn = K.castIn * cast;
    for (let j = 0; j < gh; j++) {
      const v = (my + j * g * ms - H / 2) / Sh;
      for (let i = 0; i < gw; i++) {
        const u = (mx + i * g * ms - W / 2) / Sh, at = j * gw + i;
        for (let k = 0; k < n; k++) {
          // the bumps joined (a soft maximum: each still round where they meet) and the slope (per canvas px)
          const P = sh[k].P, hp = -0.5 * P, L = B[k];
          let Sw = 0, Gu = 0, Gv = 0;
          for (let bi = 0; bi < L.length; bi += 7) {
            const du = u - L[bi], dv = v - L[bi + 1], c = L[bi + 4], s = L[bi + 5], a = du * c + dv * s, b = -du * s + dv * c;
            const iax = L[bi + 2], iay = L[bi + 3], q = a * a * iax + b * b * iay;
            if (q * P > 60) continue;
            const w = L[bi + 6] * Math.exp(hp * q), da = -a * iax, db = -b * iay;
            Sw += w; Gu += w * (da * c - db * s); Gv += w * (da * s + db * c);
          }
          const F = Sw > 0 ? Math.exp(Math.log(Sw) / P) : 0, gx = Sw > 0 ? ((F * Gu) / Sw) * ipx : 0, gy = Sw > 0 ? ((F * Gv) / Sw) * ipx : 0;
          const o = k * np + at;
          FV[o] = F; GX[o] = gx; GY[o] = gy;
          E[o] = ef[k] = (F - K.level) / Math.sqrt(gx * gx + gy * gy + g02); // how far inside the outline (px, first order)
        }
        // the shadow each shape gets from those in front of it: deepest under their outlines and fading out
        // beyond them, smoothly (so it reads well between the samples, with no seam along the outline)
        let acc = 0;
        for (let k = n - 1; k >= 0; k--) {
          CS[k * np + at] = acc;
          const s = clamp01((ef[k] + cast) / (cast + cIn)), c = s * s * (3 - 2 * s);
          if (c > acc) acc = c;
        }
      }
    }
    return { FV, GX, GY, E, CS, g, gw, gh, n, np, toPx, inks: sh.map((s) => s.ink) };
  }

  /* ---- paint ------------------------------------------------------------------------------- */
  let pvImg = null;
  function paint({ ctx, W, H, seed, p, colors, t = 0, anim, frame = 0, preview = false, map, transparent = false }) {
    const amount = anim ? Math.max(0, anim.amount) : 0;
    const cw = map ? map.cw : W, ch = map ? map.ch : H;
    const F = field(seed | 0, p, W, H, t, amount, map), { FV, GX, GY, E, CS, g, gw, n, np } = F, nn = n * np;
    const LI = luts(colors), LUT = F.inks.map((i) => LI[i % LI.length]), G = PL.color.hexToRgb(colors[0]);
    if (preview) { if (!pvImg || pvImg.width !== cw || pvImg.height !== ch) pvImg = ctx.createImageData(cw, ch); }
    const img = preview ? pvImg : ctx.createImageData(cw, ch);
    const d8 = img.data;
    const v01 = (k) => clamp01((p[k] ?? DEF[k]) / 100);
    // sizes on the canvas: the grain and the edges' scatter as fine at any export size; the blur zooms with the shapes
    const unit = Math.max(cw, ch) / 1080, gs = Math.max(1, Math.round(unit));
    const fz = K.fuzz * v01('fuzz') * unit, soft = Math.max(0.6, (K.soft * v01('soft') * Math.min(W, H)) / (map ? map.s : 1));
    const band = fz + soft, isoft = 1 / (2 * soft), lev = K.level;
    const gA = K.grain * v01('grain') * 255, gC = gA * K.chroma;
    // Flicker: the grain new every frame of a loop (a still picture keeps frame 1's); else it holds still
    const frames = anim && anim.frames > 0 ? anim.frames : 1, fs = amount > 0 && p.flicker === 'on' ? ((((frame | 0) % frames) + frames) % frames) : 0;
    const salt = Math.imul((seed | 0) ^ 0x5bd1e995, 0x27d4eb2d) ^ Math.imul(fs + 1, 0x165667b1);
    // the light
    const ang = ((p.angle ?? DEF.angle) * Math.PI) / 180, el = (lerp(K.elev[0], K.elev[1], v01('height')) * Math.PI) / 180;
    const lx = Math.sin(ang), ly = -Math.cos(ang); // toward the light, on the picture (y down)
    const Lx = lx * Math.cos(el), Ly = ly * Math.cos(el), Lz = Math.sin(el);
    const amb = lerp(K.amb[0], K.amb[1], v01('shadow')), rimK = v01('glow') * K.rim, specK = v01('glow') * K.spec;
    const castK = K.castK * v01('shadow'), Kr = K.round * F.toPx, toLi = 255 / K.top;
    // A surface's light (0..255, the shape's color scale) from its normal (nx, ny, nz) and the shadow cs on it:
    // lit from the side it faces, its edges glowing as it turns away (the more where they face the light), a
    // shine where the light meets it square, and darkened by the shapes in front.
    const light = (nx, ny, nz, cs) => {
      let dif = nx * Lx + ny * Ly + nz * Lz;
      dif = dif > 0 ? dif : 0;
      const lean = 1 - nz, ol = nx * lx + ny * ly, d2 = dif * dif, d4 = d2 * d2;
      const l = (amb + (1 - amb) * dif + rimK * lean * lean * Math.sqrt(lean) * (0.25 + 0.75 * (ol > 0 ? ol : 0)) + specK * d4 * d4 * d2) * (1 - castK * cs) * toLi;
      return l < 0 ? 0 : l > 255 ? 255 : l;
    };
    // ... from a shape's sum f and slope (gx, gy): lit as a soft dome whose height is the square root of the sum
    // over the outline's level, so it rises steeply at the outline and follows the bumps inside
    const shade = (f, gx, gy, cs) => {
      const r = Kr / Math.sqrt((f > lev ? f - lev : 0) + 1e-4), sx = -gx * r, sy = -gy * r, nz = 1 / Math.sqrt(1 + sx * sx + sy * sy);
      return light(sx * nz, sy * nz, nz, cs);
    };
    // the normal and the light at the samples too
    const NX = buf('NX', Float32Array, nn), NY = buf('NY', Float32Array, nn), NZ = buf('NZ', Float32Array, nn), LT = buf('LT', Float32Array, nn);
    for (let q = 0; q < nn; q++) {
      const f = FV[q], r = Kr / Math.sqrt((f > lev ? f - lev : 0) + 1e-4), sx = -GX[q] * r, sy = -GY[q] * r, nz = 1 / Math.sqrt(1 + sx * sx + sy * sy);
      NX[q] = sx * nz; NY[q] = sy * nz; NZ[q] = nz;
      LT[q] = light(sx * nz, sy * nz, nz, CS[q]);
    }
    // Every grid cell: the shapes to draw there, front to back down to the first that covers all of it (read
    // from the distances at its corners: none of its pixels can stray past them), which of them cover all of
    // it, and where each turns slowly, clear of its outline (its light read between the samples, else worked out
    // pixel by pixel).
    // top: the one shape there, covering it (+32: turning slowly), -1 the ground alone, -2 several.
    const nCx = Math.ceil(cw / g), nCy = Math.ceil(ch / g), nc = nCx * nCy, deep = lev + K.deep;
    const top = buf('top', Int8Array, nc), mP = buf('mP', Uint16Array, nc), mO = buf('mO', Uint16Array, nc), mS = buf('mS', Uint16Array, nc);
    const spread = (A, o) => {
      const a = A[o], b = A[o + 1], c = A[o + gw], d = A[o + gw + 1];
      return Math.max(a, b, c, d) - Math.min(a, b, c, d);
    };
    for (let j = 0; j < nCy; j++) for (let i = 0; i < nCx; i++) {
      const a = j * gw + i, c = j * nCx + i;
      let pm = 0, om = 0, sm = 0;
      for (let k = n - 1; k >= 0; k--) {
        const o = k * np + a, e0 = E[o], e1 = E[o + 1], e2 = E[o + gw], e3 = E[o + gw + 1];
        if (Math.max(e0, e1, e2, e3) <= -band) continue; // not here
        const bit = 1 << k;
        pm |= bit;
        const f0 = FV[o], f1 = FV[o + 1], f2 = FV[o + gw], f3 = FV[o + gw + 1];
        if ((Math.min(f0, f1, f2, f3) >= deep || Math.max(f0, f1, f2, f3) <= lev) && Math.max(spread(NX, o), spread(NY, o), spread(NZ, o)) <= K.turn) sm |= bit;
        if (Math.min(e0, e1, e2, e3) >= band) { om |= bit; break; } // (it covers all of it: the ones behind are hidden)
      }
      mP[c] = pm; mO[c] = om; mS[c] = sm;
      top[c] = !pm ? -1 : pm === om ? 31 - Math.clz32(pm) + (sm ? 32 : 0) : -2;
    }
    const HX = buf('HX', Int32Array, cw);
    for (let x = 0; x < cw; x++) HX[x] = Math.imul(Math.floor(x / gs), 0x9e3779b1);
    // per shape, down a cell's two sides at this row (left, right): its sum, slope x, slope y, shadow, light, distance
    const VL = buf('VL', Float64Array, 12 * n), KS = buf('KS', Int32Array, n);
    const down = (A, q, v, ty) => { VL[v] = A[q] + (A[q + gw] - A[q]) * ty; VL[v + 1] = A[q + 1] + (A[q + gw + 1] - A[q + 1]) * ty; };
    const ig = 1 / g;
    for (let y = 0; y < ch; y++) {
      const j = Math.floor(y * ig), ty = (y + 0.5) * ig - j, row = j * gw, hy = Math.imul(Math.floor(y / gs), 0x85ebca77) ^ salt;
      for (let i = 0; i < nCx; i++) {
        const x0 = i * g, x1 = Math.min(cw, x0 + g), c = j * nCx + i, tp = top[c], a = row + i, pm = mP[c], om = mO[c], sm = mS[c];
        let nk = 0;
        for (let k = n - 1; k >= 0; k--) {
          const bit = 1 << k;
          if (!(pm & bit)) continue;
          KS[nk++] = k;
          const q = k * np + a, v = 12 * k;
          if (sm & bit) down(LT, q, v + 8, ty);
          else { down(FV, q, v, ty); down(GX, q, v + 2, ty); down(GY, q, v + 4, ty); down(CS, q, v + 6, ty); }
          if (!(om & bit)) down(E, q, v + 10, ty);
        }
        let o = (y * cw + x0) * 4;
        for (let x = x0; x < x1; x++, o += 4) {
          const tx = (x - x0 + 0.5) * ig;
          // this pixel's grain: one hash, sliced
          let h = HX[x] + hy;
          h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); h ^= h >>> 15;
          let R, Gc, Bc, al = 1;
          if (tp >= 32) {
            const v = 12 * (tp - 32), li = 3 * ((VL[v + 8] + (VL[v + 9] - VL[v + 8]) * tx) | 0), T = LUT[tp - 32];
            R = T[li]; Gc = T[li + 1]; Bc = T[li + 2];
          } else if (tp >= 0) {
            const v = 12 * tp, T = LUT[tp];
            const li = 3 * (shade(VL[v] + (VL[v + 1] - VL[v]) * tx, VL[v + 2] + (VL[v + 3] - VL[v + 2]) * tx, VL[v + 4] + (VL[v + 5] - VL[v + 4]) * tx, VL[v + 6] + (VL[v + 7] - VL[v + 6]) * tx) | 0);
            R = T[li]; Gc = T[li + 1]; Bc = T[li + 2];
          } else if (tp === -1) {
            R = G[0]; Gc = G[1]; Bc = G[2]; al = 0;
          } else {
            // front to back: each shape's edge, scattered and softened, over what lies behind it
            let tr = 1;
            R = 0; Gc = 0; Bc = 0;
            for (let z = 0; z < nk && tr > 0.004; z++) {
              const k = KS[z], bit = 1 << k, v = 12 * k;
              let w = 1;
              if (!(om & bit)) {
                const e = VL[v + 10] + (VL[v + 11] - VL[v + 10]) * tx; // how far inside the outline (px)
                if (e <= -band) continue;
                let hk = Math.imul(h ^ Math.imul(k + 1, 0x9e3779b9), 0x5bd1e995); hk ^= hk >>> 15; // (a scatter of its own)
                const xi = ((hk & 0xffff) + ((hk >>> 16) & 0xffff)) / 65535 - 1; // -1..1, most near 0
                w = (e + xi * fz) * isoft + 0.5;
                if (w <= 0) continue;
                if (w > 1) w = 1;
              }
              const li = 3 * ((sm & bit ? VL[v + 8] + (VL[v + 9] - VL[v + 8]) * tx
                : shade(VL[v] + (VL[v + 1] - VL[v]) * tx, VL[v + 2] + (VL[v + 3] - VL[v + 2]) * tx, VL[v + 4] + (VL[v + 5] - VL[v + 4]) * tx, VL[v + 6] + (VL[v + 7] - VL[v + 6]) * tx)) | 0);
              const T = LUT[k], cc = tr * w;
              R += cc * T[li]; Gc += cc * T[li + 1]; Bc += cc * T[li + 2];
              tr *= 1 - w;
            }
            al = 1 - tr;
            if (!transparent) { R += tr * G[0]; Gc += tr * G[1]; Bc += tr * G[2]; } // (the ground shows through)
            else if (al > 1e-4) { const ia = 1 / al; R *= ia; Gc *= ia; Bc *= ia; } // (Transparent: the shapes alone, see-through)
          }
          // the grain: a shade over all three channels, stronger in the light, and a little color of its own
          const lum = (R + Gc + Bc) * (1 / 765), s1 = ((h & 0xff) + ((h >>> 8) & 0xff)) / 255 - 1;
          const amp = gA * (0.3 + 0.7 * lum), d = s1 * amp;
          d8[o] = R + d + ((((h >>> 16) & 0x3f) / 31.5) - 1) * gC * lum;
          d8[o + 1] = Gc + d + ((((h >>> 22) & 0x3f) / 31.5) - 1) * gC * lum;
          d8[o + 2] = Bc + d + ((((h >>> 26) & 0x3f) / 31.5) - 1) * gC * lum;
          d8[o + 3] = transparent ? al * 255 : 255;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    return { status: `${n} shape${n === 1 ? '' : 's'} · ${p.form === 'hills' ? 'Hills' : 'Lobes'}` };
  }

  PL.tools.register({
    id: 'fuzz',
    name: 'Fuzz',
    kind: 'Organic',
    tagline: 'Grainy glow',
    about: 'Big soft shapes glowing in the dark, laid one over another: each lit like a soft dome, its edges shining in the light and its far side sinking into shadow, its outline hairy with grain, all of it under a heavy colored grain. In the animation the shapes roll and breathe under the grain.',
    raster: true,
    inks: {
      min: 3, max: 8, roles, fit, spec, add, generate,
      span: () => 2, // Invert swaps the ground and the glow
      hint: 'Ground, then the glow (the light on every edge), then the shapes, dealt out to them in turn.',
    },
    palettes: PALETTES,
    params: PARAMS,
    animHint: 'How far the shapes roll and breathe over a loop (0: still)',
    defaults: {
      palette: 'Ember', // the preset the style opens on (its card's colors)
      anim: { amount: 1, fps: 24, frames: 192 }, // an 8 s loop
      fx: {},
    },
    paint,
    zoom: true, // paints any part of its world (General's Rotation and Size)
    _K: K,
    _layout: layout,
    _field: field,
  });
})();
