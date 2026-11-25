import { NativeModules, Platform } from 'react-native';
import { isOriginalAccent, type AvatarAnimal } from '../config/avatarColors';

// iOS のみ（ネイティブの LocaAvatar。ARViewWrapper.swift の末尾）
const LocaAvatar = Platform.OS === 'ios' ? NativeModules.LocaAvatar : undefined;

/** 色を変えた絵を作れるか（作れないときは元の絵を出す） */
export const canRecolorAvatar = !!LocaAvatar;

const keyOf = (animal: AvatarAnimal, hex: string) => `${animal}:${hex.toLowerCase()}`;
const requests = new Map<string, Promise<string | null>>();
const resolved = new Map<string, string>();

/** もう作ってある絵の URI（無ければ undefined） */
export const peekRecoloredAvatar = (animal: AvatarAnimal, hex: string): string | undefined =>
  resolved.get(keyOf(animal, hex));

/**
 * 動物の絵のオレンジ・黄色を hex に変えた絵の URI（file://…）。
 * 元のオレンジ・作れないときは null（元の絵 animalImageOf を出す）
 */
export const recoloredAvatarUri = (animal: AvatarAnimal, hex: string): Promise<string | null> => {
  if (!LocaAvatar || isOriginalAccent(hex)) return Promise.resolve(null);
  const key = keyOf(animal, hex);
  const cached = requests.get(key);
  if (cached) return cached;
  const request = (LocaAvatar.render(animal, hex) as Promise<string>)
    .then((uri) => {
      resolved.set(key, uri);
      return uri;
    })
    .catch(() => {
      requests.delete(key);
      return null;
    });
  requests.set(key, request);
  return request;
};
