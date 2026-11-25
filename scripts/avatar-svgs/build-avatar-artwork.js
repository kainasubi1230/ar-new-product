/**
 * avatar_svgs/*.svg（アバターの元の SVG 素材）を、アプリで描ける TS のデータに変換する。
 *   node scripts/avatar-svgs/build-avatar-artwork.js
 *
 * - パス（d）・塗りの規則（fill-rule）・グループの順番は SVG のまま。絵は描き直さない。
 * - 各グループの色は data-color-role から `var(--avatar-<role>)` にする（CSS 変数で管理）。
 * - 同じ役割でも、影などで素材の色が違うグループがある（例: base の明るい色と影の色）。
 *   それぞれの素材の色を `original` に残し、色を変えたときも同じだけの明るさの差をつけて陰影を保つ。
 * - 役割ごとの「代表の色」（初期カラー）は、その役割でいちばん面積の大きい（パスの長い）グループの色。
 *
 * 出力: src/features/avatar/artwork.generated.ts（手で書き換えない）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SRC_DIR = path.join(ROOT, 'avatar_svgs');
const OUT = path.join(ROOT, 'src/features/avatar/artwork.generated.ts');
const CHARACTERS = ['cat', 'dog', 'bear', 'rabbit', 'panda', 'fox', 'penguin', 'chick'];
const ROLES = ['ink', 'secondary', 'tertiary', 'accent', 'base'];

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : undefined;
};

const artworks = {};
for (const key of CHARACTERS) {
  const svg = fs.readFileSync(path.join(SRC_DIR, `${key}.svg`), 'utf8');
  const svgTag = svg.match(/<svg\b[^>]*>/)[0];
  const viewBox = attr(svgTag, 'viewBox');

  const groups = [];
  const groupRe = /<g\b([^>]*)>([\s\S]*?)<\/g>/g;
  let g;
  while ((g = groupRe.exec(svg))) {
    const gTag = `<g${g[1]}>`;
    const role = attr(gTag, 'data-color-role');
    if (!ROLES.includes(role)) throw new Error(`${key}: unknown role ${role}`);
    const fill = attr(gTag, 'fill').toUpperCase();
    const fillRule = attr(gTag, 'fill-rule') === 'evenodd' ? 'evenodd' : 'nonzero';
    const paths = [...g[2].matchAll(/<path\b[^>]*\sd="([^"]*)"/g)].map((m) => m[1]);
    if (paths.length === 0) throw new Error(`${key}: empty group`);
    groups.push({ role, original: fill, fillRule, d: paths.join(' ') });
  }

  // 役割ごとの代表の色（いちばん面積の大きいグループ）
  const defaults = {};
  for (const role of ROLES) {
    const inRole = groups.filter((x) => x.role === role);
    if (inRole.length === 0) continue;
    defaults[role] = inRole.reduce((a, b) => (b.d.length > a.d.length ? b : a)).original;
  }

  artworks[key] = {
    viewBox,
    usedRoles: ROLES.filter((r) => defaults[r]),
    defaults,
    groups: groups.map((x) => ({
      role: x.role,
      fill: `var(--avatar-${x.role})`,
      original: x.original,
      fillRule: x.fillRule,
      d: x.d,
    })),
  };
}

const out = `// 自動生成ファイル。手で書き換えない。
// 元の素材: avatar_svgs/*.svg ／ 生成: node scripts/avatar-svgs/build-avatar-artwork.js
import type { AvatarArtwork, AvatarCharacterKey } from './types';

export const AVATAR_ARTWORK: Record<AvatarCharacterKey, AvatarArtwork> = ${JSON.stringify(artworks)};
`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);
console.log(`wrote ${path.relative(ROOT, OUT)} (${(out.length / 1024).toFixed(0)} KB)`);
for (const key of CHARACTERS) {
  console.log(key, artworks[key].viewBox, JSON.stringify(artworks[key].defaults));
}
