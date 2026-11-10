/* ==========================================================================
   tools/dahlia.js — Dahlia: burst posters.

   1. Rays fan out from a centre you can place anywhere (Centre across /
      down). Size sets the reach and Ragged cuts the rays to uneven lengths.
   2. Every ray is a row of short dashes, evenly spaced. A dash's width grows
      with its distance from the centre, like strokes rushing toward you:
      thin spokes at the heart, fat capsules at the rim.
   3. Stacked inks: each dash is printed as a little stack — the side inks a
      touch to either side, the stroke ink on top — so every stroke reads as
      a chunky 3D tube. Most dashes are capped with a bead at their outer end.
   4. Animation: the dashes stream outward along their rays, growing as they
      go, and shrink away when they reach the end of their ray. Exactly one
      dash spacing per loop (at Amount 0.6), so the loop is seamless.
   Print grain (Multiply) holds still on top, like ink on paper.
   ========================================================================== */
(() => {
  const { hash } = PL.rng;

  // Ground, stroke ink, the side inks of the stack, then the bead accent.
  const PALETTES = [
    { name: 'Garden', colors: ['#152112', '#C0D673', '#A2A13E', '#EFB088', '#DD4140'] },
    { name: 'Ember', colors: ['#1A1210', '#F2C14E', '#B5562B', '#F7E1B5', '#E03E36'] },
    { name: 'Lagoon', colors: ['#0B1D26', '#7ED6C9', '#2F7F8C', '#E9F2E6', '#F25C54'] },
    { name: 'Orchid', colors: ['#1B1023', '#D9A8F0', '#8A4BB5', '#FFD9EA', '#FF4F79'] },
    { name: 'Citrus', colors: ['#132018', '#F4D35E', '#C9772F', '#FAF0CA', '#F95738'] },
    { name: 'Night', colors: ['#0E1116', '#9DB4FF', '#4F5FA8', '#E6E9FF', '#FFC145'] },
    { name: 'Triad', colors: ['#F6F1E7', '#193990', '#E8605B', '#6DBA70', '#FFBEB8'] }, // triad 265/25/145: strokes, then the side inks; beads a tint of 25
    { name: 'Paper', colors: ['#EFE8DA', '#2B2D42', '#7D8597', '#D9DDE3', '#D90429'] },
    { name: 'Mono', colors: ['#121212', '#EEECE6', '#77756F', '#BAB8B2', '#FF4D2E'] },
    { name: 'Duo', colors: ['#14161B', '#F2E8CF', '#E63946'] },
    { name: 'Peony', colors: ['#FCE9EA', '#6B1346', '#E06C94', '#9DC494'] }, // rose and sage on a blush ground, deep magenta strokes
  ];

  /* ---- color roles ------------------------------------------------------------
     2 inks: ground, strokes (beads in the stroke ink) · 3: ground, strokes, beads
     4+:     ground, strokes, side inks of the stack, beads                        */
  function slots(n) {
    if (n <= 2) return { ground: 0, body: 1, sides: [], bead: 1 };
    return { ground: 0, body: 1, sides: Array.from({ length: n - 3 }, (_, i) => 2 + i), bead: n - 1 };
  }
  const SIDE_NAMES = ['Side A', 'Side B', 'Side C', 'Side D', 'Side E'];
  function roles(n) {
    if (n <= 2) return ['Ground', 'Strokes'];
    const ns = n - 3;
    return ['Ground', 'Strokes', ...Array.from({ length: ns }, (_, i) => (ns === 1 ? 'Side' : SIDE_NAMES[i])), 'Beads'];
  }
  const spec = (n) => (n <= 2 ? { ramp: 1, accents: 0 } : { ramp: Math.max(1, n - 2), accents: 1 });

  // Side k sits on alternate sides of the stroke, further out every two inks.
  const sideOffset = (k) => (k % 2 === 0 ? 1 : -1) * (1 + (k >> 1));

  // "New colors": a deep ground, a light stroke ink, a shadow side (same hue,
  // darker), a light side (warm tint), and a bead from across the wheel.
  function generate(n, rng) {
    const C = PL.color;
    const dark = rng.chance(0.8);
    const h = rng.float(0, 360);
    const ground = dark ? C.lch(rng.float(0.13, 0.2), rng.float(0.02, 0.05), h + rng.float(-20, 20)) : C.lch(rng.float(0.93, 0.96), rng.float(0.01, 0.03), rng.float(60, 100));
    const ch = rng.float(0.09, 0.16);
    const body = C.lch(dark ? rng.float(0.78, 0.88) : rng.float(0.42, 0.55), ch, h);
    const shadow = C.lch(dark ? rng.float(0.6, 0.68) : rng.float(0.3, 0.38), ch * 0.9, h - rng.float(5, 25));
    const light = C.lch(dark ? rng.float(0.8, 0.88) : rng.float(0.78, 0.86), rng.float(0.06, 0.1), h + rng.pick([150, 180, 210, -90]));
    const bead = C.lch(dark ? rng.float(0.56, 0.66) : rng.float(0.5, 0.6), rng.float(0.17, 0.22), h + rng.pick([150, 180, 200, 230]));
    if (n <= 2) return [ground, body];
    if (n === 3) return [ground, body, bead];
    const sides = [shadow, light];
    while (sides.length < n - 3) sides.push(C.mix(sides[sides.length - 2], ground, 0.25));
    return [ground, body, ...sides.slice(0, n - 3), bead];
  }

  const isLight = (hex) => PL.color.luminance(hex) > 0.35;

  // + adds a side ink just before the beads (a shadow first, then a highlight, ...).
  function add(colors) {
    const C = PL.color;
    const c = colors.slice();
    const n = c.length;
    if (n <= 2) {
      const [, , hue] = C.hexToLch(c[1] || '#C0D673');
      c.push(C.lch(isLight(c[0]) ? 0.5 : 0.62, 0.19, hue + 180));
      return c;
    }
    const body = c[1], k = n - 3; // index of the new side
    const next = k % 2 === 0
      ? C.mix(body, isLight(c[0]) ? '#FFFFFF' : '#000000', 0.28 + 0.1 * (k >> 1))   // shadow side
      : C.mix(body, isLight(c[0]) ? '#000000' : '#FFF4E8', 0.45 + 0.1 * (k >> 1));  // light side
    c.splice(n - 1, 0, next);
    return c;
  }

  function fit(colors, n) {
    const C = PL.color;
    let c = (colors || []).map(C.normHex).filter(Boolean);
    if (!c.length) c = PALETTES[0].colors.slice();
    if (c.length === 1) c.push(C.mix(c[0], isLight(c[0]) ? '#000000' : '#FFFFFF', 0.8));
    if (c.length === n) return c;
    if (c.length > n) {
      if (n <= 2) return [c[0], c[1]];
      return [...c.slice(0, n - 1), c[c.length - 1]];
    }
    while (c.length < n) c = add(c);
    return c;
  }

  const S = (section, key, label, min, max, def, extra = {}) => ({ section, key, label, type: 'range', min, max, def, step: 1, ...extra });

  const PARAMS = [
    S('Burst', 'rays', 'Rays', 12, 300, 160, { rand: [100, 170], hint: 'How many rays fan out from the centre' }),
    S('Burst', 'size', 'Size', 20, 150, 85, { unit: '%', rand: [60, 93], hint: 'How far the rays reach' }),
    S('Burst', 'ragged', 'Ragged', 0, 100, 40, { unit: '%', rand: [25, 65], hint: 'How uneven the ray lengths are' }),
    S('Burst', 'cx', 'Centre across', 0, 100, 50, { unit: '%', rand: [42, 58], hint: 'Where the centre sits, left to right' }),
    S('Burst', 'cy', 'Centre down', 0, 100, 50, { unit: '%', rand: [42, 60], hint: 'Where the centre sits, top to bottom' }),
    S('Strokes', 'width', 'Width', 5, 100, 60, { unit: '%', rand: [50, 70], hint: 'How fat the strokes grow toward the rim' }),
    S('Strokes', 'dash', 'Dash', 20, 100, 50, { unit: '%', rand: [40, 60], hint: 'Length of each dash' }),
    S('Strokes', 'gap', 'Gap', 0, 100, 40, { unit: '%', rand: [30, 50], hint: 'Space between dashes along a ray' }),
    S('Strokes', 'bend', 'Bend', 0, 100, 30, { unit: '%', rand: [20, 40], hint: 'How much each ray curves (every ray its own way)' }),
    S('Strokes', 'beads', 'Beads', 0, 100, 80, { unit: '%', rand: [70, 92], hint: 'Share of rays whose dashes end in a bead' }),
  ];

  // Shape constants (lengths in units of the frame's short edge unless noted;
  // "x" = position along the burst, 0 at the centre and 1 at the full reach).
  const K = {
    reach: 0.72,     // longest ray at Size 100 %
    size0: 0.5,      // share of the reach that doesn't depend on Size
    clump: 0.55,     // share of the raggedness shared by neighbouring rays (clumps of long / short rays)
    lobes: 2.2,      // how many such clumps around the burst
    ragPow: 1,       // > 1 keeps more rays long
    inner: 0.1,      // rays start between the centre and this share of their length
    r0: 0.004,       // the closest a ray starts to the centre
    l0: 0.03, l1: 0.05, // dash length at Dash 50 %: l0 + l1 * x (dashes lengthen outward)
    pVar: 0.35,      // per-ray spread of the dash spacing (rays drift at slightly different speeds)
    fVar: 0.5,       // per-ray spread of the dash length
    gap: 0.65,       // gap at Gap 40 %, relative to the dash length
    h0: 0.0026, h1: 0.0112, // stroke half-width at Width 60 % and 160 rays: h0 + h1 * x
    wVar: 0.4,       // per-ray width spread
    rayPow: 0.6,     // stroke width ~ (160 / Rays) ^ rayPow
    side: 0.75,      // side inks' offset (x stroke half-width)
    b0: 0.0042, b1: 0.0168, // bead radius at Width 60 % and 160 rays: b0 + b1 * x
    bVar: 0.3,       // per-ray bead size spread
    bend: 0.5,       // radians a ray turns by its full length at Bend 30 % (each ray its own way)
    fadeIn: 0.45,    // dashes grow in over this share of a dash spacing at the start of their ray
    fadeOut: 0.4,    // ... and shrink away over this share past its end
    groups: 8,       // rays are layered in this many interleaved groups
    sideFront: 1,    // of the groups, this many print a side ink in front of the stroke ink
  };

  function build({ W, H, seed, p, colors, t = 0, anim }) {
    const n = colors.length;
    const sl = slots(n);
    const scene = new PL.Scene(W, H, colors[sl.ground], sl.ground);
    const names = roles(n);
    const ns = sl.sides.length;
    // Within a stack: the outermost sides first, then the front ink, then the bead.
    const byDepth = sl.sides.map((ci, k) => k).sort((a, b) => Math.abs(sideOffset(b)) - Math.abs(sideOffset(a)) || sideOffset(a) - sideOffset(b));
    const G = K.groups;
    const groups = [];
    for (let g = 0; g < G; g++) {
      // Most groups print the stroke ink in front; a few put a side ink in front instead.
      const front = ns > 0 && g >= G - Math.min(K.sideFront, G - 1) ? (ns > 1 ? (1 + g - (G - K.sideFront)) % 2 : 0) : -1;
      const layers = { sides: [], body: null, bead: null };
      for (const k of byDepth) if (k !== front) layers.sides[k] = scene.layer(`g${g}-side${k}`, colors[sl.sides[k]], `${names[2 + k]} ${g + 1}`, sl.sides[k]);
      layers.body = scene.layer(`g${g}-body`, colors[sl.body], `Strokes ${g + 1}`, sl.body);
      if (front >= 0) layers.sides[front] = scene.layer(`g${g}-side${front}`, colors[sl.sides[front]], `${names[2 + front]} ${g + 1}`, sl.sides[front]);
      layers.bead = n <= 2 ? layers.body : scene.layer(`g${g}-bead`, colors[sl.bead], `Beads ${g + 1}`, sl.bead);
      groups.push(layers);
    }

    const Sm = Math.min(W, H);
    const cx = (p.cx / 100) * W, cy = (p.cy / 100) * H;
    const R = Math.max(1e-6, (K.size0 + (1 - K.size0) * (p.size / 100)) * K.reach * Sm);
    const N = Math.max(3, Math.round(p.rays));
    // Strokes thin out a little as rays get denser (more rays = finer strokes).
    const wk = (p.width / 60) * Math.pow(160 / N, K.rayPow);
    const dk = p.dash / 50, gk = (p.gap / 40) * K.gap;
    const Pf = Math.max(1e-3, dk + gk); // period (dash + gap) relative to the base length
    const fill = dk / Pf;               // share of each period that is a dash
    const rag = p.ragged / 100;
    const beadP = Math.pow(p.beads / 100, 0.6); // share of rays with beads (80 % -> ~9 in 10)
    const bend = (p.bend / 30) * K.bend;
    const r0 = K.r0 * Sm;
    const kU = (Sm * Pf * K.l1) / R;    // u(r) = ln(A(r) / A(start)) / kU, A(r) = l0 + l1 r / R
    const smooth = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

    const amt = Math.max(0, anim ? anim.amount : 0);
    const flow = Math.round(amt * 1.67) * t; // whole dash spacings per loop: seamless
    const rnd = PL.rng.create(seed ^ 0x1b873593);
    const base = rnd.float(0, Math.PI * 2);
    const Nz = PL.noise.get(seed ^ 0x5f3759df);

    const capsule = PL.Scene.capsule; // a tapered, round-ended stroke from A to B

    for (let i = 0; i < N; i++) {
      // Rays scatter freely around the burst, so they bunch up and leave dark slits.
      const th0 = base + 2 * Math.PI * hash(i, seed, 1, 0);
      // Ragged: part shared by neighbouring rays (clumps of long and short rays), part per ray.
      const lobe = 0.5 + 0.5 * Nz.noise4(Math.cos(th0) * K.lobes, Math.sin(th0) * K.lobes, 1.3, 0.4);
      const len = R * (1 - rag * Math.pow(Math.min(1, K.clump * lobe * 1.25 + (1 - K.clump) * hash(i, seed, 2, 0)), K.ragPow));
      const start = Math.max(r0, len * K.inner * Math.pow(hash(i, seed, 7, 0), 1.6));
      if (len <= start) continue;
      const turn = bend * (2 * hash(i, seed, 11, 0) - 1); // each ray curls its own way
      const grp = groups[Math.floor(hash(i, seed, 3, 0) * G) % G];
      const wr = wk * (1 + K.wVar * (hash(i, seed, 8, 0) - 0.5));
      const br = wk * (1 + K.bVar * (hash(i, seed, 5, 0) - 0.5));
      const hasBead = hash(i, seed, 4, 0) < beadP;
      const ph = hash(i, seed, 6, 0);
      // Each ray has its own dash spacing and length (its own whole-spacing flow keeps the loop seamless).
      const kUi = kU * (1 + K.pVar * (hash(i, seed, 9, 0) - 0.5));
      const fl = Math.min(0.92, Math.max(0.12, fill * (1 + K.fVar * (hash(i, seed, 10, 0) - 0.5))));
      const A0 = K.l0 + (K.l1 * start) / R;
      const uEnd = Math.log((K.l0 + (K.l1 * len) / R) / A0) / kUi;
      const rOf = (u) => ((A0 * Math.exp(u * kUi) - K.l0) * R) / K.l1;
      const pt = (r) => {
        const a = th0 + turn * (r / R) * (r / R);
        return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
      };
      // Dash k covers u in [k + ph + flow, k + ph + flow + fill]; u = 0 is the ray's start.
      for (let k = Math.floor(-(ph + flow)) - 1; ; k++) {
        const ua = k + ph + flow, ub = ua + fl;
        if (ua > uEnd + K.fadeOut) break;
        if (ub <= 0) continue;
        const um = (ua + ub) / 2;
        // Grow in at the start of the ray, shrink away past its end (length and width alike).
        const f = smooth(-fl / 2, K.fadeIn, um) * (1 - smooth(uEnd, uEnd + K.fadeOut, um));
        if (f <= 0.02) continue;
        const half = (fl / 2) * f;
        const ra = rOf(Math.max(0, um - half)), rb = rOf(um + half);
        const xa = ra / R, xb = rb / R;
        const ha = Sm * (K.h0 + K.h1 * xa) * wr * f, hb = Sm * (K.h0 + K.h1 * xb) * wr * f;
        const [ax, ay] = pt(ra), [bx, by] = pt(rb);
        const dx = bx - ax, dy = by - ay, dl = Math.hypot(dx, dy) || 1;
        const vx = -dy / dl, vy = dx / dl; // clockwise side of the stroke
        for (let kk = 0; kk < ns; kk++) {
          const o = sideOffset(kk) * K.side;
          capsule(grp.sides[kk], ax + vx * o * ha, ay + vy * o * ha, ha, bx + vx * o * hb, by + vy * o * hb, hb);
        }
        capsule(grp.body, ax, ay, ha, bx, by, hb);
        if (hasBead) grp.bead.c.push(bx, by, Sm * (K.b0 + K.b1 * xb) * br * f);
      }
    }
    return scene;
  }

  PL.tools.register({
    id: 'dahlia',
    name: 'Dahlia',
    kind: 'Backgrounds',
    tagline: 'Burst posters',
    about: 'Rays of short dashes burst from a centre and grow as they reach the rim, each dash printed as a stack of offset inks and capped with a bead, under print grain.',
    inks: {
      min: 2, max: 8, roles, fit, spec, add, generate,
      span: () => 2, // Invert swaps the ground and the stroke ink
      hint: 'Order sets the role: ground, strokes, the side inks of each stack, then the beads.',
    },
    palettes: PALETTES,
    params: PARAMS,
    defaults: {
      anim: { amount: 0.6, fps: 12, frames: 36 },
      fx: { grainOn: true, grainBlend: 'multiply', grain: 22, grainSize: 1, grainSpecks: 50, vignette: 15 },
    },
    build,
    zoom: true, // one burst, every ray drawn whole: zoomed out, more of the ground round it (General's Rotation and Size)
    stillGrain: true, // print grain sits in the paper: it holds still while the dashes stream out
    _K: K,
  });
})();
