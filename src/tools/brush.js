/* ==========================================================================
   tools/brush.js — Brush: layered brush strokes (pixel texture: PNG, video).

   1. Layers: the frame is painted in layers from the back to the front, one
      paint each, like a landscape: the first covers everything above the
      first edge, each later one everything below its own edge, over the
      layers behind it. The main layer takes Horizon of the frame's height
      and the others share out the rest (the front one, when it isn't the
      main one, a little more); Weight picks the main layer: the top one at
      100 %, then down through the layers to the bottom one at 0 % (in
      between, the edges slide from one layout to the next). Tilt slopes
      the edges and Hills makes them rise and fall, each its own way.
   2. Ground coat: each layer starts with a flat coat of its paint.
   3. Strokes: over it, brush strokes on a loose grid that runs at Angle
      (0°: lying flat, 90°: upright, leaning right in between), each layer
      and each stroke a little off it (Spread; in the first layer they
      cross more freely), Brush size wide and Length long, laid in a
      shuffled order. Each stroke carries a little of another paint (the
      canvas's or a neighbouring layer's) and each of its bristles is a
      shade lighter or darker, so the strokes show; the bristles touch down
      and lift off at their own points, so the ends are ragged.
   4. Fringe: along each layer's top edge, flicks of its paint rise into the
      layer behind it in clumps, leaning with its strokes and tapering to a
      point, like grass against the sky.
   5. Mix: in soft patches, drier strokes in the paints of the neighbouring
      layers are laid into each layer (fewer in the first one), and the
      flicks there take them too; Mix also sets how much other paint each
      stroke carries.
   6. Paint: Dry brush makes the bristles carry less paint, unevenly, so the
      strokes streak and break up toward their ends and what is beneath
      shows through. Texture leaves the canvas's tooth bare in fine specks,
      in loose clumps, the same specks through every layer, so the canvas
      (the first color) shows through everywhere.
   7. Animation (Wind): gusts run across the frame from left to right, and
      every layer sways back and forth in them like a tuft of grass, twice
      a loop: rooted along its bottom edge, it bends downwind and back, the
      more the higher up it (its top edge sways furthest, dipping a little
      as it bends), and each of its strokes leans with it and flexes round
      its own root like a tuft of its own. The flicks ride the top edges
      and bend on top of that, their tips curling over. The near layers
      move more than the far ones, and the canvas stays put. Every movement
      is measured from the still picture, so frame 1 is the still picture
      at any Wind. 120 frames at 26 a second; seamless; Wind 0 holds still.
      Each frame only works out the wind and lays down strokes painted once
      (sprites), so the animation plays smoothly.
   Sizes go with the frame's area and edges with its height, so another
   frame shape keeps the same painting.
   ========================================================================== */
(() => {
  const { hash } = PL.rng;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (e0, e1, x) => {
    let t = (x - e0) / (e1 - e0);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return t * t * (3 - 2 * t);
  };

  // The canvas, then a paint for each layer from the back (the top of the frame) to the front.
  const PALETTES = [
    { name: 'Meadow', colors: ['#F7F2E7', '#1F6CEA', '#F3A08A', '#86B33F', '#1E6A2C', '#EDB862'] },
    { name: 'Hillside', colors: ['#FAF4E9', '#1C8FEC', '#F6A43A', '#6E8B24', '#F3A675', '#1B2616'] },
    { name: 'Pasture', colors: ['#F4F0DD', '#A8CBEA', '#A8C24F', '#E2AC48', '#6E9A34', '#2F5118'] },
    { name: 'Harvest', colors: ['#FBF2DC', '#38A6EF', '#F8D58C', '#F38A57', '#C49A1A', '#7A8B35'] },
    { name: 'Coast', colors: ['#F1ECE2', '#F38A60', '#4CD6CE', '#26221D', '#E9A955', '#8E8379'] },
    { name: 'Lavender', colors: ['#F6F1F4', '#8A97E8', '#D59BD8', '#F2B8C6', '#7FA66F', '#3E5A3B'] },
    { name: 'Tide', colors: ['#F2F3EE', '#A5D5E8', '#2D7EA2', '#F3E2C2', '#E27D5F', '#3D405B'] },
    { name: 'Autumn', colors: ['#F7EFE2', '#EAB54D', '#D24A5C', '#9C2B16', '#53A3A8', '#2F2C30'] },
    { name: 'Dusk', colors: ['#1C1A2B', '#F08A5D', '#F6C35B', '#B83B5E', '#6A2C70', '#2E8A8A'] },
    { name: 'Mono', colors: ['#F3F2EE', '#BEBEBA', '#8E8E8A', '#D9D9D5', '#5F5F5C', '#2F2F2D'] },
  ];

  /* ---- color roles -------------------------------------------------------------------- */
  const roles = (n) => ['Canvas', ...Array.from({ length: n - 1 }, (_, i) => 'Layer ' + (i + 1))];
  const spec = (n) => ({ ramp: 1, accents: Math.max(1, n - 1) });

  // "New colors": a pale canvas (now and then a deep one), then mostly a landscape (a blue, teal or sunset
  // sky over fields of greens, ochres, sands and earths), now and then paints that step round the color
  // wheel; light and deep by turns, so neighbouring layers stand apart.
  function generate(n, rng) {
    const C = PL.color;
    const dark = rng.chance(0.12), land = rng.chance(0.7);
    const out = [dark ? C.lch(rng.float(0.17, 0.23), rng.float(0.01, 0.03), rng.float(0, 360)) : C.lch(rng.float(0.95, 0.975), rng.float(0.008, 0.02), rng.float(60, 95))];
    let h = land ? rng.pick([rng.float(225, 260), rng.float(195, 220), rng.float(35, 60)]) : rng.float(0, 360), light = rng.chance(0.5);
    for (let k = 0; k < n - 1; k++) {
      const L = land && k === 0 ? rng.float(0.62, 0.8) : light ? rng.float(0.72, 0.86) : rng.float(0.42, 0.6); // (a landscape's sky is never deep)
      if (land && k === 0) light = true;
      out.push(C.lch(L, rng.float(0.09, 0.19) * (L > 0.8 ? 0.8 : 1), h));
      h = land ? rng.pick([rng.float(105, 150), rng.float(70, 100), rng.float(45, 70), rng.float(20, 45)]) : h + rng.sign() * rng.float(55, 150);
      light = !light;
    }
    return out;
  }

  // + adds a layer at the front, in a hue the paints don't have yet, light behind a deep one and deep behind a light one.
  function add(colors) {
    const C = PL.color;
    const c = colors.slice();
    const hues = c.slice(1).map((x) => C.hexToLch(x)[2]);
    let best = 0, bd = -1;
    for (let h = 0; h < 360; h += 10) {
      const d = hues.length ? Math.min(...hues.map((x) => Math.abs((((h - x) % 360) + 540) % 360 - 180))) : 180;
      if (d > bd) { bd = d; best = h; }
    }
    const last = c.length > 1 ? C.hexToLch(c[c.length - 1])[0] : 0.5;
    c.push(C.lch(last > 0.66 ? 0.5 : 0.8, 0.13, best));
    return c;
  }

  function fit(colors, n) {
    let c = (colors || []).map(PL.color.normHex).filter(Boolean);
    if (!c.length) c = PALETTES[0].colors.slice();
    if (c.length === 1) c.push(PL.color.mix(c[0], PL.color.luminance(c[0]) > 0.35 ? '#000000' : '#FFFFFF', 0.7));
    if (c.length >= n) return c.slice(0, n);
    while (c.length < n) c = add(c);
    return c;
  }

  /* ---- settings -------------------------------------------------------------------------- */
  const S = (section, key, label, min, max, def, extra = {}) => ({ section, key, label, type: 'range', min, max, def, step: 1, ...extra });
  const PARAMS = [
    S('Layers', 'horizon', 'Horizon', 10, 85, 50, { unit: '%', rand: [25, 60], hint: 'How much of the frame the main layer takes (Weight picks which; at 100 % it is the top one)' }),
    S('Layers', 'weight', 'Weight', 0, 100, 73, { unit: '%', rand: [0, 100], hint: 'Which layer is the main, widest one: the top one at 100 %, down through the layers to the bottom one at 0 %' }),
    S('Layers', 'tilt', 'Tilt', -30, 30, -9, { unit: '°', rand: [-14, 14], hint: "How far the layers' edges slope (positive: down to the right)" }),
    S('Layers', 'hills', 'Hills', 0, 100, 37, { unit: '%', rand: [15, 80], hint: "How much the layers' edges rise and fall" }),
    S('Strokes', 'brush', 'Brush size', 10, 100, 41, { rand: [25, 65], hint: 'How wide the strokes are' }),
    S('Strokes', 'length', 'Length', 150, 1000, 402, { unit: '%', rand: [250, 700], hint: "How long the strokes are, as a share of the brush's width" }),
    S('Strokes', 'angle', 'Angle', -90, 90, 37, { unit: '°', rand: [-85, 85], hint: 'Which way the strokes run: 0° lying flat, 90° upright, leaning right in between (negative: leaning left)' }),
    S('Strokes', 'spread', 'Spread', 0, 60, 7, { unit: '°', rand: [4, 34], hint: "How much the strokes' directions vary, from layer to layer and stroke to stroke" }),
    S('Paint', 'dry', 'Dry brush', 0, 100, 81, { unit: '%', rand: [25, 85], hint: 'How dry the brush is: streaky strokes that break up toward their ends, so what is beneath shows through' }),
    S('Paint', 'texture', 'Texture', 0, 100, 57, { unit: '%', rand: [20, 70], hint: 'How much of the canvas shows through the paint in fine specks' }),
    S('Paint', 'fringe', 'Fringe', 0, 100, 33, { unit: '%', rand: [20, 85], hint: "How far the grassy flicks along each layer's top edge reach up" }),
    S('Paint', 'mix', 'Mix', 0, 100, 25, { unit: '%', rand: [10, 60], hint: "How much the paints mix: patches of the neighbouring layers' paints in each layer, and a little of another paint in every stroke" }),
  ];

  // Constants. Sizes in px at a 1080 x 1080 frame (they go with the frame's area); edges in frame heights.
  const K = {
    brush: [7, 64],        // stroke width at Brush size 10 -> 100
    stepL: 0.8,            // the strokes' grid: this far apart along them (x their length) ...
    stepW: 1.0,            // ... and across (x their width)
    jitter: 0.42,          // each stroke up to this far (grid cells) from its place
    reach: 0.3,            // strokes reach this far below their layer (x their half height), under the next one
    lenVar: [0.7, 1.3],    // each stroke's length (x Length) ...
    widVar: [0.78, 1.22],  // ... and width (x Brush size)
    turn: 0.55,            // each stroke turns up to this share of Spread off its layer's angle ...
    skyTurn: 2.4,          // ... this many times as far in the first layer (scumbled across)
    bend: 0.05,            // strokes bow up to this far sideways (x their length)
    layerH: [0.6, 0.9],    // the layers after the first share out the rest of the frame by these weights ...
    front: 1.35,           // ... the front one this much more
    tiltVar: 6,            // each edge up to this many degrees off Tilt
    hillAmp: 0.075,        // Hills 100 %: the edges rise and fall about this far (x the frame's height)
    hillL: 0.55,           // ... over hills about this wide (x the frame's size)
    clipIn: 0.12,          // a layer's paint stops this far (x Brush size) below its top edge (the flicks go on up) ...
    edgeRag: 0.16,         // ... give or take this much (x Brush size), in small bumps
    tone: [0.07, 0.3],     // each stroke has up to this much of another paint mixed in (Mix 0 -> 100 %)
    NB: 24,                // bristles across a stroke
    bristleDry: 0.9,       // Dry 100 %: a bristle carries down to 1 - this much paint ...
    bristlePow: 1.0,       // ... (evenly spread)
    side: 0.35,            // the bristles at a stroke's sides carry this much less and lift off sooner
    bristleTone: 0.07,     // each bristle's paint a little lighter or darker (up to this share)
    patchDry: 0.3,         // patch strokes are this much drier
    end0: 0.06,            // bristles lift off up to this share before a stroke's end ...
    endDry: 0.3,           // ... plus this much at Dry 100 %
    start0: 0.05,          // and touch down up to this share after its start
    runOut: 0.5,           // Dry 100 %: the paint left by a stroke's end
    along: 0.55,           // Dry 100 %: how unevenly a bristle lays its paint along the stroke
    breaks: 3.2,           // ... about this many breaks along a stroke (x its length / width / 4)
    pThr: 0.42, pSoft: 0.12, // paint shows where it is above this level (soft over this much)
    tooth: 1.5,            // the canvas's tooth: specks about this size ...
    clump: 0.9,            // ... gathered in loose clumps (0: even) ...
    clumpL: 0.12,          // ... about this big (x the frame's size)
    tex: 0.1,              // Texture 100 %: this share of the canvas stays bare
    texSoft: 0.05,         // the specks' soft edge (more when a pixel covers several specks) ...
    texPow: 1.5,           // ... where the layers' paints, one over another, all but cover a partly bare speck
    flickStep: 0.2,        // flicks this far apart along an edge (x Brush size)
    flickLen: [0.35, 3.2], // flick length (x Brush size x Fringe), most of them short ...
    flickClump: 3.5,       // ... in clumps about this wide (x Brush size)
    flickWid: [0.08, 0.3], // flick width (x Brush size)
    flickDepth: [0.05, 0.45], // flicks start this far below the edge (x Brush size)
    flickLean: 0.55,       // flicks lean this share of the way to their layer's angle
    mixL: 0.22,            // Mix patches: about this size (x the frame's size)
    mixThr: [0.7, -0.2],   // ... strokes go in where the patch noise is above this (Mix 0 -> 100 %)
    accent: [0.8, 0.6, 1.15], // patch strokes: this long and wide (x the layer's), this much further apart ...
    patchSoft: 0.35,       // ... thinning out at the patches' edges
    tuft: 1.2,             // Wind 1: every layer sways like a tuft of grass, its top this far either way (x Brush size) ...
    tuftH: 6,              // ... less where the layer is thinner than this (x Brush size) ...
    dip: 0.6,              // ... its top dipping as it bends (keeping its length: this x sway² / height) ...
    flex: 0.26,            // ... each stroke a tuft of its own too, flexing round its root this much (sideways per px up) ...
    lean: 0.7,             // ... leaning in all a little short of this much at most (sideways per px up; it eases off)
    gust: 0.72,            // Wind 1: on top of that the flicks bend this far downwind and back (radians) ...
    flickBend: 0.34,       // ... their tips curling over by this much (x their length)
    near: [0.75, 1.15],    // the back layer moves this much of that, the front one this much
    beats: 2,              // the layers sway back and forth this many times a loop
    waveL: 1.2,            // the gusts are this far apart (x the frame's size), running left to right ...
    lag: 0.45,             // ... reaching each layer a little after the one behind it (radians)
    beat: 0.5,             // each stroke and flick a little off the wave (radians), so neighbours sway nearly together
  };

  /* ---- textures -------------------------------------------------------------------------- */
  // the canvas's tooth: a tile of fine specks, evened out to 0 ... 1 (the clumps come from a field over the world)
  const TS = 512, TM = TS - 1;
  let TILE = null;
  function tile() {
    if (TILE) return TILE;
    const N = TS * TS, r = PL.rng.mulberry32(0x510e527f);
    const a = new Float32Array(N), b = new Float32Array(N);
    for (let i = 0; i < N; i++) a[i] = r();
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += a[((y + dy) & TM) * TS + ((x + dx) & TM)];
      b[y * TS + x] = s / 9;
    }
    const idx = new Uint32Array(N);
    for (let i = 0; i < N; i++) idx[i] = i;
    idx.sort((i, j) => b[i] - b[j]);
    TILE = new Float32Array(N);
    for (let k = 0; k < N; k++) TILE[idx[k]] = (k + 0.5) / N;
    // between its samples the tile is smoother: the levels that leave a given share above them
    const q = new Float32Array(4096);
    for (let k = 0; k < 4096; k++) q[k] = sample(TILE, r() * TS, r() * TS);
    q.sort();
    TILE.q = q;
    return TILE;
  }
  const sample = (T, x, y) => { // bilinear, wrapping
    const ix = Math.floor(x), iy = Math.floor(y), tx = x - ix, ty = y - iy;
    const x0 = ix & TM, x1 = (ix + 1) & TM, y0 = (iy & TM) * TS, y1 = ((iy + 1) & TM) * TS;
    const a = T[y0 + x0] + (T[y0 + x1] - T[y0 + x0]) * tx, b = T[y1 + x0] + (T[y1 + x1] - T[y1 + x0]) * tx;
    return a + (b - a) * ty;
  };
  // along a bristle: a smooth 1D noise, 0 ... 1
  const NT = new Float32Array(1024);
  {
    const r = PL.rng.mulberry32(0x9b05688c), g = new Float32Array(64);
    for (let i = 0; i < 64; i++) g[i] = r();
    for (let i = 0; i < 1024; i++) {
      const f = i / 16, i0 = f | 0, t = f - i0, s = t * t * (3 - 2 * t);
      NT[i] = g[i0 & 63] + (g[(i0 + 1) & 63] - g[i0 & 63]) * s;
    }
  }

  /* ---- the layers ------------------------------------------------------------------------ */
  function layout(seed, p, W, H, nL) {
    const A = Math.sqrt(W * H), u = A / 1080, m = Math.min(W, H);
    const bw = lerp(K.brush[0], K.brush[1], clamp01(((p.brush ?? 40) - 10) / 90)) * u;
    const len = (bw * clamp(p.length ?? 420, 100, 2000)) / 100;
    const spread = ((p.spread ?? 16) * Math.PI) / 180;
    const ang = ((p.angle ?? 68) * Math.PI) / 180;
    const angs = Array.from({ length: nL }, (_, k) => ang + spread * (2 * hash(seed, k, 0xb1, 3) - 1));
    // the edges between layer e and e + 1 (e = 0 ... nL - 2): the widest layer takes Horizon of the frame and the
    // others share out the rest (the front one, when it isn't the widest, a little more). Weight moves the widest layer
    // from the top (100 %) down through the layers to the bottom (0 %), sliding the edges between those layouts.
    const hz = clamp((p.horizon ?? 42) / 100, 0.02, 0.98);
    const ws = Array.from({ length: nL }, (_, k) => lerp(K.layerH[0], K.layerH[0] + K.layerH[1], hash(seed, k, 0xb2, 3)));
    const layoutFor = (wide) => {
      let sum = 0, y = 0;
      const w = ws.map((x, k) => { const v = k === wide ? 0 : x * (k === nL - 1 ? K.front : 1); sum += v; return v; });
      return Array.from({ length: nL - 1 }, (_, k) => (y += k === wide ? hz : (w[k] / sum) * (1 - hz)));
    };
    const c = (1 - clamp01((p.weight ?? 100) / 100)) * (nL - 1), c0 = Math.floor(c), cf = c - c0;
    const lo = layoutFor(c0), hi = cf > 0 ? layoutFor(Math.min(nL - 1, c0 + 1)) : lo;
    const hills = clamp01((p.hills ?? 45) / 100), edges = [];
    for (let e = 0; e < nL - 1; e++) {
      const y = lo[e] + (hi[e] - lo[e]) * cf;
      const tilt = (((p.tilt ?? 6) + K.tiltVar * (2 * hash(seed, e, 0xb3, 3) - 1)) * Math.PI) / 180;
      edges.push({
        y: y * H, slope: (Math.tan(tilt) * m) / W,
        amp: hills * K.hillAmp * H * (0.6 + 0.8 * hash(seed, e, 0xb4, 3)),
        f: 1 / (K.hillL * A * (0.7 + 0.6 * hash(seed, e, 0xb5, 3))), ox: 100 * hash(seed, e, 0xb6, 3), ph: 2 * Math.PI * hash(seed, e, 0xb7, 3),
      });
    }
    return { W, H, A, u, bw, len, angs, edges, nL, NZ: PL.noise.get((seed ^ 0x2545f491) >>> 0), NM: PL.noise.get((seed ^ 0x3c6ef372) >>> 0) };
  }
  // edge e's height (world px) at x, still
  function edgeNoise(E, e, x) {
    const g = E.edges[e], xf = x * g.f + g.ox;
    return g.y + g.slope * (x - E.W / 2) + g.amp * (E.NZ.noise4(xf, e * 7.3, 0.5, 0.5) + 0.4 * E.NZ.noise4(2.3 * xf, e * 7.3 + 3.1, 1.5, 0.5)) / 1.2;
  }
  function edgeAt(E, e, x) {
    const T = E.table;
    if (T) {
      const f = (x - T.x0) / T.step, i = Math.floor(f);
      if (i >= 0 && i < T.n - 1) { const a = T.y[e]; return a[i] + (a[i + 1] - a[i]) * (f - i); }
    }
    return edgeNoise(E, e, x);
  }
  // the edges sampled over x0 ... x1 (the hills are smooth: a few px apart is plenty)
  function edgeTable(E, x0, x1) {
    const step = Math.max(1, E.bw / 8);
    x0 = Math.floor(x0 / step) * step; // (on a fixed grid, so every view samples the same points)
    const n = Math.ceil((x1 - x0) / step) + 2;
    E.table = null;
    const y = E.edges.map((g, e) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = edgeNoise(E, e, x0 + i * step); return a; });
    E.table = { x0, step, n, y };
  }
  // The wind (th: 0 ... 2π over a loop): gusts running across the frame from left to right, n times a loop (ph: where
  // on their wave a point is). Every layer sways in them like a tuft of grass rooted along its bottom edge. Every
  // movement is measured from the still picture (th = 0).
  const swing = (th, ph, n) => Math.sin(n * th + ph) - Math.sin(ph);
  const waveAt = (E, x, k) => -(2 * Math.PI * x) / (K.waveL * E.A) - K.lag * k; // (each layer a little after the one behind it)
  const near = (E, k) => (E.nL > 1 ? K.near[0] + ((K.near[1] - K.near[0]) * k) / (E.nL - 1) : 1);
  // layer k at x (world px): how tall it is (from its top edge, or the frame's top, to its bottom edge, or the
  // frame's bottom) and how far its top sways at Wind 1 (less where it is thin)
  const heightAt = (E, k, x) => Math.max(0.5 * E.bw, (k < E.nL - 1 ? edgeAt(E, k, x) : E.H) - (k > 0 ? edgeAt(E, k - 1, x) : 0));
  const tuftAt = (E, k, hb) => near(E, k) * K.tuft * E.bw * Math.min(1, hb / (K.tuftH * E.bw));
  // how far a point h of the way up its layer (0: the bottom edge, its root; 1: its top) goes with the top, and how
  // steeply: a blade of grass bending in the wind (a cantilever under an even load)
  const bendP = (h) => (h <= 0 ? 0 : h >= 1 ? 1 + (4 / 3) * (h - 1) : (h * h * (6 - 4 * h + h * h)) / 3);
  const bendD = (h) => (h <= 0 ? 0 : h >= 1 ? 4 / 3 : (4 * h * (3 - 3 * h + h * h)) / 3);

  /* ---- the strokes ------------------------------------------------------------------------ */
  // Every stroke that can touch region R (world px), lying still, layer by layer (back to front): its strokes
  // (shuffled), then its patches of the neighbours' paints, then the flicks along its top edge. A stroke:
  // { x, y (its middle; a flick's: its root), a (its angle), L, w, c (its paint), m (another paint mixed in, f of it),
  //   kind (0 stroke, 1 flick, 2 patch), id (its bristles), key (its sprite), k (its layer), and for the wind: rx, ry
  //   (its root: its lower end), up (it starts there), ph (its place on the gusts' wave), hb (its layer's height
  //   there), T (how far its layer's top sways there at Wind 1), P and D (how far up its layer its root is, bent:
  //   bendP, bendD); a flick's pl: its root's place on the wave }
  function stillStrokes(seed, p, E, R) {
    const layers = [];
    const { bw, len, nL, A } = E;
    const mix = clamp01((p.mix ?? 35) / 100), fringe = clamp01((p.fringe ?? 50) / 100);
    const spread = ((p.spread ?? 16) * Math.PI) / 180;
    const ox = E.W / 2, oy = E.H / 2;
    const mixThr = lerp(K.mixThr[0], K.mixThr[1], mix), toneMax = lerp(K.tone[0], K.tone[1], mix);
    const pl = K.mixL * A;
    const patch = (x, y, k) => (E.NM.noise4(x / pl, y / pl, k * 3.1, 9.7) + 0.5 * E.NM.noise4((2.1 * x) / pl, (2.1 * y) / pl, k * 3.1 + 1.7, 4.2)) / 1.25;
    const neighbour = (x, y, k) => {
      if (k === 0) return 1;
      if (k === nL - 1) return k - 1;
      return E.NM.noise4(x / (1.6 * pl), y / (1.6 * pl), k * 3.1 + 5.3, 1.3) > 0 ? k + 1 : k - 1;
    };
    // (at Wind 2 the layers sway up to this far sideways and dip up to this far, so the strokes just outside R are kept too)
    const sway = 4 * K.near[1] * K.tuft * (4 / 3) * bw, dip = 4.2 * bw;
    // a grid of strokes over R in layer k (length L, width w), kept where keep(x, y, angle) gives a paint
    const grid = (out, k, L, w, step, salt, keep, tone) => {
      const a0 = E.angs[k], dx = Math.cos(a0), dy = -Math.sin(a0), nx = -dy, ny = dx;
      const sL = L * K.stepL * step, sW = w * K.stepW * step, M = L + w;
      const X0 = R.x0 - M - sway, X1 = R.x1 + M + sway, Y0 = R.y0 - M - dip, Y1 = R.y1 + M;
      let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity;
      for (const x of [X0, X1]) for (const y of [Y0, Y1]) {
        const a = ((x - ox) * dx + (y - oy) * dy) / sL, b = ((x - ox) * nx + (y - oy) * ny) / sW;
        i0 = Math.min(i0, a); i1 = Math.max(i1, a); j0 = Math.min(j0, b); j1 = Math.max(j1, b);
      }
      const list = [];
      for (let j = Math.floor(j0) - 1; j <= Math.ceil(j1) + 1; j++) for (let i = Math.floor(i0) - 1; i <= Math.ceil(i1) + 1; i++) {
        const fi = i + (2 * hash(seed, i, j, salt + 1) - 1) * K.jitter, fj = j + (2 * hash(seed, i, j, salt + 2) - 1) * K.jitter;
        const cx = ox + fi * sL * dx + fj * sW * nx, cy = oy + fi * sL * dy + fj * sW * ny;
        if (cx < X0 || cx > X1 || cy < Y0 || cy > Y1) continue;
        const c = keep(cx, cy, a0, hash(seed, i, j, salt + 10));
        if (c < 0) continue;
        const sl = L * lerp(K.lenVar[0], K.lenVar[1], hash(seed, i, j, salt + 3));
        const sw = w * lerp(K.widVar[0], K.widVar[1], hash(seed, i, j, salt + 4));
        let a = a0 + spread * K.turn * (k === 0 ? K.skyTurn : 1) * (2 * hash(seed, i, j, salt + 5) - 1);
        if (hash(seed, i, j, salt + 7) < 0.5) a += Math.PI; // painted the other way (it runs dry toward its end)
        // its paint: the layer's, with a little of another (the canvas or a neighbour's) mixed in
        const h8 = hash(seed, i, j, salt + 8);
        const m = !tone ? -1 : h8 < 0.5 ? 0 : 1 + neighbour(cx, cy, k), f = m < 0 ? 0 : toneMax * hash(seed, i, j, salt + 9);
        // in the wind it goes with its layer from its root (its lower end), the more the higher up the layer that is
        const up = Math.sin(a) >= 0, rx = cx + ((up ? -1 : 1) * Math.cos(a) * sl) / 2, ry = cy + (Math.abs(Math.sin(a)) * sl) / 2;
        const yB = k < nL - 1 ? edgeAt(E, k, rx) : E.H, hb = heightAt(E, k, rx), h = clamp((yB - ry) / hb, 0, 1.25);
        list.push({
          x: cx, y: cy, a, ca: Math.cos(a), sa: -Math.sin(a), L: sl, w: sw, c: 1 + c, m, f, kind: tone ? 0 : 2, id: hash(seed, i, j, salt + 11), o: hash(seed, i, j, salt + 12),
          key: salt + ':' + i + ':' + j + '|' + (1 + c) + '|' + m + '|' + f.toFixed(4), k,
          rx, ry, up, ph: waveAt(E, rx, k) + K.beat * (2 * hash(seed, i, j, salt + 6) - 1), // (on the wave, a little off it)
          hb, T: tuftAt(E, k, hb), P: bendP(h), D: bendD(h),
        });
      }
      list.sort((a, b) => a.o - b.o); // a shuffled order
      for (const s of list) out.push(s);
    };
    for (let k = 0; k < nL; k++) {
      const out = [];
      const top = k > 0 ? k - 1 : -1, bot = k < nL - 1 ? k : -1;
      const half = (a) => 0.5 * (Math.abs(Math.sin(a)) * len + Math.abs(Math.cos(a)) * bw);
      const inLayer = (x, y, a, below) => {
        const he = half(a);
        if (top >= 0 && y < edgeAt(E, top, x) - 0.35 * he) return false;
        if (bot >= 0 && y > edgeAt(E, bot, x) + below * he) return false;
        return true;
      };
      // its strokes, each a slightly different mix
      grid(out, k, len, bw, 1, 0x1000 * (k + 1), (x, y, a) => (inLayer(x, y, a, K.reach) ? k : -1), true);
      // patches of the neighbours' paints (fewer in the first layer)
      if (mix > 0 && nL > 1) {
        const thr = k === 0 ? mixThr + 0.45 : mixThr;
        grid(out, k, len * K.accent[0], bw * K.accent[1], K.accent[2], 0x1000 * (k + 1) + 0x800,
          (x, y, a, h) => (inLayer(x, y, a, 0.2) && patch(x, y, k) > thr + K.patchSoft * (h - 0.5) ? neighbour(x, y, k) : -1), false);
      }
      // flicks along its top edge, rising into the layer behind: in clumps, most of them short
      if (top >= 0 && fringe > 0) {
        const step = bw * K.flickStep, M = bw * (K.flickLen[1] + 1);
        const lean = (E.angs[k] - Math.PI / 2) * K.flickLean;
        for (let i = Math.floor((R.x0 - M - sway) / step); i <= Math.ceil((R.x1 + M + sway) / step); i++) {
          const h1 = hash(seed, i, k, 0x51), h2 = hash(seed, i, k, 0x52), h3 = hash(seed, i, k, 0x53), h4 = hash(seed, i, k, 0x54);
          const x = (i + h1) * step;
          const clump = clamp01(0.5 + 1.1 * E.NZ.noise4(x / (K.flickClump * bw), k * 2.3, 3.3, 7.7));
          if (clump < 0.35 * hash(seed, i, k, 0x58)) continue; // gaps between the clumps
          const y = edgeAt(E, top, x) + bw * lerp(K.flickDepth[0], K.flickDepth[1], h2);
          const fl = fringe * bw * lerp(K.flickLen[0], K.flickLen[1], h3 * h3) * (0.3 + 0.9 * clump);
          if (y + bw + dip < R.y0 - fl || y - fl > R.y1 + bw) continue;
          const c = mix > 0 && nL > 1 && patch(x, y, k) > mixThr + K.patchSoft * (hash(seed, i, k, 0x59) - 0.5) ? neighbour(x, y, k) : k;
          const m = hash(seed, i, k, 0x5a) < 0.5 ? 0 : 1 + neighbour(x, y, k);
          const hb = heightAt(E, k, x), pl = waveAt(E, x, k);
          out.push({
            x, y, a: Math.PI / 2 + lean + spread * 0.5 * (2 * h4 - 1), L: fl, w: bw * lerp(K.flickWid[0], K.flickWid[1], hash(seed, i, k, 0x56)),
            c: 1 + c, m, f: 0.6 * toneMax * hash(seed, i, k, 0x5b), kind: 1, id: hash(seed, i, k, 0x57), k,
            ph: pl + K.beat * (2 * hash(seed, i, k, 0x55) - 1), pl, hb, T: tuftAt(E, k, hb),
          });
        }
      }
      layers.push(out);
    }
    return layers;
  }

  // The wind on stroke s at time t (th: 0 ... 2π over a loop) puts into o where its root is and how it leans. Its
  // layer bends like a tuft of grass: the higher up it, the further a stroke's root sways (o.x, o.y), its top dipping
  // a little as it bends, and the stroke leans with it and flexes round its root like a tuft of its own (o.sh:
  // sideways per px up). A flick's root (o.x, o.y) rides its layer's top edge, and the flick bends on top of that,
  // round its root (o.a), its tip curling over (o.curl).
  function blow(E, s, th, amount, o) {
    if (s.kind === 1) {
      const d = amount * s.T * swing(th, s.pl, K.beats), g = 0.5 * amount * near(E, s.k) * swing(th, s.ph, K.beats);
      o.x = s.x + d;
      o.y = s.y + (K.dip * d * d) / s.hb;
      o.a = s.a - K.gust * g;
      o.curl = K.flickBend * g;
      o.sh = 0;
      return o;
    }
    const G = swing(th, s.ph, K.beats), d = amount * s.T * G;
    o.x = s.rx + d * s.P;
    o.y = s.ry + (K.dip * d * d * s.P) / s.hb;
    o.a = s.a;
    o.sh = K.lean * Math.tanh((-d * s.D) / s.hb / K.lean - (K.flex * amount * near(E, s.k) * G) / K.lean);
    o.curl = 0;
    return o;
  }

  // (for the checks) every stroke as it is drawn at time t: { x, y (its root), a, sh (its lean), L, w, c, m, f, kind, id, key, curl }
  function strokes(seed, p, E, R, t, amount) {
    const th = 2 * Math.PI * (((t % 1) + 1) % 1);
    return stillStrokes(seed, p, E, R).map((list) => list.map((s) => blow(E, s, th, amount, { L: s.L, w: s.w, c: s.c, m: s.m, f: s.f, kind: s.kind, id: s.id, key: s.key })));
  }

  /* ---- paint ------------------------------------------------------------------------------- */
  // Every stroke is painted once, bristle by bristle, into a small picture of its own (a sprite, kept on a few
  // big sheets while the settings that shape it stay the same). A frame then only lays the sprites on the
  // canvas, turned and moved by the wind, which the browser does on the graphics card, so the animation stays
  // smooth. The flicks are drawn as tapering shapes (they bend in the wind), each layer starts at a clip path
  // along its edge, and the canvas's bare tooth goes over the top.
  const PROF = new Float32Array(256); // a stroke's width along it
  for (let i = 0; i < 256; i++) { const a = i / 255; PROF[i] = (0.55 + 0.45 * sstep(0, 0.16, a)) * (1 - 0.45 * sstep(0.7, 1, a)); }
  const LOAD = new Float32Array(256);
  const BD = new Float32Array(K.NB), BE = new Float32Array(K.NB), BS = new Float32Array(K.NB), BP = new Int32Array(K.NB);
  const BR = new Uint8Array(K.NB), BG = new Uint8Array(K.NB), BB = new Uint8Array(K.NB), HW = new Float32Array(256);
  const newCanvas = (w, h) => {
    if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    return new OffscreenCanvas(w, h);
  };

  // One stroke in its own frame: u along it (x, from its start), v across (y, from its middle line). Its box: how big
  // its picture is and where its start sits in it ...
  function spriteBox(s, ms) {
    const Lc = s.L / ms, hw = s.w / (2 * ms), bendPx = (2 * s.id - 1) * K.bend * Lc;
    const ext = hw * 1.1 + Math.abs(bendPx) * 0.67 + 1.5, pad = 1;
    return { w: Math.ceil(Lc) + 2 * pad + 1, h: Math.ceil(2 * ext) + 2 * pad, ox: pad, oy: pad + ext };
  }
  // ... and its picture, painted into d (RGBA, `stride` px a row) with the box's corner at (X, Y)
  function renderSprite(s, ms, dry, box, d, stride, X, Y) {
    const Lc = s.L / ms, hw = s.w / (2 * ms), patchy = s.kind === 2;
    const bendPx = (2 * s.id - 1) * K.bend * Lc;
    const pad = box.ox, ext = box.oy - pad, SW = box.w, SH = box.h;
    // its bristles, and the paint on each (a little lighter or darker, neighbours alike)
    const r = PL.rng.mulberry32((s.id * 4294967296) >>> 0), sdry = patchy ? Math.min(1, dry + K.patchDry) : dry;
    const NB = K.NB, NB1 = NB - 1, hNB = 0.5 * NB1, dryA = sdry * K.along, pInv = 1 / K.pSoft;
    const c0 = s.rgb, cm = s.mrgb || c0;
    const br = c0[0] + (cm[0] - c0[0]) * s.f, bg = c0[1] + (cm[1] - c0[1]) * s.f, bb = c0[2] + (cm[2] - c0[2]) * s.f;
    let tn = 0;
    for (let b = 0; b < NB; b++) {
      const sd = (2 * b) / NB1 - 1, e2 = K.side * sd * sd;
      BD[b] = (1 - sdry * K.bristleDry * Math.pow(r(), K.bristlePow)) * (1 - e2);
      BE[b] = 1 - ((K.end0 + sdry * K.endDry) * Math.pow(r(), 0.7) + e2 * r());
      BS[b] = (K.start0 + e2 * 0.5) * r();
      BP[b] = (r() * 1024) | 0;
      tn = 0.6 * tn + 0.4 * (2 * r() - 1);
      const k1 = 1 + K.bristleTone * tn * 1.6;
      BR[b] = clamp(Math.round(br * k1), 0, 255); BG[b] = clamp(Math.round(bg * k1), 0, 255); BB[b] = clamp(Math.round(bb * k1), 0, 255);
    }
    const invL = 1 / Lc, fa = ((K.breaks * Lc) / (2 * hw)) * 4, wob = BP[3];
    // its half-width along it (the brush pressing a little harder and softer), and where all its bristles touch
    for (let q = 0; q < 256; q++) HW[q] = hw * PROF[q] * (0.92 + 0.16 * NT[(wob + (((q / 255) * fa * 0.5) | 0)) & 1023]) + 0.5;
    let s1 = 0, e0 = 1;
    for (let b = 0; b < NB; b++) { if (BS[b] > s1) s1 = BS[b]; if (BE[b] < e0) e0 = BE[b]; }
    s1 += invL; e0 -= invL;
    for (let j = 0; j < SH; j++) {
      const vRow = j + 0.5 - pad - ext;
      for (let i = 0; i < SW; i++) {
        const u = i + 0.5 - pad;
        if (u < 0 || u > Lc) continue;
        const av = u * invL, ai = (av * 255) | 0, q = 2 * av - 1;
        const v = vRow - bendPx * (q * q - 0.3333);
        let cw = HW[ai] - (v < 0 ? -v : v);
        if (cw <= 0) continue;
        if (cw > 1) cw = 1;
        let bf = (v / hw + 1) * hNB;
        if (bf < 0) bf = 0; else if (bf > NB1) bf = NB1;
        const b0 = bf | 0, b1 = b0 < NB1 ? b0 + 1 : b0, fr = bf - b0;
        if (av < s1 || av > e0) { // near its ends: the bristles touch down and lift off raggedly
          const ce = (BE[b0] + (BE[b1] - BE[b0]) * fr - av) * Lc + 0.5;
          if (ce <= 0) continue;
          const cs = (av - BS[b0] - (BS[b1] - BS[b0]) * fr) * Lc + 0.5;
          if (cs <= 0) continue;
          if (ce < 1) cw *= ce;
          if (cs < 1) cw *= cs;
        }
        const P = (BD[b0] + (BD[b1] - BD[b0]) * fr) * LOAD[ai] - dryA * (NT[(BP[b0] + ((av * fa) | 0)) & 1023] - 0.5);
        let cp = (P - K.pThr) * pInv + 0.5;
        if (cp <= 0) continue;
        if (cp > 1) cp = 1;
        const o = ((Y + j) * stride + X + i) * 4;
        d[o] = BR[b0]; d[o + 1] = BG[b0]; d[o + 2] = BB[b0]; d[o + 3] = (cw * cp * 255 + 0.5) | 0;
      }
    }
  }

  // The sprites of the strokes, for one set of the settings that shape them and one scale, on sheets (rows of
  // sprites a pixel apart, each sheet written once). A few sets are kept (the artboard's, the cards', an export's),
  // the oldest let go first.
  const SETS = [], BUDGET = 3e8;
  const release = (set) => { for (const c of set.sheets) { c.width = 0; c.height = 0; } set.sheets = []; set.bytes = 0; };
  function spriteSet(key, CW, CH) {
    const i = SETS.findIndex((x) => x.key === key);
    if (i > 0) SETS.unshift(SETS.splice(i, 1)[0]);
    if (i < 0) SETS.unshift({ key, map: new Map(), sheets: [], bytes: 0, gen: 0, size: clamp(2 ** Math.ceil(Math.log2(Math.sqrt(CW * CH))), 256, 2048) });
    let total = SETS.reduce((a, x) => a + x.bytes, 0);
    while (SETS.length > 6 || (SETS.length > 1 && total > BUDGET)) {
      const old = SETS.pop();
      total -= old.bytes;
      release(old);
    }
    return SETS[0];
  }
  // start a set again (it has gathered the sprites of many layouts, while a setting was dragged)
  function restart(set) {
    release(set);
    set.map = new Map();
    set.gen++;
  }
  // paint the sprites the strokes in these layers don't have yet, onto new sheets
  function ensureSprites(set, layers, ms, dry, rgb) {
    const S = set.size;
    let buf = null, bx = 0, by = 0, row = 0, pending = [];
    const flush = () => {
      if (!buf) return;
      const h = Math.min(S, by + row + 1), c = newCanvas(S, h);
      c.getContext('2d').putImageData(h === S ? buf : new ImageData(buf.data.subarray(0, S * h * 4), S, h), 0, 0);
      for (const at of pending) at.c = c;
      set.sheets.push(c);
      set.bytes += S * h * 4;
      buf = null; pending = [];
    };
    for (const list of layers) for (const s of list) {
      if (s.kind === 1 || set.map.has(s.key)) continue;
      s.rgb = rgb[s.c] || rgb[1]; s.mrgb = s.m >= 0 ? rgb[s.m] : null;
      const box = spriteBox(s, ms), w = box.w, h = box.h;
      if (w > S - 2 || h > S - 2) { // too big for a sheet: a canvas of its own
        const img = new ImageData(w, h), c = newCanvas(w, h);
        renderSprite(s, ms, dry, box, img.data, w, 0, 0);
        c.getContext('2d').putImageData(img, 0, 0);
        set.sheets.push(c);
        set.bytes += w * h * 4;
        set.map.set(s.key, { c, sx: 0, sy: 0, w, h, ox: box.ox, oy: box.oy });
        continue;
      }
      if (buf && bx + w > S) { bx = 0; by += row + 1; row = 0; }
      if (buf && by + h > S) flush();
      if (!buf) { buf = new ImageData(S, S); bx = 0; by = 0; row = 0; }
      renderSprite(s, ms, dry, box, buf.data, S, bx, by);
      const at = { c: null, sx: bx, sy: by, w, h, ox: box.ox, oy: box.oy };
      pending.push(at);
      set.map.set(s.key, at);
      bx += w + 1;
      if (h > row) row = h;
    }
    flush();
  }

  // the canvas's bare tooth as a picture: its color, as strong as the paint is kept off it (the same for every layer;
  // a few kept)
  const MASKS = [];
  function speckMask(E, CW, CH, mx, my, ms, tex, seed, crgb) {
    const key = [CW, CH, mx, my, ms, E.u, tex, seed, crgb.join(',')].join('|');
    const i = MASKS.findIndex((x) => x.key === key);
    if (i >= 0) {
      const x = MASKS[i];
      if (i) MASKS.unshift(MASKS.splice(i, 1)[0]);
      return x.c;
    }
    const c = toothOf(E, CW, CH, mx, my, ms, tex, seed, crgb);
    MASKS.unshift({ key, c });
    while (MASKS.length > 3) { const old = MASKS.pop(); if (old.c) { old.c.width = 0; old.c.height = 0; } }
    return c;
  }
  function toothOf(E, CW, CH, mx, my, ms, tex, seed, crgb) {
    const share = K.tex * tex;
    if (share <= 0) return null;
    const T = tile(), ts = K.tooth * E.u, fp = ms / ts;
    const soft = K.texSoft + 0.12 * fp, inv = 1 / soft;
    const level = (f) => T.q[clamp(Math.round((1 - f) * 4095), 0, 4095)];
    // the clumps: a smooth field over the world, worked out on a coarse grid
    const g = 8, gw = Math.ceil(CW / g) + 2, gh = Math.ceil(CH / g) + 2, CF = new Float32Array(gw * gh), N = PL.noise.get((seed ^ 0x1f83d9ab) >>> 0), cl = K.clumpL * E.A;
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const x = mx + i * g * ms, y = my + j * g * ms;
      CF[j * gw + i] = level(share * clamp(1 + K.clump * N.fbm4(x / cl, y / cl, 1.3, 7.1, 2, 0.5) * 1.9, 0, 3));
    }
    const img = new ImageData(CW, CH), d = img.data;
    for (let j = 0; j < CH; j++) {
      const y = (my + (j + 0.5) * ms) / ts, fy = j / g, j0 = fy | 0, ty = fy - j0, r0 = j0 * gw, r1 = r0 + gw;
      for (let i = 0, o = j * CW * 4; i < CW; i++, o += 4) {
        const x = (mx + (i + 0.5) * ms) / ts, fx = i / g, i0 = fx | 0, tx = fx - i0;
        const t0 = CF[r0 + i0] + (CF[r0 + i0 + 1] - CF[r0 + i0]) * tx, t1 = CF[r1 + i0] + (CF[r1 + i0 + 1] - CF[r1 + i0]) * tx;
        const c = (t0 + (t1 - t0) * ty - sample(T, x, y)) * inv + 0.5; // how much paint it takes
        if (c >= 1) continue;
        d[o] = crgb[0]; d[o + 1] = crgb[1]; d[o + 2] = crgb[2]; d[o + 3] = c <= 0 ? 255 : (Math.pow(1 - c, K.texPow) * 255 + 0.5) | 0;
      }
    }
    const c = newCanvas(CW, CH);
    c.getContext('2d').putImageData(img, 0, 0);
    return c;
  }

  const mixRgb = (a, b, f) => [Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f)];

  // The layout, the still strokes and the layers' top lines for one view of one painting, kept while the settings
  // that place them stay the same (a few kept), so that a frame only works out the wind and draws.
  const STILLS = [];
  function still(seed, p, W, H, nL, CW, CH, ms, mx, my) {
    const key = [seed, W, H, nL, CW, CH, ms, mx, my, p.horizon, p.weight, p.tilt, p.hills, p.brush, p.length, p.angle, p.spread, p.mix, p.fringe].join('|');
    const i = STILLS.findIndex((x) => x.key === key);
    if (i >= 0) {
      const x = STILLS[i];
      if (i) STILLS.unshift(STILLS.splice(i, 1)[0]);
      return x;
    }
    const E = layout(seed, p, W, H, nL);
    { const M = 1.4 * E.len + 10 * E.bw; edgeTable(E, mx - M, mx + CW * ms + M); }
    const layers = stillStrokes(seed, p, E, { x0: mx, y0: my, x1: mx + CW * ms, y1: my + CH * ms });
    // where each layer starts on the canvas, column by column, a little past both sides (it sways): a ragged line a
    // little below its edge (y), with how far it sways at Wind 1 (T, world px), how tall its layer is (hb) and the sine
    // and cosine of its place on the gusts' wave (s, c)
    const clip = (K.clipIn * E.bw) / ms, pad = Math.ceil((4 * K.near[1] * K.tuft * E.bw) / ms) + 4, n = CW + 2 * pad;
    const lines = E.edges.map((g, e) => {
      const L = { y: new Float32Array(n), T: new Float32Array(n), hb: new Float32Array(n), s: new Float32Array(n), c: new Float32Array(n) };
      for (let j = 0; j < n; j++) {
        const x = mx + (j - pad + 0.5) * ms, hb = heightAt(E, e + 1, x), ph = waveAt(E, x, e + 1);
        L.y[j] = (edgeAt(E, e, x) + K.edgeRag * E.bw * E.NZ.noise4(x / (0.7 * E.bw), e * 1.7, 5.1, 2.2) - my) / ms + clip;
        L.T[j] = tuftAt(E, e + 1, hb);
        L.hb[j] = hb;
        L.s[j] = Math.sin(ph);
        L.c[j] = Math.cos(ph);
      }
      return L;
    });
    let count = 0;
    for (const list of layers) for (const s of list) if (s.kind !== 1) count++;
    const x = { key, E, layers, lines, pad, count, set: null, gen: -1, wind: -1, colors: '' };
    STILLS.unshift(x);
    if (STILLS.length > 6) STILLS.pop();
    return x;
  }

  // map (General's Rotation and Size): the canvas (cw x ch) and the part of the world it shows
  function paint({ ctx, W, H, seed, p, colors, t = 0, anim, map, transparent = false }) {
    const nL = Math.max(1, colors.length - 1);
    const CW = map ? map.cw : W, CH = map ? map.ch : H, ms = map ? map.s : 1, mx = map ? map.x0 : 0, my = map ? map.y0 : 0;
    const amount = anim ? Math.max(0, anim.amount || 0) : 0;
    const Z = still(seed | 0, p, W, H, nL, CW, CH, ms, mx, my), E = Z.E;
    const rgb = colors.map(PL.color.hexToRgb);
    // the sprites of the strokes this Wind can bring onto the canvas, painted the first time they are needed
    const set = spriteSet([seed | 0, W, H, ms, nL, colors.join(','), p.brush, p.length, p.dry, p.mix].join('|'), CW, CH);
    if (Z.set !== set || Z.gen !== set.gen || Z.wind < amount) {
      if (set.map.size > 4 * Z.count + 400) restart(set);
      const dry = clamp01((p.dry ?? 55) / 100), wind = Math.max(amount, Z.set === set && Z.gen === set.gen ? Z.wind : 0);
      for (let i = 0; i < 256; i++) LOAD[i] = 1 - dry * K.runOut * sstep(0.3, 1, i / 255);
      const need = Z.layers.map((list) => list.filter((s) => {
        if (s.kind === 1) return false;
        const d = 2 * wind * s.T; // (the furthest its layer's top sways)
        const cx = (s.x - mx) / ms, cy = (s.y - my) / ms, rr = (s.L * (0.5 + K.lean) + s.w + d * s.P) / ms + 2;
        return cx + rr >= 0 && cy + rr + (K.dip * d * d * s.P) / (s.hb * ms) >= 0 && cx - rr <= CW && cy - rr <= CH;
      }));
      ensureSprites(set, need, ms, dry, rgb);
      for (const list of Z.layers) for (const s of list) if (s.kind !== 1) s.at = set.map.get(s.key) || null;
      Z.set = set;
      Z.gen = set.gen;
      Z.wind = wind;
    }
    // the flicks' paints
    const ck = colors.join(',');
    if (Z.colors !== ck) {
      for (const list of Z.layers) for (const s of list) {
        if (s.kind !== 1) continue;
        const c = mixRgb(rgb[s.c] || rgb[1], s.m >= 0 ? rgb[s.m] : rgb[s.c] || rgb[1], s.f);
        s.fill = `rgb(${c[0]},${c[1]},${c[2]})`;
      }
      Z.colors = ck;
    }
    const th = 2 * Math.PI * (((t % 1) + 1) % 1), o = { x: 0, y: 0, a: 0, curl: 0 };
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, CW, CH);
    if (!transparent) { ctx.fillStyle = colors[0]; ctx.fillRect(0, 0, CW, CH); }
    let drawn = 0;
    for (let k = 0; k < nL; k++) {
      const list = Z.layers[k];
      ctx.save();
      if (k > 0) { // the layer starts at its top line, swaying with it (and dipping as it bends)
        const ln = Z.lines[k - 1], n = ln.y.length, pad = Z.pad, Sn = Math.sin(K.beats * th), Cn = Math.cos(K.beats * th);
        const y = (i) => {
          const j = Math.min(n - 1, Math.max(0, i + pad)), d = amount * ln.T[j] * (Sn * ln.c[j] + Cn * ln.s[j] - ln.s[j]);
          const f = Math.min(n - 1.001, Math.max(0, j - d / ms)), j0 = Math.floor(f);
          return ln.y[j0] + (ln.y[j0 + 1] - ln.y[j0]) * (f - j0) + (K.dip * d * d) / (ln.hb[j] * ms);
        };
        ctx.beginPath();
        ctx.moveTo(-2, y(-2));
        for (let i = 0; i < CW; i += 2) ctx.lineTo(i + 0.5, y(i));
        ctx.lineTo(CW + 2, y(CW + 1));
        ctx.lineTo(CW + 2, CH + 2);
        ctx.lineTo(-2, CH + 2);
        ctx.closePath();
        ctx.clip();
      }
      ctx.fillStyle = colors[k + 1]; // its ground coat
      ctx.fillRect(0, 0, CW, CH);
      // its strokes and patches, going with the layer in the wind (each leaning round its root)
      for (const s of list) {
        if (s.kind === 1 || !s.at) continue;
        blow(E, s, th, amount, o);
        const at = s.at, Lc = s.L / ms, dx = s.ca, dy = s.sa, sh = o.sh, rx = (o.x - mx) / ms, ry = (o.y - my) / ms;
        const sx = s.up ? rx : rx - dx * Lc, sy = s.up ? ry : ry - dy * Lc; // (where it starts, before it leans)
        const my2 = sy + (dy * Lc) / 2, cx = sx + (dx * Lc) / 2 + sh * (my2 - ry), rr = (Lc / 2) * (1 + Math.abs(sh)) + s.w / ms + 2;
        if (cx + rr < 0 || my2 + rr < 0 || cx - rr > CW || my2 - rr > CH) continue;
        ctx.setTransform(dx + sh * dy, dy, sh * dx - dy, dx, sx + sh * (sy - ry), sy);
        ctx.drawImage(at.c, at.sx, at.sy, at.w, at.h, -at.ox, -at.oy, at.w, at.h);
        drawn++;
      }
      ctx.restore();
      // its flicks: tapering blades, bending in the wind
      for (const s of list) {
        if (s.kind !== 1) continue;
        blow(E, s, th, amount, o);
        const sx = (o.x - mx) / ms, sy = (o.y - my) / ms, Lc = s.L / ms, hw = s.w / (2 * ms);
        const dx = Math.cos(o.a), dy = -Math.sin(o.a), nx = -dy, ny = dx;
        const bend = ((2 * s.id - 1) * K.bend * 1.6 + o.curl) * Lc, rr = Lc + hw + Math.abs(bend) + 2;
        if (sx + rr < 0 || sy + rr < 0 || sx - rr > CW || sy - rr > CH) continue;
        ctx.beginPath();
        for (let q = 0; q <= 6; q++) {
          const f = q / 6, c = bend * f * f + hw * Math.pow(1 - f, 0.8);
          const X = sx + dx * Lc * f + nx * c, Y = sy + dy * Lc * f + ny * c;
          if (q) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
        }
        for (let q = 6; q >= 0; q--) {
          const f = q / 6, c = bend * f * f - hw * Math.pow(1 - f, 0.8);
          ctx.lineTo(sx + dx * Lc * f + nx * c, sy + dy * Lc * f + ny * c);
        }
        ctx.closePath();
        ctx.fillStyle = s.fill;
        ctx.fill();
        drawn++;
      }
    }
    // the canvas's bare tooth over everything (with Transparent: left see-through)
    const mask = speckMask(E, CW, CH, mx, my, ms, clamp01((p.texture ?? 45) / 100), seed | 0, rgb[0]);
    if (mask) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (transparent) ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(mask, 0, 0);
    }
    ctx.restore();
    return { status: `${nL} layer${nL === 1 ? '' : 's'} · ${drawn.toLocaleString()} strokes` };
  }

  PL.tools.register({
    id: 'brush',
    name: 'Brush',
    kind: 'Organic',
    tagline: 'Layered brush strokes',
    about: 'Layers of paint laid on in brush strokes, from the back to the front like a landscape: streaky, dry-brushed strokes with ragged ends, grassy flicks along every edge and patches of the neighbouring colors, with the canvas showing through in fine specks. In the animation the wind runs through it: every layer sways back and forth like tufts of grass.',
    raster: true,
    inks: {
      min: 3, max: 9, roles, fit, spec, add, generate,
      span: () => 2, // Invert swaps the canvas and the first layer
      rotateFrom: 1, // Rotate keeps the canvas
      hint: 'The canvas first (it shows through the paint), then a paint for each layer, from the back (the top of the frame) to the front.',
    },
    palettes: PALETTES,
    params: PARAMS,
    animLabel: 'Wind',
    animHint: 'How hard the wind blows: every layer sways back and forth like tufts of grass (0: still)',
    defaults: {
      palette: 'Pasture', // the preset the style opens on (its card's colors)
      anim: { amount: 0.4, fps: 26, frames: 120 }, // loops of about 4.6 s at 26 frames a second
      fx: {},
    },
    paint,
    zoom: true, // paints any part of its world (General's Rotation and Size)
    _K: K,
    _layout: layout,
    _strokes: strokes,
    _edgeAt: edgeAt,
    _sprites: () => SETS.reduce((a, x) => a + x.map.size, 0),
  });
})();
