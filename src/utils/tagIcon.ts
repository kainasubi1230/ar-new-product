import type { ImageSourcePropType } from 'react-native';
import { Icons } from '../assets/icons';
import { INTEREST_TAG_PRESETS, normalizeTag } from '../services/interestTagService';

// 関心タグのプリセット（INTEREST_TAG_PRESETS の id）ごとの絵
const PRESET_ICONS: Record<string, ImageSourcePropType> = {
  t1: Icons.walking,
  t2: Icons.cafe,
  t3: Icons.everyday,
  t4: Icons.book,
  t5: Icons.gourmet,
  t6: Icons.history,
  t7: Icons.art,
  t8: Icons.herb,
};

// 関心タグのプリセットごとの色（探索マップで、関心タグに合うピンをその色にする）。
// Calm：彩度を抑えめに、メッセージの緑・文化遺産の土色と見分けがつく色
const PRESET_COLORS: Record<string, string> = {
  t1: '#059669', // 散歩
  t2: '#B45309', // カフェ
  t3: '#0284C7', // 日常
  t4: '#4F46E5', // 本
  t5: '#EA580C', // グルメ
  t6: '#7C3AED', // 歴史
  t7: '#DB2777', // アート
  t8: '#65A30D', // 自然
};

const presetOf = (tag: string) => {
  const norm = normalizeTag(tag);
  if (!norm) return null;
  return (
    INTEREST_TAG_PRESETS.find((p) => p.tag === norm) ??
    INTEREST_TAG_PRESETS.find((p) => p.relatedTags.some((rel) => normalizeTag(rel) === norm)) ??
    null
  );
};

/** タグの色（プリセットと、その関連タグ）。自分で作ったタグなどは null */
export const interestTagColor = (tag: string): string | null => {
  const preset = presetOf(tag);
  return preset ? PRESET_COLORS[preset.id] ?? null : null;
};

/**
 * タグに合う絵（#散歩 → 歩く人、#街歩き のような関連タグも同じ絵）。
 * 自分で作ったタグなど、プリセットに無いものは null
 */
export const interestTagIcon = (tag: string): ImageSourcePropType | null => {
  const preset = presetOf(tag);
  return preset ? PRESET_ICONS[preset.id] ?? null : null;
};
