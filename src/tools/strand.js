/* ==========================================================================
   tools/strand.js — Strand: rod chains (pixel texture: PNG, video).

   1. Chains: Chains strands of rods start in and around the frame, each with
      its own heading, and grow Length rods end to end along a path whose
      heading drifts as it goes (Wander: 0 straight, 100 curling, with sharp
      kinks), turning back at a box a few times the frame's size, so long
      strands come round again. At each joint a strand may fork (Branching);
      the forks share the strand's rods, so a bushy strand stays compact.
      Positions go with the frame (a share of its width and height), sizes
      with its area: another frame shape crops or extends the same picture.
   2. Rods: each rod is a rectangle along its stretch of the path. Thickness
      sets its width (and with it the whole rod and its spacing), Rod length
      its length (0: round lumps), Notch the gap cut at every joint (0: the
      rods run together into smooth worms), Roughness how far its outline is
      torn: rounder corners, lumps and a fine ragged edge (0: crisp
      rectangles).
   3. Print: a second, pale plate prints the same shapes Plate spread wider
      (a share of the rods' width), shifted Off-register down and to the left
      (a share of the frame), under the ink. The ink is
      printed with a texture in the ground's colour, heavier toward the
      rods' edges: Stipple (square specks), Drag (short streaks) or Screen
      (a halftone dot screen); Coverage sets how much. Grain: a fine grain
      over everything that stays put.
   General's Size and Rotation show more or less of the same world: the
   frame's box is the frame's own picture, and past its walls the plane is cut
   into boxes like it, each with strands of its own (never a repeat). The
   rods' outlines, the plate and the textures are the world's; the grain
   stays one speck per pixel and the edges stay a pixel soft at any Size.
   4. Animation: a slow wave runs along every strand, so its rods sway from
      side to side and settle back (the layout itself stays put); the plate
      moves with them, the textures and the grain stay with the paper.
      Seamless; Intensity sets how far (0: still). Strand opens at 2.00, the
      strongest sway (its previews too).
   ========================================================================== */
(() => {
  const { hash } = PL.rng;

  // Ground, plate, then the ink(s). The default look's colours first.
  const PALETTES = [
    { name: 'Strand', colors: ['#1C2F18', '#F4FAF6', '#55FE86'] },
    { name: 'Complement', colors: ['#FAEEE3', '#003659', '#F59926'] }, // complement 245/65: deep blue plate, amber ink
    { name: 'Ember', colors: ['#21110C', '#FFF1DF', '#FF8A2A'] },
    { name: 'Ocean', colors: ['#0A1C33', '#EAF3F8', '#38D5F5'] },
    { name: 'Grape', colors: ['#1A1030', '#F4EEFF', '#B784FF'] },
    { name: 'Paper', colors: ['#EEE8DA', '#C9BFA8', '#1D1C1A'] },
    { name: 'Lime', colors: ['#14151A', '#F3F1E8', '#D7F542'] },
    { name: 'Rose', colors: ['#2A0F1C', '#FFE9F0', '#FF5C8A'] },
    { name: 'Teal', colors: ['#062A2B', '#E6F7F3', '#FF7B54'] },
    { name: 'Mono', colors: ['#121212', '#F2F2F0', '#9C9C9A'] },
  ];

  /* ---- colour roles -------------------------------------------------------------------- */
  const roles = (n) => ['Ground', 'Plate', ...(n === 3 ? ['Ink'] : Array.from({ length: n - 2 }, (_, i) => 'Ink ' + (i + 1)))];
  const spec = (n) => ({ ramp: 1, accents: Math.max(1, n - 2) });

  // "New colors": a deep ground, a pale plate in its hue, and vivid inks round the colour wheel
  // (now and then a light paper ground with a dark plate).
  function generate(n, rng) {
    const C = PL.color;
    const h0 = rng.float(0, 360);
    const light = rng.chance(0.2);
    const out = light
      ? [C.lch(rng.float(0.92, 0.96), rng.float(0.01, 0.03), h0), C.lch(rng.float(0.22, 0.3), rng.float(0.04, 0.08), h0 + rng.float(-30, 30))]
      : [C.lch(rng.float(0.13, 0.2), rng.float(0.03, 0.06), h0), C.lch(rng.float(0.96, 0.985), rng.float(0.005, 0.02), h0)];
    const dir = rng.sign();
    for (let i = 0; i < n - 2; i++) out.push(C.lch(rng.float(0.72, 0.88), rng.float(0.16, 0.24), h0 + dir * (rng.float(-25, 25) + i * rng.float(50, 80))));
    return out;
  }

  // + adds an ink in a hue the palette doesn't have yet.
  function add(colors) {
    const C = PL.color;
    const c = colors.slice();
    const hues = c.filter((x) => C.hexToLch(x)[1] > 0.04).map((x) => C.hexToLch(x)[2]);
    let best = 0, bd = -1;
    for (let h = 0; h < 360; h += 10) {
      const d = hues.length ? Math.min(...hues.map((x) => Math.abs((((h - x) % 360) + 540) % 360 - 180))) : 180;
      if (d > bd) { bd = d; best = h; }
    }
    c.push(C.lch(0.8, 0.2, best));
    return c;
  }

  function fit(colors, n) {
    let c = (colors || []).map(PL.color.normHex).filter(Boolean);
    if (!c.length) c = PALETTES[0].colors.slice();
    if (c.length === 1) c.push(PL.color.mix(c[0], PL.color.luminance(c[0]) > 0.35 ? '#000000' : '#FFFFFF', 0.92));
    if (c.length >= n) return c.slice(0, n);
    while (c.length < n) c = add(c);
    return c;
  }

  /* ---- settings -------------------------------------------------------------------------- */
  const S = (section, key, label, min, max, def, extra = {}) => ({ section, key, label, type: 'range', min, max, def, step: 1, ...extra });
  const PARAMS = [
    S('Chains', 'chains', 'Chains', 1, 40, 8, { rand: [5, 13], hint: 'How many strands of rods' }),
    S('Chains', 'length', 'Length', 3, 90, 22, { rand: [12, 36], hint: 'Rods in each strand (its forks included)' }),
    S('Chains', 'wander', 'Wander', 0, 100, 60, { unit: '%', rand: [35, 80], hint: 'How much the strands bend (0: straight; 100: curling, with sharp kinks)' }),
    S('Chains', 'branching', 'Branching', 0, 100, 22, { unit: '%', rand: [8, 45], hint: 'How often a strand forks at a joint' }),
    S('Rods', 'thickness', 'Thickness', 0, 100, 100, { unit: '%', rand: [70, 100], hint: 'The rods\' width (from thin beads to fat rods)' }),
    S('Rods', 'rodlen', 'Rod length', 0, 100, 50, { unit: '%', rand: [30, 70], hint: 'From round lumps to long rods' }),
    S('Rods', 'notch', 'Notch', 0, 100, 18, { unit: '%', rand: [8, 40], hint: 'The gap cut at every joint (0: the rods run together)' }),
    S('Rods', 'rough', 'Roughness', 0, 100, 55, { unit: '%', rand: [35, 75], hint: 'How torn the rods\' outlines are (0: crisp rectangles)' }),
    S('Print', 'offreg', 'Off-register', 0, 100, 50, { unit: '%', rand: [30, 70], hint: 'How far the pale plate is shifted (down and to the left)' }),
    S('Print', 'spread', 'Plate spread', 0, 100, 35, { unit: '%', rand: [20, 55], hint: 'How much wider than the ink the plate prints' }),
    {
      section: 'Print', key: 'texture', label: 'Ink texture', type: 'select', def: 'stipple',
      options: [{ value: 'stipple', label: 'Stipple' }, { value: 'drag', label: 'Drag' }, { value: 'screen', label: 'Screen' }],
      hint: 'The texture printed in the ink, heavier toward the rods\' edges',
    },
    S('Print', 'coverage', 'Coverage', 0, 100, 40, { unit: '%', rand: [25, 60], hint: 'How much texture' }),
    S('Print', 'grain', 'Grain', 0, 100, 42, { unit: '%', rand: [25, 55], hint: 'A fine grain over everything' }),
  ];

  // Constants. Lengths are a share of R = sqrt(W x H) unless noted.
  const K = {
    margin: 0.08,              // strands start this far past the frame's edges (share of its width / height)
    box: 4.25,                 // the strands turn back at a box this many times the frame's size, round its centre
    delta: 0.01,               // the path's step
    dmax: 0.8, dpow: 2,        // heading drift at Wander 100 (rad^2 per R of path), growing like Wander^dpow
    kink: [0.12, 0.55],        // sharp turns: chance per joint at Wander 100, starting above this Wander
    kinkA: [1.7, 2.6],         // their angle (rad)
    jitter: 0.5,               // each rod leans off the path by up to about this much at Wander 100 (rad, sd)
    pb: 0.35,                  // fork chance per joint at Branching 100
    bang: [0.9, 1.9],          // fork angle (rad)
    w: [0.023, 0.099],         // rod width at Thickness 0 and the rise to 100
    len: [1.25, 1.75],         // rod length / width at Rod length 0 and the rise to 100
    gap: [-0.05, 1.2],         // the gap at every joint / width at Notch 0 and the rise to 100
    corner: 1.2,               // corner radius / half width, x sqrt(Roughness) (round ends from about Roughness 70)
    lumpL: 1.0, lumpA: 0.35,   // outline lumps: wavelength and amplitude at Roughness 100 (x width) ...
    fineL: 0.25, fineA: 0.05,  // ... and a finer wobble
    lumpPow: 1.0,              // both grow like Roughness^this
    rag: 0.0022,               // a ragged edge, one or two pixels, at Roughness 100
    off: 0.0553,               // the plate's shift at Off-register 100 ...
    offAngle: 135,             // ... toward the bottom left (degrees, y down)
    spread: 0.24,              // the plate's spread at Plate spread 100 (x the rods' width)
    grid: 330,                 // the shape field's grid: R / this per step
    cell: 0.0045,              // stipple and drag cells
    dragAngle: 11,             // the drag streaks lean this many degrees from upright
    dragRun: 5,                // drag: cells per noise step along a streak (sets the streaks' length)
    pitch: 0.0115,             // the halftone screen's pitch ...
    screenAngle: 10.5,         // ... and angle (degrees)
    // stipple / drag: the share of cells taken at the rods' edges at Coverage 100 (x Coverage^pow), falling
    // with the depth to base x that, like exp(-(depth / d0)^2)
    tex: { edge: 0.68, pow: 0.68, base: 0.15, d0: 0.024 },
    drag: { edge: 0.62, pow: 0.35, base: 0.1, d0: 0.027 },
    // screen: the tone at the edges at Coverage 100 (x Coverage^pow), falling fast (l1) and then slowly (l2, its share mix)
    scr: { edge: 0.9, pow: 2, l1: 0.009, l2: 0.016, mix: 0.2, min: 0.7 }, // (dots under min px across vanish)
    grain: 17.7, grainPow: 1.17, // grain: half range in levels at Grain 100 %, growing like Grain^this
    sway: 0.02, swayLen: 0.9,  // animation: a wave along every strand moving its joints up to 2 x this across at Intensity 1, this long
  };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const TAU = 2 * Math.PI;

  // a standard normal from two hashes
  const gauss = (a, b, c, d) => {
    const u1 = Math.max(1e-9, hash(a, b, c, d)), u2 = hash(a, b, c, d + 0x5bd1);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(TAU * u2);
  };

  // The rods' sizes for a frame (px).
  function sizes(p, R) {
    const w = R * (K.w[0] + K.w[1] * clamp01(p.thickness / 100));
    const L = w * (K.len[0] + K.len[1] * clamp01(p.rodlen / 100));
    const g = w * (K.gap[0] + K.gap[1] * clamp01(p.notch / 100));
    return { w, L, g, S: Math.max(0.3 * L, L + g) };
  }

  /* ---- the strands ------------------------------------------------------------------------- */
  // Every strand from its own hashes: adding strands (Chains) never changes the others, and the path
  // is the same at every Thickness (only the rods along it change). The still layout is worked out
  // once (cached); each frame of the animation only moves its joints.
  const LAY = new Map(); // one entry per box (General's Size and Rotation: see rods)
  function layout(seed, p, W, H) {
    const R = Math.sqrt(W * H);
    const C = clamp(Math.round(p.chains), 1, 40), N = clamp(Math.round(p.length), 1, 200);
    const key = [seed, C, N, p.wander, p.branching, p.thickness, p.rodlen, p.notch, W, H].join('|');
    const hit = LAY.get(key);
    if (hit) return hit;
    const wa = clamp01(p.wander / 100), br = clamp01(p.branching / 100);
    const { w, L, S } = sizes(p, R);
    const D = K.dmax * Math.pow(wa, K.dpow);
    const nStep = Math.max(1, Math.round(S / (K.delta * R))), ds = S / nStep;
    const sig = Math.sqrt((D * ds) / R);
    const pk = K.kink[0] * clamp01((wa - K.kink[1]) / (1 - K.kink[1])), jit = K.jitter * wa;
    const cx = W / 2, cy = H / 2, bx = (K.box * W) / 2, by = (K.box * H) / 2;
    const segs = []; // one per rod: its joint and the end of its stretch of path, their places along the strand, its lean
    const axes = []; // per strand: the direction it sways in, and its wave's phase
    for (let c = 0; c < C; c++) {
      const x0 = (-K.margin + (1 + 2 * K.margin) * hash(seed, c, 11, 0x5a1)) * W;
      const y0 = (-K.margin + (1 + 2 * K.margin) * hash(seed, c, 12, 0x5a1)) * H;
      const th0 = TAU * hash(seed, c, 14, 0x5a1);
      axes.push({ nx: -Math.sin(th0), ny: Math.cos(th0), ph: TAU * hash(seed, c, 13, 0x5a1) });
      // a tip: place, heading, branch id, steps taken (its own stream of turns), path length so far, joints made
      const tips = [{ x: x0, y: y0, th: th0, b: 0, k: 0, s: 0, j: 0 }];
      let made = 0, nb = 1, ti = 0;
      while (made < N) {
        const tip = tips[ti % tips.length];
        const jk = tip.b * 4096 + tip.j;
        // a sharp kink at this joint?
        if (tip.j > 0 && pk > 0 && hash(seed, c, jk, 0x6b1) < pk) {
          tip.th += (hash(seed, c, jk, 0x6b2) < 0.5 ? -1 : 1) * (K.kinkA[0] + (K.kinkA[1] - K.kinkA[0]) * hash(seed, c, jk, 0x6b3));
        }
        const xs = tip.x, ys = tip.y;
        let x = xs, y = ys, th = tip.th;
        for (let k = 0; k < nStep; k++) {
          if (sig > 0) th += sig * gauss(seed, c * 64 + (tip.b & 63), tip.k + k, 0x6c1 + (tip.b >> 6));
          x += ds * Math.cos(th); y += ds * Math.sin(th);
          // turn back at the box (it lies far outside the frame)
          if (x < cx - bx || x > cx + bx) { th = Math.PI - th; x = clamp(x, cx - bx, cx + bx); }
          if (y < cy - by || y > cy + by) { th = -th; y = clamp(y, cy - by, cy + by); }
        }
        const lean = jit > 0 ? jit * gauss(seed, c, jk + 1, 0x6e1) : 0; // the rod leans off its stretch of path a little
        segs.push({ xs, ys, x, y, s0: tip.s, s1: tip.s + S, lean, c, id: c * 4096 + tip.b * 256 + ((tip.j + 1) & 255) });
        tip.k += nStep; tip.s += S; tip.j++;
        tip.x = x; tip.y = y; tip.th = th;
        made++;
        // fork here?
        if (made < N && br > 0 && hash(seed, c, tip.b * 4096 + tip.j, 0x6d1) < K.pb * br) {
          const side = hash(seed, c, tip.b * 4096 + tip.j, 0x6d2) < 0.5 ? -1 : 1;
          const ang = K.bang[0] + (K.bang[1] - K.bang[0]) * hash(seed, c, tip.b * 4096 + tip.j, 0x6d3);
          tips.push({ x, y, th: th + side * ang, b: nb++, k: 0, s: tip.s, j: 0 });
        }
        ti++;
      }
    }
    const ST = { key, segs, axes, w, L, R };
    if (LAY.size >= 48) LAY.delete(LAY.keys().next().value);
    LAY.set(key, ST);
    return ST;
  }

  // The rods at time t. In the animation a wave runs along every strand: each point moves across the
  // strand's first heading by sway x (sin(phase + 2 pi s / length) - sin(2 pi s / length)), s being its
  // place along the strand, so the strand undulates and settles back (0 at t = 0: the first frame is
  // the still picture). Forks move with the joints they grow from.
  // G (a part of the world, frame units; General's Size and Rotation): the rods that can show in it.
  // The strands turn back at a box round the frame; past its walls the plane is cut into boxes like
  // it, each with strands of its own (its own seed) that start round its middle and turn back at its
  // walls. No strand crosses into the next box, so the frame's box keeps the frame's own picture and the
  // others are new ones, never a repeat.
  const boxSeed = (seed, bi, bj) => (bi || bj ? (Math.imul(seed | 0, 0x2545f491) ^ Math.imul(bi, 0x9e3779b1) ^ Math.imul(bj, 0x85ebca77)) | 0 : seed);
  function rods(seed, p, W, H, t = 0, amount = 0, G) {
    const A = K.sway * Math.max(0, amount || 0) * Math.sqrt(W * H), ph = TAU * (((t % 1) + 1) % 1);
    if (!G) return place(layout(seed, p, W, H), A, ph, 0, 0, 0, null, 0);
    const R = Math.sqrt(W * H), { w, L } = sizes(p, R);
    // how far past G a rod's middle can lie and still show (its reach, its lumps, the plate's shift and spread, the sway)
    const reach = L + 2 * w + K.off * R + K.spread * w + 2 * A + 0.02 * R + 8;
    const BW = K.box * W, BH = K.box * H;
    const ia = Math.floor((G.x0 - reach - W / 2) / BW + 0.5), ib = Math.floor((G.x1 + reach - W / 2) / BW + 0.5);
    const ja = Math.floor((G.y0 - reach - H / 2) / BH + 0.5), jb = Math.floor((G.y1 + reach - H / 2) / BH + 0.5);
    let out = [];
    for (let bj = ja; bj <= jb; bj++) for (let bi = ia; bi <= ib; bi++) {
      const bs = boxSeed(seed, bi, bj);
      out = out.concat(place(layout(bs, p, W, H), A, ph, bi * BW, bj * BH, bi || bj ? Math.imul(bs, 0x27d4eb2d) : 0, G, reach));
    }
    return out;
  }
  // a box's rods at their places (shifted by ox, oy; their ids salted so that every box's outlines are its own)
  function place(lay, A, ph, ox, oy, salt, G, reach) {
    const { segs, axes, w, L, R } = lay;
    const om = TAU / (K.swayLen * R);
    const out = [];
    for (let n = 0; n < segs.length; n++) {
      const g = segs[n];
      let xs = g.xs + ox, ys = g.ys + oy, xe = g.x + ox, ye = g.y + oy;
      if (G && (Math.max(xs, xe) < G.x0 - reach || Math.min(xs, xe) > G.x1 + reach || Math.max(ys, ye) < G.y0 - reach || Math.min(ys, ye) > G.y1 + reach)) continue;
      if (A) {
        const ax = axes[g.c], d0 = A * (Math.sin(ph + om * g.s0 + ax.ph) - Math.sin(om * g.s0 + ax.ph)), d1 = A * (Math.sin(ph + om * g.s1 + ax.ph) - Math.sin(om * g.s1 + ax.ph));
        xs += ax.nx * d0; ys += ax.ny * d0; xe += ax.nx * d1; ye += ax.ny * d1;
      }
      let ux = xe - xs, uy = ye - ys;
      const ul = Math.hypot(ux, uy) || 1;
      ux /= ul; uy /= ul;
      if (g.lean) { const ca = Math.cos(g.lean), sa = Math.sin(g.lean), vx = ux * ca - uy * sa; uy = ux * sa + uy * ca; ux = vx; }
      out.push({ cx: xs + (ux * L) / 2, cy: ys + (uy * L) / 2, ux, uy, hl: L / 2, hw: w / 2, c: g.c, id: salt ? (g.id ^ salt) | 0 : g.id });
    }
    return out;
  }

  /* ---- gradient noise for the torn outlines (each rod reads its own patch of it) ------------- */
  const PERM = new Uint8Array(512), GX = new Float32Array(256), GY = new Float32Array(256);
  {
    const r = PL.rng.mulberry32(0x3c6ef372);
    const pm = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const q = pm[i]; pm[i] = pm[j]; pm[j] = q; }
    for (let i = 0; i < 512; i++) PERM[i] = pm[i & 255];
    for (let i = 0; i < 256; i++) { const a = TAU * r(); GX[i] = Math.cos(a); GY[i] = Math.sin(a); }
  }
  function noise2(x, y) {
    const xf = Math.floor(x), yf = Math.floor(y), fx = x - xf, fy = y - yf;
    const i = xf & 255, j = yf & 255;
    const g00 = PERM[i + PERM[j]], g10 = PERM[i + 1 + PERM[j]], g01 = PERM[i + PERM[j + 1]], g11 = PERM[i + 1 + PERM[j + 1]];
    const n00 = GX[g00] * fx + GY[g00] * fy, n10 = GX[g10] * (fx - 1) + GY[g10] * fy;
    const n01 = GX[g01] * fx + GY[g01] * (fy - 1), n11 = GX[g11] * (fx - 1) + GY[g11] * (fy - 1);
    const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10), sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const a = n00 + (n10 - n00) * sx;
    return (a + (n01 + (n11 - n01) * sx - a) * sy) * 1.4; // about -1 .. 1
  }

  // The ragged edge: a small tile of smooth noise (2 px features), read in screen space.
  const RT = 256, RAG = new Float32Array(RT * RT);
  {
    for (let y = 0; y < RT; y++) for (let x = 0; x < RT; x++) RAG[y * RT + x] = noise2((x * 64) / RT / 2 + 0.31, (y * 64) / RT / 2 + 0.77) * 0.7 + noise2((x * 128) / RT / 2 + 5.1, (y * 128) / RT / 2 + 2.3) * 0.3;
  }

  /* ---- the shape field --------------------------------------------------------------------- */
  // A coarse grid of the signed distance (px) to the nearest rod's torn outline (negative inside),
  // good out to the plate's spread, and which strand owns each point. The plate is the same field
  // read at a shifted place and Plate spread further out; the textures read the depth from it.
  // G (General's Size and Rotation): the part of the world to cover (frame units) and the canvas's
  // pixel there (s); the grid keeps its step in canvas pixels zoomed in (so the outlines keep their
  // detail), and coarsens a little zoomed far out.
  function field(rs, p, W, H, G) {
    const R = Math.sqrt(W * H);
    const h0 = Math.max(0.5, R / K.grid), h = !G ? h0 : G.s < 1 ? h0 * G.s : G.s > 2 ? (h0 * G.s) / 2 : h0;
    const rough = clamp01(p.rough / 100);
    const spreadPx = K.spread * clamp01(p.spread / 100) * sizes(p, R).w, offPx = K.off * clamp01(p.offreg / 100) * R;
    const mg = offPx + spreadPx + 4 * h + 4;
    const X0 = G ? G.x0 : 0, Y0 = G ? G.y0 : 0, X1 = G ? G.x1 : W, Y1 = G ? G.y1 : H;
    const gx0 = -mg + Math.floor(X0 / h) * h, gy0 = -mg + Math.floor(Y0 / h) * h; // the frame's grid, carried on (fixed to the world)
    const gw = G ? Math.ceil((X1 - gx0 + mg) / h) + 2 : Math.ceil((W + 2 * mg) / h) + 2, gh = G ? Math.ceil((Y1 - gy0 + mg) / h) + 2 : Math.ceil((H + 2 * mg) / h) + 2;
    const F = new Float32Array(gw * gh).fill(1e6), O = new Uint16Array(gw * gh);
    const rp = Math.pow(rough, K.lumpPow);
    let built = 0;
    for (const r of rs) {
      const hw = r.hw, hl = r.hl, wd = 2 * hw;
      const rc = Math.min(hw, hl) * Math.min(1, K.corner * Math.sqrt(rough));
      const A1 = K.lumpA * rp * wd, A2 = K.fineA * rp * wd, l1 = K.lumpL * wd, l2 = K.fineL * wd;
      const amp = A1 + A2;
      const ext = amp + spreadPx + 2 * h + 2;
      // the rod's box, grown by ext
      const ex = Math.abs(r.ux) * hl + Math.abs(r.uy) * hw + ext, ey = Math.abs(r.uy) * hl + Math.abs(r.ux) * hw + ext;
      const ia = Math.max(0, Math.floor((r.cx - ex - gx0) / h)), ib = Math.min(gw - 1, Math.ceil((r.cx + ex - gx0) / h));
      const ja = Math.max(0, Math.floor((r.cy - ey - gy0) / h)), jb = Math.min(gh - 1, Math.ceil((r.cy + ey - gy0) / h));
      if (ia > ib || ja > jb) continue;
      // only rods that can show in the frame (or its plate) count as drawn
      if (r.cx + ex >= X0 && r.cx - ex <= X1 && r.cy + ey >= Y0 && r.cy - ey <= Y1) built++;
      const ox1 = 37.1 * hash(r.id, 1, 0x71, 3) * 6, oy1 = 37.1 * hash(r.id, 2, 0x71, 3) * 6;
      const ox2 = 91.7 * hash(r.id, 3, 0x71, 3) * 3, oy2 = 91.7 * hash(r.id, 4, 0x71, 3) * 3;
      const bx = hl - rc, by = hw - rc;
      for (let j = ja; j <= jb; j++) {
        const py = gy0 + j * h - r.cy;
        let k = j * gw + ia;
        for (let i = ia; i <= ib; i++, k++) {
          const px = gx0 + i * h - r.cx;
          const u = px * r.ux + py * r.uy, v = -px * r.uy + py * r.ux;
          const qx = Math.abs(u) - bx, qy = Math.abs(v) - by;
          const mx = qx > 0 ? qx : 0, my = qy > 0 ? qy : 0;
          let d = Math.sqrt(mx * mx + my * my) + Math.min(Math.max(qx, qy), 0) - rc;
          if (d > ext) continue;
          if (amp > 0 && d > -amp - 1) d += A1 * noise2(u / l1 + ox1, v / l1 + oy1) + A2 * noise2(u / l2 + ox2, v / l2 + oy2);
          if (d < F[k]) { F[k] = d; O[k] = r.c; }
        }
      }
    }
    return { F, O, gw, gh, h, gx0, gy0, R, spreadPx, offPx, built };
  }

  /* ---- the textures --------------------------------------------------------------------------- */
  // Drag: along each column of cells a smooth noise, evened out so that a share q of the cells
  // fall below quantile(q).
  const dragVal = (col, k) => {
    const f = k / K.dragRun, i0 = Math.floor(f), tt = f - i0, s = tt * tt * (3 - 2 * tt);
    const a = hash(col, i0, 0xd7a, 1), b = hash(col, i0 + 1, 0xd7a, 1);
    return a + (b - a) * s;
  };
  const DQ = new Float32Array(1025); // quantiles of dragVal
  {
    const v = new Float32Array(32768);
    for (let n = 0; n < v.length; n++) v[n] = dragVal(n * 7 + 3, n * 13 + 5);
    v.sort();
    for (let q = 0; q <= 1024; q++) DQ[q] = v[Math.min(v.length - 1, Math.floor((q / 1024) * v.length))];
    DQ[0] = -1; DQ[1024] = 2;
  }

  // share of stipple / drag cells at a depth (R units), and the screen's tone
  function texShare(C, dep, drag) {
    const T = drag ? K.drag : K.tex, q = Math.max(0, dep) / T.d0;
    return T.edge * Math.pow(C, T.pow) * (T.base + (1 - T.base) * Math.exp(-q * q));
  }
  function screenTone(C, dep) {
    const e = K.scr.edge * Math.pow(C, K.scr.pow), d = Math.max(0, dep);
    return e * ((1 - K.scr.mix) * Math.exp(-d / K.scr.l1) + K.scr.mix * Math.exp(-d / K.scr.l2));
  }

  /* ---- grain: the same in every frame ---------------------------------------------------------- */
  const grainAt = (x, y, s) => {
    let h = Math.imul(x, 0x85ebca77) ^ Math.imul(y, 0xc2b2ae3d) ^ s;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h ^= h >>> 13; h = Math.imul(h, 0x297a2d39); h ^= h >>> 16;
    return ((h >>> 0) / 4294967296) * 2 - 1;
  };

  /* ---- paint ------------------------------------------------------------------------------- */
  // map (General's Rotation and Size): the canvas (cw x ch) and the part of the world it shows. The
  // rods, the plate, the textures and the ragged edge are the world's (read at each pixel's place in
  // it); the edges stay a canvas pixel soft and the grain stays one speck per canvas pixel.
  let pvImg = null;
  function paint({ ctx, W, H, aspect, seed, p, colors, t = 0, anim, transparent = false, preview = false, map }) {
    const amount = anim ? anim.amount : 0;
    const cw = map ? map.cw : W, ch = map ? map.ch : H, mx = map ? map.x0 : 0, my = map ? map.y0 : 0, ms = map ? map.s : 1;
    const Gr = map ? { x0: mx, y0: my, x1: mx + cw * ms, y1: my + ch * ms, s: ms } : undefined;
    const rs = rods(seed, p, W, H, t, amount, Gr);
    const fd = field(rs, p, W, H, Gr);
    const { F, O, gw, gh, h, gx0, gy0, R, spreadPx, offPx } = fd;
    const rgb = colors.map(PL.color.hexToRgb);
    const nI = Math.max(1, colors.length - 2);
    const G = rgb[0], P = rgb[1];
    const C = clamp01(p.coverage / 100), tex = p.texture === 'drag' ? 1 : p.texture === 'screen' ? 2 : 0;
    const rough = clamp01(p.rough / 100), rag = K.rag * rough * R;
    const ga = K.grain * Math.pow(clamp01(p.grain / 100), K.grainPow);
    const oa = (K.offAngle * Math.PI) / 180, odx = offPx * Math.cos(oa), ody = offPx * Math.sin(oa);
    const cell = Math.max(1, K.cell * R);
    const X0 = Gr ? Gr.x0 : 0, Y0 = Gr ? Gr.y0 : 0, X1 = Gr ? Gr.x1 : W, Y1 = Gr ? Gr.y1 : H;
    // bilinear read of the field at a point (px)
    const at = (x, y) => {
      const fx = (x - gx0) / h, fy = (y - gy0) / h;
      let i = Math.floor(fx), j = Math.floor(fy);
      if (i < 0) i = 0; else if (i > gw - 2) i = gw - 2;
      if (j < 0) j = 0; else if (j > gh - 2) j = gh - 2;
      const tx = clamp01(fx - i), ty = clamp01(fy - j), k = j * gw + i;
      const a = F[k] + (F[k + 1] - F[k]) * tx, b = F[k + gw] + (F[k + gw + 1] - F[k + gw]) * tx;
      return a + (b - a) * ty;
    };
    const owner = (x, y) => {
      const i = clamp(Math.round((x - gx0) / h), 0, gw - 1), j = clamp(Math.round((y - gy0) / h), 0, gh - 1);
      return O[j * gw + i];
    };
    // the texture: does the ink leave this pixel to the ground? Drag and Screen work out every cell or
    // dot of their tilted grids once (from the depth at its centre), then each pixel looks its cell up.
    const da = (K.dragAngle * Math.PI) / 180, dca = Math.cos(da), dsa = Math.sin(da);
    const sa = (K.screenAngle * Math.PI) / 180, sca = Math.cos(sa), ssa = Math.sin(sa), pit = Math.max(1.5, K.pitch * R);
    const sseed = seed | 0;
    // a tilted grid of step st and angle (c, s): index ranges over the frame (or the part of the world shown)
    const tilted = (st, c, s) => {
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const [x, y] of [[X0, Y0], [X1, Y0], [X0, Y1], [X1, Y1]]) {
        const u = (x * c + y * s) / st, v = (-x * s + y * c) / st;
        u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
      }
      const ia = Math.floor(u0) - 1, ja = Math.floor(v0) - 1;
      return { ia, ja, nu: Math.ceil(u1) - ia + 2, nv: Math.ceil(v1) - ja + 2 };
    };
    let TG = null, TV = null;
    if (C > 0 && tex === 1) {
      TG = tilted(cell, dca, dsa); TV = new Uint8Array(TG.nu * TG.nv);
      for (let j = 0; j < TG.nv; j++) for (let i = 0; i < TG.nu; i++) {
        const ci = TG.ia + i, ck = TG.ja + j, uc = (ci + 0.5) * cell, vc = (ck + 0.5) * cell;
        const x = uc * dca - vc * dsa, y = uc * dsa + vc * dca;
        if (x < X0 - cell || y < Y0 - cell || x > X1 + cell || y > Y1 + cell) continue;
        const dd = at(x, y);
        if (dd > 2) continue; // outside the ink
        const q = texShare(C, -dd / R, true);
        TV[j * TG.nu + i] = dragVal(ci * 31 + sseed, ck) < DQ[Math.min(1024, Math.round(q * 1024))] ? 1 : 0;
      }
    } else if (C > 0 && tex === 2) {
      TG = tilted(pit, sca, ssa); TV = new Float32Array(TG.nu * TG.nv); // each dot's radius (share of the pitch)
      for (let j = 0; j < TG.nv; j++) for (let i = 0; i < TG.nu; i++) {
        const iu = TG.ia + i, iv = TG.ja + j, x = (iu * sca - iv * ssa) * pit, y = (iu * ssa + iv * sca) * pit;
        if (x < X0 - pit || y < Y0 - pit || x > X1 + pit || y > Y1 + pit) continue;
        const dd = at(x, y);
        if (dd > 2 * pit) continue;
        const tone = screenTone(C, -dd / R);
        if (tone <= 0) continue;
        const rr = tone >= 0.785 ? 0.5 + (tone - 0.785) : Math.sqrt(tone / Math.PI);
        if (rr * pit >= K.scr.min) TV[j * TG.nu + i] = rr; // smaller dots don't print
      }
    }
    const speck = (x, y) => {
      if (tex === 1) {
        const i = Math.floor((x * dca + y * dsa) / cell) - TG.ia, j = Math.floor((-x * dsa + y * dca) / cell) - TG.ja;
        return i >= 0 && j >= 0 && i < TG.nu && j < TG.nv && TV[j * TG.nu + i] === 1;
      }
      // screen: the nearest dot of the tilted lattice
      const u = (x * sca + y * ssa) / pit, v = (-x * ssa + y * sca) / pit;
      const iu = Math.round(u), iv = Math.round(v), du = u - iu, dv = v - iv, i = iu - TG.ia, j = iv - TG.ja;
      if (i < 0 || j < 0 || i >= TG.nu || j >= TG.nv) return false;
      const rr = TV[j * TG.nu + i];
      return rr > 0 && du * du + dv * dv < rr * rr;
    };
    // the ragged edge read anywhere in the world: at its nearest point (as in the frame), or between
    // points zoomed in (bilinear: smooth however far it is zoomed in)
    const ragAt = (x, y) => {
      if (ms >= 1) return RAG[(Math.floor(y + 0.5) & 255) * RT + (Math.floor(x + 0.5) & 255)];
      const xf = Math.floor(x), yf = Math.floor(y), fx = x - xf, fy = y - yf;
      const i0 = xf & 255, i1 = (xf + 1) & 255, j0 = (yf & 255) * RT, j1 = ((yf + 1) & 255) * RT;
      const a = RAG[j0 + i0] + (RAG[j0 + i1] - RAG[j0 + i0]) * fx, b = RAG[j1 + i0] + (RAG[j1 + i1] - RAG[j1 + i0]) * fx;
      return a + (b - a) * fy;
    };
    if (preview) { if (!pvImg || pvImg.width !== cw || pvImg.height !== ch) pvImg = ctx.createImageData(cw, ch); }
    const img = preview ? pvImg : ctx.createImageData(cw, ch);
    const d8 = img.data;
    const gs = Math.imul(sseed, 0x9e3779b1) ^ 0x2545f491;
    const gox = Math.round(mx / ms), goy = Math.round(my / ms); // the grain: one speck per canvas pixel, counted from the frame's corner
    const inks = rgb.slice(2), one = nI === 1 ? inks[0] : null;
    const aa = 1 / ms; // the edges' soft pixel: distances in canvas pixels
    // per column: the field's grid column and weight, for the ink and for the plate (read Off-register away)
    const cols = (dx) => {
      const I = new Int32Array(cw), T = new Float32Array(cw);
      for (let x = 0; x < cw; x++) {
        const f = (mx + (x + 0.5) * ms - dx - gx0) / h;
        let i = Math.floor(f);
        if (i < 0) i = 0; else if (i > gw - 2) i = gw - 2;
        I[x] = i; T[x] = clamp01(f - i);
      }
      return [I, T];
    };
    const [IX, TX] = cols(0), [PX, PT] = cols(odx);
    const rowOf = (y) => { let j = Math.floor((y - gy0) / h); if (j < 0) j = 0; else if (j > gh - 2) j = gh - 2; return [j * gw, clamp01((y - gy0) / h - j)]; };
    // stipple: each cell's verdict, worked out once per row of cells
    const ci0 = Math.floor(mx / cell), nCell = Math.ceil((cw * ms) / cell) + 2, cellRow = new Int8Array(nCell);
    const CI = new Int32Array(cw);
    for (let x = 0; x < cw; x++) CI[x] = Math.floor((mx + x * ms) / cell);
    let cellJ = -1;
    const xPlate = new Int32Array(cw);
    if (!map) for (let x = 0; x < W; x++) xPlate[x] = Math.floor(x + 0.5 - odx) & 255;
    for (let y = 0; y < ch; y++) {
      const wy = my + y * ms; // the pixel's top edge in the world
      const [r0, ty] = rowOf(my + (y + 0.5) * ms), [p0, py] = rowOf(my + (y + 0.5) * ms - ody);
      const ragRow = (y & 255) * RT, ragRowP = (Math.floor(y + 0.5 - ody) & 255) * RT;
      if (tex === 0 && C > 0) {
        const cj = Math.floor(wy / cell);
        if (cj !== cellJ) { cellJ = cj; cellRow.fill(-1); }
      }
      let o = y * cw * 4;
      for (let x = 0; x < cw; x++, o += 4) {
        // the ink's and the plate's distance (px), read from the field
        let k = r0 + IX[x], t = TX[x];
        let a = F[k] + (F[k + 1] - F[k]) * t, b = F[k + gw] + (F[k + gw + 1] - F[k + gw]) * t;
        let dI = a + (b - a) * ty;
        k = p0 + PX[x]; t = PT[x];
        a = F[k] + (F[k + 1] - F[k]) * t; b = F[k + gw] + (F[k + gw + 1] - F[k + gw]) * t;
        let dP = a + (b - a) * py - spreadPx;
        if (rag) {
          if (!map) { dI += RAG[ragRow + (x & 255)] * rag; dP += RAG[ragRowP + xPlate[x]] * rag; }
          else { const wx = mx + x * ms; dI += ragAt(wx, wy) * rag; dP += ragAt(wx - odx, wy - ody) * rag; } // (the pixel's corner, as in the frame)
        }
        if (map) { dI *= aa; dP *= aa; }
        const aI = dI >= 0.5 ? 0 : dI <= -0.5 ? 1 : 0.5 - dI, aP = dP >= 0.5 ? 0 : dP <= -0.5 ? 1 : 0.5 - dP;
        let r = G[0], g = G[1], bl = G[2], al = transparent ? 0 : 255;
        if (aP > 0) { r += (P[0] - r) * aP; g += (P[1] - g) * aP; bl += (P[2] - bl) * aP; if (transparent && 255 * aP > al) al = 255 * aP; }
        if (aI > 0) {
          let hole = false;
          if (C > 0) {
            if (tex === 0) {
              const ci = CI[x];
              let v = cellRow[ci - ci0];
              if (v < 0) { v = hash(ci, cellJ, sseed, 0x571) < texShare(C, -at((ci + 0.5) * cell, (cellJ + 0.5) * cell) / R) ? 1 : 0; cellRow[ci - ci0] = v; }
              hole = v === 1;
            } else hole = speck(mx + x * ms, wy);
          }
          const ink = hole ? (transparent ? null : G) : one || inks[owner(mx + (x + 0.5) * ms, my + (y + 0.5) * ms) % nI];
          if (ink) { r += (ink[0] - r) * aI; g += (ink[1] - g) * aI; bl += (ink[2] - bl) * aI; if (transparent && 255 * aI > al) al = 255 * aI; }
          else if (transparent) al *= 1 - aI;
        }
        if (ga > 0 && al > 0) { const n = grainAt(x + gox, y + goy, gs) * ga; r += n; g += n; bl += n; }
        d8[o] = r < 0 ? 0 : r > 255 ? 255 : r; d8[o + 1] = g < 0 ? 0 : g > 255 ? 255 : g; d8[o + 2] = bl < 0 ? 0 : bl > 255 ? 255 : bl; d8[o + 3] = al;
      }
    }
    ctx.putImageData(img, 0, 0);
    const nC = clamp(Math.round(p.chains), 1, 40), nR = map ? layout(seed, p, W, H).segs.length : rs.length; // the frame's own rods
    return { status: `${nC} chain${nC === 1 ? '' : 's'} · ${nR.toLocaleString()} rods · ${['stipple', 'drag', 'screen'][tex]}` };
  }

  PL.tools.register({
    id: 'strand',
    name: 'Strand',
    kind: 'Backgrounds',
    tagline: 'Rod chains',
    about: 'Strands of rods that wander, fork and cross, printed slightly off register: a bright ink over a pale plate on a dark ground, speckled, streaked or screened toward its edges.',
    raster: true,
    inks: {
      min: 3, max: 8, roles, fit, spec, add, generate,
      span: () => 2, // Invert swaps the ground and the plate
      hint: 'Ground first, then the plate, then the ink. More inks are dealt out to the strands in turn.',
    },
    palettes: PALETTES,
    params: PARAMS,
    animLabel: 'Intensity',
    animHint: 'How far the strands sway (0: still)',
    defaults: {
      anim: { amount: 2, fps: 12, frames: 36 }, // opens at Intensity 2.00 (the strongest sway)
      fx: {},
    },
    paint,
    zoom: true, // paints any part of its world (General's Rotation and Size)
    _K: K,
    _rods: rods,
    _field: field,
    _sizes: sizes,
    _texShare: texShare,
    _screenTone: screenTone,
  });
})();
