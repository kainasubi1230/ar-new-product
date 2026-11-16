import {
  canonicalTagKey,
  expandInterestTags,
  isBlockedBySafetyFilter,
  matchesTagFilter,
  normalizeTag,
} from '../services/interestTagService';

/**
 * 関心タグに合う投稿を見分ける。関心タグの関連タグ・同義語・表記揺れ・派生複合タグにも合えば合うとみなす。
 * 方角タグの `highlighted`・地図のピン・ポケット通知・「関心タグのみ表示」に使う
 */
export const matchesInterestTags = (
  postTags: readonly string[] | null | undefined,
  interestTags: readonly string[]
): boolean => {
  if (!postTags || postTags.length === 0 || interestTags.length === 0) {
    return false;
  }
  return matchesTagFilter(postTags, interestTags, true);
};

/**
 * 投稿がどの関心タグに合ったか（そのまま合うものを優先し、無ければ関連タグ・同義語で合ったもの）。
 * ポケット通知の文言「近くに #散歩 の言葉があります」に使う。合わなければ null
 */
export const findMatchedInterestTag = (
  postTags: readonly string[] | null | undefined,
  interestTags: readonly string[]
): string | null => {
  if (!postTags || postTags.length === 0 || interestTags.length === 0) return null;
  const tagKeys = new Set(postTags.map(canonicalTagKey));
  const direct = interestTags.find((t) => tagKeys.has(canonicalTagKey(t)));
  if (direct) return normalizeTag(direct);
  const related = interestTags.find((t) => matchesTagFilter(postTags, [t], true));
  return related ? normalizeTag(related) : null;
};

/**
 * 表示の設定（関心タグのみ表示・安心フィルター）で、この投稿を AR・地図に出すか。
 * 自分の投稿はいつも出す
 */
export const isVisibleUnderFilters = (
  post: { message?: string | null; tags?: readonly string[] | null },
  options: {
    interestTags: readonly string[];
    onlyInterestTags: boolean;
    hideNegativePosts: boolean;
    mutedTags?: readonly string[];
    isOwn: boolean;
  }
): boolean => {
  if (options.isOwn) return true;

  // 安心フィルターが有効な場合：タグ偽装対策・本文シノニムスキャン・ネガティブ判定を実行
  if (options.hideNegativePosts && isBlockedBySafetyFilter(post, options.mutedTags)) {
    return false;
  }

  if (options.onlyInterestTags && options.interestTags.length > 0 && !matchesInterestTags(post.tags, options.interestTags)) {
    return false;
  }
  return true;
};
