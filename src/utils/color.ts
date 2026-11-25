/** 色の計算（HEX ⇄ HSV）。外部ライブラリは使わない */

export type Hsv = { h: number; s: number; v: number };

/** 入力欄の文字を #RRGGBB にそろえる（#なし・3 桁も受け付ける）。読めなければ null */
export const normalizeHexInput = (input: string): string | null => {
  let s = input.trim().replace(/^#/, '');
  if (/^[0-9A-Fa-f]{3}$/.test(s)) s = s.split('').map((c) => c + c).join('');
  if (!/^[0-9A-Fa-f]{6}$/.test(s)) return null;
  return `#${s.toUpperCase()}`;
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

const hexToRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
};

const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b]
    .map((x) => Math.round(clamp01(x) * 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;

const rgbToHue = (r: number, g: number, b: number, max: number, d: number) => {
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

export const hexToHsv = (hex: string): Hsv => {
  const { r, g, b } = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  return { h: rgbToHue(r, g, b, max, d), s: max === 0 ? 0 : d / max, v: max };
};

export const hsvToHex = ({ h, s, v }: Hsv): string => {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex(r + m, g + m, b + m);
};
