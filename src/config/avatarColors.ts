/**
 * アイコンは「名前の頭文字」を、選んだ色の丸に白い字で出す（写真や絵は使わない）。
 * 選んだ色は投稿の handle に `color:#RRGGBB` として入れ、他の人の言葉カード・AR のカードでも同じ色で出す
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

const PREFIX = 'color:';

/** 投稿の handle に入れる形（`color:#10B981`） */
export const avatarHandleFor = (hex: string) => `${PREFIX}${hex}`;

/** handle から色を取り出す。色の形でなければ null（古い投稿の絵のアイコンなど） */
export const avatarColorOf = (handle?: string | null): string | null => {
  if (!handle?.startsWith(PREFIX)) return null;
  const hex = handle.slice(PREFIX.length);
  return /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : null;
};
