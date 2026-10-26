import { NativeModules, Platform } from 'react-native';

// iOS のみ（ネイティブの LocaGeocoder。ARViewWrapper.swift の末尾）
const LocaGeocoder = Platform.OS === 'ios' ? NativeModules.LocaGeocoder : undefined;

/**
 * 緯度経度から場所の名前（公園や駅の名前、無ければ「福岡市中央区天神」など）を求める。
 * 取れないとき・timeoutMs を過ぎたときは null（場所の名前が無くても、呼び出し側の処理は続ける）
 */
export const reverseGeocode = async (
  latitude: number,
  longitude: number,
  timeoutMs = 3000
): Promise<string | null> => {
  if (!LocaGeocoder) return null;
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
  try {
    return await Promise.race([LocaGeocoder.reverseGeocode(latitude, longitude) as Promise<string | null>, timeout]);
  } catch {
    return null;
  }
};
