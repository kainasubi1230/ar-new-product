import Geolocation from '@react-native-community/geolocation';
import { supabase } from '../lib/supabase';

export interface LocationCoords {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface PostPayload {
  message: string;
  author?: string;
  handle?: string;
  tags?: string[];
  ar_x?: number;
  ar_y?: number;
  ar_z?: number;
}

/**
 * 現在の位置情報を取得する
 *
 * requestAuthorization は使わない。iOS 版は「権限の状態が変わったとき」にしかコールバックを呼ばないため、
 * 2回目以降（すでに許可済み）の呼び出しは永遠に返ってこない。
 * getCurrentPosition は必要なら自分で権限を求め、timeout で必ず結果が返る。
 */
export const getCurrentLocation = (): Promise<LocationCoords> => {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        reject(new Error(`位置情報の取得に失敗しました: ${error.message} (code: ${error.code})`));
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000,
      }
    );
  });
};

/**
 * 現在地付きでSupabaseのpostsテーブルへ保存する
 */
export const insertPostWithCurrentLocation = async (payload: string | PostPayload) => {
  const postData: PostPayload = typeof payload === 'string' ? { message: payload } : payload;

  // 1. 現在地を取得
  const coords = await getCurrentLocation();

  // 2. Supabaseのpostsテーブルへ保存
  const { data, error } = await supabase
    .from('posts')
    .insert([
      {
        message: postData.message,
        lat: coords.latitude,
        lng: coords.longitude,
        accuracy_m: coords.accuracy ?? null,
        author: postData.author ?? 'guest',
        handle: postData.handle ?? null,
        tags: postData.tags ?? [],
        ar_x: postData.ar_x ?? null,
        ar_y: postData.ar_y ?? null,
        ar_z: postData.ar_z ?? null,
      },
    ])
    .select();

  if (error) {
    throw new Error(`Supabaseへの保存に失敗しました: ${error.message}`);
  }

  return {
    post: data?.[0],
    coords,
  };
};
