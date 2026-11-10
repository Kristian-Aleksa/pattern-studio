/* ==========================================================================
   tools/culture.js — Culture: grainy colony fields.

   1. Colonies: each grows from a big "mother" cell with smaller cells budding
      off its rim (lobes, peanuts, satellites); a few cells float free. A
      smooth union melts neighbours together where they meet ("Fuse"), and a
      faint noise wobble keeps outlines organic.
   2. Bands: depth from the colony edge picks the ink — ground outside, then
      the rings in order (the outer ring widest), and the last ink fills the
      core. Big fused blobs get wide solid cores; a small cell's core barely
      forms, so it dissolves into speckle.
   3. Texture: every dot jitters its depth before choosing an ink, so each
      boundary dissolves into grain (widest at the colony edge). "Fine" and
      "Coarse" add monochrome film grain that re-scatters every frame;
      "Stipple" is a still print screen in pure inks.
   4. Animation: colonies glide along closed paths and buds wander around
      their mothers, so blobs merge and split as they pass each other.
      Frame 1 is the still image and the loop is seamless.
   General's Size and Rotation show more or less of the same world: past the
   frame the cells go on in tiles the size of their own box, every tile with
   colonies of its own (never a repeat); the dots stay the export's dots at
   any Size, so the grain is as fine zoomed in as out.
   ========================================================================== */
(() => {
  const PALETTES = [
    { name: 'Lagoon', colors: ['#F2F5F9', '#1B536B', '#81C7BE', '#0A2E1F'] },
    { name: 'Petri', colors: ['#F4EEE3', '#B4532A', '#F0B48C', '#4A1A10'] },
    { name: 'Moss', colors: ['#EEF0E4', '#4E6A2A', '#BACB8A', '#1B2911'] },
    { name: 'Bloom', colors: ['#F8F1F3', '#A3395A', '#F2A9BA', '#3B0E1F'] },
    { name: 'Cobalt', colors: ['#F1F3F8', '#2541A8', '#9FB5F2', '#0B1640'] },
    { name: 'Ochre', colors: ['#F6F0E3', '#97621A', '#EAC47E', '#3A2508'] },
    { name: 'Night', colors: ['#0D1117', '#245F8C', '#8FCBEA', '#F3F6FA'] },
    { name: 'Neon', colors: ['#0B0C10', '#1C6B47', '#3DFF8F', '#EFFFF4'] },
    { name: 'Sunset', colors: ['#FFF4EA', '#D9483A', '#FFB45E', '#521332'] },
    { name: 'Agar', colors: ['#F4EFE2', '#9DB7A6', '#2F4A3F'] },
    { name: 'Gram', colors: ['#F7F1F9', '#6635A3', '#F07998', '#2A1049'] },
  ];

  /* ---- color roles: ground, rings from the edge inward, core ----------- */
  function roles(n) {
    if (n <= 2) return ['Ground', 'Colony'];
    if (n === 3) return ['Ground', 'Ring', 'Core'];
    return ['Ground', ...Array.from({ length: n - 2 }, (_, i) => 'Ring ' + (i + 1)), 'Core'];
  }
  const spec = (n) => ({ ramp: Math.max(1, n - 1), accents: 0 });

  // "New colors": the rhythm that makes colonies read — a quiet ground, a deep
  // outer ring, lighter inner rings, and a core that contrasts with its ring.
  function generate(n, rng) {
    const C = PL.color;
    const h = rng.float(0, 360);
    const dark = rng.chance(0.25);
    const chroma = rng.pick([0.05, 0.08, 0.1, 0.12, 0.15]);
    const ground = dark ? C.lch(rng.float(0.12, 0.18), rng.float(0.01, 0.03), h) : C.lch(rng.float(0.95, 0.975), rng.float(0.004, 0.02), h + rng.float(-30, 30));
    if (n <= 2) return [ground, C.lch(dark ? rng.float(0.78, 0.9) : rng.float(0.22, 0.38), chroma, h)];
    const out = [ground];
    const R = n - 2;
    for (let k = 0; k < R; k++) {
      const deep = k % 2 === 0; // deep, light, deep, …
      const L = dark ? (deep ? rng.float(0.42, 0.52) : rng.float(0.72, 0.84)) : deep ? rng.float(0.34, 0.46) : rng.float(0.74, 0.84);
      out.push(C.lch(L, chroma * (deep ? 1 : 0.75), h + k * rng.float(-18, 18)));
    }
    const lastDeep = (R - 1) % 2 === 0;
    const coreL = dark ? (lastDeep ? rng.float(0.9, 0.96) : rng.float(0.3, 0.38)) : lastDeep ? rng.float(0.8, 0.9) : rng.float(0.16, 0.24);
    out.push(C.lch(coreL, chroma * 0.7, h + rng.float(-25, 25)));
    return out;
  }

  // + adds a ring just inside the existing rings (the core stays the core).
  // It stays in the palette's hue family and takes the lightness that sits
  // furthest from the inks you already have.
  function add(colors) {
    const C = PL.color;
    const c = colors.slice();
    const lab = c.map(C.hexToOklab);
    const rings = lab.length > 2 ? lab.slice(1, -1) : lab.slice(1);
    let sa = 0, sb = 0, sc = 0;
    for (const [, a, b] of rings) { sa += a; sb += b; sc += Math.hypot(a, b); }
    const chroma = Math.min(0.2, sc / Math.max(1, rings.length));
    const hue = (Math.atan2(sb, sa) * 180) / Math.PI;
    const dist = (a, b) => Math.hypot((a[0] - b[0]) * 2, a[1] - b[1], a[2] - b[2]); // lightness counts double
    let best = null, bestS = -Infinity;
    for (const dh of [0, 20, -20, 40, -40]) {
      for (let L = 0.22; L <= 0.95; L += 0.035) {
        const hex = C.lch(L, chroma, hue + dh);
        const o = C.hexToOklab(hex);
        const s = Math.min(...lab.map((x) => dist(o, x))) - 0.0006 * Math.abs(dh);
        if (s > bestS) { bestS = s; best = hex; }
      }
    }
    if (c.length >= 2) c.splice(c.length - 1, 0, best);
    else c.push(best);
    return c;
  }

  // Fit any palette onto n inks: keep the ground and the core, trim or add rings.
  function fit(colors, n) {
    let c = (colors || []).map(PL.color.normHex).filter(Boolean);
    if (!c.length) c = PALETTES[0].colors.slice();
    if (c.length === 1) c.push(PL.color.mix(c[0], PL.color.luminance(c[0]) > 0.35 ? '#000000' : '#FFFFFF', 0.75));
    if (c.length > n) return n <= 2 ? [c[0], c[c.length - 1]] : [...c.slice(0, n - 1), c[c.length - 1]];
    while (c.length < n) c = add(c);
    return c;
  }

  const S = (section, key, label, min, max, def, extra = {}) => ({ section, key, label, type: 'range', min, max, def, step: 1, ...extra });

  const PARAMS = [
    S('Cells', 'count', 'Count', 1, 150, 36, { rand: [16, 60], hint: 'How many cells' }),
    S('Cells', 'size', 'Size', 5, 100, 40, { unit: '%', rand: [28, 60], hint: 'Cell size, relative to the space between cells' }),
    S('Cells', 'fuse', 'Fuse', 0, 100, 62, { unit: '%', rand: [35, 85], hint: 'How readily neighbouring cells melt together' }),
    S('Rings', 'coverage', 'Coverage', 5, 100, 72, { unit: '%', rand: [58, 84], hint: 'How far the colonies spread across the frame' }),
    S('Rings', 'spread', 'Ring spread', 40, 400, 170, { unit: '%', rand: [110, 240], hint: 'Width of the rings around each core' }),
    S('Rings', 'edge', 'Edge', 0, 100, 30, { unit: '%', rand: [15, 55], hint: 'How wide the grainy blend between inks is' }),
    { section: 'Texture', key: 'kind', label: 'Kind', type: 'seg', def: 'fine', rand: false,
      options: [{ value: 'fine', label: 'Fine' }, { value: 'coarse', label: 'Coarse' }, { value: 'stipple', label: 'Stipple' }] },
    S('Texture', 'grain', 'Grain', 0, 100, 62, { unit: '%', rand: [40, 80], hint: 'Film grain: speckle in the blends and noise in the inks' }),
    S('Texture', 'dot', 'Dot size', 1, 8, 2, { unit: ' px', rand: false, hint: 'Size of each grain or stipple dot, in px at a 2048 px export (scales with the export size)' }),
  ];

  // Shape constants (in units of the cell spacing unless noted).
  const K = {
    bleed: 0.55,        // cells may sit this far outside the frame
    tries: 6,           // best-of-N scatter of colony centres: higher = more even
    clump: 3.5,         // cells per colony
    rBig: 1.75,         // mother cells are this much bigger
    budMin: 0.6, budVar: 0.8, // buds sit this far from their mother's centre (x mother radius)
    free: 0.2,          // share of cells that float free of any colony
    rMin: 0.7, rVar: 0.8, rPow: 1.5, // radius factor = rMin + rVar * u^rPow
    fuse: 0.2,          // smooth-union width at Fuse 100 %
    covBase: 0.11,      // edge offset at Coverage 72 %
    cov: 0.95,          // edge offset per unit of Coverage away from 72 %
    wob: 0.05, wobF: 1.3, // outline wobble amount and frequency
    ring: 0.13,         // outer ring width at Ring spread 100 % (x spacing)
    inner: 0.5,         // innermost ring width relative to the outer one
    edge0: 0.025, edgeK: 0.36, // dissolve half-width: (edge0 + edgeK * Edge) * (0.5 + 0.8 * Grain)
    innerEdge: 0.55,    // dissolve at ring boundaries relative to the colony edge
    coreExtra: 1.8,     // extra dissolve at the edge of a core that barely forms…
    mSoft: 0.18,        // …i.e. whose cell peaks less than this (x spacing) past the core level
    lum: 22,            // film-grain std (0–255 levels) at Grain 100 %
    drift: 0.3,         // drift path size at Amount 1 (x spacing)
    budDrift: 0.45,     // a bud's own wander on top of its colony's path
  };


  /* ---- cells: grouped into colonies, varied sizes, a closed drift path each */
  function makeCells(seed, count, uw, vh, size) {
    const rnd = PL.rng.create(seed ^ 0x2c1b3c6d);
    const spacing = Math.sqrt((uw * vh) / count);
    const nCol = Math.max(1, Math.round(count / K.clump));
    const colSp = Math.sqrt((uw * vh) / nCol);
    const m = spacing * K.bleed;
    // Colony centres: an even-ish scatter, so colonies keep some ground between them.
    const cols = [];
    for (let k = 0; k < nCol; k++) {
      let best = null, bestD = -1;
      for (let a = 0; a < K.tries; a++) {
        const x = -m + rnd.next() * (uw + 2 * m), y = -m + rnd.next() * (vh + 2 * m);
        let dmin = Infinity;
        for (const c of cols) {
          const d = (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y);
          if (d < dmin) dmin = d;
        }
        if (dmin > bestD) { bestD = dmin; best = { x, y }; }
      }
      cols.push(best);
    }
    const tw = Math.PI * 2;
    const cells = [];
    const rad = (big) => (size / 100) * spacing * (big ? K.rBig : 1) * (K.rMin + K.rVar * Math.pow(rnd.next(), K.rPow));
    for (let k = 0; k < count; k++) {
      // Each colony grows from a big "mother" cell; the rest bud off a mother's
      // rim (lobes, peanuts, satellites) or, now and then, float free.
      let c;
      if (k < nCol) {
        const col = cols[k];
        c = { x: col.x, y: col.y, r: rad(true) };
      } else if (rnd.next() < K.free) {
        c = { x: -m + rnd.next() * (uw + 2 * m), y: -m + rnd.next() * (vh + 2 * m), r: rad(false) };
      } else {
        const mi = Math.floor(rnd.next() * nCol), mo = cells[mi];
        const a = rnd.next() * tw;
        const d = mo.r * (K.budMin + K.budVar * rnd.next());
        c = { x: mo.x + d * Math.cos(a), y: mo.y + d * Math.sin(a), r: rad(false), mo: mi };
      }
      // Drift: two harmonics per axis give each cell its own closed loop
      // (ellipses, kidneys, figure-eights), some running backwards.
      c.ax = 0.55 + 0.45 * rnd.next(); c.ay = 0.55 + 0.45 * rnd.next();
      c.bx = 0.4 * rnd.next(); c.by = 0.4 * rnd.next();
      c.p1 = rnd.next() * tw; c.p2 = rnd.next() * tw; c.p3 = rnd.next() * tw; c.p4 = rnd.next() * tw;
      c.dir = rnd.next() < 0.5 ? 1 : -1;
      cells.push(c);
    }
    return { cells, spacing };
  }

  function driftAt(c, ang) {
    const a = ang * c.dir;
    return [
      c.ax * Math.cos(a + c.p1) + c.bx * Math.cos(2 * a + c.p2),
      c.ay * Math.sin(a + c.p3) + c.by * Math.sin(2 * a + c.p4),
    ];
  }

  /* ---- fused distance field on a coarse grid (cached for the preview) --- */
  // map (General's Rotation and Size): the canvas (map.cw x map.ch) and the part of the world it shows
  // (its pixel (x, y) is the world's (map.x0 + x map.s, map.y0 + y map.s), frame pixels). The grid is then
  // as fine on the canvas as at 100 % and fixed to the world; the cells carry on past the frame in tiles
  // the size of their box, each tile with cells of its own (its own seed; the frame's tile is the frame's).
  const fieldCache = new Map();
  const tileSeed = (seed, ti, tj) => (ti || tj ? (Math.imul(seed | 0, 0x2545f491) ^ Math.imul(ti, 0x9e3779b1) ^ Math.imul(tj, 0x85ebca77)) | 0 : seed);
  function field({ W, H, seed, p, t, anim, map }) {
    const L = Math.max(W, H), unit = L / 1080;
    const gpx = Math.max(2, Math.round(7 * unit)); // grid spacing in px (the field is smooth)
    const amt = Math.max(0, anim ? anim.amount : 0);
    const key = [W, H, seed, p.count, p.size, p.fuse, amt, Math.round(t * 1e6), map ? [map.cw, map.ch, map.s, map.x0, map.y0].join(',') : ''].join('|');
    const hit = fieldCache.get(key);
    if (hit) return hit;

    const uw = W / L, vh = H / L;
    const count = Math.max(1, Math.round(p.count));
    const { cells, spacing } = makeCells(seed, count, uw, vh, p.size);
    const ang = t * Math.PI * 2;
    // Frame 1 (t = 0) is the still image: every path starts at its cell's home.
    const amp = amt * K.drift * spacing;
    // Colonies glide as a whole; a bud also wanders a little around its mother.
    const move = (c) => { const [x1, y1] = driftAt(c, ang), [x0, y0] = driftAt(c, 0); return [x1 - x0, y1 - y0]; };
    const place = (cells, ox, oy, cx, cy, cr, keep) => {
      for (let k = 0; k < cells.length; k++) {
        const c = cells[k];
        let [dx, dy] = move(c);
        if (c.mo !== undefined) {
          const [mx, my] = move(cells[c.mo]);
          dx = mx + K.budDrift * dx; dy = my + K.budDrift * dy;
        }
        const x = c.x + amp * dx + ox, y = c.y + amp * dy + oy;
        if (keep && !keep(x, y)) continue;
        cx.push(x); cy.push(y); cr.push(c.r);
      }
    };

    const N = PL.noise.get(seed);
    const R = amt * 0.3, zc = R * (Math.cos(ang) - 1), wc = R * Math.sin(ang);
    const wob = spacing * K.wob, wf = K.wobF / spacing;
    const kf = Math.max(1e-5, (p.fuse / 100) * spacing * K.fuse); // smooth-union width
    const cut = kf * 6.5; // exp(-6.5) ≈ 0.0015: farther cells change nothing visible

    if (!map) {
      const cx = new Float32Array(count), cy = new Float32Array(count), cr = new Float32Array(count);
      { const X = [], Y = [], Rr = []; place(cells, 0, 0, X, Y, Rr, null); cx.set(X); cy.set(Y); cr.set(Rr); }
      const gw = Math.ceil(W / gpx) + 3, gh = Math.ceil(H / gpx) + 3; // point (i, j) sits at ((i-1)·gpx, (j-1)·gpx)
      const D = new Float32Array(gw * gh), P = new Float32Array(gw * gh);
      const dist = new Float32Array(count);
      for (let j = 0; j < gh; j++) {
        const y0 = ((j - 1) * gpx) / L;
        for (let i = 0; i < gw; i++) {
          const x0 = ((i - 1) * gpx) / L;
          const x = x0 + wob * N.noise4(x0 * wf, y0 * wf, zc, wc);
          const y = y0 + wob * N.noise4(x0 * wf + 31.4, y0 * wf - 17.2, zc + 5.1, wc - 2.3);
          let dmin = Infinity;
          for (let k = 0; k < count; k++) {
            const dx = x - cx[k], dy = y - cy[k];
            const d = Math.sqrt(dx * dx + dy * dy) - cr[k];
            dist[k] = d;
            if (d < dmin) dmin = d;
          }
          // Exponential smooth-min: cells melt together over a width of ~kf.
          // P blends the radii of the cells that dominate here: the local peak depth.
          let sum = 0, sumR = 0;
          for (let k = 0; k < count; k++) {
            const e = dist[k] - dmin;
            if (e < cut) { const wgt = Math.exp(-e / kf); sum += wgt; sumR += wgt * cr[k]; }
          }
          D[j * gw + i] = dmin - kf * Math.log(sum);
          P[j * gw + i] = sumR / sum;
        }
      }
      const out = { D, P, gw, gh, gpx, spacing, L, g: gpx, gi0: -1, gj0: -1 };
      if (fieldCache.size > 48) fieldCache.delete(fieldCache.keys().next().value);
      fieldCache.set(key, out);
      return out;
    }

    // ---- a part of the world: grid point (i, j) sits at ((gi0 + i) g, (gj0 + j) g), frame px
    const ms = map.s, g = gpx * ms;
    const gi0 = Math.floor(map.x0 / g) - 1, gj0 = Math.floor(map.y0 / g) - 1;
    const gw = Math.ceil((map.x0 + map.cw * ms) / g) - gi0 + 3, gh = Math.ceil((map.y0 + map.ch * ms) / g) - gj0 + 3;
    // the cells that can matter there (long-edge units): a cell further than B from a point changes
    // nothing that shows at it (it lies past the smooth union's reach of anything inked)
    const rmax = (p.size / 100) * spacing * K.rBig * (K.rMin + K.rVar);
    const B = rmax + cut + 1.2 * spacing + 2 * wob;
    const X0 = (gi0 * g) / L - B, X1 = ((gi0 + gw) * g) / L + B, Y0 = (gj0 * g) / L - B, Y1 = ((gj0 + gh) * g) / L + B;
    const m = spacing * K.bleed, TW = uw + 2 * m, TH = vh + 2 * m; // a tile: the box the frame's cells are scattered over
    const E = rmax * (K.budMin + K.budVar) + 4 * amp + spacing; // how far a cell can stray from its tile's box
    const X = [], Y = [], Rr = [];
    const keep = (x, y) => x >= X0 && x <= X1 && y >= Y0 && y <= Y1;
    for (let tj = Math.ceil((Y0 - E + m) / TH - 1); tj <= Math.floor((Y1 + E + m) / TH); tj++) {
      for (let ti = Math.ceil((X0 - E + m) / TW - 1); ti <= Math.floor((X1 + E + m) / TW); ti++) {
        place(ti || tj ? makeCells(tileSeed(seed, ti, tj), count, uw, vh, p.size).cells : cells, ti * TW, tj * TH, X, Y, Rr, keep);
      }
    }
    // the cells by bucket (B wide): a point reads the 3 x 3 buckets round its own
    const nbx = Math.max(1, Math.ceil((X1 - X0) / B)), nby = Math.max(1, Math.ceil((Y1 - Y0) / B)), nc = X.length;
    const start = new Int32Array(nbx * nby + 1), order = new Int32Array(nc), bk = new Int32Array(nc);
    for (let k = 0; k < nc; k++) {
      const bi = Math.min(nbx - 1, Math.max(0, Math.floor((X[k] - X0) / B))), bj = Math.min(nby - 1, Math.max(0, Math.floor((Y[k] - Y0) / B)));
      bk[k] = bj * nbx + bi; start[bk[k] + 1]++;
    }
    for (let q = 0; q < nbx * nby; q++) start[q + 1] += start[q];
    { const fill = start.slice(0, nbx * nby); for (let k = 0; k < nc; k++) order[fill[bk[k]]++] = k; }
    const cx = Float64Array.from(X), cy = Float64Array.from(Y), cr = Float64Array.from(Rr);
    const D = new Float32Array(gw * gh), P = new Float32Array(gw * gh);
    const dist = new Float64Array(nc), rad = new Float64Array(nc);
    for (let j = 0; j < gh; j++) {
      const y0 = ((gj0 + j) * g) / L;
      for (let i = 0; i < gw; i++) {
        const x0 = ((gi0 + i) * g) / L;
        const x = x0 + wob * N.noise4(x0 * wf, y0 * wf, zc, wc);
        const y = y0 + wob * N.noise4(x0 * wf + 31.4, y0 * wf - 17.2, zc + 5.1, wc - 2.3);
        const bi = Math.floor((x - X0) / B), bj = Math.floor((y - Y0) / B);
        let dmin = Infinity, nn = 0;
        for (let qj = Math.max(0, bj - 1); qj <= Math.min(nby - 1, bj + 1); qj++) {
          for (let qi = Math.max(0, bi - 1); qi <= Math.min(nbx - 1, bi + 1); qi++) {
            const q = qj * nbx + qi;
            for (let a = start[q]; a < start[q + 1]; a++) {
              const k = order[a], dx = x - cx[k], dy = y - cy[k];
              const d = Math.sqrt(dx * dx + dy * dy) - cr[k];
              dist[nn] = d; rad[nn++] = cr[k];
              if (d < dmin) dmin = d;
            }
          }
        }
        if (!nn) { D[j * gw + i] = 1e6; P[j * gw + i] = 0; continue; } // nothing near: ground
        let sum = 0, sumR = 0;
        for (let a = 0; a < nn; a++) {
          const e = dist[a] - dmin;
          if (e < cut) { const wgt = Math.exp(-e / kf); sum += wgt; sumR += wgt * rad[a]; }
        }
        D[j * gw + i] = dmin - kf * Math.log(sum);
        P[j * gw + i] = sumR / sum;
      }
    }
    const out = { D, P, gw, gh, gpx, spacing, L, g, gi0, gj0 };
    if (fieldCache.size > 48) fieldCache.delete(fieldCache.keys().next().value);
    fieldCache.set(key, out);
    return out;
  }

  // Ring boundaries (depth from the colony edge, in long-edge units) for n inks.
  function boundaries(n, spacing, p) {
    const b = [0];
    const R = n - 2;
    if (R <= 0) return b;
    const W = (p.spread / 100) * spacing * K.ring;
    let acc = 0;
    for (let k = 0; k < R; k++) {
      const w = R === 1 ? W * 1.25 : W * (1 - (1 - K.inner) * (k / (R - 1)));
      acc += w;
      b.push(acc);
    }
    return b;
  }

  /* ---- grain tables: bell-shaped noise, looked up by hash bits ----------- */
  const JIT = new Float32Array(4096), LUM = new Float32Array(4096);
  {
    const r = PL.rng.mulberry32(0x1d872b41);
    for (let i = 0; i < 4096; i++) {
      JIT[i] = (r() + r() + r()) / 1.5 - 1; // [-1, 1], std 1/3
      LUM[i] = r() + r() + r() - 1.5;       // [-1.5, 1.5], std 1/2
    }
  }

  /* ---- paint ---------------------------------------------------------------- */
  // The live preview repaints at the same size over and over: reuse its pixel buffer.
  let pvImg = null;
  function previewImage(ctx, W, H) {
    if (!pvImg || pvImg.width !== W || pvImg.height !== H) pvImg = ctx.createImageData(W, H);
    return pvImg;
  }

  // `refL` (preview only) is the export's long edge: the preview then uses the
  // export's dot grid, scaled down, so it shows the same grain as the file.
  // map (General's Rotation and Size): the canvas (map.cw x map.ch) and the part of the world it shows.
  // The dots stay the export's dots on the canvas whatever the Size (counted from the world's corner),
  // each reading the world at its middle: the grain is as fine zoomed in as out.
  function paint({ ctx, W, H, seed, p, colors, t = 0, anim, frame = 0, transparent = false, preview = false, refL, map }) {
    const F = field({ W, H, seed, p, t, anim, map });
    const { D, P, gw, gh, gpx, spacing, L } = F;
    const n = colors.length;
    const rgb = colors.map(PL.color.hexToRgb);
    const R8 = Int32Array.from(rgb.map((c) => c[0])), G8 = Int32Array.from(rgb.map((c) => c[1])), B8 = Int32Array.from(rgb.map((c) => c[2]));
    const A8 = Int32Array.from(rgb.map((_, i) => (transparent && i === 0 ? 0 : 255)));

    const T = spacing * (K.covBase + K.cov * (p.coverage / 100 - 0.72)); // colony edge sits at D = T
    const bnd = Float64Array.from(boundaries(n, spacing, p));
    const nb = bnd.length; // = n - 1 boundaries
    const e = p.edge / 100, g = p.grain / 100;
    const a0 = spacing * (K.edge0 + K.edgeK * e) * (0.5 + 0.8 * g);
    const amp = new Float64Array(nb);
    for (let k = 0; k < nb; k++) amp[k] = k === 0 ? a0 : a0 * K.innerEdge;
    // A core that barely forms (a small cell) dissolves into speckle; big cores stay solid.
    const kc = nb >= 3 ? nb - 1 : -1, bCore = kc > 0 ? bnd[kc] : 0, mSoft = 1 / (K.mSoft * spacing);
    const kind = p.kind === 'stipple' ? 2 : p.kind === 'coarse' ? 1 : 0;
    const lumA = kind === 2 ? 0 : g * K.lum; // grain std in 0–255 levels
    const flick = kind === 2 ? 0 : (frame | 0) + 1; // film grain re-scatters every frame; stipple stays put

    // Dot pitch in px. Exports: whole pixels. Preview: the export's dot grid
    // scaled to the preview (can be fractional; never finer than 1 px).
    const dotAt = (len) => Math.max(1, Math.round(p.dot * (len / 2048))); // Dot size is in px at a 2048 px export
    const dpx = preview && refL > L ? Math.max(1, (dotAt(refL) * L) / refL) : dotAt(L);

    const cw = map ? map.cw : W, ch = map ? map.ch : H;
    const img = preview ? previewImage(ctx, cw, ch) : ctx.createImageData(cw, ch);
    const px32 = new Uint32Array(img.data.buffer);
    const sx = 1 / gpx;
    const fs = Math.imul(flick, 0xcb1ab31f) ^ Math.imul(seed | 0, 0x9e3779b1);
    const packed = Uint32Array.from(R8, (r, i) => ((A8[i] << 24) | (B8[i] << 16) | (G8[i] << 8) | r) >>> 0);
    // Film grain: every ink pre-mixed with 4096 noise levels (clamped), indexed by hash bits.
    let grainLUT = null;
    if (lumA > 0) {
      grainLUT = new Uint32Array(n * 4096);
      const c8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
      for (let i = 0; i < n; i++) {
        for (let q = 0; q < 4096; q++) {
          const ln = Math.round(LUM[q] * lumA * 2); // std = lumA
          grainLUT[(i << 12) | q] = ((A8[i] << 24) | (c8(B8[i] + ln) << 16) | (c8(G8[i] + ln) << 8) | c8(R8[i] + ln)) >>> 0;
        }
      }
    }
    const coreReach = kc > 0 ? a0 * (K.innerEdge + K.coreExtra) : 0;

    // The dots along each axis: their number (for the hashes), their pixels and their place in the
    // field's grid (cell and weight). Frame: dot b covers px round(b dpx) .. round((b + 1) dpx) and reads
    // the field at its middle. A part of the world: the same dots, counted from the world's corner
    // (off: where the canvas starts, in canvas pixels), reading the world at their middles.
    const axis = (len, wlen, gn, off, g0) => {
      const b0 = map ? Math.floor(off / dpx) : 0, nB = map ? Math.ceil((len + off) / dpx) - b0 : Math.ceil(len / dpx - 1e-9);
      const id = new Int32Array(nB), I = new Int32Array(nB), Fr = new Float32Array(nB), P0 = new Int32Array(nB), P1 = new Int32Array(nB);
      for (let k = 0; k < nB; k++) {
        const b = b0 + k;
        let gx;
        if (!map) { gx = Math.min(wlen - 1, (b + 0.5) * dpx) * sx + 1; P0[k] = Math.round(b * dpx); P1[k] = Math.min(len, Math.round((b + 1) * dpx)); }
        else { gx = ((b + 0.5) * dpx * map.s) / F.g - g0; if (gx < 0) gx = 0; P0[k] = Math.max(0, Math.round(b * dpx - off)); P1[k] = Math.min(len, Math.round((b + 1) * dpx - off)); }
        if (gx > gn - 1.001) gx = gn - 1.001;
        id[k] = b; I[k] = gx | 0; Fr[k] = gx - (gx | 0);
      }
      return { nB, id, I, Fr, P0, P1 };
    };
    const AX = axis(cw, W, gw, map ? map.x0 / map.s : 0, F.gi0), AY = axis(ch, H, gh, map ? map.y0 / map.s : 0, F.gj0);
    const bw = AX.nB, bh = AY.nB;

    for (let ky = 0; ky < bh; ky++) {
      const y0 = AY.P0[ky], y1 = AY.P1[ky];
      if (y1 <= y0) continue;
      const by = AY.id[ky];
      const j0 = AY.I[ky], fy = AY.Fr[ky], row = j0 * gw;
      const hy = Math.imul(by, 0xd8163841) ^ fs;
      const hyc = Math.imul(by >> 1, 0xd8163841) ^ fs ^ 0x51ed270b;
      for (let kx = 0; kx < bw; kx++) {
        const x0 = AX.P0[kx], x1 = AX.P1[kx]; // (an empty dot still counts: it moves the core's speckle on)
        const bx = AX.id[kx];
        const fx = AX.Fr[kx], k0 = row + AX.I[kx];
        const top = D[k0] + (D[k0 + 1] - D[k0]) * fx;
        const bot = D[k0 + gw] + (D[k0 + gw + 1] - D[k0 + gw]) * fx;
        const depth = T - (top + (bot - top) * fy); // > 0 inside a colony
        if (kc > 0 && depth > bCore - coreReach && depth < bCore + coreReach) {
          const pt = P[k0] + (P[k0 + 1] - P[k0]) * fx, pb = P[k0 + gw] + (P[k0 + gw + 1] - P[k0 + gw]) * fx;
          const sp = 1 - (pt + (pb - pt) * fy + T - bCore) * mSoft;
          amp[kc] = a0 * (K.innerEdge + K.coreExtra * (sp < 0 ? 0 : sp > 1 ? 1 : sp));
        }

        // Jitter in [-1, 1]: bell-shaped film grain, clumped grain, or a still print screen.
        let h = Math.imul(bx, 0x8da6b343) ^ hy;
        h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
        h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
        h ^= h >>> 16;
        let jit;
        if (kind === 2) {
          let q = (0.5 + bx * 0.7548776662 + by * 0.569840291) % 1;
          if (q < 0) q += 1; // (dots left of or above the frame's corner)
          jit = (q * 2 - 1) * 0.6;
        } else {
          jit = JIT[h & 4095];
          if (kind === 1) {
            let hc = Math.imul(bx >> 1, 0x8da6b343) ^ hyc;
            hc = Math.imul(hc ^ (hc >>> 16), 0x7feb352d);
            hc = Math.imul(hc ^ (hc >>> 15), 0x846ca68b);
            hc ^= hc >>> 16;
            jit = 0.35 * jit + 0.65 * JIT[hc & 4095];
            h = (hc & 0xffff0000) | (h & 0xffff); // coarse film grain: luminance per 2×2 clump
          }
        }

        let idx = 0;
        for (let k = 0; k < nb; k++) if (depth + jit * amp[k] > bnd[k]) idx = k + 1;
        if (idx > n - 1) idx = n - 1;

        const v = grainLUT ? grainLUT[(idx << 12) | ((h >>> 16) & 4095)] : packed[idx];
        for (let y = y0; y < y1; y++) {
          for (let o = y * cw + x0, e2 = y * cw + x1; o < e2; o++) px32[o] = v;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    if (preview && refL > L) { // report the export's dot count, not the preview's
      const de = dotAt(refL), k = refL / L;
      return { dots: Math.ceil((W * k) / de - 1e-6) * Math.ceil((H * k) / de - 1e-6) };
    }
    if (map) return { dots: Math.ceil(W / dpx - 1e-9) * Math.ceil(H / dpx - 1e-9) }; // the frame's own dots
    return { dots: bw * bh };
  }

  PL.tools.register({
    id: 'culture',
    name: 'Culture',
    kind: 'Backgrounds',
    tagline: 'Grainy colony fields',
    about: 'Soft cells that fuse where they meet, banded into rings of your inks around a solid core, and buried in film grain or print stipple.',
    raster: true,
    inks: {
      min: 2, max: 8, roles, fit, spec, add, generate,
      span: (n) => n, // Invert reverses the whole order (ground <-> core)
      hint: 'Order sets the bands: ground first, then rings from the edge inward, then the core.',
    },
    palettes: PALETTES,
    params: PARAMS,
    defaults: {
      anim: { amount: 0.6, fps: 12, frames: 36 },
      fx: {},
      palette: 'Cobalt', // the preset the style opens on (its card's colors)
    },
    paint,
    zoom: true, // paints any part of its world (General's Rotation and Size)
    _K: K, // tuning constants (tests)
    _clearCache: () => fieldCache.clear(),
  });
})();
