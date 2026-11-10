/* ==========================================================================
   tools/sonar.js — Sonar: dithered landmasses on a square grid.

   1. A fractal noise field (optionally domain-warped) is the terrain, sampled
      once per grid cell (Resolution = cells across the long edge).
   2. The coastline is the height where exactly `Coverage` % of the frame is land.
   3. Land cells hold a square whose area follows the terrain height: small at
      the shore, growing inland until the cell is solid. A thin gap between
      cells ("Grid lines") shows the grid across the solid land.
   4. Just below sea level the land dissolves into grid-aligned specks in two
      colors — densest a couple of cells off the shore, trailing out along
      underwater ridges.
   Squares are snapped to whole pixels, so exports are crisp flat color.
   ========================================================================== */
(() => {
  const { hash } = PL.rng;
  const BAYER4 = PL.fx.BAYER4;

  // The first palette is the one Sonar starts with (and shows on the home page).
  const PALETTES = [
    { name: 'Moss', colors: ['#1A1F16', '#9AAE6B', '#E07A5F', '#F2CC8F'] },
    { name: 'Lagoon', colors: ['#0E3B4A', '#F2E3C6', '#FF7F6E', '#7FD8C9'] },
    { name: 'Sonar', colors: ['#0D1117', '#8DBF9C', '#FF6B35', '#4CC9F0'] },
    { name: 'Tetrad', colors: ['#091C51', '#3FBFCC', '#FA6863', '#FFD16B'] }, // rectangle tetrad 265/205/25/85: a deep sea, teal land, coral and gold specks
    { name: 'Triad', colors: ['#19172E', '#66C7A0', '#F59569', '#A9A6FA'] }, // triad 165/285/405: land, the two specks; sea a deep shade of the third
    { name: 'Phosphor', colors: ['#050A07', '#3FA34D', '#C4F5A8', '#2BD9A0'] },
    { name: 'Thermal', colors: ['#0E0A1A', '#D6336C', '#FFB347', '#2EC4B6'] },
    { name: 'Ultraviolet', colors: ['#0A0A24', '#7209B7', '#F72585', '#4CC9F0'] },
    { name: 'Split', colors: ['#001927', '#E7CE98', '#ED756C', '#87C7ED'] }, // split complement of 236: navy sea and sky speck on 236, sand land at +210, coral speck at +150
    { name: 'Desert', colors: ['#F2E6D0', '#B8613A', '#2E86AB', '#1B1B1E'] },
    { name: 'Topo', colors: ['#F2EEE4', '#C9B79C', '#8C6F56', '#3E3129', '#D1495B', '#2A9D8F'] },
    { name: 'Duotone', colors: ['#101820', '#F2AA4C'] },
  ];

  /* ---- color roles ------------------------------------------------------
     2 colors: sea, land (specks use the land color)
     3 colors: sea, land, speck
     4+:       sea, land tones (low -> high ground), speck A, speck B      */
  function slots(n) {
    if (n <= 2) return { sea: 0, land: [1], a: 1, b: 1 };
    if (n === 3) return { sea: 0, land: [1], a: 2, b: 2 };
    return { sea: 0, land: Array.from({ length: n - 3 }, (_, i) => 1 + i), a: n - 2, b: n - 1 };
  }

  function roles(n) {
    if (n <= 2) return ['Sea', 'Land'];
    if (n === 3) return ['Sea', 'Land', 'Speck'];
    const nl = n - 3;
    return ['Sea', ...Array.from({ length: nl }, (_, i) => (nl === 1 ? 'Land' : 'Land ' + (i + 1))), 'Speck A', 'Speck B'];
  }

  // Generator recipe for "New colors" at a given count.
  const spec = (n) => (n <= 2 ? { ramp: 1, accents: 0 } : n === 3 ? { ramp: 1, accents: 1 } : { ramp: n - 3, accents: 2 });

  const isLight = (hex) => PL.color.luminance(hex) > 0.35;

  // Add one color where it makes sense for the roles (used by the + card).
  function add(colors) {
    const C = PL.color;
    const c = colors.slice();
    const n = c.length;
    if (n <= 2) {
      // First speck color: the land's complementary hue, contrasting with the sea.
      const [, , hue] = C.hexToLch(c[1] || '#995959');
      c.push(C.lch(isLight(c[0]) ? 0.58 : 0.74, 0.16, hue + 180));
    } else if (n === 3) {
      // Second speck color: a lighter or darker partner of the first.
      c.push(C.mix(c[2], isLight(c[2]) ? '#000000' : '#FFFFFF', 0.38));
    } else {
      // Another land tone for higher ground, just before the specks.
      const last = c[n - 3];
      c.splice(n - 2, 0, C.mix(last, isLight(c[0]) ? '#000000' : '#FFFFFF', 0.3));
    }
    return c;
  }

  // Fit any list of colors to exactly n (loading old files, generator output).
  function fit(colors, n) {
    const C = PL.color;
    let c = (colors || []).map(C.normHex).filter(Boolean);
    if (!c.length) c = PALETTES[0].colors.slice();
    if (c.length === 1) c.push(C.mix(c[0], isLight(c[0]) ? '#000000' : '#FFFFFF', 0.7));
    if (c.length === n) return c;
    if (c.length > n) {
      if (n <= 2) return [c[0], c[1]];
      if (n === 3) return [c[0], c[1], c[c.length - 1]];
      const land = c.slice(1, c.length - 2);
      const nl = n - 3;
      return [c[0], ...(nl === 1 ? [land[land.length - 1]] : C.ramp(land, nl)), c[c.length - 2], c[c.length - 1]];
    }
    while (c.length < n) c = add(c);
    return c;
  }

  // Swap light and dark: sea <-> land (reversing the land tones), specks untouched.
  function invert(colors) {
    const c = colors.slice();
    const k = c.length <= 2 ? c.length : c.length === 3 ? 2 : c.length - 2;
    const head = c.slice(0, k).reverse();
    return [...head, ...c.slice(k)];
  }

  const S = (section, key, label, min, max, def, extra = {}) => ({ section, key, label, type: 'range', min, max, def, step: 1, ...extra });

  const PARAMS = [
    S('Land', 'coverage', 'Coverage', 5, 95, 62, { unit: '%', rand: [34, 62], hint: 'How much of the frame is land' }),
    S('Land', 'feature', 'Feature size', 0.5, 6, 2.0, { step: 0.1, rand: [1.4, 3.4], hint: 'Size of the landmasses' }),
    S('Land', 'distortion', 'Distortion', 0, 100, 50, { unit: '%', rand: [15, 70], hint: 'Twists the coastline' }),
    S('Halftone', 'resolution', 'Resolution', 20, 300, 177, { rand: [100, 190], hint: 'Grid cells across the long edge' }),
    S('Halftone', 'depth', 'Depth', 0, 100, 79, { unit: '%', rand: [45, 90], hint: 'How far inland the halftone runs before land turns solid' }),
    S('Halftone', 'grid', 'Grid lines', 0, 100, 25, { unit: '%', rand: false, hint: 'Thin gaps between cells — the grid across solid land' }),
    { section: 'Halftone', key: 'dot', label: 'Cell', type: 'seg', def: 'square', rand: false,
      options: [{ value: 'square', label: 'Square' }, { value: 'round', label: 'Round' }, { value: 'diamond', label: 'Diamond' }] },
    S('Coast', 'fringe', 'Fringe', 0, 100, 49, { unit: '%', rand: [25, 70], hint: 'How far the speckle spreads out to sea' }),
    S('Coast', 'specks', 'Specks', 0, 100, 66, { unit: '%', rand: [40, 85], hint: 'How dense the two-color speckle is' }),
  ];

  const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  // crisp: snap squares to whole pixels (exports). The preview passes crisp=false plus
  // refL (the export's long edge) so its grid lines keep the export's proportions.
  // region (General's Rotation and Size): the part of the world to cover. The terrain runs on past the
  // frame; sea level and the coast's measures still come from the frame's own cells, so the frame shows
  // exactly what it does at 100 %.
  function build({ W, H, seed, p, colors, t = 0, anim, crisp = true, refL, region }) {
    const n = colors.length;
    const sl = slots(n);
    const scene = new PL.Scene(W, H, colors[sl.sea], sl.sea);
    const nl = sl.land.length;
    const landLayers = sl.land.map((ci, k) => scene.layer('land-' + k, colors[ci], nl === 1 ? 'Land' : 'Land ' + (k + 1), ci));
    const oneSpeck = sl.a === sl.b;
    const layA = scene.layer('speck-a', colors[sl.a], oneSpeck ? 'Specks' : 'Speck A', sl.a);
    const layB = oneSpeck ? layA : scene.layer('speck-b', colors[sl.b], 'Speck B', sl.b);

    // --- grid ------------------------------------------------------------------
    const L = Math.max(W, H);
    const res = Math.max(4, p.resolution);
    const c = L / res; // cell size in px (may be fractional; edges get snapped)
    const cols = Math.max(1, Math.ceil(W / c - 1e-6));
    const rows = Math.max(1, Math.ceil(H / c - 1e-6));

    // --- 1. terrain, sampled at cell centres -----------------------------------
    const N = PL.noise.get(seed);
    const rnd = PL.rng.create(seed);
    const ox = rnd.float(-400, 400), oy = rnd.float(-400, 400);
    const f0 = 2.4 / p.feature; // noise cycles per long edge
    const warp = (p.distortion / 100) * 0.55;
    // Time loop: a small circle in the noise's extra dimensions starting at the
    // origin, so frame 1 is always the still image and Amount only changes motion.
    const R = Math.max(0, anim ? anim.amount : 0) * 0.07;
    const ang = t * Math.PI * 2;
    const zc = R * (Math.cos(ang) - 1), wc = R * Math.sin(ang);

    const terrain = (i, j) => {
      const v = ((j + 0.5) * c) / L, u = ((i + 0.5) * c) / L;
      let x = u * f0 + ox, y = v * f0 + oy;
      if (warp > 0) {
        const qx = N.fbm4(x + 3.1, y - 7.7, zc + 11.3, wc - 4.1, 2);
        const qy = N.fbm4(x - 9.4, y + 5.2, zc - 6.7, wc + 13.9, 2);
        x += warp * qx;
        y += warp * qy;
      }
      return N.fbm4(x, y, zc, wc, 4);
    };
    const F = new Float32Array(cols * rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) F[j * cols + i] = terrain(i, j);

    // --- 2. sea level: the height that leaves `coverage` % of the cells as land --
    const sorted = F.slice().sort();
    const q = (a) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(a * (sorted.length - 1))))];
    const thr = q(1 - p.coverage / 100);
    const top = Math.max(thr + 1e-4, q(0.997));

    // Typical slope of the terrain near the coastline (per cell), so Depth and
    // Fringe read as distances from the shore rather than raw heights.
    const near = Math.abs(q(0.62) - q(0.38)) * 0.5 + 1e-6; // heights within ~12% of the cells around sea level
    const grads = [];
    for (let j = 1; j < rows - 1; j++) {
      for (let i = 1; i < cols - 1; i++) {
        const k = j * cols + i;
        if (Math.abs(F[k] - thr) > near) continue;
        const gx = (F[k + 1] - F[k - 1]) * 0.5, gy = (F[k + cols] - F[k - cols]) * 0.5;
        grads.push(Math.sqrt(gx * gx + gy * gy));
      }
    }
    let gCell = 0.01;
    if (grads.length) {
      grads.sort((a, b) => a - b);
      gCell = Math.max(1e-6, grads[grads.length >> 1]);
    }

    // Halftone band: Depth 70% ≈ 7 cells at Resolution 150 (a fixed share of the frame).
    const band = Math.max(1e-6, (p.depth / 100) * 0.067 * res * gCell);
    // Speckle: a ring a few cells off the shore (following the coastline's shape,
    // so it also traces underwater ridges), with a clear gap right at the shore.
    const peak = Math.pow(p.specks / 60, 1.2); // 1 at 60 %; higher fills the ring in
    const fr = p.fringe / 100;
    const ringAt = 1.2 + fr * 4.6; // centre of the speckle ring, in cells out to sea
    const ringW = 0.6 + fr * 3.1;  // how quickly it builds up from the shore gap
    const tail = 0.5 + fr * 6.5;   // how far it trails out beyond the ring
    const sMax = ringAt + tail * 5;

    // --- 3. draw cells ---------------------------------------------------------------
    // Cells snap to the output's whole pixels: zs of them to a frame pixel (zoomed in by General's Size, more).
    const zs = region && region.z > 1 ? region.z : 1, snap = (v) => Math.round(v * zs) / zs;
    // Grid lines: a gap of at least 1 export pixel between cells.
    const gridFrac = (p.grid / 100) * 0.12;
    let gapPx = 0;
    if (p.grid > 0) {
      if (crisp) gapPx = Math.max(1, Math.round(gridFrac * c * zs)) / zs;
      else {
        const refC = (refL || L) / res;
        gapPx = (Math.max(1, Math.round(gridFrac * refC)) / refC) * c;
      }
    }
    const fit = (f, inner) => (crisp ? Math.max(1 / zs, Math.min(inner, Math.round(f * c * zs) / zs)) : Math.min(inner, f * c));
    const shape = p.dot || 'square';
    // Low-frequency patchiness so specks gather in clusters rather than a uniform spray.
    const cf = 0.11; // blobs a few cells across
    const clump = (i, j) => {
      const v = 0.5 + 0.5 * N.noise4(i * cf + 17.3, j * cf - 5.1, zc * 0.5 + 3, wc * 0.5);
      return 0.12 + 2 * v * v;
    };

    // Full cells fill their (pixel-snapped) box minus the grid gap. Smaller squares sit
    // centred in the cell: snapped to whole pixels for exports, exact for the preview
    // (which keeps small previews free of moiré).
    const put = (layer, x0, y0, fw, fh, cx, cy, s, full) => {
      if (shape === 'square') {
        if (full) layer.r.push(x0, y0, fw - gapPx, fh - gapPx);
        else if (crisp) layer.r.push(x0 + Math.floor(((fw - s) * zs) / 2) / zs, y0 + Math.floor(((fh - s) * zs) / 2) / zs, s, s);
        else layer.r.push(cx - s / 2, cy - s / 2, s, s);
      } else if (shape === 'round') {
        const d = full ? Math.min(fw, fh) - gapPx : s;
        layer.c.push(crisp ? x0 + fw / 2 : cx, crisp ? y0 + fh / 2 : cy, d / 2);
      } else {
        const hd = (full ? Math.min(fw, fh) - gapPx : s) * 0.62;
        const px = crisp ? x0 + fw / 2 : cx, py = crisp ? y0 + fh / 2 : cy;
        layer.q.push(px, py - hd, px + hd, py, px, py + hd, px - hd, py);
      }
    };

    // the cells to draw: the frame's, or every one the region reaches
    const c0 = region ? Math.floor(region.x0 / c) : 0, c1 = region ? Math.ceil(region.x1 / c) : cols;
    const r0 = region ? Math.floor(region.y0 / c) : 0, r1 = region ? Math.ceil(region.y1 / c) : rows;
    const at = (i, j) => (i >= 0 && i < cols && j >= 0 && j < rows ? F[j * cols + i] : terrain(i, j));
    for (let j = r0; j < r1; j++) {
      const y0 = snap(j * c), fh = snap((j + 1) * c) - y0, cy = (j + 0.5) * c;
      for (let i = c0; i < c1; i++) {
        const x0 = snap(i * c), fw = snap((i + 1) * c) - x0, cx = (i + 0.5) * c;
        const val = at(i, j);
        const inner = Math.min(fw, fh) - gapPx; // largest square that still shows the grid

        if (val > thr) {
          // Land: square area follows height above sea level.
          const tone = (val - thr) / band;
          let layer = landLayers[0];
          if (nl > 1) {
            const e = (val - thr) / (top - thr);
            let b = e * nl + (BAYER4[((j & 3) << 2) | (i & 3)] - 0.5) * 0.9;
            b = b < 0 ? 0 : b >= nl ? nl - 1 : b | 0;
            layer = landLayers[b];
          }
          if (tone >= 1) {
            put(layer, x0, y0, fw, fh, cx, cy, inner, true);
          } else {
            const s = fit(Math.max(0.3, Math.sqrt(tone)), inner);
            put(layer, x0, y0, fw, fh, cx, cy, s, s >= inner);
          }
        } else if (peak > 0) {
          // Sea: speckle just below sea level, trailing along underwater ridges.
          const sb = (thr - val) / gCell; // roughly "cells out to sea"
          if (sb > sMax) continue;
          const z = (sb - ringAt) / ringW;
          const prof = sb <= ringAt ? Math.exp(-0.5 * z * z) : Math.exp(-(sb - ringAt) / tail);
          const prob = peak * prof * smooth(0.65, 1.8, sb) * clump(i, j);
          // Part random, part smooth noise: neighbouring cells tend to agree, so specks
          // form little chains and clusters instead of an even spray.
          const nz = 0.5 + 0.5 * N.noise4(i * 0.33 - 31.7, j * 0.33 + 8.9, zc * 0.5 - 7, wc * 0.5 + 2);
          if (hash(i, j, seed, 23) * 0.65 + nz * 0.35 >= prob) continue;
          const s = fit(Math.max(0.25, 0.75 * Math.pow(hash(i, j, seed, 29), 0.3)), inner);
          put(hash(i, j, seed, 37) < 0.55 ? layA : layB, x0, y0, fw, fh, cx, cy, s, false);
        }
      }
    }
    return scene;
  }

  PL.tools.register({
    id: 'sonar',
    name: 'Sonar',
    kind: 'Backgrounds',
    tagline: 'Dithered landmasses',
    about: 'A coastline cut from a noise field, filled as a halftone grid and dissolving into two colors of speckle at its edge.',
    inks: {
      min: 2, max: 8, roles, fit, spec, add, invert,
      span: (n) => (n <= 3 ? 2 : n - 2), // colors that swap on Invert (sea + land)
      hint: 'Order sets the role: sea, land, then specks.',
    },
    palettes: PALETTES,
    params: PARAMS,
    defaults: {
      anim: { amount: 0.6, fps: 10, frames: 24 },
      fx: {},
      view: { rotate: 0, size: 117 }, // General's Rotation and Size it opens at (its card's look)
    },
    build,
    zoom: true, // draws any region of its world (General's Rotation and Size)
  });
})();
