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

const presetOf = (tag: string) => {
  const norm = normalizeTag(tag);
  if (!norm) return null;
  return (
    INTEREST_TAG_PRESETS.find((p) => p.tag === norm) ??
    INTEREST_TAG_PRESETS.find((p) => p.relatedTags.some((rel) => normalizeTag(rel) === norm)) ??
    null
  );
};

/**
 * タグに合う絵（#散歩 → 歩く人、#街歩き のような関連タグも同じ絵）。
 * 自分で作ったタグなど、プリセットに無いものは null
 */
export const interestTagIcon = (tag: string): ImageSourcePropType | null => {
  const preset = presetOf(tag);
  return preset ? PRESET_ICONS[preset.id] ?? null : null;
};
