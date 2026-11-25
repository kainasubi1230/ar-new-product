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
  /** 照合する地図の候補検索に使うGPS誤差の上限（m）。粗い値で遠くの地図を拾わない */
  relocalizeMaxAccuracyM: 30,
  /** 屋内などで良いGPSが来ないときのフォールバック上限と待ち時間 */
  relocalizeFallbackAccuracyM: 45,
  relocalizeFallbackAfterMs: 8_000,
  /** 平均した位置がこれ以上動いたときだけ現在地を更新する（m）。細かく揺れるたびに取り直さない */
  commitDistanceM: 5,
  /**
   * 乗り物（車・電車など）で動いている間は、言葉を置けないようにする（置いた景色の記録が、あとで現地と合わなくなるため）。
   * この速さ（m/s。6m/s ≒ 時速 22km。歩き・ジョギングより速く、自転車の速め〜車・電車）以上が
   * 続けて fastMovingMinSamples 回、直近 fastMovingWindowMs のうちに測れたら「移動中」とみなす
   */
  fastMovingSpeedMps: 6,
  fastMovingMinSamples: 2,
  fastMovingWindowMs: 10_000,
} as const;
