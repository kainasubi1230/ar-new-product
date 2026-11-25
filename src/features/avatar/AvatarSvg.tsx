import React, { memo, useMemo } from 'react';
import Svg, { G, Path } from 'react-native-svg';
import { AVATAR_ARTWORK } from './artwork.generated';
import { resolveCssVar, toCssVars } from './characters';
import { shadeLike } from './color';
import type { AvatarCharacterKey, AvatarColors, AvatarCssVars } from './types';

type Props = {
  character: AvatarCharacterKey;
  colors: AvatarColors;
  /** 横幅（高さは絵の縦横比から決まる） */
  width: number;
};

/**
 * アバターを SVG のまま描く。素材のパスはそのままで、各グループの `fill="var(--avatar-xxx)"` を
 * CSS 変数（toCssVars で作る `--avatar-ink` など）の値に置き換えて塗る。
 * React Native には CSS が無いので、変数の解決はここで行う（Web の CSS 変数と同じ名前・同じ形）。
 *
 * 重ねる順: （将来）背景 → キャラクター → （将来）アタッチメント。追加するときは <Svg> の中に G を足す。
 */
export function AvatarSvg({ character, colors, width }: Props): React.JSX.Element {
  const artwork = AVATAR_ARTWORK[character];
  const [, , vbW, vbH] = artwork.viewBox.split(/\s+/).map(Number);
  const cssVars = useMemo(() => toCssVars(colors), [colors]);

  return (
    <Svg width={width} height={(width * vbH) / vbW} viewBox={artwork.viewBox}>
      <G>
        {artwork.groups.map((group, i) => (
          <ArtworkPath
            key={`${character}-${i}`}
            d={group.d}
            fillRule={group.fillRule}
            fill={fillOf(group.fill, group.original, artwork.defaults[group.role], cssVars)}
          />
        ))}
      </G>
    </Svg>
  );
}

/** CSS 変数の値で塗る。同じパーツの影・ハイライトのグループは、素材と同じ明るさの差をつける */
const fillOf = (fill: string, original: string, key: string | undefined, vars: AvatarCssVars) => {
  const picked = resolveCssVar(fill, vars);
  if (!picked) return original;
  return key ? shadeLike(picked, key, original) : picked;
};

// パスは数十 KB あるので、色が変わったときは fill だけが変わるようにする
const ArtworkPath = memo(function ArtworkPath({
  d,
  fill,
  fillRule,
}: {
  d: string;
  fill: string;
  fillRule: 'evenodd' | 'nonzero';
}) {
  return <Path d={d} fill={fill} fillRule={fillRule} />;
});
