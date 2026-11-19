import AsyncStorage from '@react-native-async-storage/async-storage';
import { analyzeSentiment } from './tagSuggestionService';
import { checkPostSafety } from './safetyFilter';

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
  /** 安心フィルター（ネガティブ投稿や見たくないタグを非表示にするか） */
  hideNegativePosts: boolean;
  /** ポケット通知（関心タグ一致時の通知）をONにするか */
  isPocketNoticeOn: boolean;
  /** 安心フィルターで除外するタグ一覧（「#」付き） */
  mutedTags?: string[];
}

export const DEFAULT_MUTED_TAG_PRESETS = [
  '#愚痴',
  '#混雑',
  '#騒音',
  '#危険',
  '#タバコ',
  '#クレーム',
  '#トラブル',
];

export const DEFAULT_FILTER_SETTINGS: FilterSettings = {
  onlyInterestTags: false,
  hideNegativePosts: true,
  isPocketNoticeOn: true,
  mutedTags: ['#愚痴', '#混雑', '#騒音', '#危険'],
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
 * 安心フィルターのタグ偽装対策：タグだけでなく本文の表現からも除外対象を検知するための関連語辞書
 */
export const MUTED_TOPIC_SYNONYMS: Record<string, string[]> = {
  '#愚痴': ['愚痴', 'ぐち', '最悪', 'むかつく', 'イライラ', '嫌い', 'だるい', 'しんどい', 'つらい', 'うざい', '最低', 'ありえない'],
  '#混雑': ['混雑', '混んで', '満員', '行列', 'ぎゅうぎゅう', '人混み', '待ち時間', '激混み', '入れない', '満席'],
  '#騒音': ['騒音', 'うるさい', '爆音', '工事音', '騒がしい', '叫び声', '鳴り響く', 'やかましい'],
  '#危険': ['危険', '危ない', '事故', '不審者', '立ち入り禁止', '怪我', '落下', 'スリ', '痴漢', '注意喚起'],
  '#タバコ': ['タバコ', 'たばこ', '煙草', '喫煙', '副流煙', 'ヤニ', '煙たい'],
  '#クレーム': ['クレーム', '苦情', '態度悪い', '接客最悪', '二度と行かない', '返金'],
  '#トラブル': ['トラブル', '揉め事', '喧嘩', '警察', '通報', '破損', '故障'],
};

/**
 * 関心タグ増殖対策：表記揺れ・同義語（シノニム）を同じ意味グループとして統合する辞書
 */
export const TAG_SYNONYM_GROUPS: string[][] = [
  ['#カフェ', '#cafe', '#coffee', '#珈琲', '#コーヒー', '#喫茶', '#喫茶店', '#ラテ', '#スタバ'],
  ['#散歩', '#さんぽ', '#ウォーキング', '#walking', '#散策', '#街歩き', '#お散歩', '#お散歩日和', '#ぶらぶら'],
  ['#本', '#book', '#読書', '#小説', '#書店', '#本屋', '#図書館', '#マンガ', '#漫画'],
  ['#グルメ', '#gourmet', '#food', '#ランチ', '#ディナー', '#ごはん', '#美味しい', '#おいしい', '#名店'],
  ['#アート', '#art', '#美術館', '#ギャラリー', '#展示', '#個展', '#写真', '#camera', '#カメラ'],
  ['#自然', '#nature', '#herb', '#ハーブ', '#公園', '#緑', '#木漏れ日', '#森林浴', '#海', '#景色', '#絶景'],
  ['#歴史', '#history', '#史跡', '#レトロ', '#古民家', '#神社仏閣', '#神社', '#お寺'],
  ['#日常', '#everyday', '#daily', '#日記', '#ひとりごと', '#独り言', '#休日'],
];

/**
 * カタカナをひらがなへ変換・小文字化・全角英数を半角化して表記揺れを吸収する比較キー
 */
export function canonicalTagKey(raw: string): string {
  const normalized = raw
    .normalize('NFKC')
    .trim()
    .replace(/^#+/, '')
    .toLowerCase();
  // カタカナ (U+30A1 - U+30F6) をひらがな (U+3041 - U+3096) へ変換
  return normalized.replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

/**
 * タグ文字列を `#タグ名` の形式に正規化する（全角#・全角英数・空白を統一）
 */
export function normalizeTag(raw: string): string {
  const trimmed = raw.normalize('NFKC').trim().replace(/^#+/, '').trim();
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
      mutedTags: Array.isArray(parsed?.mutedTags)
        ? parsed.mutedTags.map(normalizeTag).filter(Boolean)
        : DEFAULT_FILTER_SETTINGS.mutedTags,
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
 * 指定された関心タグ（1つまたは複数）に対して、関連タグ・同義語・表記揺れも含めた展開セットを返す
 */
export function expandInterestTags(interestTags: string[]): Set<string> {
  const expanded = new Set<string>();
  for (const rawTag of interestTags) {
    const norm = normalizeTag(rawTag);
    if (!norm) continue;
    expanded.add(norm);
    const key = canonicalTagKey(norm);

    const preset = INTEREST_TAG_PRESETS.find(
      (p) => canonicalTagKey(p.tag) === key || canonicalTagKey(p.name) === key
    );
    if (preset) {
      for (const rel of preset.relatedTags) {
        expanded.add(normalizeTag(rel));
      }
    }

    for (const group of TAG_SYNONYM_GROUPS) {
      if (group.some((g) => canonicalTagKey(g) === key)) {
        for (const syn of group) {
          expanded.add(normalizeTag(syn));
        }
      }
    }
  }
  return expanded;
}

/**
 * 安心フィルター（タグ偽装・内容不一致対策）：
 * 投稿のタグだけでなく「本文の感情・シノニム表現」をスキャンして、見たくない内容がすり抜けるのを防ぐ。
 */
export function isBlockedBySafetyFilter(
  post: { message?: string | null; tags?: readonly string[] | null },
  mutedTags?: readonly string[]
): boolean {
  const message = (post.message ?? '').normalize('NFKC');
  const messageLower = message.toLowerCase();

  // 1. 厳格な安心フィルター（暴言・誹謗中傷・下ネタ・攻撃的表現・ネガティブ語を本文＆タグ両方でスキャン）
  if (checkPostSafety(post).blocked) {
    return true;
  }

  // 2. 本文のネガティブ感情判定（タグで「#散歩」などと偽装していてもブロック）
  if (message && analyzeSentiment(message).isNegative) {
    return true;
  }

  // 2. 除外タグ・除外キーワードのチェック（タグ ＋ 本文シノニム）
  if (mutedTags && mutedTags.length > 0) {
    const postTagKeys = (post.tags ?? []).map(canonicalTagKey);
    for (const rawMt of mutedTags) {
      const mt = normalizeTag(rawMt);
      if (!mt) continue;
      const mtKey = canonicalTagKey(mt);

      // タグ自体が除外タグ（表記揺れ含む）と一致
      if (postTagKeys.includes(mtKey)) return true;

      // 本文に除外ワードが含まれている場合（タグ未設定や偽装対策）
      const rawWord = mt.replace(/^#+/, '').toLowerCase();
      if (rawWord && messageLower.includes(rawWord)) return true;

      // 除外トピックのシノニム（例: #愚痴 → 最悪, むかつく / #混雑 → 満員, 行列）が本文に含まれる場合
      const synonyms = MUTED_TOPIC_SYNONYMS[mt];
      if (synonyms) {
        for (const syn of synonyms) {
          if (messageLower.includes(syn.toLowerCase())) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

/**
 * 投稿のタグ配列が指定されたターゲットタグ群にマッチするか判定する
 * （表記揺れ、同義語展開、および #隠れ家カフェ のような派生複合タグの部分一致にも対応）
 */
export function matchesTagFilter(
  postTags: readonly string[] | null | undefined,
  targetTags: readonly string[],
  expandRelated = true
): boolean {
  if (!targetTags || targetTags.length === 0) return true;
  if (!postTags || postTags.length === 0) return false;

  const allowedSet = expandRelated
    ? expandInterestTags([...targetTags])
    : new Set(targetTags.map(normalizeTag).filter(Boolean));

  const allowedKeys = new Set(Array.from(allowedSet).map(canonicalTagKey).filter(Boolean));
  // 2文字以上の親カテゴリ単語（例: カフェ, 散歩, グルメ）は複合タグの曖昧包含マッチにも使う
  const prefixKeys = Array.from(allowedKeys).filter((k) => k.length >= 2);

  for (const pt of postTags) {
    const norm = normalizeTag(pt);
    if (!norm) continue;
    if (allowedSet.has(norm)) return true;

    const ptKey = canonicalTagKey(norm);
    if (allowedKeys.has(ptKey)) return true;

    if (prefixKeys.some((pk) => ptKey.includes(pk))) {
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
  /** 安心フィルターで除外するタグ一覧 */
  mutedTags?: string[];
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
    mutedTags = [],
    searchQuery = '',
  } = options;

  const trimmedQuery = searchQuery.trim().toLowerCase();

  return posts.filter((post) => {
    const message = post.message ?? '';
    const postTags = post.tags && post.tags.length > 0 ? post.tags : ['#日常'];

    // 1. 安心フィルター（タグ偽装・内容不一致対策を含むネガティブ判定 ＋ 除外タグ/シノニム検知）
    if (hideNegativePosts && isBlockedBySafetyFilter({ message, tags: postTags }, mutedTags)) {
      return false;
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

