/* ==========================================================================
   core/scene.js
   A tool describes its artwork as a Scene: a background colour plus ordered
   layers, one flat colour each (or one linear gradient), holding circles /
   rects / polygons, slices (a vertical strip cut out of a disc, with true
   arcs), stroked lines (polylines with their own width, round or butt ends)
   and type (characters of the built-in monospace font, PL.glyphs).
   The same Scene is drawn to canvas (preview, PNG, video) and written out as
   SVG — so the vector export always matches what you see.

   Winding: every shape is emitted clockwise (screen space) so overlapping
   shapes in one layer never punch holes in each other (nonzero fill rule).
   ========================================================================== */
PL.Scene = class Scene {
  // bgIndex: which palette entry the background uses (lets the app recolour a cached scene).
  constructor(W, H, bg, bgIndex = 0) {
    this.W = W;
    this.H = H;
    this.bg = bg;
    this.bgIndex = bgIndex;
    this.layers = [];
    this._byKey = new Map();
  }

  // Get (or create, in draw order) a layer. `name` becomes the SVG/Figma layer name.
  // `ci` (optional) = palette index of this layer's colour, for instant recolouring.
  // `opacity` (optional, 0-1) prints the layer as a translucent ink (shadows, overprints).
  layer(key, fill, name, ci, opacity = 1) {
    let L = this._byKey.get(key);
    if (!L) {
      L = { key, name: name || key, fill, ci, opacity, cap: 'round', c: [], r: [], q: [], p: [], k: [], s: [], sl: [], g: [], gs: 0 };
      this._byKey.set(key, L);
      this.layers.push(L);
    }
    return L;
  }

  // Layer storage (flat arrays keep big scenes fast):
  //   c: circles [x, y, r, …]   r: rects [x, y, w, h, …]
  //   q: quads [x0, y0, x1, y1, x2, y2, x3, y3, …]   p: polygons [[x0, y0, x1, y1, …], …]
  //   k: capsules [ax, ay, ra, bx, by, rb, …] — a round-ended stroke from A to B that can taper
  //      (ra != rb). One path each, so they draw fast and stay tidy in SVG.
  //   s: strokes [{ pts: [x0, y0, x1, y1, …], w, closed }, …] — lines of width w, drawn with the
  //      layer's `cap` ('round' or 'butt') and round joins; they stay real strokes in SVG.
  //   sl: slices [x0, x1, cx, cy, r, …] — the part of the disc (cx, cy, r) between x0 and x1:
  //      straight sides, true arcs top and bottom (exact in SVG too).
  //   g: type [ch, x, y, …] — characters of PL.glyphs at the layer's size gs (px per em), each
  //      with its left edge at x and its baseline at y, outlined gw px thicker if the layer says so.
  //      One <use> each in SVG (outlines, no fonts).
  static circle(L, x, y, r) { L.c.push(x, y, r); }
  static capsule(L, ax, ay, ra, bx, by, rb) {
    const d = Math.hypot(bx - ax, by - ay);
    if (d <= Math.abs(rb - ra) + 1e-6) { if (ra > rb) L.c.push(ax, ay, ra); else L.c.push(bx, by, rb); return; }
    L.k.push(ax, ay, ra, bx, by, rb);
  }
  static rect(L, x, y, w, h) { L.r.push(x, y, w, h); }
  static quad(L, x0, y0, x1, y1, x2, y2, x3, y3) { L.q.push(x0, y0, x1, y1, x2, y2, x3, y3); }
  static poly(L, pts) { L.p.push(pts); }
  static stroke(L, pts, w, closed = false) { if (pts.length >= 4 && w > 0) L.s.push({ pts, w, closed }); }
  static slice(L, x0, x1, cx, cy, r) { if (r > 0 && Math.min(x1, cx + r) > Math.max(x0, cx - r)) L.sl.push(x0, x1, cx, cy, r); }
  static glyph(L, ch, x, y, size) { if (PL.glyphs && PL.glyphs.has(ch)) { L.g.push(ch, x, y); L.gs = size; } }
  // A linear gradient fill for the whole layer, from colour c0 at (x0, y0) to c1 at (x1, y1)
  // (scene coordinates). ci0 / ci1: palette indices of the two colours, for recolouring.
  static gradient(L, x0, y0, x1, y1, c0, c1, ci0, ci1) { L.grad = { x0, y0, x1, y1, stops: [c0, c1], ci: [ci0, ci1] }; L.fill = c0; }
};

PL.render = (() => {
  const TAU = Math.PI * 2;
  const CHUNK = 1024; // flush paths regularly: many small fills rasterize much faster than one huge path

  // A slice's outline: its left and right x (clamped to the disc) and the angles of its
  // corners. The top arc runs from -ta to -tb and the bottom one from tb to ta (clockwise).
  function sliceGeom(sl, i) {
    const cx = sl[i + 2], cy = sl[i + 3], r = sl[i + 4];
    const a = Math.max(sl[i], cx - r), b = Math.min(sl[i + 1], cx + r);
    const ta = Math.acos(Math.max(-1, Math.min(1, (a - cx) / r))), tb = Math.acos(Math.max(-1, Math.min(1, (b - cx) / r)));
    return { cx, cy, r, a, b, ta, tb };
  }

  /* Type stamps. Thousands of small characters (Atlas with many Columns) draw far faster as masks
     blended in by hand than as a fill and an outline each. Every character is rasterised once per
     size at each quarter-pixel offset, exactly as the direct path would draw it there (dark type as
     black on white, light type as white on black: the browser rounds thin outlines a little toward
     the darker colour), and then copied into place in the layer's colour (positions rounded to the
     nearest quarter pixel, so it matches the direct drawing within 1/8 px). Big type, or a few
     characters, are drawn directly. */
  const STAMP = { q: 4, min: 1200, maxPx: 40 }; // offsets per px; from how many characters; up to what size (px per em)
  const stampSets = new Map(); // size|outline|dark -> Map(char|fx|fy -> { a, w, h, dx, dy })
  const glyphBoxes = new Map();
  let stampCtx = null;
  // a glyph's box in font units (y up), from its outline's points
  function glyphBox(ch) {
    let b = glyphBoxes.get(ch);
    if (!b) {
      const v = (PL.glyphs.d(ch).match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
      b = [Infinity, Infinity, -Infinity, -Infinity];
      for (let k = 0; k + 1 < v.length; k += 2) {
        if (v[k] < b[0]) b[0] = v[k];
        if (v[k] > b[2]) b[2] = v[k];
        if (v[k + 1] < b[1]) b[1] = v[k + 1];
        if (v[k + 1] > b[3]) b[3] = v[k + 1];
      }
      if (!(b[2] >= b[0])) b = [0, 0, 0, 0];
      glyphBoxes.set(ch, b);
    }
    return b;
  }
  function makeStamp(ch, s, ow, fx, fy, dark) {
    const [x0, y0, x1, y1] = glyphBox(ch), Q = STAMP.q, pad = Math.ceil(ow) + 2;
    const bx = Math.floor(x0 * s) - pad, by = Math.floor(-y1 * s) - pad; // the stamp's corner, from the character's pixel
    const w = Math.ceil(x1 * s) + pad + 1 - bx, h = Math.ceil(-y0 * s) + pad + 1 - by;
    if (!stampCtx) stampCtx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const cv = stampCtx.canvas;
    if (cv.width < w || cv.height < h) { cv.width = Math.max(cv.width, w); cv.height = Math.max(cv.height, h); }
    const x = stampCtx;
    // on an opaque ground, like the type: the red channel gives the ink's coverage
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.fillStyle = dark ? '#fff' : '#000';
    x.fillRect(0, 0, w, h);
    x.fillStyle = x.strokeStyle = dark ? '#000' : '#fff';
    x.setTransform(s, 0, 0, -s, -bx + fx / Q, -by + fy / Q);
    const P = PL.glyphs.path(ch);
    x.fill(P);
    if (ow > 0) { x.lineWidth = ow / s; x.lineJoin = 'round'; x.stroke(P); }
    const d = x.getImageData(0, 0, w, h).data;
    if (dark) for (let i = 0; i < d.length; i += 4) d[i] = 255 - d[i];
    // trim to the inked pixels
    let l = w, r = -1, t = h, b = -1;
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if (d[(yy * w + xx) * 4]) { if (xx < l) l = xx; if (xx > r) r = xx; if (yy < t) t = yy; if (yy > b) b = yy; }
    if (r < 0) return { a: new Uint8Array(0), w: 0, h: 0, dx: 0, dy: 0 };
    const sw = r - l + 1, sh = b - t + 1, a = new Uint8Array(sw * sh);
    for (let yy = 0; yy < sh; yy++) for (let xx = 0; xx < sw; xx++) a[yy * sw + xx] = d[((yy + t) * w + xx + l) * 4];
    return { a, w: sw, h: sh, dx: bx + l, dy: by + t };
  }
  // Draw a type layer by stamping; false (nothing drawn) when the direct path suits it better.
  function stampType(ctx, L) {
    const G = L.g, n = G.length / 3, cv = ctx.canvas;
    if (n < STAMP.min || L.grad || !cv || typeof document === 'undefined') return false;
    const m = ctx.getTransform();
    if (m.b !== 0 || m.c !== 0 || !(m.a > 0) || Math.abs(m.a - m.d) > 1e-9) return false;
    const Fd = L.gs * m.a; // px per em on the canvas
    if (!(Fd > 0) || Fd > STAMP.maxPx) return false;
    const c = PL.color && PL.color.normHex ? PL.color.normHex(L.fill) : L.fill;
    const R = parseInt(c.slice(1, 3), 16), Gc = parseInt(c.slice(3, 5), 16), B = parseInt(c.slice(5, 7), 16);
    if (!(R >= 0 && Gc >= 0 && B >= 0)) return false;
    const dark = R * 0.299 + Gc * 0.587 + B * 0.114 < 128;
    const s = Fd / PL.glyphs.UPM, ow = L.gw > 0 ? L.gw * m.a : 0, Q = STAMP.q;
    const key = Fd.toFixed(5) + '|' + ow.toFixed(5) + '|' + dark;
    let set = stampSets.get(key);
    if (!set) {
      if (stampSets.size >= 6) stampSets.delete(stampSets.keys().next().value);
      set = new Map();
      stampSets.set(key, set);
    }
    // where the characters land, and the pixels they can touch
    const CW = cv.width, CH = cv.height, pos = new Int32Array(n * 3);
    let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
    for (let k = 0; k < n; k++) {
      const qx = Math.round((m.a * G[k * 3 + 1] + m.e) * Q), qy = Math.round((m.d * G[k * 3 + 2] + m.f) * Q);
      pos[k * 3] = qx; pos[k * 3 + 1] = qy;
      if (qx < X0) X0 = qx; if (qx > X1) X1 = qx; if (qy < Y0) Y0 = qy; if (qy > Y1) Y1 = qy;
    }
    const reach = Math.ceil(Fd * 1.6 + ow) + 4;
    const rx = Math.max(0, Math.floor(X0 / Q) - reach), ry = Math.max(0, Math.floor(Y0 / Q) - reach);
    const rw = Math.min(CW, Math.ceil(X1 / Q) + reach) - rx, rh = Math.min(CH, Math.ceil(Y1 / Q) + reach) - ry;
    if (rw <= 0 || rh <= 0) return true;
    const img = ctx.getImageData(rx, ry, rw, rh), d = img.data;
    const op = L.opacity == null ? 1 : L.opacity;
    for (let k = 0; k < n; k++) {
      const ch = G[k * 3], qx = pos[k * 3], qy = pos[k * 3 + 1];
      const ix = Math.floor(qx / Q), iy = Math.floor(qy / Q), fx = qx - ix * Q, fy = qy - iy * Q;
      const sk = ch + '|' + fx + '|' + fy;
      let st = set.get(sk);
      if (!st) { st = makeStamp(ch, s, ow, fx, fy, dark); set.set(sk, st); }
      if (!st.w) continue;
      const sx = ix + st.dx - rx, sy = iy + st.dy - ry, a = st.a;
      const xa = Math.max(0, -sx), xb = Math.min(st.w, rw - sx), ya = Math.max(0, -sy), yb = Math.min(st.h, rh - sy);
      for (let yy = ya; yy < yb; yy++) {
        let o = ((sy + yy) * rw + sx + xa) * 4, p = yy * st.w + xa;
        for (let xx = xa; xx < xb; xx++, o += 4, p++) {
          const av = a[p];
          if (!av) continue;
          const al = op === 1 ? av / 255 : (av / 255) * op, da = d[o + 3];
          if (da === 255) {
            d[o] += (R - d[o]) * al; d[o + 1] += (Gc - d[o + 1]) * al; d[o + 2] += (B - d[o + 2]) * al; // (the clamped array rounds)
          } else {
            // over a see-through pixel: the usual "over" blend of two translucent colours
            const db = da / 255, oa = al + db * (1 - al);
            if (oa <= 0) continue;
            d[o] = (R * al + d[o] * db * (1 - al)) / oa; d[o + 1] = (Gc * al + d[o + 1] * db * (1 - al)) / oa; d[o + 2] = (B * al + d[o + 2] * db * (1 - al)) / oa;
            d[o + 3] = oa * 255;
          }
        }
      }
    }
    ctx.putImageData(img, rx, ry);
    return true;
  }

  // ground: false draws the shapes only, over what is there (General's Rotation and Size lay the ground
  // over the whole frame first, then draw the shapes turned and zoomed)
  function drawScene(ctx, scene, { transparent = false, scale = 1, ground = true } = {}) {
    const { W, H } = scene;
    ctx.save();
    if (scale !== 1) ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (!ground) { /* the shapes only */ }
    else if (transparent || !scene.bg) ctx.clearRect(0, 0, W, H);
    else {
      ctx.fillStyle = scene.bg;
      ctx.fillRect(0, 0, W, H);
    }
    for (const L of scene.layers) {
      if (L.grad) {
        const g = ctx.createLinearGradient(L.grad.x0, L.grad.y0, L.grad.x1, L.grad.y1);
        g.addColorStop(0, L.grad.stops[0]);
        g.addColorStop(1, L.grad.stops[1]);
        ctx.fillStyle = g;
      } else ctx.fillStyle = L.fill;
      ctx.globalAlpha = L.opacity == null ? 1 : L.opacity;
      let n = 0;
      ctx.beginPath();
      const c = L.c;
      for (let i = 0; i < c.length; i += 3) {
        const x = c[i], y = c[i + 1], r = c[i + 2];
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, TAU);
        if (++n === CHUNK) { ctx.fill(); ctx.beginPath(); n = 0; }
      }
      const q = L.r;
      for (let i = 0; i < q.length; i += 4) {
        ctx.rect(q[i], q[i + 1], q[i + 2], q[i + 3]);
        if (++n === CHUNK) { ctx.fill(); ctx.beginPath(); n = 0; }
      }
      const u = L.q;
      for (let i = 0; i < u.length; i += 8) {
        ctx.moveTo(u[i], u[i + 1]);
        ctx.lineTo(u[i + 2], u[i + 3]);
        ctx.lineTo(u[i + 4], u[i + 5]);
        ctx.lineTo(u[i + 6], u[i + 7]); // no closePath(): fill() closes subpaths, and it's far faster
        if (++n === CHUNK) { ctx.fill(); ctx.beginPath(); n = 0; }
      }
      for (const pts of L.p) {
        ctx.moveTo(pts[0], pts[1]);
        for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1]);
        if (++n === CHUNK) { ctx.fill(); ctx.beginPath(); n = 0; }
      }
      const kk = L.k;
      for (let i = 0; i < kk.length; i += 6) {
        // Outline, clockwise: tangent on A -> tangent on B, round the far end of B,
        // back along the other tangent, round the back of A.
        const ax = kk[i], ay = kk[i + 1], ra = kk[i + 2], bx = kk[i + 3], by = kk[i + 4], rb = kk[i + 5];
        const al = Math.atan2(by - ay, bx - ax), th = Math.acos(Math.max(-1, Math.min(1, (ra - rb) / Math.hypot(bx - ax, by - ay))));
        ctx.moveTo(ax + ra * Math.cos(al - th), ay + ra * Math.sin(al - th));
        ctx.arc(bx, by, rb, al - th, al + th, false);
        ctx.arc(ax, ay, ra, al + th, al - th + TAU, false);
        if (++n === CHUNK) { ctx.fill(); ctx.beginPath(); n = 0; }
      }
      const sl = L.sl || [];
      for (let i = 0; i < sl.length; i += 5) {
        const g = sliceGeom(sl, i);
        ctx.moveTo(g.a, g.cy - g.r * Math.sin(g.ta));
        ctx.arc(g.cx, g.cy, g.r, -g.ta, -g.tb, false);
        ctx.arc(g.cx, g.cy, g.r, g.tb, g.ta, false);
        if (++n === CHUNK) { ctx.fill(); ctx.beginPath(); n = 0; }
      }
      ctx.fill();
      // Type: every character its own small fill, placed by the transform (font units, y up);
      // lots of small type is stamped in instead (the same pixels, far faster).
      const G = L.g;
      if (G && G.length && PL.glyphs && !stampType(ctx, L)) {
        const m = ctx.getTransform(), s = L.gs / PL.glyphs.UPM;
        // L.gw: a thin outline round each character, in px (small type reads like the browser's own text)
        const gw = L.gw > 0 ? L.gw / s : 0;
        if (gw) { ctx.strokeStyle = L.fill; ctx.lineWidth = gw; ctx.lineJoin = 'round'; }
        for (let i = 0; i < G.length; i += 3) {
          const P = PL.glyphs.path(G[i]);
          if (!P) continue;
          const x = G[i + 1], y = G[i + 2];
          ctx.setTransform(m.a * s, m.b * s, -m.c * s, -m.d * s, m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f);
          ctx.fill(P);
          if (gw) ctx.stroke(P);
        }
        ctx.setTransform(m);
      }
      // Strokes: consecutive lines of the same width share one path.
      const st = L.s;
      if (st && st.length) {
        ctx.strokeStyle = L.fill;
        ctx.lineCap = L.cap || 'round';
        ctx.lineJoin = 'round';
        let w = -1, m = 0;
        for (const S of st) {
          if (S.w !== w || m === CHUNK) {
            if (m) ctx.stroke();
            ctx.beginPath();
            m = 0;
            w = S.w;
            ctx.lineWidth = w;
          }
          const p = S.pts;
          ctx.moveTo(p[0], p[1]);
          for (let k = 2; k < p.length; k += 2) ctx.lineTo(p[k], p[k + 1]);
          if (S.closed) ctx.closePath();
          m++;
        }
        if (m) ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Compact number formatting for SVG (2 decimals, no trailing zeros).
  const f = (v) => {
    const s = (Math.round(v * 100) / 100).toString();
    return s === '-0' ? '0' : s;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  // One <path> per colour layer — tiny files, and Figma/Illustrator get tidy named layers.
  function sceneToSVG(scene, { transparent = false, title = '' } = {}) {
    const { W, H } = scene;
    const out = [];
    const typed = scene.layers.some((L) => L.g && L.g.length);
    out.push(`<svg xmlns="http://www.w3.org/2000/svg"${typed ? ' xmlns:xlink="http://www.w3.org/1999/xlink"' : ''} width="${f(W)}" height="${f(H)}" viewBox="0 0 ${f(W)} ${f(H)}">`);
    if (title) out.push(`<title>${esc(title)}</title>`);
    // Type: each character used is defined once (its outline at its size) and placed with <use>.
    const gid = new Map();
    if (typed) {
      const defs = [];
      for (const L of scene.layers) {
        const G = L.g || [];
        for (let i = 0; i < G.length; i += 3) {
          const key = G[i] + '|' + L.gs;
          if (gid.has(key)) continue;
          const id = `glyph-${G[i].codePointAt(0).toString(16)}${gid.size ? '-' + gid.size : ''}`;
          gid.set(key, id);
          const s = L.gs / PL.glyphs.UPM;
          defs.push(`<path id="${id}" transform="scale(${+s.toFixed(6)} ${-s.toFixed(6)})" d="${PL.glyphs.d(G[i])}"/>`);
        }
      }
      out.push(`<defs>${defs.join('')}</defs>`);
    }
    if (!transparent && scene.bg) out.push(`<rect id="background" width="${f(W)}" height="${f(H)}" fill="${scene.bg}"/>`);
    const used = new Set(['background']);
    const uid = (id) => { let u = id, k = 2; while (used.has(u)) u = `${id}-${k++}`; used.add(u); return u; };
    for (const L of scene.layers) {
      const d = [];
      const c = L.c;
      for (let i = 0; i < c.length; i += 3) {
        const x = c[i], y = c[i + 1], r = c[i + 2];
        // Two clockwise half-arcs = full clockwise circle.
        d.push(`M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 1 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 1 ${f(-2 * r)} 0z`);
      }
      const q = L.r;
      for (let i = 0; i < q.length; i += 4) {
        d.push(`M${f(q[i])} ${f(q[i + 1])}h${f(q[i + 2])}v${f(q[i + 3])}h${f(-q[i + 2])}z`);
      }
      const u = L.q;
      for (let i = 0; i < u.length; i += 8) {
        d.push(`M${f(u[i])} ${f(u[i + 1])}L${f(u[i + 2])} ${f(u[i + 3])}L${f(u[i + 4])} ${f(u[i + 5])}L${f(u[i + 6])} ${f(u[i + 7])}z`);
      }
      for (const pts of L.p) {
        let s = `M${f(pts[0])} ${f(pts[1])}`;
        for (let k = 2; k < pts.length; k += 2) s += `L${f(pts[k])} ${f(pts[k + 1])}`;
        d.push(s + 'z');
      }
      const kk = L.k;
      for (let i = 0; i < kk.length; i += 6) {
        const ax = kk[i], ay = kk[i + 1], ra = kk[i + 2], bx = kk[i + 3], by = kk[i + 4], rb = kk[i + 5];
        const al = Math.atan2(by - ay, bx - ax), th = Math.acos(Math.max(-1, Math.min(1, (ra - rb) / Math.hypot(bx - ax, by - ay))));
        const p1x = ax + ra * Math.cos(al - th), p1y = ay + ra * Math.sin(al - th);
        const p2x = bx + rb * Math.cos(al - th), p2y = by + rb * Math.sin(al - th);
        const p3x = bx + rb * Math.cos(al + th), p3y = by + rb * Math.sin(al + th);
        const p4x = ax + ra * Math.cos(al + th), p4y = ay + ra * Math.sin(al + th);
        // sweep 1 = clockwise on screen; the arc round B spans 2*th, the one round A the rest.
        d.push(`M${f(p1x)} ${f(p1y)}L${f(p2x)} ${f(p2y)}A${f(rb)} ${f(rb)} 0 ${2 * th > Math.PI ? 1 : 0} 1 ${f(p3x)} ${f(p3y)}L${f(p4x)} ${f(p4y)}A${f(ra)} ${f(ra)} 0 ${2 * th < Math.PI ? 1 : 0} 1 ${f(p1x)} ${f(p1y)}z`);
      }
      const sl = L.sl || [];
      for (let i = 0; i < sl.length; i += 5) {
        const g = sliceGeom(sl, i);
        const P = (t) => `${f(g.cx + g.r * Math.cos(t))} ${f(g.cy + g.r * Math.sin(t))}`;
        // clockwise arc from angle t0 to t1, in two halves when it nears a half circle
        const arc = (t0, t1) => (t1 - t0 > 0.9 * Math.PI
          ? `A${f(g.r)} ${f(g.r)} 0 0 1 ${P((t0 + t1) / 2)}A${f(g.r)} ${f(g.r)} 0 0 1 ${P(t1)}`
          : `A${f(g.r)} ${f(g.r)} 0 0 1 ${P(t1)}`);
        d.push(`M${P(-g.ta)}${arc(-g.ta, -g.tb)}L${P(g.tb)}${arc(g.tb, g.ta)}z`);
      }
      const st = L.s || [];
      const G = L.g || [];
      if (!d.length && !st.length && !G.length) continue;
      const id = uid(String(L.name).toLowerCase().replace(/[^a-z0-9]+/g, '-'));
      const a = L.opacity != null && L.opacity < 1 ? Math.round(L.opacity * 1000) / 1000 : null;
      let fill = L.fill;
      if (L.grad && d.length) {
        // a real gradient (editable in Figma / Illustrator), in scene coordinates like the canvas
        const gid = uid(id + '-gradient'), G = L.grad;
        out.push(`<defs><linearGradient id="${esc(gid)}" gradientUnits="userSpaceOnUse" x1="${f(G.x0)}" y1="${f(G.y0)}" x2="${f(G.x1)}" y2="${f(G.y1)}"><stop offset="0" stop-color="${G.stops[0]}"/><stop offset="1" stop-color="${G.stops[1]}"/></linearGradient></defs>`);
        fill = `url(#${gid})`;
      }
      if (d.length) out.push(`<path id="${esc(id)}" fill="${fill}"${a != null ? ` fill-opacity="${a}"` : ''} d="${d.join('')}"/>`);
      if (st.length) {
        // A group of real strokes (editable lines in Figma / Illustrator), one path per line width.
        out.push(`<g id="${esc(d.length ? uid(id + '-lines') : id)}" fill="none" stroke="${L.fill}" stroke-linecap="${L.cap || 'round'}" stroke-linejoin="round"${a != null ? ` stroke-opacity="${a}"` : ''}>`);
        let w = null, buf = [];
        const flush = () => { if (buf.length) out.push(`<path stroke-width="${f(w)}" d="${buf.join('')}"/>`); buf = []; };
        for (const S of st) {
          if (S.w !== w) { flush(); w = S.w; }
          const p = S.pts;
          let s = `M${f(p[0])} ${f(p[1])}`;
          for (let k = 2; k < p.length; k += 2) s += `L${f(p[k])} ${f(p[k + 1])}`;
          buf.push(S.closed ? s + 'z' : s);
        }
        flush();
        out.push('</g>');
      }
      if (G.length) {
        // type: one group per colour, a <use> per character (outlines, so no font is needed)
        const sw = L.gw > 0 ? +(L.gw / (L.gs / PL.glyphs.UPM)).toFixed(2) : 0;
        out.push(`<g id="${esc(d.length || st.length ? uid(id + '-type') : id)}" fill="${L.fill}"${a != null ? ` fill-opacity="${a}"` : ''}${sw ? ` stroke="${L.fill}" stroke-width="${sw}" stroke-linejoin="round"` : ''}>`);
        for (let i = 0; i < G.length; i += 3) out.push(`<use xlink:href="#${gid.get(G[i] + '|' + L.gs)}" x="${f(G[i + 1])}" y="${f(G[i + 2])}"/>`);
        out.push('</g>');
      }
    }
    out.push('</svg>');
    return out.join('\n');
  }

  // Swap colours on an already-built scene (geometry unchanged) — used by the render cache.
  function recolor(scene, colors) {
    if (scene.bgIndex != null && colors[scene.bgIndex]) scene.bg = colors[scene.bgIndex];
    for (const L of scene.layers) {
      if (L.ci != null && colors[L.ci]) L.fill = colors[L.ci];
      if (L.grad && L.grad.ci) L.grad.ci.forEach((ci, k) => { if (ci != null && colors[ci]) L.grad.stops[k] = colors[ci]; });
    }
    return scene;
  }

  function countShapes(scene) {
    let n = 0;
    for (const L of scene.layers) n += L.c.length / 3 + L.r.length / 4 + L.q.length / 8 + L.p.length + (L.k ? L.k.length / 6 : 0) + (L.s ? L.s.length : 0) + (L.sl ? L.sl.length / 5 : 0) + (L.g ? L.g.length / 3 : 0);
    return n;
  }

  return { drawScene, sceneToSVG, countShapes, recolor, _stamp: STAMP };
})();
