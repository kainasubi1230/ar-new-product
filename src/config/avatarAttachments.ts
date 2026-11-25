import type { ImageSourcePropType } from 'react-native';
import layoutData from './avatarAttachmentLayout.json';
import type { AvatarAnimal } from './avatarColors';

/**
 * アバターのアタッチメント（リボン・帽子・メガネ）。絵は avatar_attachments_png/*.png をそのまま使う
 * （src/assets/attachments と ios の Images.xcassets/Attachment*）。
 * 装着位置は avatarAttachmentLayout.json（scripts/avatar-attachments/build-assets.sh で作る）：
 * キャラクター × アイテムごとに x・y（絵がある範囲の中心）・幅・高さ（絵がある範囲の大きさ）・回転・重なり順。
 * 単位はキャラクターの絵（512×512）の px。AR のカード（ARViewWrapper.swift）も同じ表を同じ計算で使う
 */

export const ATTACHMENT_CATEGORIES = [
  { key: 'ribbon', label: 'リボン' },
  { key: 'hat', label: '帽子' },
  { key: 'glasses', label: 'メガネ' },
] as const;

export type AttachmentCategory = (typeof ATTACHMENT_CATEGORIES)[number]['key'];

export const AVATAR_ATTACHMENTS = [
  { key: 'ribbon_01', category: 'ribbon', label: 'ストライプ', image: require('../assets/attachments/ribbon_01.png') },
  { key: 'ribbon_02', category: 'ribbon', label: 'ボタン', image: require('../assets/attachments/ribbon_02.png') },
  { key: 'ribbon_03', category: 'ribbon', label: 'ドット', image: require('../assets/attachments/ribbon_03.png') },
  { key: 'ribbon_04', category: 'ribbon', label: 'ロング', image: require('../assets/attachments/ribbon_04.png') },
  { key: 'hat_01', category: 'hat', label: 'ベレー帽', image: require('../assets/attachments/hat_01.png') },
  { key: 'hat_02', category: 'hat', label: 'キャップ', image: require('../assets/attachments/hat_02.png') },
  { key: 'hat_03', category: 'hat', label: 'シルクハット', image: require('../assets/attachments/hat_03.png') },
  { key: 'hat_04', category: 'hat', label: 'ニット帽', image: require('../assets/attachments/hat_04.png') },
  { key: 'glasses_01', category: 'glasses', label: 'まる', image: require('../assets/attachments/glasses_01.png') },
  { key: 'glasses_02', category: 'glasses', label: 'スクエア', image: require('../assets/attachments/glasses_02.png') },
  { key: 'glasses_03', category: 'glasses', label: 'クラシック', image: require('../assets/attachments/glasses_03.png') },
  { key: 'glasses_04', category: 'glasses', label: 'サングラス', image: require('../assets/attachments/glasses_04.png') },
] as const satisfies readonly {
  key: string;
  category: AttachmentCategory;
  label: string;
  image: ImageSourcePropType;
}[];

export type AttachmentKey = (typeof AVATAR_ATTACHMENTS)[number]['key'];

/** 装着しているアタッチメント（カテゴリごとに 1 つまで） */
export type AttachmentSelection = Partial<Record<AttachmentCategory, AttachmentKey>>;

/** キャラクターごとの装着（キャラクターを切り替えても、それぞれの装着を覚えておく） */
export type AttachmentsByAnimal = Partial<Record<AvatarAnimal, AttachmentSelection>>;

/** 1 つのアイテムの置き方（キャラクターの絵 512px の座標。x・y は絵がある範囲の中心、回転は度・時計回り） */
export type AttachmentPlacement = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
};

type LayoutData = {
  canvasSize: number;
  items: Record<string, { category: string; box: { x: number; y: number; width: number; height: number }; imageSize: number }>;
  layout: Record<string, Record<string, AttachmentPlacement>>;
};
const LAYOUT = layoutData as LayoutData;

export const isAttachmentKey = (value: unknown): value is AttachmentKey =>
  typeof value === 'string' && AVATAR_ATTACHMENTS.some((a) => a.key === value);

export const attachmentOf = (key: AttachmentKey) => AVATAR_ATTACHMENTS.find((a) => a.key === key)!;

export const attachmentPlacement = (animal: AvatarAnimal, key: AttachmentKey): AttachmentPlacement | null =>
  LAYOUT.layout[animal]?.[key] ?? null;

/**
 * アイテムの絵（正方形）を重ねる位置。キャラクターの絵の大きさに対する % で返す（どの大きさのアイコンでも同じ見た目）。
 * 絵がある範囲の中心が表の (x, y) に来て、範囲の幅が表の幅になるよう拡大し、その中心で回す
 */
export const attachmentFrame = (animal: AvatarAnimal, key: AttachmentKey) => {
  const place = attachmentPlacement(animal, key);
  const meta = LAYOUT.items[key];
  if (!place || !meta) return null;
  const canvas = LAYOUT.canvasSize;
  const scale = place.width / meta.box.width;
  const boxCx = meta.box.x + meta.box.width / 2;
  const boxCy = meta.box.y + meta.box.height / 2;
  const size = meta.imageSize * scale;
  const pct = (v: number) => `${(v / canvas) * 100}%` as const;
  return {
    left: pct(place.x - boxCx * scale),
    top: pct(place.y - boxCy * scale),
    width: pct(size),
    height: pct(size),
    rotation: place.rotation,
    // 回す中心＝絵がある範囲の中心（アイテムの絵の中の %）。
    // 文字列（'49.9% 50%'）で渡すと RN が小数を読めず、値が 3 つより多くなってエラーになるので、配列で渡す
    transformOrigin: [`${(boxCx / meta.imageSize) * 100}%`, `${(boxCy / meta.imageSize) * 100}%`, 0] as [string, string, number],
    zIndex: place.zIndex,
  };
};

/** 装着の中から、知らないカテゴリ・アイテムを除く（保存されていた値を読むとき） */
export const cleanAttachmentSelection = (value: unknown): AttachmentSelection => {
  if (!value || typeof value !== 'object') return {};
  const selection: AttachmentSelection = {};
  for (const category of ATTACHMENT_CATEGORIES) {
    const key = (value as Record<string, unknown>)[category.key];
    if (isAttachmentKey(key) && attachmentOf(key).category === category.key) selection[category.key] = key;
  }
  return selection;
};

/** 装着しているアイテムの一覧（重ねる順。handle に入れる順でもある） */
export const attachmentKeysOf = (selection: AttachmentSelection | undefined): AttachmentKey[] =>
  ATTACHMENT_CATEGORIES.map((c) => selection?.[c.key]).filter((k): k is AttachmentKey => !!k);
