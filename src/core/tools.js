/* ==========================================================================
   core/tools.js — the tool registry.

   Adding a tool later = one new file in /tools that calls PL.tools.register({...}).
   The app builds the style menu, controls, palettes, effects, animation and
   exports from the definition automatically. Shape of a definition:

   {
     id, name, kind, tagline, about,
     inks:    { min, max, def, roles(n) -> [names], fit(colors, n) -> colors, spec(n) -> {ramp, accents} },
     palettes:[{ name, colors: [...] }],
     params:  [{ key, label, section, type: 'range'|'seg'|'toggle', min, max, step, def, unit, rand: [lo, hi] | false, options }],
     defaults:{ anim: { amount, fps, frames }, fx: { ...PL.fx.DEFAULTS overrides } },
     build({ W, H, aspect, seed, p, colors, t, anim }) -> PL.Scene      // t in [0, 1) = position in the loop
   }
   aspect is the frame's exact width / height. A tool that counts whole cells takes its rows from it,
   not from W / H: a preview canvas can be a pixel off the ratio (see the grid in tools/quilt.js).

   General's Rotation and Size show the pattern's world turned and zoomed about the frame's centre. The
   world is measured in the frame's own units (the frame is [0, W] x [0, H] at Size 100 %), and a style
   draws whatever part of it the frame then shows, so zooming out reveals more of the same pattern (never
   a repeat) and zooming in draws it again at full detail:
     build({ ..., region: { x0, y0, x1, y1, z } })  shapes covering that part of the world (frame units;
                                                 it can reach far past the frame; z: output pixels per
                                                 frame unit, for styles that sample). No region: the frame.
     paint({ ctx, W, H, ..., map: { cw, ch, s, x0, y0 } })  ctx's canvas is cw x ch pixels and its pixel
                                                 (px, py) shows the world at (x0 + px * s, y0 + py * s):
                                                 s frame units a pixel. No map: the canvas is the frame.
   PL.tools.region(args) and PL.tools.pixmap(args) read these with their defaults.
   ========================================================================== */
PL.tools = (() => {
  const list = [];
  const byId = new Map();
  function register(def) {
    if (byId.has(def.id)) throw new Error('Duplicate tool id: ' + def.id);
    list.push(def);
    byId.set(def.id, def);
  }
  // the part of the world a build covers (default: the frame)
  const region = (a) => (a.region ? a.region : { x0: 0, y0: 0, x1: a.W, y1: a.H });
  // the canvas a paint fills and the world it shows (default: the frame, pixel for pixel)
  const pixmap = (a) => (a.map ? a.map : { cw: a.W, ch: a.H, s: 1, x0: 0, y0: 0 });
  return { register, get: (id) => byId.get(id), list: () => list.slice(), region, pixmap };
})();
