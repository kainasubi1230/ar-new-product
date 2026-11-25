import type { AvatarColors } from './types';

/** 色の組み合わせの見本。選んだキャラクターの 5 色をまとめて置き換える */
export const AVATAR_COLOR_PRESETS: { key: string; label: string; colors: AvatarColors }[] = [
  {
    key: 'sakura',
    label: 'さくら',
    colors: { ink: '#4A2E3A', secondary: '#E58FA8', tertiary: '#B85C7A', accent: '#FFD166', base: '#FFF0F3' },
  },
  {
    key: 'soda',
    label: 'ソーダ',
    colors: { ink: '#1D3557', secondary: '#5FA8D3', tertiary: '#2E6F95', accent: '#FFB4A2', base: '#EAF6FF' },
  },
  {
    key: 'matcha',
    label: 'まっちゃ',
    colors: { ink: '#2F3E2A', secondary: '#7FA65A', tertiary: '#4E6E3A', accent: '#F4A259', base: '#F3F7E6' },
  },
  {
    key: 'lemon',
    label: 'レモン',
    colors: { ink: '#3D3522', secondary: '#E9C46A', tertiary: '#B08A2E', accent: '#2A9D8F', base: '#FFFBEA' },
  },
  {
    key: 'grape',
    label: 'ぶどう',
    colors: { ink: '#2B2140', secondary: '#9B7BD4', tertiary: '#6A4FA3', accent: '#FFCB47', base: '#F5F0FF' },
  },
  {
    key: 'night',
    label: 'よぞら',
    colors: { ink: '#F1F5F9', secondary: '#475569', tertiary: '#334155', accent: '#FACC15', base: '#1E293B' },
  },
];
