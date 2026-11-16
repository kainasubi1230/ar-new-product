import { NativeModules, Platform } from 'react-native';

interface LocaAvatarPickerNativeModule {
  pickAvatarImage: () => Promise<string | null>;
}

const nativePicker = NativeModules.LocaAvatarPicker as LocaAvatarPickerNativeModule | undefined;

export function isCustomAvatarUri(icon?: string | null): boolean {
  if (!icon) return false;
  return (
    icon.startsWith('data:image/') ||
    icon.startsWith('file://') ||
    icon.startsWith('http://') ||
    icon.startsWith('https://')
  );
}

/**
 * 端末の写真ライブラリから画像を選択し、オンデバイスで不適切画像を検査したうえで
 * 正方形の JPEG Data URI を返す。キャンセル時は null を返す。
 * 不適切画像と判定された場合は Error (code: 'INAPPROPRIATE_IMAGE') をスローする。
 */
export async function pickAvatarImage(): Promise<string | null> {
  if (Platform.OS !== 'ios' || !nativePicker?.pickAvatarImage) {
    throw new Error('画像ピッカーはこの端末では利用できません。');
  }
  return await nativePicker.pickAvatarImage();
}

