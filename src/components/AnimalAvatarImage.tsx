import React, { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';
import { attachmentFrame, attachmentOf, type AttachmentKey } from '../config/avatarAttachments';
import { animalImageOf, isOriginalAccent, type AvatarAnimal } from '../config/avatarColors';
import {
  canRecolorAvatar,
  peekRecoloredAvatar,
  recoloredAvatarUri,
} from '../services/avatarRecolorService';

type Props = {
  animal: AvatarAnimal;
  /** 絵のオレンジ・黄色を変える色（#RRGGBB） */
  color: string;
  style?: StyleProp<ImageStyle>;
  /** 重ねるアタッチメント（キャラクターの絵は変えず、透明な絵を上に重ねる） */
  attachments?: readonly AttachmentKey[];
};

type Shown = { animal: AvatarAnimal; uri: string };

/**
 * アイコンの動物の絵。オレンジ・黄色の部分だけを color に変えて出す（色変えはネイティブ。作った絵は覚えておく）。
 * - 色をどんどん変えても（カラーピッカーを動かしている間）、作っている途中に頼まれた色は最後の 1 つだけ作る
 * - 新しい色の絵が読み込めるまでは前の色の絵を下に残しておくので、ちらつかない
 */
export function AnimalAvatarImage({ animal, color, style, attachments = [] }: Props): React.JSX.Element {
  const useOriginal = !canRecolorAvatar || isOriginalAccent(color);
  const [current, setCurrent] = useState<Shown | null>(() => {
    const uri = peekRecoloredAvatar(animal, color);
    return uri ? { animal, uri } : null;
  });
  // 読み込み終わった、ひとつ前の絵（新しい絵が出るまで下に敷いておく）
  const [previous, setPrevious] = useState<Shown | null>(null);

  const wanted = useRef({ animal, color });
  wanted.current = { animal, color };
  const isBusy = useRef(false);
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (useOriginal) return;
    const known = peekRecoloredAvatar(animal, color);
    if (known) {
      setCurrent((c) => (c?.uri === known ? c : { animal, uri: known }));
      return;
    }
    if (isBusy.current) return; // 今作っている分が終わったら、そのとき欲しい色を作る
    isBusy.current = true;
    (async () => {
      for (;;) {
        const target = wanted.current;
        const uri = await recoloredAvatarUri(target.animal, target.color);
        if (!isMounted.current) return;
        if (uri) setCurrent({ animal: target.animal, uri });
        const latest = wanted.current;
        if (latest.animal === target.animal && latest.color === target.color) break;
        if (isOriginalAccent(latest.color)) break;
      }
      isBusy.current = false;
    })();
  }, [animal, color, useOriginal]);

  const top = useOriginal ? null : current?.animal === animal ? current : null;
  const under = useOriginal ? null : previous?.animal === animal && previous.uri !== top?.uri ? previous : null;
  return (
    <View style={[style, styles.clip]}>
      {/* その動物で色を変えた絵がまだ 1 枚も無いあいだは、元の絵 */}
      {!top && !under && (
        <Image source={animalImageOf(animal)} style={StyleSheet.absoluteFill} resizeMode="contain" />
      )}
      {under && <Image source={{ uri: under.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />}
      {top && (
        <Image
          source={{ uri: top.uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          onLoad={() => setPrevious(top)}
        />
      )}
      <AttachmentLayer animal={animal} attachments={attachments} />
    </View>
  );
}

/** アタッチメントを、キャラクターごとの装着位置の表どおりに重ねる（重なり順の小さい方から） */
function AttachmentLayer({
  animal,
  attachments,
}: {
  animal: AvatarAnimal;
  attachments: readonly AttachmentKey[];
}): React.JSX.Element | null {
  if (attachments.length === 0) return null;
  const frames = attachments
    .map((key) => ({ key, frame: attachmentFrame(animal, key) }))
    .filter((f): f is { key: AttachmentKey; frame: NonNullable<ReturnType<typeof attachmentFrame>> } => !!f.frame)
    .sort((a, b) => a.frame.zIndex - b.frame.zIndex);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {frames.map(({ key, frame }) => (
        <Image
          key={key}
          source={attachmentOf(key).image}
          resizeMode="contain"
          style={{
            position: 'absolute',
            left: frame.left,
            top: frame.top,
            width: frame.width,
            height: frame.height,
            transformOrigin: frame.transformOrigin,
            transform: [{ rotate: `${frame.rotation}deg` }],
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // 角丸（borderRadius）を指定されたとき、中の絵も同じ形に切る
  clip: { overflow: 'hidden' },
});
