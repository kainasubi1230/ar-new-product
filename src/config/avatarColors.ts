/**
 * アイコンは、選んだ色の丸に、選んだ動物の顔（scripts/avatar-animals/animals.swift で描いたオリジナルの絵）。
 * 投稿の handle に `animal:cat:#10B981` として入れ、他の人の言葉カード・AR のカードでも同じアイコンで出す。
 * 前のバージョンの投稿（`color:#RRGGBB`）は、その色の丸に名前の頭文字のまま
 */
export const AVATAR_COLORS = [
  { key: 'green', label: 'グリーン', hex: '#10B981' },
  { key: 'blue', label: 'ブルー', hex: '#0EA5E9' },
  { key: 'purple', label: 'パープル', hex: '#8B5CF6' },
  { key: 'pink', label: 'ピンク', hex: '#EC4899' },
  { key: 'red', label: 'レッド', hex: '#EF4444' },
  { key: 'orange', label: 'オレンジ', hex: '#F97316' },
  { key: 'yellow', label: 'イエロー', hex: '#EAB308' },
  { key: 'gray', label: 'グレー', hex: '#64748B' },
] as const;

export const DEFAULT_AVATAR_COLOR = AVATAR_COLORS[0].hex;

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

/** 投稿の handle に入れる形（`animal:cat:#10B981`） */
export const avatarHandleFor = (hex: string, animal: AvatarAnimal) => `${ANIMAL_PREFIX}${animal}:${hex}`;

/** handle から色を取り出す（`animal:cat:#…` と前の `color:#…` の両方）。どちらでもなければ null（もっと古い絵のアイコンなど） */
export const avatarColorOf = (handle?: string | null): string | null => {
  if (!handle) return null;
  const hex = handle.startsWith(ANIMAL_PREFIX)
    ? handle.slice(handle.lastIndexOf(':') + 1)
    : handle.startsWith(COLOR_PREFIX)
      ? handle.slice(COLOR_PREFIX.length)
      : '';
  return HEX.test(hex) ? hex : null;
};

/** handle から動物を取り出す。動物のアイコンでなければ null（頭文字の丸で出す） */
export const avatarAnimalOf = (handle?: string | null): AvatarAnimal | null => {
  if (!handle?.startsWith(ANIMAL_PREFIX)) return null;
  const key = handle.slice(ANIMAL_PREFIX.length).split(':')[0];
  return isAvatarAnimal(key) ? key : null;
};
