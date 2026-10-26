/**
 * AR での見え方を距離で切り替えるしきい値（m）。デモの場所に合わせて、ここだけ調整すればよい
 *
 *   〜 preciseM   … 地図の照合を試し、成功したら置いた正確な位置にカードを出す（方角タグは消す）
 *   〜 messageM   … 方角タグに本文も出す
 *   〜 maxM       … 方角タグはタグと距離だけ（本文は出さない）
 *   maxM より遠い … 出さない
 */
export const DISTANCE_TIERS = {
  preciseM: 30,
  messageM: 100,
  maxM: 300,
} as const;

/** 方角タグの見せ方。summary: タグと距離だけ / message: 本文も読める */
export type GeoTagLevel = 'summary' | 'message';

export const geoTagLevelFor = (distanceM: number): GeoTagLevel =>
  distanceM <= DISTANCE_TIERS.messageM ? 'message' : 'summary';

/** 方角タグの濃さの元になる値。0〜1 で、近いほど 1（ネイティブ側で濃く・遠いほど薄く描く） */
export const geoTagProminenceFor = (distanceM: number): number =>
  1 - Math.min(Math.max(distanceM / DISTANCE_TIERS.maxM, 0), 1);
