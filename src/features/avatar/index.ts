/**
 * アバター（全身のキャラクター + 5 色）。
 * - types.ts: データの形（AvatarConfig）
 * - artwork.generated.ts: SVG 素材のデータ（scripts/avatar-svgs/build-avatar-artwork.js で生成）
 * - characters.ts / presets.ts: キャラクター一覧・初期カラー・CSS 変数・プリセット
 * - avatarStore.ts: 保存・読み込み（AsyncStorage `loca:avatarConfig`）
 * - AvatarSvg.tsx: 描画 / components/: 作る画面
 */
export * from './types';
export { AvatarSvg } from './AvatarSvg';
export { AVATAR_CHARACTERS, defaultColorsOf, toCssVars } from './characters';
export { AVATAR_COLOR_PRESETS } from './presets';
export {
  createDefaultAvatarConfig,
  parseAvatarConfig,
  saveAvatarConfig,
  serializeAvatarConfig,
  useAvatarConfig,
} from './avatarStore';
export { AvatarStudioModal } from './components/AvatarStudioModal';
