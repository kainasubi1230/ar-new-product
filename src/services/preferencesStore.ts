import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * 関心タグとポケット通知のオン・オフ。端末の中（AsyncStorage）に保存し、
 * マイページ・タグ管理・AR・地図・通知で同じ値を共有する（どこで変えても全体に反映される）
 */
export type Preferences = {
  /** 関心タグ（「#」付き）。合う投稿を AR・地図で少し強調し、ポケット通知の対象にする */
  interestTags: string[];
  /** ポケット通知（関心タグの言葉の近くに来たら通知）。オンのときだけ見張る */
  pocketNoticeEnabled: boolean;
  /** 開発用の情報（通知画面のポケット通知の状態など）を出すか。開発ビルドのときだけマイページの設定で切り替えられる */
  showDevInfo: boolean;
};

const STORAGE_KEY = 'loca:preferences';

// 初めて使うときの関心タグ（マイページの「関心タグ」タブで最初からオンのもの）
const DEFAULT_PREFERENCES: Preferences = {
  interestTags: ['#散歩', '#カフェ', '#日常', '#本'],
  pocketNoticeEnabled: true,
  showDevInfo: false,
};

let current: Preferences = DEFAULT_PREFERENCES;
let loaded = false;
const listeners = new Set<(prefs: Preferences) => void>();

const normalizeTag = (tag: string) => {
  const trimmed = tag.trim();
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
};

const load = (() => {
  let promise: Promise<void> | null = null;
  return () => {
    promise ??= AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved) {
          const parsed = JSON.parse(saved) as Partial<Preferences>;
          current = { ...DEFAULT_PREFERENCES, ...parsed };
        }
      })
      .catch(() => {})
      .finally(() => {
        loaded = true;
        listeners.forEach((listener) => listener(current));
      });
    return promise;
  };
})();

export const updatePreferences = (patch: Partial<Preferences>) => {
  current = {
    ...current,
    ...patch,
    ...(patch.interestTags ? { interestTags: Array.from(new Set(patch.interestTags.map(normalizeTag))) } : {}),
  };
  listeners.forEach((listener) => listener(current));
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current)).catch(() => {});
};

/** 関心タグとポケット通知の設定を読み書きする。loaded が false の間は初期値 */
export const usePreferences = () => {
  const [prefs, setPrefs] = useState<Preferences>(current);
  const [isLoaded, setIsLoaded] = useState(loaded);

  useEffect(() => {
    const listener = (next: Preferences) => {
      setPrefs(next);
      setIsLoaded(loaded);
    };
    listeners.add(listener);
    load();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return {
    ...prefs,
    loaded: isLoaded,
    setInterestTags: (interestTags: string[]) => updatePreferences({ interestTags }),
    toggleInterestTag: (tag: string) => {
      const normalized = normalizeTag(tag);
      updatePreferences({
        interestTags: current.interestTags.includes(normalized)
          ? current.interestTags.filter((t) => t !== normalized)
          : [...current.interestTags, normalized],
      });
    },
    setPocketNoticeEnabled: (pocketNoticeEnabled: boolean) => updatePreferences({ pocketNoticeEnabled }),
    setShowDevInfo: (showDevInfo: boolean) => updatePreferences({ showDevInfo }),
  };
};
