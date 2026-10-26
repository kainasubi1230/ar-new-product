/**
 * GPS の値の選び方（方角タグの位置ずれを減らすため）。数字はここだけで調整する
 */
export const LOCATION_ACCURACY = {
  /** 誤差（horizontalAccuracy）がこれより大きい値は使わない（m） */
  maxAccuracyM: 15,
  /** 良い値を直近この回数分まで平均する */
  averageSamples: 5,
  /** これより古い値は平均に入れない（ミリ秒）。歩いているときに昔の位置に引っ張られないように */
  sampleMaxAgeMs: 30_000,
  /**
   * 屋内などで良い値がこの時間（ミリ秒）来ないときは、誤差が fallbackMaxAccuracyM 以内の
   * いちばん良い値だけを使う（何も出ないよりはまし）
   */
  fallbackAfterMs: 20_000,
  fallbackMaxAccuracyM: 65,
  /** 平均した位置がこれ以上動いたときだけ現在地を更新する（m）。細かく揺れるたびに取り直さない */
  commitDistanceM: 5,
} as const;
