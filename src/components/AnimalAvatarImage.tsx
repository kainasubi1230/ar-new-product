import React from 'react';
import { StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';
import { attachmentFrame, attachmentOf, type AttachmentKey } from '../config/avatarAttachments';
import { AVATAR_CANVAS_COLOR, ORIGINAL_ACCENT_HEX, animalImageOf, type AvatarAnimal } from '../config/avatarColors';
import { RecoloredImage } from './RecoloredImage';

type Props = {
  animal: AvatarAnimal;
  /** 絵のオレンジ・黄色を変える色（#RRGGBB） */
  color: string;
  style?: StyleProp<ImageStyle>;
  /** 重ねるアタッチメント（キャラクターの絵は変えず、透明な絵を上に重ねる） */
  attachments?: readonly AttachmentKey[];
  /** アイテムごとの、黄色を変える色（無いアイテムは元の色） */
  attachmentColors?: Partial<Record<AttachmentKey, string>>;
  /** 背景色（キャラクターの絵は背景を抜いてあるので、後ろにこの色を敷く。無ければ初期のクリーム） */
  background?: string;
};

/**
 * アバターの絵：背景色の上に、キャラクター（オレンジ・黄色を color に変えたもの）と、
 * アタッチメント（黄色をアイテムごとの色に変えたもの）を重ねる
 */
export function AnimalAvatarImage({
  animal,
  color,
  style,
  attachments = [],
  attachmentColors = {},
  background = AVATAR_CANVAS_COLOR,
}: Props): React.JSX.Element {
  return (
    <View style={[style, styles.clip, { backgroundColor: background }]}>
      <RecoloredImage
        kind="animal"
        asset={animal}
        color={color}
        fallback={animalImageOf(animal)}
        style={StyleSheet.absoluteFill}
      />
      <AttachmentLayer animal={animal} attachments={attachments} colors={attachmentColors} />
    </View>
  );
}

/** アタッチメントを、キャラクターごとの装着位置の表どおりに重ねる（重なり順の小さい方から） */
function AttachmentLayer({
  animal,
  attachments,
  colors,
}: {
  animal: AvatarAnimal;
  attachments: readonly AttachmentKey[];
  colors: Partial<Record<AttachmentKey, string>>;
}): React.JSX.Element | null {
  if (attachments.length === 0) return null;
  const frames = attachments
    .map((key) => ({ key, frame: attachmentFrame(animal, key) }))
    .filter((f): f is { key: AttachmentKey; frame: NonNullable<ReturnType<typeof attachmentFrame>> } => !!f.frame)
    .sort((a, b) => a.frame.zIndex - b.frame.zIndex);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {frames.map(({ key, frame }) => (
        <RecoloredImage
          key={key}
          kind="attachment"
          asset={key}
          color={colors[key] ?? ORIGINAL_ACCENT_HEX}
          fallback={attachmentOf(key).image}
          style={[
            styles.attachment,
            {
              left: frame.left,
              top: frame.top,
              width: frame.width,
              height: frame.height,
              transformOrigin: frame.transformOrigin,
              transform: [{ rotate: `${frame.rotation}deg` }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // 角丸（borderRadius）を指定されたとき、中の絵も同じ形に切る
  clip: { overflow: 'hidden' },
  // アイテムの絵は四角の外に出ないよう余白込みの大きさなので、切らない
  attachment: { position: 'absolute', overflow: 'visible' },
});
