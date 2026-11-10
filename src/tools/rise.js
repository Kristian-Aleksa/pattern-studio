/* ==========================================================================
   tools/rise.js — Rise: stripe arcs.

   1. Stripes: vertical stripes in the first ink over the base, Weight of each
      stripe + gap. One stripe is centred on the frame's middle, so the
      pattern is symmetric. Stripes counts across the frame's short side.
   2. Bands: nested circles around the anchor (an edge's midpoint or the
      centre; Auto picks an edge for each variation). Ring k (0 = innermost)
      has radius Depth x (k + 0.8) of the frame's short side. Inside each ring
      the stripes run on, but in another pair of colors, so ground and stripe
      trade places from ring to ring. The pairs follow a fixed order from the
      middle out: each ring takes the next ink as its ground and stripes in a
      color one further round the palette, until every pairing has been used.
      With the default three colors (cream, yellow, purple) that gives
      yellow/purple, purple/cream, yellow/cream, purple/yellow, then again.
   3. Every edge is exact: true arcs, and stripe sides on whole pixels, so
      neighbouring colors meet cleanly with no hairline seams.
   4. Animation: each ring's radius swings in and out once per loop
      (Intensity x 0.3 x Depth), each ring 0.35 of a loop behind the one inside
      it, so a smooth wave keeps rising out from the anchor. Seamless.
   ========================================================================== */
(() => {
  const { hash } = PL.rng;

  // Base (the ground outside the arcs), then the inks. The default look's colors first.
  const PALETTES = [
    { name: 'Sunrise', colors: ['#EAE5C6', '#F9D536', '#2C115B'] },
    { name: 'Poppy', colors: ['#F3EDE2', '#F25C3B', '#1E2A5A'] },
    { name: 'Lagoon', colors: ['#E6F2EE', '#3CC6A8', '#0E3B43'] },
    { name: 'Blush', colors: ['#F7E9E4', '#F2A7B5', '#5B1E3F'] },
    { name: 'Night', colors: ['#16132A', '#F7C948', '#ECE6D6'] },
    { name: 'Split', colors: ['#FAEDD5', '#0092C5', '#4C338B'] }, // split complement of the base 82: inks at 232 and 292
    { name: 'Lavender', colors: ['#F0ECFA', '#AE96DA', '#84AB7B', '#481E52'] },
    { name: 'Harbor', colors: ['#EEF3F7', '#7CC6FE', '#2B59C3', '#0B1D51'] },
    { name: 'Ember', colors: ['#F6EFE6', '#FFB703', '#FB8500', '#D62828', '#2B2D42'] },
    { name: 'Mono', colors: ['#F2F2EE', '#BDBDB8', '#1C1C1C'] },
    { name: 'Duo', colors: ['#F1EBDD', '#E4572E'] },
  ];

  /* ---- color roles ---------------------------------------------------------------- */
  const roles = (n) => ['Base', ...Array.from({ length: n - 1 }, (_, i) => (n === 2 ? 'Ink' : 'Ink ' + (i + 1)))];
  const spec = (n) => ({ ramp: 1, accents: Math.max(1, n - 1) });
  const isLight = (hex) => PL.color.luminance(hex) > 0.35;

  // "New colors": a pale (now and then a deep) base, a bright first ink and a deep second
  // one in a contrasting hue (on a deep base: a bright ink and a pale one), then mid inks.
  function generate(n, rng) {
    const C = PL.color;
    const dark = rng.chance(0.22);
    const h1 = rng.float(0, 360), h2 = h1 + rng.float(120, 220);
    const out = [dark
      ? C.lch(rng.float(0.17, 0.23), rng.float(0.03, 0.07), h2 + rng.float(-30, 30))
      : C.lch(rng.float(0.92, 0.96), rng.float(0.02, 0.045), h1 + rng.float(-25, 25))];
    out.push(C.lch(rng.float(0.8, 0.88), rng.float(0.15, 0.2), h1));
    if (n > 2) out.push(dark ? C.lch(rng.float(0.9, 0.95), rng.float(0.02, 0.05), h1 + rng.float(-20, 20)) : C.lch(rng.float(0.24, 0.34), rng.float(0.12, 0.17), h2));
    for (let i = 3; i < n; i++) out.push(C.lch(rng.float(0.55, 0.72), rng.float(0.13, 0.19), h1 + 70 + (i - 3) * 95 + rng.float(-15, 15)));
    return out;
  }

  // + adds an ink in a hue the palette doesn't have yet, at a middle lightness.
  function add(colors) {
    const C = PL.color;
    const c = colors.slice();
    const hues = c.slice(1).map((x) => C.hexToLch(x)[2]);
    let best = 0, bd = -1;
    for (let h = 0; h < 360; h += 10) {
      const d = hues.length ? Math.min(...hues.map((x) => Math.abs((((h - x) % 360) + 540) % 360 - 180))) : 180;
      if (d > bd) { bd = d; best = h; }
    }
    c.push(C.lch(isLight(c[0]) ? 0.62 : 0.72, 0.16, best));
    return c;
  }

  function fit(colors, n) {
    let c = (colors || []).map(PL.color.normHex).filter(Boolean);
    if (!c.length) c = PALETTES[0].colors.slice();
    if (c.length === 1) c.push(PL.color.mix(c[0], isLight(c[0]) ? '#000000' : '#FFFFFF', 0.75));
    if (c.length >= n) return c.slice(0, n);
    while (c.length < n) c = add(c);
    return c;
  }

  // (ground, stripes) for ring k, counting from the innermost. Outside the rings: (base, ink 1).
  function bandPair(k, B, n) {
    if (n <= 2) return (B - 1 - k) % 2 === 0 ? [1, 0] : [0, 1]; // two colors: swap ring by ring
    const m = n - 1;
    const g = 1 + (k % m), o = 1 + (Math.floor(k / m) % (n - 1));
    return [g, (g + o) % n];
  }

  const ANCHORS = { bottom: [0.5, 1], top: [0.5, 0], left: [0, 0.5], right: [1, 0.5], centre: [0.5, 0.5] };
  // Auto: an edge for each variation, the bottom most often.
  function anchorOf(seed, a) {
    if (ANCHORS[a]) return a;
    const u = hash(seed, 0x415e, 7, 3);
    return u < 0.4 ? 'bottom' : u < 0.6 ? 'right' : u < 0.8 ? 'top' : 'left';
  }

  const S = (section, key, label, min, max, def, extra = {}) => ({ section, key, label, type: 'range', min, max, def, step: 1, ...extra });
  const PARAMS = [
    { section: 'Artwork', key: 'anchor', label: 'Anchor', type: 'select', def: 'auto', rand: false,
      options: [{ value: 'auto', label: 'Auto' }, { value: 'bottom', label: 'Bottom' }, { value: 'top', label: 'Top' },
        { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }, { value: 'centre', label: 'Centre' }] },
    S('Artwork', 'stripes', 'Stripes', 6, 28, 16, { randChoices: [10, 12, 14, 16, 18, 20, 22], hint: 'Stripes across the frame (across the short side of a wide or tall frame)' }),
    S('Artwork', 'weight', 'Weight', 30, 70, 42, { unit: '%', randChoices: [42, 50, 58], hint: 'How wide each stripe is, as a share of stripe + gap' }),
    S('Artwork', 'bands', 'Bands', 1, 8, 3, { randChoices: [3, 4, 5], hint: 'How many arcs' }),
    S('Artwork', 'depth', 'Depth', 10, 40, 18, { unit: '%', rand: [18, 32], hint: 'Spacing of the arcs, as a share of the frame' }),
  ];

  const K = {
    r0: 0.8,        // ring k sits at Depth x (k + r0)
    lag: 0.35,      // each ring swings this much of a loop behind the one inside it
    ampK: 0.3,      // swing: Intensity x this x Depth
    ampMax: 0.53,   // ... at most this x Depth, so neighbouring rings never cross
  };

  /* ---- build ------------------------------------------------------------------------ */
  // region (General's Rotation and Size): the part of the world to cover; the stripes run on past the
  // frame and the arcs are whole circles round the anchor, so zooming out shows more of the same picture.
  function build({ W, H, seed, p, colors, t = 0, anim, region }) {
    const R = region || { x0: 0, y0: 0, x1: W, y1: H };
    const n = colors.length;
    const scene = new PL.Scene(W, H, colors[0], 0);
    const Sd = Math.min(W, H);
    const N = Math.max(1, Math.round(p.stripes)), B = Math.max(1, Math.round(p.bands));
    const anchor = anchorOf(seed, p.anchor);
    const cx = ANCHORS[anchor][0] * W, cy = ANCHORS[anchor][1] * H;

    // Stripe and gap intervals across the region, sides on whole pixels (crisp, seamless).
    const pitch = Sd / N, half = (Math.min(70, Math.max(30, p.weight)) / 100) * pitch * 0.5;
    const xc0 = W / 2 - (N / 2) * pitch; // a stripe centre: x = 0 on a square frame
    const j0 = Math.floor((R.x0 - half - xc0) / pitch) - 1, j1 = Math.ceil((R.x1 + half - xc0) / pitch) + 1;
    const stripes = [], gaps = [];
    const zs = region && region.z > 1 ? region.z : 1; // output pixels to a frame pixel: the sides land on whole output pixels
    let x = R.x0;
    for (let j = j0; j <= j1; j++) {
      const c = xc0 + j * pitch;
      const a = Math.max(R.x0, Math.round((c - half) * zs) / zs), b = Math.min(R.x1, Math.round((c + half) * zs) / zs);
      if (b <= a) continue;
      if (a > x) gaps.push([x, a]);
      stripes.push([a, b]);
      x = Math.max(x, b);
    }
    if (x < R.x1) gaps.push([x, R.x1]);

    // Ring radii: Depth x (k + 0.8), each swinging in and out once a loop, in a wave outwards.
    const d = Math.min(40, Math.max(10, p.depth)) / 100;
    const amp = Math.min(K.ampK * Math.max(0, anim ? anim.amount : 0), K.ampMax);
    const tt = ((t % 1) + 1) % 1;
    const radius = (k) => Sd * d * (k + K.r0 + amp * Math.sin(2 * Math.PI * (tt - K.lag * k)));

    const outside = scene.layer('stripes', colors[1], 'Stripes', 1);
    for (const [a, b] of stripes) PL.Scene.rect(outside, a, R.y0, b - a, R.y1 - R.y0);
    for (let k = B - 1; k >= 0; k--) {
      const [g, s] = bandPair(k, B, n);
      const r = radius(k);
      const LG = scene.layer('band-' + (k + 1), colors[g], 'Band ' + (k + 1), g);
      const LS = scene.layer('band-' + (k + 1) + '-stripes', colors[s], 'Band ' + (k + 1) + ' stripes', s);
      for (const [a, b] of gaps) PL.Scene.slice(LG, a, b, cx, cy, r);
      for (const [a, b] of stripes) PL.Scene.slice(LS, a, b, cx, cy, r);
    }
    scene.status = `${B} band${B > 1 ? 's' : ''} · ${N} stripes · ${anchor}`;
    return scene;
  }

  PL.tools.register({
    id: 'rise',
    name: 'Rise',
    kind: 'Backgrounds',
    tagline: 'Stripe arcs',
    about: 'Vertical stripes with nested arcs rising from an edge or the centre; inside each arc the stripe and ground colors trade places. In the animation the arcs swell and settle in a smooth wave that rises out from the anchor.',
    inks: {
      min: 2, max: 6, roles, fit, spec, add, generate,
      span: (n) => n, // Invert reverses the whole palette (a deep base, a pale last ink)
      hint: 'Base first (the ground outside the arcs), then the inks. The arcs trade these colors around in a fixed order.',
    },
    palettes: PALETTES,
    params: PARAMS,
    animLabel: 'Intensity',
    animHint: 'How far the arcs swell and settle as the wave rises through them (0: still)',
    defaults: {
      anim: { amount: 0.8, fps: 12, frames: 72 },
      fx: {},
    },
    build,
    zoom: true, // draws any region of its world (General's Rotation and Size)
    _K: K,
    _anchorOf: anchorOf,
    _bandPair: bandPair,
  });
})();
