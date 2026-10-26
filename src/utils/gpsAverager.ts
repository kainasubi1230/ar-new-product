import { LOCATION_ACCURACY } from '../config/locationAccuracy';
import type { LocationCoords } from '../services/postService';

type Sample = LocationCoords & { accuracy: number; time: number };

/**
 * GPS の値を受け取り、誤差の大きい値を捨てて、直近の良い値を平均した位置を返す。
 * 誤差が小さい値ほど重く数える（重み = 1 / 誤差²）
 */
export class GpsAverager {
  private samples: Sample[] = [];
  private startedAt: number | null = null;

  /** 新しい値を加え、今使うべき位置を返す。まだ使える値が無ければ null */
  add(fix: LocationCoords, now: number = Date.now()): LocationCoords | null {
    this.startedAt ??= now;
    if (fix.accuracy == null || fix.accuracy < 0) {
      return null;
    }
    this.samples.push({ ...fix, accuracy: fix.accuracy, time: now });
    this.samples = this.samples.filter((s) => now - s.time <= LOCATION_ACCURACY.sampleMaxAgeMs);

    const good = this.samples
      .filter((s) => s.accuracy <= LOCATION_ACCURACY.maxAccuracyM)
      .slice(-LOCATION_ACCURACY.averageSamples);
    if (good.length > 0) {
      return weightedAverage(good);
    }

    // 屋内などで良い値が来ないときは、しばらく待ってから、いちばん良い値だけを使う
    if (now - this.startedAt >= LOCATION_ACCURACY.fallbackAfterMs) {
      const best = this.samples
        .filter((s) => s.accuracy <= LOCATION_ACCURACY.fallbackMaxAccuracyM)
        .sort((a, b) => a.accuracy - b.accuracy)[0];
      if (best) {
        return { latitude: best.latitude, longitude: best.longitude, accuracy: best.accuracy };
      }
    }
    return null;
  }
}

const weightedAverage = (samples: Sample[]): LocationCoords => {
  let weightSum = 0;
  let latitude = 0;
  let longitude = 0;
  for (const s of samples) {
    const weight = 1 / Math.max(s.accuracy, 1) ** 2;
    weightSum += weight;
    latitude += s.latitude * weight;
    longitude += s.longitude * weight;
  }
  return {
    latitude: latitude / weightSum,
    longitude: longitude / weightSum,
    // 平均した分だけ誤差は小さくなる
    accuracy: 1 / Math.sqrt(weightSum),
  };
};
