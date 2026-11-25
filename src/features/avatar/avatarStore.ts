import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { defaultColorsOf, isAvatarCharacter } from './characters';
import { isHexColor } from './color';
import {
  AVATAR_CHARACTER_KEYS,
  AVATAR_COLOR_ROLES,
  type AvatarCharacterKey,
  type AvatarColors,
  type AvatarConfig,
} from './types';

/**
 * アバター（キャラクターと色）を端末に保存・読み込みする。
 * データは JSON（serializeAvatarConfig / parseAvatarConfig）なので、後でサーバーに保存するときもこの形のまま送れる。
 */
const STORAGE_KEY = 'loca:avatarConfig';

export const createDefaultAvatarConfig = (character: AvatarCharacterKey = 'cat'): AvatarConfig => ({
  version: 1,
  character,
  colorsByCharacter: Object.fromEntries(
    AVATAR_CHARACTER_KEYS.map((key) => [key, defaultColorsOf(key)])
  ) as Record<AvatarCharacterKey, AvatarColors>,
});

export const serializeAvatarConfig = (config: AvatarConfig) => JSON.stringify(config);

/** 保存データを読む。壊れた値・知らない値は初期値で埋める（古い版・将来の版のデータでも落ちない） */
export const parseAvatarConfig = (raw: unknown): AvatarConfig => {
  const fallback = createDefaultAvatarConfig();
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
  if (!data || typeof data !== 'object') return fallback;
  const obj = data as Partial<Record<keyof AvatarConfig, unknown>>;
  const savedColors = (obj.colorsByCharacter ?? {}) as Record<string, Record<string, unknown> | undefined>;

  const colorsByCharacter = { ...fallback.colorsByCharacter };
  for (const key of AVATAR_CHARACTER_KEYS) {
    const saved = savedColors[key];
    if (!saved) continue;
    const colors = { ...colorsByCharacter[key] };
    for (const role of AVATAR_COLOR_ROLES) {
      const hex = saved[role];
      if (isHexColor(hex)) colors[role] = hex.toUpperCase();
    }
    colorsByCharacter[key] = colors;
  }
  return {
    version: 1,
    character: isAvatarCharacter(obj.character) ? obj.character : fallback.character,
    colorsByCharacter,
  };
};

let current: AvatarConfig = createDefaultAvatarConfig();
let loaded = false;
const listeners = new Set<(config: AvatarConfig) => void>();

const load = (() => {
  let promise: Promise<void> | null = null;
  return () => {
    promise ??= AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved) current = parseAvatarConfig(saved);
      })
      .catch(() => {})
      .finally(() => {
        loaded = true;
        listeners.forEach((listener) => listener(current));
      });
    return promise;
  };
})();

export const saveAvatarConfig = (config: AvatarConfig) => {
  current = config;
  listeners.forEach((listener) => listener(current));
  AsyncStorage.setItem(STORAGE_KEY, serializeAvatarConfig(config)).catch(() => {});
};

/** 保存してあるアバター。loaded が false の間は初期値 */
export const useAvatarConfig = () => {
  const [config, setConfig] = useState<AvatarConfig>(current);
  const [isLoaded, setIsLoaded] = useState(loaded);

  useEffect(() => {
    const listener = (next: AvatarConfig) => {
      setConfig(next);
      setIsLoaded(loaded);
    };
    listeners.add(listener);
    load();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return { config, loaded: isLoaded, save: saveAvatarConfig };
};
