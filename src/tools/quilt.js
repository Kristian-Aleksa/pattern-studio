/* ==========================================================================
   tools/quilt.js — Quilt: pixel blanket.

   1. Grid: Cells across the frame; the rows follow the frame's shape (cells
      fill the frame). Every style is drawn in folded coordinates (each cell's
      distance from the frame's centre across and up/down), so the whole
      blanket is mirrored left-right and top-bottom; shapes
      that straddle the middle merge with their mirror image.
   2. Style: thirteen blanket patterns (Cross, Bands, Tabs, Plaid, Dither, Steps,
      Zigzag, Diamond, Basket, Rings, Waves, Gingham, Star); Auto picks one per
      variation. Every variation draws its own sizes, colors and accents.
      Chunk scales every length (in cells); Cells sets the resolution.
   3. Colors: the ground, then three inks in fixed roles: the main
      ink, the second ink and an accent (thin lines, centres, sparkles). Waves
      take every ink in turn.
   4. Animation, stepped in whole cells: the woven styles
      flow toward the middle (stripes, waves, tabs, bands, baskets, zigzags),
      Steps flow toward the middle row, Rings ripple outward, Star and Diamond
      swap their two kinds of motif, Cross re-deals its accents and Dither's
      field slides through its threshold. Seamless; Intensity sets the speed
      (0 holds everything still).
   ========================================================================== */
(() => {
  const { hash } = PL.rng;

  // Ground, then the inks: main, second, accent. The default look's colors first.
  const PALETTES = [
    { name: 'Picnic', colors: ['#EDEDEB', '#EB9148', '#E7462C', '#F14762'] },
    { name: 'Lagoon', colors: ['#EEF2F1', '#2E9BFF', '#0E4C92', '#28D7C4'] },
    { name: 'Moss', colors: ['#F2F0E6', '#7FA33A', '#2F5D2A', '#E2C73A'] },
    { name: 'Plum', colors: ['#F4EEF1', '#B35CFF', '#5B1F8F', '#FF6FB5'] },
    { name: 'Sunny', colors: ['#FBF5E8', '#FFB000', '#F2541B', '#2B6BFF'] },
    { name: 'Night', colors: ['#15161A', '#EB9148', '#E7462C', '#F7E7C6'] },
    { name: 'Berry', colors: ['#FFF5F2', '#E0457B', '#7A1F4F', '#FFB36B'] },
    { name: 'Denim', colors: ['#EEF1F6', '#3A5BA0', '#1C2B4A', '#F2C14E'] },
    { name: 'Mono', colors: ['#F1F1EE', '#1C1C1C', '#7A7A7A', '#BDBDBA'] },
    { name: 'Marina', colors: ['#EEF7F8', '#00818C', '#0D2F4F', '#F66E5C'] },
  ];

  /* ---- color roles -------------------------------------------------------------------- */
  const roles = (n) => ['Ground', ...Array.from({ length: n - 1 }, (_, i) => (n === 2 ? 'Ink' : 'Ink ' + (i + 1)))];
  const spec = (n) => ({ ramp: 1, accents: Math.max(1, n - 1) });
  const isLight = (hex) => PL.color.luminance(hex) > 0.35;

  // "New colors": a pale ground (now and then a deep one), then warm-to-cool neighbours (orange,
  // red and pink, say): the main ink lightest, the second deeper, the accent vivid.
  function generate(n, rng) {
    const C = PL.color;
    const dark = rng.chance(0.12);
    const h0 = rng.float(0, 360), dir = rng.sign(), step = rng.float(24, 42);
    const out = [dark ? C.lch(rng.float(0.17, 0.22), rng.float(0.01, 0.03), h0) : C.lch(rng.float(0.94, 0.965), rng.float(0.003, 0.012), h0)];
    const Ls = [0.75, 0.58, 0.66];
    for (let i = 0; i < n - 1; i++) {
      const L = (i < 3 ? Ls[i] : rng.float(0.5, 0.78)) + rng.float(-0.03, 0.03) + (dark ? 0.06 : 0);
      out.push(C.lch(L, i === 2 ? rng.float(0.19, 0.24) : rng.float(0.14, 0.2), h0 + dir * step * i + rng.float(-6, 6)));
    }
    return out;
  }

  // + adds an ink in a hue the palette doesn't have yet.
  function add(colors) {
    const C = PL.color;
    const c = colors.slice();
    const hues = c.slice(1).filter((x) => C.hexToLch(x)[1] > 0.04).map((x) => C.hexToLch(x)[2]);
    let best = 0, bd = -1;
    for (let h = 0; h < 360; h += 10) {
      const d = hues.length ? Math.min(...hues.map((x) => Math.abs((((h - x) % 360) + 540) % 360 - 180))) : 180;
      if (d > bd) { bd = d; best = h; }
    }
    c.push(C.lch(isLight(c[0]) ? 0.64 : 0.8, 0.17, best));
    return c;
  }

  function fit(colors, n) {
    let c = (colors || []).map(PL.color.normHex).filter(Boolean);
    if (!c.length) c = PALETTES[0].colors.slice();
    if (c.length === 1) c.push(PL.color.mix(c[0], isLight(c[0]) ? '#000000' : '#FFFFFF', 0.85));
    if (c.length >= n) return c.slice(0, n);
    while (c.length < n) c = add(c);
    return c;
  }

  const STYLES = ['cross', 'bands', 'tabs', 'plaid', 'dither', 'steps', 'zigzag', 'diamond', 'basket', 'rings', 'waves', 'gingham', 'star'];
  const LABEL = { auto: 'Auto', cross: 'Cross', bands: 'Bands', tabs: 'Tabs', plaid: 'Plaid', dither: 'Dither', steps: 'Steps', zigzag: 'Zigzag',
    diamond: 'Diamond', basket: 'Basket', rings: 'Rings', waves: 'Waves', gingham: 'Gingham', star: 'Star' };
  const S = (section, key, label, min, max, def, extra = {}) => ({ section, key, label, type: 'range', min, max, def, step: 1, ...extra });
  const PARAMS = [
    { section: 'Pattern', key: 'style', label: 'Style', type: 'select', def: 'auto', options: ['auto', ...STYLES].map((v) => ({ value: v, label: LABEL[v] })) },
    S('Pattern', 'cells', 'Cells', 28, 72, 58, { rand: [34, 66], hint: 'Cells across the frame (the rows follow its shape)' }),
    S('Pattern', 'chunk', 'Chunk', 0.7, 1.8, 0.9, { step: 0.05, rand: [0.75, 1.35], hint: 'Size of the shapes, in cells' }),
  ];

  // Constants (lengths in cells at Chunk 1).
  const K = {
    flowPer: 2.5,    // flowing styles travel round(Intensity x this) of their repeats per loop (2 at .8)
    bandsPer: 1.25,  // Bands: round(Intensity x this) repeats per loop
    blink: 10,       // Cross, Star, Diamond: round(Intensity x this) steps per loop (8 at .8)
    ditherPer: 2.5,  // Dither: the field slides round(Intensity x this) times per loop
    ditherK: 1.4,    // Dither: contrast of the field (most cells come out solid or empty, dithered in between)
    margin: 0.5,     // Star, Diamond: a motif is drawn only if it fits this far inside the frame
  };

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const mod = (a, n) => ((a % n) + n) % n;

  /* ---- grid ---------------------------------------------------------------------------- */
  // The rows go by the frame's exact shape (aspect, from the app), so a preview canvas a pixel off the
  // ratio gets the same rows as the export; halves round up (46 -> 35 rows at 4:3).
  function grid(W, H, p, aspect) {
    const cols = Math.max(4, Math.round(p.cells));
    const rows = Math.max(2, aspect > 0 ? Math.floor(cols / aspect + 0.5 + 1e-6) : Math.floor((cols * H) / W + 0.52));
    return { cols, rows };
  }

  // A band sequence (roles and widths) for Rings, Steps and Zigzag: two colored bands, an accent
  // line or two, and a ground gap, repeating.
  function bandSeq(u, k, minQ, maxQ) {
    const W = (x) => Math.max(1, Math.round(x * k));
    const seq = [];
    const AB = u(1) < 0.5 ? [1, 2] : [2, 1];
    if (u(2) < 0.35) seq.push([3, W(1)]);
    seq.push([AB[0], W(lerp(3, 4.6, u(3)))]);
    const mid = u(4);
    if (mid < 0.3) seq.push([3, W(1)]); else if (mid < 0.6) seq.push([0, W(lerp(2, 4, u(5)))]);
    seq.push([AB[1], W(lerp(3, 4.6, u(6)))]);
    if (u(7) < 0.8) seq.push([3, W(1)]);
    const used = seq.reduce((s, b) => s + b[1], 0);
    const Q = Math.max(used + W(3), Math.round(lerp(minQ, maxQ, u(8)) * k));
    seq.push([0, Q - used]);
    return { seq, Q };
  }
  const lookup = (seq, Q, x) => { let a = mod(x, Q); for (const [r, w] of seq) { if (a < w) return r; a -= w; } return 0; };

  /* ---- per-variation settings ------------------------------------------------------------ */
  function setup(seed, p, n, cols, rows) {
    const u = (i) => hash(seed, 0x9a17, i, 11);
    const style = STYLES.includes(p.style) ? p.style : STYLES[Math.floor(hash(seed, 0x51e7, 1, 0) * STYLES.length) % STYLES.length];
    const k = Math.max(0.5, Math.min(2, p.chunk || 1));
    const R = (x) => Math.max(1, Math.round(x * k));
    const P = { style, k, seed };
    switch (style) {
      case 'cross': {
        const b = lerp(7, 8.4, u(1)), r = lerp(0.3, 0.42, u(2));
        P.P = Math.max(3, Math.round(b * k)); P.A = Math.max(1.05, r * b * k); P.T = Math.max(0.55, 0.95 * k);
        P.swap = u(3) < 0.3; P.pa = lerp(0.06, 0.24, u(5)); // accents: re-dealt at every step of the animation
        break;
      }
      case 'star': {
        // an eight-pointed star: a diamond and a square, the orange ones with a pink diamond centre
        P.P = Math.max(4, Math.round(lerp(10, 14, u(1)) * k));
        P.rho = 0.44 * P.P; P.sq = 0.26 * P.P; P.rin = 0.19 * P.P;
        break;
      }
      case 'diamond': {
        // concentric diamonds, now and then squashed (wider than tall); the pitch follows their size
        P.a = Math.max(1.5, lerp(4, 5.2, u(1)) * k); P.b = P.a * (u(3) < 0.5 ? 1 : lerp(0.7, 0.95, u(4)));
        P.Px = Math.max(3, Math.round(2 * P.a + 0.4)); P.Py = Math.max(3, Math.round(2 * P.b + 0.4)); P.cin = 0.48;
        P.flip = u(2) < 0.5 ? 1 : 0;
        break;
      }
      case 'plaid':
        P.Pp = Math.max(5, Math.round((u(1) < 0.55 ? 10 : lerp(9, 12.4, u(6))) * k)); P.w = Math.max(1, Math.round((u(2) < 0.7 ? 2 : 3) * k));
        P.line = Math.round((u(3) < 0.6 ? 0.6 : lerp(0.48, 0.74, u(5))) * P.Pp); P.lw = R(1); P.line2 = u(4) < 0.25;
        break;
      case 'gingham':
        P.Pp = Math.max(4, Math.round(lerp(7.6, 10.4, u(1)) * k));
        break;
      case 'basket':
        P.B = Math.max(2, Math.round(lerp(4.6, 6.4, u(1)) * k)); P.q = Math.max(1, Math.round(k)); P.swap = u(2) < 0.25;
        break;
      case 'rings': Object.assign(P, bandSeq(u, k, 9, 16)); P.off = P.seq[P.seq.length - 1][1]; break; // a ground core in the middle
      case 'steps': {
        Object.assign(P, bandSeq(u, k, 15, 20));
        P.w = Math.max(2, Math.round(lerp(2.6, 4.4, u(20)) * k)); P.h = Math.max(1, Math.round(2 * k)); P.ph = u(21) < 0.5 ? P.w / 2 : 0;
        P.off = Math.floor(u(22) * P.Q);
        break;
      }
      case 'zigzag': {
        Object.assign(P, bandSeq(u, k, 11, 15));
        P.Pz = 2 * Math.max(3, Math.round(lerp(6, 8, u(20)) * k)); P.a = lerp(0.6, 1, u(21)); P.off = Math.floor(u(22) * P.Q);
        break;
      }
      case 'waves':
        // the usual waves most of the time (crests every 13 cells, a wave every 4 rows, 2 thick), varied now and then
        P.Pw = Math.max(6, Math.round((u(1) < 0.5 ? 13 : lerp(11, 16.4, u(3))) * k)); P.Q = Math.max(2, Math.round((u(4) < 0.7 ? 4 : 5) * k));
        P.T = Math.max(1, (P.Q >= 5 * k && u(5) < 0.4 ? 3 : 2) * k);
        P.top = 0.97 * k; P.depth = (u(6) < 0.5 ? 1.9 : lerp(1.4, 2.6, u(7))) * k; P.first = u(2) < 0.75 ? 2 : 1;
        break;
      case 'tabs': {
        P.a = Math.max(2, Math.round(lerp(2.6, 5.4, u(1)) * k)); P.g = Math.max(1, Math.round(2 * k)); P.p = P.a + P.g;
        P.h = Math.max(1, Math.round(2 * k)); P.rp = P.h + Math.max(1, Math.round(k)); P.pa = lerp(0.35, 0.65, u(2));
        break;
      }
      case 'bands': {
        P.hb = Math.max(1, Math.round(2 * k)); P.Lb = Math.max(8, Math.round(lerp(22, 30, u(1)) * k));
        P.bands = new Map();
        break;
      }
      case 'dither': {
        // three waves in folded coordinates: diagonals (an X through the middle), diamonds, and
        // ellipses round the centre; their sum is printed through a 2 x 2 ordered dither
        P.p1 = lerp(12, 22, u(1)) * k; P.p2 = lerp(14, 26, u(2)) * k; P.p3 = lerp(10, 18, u(3)) * k; P.ex = lerp(0.6, 1.5, u(9));
        P.f1 = u(4); P.f2 = u(5); P.f3 = u(6);
        P.w1 = lerp(0.5, 1, u(7)); P.w2 = lerp(0.2, 0.9, u(10)); P.w3 = lerp(0.3, 1, u(11)); P.bias = lerp(-0.08, 0.08, u(8));
        break;
      }
    }
    return P;
  }

  // Settings that follow from others and from the grid (after any test override).
  function derive(P, cols, rows) {
    if (P.style === 'cross') {
      // only whole crosses: the outer ones' arms end inside the frame
      P.maxI = Math.max(0, Math.floor((cols + 0.5 - 2 * P.A) / (2 * P.P))); P.maxJ = Math.max(0, Math.floor((rows + 0.5 - 2 * P.A) / (2 * P.P)));
      // accents: a shuffled round of the (mirrored) cross positions; every step of the loop moves on
      // to the next few, so the sparkles never sit still and never repeat within a loop
      const ni = P.maxI + 1, keys = [];
      for (let j = 0; j <= P.maxJ; j++) for (let i = 0; i <= P.maxI; i++) keys.push([hash(P.seed, i, j, 0xa11), j * ni + i]);
      keys.sort((a, b) => a[0] - b[0]);
      P.rank = new Int16Array(keys.length); keys.forEach(([, id], r) => { P.rank[id] = r; });
      P.npos = keys.length; P.nacc = P.pa > 0 ? Math.max(1, Math.round(P.pa * P.npos)) : 0;
    } else if (P.style === 'star') {
      // only motifs that fit inside the frame (with a small margin)
      P.maxI = Math.max(0, Math.floor((cols / 2 - K.margin - P.rho) / P.P)); P.maxJ = Math.max(0, Math.floor((rows / 2 - K.margin - P.rho) / P.P));
    } else if (P.style === 'diamond') {
      P.maxI = Math.max(0, Math.floor((cols / 2 - K.margin - P.a) / P.Px)); P.maxJ = Math.max(0, Math.floor((rows / 2 - K.margin - P.b) / P.Py));
    }
    return P;
  }

  // Bands: one periodic run sequence per band (built once per band, then reused)
  function bandRow(P, seed, j) {
    let s = P.bands.get(j);
    if (s) return s;
    const k = P.k, L = P.Lb, runs = [];
    let len = 0, prev = -1, i = 0;
    const h = (a) => hash(seed, j, 0xba7d + i * 7 + a, 13);
    while (len < L) {
      let role;
      const x = h(1);
      role = x < 0.3 ? 0 : x < 0.65 ? 1 : 2;
      if (role === prev) role = role === 0 ? (h(2) < 0.5 ? 1 : 2) : 0;
      let w = Math.max(2, Math.round((role === 0 ? lerp(4, 14, h(3)) : lerp(3, 13, h(3))) * k));
      w = Math.min(w, L - len);
      if (role > 0 && w >= Math.round(6 * k) && h(4) < 0.4) {
        const pw = Math.max(1, Math.round(2 * k)), at = Math.max(1, Math.min(w - pw - 1, Math.round(lerp(0.2, 0.7, h(5)) * (w - pw))));
        runs.push([role, at], [3, pw], [role, w - at - pw]);
      } else runs.push([role, w]);
      len += w; prev = role; i++;
    }
    s = { runs, L };
    P.bands.set(j, s);
    return s;
  }

  // Steps per loop for the stepped styles, and the step at time t.
  function stepsPerLoop(P, amount) {
    const a = Math.max(0, amount || 0);
    if (a === 0) return 0;
    const st = P.style, m = (per) => Math.max(1, Math.round(a * per));
    switch (st) {
      case 'cross': return Math.max(1, Math.round(a * K.blink));
      case 'star': case 'diamond': return 2 * Math.max(1, Math.round((a * K.blink) / 2)); // even, so the swap loops
      case 'bands': return m(K.bandsPer) * P.Lb;
      case 'gingham': case 'plaid': return m(K.flowPer) * P.Pp;
      case 'basket': return m(K.flowPer) * 2 * P.B;
      case 'waves': return m(K.flowPer) * P.Pw;
      case 'zigzag': return m(K.flowPer) * P.Pz;
      case 'tabs': return m(K.flowPer) * P.p;
      case 'rings': case 'steps': return m(K.flowPer) * P.Q;
      default: return 0;
    }
  }

  /* ---- the cells ----------------------------------------------------------------------- */
  // Role of every cell (0 ground, 1 main ink, 2 second ink, 3 accent, 4+ more inks) at time t: the
  // frame's cells, or (General's Rotation and Size) every cell region R reaches. Past the frame the blanket
  // runs on (its folded coordinates just grow), and the motifs that only whole ones show in the frame
  // (crosses, stars, diamonds) carry on too.
  function cells(W, H, seed, p, n, t, amount, aspect, R) {
    const g = grid(W, H, p, aspect);
    const { cols, rows } = g;
    const P = derive(Object.assign(setup(seed, p, n, cols, rows), FORCE || {}), cols, rows);
    const cwd = W / cols, chd = H / rows;
    const c0 = R ? Math.floor(R.x0 / cwd) : 0, c1 = R ? Math.ceil(R.x1 / cwd) : cols, r0 = R ? Math.floor(R.y0 / chd) : 0, r1 = R ? Math.ceil(R.y1 / chd) : rows;
    const nc = c1 - c0;
    const maxI0 = P.maxI, maxJ0 = P.maxJ;
    if (R && (R.x0 < 0 || R.y0 < 0 || R.x1 > W || R.y1 > H)) { P.maxI = Infinity; P.maxJ = Infinity; }
    // a cross's place in the accents' round (crosses past the frame's own: a place of their own)
    const rankOf = (i, j) => (i <= maxI0 && j <= maxJ0 ? P.rank[j * (maxI0 + 1) + i] : Math.floor(hash(P.seed, i, j, 0xa12) * P.npos));
    const tt = ((t % 1) + 1) % 1;
    const N = stepsPerLoop(P, amount);
    const s = N ? Math.floor(N * tt + 1e-9) : 0;
    const out = new Uint8Array(nc * (r1 - r0));
    const cx = cols / 2, cy = rows / 2, k = P.k;
    const nInk = Math.max(1, n - 1);
    // the inks that alternate in cycling styles: main and second, then any inks past the accent
    const cyc = [1, 2]; for (let i = 4; i <= nInk; i++) cyc.push(i);
    const cyclic = (i) => cyc[mod(i, cyc.length)];
    for (let y = r0; y < r1; y++) {
      const v = Math.abs(y + 0.5 - cy);
      for (let x = c0; x < c1; x++) {
        const uu = Math.abs(x + 0.5 - cx);
        let r = 0;
        switch (P.style) {
          case 'cross': {
            const i = Math.round(uu / P.P), j = Math.round(v / P.P);
            if (i > P.maxI || j > P.maxJ) break;
            const du = Math.abs(uu - i * P.P), dv = Math.abs(v - j * P.P);
            if ((du < P.A && dv < P.T) || (du < P.T && dv < P.A)) {
              r = ((i + j) & 1) === (P.swap ? 1 : 0) ? 2 : 1;
              if (P.nacc && mod(rankOf(i, j) - (N ? mod(s, N) : 0) * P.nacc, P.npos) < P.nacc) r = 3;
            }
            break;
          }
          case 'star': {
            const i = Math.round(uu / P.P), j = Math.round(v / P.P);
            if (i > P.maxI || j > P.maxJ) break;
            const du = Math.abs(uu - i * P.P), dv = Math.abs(v - j * P.P);
            const kind = (i + j + s) & 1; // the two kinds swap at every step of the animation
            if (du + dv <= P.rho || (du <= P.sq && dv <= P.sq)) r = kind ? (du + dv <= P.rin ? 3 : 1) : 2;
            break;
          }
          case 'diamond': {
            const i = Math.round(uu / P.Px), j = Math.round(v / P.Py);
            if (i > P.maxI || j > P.maxJ) break;
            const e = Math.abs(uu - i * P.Px) / P.a + Math.abs(v - j * P.Py) / P.b;
            if (e <= 1) {
              const kind = (i + j + s + P.flip) & 1, inner = e <= P.cin;
              r = kind ? (inner ? 3 : 1) : (inner ? 1 : 2);
            }
            break;
          }
          case 'plaid': {
            const a = mod(uu + s, P.Pp), b = mod(v, P.Pp);
            const sa = a < P.w, sb = b < P.w;
            if (sa && sb) r = 2;
            else if (sa || sb) r = 1;
            else {
              const la = (a >= P.line && a < P.line + P.lw) || (P.line2 && a >= P.Pp - P.lw - 1 && a < P.Pp - 1);
              const lb = (b >= P.line && b < P.line + P.lw) || (P.line2 && b >= P.Pp - P.lw - 1 && b < P.Pp - 1);
              if (la || lb) r = 3;
            }
            break;
          }
          case 'gingham': {
            const sa = mod(uu + s, P.Pp) >= P.Pp / 2, sb = mod(v, P.Pp) >= P.Pp / 2;
            r = sa && sb ? 2 : sa || sb ? 1 : 0;
            break;
          }
          case 'basket': {
            const U = uu + s, half = P.q;
            const blk = (Math.floor(U / P.B) + Math.floor(v / P.B)) & 1;
            if (blk === 0) { if ((Math.floor(U / half) & 1) === 0) r = P.swap ? 1 : 2; }
            else if ((Math.floor(v / half) & 1) === 0) r = P.swap ? 2 : 1;
            break;
          }
          case 'rings': {
            const d = Math.max(v, (uu * rows) / cols);
            r = lookup(P.seq, P.Q, d - s - P.off);
            break;
          }
          case 'steps': {
            const D = P.h * Math.floor((uu + P.ph) / P.w) + v + s;
            r = lookup(P.seq, P.Q, D + P.off);
            break;
          }
          case 'zigzag': {
            const half = P.Pz / 2, tri = Math.abs(mod(uu + s, P.Pz) - half);
            r = lookup(P.seq, P.Q, v + P.a * tri + P.off);
            break;
          }
          case 'waves': {
            const du = Math.abs(mod(uu + s, P.Pw) - P.Pw / 2); // distance to the nearest crest
            const c = P.depth / ((P.Pw / 2) * (P.Pw / 2));
            const top = P.top + c * du * du;
            const w0 = Math.floor((v - top - P.T) / P.Q) + 1; // the lowest wave whose band could reach v
            for (let w = w0; w <= w0 + 1; w++) {
              const rel = v - w * P.Q;
              if (rel >= top && rel < top + P.T) { r = cyclic(w + (P.first === 2 ? 1 : 0)); break; }
            }
            break;
          }
          case 'tabs': {
            const j = Math.floor(v / P.rp);
            if (v - j * P.rp >= P.h) break;
            const ph = (j & 1) ? Math.floor(P.p / 2) : 0;
            const U = uu + s + ph;
            if (mod(U, P.p) >= P.a) break;
            // accents stay put on the frame: the tab's current slot decides its color
            const slot = Math.round((Math.floor(U / P.p) * P.p - ph - s + P.a / 2) / P.p);
            r = hash(seed, Math.abs(slot), j, 0x7ab5) < P.pa * Math.max(0, 1 - 0.2 * (Math.abs(slot) + j)) ? 2 : 1;
            break;
          }
          case 'bands': {
            const j = Math.floor(v / P.hb);
            const row = bandRow(P, seed, j);
            let a = mod(uu + s, row.L);
            for (const [role, w] of row.runs) { if (a < w) { r = role; break; } a -= w; }
            break;
          }
          case 'dither': {
            // a knitted field (diagonals and diamonds, mirrored) printed through a 2 x 2 ordered dither
            const tp = Math.round(Math.max(0, amount || 0) * K.ditherPer) * tt;
            const f = P.w1 * Math.cos(2 * Math.PI * ((uu - v) / P.p1 + P.f1 + tp)) + P.w2 * Math.cos(2 * Math.PI * ((uu + v) / P.p2 + P.f2))
              + P.w3 * Math.cos(2 * Math.PI * (Math.hypot(uu / P.ex, v * P.ex) / P.p3 + P.f3 - tp));
            const level = clamp01(0.5 + (K.ditherK * f) / (P.w1 + P.w2 + P.w3) + P.bias);
            const bx = Math.floor(uu) & 1, by = Math.floor(v) & 1;
            const thr = (bx === 0 ? (by === 0 ? 0.125 : 0.875) : (by === 0 ? 0.625 : 0.375));
            r = level > thr ? 1 : 0;
            break;
          }
        }
        out[(y - r0) * nc + (x - c0)] = r;
      }
    }
    return { g, out, P, N, s, c0, c1, r0, r1 };
  }

  /* ---- build ------------------------------------------------------------------------ */
  let FORCE = null; // tests: override per-variation settings
  function build({ W, H, aspect, seed, p, colors, t = 0, anim, region }) {
    const n = colors.length;
    const { g, out, P, c0, c1, r0, r1 } = cells(W, H, seed, p, n, t, anim ? anim.amount : 0, aspect, region);
    const nc = c1 - c0;
    const { cols, rows } = g;
    const nInk = Math.max(1, n - 1);
    const pal = (r) => (r === 0 ? 0 : 1 + ((r - 1) % nInk));
    const scene = new PL.Scene(W, H, colors[0], 0);
    const names = roles(n);
    const layers = [];
    const layerFor = (ci) => layers[ci] || (layers[ci] = scene.layer('ink-' + ci, colors[ci], names[ci], ci));
    // cells snap to the output's whole pixels: zs of them to a frame pixel (zoomed in by General's Size, more)
    const zs = region && region.z > 1 ? region.z : 1;
    const X = (c) => Math.round(((c * W) / cols) * zs) / zs, Y = (r) => Math.round(((r * H) / rows) * zs) / zs;
    let painted = 0;
    for (let y = r0; y < r1; y++) {
      const y0 = Y(y), y1 = Y(y + 1), row = (y - r0) * nc - c0;
      let x = c0;
      while (x < c1) {
        const ci = pal(out[row + x]);
        let e = x + 1;
        while (e < c1 && pal(out[row + e]) === ci) e++;
        if (ci > 0) { PL.Scene.rect(layerFor(ci), X(x), y0, X(e) - X(x), y1 - y0); painted += e - x; }
        x = e;
      }
    }
    scene.layers = scene.layers.filter((L) => L.r.length).sort((a, b) => a.ci - b.ci);
    scene.status = `${LABEL[P.style].toLowerCase()} · ${cols} × ${rows} cells`;
    return scene;
  }

  PL.tools.register({
    id: 'quilt',
    name: 'Quilt',
    kind: 'Backgrounds',
    tagline: 'Pixel blanket',
    about: 'Woven pixel blankets, mirrored from the middle: crosses, stars and diamonds, plaid, gingham, basket weave, bands, tabs, steps, zigzags, waves, rings and a knitted dither. In the animation the weave flows toward the middle, the rings ripple out and the motifs swap colors, one cell at a time.',
    inks: {
      min: 2, max: 8, roles, fit, spec, add, generate,
      span: () => 2, // Invert swaps the ground and the main ink
      hint: 'Ground first, then the inks: the main ink, the second ink and the accent (thin lines, centres, sparkles). Waves take every ink in turn.',
    },
    palettes: PALETTES,
    params: PARAMS,
    animLabel: 'Intensity',
    animHint: 'How fast the blanket moves (0: still)',
    defaults: {
      anim: { amount: 0.8, fps: 10, frames: 60 },
      fx: {},
    },
    build,
    zoom: true, // draws any region of its world (General's Rotation and Size)
    _K: K,
    _cells: cells,
    _setup: setup,
    _force: (f) => { FORCE = f; },
  });
})();
