import { supabase } from '../lib/supabase';

/**
 * 通報とブロック（テーブルと権限は supabase/migrations/20261120010000_reports_blocks.sql）。
 * 通報した言葉と、ブロックした人の言葉は、その人のアプリでは AR・地図・通知に出さない
 */

/** 通報の理由（画面に出す言葉がそのまま reports.reason に入る） */
export const REPORT_REASONS = ['不快・攻撃的な内容', '性的・暴力的な内容', '個人情報が書かれている', 'スパム・宣伝', 'その他'];

export type MyModeration = {
  blockedUserIds: string[];
  reportedPostIds: string[];
};

/** 自分がブロックした人と、通報した言葉 */
export const fetchMyModeration = async (): Promise<MyModeration> => {
  const [blocks, reports] = await Promise.all([
    supabase.from('blocks').select('blocked_id'),
    supabase.from('reports').select('post_id'),
  ]);
  if (blocks.error) throw new Error(`ブロックの取得に失敗しました: ${blocks.error.message}`);
  if (reports.error) throw new Error(`通報の取得に失敗しました: ${reports.error.message}`);
  return {
    blockedUserIds: (blocks.data ?? []).map((row) => String(row.blocked_id)),
    reportedPostIds: (reports.data ?? []).map((row) => String(row.post_id)),
  };
};

/** 言葉を通報する。もう通報していれば何もしない */
export const reportPost = async (postId: string, reason: string) => {
  const { error } = await supabase.from('reports').insert({ post_id: postId, reason });
  // 23505：同じ言葉をもう通報している
  if (error && error.code !== '23505') {
    throw new Error(`通報に失敗しました: ${error.message}`);
  }
};

/** 投稿者をブロックする。もうブロックしていれば何もしない */
export const blockUser = async (userId: string) => {
  const { error } = await supabase.from('blocks').insert({ blocked_id: userId });
  if (error && error.code !== '23505') {
    throw new Error(`ブロックに失敗しました: ${error.message}`);
  }
};

/** ブロックを外す */
export const unblockUser = async (userId: string) => {
  const { error } = await supabase.from('blocks').delete().eq('blocked_id', userId);
  if (error) {
    throw new Error(`ブロックの解除に失敗しました: ${error.message}`);
  }
};
