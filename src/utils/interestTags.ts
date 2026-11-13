import { expandInterestTags, normalizeTag } from '../services/interestTagService';
import { analyzeSentiment } from '../services/tagSuggestionService';

/**
 * 関心タグに合う投稿を見分ける。関心タグの関連タグ（#散歩 なら #街歩き など、`INTEREST_TAG_PRESETS`）にも合えば合うとみなす。
 * 方角タグの `highlighted`・地図のピン・ポケット通知・「関心タグのみ表示」に使う
 */
export const matchesInterestTags = (
  postTags: readonly string[] | null | undefined,
  interestTags: readonly string[]
): boolean => {
  if (!postTags || postTags.length === 0 || interestTags.length === 0) {
    return false;
  }
  const interests = expandInterestTags([...interestTags]);
  return postTags.some((tag) => interests.has(normalizeTag(tag)));
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

  // 安心フィルターが有効な場合：
  if (options.hideNegativePosts) {
    // 1. 強いネガティブ表現の自動判定
    if (post.message && analyzeSentiment(post.message).isNegative) {
      return false;
    }
    // 2. ユーザーが見たくないものとして選んだ除外タグ（mutedTags）のチェック
    if (options.mutedTags && options.mutedTags.length > 0) {
      const normalizedMuted = options.mutedTags.map(normalizeTag);
      const postTags = (post.tags ?? []).map(normalizeTag);
      for (const mt of normalizedMuted) {
        if (!mt) continue;
        if (postTags.includes(mt)) return false;
        const rawWord = mt.replace(/^#+/, '');
        if (rawWord && post.message && post.message.includes(rawWord)) return false;
      }
    }
  }

  if (options.onlyInterestTags && options.interestTags.length > 0 && !matchesInterestTags(post.tags, options.interestTags)) {
    return false;
  }
  return true;
};
