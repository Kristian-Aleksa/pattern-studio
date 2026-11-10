/* ==========================================================================
   tools/coral.js — Coral: sea-fan textile.

   1. Fan: from a root at (or just beyond) one edge, Branches primary limbs
      fan out across Spread. Each ribbon widens as its share of the fan opens
      up, then splits lengthwise into two narrower ribbons that drift apart,
      the way a sea fan grows, so the frame fills with near-parallel ribbons
      about Spacing apart. A shared wobble field bends neighbouring ribbons
      together (zebra waves).
   2. Paper: one torn sheet with a dot screen. Cover sets how much of the
      frame it covers and Size the scale of its lobes. Beneath sets how much
      of the coral passes under it: whole stretches of ribbon go under or over
      together, so some lobes hide the ribbons and others carry them, and a
      ribbon that dives under the paper ends in a blunt cut on top of it.
   3. Print: ribs (stripes across each ribbon), the dot screen (dots grow
      toward the torn edges) and drop shadows from the top-left light.
   4. Animation: every ribbon segment sways side to side on its own slow
      rhythm, carrying the segments that grow from it; the paper stays put.
      Frame 1 is the still image and the loop is seamless.
   ========================================================================== */
(() => {
  const { hash } = PL.rng;

  // Ground, branches, ribs, paper, dots. The default look uses Mono (defaults.palette).
  const PALETTES = [
    { name: 'Reef', colors: ['#392911', '#FF6E2A', '#FF9DA7', '#BE226E', '#FC81D2'] },
    { name: 'Kelp', colors: ['#0F1E1A', '#D9A62E', '#F7E3A3', '#2C6B5E', '#8CC7B8'] },
    { name: 'Indigo', colors: ['#111628', '#F2C14E', '#FFF1C9', '#2B4C9B', '#8FA8F0'] },
    { name: 'Lagoon', colors: ['#06232A', '#FF6B5B', '#FFC2B8', '#0E7C86', '#7ED6C9'] },
    { name: 'Dusk', colors: ['#24101F', '#FF9F43', '#FFD6A5', '#6A2C91', '#C77DFF'] },
    { name: 'Moss', colors: ['#1A1F16', '#E07A5F', '#F2CC8F', '#55663F', '#9AAE6B'] },
    { name: 'Linen', colors: ['#F2EADF', '#C2452D', '#F6C3B3', '#1F3A5F', '#7FA3CC'] },
    { name: 'Complement', colors: ['#F8ECF1', '#D65194', '#F5C5D8', '#047B62', '#94D8C2'] }, // complement 352/172: branches and ribs on 352, paper and dots opposite
    { name: 'Mono', colors: ['#151515', '#EDEAE4', '#FFFFFF', '#5A5955', '#9C9A95'] },
    { name: 'Duo', colors: ['#1B1714', '#FF7A3D', '#B8245F'] },
    { name: 'Ink', colors: ['#EFEBE3', '#1A1A1A'] },
  ];

  /* ---- color roles -----------------------------------------------------------
     2: ground, branches (the paper is ground-coloured with branch-ink dots)
     3: ground, branches, paper (ribs in the paper ink, dots in the branch ink)
     4: ground, branches, ribs, paper (dots in the rib ink)
     5: ground, branches, ribs, paper, dots
     6+: ... extra branch inks, dealt out by limb                                 */
  function slots(n) {
    if (n <= 2) return { ground: 0, branch: [1], ribs: 0, paper: 0, dots: 1 };
    if (n === 3) return { ground: 0, branch: [1], ribs: 2, paper: 2, dots: 1 };
    if (n === 4) return { ground: 0, branch: [1], ribs: 2, paper: 3, dots: 2 };
    return { ground: 0, branch: [1, ...Array.from({ length: n - 5 }, (_, i) => 5 + i)], ribs: 2, paper: 3, dots: 4 };
  }
  function roles(n) {
    if (n <= 2) return ['Ground', 'Branches'];
    if (n === 3) return ['Ground', 'Branches', 'Paper'];
    if (n === 4) return ['Ground', 'Branches', 'Ribs', 'Paper'];
    return ['Ground', 'Branches', 'Ribs', 'Paper', 'Dots', ...Array.from({ length: n - 5 }, (_, i) => 'Branches ' + (i + 2))];
  }
  const spec = (n) => ({ ramp: 2, accents: Math.max(0, n - 3) });

  const isLight = (hex) => PL.color.luminance(hex) > 0.35;

  // "New colors": a deep ground, a hot branch ink with a pale rib tint, and a
  // paper ink from across the wheel with a lighter dot ink of the same hue.
  function generate(n, rng) {
    const C = PL.color;
    const dark = rng.chance(0.8);
    const h = rng.float(0, 360);
    const ground = dark ? C.lch(rng.float(0.17, 0.25), rng.float(0.02, 0.05), h + rng.float(-30, 30)) : C.lch(rng.float(0.93, 0.96), rng.float(0.01, 0.03), rng.float(60, 100));
    const branch = C.lch(dark ? rng.float(0.66, 0.76) : rng.float(0.52, 0.62), rng.float(0.15, 0.2), h + rng.float(20, 60));
    const ribs = C.mix(branch, '#FFFFFF', rng.float(0.45, 0.6));
    const ph = h + rng.pick([150, 180, 210, 240, 120]);
    const paper = C.lch(dark ? rng.float(0.4, 0.5) : rng.float(0.38, 0.5), rng.float(0.12, 0.18), ph);
    const dots = C.lch(dark ? rng.float(0.7, 0.8) : rng.float(0.7, 0.82), rng.float(0.1, 0.16), ph + rng.float(-15, 15));
    const base = [ground, branch, ribs, paper, dots];
    if (n <= 2) return [ground, branch];
    if (n === 3) return [ground, branch, paper];
    if (n === 4) return [ground, branch, ribs, paper];
    const out = base.slice();
    while (out.length < n) out.push(C.lch(dark ? rng.float(0.62, 0.78) : rng.float(0.5, 0.62), rng.float(0.13, 0.19), h + rng.float(-70, 70)));
    return out;
  }

  // + adds the next role: paper, then ribs, then dots, then extra branch inks.
  function add(colors) {
    const C = PL.color;
    const c = colors.slice();
    const n = c.length;
    const [, , hb] = C.hexToLch(c[1] || '#FF6E2A');
    if (n <= 2) c.push(C.lch(isLight(c[0]) ? 0.45 : 0.42, 0.16, hb + 200));           // paper
    else if (n === 3) c.splice(2, 0, C.mix(c[1], '#FFFFFF', 0.5));                    // ribs
    else if (n === 4) c.push(C.mix(c[3], '#FFFFFF', 0.45));                            // dots
    else c.push(C.lch(isLight(c[0]) ? 0.56 : 0.7, 0.17, hb + 35 * (n - 4)));           // another branch ink
    return c;
  }

  function fit(colors, n) {
    const C = PL.color;
    let c = (colors || []).map(C.normHex).filter(Boolean);
    if (!c.length) c = PALETTES[0].colors.slice();
    if (c.length === 1) c.push(C.mix(c[0], isLight(c[0]) ? '#000000' : '#FFFFFF', 0.75));
    if (c.length === n) return c;
    if (c.length > n) {
      if (n <= 2) return [c[0], c[1]];
      if (n === 3) return [c[0], c[1], c[Math.min(3, c.length - 1)]];
      if (n === 4) return c.slice(0, 4);
      return c.slice(0, n);
    }
    while (c.length < n) c = add(c);
    return c;
  }

  const S = (section, key, label, min, max, def, extra = {}) => ({ section, key, label, type: 'range', min, max, def, step: 1, ...extra });

  const PARAMS = [
    S('Fan', 'branches', 'Branches', 1, 12, 6, { rand: [4, 8], hint: 'Limbs growing from the root' }),
    S('Fan', 'spacing', 'Spacing', 0, 100, 50, { unit: '%', rand: [30, 70], hint: 'Gap between neighbouring branches' }),
    S('Fan', 'spread', 'Spread', 0, 100, 70, { unit: '%', rand: [45, 85], hint: 'How wide the fan opens' }),
    S('Fan', 'width', 'Width', 0, 100, 60, { unit: '%', rand: [50, 75], hint: 'Branch width' }),
    S('Fan', 'wobble', 'Wobble', 0, 100, 40, { unit: '%', rand: [25, 60], hint: 'How much the branches wave' }),
    S('Paper', 'cover', 'Cover', 0, 100, 50, { unit: '%', rand: [40, 65], hint: 'How much of the frame is torn paper' }),
    S('Paper', 'size', 'Size', 0, 100, 50, { unit: '%', rand: [30, 75], hint: 'Size of the paper lobes' }),
    S('Paper', 'beneath', 'Beneath', 0, 100, 35, { unit: '%', rand: [20, 55], hint: 'How much of the coral passes under the paper' }),
    S('Print', 'ribs', 'Ribs', 0, 100, 80, { unit: '%', rand: [60, 100], hint: 'Strength of the stripes across each branch' }),
    S('Print', 'dots', 'Dots', 0, 100, 70, { unit: '%', rand: [45, 90], hint: 'Size of the dot screen on the paper' }),
    S('Print', 'shadow', 'Shadow', 0, 100, 60, { unit: '%', rand: [40, 70], hint: 'Drop shadows and edge shading' }),
  ];

  // Shape constants: lengths in units of the frame's long edge (L).
  const K = {
    // fan
    rootOut: [0.1, 0.32], // how far outside its edge the root sits (x L)
    aim: 0.14,        // the fan aims at the frame centre, give or take this much (x L)
    fan0: 60, fanK: 170, // fan angle in degrees: fan0 + fanK * Spread
    s0: 0.0284, sK: 0.000354, // spacing between neighbours: s0 + sK * Spacing (x L)
    forkLo: 1.6, forkHi: 2.3, // a ribbon splits when its share of the fan is this many spacings wide
    minSeg: 0.14,     // shortest segment (x L): with few Branches the fan opens up slowly, like a trunk
    diverge: 5,       // the two halves of a split drift apart over this many spacings
    widen: 2,         // ... and grow to their own width over this many
    term: 0.2,        // chance a split is only a short side shoot (ending in a point, a round end or a cut)
    w0: 0.164, wK: 0.0037, // ribbon width: (w0 + wK * Width) * spacing at one spacing of share
    wPow: 0.75,       // ribbons widen as their share opens up, a little less than in proportion
    shareMax: 2.6,    // ... and never get wider than at this share (few Branches would otherwise make huge trunks)
    rootW: 0.7,       // the limbs keep at least this much width (x spacings of share) at the root, so they bunch up there
    wVar: 0.15,       // width spread between ribbons
    slit: 0.0014,     // the slit between the two halves of a split (x L)
    ov: 0.0008, ovW: 0.35, // a split half starts this far (x L, or x its parent's width if more) inside its parent, so joints never gap
    // wobble
    wob: 0.4,         // shared wave amplitude at Wobble 100 % (x L)
    wobL: 0.8,        // its wavelength (x L)
    wobWarp: 0.4,     // the wave field is warped by this much (sharper, more organic bends)
    envR: 0.12,       // waves fade in over this distance from the root (x L)
    // depth
    depthL: 0.4,      // size of the stretches that pass under or over the paper together (x L)
    depthK: 0.7,      // Beneath compounds with each split: P(under) = 1 - (1 - Beneath)^(depthK * (generation + 0.25))
    // sway (animation)
    sway: 0.022,      // each segment's own sway at Amount 1 (x L)
    swayL: 0.6,       // the sway travels outward along a branch with this wavelength (x L)
    swayIn: 0.25,     // a segment's sway fades in over this length from its start (x L)
    // print
    ribP0: 0.00357, ribPK: 0.0000856, // rib period: ribP0 + ribPK * Spacing (x L); finer ribs on closer branches
    ribW: 0.3,        // rib width (x period)
    rib0: 20,         // ribs start to show above this Ribs %
    ribA: 0.97,       // rib opacity at Ribs 100 %
    ribSkew: 0.12,    // ribs lean up to this much (radians) per segment
    shadeW: 0.24,     // edge shading band (x branch width)
    shadeA: 0.3,      // edge shading opacity at Shadow 100 %
    shA: 0.45,        // drop shadow opacity at Shadow 100 %
    shD: [0.0045, 0.0072], shD0: [0.001, 0.0015], // drop shadow offset: shD0 + shD * Shadow (x L)
    paperShA: 0.3,    // paper shadow opacity at Shadow 100 %
    // paper
    grid: 300,        // paper field samples across L
    lam0: 0.45, lamK: 0.006, // lobe scale: lam0 + lamK * Size (x L)
    oct: 4, gain: 0.5, warp: 0.2,
    cover: [0.8, 0.2], coverVar: 0.25, // paper area = Cover * (a + b * Cover), give or take coverVar per seed
    dotP: 1 / 105,    // dot screen period (x L)
    dotK: 0.33,       // dot radius at the torn edge: dotK * Dots * period
    dotIn: 0.22,      // dots shrink by up to this much deep inside the paper
    groups: 6,        // limbs are layered in this many groups (so they shade each other)
    dr: 0.0035,       // centreline sampling step (x L)
  };

  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  /* ---- the fan (structure only; positions are computed per frame) -------- */
  // R (General's Rotation and Size): the part of the world to cover. The fan is grown for the frame first
  // (exactly as at 100 %), then on past it: limbs that ran out of the frame carry on and split, and the
  // shoots it had no room for grow too, so zooming out shows more of the same fan.
  function buildTree(W, H, seed, p, R) {
    const L = Math.max(W, H);
    const r = PL.rng.create(seed ^ 0x6a09e667);
    // Root on an edge (left and bottom a little more likely), aimed across the frame.
    const e = r.next();
    const edge = e < 0.33 ? 'L' : e < 0.58 ? 'B' : e < 0.8 ? 'R' : 'T';
    const u = r.float(0.3, 0.7), out = r.float(K.rootOut[0], K.rootOut[1]) * L;
    const O = edge === 'L' ? [-out, u * H] : edge === 'R' ? [W + out, u * H] : edge === 'B' ? [u * W, H + out] : [u * W, -out];
    const aimX = W / 2 + r.float(-K.aim, K.aim) * L, aimY = H / 2 + r.float(-K.aim, K.aim) * L;
    const dir = Math.atan2(aimY - O[1], aimX - O[0]);
    const theta = ((K.fan0 + K.fanK * (p.spread / 100)) * Math.PI) / 180;
    const sp = (K.s0 + K.sK * p.spacing) * L;
    const wr = K.w0 + K.wK * p.width;
    const D = K.diverge * sp, Dw = K.widen * sp;
    // the box to grow into (the frame, or the region) and the farthest the fan need reach
    const reachOf = (x0, y0, x1, y1) => Math.max(...[[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => Math.hypot(x - O[0], y - O[1]))) + 0.06 * L;
    const insideOf = (x0, y0, x1, y1) => (ang, ra, rb) => {
      for (let k = 0; k <= 6; k++) {
        const rr = ra + ((rb - ra) * k) / 6;
        const x = O[0] + rr * Math.cos(ang), y = O[1] + rr * Math.sin(ang);
        if (x > x0 - 0.12 * L && x < x1 + 0.12 * L && y > y0 - 0.12 * L && y < y1 + 0.12 * L) return true;
      }
      return false;
    };

    const nodes = [];
    // Width of a ribbon at radius rr: grows with its share of the fan; the two halves
    // of a split start exactly side by side (ws) and ease into their own width.
    const widthAt = (nd, rr) => {
      const share = Math.min(K.shareMax, Math.max(nd.parent < 0 ? K.rootW : 0, (rr * nd.d) / sp));
      const wn = wr * sp * nd.wf * Math.pow(share, K.wPow);
      if (nd.parent < 0) return wn;
      return nd.ws + (wn - nd.ws) * smooth(nd.r0, nd.r0 + Dw, rr);
    };
    // Direction (angle about the root) of a ribbon's unbent centreline at radius rr:
    // a split half starts beside its parent and eases onto its own share of the fan.
    const baseAt = (nd, rr) => {
      if (nd.parent < 0) return nd.c;
      const g = smooth(nd.r0, nd.r0 + D, rr);
      if (g >= 1) return nd.c;
      return (baseAt(nodes[nd.parent], rr) + nd.off) * (1 - g) + nd.c * g;
    };

    // A node's split: its two halves (or a side shoot and the carrying half).
    const splitOf = (nd, node, rf, h) => {
      const d = nd.a1 - nd.a0;
      const wp = widthAt(node, rf);
      const s = Math.min(K.slit * L, 0.3 * wp);
      const kids = [];
      if (h(2) < K.term) {
        const f = 0.3 + 0.12 * h(11), wS = f * wp - s / 2, wC = (1 - f) * wp - s / 2;
        if (h(12) < 0.5) kids.push({ a0: nd.a0, a1: nd.a0 + d * f, lo: -wp / 2 + wS / 2, ws: wS, stub: true }, { a0: nd.a0, a1: nd.a1, lo: wp / 2 - wC / 2, ws: wC });
        else kids.push({ a0: nd.a1 - d * f, a1: nd.a1, lo: wp / 2 - wS / 2, ws: wS, stub: true }, { a0: nd.a0, a1: nd.a1, lo: -wp / 2 + wC / 2, ws: wC });
      } else {
        const split = 0.38 + 0.24 * h(11), am = nd.a0 + d * split;
        const w1 = split * wp - s / 2, w2 = (1 - split) * wp - s / 2;
        kids.push({ a0: nd.a0, a1: am, lo: -wp / 2 + w1 / 2, ws: w1 }, { a0: am, a1: nd.a1, lo: wp / 2 - w2 / 2, ws: w2 });
      }
      return kids.map((k) => ({ a0: k.a0, a1: k.a1, stub: !!k.stub, r0: rf, parent: node.id, gen: nd.gen + 1, limb: nd.limb, off: k.lo / rf, lo: k.lo, ws: Math.max(0, k.ws), ov: Math.max(K.ov * L, K.ovW * wp) }));
    };
    // Grow every node on the stack (ids from nodes.length on), each splitting until it leaves the box.
    // Kids with no room in the box and limbs that ran out of it are noted, to carry on later.
    const pruned = [], exits = [];
    const grow = (stack, rMax, inside) => {
      while (stack.length) {
        const nd = stack.pop();
        const me = nodes.length;
        const h = (k) => hash(me, k, seed, 77);
        const d = nd.a1 - nd.a0;
        let rf = Math.max(nd.r0 + K.minSeg * L, (sp * (K.forkLo + (K.forkHi - K.forkLo) * h(1))) / Math.max(1e-4, d));
        let kind = 'fork';
        if (nd.stub) { // a side shoot runs a little way and ends in a point, a round end or a cut
          rf = nd.r0 + Math.max(0.03 * L, (rf - nd.r0) * (0.3 + 0.5 * h(3)));
          const q = h(4);
          kind = q < 0.45 ? 'point' : q < 0.75 ? 'round' : 'cut';
        }
        const node = {
          id: me, parent: nd.parent, gen: nd.gen, limb: nd.limb, c: (nd.a0 + nd.a1) / 2, d, r0: nd.r0, r1: rf, kind,
          off: nd.off, lo: nd.lo, ws: nd.ws, ov: nd.ov, kids: [], wf: 1 + K.wVar * (2 * h(5) - 1),
          ph: h(6) * Math.PI * 2, ribPh: h(8), skew: (h(9) * 2 - 1) * K.ribSkew, cutK: h(10) - 0.5,
          dv: 9, du: 1, wt: 0,
        };
        if (rf >= rMax) { exits.push({ id: me, nd, rf, kind }); node.r1 = rMax; node.kind = 'exit'; }
        node.r1f = node.r1; // (where it ends in the box it grew in)
        nodes[me] = node;
        if (nd.parent >= 0) nodes[nd.parent].kids.push(me);
        if (node.kind === 'fork') {
          for (const k of splitOf(nd, node, rf, h)) {
            if (!inside((k.a0 + k.a1) / 2, rf, rMax)) { pruned.push(k); continue; }
            stack.push(k);
          }
        }
      }
    };

    const B = Math.max(1, Math.round(p.branches));
    const stack = [];
    // Primary limbs share the fan unevenly, like a real one.
    const cuts = [0];
    for (let k = 1; k < B; k++) cuts.push((k + r.float(-0.3, 0.3)) / B);
    cuts.push(1);
    for (let k = 0; k < B; k++) {
      const a0 = dir - theta / 2 + cuts[k] * theta, a1 = dir - theta / 2 + cuts[k + 1] * theta;
      stack.push({ a0, a1, r0: 0, parent: -1, gen: 0, limb: k, off: 0, lo: 0, ws: 0, ov: 0 });
    }
    const rMax = reachOf(0, 0, W, H);
    grow(stack, rMax, insideOf(0, 0, W, H));
    const nFrame = nodes.length;
    if (R) {
      // on past the frame: limbs that ran out of it carry on (and split), shoots it had no room for grow
      const rMax2 = reachOf(R.x0, R.y0, R.x1, R.y1), inside2 = insideOf(R.x0, R.y0, R.x1, R.y1);
      const more = [];
      const ex = exits.splice(0), pr = pruned.splice(0);
      for (const x of ex) {
        if (x.rf <= rMax) continue;
        const node = nodes[x.id];
        if (x.rf >= rMax2) { node.r1 = rMax2; continue; }
        node.r1 = x.rf; node.kind = x.kind;
        if (x.kind === 'fork') {
          const h = (k) => hash(x.id, k, seed, 77);
          for (const k of splitOf(x.nd, node, x.rf, h)) if (inside2((k.a0 + k.a1) / 2, x.rf, rMax2)) more.push(k);
        }
      }
      for (const k of pr) if (inside2((k.a0 + k.a1) / 2, k.r0, rMax2)) more.push(k);
      grow(more.reverse(), rMax2, inside2);
    }
    // Which stretches pass under the paper is decided by a slow random field, so
    // neighbours go under or over together (see Beneath in build).
    const Nd = PL.noise.get(seed ^ 0x2545f491);
    const weigh = (nd, x0, y0, x1, y1, rEnd) => {
      let sx = 0, sy = 0, cnt = 0;
      for (let k = 0; k < 16; k++) {
        const rr = nd.r0 + ((rEnd - nd.r0) * (k + 0.5)) / 16;
        const x = O[0] + rr * Math.cos(nd.c), y = O[1] + rr * Math.sin(nd.c);
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) { sx += x; sy += y; cnt++; }
      }
      nd.wt = ((rEnd - nd.r0) * cnt) / 16;
      if (cnt) nd.dv = Nd.noise4(sx / cnt / (K.depthL * L), sy / cnt / (K.depthL * L), 0.5, 0);
    };
    for (let i = 0; i < nFrame; i++) weigh(nodes[i], 0, 0, W, H, Math.min(nodes[i].r1f, rMax));
    // Rank the field values so they're spread evenly over 0 … 1.
    const seen = nodes.slice(0, nFrame).filter((nd) => nd.wt > 0).sort((a, b) => a.dv - b.dv);
    seen.forEach((nd, i) => { nd.du = (i + 0.5) / seen.length; });
    if (R) {
      // the rest (all past the frame) take their place among the frame's ranks
      const dvs = seen.map((nd) => nd.dv), rMax2 = reachOf(R.x0, R.y0, R.x1, R.y1);
      for (const nd of nodes) {
        if (nd.wt > 0 && nd.id < nFrame) continue;
        weigh(nd, R.x0, R.y0, R.x1, R.y1, Math.min(nd.r1, rMax2));
        if (!(nd.wt > 0)) continue;
        let lo = 0, hi = dvs.length;
        while (lo < hi) { const m = (lo + hi) >> 1; if (dvs[m] < nd.dv) lo = m + 1; else hi = m; }
        nd.du = dvs.length ? (lo + 0.5) / (dvs.length + 1) : 0.5;
      }
    }
    return { O, nodes, L, sp, widthAt, baseAt };
  }

  /* ---- paper: one torn sheet with a dot screen ------------------------------ */
  // Marching squares on a grid of values (> 0 = inside). Returns closed loops
  // as flat [x, y, ...] arrays: outer edges clockwise, holes anticlockwise.
  function contours(v, nx, ny, x0, y0, g) {
    const at = (i, j) => v[j * (nx + 1) + i];
    const next = new Map(), pos = new Map();
    const edgePt = (i, j, horiz) => {
      const id = ((j * (nx + 1) + i) << 1) | (horiz ? 0 : 1);
      if (!pos.has(id)) {
        const a = at(i, j), b = horiz ? at(i + 1, j) : at(i, j + 1);
        const t = a / (a - b);
        pos.set(id, horiz ? [x0 + (i + t) * g, y0 + j * g] : [x0 + i * g, y0 + (j + t) * g]);
      }
      return id;
    };
    // Edge ids for a cell: T, R, B, Lf.
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
        const code = (a > 0 ? 8 : 0) | (b > 0 ? 4 : 0) | (c > 0 ? 2 : 0) | (d > 0 ? 1 : 0);
        if (code === 0 || code === 15) continue;
        const T = () => edgePt(i, j, true), R = () => edgePt(i + 1, j, false), Bt = () => edgePt(i, j + 1, true), Lf = () => edgePt(i, j, false);
        // Directed so the inside is on the right of travel (y down): outer loops run clockwise.
        const seg = (s, e) => next.set(s, e);
        const centre = (a + b + c + d) / 4;
        switch (code) {
          case 8: seg(T(), Lf()); break;
          case 4: seg(R(), T()); break;
          case 2: seg(Bt(), R()); break;
          case 1: seg(Lf(), Bt()); break;
          case 7: seg(Lf(), T()); break;
          case 11: seg(T(), R()); break;
          case 13: seg(R(), Bt()); break;
          case 14: seg(Bt(), Lf()); break;
          case 12: seg(R(), Lf()); break;
          case 6: seg(Bt(), T()); break;
          case 3: seg(Lf(), R()); break;
          case 9: seg(T(), Bt()); break;
          case 10: // a + c inside: joined through the centre (cut off b and d) or apart
            if (centre > 0) { seg(T(), R()); seg(Bt(), Lf()); } else { seg(T(), Lf()); seg(Bt(), R()); }
            break;
          case 5: // b + d inside: joined (cut off a and c) or apart
            if (centre > 0) { seg(Lf(), T()); seg(R(), Bt()); } else { seg(R(), T()); seg(Lf(), Bt()); }
            break;
        }
      }
    }
    const loops = [];
    const seen = new Set();
    for (const start of next.keys()) {
      if (seen.has(start)) continue;
      const pts = [];
      let cur = start, guard = 0;
      while (!seen.has(cur) && guard++ < 1e6) {
        seen.add(cur);
        const pt = pos.get(cur);
        pts.push(pt[0], pt[1]);
        cur = next.get(cur);
        if (cur === undefined) break;
      }
      if (pts.length >= 6) loops.push(pts);
    }
    return loops;
  }

  // The noise field depends only on the seed, Size and the frame's shape, so it's
  // cached in frame-relative units: Cover only re-thresholds it, and every export
  // size cuts exactly the same shapes as the preview.
  // o (General's Rotation and Size): the part of the world from (o.x, o.y), o.w x o.h (units of L), read
  // as finely on the screen as the frame (o.z: screen pixels per frame unit there)
  const fieldCache = new Map(), paperCache = new Map();
  function paperField(aw, ah, seed, size, o) {
    const key = [aw.toFixed(4), ah.toFixed(4), seed, size, o ? [o.x, o.y, o.w, o.h, o.z].join(',') : ''].join('|');
    const hit = fieldCache.get(key);
    if (hit) return hit;
    const g = o ? 1 / (K.grid * Math.min(1, o.z)) : 1 / K.grid, m = 3;
    const nx = Math.ceil((o ? o.w : aw) / g) + 2 * m, ny = Math.ceil((o ? o.h : ah) / g) + 2 * m;
    const x0 = (o ? o.x : 0) - m * g, y0 = (o ? o.y : 0) - m * g;
    const f = 1 / (K.lam0 + K.lamK * size);
    const N = PL.noise.get(seed ^ 0x3c6ef372);
    const A = new Float32Array((nx + 1) * (ny + 1));
    for (let j = 0; j <= ny; j++) {
      const v = (y0 + j * g) * f;
      for (let i = 0; i <= nx; i++) {
        const uu = (x0 + i * g) * f;
        const wx = N.fbm4(uu * 1.7 + 11.3, v * 1.7 - 4.1, 2.2, 0, 2, 0.5), wy = N.fbm4(uu * 1.7 - 7.9, v * 1.7 + 13.7, 5.5, 0, 2, 0.5);
        A[j * (nx + 1) + i] = N.fbm4(uu + K.warp * wx, v + K.warp * wy, 0.7, 0, K.oct, K.gain);
      }
    }
    const inside = [];
    for (let j = m; j <= ny - m; j++) for (let i = m; i <= nx - m; i++) inside.push(A[j * (nx + 1) + i]);
    const out = { A, nx, ny, x0, y0, g, sorted: Float32Array.from(inside).sort() };
    if (fieldCache.size > 8) fieldCache.delete(fieldCache.keys().next().value);
    fieldCache.set(key, out);
    return out;
  }

  // R (General's Rotation and Size): the paper over that part of the world, cut at the frame's own level
  function buildPaper(W, H, seed, p, R) {
    const L = Math.max(W, H);
    const o = R ? { x: R.x0 / L, y: R.y0 / L, w: (R.x1 - R.x0) / L, h: (R.y1 - R.y0) / L, z: R.z || 1 } : undefined;
    const key = [W / L, H / L, seed, p.cover, p.size, o ? [o.x, o.y, o.w, o.h, o.z].join(',') : ''].join('|');
    let base = paperCache.get(key);
    if (!base) {
      const { sorted } = paperField(W / L, H / L, seed, p.size);
      const F = paperField(W / L, H / L, seed, p.size, o);
      const { A, nx, ny, x0, y0, g } = F;
      const c = p.cover / 100;
      const cover = Math.min(0.999, c * (K.cover[0] + K.cover[1] * c) * (1 + 4 * c * (1 - c) * K.coverVar * (2 * hash(seed, 5, 41, 3) - 1)));
      const t = cover <= 0 ? Infinity : sorted[Math.max(0, Math.floor((1 - cover) * (sorted.length - 1)))];
      const v = new Float32Array(A.length);
      for (let k = 0; k < A.length; k++) v[k] = A[k] - t;
      for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
        if (i === 0 || j === 0 || i === nx || j === ny) v[j * (nx + 1) + i] = -1;
      }
      const sample = (x, y) => {
        let gx = (x - x0) / g, gy = (y - y0) / g;
        gx = Math.max(0, Math.min(nx - 1.001, gx)); gy = Math.max(0, Math.min(ny - 1.001, gy));
        const i = gx | 0, j = gy | 0, fx = gx - i, fy = gy - j, k = j * (nx + 1) + i;
        const a = v[k] + (v[k + 1] - v[k]) * fx, b = v[k + nx + 1] + (v[k + nx + 2] - v[k + nx + 1]) * fx;
        return a + (b - a) * fy;
      };
      base = { loops: Number.isFinite(t) ? contours(v, nx, ny, x0, y0, g) : [], inside: sample };
      if (paperCache.size > 12) paperCache.delete(paperCache.keys().next().value);
      paperCache.set(key, base);
    }
    return { loops: base.loops.map((c) => c.map((q) => q * L)), inside: (x, y) => base.inside(x / L, y / L) };
  }

  /* ---- build ------------------------------------------------------------------- */
  const treeCache = new Map();
  // region (General's Rotation and Size): the part of the world to cover (see buildTree and buildPaper)
  function build({ W, H, seed, p, colors, t = 0, anim, region }) {
    const n = colors.length;
    const sl = slots(n);
    const scene = new PL.Scene(W, H, colors[sl.ground], sl.ground);
    const L = Math.max(W, H);
    const shadow = p.shadow / 100;
    const ox = (K.shD0[0] + K.shD[0] * shadow) * L, oy = (K.shD0[1] + K.shD[1] * shadow) * L;
    const BLACK = '#000000';
    const offset = (pts, dx, dy) => pts.map((v, i) => (i & 1 ? v + dy : v + dx));

    const tkey = [W, H, seed, p.branches, p.spacing, p.spread, p.width, region ? [region.x0, region.y0, region.x1, region.y1].join(',') : ''].join('|');
    let tree = treeCache.get(tkey);
    if (!tree) {
      tree = buildTree(W, H, seed, p, region);
      if (treeCache.size > 12) treeCache.delete(treeCache.keys().next().value);
      treeCache.set(tkey, tree);
    }
    const { O, nodes, widthAt, baseAt } = tree;

    // Beneath: the chance a stretch of coral dives under the paper grows with every
    // split, so the limbs at the root mostly lie on top and the outer reaches mostly
    // underneath. Neighbours share the same slow random field, so they dive together.
    const under = new Uint8Array(nodes.length);
    {
      const keep = 1 - Math.min(1, Math.max(0, p.beneath / 100));
      for (const nd of nodes) if (nd && nd.wt > 0 && nd.du < 1 - Math.pow(keep, K.depthK * (nd.gen + 0.25))) under[nd.id] = 1;
    }

    // Layers, bottom to top: coral under the paper, the paper, coral on top.
    const G = K.groups;
    const branchInks = sl.branch;
    const ribA = K.ribA * Math.min(1, Math.max(0, (p.ribs - K.rib0) / (100 - K.rib0)));
    const groupsFor = (tag, label) => {
      const out = [];
      for (let g = 0; g < G; g++) {
        out.push({
          shadow: shadow > 0 ? scene.layer(`${tag}${g}-shadow`, BLACK, `Branch shadows${label} ${g + 1}`, undefined, K.shA * shadow) : null,
          body: branchInks.map((ci, b) => scene.layer(`${tag}${g}-body${b}`, colors[ci], `Branches${label} ${g + 1}` + (branchInks.length > 1 ? ` (${b + 1})` : ''), ci)),
          shade: shadow > 0 ? scene.layer(`${tag}${g}-shade`, BLACK, `Branch shading${label} ${g + 1}`, undefined, K.shadeA * shadow) : null,
          ribs: ribA > 0 ? scene.layer(`${tag}${g}-ribs`, colors[sl.ribs], `Ribs${label} ${g + 1}`, sl.ribs, ribA) : null,
        });
      }
      return out;
    };
    const below = groupsFor('u', ' under paper');

    // --- paper (static) ---------------------------------------------------------
    const paper = buildPaper(W, H, seed, p, region);
    if (paper.loops.length) {
      const shA = K.paperShA * shadow;
      if (shA > 0) { const sh = scene.layer('paper-shadow', BLACK, 'Paper shadow', undefined, shA); for (const c of paper.loops) sh.p.push(offset(c, ox * 1.25, oy * 1.25)); }
      const pl = scene.layer('paper', colors[sl.paper], 'Paper', sl.paper);
      for (const c of paper.loops) pl.p.push(c);
      if (p.dots > 0) {
        const dl = scene.layer('dots', colors[sl.dots], 'Dots', sl.dots);
        const dotP = K.dotP * L, dotR = K.dotK * (p.dots / 100) * dotP;
        const cols = Math.ceil(W / dotP) + 1, rows = Math.ceil(H / dotP) + 1;
        const i0 = region ? Math.floor(region.x0 / dotP) - 1 : 0, i1 = region ? Math.ceil(region.x1 / dotP) + 1 : cols;
        const j0 = region ? Math.floor(region.y0 / dotP) - 1 : 0, j1 = region ? Math.ceil(region.y1 / dotP) + 1 : rows;
        for (let j = j0; j < j1; j++) {
          const y = (j + 0.5) * dotP;
          for (let i = i0; i < i1; i++) {
            const x = (i + 0.5) * dotP;
            const v = paper.inside(x, y);
            if (v <= 0.006) continue;
            // Dots are biggest along the torn edges.
            const rr = dotR * (1 - K.dotIn * smooth(0.01, 0.16, v));
            if (rr > 0.05) dl.c.push(x, y, rr);
          }
        }
      }
    }
    const above = groupsFor('o', '');

    // --- branches ------------------------------------------------------------------
    const Nz = PL.noise.get(seed ^ 0x1f83d9ab);
    const wobA = (p.wobble / 100) * K.wob * L, wobF = 1 / (K.wobL * L);
    const wobAt = (x, y) => {
      const a = x * wobF, b = y * wobF;
      const qx = Nz.noise4(a * 1.3 + 5.2, b * 1.3 + 1.3, 1.7, 0), qy = Nz.noise4(a * 1.3 - 3.1, b * 1.3 + 7.7, 2.9, 0);
      return Nz.noise4(a + K.wobWarp * qx, b + K.wobWarp * qy, 0.3, 0);
    };
    const amt = Math.max(0, anim ? anim.amount : 0);
    const sw = amt * K.sway * L, tw = t * Math.PI * 2, kap = (Math.PI * 2) / (K.swayL * L);
    // Sway of a ribbon at radius r, including its ancestors' (segments carry the ones that grow from them).
    const swayAt = (nd, r) => {
      let s = 0;
      for (let q = nd; q; q = q.parent >= 0 ? nodes[q.parent] : null) {
        const env = q.parent < 0 ? smooth(0, K.swayIn * 1.4 * L, r) : smooth(q.r0, q.r0 + K.swayIn * L, r);
        if (env <= 0) continue;
        const x = q.ph - kap * (r - q.r0);
        s += env * (Math.sin(tw + x) - Math.sin(x));
      }
      return s * sw;
    };
    const dr = K.dr * L, per = (K.ribP0 + K.ribPK * p.spacing) * L, rw = K.ribW * per;
    const ribEnd = new Float64Array(nodes.length).fill(-1);
    // Angle about the root of a ribbon's centreline at radius r (wobble and sway included).
    const thetaAt = (nd, r) => {
      const base = baseAt(nd, r);
      const env = 1 - Math.exp(-r / (K.envR * L));
      let lat = wobA * env * wobAt(O[0] + r * Math.cos(base), O[1] + r * Math.sin(base));
      if (sw > 0) lat += swayAt(nd, r);
      return base + lat / r;
    };
    // Each ribbon's end (centre and normal), so the halves of a split start exactly beside it.
    const ends = new Float64Array(nodes.length * 4), hasEnd = new Uint8Array(nodes.length);
    const fixLen = 2 * tree.sp;
    const area = (pts) => { let a = 0; for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) a += pts[j] * pts[i + 1] - pts[i] * pts[j + 1]; return a; };
    for (const nd of nodes) {
      if (!nd) continue;
      const ov = nd.parent >= 0 ? nd.ov : 0;
      const ra = Math.max(nd.r0 - ov, 0.002 * L), rb = nd.r1;
      const len = rb - ra;
      if (len <= dr) continue;
      const steps = Math.max(2, Math.ceil(len / dr));
      const N = steps + 1;
      const P = new Float64Array(N * 2), Wd = new Float64Array(N);
      // A split half is nudged so it starts exactly beside its parent's end, in the parent's
      // own frame (the nudge fades out over a couple of spacings).
      let fx = 0, fy = 0;
      if (nd.parent >= 0 && hasEnd[nd.parent]) {
        const q = nd.parent * 4, th0 = thetaAt(nd, nd.r0);
        fx = ends[q] + ends[q + 2] * nd.lo - (O[0] + nd.r0 * Math.cos(th0));
        fy = ends[q + 1] + ends[q + 3] * nd.lo - (O[1] + nd.r0 * Math.sin(th0));
      }
      let k0 = 0; // first sample past the joint with the parent
      for (let k = 0; k < N; k++) {
        const r = ra + (len * k) / steps;
        if (r < nd.r0) k0 = k + 1;
        const th = thetaAt(nd, r);
        const fade = fx || fy ? 1 - smooth(nd.r0, nd.r0 + fixLen, r) : 0;
        P[2 * k] = O[0] + r * Math.cos(th) + fx * fade;
        P[2 * k + 1] = O[1] + r * Math.sin(th) + fy * fade;
        let w = widthAt(nd, r);
        if (nd.kind === 'point') { // tips taper to a point
          const tl = Math.min(0.12 * L, 0.6 * (nd.r1 - nd.r0)), into = r - (nd.r1 - tl);
          if (into > 0) w *= Math.pow(Math.max(0, 1 - into / tl), 0.8);
        }
        Wd[k] = w;
      }
      k0 = Math.min(k0, N - 2);
      // Edges, normals and arc length.
      const Lx = new Float64Array(N), Ly = new Float64Array(N), Rx = new Float64Array(N), Ry = new Float64Array(N), Sa = new Float64Array(N);
      const nxA = new Float64Array(N), nyA = new Float64Array(N);
      for (let k = 0; k < N; k++) {
        const ka = Math.max(0, k - 1), kb = Math.min(N - 1, k + 1);
        let tx = P[2 * kb] - P[2 * ka], ty = P[2 * kb + 1] - P[2 * ka + 1];
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl; ty /= tl;
        const nx = -ty, ny = tx;
        nxA[k] = nx; nyA[k] = ny;
        const hw = Wd[k] / 2;
        Lx[k] = P[2 * k] + nx * hw; Ly[k] = P[2 * k + 1] + ny * hw;
        Rx[k] = P[2 * k] - nx * hw; Ry[k] = P[2 * k + 1] - ny * hw;
        if (k > 0) Sa[k] = Sa[k - 1] + Math.hypot(P[2 * k] - P[2 * k - 2], P[2 * k + 1] - P[2 * k - 1]);
      }
      { const q = nd.id * 4; ends[q] = P[2 * N - 2]; ends[q + 1] = P[2 * N - 1]; ends[q + 2] = nxA[N - 1]; ends[q + 3] = nyA[N - 1]; hasEnd[nd.id] = 1; }
      // Outline: left edge out, the end cap, right edge back (oriented clockwise below).
      const cap = [];
      if (nd.kind === 'cut') { // an oblique cut across the end
        const k = N - 1, sk = nd.cutK * 1.4 * Wd[k];
        const tx = nyA[k], ty = -nxA[k];
        cap.push(Lx[k] + tx * sk, Ly[k] + ty * sk, Rx[k] - tx * sk, Ry[k] - ty * sk);
      } else if (nd.kind === 'round') { // a rounded end
        const k = N - 1, hw = Wd[k] / 2, fx = nyA[k], fy = -nxA[k];
        for (let j = 1; j < 8; j++) {
          const a = (j / 8) * Math.PI;
          cap.push(P[2 * k] + hw * (nxA[k] * Math.cos(a) + fx * Math.sin(a)), P[2 * k + 1] + hw * (nyA[k] * Math.cos(a) + fy * Math.sin(a)));
        }
      }
      const rawOutline = (ks, ke, dx, dy) => {
        const pts = [];
        for (let k = ks; k <= ke; k++) pts.push(Lx[k] + dx, Ly[k] + dy);
        if (ke === N - 1) for (let i = 0; i < cap.length; i += 2) pts.push(cap[i] + dx, cap[i + 1] + dy);
        for (let k = ke; k >= ks; k--) pts.push(Rx[k] + dx, Ry[k] + dy);
        return pts;
      };
      const outline = (ks, ke, dx, dy) => { const pts = rawOutline(ks, ke, dx, dy); return area(pts) > 0 ? pts : reverse(pts); };
      const dep = under[nd.id];
      const grp = (dep ? below : above)[nd.limb % G];
      const body = rawOutline(0, N - 1, 0, 0);
      const cw = area(body) > 0; // the ribs below follow the same winding
      grp.body[nd.limb % grp.body.length].p.push(cw ? body : reverse(body));
      // Drop shadow. Where a ribbon dives under the paper (or comes back up) its shadow
      // stops short of the joint, so the switch never shows as a dark seam on the ground.
      if (grp.shadow) {
        const trim = 1.5 * Math.hypot(ox, oy);
        const s0 = nd.parent >= 0 && under[nd.parent] !== dep ? Sa[k0] + trim : -1;
        const s1 = nd.kids.some((c) => under[c] !== dep) ? Sa[N - 1] - trim : Infinity;
        let ks = 0, ke = N - 1;
        while (ks < N - 1 && Sa[ks] < s0) ks++;
        while (ke > 0 && Sa[ke] > s1) ke--;
        if (ke > ks) grp.shadow.p.push(outline(ks, ke, ox, oy));
      }
      // Edge shading on the side turned away from the top-left light.
      if (grp.shade) {
        const sx = 0.543, sy = 0.84;
        const bandL = [], bandR = [];
        for (let k = k0; k < N; k++) bandL.push(Lx[k], Ly[k]);
        for (let k = N - 1; k >= k0; k--) {
          const kl = Math.max(0, nxA[k] * sx + nyA[k] * sy) * K.shadeW * Wd[k];
          bandL.push(Lx[k] - nxA[k] * kl, Ly[k] - nyA[k] * kl);
        }
        for (let k = k0; k < N; k++) bandR.push(Rx[k], Ry[k]);
        for (let k = N - 1; k >= k0; k--) {
          const kr = Math.max(0, -(nxA[k] * sx + nyA[k] * sy)) * K.shadeW * Wd[k];
          bandR.push(Rx[k] + nxA[k] * kr, Ry[k] + nyA[k] * kr);
        }
        grp.shade.p.push(area(bandL) >= 0 ? bandL : reverse(bandL), area(bandR) >= 0 ? bandR : reverse(bandR));
      }
      // Ribs: thin stripes across the ribbon, leaning a little; a split carries on its parent's rhythm.
      const total = Sa[N - 1], sj = Sa[k0];
      let first;
      if (nd.parent >= 0 && ribEnd[nd.parent] >= 0) first = sj + (per - ribEnd[nd.parent]);
      else first = (nd.parent >= 0 ? sj : 0.02 * L) + nd.ribPh * per;
      ribEnd[nd.id] = total >= first ? (total - first) % per : per - ((first - total) % per);
      if (grp.ribs) {
        let idx = 0;
        const edgeAt = (X, Y, s) => {
          while (idx < N - 2 && Sa[idx + 1] < s) idx++;
          while (idx > 0 && Sa[idx] > s) idx--;
          const span = Sa[idx + 1] - Sa[idx] || 1, f = Math.min(1, Math.max(0, (s - Sa[idx]) / span));
          return [X[idx] + (X[idx + 1] - X[idx]) * f, Y[idx] + (Y[idx + 1] - Y[idx]) * f];
        };
        // Over the joint with its parent a half only repeats the parent's ribs when it lies
        // on the other side of the paper (and so hides them); the rhythm carries straight on.
        const lo = nd.parent >= 0 && under[nd.parent] !== dep ? 0 : sj;
        let s = first;
        while (s - per + rw / 2 > lo) s -= per;
        for (; s - rw / 2 < total; s += per) {
          if (s + rw / 2 <= lo) continue;
          const wl = Wd[Math.max(0, Math.min(N - 1, Math.round((s / total) * (N - 1))))];
          const sk = Math.tan(nd.skew) * wl * 0.5;
          idx = 0;
          const a = edgeAt(Lx, Ly, s - rw / 2 + sk), b = edgeAt(Lx, Ly, s + rw / 2 + sk);
          idx = 0;
          const c = edgeAt(Rx, Ry, s + rw / 2 - sk), d = edgeAt(Rx, Ry, s - rw / 2 - sk);
          if (cw) grp.ribs.q.push(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]);
          else grp.ribs.q.push(a[0], a[1], d[0], d[1], c[0], c[1], b[0], b[1]);
        }
      }
    }
    return scene;
  }

  function reverse(pts) {
    const out = new Array(pts.length);
    for (let i = 0, j = pts.length - 2; j >= 0; i += 2, j -= 2) { out[i] = pts[j]; out[i + 1] = pts[j + 1]; }
    return out;
  }

  PL.tools.register({
    id: 'coral',
    name: 'Coral',
    kind: 'Backgrounds',
    tagline: 'Sea-fan textile',
    about: 'Ribbed coral branches fan out and split across a dark ground, passing under and over torn paper with a dot screen, with drop shadows and print grain.',
    inks: {
      min: 2, max: 8, roles, fit, spec, add, generate,
      span: () => 2, // Invert swaps the ground and the branch ink
      hint: 'Order sets the role: ground, branches, ribs, paper, then dots.',
    },
    palettes: PALETTES,
    params: PARAMS,
    defaults: {
      anim: { amount: 0.6, fps: 12, frames: 36 },
      fx: { grainOn: true, grainBlend: 'multiply', grain: 45, grainSize: 1, grainSpecks: 40, vignette: 30 },
      palette: 'Mono', // the preset the style opens on (its card's colors)
    },
    build,
    zoom: true, // draws any region of its world (General's Rotation and Size)
    stillGrain: true, // print grain sits in the paper: it holds still while the branches sway
    _K: K,
    _clear: () => { fieldCache.clear(); paperCache.clear(); treeCache.clear(); },
  });
})();
