/* ==========================================================================
   core/color.js
   Hex <-> RGB <-> OKLab/OKLCH, perceptual mixing and ramps, hex extraction
   from pasted text, and a palette generator with a few "moods".
   OKLab keeps ramps even-looking, so a 3-step land ramp reads as 3 steps.
   ========================================================================== */
PL.color = (() => {
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  function normHex(s) {
    if (typeof s !== 'string') return null;
    let h = s.trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((c) => c + c).join('');
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    return '#' + h.toUpperCase();
  }

  function hexToRgb(hex) {
    const h = (normHex(hex) || '#000000').slice(1);
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgbToHex(r, g, b) {
    const c = (v) => Math.round(v < 0 ? 0 : v > 255 ? 255 : v).toString(16).padStart(2, '0');
    return ('#' + c(r) + c(g) + c(b)).toUpperCase();
  }

  const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

  function hexToOklab(hex) {
    const [R, G, B] = hexToRgb(hex).map((v) => toLin(v / 255));
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  }

  // Returns linear-ish sRGB in 0..1 (may be out of gamut).
  function oklabToRgb01(L, a, b) {
    const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
    const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
    const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
    return [
      toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    ];
  }

  const inGamut = (rgb) => rgb.every((v) => v >= -0.0005 && v <= 1.0005 && !Number.isNaN(v));

  function oklabToHex(L, a, b) {
    const rgb = oklabToRgb01(L, a, b).map(clamp01);
    return rgbToHex(rgb[0] * 255, rgb[1] * 255, rgb[2] * 255);
  }

  // OKLCH -> hex, reducing chroma until the colour fits in sRGB (keeps hue + lightness).
  function lch(L, C, hDeg) {
    L = clamp01(L);
    const h = (((hDeg % 360) + 360) % 360) * (Math.PI / 180);
    let lo = 0, hi = Math.max(0, C);
    if (inGamut(oklabToRgb01(L, hi * Math.cos(h), hi * Math.sin(h)))) lo = hi;
    else {
      for (let k = 0; k < 18; k++) {
        const mid = (lo + hi) / 2;
        if (inGamut(oklabToRgb01(L, mid * Math.cos(h), mid * Math.sin(h)))) lo = mid; else hi = mid;
      }
    }
    return oklabToHex(L, lo * Math.cos(h), lo * Math.sin(h));
  }

  function hexToLch(hex) {
    const [L, a, b] = hexToOklab(hex);
    return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
  }

  function mix(h1, h2, t) {
    const A = hexToOklab(h1), B = hexToOklab(h2);
    return oklabToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  }

  // n evenly spaced colours along a multi-stop gradient (OKLab).
  function ramp(stops, n) {
    if (n <= 0) return [];
    if (!stops.length) return Array(n).fill('#808080');
    if (stops.length === 1) return Array(n).fill(stops[0]);
    if (n === 1) return [mix(stops[0], stops[stops.length - 1], 0.5)];
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1)) * (stops.length - 1);
      const k = Math.min(stops.length - 2, Math.floor(t));
      out.push(mix(stops[k], stops[k + 1], t - k));
    }
    return out;
  }

  function luminance(hex) {
    const [r, g, b] = hexToRgb(hex).map((v) => toLin(v / 255));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(h1, h2) {
    const a = luminance(h1), b = luminance(h2);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  // Pull every hex code out of pasted text: "#0B1220, #22d3ee", "0b1220-22d3ee" (coolors URLs), CSS, etc.
  function extractHexes(text) {
    const out = [];
    const re = /#?\b([0-9a-f]{6}|[0-9a-f]{3})\b/gi;
    let m;
    while ((m = re.exec(String(text || '')))) {
      const raw = m[1];
      // Skip 3-char matches without a leading '#' (too likely to be a number or word).
      if (raw.length === 3 && m[0][0] !== '#') continue;
      const h = normHex(raw);
      if (h) out.push(h);
    }
    return out;
  }

  /* ---------------------------------------------------------------------
     Palette generator. spec = { ramp: n, accents: m }
     returns [background, ...ramp (low -> high contrast), ...accents]
     --------------------------------------------------------------------- */
  // Hue harmonies (degrees from the base hue): complement, split complement, triad, square, rectangle.
  const HARMONIES = [[180], [150, 210], [120, 240], [90, 180, 270], [60, 180, 240]];

  function generate(spec, rng) {
    const nr = Math.max(1, spec.ramp | 0), na = Math.max(0, spec.accents | 0);
    const mood = rng.pick(['dark', 'dark', 'dark', 'light', 'light', 'neon', 'harmony', 'mono', 'earth', 'pastel']);
    const h = rng.float(0, 360);
    const drift = rng.float(-70, 70);
    const accentHue = h + rng.pick([150, 170, 190, 210, 120, 240]);
    const accentHue2 = accentHue + rng.sign() * rng.float(35, 95);
    let bg, rampCols = [], acc = [];
    const rampAt = (i) => (nr === 1 ? 1 : i / (nr - 1));

    if (mood === 'dark' || mood === 'neon') {
      const neon = mood === 'neon';
      bg = lch(rng.float(0.12, 0.19), rng.float(0.01, neon ? 0.06 : 0.035), h + rng.float(-40, 40));
      const L0 = rng.float(0.38, 0.5), L1 = rng.float(0.86, 0.96);
      const C0 = neon ? rng.float(0.14, 0.2) : rng.float(0.05, 0.11);
      const C1 = neon ? rng.float(0.1, 0.18) : rng.float(0.015, 0.06);
      for (let i = 0; i < nr; i++) {
        const t = rampAt(i);
        rampCols.push(lch(L0 + (L1 - L0) * t, C0 + (C1 - C0) * t, h + drift * t));
      }
      acc = [lch(rng.float(0.66, 0.8), rng.float(0.16, 0.24), accentHue), lch(rng.float(0.62, 0.86), rng.float(0.12, 0.2), accentHue2)];
    } else if (mood === 'light' || mood === 'pastel') {
      const pastel = mood === 'pastel';
      bg = pastel ? lch(rng.float(0.88, 0.93), rng.float(0.03, 0.06), h + 180) : lch(rng.float(0.94, 0.975), rng.float(0.006, 0.025), rng.float(60, 100));
      const L0 = pastel ? rng.float(0.74, 0.8) : rng.float(0.66, 0.74), L1 = pastel ? rng.float(0.45, 0.55) : rng.float(0.2, 0.3);
      const C0 = pastel ? rng.float(0.07, 0.1) : rng.float(0.05, 0.1), C1 = pastel ? rng.float(0.08, 0.12) : rng.float(0.04, 0.12);
      for (let i = 0; i < nr; i++) {
        const t = rampAt(i);
        rampCols.push(lch(L0 + (L1 - L0) * t, C0 + (C1 - C0) * t, h + drift * t));
      }
      acc = [lch(rng.float(0.56, 0.68), rng.float(0.15, 0.22), accentHue), lch(rng.float(0.5, 0.72), rng.float(0.1, 0.18), accentHue2)];
    } else if (mood === 'harmony') {
      // A hue harmony in OKLCH: the ground and the ramp on the base hue (even lightness steps),
      // the accents at the scheme's other hues, all at one lightness.
      const scheme = rng.pick(HARMONIES);
      const dark = rng.chance(0.5);
      bg = dark ? lch(rng.float(0.16, 0.22), rng.float(0.02, 0.045), h) : lch(rng.float(0.94, 0.97), rng.float(0.008, 0.022), h);
      const L0 = dark ? 0.5 : 0.8, L1 = dark ? 0.92 : 0.34;
      for (let i = 0; i < nr; i++) {
        const t = rampAt(i);
        rampCols.push(lch(L0 + (L1 - L0) * t, 0.13 - 0.06 * Math.abs(t - 0.5), h));
      }
      const La = dark ? rng.float(0.7, 0.8) : rng.float(0.58, 0.68), Ca = rng.float(0.12, 0.17);
      for (let k = 0; k < Math.max(2, na); k++) acc.push(lch(La + (k >= scheme.length ? (dark ? -0.16 : 0.16) : 0), Ca, h + scheme[k % scheme.length]));
    } else if (mood === 'mono') {
      const dark = rng.chance(0.6);
      bg = dark ? lch(0.12, 0.012, h) : lch(0.96, 0.008, h);
      for (let i = 0; i < nr; i++) {
        const t = rampAt(i);
        rampCols.push(dark ? lch(0.42 + 0.53 * t, 0.012, h) : lch(0.72 - 0.55 * t, 0.012, h));
      }
      acc = [lch(0.66, 0.24, accentHue), dark ? '#FFFFFF' : '#111111'];
    } else {
      // earth
      const dark = rng.chance(0.45);
      const eh = rng.float(25, 95);
      bg = dark ? lch(rng.float(0.16, 0.22), rng.float(0.02, 0.04), eh) : lch(rng.float(0.92, 0.95), rng.float(0.02, 0.04), eh + 10);
      for (let i = 0; i < nr; i++) {
        const t = rampAt(i);
        rampCols.push(dark ? lch(0.45 + 0.45 * t, 0.08 - 0.04 * t, eh + 30 * t) : lch(0.7 - 0.45 * t, 0.07 + 0.03 * t, eh - 20 * t));
      }
      acc = [lch(rng.float(0.55, 0.7), rng.float(0.12, 0.17), rng.pick([200, 220, 145, 25])), lch(rng.float(0.5, 0.8), rng.float(0.08, 0.14), rng.float(30, 80))];
    }

    while (acc.length < na) acc.push(lch(rng.float(0.5, 0.85), rng.float(0.1, 0.2), rng.float(0, 360)));
    return [bg, ...rampCols, ...acc.slice(0, na)];
  }

  return { normHex, hexToRgb, rgbToHex, hexToOklab, hexToLch, lch, mix, ramp, luminance, contrast, extractHexes, generate };
})();
