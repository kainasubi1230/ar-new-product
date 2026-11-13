import AsyncStorage from '@react-native-async-storage/async-storage';
import { analyzeSentiment } from './tagSuggestionService';

const STORAGE_KEY_INTEREST_TAGS = '@loca:interest_tags_v1';
const STORAGE_KEY_FILTER_SETTINGS = '@loca:filter_settings_v1';

export interface InterestTagPreset {
  id: string;
  name: string; // '#' なしの表示名 (例: '散歩')
  tag: string;  // '#' 付きの正規化タグ (例: '#散歩')
  desc: string;
  defaultEnabled: boolean;
  relatedTags: string[]; // 同カテゴリの関連タグ（フィルタリング時に一致とみなす）
}

export interface FilterSettings {
  /** 関心タグのみをAR空間・レーダーに表示するか */
  onlyInterestTags: boolean;
  /** ネガティブ判定された投稿を自動で非表示にするか（安心フィルター） */
  hideNegativePosts: boolean;
  /** ポケット通知（関心タグ一致時の通知）をONにするか */
  isPocketNoticeOn: boolean;
}

export const DEFAULT_FILTER_SETTINGS: FilterSettings = {
  onlyInterestTags: false,
  hideNegativePosts: true,
  isPocketNoticeOn: true,
};

export const INTEREST_TAG_PRESETS: InterestTagPreset[] = [
  {
    id: 't1',
    name: '散歩',
    tag: '#散歩',
    defaultEnabled: true,
    desc: '街歩きや小道、おすすめの休憩スポット',
    relatedTags: ['#散歩', '#お散歩日和', '#街歩き', '#スポット', '#移動中', '#おでかけ', '#ドライブ', '#旅行'],
  },
  {
    id: 't2',
    name: 'カフェ',
    tag: '#カフェ',
    defaultEnabled: true,
    desc: '落ち着ける席や美味しい珈琲の記録',
    relatedTags: ['#カフェ', '#カフェ巡り', '#スイーツ', '#パン屋', '#抹茶', '#朝活'],
  },
  {
    id: 't3',
    name: '日常',
    tag: '#日常',
    defaultEnabled: true,
    desc: '街で見つけた小さな気づきや独り言',
    relatedTags: ['#日常', '#休日', '#お仕事中', '#勉強中', '#リフレッシュ', '#サウナ', '#ペット', '#推し活'],
  },
  {
    id: 't4',
    name: '本',
    tag: '#本',
    defaultEnabled: true,
    desc: '本と読書、心に残る一節のしおり',
    relatedTags: ['#本', '#読書', '#小説', '#書店', '#図書館'],
  },
  {
    id: 't5',
    name: 'グルメ',
    tag: '#グルメ',
    defaultEnabled: false,
    desc: '路地裏の隠れ家やおすすめの一皿',
    relatedTags: [
      '#グルメ',
      '#ランチ',
      '#ディナー',
      '#ラーメン',
      '#麺活',
      '#カレー',
      '#焼肉',
      '#海鮮',
      '#乾杯',
      '#スイーツ',
      '#パン屋',
    ],
  },
  {
    id: 't6',
    name: '歴史',
    tag: '#歴史',
    defaultEnabled: false,
    desc: '街の記憶、昔話、碑の由来',
    relatedTags: ['#歴史', '#神社仏閣', '#レトロ', '#建築', '#思い出'],
  },
  {
    id: 't7',
    name: 'アート',
    tag: '#アート',
    defaultEnabled: false,
    desc: 'ストリートアートやギャラリーの発見',
    relatedTags: ['#アート', '#写真', '#美術館', '#ギャラリー', '#デザイン', '#音楽'],
  },
  {
    id: 't8',
    name: '自然',
    tag: '#自然',
    defaultEnabled: false,
    desc: '公園や木漏れ日、季節の移ろいを感じる場所',
    relatedTags: [
      '#自然',
      '#公園',
      '#大濠公園',
      '#海',
      '#糸島',
      '#絶景',
      '#青空',
      '#いい天気',
      '#夕暮れ',
      '#夜空',
      '#夜景',
      '#春',
      '#夏',
      '#秋',
      '#冬',
      '#季節の便り',
      '#虹',
    ],
  },
];

export const ALL_SUGGESTED_TAGS: string[] = [
  '#カフェ',
  '#グルメ',
  '#散歩',
  '#日常',
  '#本',
  '#自然',
  '#アート',
  '#歴史',
  '#写真',
  '#絶景',
  '#思い出',
  '#隠れ家',
  '#ランチ',
  '#スイーツ',
  '#サウナ',
  '#街歩き',
];

/**
 * タグ文字列を `#タグ名` の形式に正規化する
 */
export function normalizeTag(raw: string): string {
  const trimmed = raw.trim().replace(/^#+/, '').trim();
  if (!trimmed) return '';
  return `#${trimmed}`;
}

/**
 * デフォルトの関心タグ配列（#付き）を返す
 */
export function getDefaultInterestTags(): string[] {
  return INTEREST_TAG_PRESETS.filter((p) => p.defaultEnabled).map((p) => p.tag);
}

/**
 * 保存済みの関心タグ一覧を取得する
 */
export async function loadInterestTags(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_INTEREST_TAGS);
    if (!raw) return getDefaultInterestTags();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const normalized = parsed
        .map((t) => (typeof t === 'string' ? normalizeTag(t) : ''))
        .filter((t) => t.length > 1);
      return Array.from(new Set(normalized));
    }
  } catch (e) {
    console.warn('[interestTagService] Failed to load interest tags:', e);
  }
  return getDefaultInterestTags();
}

/**
 * 関心タグ一覧を保存する
 */
export async function saveInterestTags(tags: string[]): Promise<string[]> {
  const normalized = Array.from(
    new Set(tags.map((t) => normalizeTag(t)).filter((t) => t.length > 1))
  );
  try {
    await AsyncStorage.setItem(STORAGE_KEY_INTEREST_TAGS, JSON.stringify(normalized));
  } catch (e) {
    console.warn('[interestTagService] Failed to save interest tags:', e);
  }
  return normalized;
}

/**
 * フィルター設定を読み込む
 */
export async function loadFilterSettings(): Promise<FilterSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_FILTER_SETTINGS);
    if (!raw) return { ...DEFAULT_FILTER_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      onlyInterestTags:
        typeof parsed?.onlyInterestTags === 'boolean'
          ? parsed.onlyInterestTags
          : DEFAULT_FILTER_SETTINGS.onlyInterestTags,
      hideNegativePosts:
        typeof parsed?.hideNegativePosts === 'boolean'
          ? parsed.hideNegativePosts
          : DEFAULT_FILTER_SETTINGS.hideNegativePosts,
      isPocketNoticeOn:
        typeof parsed?.isPocketNoticeOn === 'boolean'
          ? parsed.isPocketNoticeOn
          : DEFAULT_FILTER_SETTINGS.isPocketNoticeOn,
    };
  } catch (e) {
    console.warn('[interestTagService] Failed to load filter settings:', e);
    return { ...DEFAULT_FILTER_SETTINGS };
  }
}

/**
 * フィルター設定を保存する
 */
export async function saveFilterSettings(settings: FilterSettings): Promise<FilterSettings> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_FILTER_SETTINGS, JSON.stringify(settings));
  } catch (e) {
    console.warn('[interestTagService] Failed to save filter settings:', e);
  }
  return settings;
}

/**
 * 指定された関心タグ（1つまたは複数）に対して、関連タグも含めた展開セットを返す
 */
export function expandInterestTags(interestTags: string[]): Set<string> {
  const expanded = new Set<string>();
  for (const rawTag of interestTags) {
    const norm = normalizeTag(rawTag);
    if (!norm) continue;
    expanded.add(norm);
    const preset = INTEREST_TAG_PRESETS.find((p) => p.tag === norm || `#${p.name}` === norm);
    if (preset) {
      for (const rel of preset.relatedTags) {
        expanded.add(normalizeTag(rel));
      }
    }
  }
  return expanded;
}

/**
 * 投稿のタグ配列（またはメッセージ本文）が指定されたターゲットタグ群にマッチするか判定する
 */
export function matchesTagFilter(
  postTags: string[] | null | undefined,
  targetTags: string[],
  expandRelated = true
): boolean {
  if (!targetTags || targetTags.length === 0) return true;
  if (!postTags || postTags.length === 0) return false;

  const allowedSet = expandRelated
    ? expandInterestTags(targetTags)
    : new Set(targetTags.map(normalizeTag).filter(Boolean));

  for (const pt of postTags) {
    const norm = normalizeTag(pt);
    if (norm && allowedSet.has(norm)) {
      return true;
    }
  }
  return false;
}

export interface FilterablePost {
  message?: string | null;
  tags?: string[] | null;
}

export interface PostFilterOptions {
  /**
   * 選択中の単一タグフィルタ:
   * - null または 'ALL': すべて（ただし onlyInterestTags が true なら関心タグで絞る）
   * - '__INTEREST__': 関心タグに一致するもののみ
   * - '#カフェ' 等の具体タグ: そのタグ（および関連タグ）に一致するもののみ
   */
  activeFilterTag?: string | null;
  /** ユーザーが設定している関心タグ一覧 */
  interestTags?: string[];
  /** 関心タグのみ表示モードがONか */
  onlyInterestTags?: boolean;
  /** ネガティブ投稿を非表示にするか */
  hideNegativePosts?: boolean;
  /** 検索キーワード（任意） */
  searchQuery?: string;
}

/**
 * 投稿リストをタグ・関心タグ・ネガティブ感情フィルター・検索キーワードで絞り込む
 */
export function filterPostsByCriteria<T extends FilterablePost>(
  posts: T[],
  options: PostFilterOptions
): T[] {
  const {
    activeFilterTag = null,
    interestTags = [],
    onlyInterestTags = false,
    hideNegativePosts = true,
    searchQuery = '',
  } = options;

  const trimmedQuery = searchQuery.trim().toLowerCase();

  return posts.filter((post) => {
    const message = post.message ?? '';
    const postTags = post.tags && post.tags.length > 0 ? post.tags : ['#日常'];

    // 1. ネガティブ感情フィルタリング（安心フィルター）
    if (hideNegativePosts && message) {
      const sentiment = analyzeSentiment(message);
      if (sentiment.isNegative) {
        return false;
      }
    }

    // 2. 検索キーワードフィルタリング
    if (trimmedQuery) {
      const inMessage = message.toLowerCase().includes(trimmedQuery);
      const inTags = postTags.some((t) => t.toLowerCase().includes(trimmedQuery));
      if (!inMessage && !inTags) {
        return false;
      }
    }

    // 3. タグ・関心タグフィルタリング
    if (activeFilterTag && activeFilterTag !== 'ALL') {
      if (activeFilterTag === '__INTEREST__') {
        if (interestTags.length > 0 && !matchesTagFilter(postTags, interestTags, true)) {
          return false;
        }
      } else {
        if (!matchesTagFilter(postTags, [activeFilterTag], true)) {
          return false;
        }
      }
    } else if (onlyInterestTags && interestTags.length > 0) {
      if (!matchesTagFilter(postTags, interestTags, true)) {
        return false;
      }
    }

    return true;
  });
}

