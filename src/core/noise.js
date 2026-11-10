/* ==========================================================================
   core/noise.js
   Seeded 4D simplex noise + fractal sums.
   4D lets a 2D field evolve along a circle in the extra two dimensions,
   so every animation loops seamlessly (last frame flows into the first).
   ========================================================================== */
PL.noise = (() => {
  const F4 = (Math.sqrt(5) - 1) / 4;
  const G4 = (5 - Math.sqrt(5)) / 20;
  const G4_2 = 2 * G4, G4_3 = 3 * G4, G4_4 = 4 * G4 - 1;

  // 32 gradient directions (edge midpoints of a 4D hypercube).
  const GRAD4 = new Int8Array([
    0, 1, 1, 1, 0, 1, 1, -1, 0, 1, -1, 1, 0, 1, -1, -1,
    0, -1, 1, 1, 0, -1, 1, -1, 0, -1, -1, 1, 0, -1, -1, -1,
    1, 0, 1, 1, 1, 0, 1, -1, 1, 0, -1, 1, 1, 0, -1, -1,
    -1, 0, 1, 1, -1, 0, 1, -1, -1, 0, -1, 1, -1, 0, -1, -1,
    1, 1, 0, 1, 1, 1, 0, -1, 1, -1, 0, 1, 1, -1, 0, -1,
    -1, 1, 0, 1, -1, 1, 0, -1, -1, -1, 0, 1, -1, -1, 0, -1,
    1, 1, 1, 0, 1, 1, -1, 0, 1, -1, 1, 0, 1, -1, -1, 0,
    -1, 1, 1, 0, -1, 1, -1, 0, -1, -1, 1, 0, -1, -1, -1, 0,
  ]);

  function create(seed) {
    const rand = PL.rng.mulberry32((seed ^ 0x5bd1e995) >>> 0);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    const perm = new Uint8Array(512);
    const g4 = new Uint8Array(512); // gradient offset into GRAD4
    for (let i = 0; i < 512; i++) {
      perm[i] = p[i & 255];
      g4[i] = (perm[i] % 32) * 4;
    }

    function noise4(x, y, z, w) {
      const s = (x + y + z + w) * F4;
      const i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s), l = Math.floor(w + s);
      const t = (i + j + k + l) * G4;
      const x0 = x - i + t, y0 = y - j + t, z0 = z - k + t, w0 = w - l + t;

      // Rank the coordinates to find which simplex we are in.
      let rx = 0, ry = 0, rz = 0, rw = 0;
      if (x0 > y0) rx++; else ry++;
      if (x0 > z0) rx++; else rz++;
      if (x0 > w0) rx++; else rw++;
      if (y0 > z0) ry++; else rz++;
      if (y0 > w0) ry++; else rw++;
      if (z0 > w0) rz++; else rw++;

      const i1 = rx >= 3 ? 1 : 0, j1 = ry >= 3 ? 1 : 0, k1 = rz >= 3 ? 1 : 0, l1 = rw >= 3 ? 1 : 0;
      const i2 = rx >= 2 ? 1 : 0, j2 = ry >= 2 ? 1 : 0, k2 = rz >= 2 ? 1 : 0, l2 = rw >= 2 ? 1 : 0;
      const i3 = rx >= 1 ? 1 : 0, j3 = ry >= 1 ? 1 : 0, k3 = rz >= 1 ? 1 : 0, l3 = rw >= 1 ? 1 : 0;

      const x1 = x0 - i1 + G4, y1 = y0 - j1 + G4, z1 = z0 - k1 + G4, w1 = w0 - l1 + G4;
      const x2 = x0 - i2 + G4_2, y2 = y0 - j2 + G4_2, z2 = z0 - k2 + G4_2, w2 = w0 - l2 + G4_2;
      const x3 = x0 - i3 + G4_3, y3 = y0 - j3 + G4_3, z3 = z0 - k3 + G4_3, w3 = w0 - l3 + G4_3;
      const x4 = x0 + G4_4, y4 = y0 + G4_4, z4 = z0 + G4_4, w4 = w0 + G4_4;

      const ii = i & 255, jj = j & 255, kk = k & 255, ll = l & 255;
      let n = 0, a, g;

      a = 0.6 - x0 * x0 - y0 * y0 - z0 * z0 - w0 * w0;
      if (a > 0) {
        g = g4[ii + perm[jj + perm[kk + perm[ll]]]];
        a *= a;
        n += a * a * (GRAD4[g] * x0 + GRAD4[g + 1] * y0 + GRAD4[g + 2] * z0 + GRAD4[g + 3] * w0);
      }
      a = 0.6 - x1 * x1 - y1 * y1 - z1 * z1 - w1 * w1;
      if (a > 0) {
        g = g4[ii + i1 + perm[jj + j1 + perm[kk + k1 + perm[ll + l1]]]];
        a *= a;
        n += a * a * (GRAD4[g] * x1 + GRAD4[g + 1] * y1 + GRAD4[g + 2] * z1 + GRAD4[g + 3] * w1);
      }
      a = 0.6 - x2 * x2 - y2 * y2 - z2 * z2 - w2 * w2;
      if (a > 0) {
        g = g4[ii + i2 + perm[jj + j2 + perm[kk + k2 + perm[ll + l2]]]];
        a *= a;
        n += a * a * (GRAD4[g] * x2 + GRAD4[g + 1] * y2 + GRAD4[g + 2] * z2 + GRAD4[g + 3] * w2);
      }
      a = 0.6 - x3 * x3 - y3 * y3 - z3 * z3 - w3 * w3;
      if (a > 0) {
        g = g4[ii + i3 + perm[jj + j3 + perm[kk + k3 + perm[ll + l3]]]];
        a *= a;
        n += a * a * (GRAD4[g] * x3 + GRAD4[g + 1] * y3 + GRAD4[g + 2] * z3 + GRAD4[g + 3] * w3);
      }
      a = 0.6 - x4 * x4 - y4 * y4 - z4 * z4 - w4 * w4;
      if (a > 0) {
        g = g4[ii + 1 + perm[jj + 1 + perm[kk + 1 + perm[ll + 1]]]];
        a *= a;
        n += a * a * (GRAD4[g] * x4 + GRAD4[g + 1] * y4 + GRAD4[g + 2] * z4 + GRAD4[g + 3] * w4);
      }
      return 27 * n; // roughly -1 … 1
    }

    // Fractal sum. The time circle (z, w) is scaled with frequency so fine
    // detail evolves faster than big shapes — it reads as natural motion.
    function fbm4(x, y, z, w, octaves, gain = 0.5, lacunarity = 2) {
      let sum = 0, amp = 1, norm = 0, f = 1;
      for (let o = 0; o < octaves; o++) {
        sum += amp * noise4(x * f + o * 17.13, y * f - o * 9.71, z * f, w * f);
        norm += amp;
        amp *= gain;
        f *= lacunarity;
      }
      return sum / norm;
    }

    return { noise4, fbm4 };
  }

  const cache = new Map();
  function get(seed) {
    let n = cache.get(seed);
    if (!n) {
      if (cache.size > 24) cache.clear();
      n = create(seed);
      cache.set(seed, n);
    }
    return n;
  }

  return { create, get };
})();
