import { useEffect, useState } from 'react';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

export type HeadingState = {
  /** スマホの画面の上端が向いている方位（北=0°、時計回り）。取れなければ null */
  heading: number | null;
  /** 方位の誤差（度）。負なら無効（コンパスの補正が必要） */
  accuracy: number | null;
};

const LocaHeading = Platform.OS === 'ios' ? NativeModules.LocaHeading : undefined;

/**
 * コンパスの方位を受け取る（iOS のみ。ネイティブの LocaHeading モジュール）。
 * active の間だけ受け取り、細かいぶれは角度として（cos, sin で）なめらかにならす
 */
export const useHeading = (active: boolean): HeadingState => {
  const [state, setState] = useState<HeadingState>({ heading: null, accuracy: null });

  useEffect(() => {
    if (!active || !LocaHeading) {
      return;
    }
    const emitter = new NativeEventEmitter(LocaHeading);
    let smoothed: { x: number; y: number } | null = null;
    const subscription = emitter.addListener(
      'heading',
      (event: { heading: number; accuracy: number }) => {
        const rad = (event.heading * Math.PI) / 180;
        const sample = { x: Math.cos(rad), y: Math.sin(rad) };
        smoothed = smoothed
          ? { x: smoothed.x * 0.7 + sample.x * 0.3, y: smoothed.y * 0.7 + sample.y * 0.3 }
          : sample;
        const heading = ((Math.atan2(smoothed.y, smoothed.x) * 180) / Math.PI + 360) % 360;
        setState({ heading, accuracy: event.accuracy });
      }
    );
    return () => subscription.remove();
  }, [active]);

  return state;
};
