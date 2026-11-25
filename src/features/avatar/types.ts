/**
 * アバター（全身のキャラクター）の型。
 * 今は「キャラクター」と「5 つの色」だけ。アタッチメント（帽子・メガネ）や背景は、
 * AvatarConfig にフィールドを足し、AvatarSvg にレイヤーを足して拡張する（version を上げて読み込み時に移行する）。
 */

export const AVATAR_CHARACTER_KEYS = ['cat', 'dog', 'bear', 'rabbit', 'panda', 'fox', 'penguin', 'chick'] as const;
export type AvatarCharacterKey = (typeof AVATAR_CHARACTER_KEYS)[number];

/** 色を変えられるパーツ（SVG の data-color-role） */
export const AVATAR_COLOR_ROLES = ['ink', 'secondary', 'tertiary', 'accent', 'base'] as const;
export type AvatarColorRole = (typeof AVATAR_COLOR_ROLES)[number];

/** パーツごとの色（#RRGGBB） */
export type AvatarColors = Record<AvatarColorRole, string>;

/** CSS 変数の名前（`--avatar-ink` など） */
export type AvatarCssVarName = `--avatar-${AvatarColorRole}`;
export type AvatarCssVars = Record<AvatarCssVarName, string>;

export type AvatarArtworkGroup = {
  role: AvatarColorRole;
  /** `var(--avatar-<role>)`。描くときに CSS 変数の値に置き換える */
  fill: string;
  /** 素材そのままの色（陰影の差を保つのに使う） */
  original: string;
  fillRule: 'evenodd' | 'nonzero';
  d: string;
};

export type AvatarArtwork = {
  viewBox: string;
  /** この絵で使われているパーツ（tertiary が無いキャラクターもある） */
  usedRoles: AvatarColorRole[];
  /** パーツごとの素材の代表の色（初期カラー） */
  defaults: Partial<AvatarColors>;
  groups: AvatarArtworkGroup[];
};

/** 保存・読み込みするアバターのデータ */
export type AvatarConfig = {
  version: 1;
  /** 選んでいるキャラクター */
  character: AvatarCharacterKey;
  /** キャラクターごとの色（切り替えても、それぞれの色を覚えておく） */
  colorsByCharacter: Record<AvatarCharacterKey, AvatarColors>;
  // 将来: attachments?: AvatarAttachment[]; background?: AvatarBackground;
};
