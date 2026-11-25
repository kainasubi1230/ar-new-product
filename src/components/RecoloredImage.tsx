import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type ImageStyle,
  type StyleProp,
} from 'react-native';
import { canRecolorAvatar, peekRecolored, recoloredUri, type RecolorKind } from '../services/avatarRecolorService';

type Props = {
  kind: RecolorKind;
  /** キャラクター（cat など）かアタッチメント（ribbon_01 など） */
  asset: string;
  /** 絵のオレンジ・黄色を変える色（#RRGGBB） */
  color: string;
  /** 色を変えた絵を作れないとき（iOS 以外）に出す、同梱の元の絵 */
  fallback: ImageSourcePropType;
  style?: StyleProp<ImageStyle>;
};

type Shown = { asset: string; uri: string };

/**
 * 絵のオレンジ・黄色の部分だけを color に変えて出す（色変えはネイティブ。作った絵は覚えておく）。
 * キャラクターにもアタッチメントにも使う。
 * - 色をどんどん変えても（カラーピッカーを動かしている間）、作っている途中に頼まれた色は最後の 1 つだけ作る
 * - 新しい色の絵が読み込めるまでは前の色の絵を下に残しておくので、ちらつかない
 * - 元の色も同じ出し方（ネイティブが元の絵をそのままファイルにする）。出し方を色ごとに変えない
 */
export function RecoloredImage({ kind, asset, color, fallback, style }: Props): React.JSX.Element {
  const [current, setCurrent] = useState<Shown | null>(() => {
    const uri = peekRecolored(kind, asset, color);
    return uri ? { asset, uri } : null;
  });
  // 読み込み終わった、ひとつ前の絵（新しい絵が出るまで下に敷いておく）
  const [previous, setPrevious] = useState<Shown | null>(null);

  const wanted = useRef({ asset, color });
  wanted.current = { asset, color };
  const isBusy = useRef(false);
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!canRecolorAvatar) return;
    const known = peekRecolored(kind, asset, color);
    if (known) {
      setCurrent((c) => (c?.uri === known ? c : { asset, uri: known }));
      return;
    }
    if (isBusy.current) return; // 今作っている分が終わったら、そのとき欲しい色を作る
    isBusy.current = true;
    (async () => {
      for (;;) {
        const target = wanted.current;
        const uri = await recoloredUri(kind, target.asset, target.color);
        if (!isMounted.current) return;
        if (uri) setCurrent({ asset: target.asset, uri });
        const latest = wanted.current;
        if (latest.asset === target.asset && latest.color === target.color) break;
      }
      isBusy.current = false;
    })();
  }, [kind, asset, color]);

  const top = current?.asset === asset ? current : null;
  const under = previous?.asset === asset && previous.uri !== top?.uri ? previous : null;
  return (
    <View style={[style, styles.clip]}>
      {/* 色を変えた絵を作れないときだけ、同梱の元の絵（作れるときは、できるまでの一瞬は何も出さない） */}
      {!canRecolorAvatar && <Image source={fallback} style={StyleSheet.absoluteFill} resizeMode="contain" />}
      {under && <Image source={{ uri: under.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />}
      {top && (
        <Image
          source={{ uri: top.uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          onLoad={() => setPrevious(top)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // 角丸（borderRadius）を指定されたとき、中の絵も同じ形に切る
  clip: { overflow: 'hidden' },
});
