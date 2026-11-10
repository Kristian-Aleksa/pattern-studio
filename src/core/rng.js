/* ==========================================================================
   core/rng.js
   Seeded randomness + stable integer hashes.
   Same seed + same settings = the exact same artwork, at any export size.
   ========================================================================== */
PL.rng = (() => {
  // mulberry32 — tiny, fast, good-enough PRNG for generative art.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Stable hash of up to four integers -> [0, 1).
  // Used for per-cell decisions so a dot or speck never "flickers" between frames.
  function hash(a, b, c, d) {
    let h =
      Math.imul(a | 0, 0x8da6b343) ^
      Math.imul(b | 0, 0xd8163841) ^
      Math.imul(c | 0, 0xcb1ab31f) ^
      Math.imul((d | 0) + 0x9e3779b9, 0x165667b1);
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function create(seed) {
    const next = mulberry32(seed);
    return {
      next,
      float: (a = 0, b = 1) => a + (b - a) * next(),
      int: (a, b) => Math.floor(a + (b - a + 1) * next()),
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      chance: (p) => next() < p,
      sign: () => (next() < 0.5 ? -1 : 1),
    };
  }

  // Human-friendly seeds (1 … 999 999).
  const newSeed = () => 1 + Math.floor(Math.random() * 999999);

  return { mulberry32, hash, create, newSeed };
})();
