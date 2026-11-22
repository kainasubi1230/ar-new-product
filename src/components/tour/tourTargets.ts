import type { View } from 'react-native';

/** 使い方ツアーで光らせる場所 */
export type TourTargetKey = 'post' | 'tab:home' | 'tab:radar' | 'tab:notifications' | 'tab:mypage';

export type TourRect = { x: number; y: number; width: number; height: number };

const targets = new Map<TourTargetKey, View>();
const refCallbacks = new Map<TourTargetKey, (view: View | null) => void>();

/** 光らせたい部品に `ref={tourTargetRef('post')}` と付ける */
export const tourTargetRef = (key: TourTargetKey) => {
  let callback = refCallbacks.get(key);
  if (!callback) {
    callback = (view: View | null) => {
      if (view) targets.set(key, view);
      else targets.delete(key);
    };
    refCallbacks.set(key, callback);
  }
  return callback;
};

/** 画面の中での位置（ツアーの重ね絵は画面全体に出すので、画面の座標で測る） */
export const measureTourTarget = (key: TourTargetKey): Promise<TourRect | null> =>
  new Promise((resolve) => {
    const view = targets.get(key);
    if (!view) {
      resolve(null);
      return;
    }
    view.measureInWindow((x, y, width, height) => {
      resolve(width > 0 && height > 0 ? { x, y, width, height } : null);
    });
  });
