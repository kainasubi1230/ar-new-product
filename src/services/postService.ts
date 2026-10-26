import Geolocation from '@react-native-community/geolocation';
import { supabase } from '../lib/supabase';
import { offsetLatLng } from '../utils/geo';
import { reverseGeocode } from './geocoder';

export interface LocationCoords {
  latitude: number;
  longitude: number;
  accuracy?: number;
  /** 高さ（m、GPS の楕円体高）。取れないこともある */
  altitude?: number | null;
}

/** 置いたカードの、カメラ（＝スマホの位置）からのずれと向き（ネイティブが AR とコンパスから計算） */
export interface CardPlacement {
  offsetEastM: number;
  offsetNorthM: number;
  offsetUpM: number;
  /** カードの面が向いている方位（北=0°、時計回り） */
  headingDeg: number;
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
          altitude: position.coords.altitude,
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
 * 投稿を posts に保存する。
 * メッセージの本体は「その場所の座標」なので、lat / lng / alt_m にはスマホではなくカード自体の位置を入れる
 * （スマホの GPS の位置 ＋ AR でのカメラからカードまでのずれ）。スマホの位置は camera_lat / camera_lng に残す
 */
export const insertPostWithCurrentLocation = async (
  payload: string | PostPayload,
  options: {
    /** 置いたカードの、スマホからのずれと向き。無ければスマホの位置をそのまま使う */
    placement?: CardPlacement | null;
    /** 平均を取って誤差の小さい現在地があれば使う（その場の 1 回の測定より正確） */
    preferredCoords?: LocationCoords | null;
  } = {}
) => {
  const postData: PostPayload = typeof payload === 'string' ? { message: payload } : payload;

  // 1. 現在地を取得。誤差の小さいほうの位置を使い、高さはその場の測定から取る
  const fix = await getCurrentLocation();
  const preferred = options.preferredCoords;
  const camera: LocationCoords =
    preferred && (preferred.accuracy ?? Infinity) <= (fix.accuracy ?? Infinity)
      ? { ...preferred, altitude: fix.altitude }
      : fix;

  // 2. カード自体の位置
  const placement = options.placement;
  const card = placement
    ? offsetLatLng(camera.latitude, camera.longitude, placement.offsetEastM, placement.offsetNorthM)
    : { latitude: camera.latitude, longitude: camera.longitude };
  const cardAltitude =
    camera.altitude != null ? camera.altitude + (placement?.offsetUpM ?? 0) : null;

  // 3. Supabaseのpostsテーブルへ保存
  const { data, error } = await supabase
    .from('posts')
    .insert([
      {
        message: postData.message,
        lat: card.latitude,
        lng: card.longitude,
        alt_m: cardAltitude,
        heading_deg: placement?.headingDeg ?? null,
        camera_lat: camera.latitude,
        camera_lng: camera.longitude,
        // 位置の確かさ（そのときの GPS の誤差）
        accuracy_m: camera.accuracy ?? null,
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

  // 置いた場所の名前は、保存を待たせないよう後から書き足す（取れなければ空のまま）
  const savedPost = data?.[0];
  if (savedPost?.id != null) {
    fillPostPlaceName(String(savedPost.id), card.latitude, card.longitude);
  }

  return {
    post: savedPost,
    coords: card,
  };
};

/**
 * 投稿に、置いた場所の名前（posts.place_name）を書き足す。取れなかったら何もしない。
 * 書き足した名前を返す（マイページで、名前の無い古い投稿を埋めるのにも使う）
 */
export const fillPostPlaceName = async (postId: string, latitude: number, longitude: number) => {
  const placeName = await reverseGeocode(latitude, longitude);
  if (!placeName) return null;
  const { error } = await supabase.from('posts').update({ place_name: placeName }).eq('id', postId);
  if (error) {
    console.warn('置いた場所の名前を保存できませんでした:', error.message);
    return null;
  }
  return placeName;
};

/**
 * 自分の投稿を削除する。地図ファイル・景色の写真を先に消してから投稿を消す
 * （Storage の削除ポリシーは「投稿の持ち主か」で判定するので、投稿が先に消えると消せなくなる）
 */
export const deleteMyPost = async (postId: string) => {
  // ファイルは無い投稿もあるので、消せなくても投稿の削除は続ける
  const { error: storageError } = await supabase.storage
    .from('worldmaps')
    .remove([`${postId}.worldmap`, `snapshots/${postId}.jpg`]);
  if (storageError) {
    console.warn('地図ファイルの削除に失敗しました:', storageError.message);
  }

  const { data, error } = await supabase.from('posts').delete().eq('id', postId).select('id');
  if (error) {
    throw new Error(`削除に失敗しました: ${error.message}`);
  }
  if (!data || data.length === 0) {
    // RLS で弾かれると、エラーにならず 0 件削除になる
    throw new Error('削除できませんでした（自分の投稿でないか、削除の権限がありません）');
  }
};
