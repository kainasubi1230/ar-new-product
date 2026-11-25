import { LOCATION_ACCURACY } from '../config/locationAccuracy';
import { distanceInMeters } from './geo';

type Sample = { at: number; speedMps: number };
type LastFix = { at: number; latitude: number; longitude: number; accuracy: number };

/**
 * 乗り物（車・電車など）で移動中かを、GPS の速さから判定する。
 * - iOS の位置情報の speed（ドップラーで測る m/s。測れないときは -1）を優先する
 * - speed が無いときは、前の位置からの距離 ÷ 時間（誤差より大きく動いたときだけ）
 * - 1 回だけ速い値（GPS の飛び）では判定せず、直近の値が続けて速いときだけ「移動中」
 */
export class MovingSpeedMonitor {
  private samples: Sample[] = [];
  private lastFix: LastFix | null = null;

  add(position: {
    timestamp: number;
    coords: { latitude: number; longitude: number; accuracy: number; speed?: number | null };
  }) {
    const { latitude, longitude, accuracy, speed } = position.coords;
    const at = position.timestamp || Date.now();
    let speedMps: number | null = speed != null && speed >= 0 ? speed : null;

    if (speedMps == null && this.lastFix && accuracy <= 50) {
      const dt = (at - this.lastFix.at) / 1000;
      const moved = distanceInMeters(this.lastFix.latitude, this.lastFix.longitude, latitude, longitude);
      // 誤差の分の揺れを速さと取り違えないよう、誤差より大きく動いたときだけ
      if (dt >= 1 && dt <= 30 && moved > accuracy + this.lastFix.accuracy) {
        speedMps = moved / dt;
      }
    }
    this.lastFix = { at, latitude, longitude, accuracy };

    if (speedMps != null) {
      this.samples.push({ at, speedMps });
      const cutoff = at - LOCATION_ACCURACY.fastMovingWindowMs;
      this.samples = this.samples.filter((s) => s.at >= cutoff);
    }
  }

  /** いま乗り物で移動中か（直近の速さが続けてしきい値以上） */
  isFast(now = Date.now()): boolean {
    const recent = this.samples.filter((s) => now - s.at <= LOCATION_ACCURACY.fastMovingWindowMs);
    const lastOnes = recent.slice(-LOCATION_ACCURACY.fastMovingMinSamples);
    return (
      lastOnes.length >= LOCATION_ACCURACY.fastMovingMinSamples &&
      lastOnes.every((s) => s.speedMps >= LOCATION_ACCURACY.fastMovingSpeedMps)
    );
  }

  /** 直近の速さ（m/s。デバッグ表示用。分からなければ null） */
  latestSpeed(now = Date.now()): number | null {
    const last = this.samples[this.samples.length - 1];
    return last && now - last.at <= LOCATION_ACCURACY.fastMovingWindowMs ? last.speedMps : null;
  }
}
