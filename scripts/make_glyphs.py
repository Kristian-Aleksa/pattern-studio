"""Writes src/core/glyphs.js: the outlines of "Atlas Mono", the monospace font the text-mode tools draw with.

Atlas Mono = DejaVu Sans Mono 2.37 (Bitstream Vera licence, see the notice written into the file) with a few
glyphs changed for the text-mode look: a slashed zero, a wide minus for '-', a big centred asterisk,
a deeper tilde, a raised underscore and slightly raised brackets. Outlines stay in font units (2048 per em,
y up), as SVG path data. usage: python3 scripts/make_glyphs.py [path/to/DejaVuSansMono.ttf]
"""
import sys, os, json
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.transformPen import TransformPen

SRC = sys.argv[1] if len(sys.argv) > 1 else "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "core", "glyphs.js")
EXTRA = "░▒▓█▀▄▌▐■□▪▫●○◆◇◊★☆♠♣♥♦•·–—…×÷±°¦§¶©®™←↑→↓↔↕▲►▼◄─│┌┐└┘├┤┬┴┼═║╔╗╚╝▖▗▘▝▙▚▛▜▟▞◢◣◤◥∙√∞≈≠≤≥¤¥£¢€"
CHARS = "".join(chr(c) for c in range(33, 127)) + EXTRA

font = TTFont(SRC)
gs = font.getGlyphSet(); cmap = font.getBestCmap()
UPM = font["head"].unitsPerEm; ADV = gs[cmap[ord("0")]].width

def record(ch, m=(1, 0, 0, 1, 0, 0)):
    rp = DecomposingRecordingPen(gs)   # composite glyphs (accents, operators) drawn out in full
    gs[cmap[ord(ch)]].draw(TransformPen(rp, m))
    return rp.value

def fmt(v):
    v = round(v, 1)
    return str(int(v)) if v == int(v) else str(v)

def to_path(value):
    out = []
    for op, pts in value:
        if op == "moveTo": out.append("M" + " ".join(fmt(c) for c in pts[0]))
        elif op == "lineTo": out.append("L" + " ".join(fmt(c) for c in pts[0]))
        elif op == "qCurveTo":
            # TrueType: off-curve points with implied on-curve midpoints; the last point is on-curve
            *offs, end = pts
            if end is None: raise ValueError("closed off-curve contour")
            for k, c in enumerate(offs):
                nxt = end if k == len(offs) - 1 else ((c[0] + offs[k + 1][0]) / 2, (c[1] + offs[k + 1][1]) / 2)
                out.append("Q" + " ".join(fmt(v) for v in (*c, *nxt)))
        elif op == "curveTo":
            out.append("C" + " ".join(fmt(v) for p in pts for v in p))
        elif op in ("closePath", "endPath"): out.append("Z")
    return "".join(out)

def bounds(value):
    xs = [p[0] for op, pts in value for p in pts if p is not None]; ys = [p[1] for op, pts in value for p in pts if p is not None]
    return min(xs), min(ys), max(xs), max(ys)

def area(poly):
    return sum(poly[k][0] * poly[(k + 1) % len(poly)][1] - poly[(k + 1) % len(poly)][0] * poly[k][1] for k in range(len(poly))) / 2

def contours(value):
    out, cur = [], []
    for op, pts in value:
        cur.append((op, pts))
        if op in ("closePath", "endPath"): out.append(cur); cur = []
    return out + ([cur] if cur else [])

def box_area(value):
    x0, y0, x1, y1 = bounds(value)
    return (x1 - x0) * (y1 - y0)

def outer_sign(value):
    # the winding of the outermost contour (the one with the biggest box)
    c = max(contours(value), key=box_area)
    pts = [q for op, p in c if op != "closePath" and op != "endPath" for q in p if q is not None]
    return 1 if area(pts) > 0 else -1

def scaled(ch, sx, sy, dy=0):
    x0, y0, x1, y1 = bounds(record(ch))
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return record(ch, (sx, 0, 0, sy, cx - sx * cx, cy - sy * cy + dy))

glyphs = {}
for ch in CHARS:
    if ord(ch) not in cmap: continue
    if ch == "-": v = record("−")                       # a wide minus for '-'
    elif ch == "*": v = scaled("∗", 1.22, 1.22)         # a big asterisk centred on the digits
    elif ch == "~": v = scaled("~", 1.12, 1.7)                # a deeper wave
    elif ch == "_": v = scaled("_", 1.0, 1.5, 300)            # raised into the cell
    elif ch in "()[]{}|": v = record(ch, (1, 0, 0, 1, 0, 130))
    elif 0x2500 <= ord(ch) <= 0x259F:
        # box lines, blocks and shades fill their cell exactly (a cell is 1317 x 2194 units round the
        # advance, from 1755 above the baseline to 439 below): the full block's box (-20..1253 x
        # -512..1921) is stretched onto it, so lines and blocks join up from cell to cell
        sx, sy = 1317 / 1273, 2194 / 2433
        v = record(ch, (sx, 0, 0, sy, -42 + 20 * sx, -439 + 512 * sy))
    elif ch == "0":
        # a slashed zero, not a dotted one: drop the dot (the smallest contour)
        cs = contours(record(ch)); dot = min(cs, key=box_area)
        v = [seg for c in cs if c is not dot for seg in c]
    else: v = record(ch)
    d = to_path(v)
    if ch == "0":
        # the slash: a bar from the lower left to the upper right of the counter, wound like the outer contour
        s = outer_sign(v)
        ax, ay, bx, by, w = 390, 250, 843, 1241, 78
        nx, ny = -(by - ay), bx - ax
        L = (nx * nx + ny * ny) ** 0.5; nx, ny = nx / L * w, ny / L * w
        quad = [(ax + nx, ay + ny), (bx + nx, by + ny), (bx - nx, by - ny), (ax - nx, ay - ny)]
        if (area(quad) > 0) != (s > 0): quad.reverse()
        d += "M" + "L".join(f"{fmt(x)} {fmt(y)}" for x, y in quad) + "Z"
    glyphs[ch] = d

NOTICE = open("/usr/share/doc/fonts-dejavu-core/copyright").read() if os.path.exists("/usr/share/doc/fonts-dejavu-core/copyright") else ""
lic = NOTICE[NOTICE.find("Copyright: Copyright (c) 2003 by Bitstream"):]
lic = lic[:lic.find("Files:", 10)] if "Files:" in lic[10:] else lic
lic = "\n".join("   " + ln.strip().lstrip(".").strip() if ln.strip() != "." else "" for ln in lic.strip().splitlines())

js = f"""/* ==========================================================================
   core/glyphs.js — "Atlas Mono": outlines of the monospace type the text-mode
   tools draw with (Atlas). Generated by scripts/make_glyphs.py — do not edit.

   Derived from DejaVu Sans Mono {font['name'].getDebugName(5).replace('Version ', '')}, with a slashed zero, a wide minus for '-',
   a big centred asterisk, a deeper tilde, a raised underscore and slightly raised
   brackets; box lines, blocks and shades stretched to fill a 5:3 type cell.
   Outlines are SVG path data in font units ({UPM} per em, y up); every glyph
   advances {ADV} units. Printable ASCII plus shades, blocks, box lines and a few
   symbols.

   The Font Software notice (Bitstream Vera licence; DejaVu changes are in the
   public domain). As the licence asks, the modified outlines go by another name.
{lic}
   ========================================================================== */
PL.glyphs = (() => {{
  const UPM = {UPM}, ADV = {ADV};
  const D = {json.dumps(glyphs, ensure_ascii=False, separators=(',', ':'))};
  const cache = new Map();
  const has = (ch) => Object.prototype.hasOwnProperty.call(D, ch);
  // A Path2D of a glyph in font units (y up), cached.
  function path(ch) {{
    let p = cache.get(ch);
    if (!p && has(ch)) {{ p = new Path2D(D[ch]); cache.set(ch, p); }}
    return p;
  }}
  return {{ UPM, ADV, has, path, d: (ch) => D[ch], chars: () => Object.keys(D).join('') }};
}})();
"""
open(OUT, "w", encoding="utf-8").write(js)
print(OUT, len(js), "bytes,", len(glyphs), "glyphs")
