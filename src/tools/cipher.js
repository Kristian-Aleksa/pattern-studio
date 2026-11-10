/* ==========================================================================
   tools/cipher.js — Cipher: glyph grids.

   1. One river of glyphs crosses a dark ground on a square grid ("Cells
      across"). Tilt leans it, Wave bends it and swells it, Detail roughens
      its edges.
   2. The river is cut into nested Bands, mirrored about its centre line.
      Every band gets its own glyph and ink: solid squares down the middle,
      diamonds beside them, then x's and ringed squares toward the edges.
      Inks are dealt at random from your palette, never twice in a row.
   3. Marks: Edges dithers neighbouring bands into each other (and scatters
      a few glyphs past the river's edge), Flecks drops squares and x's of
      random inks anywhere, Smears draws a few rows as thin scanlines in the
      inks they cross, and Ground dots marks every empty cell.
   4. Animation: the river sways gently side to side; everything else holds
      still. Frame 1 is the still image and the loop is seamless.
   Glyphs are snapped to whole pixels in exports, so files stay crisp.
   ========================================================================== */
(() => {
  const { hash } = PL.rng;

  // Ground first, then the inks the bands, flecks and smears are dealt from.
  // Ink 1 also draws the ground dots.
  const PALETTES = [
    { name: 'Arcade', colors: ['#1E1B21', '#DBF5EB', '#C55B38', '#6B9CEC', '#4FFF4C', '#E7536A', '#00DDFB'] },
    { name: 'Candy', colors: ['#1A1423', '#FFE3F1', '#FF7AB6', '#7AD7FF', '#FFE066', '#B28DFF', '#6BFFB8'] },
    { name: 'Split', colors: ['#F7F1E7', '#072135', '#DB6143', '#009B8F', '#006EAE', '#FAB8A8', '#9CE1D7'] }, // split complement of 35: terracotta 35, teal 185 and blue 245 (the first two also as tints); a deep 245 for ink 1
    { name: 'Terminal', colors: ['#0B0F0C', '#C2F7D0', '#2E8B4E', '#5CC57E', '#FFD23F', '#1E5C33', '#7FFFD4'] },
    { name: 'Ultraviolet', colors: ['#0A0A24', '#FFD6F2', '#7209B7', '#F72585', '#4CC9F0', '#9D4EDD', '#FFB703'] },
    { name: 'Desert', colors: ['#2B211C', '#F2E6D0', '#B8613A', '#2E86AB', '#E9C46A', '#8AB17D', '#E76F51'] },
    { name: 'Marigold', colors: ['#F9F5E6', '#411D10', '#D64651', '#F2823B', '#FABB41', '#A3A543', '#007CA5'] }, // analogous 20/50/80/110 on cream (a deep 40 for ink 1), with a 230 accent across the wheel
    { name: 'Signal', colors: ['#0E1013', '#F4F1EA', '#4F6A8F', '#7FA3C9', '#C9D6E3', '#2E3440', '#FF5A36'] },
    { name: 'Lagoon', colors: ['#0A2E1F', '#F2F5F9', '#81C7BE', '#1B6B8B', '#E85D75'] },
    { name: 'Duo', colors: ['#101820', '#E8E4DA', '#F2AA4C'] },
    { name: 'Mono', colors: ['#141414', '#F2F2EE'] },
  ];

  /* ---- color roles --------------------------------------------------------- */
  function roles(n) {
    return ['Ground', ...Array.from({ length: n - 1 }, (_, i) => 'Ink ' + (i + 1))];
  }
  const spec = (n) => ({ ramp: 1, accents: Math.max(0, n - 2) });

  // "New colors": a quiet ground (usually dark) and vivid inks with hues spread
  // round the wheel; the first ink is a soft near-white (or near-black) for the dots.
  function generate(n, rng) {
    const C = PL.color;
    const dark = rng.chance(0.75);
    const h0 = rng.float(0, 360);
    const ground = dark ? C.lch(rng.float(0.16, 0.22), rng.float(0.005, 0.025), h0) : C.lch(rng.float(0.94, 0.97), rng.float(0.005, 0.02), h0 + 40);
    const out = [ground, dark ? C.lch(rng.float(0.93, 0.97), rng.float(0.02, 0.05), h0 + 150) : C.lch(rng.float(0.18, 0.25), rng.float(0.01, 0.04), h0)];
    const k = n - 2;
    const step = 360 / Math.max(1, k), start = rng.float(0, 360);
    for (let i = 0; i < k; i++) {
      const hue = start + i * step + rng.float(-step * 0.25, step * 0.25);
      const L = dark ? rng.float(0.62, 0.86) : rng.float(0.45, 0.68);
      out.push(C.lch(L, rng.float(0.13, 0.21), hue));
    }
    return out.slice(0, Math.max(2, n));
  }

  // + adds an ink in the hue the palette is missing most.
  function add(colors) {
    const C = PL.color;
    const c = colors.slice();
    const inks = c.slice(1).map(C.hexToLch);
    const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
    const L = inks.length ? med(inks.map((x) => x[0])) : 0.75;
    const Ch = inks.length ? Math.max(0.1, med(inks.map((x) => x[1]))) : 0.16;
    const lab = c.map(C.hexToOklab);
    let best = null, bestD = -1;
    for (let hue = 0; hue < 360; hue += 10) {
      const hex = C.lch(L, Ch, hue), o = C.hexToOklab(hex);
      const d = Math.min(...lab.map((x) => Math.hypot(x[0] - o[0], x[1] - o[1], x[2] - o[2])));
      if (d > bestD) { bestD = d; best = hex; }
    }
    c.push(best);
    return c;
  }

  function fit(colors, n) {
    const C = PL.color;
    let c = (colors || []).map(C.normHex).filter(Boolean);
    if (!c.length) c = PALETTES[0].colors.slice();
    if (c.length === 1) c.push(C.mix(c[0], C.luminance(c[0]) > 0.35 ? '#000000' : '#FFFFFF', 0.85));
    if (c.length > n) return c.slice(0, n);
    while (c.length < n) c = add(c);
    return c;
  }

  const S = (section, key, label, min, max, def, extra = {}) => ({ section, key, label, type: 'range', min, max, def, step: 1, ...extra });

  const PARAMS = [
    S('Grid', 'cells', 'Cells across', 12, 200, 80, { rand: [70, 100], hint: 'How many glyphs fit across the frame' }),
    S('Grid', 'bands', 'Bands', 2, 12, 5, { rand: [4, 6], hint: 'Ground plus the glyph bands nested in the river' }),
    S('Field', 'wave', 'Wave', 0, 100, 60, { unit: '%', rand: [25, 85], hint: 'How much the river bends and swells' }),
    S('Field', 'tilt', 'Tilt', 0, 100, 20, { unit: '%', rand: [0, 90], hint: 'How far the river leans from upright' }),
    S('Field', 'detail', 'Detail', 0, 100, 50, { unit: '%', rand: [30, 70], hint: 'Roughness of the band edges' }),
    S('Marks', 'size', 'Size', 20, 100, 80, { unit: '%', rand: [70, 90], hint: 'Glyph size within its cell' }),
    S('Marks', 'edges', 'Edges', 0, 100, 60, { unit: '%', rand: [40, 80], hint: 'How far neighbouring bands dither into each other' }),
    S('Marks', 'flecks', 'Flecks', 0, 40, 6, { unit: '%', rand: [3, 10], hint: 'Squares and x’s of random inks scattered everywhere' }),
    S('Marks', 'smears', 'Smears', 0, 100, 15, { unit: '%', rand: [8, 30], hint: 'Rows drawn as thin scanlines in the inks they cross' }),
    S('Marks', 'dots', 'Ground dots', 0, 100, 60, { unit: '%', rand: [40, 80], hint: 'Size of the dots in empty cells (0 % hides them)' }),
  ];

  // Shape constants (lengths in units of the frame's short edge unless noted).
  const K = {
    half: 0.31,       // river half-width
    shift: 0.12,      // random offset of the river from the centre
    lean: 45,         // degrees of lean at Tilt 100 %
    bend: 0.085,      // centre-line bends at Wave 100 %
    bendF: 0.75,      // bends per short edge
    swell: 0.2,       // width swelling at Wave 100 % (share of the half-width)
    rough: 0.16,      // edge noise at Detail 100 % (bites and bulges a few cells deep)
    roughF: 3.4,      // edge noise frequency (cycles per short edge)
    dither: 0.8,      // band-edge dither at Edges 100 % (in bands)
    fleck: 0.4,       // share of cells flecked at Flecks 100 %
    smear: 0.011,     // smear starts per cell at Smears 100 %
    smearLen: [6, 16],
    smearH: 0.36,     // scanline height (x cell)
    dot: 0.12,        // ground dot diameter at 100 % (x cell)
    sway: 0.08,       // sway (side to side) at Amount 1
    swayBend: 1.2,    // radians of phase across the frame, so the sway ripples a little
    diamond: 0.48,    // diamond half-diagonal (x glyph size)
    xHalf: 0.42,      // x half-extent (x glyph size)
    xStroke: 0.2,     // x stroke (x glyph size)
    ring: 0.16,       // ring stroke (x glyph size)
    core: 0.3,        // ringed square's centre (x glyph size)
  };

  const GLYPH = { square: 0, diamond: 1, x: 2, ring: 3 };

  // Glyph + ink for each band, from the centre outward (seeded, palette-size aware).
  function deal(seed, bands, nInks) {
    const r = PL.rng.create(seed ^ 0x3c6ef372);
    const glyphs = [], inks = [];
    for (let k = 0; k < bands; k++) {
      let g;
      if (k === 0) g = GLYPH.square;
      else if (k === 1) g = r.chance(0.85) ? GLYPH.diamond : GLYPH.ring;
      else {
        const outer = k === bands - 1;
        const pool = outer ? [2, 2, 2, 3, 3, 0] : [2, 2, 3, 3, 1, 0];
        do g = r.pick(pool); while (g === glyphs[k - 1] && r.next() < 0.85);
      }
      glyphs.push(g);
      let ink = 1;
      if (nInks > 1) {
        do ink = 1 + Math.floor(r.next() * nInks); while (k > 0 && ink === inks[k - 1]);
      }
      inks.push(ink);
    }
    return { glyphs, inks };
  }

  // region (General's Rotation and Size): the part of the world to cover; the grid and the river run on
  // past the frame, so zooming out shows more of the same picture.
  function build({ W, H, seed, p, colors, t = 0, anim, crisp = true, region }) {
    const n = colors.length;
    const nInks = Math.max(1, n - 1);
    const scene = new PL.Scene(W, H, colors[0], 0);
    const dotLayer = scene.layer('dots', colors[Math.min(1, n - 1)], 'Ground dots', Math.min(1, n - 1));
    const layers = [];
    for (let i = 1; i < n; i++) layers[i] = scene.layer('ink-' + i, colors[i], 'Ink ' + i, i);
    if (n < 2) layers[1] = dotLayer;

    // --- grid ------------------------------------------------------------------------
    const cols = Math.max(1, Math.round(p.cells));
    const c = W / cols; // square cells across the width
    const rows = Math.max(1, Math.ceil(H / c - 1e-6));
    const B = Math.max(2, Math.round(p.bands));
    const nb = B - 1; // glyph bands; the last band is the ground
    const { glyphs, inks } = deal(seed, nb, nInks);
    const c0 = region ? Math.floor(region.x0 / c) : 0, c1 = region ? Math.ceil(region.x1 / c) : cols;
    const r0 = region ? Math.floor(region.y0 / c) : 0, r1 = region ? Math.ceil(region.y1 / c) : rows;
    const nc = c1 - c0, nr = r1 - r0, Hc = region ? Infinity : H; // (the frame's last row is cut at its edge)

    // --- the river ---------------------------------------------------------------------
    const Sm = Math.min(W, H);
    const r = PL.rng.create(seed ^ 0x6c8e9cf5);
    const lean = ((p.tilt / 100) * K.lean * Math.PI) / 180 * (r.next() < 0.5 ? -1 : 1);
    const ax = Math.sin(lean), ay = Math.cos(lean); // along the river
    const nx = Math.cos(lean), ny = -Math.sin(lean); // across it
    const off = r.float(-K.shift, K.shift) * Sm;
    const cx0 = W / 2 + nx * off, cy0 = H / 2 + ny * off;
    const wv = p.wave / 100;
    const ph1 = r.float(0, Math.PI * 2), ph2 = r.float(0, Math.PI * 2), ph3 = r.float(0, Math.PI * 2);
    const N = PL.noise.get(seed);
    const ox = r.float(-200, 200), oy = r.float(-200, 200);
    const rough = (p.detail / 100) * K.rough * Sm;
    const R0 = K.half * Sm;
    const amt = Math.max(0, anim ? anim.amount : 0);
    const swayA = amt * K.sway * Sm, swayT = t * Math.PI * 2;
    const dz = (p.edges / 100) * K.dither;

    // Band index per cell (0 = centre ... nb - 1 = outermost glyph band, nb = ground).
    const band = new Int8Array(nc * nr);
    for (let j = r0; j < r1; j++) {
      const py = (j + 0.5) * c;
      for (let i = c0; i < c1; i++) {
        const px = (i + 0.5) * c;
        const dx = px - cx0, dy = py - cy0;
        const a = (dx * ax + dy * ay) / Sm; // along, in short edges
        let s = dx * nx + dy * ny;            // across, in px
        s -= wv * K.bend * Sm * (Math.sin(2 * Math.PI * K.bendF * a + ph1) + 0.45 * Math.sin(2 * Math.PI * K.bendF * 2.3 * a + ph2));
        if (swayA > 0) s -= swayA * (Math.sin(swayT + K.swayBend * a) - Math.sin(K.swayBend * a)); // 0 at frame 1
        if (rough > 0) s += rough * N.fbm4((px / Sm) * K.roughF + ox, (py / Sm) * K.roughF + oy, 0, 0, 2, 0.35);
        const R = R0 * (1 + wv * K.swell * Math.sin(2 * Math.PI * K.bendF * 0.6 * a + ph3));
        const z = (Math.abs(s) / R) * nb + (hash(i, j, seed, 11) - 0.5) * dz;
        band[(j - r0) * nc + (i - c0)] = z < 0 ? 0 : z >= nb ? nb : z | 0;
      }
    }

    // --- marks -----------------------------------------------------------------------------
    const size = p.size / 100;
    const fleckP = (p.flecks / 100) * K.fleck;
    const smearP = (p.smears / 100) * K.smear;
    const dotD = Math.pow(p.dots / 100, 2) * K.dot; // fine at the default: a faint dot grid
    const [sMin, sMax] = K.smearLen;

    const box = (i, j) => {
      if (crisp) {
        const x0 = Math.round(i * c), y0 = Math.round(j * c);
        return [x0, y0, Math.round((i + 1) * c) - x0, Math.min(Hc, Math.round((j + 1) * c)) - y0];
      }
      return [i * c, j * c, c, Math.min(c, Hc - j * c)];
    };
    const snap = (v) => (crisp ? Math.max(1, Math.round(v)) : v);

    function glyph(layer, g, i, j) {
      const [x0, y0, bw, bh] = box(i, j);
      const cell = Math.min(bw, bh);
      if (cell <= 0) return;
      const cx = x0 + bw / 2, cy = y0 + bh / 2;
      const s = snap(size * cell);
      const sx = crisp ? x0 + Math.floor((bw - s) / 2) : cx - s / 2;
      const sy = crisp ? y0 + Math.floor((bh - s) / 2) : cy - s / 2;
      if (g === GLYPH.square) {
        layer.r.push(sx, sy, s, s);
      } else if (g === GLYPH.diamond) {
        const hd = s * K.diamond;
        layer.q.push(cx, cy - hd, cx + hd, cy, cx, cy + hd, cx - hd, cy);
      } else if (g === GLYPH.ring) {
        const w = Math.min(s / 2, snap(s * K.ring));
        layer.r.push(sx, sy, s, w, sx, sy + s - w, s, w, sx, sy + w, w, s - 2 * w, sx + s - w, sy + w, w, s - 2 * w);
        const k = snap(s * K.core);
        const kx = crisp ? sx + Math.floor((s - k) / 2) : cx - k / 2, ky = crisp ? sy + Math.floor((s - k) / 2) : cy - k / 2;
        layer.r.push(kx, ky, k, k);
      } else {
        // x: two diagonal bars (clockwise quads); b is where each bar meets the box edge
        const a = s * K.xHalf, b = (s * K.xStroke) / Math.SQRT2;
        layer.q.push(cx - a, cy - a + b, cx - a + b, cy - a, cx + a, cy + a - b, cx + a - b, cy + a);
        layer.q.push(cx + a - b, cy - a, cx + a, cy - a + b, cx - a + b, cy + a, cx - a, cy + a - b);
      }
    }

    // Smears: fixed scanlines on the grid; they show only where they cross the river.
    // (past the frame they start further left too, so ones that run into the region show)
    const smeared = new Uint8Array(nc * nr);
    if (smearP > 0) {
      const s0 = region ? c0 - sMax : 0, s1 = region ? c1 : cols, e1 = region ? c1 : cols;
      for (let j = r0; j < r1; j++) {
        for (let i = s0; i < s1; i++) {
          if (hash(i, j, seed, 71) >= smearP) continue;
          const len = sMin + Math.floor(hash(i, j, seed, 73) * (sMax - sMin + 1));
          for (let k = Math.max(i, c0); k < Math.min(e1, i + len); k++) smeared[(j - r0) * nc + (k - c0)] = 1;
        }
      }
    }

    for (let j = r0; j < r1; j++) {
      for (let i = c0; i < c1; i++) {
        const k = (j - r0) * nc + (i - c0);
        const b = band[k];
        // Flecks: squares and x's of random inks, anywhere, holding still.
        const fleck = fleckP > 0 && hash(i, j, seed, 31) < fleckP;
        const fInk = fleck ? 1 + Math.floor(hash(i, j, seed, 37) * nInks) : 0;
        if (smeared[k] && b < nb) {
          // A thin bar across the whole cell, so neighbouring cells join into one scanline
          // that picks up the ink of every band (and fleck) it crosses.
          const [x0, y0, bw, bh] = box(i, j);
          const hh = snap(K.smearH * Math.min(bw, bh));
          (layers[fleck ? fInk : inks[b]] || layers[1]).r.push(x0, crisp ? y0 + Math.floor((bh - hh) / 2) : y0 + (bh - hh) / 2, bw, hh);
          continue;
        }
        if (fleck) {
          glyph(layers[fInk] || layers[1], hash(i, j, seed, 41) < 0.65 ? GLYPH.square : GLYPH.x, i, j);
          continue;
        }
        if (b >= nb) {
          if (dotD > 0) {
            const [x0, y0, bw, bh] = box(i, j);
            dotLayer.c.push(x0 + bw / 2, y0 + bh / 2, Math.max(0.1, (dotD * Math.min(bw, bh)) / 2)); // true size: faint when small
          }
          continue;
        }
        glyph(layers[inks[b]] || layers[1], glyphs[b], i, j);
      }
    }
    return scene;
  }

  PL.tools.register({
    id: 'cipher',
    name: 'Cipher',
    kind: 'Backgrounds',
    tagline: 'Glyph rivers',
    about: 'A river of glyphs on a dark grid: solid squares down the middle, diamonds, x’s and ringed squares toward the edges, each band in its own ink, with stray flecks and scanline smears.',
    inks: {
      min: 2, max: 8, roles, fit, spec, add, generate,
      span: () => 2, // Invert swaps the ground and ink 1 (dark ground <-> light ground)
      hint: 'The first card is the ground; bands, flecks and smears are dealt from the other inks. Ink 1 also draws the ground dots.',
    },
    palettes: PALETTES,
    params: PARAMS,
    defaults: {
      anim: { amount: 0.6, fps: 12, frames: 36 },
      fx: {},
    },
    build,
    zoom: true, // draws any region of its world (General's Rotation and Size)
    _K: K,
  });
})();
