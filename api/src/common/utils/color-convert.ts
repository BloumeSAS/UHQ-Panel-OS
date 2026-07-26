/**
 * Conversion de couleurs CSS (oklch/hsl/rgb/hex) vers le triplet HSL
 * "H S% L%" (sans wrapper hsl()) utilisé par index.css. Nécessaire pour
 * importer des thèmes tweakcn.com, qui exportent en oklch().
 */

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** oklch(L C H) → sRGB [r,g,b] 0-1, via OKLab (formules Björn Ottosson). */
function oklchToSrgb(L: number, C: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  let r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  let bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  const gamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  r = clamp01(gamma(r));
  g = clamp01(gamma(g));
  bl = clamp01(gamma(bl));
  return [r, g, bl];
}

function srgbToHslTriplet(r: number, g: number, b: number): string {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Parse une valeur CSS couleur (oklch()/hsl()/rgb()/#hex) → triplet "H S% L%". Renvoie null si non reconnue. */
export function anyColorToHslTriplet(input: string): string | null {
  const v = input.trim();

  const oklch = v.match(/^oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)/i);
  if (oklch) {
    const L = Number(oklch[1]);
    const C = Number(oklch[2]);
    const H = Number(oklch[3]);
    const [r, g, b] = oklchToSrgb(L, C, H);
    return srgbToHslTriplet(r, g, b);
  }

  const hsl = v.match(/^hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/i);
  if (hsl) return `${hsl[1]} ${hsl[2]}% ${hsl[3]}%`;

  // Déjà au format "H S% L%" (sans wrapper).
  const bare = v.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (bare) return v;

  const rgb = v.match(/^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/i) || v.match(/^rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/i);
  if (rgb) {
    const r = Number(rgb[1]) / 255;
    const g = Number(rgb[2]) / 255;
    const b = Number(rgb[3]) / 255;
    return srgbToHslTriplet(r, g, b);
  }

  const hex = v.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = hex[1];
    const r = parseInt(n.slice(0, 2), 16) / 255;
    const g = parseInt(n.slice(2, 4), 16) / 255;
    const b = parseInt(n.slice(4, 6), 16) / 255;
    return srgbToHslTriplet(r, g, b);
  }

  return null;
}
