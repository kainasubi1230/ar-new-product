import {
  attachmentKeysOf,
  cleanAttachmentSelection,
  isAttachmentKey,
  type AttachmentKey,
  type AttachmentsByAnimal,
} from './avatarAttachments';

/**
 * アバター（＝アイコン）は、8 種類の動物の絵（avatar_animals_png/*.png をそのまま使う。
 * src/assets/animals と ios の Images.xcassets/Animal*.imageset）の「オレンジ・黄色」の部分だけを、選んだ色に変えたもの。
 * どこを変えるかはキャラクターごとのマスク（Animal*Mask.imageset、scripts/avatar-animals/build-assets.sh で作る）、
 * 色変えはネイティブの AvatarRecolor（形・模様・質感はそのまま）。
 * 投稿の handle に `animal:cat:#3B82F6` として入れ、他の人の言葉カード・AR のカードでも同じアイコンで出す。
 * 前のバージョンの投稿（`color:#RRGGBB`）は、その色の丸に名前の頭文字のまま
 */

/** 元の絵のオレンジ。この色のときは元の絵をそのまま出す（ARViewWrapper.swift の AvatarRecolorCore.originalAccentHex と同じ） */
export const ORIGINAL_ACCENT_HEX = '#F9B837';

/** 絵のキャンバス（背景）のクリーム色。アイコンの丸の色にもして、絵の四角い端が見えないようにする（AR のカードも同じ） */
export const AVATAR_CANVAS_COLOR = '#FAF7EF';

/** 色のプリセット（8 色。最初が元のオレンジ） */
export const AVATAR_COLOR_PRESETS = [
  { key: 'orange', label: 'オレンジ', hex: ORIGINAL_ACCENT_HEX },
  { key: 'blue', label: 'ブルー', hex: '#3B82F6' },
  { key: 'pink', label: 'ピンク', hex: '#EC4899' },
  { key: 'purple', label: 'パープル', hex: '#8B5CF6' },
  { key: 'green', label: 'グリーン', hex: '#10B981' },
  { key: 'red', label: 'レッド', hex: '#EF4444' },
  { key: 'sky', label: 'スカイ', hex: '#38BDF8' },
  { key: 'navy', label: 'ネイビー', hex: '#1E3A8A' },
] as const;

export const DEFAULT_AVATAR_COLOR = ORIGINAL_ACCENT_HEX;

export const isOriginalAccent = (hex: string) => hex.toLowerCase() === ORIGINAL_ACCENT_HEX.toLowerCase();

export const AVATAR_ANIMALS = [
  { key: 'cat', label: 'ねこ', image: require('../assets/animals/cat.png') },
  { key: 'dog', label: 'いぬ', image: require('../assets/animals/dog.png') },
  { key: 'bear', label: 'くま', image: require('../assets/animals/bear.png') },
  { key: 'rabbit', label: 'うさぎ', image: require('../assets/animals/rabbit.png') },
  { key: 'panda', label: 'パンダ', image: require('../assets/animals/panda.png') },
  { key: 'fox', label: 'きつね', image: require('../assets/animals/fox.png') },
  { key: 'penguin', label: 'ペンギン', image: require('../assets/animals/penguin.png') },
  { key: 'chick', label: 'ひよこ', image: require('../assets/animals/chick.png') },
] as const;

export type AvatarAnimal = (typeof AVATAR_ANIMALS)[number]['key'];

export const isAvatarAnimal = (value: unknown): value is AvatarAnimal =>
  typeof value === 'string' && AVATAR_ANIMALS.some((a) => a.key === value);

export const animalImageOf = (animal: AvatarAnimal) =>
  AVATAR_ANIMALS.find((a) => a.key === animal)?.image ?? AVATAR_ANIMALS[0].image;

/** まだ動物を選んでいない人の動物。アカウントごとに決まった 1 匹（みんな同じにならないように） */
export const defaultAnimalFor = (userId?: string | null): AvatarAnimal => {
  if (!userId) return AVATAR_ANIMALS[0].key;
  let hash = 0;
  for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_ANIMALS[hash % AVATAR_ANIMALS.length].key;
};

/** 設定に入っている動物（無い・知らない値なら、アカウントごとに決まった動物） */
export const resolveAvatarAnimal = (saved: unknown, userId?: string | null): AvatarAnimal =>
  isAvatarAnimal(saved) ? saved : defaultAnimalFor(userId);

const HEX = /^#[0-9A-Fa-f]{6}$/;
const COLOR_PREFIX = 'color:';
const ANIMAL_PREFIX = 'animal:';

/**
 * 投稿の handle に入れる形：`animal:cat:#10B981`、アタッチメントを付けていれば `animal:cat:#10B981:ribbon_01+hat_02`
 */
export const avatarHandleFor = (hex: string, animal: AvatarAnimal, attachments: readonly AttachmentKey[] = []) =>
  `${ANIMAL_PREFIX}${animal}:${hex}${attachments.length > 0 ? `:${attachments.join('+')}` : ''}`;

/** handle から色を取り出す（`animal:cat:#…[:…]` と前の `color:#…` の両方）。どちらでもなければ null（もっと古い絵のアイコンなど） */
export const avatarColorOf = (handle?: string | null): string | null => {
  if (!handle) return null;
  const hex = handle.startsWith(ANIMAL_PREFIX)
    ? (handle.split(':')[2] ?? '')
    : handle.startsWith(COLOR_PREFIX)
      ? handle.slice(COLOR_PREFIX.length)
      : '';
  return HEX.test(hex) ? hex : null;
};

/** handle から動物を取り出す。動物のアイコンでなければ null（頭文字の丸で出す） */
export const avatarAnimalOf = (handle?: string | null): AvatarAnimal | null => {
  if (!handle?.startsWith(ANIMAL_PREFIX)) return null;
  const key = handle.split(':')[1];
  return isAvatarAnimal(key) ? key : null;
};

/** handle から装着しているアタッチメントを取り出す（無ければ空） */
export const avatarAttachmentsOf = (handle?: string | null): AttachmentKey[] => {
  if (!handle?.startsWith(ANIMAL_PREFIX)) return [];
  return (handle.split(':')[3] ?? '').split('+').filter(isAttachmentKey);
};

/**
 * アバターのデータ：キャラクターの ID・色（絵のオレンジ・黄色を変える色）・キャラクターごとのアタッチメントの装着。
 * 背景などを足すときは、ここにフィールドを足す（例：`background?: string`）。
 * 投稿の handle には今のキャラクターの分を `avatarHandleFor` の形で入れる
 */
export type AvatarConfig = {
  character: AvatarAnimal;
  /** #RRGGBB。初期は元のオレンジ */
  color: string;
  /** キャラクターごとの装着（キャラクターを切り替えても、それぞれ覚えておく） */
  attachments: AttachmentsByAnimal;
};

/** 今のキャラクターに装着しているアイテム（重ねる順） */
export const currentAttachmentsOf = (config: AvatarConfig): AttachmentKey[] =>
  attachmentKeysOf(config.attachments[config.character]);

/** 保存されていたキャラクターごとの装着から、知らない値を除く */
export const cleanAttachmentsByAnimal = (value: unknown): AttachmentsByAnimal => {
  if (!value || typeof value !== 'object') return {};
  const result: AttachmentsByAnimal = {};
  for (const [animal, selection] of Object.entries(value as Record<string, unknown>)) {
    if (!isAvatarAnimal(animal)) continue;
    const clean = cleanAttachmentSelection(selection);
    if (Object.keys(clean).length > 0) result[animal] = clean;
  }
  return result;
};
