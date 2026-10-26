/**
 * AR での見え方を、位置の確かさと距離で切り替えるしきい値（m）。デモの場所に合わせて、ここだけ調整すればよい
 *
 *   照合に成功    … 置いた正確な位置に、くっきりしたカード（その投稿の他の表示は消す）
 *   〜 preciseM   … 照合できていなければ、その方角に文字のない光の「気配」だけ（位置が分からないのに、正確なふりをしない）
 *   〜 messageM   … 方角タグに本文も出す
 *   〜 maxM       … 方角タグはタグと距離だけ（本文は出さない）
 *   maxM より遠い … 出さない
 * 遠いほど薄く小さく、近いほど濃く（geoTagProminenceFor）
 */
export const DISTANCE_TIERS = {
  preciseM: 30,
  messageM: 100,
  maxM: 300,
  /**
   * 照合する地図の候補を探す範囲は、GPS の誤差に合わせて広げる：max(preciseM, 誤差 + この値)、上限 relocalizeSearchMaxM。
   * 照合は景色で確かめるので、GPS は候補を絞るだけでいい
   */
  relocalizeSearchMarginM: 20,
  relocalizeSearchMaxM: 100,
} as const;

/** 照合する地図の候補を探す範囲（m） */
export const relocalizeSearchRadiusFor = (gpsAccuracyM: number | undefined): number =>
  Math.min(
    Math.max(DISTANCE_TIERS.preciseM, (gpsAccuracyM ?? 0) + DISTANCE_TIERS.relocalizeSearchMarginM),
    DISTANCE_TIERS.relocalizeSearchMaxM
  );

/** 照合できていない投稿の見せ方。presence: 文字のない光の気配 / message: 本文も読めるタグ / summary: タグと距離だけ */
export type GeoTagLevel = 'presence' | 'message' | 'summary';

export const geoTagLevelFor = (distanceM: number): GeoTagLevel =>
  distanceM <= DISTANCE_TIERS.preciseM
    ? 'presence'
    : distanceM <= DISTANCE_TIERS.messageM
      ? 'message'
      : 'summary';

/**
 * 位置の不確かさ（m）。置いたときの GPS の誤差と、今の GPS の誤差を合わせたもの。
 * 気配（光）のぼかしの大きさに使う。分からなければ 10m とみなす
 */
export const positionUncertaintyFor = (placedAccuracyM: number | null | undefined, currentAccuracyM: number | null | undefined) =>
  Math.sqrt((placedAccuracyM ?? 10) ** 2 + (currentAccuracyM ?? 10) ** 2);

/** 方角タグの濃さの元になる値。0〜1 で、近いほど 1（ネイティブ側で濃く・遠いほど薄く描く） */
export const geoTagProminenceFor = (distanceM: number): number =>
  1 - Math.min(Math.max(distanceM / DISTANCE_TIERS.maxM, 0), 1);
