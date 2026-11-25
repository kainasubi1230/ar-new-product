import { AVATAR_ARTWORK } from './artwork.generated';
import {
  AVATAR_CHARACTER_KEYS,
  AVATAR_COLOR_ROLES,
  type AvatarCharacterKey,
  type AvatarColorRole,
  type AvatarColors,
  type AvatarCssVarName,
  type AvatarCssVars,
} from './types';

export const AVATAR_CHARACTERS: { key: AvatarCharacterKey; label: string }[] = [
  { key: 'cat', label: 'ねこ' },
  { key: 'dog', label: 'いぬ' },
  { key: 'bear', label: 'くま' },
  { key: 'rabbit', label: 'うさぎ' },
  { key: 'panda', label: 'パンダ' },
  { key: 'fox', label: 'きつね' },
  { key: 'penguin', label: 'ペンギン' },
  { key: 'chick', label: 'ひよこ' },
];

export const AVATAR_ROLE_LABELS: Record<AvatarColorRole, { label: string; sub: string }> = {
  ink: { label: 'メイン', sub: 'ink' },
  secondary: { label: 'サブ', sub: 'secondary' },
  tertiary: { label: '第3', sub: 'tertiary' },
  accent: { label: 'アクセント', sub: 'accent' },
  base: { label: 'ベース', sub: 'base' },
};

/** 絵に無いパーツ（tertiary の無いキャラクター）の初期値。使われないが、保存データの形をそろえる */
const FALLBACK_COLORS: AvatarColors = {
  ink: '#2E2D2C',
  secondary: '#7F7A72',
  tertiary: '#6E6352',
  accent: '#F2B337',
  base: '#F4E9D2',
};

export const isAvatarCharacter = (value: unknown): value is AvatarCharacterKey =>
  typeof value === 'string' && (AVATAR_CHARACTER_KEYS as readonly string[]).includes(value);

/** キャラクターの初期カラー（素材の色そのまま） */
export const defaultColorsOf = (character: AvatarCharacterKey): AvatarColors => {
  const defaults = AVATAR_ARTWORK[character].defaults;
  const colors = { ...FALLBACK_COLORS };
  for (const role of AVATAR_COLOR_ROLES) {
    const hex = defaults[role];
    if (hex) colors[role] = hex;
  }
  return colors;
};

export const usedRolesOf = (character: AvatarCharacterKey) => AVATAR_ARTWORK[character].usedRoles;

/** パーツの色 → CSS 変数（`--avatar-ink` など） */
export const cssVarNameOf = (role: AvatarColorRole): AvatarCssVarName => `--avatar-${role}`;

export const toCssVars = (colors: AvatarColors): AvatarCssVars =>
  Object.fromEntries(AVATAR_COLOR_ROLES.map((role) => [cssVarNameOf(role), colors[role]])) as AvatarCssVars;

/** `var(--avatar-ink)` を CSS 変数の値にする（知らない変数なら null） */
export const resolveCssVar = (value: string, vars: AvatarCssVars): string | null => {
  const m = value.match(/^var\((--avatar-[a-z]+)\)$/);
  if (!m) return value;
  return (vars as Record<string, string>)[m[1]] ?? null;
};
