import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from '../lib/supabase';
import type { NativeSupabaseConfig } from '../native/UniversalARView';
import { getCurrentLocation, type LocationCoords } from './postService';
import { boundingDeltas, distanceInMeters } from '../utils/geo';
import { DISTANCE_TIERS } from '../config/distanceTiers';

/** この距離以内の投稿の地図を読み込む */
export const WORLDMAP_RADIUS_M = DISTANCE_TIERS.preciseM;

export interface NearbyWorldMapPost {
  id: string | number;
  message: string | null;
  author: string | null;
  handle: string | null;
  tags: string[] | null;
  worldmap_path: string;
  /** 置いたときの景色の写真（照合のとき重ねて案内する）。無い投稿もある */
  snapshot_path: string | null;
  /** その地図で出せる投稿（地図に入っている post: アンカーの投稿 ID）。古い投稿は null */
  worldmap_post_ids: string[] | null;
  created_at: string;
  distanceM: number;
}

/**
 * ネイティブ側が直接 Supabase Storage を叩くための接続情報
 */
export const getNativeSupabaseConfig = async (): Promise<NativeSupabaseConfig> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return {
    url: SUPABASE_URL,
    apiKey: SUPABASE_ANON_KEY,
    accessToken: session?.access_token,
  };
};

/**
 * アップロード済みの地図ファイルの場所と、その地図で出せる投稿の一覧を posts に記録する
 */
export const updatePostWorldMapPath = async (postId: string, path: string, anchorPostIds?: string[]) => {
  const { data, error } = await supabase
    .from('posts')
    .update({
      worldmap_path: path,
      ...(anchorPostIds ? { worldmap_post_ids: anchorPostIds } : {}),
    })
    .eq('id', postId)
    .select('id');

  if (error) {
    throw new Error(`地図の場所の保存に失敗しました: ${error.message}`);
  }
  if (!data || data.length === 0) {
    // RLSで弾かれると、エラーにならず0件更新になる
    throw new Error('地図の場所を保存できませんでした（postsの更新権限を確認してください）');
  }
};

/**
 * アップロード済みの「置いたときの景色の写真」の場所を posts に記録する
 */
export const updatePostSnapshotPath = async (postId: string, path: string) => {
  const { data, error } = await supabase
    .from('posts')
    .update({ snapshot_path: path })
    .eq('id', postId)
    .select('id');

  if (error) {
    throw new Error(`景色の写真の保存に失敗しました: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error('景色の写真を保存できませんでした（postsの更新権限を確認してください）');
  }
};

/**
 * 地図を育てて保存し直したとき、その地図で出せる投稿の一覧を更新する。
 * 投稿の持ち主しか更新できない（他の人が育てた地図は、一覧は古いままになる）
 */
export const updatePostWorldMapPostIds = async (postId: string, anchorPostIds: string[]) => {
  await supabase.from('posts').update({ worldmap_post_ids: anchorPostIds }).eq('id', postId);
};

/**
 * 照合に使う地図を選ぶ。近くの投稿をいちばん多く含む地図にし、同じ数なら新しいほう。
 * 今のセッションで自分が置いた投稿（excludeIds）の地図は選ばない（読み直すと出ているカードが一度消える）
 */
export const chooseWorldMapPost = (
  posts: NearbyWorldMapPost[],
  excludeIds: ReadonlySet<string>
): { post: NearbyWorldMapPost; nearbyCount: number } | null => {
  const nearbyIds = new Set(posts.map((post) => String(post.id)));
  let best: { post: NearbyWorldMapPost; nearbyCount: number } | null = null;
  for (const post of posts) {
    if (excludeIds.has(String(post.id))) continue;
    // 一覧が無い古い地図は、少なくとも自分自身のアンカーは入っている
    const anchorIds = post.worldmap_post_ids ?? [String(post.id)];
    const nearbyCount = anchorIds.filter((id) => nearbyIds.has(id)).length;
    if (
      !best ||
      nearbyCount > best.nearbyCount ||
      (nearbyCount === best.nearbyCount && post.created_at > best.post.created_at)
    ) {
      best = { post, nearbyCount };
    }
  }
  return best;
};

/**
 * 現在地から radiusM 以内の地図付き投稿を、新しい順に返す。
 * GPS の誤差は数m〜十数mあり、同じ場所の投稿の「近さ」は当てにならないので距離では並べない。
 */
export const findNearbyWorldMapPosts = async (
  coords: LocationCoords | undefined,
  radiusM: number = WORLDMAP_RADIUS_M
): Promise<NearbyWorldMapPost[]> => {
  const { latitude, longitude } = coords ?? (await getCurrentLocation());

  const { latDelta, lngDelta } = boundingDeltas(latitude, radiusM);

  const { data, error } = await supabase
    .from('posts')
    .select(
      'id, message, author, handle, tags, lat, lng, worldmap_path, snapshot_path, worldmap_post_ids, created_at'
    )
    .not('worldmap_path', 'is', null)
    .gte('lat', latitude - latDelta)
    .lte('lat', latitude + latDelta)
    .gte('lng', longitude - lngDelta)
    .lte('lng', longitude + lngDelta);

  if (error) {
    throw new Error(`近くの投稿の取得に失敗しました: ${error.message}`);
  }

  return (data ?? [])
    .map((post) => ({
      ...post,
      distanceM: distanceInMeters(latitude, longitude, post.lat, post.lng),
    }))
    .filter((post) => post.distanceM <= radiusM)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
};
