import type { ImageSourcePropType } from 'react-native';
import layoutData from './avatarAttachmentLayout.json';
import type { AvatarAnimal } from './avatarColors';

/**
 * アバターのアタッチメント（リボン・帽子・メガネ）。絵は assets/raw/avatar-attachments/*.png を使い、
 * ios の Images.xcassets/Attachments/Attachment* に入れてある（画面にはネイティブが色を変えた絵を出す。JS に絵は同梱しない）。
 * image は、色を変えた絵を作れないとき（iOS 以外）の代わりで、Images.xcassets の名前で読む
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
  { key: 'ribbon_01', category: 'ribbon', label: 'ストライプ', image: { uri: 'AttachmentRibbon01' } },
  { key: 'ribbon_02', category: 'ribbon', label: 'ボタン', image: { uri: 'AttachmentRibbon02' } },
  { key: 'ribbon_03', category: 'ribbon', label: 'ドット', image: { uri: 'AttachmentRibbon03' } },
  { key: 'ribbon_04', category: 'ribbon', label: 'ロング', image: { uri: 'AttachmentRibbon04' } },
  { key: 'hat_01', category: 'hat', label: 'ベレー帽', image: { uri: 'AttachmentHat01' } },
  { key: 'hat_02', category: 'hat', label: 'キャップ', image: { uri: 'AttachmentHat02' } },
  { key: 'hat_03', category: 'hat', label: 'シルクハット', image: { uri: 'AttachmentHat03' } },
  { key: 'hat_04', category: 'hat', label: 'ニット帽', image: { uri: 'AttachmentHat04' } },
  { key: 'glasses_01', category: 'glasses', label: 'まる', image: { uri: 'AttachmentGlasses01' } },
  { key: 'glasses_02', category: 'glasses', label: 'スクエア', image: { uri: 'AttachmentGlasses02' } },
  { key: 'glasses_03', category: 'glasses', label: 'クラシック', image: { uri: 'AttachmentGlasses03' } },
  { key: 'glasses_04', category: 'glasses', label: 'サングラス', image: { uri: 'AttachmentGlasses04' } },
] as const satisfies readonly {
  key: string;
  category: AttachmentCategory;
  label: string;
  image: ImageSourcePropType;
}[];

export type AttachmentKey = (typeof AVATAR_ATTACHMENTS)[number]['key'];

/**
 * 装着しているアタッチメント（リボン・帽子・メガネから、それぞれ 1 つまで。重ねて付けられる）と、
 * カテゴリごとのアイテムの色（黄色の部分を変える色。#RRGGBB、無ければ元の色。アイテムを付け替えても外しても覚えておく）
 */
export type AttachmentSelection = Partial<Record<AttachmentCategory, AttachmentKey>> & {
  colors?: Partial<Record<AttachmentCategory, string>>;
};

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

const HEX6 = /^#[0-9A-Fa-f]{6}$/;

/** 装着の中から、知らないカテゴリ・アイテム・読めない色を除く（保存されていた値を読むとき） */
export const cleanAttachmentSelection = (value: unknown): AttachmentSelection => {
  if (!value || typeof value !== 'object') return {};
  const raw = value as Record<string, unknown>;
  const selection: AttachmentSelection = {};
  const colors: Partial<Record<AttachmentCategory, string>> = {};
  const rawColors = (raw.colors && typeof raw.colors === 'object' ? raw.colors : {}) as Record<string, unknown>;
  for (const category of ATTACHMENT_CATEGORIES) {
    const key = raw[category.key];
    if (isAttachmentKey(key) && attachmentOf(key).category === category.key) selection[category.key] = key;
    // 前の版（全部で 1 つ・色も 1 つ）の color は、付けていたアイテムのカテゴリの色にする
    const hex = rawColors[category.key] ?? (selection[category.key] ? raw.color : undefined);
    if (typeof hex === 'string' && HEX6.test(hex)) colors[category.key] = hex.toUpperCase();
  }
  if (Object.keys(colors).length > 0) selection.colors = colors;
  return selection;
};

/** 装着しているアイテムの一覧（重ねる順。handle に入れる順でもある） */
export const attachmentKeysOf = (selection: AttachmentSelection | undefined): AttachmentKey[] =>
  ATTACHMENT_CATEGORIES.map((c) => selection?.[c.key]).filter((k): k is AttachmentKey => !!k);

/** 装着しているアイテムごとの色（色を変えていないアイテムは入れない） */
export const attachmentColorsOf = (selection: AttachmentSelection | undefined): Partial<Record<AttachmentKey, string>> => {
  const colors: Partial<Record<AttachmentKey, string>> = {};
  for (const category of ATTACHMENT_CATEGORIES) {
    const key = selection?.[category.key];
    const hex = selection?.colors?.[category.key];
    if (key && hex) colors[key] = hex;
  }
  return colors;
};
