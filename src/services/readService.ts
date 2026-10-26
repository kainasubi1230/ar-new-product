import { supabase } from '../lib/supabase';

/** 拾った言葉（新しい順） */
export interface CollectedPost {
  postId: string;
  readAt: string;
  message: string;
  author: string;
  handle: string;
  tags: string[];
  /** 拾った場所の名前（取れなかったときは null） */
  placeName: string | null;
}

/**
 * 言葉を拾う（AR で、置かれた場所に出たカードをタップしたとき）。同じ言葉は 1 回だけ記録される。
 * もう拾っていた言葉なら 'already' を返す
 */
export const collectPost = async (
  postId: string,
  userId: string,
  /** 拾った場所（自分の位置と、その場所の名前） */
  place?: { latitude: number; longitude: number; placeName: string | null } | null
): Promise<'collected' | 'already'> => {
  const { error } = await supabase.from('post_reads').insert({
    post_id: postId,
    user_id: userId,
    lat: place?.latitude ?? null,
    lng: place?.longitude ?? null,
    place_name: place?.placeName ?? null,
  });
  if (error) {
    // 主キー（post_id, user_id）の重複 ＝ もう拾っている
    if (error.code === '23505') return 'already';
    throw new Error(`拾った言葉の記録に失敗しました: ${error.message}`);
  }
  return 'collected';
};

/** 自分が拾った言葉（消された言葉は出ない） */
export const fetchCollectedPosts = async (userId: string): Promise<CollectedPost[]> => {
  const { data, error } = await supabase
    .from('post_reads')
    .select('read_at, place_name, posts ( id, message, author, handle, tags )')
    .eq('user_id', userId)
    .order('read_at', { ascending: false });
  if (error) {
    throw new Error(`拾った言葉の取得に失敗しました: ${error.message}`);
  }
  return (data ?? []).flatMap((row: any) => {
    const post = Array.isArray(row.posts) ? row.posts[0] : row.posts;
    if (!post) return [];
    return [
      {
        postId: String(post.id),
        readAt: row.read_at,
        message: post.message ?? '',
        author: post.author ?? 'guest',
        handle: post.handle ?? '',
        tags: post.tags ?? [],
        placeName: row.place_name ?? null,
      },
    ];
  });
};

/** 拾った言葉を外す（自分の「拾った」記録を消す）。その言葉の「誰かが読んだよ」の人数も 1 減る */
export const uncollectPost = async (postId: string, userId: string) => {
  const { data, error } = await supabase
    .from('post_reads')
    .delete()
    .eq('post_id', postId)
    .eq('user_id', userId)
    .select('post_id');
  if (error) {
    throw new Error(`拾った言葉を外せませんでした: ${error.message}`);
  }
  if (!data || data.length === 0) {
    // RLS で弾かれると、エラーにならず 0 件削除になる
    throw new Error('拾った言葉を外せませんでした（削除の権限がありません）');
  }
};
