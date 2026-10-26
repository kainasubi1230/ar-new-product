/**
 * ポケット通知（関心タグに合うメッセージの近くに来たら通知）の設定。数字はここだけで調整する
 */
export const POCKET_NOTICE = {
  /** この距離（m）以内に入ったら通知する */
  radiusM: 20,
  /** 通知どうしの最短間隔（秒）。Calm：立て続けに鳴らさない */
  cooldownSec: 180,
  /** 同じメッセージで次に通知するまでの間隔（秒） */
  perPostIntervalSec: 24 * 3600,
  /** GPS の誤差がこれ（m）より大きいときは判定しない（誤って通知しないため） */
  maxAccuracyM: 30,
  /** 通知の対象にする投稿を、現在地からこの範囲（m）で取ってネイティブに渡す */
  targetRadiusM: 500,
  targetLimit: 200,
  /** この距離（m）動いたら対象を取り直す */
  refetchDistanceM: 200,
} as const;
