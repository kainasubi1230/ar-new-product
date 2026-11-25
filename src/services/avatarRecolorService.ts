import { NativeModules, Platform } from 'react-native';

// iOS のみ（ネイティブの LocaAvatar。ARViewWrapper.swift の末尾）
const LocaAvatar = Platform.OS === 'ios' ? NativeModules.LocaAvatar : undefined;

/** 色を変えた絵を作れるか（作れないときは元の絵を出す） */
export const canRecolorAvatar = !!LocaAvatar;

/** 色を変える絵の種類：キャラクター（cat など）か、アタッチメント（ribbon_01 など） */
export type RecolorKind = 'animal' | 'attachment';

const keyOf = (kind: RecolorKind, asset: string, hex: string) => `${kind}:${asset}:${hex.toLowerCase()}`;
const requests = new Map<string, Promise<string | null>>();
const resolved = new Map<string, string>();

/** もう作ってある絵の URI（無ければ undefined） */
export const peekRecolored = (kind: RecolorKind, asset: string, hex: string): string | undefined =>
  resolved.get(keyOf(kind, asset, hex));

/**
 * 絵のオレンジ・黄色を hex に変えた絵の URI（file://…）。作れないときは null（同梱の元の絵を出す）。
 * 元の色のときも、ネイティブが元の絵をそのままファイルにして返す（どの色でも同じ出し方にするため。
 * 元の色だけ同梱の画像を Image で出していたら、プレビューの大きさが変わったときに左上が拡大されて見えた）
 */
export const recoloredUri = (kind: RecolorKind, asset: string, hex: string): Promise<string | null> => {
  if (!LocaAvatar) return Promise.resolve(null);
  const key = keyOf(kind, asset, hex);
  const cached = requests.get(key);
  if (cached) return cached;
  const render = (kind === 'animal' ? LocaAvatar.render(asset, hex) : LocaAvatar.renderAttachment(asset, hex)) as Promise<string>;
  const request = render
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
