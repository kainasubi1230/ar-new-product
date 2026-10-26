import { supabase } from '../lib/supabase';
import type { LocationCoords } from './postService';
import { bearingDegrees, boundingDeltas, distanceInMeters } from '../utils/geo';
import { DISTANCE_TIERS } from '../config/distanceTiers';

/** 方角タグ・レーダーに出す範囲 */
export const NEARBY_RADIUS_M = DISTANCE_TIERS.maxM;
const NEARBY_LIMIT = 20;

export interface NearbyPost {
  id: string | number;
  message: string | null;
  author: string | null;
  handle: string | null;
  tags: string[] | null;
  /** 投稿者（自分の投稿はポケット通知しない） */
  user_id: string | null;
  /** 置いたときの GPS の誤差（m） */
  accuracy_m: number | null;
  /** 置いたときの景色の写真（気配をタップしたときに見せる） */
  snapshot_path: string | null;
  /** メッセージ（カード）の位置。探索ページの地図のピンに使う */
  latitude: number;
  longitude: number;
  distanceM: number;
  /** 現在地から見た方角（北=0°、時計回り） */
  bearingDeg: number;
}

/**
 * 現在地から radiusM（既定 NEARBY_RADIUS_M）以内の投稿を、近い順に limit（既定 NEARBY_LIMIT）件返す（地図の有無は問わない）
 */
export const findNearbyPosts = async (
  coords: LocationCoords,
  { radiusM = NEARBY_RADIUS_M, limit = NEARBY_LIMIT }: { radiusM?: number; limit?: number } = {}
): Promise<NearbyPost[]> => {
  const { latitude, longitude } = coords;
  const { latDelta, lngDelta } = boundingDeltas(latitude, radiusM);

  const { data, error } = await supabase
    .from('posts')
    .select('id, message, author, handle, tags, user_id, accuracy_m, snapshot_path, lat, lng')
    .gte('lat', latitude - latDelta)
    .lte('lat', latitude + latDelta)
    .gte('lng', longitude - lngDelta)
    .lte('lng', longitude + lngDelta);

  if (error) {
    throw new Error(`近くの投稿の取得に失敗しました: ${error.message}`);
  }

  return (data ?? [])
    .map(({ lat, lng, ...post }) => ({
      ...post,
      latitude: lat,
      longitude: lng,
      distanceM: distanceInMeters(latitude, longitude, lat, lng),
      bearingDeg: bearingDegrees(latitude, longitude, lat, lng),
    }))
    .filter((post) => post.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, limit);
};
