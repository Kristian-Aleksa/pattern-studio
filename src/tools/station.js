/* ==========================================================================
   tools/station.js — Station: transit-map line art.

   1. The map: a square grid (Grid: how many cells cross the frame) that the
      lines walk along, reaching well past the frame (General's Size shows
      more of it). A line runs straight for a few cells, then swings round a
      corner (Corners: how wide), shifts across in a smooth S, or drops down
      a staircase of sharp steps (Steps), and runs on until it leaves the
      map or finds no room and stops (Routes: how many lines; Bends: how
      often they turn). Some lines run as two or three tracks side by side,
      their corners nested (Bundles). Lines never run alongside one another;
      they cross square-on, and at some crossings the one laid first passes
      under the other with a gap. The first line (or junction) is laid in
      the middle of the frame, turning there.
   2. Junctions: half-circles nested round a line, and circles with an arc
      swinging round them that runs off into a line (Arcs).
   3. Thin hairlines cross the whole map along the grid (Hairlines).
   4. Stations: rings where a curve starts or ends (Rings: how many); a dot
      where a line stops (never just past a crossing: it is cut back), a
      bundle of three looping round one, two tracks taking one each; dots
      at every other corner of a staircase; loose dots and rows of three
      (Dots). The map can be the same either side of the middle (Symmetry:
      Mirror) or turned half round (Turn).
   5. Colors: Ground, then the lines' colors; a bundle takes two of them in
      turn, trains ride in a color other than their track's.
   6. Animation: trains (Trains: how many) ride every line and junction,
      hopping from stop to stop: they set off together, glide, slow down and
      wait, and slip under the gaps where lines cross and the dots on their
      way. Amount: how many hops in a loop. Frame 1 is the same at any
      Amount. Seamless.
   ========================================================================== */
(() => {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const clamp01 = (v) => clamp(v, 0, 1);
  const lerp = (a, b, t) => a + (b - a) * t;
  const TAU = Math.PI * 2;
  const len = (x, y) => Math.sqrt(x * x + y * y);
  const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1]; // headings: east, south, west, north (y runs down)

  // Ground first, then the lines. The default look uses Lime (defaults.palette).
  const PALETTES = [
    { name: 'Lime', colors: ['#023927', '#C8F23A', '#F6BED0'] },
    { name: 'Orchid', colors: ['#2A012B', '#7EF6AE', '#E4D4F6'] },
    { name: 'Ticket', colors: ['#FAF3E3', '#D6184F', '#04606A'] },
    { name: 'Midnight', colors: ['#010B2E', '#FC967E', '#FCE466'] },
    { name: 'Signal', colors: ['#151515', '#F2EDE4', '#E8402C'] },
    { name: 'Blueprint', colors: ['#16408F', '#F4F1E8', '#FFC94A'] },
    { name: 'Terracotta', colors: ['#B84A2E', '#F7E7D2', '#2B1E1A'] },
    { name: 'Mint', colors: ['#CFEBDD', '#0F4D3A', '#F26B5B'] },
    { name: 'Sakura', colors: ['#FBE3E4', '#C8102E', '#1F2A5A'] },
    { name: 'Express', colors: ['#F2F0EA', '#E63B2E', '#1D6FD1', '#F5B800', '#1E9E5A'] },
  ];

  /* ---- color roles -------------------------------------------------------------------- */
  const roles = (n) => ['Ground', ...(n === 2 ? ['Lines'] : Array.from({ length: n - 1 }, (_, i) => 'Line ' + (i + 1)))];
  const spec = (n) => ({ ramp: 1, accents: n - 1 });

  // "New colors": a ground, dark or light, and lines that stand out from it, their hues well apart.
  function generate(n, rng) {
    const C = PL.color, h = rng.float(0, 360), dark = rng.chance(0.6);
    const ground = dark ? C.lch(rng.float(0.16, 0.3), rng.float(0.04, 0.1), h) : C.lch(rng.float(0.93, 0.97), rng.float(0.02, 0.04), h);
    const lines = [];
    let hl = h + rng.float(60, 140) * rng.sign();
    for (let i = 1; i < n; i++) {
      lines.push(C.lch(dark ? rng.float(0.78, 0.92) : rng.float(0.4, 0.58), rng.float(0.1, 0.17), hl));
      hl += rng.float(70, 150);
    }
    return [ground, ...lines];
  }

  // + adds a line color: one of the lines' own colors turned round the hue circle (as light and as vivid),
  // the turn that stands furthest from every color there is (the ground counting double). The others keep
  // their places.
  function add(colors) {
    const C = PL.color, c = colors.slice();
    const labs = c.map((x) => C.hexToOklab(x));
    const score = (hex) => {
      const q = C.hexToOklab(hex);
      return Math.min(...labs.map((r, i) => Math.hypot(q[0] - r[0], q[1] - r[1], q[2] - r[2]) / (i === 0 ? 2 : 1)));
    };
    let best = null, top = -1;
    for (let i = 1; i < c.length; i++) {
      const [L, Ch, h] = C.hexToLch(c[i]);
      for (const dh of [40, -40, 75, -75, 110, -110, 150, -150, 180]) {
        const hx = C.lch(L, Math.max(Ch, 0.06), h + dh), sc = score(hx);
        if (sc > top + 1e-9) { top = sc; best = hx; }
      }
    }
    c.push(best || C.mix(c[c.length - 1], c[0], 0.3));
    return c;
  }

  // A palette of any length fitted to n colors: the ground stays first; a long one gives up line colors from
  // its end, a short one gets lines that stand out from its ground.
  function fit(colors, n) {
    const C = PL.color;
    let c = (colors || []).map(C.normHex).filter(Boolean);
    if (!c.length) c = PALETTES[0].colors.slice();
    if (c.length < 2) c = [c[0], C.mix(c[0], C.luminance(c[0]) > 0.35 ? '#000000' : '#FFFFFF', 0.82)];
    while (c.length > n) c.pop();
    while (c.length < n) c = add(c);
    return c;
  }

  /* ---- settings ----------------------------------------------------------------------- */
  const S = (section, key, label, min, max, def, extra = {}) => ({ section, key, label, type: 'range', min, max, def, step: 1, ...extra });
  const PARAMS = [
    S('Map', 'grid', 'Grid', 3, 14, 5, { rand: [4, 8], hint: 'How many grid cells cross the frame (more: a finer, busier map)' }),
    S('Map', 'routes', 'Routes', 0, 100, 45, { unit: '%', rand: [25, 75], hint: 'How many lines run across the map' }),
    S('Map', 'bends', 'Bends', 0, 100, 50, { unit: '%', rand: [20, 85], hint: 'How often a line turns (0: long straight runs)' }),
    S('Map', 'corners', 'Corners', 0, 100, 50, { unit: '%', rand: [15, 90], hint: 'How wide the lines swing round their corners' }),
    S('Map', 'bundles', 'Bundles', 0, 100, 40, { unit: '%', rand: [0, 80], hint: 'How many lines run as two or three tracks side by side' }),
    { section: 'Map', key: 'symmetry', label: 'Symmetry', type: 'seg', def: 'none', rand: true, hint: 'The same map either side of the middle (Mirror) or turned half round (Turn)',
      options: [{ value: 'none', label: 'None' }, { value: 'mirror', label: 'Mirror' }, { value: 'turn', label: 'Turn' }] },
    S('Lines', 'weight', 'Weight', 0, 100, 45, { unit: '%', rand: [25, 70], hint: 'How thick the lines are' }),
    S('Lines', 'arcs', 'Arcs', 0, 100, 40, { unit: '%', rand: [0, 80], hint: 'How many junctions of circles and half-circles' }),
    S('Lines', 'steps', 'Steps', 0, 100, 25, { unit: '%', rand: [0, 60], hint: 'How often a line drops down a staircase of sharp steps' }),
    S('Lines', 'hairlines', 'Hairlines', 0, 100, 40, { unit: '%', rand: [10, 70], hint: 'How many thin lines cross the whole map' }),
    S('Stations', 'stations', 'Rings', 0, 100, 40, { unit: '%', rand: [10, 80], hint: 'How often a ring station sits where a curve starts or ends' }),
    S('Stations', 'dots', 'Dots', 0, 100, 40, { unit: '%', rand: [10, 75], hint: 'How many loose dots and rows of three' }),
    S('Stations', 'trains', 'Trains', 0, 100, 50, { unit: '%', rand: [20, 80], hint: 'How many trains ride the lines (0: none)' }),
  ];

  // Constants. Lengths in grid cells unless noted.
  const K = {
    world: 2.5,          // the map reaches this many frames past the frame each way (General's Size zoomed out)
    hero: 0.55,          // the first line or junction starts within this middle share of the frame
    w: [0.012, 0.07],    // a line's width at Weight 0 -> 100 ...
    arcW: 0.7,           // ... a junction's half-circles this much of that ...
    hair: 0.35,          // ... a hairline this much ...
    ringW: 0.42,         // ... and a ring's outline this much
    gap: 0.12,           // room either side of a line that crosses over another ...
    gapP: 0.45,          // ... at this share of the crossings (at the others it is simply laid on top)
    spacing: 0.22,       // a bundle's tracks this far apart
    clear: 0.4,          // lines keep this far apart (beyond their widths) unless they cross ...
    cross: 0.4,          // ... which they do square-on (|cos| of the angle below this)
    run: [[3, 9], [1, 3]], // straight runs between turns at Bends 0 -> 100 (cells, shortest and longest) ...
    turn: [0.35, 0.95],  // ... and the chance of a turn after one
    radius: [0.5, 1, 1.5, 2, 2.5], // corner radii (cells); Corners picks round [0.7, 2.2]
    reach: [20, 60],     // a line walks at most this far each way from where it starts
    density: [0.08, 0.9], // lines started per 25 cells of map at Routes 0 -> 100
    arcsPer: 0.55,       // junctions per 25 cells at Arcs 100
    hairP: 0.28,         // the chance of a hairline along a row or column at Hairlines 100
    dot: 0.12,           // a dot's radius ...
    ring: 0.1,           // ... a ring's
    stack: [0.12, 0.32], // rows of three: a dot's radius and the distance between them
    dotsP: 0.035,        // loose dots per half cell at Dots 100 (rows of three a quarter as many)
    ringP: 0.6,          // the chance of a ring at either end of a curve at Rings 100 ...
    ringGap: 1.5,        // ... never this close to another
    stub: 1,             // a line that stops this close past a crossing is cut back ...
    stubGap: 0.5,        // ... to stop this far short of it
    trains: [10, 2],     // trains this far apart along a line at Trains 0+ -> 100
    hops: 2,             // hops in a loop at Amount 1
    dwell: 0.38,         // a train waits this share of each hop
    fade: 0.35,          // a train shrinks away over this distance at the end of a line, into a gap or under a dot
  };

  /* ---- paths: lines, arcs and S-curves in grid cells ---------------------------------------- */
  // A piece: { t: 'L', x0, y0, x1, y1 } | { t: 'A', cx, cy, r, a0, da } | { t: 'C', p: [x0, y0, … x3, y3] }; a line's
  // pieces are numbered (n) as they are laid, and one cut short is marked (part).
  function pieceEnd(pc) {
    if (pc.t === 'L') return [pc.x1, pc.y1];
    if (pc.t === 'A') return [pc.cx + pc.r * Math.cos(pc.a0 + pc.da), pc.cy + pc.r * Math.sin(pc.a0 + pc.da)];
    return [pc.p[6], pc.p[7]];
  }
  // (a piece keeps its number n, and whether it is only part of one, reversed or cut)
  function reversePiece(pc) {
    if (pc.t === 'L') return { t: 'L', x0: pc.x1, y0: pc.y1, x1: pc.x0, y1: pc.y0, sharp: pc.sharp, n: pc.n, part: pc.part };
    if (pc.t === 'A') return { t: 'A', cx: pc.cx, cy: pc.cy, r: pc.r, a0: pc.a0 + pc.da, da: -pc.da, n: pc.n, part: pc.part };
    const p = pc.p;
    return { t: 'C', p: [p[6], p[7], p[4], p[5], p[2], p[3], p[0], p[1]], n: pc.n, part: pc.part };
  }
  function pieceStart(pc) {
    if (pc.t === 'L') return [pc.x0, pc.y0];
    if (pc.t === 'A') return [pc.cx + pc.r * Math.cos(pc.a0), pc.cy + pc.r * Math.sin(pc.a0)];
    return [pc.p[0], pc.p[1]];
  }
  // a piece's direction of travel at its start (or its end)
  function pieceDir(pc, atEnd) {
    let x, y;
    if (pc.t === 'L') { x = pc.x1 - pc.x0; y = pc.y1 - pc.y0; }
    else if (pc.t === 'A') { const a = pc.a0 + (atEnd ? pc.da : 0), sg = Math.sign(pc.da); x = -Math.sin(a) * sg; y = Math.cos(a) * sg; }
    else { const p = pc.p; [x, y] = atEnd ? [p[6] - p[4], p[7] - p[5]] : [p[2] - p[0], p[3] - p[1]]; }
    const l = len(x, y) || 1;
    return [x / l, y / l];
  }
  function pieceLen(pc) {
    if (pc.t === 'L') return len(pc.x1 - pc.x0, pc.y1 - pc.y0);
    if (pc.t === 'A') return Math.abs(pc.da) * pc.r;
    const q = samplePiece(pc, 0.05, []);
    let l = 0, x = pc.p[0], y = pc.p[1];
    for (let i = 0; i < q.length; i += 4) { l += len(q[i] - x, q[i + 1] - y); x = q[i]; y = q[i + 1]; }
    return l;
  }
  // the rest of a piece from share f of the way along it (an S-curve split at f)
  function pieceFrom(pc, f) {
    if (pc.t === 'L') return { t: 'L', x0: pc.x0 + f * (pc.x1 - pc.x0), y0: pc.y0 + f * (pc.y1 - pc.y0), x1: pc.x1, y1: pc.y1, sharp: pc.sharp, n: pc.n, part: true };
    if (pc.t === 'A') return { t: 'A', cx: pc.cx, cy: pc.cy, r: pc.r, a0: pc.a0 + f * pc.da, da: pc.da * (1 - f), n: pc.n, part: true };
    const p = pc.p, mid = (a, b) => [p[a] + (p[b] - p[a]) * f, p[a + 1] + (p[b + 1] - p[a + 1]) * f];
    const A = mid(0, 2), B = mid(2, 4), C = mid(4, 6);
    const D = [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f], E = [B[0] + (C[0] - B[0]) * f, B[1] + (C[1] - B[1]) * f];
    return { t: 'C', p: [D[0] + (E[0] - D[0]) * f, D[1] + (E[1] - D[1]) * f, E[0], E[1], C[0], C[1], p[6], p[7]], n: pc.n, part: true };
  }
  // a path with its first d cells cut off
  function cutFront(pcs, d) {
    const o = pcs.slice();
    while (o.length) {
      const l = pieceLen(o[0]);
      if (l <= d + 1e-9) { d -= l; o.shift(); continue; }
      o[0] = pieceFrom(o[0], d / l);
      break;
    }
    return o;
  }
  // Points along a piece about ds apart (its start left out), each with its direction: [x, y, dx, dy, …].
  function samplePiece(pc, ds, out) {
    if (pc.t === 'L') {
      const lx = pc.x1 - pc.x0, ly = pc.y1 - pc.y0, l = len(lx, ly), n = Math.max(1, Math.ceil(l / ds));
      for (let i = 1; i <= n; i++) out.push(pc.x0 + (lx * i) / n, pc.y0 + (ly * i) / n, lx / l, ly / l);
    } else if (pc.t === 'A') {
      const n = Math.max(2, Math.ceil((Math.abs(pc.da) * pc.r) / ds)), sg = Math.sign(pc.da);
      for (let i = 1; i <= n; i++) {
        const a = pc.a0 + (pc.da * i) / n;
        out.push(pc.cx + pc.r * Math.cos(a), pc.cy + pc.r * Math.sin(a), -Math.sin(a) * sg, Math.cos(a) * sg);
      }
    } else {
      const p = pc.p, n = Math.max(8, Math.ceil(len(p[6] - p[0], p[7] - p[1]) * 1.4 / ds));
      for (let i = 1; i <= n; i++) {
        const t = i / n, a = (1 - t) * (1 - t) * (1 - t), b = 3 * t * (1 - t) * (1 - t), c = 3 * t * t * (1 - t), d = t * t * t;
        const x = a * p[0] + b * p[2] + c * p[4] + d * p[6], y = a * p[1] + b * p[3] + c * p[5] + d * p[7];
        let tx = 3 * ((1 - t) * (1 - t) * (p[2] - p[0]) + 2 * t * (1 - t) * (p[4] - p[2]) + t * t * (p[6] - p[4]));
        let ty = 3 * ((1 - t) * (1 - t) * (p[3] - p[1]) + 2 * t * (1 - t) * (p[5] - p[3]) + t * t * (p[7] - p[5]));
        const tl = len(tx, ty) || 1;
        out.push(x, y, tx / tl, ty / tl);
      }
    }
    return out;
  }

  /* ---- the map's room: every point a line has taken, by grid square, and the discs shapes take ---- */
  function Room(sym) {
    const cells = new Map(), discs = new Map(), key = (ix, iy) => (ix + 8192) * 16384 + (iy + 8192);
    const DS = 2, PAD = 0.3 + K.clear; // discs by squares of DS cells, each in every square a line point near it falls in
    let reach = 0.05;
    const T = sym === 'mirror' ? (x, y) => [-x, y] : sym === 'turn' ? (x, y) => [-x, -y] : null;
    const put = (x, y, dx, dy, hw, id, k, allow, tw) => {
      const e = { x, y, dx, dy, hw, id, k, allow, tw };
      if (!dx && !dy) {
        const r = hw + PAD;
        for (let iy = Math.floor((y - r) / DS); iy <= Math.floor((y + r) / DS); iy++) for (let ix = Math.floor((x - r) / DS); ix <= Math.floor((x + r) / DS); ix++) {
          const kk = key(ix, iy);
          let a = discs.get(kk);
          if (!a) discs.set(kk, (a = []));
          a.push(e);
        }
        return;
      }
      const kk = key(Math.floor(x), Math.floor(y));
      let a = cells.get(kk);
      if (!a) cells.set(kk, (a = []));
      a.push(e);
      reach = Math.max(reach, hw);
    };
    return {
      T,
      // take a point, or a disc (no direction) (and, with Symmetry, its twin)
      add(x, y, dx, dy, hw, id, k, allow) {
        put(x, y, dx, dy, hw, id, k, allow, false);
        if (T) { const [a, b] = T(x, y), [c, d] = T(dx, dy); put(a, b, c, d, hw, id, k, allow, true); }
      },
      // would a point of line id (its k-th, direction (dx, dy)), or a disc (no direction), of half-width hw clash
      // with anything? (Its own points nearer than own along it never do; its twin's are another line's.)
      // twinOk: it may meet its own mirror image (a line joining its twin in the middle).
      clash(x, y, dx, dy, hw, id, k, own, twinOk) {
        const disc = !dx && !dy;
        // the discs: always a clash
        const dr = disc ? hw : 0;
        for (let iy = Math.floor((y - dr) / DS); iy <= Math.floor((y + dr) / DS); iy++) for (let ix = Math.floor((x - dr) / DS); ix <= Math.floor((x + dr) / DS); ix++) {
          const a = discs.get(key(ix, iy));
          if (a) for (const e of a) {
            if (e.allow === id) continue;
            if (len(e.x - x, e.y - y) < hw + e.hw + K.clear) return true;
          }
        }
        const r = hw + reach + K.clear, ix0 = Math.floor(x - r), ix1 = Math.floor(x + r), iy0 = Math.floor(y - r), iy1 = Math.floor(y + r);
        for (let iy = iy0; iy <= iy1; iy++) for (let ix = ix0; ix <= ix1; ix++) {
          const a = cells.get(key(ix, iy));
          if (!a) continue;
          for (const e of a) {
            if (e.id === id && !e.tw && Math.abs(e.k - k) < own) continue;
            if (e.allow === id) continue;
            if (len(e.x - x, e.y - y) >= hw + e.hw + K.clear) continue;
            if (disc) return true; // a shape's room: no line through it
            if (Math.abs(dx * e.dx + dy * e.dy) > K.cross) return true; // alongside: a clash (square-on: a crossing)
          }
        }
        // with Symmetry, a point beside its own mirror image (or turned twin), alongside it, is a clash too
        if (T && !disc && !twinOk) {
          const [a, b] = T(x, y), [c, d] = T(dx, dy);
          if (len(a - x, b - y) < 2 * hw + K.clear && Math.abs(dx * c + dy * d) > K.cross) return true;
        }
        return false;
      },
      // another line (or its own twin; not a shape's room, nor a hairline) crossing a line of id at (x, y): its
      // point, or null
      crosser(x, y, hw, id) {
        // (points are taken every 0.2 cells: one within 0.15 beyond the widths is on the line)
        const r = hw + reach + 0.15, ix0 = Math.floor(x - r), ix1 = Math.floor(x + r), iy0 = Math.floor(y - r), iy1 = Math.floor(y + r);
        for (let iy = iy0; iy <= iy1; iy++) for (let ix = ix0; ix <= ix1; ix++) {
          const a = cells.get(key(ix, iy));
          if (a) for (const e of a) if (e.id > 0 && (e.id !== id || e.tw) && len(e.x - x, e.y - y) < hw + e.hw + 0.15) return e;
        }
        return null;
      },
    };
  }

  /* ---- the plan: the whole map, worked out once for a frame size and settings ------------------ */
  let PLAN = null;
  function plan(seed, p, W, H) {
    const keyStr = JSON.stringify([seed, W, H, PARAMS.map((d) => p[d.key]), K]);
    if (PLAN && PLAN.key === keyStr) return PLAN;
    const rng = PL.rng.create(((seed | 0) * 2654435761 + 0x51a7) >>> 0);
    const Sz = Math.sqrt(W * H), G = clamp(p.grid ?? 5, 2, 30), u = Sz / G;
    const sym = p.symmetry === 'mirror' || p.symmetry === 'turn' ? p.symmetry : 'none';
    const fx = W / 2 / u, fy = H / 2 / u; // the frame's half-size, in cells
    // the grid's lines run a quarter cell off the frame's middle: never along a square frame's edges, nor along a
    // mirror's axis, and never through the middle of a turn
    const Q = 0.25;
    const wx = fx + K.world * 2 * fx, wy = fy + K.world * 2 * fy; // the map's half-size
    const room = Room(sym);
    const v01 = (k, d) => clamp01((p[k] ?? d) / 100);
    const bends = v01('bends', 50), corners = v01('corners', 50), bundles = v01('bundles', 40), steps = v01('steps', 25);
    const w = lerp(K.w[0], K.w[1], v01('weight', 45));
    const routes = [], hairs = [], dots = [], rings = [];
    const out = (x, y) => Math.abs(x) > wx || Math.abs(y) > wy;
    const color = () => rng.int(0, 59); // an index into the lines' colors (taken modulo their number at draw time)
    const radius = (hw) => {
      // Corners: the mean radius from 0.7 to 2.2 cells; never tighter than a bundle can nest
      const mean = lerp(0.7, 2.2, corners), list = K.radius.filter((r) => r >= hw + 0.3);
      const wts = list.map((r) => Math.exp(-((r - mean) ** 2) / 0.5));
      let s = rng.float(0, wts.reduce((a, b) => a + b, 0));
      for (let i = 0; i < list.length; i++) if ((s -= wts[i]) <= 0) return list[i];
      return list[list.length - 1];
    };
    // room-taking along pieces, for line id: false if anything clashes (then nothing is taken)
    const take = (R, pcs, sgn, check = true, twinOk = false) => {
      const pts = [];
      for (const pc of pcs) samplePiece(pc, 0.2, pts);
      const own = Math.ceil((2 * R.hw + K.clear + 1.2) / 0.2);
      if (check) {
        for (let i = 0; i < pts.length; i += 4) {
          if (out(pts[i], pts[i + 1])) break;
          if (room.clash(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], R.hw, R.id, R.k + (sgn * (i + 4)) / 4, own, twinOk)) return false;
        }
      }
      for (let i = 0; i < pts.length; i += 4) { R.k += sgn; room.add(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], R.hw, R.id, R.k); }
      return true;
    };
    let nextId = 1, pieceN = 0;
    const newRoute = (tracks, group) => {
      const hw = ((tracks - 1) / 2) * K.spacing + w / 2;
      // (the next color along is never the same one, however many there are)
      const c0 = color(), c1 = c0 + 1;
      const id = nextId++;
      return { id, group: group || id, hw, w, tracks, colors: Array.from({ length: tracks }, (_, i) => (tracks === 3 ? (i === 1 ? c1 : c0) : i === 0 ? c0 : c1)), pcs: [], k: 0, ends: [null, null],
        stairs: [], curves: [], stairsLeft: tracks === 1 && rng.chance(steps) ? 1 : 0, train: c1 };
    };
    // a hairline's room: thin, so lines keep off it alongside but may cross it
    const takeHair = (x0, y0, x1, y1, id) => {
      const l = len(x1 - x0, y1 - y0), n = Math.ceil(l / 0.25), dx = (x1 - x0) / l, dy = (y1 - y0) / l;
      for (let i = 0; i <= n; i++) { const x = x0 + (dx * l * i) / n, y = y0 + (dy * l * i) / n; if (!out(x, y)) room.add(x, y, dx, dy, 0.04, id, 0); }
    };
    const hairClash = (x0, y0, x1, y1) => {
      const l = len(x1 - x0, y1 - y0), n = Math.ceil(l / 0.25), dx = (x1 - x0) / l, dy = (y1 - y0) / l;
      for (let i = 0; i <= n; i++) { const x = x0 + (dx * l * i) / n, y = y0 + (dy * l * i) / n; if (!out(x, y) && room.clash(x, y, dx, dy, 0.04, -7, 0, 0, true)) return true; }
      return false;
    };

    // a walk from (x, y) heading h (sgn: +1 on, -1 back): pieces, and how it ended ('open' off the map, 'join' in
    // a mirror's middle, or a terminal). lead: a move to make first, before any straight run (the first line's
    // corner in the frame).
    function walk(R, x, y, h, sgn, budget, lead) {
      const pcs = [], keep = (...list) => { for (const pc of list) { pc.n = ++pieceN; pcs.push(pc); } };
      let px = x, py = y, hd = h, walked = 0, end = 'term';
      const lim = Math.round(lerp(K.run[0][0], K.run[1][0], bends)), lmax = Math.round(lerp(K.run[0][1], K.run[1][1], bends));
      // a turn, an S or a staircase from here: true if there was room for it
      const move = (a) => {
        if (a === 'turn') {
          const side = rng.sign(), r = radius(R.hw);
          for (const sd of [side, -side]) {
            const h2 = (hd + sd + 4) % 4, cx = px + r * DX[h2], cy = py + r * DY[h2];
            const a0 = Math.atan2(py - cy, px - cx), pc = { t: 'A', cx, cy, r, a0, da: (sd * Math.PI) / 2 };
            if (take(R, [pc], sgn)) { keep(pc); R.curves.push(pc); [px, py] = pieceEnd(pc); hd = h2; walked += r * 1.57; return true; }
          }
        } else if (a === 's') {
          const side = rng.sign(), sh = rng.int(1, 2), L = sh + rng.int(1, 2);
          for (const sd of [side, -side]) {
            const h2 = (hd + sd + 4) % 4, ex = px + L * DX[hd] + sh * DX[h2], ey = py + L * DY[hd] + sh * DY[h2];
            const pc = { t: 'C', p: [px, py, px + (L / 2) * DX[hd], py + (L / 2) * DY[hd], ex - (L / 2) * DX[hd], ey - (L / 2) * DY[hd], ex, ey] };
            if (take(R, [pc], sgn)) { keep(pc); R.curves.push(pc); px = ex; py = ey; walked += L; return true; }
          }
        } else if (a === 'stairs') {
          // a staircase: steps across and down by turns, sharp corners, a dot at every other one
          const sd = rng.sign(), nst = rng.int(3, 4), a1 = rng.pick([1, 1, 1.5]), b1 = rng.pick([0.75, 1, 1]);
          const h2 = (hd + sd + 4) % 4, list = [];
          let qx = px, qy = py;
          for (let i = 0; i < nst; i++) {
            const ax = qx + a1 * DX[hd], ay = qy + a1 * DY[hd], bx = ax + b1 * DX[h2], by = ay + b1 * DY[h2];
            list.push({ t: 'L', x0: qx, y0: qy, x1: ax, y1: ay, sharp: true }, { t: 'L', x0: ax, y0: ay, x1: bx, y1: by, sharp: true });
            qx = bx; qy = by;
          }
          if (take(R, list, sgn)) { keep(...list); R.stairs.push(list); R.stairsLeft--; px = qx; py = qy; walked += nst * (a1 + b1); return true; }
        }
        return false;
      };
      for (let step = 0; step < 80; step++) {
        if (out(px, py)) { end = 'open'; break; }
        if (walked > budget) break;
        if (step === 0 && lead && move(lead)) continue;
        // a straight run (shortened if it would clash); with Mirror one across the middle stops there, its twin
        // carrying the line on
        let n = rng.int(lim, lmax), ran = false;
        if (sym === 'mirror' && !DY[hd] && DX[hd] * px < 0 && -px * DX[hd] <= n) {
          const pc = { t: 'L', x0: px, y0: py, x1: 0, y1: py };
          if (take(R, [pc], sgn, true, true)) { keep(pc); walked += Math.abs(px); px = 0; end = 'join'; break; }
          n = Math.floor(Math.abs(px) - 0.1); // (no room to meet it: stop short)
        }
        for (; n >= 1; n--) {
          const pc = { t: 'L', x0: px, y0: py, x1: px + n * DX[hd], y1: py + n * DY[hd] };
          if (take(R, [pc], sgn)) { keep(pc); px = pc.x1; py = pc.y1; walked += n; ran = true; break; }
        }
        if (out(px, py)) { end = 'open'; break; }
        // then a turn, an S, a staircase, or on straight
        const acts = [];
        if (rng.chance(lerp(K.turn[0], K.turn[1], bends))) acts.push('turn', 'turn');
        if (rng.chance(0.25 + 0.35 * bends)) acts.push('s');
        if (R.stairsLeft > 0 && rng.chance(0.4)) acts.unshift('stairs');
        let moved = false;
        for (const a of acts) if ((moved = move(a))) break;
        if (!moved && !ran) break;
      }
      return { pcs, end, x: px, y: py, h: hd };
    }

    // a line through (x, y) heading h: walked on, and back
    function route(x, y, h, tracks, budget, lead) {
      const R = newRoute(tracks);
      if (room.clash(x, y, DX[h], DY[h], R.hw, R.id, 0, 1)) return null;
      const f = walk(R, x, y, h, +1, budget, lead);
      R.k = 0;
      const b = walk(R, x, y, (h + 2) % 4, -1, budget);
      R.pcs = [...b.pcs.slice().reverse().map(reversePiece), ...f.pcs];
      if (!R.pcs.length) return null;
      R.ends = [b.end, f.end];
      routes.push(R);
      return R;
    }

    // ---- junctions first (they need the most room)
    const area = (2 * wx) * (2 * wy);
    const nArcs = Math.round((area / 25) * K.arcsPer * v01('arcs', 40) * (sym === 'none' ? 1 : 0.5));
    let hero = rng.float() < 0.25 + 0.75 * v01('arcs', 40) && v01('arcs', 40) > 0 ? 'arc' : 'line', heroAt = false;
    // (with Symmetry the first junction sits a little over two cells off the middle, its twin as far the other way:
    // with Turn along the frame's long side)
    const arcSpot = (i) => {
      if (i === 0 && hero === 'arc') {
        const a = Math.round(rng.float(-1, 1) * fx * K.hero) + Q, b = Math.round(rng.float(-1, 1) * fy * K.hero * 0.6) + Q;
        return sym === 'none' ? [a, b] : sym === 'turn' && fy > fx ? [Q, Q - 2.5] : [Q - 2.5, b];
      }
      return [sym === 'none' ? Math.round(rng.float(-wx, wx)) + Q : Q - 1 - Math.floor(rng.float(0, wx)), Math.round(rng.float(-wy, wy)) + Q];
    };
    for (let i = 0; i < nArcs + (hero === 'arc' ? 1 : 0); i++) {
      const [cx, cy] = arcSpot(i);
      if (i === 0 && hero === 'arc' && (Math.abs(cx) > fx || Math.abs(cy) > fy)) continue; // (a frame too small for it: a line leads)
      const kind = rng.chance(0.5) ? 'half' : 'orbit';
      let r1 = rng.pick([1, 1.5]), r2 = r1 + rng.pick([0.5, 1]);
      if (i === 0 && hero === 'arc' && sym !== 'none') { r1 = 1; r2 = 1.5; } // (small enough to clear its twin)
      const ax = rng.int(0, 1); // the axis: 0 across (east-west), 1 up and down
      let side = rng.sign(); // the arcs (and the hairline out of it) to one side
      const h = ax === 0 ? 0 : 1, nrm = (h + 1) % 4, ext = 2 * Math.max(wx, wy) + 4, a0j = Math.atan2(-DY[h], -DX[h]);
      const R0 = newRoute(1), id = R0.id;
      // room: a disc round it, and the line or hairline along its axis and the hairline out of it (which turns
      // to the other side if it must) clear of everything; with Symmetry clear of its own twin too (an axis may
      // only meet the twin's where they are one line: across a mirror)
      if (room.clash(cx, cy, 0, 0, r2 + 0.25, -1, 0, 0)) continue;
      const tw = room.T ? room.T(cx, cy) : null;
      const clearOfTwin = (x, y, dx, dy, from) => { // a line from (x, y) on along (dx, dy), from this far: clear of the twin?
        if (!tw) return true;
        const vx = tw[0] - x, vy = tw[1] - y, t = Math.max(from, vx * dx + vy * dy);
        return len(vx - t * dx, vy - t * dy) >= r2 + 0.25 + K.clear;
      };
      if (tw && (len(tw[0] - cx, tw[1] - cy) < 2 * (r2 + 0.25) + K.clear || (!(sym === 'mirror' && h === 0) && !clearOfTwin(cx, cy, DX[h], DY[h], -Infinity)))) continue;
      const axis = { t: 'L', x0: cx - ext * DX[h], y0: cy - ext * DY[h], x1: cx + ext * DX[h], y1: cy + ext * DY[h] };
      if (hairClash(axis.x0, axis.y0, cx - (r2 + 0.5) * DX[h], cy - (r2 + 0.5) * DY[h]) || hairClash(cx + (r2 + 0.5) * DX[h], cy + (r2 + 0.5) * DY[h], axis.x1, axis.y1)) continue;
      const ray = (sd) => { // the hairline out of it: [dx, dy, from x, from y]
        if (kind === 'half') return [DX[nrm] * sd, DY[nrm] * sd, cx + DX[nrm] * sd * (r2 + 0.3), cy + DY[nrm] * sd * (r2 + 0.3)];
        const aq = a0j + (sd * Math.PI) / 2, ox = Math.round(Math.cos(aq)), oy = Math.round(Math.sin(aq));
        return [ox, oy, cx + (r2 + 0.4) * ox, cy + (r2 + 0.4) * oy];
      };
      const rayOk = (sd) => { const [dx, dy, x, y] = ray(sd); return clearOfTwin(x, y, dx, dy, 0) && !hairClash(x, y, x + dx * ext, y + dy * ext); };
      if (!rayOk(side)) { side = -side; if (!rayOk(side)) continue; }
      room.add(cx, cy, 0, 0, r2 + 0.25, -id, 0, id);
      if (i === 0) heroAt = true;
      const cA = R0.colors[0], cB = R0.train;
      if (kind === 'half') {
        // a line along the axis through the centre, half-circles round it, a hairline out of the middle
        // (across the mirror's middle it stops there, its twin carrying it on)
        const join = sym === 'mirror' && h === 0, ax1 = join ? 0 : axis.x1;
        R0.pcs = [{ t: 'L', x0: axis.x0, y0: axis.y0, x1: cx, y1: cy }, { t: 'L', x0: cx, y0: cy, x1: ax1, y1: axis.y1 }]; R0.ends = ['open', join ? 'join' : 'open'];
        take(R0, [{ t: 'L', x0: axis.x0, y0: axis.y0, x1: ax1, y1: axis.y1 }], 1, false);
        routes.push(R0);
        const a0 = a0j, da = -side * Math.PI; // from one side of the axis round to the other
        for (const r of [r1, r2]) {
          const A = newRoute(1, id);
          A.w = w * K.arcW; A.hw = A.w / 2; A.colors = [cB]; A.train = cA; A.arc = true;
          A.pcs = [{ t: 'A', cx, cy, r, a0, da }]; A.ends = ['term', 'term'];
          routes.push(A);
        }
        for (const s2 of [-1, 1]) dots.push({ x: cx + s2 * r2 * DX[h], y: cy + s2 * r2 * DY[h], r: K.dot, c: cA });
        const x1 = cx + side * DX[nrm] * ext, y1 = cy + side * DY[nrm] * ext;
        hairs.push({ x0: cx, y0: cy, x1, y1, c: cB });
        takeHair(cx + side * DX[nrm] * (r2 + 0.3), cy + side * DY[nrm] * (r2 + 0.3), x1, y1, -id);
      } else {
        // a circle; an arc round it three-quarters of the way that runs off into a line; a hairline along the axis
        const A = newRoute(1, id);
        A.w = w * K.hair; A.hw = A.w / 2; A.colors = [cB]; A.train = cA; A.arc = true; A.closed = true;
        A.pcs = [{ t: 'A', cx, cy, r: r1, a0: 0, da: TAU }]; A.ends = ['term', 'term'];
        routes.push(A);
        hairs.push({ x0: axis.x0, y0: axis.y0, x1: axis.x1, y1: axis.y1, c: cB });
        takeHair(axis.x0, axis.y0, cx - (r2 + 0.3) * DX[h], cy - (r2 + 0.3) * DY[h], -id);
        takeHair(cx + (r2 + 0.3) * DX[h], cy + (r2 + 0.3) * DY[h], axis.x1, axis.y1, -id);
        // the arc starts on the hairline and runs round 270 degrees; its end heads off along the grid
        const a0 = a0j, da = side * 1.5 * Math.PI;
        const arc = { t: 'A', cx, cy, r: r2, a0, da };
        take(R0, [arc], 1, false);
        const [ex, ey] = pieceEnd(arc), ang = a0 + da + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
        const hd = ((Math.round(ang / (Math.PI / 2)) % 4) + 4) % 4;
        const f = walk(R0, ex, ey, hd, +1, rng.float(K.reach[0], K.reach[1]));
        R0.pcs = [arc, ...f.pcs]; R0.ends = ['stop', f.end]; R0.junction = true;
        routes.push(R0);
        // dots: where the arc crosses the hairline again, at its quarter, and one on the circle
        dots.push({ x: cx + r2 * Math.cos(a0 + Math.PI), y: cy + r2 * Math.sin(a0 + Math.PI), r: K.dot, c: cA });
        const aq = a0 + da / 3, qx = cx + r2 * Math.cos(aq), qy = cy + r2 * Math.sin(aq);
        dots.push({ x: qx, y: qy, r: K.dot, c: cA });
        const ad = rng.float(0, TAU);
        dots.push({ x: cx + r1 * Math.cos(ad), y: cy + r1 * Math.sin(ad), r: K.dot * 0.85, c: cB });
        // a hairline out from the arc's quarter, straight away from the centre
        const ox = Math.round(Math.cos(aq)), oy = Math.round(Math.sin(aq));
        hairs.push({ x0: qx, y0: qy, x1: qx + ox * ext, y1: qy + oy * ext, c: cB });
        takeHair(qx + ox * 0.4, qy + oy * 0.4, qx + ox * ext, qy + oy * ext, -id);
      }
    }

    if (hero === 'arc' && !heroAt) hero = 'line'; // (no room for the first junction: a line leads instead)

    // ---- the lines: the first (unless a junction leads) starts in the middle of the frame and turns there
    const nRoutes = Math.round((area / 25) * lerp(K.density[0], K.density[1], v01('routes', 45)) * (sym === 'none' ? 1 : 0.5));
    const tracksOf = () => (rng.chance(bundles) ? (rng.chance(0.55) ? 3 : 2) : 1);
    let tries = 0;
    for (let i = 0; i < nRoutes && tries < nRoutes * 4 + 12; tries++) {
      const first = i === 0 && hero === 'line';
      const span = tries < 8 ? K.hero : 1; // (no room in the middle: anywhere in the frame)
      const x = first ? (sym === 'none' ? Math.round(rng.float(-1, 1) * fx * span) + Q : Q - Math.max(1, Math.round(rng.float(0, 1) * fx * span)))
        : sym === 'none' ? Math.round(rng.float(-wx, wx)) + Q : Q - 1 - Math.floor(rng.float(0, wx));
      const y = (first ? Math.round(rng.float(-1, 1) * fy * span) : Math.round(rng.float(-wy, wy))) + Q;
      // (the first is a bundle of three more often than the rest, and turns where it starts)
      const tr = first ? (rng.chance(Math.min(1, bundles * 1.6)) ? 3 : 1) : tracksOf();
      const lead = first ? (tr === 1 && rng.chance(steps * 1.5) ? 'stairs' : rng.chance(0.25) ? 's' : 'turn') : null;
      const r = route(x, y, rng.int(0, 3), tr, rng.float(K.reach[0], K.reach[1]), lead);
      if (r || !first) i++;
    }

    // ---- hairlines along rows and columns that no line runs along
    const pH = K.hairP * v01('hairlines', 40) * (sym === 'none' ? 1 : 0.5);
    for (const ax of [0, 1]) {
      const n = Math.floor(ax === 0 ? wy : wx);
      for (let j = -n; j <= n; j++) {
        if (!rng.chance(pH)) continue;
        const ext = ax === 0 ? wx : wy;
        const hl = ax === 0 ? { x0: -ext - 2, y0: j + Q, x1: ext + 2, y1: j + Q, c: color() } : { x0: j + Q, y0: -ext - 2, x1: j + Q, y1: ext + 2, c: color() };
        if (hairClash(hl.x0, hl.y0, hl.x1, hl.y1)) continue;
        hairs.push(hl);
        takeHair(hl.x0, hl.y0, hl.x1, hl.y1, -8);
      }
    }

    // ---- a line that stops just past a crossing (or right at one) is cut back to stop short of it
    const trimEnd = (R, e) => {
      for (;;) { // (back past one crossing after another, till clear or too short to keep)
        let pcs = e === 0 ? R.pcs : R.pcs.slice().reverse().map(reversePiece);
        let [x, y] = pieceStart(pcs[0]), s = 0, hit = null;
        // (a line just beyond the end counts too: within 0.35 cells, nearer than any line alongside may come)
        const c0 = room.crosser(x, y, R.hw + 0.2, R.id);
        if (c0) hit = { s: 0, c: c0 };
        if (!hit) for (const pc of pcs) {
          const q = samplePiece(pc, 0.1, []);
          for (let i = 0; i < q.length && !hit && s <= K.stub; i += 4) {
            s += len(q[i] - x, q[i + 1] - y); x = q[i]; y = q[i + 1];
            const c = room.crosser(x, y, R.hw, R.id);
            if (c) hit = { s, c };
          }
          if (hit || s > K.stub) break;
        }
        if (!hit) return true;
        const cut = hit.s + hit.c.hw + R.hw + K.stubGap, total = pcs.reduce((a, pc) => a + pieceLen(pc), 0);
        // (a junction's line keeps its arc: what ran on from it goes)
        if (R.junction && total - cut < pieceLen(R.pcs[0]) + 0.3) { R.pcs = [R.pcs[0]]; return true; }
        if (total - cut < 1.5) return false; // too short to keep
        pcs = cutFront(pcs, cut);
        R.pcs = e === 0 ? pcs : pcs.slice().reverse().map(reversePiece);
      }
    };
    for (let i = routes.length - 1; i >= 0; i--) {
      const R = routes[i];
      if (R.arc) continue;
      if ((R.ends[0] === 'term' && !trimEnd(R, 0)) || (R.ends[1] === 'term' && !trimEnd(R, 1))) routes.splice(i, 1);
    }

    // ---- stations: at the end of a line a dot (a bundle of three loops round one, two tracks take one each);
    // rings at the ends of curves; dots at every other corner of a staircase
    const caps = [], ends = [];
    for (const R of routes) {
      if (R.arc) continue;
      for (const e of [0, 1]) {
        if (R.ends[e] !== 'term') continue;
        const pc = e === 0 ? R.pcs[0] : R.pcs[R.pcs.length - 1], [x, y] = e === 0 ? pieceStart(pc) : pieceEnd(pc);
        const [tx, ty] = pieceDir(pc, e === 1); // along the line (the tracks lie to either side of it)
        ends.push([x, y]);
        if (R.tracks === 1) dots.push({ x, y, r: K.dot, c: R.colors[0] });
        else if (R.tracks === 3) {
          caps.push({ cx: x, cy: y, r: K.spacing, a0: Math.atan2(-tx, ty), da: e === 1 ? Math.PI : -Math.PI, c: R.colors[0], w: R.w });
          dots.push({ x, y, r: K.dot, c: R.colors[1] });
        } else for (let t = 0; t < 2; t++) {
          const off = (t - 0.5) * K.spacing;
          dots.push({ x: x - ty * off, y: y + tx * off, r: K.spacing * 0.45, c: R.colors[t] });
        }
      }
    }
    const pRing = K.ringP * v01('stations', 40);
    for (const R of routes) {
      if (R.arc) continue;
      const whole = new Set(R.pcs.filter((pc) => !pc.part).map((pc) => pc.n));
      for (const pc of R.curves) {
        if (R.tracks === 2) continue;
        for (const [ex, ey] of [pieceStart(pc), pieceEnd(pc)]) {
          if (!rng.chance(pRing) || !whole.has(pc.n) || rings.some((r) => len(r.x - ex, r.y - ey) < K.ringGap) || ends.some(([x, y]) => len(x - ex, y - ey) < 0.75) || room.crosser(ex, ey, R.hw + K.ring, R.id)) continue;
          rings.push({ x: ex, y: ey, c: R.colors[(R.tracks - 1) >> 1], route: R.id, track: (R.tracks - 1) >> 1 });
        }
      }
      R.stairs.forEach((list) => list.forEach((pc, i) => {
        if (i >= 2 && i % 2 === 0 && whole.has(pc.n) && i + 1 < list.length && whole.has(list[i + 1].n) && !room.crosser(pc.x1, pc.y1, R.hw + K.dot, R.id)) dots.push({ x: pc.x1, y: pc.y1, r: K.dot * 0.85, c: i % 4 ? R.colors[0] : R.train });
      }));
    }

    // ---- loose dots and rows of three, where there is room
    const pD = K.dotsP * v01('dots', 40) * (sym === 'none' ? 1 : 0.5);
    for (let y = Q - Math.floor(wy); y <= wy; y += 0.5) for (let x = Q - Math.floor(wx); x <= (sym === 'none' ? wx : 0); x += 0.5) {
      const roll = rng.float();
      if (roll < pD) {
        if (room.clash(x, y, 0, 0, K.dot + 0.1, -9, 0, 0)) continue;
        room.add(x, y, 0, 0, K.dot + 0.1, -9, 0);
        dots.push({ x, y, r: K.dot * rng.pick([1, 1, 1.25]), c: color() });
      } else if (roll < pD * 1.25) {
        const vert = rng.chance(0.5), sp = K.stack[1], cx = x + (vert ? 0 : sp), cy = y + (vert ? sp : 0);
        if (room.clash(cx, cy, 0, 0, sp + K.stack[0] + 0.1, -9, 0, 0)) continue;
        room.add(cx, cy, 0, 0, sp + K.stack[0] + 0.1, -9, 0);
        const c = color();
        for (let k = 0; k < 3; k++) dots.push({ x: x + (vert ? 0 : k * sp), y: y + (vert ? k * sp : 0), r: K.stack[0], c });
      }
    }

    // ---- where each track's trains start, and the order lines were laid in (a twin shares its line's, so the
    // trains and the gaps are symmetric too)
    routes.forEach((R, i) => { R.order = i; R.s0 = Array.from({ length: R.tracks }, () => rng.float(0, 1)); });

    // ---- with Symmetry, everything again on the other side
    if (room.T) {
      const T = room.T;
      const tp = (pc) => {
        if (pc.t === 'L') { const [a, b] = T(pc.x0, pc.y0), [c, d] = T(pc.x1, pc.y1); return { t: 'L', x0: a, y0: b, x1: c, y1: d, sharp: pc.sharp }; }
        if (pc.t === 'A') {
          const [cx, cy] = T(pc.cx, pc.cy);
          return sym === 'turn' ? { t: 'A', cx, cy, r: pc.r, a0: pc.a0 + Math.PI, da: pc.da } : { t: 'A', cx, cy, r: pc.r, a0: Math.PI - pc.a0, da: -pc.da };
        }
        const q = [];
        for (let i = 0; i < 8; i += 2) q.push(...T(pc.p[i], pc.p[i + 1]));
        return { t: 'C', p: q };
      };
      const n0 = routes.length;
      for (let i = 0; i < n0; i++) { const R = routes[i]; routes.push({ ...R, id: R.id + 0.5, pcs: R.pcs.map(tp), twin: true }); }
      for (const hh of hairs.slice()) { const [a, b] = T(hh.x0, hh.y0), [c, d] = T(hh.x1, hh.y1); hairs.push({ x0: a, y0: b, x1: c, y1: d, c: hh.c }); }
      for (const d of dots.slice()) { const [a, b] = T(d.x, d.y); dots.push({ ...d, x: a, y: b }); }
      for (const r of rings.slice()) { const [a, b] = T(r.x, r.y); rings.push({ ...r, x: a, y: b, route: r.route + 0.5 }); }
      for (const cp of caps.slice()) { const q = tp({ t: 'A', ...cp }); caps.push({ ...cp, cx: q.cx, cy: q.cy, a0: q.a0, da: q.da }); }
    }

    // ---- every track as points in frame pixels, with the length along it
    const X = (x) => W / 2 + x * u, Y = (y) => H / 2 + y * u;
    const tracks = [];
    routes.forEach((R) => {
      const pts = [];
      const P0 = R.pcs[0];
      const s0 = P0.t === 'L' ? [P0.x0, P0.y0] : P0.t === 'A' ? [P0.cx + P0.r * Math.cos(P0.a0), P0.cy + P0.r * Math.sin(P0.a0)] : [P0.p[0], P0.p[1]];
      // the first point's direction: the first piece's
      const first = samplePiece(P0, 0.02, []);
      pts.push(s0[0], s0[1], first[2], first[3]);
      for (const pc of R.pcs) samplePiece(pc, pc.t === 'L' ? 1e9 : 0.06, pts);
      for (let t = 0; t < R.tracks; t++) {
        // (a mirror image swaps left and right: a twin's tracks count from the other side)
        const off = (R.twin && sym === 'mirror' ? -1 : 1) * (t - (R.tracks - 1) / 2) * K.spacing, q = [], cum = [0];
        for (let i = 0; i < pts.length; i += 4) {
          // offset across the line (its left: the direction turned a quarter)
          const x = X(pts[i] - pts[i + 3] * off), y = Y(pts[i + 1] + pts[i + 2] * off);
          if (q.length) { const l = len(x - q[q.length - 2], y - q[q.length - 1]); if (l < 1e-6) continue; cum.push(cum[cum.length - 1] + l); }
          q.push(x, y);
        }
        if (R.closed && q.length > 4) { cum.push(cum[cum.length - 1] + len(q[0] - q[q.length - 2], q[1] - q[q.length - 1])); }
        tracks.push({ pts: q, cum, w: R.w * u, hw: R.hw * u, c: R.colors[t], train: R.colors[t] === R.train ? R.colors[0] : R.train, order: R.order, route: R.id, group: R.group + (R.twin ? 0.5 : 0), ti: t,
          closed: !!R.closed, arc: !!R.arc, ends: R.ends, gaps: [], stops: [], s0: R.s0[t] });
      }
    });

    // ---- gaps: where two lines cross, the one laid first passes under; where a ring sits, the line stops at it
    const segs = new Map(), sk = (ix, iy) => (ix + 8192) * 16384 + (iy + 8192), cs = u;
    tracks.forEach((T, ti) => {
      const q = T.pts, n = q.length / 2;
      for (let i = 0; i < n - 1; i++) {
        const x0 = Math.min(q[2 * i], q[2 * i + 2]), x1 = Math.max(q[2 * i], q[2 * i + 2]), y0 = Math.min(q[2 * i + 1], q[2 * i + 3]), y1 = Math.max(q[2 * i + 1], q[2 * i + 3]);
        for (let iy = Math.floor(y0 / cs); iy <= Math.floor(y1 / cs); iy++) for (let ix = Math.floor(x0 / cs); ix <= Math.floor(x1 / cs); ix++) {
          const k = sk(ix, iy);
          let a = segs.get(k);
          if (!a) segs.set(k, (a = []));
          a.push(ti, i);
        }
      }
    });
    const seen = new Set();
    for (const a of segs.values()) {
      for (let x = 0; x < a.length; x += 2) for (let y = x + 2; y < a.length; y += 2) {
        const ta = tracks[a[x]], tb = tracks[a[y]];
        // (not within a line or a junction, nor where a line crosses its own twin: no gap there, nothing to pass under)
        if (Math.floor(ta.route) === Math.floor(tb.route) || ta.group === tb.group) continue;
        const i = a[x + 1], j = a[y + 1], key2 = a[x] + ':' + i + ':' + a[y] + ':' + j;
        if (seen.has(key2)) continue;
        seen.add(key2);
        const p = ta.pts, q = tb.pts;
        const ax = p[2 * i], ay = p[2 * i + 1], bx = p[2 * i + 2], by = p[2 * i + 3], cx = q[2 * j], cy = q[2 * j + 1], dx = q[2 * j + 2], dy = q[2 * j + 3];
        const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy, den = rx * sy - ry * sx;
        if (Math.abs(den) < 1e-12) continue;
        const t1 = ((cx - ax) * sy - (cy - ay) * sx) / den, t2 = ((cx - ax) * ry - (cy - ay) * rx) / den;
        if (t1 < 0 || t1 >= 1 || t2 < 0 || t2 >= 1) continue;
        const sin = Math.abs(den) / (len(rx, ry) * len(sx, sy));
        const fa = Math.floor(ta.route) * 2, fb = Math.floor(tb.route) * 2; // (a twin's crossings as its line's)
        if (PL.rng.hash(Math.min(fa, fb), Math.max(fa, fb), seed, 77) >= K.gapP) continue;
        const [under, over, iu, tu] = ta.order < tb.order ? [ta, tb, i, t1] : [tb, ta, j, t2];
        const su = under.cum[iu] + tu * (under.cum[iu + 1] - under.cum[iu]);
        const g = (over.w / 2 + under.w / 2 + K.gap * u) / Math.max(0.35, sin);
        under.gaps.push([su - g, su + g]);
      }
    }
    for (const r of rings) {
      const T = tracks.find((t) => t.route === r.route && t.ti === r.track);
      if (!T) continue;
      // the ring's place along its line
      const X0 = X(r.x), Y0 = Y(r.y);
      let best = Infinity, bs = 0;
      for (let i = 0; i < T.pts.length / 2 - 1; i++) {
        const ax = T.pts[2 * i], ay = T.pts[2 * i + 1], bx = T.pts[2 * i + 2], by = T.pts[2 * i + 3];
        const lx = bx - ax, ly = by - ay, l2 = lx * lx + ly * ly || 1, f = clamp01(((X0 - ax) * lx + (Y0 - ay) * ly) / l2);
        const d = len(ax + f * lx - X0, ay + f * ly - Y0);
        if (d < best) { best = d; bs = T.cum[i] + f * (T.cum[i + 1] - T.cum[i]); }
      }
      const rr = K.ring * u;
      T.gaps.push([bs - rr, bs + rr]);
    }
    // the dots that sit on a line: trains slip under them
    for (const d of dots) {
      const x = X(d.x), y = Y(d.y), r = d.r * u;
      for (let iy = Math.floor((y - r) / cs); iy <= Math.floor((y + r) / cs); iy++) for (let ix = Math.floor((x - r) / cs); ix <= Math.floor((x + r) / cs); ix++) {
        const a = segs.get(sk(ix, iy));
        if (a) for (let k = 0; k < a.length; k += 2) {
          const T = tracks[a[k]], i = a[k + 1], q = T.pts;
          const ax = q[2 * i], ay = q[2 * i + 1], lx = q[2 * i + 2] - ax, ly = q[2 * i + 3] - ay, l2 = lx * lx + ly * ly || 1;
          const f = clamp01(((x - ax) * lx + (y - ay) * ly) / l2);
          if (len(ax + f * lx - x, ay + f * ly - y) < r + T.w / 2) T.stops.push([T.cum[i] + f * (T.cum[i + 1] - T.cum[i]), r]);
        }
      }
    }
    for (const T of tracks) {
      T.gaps.sort((a, b) => a[0] - b[0]);
      const mg = [];
      for (const g of T.gaps) { if (mg.length && g[0] <= mg[mg.length - 1][1]) mg[mg.length - 1][1] = Math.max(mg[mg.length - 1][1], g[1]); else mg.push(g.slice()); }
      T.gaps = mg;
    }

    PLAN = {
      key: keyStr, u, w: w * u, tracks,
      hairs: hairs.map((h) => ({ x0: X(h.x0), y0: Y(h.y0), x1: X(h.x1), y1: Y(h.y1), c: h.c })),
      dots: dots.map((d) => ({ x: X(d.x), y: Y(d.y), r: d.r * u, c: d.c })),
      rings: rings.map((r) => ({ x: X(r.x), y: Y(r.y), r: K.ring * u, c: r.c })),
      caps: caps.map((cp) => ({ x: X(cp.cx), y: Y(cp.cy), r: cp.r * u, a0: cp.a0, da: cp.da, c: cp.c, w: cp.w * u })),
      nRoutes: routes.filter((R) => !R.arc && !R.twin).length,
    };
    return PLAN;
  }

  /* ---- the picture -------------------------------------------------------------------- */
  // A point along a track, at length s: [x, y] (s within it).
  function at(T, s) {
    const c = T.cum, n = c.length;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (c[mid] <= s) lo = mid; else hi = mid; }
    const i = lo, f = c[i + 1] > c[i] ? (s - c[i]) / (c[i + 1] - c[i]) : 0, q = T.pts, j = (i + 1) % (q.length / 2);
    return [q[2 * i] + f * (q[2 * j] - q[2 * i]), q[2 * i + 1] + f * (q[2 * j + 1] - q[2 * i + 1])];
  }

  function build({ W, H, seed, p, colors, t = 0, anim, region }) {
    const n = colors.length, m = n - 1, names = roles(n);
    const P = plan(seed | 0, p, W, H), u = P.u;
    const R = PL.tools.region({ W, H, region });
    const pad = 0.3 * u, rx0 = R.x0 - pad, rx1 = R.x1 + pad, ry0 = R.y0 - pad, ry1 = R.y1 + pad;
    const inR = (x0, y0, x1, y1) => Math.max(x0, x1) >= rx0 && Math.min(x0, x1) <= rx1 && Math.max(y0, y1) >= ry0 && Math.min(y0, y1) <= ry1;
    const ci = (c) => 1 + (((c % m) + m) % m);
    const scene = new PL.Scene(W, H, colors[0], 0);
    const L = (kind, name) => Array.from({ length: m }, (_, i) => { const l = scene.layer(kind + '-' + (i + 1), colors[1 + i], m === 1 ? name : name + ' ' + (i + 1), 1 + i); l.cap = 'butt'; return l; });
    const lines = L('lines', 'Lines'), hairs = L('hairlines', 'Hairlines'), ringsL = L('rings', 'Rings'), dotsL = L('dots', 'Dots'), trainsL = L('trains', 'Trains');

    // the lines, in their visible runs (gaps left out), cut to the region
    let drawn = 0;
    for (const T of P.tracks) {
      const q = T.pts, c = T.cum, nn = q.length / 2, Ly = lines[ci(T.c) - 1];
      // visible spans along it: everything but the gaps
      const spans = [];
      let s = 0;
      for (const g of T.gaps) { if (g[0] > s) spans.push([s, g[0]]); s = Math.max(s, g[1]); }
      const total = c[c.length - 1];
      if (s < total) spans.push([s, total]);
      for (const [a, b] of spans) {
        let run = [];
        const flush = () => { if (run.length >= 4) { PL.Scene.stroke(Ly, run, T.w, false); drawn++; } run = []; };
        const [ax, ay] = at(T, a);
        let px = ax, py = ay;
        run.push(ax, ay);
        for (let i = 0; i < (T.closed ? nn : nn - 1); i++) {
          if (c[i + 1] <= a || c[i] >= b) continue;
          const j = (i + 1) % nn;
          let qx = q[2 * j], qy = q[2 * j + 1];
          if (c[i + 1] > b) [qx, qy] = at(T, b);
          if (inR(px, py, qx, qy)) { if (!run.length) run.push(px, py); run.push(qx, qy); } else flush();
          px = qx; py = qy;
        }
        flush();
      }
    }
    for (const cp of P.caps) {
      if (!inR(cp.x - cp.r, cp.y - cp.r, cp.x + cp.r, cp.y + cp.r)) continue;
      const pts = [];
      for (let k = 0; k <= 24; k++) { const a = cp.a0 + (cp.da * k) / 24; pts.push(cp.x + cp.r * Math.cos(a), cp.y + cp.r * Math.sin(a)); }
      PL.Scene.stroke(lines[ci(cp.c) - 1], pts, cp.w, false);
    }
    for (const h of P.hairs) {
      if (!inR(h.x0, h.y0, h.x1, h.y1)) continue;
      // (they run along the grid: cut to the region)
      const x0 = clamp(h.x0, rx0, rx1), x1 = clamp(h.x1, rx0, rx1), y0 = clamp(h.y0, ry0, ry1), y1 = clamp(h.y1, ry0, ry1);
      if (len(x1 - x0, y1 - y0) > 0) PL.Scene.stroke(hairs[ci(h.c) - 1], [x0, y0, x1, y1], P.w * K.hair, false);
    }
    for (const r of P.rings) {
      if (!inR(r.x, r.y, r.x, r.y)) continue;
      const pts = [];
      for (let k = 0; k < 48; k++) pts.push(r.x + r.r * Math.cos((k / 48) * TAU), r.y + r.r * Math.sin((k / 48) * TAU));
      PL.Scene.stroke(ringsL[ci(r.c) - 1], pts, P.w * K.ringW, true);
    }
    for (const d of P.dots) if (inR(d.x, d.y, d.x, d.y)) PL.Scene.circle(dotsL[ci(d.c) - 1], d.x, d.y, d.r);

    // trains: evenly spaced along every line, hopping a spacing at a time (a smooth start, glide and wait)
    const amount = anim ? Math.max(0, anim.amount || 0) : 0, hops = Math.round(amount * K.hops);
    const tr = clamp01((p.trains ?? 50) / 100);
    let trains = 0;
    if (tr > 0) {
      const D0 = u * lerp(K.trains[0], K.trains[1], tr), fade = K.fade * u, rT = K.dot * u;
      const ease = (f) => { const x = clamp01((f - K.dwell / 2) / (1 - K.dwell)); return x * x * x * (x * (6 * x - 15) + 10); };
      const x = hops * t, E = Math.floor(x) + ease(x - Math.floor(x));
      for (const T of P.tracks) {
        const total = T.cum[T.cum.length - 1];
        if (!(total > 0)) continue;
        const D = T.closed ? total / Math.max(1, Math.round(total / D0)) : D0;
        const off = (T.s0 + E) * D;
        const k0 = Math.ceil(-off / D), k1 = Math.floor((total - off) / D);
        for (let k = k0; k <= k1; k++) {
          let s = off + k * D;
          if (T.closed) s = ((s % total) + total) % total;
          if (s < 0 || s > total) continue;
          // shrink away near an end of the line (unless it runs on off the map), into a gap and under a dot
          let f = 1;
          if (!T.closed) {
            if (T.ends[0] !== 'open') f = Math.min(f, clamp01(s / fade));
            if (T.ends[1] !== 'open') f = Math.min(f, clamp01((total - s) / fade));
          }
          for (const g of T.gaps) f = Math.min(f, clamp01(Math.max(g[0] - s, s - g[1]) / fade));
          for (const [s1, r1] of T.stops) f = Math.min(f, clamp01((Math.abs(s - s1) - r1) / fade));
          if (f <= 0.02) continue;
          const [px, py] = at(T, s);
          if (!inR(px, py, px, py)) continue;
          PL.Scene.circle(trainsL[ci(T.train) - 1], px, py, rT * f);
          trains++;
        }
      }
    }
    scene.layers = scene.layers.filter((Ly) => Ly.s.length || Ly.c.length);
    scene.status = `${P.nRoutes.toLocaleString()} line${P.nRoutes === 1 ? '' : 's'} · ${trains.toLocaleString()} trains`;
    return scene;
  }

  PL.tools.register({
    id: 'station',
    name: 'Station',
    kind: 'Pop art',
    tagline: 'Transit map',
    about: 'Transit-map lines on a flat ground run along a grid, swing round wide corners, shift across in S-curves or step down staircases, alone or in nested bundles, passing under one another where they cross. Junctions gather half-circles and circles, hairlines cross the map, and stations sit along the way as rings and dots. In the animation trains hop from stop to stop.',
    inks: {
      min: 2, max: 6, roles, fit, spec, add, generate,
      span: () => 2, // Invert swaps the ground and the first line color
      hint: 'Ground first, then the lines: bundles take two colors in turn, and trains ride in a color other than their line.',
    },
    palettes: PALETTES,
    params: PARAMS,
    animLabel: 'Amount',
    animHint: 'How many hops the trains make in a loop (0: still)',
    defaults: {
      palette: 'Lime', // the preset the style opens on (its card's colors)
      anim: { amount: 1, fps: 30, frames: 240 }, // an 8 s loop, two hops
      fx: {},
    },
    build,
    zoom: true, // draws any region of its world (General's Rotation and Size)
    _K: K,
    _plan: plan,
  });
})();
