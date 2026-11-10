/* ==========================================================================
   tools/filament.js — Filament: thread field.

   1. Field: a smooth noise field of directions. Each seed flows its own way
      overall; Turn sets how far the direction swings from that, Field scale
      how big the swirls are, Detail adds finer swirls and Curl a broader
      second swirl (hooks and loops). The noise is stretched along the flow,
      so strands are drawn together into thin ropes more than they wiggle.
      Tangle gives every strand its own restless wander.
   2. Strands: Bundles of strands start from small clusters (Bundle spread)
      and are traced downstream for Length steps of Step each. Each bundle
      tries a few starts and keeps the one whose strands stay longest in the
      frame, so strands run through it from the upstream side. Clustering
      starts new bundles near earlier ones, so ropes grow and gaps stay open.
   3. Line: Weight with some variation, a few heavier lead strands
      (Hierarchy) and faint hairlines in the last strand ink (Hairlines).
   4. Marks: small glyphs (rings, arrowheads, crosses, ticks, arcs) strung
      along the strands, more of them downstream, so they crowd the ropes.
      Strands and marks are drawn in a few interleaved passes, so on a rope
      the mark inks mix instead of one ink covering the rest.
   5. Animation: a share of the strands (Moving share) is drawn only as a
      shorter strand that runs along its path from the bundle to the end,
      again and again, in the palette's brightest inks (the lightest ones on
      a dark ground). Everything else holds still. The loop is seamless.
      At Intensity 0 nothing moves and every strand is drawn whole.
   ========================================================================== */
(() => {
  const { hash } = PL.rng;

  // Ground, then the strand inks, then the mark inks. The default look uses Lagoon (defaults.palette).
  const PALETTES = [
    { name: 'Meadow', colors: ['#E6EFE7', '#5CBA30', '#63F065', '#CAFED3', '#6287F1', '#EA38F2', '#FE6273'] },
    { name: 'Ember', colors: ['#EFEEE7', '#DE4322', '#FC9451', '#FFECB0', '#52F6C5', '#6E7CF4', '#FE3FB4'] },
    { name: 'Neon', colors: ['#10050E', '#D80FAF', '#E45EA9', '#F5AEB3', '#4960FE', '#6BFCEF', '#9CFD49'] },
    { name: 'Tide', colors: ['#EAF0F4', '#1F6FB2', '#39B7E8', '#CDE9F7', '#FF7A45', '#FFC93C', '#8A5CF6'] },
    { name: 'Plum', colors: ['#F4EEF3', '#7B2CBF', '#C77DFF', '#EBD9FC', '#06D6A0', '#FF9F1C', '#EF476F'] },
    { name: 'Lagoon', colors: ['#0D1B2A', '#2EC4B6', '#7FE3D7', '#D7F7F2', '#FF6B6B', '#FFD166', '#C77DFF'] },
    { name: 'Ink', colors: ['#F2EFE8', '#1C1C1C', '#5E5E5E', '#C9C6BE', '#E8432E', '#2E6BE8', '#F2B33D'] },
    { name: 'Mono', colors: ['#F0F0EE', '#222222', '#6B6B6B', '#D0D0CC', '#222222', '#6B6B6B', '#A0A0A0'] },
    { name: 'Duo', colors: ['#F3EFE6', '#E4572E', '#2E86AB'] },
    { name: 'Dusk', colors: ['#100D26', '#7D40C8', '#EA5DA9', '#F8D7BE', '#47D6CF', '#F0D947', '#F57050'] }, // a night ground; violet, pink and a pale peach hairline; aqua, lemon and coral marks
  ];

  /* ---- color roles: ground, strand inks, mark inks --------------------------- */
  const split = (n) => { const m = Math.max(1, Math.ceil((n - 1) / 2)); return { m, k: Math.max(0, n - 1 - m) }; };
  function roles(n) {
    const { m, k } = split(n);
    const out = ['Ground'];
    for (let i = 0; i < m; i++) out.push(m === 1 ? 'Strands' : 'Strands ' + (i + 1));
    for (let i = 0; i < k; i++) out.push(k === 1 ? 'Marks' : 'Marks ' + (i + 1));
    return out;
  }
  const spec = (n) => ({ ramp: Math.min(3, n), accents: Math.max(0, n - 3) });
  const isLight = (hex) => PL.color.luminance(hex) > 0.35;

  // "New colors": a pale (now and then a dark) ground, strand inks of one hue from deep
  // to pale, and mark inks in vivid contrasting hues.
  function generate(n, rng) {
    const C = PL.color;
    const { m, k } = split(n);
    const dark = rng.chance(0.2);
    const hs = rng.float(0, 360);
    const ground = dark
      ? C.lch(rng.float(0.13, 0.19), rng.float(0.02, 0.05), hs + rng.float(-40, 40))
      : C.lch(rng.float(0.93, 0.96), rng.float(0.01, 0.025), hs + rng.float(-25, 25));
    const strandL = dark ? [0.6, 0.72, 0.88, 0.5, 0.8] : [0.62, 0.78, 0.93, 0.5, 0.7];
    const strandC = dark ? [0.22, 0.17, 0.07, 0.2, 0.12] : [0.18, 0.2, 0.06, 0.16, 0.14];
    const out = [ground];
    for (let i = 0; i < m; i++) out.push(C.lch(strandL[i % 5] + rng.float(-0.04, 0.04), strandC[i % 5] * rng.float(0.85, 1.1), hs + rng.float(-14, 14) + (i >= 3 ? 25 * (i - 2) : 0)));
    // mark hues spread over the half of the wheel facing away from the strands
    const order = Array.from({ length: k }, (_, i) => i);
    for (let i = k - 1; i > 0; i--) { const j = rng.int(0, i); [order[i], order[j]] = [order[j], order[i]]; }
    for (let i = 0; i < k; i++) out.push(C.lch(dark ? rng.float(0.74, 0.86) : rng.float(0.6, 0.7), rng.float(0.17, 0.23), hs + 90 + (180 * (order[i] + 0.5)) / k + rng.float(-12, 12)));
    return out;
  }

  // + adds a strand ink (paler than the last) or a mark ink (a hue the marks don't have yet),
  // keeping strands and marks in balance.
  function add(colors) {
    const C = PL.color;
    const c = colors.slice();
    const n = c.length;
    const { m } = split(n), m2 = split(n + 1).m;
    if (m2 > m) {
      const last = C.hexToLch(c[m]);
      const light = !isLight(c[0]);
      c.splice(1 + m, 0, C.lch(Math.min(0.95, Math.max(0.35, last[0] + (light ? 0.08 : -0.12))), Math.max(0.06, last[1] * 0.9), last[2] + 18));
    } else {
      const hues = c.slice(1).map((x) => C.hexToLch(x)[2]); // keep clear of the strand and mark hues
      let best = 0, bd = -1;
      for (let h = 0; h < 360; h += 15) {
        const d = hues.length ? Math.min(...hues.map((x) => Math.abs((((h - x) % 360) + 540) % 360 - 180))) : 180;
        if (d > bd) { bd = d; best = h; }
      }
      c.push(C.lch(isLight(c[0]) ? 0.64 : 0.8, 0.2, best));
    }
    return c;
  }

  function fit(colors, n) {
    let c = (colors || []).map(PL.color.normHex).filter(Boolean);
    if (!c.length) c = PALETTES[0].colors.slice();
    if (c.length === 1) c.push(PL.color.mix(c[0], isLight(c[0]) ? '#000000' : '#FFFFFF', 0.8));
    if (c.length === n) return c;
    if (c.length > n) {
      // keep the ground, then as many strand and mark inks as the new count holds
      const a = split(c.length), b = split(n);
      const strands = c.slice(1, 1 + a.m), marks = c.slice(1 + a.m);
      const pick = (arr, k) => Array.from({ length: k }, (_, i) => arr[i % Math.max(1, arr.length)] || strands[i % strands.length]);
      return [c[0], ...pick(strands, b.m), ...pick(marks.length ? marks : strands, b.k)];
    }
    while (c.length < n) c = add(c);
    return c;
  }

  const S = (section, key, label, min, max, def, extra = {}) => ({ section, key, label, type: 'range', min, max, def, step: 1, ...extra });
  const KINDS = [
    { value: 'ring', label: '○', title: 'Rings' },
    { value: 'arrow', label: '▲', title: 'Arrowheads' },
    { value: 'cross', label: '×', title: 'Crosses' },
    { value: 'tick', label: '|', title: 'Ticks' },
    { value: 'arc', label: '◡', title: 'Arcs' },
  ];
  const PARAMS = [
    S('Field', 'fscale', 'Field scale', 0.2, 6, 1.9, { step: 0.05, rand: [1.3, 2.6], hint: 'Size of the swirls: higher packs more turns into the frame' }),
    S('Field', 'turn', 'Turn', 0, 500, 190, { unit: '%', rand: [130, 250], hint: 'How far the flow swings from place to place' }),
    S('Field', 'detail', 'Detail', 1, 6, 3, { rand: [2, 4], hint: 'Layers of finer swirls in the flow' }),
    S('Field', 'curl', 'Curl', 0, 100, 45, { unit: '%', rand: [25, 65], hint: 'Mixes in a broader swirl that bends the flow into hooks and loops' }),
    S('Field', 'tangle', 'Tangle', 0, 100, 0, { unit: '%', rand: false, hint: 'Lets every strand wander off on its own' }),
    S('Strands', 'bundles', 'Bundles', 1, 80, 26, { rand: [16, 34], hint: 'How many bundles of strands' }),
    S('Strands', 'per', 'Per bundle', 1, 40, 12, { rand: [8, 16], hint: 'Strands in each bundle' }),
    S('Strands', 'clustering', 'Clustering', 0, 100, 60, { unit: '%', rand: [35, 80], hint: 'Starts new bundles near earlier ones, so ropes grow and gaps stay open' }),
    S('Strands', 'spread', 'Bundle spread', 0, 20, 4, { unit: '%', step: 0.5, rand: [2.5, 6], hint: 'How widely the strands of a bundle start apart' }),
    S('Strands', 'length', 'Length', 20, 600, 230, { rand: [170, 300], hint: 'Steps each strand is traced for' }),
    S('Strands', 'step', 'Step', 1, 8, 3.4, { step: 0.1, rand: false, hint: 'Length of each step (in thousandths of the frame)' }),
    S('Line', 'weight', 'Weight', 0.2, 6, 1.6, { step: 0.1, rand: [1.1, 2.2], hint: 'Strand weight (in thousandths of the frame)' }),
    S('Line', 'wvar', 'Weight variation', 0, 100, 60, { unit: '%', rand: false, hint: 'How much strand weights differ' }),
    S('Line', 'hierarchy', 'Hierarchy', 0, 100, 55, { unit: '%', rand: false, hint: 'A few heavier lead strands in each bundle' }),
    S('Line', 'hairlines', 'Hairlines', 0, 100, 22, { unit: '%', rand: false, hint: 'Share of faint hairline strands in the palest strand ink' }),
    { section: 'Marks', key: 'style', label: 'Style', type: 'seg', def: 'along', rand: false,
      options: [{ value: 'along', label: 'Along' }, { value: 'upright', label: 'Upright' }, { value: 'scatter', label: 'Scatter' }] },
    S('Marks', 'symbols', 'Symbols', 0, 100, 30, { unit: '%', rand: [18, 45], hint: 'How many marks are strung along the strands' }),
    S('Marks', 'size', 'Size', 2, 30, 9, { rand: [7, 12], hint: 'Mark size (in thousandths of the frame)' }),
    { section: 'Marks', key: 'kinds', label: 'Kinds', type: 'multi', def: KINDS.map((k) => k.value), rand: false, options: KINDS, hint: 'Which marks to draw' },
    S('Animate', 'moving', 'Moving share', 0, 100, 50, { unit: '%', rand: false, hint: 'Share of strands that run along their paths instead of holding still' }),
  ];

  // Constants. Lengths are in thousandths of the frame's long edge unless noted.
  const K = {
    box: 0.12,          // strands are traced this far beyond the frame (x L)
    turnK: 1.15,        // direction swing: Turn x this x pi x noise
    freqK: 2.5,         // the noise runs at this / Field scale cycles per L
    curlF: 0.6,         // the curl noise's frequency relative to the main one
    curlA: 1,           // the curl noise's swing at 100 % (x pi)
    gain: 0.3,          // each finer layer of detail swings this much less
    gridK: 24,          // field samples per cycle of its finest detail
    aniso: 1.5,         // the noise is stretched this much along the flow's overall heading
    heading: 1,         // 1: every seed flows its own way overall (0: left to right)
    tangleA: [1.4, 0.55], tangleF: [3.5, 14], // tangle: two wander angles (radians at 100 %) and their frequencies (per L)
    cluster: 0.09,      // a clustered bundle starts this far (sd, x L) from an earlier one
    tries: 4,           // candidate starts per bundle (the one whose strands stay longest in the frame wins)
    goal: 0.85,         // ... or the first that keeps this share of Length in the frame
    spreadSd: 0.55,     // strands start Bundle spread x this (sd) from the bundle centre
    hair: [0.33, 0.6],  // hairline weight (x Weight)
    wMid: 1.15,         // typical strand weight (x Weight)
    lead: [1.45, 2.15], // lead strands are this much heavier
    leadP: 0.35,        // share of lead strands at Hierarchy 100 %
    inkW: 1.7,          // the first strand ink is this much more common than the others
    markRate: 0.1,      // marks per step at Symbols 100 % (more downstream: x (1 + 3 s) / 2.5)
    ring: 0.35, arrow: 0.8, cross: 1.1, tick: 0.92, arc: 0.36, // mark sizes (x Size)
    arcSpan: 200, arcTurn: 1, // arcs span this many degrees, their closed side this many radians off the strand
    markW: 0.16,        // mark line weight (x Size)
    dashK: 0.425,       // a moving strand's visible run: Amount x this of its path
    cyclesK: 2.5,       // runs per loop: Amount x this (at least 1)
    simplify: 0.12,     // static strands drop points within this many px of the line
    passes: [4, 8],     // strand and mark layers come in this many interleaved passes
  };

  /* ---- the field: a cached grid of directions ------------------------------------
     The direction at each point is an angle: Turn x pi x a smooth noise whose swirls
     are about Field scale x L across, plus (Curl) a second, broader noise that bends
     the flow round into loops and hooks. Both are smooth, so strands never kink.     */
  // o (General's Rotation and Size): the part of the world from (o.x, o.y), o.w x o.h (units of L), read
  // as finely on the screen as the frame (o.z: screen pixels per frame unit there)
  const fieldCache = new Map();
  function fieldGrid(aw, ah, seed, p, o) {
    const fs = Math.max(0.05, p.fscale), oct = Math.max(1, Math.round(p.detail));
    const key = [aw.toFixed(4), ah.toFixed(4), seed, fs, p.turn, oct, p.curl, K.aniso, K.heading, K.freqK, K.gain, K.turnK, o ? [o.x, o.y, o.w, o.h, o.z].join(',') : ''].join('|');
    const hit = fieldCache.get(key);
    if (hit) return hit;
    const f1 = K.freqK / fs, f2 = f1 * K.curlF;
    let R = Math.max(64, Math.min(400, Math.round(K.gridK * f1 * 2 ** (oct - 1))));
    if (o) R = Math.max(16, R * Math.min(1, o.z));
    const x0 = (o ? o.x : 0) - K.box - 2 / R, y0 = (o ? o.y : 0) - K.box - 2 / R;
    const nx = Math.ceil(((o ? o.w : aw) + 2 * K.box) * R) + 4, ny = Math.ceil(((o ? o.h : ah) + 2 * K.box) * R) + 4;
    const row = nx + 1, n = row * (ny + 1);
    const NA = PL.noise.get((seed ^ 0x2c1b3c6d) >>> 0), NB = PL.noise.get((seed ^ 0x297a2d39) >>> 0);
    const T = (p.turn / 100) * K.turnK * Math.PI, Cc = (p.curl / 100) * K.curlA * Math.PI;
    const dx = new Float32Array(n), dy = new Float32Array(n);
    // the flow's overall heading, and the noise stretched along it (so strands gather more than they turn)
    const h0 = K.heading ? hash(seed, 0x6ead) * Math.PI * 2 : 0, ch = Math.cos(h0), sh = Math.sin(h0);
    const sa = 1 / K.aniso, sb = K.aniso;
    for (let j = 0; j <= ny; j++) {
      const y = y0 + j / R;
      for (let i = 0; i <= nx; i++) {
        const x = x0 + i / R, k = j * row + i;
        const ax = (x * ch + y * sh) * sa, by = (-x * sh + y * ch) * sb;
        let a = h0 + T * NA.fbm4(ax * f1 + 3.1, by * f1 - 7.7, 0.5, 0, oct, K.gain);
        if (Cc) a += Cc * NB.fbm4(ax * f2 + 11.1, by * f2 + 2.3, 1.5, 0, 2, 0.5);
        dx[k] = Math.cos(a); dy[k] = Math.sin(a);
      }
    }
    const out = { dx, dy, x0, y0, R, nx, ny, row };
    if (fieldCache.size > 6) fieldCache.delete(fieldCache.keys().next().value);
    fieldCache.set(key, out);
    return out;
  }

  /* ---- strands: traced once per field / strand settings, in units of L -------------- */
  // o (General's Rotation and Size): the part of the world to cover. The frame's bundles are traced as at
  // 100 % and their strands carry on past the frame; the world past it is laid out in frame-sized tiles,
  // each with bundles of its own (a seed of its own) in the same field, so zooming out shows more of it.
  const strandCache = new Map();
  const sampler = (G) => (x, y, out) => {
    const { dx, dy, x0, y0, R, nx, ny, row } = G;
    let gx = (x - x0) * R, gy = (y - y0) * R;
    gx = gx < 0 ? 0 : gx > nx - 1.001 ? nx - 1.001 : gx;
    gy = gy < 0 ? 0 : gy > ny - 1.001 ? ny - 1.001 : gy;
    const i = gx | 0, j = gy | 0, fx = gx - i, fy = gy - j, k = j * row + i;
    const a = dx[k] + (dx[k + 1] - dx[k]) * fx, b = dx[k + row] + (dx[k + row + 1] - dx[k + row]) * fx;
    const c = dy[k] + (dy[k + 1] - dy[k]) * fx, d = dy[k + row] + (dy[k + row + 1] - dy[k + row]) * fx;
    out[0] = a + (b - a) * fy; out[1] = c + (d - c) * fy;
  };
  function traceStrands(aw, ah, seed, p, o) {
    const key = [aw.toFixed(4), ah.toFixed(4), seed, p.fscale, p.turn, p.detail, p.curl, p.tangle, p.bundles, p.per, p.clustering, p.spread, p.length, p.step, o ? [o.x, o.y, o.w, o.h, o.z].join(',') : ''].join('|');
    const hit = strandCache.get(key);
    if (hit) return hit;
    const dirF = sampler(fieldGrid(aw, ah, seed, p));
    let dir = dirF;
    if (o) {
      // the frame's own field where the frame's strands are traced at 100 %, the region's past it
      const dirR = sampler(fieldGrid(aw, ah, seed, p, o));
      dir = (x, y, out) => (x >= -K.box && x <= aw + K.box && y >= -K.box && y <= ah + K.box ? dirF : dirR)(x, y, out);
    }
    const strands = [];
    const tile = (ti, tj) => {
      const own = ti === 0 && tj === 0, tx = ti * aw, ty = tj * ah;
      const tseed = own ? seed : (Math.imul(seed | 0, 0x7feb352d) ^ Math.imul(ti, 0x9e3779b1) ^ Math.imul(tj, 0x85ebca77)) | 0;
      const idBase = own ? 0 : 1e6 * (1 + (((ti + 512) & 1023) << 10 | ((tj + 512) & 1023)));
      tileStrands(aw, ah, tseed, p, dir, tx, ty, own, idBase, strands, o);
    };
    if (!o) tile(0, 0);
    else {
      for (let tj = Math.floor((o.y - K.box) / ah) - 1; tj <= Math.floor((o.y + o.h + K.box) / ah) + 1; tj++) {
        for (let ti = Math.floor((o.x - K.box) / aw) - 1; ti <= Math.floor((o.x + o.w + K.box) / aw) + 1; ti++) tile(ti, tj);
      }
    }
    const out = { strands, steps: Math.max(2, Math.round(p.length)) };
    if (strandCache.size > 6) strandCache.delete(strandCache.keys().next().value);
    strandCache.set(key, out);
    return out;
  }
  // One tile's bundles (the frame's own: tile 0, 0), its strands traced in dir and kept to the tile's
  // box (the frame's own and, with o, carried on through the region).
  function tileStrands(aw, ah, seed, p, dir, tx, ty, own, idBase, strands, o) {
    const r = PL.rng.create((seed ^ 0x5be0cd19) >>> 0);
    const gauss = () => { let u = 0, v = 0; while (u === 0) u = r.next(); v = r.next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const NT = PL.noise.get((seed ^ 0x1f83d9ab) >>> 0);
    const B = Math.max(1, Math.round(p.bundles)), N = Math.max(1, Math.round(p.per));
    const h = p.step / 1000, steps = Math.max(2, Math.round(p.length));
    const sd = (p.spread / 100) * K.spreadSd, tg = p.tangle / 100;
    const bx0 = tx - K.box, by0 = ty - K.box, bx1 = tx + aw + K.box, by1 = ty + ah + K.box;
    // where strands may run: the tile's box, or with o the region's (the frame's strands just carry on)
    const ex0 = o ? o.x - K.box : bx0, ey0 = o ? o.y - K.box : by0, ex1 = o ? o.x + o.w + K.box : bx1, ey1 = o ? o.y + o.h + K.box : by1;
    const centres = [];
    const d1 = [0, 0], d2 = [0, 0];
    const inF = (x, y) => x >= tx && x <= tx + aw && y >= ty && y <= ty + ah;
    // The share of Length that a strand traced from (x, y) spends in the frame.
    const score = (x, y) => {
      let n = 0;
      for (let k = 0; k < steps; k++) {
        dir(x, y, d1); let l = Math.hypot(d1[0], d1[1]) || 1;
        const mx = x + (d1[0] / l) * h * 0.5, my = y + (d1[1] / l) * h * 0.5;
        dir(mx, my, d2); l = Math.hypot(d2[0], d2[1]) || 1;
        x += (d2[0] / l) * h; y += (d2[1] / l) * h;
        if (x < bx0 || x > bx1 || y < by0 || y > by1) break;
        if (inF(x, y)) n++;
      }
      return n / steps;
    };
    const tries = Math.max(K.tries, Math.ceil(24 / B)); // with only a few bundles, look harder
    for (let b = 0; b < B; b++) {
      const anchor = centres.length && r.next() < p.clustering / 100 ? centres[Math.floor(r.next() * centres.length)] : null;
      // A few candidate starts (near an earlier bundle when clustering); keep the one whose
      // strands stay longest in the frame, so most strands run through it from the upstream side.
      let cx = 0, cy = 0, best = -1;
      for (let t = 0; t < tries; t++) {
        let x, y;
        if (anchor) { x = anchor[0] + gauss() * K.cluster; y = anchor[1] + gauss() * K.cluster; }
        else { x = tx + r.float(-0.08, aw + 0.08); y = ty + r.float(-0.08, ah + 0.08); }
        x = Math.max(bx0, Math.min(bx1, x)); y = Math.max(by0, Math.min(by1, y));
        const sc = score(x, y);
        if (sc > best) { best = sc; cx = x; cy = y; }
        if (sc >= K.goal) break;
      }
      centres.push([cx, cy]);
      const bw = Math.exp(0.15 * gauss()); // bundles differ a little in weight
      for (let s = 0; s < N; s++) {
        const id = idBase + b * N + s;
        const sx = cx + gauss() * sd, sy = cy + gauss() * sd;
        const ph1 = id * 7.31 + 0.5, ph2 = id * 3.17 + 41.3;
        const turnAt = (q) => tg * (K.tangleA[0] * NT.noise4(q * K.tangleF[0] + ph1, ph1, 0.3, 0) + K.tangleA[1] * NT.noise4(q * K.tangleF[1] + ph2, ph2, 2.1, 0));
        // Trace downstream (RK2) for Length steps or until the strand leaves the box.
        const pts = [sx, sy];
        let x = sx, y = sy, px = 0, py = 0, inBox = true, np0 = 0;
        for (let k = 0; k < steps; k++) {
          dir(x, y, d1);
          let l = Math.hypot(d1[0], d1[1]);
          if (l < 1e-6) { if (!k) break; d1[0] = px; d1[1] = py; l = 1; }
          let ux = d1[0] / l, uy = d1[1] / l;
          if (tg > 0) { const a = turnAt(k * h), ca = Math.cos(a), sa = Math.sin(a); const t = ux * ca - uy * sa; uy = ux * sa + uy * ca; ux = t; }
          dir(x + ux * h * 0.5, y + uy * h * 0.5, d2);
          l = Math.hypot(d2[0], d2[1]);
          let vx = l > 1e-6 ? d2[0] / l : ux, vy = l > 1e-6 ? d2[1] / l : uy;
          if (tg > 0) { const a = turnAt((k + 0.5) * h), ca = Math.cos(a), sa = Math.sin(a); const t = vx * ca - vy * sa; vy = vx * sa + vy * ca; vx = t; }
          x += vx * h; y += vy * h;
          px = vx; py = vy;
          if (x < ex0 || x > ex1 || y < ey0 || y > ey1) break;
          // (where it leaves the tile's own box: a moving strand runs only that far, as at 100 %)
          if (inBox && (x < bx0 || x > bx1 || y < by0 || y > by1)) { inBox = false; np0 = pts.length >> 1; }
          pts.push(x, y);
        }
        strands.push({ id, bundle: b, bw, pts: Float64Array.from(pts), np0: inBox ? pts.length >> 1 : np0 });
      }
    }
  }

  // Ramer-Douglas-Peucker on an open polyline (flat [x, y, ...]).
  function simplify(pts, tol) {
    const n = pts.length >> 1;
    if (n < 4 || tol <= 0) return Array.from(pts);
    const keep = new Uint8Array(n);
    keep[0] = keep[n - 1] = 1;
    const t2 = tol * tol, stack = [0, n - 1];
    while (stack.length) {
      const b = stack.pop(), a = stack.pop();
      const ax = pts[2 * a], ay = pts[2 * a + 1], dx = pts[2 * b] - ax, dy = pts[2 * b + 1] - ay, l2 = dx * dx + dy * dy || 1e-12;
      let best = -1, bd = t2;
      for (let i = a + 1; i < b; i++) {
        const cr = (pts[2 * i] - ax) * dy - (pts[2 * i + 1] - ay) * dx, d = (cr * cr) / l2;
        if (d > bd) { bd = d; best = i; }
      }
      if (best >= 0) { keep[best] = 1; stack.push(a, best, best, b); }
    }
    const out = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[2 * i], pts[2 * i + 1]);
    return out;
  }

  // The part of a polyline between arc lengths s0 and s1 (cumulative lengths in `cum`).
  function slice(pts, cum, s0, s1) {
    const n = cum.length;
    if (s1 <= s0 || n < 2) return null;
    const at = (s) => {
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
      const f = (s - cum[lo]) / (cum[hi] - cum[lo] || 1);
      return [lo, pts[2 * lo] + (pts[2 * hi] - pts[2 * lo]) * f, pts[2 * lo + 1] + (pts[2 * hi + 1] - pts[2 * lo + 1]) * f];
    };
    const [i0, ax, ay] = at(s0), [i1, bx, by] = at(s1);
    const out = [ax, ay];
    for (let i = i0 + 1; i <= i1; i++) out.push(pts[2 * i], pts[2 * i + 1]);
    out.push(bx, by);
    return out;
  }

  /* ---- build ------------------------------------------------------------------------ */
  // region (General's Rotation and Size): the part of the world to cover (see traceStrands)
  function build({ W, H, seed, p, colors, t = 0, anim, crisp, region }) {
    const n = colors.length;
    const scene = new PL.Scene(W, H, colors[0], 0);
    const L = Math.max(W, H), aw = W / L, ah = H / L, u = L / 1000;
    const C = PL.color;
    const { m: ms, k: mk } = split(n);
    const strandInks = Array.from({ length: ms }, (_, i) => 1 + i);
    const markInks = mk ? Array.from({ length: mk }, (_, i) => 1 + ms + i) : strandInks.slice();
    const o = region ? { x: region.x0 / L, y: region.y0 / L, w: (region.x1 - region.x0) / L, h: (region.y1 - region.y0) / L, z: region.z || 1 } : undefined;
    const { strands, steps } = traceStrands(aw, ah, seed, p, o);
    const light = isLight(colors[0]);
    const [gl] = C.hexToLch(colors[0]);

    // Layers come in a few passes, so inks interleave (no ink sits on top of every other)
    // as they would if every strand and mark were drawn in turn. In each strand pass the
    // faintest ink is at the bottom; the other inks take turns on top.
    const contrast = (ci) => { const [l, c] = C.hexToLch(colors[ci]); return Math.abs(l - gl) + 0.6 * c; };
    const order = strandInks.slice().sort((a, b) => contrast(a) - contrast(b));
    // Moving strands run in the palette's brightest inks (the lightest ones on a dark ground).
    const pop = (ci) => { const [l, c] = C.hexToLch(colors[ci]); return light ? c + 0.15 * (1 - Math.abs(l - 0.7)) : l + 0.2 * c; };
    const bright = strandInks.slice().sort((a, b) => pop(b) - pop(a)).slice(0, 2);
    const SP = K.passes[0], MP = K.passes[1];
    const rot = (arr, k) => arr.map((_, i) => arr[(i + k) % arr.length]);
    const tag = (G, g) => (G > 1 ? ` · ${g + 1}` : '');
    const sLayers = [], mLayers = [], kLayers = [];
    for (let g = 0; g < SP; g++) {
      const ord = order.length > 2 ? [order[0], ...rot(order.slice(1), g)] : rot(order, g);
      const S = {}, M = {};
      for (const ci of ord) S[ci] = scene.layer(`strands-${ci}-${g}`, colors[ci], (ms > 1 ? `Strands ${ci}` : 'Strands') + tag(SP, g), ci);
      for (const ci of rot(bright, g)) M[ci] = scene.layer(`moving-${ci}-${g}`, colors[ci], (bright.length > 1 ? `Moving strands ${ci}` : 'Moving strands') + tag(SP, g), ci);
      sLayers.push(S); mLayers.push(M);
    }
    for (let g = 0; g < MP; g++) {
      const K2 = {};
      for (const ci of rot(markInks, g)) {
        K2[ci] = scene.layer(`marks-${ci}-${g}`, colors[ci], (mk > 1 ? `Marks ${ci - ms}` : 'Marks') + tag(MP, g), ci);
        K2[ci].cap = 'butt';
      }
      kLayers.push(K2);
    }

    const hairP = p.hairlines / 100, sv = 0.5 * (p.wvar / 100), leadP = K.leadP * (p.hierarchy / 100), moveP = p.moving / 100;
    const inkWeights = strandInks.map((_, i) => (i === 0 ? K.inkW : 1));
    const inkSum = inkWeights.reduce((a, b) => a + b, 0);
    const amt = Math.max(0, anim ? anim.amount : 0);
    const cycles = Math.max(1, Math.round(amt * K.cyclesK));
    const dashF = Math.min(0.75, Math.max(0.08, K.dashK * amt));
    const tt = ((t % 1) + 1) % 1;
    const fx0 = o ? o.x : 0, fy0 = o ? o.y : 0, fx1 = o ? o.x + o.w : aw, fy1 = o ? o.y + o.h : ah;
    const inFrame = (x, y, m) => x > fx0 - m && x < fx1 + m && y > fy0 - m && y < fy1 + m;

    const kinds = (Array.isArray(p.kinds) ? p.kinds : []).filter((x) => KINDS.some((q) => q.value === x));
    const rate = (p.symbols / 100) * K.markRate;
    const size = p.size, mw = K.markW * size * u;
    let nStrands = 0, nMarks = 0;

    for (const st of strands) {
      const pts = st.pts, np = pts.length >> 1;
      if (np < 2) continue;
      let vis = 0;
      for (let i = 0; i < np && vis < 6; i++) if (inFrame(pts[2 * i], pts[2 * i + 1], 0)) vis++;
      if (vis < 6) continue;
      nStrands++;
      const h = (k) => hash(seed, st.id, k, 0xf11a);
      // weight and ink
      let w, ci;
      if (h(1) < hairP) {
        w = p.weight * (K.hair[0] + (K.hair[1] - K.hair[0]) * h(2));
        ci = strandInks[strandInks.length - 1];
      } else {
        const g = Math.sqrt(-2 * Math.log(1 - h(3) * 0.999999)) * Math.cos(2 * Math.PI * h(4));
        w = p.weight * K.wMid * st.bw * Math.exp(sv * g);
        if (h(5) < leadP) w *= K.lead[0] + (K.lead[1] - K.lead[0]) * h(6);
        w = Math.max(w, p.weight * K.hair[1]);
        let q = h(7) * inkSum, idx = 0;
        while (idx < inkWeights.length - 1 && q > inkWeights[idx]) { q -= inkWeights[idx]; idx++; }
        ci = strandInks[idx];
      }
      const wpx = w * u;
      const px = new Float64Array(pts.length);
      for (let i = 0; i < pts.length; i++) px[i] = pts[i] * L;
      const pass = Math.floor(h(10) * SP) % SP;
      if (amt > 0 && h(8) < moveP) {
        // A moving strand: only a run of it shows, travelling from its start to its end (the end of its
        // tile's box, as at 100 %).
        const nm = Math.max(2, Math.min(np, st.np0 || np));
        const cum = new Float64Array(nm);
        for (let i = 1; i < nm; i++) cum[i] = cum[i - 1] + Math.hypot(px[2 * i] - px[2 * i - 2], px[2 * i + 1] - px[2 * i - 1]);
        const P = cum[nm - 1], D = dashF * P, s0 = ((cycles * tt) % 1) * P;
        const layer = mLayers[pass][bright[h(9) < 0.65 || bright.length < 2 ? 0 : 1]];
        const a = slice(px, cum, s0, Math.min(P, s0 + D));
        if (a) PL.Scene.stroke(layer, a, wpx);
        if (s0 + D > P) { const b = slice(px, cum, 0, s0 + D - P); if (b) PL.Scene.stroke(layer, b, wpx); }
      } else {
        PL.Scene.stroke(sLayers[pass][ci], simplify(px, (crisp === false ? 0.3 : K.simplify) / (o ? o.z : 1)), wpx); // (as fine on the screen when zoomed)
      }
      // Marks along the strand, more of them downstream.
      if (!kinds.length || rate <= 0) continue;
      for (let i = 1; i < np - 1; i++) {
        const q = hash(st.id, i, seed, 0x3a7c);
        if (q >= rate * (1 + (3 * i) / steps) / 2.5) continue;
        const x = pts[2 * i], y = pts[2 * i + 1];
        if (!inFrame(x, y, size / 1000)) continue;
        const r2 = (k) => hash(st.id * 977 + i, k, seed, 0x51ab);
        const kind = kinds[Math.floor(r2(1) * kinds.length) % kinds.length];
        const lay = kLayers[Math.floor(r2(6) * MP) % MP][markInks[Math.floor(r2(2) * markInks.length) % markInks.length]];
        const f = 0.6 + 0.8 * r2(3);
        let ang = Math.atan2(pts[2 * i + 3] - pts[2 * i - 1], pts[2 * i + 2] - pts[2 * i - 2]);
        let cx = x * L, cy = y * L;
        if (p.style === 'upright') ang = -Math.PI / 2;
        else if (p.style === 'scatter') {
          ang = r2(4) * Math.PI * 2;
          const off = (r2(5) - 0.5) * 2.2 * size * u;
          cx += -Math.sin(ang) * off; cy += Math.cos(ang) * off;
        }
        const ca = Math.cos(ang), sa = Math.sin(ang);
        if (kind === 'ring') {
          const rr = K.ring * size * f * u, ring = [];
          for (let k = 0; k < 20; k++) { const a = (k / 20) * Math.PI * 2; ring.push(cx + rr * Math.cos(a), cy + rr * Math.sin(a)); }
          PL.Scene.stroke(lay, ring, mw, true);
        } else if (kind === 'arrow') {
          const sd = K.arrow * size * f * u, hgt = sd * 0.866;
          // equilateral, centroid on the strand, pointing downstream (clockwise winding)
          const tip = [cx + ca * hgt * (2 / 3), cy + sa * hgt * (2 / 3)];
          const bxm = cx - ca * hgt / 3, bym = cy - sa * hgt / 3;
          lay.p.push([tip[0], tip[1], bxm - sa * sd / 2, bym + ca * sd / 2, bxm + sa * sd / 2, bym - ca * sd / 2]);
        } else if (kind === 'cross') {
          const l2 = K.cross * size * f * u / 2;
          for (const da of [Math.PI / 4, -Math.PI / 4]) {
            const c2 = Math.cos(ang + da) * l2, s2 = Math.sin(ang + da) * l2;
            PL.Scene.stroke(lay, [cx - c2, cy - s2, cx + c2, cy + s2], mw);
          }
        } else if (kind === 'tick') {
          const l2 = K.tick * size * f * u / 2;
          PL.Scene.stroke(lay, [cx - sa * l2, cy + ca * l2, cx + sa * l2, cy - ca * l2], mw);
        } else {
          const rr = K.arc * size * f * u, mid = ang + K.arcTurn, span = (K.arcSpan * Math.PI) / 180, arc = [];
          for (let k = 0; k <= 12; k++) { const a = mid - span / 2 + (span * k) / 12; arc.push(cx + rr * Math.cos(a), cy + rr * Math.sin(a)); }
          PL.Scene.stroke(lay, arc, mw);
        }
        nMarks++;
      }
    }
    scene.status = `${nStrands.toLocaleString()} strands · ${nMarks.toLocaleString()} marks`;
    return scene;
  }

  PL.tools.register({
    id: 'filament',
    name: 'Filament',
    kind: 'Backgrounds',
    tagline: 'Thread field',
    about: 'Streamlines traced through a noise field, bundled into ropes, with small glyph marks strung along them. Part of the strands run along their paths in the animation.',
    inks: {
      min: 2, max: 9, roles, fit, spec, add, generate,
      span: () => 1,
      hint: 'Ground first, then the strand inks (the last one draws the hairlines), then the mark inks.',
    },
    palettes: PALETTES,
    params: PARAMS,
    animLabel: 'Intensity',
    animHint: 'How long the moving strands are and how many times they run per loop (0: everything still)',
    defaults: {
      anim: { amount: 0.8, fps: 16, frames: 30 },
      fx: {},
      palette: 'Lagoon', // the preset the style opens on (its card's colors)
    },
    build,
    zoom: true, // draws any region of its world (General's Rotation and Size)
    _K: K,
    _clear: () => { fieldCache.clear(); strandCache.clear(); },
    _trace: traceStrands,
  });
})();
