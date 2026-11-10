/* ==========================================================================
   ui/app.js — the app shell: tool switching, controls, color, effects,
   animation, history, kept variations, exports and the library.
   Every tool registered in PL.tools gets all of this for free.
   ========================================================================== */
PL.app = (() => {
  'use strict';

  // Captured before the UI touches the DOM — "Save app copy" rewrites only the user-data block.
  const PRISTINE = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;

  /* ---------------------------------------------------------------- helpers */
  const $ = (sel, root = document) => root.querySelector(sel);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const deep = (o) => JSON.parse(JSON.stringify(o));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  const ICONS = {
    back: '<path d="M10 3.5 5.5 8l4.5 4.5"/>',
    fwd: '<path d="M6 3.5 10.5 8 6 12.5"/>',
    dice: '<rect x="2.5" y="2.5" width="11" height="11" rx="2.6"/><circle cx="5.6" cy="5.6" r=".95" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r=".95" fill="currentColor" stroke="none"/><circle cx="10.4" cy="10.4" r=".95" fill="currentColor" stroke="none"/>',
    shuffle: '<path d="M2 4.5h2.2c3.3 0 4.3 7 7.6 7H14"/><path d="m12 9.5 2 2-2 2"/><path d="M2 11.5h2.2c1.3 0 2.2-1 3-2.4M9 6.5c.7-1.2 1.6-2 2.8-2H14"/><path d="m12 2.5 2 2-2 2"/>',
    drop: '<path d="M8 2.2s4.6 4.7 4.6 7.7a4.6 4.6 0 0 1-9.2 0C3.4 6.9 8 2.2 8 2.2z"/>',
    play: '<path d="M5 3.3v9.4L12.6 8z" fill="currentColor"/>',
    pause: '<path d="M5 3.5v9M11 3.5v9" stroke-width="2.2"/>',
    keep: '<path d="M4 2.5h8v11l-4-2.8-4 2.8z"/>',
    down: '<path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10"/>',
    copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.6"/><path d="M10.5 3.5v-.3c0-.7-.5-1.2-1.2-1.2H3.7c-.7 0-1.2.5-1.2 1.2v5.6c0 .7.5 1.2 1.2 1.2h.3"/>',
    chev: '<path d="m4 6 4 4 4-4"/>',
    reset: '<path d="M3 8a5 5 0 1 0 1.6-3.7"/><path d="M3 2.6V5h2.4"/>',
    lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7"/>',
    unlock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5.2a2.5 2.5 0 0 1 4.8-1"/>',
    rotate: '<path d="M13 8a5 5 0 1 1-1.6-3.7"/><path d="M13 2.6V5h-2.4"/>',
    invert: '<circle cx="8" cy="8" r="5.5"/><path d="M8 2.5v11A5.5 5.5 0 0 0 8 2.5z" fill="currentColor"/>',
    video: '<rect x="2" y="4" width="9" height="8" rx="1.6"/><path d="m11 7 3-1.8v5.6L11 9"/>',
    file: '<path d="M4 2.5h5l3 3v8H4z"/><path d="M9 2.5v3h3"/>',
    upload: '<path d="M8 10.5v-8M4.5 6 8 2.5 11.5 6M3 13.5h10"/>',
    x: '<path d="M4.6 4.6l6.8 6.8M11.4 4.6l-6.8 6.8" stroke-width="1.8"/>',
    plus: '<path d="M8 3v10M3 8h10"/>',
    search: '<circle cx="7" cy="7" r="4.3"/><path d="M10.2 10.2 13.4 13.4"/>',
    moon: '<path d="M13.3 9.7A5.6 5.6 0 0 1 6.3 2.7a5.6 5.6 0 1 0 7 7z"/>',
    sun: '<circle cx="8" cy="8" r="2.9"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/>',
  };
  const icon = (name) => {
    const s = document.createElement('span');
    s.style.display = 'inline-flex';
    s.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
    return s;
  };

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  let toastTimer = 0;
  function toast(msg, kind) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast show' + (kind === 'err' ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.className = 'toast' + (kind === 'err' ? ' err' : '')), kind === 'err' ? 4200 : 2600);
  }

  const modal = {
    open(nodes) {
      const box = $('#modalBox');
      box.replaceChildren(...nodes);
      $('#modal').classList.add('show');
    },
    close() { $('#modal').classList.remove('show'); },
    get isOpen() { return $('#modal').classList.contains('show'); },
  };
  $('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal' && !recording) modal.close(); });

  /* -------------------------------------------------------------- constants */
  const RATIOS = [
    ['1:1', 1, 1, 'Square 1:1'], ['4:5', 4, 5, 'Portrait 4:5'], ['3:4', 3, 4, 'Portrait 3:4'], ['2:3', 2, 3, 'Portrait 2:3'],
    ['9:16', 9, 16, 'Story 9:16'], ['5:4', 5, 4, 'Landscape 5:4'], ['4:3', 4, 3, 'Landscape 4:3'], ['3:2', 3, 2, 'Landscape 3:2'],
    ['16:9', 16, 9, 'Wide 16:9'], ['2:1', 2, 1, 'Wide 2:1'], ['4:1', 4, 1, 'Banner 4:1'], ['custom', 0, 0, 'Custom size…'],
  ];
  const SIZES = [1080, 1600, 2048, 3000, 4096];
  const MAX_AREA = 16777216; // Safari's canvas limit (4096 x 4096)
  const OUTPUT_DEFAULTS = { ratio: '1:1', size: 2048, cw: 1584, ch: 396, render: 'smooth', transparent: false, videoSize: 1080, loops: 3 };
  const FIRST_SEEDS = { sonar: 642061, culture: 9, cipher: 5, dahlia: 7, coral: 3, whorl: 13, splice: 31, filament: 24, stipple: 654102, rise: 1, prism: 103116, motley: 386649, warp: 1, stitch: 25, quilt: 12, modular: 414828, husk: 2, mist: 3, atlas: 1420, strand: 8, sear: 20, crowd: 10, aura: 2 };
  const firstSeed = (id) => FIRST_SEEDS[id] || 1; // the seed of each tool's default look

  /* -------------------------------------------------------------- user data */
  let userData = { palettes: [], kept: [], states: {} };
  try {
    const raw = ($('#pl-user-data').textContent || '').trim();
    if (raw && raw !== '{}') {
      const d = JSON.parse(raw);
      userData.palettes = Array.isArray(d.palettes) ? d.palettes : [];
      userData.kept = Array.isArray(d.kept) ? d.kept : [];
      userData.states = d.states && typeof d.states === 'object' ? d.states : {};
    }
  } catch (e) {
    console.warn('Could not read saved library', e);
  }
  let libraryDirty = false;
  const markDirty = () => { libraryDirty = true; updateLibraryBadge(); };
  window.addEventListener('beforeunload', (e) => {
    if (libraryDirty) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ------------------------------------------------------------------ state */
  // the preset a style opens on (its defaults name one; else its first) and the General view it opens at
  const defaultPalette = (tl) => (tl.defaults.palette && tl.palettes.find((p) => p.name === tl.defaults.palette)) || tl.palettes[0];
  const defaultView = (tl) => Object.assign({ rotate: 0, size: 100 }, tl.defaults.view);
  function defaultState(tl, seed) {
    const params = {};
    for (const d of tl.params) params[d.key] = Array.isArray(d.def) ? d.def.slice() : d.def;
    const first = defaultPalette(tl).colors;
    const n = clamp(first.length, tl.inks.min, tl.inks.max);
    return {
      v: 2, // 2: Dither and Grain each have an on / off switch
      tool: tl.id,
      seed: seed || PL.rng.newSeed(),
      params,
      colors: first.length === n ? first.slice() : tl.inks.fit(first, n),
      locks: Array(n).fill(false),
      fx: Object.assign({}, PL.fx.DEFAULTS, tl.defaults.fx),
      view: defaultView(tl), // General: Rotation (degrees) and Size (%)
      anim: Object.assign({ amount: 0.6, fps: 12, frames: 36 }, tl.defaults.anim),
      output: Object.assign({}, OUTPUT_DEFAULTS),
    };
  }

  // Merge anything loaded (old files, imports) onto clean defaults, clamping every value.
  function sanitize(st, tl) {
    const base = defaultState(tl, (st && st.seed) | 0 || undefined);
    if (!st || typeof st !== 'object') return base;
    const out = base;
    out.seed = clamp(Math.round(+st.seed) || base.seed, 1, 999999999);
    for (const d of tl.params) {
      const v = st.params ? st.params[d.key] : undefined;
      if (v === undefined) continue;
      if (d.type === 'range') out.params[d.key] = clamp(+v || 0, d.min, d.max);
      else if (d.type === 'seg' || d.type === 'select') out.params[d.key] = d.options.some((o) => o.value === v) ? v : d.def;
      else if (d.type === 'toggle') out.params[d.key] = !!v;
      else if (d.type === 'text') out.params[d.key] = typeof v === 'string' ? v.slice(0, d.maxLength || 64) : d.def;
      else if (d.type === 'multi') out.params[d.key] = Array.isArray(v) ? d.options.map((o) => o.value).filter((x) => v.includes(x)) : d.def.slice();
    }
    const cols = Array.isArray(st.colors) ? st.colors.map(PL.color.normHex).filter(Boolean) : [];
    if (cols.length) {
      const n = clamp(cols.length, tl.inks.min, tl.inks.max);
      out.colors = cols.length === n ? cols : tl.inks.fit(cols, n);
    }
    out.locks = out.colors.map((_, i) => !!(Array.isArray(st.locks) && st.locks[i]));
    const num = (src, key, lo, hi) => (src && src[key] !== undefined && !isNaN(+src[key]) ? clamp(+src[key], lo, hi) : undefined);
    if (st.fx) {
      const f = out.fx, g = st.fx;
      f.ditherOn = g.ditherOn !== undefined ? !!g.ditherOn : f.ditherOn;
      f.ditherPx = Math.round(num(g, 'ditherPx', 1, 10) ?? f.ditherPx);
      if (PL.fx.PATTERNS.some((o) => o.value === g.ditherPattern)) f.ditherPattern = g.ditherPattern;
      f.tones = Math.round(num(g, 'tones', 0, 8) ?? f.tones);
      f.ditherAmt = num(g, 'ditherAmt', 0, 100) ?? f.ditherAmt;
      f.grainOn = g.grainOn !== undefined ? !!g.grainOn : f.grainOn;
      if (PL.fx.BLENDS.some((o) => o.value === g.grainBlend)) f.grainBlend = g.grainBlend;
      f.grainSize = num(g, 'grainSize', 0, 5) ?? f.grainSize;
      f.grainSpecks = num(g, 'grainSpecks', 0, 100) ?? f.grainSpecks;
      f.grainRough = num(g, 'grainRough', 0, 100) ?? f.grainRough;
      f.vignette = num(g, 'vignette', 0, 100) ?? f.vignette;
      f.grain = num(g, 'grain', 0, 100) ?? f.grain;
      if (!(st.v >= 2)) {
        // Saved before Dither and Grain had switches: grain was on wherever it showed (any amount,
        // specks or vignette); the old Dither switch only dithered that shading, so it stays off
        // (Mist and Aura dithered their colors, as every style's Dither does now: theirs stays).
        const gd = Object.assign({}, PL.fx.DEFAULTS, tl.defaults.fx);
        f.grainOn = f.grain > 0 || f.grainSpecks > 0 || f.vignette > 0;
        if (!f.grainOn) for (const k of PL.fx.GRAIN_KEYS) f[k] = gd[k];
        else if (g.grainBlend === undefined) f.grainBlend = 'mix'; // the blend there was before blends had a choice
        if (!tl.colorDither) { f.ditherOn = false; for (const k of PL.fx.DITHER_KEYS) f[k] = gd[k]; }
      }
    }
    if (st.view) {
      out.view.rotate = Math.round(num(st.view, 'rotate', -180, 180) ?? 0);
      out.view.size = Math.round(num(st.view, 'size', 25, 400) ?? 100);
    } else out.view = { rotate: 0, size: 100 }; // saved before General existed: as it was made
    if (st.anim) {
      out.anim.amount = num(st.anim, 'amount', 0, 2) ?? out.anim.amount;
      out.anim.fps = num(st.anim, 'fps', 1, 30) ?? out.anim.fps;
      out.anim.frames = Math.round(num(st.anim, 'frames', 2, 240) ?? out.anim.frames);
    }
    if (st.output) {
      const o = out.output;
      if (RATIOS.some((r) => r[0] === st.output.ratio)) o.ratio = st.output.ratio;
      if (SIZES.includes(+st.output.size)) o.size = +st.output.size;
      o.cw = Math.round(num(st.output, 'cw', 16, 8192) ?? o.cw);
      o.ch = Math.round(num(st.output, 'ch', 16, 8192) ?? o.ch);
      o.render = st.output.render === 'pixel' ? 'pixel' : 'smooth';
      o.transparent = !!st.output.transparent;
      o.videoSize = [720, 1080, 1440].includes(+st.output.videoSize) ? +st.output.videoSize : o.videoSize;
      o.loops = Math.round(num(st.output, 'loops', 1, 10) ?? o.loops);
    }
    return out;
  }

  const TOOLS = PL.tools.list();
  const states = {};
  const hist = {};
  for (const tl of TOOLS) {
    const saved = userData.states[tl.id];
    states[tl.id] = saved ? sanitize(saved, tl) : defaultState(tl, firstSeed(tl.id));
    hist[tl.id] = { list: [], idx: -1 };
  }
  let tool = TOOLS[0];
  let S = states[tool.id];
  if (userData.states.__last && states[userData.states.__last]) {
    tool = PL.tools.get(userData.states.__last);
    S = states[tool.id];
  }

  function commit() {
    const H = hist[tool.id];
    const snap = JSON.stringify(S);
    if (H.list[H.idx] === snap) return;
    H.list = H.list.slice(0, H.idx + 1);
    H.list.push(snap);
    if (H.list.length > 200) H.list.shift();
    H.idx = H.list.length - 1;
    updateHistoryButtons();
  }
  function stepHistory(dir) { goHistory(hist[tool.id].idx + dir); }
  // Jump to one step of this style's history (← and → step one at a time; the dots under the artboard jump).
  function goHistory(i) {
    const H = hist[tool.id];
    if (i < 0 || i >= H.list.length || i === H.idx) return;
    H.idx = i;
    S = states[tool.id] = JSON.parse(H.list[i]);
    afterStateReplaced();
  }

  /* -------------------------------------------------------------- rendering */
  const view = $('#view');
  const vctx = view.getContext('2d');
  // Clicking the artboard does what Space does: a new variation.
  view.title = 'Click for a new variation (Space)';
  view.addEventListener('click', () => { if (page === 'tool' && !recording) newVariation(); });
  const frameEl = $('#frame');
  const stageEl = $('#stage');
  const stripEl = document.querySelector('.side-top'); // the name, Home, dark / light and the style menu: the strip on top on phones
  const narrowMQ = window.matchMedia ? window.matchMedia('(max-width: 860px)') : { matches: false };
  let frameIdx = 0;
  let playing = false;
  let playStart = 0;
  let raf = 0;
  let needsRender = true;
  let lastRenderMs = 0;
  let lastInfo = { count: 0, label: 'shapes' };
  let dragging = false;
  let viewW = 0, viewH = 0;

  function ratioWH(o) {
    if (o.ratio === 'custom') return [clamp(o.cw | 0, 16, 8192), clamp(o.ch | 0, 16, 8192)];
    const r = RATIOS.find((x) => x[0] === o.ratio) || RATIOS[0];
    return [r[1], r[2]];
  }

  // The exact shape (width / height) of the frame a canvas shows. Preview canvases, thumbnails and
  // some export sizes are a pixel off the ratio, which can tip a tool that counts whole cells onto a
  // different row count than the export (Quilt's 58 cells at 4:3 are 43.5 rows: 44 in the file, 43
  // on an 810 x 607 artboard). So: the frame's own ratio when the canvas is that shape, else the
  // nearest standard ratio within a pixel or so (the home cards are 4:3), else the canvas's.
  function frameAspect(o, W, H) {
    const a = W / H, tol = a * (3 / W + 3 / H);
    const [rw, rh] = ratioWH(o);
    if (Math.abs(rw / rh - a) <= tol) return rw / rh;
    let best = a, bd = tol;
    for (const r of RATIOS) if (r[1] && Math.abs(r[1] / r[2] - a) <= bd) { bd = Math.abs(r[1] / r[2] - a); best = r[1] / r[2]; }
    return best;
  }

  function capArea(W, H) {
    const a = W * H;
    if (a > MAX_AREA) {
      const k = Math.sqrt(MAX_AREA / a);
      return [Math.floor(W * k), Math.floor(H * k)];
    }
    return [W, H];
  }

  function exportDims(o) {
    const [rw, rh] = ratioWH(o);
    if (o.ratio === 'custom') return capArea(rw, rh);
    const L = o.size;
    return capArea(rw >= rh ? L : Math.round((L * rw) / rh), rw >= rh ? Math.round((L * rh) / rw) : L);
  }

  function videoDims(o) {
    const [rw, rh] = ratioWH(o);
    const L = o.videoSize;
    let W = rw >= rh ? L : (L * rw) / rh;
    let H = rw >= rh ? (L * rh) / rw : L;
    W = Math.max(2, Math.round(W / 2) * 2);
    H = Math.max(2, Math.round(H / 2) * 2); // H.264 wants even sizes
    return [W, H];
  }

  let pixCanvas = null;
  function drawPixelated(ctx, scene, W, H, st, unit, transparent, view) {
    const px = Math.max(2, Math.round((st.fx.ditherPx || 2) * unit));
    const sw = Math.ceil(W / px), sh = Math.ceil(H / px);
    if (!pixCanvas) pixCanvas = document.createElement('canvas');
    pixCanvas.width = sw;
    pixCanvas.height = sh;
    const pc = pixCanvas.getContext('2d', { willReadFrequently: true });
    if (view) { // General: the ground over everything, then the shapes turned and zoomed (the pixels stay square to the frame)
      if (!transparent && scene.bg) { pc.fillStyle = scene.bg; pc.fillRect(0, 0, sw, sh); }
      pc.save();
      pc.setTransform(new DOMMatrix([1 / px, 0, 0, 1 / px, 0, 0]).multiply(viewMatrix(W, H, view)));
      PL.render.drawScene(pc, scene, { transparent, ground: false });
      pc.restore();
    } else PL.render.drawScene(pc, scene, { transparent, scale: 1 / px });
    // Snap every pixel to the nearest palette colour: crisp, palette-exact pixel art.
    // Translucent layers (shadows, overprints) are shading, not inks: snap to the solid inks only.
    const pal = [scene.bg, ...scene.layers.filter((l) => l.opacity == null || l.opacity >= 1).flatMap((l) => (l.grad ? l.grad.stops : [l.fill]))].filter(Boolean).map(PL.color.hexToRgb);
    const img = pc.getImageData(0, 0, sw, sh);
    const d = img.data;
    const memo = new Map();
    for (let i = 0; i < d.length; i += 4) {
      if (transparent) {
        if (d[i + 3] < 128) { d[i + 3] = 0; continue; }
        d[i + 3] = 255;
      }
      const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      let best = memo.get(key);
      if (best === undefined) {
        let bd = Infinity;
        best = 0;
        for (let k = 0; k < pal.length; k++) {
          const p = pal[k];
          const dr = d[i] - p[0], dg = d[i + 1] - p[1], db = d[i + 2] - p[2];
          const dd = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
          if (dd < bd) { bd = dd; best = k; }
        }
        memo.set(key, best);
      }
      const p = pal[best];
      d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2];
    }
    pc.putImageData(img, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pixCanvas, 0, 0, sw * px, sh * px);
    ctx.restore();
  }

  // Scene cache for the preview: once a loop has played, frames only need re-rasterizing,
  // and colour / effect / output tweaks never rebuild the geometry.
  const sceneCache = { key: '', frames: new Map() };
  // region: the part of the world to cover (General's Rotation and Size; none: the frame)
  function buildScene(tl, st, W, H, f, frames, useCache, preview, aspect, region) {
    const refL = Math.max(...exportDims(st.output));
    const make = () => tl.build({ W, H, aspect, seed: st.seed, p: st.params, colors: st.colors, t: f / frames, anim: st.anim, crisp: !preview, refL, region });
    if (!useCache || tl.recolorable === false) return make();
    const key = JSON.stringify([st.tool, st.seed, st.params, st.anim.amount, frames, W, H, aspect, st.colors.length, !!preview, refL, region || 0]);
    if (key !== sceneCache.key) { sceneCache.key = key; sceneCache.frames.clear(); }
    let scene = sceneCache.frames.get(f);
    if (scene) return PL.render.recolor(scene, st.colors);
    scene = make();
    if (sceneCache.frames.size >= 72) sceneCache.frames.delete(sceneCache.frames.keys().next().value);
    sceneCache.frames.set(f, scene);
    return scene;
  }

  // General → Rotation and Size. The frame shows the pattern's world (measured in the frame's own units:
  // the frame is [0, W] x [0, H] at Size 100 %) turned about the frame's centre (clockwise for positive
  // angles) and zoomed in or out, and every style draws whatever part of that world the frame then shows:
  // zoomed out, more of the same pattern (never a repeat); zoomed in, drawn again at full detail. Dither
  // and Grain come after, so they never turn or scale. Nothing about the pattern itself changes.
  const VIEW = { rotate: [-180, 180, 0], size: [25, 400, 100] };
  function viewOf(st) {
    const v = st.view;
    if (!v) return null;
    const rot = clamp(+v.rotate || 0, -180, 180), size = clamp(+v.size || 100, 25, 400);
    return Math.abs(rot) % 360 === 0 && size === 100 ? null : { rotate: rot, z: size / 100 };
  }
  // world -> frame: about the frame's centre, turned, then zoomed
  function viewMatrix(W, H, v) {
    return new DOMMatrix().translate(W / 2, H / 2).rotate(v.rotate).scale(v.z).translate(-W / 2, -H / 2);
  }
  // the part of the world the frame shows (its bounding box, in frame units), a hair larger all round;
  // z: frame pixels per world unit there (a style that samples finely can sample to match)
  function viewBox(W, H, v) {
    const th = (v.rotate * Math.PI) / 180, c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th));
    const hw = (c * W + s * H) / (2 * v.z) + 1 / v.z, hh = (s * W + c * H) / (2 * v.z) + 1 / v.z;
    return { x0: W / 2 - hw, y0: H / 2 - hh, x1: W / 2 + hw, y1: H / 2 + hh, z: v.z };
  }
  // A vector style: the ground over the whole frame, then the shapes drawn straight through the turn and
  // zoom (sharp at any Size).
  function drawSceneView(ctx, W, H, scene, v, transparent) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (transparent || !scene.bg) ctx.clearRect(0, 0, W, H);
    else { ctx.fillStyle = scene.bg; ctx.fillRect(0, 0, W, H); }
    ctx.setTransform(viewMatrix(W, H, v));
    PL.render.drawScene(ctx, scene, { transparent, ground: false });
    ctx.restore();
  }
  // A pixel style paints the part of the world the frame shows at the frame's own resolution (so it is
  // never stretched); a turned one paints its bounding box, then lays it into the frame turned.
  let viewBase = null;
  function paintView(ctx, W, H, v, paint) {
    if (Math.abs(v.rotate) % 360 === 0) {
      const s = 1 / v.z;
      return paint(ctx, { cw: W, ch: H, s, x0: W / 2 - (W / 2) * s, y0: H / 2 - (H / 2) * s });
    }
    const b = viewBox(W, H, v), s = 1 / v.z;
    const cw = Math.max(1, Math.ceil((b.x1 - b.x0) / s)), ch = Math.max(1, Math.ceil((b.y1 - b.y0) / s));
    if (!viewBase) viewBase = document.createElement('canvas');
    viewBase.width = cw; // (also clears it)
    viewBase.height = ch;
    const info = paint(viewBase.getContext('2d'), { cw, ch, s, x0: b.x0, y0: b.y0 });
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(viewMatrix(W, H, v));
    ctx.drawImage(viewBase, b.x0, b.y0, cw * s, ch * s);
    ctx.restore();
    if (cw * ch > 4e6) { viewBase.width = viewBase.height = 1; } // don't hold on to a file-sized canvas
    return info;
  }
  // The same for a vector SVG: the ground over the frame, then the shapes in a turned and zoomed group,
  // clipped to the frame. It stays vector.
  const fmt = (x) => +(+x).toFixed(4);
  function viewSVGBody(scene, W, H, v, transparent) {
    const inner = svgParts(PL.render.sceneToSVG(scene, { transparent: true })).inner; // the shapes, without the ground
    const ground = !transparent && scene.bg ? `<rect id="background" width="${W}" height="${H}" fill="${scene.bg}"/>\n` : '';
    return `${ground}<defs><clipPath id="frame"><rect width="${W}" height="${H}"/></clipPath></defs>\n`
      + `<g clip-path="url(#frame)"><g id="view" transform="translate(${fmt(W / 2)} ${fmt(H / 2)}) rotate(${fmt(v.rotate)}) scale(${fmt(v.z)}) translate(${fmt(-W / 2)} ${fmt(-H / 2)})">\n${inner}\n</g></g>`;
  }
  // split a whole SVG from sceneToSVG into its title and its contents
  function svgParts(svg) {
    let rest = svg.slice(svg.indexOf('>') + 1).replace(/\s*<\/svg>\s*$/, '');
    let title = '';
    const tm = /^\s*(<title>[\s\S]*?<\/title>)/.exec(rest);
    if (tm) { title = tm[1]; rest = rest.slice(tm[0].length); }
    return { title, inner: rest.replace(/^\s+/, '') };
  }

  // Render one frame of a state into a 2D context of size W x H.
  // Vector tools return a Scene (also used for SVG); raster tools paint pixels directly.
  function renderInto(ctx, W, H, st, frame, opts = {}) {
    const tl = PL.tools.get(st.tool);
    const frames = Math.max(1, st.anim.frames | 0);
    const f = ((frame % frames) + frames) % frames;
    const transparent = !!st.output.transparent && !opts.opaque;
    const unit = Math.max(W, H) / 1080;
    const aspect = opts.aspect || frameAspect(st.output, W, H);
    // the picture: a pixel style paints its canvas (map: the part of the world it shows, for General's
    // Rotation and Size); a vector style builds its shapes over the region of the world the frame shows
    const paintTo = (c, map) => {
      const refL = opts.preview ? Math.max(...exportDims(st.output)) : 0;
      const r = tl.paint({ ctx: c, W, H, aspect, seed: st.seed, p: st.params, colors: st.colors, t: f / frames, anim: st.anim, frame: f, transparent, preview: !!opts.preview, refL, map });
      return { count: (r && (r.count != null ? r.count : r.dots)) || 0, label: (r && r.label) || 'dots', text: r && r.status };
    };
    const view = viewOf(st);
    let info;
    if (tl.paint) info = view ? paintView(ctx, W, H, view, paintTo) : paintTo(ctx, undefined);
    else {
      const scene = buildScene(tl, st, W, H, f, frames, !!opts.cache, !!opts.preview, aspect, view ? viewBox(W, H, view) : undefined);
      if (st.output.render === 'pixel') drawPixelated(ctx, scene, W, H, st, unit, transparent, view);
      else if (view) drawSceneView(ctx, W, H, scene, view, transparent);
      else PL.render.drawScene(ctx, scene, { transparent });
      info = { count: PL.render.countShapes(scene), label: 'shapes', text: scene.status, scene };
    }
    // Effects, the same for every style: Grain, then Dither (Mist's). Tools with print grain (stillGrain)
    // keep it fixed, like paper; the others re-scatter it every frame like film. Dither cells follow the
    // frame's short side (Pixel size 2 = 2 px when it is 713 px); on a Pixel render
    // they are its pixels, so the two grids line up.
    if (opts.fx !== false && PL.fx.isActive(st.fx)) {
      const cell = !tl.paint && st.output.render === 'pixel' ? Math.max(2, Math.round((st.fx.ditherPx || 2) * unit)) : PL.fx.ditherCell(st.fx, W, H);
      PL.fx.apply(ctx, W, H, st.fx, { unit, cell, frame: tl.stillGrain ? 0 : f, seed: st.seed, colors: st.colors });
    }
    return info;
  }

  const GENS_H = 30; // the row of history dots under the artboard (the stage's padding-bottom in styles.css)
  function fitStage() {
    const root = document.documentElement.style;
    if (!narrowMQ.matches) { root.removeProperty('--fit-h'); return; }
    const sh = Math.round(stripEl.getBoundingClientRect().height) + 'px';
    if (root.getPropertyValue('--strip-h') !== sh) root.setProperty('--strip-h', sh);
    const w = stageEl.clientWidth || document.documentElement.clientWidth;
    const [rw, rh] = ratioWH(S.output);
    const pad = clamp(w * 0.06, 14, 44);
    const fh = Math.ceil((w - 2 * pad) * (rh / rw) + 2 * pad + GENS_H) + 'px';
    if (root.getPropertyValue('--fit-h') !== fh) root.setProperty('--fit-h', fh);
  }

  function layoutView() {
    fitStage();
    const r = stageEl.getBoundingClientRect();
    const avH = r.height - GENS_H; // the dots sit in the band under the artboard
    if (r.width < 10 || avH < 10) return;
    const pad = clamp(Math.min(r.width, avH) * 0.06, 14, 44);
    const [rw, rh] = ratioWH(S.output);
    const k = Math.min((r.width - pad * 2) / rw, (avH - pad * 2) / rh);
    const cw = Math.max(24, Math.floor(rw * k)), ch = Math.max(24, Math.floor(rh * k));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let pw = Math.round(cw * dpr), ph = Math.round(ch * dpr);
    const cap = 1600, m = Math.max(pw, ph);
    if (m > cap) { pw = Math.round((pw * cap) / m); ph = Math.round((ph * cap) / m); }
    view.style.width = cw + 'px';
    view.style.height = ch + 'px';
    viewW = pw;
    viewH = ph;
  }

  function renderPreview() {
    if (page === 'home') return; // the stage is hidden on the home page
    if (!viewW) layoutView();
    const q = dragging && lastRenderMs > 45 ? 0.6 : 1; // stay fluid while dragging sliders
    const W = Math.max(8, Math.round(viewW * q)), H = Math.max(8, Math.round(viewH * q));
    if (view.width !== W) view.width = W;
    if (view.height !== H) view.height = H;
    const t0 = performance.now();
    try {
      lastInfo = renderInto(vctx, W, H, S, frameIdx, { cache: true, preview: true });
    } catch (err) {
      console.error(err);
      toast('Render error: ' + err.message, 'err');
    }
    const dt = performance.now() - t0;
    lastRenderMs = q === 1 ? dt : lastRenderMs;
    frameEl.classList.toggle('transparent', !!S.output.transparent);
    updateStatus();
  }

  function tick(now) {
    raf = 0;
    if (playing) {
      const frames = Math.max(1, S.anim.frames | 0);
      const f = Math.floor(((now - playStart) * S.anim.fps) / 1000) % frames;
      if (f !== frameIdx) { frameIdx = f; needsRender = true; syncFrameSlider(); }
      raf = requestAnimationFrame(tick);
    }
    if (needsRender) {
      needsRender = false;
      renderPreview();
    }
  }
  function requestRender() {
    needsRender = true;
    if (!raf) raf = requestAnimationFrame(tick);
  }

  new ResizeObserver(() => { layoutView(); requestRender(); }).observe(stageEl);
  // Narrow screens (the settings below the artboard): the artboard stays pinned under the strip on
  // top while the settings scroll beneath it (styles.css), its height hugging the frame's shape.
  if (narrowMQ.addEventListener) narrowMQ.addEventListener('change', () => { layoutView(); requestRender(); });
  if (stripEl) new ResizeObserver(() => fitStage()).observe(stripEl);

  function setPlaying(on) {
    playing = on;
    if (on) {
      playStart = performance.now() - (frameIdx * 1000) / S.anim.fps;
      requestRender();
    }
    const b = $('#playBtn');
    if (b) {
      b.replaceChildren(icon(on ? 'pause' : 'play'), h('span', { class: 'lbl' }, on ? 'Pause' : 'Play'));
      b.classList.toggle('on', on);
    }
  }

  function updateStatus() {
    const [W, H] = exportDims(S.output);
    const frames = Math.max(1, S.anim.frames | 0);
    $('#status').textContent =
      `${W} × ${H} px  ·  ${lastInfo.text || lastInfo.count.toLocaleString() + ' ' + lastInfo.label}  ·  frame ${frameIdx + 1}/${frames}  ·  seed ${S.seed}`;
    updateSummary(W, H);
  }
  // The output column's summary: the frame, its size in pixels, the inks, the loop and how long a render takes.
  function updateSummary(W, H) {
    const el = $('#outSummary');
    if (!el) return;
    const rows = [['Ratio', S.output.ratio === 'custom' ? 'Custom' : S.output.ratio], ['Size', `${W} × ${H} px`], ['Inks', String(S.colors.length)],
      ['Loop', `${Math.max(1, S.anim.frames | 0)} frames · ${S.anim.fps} fps`], ['Render', lastRenderMs ? `${Math.max(1, Math.round(lastRenderMs))} ms` : '–']];
    el.replaceChildren(...rows.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)]));
  }

  /* --------------------------------------------------------------- actions */
  function randomizeParams() {
    for (const d of tool.params) {
      if (!d.rand && !d.randChoices) continue;
      if (d.type === 'range' && Array.isArray(d.randChoices)) {
        // a few typical values (e.g. Rise's stripe counts) instead of anything in a range
        S.params[d.key] = d.randChoices[Math.floor(Math.random() * d.randChoices.length)];
      } else if (d.type === 'range') {
        const [a, b] = d.rand;
        const step = d.step || 1;
        S.params[d.key] = clamp(Math.round((a + Math.random() * (b - a)) / step) * step, d.min, d.max);
        S.params[d.key] = +S.params[d.key].toFixed(4);
      } else if (d.type === 'seg' || d.type === 'select') {
        S.params[d.key] = d.options[Math.floor(Math.random() * d.options.length)].value;
      } else if (d.type === 'toggle') {
        S.params[d.key] = Math.random() < 0.5;
      }
    }
  }

  function newVariation() {
    S.seed = PL.rng.newSeed();
    randomizeParams();
    afterChange();
  }
  // New seed (N): same settings, new shapes.
  function reshuffle() {
    S.seed = PL.rng.newSeed();
    afterChange();
  }
  // Apply a palette exactly as given (2–8 colors), so pasting 4 brand colors gives 4 cards.
  // If the count matches what's there now, locked colors stay where they are.
  function applyColors(next) {
    const cols = (next || []).map(PL.color.normHex).filter(Boolean);
    if (!cols.length) return;
    const n = clamp(cols.length, tool.inks.min, tool.inks.max);
    const exact = cols.length === n ? cols : tool.inks.fit(cols, n);
    if (n === S.colors.length) S.colors = S.colors.map((c, i) => (S.locks[i] ? c : exact[i]));
    else {
      S.colors = exact;
      S.locks = Array(n).fill(false);
    }
  }
  let lastPresetIdx = -1;
  function newColors() {
    const n = S.colors.length;
    const now = S.colors.join();
    const same = tool.palettes.map((_, i) => i).filter((i) =>
      tool.palettes[i].colors.length === n && i !== lastPresetIdx && tool.palettes[i].colors.join() !== now);
    if (same.length && Math.random() < 0.35) {
      const i = same[Math.floor(Math.random() * same.length)];
      lastPresetIdx = i;
      applyColors(tool.palettes[i].colors);
    } else {
      const rng = PL.rng.create(PL.rng.newSeed());
      const gen = tool.inks.generate ? tool.inks.generate(n, rng) : PL.color.generate(tool.inks.spec(n), rng);
      applyColors(tool.inks.fit(gen, n));
    }
    afterChange();
  }
  function addColor() {
    const n = S.colors.length;
    if (n >= tool.inks.max) return;
    const next = tool.inks.add ? tool.inks.add(S.colors) : [...S.colors, PL.color.mix(S.colors[n - 1], '#808080', 0.5)];
    let at = next.findIndex((c, i) => c !== S.colors[i]);
    if (at < 0) at = n;
    S.locks.splice(at, 0, false);
    S.colors = next;
    afterChange();
  }
  function removeColor(i) {
    if (S.colors.length <= tool.inks.min) return;
    S.colors.splice(i, 1);
    S.locks.splice(i, 1);
    afterChange();
  }
  // Rotate (R): every unlocked color moves along to the next role; the last wraps round to the first.
  // A tool can keep its first roles out of it (inks.rotateFrom: Modular's background and rules).
  function rotateColors() {
    const from = (tool.inks && tool.inks.rotateFrom) || 0;
    const idx = S.colors.map((_, i) => i).filter((i) => i >= from && !S.locks[i]);
    if (idx.length < 2) return;
    const vals = idx.map((i) => S.colors[i]);
    vals.unshift(vals.pop());
    idx.forEach((i, k) => (S.colors[i] = vals[k]));
    afterChange();
  }
  function invertColors() {
    // Background <-> land (reversing the land tones): flips dark/light, accents stay.
    const n = S.colors.length;
    const span = tool.inks.span ? tool.inks.span(n) : Math.max(2, n - 2);
    const idx = [];
    for (let i = 0; i < span; i++) if (!S.locks[i]) idx.push(i);
    const vals = idx.map((i) => S.colors[i]).reverse();
    idx.forEach((i, k) => (S.colors[i] = vals[k]));
    afterChange();
  }

  function afterChange() {
    syncControls();
    renderSwatches();
    requestRender();
    commit();
  }
  function afterStateReplaced() {
    frameIdx = Math.min(frameIdx, Math.max(0, (S.anim.frames | 0) - 1));
    layoutView();
    syncControls();
    renderSwatches();
    requestRender();
    updateHistoryButtons();
  }

  /* -------------------------------------------------------- kept strip */
  function thumbOf(st) {
    const [rw, rh] = ratioWH(st.output);
    const L = 150;
    const W = rw >= rh ? L : Math.max(8, Math.round((L * rw) / rh));
    const H = rw >= rh ? Math.max(8, Math.round((L * rh) / rw)) : L;
    const c = h('canvas', { width: W, height: H });
    renderInto(c.getContext('2d'), W, H, st, 0, { opaque: true, preview: true });
    const url = c.toDataURL('image/jpeg', 0.82);
    release(c);
    return url;
  }
  function keep() {
    const st = deep(S);
    userData.kept.unshift({ state: st, thumb: thumbOf(st), at: Date.now() });
    if (userData.kept.length > 60) userData.kept.pop();
    markDirty();
    renderKept();
    toast('Kept — find it in the strip below');
  }
  function renderKept() {
    const strip = $('#kept');
    $('#keptCount').textContent = userData.kept.length;
    if (!userData.kept.length) {
      strip.replaceChildren(h('span', { class: 'kept-empty' }, 'Press K to keep variations you like. Click one to bring it back.'));
      return;
    }
    strip.replaceChildren(
      ...userData.kept.map((k, i) =>
        h('div', { class: 'kept-item' },
          h('button', {
            class: 'thumb',
            title: `${(PL.tools.get(k.state.tool) || {}).name || k.state.tool} · seed ${k.state.seed} — click to load`,
            onclick: () => loadState(k.state),
          }, h('img', { src: k.thumb, alt: 'Kept variation ' + (i + 1) })),
          h('button', {
            class: 'x',
            title: 'Remove',
            'aria-label': 'Remove kept variation',
            onclick: () => { userData.kept.splice(i, 1); markDirty(); renderKept(); },
          }, '×')
        )
      )
    );
  }
  function loadState(st) {
    const tl = PL.tools.get(st.tool);
    if (!tl) return toast('That variation needs a tool this file doesn’t have', 'err');
    states[tl.id] = sanitize(deep(st), tl);
    if (tl.id === tool.id) {
      S = states[tl.id];
      buildPanel();
      buildActions();
    }
    if (page === 'tool' && tl.id === tool.id) { afterStateReplaced(); commit(); }
    else { keepOnOpen = tl.id; go(tl.id); } // opens on the kept variation, not the default look
  }

  /* --------------------------------------------------------------- exports */
  const baseName = (st, W, H) => `${st.tool}-${st.seed}-${W}x${H}`;

  function renderToCanvas(st, W, H, frame) {
    const c = h('canvas', { width: W, height: H });
    renderInto(c.getContext('2d'), W, H, st, frame);
    return c;
  }
  const release = (c) => { c.width = 0; c.height = 0; };
  const canvasToBlob = (c, type = 'image/png', q) =>
    new Promise((res, rej) => c.toBlob((b) => { release(c); b ? res(b) : rej(new Error('Could not encode image')); }, type, q));

  async function exportPNG() {
    const st = deep(S);
    const [W, H] = exportDims(st.output);
    toast(`Rendering ${W} × ${H} PNG…`);
    frameEl.classList.add('busy');
    await nextFrame();
    try {
      const blob = await canvasToBlob(renderToCanvas(st, W, H, frameIdx));
      download(blob, baseName(st, W, H) + '.png');
      toast(`Saved ${baseName(st, W, H)}.png`);
    } catch (e) {
      toast('PNG export failed: ' + e.message, 'err');
    } finally {
      frameEl.classList.remove('busy');
    }
  }

  const blobToDataURL = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error || new Error('Could not read the image')); r.readAsDataURL(b); });
  const xmlEsc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const svgOpen = (W, H, title) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` + (title ? `\n<title>${xmlEsc(title)}</title>` : '');
  const encode = (c, type = 'image/png', q) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode image'))), type, q));

  // The picture as SVG. Vector styles: their shapes, one path per color (effects stay out). Pixel styles:
  // the picture itself, effects and all, as a PNG inside the SVG.
  async function buildSVG(st) {
    const [W, H] = exportDims(st.output);
    const tl = PL.tools.get(st.tool);
    const frames = Math.max(1, st.anim.frames | 0);
    const title = `${tl.name} · seed ${st.seed}`;
    if (tl.paint) {
      const url = await blobToDataURL(await canvasToBlob(renderToCanvas(st, W, H, frameIdx)));
      return { svg: `${svgOpen(W, H, title)}\n<image width="${W}" height="${H}" xlink:href="${url}"/>\n</svg>\n`, W, H };
    }
    const v = viewOf(st);
    const scene = tl.build({ W, H, aspect: frameAspect(st.output, W, H), seed: st.seed, p: st.params, colors: st.colors, t: (frameIdx % frames) / frames, anim: st.anim, region: v ? viewBox(W, H, v) : undefined });
    if (!v) return { svg: PL.render.sceneToSVG(scene, { transparent: st.output.transparent, title }), W, H };
    return { svg: `${svgOpen(W, H, title)}\n${viewSVGBody(scene, W, H, v, st.output.transparent)}\n</svg>\n`, W, H };
  }

  async function exportSVG() {
    const st = deep(S);
    frameEl.classList.add('busy');
    if (tool.paint) toast('Rendering the SVG…');
    await nextFrame();
    try {
      const { svg, W, H } = await buildSVG(st);
      download(new Blob([svg], { type: 'image/svg+xml' }), baseName(st, W, H) + '.svg');
      toast(`Saved ${baseName(st, W, H)}.svg (${(svg.length / 1048576).toFixed(1)} MB)`);
    } catch (e) {
      toast('SVG export failed: ' + e.message, 'err');
    } finally {
      frameEl.classList.remove('busy');
    }
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* fall through */ }
    const ta = h('textarea', { style: 'position:fixed;left:-9999px;top:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  async function copySVG() {
    const st = deep(S);
    const { svg } = await buildSVG(st);
    const ok = await copyText(svg);
    toast(ok ? 'SVG copied — paste straight into Figma or Illustrator' : 'Clipboard blocked here — use the SVG download instead', ok ? '' : 'err');
  }

  async function copyPNG() {
    if (!navigator.clipboard || !window.ClipboardItem) return toast('Image clipboard isn’t available here — use the PNG download', 'err');
    const st = deep(S);
    const [W, H] = exportDims(st.output);
    try {
      const blobPromise = (async () => { await nextFrame(); return canvasToBlob(renderToCanvas(st, W, H, frameIdx)); })();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);
      toast(`PNG copied (${W} × ${H})`);
    } catch (e) {
      toast('Could not copy the image: ' + e.message, 'err');
    }
  }

  function pickVideoMime() {
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return null;
    const cands = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    return cands.find((m) => { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } }) || null;
  }
  const VIDEO_MIME = pickVideoMime();
  const VIDEO_EXT = VIDEO_MIME ? (VIDEO_MIME.includes('mp4') ? 'mp4' : 'webm') : '';

  let recording = false;
  let cancelRec = false;

  // A progress window for the long exports, with Cancel.
  function progressBox(title, about) {
    const bar = h('i');
    const label = h('p', { class: 'note' }, 'Rendering frames…');
    modal.open([
      h('h2', null, title),
      h('p', { class: 'note' }, about),
      h('div', { class: 'progress' }, bar),
      label,
      h('div', { class: 'foot' }, h('button', { class: 'btn', type: 'button', onclick: () => (cancelRec = true) }, 'Cancel')),
    ]);
    return { set: (x, text) => { bar.style.width = clamp(x, 0, 1) * 100 + '%'; if (text) label.textContent = text; } };
  }

  // Animated SVG: every frame of the loop in one file, each shown in turn for 1 / fps (SMIL, so it plays in
  // any browser, in an <img> too, and loops forever). Vector styles keep their shapes; a pixel style holds
  // each frame as an image (PNG, or a high-quality JPEG when that is less than half the size and nothing
  // is dithered). Apps without animation show the first frame.
  function frameGroup(k, N, fps, inner) {
    if (N === 1) return `<g id="frame-1">${inner}</g>`;
    const t = (x) => +(x / N).toFixed(6);
    const values = k === 0 ? 'inline;none' : k === N - 1 ? 'none;inline' : 'none;inline;none';
    const times = k === 0 ? `0;${t(1)}` : k === N - 1 ? `0;${t(k)}` : `0;${t(k)};${t(k + 1)}`;
    return `<g id="frame-${k + 1}"${k ? ' display="none"' : ''}><animate attributeName="display" values="${values}" keyTimes="${times}" calcMode="discrete" dur="${+(N / fps).toFixed(4)}s" repeatCount="indefinite"/>\n${inner}\n</g>`;
  }
  async function exportAnimSVG() {
    if (recording) return;
    const st = deep(S), tl = PL.tools.get(st.tool);
    const [W, H] = videoDims(st.output);
    const N = Math.max(1, st.anim.frames | 0), fps = st.anim.fps;
    const box = progressBox(`Animated SVG · ${W} × ${H}`, `${N} frames at ${fps} fps (${(N / fps).toFixed(1)} s), looping forever.`);
    recording = true;
    cancelRec = false;
    const wasPlaying = playing;
    setPlaying(false);
    const canvas = tl.paint ? h('canvas', { width: W, height: H }) : null;
    try {
      const parts = [svgOpen(W, H, `${tl.name} · seed ${st.seed} · ${N} frames at ${fps} fps`), '\n'];
      let type = 'image/png', q;
      for (let f = 0; f < N; f++) {
        if (cancelRec) throw new Error('cancelled');
        let inner;
        if (tl.paint) {
          renderInto(canvas.getContext('2d'), W, H, st, f);
          let blob = await encode(canvas, type, q);
          if (f === 0 && !st.fx.ditherOn && !st.output.transparent) {
            const jpg = await encode(canvas, 'image/jpeg', 0.92);
            if (jpg.size < blob.size * 0.5) { type = 'image/jpeg'; q = 0.92; blob = jpg; }
          }
          inner = `<image width="${W}" height="${H}" xlink:href="${await blobToDataURL(blob)}"/>`;
        } else {
          const v = viewOf(st);
          const scene = tl.build({ W, H, aspect: frameAspect(st.output, W, H), seed: st.seed, p: st.params, colors: st.colors, t: f / N, anim: st.anim, region: v ? viewBox(W, H, v) : undefined });
          const P = `f${f + 1}-`; // every frame's own ids
          inner = (v ? viewSVGBody(scene, W, H, v, st.output.transparent) : svgParts(PL.render.sceneToSVG(scene, { transparent: st.output.transparent })).inner)
            .replace(/ id="/g, ` id="${P}`).replace(/href="#/g, `href="#${P}`).replace(/url\(#/g, `url(#${P}`);
        }
        parts.push(frameGroup(f, N, fps, inner), '\n');
        box.set((f + 1) / N, `Frame ${f + 1} of ${N}`);
        await nextFrame();
      }
      parts.push('</svg>\n');
      const blob = new Blob(parts, { type: 'image/svg+xml' });
      const name = baseName(st, W, H) + '-loop.svg';
      download(blob, name);
      toast(`Saved ${name} (${(blob.size / 1048576).toFixed(1)} MB)`);
    } catch (e) {
      toast(e.message === 'cancelled' ? 'Cancelled' : 'Animated SVG export failed: ' + e.message, e.message === 'cancelled' ? '' : 'err');
    } finally {
      if (canvas) release(canvas);
      recording = false;
      modal.close();
      if (wasPlaying) setPlaying(true);
    }
  }

  // MP4: the loop encoded frame by frame (WebCodecs, H.264) and written into an MP4 right here, so every
  // frame lasts exactly 1 / fps and the loops join up. Without WebCodecs it records in real time instead
  // (MediaRecorder: MP4 where the browser can, else WebM).
  const CAN_ENCODE = typeof window.VideoEncoder === 'function' && typeof window.VideoFrame === 'function';
  async function avcConfig(W, H, fps, bitrate) {
    // Baseline first: no B-frames, so the frames come out in order. Level 4.0 covers every size here.
    for (const codec of ['avc1.42E028', 'avc1.4D0028', 'avc1.640028']) {
      const cfg = { codec, width: W, height: H, bitrate, framerate: fps, avc: { format: 'avc' } };
      try { const r = await VideoEncoder.isConfigSupported(cfg); if (r && r.supported) return cfg; } catch (e) { /* next */ }
    }
    return null;
  }
  async function exportMP4() {
    if (recording) return;
    if (!CAN_ENCODE) return recordVideo();
    const st = deep(S);
    const [W, H] = videoDims(st.output);
    const frames = Math.max(1, st.anim.frames | 0), fps = Math.max(1, Math.round(st.anim.fps)), loops = st.output.loops;
    const total = frames * loops;
    const cfg = await avcConfig(W, H, fps, Math.round(clamp(W * H * fps * 0.9, 6e6, 40e6)));
    if (!cfg) return recordVideo();
    const box = progressBox(`MP4 · ${W} × ${H}`, `${loops} loop${loops > 1 ? 's' : ''} of ${frames} frames at ${fps} fps (${(total / fps).toFixed(1)} s).`);
    recording = true;
    cancelRec = false;
    const wasPlaying = playing;
    setPlaying(false);
    const canvas = h('canvas', { width: W, height: H });
    const ctx = canvas.getContext('2d');
    const bitmaps = [];
    let enc = null, fallback = false;
    try {
      const chunks = [];
      let desc = null, failed = null;
      enc = new VideoEncoder({
        output: (chunk, meta) => {
          const data = new Uint8Array(chunk.byteLength);
          chunk.copyTo(data);
          chunks.push({ data, key: chunk.type === 'key', ts: chunk.timestamp });
          const d = meta && meta.decoderConfig && meta.decoderConfig.description;
          if (d && !desc) desc = ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength).slice() : new Uint8Array(d).slice();
        },
        error: (e) => { failed = e; },
      });
      enc.configure(cfg);
      const keep = frames * W * H * 4 <= 700e6 && !!window.createImageBitmap; // each frame drawn once
      const dur = 1e6 / fps;
      for (let k = 0; k < total; k++) {
        if (cancelRec) throw new Error('cancelled');
        if (failed) throw failed;
        const f = k % frames;
        if (bitmaps[f]) ctx.drawImage(bitmaps[f], 0, 0);
        else {
          renderInto(ctx, W, H, st, f);
          if (keep) bitmaps[f] = await createImageBitmap(canvas);
        }
        const vf = new VideoFrame(canvas, { timestamp: Math.round(k * dur), duration: Math.round(dur) });
        enc.encode(vf, { keyFrame: f === 0 });
        vf.close();
        while (enc.encodeQueueSize > 4 && !failed) await sleep(4);
        box.set((k + 1) / total, `Frame ${k + 1} of ${total}`);
        if (k % 3 === 0) await nextFrame();
      }
      await enc.flush();
      if (failed) throw failed;
      const ordered = chunks.every((c, i) => i === 0 || c.ts > chunks[i - 1].ts);
      if (chunks.length !== total || !desc || !ordered || !chunks[0].key) { fallback = true; throw new Error('this encoder skipped or reordered frames'); }
      const blob = muxMP4({ W, H, fps, chunks, desc });
      const name = baseName(st, W, H) + '.mp4';
      download(blob, name);
      toast(`Saved ${name}`);
    } catch (e) {
      if (e.message === 'cancelled') toast('Cancelled');
      else if (!fallback) toast('MP4 export failed: ' + e.message, 'err');
    } finally {
      try { if (enc && enc.state !== 'closed') enc.close(); } catch (e) { /* closed */ }
      bitmaps.forEach((b) => b && b.close && b.close());
      release(canvas);
      recording = false;
      modal.close();
      if (wasPlaying && !fallback) setPlaying(true);
    }
    if (fallback) return recordVideo();
  }

  // A plain MP4 (ISO BMFF) around H.264 frames in decode order: ftyp, moov (one video track), mdat.
  function muxMP4({ W, H, fps, chunks, desc }) {
    const u8 = (...v) => Uint8Array.from(v);
    const u16 = (v) => u8((v >>> 8) & 255, v & 255);
    const u32 = (v) => u8((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
    const str = (t) => Uint8Array.from([...t].map((c) => c.charCodeAt(0)));
    const cat = (parts) => { let n = 0; for (const p of parts) n += p.length; const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
    const box = (type, ...parts) => { const body = cat(parts); return cat([u32(body.length + 8), str(type), body]); };
    const full = (type, vflags, ...parts) => box(type, u32(vflags), ...parts);
    const zeros = (n) => new Uint8Array(n);
    const matrix = cat([0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000].map(u32));
    const N = chunks.length, delta = 1000, timescale = fps * 1000, mediaDur = N * delta, movieDur = Math.round((N * 1000) / fps);
    const sync = []; chunks.forEach((c, i) => { if (c.key) sync.push(i + 1); });
    const name = str('Pattern Studio');
    const compressor = cat([u8(name.length), name, zeros(31 - name.length)]);
    const avc1 = box('avc1', zeros(6), u16(1), zeros(16), u16(W), u16(H), u32(0x480000), u32(0x480000), u32(0), u16(1), compressor, u16(0x18), u16(0xffff), box('avcC', desc), box('pasp', u32(1), u32(1)));
    const stbl = (offset) => box('stbl',
      full('stsd', 0, u32(1), avc1),
      full('stts', 0, u32(1), u32(N), u32(delta)),
      full('stss', 0, u32(sync.length), ...sync.map(u32)),
      full('stsc', 0, u32(1), u32(1), u32(N), u32(1)),
      full('stsz', 0, u32(0), u32(N), ...chunks.map((c) => u32(c.data.length))),
      full('stco', 0, u32(1), u32(offset)));
    const moov = (offset) => box('moov',
      full('mvhd', 0, u32(0), u32(0), u32(1000), u32(movieDur), u32(0x10000), u16(0x100), zeros(10), matrix, zeros(24), u32(2)),
      box('trak',
        full('tkhd', 3, u32(0), u32(0), u32(1), u32(0), u32(movieDur), zeros(8), u16(0), u16(0), u16(0), u16(0), matrix, u32(W * 65536), u32(H * 65536)),
        box('mdia',
          full('mdhd', 0, u32(0), u32(0), u32(timescale), u32(mediaDur), u16(0x55c4), u16(0)),
          full('hdlr', 0, u32(0), str('vide'), zeros(12), str('VideoHandler'), u8(0)),
          box('minf',
            full('vmhd', 1, zeros(8)),
            box('dinf', full('dref', 0, u32(1), full('url ', 1))),
            stbl(offset)))));
    const ftyp = box('ftyp', str('isom'), u32(0x200), str('isom'), str('iso2'), str('avc1'), str('mp41'));
    const offset = ftyp.length + moov(0).length + 8; // where the first frame starts, inside mdat
    let bytes = 0; for (const c of chunks) bytes += c.data.length;
    return new Blob([ftyp, moov(offset), u32(bytes + 8), str('mdat'), ...chunks.map((c) => c.data)], { type: 'video/mp4' });
  }

  async function recordVideo() {
    if (recording) return;
    if (!VIDEO_MIME) return toast('This browser can’t make video. Try Chrome, Edge, Safari or Firefox.', 'err');
    const st = deep(S);
    const [W, H] = videoDims(st.output);
    const frames = Math.max(1, st.anim.frames | 0);
    const fps = st.anim.fps;
    const loops = st.output.loops;
    const bar = h('i');
    const label = h('p', { class: 'note' }, 'Rendering frames…');
    const cancel = h('button', { class: 'btn', onclick: () => (cancelRec = true) }, 'Cancel');
    modal.open([
      h('h2', null, `Recording ${VIDEO_EXT.toUpperCase()} · ${W} × ${H}`),
      h('p', { class: 'note' }, `${loops} loop${loops > 1 ? 's' : ''} of ${frames} frames at ${fps} fps (${((frames * loops) / fps).toFixed(1)} s). Keep this tab visible while it records.`),
      h('div', { class: 'progress' }, bar),
      label,
      h('div', { class: 'foot' }, cancel),
    ]);
    recording = true;
    cancelRec = false;
    const wasPlaying = playing;
    setPlaying(false);

    const canvas = h('canvas', { width: W, height: H, style: 'position:fixed;left:0;top:0;width:4px;height:4px;opacity:0.01;pointer-events:none' });
    document.body.append(canvas);
    const ctx = canvas.getContext('2d');
    const bitmaps = [];
    let stream = null;
    try {
      // 1) Pre-render the loop so playback timing is exact (fall back to live render if memory is tight).
      const cache = frames * W * H * 4 <= 700e6 && !!window.createImageBitmap;
      if (cache) {
        for (let f = 0; f < frames; f++) {
          if (cancelRec) throw new Error('cancelled');
          renderInto(ctx, W, H, st, f);
          bitmaps.push(await createImageBitmap(canvas));
          bar.style.width = ((f + 1) / frames) * 35 + '%';
          if (f % 2 === 0) await nextFrame();
        }
      }
      // 2) Record in real time.
      label.textContent = 'Recording…';
      const manual = !!(window.CanvasCaptureMediaStreamTrack && CanvasCaptureMediaStreamTrack.prototype.requestFrame);
      stream = canvas.captureStream(manual ? 0 : fps);
      const track = stream.getVideoTracks()[0];
      const bps = Math.round(clamp(W * H * fps * 0.9, 6e6, 40e6));
      const rec = new MediaRecorder(stream, { mimeType: VIDEO_MIME, videoBitsPerSecond: bps });
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise((r) => (rec.onstop = r));
      const total = frames * loops;
      const dt = 1000 / fps;
      const draw = (f) => (cache ? ctx.drawImage(bitmaps[f], 0, 0) : renderInto(ctx, W, H, st, f));
      draw(0);
      rec.start();
      const t0 = performance.now();
      for (let k = 0; k < total; k++) {
        if (cancelRec) break;
        if (k > 0) draw(k % frames);
        if (manual) track.requestFrame();
        bar.style.width = 35 + ((k + 1) / total) * 65 + '%';
        const wait = t0 + (k + 1) * dt - performance.now();
        if (wait > 0) await sleep(wait);
      }
      rec.stop();
      await stopped;
      if (cancelRec) throw new Error('cancelled');
      const blob = new Blob(chunks, { type: VIDEO_MIME.split(';')[0] });
      const name = baseName(st, W, H) + '.' + VIDEO_EXT;
      download(blob, name);
      toast(`Saved ${name}`);
    } catch (e) {
      if (e.message !== 'cancelled') toast('Video export failed: ' + e.message, 'err');
      else toast('Recording cancelled');
    } finally {
      bitmaps.forEach((b) => b.close && b.close());
      if (stream) stream.getTracks().forEach((t) => t.stop());
      canvas.remove();
      release(canvas);
      recording = false;
      modal.close();
      if (wasPlaying) setPlaying(true);
    }
  }

  /* ------------------------------------------------------- saved patterns */
  // Save pattern: this style's colors and settings (seed, settings, effects, animation, frame) as a
  // small file. Upload pattern opens one again, whichever style it is from. A library file from an
  // older copy (palettes and kept variations) still imports.
  function savePattern() {
    const st = deep(S);
    const data = { app: 'pattern-studio', kind: 'pattern', version: PL.version, style: tool.name, saved: new Date().toISOString(), state: st };
    const name = `${tool.id}-${st.seed}.pattern.json`;
    download(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), name);
    toast(`Saved ${name}. Upload pattern opens it again.`);
  }
  function openPatternFile(file) {
    if (!file) return;
    const r = new FileReader();
    r.onerror = () => toast('Could not read that file', 'err');
    r.onload = () => {
      let d = null;
      try { d = JSON.parse(String(r.result).replace(/^﻿/, '')); } catch (e) { /* not JSON */ }
      const st = d && typeof d === 'object' ? (d.state && typeof d.state === 'object' ? d.state : d.tool && d.params ? d : null) : null;
      const tl = st && PL.tools.get(st.tool);
      if (tl) {
        loadState(st);
        toast(`Opened your ${tl.name} pattern`);
      } else if (d && typeof d === 'object' && (Array.isArray(d.palettes) || Array.isArray(d.kept))) importLibraryData(d);
      else toast('That file isn’t a pattern saved from Pattern Studio', 'err');
    };
    r.readAsText(file);
  }
  function importLibraryData(d) {
    let np = 0, nk = 0;
    const havePal = new Set(userData.palettes.map((p) => p.colors.join()));
    let full = 0;
    for (const p of Array.isArray(d.palettes) ? d.palettes : []) {
      const cols = ((p && p.colors) || []).map(PL.color.normHex).filter(Boolean);
      if (!cols.length || havePal.has(cols.join())) continue;
      if (userData.palettes.length >= MAX_PALETTES) { full++; continue; }
      userData.palettes.push({ name: String(p.name || 'Imported').slice(0, 40), colors: cols }); havePal.add(cols.join()); np++;
    }
    const haveKept = new Set(userData.kept.map((k) => JSON.stringify(k.state)));
    for (const k of Array.isArray(d.kept) ? d.kept : []) {
      if (!k || !k.state || !PL.tools.get(k.state.tool) || haveKept.has(JSON.stringify(k.state))) continue;
      const st = sanitize(k.state, PL.tools.get(k.state.tool));
      userData.kept.push({ state: st, thumb: typeof k.thumb === 'string' && k.thumb.startsWith('data:image/') ? k.thumb : thumbOf(st), at: k.at || Date.now() });
      nk++;
    }
    if (np || nk) markDirty();
    renderPalettes();
    renderKept();
    toast((np || nk ? `Added ${np} palette${np === 1 ? '' : 's'} and ${nk} kept variation${nk === 1 ? '' : 's'}` : 'Those palettes and kept variations are already here')
      + (full ? ` (${full} more palette${full === 1 ? '' : 's'} didn’t fit: you can keep ${MAX_PALETTES})` : ''));
  }
  function saveAppCopy() {
    const st = {};
    for (const tl of TOOLS) st[tl.id] = states[tl.id];
    st.__last = tool.id;
    const data = { palettes: userData.palettes, kept: userData.kept, states: st };
    const json = JSON.stringify(data).replace(/</g, '\\u003c');
    const m = new RegExp('<scr' + 'ipt id="pl-user-data"[^>]*>').exec(PRISTINE);
    if (!m) return toast('Could not find the data block in this file', 'err');
    const start = m.index + m[0].length;
    const end = PRISTINE.indexOf('</' + 'script>', start);
    const html = PRISTINE.slice(0, start) + json + PRISTINE.slice(end);
    download(new Blob([html], { type: 'text/html' }), 'Pattern Studio.html');
    libraryDirty = false;
    updateLibraryBadge();
    toast('Saved “Pattern Studio.html” — replace your old copy with it');
  }
  function updateLibraryBadge() {
    const b = $('#libBadge');
    if (b) b.style.display = libraryDirty ? 'inline-block' : 'none';
  }

  /* ------------------------------------------------------------ controls UI */
  let bindings = [];
  const collapsed = {};
  const syncControls = () => bindings.forEach((b) => b.sync());

  function decimals(step) {
    const s = String(step);
    return s.includes('.') ? s.split('.')[1].length : 0;
  }

  function rangeRow({ label, aria, min, max, step = 1, unit = '', def, hint, get, set, commitOnChange = true, onInput, log = false }) {
    // aria: a fuller name for screen readers when the label repeats another section's (Crowd: Arrows -> Size)
    // log: the slider runs on a log scale (General's Size: 100 % in the middle, halving or doubling the
    // same distance either way); the value box and the arrow keys still go in steps of the value
    const N = 1000;
    const pos = (v) => (log ? Math.round((Math.log(v / min) / Math.log(max / min)) * N) : v);
    const unpos = (p) => (log ? min * Math.pow(max / min, p / N) : p);
    const input = h('input', { type: 'range', min: log ? 0 : min, max: log ? N : max, step: log ? 1 : step, 'aria-label': aria || label });
    const val = h('input', { class: 'val', type: 'text', inputmode: 'decimal', 'aria-label': (aria || label) + ' value', spellcheck: 'false' });
    const lab = h('label', { title: (hint ? hint + '. ' : '') + 'Double-click to reset.' }, label);
    const dec = decimals(step);
    const fmt = (v) => (+v).toFixed(dec) + unit;
    const show = (v) => {
      input.value = pos(v);
      val.value = fmt(v);
      const lo = +input.min, hi = +input.max;
      input.style.setProperty('--p', clamp(((pos(v) - lo) / (hi - lo || 1)) * 100, 0, 100) + '%');
      if (log) input.setAttribute('aria-valuetext', fmt(v));
    };
    const apply = (v, doCommit) => {
      v = clamp(Math.round(v / step) * step, min, max);
      v = +v.toFixed(dec);
      set(v);
      show(v);
      if (onInput) onInput(v);
      requestRender();
      if (doCommit && commitOnChange) commit();
    };
    input.addEventListener('input', () => apply(unpos(+input.value), false));
    input.addEventListener('change', () => { if (commitOnChange) commit(); });
    input.addEventListener('pointerdown', () => { dragging = true; });
    if (log) {
      input.addEventListener('keydown', (e) => {
        const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
        if (!d) return;
        e.preventDefault();
        apply(get() + d * step, true);
      });
    }
    val.addEventListener('change', () => {
      const v = parseFloat(val.value);
      apply(isNaN(v) ? get() : v, true);
    });
    val.addEventListener('keydown', (e) => { if (e.key === 'Enter') val.blur(); });
    if (def !== undefined) lab.addEventListener('dblclick', () => apply(def, true));
    bindings.push({ sync: () => show(get()) });
    show(get());
    return h('div', { class: 'row' }, lab, input, val);
  }

  function segRow({ label, options, get, set, onChange }) {
    const btns = options.map((o) =>
      h('button', {
        type: 'button',
        'aria-pressed': 'false',
        onclick: () => { set(o.value); show(); if (onChange) onChange(o.value); requestRender(); commit(); },
      }, o.label)
    );
    const show = () => btns.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === get())));
    bindings.push({ sync: show });
    show();
    return h('div', { class: 'row wide' }, h('label', null, label), h('div', { class: 'seg' }, btns));
  }

  // Several options that can each be on or off (e.g. which kinds of mark to draw).
  function multiRow({ label, options, get, set, hint }) {
    const btns = options.map((o) =>
      h('button', {
        type: 'button',
        'aria-pressed': 'false',
        title: o.title || o.label,
        'aria-label': o.title || o.label,
        onclick: () => {
          const cur = get() || [];
          set(cur.includes(o.value) ? cur.filter((x) => x !== o.value) : options.map((q) => q.value).filter((x) => x === o.value || cur.includes(x)));
          show(); requestRender(); commit();
        },
      }, o.label)
    );
    const show = () => { const cur = get() || []; btns.forEach((b, i) => b.setAttribute('aria-pressed', String(cur.includes(options[i].value)))); };
    bindings.push({ sync: show });
    show();
    return h('div', { class: 'row wide', title: hint || '' }, h('label', null, label), h('div', { class: 'seg multi' }, btns));
  }

  function toggleRow({ label, aria, cls, get, set, hint, onChange }) {
    const sw = h('button', { class: 'switch', role: 'switch', type: 'button', 'aria-label': aria || label });
    const show = () => sw.setAttribute('aria-checked', String(!!get()));
    sw.addEventListener('click', () => { set(!get()); show(); if (onChange) onChange(); requestRender(); commit(); });
    bindings.push({ sync: show });
    show();
    return h('div', { class: 'row wide' + (cls ? ' ' + cls : ''), title: hint || '' }, h('label', null, label), sw);
  }

  // A short text setting (e.g. Atlas's own characters): redraws as you type, one undo step per edit.
  function textRow({ label, hint, placeholder, maxLength = 64, get, set }) {
    const input = h('input', { class: 'txt', type: 'text', spellcheck: 'false', autocomplete: 'off', maxlength: maxLength, placeholder: placeholder || '', 'aria-label': label, title: hint || '' });
    const show = () => { if (document.activeElement !== input) input.value = get(); };
    input.addEventListener('input', () => { set(input.value); requestRender(); });
    input.addEventListener('change', () => { set(input.value); requestRender(); commit(); });
    bindings.push({ sync: show });
    show();
    return h('div', { class: 'row wide' }, h('label', { title: hint || '' }, label), input);
  }

  function selectRow({ label, aria, hint, options, get, set, onChange }) {
    const sel = h('select', { class: 'sel', 'aria-label': aria || label }, options.map((o) => h('option', { value: o.value }, o.label)));
    const show = () => { sel.value = String(get()); };
    sel.addEventListener('change', () => { set(sel.value); if (onChange) onChange(sel.value); requestRender(); commit(); });
    bindings.push({ sync: show });
    show();
    return h('div', { class: 'row wide', title: hint || '' }, h('label', null, label), sel);
  }

  function section(key, title, nodes, open = true) {
    const isOpen = collapsed[key] === undefined ? open : !collapsed[key];
    const sec = h('section', { class: 'sec' + (isOpen ? '' : ' closed'), 'data-sec': key });
    const head = h('button', { class: 'sec-head', type: 'button', 'aria-expanded': String(isOpen) }, h('span', null, title), icon('chev'));
    head.addEventListener('click', () => {
      const closed = sec.classList.toggle('closed');
      collapsed[key] = closed;
      head.setAttribute('aria-expanded', String(!closed));
    });
    sec.append(head, h('div', { class: 'sec-body' }, nodes));
    return sec;
  }

  /* ---- color section ---- */
  let swatchWrap, paletteWrap;
  let dragFrom = -1;

  function renderSwatches() {
    if (!swatchWrap) return;
    const n = S.colors.length;
    const roles = tool.inks.roles(n);
    const canRemove = n > tool.inks.min;
    const cards = S.colors.map((c, i) => {
      const color = h('input', { type: 'color', value: c.toLowerCase(), 'aria-label': 'Edit ' + roles[i] + ' color' });
      const chip = h('label', { class: 'chip', style: `background:${c}`, title: `${roles[i]}: click to edit, drag onto another card to swap` }, color);
      const hex = h('input', { class: 'hex', value: c, spellcheck: 'false', 'aria-label': roles[i] + ' hex' });
      color.addEventListener('input', () => {
        S.colors[i] = PL.color.normHex(color.value);
        chip.style.background = S.colors[i];
        hex.value = S.colors[i];
        requestRender();
      });
      color.addEventListener('change', commit);
      hex.addEventListener('change', () => {
        const v = PL.color.normHex(hex.value);
        if (v) { S.colors[i] = v; renderSwatches(); requestRender(); commit(); } else hex.value = S.colors[i];
      });
      hex.addEventListener('keydown', (e) => { if (e.key === 'Enter') hex.blur(); });
      const lock = h('button', {
        class: 'lock',
        type: 'button',
        'aria-pressed': String(!!S.locks[i]),
        title: S.locks[i] ? 'Locked: new colors won’t change it' : 'Lock this color',
        'aria-label': 'Lock ' + roles[i],
        onclick: (e) => { e.preventDefault(); e.stopPropagation(); S.locks[i] = !S.locks[i]; renderSwatches(); commit(); },
      }, icon(S.locks[i] ? 'lock' : 'unlock'));
      const del = canRemove
        ? h('button', {
          class: 'del',
          type: 'button',
          title: 'Remove this color',
          'aria-label': 'Remove ' + roles[i],
          onclick: (e) => { e.preventDefault(); e.stopPropagation(); removeColor(i); },
        }, icon('x'))
        : null;
      const sw = h('div', { class: 'sw', draggable: 'true' }, h('div', { class: 'card' }, chip, lock, del), hex, h('span', { class: 'role' }, roles[i]));
      sw.addEventListener('dragstart', (e) => { dragFrom = i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c); });
      sw.addEventListener('dragover', (e) => { e.preventDefault(); sw.classList.add('drag-over'); });
      sw.addEventListener('dragleave', () => sw.classList.remove('drag-over'));
      sw.addEventListener('drop', (e) => {
        e.preventDefault();
        sw.classList.remove('drag-over');
        if (dragFrom < 0 || dragFrom === i) return;
        const t = S.colors[i]; S.colors[i] = S.colors[dragFrom]; S.colors[dragFrom] = t;
        const l = S.locks[i]; S.locks[i] = S.locks[dragFrom]; S.locks[dragFrom] = l;
        dragFrom = -1;
        renderSwatches();
        requestRender();
        commit();
      });
      return sw;
    });
    if (n < tool.inks.max) {
      cards.push(h('div', { class: 'sw' },
        h('div', { class: 'card' }, h('button', { class: 'add-card', type: 'button', title: 'Add a color', 'aria-label': 'Add a color', onclick: addColor }, icon('plus'))),
        h('span', { class: 'hex', 'aria-hidden': 'true' }, ' '),
        h('span', { class: 'role' }, 'Add')
      ));
    }
    swatchWrap.replaceChildren(...cards);
  }

  function paletteButton(p, mine, idx) {
    const btn = h('button', { class: 'pal', type: 'button', title: `${p.name} — ${p.colors.join(' ')}`, onclick: () => { applyColors(p.colors); afterChange(); } },
      h('div', { class: 'bar' }, p.colors.map((c) => h('i', { style: `background:${c}` }))),
      h('span', null, p.name)
    );
    if (mine) {
      btn.append(h('span', {
        class: 'del',
        role: 'button',
        title: 'Delete palette',
        onclick: (e) => { e.stopPropagation(); userData.palettes.splice(idx, 1); markDirty(); renderPalettes(); },
      }, '×'));
    }
    return btn;
  }

  // My palettes: up to 5, kept for the whole app, so every style shows the same ones (Save app copy keeps
  // them for next time). Click one to use it; × deletes it.
  const MAX_PALETTES = 5;
  function renderPalettes() {
    if (!paletteWrap) return;
    const mine = userData.palettes;
    paletteWrap.replaceChildren(
      ...(mine.length ? [h('div', { class: 'sub' }, 'My palettes', h('span', null, `${mine.length} of ${MAX_PALETTES}`)), h('div', { class: 'palettes' }, mine.map((p, i) => paletteButton(p, true, i)))] : []),
      h('div', { class: 'sub' }, 'Presets'),
      h('div', { class: 'palettes' }, tool.palettes.map((p) => paletteButton(p, false)))
    );
  }

  function colorSection() {
    swatchWrap = h('div', { class: 'swatches' });
    paletteWrap = h('div', { style: 'display:grid;gap:8px' });
    const paste = h('input', { class: 'txt', placeholder: 'Paste hex codes…', spellcheck: 'false', 'aria-label': 'Paste hex codes' });
    const applyPaste = () => {
      const hexes = PL.color.extractHexes(paste.value);
      if (!hexes.length) return toast('No hex codes found — try “#0B1220 #22D3EE …”', 'err');
      applyColors(hexes);
      afterChange();
      toast(`Applied ${hexes.length} color${hexes.length > 1 ? 's' : ''}`);
    };
    paste.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyPaste(); });
    paste.addEventListener('paste', () => setTimeout(applyPaste, 0));

    const name = h('input', { class: 'txt', placeholder: 'Name this palette', spellcheck: 'false', 'aria-label': 'Palette name' });
    const savePal = () => {
      const same = userData.palettes.find((p) => p.colors.join() === S.colors.join());
      if (same) return toast(`These colors are already saved as “${same.name}”`);
      if (userData.palettes.length >= MAX_PALETTES) return toast(`You can keep ${MAX_PALETTES} palettes. Delete one (×) to save another.`, 'err');
      const nm = (name.value || '').trim() || 'My palette ' + (userData.palettes.length + 1);
      userData.palettes.unshift({ name: nm.slice(0, 40), colors: S.colors.slice() });
      name.value = '';
      markDirty();
      renderPalettes();
      toast(`Saved “${nm}” to My palettes (${userData.palettes.length} of ${MAX_PALETTES}), in every style`);
    };
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') savePal(); });

    renderSwatches();
    renderPalettes();
    return section('color', 'Color', [
      swatchWrap,
      ...tool.params.filter((d) => d.section === 'Color').map(paramRow),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', onclick: newColors, title: 'New colors (C)' }, icon('drop'), 'New', h('kbd', null, 'C')),
        h('button', { class: 'btn', type: 'button', onclick: rotateColors, title: 'Rotate colors: each color moves along to the next role (R)' }, icon('rotate'), 'Rotate', h('kbd', null, 'R')),
        h('button', { class: 'btn', type: 'button', onclick: invertColors, title: 'Swap light and dark' }, icon('invert'), 'Invert')
      ),
      h('div', { class: 'paste' }, paste, h('button', { class: 'btn', type: 'button', onclick: applyPaste }, 'Apply')),
      h('p', { class: 'note' }, tool.inks.hint ? [h('b', null, tool.inks.hint), ' '] : null, `Click a card to edit it, × removes it, + adds one (${tool.inks.min}–${tool.inks.max} colors). Paste hex codes to use them as-is. Drag a card onto another to swap. Locked colors never change.`),
      h('div', { class: 'paste' }, name, h('button', { class: 'btn', type: 'button', onclick: savePal }, 'Save')),
      paletteWrap,
    ]);
  }

  /* ---- general: Rotation and Size, for every style ---- */
  function generalSection() {
    const v = () => S.view, dv = defaultView(tool); // (double-clicking a label goes back to the style's own)
    return section('general', 'General', [
      rangeRow({ label: 'Rotation', aria: 'Pattern rotation', min: VIEW.rotate[0], max: VIEW.rotate[1], step: 1, unit: '°', def: dv.rotate, hint: 'Turns the whole pattern on the artboard (Dither and Grain stay as they are)', get: () => v().rotate, set: (x) => (v().rotate = x) }),
      rangeRow({ label: 'Size', aria: 'Pattern size', min: VIEW.size[0], max: VIEW.size[1], step: 1, unit: '%', def: dv.size, log: true, hint: 'Zooms the whole pattern in or out: zoomed out you see more of it (never a repeat), zoomed in it is drawn again in full detail', get: () => v().size, set: (x) => (v().size = x) }),
    ]);
  }

  /* ---- effects / animation / output / export / library ---- */
  // Effects: the same Dither and Grain for every style, each with its switch, settings and Reset
  // (back to this style's own settings; the switch stays as it is). Changing a setting while its
  // effect is off switches the effect on, so every change shows.
  function effectsSection() {
    const fx = () => S.fx;
    const fxDef = (k) => Object.assign({}, PL.fx.DEFAULTS, tool.defaults.fx)[k]; // double-click a label: this one only
    const wake = (flag) => () => { if (!fx()[flag]) { fx()[flag] = true; syncControls(); } };
    const group = (flag, name, keys, rows) => {
      const reset = h('button', {
        class: 'btn fx-reset', type: 'button', title: `Back to this style's default ${name} settings (the switch stays as it is)`, 'aria-label': `Reset ${name}`,
        onclick: () => { for (const k of keys) fx()[k] = fxDef(k); syncControls(); requestRender(); commit(); },
      }, icon('reset'), 'Reset');
      const g = h('div', { class: 'fx-group', 'data-fx': name }, rows, h('div', { class: 'btn-row' }, reset));
      const show = () => g.classList.toggle('off', !fx()[flag]);
      bindings.push({ sync: show });
      show();
      return g;
    };
    const dither = wake('ditherOn'), grain = wake('grainOn');
    return section('effects', 'Effects', [
      group('ditherOn', 'dither', PL.fx.DITHER_KEYS, [
        toggleRow({ label: 'Dither', cls: 'fx-head', hint: 'Dither on / off', get: () => fx().ditherOn, set: (v) => (fx().ditherOn = v), onChange: syncControls }),
        selectRow({ label: 'Pattern', aria: 'Dither pattern', hint: 'Bayer: an even, ordered dot pattern (8 the finest, 2 the coarsest); Noise: dots at random', options: PL.fx.PATTERNS, get: () => fx().ditherPattern, set: (v) => (fx().ditherPattern = v), onChange: dither }),
        rangeRow({ label: 'Pixel size', min: 1, max: 10, step: 1, unit: 'px', def: fxDef('ditherPx'), hint: tool.paint ? 'Size of the dither dots' : 'Size of the dither dots (and of the pixels of a Pixel render)', get: () => fx().ditherPx, set: (v) => (fx().ditherPx = v), onInput: dither }),
        rangeRow({ label: 'Tone', min: 0, max: 8, step: 1, def: fxDef('tones'), hint: 'How many colors the dither prints with: 0 = your darkest and lightest color, 1 = only your colors, 2–8 = levels of red, green and blue', get: () => fx().tones, set: (v) => (fx().tones = v), onInput: dither }),
        rangeRow({ label: 'Amount', aria: 'Dither amount', min: 0, max: 100, step: 1, unit: '%', def: fxDef('ditherAmt'), hint: 'How much of the dithered picture shows over the original', get: () => fx().ditherAmt, set: (v) => (fx().ditherAmt = v), onInput: dither }),
      ]),
      group('grainOn', 'grain', PL.fx.GRAIN_KEYS, [
        toggleRow({ label: 'Grain', cls: 'fx-head', hint: 'Grain on / off', get: () => fx().grainOn, set: (v) => (fx().grainOn = v), onChange: syncControls }),
        selectRow({ label: 'Blend mode', aria: 'Grain blend mode', hint: 'How the grain mixes with your colors', options: PL.fx.BLENDS, get: () => fx().grainBlend, set: (v) => (fx().grainBlend = v), onChange: grain }),
        rangeRow({ label: 'Size', aria: 'Grain size', min: 0, max: 5, step: 0.1, unit: 'px', def: fxDef('grainSize'), hint: 'Grain size (px at a 1080 px long edge)', get: () => fx().grainSize, set: (v) => (fx().grainSize = v), onInput: grain }),
        rangeRow({ label: 'Specks', aria: 'Grain specks', min: 0, max: 100, step: 1, unit: '%', def: fxDef('grainSpecks'), hint: 'Dust specks', get: () => fx().grainSpecks, set: (v) => (fx().grainSpecks = v), onInput: grain }),
        rangeRow({ label: 'Roughness', aria: 'Grain roughness', min: 0, max: 100, step: 1, unit: '%', def: fxDef('grainRough'), hint: 'How uneven the grain is: 0 even, higher clumps and blotches', get: () => fx().grainRough, set: (v) => (fx().grainRough = v), onInput: grain }),
        rangeRow({ label: 'Vignette', aria: 'Grain vignette', min: 0, max: 100, step: 1, unit: '%', def: fxDef('vignette'), hint: 'Darkens the corners', get: () => fx().vignette, set: (v) => (fx().vignette = v), onInput: grain }),
        rangeRow({ label: 'Amount', aria: 'Grain amount', min: 0, max: 100, step: 1, unit: '%', def: fxDef('grain'), hint: 'How strong the grain is', get: () => fx().grain, set: (v) => (fx().grain = v), onInput: grain }),
      ]),
    ]);
  }

  let frameSlider = null;
  function syncFrameSlider() { if (frameSlider) frameSlider.sync(); }
  function animSection() {
    const a = () => S.anim;
    const row = rangeRow({
      label: 'Frame', min: 0, max: 239, step: 1, hint: 'Pick the frame used for PNG / SVG export',
      get: () => frameIdx, set: (v) => { frameIdx = Math.min(v, Math.max(0, (a().frames | 0) - 1)); if (playing) setPlaying(false); },
      commitOnChange: false,
    });
    frameSlider = bindings[bindings.length - 1];
    const rangeInput = row.querySelector('input[type=range]');
    const origSync = frameSlider.sync;
    frameSlider.sync = () => { rangeInput.max = Math.max(1, (a().frames | 0) - 1); origSync(); };
    frameSlider.sync();
    return section('anim', 'Animate', [
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', id: 'playBtn2', type: 'button', onclick: () => setPlaying(!playing) }, icon('play'), 'Play / pause', h('kbd', null, 'P'))
      ),
      ...tool.params.filter((d) => d.section === 'Animate').map(paramRow),
      rangeRow({ label: tool.animLabel || 'Amount', min: 0, max: 2, step: 0.05, def: tool.defaults.anim.amount, hint: tool.animHint || 'How much the artwork moves over a loop', get: () => a().amount, set: (v) => (a().amount = v) }),
      rangeRow({ label: 'Speed', min: 1, max: 30, step: 1, unit: ' fps', def: tool.defaults.anim.fps, hint: 'Frames per second', get: () => a().fps, set: (v) => { a().fps = v; if (playing) setPlaying(true); } }),
      rangeRow({ label: 'Loop frames', min: 2, max: 240, step: 1, def: tool.defaults.anim.frames, hint: 'Frames in one seamless loop', get: () => a().frames, set: (v) => { a().frames = v; frameIdx = Math.min(frameIdx, v - 1); syncFrameSlider(); } }),
      row,
      h('p', { class: 'note' }, 'Loops are seamless: the last frame flows into the first. Speed is in frames per second.'),
    ]);
  }

  function outputSection() {
    const o = () => S.output;
    const custom = h('div', { class: 'dims' });
    const cw = h('input', { class: 'txt', type: 'number', min: 16, max: 8192, 'aria-label': 'Width in pixels' });
    const ch = h('input', { class: 'txt', type: 'number', min: 16, max: 8192, 'aria-label': 'Height in pixels' });
    custom.append(cw, '×', ch);
    const syncCustom = () => {
      custom.style.display = o().ratio === 'custom' ? 'grid' : 'none';
      cw.value = o().cw;
      ch.value = o().ch;
      sizeRow.style.display = o().ratio === 'custom' ? 'none' : '';
    };
    const onDims = () => {
      o().cw = clamp(Math.round(+cw.value) || 1080, 16, 8192);
      o().ch = clamp(Math.round(+ch.value) || 1080, 16, 8192);
      syncCustom();
      layoutView();
      requestRender();
      commit();
    };
    cw.addEventListener('change', onDims);
    ch.addEventListener('change', onDims);
    const sizeRow = selectRow({
      label: 'Size', options: SIZES.map((s) => ({ value: String(s), label: `${s} px long edge` })),
      get: () => o().size, set: (v) => (o().size = +v), onChange: updateStatus,
    });
    bindings.push({ sync: syncCustom });
    const out = section('output', 'Frame', [
      selectRow({
        label: 'Ratio', options: RATIOS.map((r) => ({ value: r[0], label: r[3] })),
        get: () => o().ratio, set: (v) => (o().ratio = v), onChange: () => { syncCustom(); layoutView(); },
      }),
      sizeRow,
      custom,
      tool.paint ? null : segRow({ label: 'Render', options: [{ value: 'smooth', label: 'Smooth' }, { value: 'pixel', label: 'Pixel' }], get: () => o().render, set: (v) => (o().render = v) }),
      tool.opaque ? null : toggleRow({ label: 'Transparent', hint: 'Export without the background color', get: () => o().transparent, set: (v) => (o().transparent = v) }),
      tool.paint ? null : h('p', { class: 'note' }, h('b', null, 'Pixel'), ' snaps the art to a grid (Pixel size in Effects) using only your palette colors.'),
    ]);
    syncCustom();
    return out;
  }

  function exportSection() {
    const o = () => S.output;
    const canMP4 = CAN_ENCODE || !!VIDEO_MIME;
    return section('export', 'Export', [
      h('div', { class: 'sub' }, 'Picture'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn primary', type: 'button', onclick: exportPNG, title: 'Save the picture as PNG (S)', 'aria-label': 'Save PNG' }, icon('down'), 'PNG', h('kbd', null, 'S')),
        h('button', { class: 'btn', type: 'button', onclick: exportSVG, title: 'Save the picture as SVG (V)', 'aria-label': 'Save SVG' }, icon('down'), 'SVG', h('kbd', null, 'V'))
      ),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', onclick: copyPNG, title: 'Copy PNG to clipboard' }, icon('copy'), 'Copy PNG'),
        h('button', { class: 'btn', type: 'button', onclick: copySVG, title: 'Copy SVG code — paste into Figma' }, icon('copy'), 'Copy SVG')
      ),
      h('p', { class: 'note' }, tool.paint ? `${tool.name} is a pixel texture: its SVGs hold the picture as an image.` : 'SVG stays clean vector: Dither and Grain show in PNG and MP4.'),
      h('div', { class: 'sub' }, 'Animation'),
      selectRow({ label: 'Size', aria: 'Animation size', options: [720, 1080, 1440].map((s) => ({ value: String(s), label: `${s} px long edge` })), get: () => o().videoSize, set: (v) => (o().videoSize = +v) }),
      rangeRow({ label: 'Loops', aria: 'MP4 loops', min: 1, max: 10, step: 1, def: 3, hint: 'How many times the loop plays in the MP4 (an animated SVG loops forever)', get: () => o().loops, set: (v) => (o().loops = v) }),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', onclick: exportAnimSVG, title: 'Save the loop as an animated SVG', 'aria-label': 'Save animated SVG' }, icon('down'), 'SVG'),
        h('button', { class: 'btn', type: 'button', onclick: exportMP4, disabled: !canMP4, title: canMP4 ? 'Save the loop as an MP4 video' : 'This browser can’t make video', 'aria-label': 'Save MP4' }, icon('video'), 'MP4')
      ),
      h('p', { class: 'note' }, 'An animated SVG loops forever in any browser; the MP4 plays the loop Loops times.'),
    ]);
  }

  function librarySection() {
    const file = h('input', { type: 'file', accept: '.json,application/json,text/plain', style: 'display:none', tabindex: '-1', 'aria-hidden': 'true' });
    file.addEventListener('change', () => { if (file.files && file.files[0]) openPatternFile(file.files[0]); file.value = ''; });
    return section('library', 'Library', [
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', onclick: savePattern, title: 'Download this pattern’s colors and settings as a file' }, icon('down'), 'Save pattern'),
        h('button', { class: 'btn', type: 'button', onclick: () => file.click(), title: 'Open a pattern you saved' }, icon('upload'), 'Upload pattern')
      ),
      h('p', { class: 'note' }, 'Save pattern downloads this pattern’s colors and settings as a small file. Upload pattern opens it again any time, on any computer.'),
      h('p', { class: 'note' }, 'Your palettes and kept variations live in this window. To keep them for next time, save a copy of the app with them built in, then replace your old file.'),
      h('button', { class: 'btn primary', type: 'button', onclick: saveAppCopy }, icon('file'), 'Save app copy', h('span', { id: 'libBadge', title: 'Unsaved changes', style: 'display:none;width:7px;height:7px;border-radius:50%;background:#111;margin-left:2px' })),
      file,
    ]);
  }

  // Every shortcut, listed in the output column under Export (the same list as the ? dialog).
  function shortcutsSection() {
    const list = SHORTCUTS.filter(([k]) => k !== '?'); // ? opens this list as a dialog
    return section('keys', 'Shortcuts', [h('div', { class: 'keys' }, list.flatMap(([k, d]) => [h('kbd', null, k), h('span', null, d)]))]);
  }

  // One control row for a tool parameter. `when(params)` (optional) shows the row only
  // while it applies, e.g. Edge pull only in Stipple's Contour mode.
  function paramRow(d) {
    const get = () => S.params[d.key];
    const set = (v) => (S.params[d.key] = v);
    let row;
    if (d.type === 'seg') row = segRow({ label: d.label, options: d.options, get, set, onChange: syncControls });
    else if (d.type === 'select') row = selectRow({ label: d.label, options: d.options, get, set, onChange: syncControls });
    else if (d.type === 'multi') row = multiRow({ label: d.label, options: d.options, get, set, hint: d.hint });
    else if (d.type === 'toggle') row = toggleRow({ label: d.label, get, set, hint: d.hint, onChange: syncControls });
    else if (d.type === 'text') row = textRow({ label: d.label, hint: d.hint, placeholder: d.placeholder, maxLength: d.maxLength || 64, get, set });
    else row = rangeRow({ label: d.label, aria: d.aria, min: d.min, max: d.max, step: d.step || 1, unit: d.unit || '', def: d.def, hint: d.hint, get, set });
    if (d.when) {
      const show = () => { row.style.display = d.when(S.params) ? '' : 'none'; };
      bindings.push({ sync: show });
      show();
    }
    return row;
  }

  function toolSections() {
    const groups = [];
    for (const d of tool.params) {
      if (d.section === 'Animate' || d.section === 'Color') continue; // shown in those sections
      let g = groups.find((x) => x.name === d.section);
      if (!g) groups.push((g = { name: d.section, defs: [] }));
      g.defs.push(d);
    }
    return groups.map((g) => section('tool-' + tool.id + '-' + g.name, g.name, g.defs.map(paramRow)));
  }

  // The style's original look: its first seed, settings, colors, effects and animation, and its frame.
  // Default (D) keeps your frame size and export settings (keepFrame); ← undoes either.
  function freshLook(keepFrame) {
    const fresh = defaultState(tool, firstSeed(tool.id));
    if (keepFrame) fresh.output = Object.assign({}, S.output, { render: fresh.output.render, transparent: fresh.output.transparent });
    const changed = JSON.stringify(fresh) !== JSON.stringify(S);
    S = states[tool.id] = fresh;
    frameIdx = 0;
    lastPresetIdx = -1;
    return changed;
  }
  function restoreDefault() {
    freshLook(true);
    afterStateReplaced();
    commit();
    toast(`Back to the default ${tool.name}. Press ← to undo.`);
  }

  function buildPanel() {
    bindings = [];
    const panel = $('#panel');
    panel.replaceChildren(
      h('div', { class: 'panel-head' },
        h('b', null, 'Settings'),
        h('button', { class: 'btn ghost', type: 'button', onclick: restoreDefault, title: 'Default: back to this style\'s original look — colors, settings and seed (D)' }, icon('reset'), 'Default', h('kbd', null, 'D'))
      ),
      h('p', { class: 'note about' }, h('b', null, tool.name + ' — '), tool.about),
      ...toolSections(),
      generalSection(),
      colorSection(),
      effectsSection(),
      animSection()
    );
    // the right column: what comes out (the frame and the files), the shortcuts, then the library
    $('#panelOut').replaceChildren(
      h('div', { class: 'panel-head' }, h('b', null, 'Output')),
      h('dl', { class: 'out-summary', id: 'outSummary', 'aria-label': 'Output summary' }),
      outputSection(),
      exportSection(),
      shortcutsSection(),
      librarySection()
    );
    // Stop the "low quality while dragging" mode when any pointer is released.
    updateLibraryBadge();
  }
  window.addEventListener('pointerup', () => { if (dragging) { dragging = false; requestRender(); } });
  window.addEventListener('pointercancel', () => { dragging = false; });

  /* ------------------------------------------------------------ top bar */
  function buildActions() {
    const seedIn = h('input', { value: S.seed, inputmode: 'numeric', 'aria-label': 'Seed', title: 'Seed — type a number to revisit a variation' });
    seedIn.addEventListener('change', () => {
      const v = Math.round(+seedIn.value);
      if (v >= 1) { S.seed = v; afterChange(); } else seedIn.value = S.seed;
    });
    seedIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') seedIn.blur(); });
    bindings.push({ sync: () => (seedIn.value = S.seed) });
    $('#actions').replaceChildren(
      h('button', { class: 'btn icon ghost', id: 'backBtn', type: 'button', title: 'Previous (←)', 'aria-label': 'Previous variation', onclick: () => stepHistory(-1) }, icon('back')),
      h('button', { class: 'btn icon ghost', id: 'fwdBtn', type: 'button', title: 'Next (→)', 'aria-label': 'Next variation', onclick: () => stepHistory(1) }, icon('fwd')),
      h('label', { class: 'seed' }, '#', seedIn),
      h('span', { class: 'sep' }),
      h('button', { class: 'btn primary', type: 'button', onclick: newVariation, title: 'New variation (Space)' }, icon('dice'), h('span', { class: 'lbl' }, 'New variation'), h('kbd', null, 'Space')),
      h('button', { class: 'btn', type: 'button', onclick: reshuffle, title: 'New seed: same settings, new shapes (N)' }, icon('shuffle'), h('span', { class: 'lbl' }, 'New seed')),
      h('button', { class: 'btn', type: 'button', onclick: newColors, title: 'New colors (C)' }, icon('drop'), h('span', { class: 'lbl' }, 'Colors')),
      h('button', { class: 'btn', id: 'playBtn', type: 'button', onclick: () => setPlaying(!playing), title: 'Play / pause (P)' }),
      h('button', { class: 'btn', type: 'button', onclick: keep, title: 'Keep this variation (K)' }, icon('keep'), h('span', { class: 'lbl' }, 'Keep'))
    );
    setPlaying(playing);
    updateHistoryButtons();
  }
  function updateHistoryButtons() {
    const H = hist[tool.id];
    const b = $('#backBtn'), f = $('#fwdBtn');
    if (b) b.disabled = !(H.idx > 0);
    if (f) f.disabled = !(H.idx < H.list.length - 1);
    renderGens();
  }

  // The dots under the artboard: one per generation in this style's history (what ← and → step
  // through), the one showing filled; a click jumps to it. A long history shows the dozen around the
  // one showing, its end dots smaller where it goes on.
  const GENS_MAX = 12;
  function renderGens() {
    const el = $('#gens');
    if (!el) return;
    const H = hist[tool.id], n = H.list.length, cur = H.idx;
    let a = 0, b = n;
    if (n > GENS_MAX) { a = clamp(cur - (GENS_MAX >> 1), 0, n - GENS_MAX); b = a + GENS_MAX; }
    const dots = [];
    for (let i = a; i < b; i++) {
      const more = (i === a && a > 0) || (i === b - 1 && b < n);
      const label = `Generation ${i + 1} of ${n}`;
      dots.push(h('button', { type: 'button', class: more ? 'more' : '', 'data-gen': String(i), 'aria-current': String(i === cur), 'aria-label': label, title: i === cur ? label + ' (showing)' : label + ' (← →)', onclick: () => goHistory(i) }, h('i')));
    }
    el.replaceChildren(...dots);
  }

  /* ------------------------------------------------------------ hover previews */
  // Play a state's loop with draw(frame) while the pointer (or keyboard focus)
  // rests on `el`; back to frame 1 when it leaves. (`el` carries the class "playing" meanwhile.)
  function hoverLoop(el, draw, st) {
    let timer = 0, f = 0;
    const wait = () => 1000 / Math.max(1, st.anim.fps || 12);
    const start = () => {
      if (timer) return;
      el.classList.add('playing');
      const step = () => { f = (f + 1) % Math.max(1, st.anim.frames | 0); draw(f); timer = setTimeout(step, wait()); };
      timer = setTimeout(step, wait());
    };
    const stop = () => { clearTimeout(timer); timer = 0; el.classList.remove('playing'); if (f) { f = 0; draw(0); } };
    // Not on touch screens: there a tap would first count as hover, and some phones then skip the tap
    // (the Home cards play there on their own, see autoPlayCards).
    if (!NO_HOVER) {
      el.addEventListener('mouseenter', start);
      el.addEventListener('mouseleave', stop);
      el.addEventListener('focus', start);
      el.addEventListener('blur', stop);
    }
    return { start, stop, get playing() { return !!timer; } };
  }

  /* ------------------------------------------------------------ style menu */
  // The style switcher at the top of the settings: previous, every style by name, next ([ and ] do the same).
  let styleSel = null;
  function stepTool(d) { go(TOOLS[(TOOLS.indexOf(tool) + d + TOOLS.length) % TOOLS.length].id); }
  function buildStylePick() {
    const el = $('#stylePick');
    if (!el) return;
    styleSel = h('select', { class: 'sel', 'aria-label': 'Pattern style', title: 'Pattern style ([ and ] step through them)' },
      TOOLS.map((t, i) => h('option', { value: t.id }, `${String(i + 1).padStart(2, '0')}  ${t.name}`)));
    styleSel.addEventListener('change', () => { styleSel.blur(); go(styleSel.value); });
    el.replaceChildren(
      h('button', { class: 'btn icon ghost', type: 'button', title: 'Previous style ([)', 'aria-label': 'Previous style', onclick: () => stepTool(-1) }, icon('back')),
      styleSel,
      h('button', { class: 'btn icon ghost', type: 'button', title: 'Next style (])', 'aria-label': 'Next style', onclick: () => stepTool(1) }, icon('fwd')));
  }

  /* ------------------------------------------------------------ routing
     #/ = home, #/<tool id> = that tool. Hash routing works from a local file,
     and the browser's back / forward buttons move between views. */
  const appEl = document.querySelector('.app');
  let page = 'tool'; // 'home' or 'tool'

  function routeId() {
    const id = decodeURIComponent(location.hash.replace(/^#\/?/, '')).trim();
    return id && PL.tools.get(id) ? id : '';
  }
  // go() routes at once (it doesn't wait for the hash to change), so the name, Home and the cards work
  // the same everywhere, also when the app runs inside a frame or a site builder's embed.
  let routedHash = null; // the hash go() set itself: its hashchange is skipped
  function go(id) {
    const target = id ? '#/' + id : '#/';
    if (location.hash !== target) {
      routedHash = target;
      try { location.hash = target; } catch (e) { routedHash = null; } // a locked-down frame: still routes
    }
    applyRoute(id || '');
  }
  function applyRoute(forced) {
    const id = typeof forced === 'string' ? (PL.tools.get(forced) ? forced : '') : routeId();
    if (id) openTool(id);
    else showHome();
  }
  window.addEventListener('hashchange', () => {
    if (routedHash !== null && location.hash === routedHash) { routedHash = null; return; }
    routedHash = null;
    applyRoute(); // Back / Forward, or a hash typed in
  });
  // Links inside the app (#/…) go through go() instead of navigating: inside an embed "#/" would
  // otherwise load the host page in its place.
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target && e.target.closest ? e.target.closest('a[href^="#/"]') : null;
    if (!a) return;
    e.preventDefault();
    let id = '';
    try { id = decodeURIComponent(a.getAttribute('href').slice(2)).trim(); } catch (err) { /* keep Home */ }
    go(id);
  });

  function markNav() {
    $('#homeNav').setAttribute('aria-current', String(page === 'home'));
    if (styleSel && tool) styleSel.value = tool.id;
  }

  // Every style opens on its default look, the one its preview shows (from Home, the style menu, the keys
  // or the browser's back / forward). The look it had before stays in its history: ← brings it back.
  // Not when the file first opens (a saved copy resumes where it was left) or a kept variation loads.
  let booted = false, keepOnOpen = null;
  function openTool(id) {
    const tl = PL.tools.get(id);
    if (!tl) return showHome();
    stopCardAnimations();
    const entering = page !== 'tool' || tl.id !== tool.id;
    page = 'tool';
    appEl.classList.remove('is-home');
    alignKept();
    if (tl.id !== tool.id) {
      setPlaying(false);
      tool = tl;
      S = states[tool.id];
      frameIdx = 0;
      buildPanel();
      buildActions();
    }
    // Coming back to a style (from Home, the style menu, the keys or Back / Forward) always shows its default
    // look, the one its card shows, frame and all; the look it had goes into its history (← brings it back).
    let reset = false;
    if (entering && booted && keepOnOpen !== tl.id) {
      commit();
      reset = freshLook(false);
    }
    keepOnOpen = null;
    // On a phone the whole page scrolls: a style opens at the top, its preview in view (not wherever
    // the Home page had been scrolled to)
    if (entering) window.scrollTo(0, 0);
    showToolHeader();
    markNav();
    afterStateReplaced();
    commit();
    // Draw it now, before the page shows: the artboard never flashes the picture it had before
    if (entering) { renderPreview(); needsRender = false; }
    if (reset) toast(`${tool.name} opens on its default look. Press ← to get your last edit back.`);
  }

  function showHome() {
    if (page !== 'home') window.scrollTo(0, 0); // Home opens at its top (on a phone the whole page scrolls)
    page = 'home';
    setPlaying(false);
    appEl.classList.add('is-home');
    document.title = 'Pattern Studio';
    markNav();
    renderHome();
  }

  /* ------------------------------------------------------------ home page */
  let cardAnims = [];
  function stopCardAnimations() {
    if (cardObs) { cardObs.disconnect(); cardObs = null; }
    cardAnims.forEach((a) => a.stop());
    cardAnims = [];
  }

  // Phones and tablets can't hover, so there the card most in view plays its loop on its own (one at a
  // time, while at least half of it is on screen): every style's preview moves there too, at its
  // default settings (Strand at Intensity 2.00, say), as it does under the pointer on a computer.
  const NO_HOVER = !!(window.matchMedia && window.matchMedia('(hover: none)').matches);
  let cardObs = null;
  function autoPlayCards(pairs) {
    if (!NO_HOVER || typeof IntersectionObserver === 'undefined' || page !== 'home') return;
    const seen = new Map();
    let current = null;
    cardObs = new IntersectionObserver((entries) => {
      for (const e of entries) seen.set(e.target, e.isIntersecting ? e.intersectionRatio : 0);
      let best = null, top = 0.5;
      for (const [el, anim] of pairs) { const r = seen.get(el) || 0; if (r > top + 1e-6 || (!best && r >= top)) { top = r; best = anim; } }
      if (best === current) return;
      if (current) current.stop();
      current = best;
      if (current) current.start();
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
    for (const [el] of pairs) cardObs.observe(el);
  }

  function renderHome() {
    stopCardAnimations();
    const cards = TOOLS.map((t, i) => {
      const canvas = h('canvas', { 'aria-hidden': 'true' });
      const card = h('a', { class: 'tool-card', href: '#/' + t.id, 'data-tool': t.id, title: `Open ${t.name} (${i + 1})` },
        h('div', { class: 'tc-art' }, canvas, h('span', { class: 'tc-num' }, String(i + 1).padStart(2, '0')), h('span', { class: 'tc-play' }, 'Preview loop')),
        h('div', { class: 'tc-body' },
          h('div', { class: 'tc-title' }, h('b', null, t.name), h('span', { class: 'chip' }, t.kind)),
          h('p', null, t.about),
          h('span', { class: 'tc-open' }, 'Open', icon('fwd'))
        )
      );
      return { t, card, canvas };
    });
    // Search: the cards whose name holds what's typed, updated with every letter typed or deleted.
    // Enter opens the first one left; Escape clears the field.
    const search = h('input', { class: 'txt', type: 'search', id: 'homeSearch', placeholder: 'Search pattern styles', 'aria-label': 'Search pattern styles by name', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'go' });
    const none = h('p', { class: 'home-empty', role: 'status', hidden: '' });
    const filter = () => {
      const q = search.value.trim().toLowerCase();
      let shown = 0;
      for (const c of cards) {
        const hit = !q || c.t.name.toLowerCase().includes(q);
        c.card.hidden = !hit;
        if (hit) shown++;
      }
      none.hidden = shown > 0;
      none.textContent = shown ? '' : `No pattern style called “${search.value.trim()}”.`;
    };
    search.addEventListener('input', filter);
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const first = cards.find((c) => !c.card.hidden); if (first) { e.preventDefault(); go(first.t.id); } }
      else if (e.key === 'Escape' && search.value) { e.stopPropagation(); search.value = ''; filter(); }
    });
    $('#home').replaceChildren(
      h('header', { class: 'home-head' },
        h('div', { class: 'home-intro' },
          h('h1', null, 'Pattern Studio'),
          h('p', null, 'Generative pattern tool with over 20 different fully customizable designs to choose from. Create backgrounds for social media posts, websites, presentations or anything else you like, then export them as images, SVGs or seamless video loops. Pick a style to start. Works offline in your browser.'),
          h('div', { class: 'home-tools' }, h('label', { class: 'home-search' }, icon('search'), search), themeButton())
        ),
        h('div', { class: 'home-meta' }, h('i'), `${TOOLS.length} ${TOOLS.length === 1 ? 'style' : 'styles'} · available`)
      ),
      h('div', { class: 'tool-grid' }, cards.map((c) => c.card)),
      none,
      h('nav', { class: 'home-foot', 'aria-label': 'Links' }, footLink('GitHub', LINKS.github), h('span', { class: 'dot', 'aria-hidden': 'true' }), footLink('Contact', LINKS.contact))
    );
    requestAnimationFrame(alignKept);
    // Draw after layout so each preview matches its card size; hover plays the loop.
    // Cards always show each style's default look, whatever has been edited since.
    requestAnimationFrame(() => {
      const pairs = [];
      for (const c of cards) {
        const st = defaultState(c.t, firstSeed(c.t.id));
        const draw = (frame) => {
          const r = c.canvas.getBoundingClientRect();
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          const W = Math.max(40, Math.round(r.width * dpr)), H = Math.max(30, Math.round(r.height * dpr));
          if (c.canvas.width !== W) c.canvas.width = W;
          if (c.canvas.height !== H) c.canvas.height = H;
          try { renderInto(c.canvas.getContext('2d'), W, H, st, frame, { preview: true, opaque: true }); } catch (e) { /* decorative */ }
        };
        draw(0);
        const anim = hoverLoop(c.card, draw, st);
        cardAnims.push(anim);
        pairs.push([c.card, anim]);
      }
      autoPlayCards(pairs);
    });
  }

  // The links under the last row of cards. Fill these in: a web address (or mailto: for Contact).
  // While one is empty its link says it's coming soon instead of going anywhere.
  const LINKS = { github: '', contact: '' };
  function footLink(label, url) {
    const a = h('a', url ? { href: url, target: '_blank', rel: 'noopener noreferrer' } : { href: '#', 'data-soon': '' }, label);
    if (!url) a.addEventListener('click', (e) => { e.preventDefault(); toast(`The ${label} link is coming soon`); });
    return a;
  }

  // On Home the Kept strip lines up with the cards (the page's own margins and column).
  const keptEl = document.querySelector('section.kept');
  function alignKept() {
    if (!keptEl) return;
    const grid = page === 'home' && document.querySelector('#home .tool-grid');
    if (!grid) { keptEl.style.paddingLeft = keptEl.style.paddingRight = ''; return; }
    const r = grid.getBoundingClientRect(), k = keptEl.getBoundingClientRect();
    if (r.width < 10) return;
    keptEl.style.paddingLeft = Math.max(0, Math.round(r.left - k.left)) + 'px';
    keptEl.style.paddingRight = Math.max(0, Math.round(k.right - r.right)) + 'px';
  }
  new ResizeObserver(() => alignKept()).observe(document.querySelector('#home'));

  // Dark or light: the app always opens dark (nothing remembers it). Two switches, always in step: the
  // round one by the home search, and the one next to Home at the top of a style's settings (named there;
  // just its icon on a phone). Each shows a moon in dark mode and a sun in light mode; a click switches.
  let theme = 'dark';
  function setTheme(t) {
    theme = t === 'light' ? 'light' : 'dark';
    if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
    document.querySelectorAll('#themeBtn, #themeNav').forEach(showTheme);
  }
  function toggleTheme() { setTheme(theme === 'light' ? 'dark' : 'light'); }
  function showTheme(btn) {
    const light = theme === 'light';
    btn.replaceChildren(icon(light ? 'sun' : 'moon'));
    if (btn.id === 'themeNav') btn.append(h('span', { class: 'text' }, light ? 'Light mode' : 'Dark mode'));
    btn.title = light ? 'Light mode: click for dark' : 'Dark mode: click for light';
    btn.setAttribute('aria-label', light ? 'Light mode. Switch to dark mode' : 'Dark mode. Switch to light mode');
  }
  function themeButton() {
    const btn = h('button', { class: 'theme-btn', type: 'button', id: 'themeBtn' });
    btn.addEventListener('click', toggleTheme);
    showTheme(btn);
    return btn;
  }
  $('#themeNav').addEventListener('click', toggleTheme);
  showTheme($('#themeNav'));

  function showToolHeader() {
    $('#toolName').replaceChildren(tool.name, h('small', null, tool.kind.toUpperCase()));
    $('#toolAbout').textContent = tool.tagline;
    $('#toolAbout').title = tool.about;
    document.title = `${tool.name} — Pattern Studio`;
  }

  /* ------------------------------------------------------------ keyboard */
  const SHORTCUTS = [
    ['Space', 'New variation (or click the artboard)'],
    ['N', 'New seed — same settings, new shapes'],
    ['C', 'New colors (locked colors stay)'],
    ['R', 'Rotate colors — each moves along one role (locked colors stay)'],
    ['D', 'Default: back to the original look'],
    ['P', 'Play / pause the loop'],
    ['K', 'Keep this variation'],
    ['← →', 'Step back / forward through history'],
    ['S', 'Save PNG'],
    ['V', 'Save SVG'],
    ['H', 'Home: all pattern styles'],
    ['1 – 9, 0', 'Jump straight to a tool (0 is the tenth)'],
    ['[ ]', 'Previous / next tool'],
    ['?', 'This help'],
  ];
  function showHelp() {
    const keys = SHORTCUTS;
    modal.open([
      h('h2', null, 'Keyboard shortcuts'),
      h('div', { class: 'keys' }, keys.flatMap(([k, d]) => [h('kbd', null, k), h('span', null, d)])),
      h('p', { class: 'note', style: 'margin-top:14px' }, 'Tips: double-click any slider label to reset it. Click a value to type an exact number. Everything runs offline — nothing is uploaded.'),
      h('div', { class: 'foot' }, h('button', { class: 'btn', type: 'button', onclick: modal.close }, 'Close')),
    ]);
  }
  $('#helpBtn').addEventListener('click', showHelp);

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    const tag = (t.tagName || '').toLowerCase();
    const typing = (tag === 'input' && !['range', 'button', 'checkbox', 'color', 'file'].includes(t.type)) || tag === 'textarea' || tag === 'select' || t.isContentEditable;
    if (typing) { if (e.key === 'Escape') t.blur(); return; }
    if (modal.isOpen) { if (e.key === 'Escape' && !recording) modal.close(); return; }
    const onRange = tag === 'input' && t.type === 'range';
    if (/^[0-9]$/.test(e.key)) { const pick = TOOLS[(+e.key + 9) % 10]; if (pick) { go(pick.id); return; } } // 1-9, then 0 = the tenth
    if (e.key === '[' || e.key === ']') { // previous / next tool, round the list (from home: the first or the last)
      const i = page === 'home' ? (e.key === ']' ? -1 : 0) : TOOLS.indexOf(tool);
      go(TOOLS[(i + (e.key === ']' ? 1 : -1) + TOOLS.length) % TOOLS.length].id); return;
    }
    if (e.key === 'h' || e.key === 'H') { go(''); return; }
    if (page === 'home') { if (e.key === '?') showHelp(); return; }
    switch (e.key) {
      case ' ': e.preventDefault(); newVariation(); break;
      case 'n': case 'N': reshuffle(); break;
      case 'r': case 'R': rotateColors(); break;
      case 'c': case 'C': newColors(); break;
      case 'd': case 'D': restoreDefault(); break;
      case 'p': case 'P': setPlaying(!playing); break;
      case 'k': case 'K': keep(); break;
      case 's': case 'S': exportPNG(); break;
      case 'v': case 'V': exportSVG(); break;
      case '?': showHelp(); break;
      case 'ArrowLeft': if (!onRange) { e.preventDefault(); stepHistory(-1); } break;
      case 'ArrowRight': if (!onRange) { e.preventDefault(); stepHistory(1); } break;
      default: return;
    }
  });

  /* ------------------------------------------------------------ boot */
  function boot() {
    buildStylePick();
    showToolHeader();
    buildPanel();
    buildActions();
    renderKept();
    commit();
    applyRoute();
    booted = true;
  }
  boot();

  // Small API for tests and tinkering from the console.
  return {
    get state() { return S; },
    get tool() { return tool; },
    renderInto, exportDims, videoDims, buildSVG, newVariation, reshuffle, newSeed: reshuffle, rotateColors, newColors, keep, loadState, go, restoreDefault,
    switchTool: (id) => go(id),
    get view() { return page; },
    setPlaying, stepHistory, saveAppCopy, exportPNG, exportSVG, exportAnimSVG, exportMP4, exportVideo: exportMP4, recordVideo, VIDEO_MIME, CAN_ENCODE,
    get lastRenderMs() { return lastRenderMs; },
    get frameIdx() { return frameIdx; },
  };
})();
