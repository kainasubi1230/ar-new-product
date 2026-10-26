/**
 * 関心タグに合う投稿を見分ける。方角タグの `highlighted` に使い、合う投稿だけ少し強調して出す。
 * 今は関心タグをまだどこからも渡していないので、すべての投稿が同じ見た目になる
 * （マイページ／タグ管理の関心タグとつなぐときは、App.tsx から interestTags を渡す）
 */

const normalizeTag = (tag: string) => {
  const trimmed = tag.trim();
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
};

export const matchesInterestTags = (
  postTags: readonly string[] | null | undefined,
  interestTags: readonly string[]
): boolean => {
  if (!postTags || postTags.length === 0 || interestTags.length === 0) {
    return false;
  }
  const interests = new Set(interestTags.map(normalizeTag));
  return postTags.some((tag) => interests.has(normalizeTag(tag)));
};
