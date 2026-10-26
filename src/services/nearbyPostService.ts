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
  distanceM: number;
  /** 現在地から見た方角（北=0°、時計回り） */
  bearingDeg: number;
}

/**
 * 現在地から NEARBY_RADIUS_M 以内の投稿を、近い順に NEARBY_LIMIT 件返す（地図の有無は問わない）
 */
export const findNearbyPosts = async (coords: LocationCoords): Promise<NearbyPost[]> => {
  const { latitude, longitude } = coords;
  const { latDelta, lngDelta } = boundingDeltas(latitude, NEARBY_RADIUS_M);

  const { data, error } = await supabase
    .from('posts')
    .select('id, message, author, handle, tags, lat, lng')
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
      distanceM: distanceInMeters(latitude, longitude, lat, lng),
      bearingDeg: bearingDegrees(latitude, longitude, lat, lng),
    }))
    .filter((post) => post.distanceM <= NEARBY_RADIUS_M)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, NEARBY_LIMIT);
};
