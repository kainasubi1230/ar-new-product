import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_AVATAR_COLOR } from '../config/avatarColors';

/**
 * 関心タグとポケット通知のオン・オフ。端末の中（AsyncStorage）に保存し、
 * マイページ・タグ管理・AR・地図・通知で同じ値を共有する（どこで変えても全体に反映される）
 */
export type Preferences = {
  /** 関心タグ（「#」付き）。合う投稿を AR・地図で少し強調し、ポケット通知の対象にする */
  interestTags: string[];
  /** ポケット通知（関心タグの言葉の近くに来たら通知）。オンのときだけ見張る */
  pocketNoticeEnabled: boolean;
  /** 関心タグ（と関連タグ）に合う投稿だけを AR・地図に出すか */
  onlyInterestTags: boolean;
  /** 安心フィルター: 見たくない投稿（ネガティブ表現や除外タグ）を AR・地図に出さないか */
  hideNegativePosts: boolean;
  /** 安心フィルターで除外するタグ一覧（「#」付き） */
  mutedTags: string[];
  /** 探索の地図に文化遺産のピンを出すか（地図の右下のボタンで切り替える） */
  showHeritagePins: boolean;
  /** アイコンの動物（`src/config/avatarColors.ts` の AVATAR_ANIMALS の key）。まだ選んでいなければ無し（アカウントごとに決まった動物） */
  avatarAnimal?: string;
  /** アイコン（動物の後ろの丸）の色（#RRGGBB、`src/config/avatarColors.ts` の AVATAR_COLORS から選ぶ） */
  avatarColor: string;
  /** この設定を使っているアカウント（auth の user id）。別のアカウントでログインしたら初期値に戻す */
  ownerUserId?: string;
};

const STORAGE_KEY = 'loca:preferences';

// 初めて使うときの関心タグ（マイページの「関心タグ」タブで最初からオンのもの）
const DEFAULT_PREFERENCES: Preferences = {
  interestTags: ['#散歩', '#日常'],
  pocketNoticeEnabled: true,
  onlyInterestTags: false,
  hideNegativePosts: true,
  mutedTags: ['#愚痴', '#混雑', '#騒音', '#危険'],
  showHeritagePins: true,
  avatarColor: DEFAULT_AVATAR_COLOR,
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
          // 前のバージョンのアイコン（絵・写真の userAvatarIcon）は使わなくなったので捨てる（写真は十数万文字ある）
          if ('userAvatarIcon' in current) {
            delete (current as Partial<Preferences> & { userAvatarIcon?: string }).userAvatarIcon;
            AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current)).catch(() => {});
          }
          if (!/^#[0-9A-Fa-f]{6}$/.test(current.avatarColor)) {
            current.avatarColor = DEFAULT_AVATAR_COLOR;
          }
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
    setOnlyInterestTags: (onlyInterestTags: boolean) => updatePreferences({ onlyInterestTags }),
    setHideNegativePosts: (hideNegativePosts: boolean) => updatePreferences({ hideNegativePosts }),
    setMutedTags: (mutedTags: string[]) => updatePreferences({ mutedTags }),
    setShowHeritagePins: (showHeritagePins: boolean) => updatePreferences({ showHeritagePins }),
    setAvatar: (avatarAnimal: string, avatarColor: string) => updatePreferences({ avatarAnimal, avatarColor }),
    toggleMutedTag: (tag: string) => {
      const normalized = normalizeTag(tag);
      updatePreferences({
        mutedTags: current.mutedTags.includes(normalized)
          ? current.mutedTags.filter((t) => t !== normalized)
          : [...current.mutedTags, normalized],
      });
    },
    setAvatarColor: (avatarColor: string) => updatePreferences({ avatarColor }),
  };
};

/**
 * ログインしているアカウントに合わせる。設定は端末に保存しているので、
 * 別のアカウントでログイン（新しく作った場合も）したら、前の人の関心タグや除外タグを持ち越さず初期値に戻す。
 * まだ持ち主が決まっていない設定（前のバージョンから使っている人）は、そのまま今のアカウントのものにする
 */
export const adoptPreferencesForUser = async (userId: string) => {
  await load();
  if (current.ownerUserId === userId) return;
  if (current.ownerUserId === undefined) {
    updatePreferences({ ownerUserId: userId });
    return;
  }
  current = { ...DEFAULT_PREFERENCES, ownerUserId: userId };
  listeners.forEach((listener) => listener(current));
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current)).catch(() => {});
};
