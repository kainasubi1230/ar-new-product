import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from '../lib/supabase';
import type { NativeSupabaseConfig } from '../native/UniversalARView';
import { getCurrentLocation } from './postService';

/** この距離以内の投稿の地図を読み込む */
export const WORLDMAP_RADIUS_M = 30;

const METERS_PER_DEGREE_LAT = 111320;

export interface NearbyWorldMapPost {
  id: string | number;
  message: string | null;
  author: string | null;
  handle: string | null;
  worldmap_path: string;
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
 * アップロード済みの地図ファイルの場所を posts に記録する
 */
export const updatePostWorldMapPath = async (postId: string, path: string) => {
  const { data, error } = await supabase
    .from('posts')
    .update({ worldmap_path: path })
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

const distanceInMeters = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
};

/**
 * 現在地から WORLDMAP_RADIUS_M 以内で、地図付きの一番近い投稿を探す
 */
export const findNearestPostWithWorldMap = async (
  excludeIds: ReadonlySet<string> = new Set()
): Promise<NearbyWorldMapPost | null> => {
  const { latitude, longitude } = await getCurrentLocation();

  const latDelta = WORLDMAP_RADIUS_M / METERS_PER_DEGREE_LAT;
  const lngDelta =
    WORLDMAP_RADIUS_M / (METERS_PER_DEGREE_LAT * Math.cos((latitude * Math.PI) / 180));

  const { data, error } = await supabase
    .from('posts')
    .select('id, message, author, handle, lat, lng, worldmap_path')
    .not('worldmap_path', 'is', null)
    .gte('lat', latitude - latDelta)
    .lte('lat', latitude + latDelta)
    .gte('lng', longitude - lngDelta)
    .lte('lng', longitude + lngDelta);

  if (error) {
    throw new Error(`近くの投稿の取得に失敗しました: ${error.message}`);
  }

  const candidates = (data ?? [])
    .filter((post) => !excludeIds.has(String(post.id)))
    .map((post) => ({
      ...post,
      distanceM: distanceInMeters(latitude, longitude, post.lat, post.lng),
    }))
    .filter((post) => post.distanceM <= WORLDMAP_RADIUS_M)
    .sort((a, b) => a.distanceM - b.distanceM);

  return candidates[0] ?? null;
};
