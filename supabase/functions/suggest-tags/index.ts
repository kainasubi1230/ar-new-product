// Supabase Edge Function: suggest-tags
// 高精度NLPタグ抽出（感情・印象タグは除外し具体的な行動・場所・グルメに特化）
// ＋ ポジティブ度／ネガティブ度（センチメント）の裏側スコアリング

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export type Dimension = 'food' | 'spot' | 'weather' | 'activity' | 'time' | 'general';

export interface TagRule {
  pattern: RegExp;
  tag: string;
  dimension: Dimension;
  weight: number;
}

export interface SentimentResult {
  /** -1.0 (極めてネガティブ) 〜 +1.0 (極めてポジティブ) */
  score: number;
  /** ポジティブ度 (0.0 〜 1.0) */
  positiveScore: number;
  /** ネガティブ度 (0.0 〜 1.0) */
  negativeScore: number;
  /** ネガティブ投稿判定フラグ（フィルタリング用） */
  isNegative: boolean;
}

// 感情・印象系タグは完全除外。場所・モノ・行動・天候に特化した辞書
const TAG_RULES: TagRule[] = [
  // --- グルメ・カフェ・スイーツ ---
  { pattern: /カフェ|珈琲|コーヒー|ラテ|エスプレッソ|フラペチーノ|スタバ|喫茶/i, tag: '#カフェ', dimension: 'food', weight: 12 },
  { pattern: /カフェ|喫茶|スイーツ|パフェ|プリン|クレープ/i, tag: '#カフェ巡り', dimension: 'food', weight: 9 },
  { pattern: /パン|ベーカリー|クロワッサン|トースト|サンドイッチ/i, tag: '#パン屋', dimension: 'food', weight: 11 },
  { pattern: /スイーツ|ケーキ|タルト|パフェ|プリン|クレープ|アイス|ジェラート|チョコ|甘党/i, tag: '#スイーツ', dimension: 'food', weight: 11 },
  { pattern: /抹茶|ほうじ茶|和菓子|あんこ|団子/i, tag: '#抹茶', dimension: 'food', weight: 10 },
  { pattern: /ランチ|昼飯|昼ごはん|お昼|定食|プレート/i, tag: '#ランチ', dimension: 'food', weight: 10 },
  { pattern: /ディナー|夕食|夜ご飯|晩御飯|晩飯|ごちそう/i, tag: '#ディナー', dimension: 'food', weight: 10 },
  { pattern: /ラーメン|つけ麺|豚骨|家系|油そば|麺活/i, tag: '#ラーメン', dimension: 'food', weight: 12 },
  { pattern: /うどん|蕎麦|そば/i, tag: '#麺活', dimension: 'food', weight: 10 },
  { pattern: /カレー|スパイスカレー|ナン/i, tag: '#カレー', dimension: 'food', weight: 11 },
  { pattern: /焼肉|ステーキ|肉|牛タン|ホルモン|もつ鍋/i, tag: '#焼肉', dimension: 'food', weight: 11 },
  { pattern: /寿司|鮨|海鮮|刺身|サーモン|マグロ/i, tag: '#海鮮', dimension: 'food', weight: 11 },
  { pattern: /居酒屋|ビール|乾杯|ハイボール|飲み会|晩酌|ワイン|日本酒|サワー|はしご酒/i, tag: '#乾杯', dimension: 'food', weight: 10 },
  { pattern: /美味しい|うま|美味|絶品|飯テロ/i, tag: '#グルメ', dimension: 'food', weight: 8 },

  // --- スポット・ロケーション・街 ---
  { pattern: /天神|大名|今泉|警固|新天町/i, tag: '#天神', dimension: 'spot', weight: 12 },
  { pattern: /博多|中洲|キャナル|博多駅/i, tag: '#博多', dimension: 'spot', weight: 12 },
  { pattern: /薬院|平尾|高砂/i, tag: '#薬院', dimension: 'spot', weight: 11 },
  { pattern: /糸島|二見ヶ浦|志摩/i, tag: '#糸島', dimension: 'spot', weight: 11 },
  { pattern: /大濠|大濠公園|舞鶴/i, tag: '#大濠公園', dimension: 'spot', weight: 11 },
  { pattern: /公園|芝生|ベンチ|広場/i, tag: '#公園', dimension: 'spot', weight: 10 },
  { pattern: /海|海岸|砂浜|ビーチ|波音/i, tag: '#海', dimension: 'spot', weight: 11 },
  { pattern: /神社|お寺|参拝|御朱印|鳥居|初詣/i, tag: '#神社仏閣', dimension: 'spot', weight: 10 },
  { pattern: /展望台|屋上|タワー|景色|眺め/i, tag: '#絶景', dimension: 'spot', weight: 10 },
  { pattern: /隠れ家|穴場|路地|路地裏|裏路地/i, tag: '#隠れ家', dimension: 'spot', weight: 10 },
  { pattern: /駅|地下鉄|電車|バス停|空港/i, tag: '#移動中', dimension: 'spot', weight: 9 },
  { pattern: /街|通り|路地|景色|風景/i, tag: '#街歩き', dimension: 'spot', weight: 8 },
  { pattern: /ここ|現在地|発見|AR|足跡/i, tag: '#スポット', dimension: 'spot', weight: 7 },

  // --- 天気・自然・季節 ---
  { pattern: /晴れ|青空|快晴|いい天気|太陽|ぽかぽか|日差し/i, tag: '#青空', dimension: 'weather', weight: 10 },
  { pattern: /晴れ|快晴|陽気/i, tag: '#いい天気', dimension: 'weather', weight: 9 },
  { pattern: /雨|傘|梅雨|あめ|どしゃ降り/i, tag: '#雨の日', dimension: 'weather', weight: 11 },
  { pattern: /虹|レインボー/i, tag: '#虹', dimension: 'weather', weight: 12 },
  { pattern: /曇|くもり/i, tag: '#曇り空', dimension: 'weather', weight: 7 },
  { pattern: /桜|花見|春|新生活|さくら/i, tag: '#春', dimension: 'weather', weight: 10 },
  { pattern: /夏|海|プール|花火|祭り|猛暑/i, tag: '#夏', dimension: 'weather', weight: 10 },
  { pattern: /秋|紅葉|涼しい|金木犀|秋晴れ/i, tag: '#秋', dimension: 'weather', weight: 10 },
  { pattern: /冬|雪|寒い|こたつ/i, tag: '#冬', dimension: 'weather', weight: 10 },
  { pattern: /イルミネーション|ライトアップ/i, tag: '#イルミネーション', dimension: 'weather', weight: 11 },

  // --- 行動・ライフスタイル ---
  { pattern: /散歩|さんぽ|歩く|ウォーキング|ぶらぶら/i, tag: '#散歩', dimension: 'activity', weight: 11 },
  { pattern: /散歩|おでかけ|出かけ|外出|寄り道/i, tag: '#お散歩日和', dimension: 'activity', weight: 9 },
  { pattern: /ドライブ|ツーリング/i, tag: '#ドライブ', dimension: 'activity', weight: 11 },
  { pattern: /旅|旅行|観光|一人旅|女子旅/i, tag: '#旅行', dimension: 'activity', weight: 11 },
  { pattern: /買い物|ショッピング|買った|購入|古着/i, tag: '#お買い物', dimension: 'activity', weight: 10 },
  { pattern: /サウナ|ととのう|水風呂|温泉|銭湯|スパ/i, tag: '#サウナ', dimension: 'activity', weight: 12 },
  { pattern: /ジム|筋トレ|ランニング|運動|ワークアウト/i, tag: '#リフレッシュ', dimension: 'activity', weight: 10 },
  { pattern: /勉強|テスト|学習|自習|資格/i, tag: '#勉強中', dimension: 'activity', weight: 10 },
  { pattern: /読書|本を読む|カフェ読書|小説|単行本|文庫本|愛読|マンガ|漫画/i, tag: '#読書', dimension: 'activity', weight: 11 },
  { pattern: /仕事|残業|mtg|ミーティング|会議|出勤|出社|作業/i, tag: '#お仕事中', dimension: 'activity', weight: 10 },
  { pattern: /(?<!ド)ライブ|推し|推し活|現場|フェス|参戦/i, tag: '#推し活', dimension: 'activity', weight: 12 },
  { pattern: /写真|カメラ|スナップ|ファインダー/i, tag: '#写真', dimension: 'activity', weight: 10 },
  { pattern: /犬|いぬ|わんこ|猫|ねこ|にゃんこ|ペット/i, tag: '#ペット', dimension: 'activity', weight: 11 },
  { pattern: /休み|休日|週末|土曜|日曜|祝日|華金|連休/i, tag: '#休日', dimension: 'activity', weight: 10 },

  // --- 時間帯 ---
  { pattern: /朝|モーニング|早起き|朝活/i, tag: '#朝活', dimension: 'time', weight: 10 },
  { pattern: /夜景/i, tag: '#夜景', dimension: 'time', weight: 12 },
  { pattern: /夜|夜空|星|月|夜道/i, tag: '#夜空', dimension: 'time', weight: 9 },
  { pattern: /夕暮れ|夕焼け|夕日|黄昏|放課後|マジックアワー/i, tag: '#夕暮れ', dimension: 'time', weight: 10 },
];

// 絵文字マッピング（感情系ではなく具体的な対象）
const EMOJI_RULES: { emojiPattern: RegExp; tag: string; dimension: Dimension; weight: number }[] = [
  { emojiPattern: /☕|🍵|🧋/, tag: '#カフェ', dimension: 'food', weight: 11 },
  { emojiPattern: /🍜|🍥/, tag: '#ラーメン', dimension: 'food', weight: 12 },
  { emojiPattern: /🍰|🍮|🍨|🍩|🧁/, tag: '#スイーツ', dimension: 'food', weight: 11 },
  { emojiPattern: /🍺|🍻|🍷|🍶|🥂/, tag: '#乾杯', dimension: 'food', weight: 11 },
  { emojiPattern: /☀️|🌤️/, tag: '#いい天気', dimension: 'weather', weight: 10 },
  { emojiPattern: /🌧️|☔/, tag: '#雨の日', dimension: 'weather', weight: 11 },
  { emojiPattern: /🌸|🌺|🌻|🍁/, tag: '#季節の便り', dimension: 'weather', weight: 9 },
  { emojiPattern: /🧖|♨️/, tag: '#サウナ', dimension: 'activity', weight: 12 },
  { emojiPattern: /📸|📷/, tag: '#写真', dimension: 'activity', weight: 10 },
  { emojiPattern: /🐱|🐶/, tag: '#ペット', dimension: 'activity', weight: 10 },
];

const DEFAULT_TAGS = ['#日常', '#街歩き', '#スポット', '#おでかけ'];

// 特徴的なカタカナ単語（3文字以上）の動的抽出
function extractKatakanaKeywords(text: string): { tag: string; dimension: Dimension; weight: number }[] {
  const matches = text.match(/[ァ-ヴー]{3,}/g);
  if (!matches) return [];

  const stopWords = new Set([
    'コーヒー', 'ラーメン', 'カフェ', 'スイーツ', 'ランチ', 'ディナー', 'サウナ',
    'タイム', 'スタート', 'ラスト', 'タイプ', 'スタイル', 'スペース', 'ポイント', 'チェック',
    'イライラ', 'ムカムカ', 'モヤモヤ', 'ギリギリ', 'ヘトヘト', 'ワクワク', 'ドキドキ', 'バタバタ', 'クタクタ', 'ショック'
  ]);
  const result: { tag: string; dimension: Dimension; weight: number }[] = [];

  for (const word of matches) {
    if (!stopWords.has(word) && word.length <= 8) {
      result.push({ tag: `#${word}`, dimension: 'general', weight: 9 });
    }
  }
  return result;
}

// -------------------------------------------------------------
// 感情分析エンジン（ポジティブ度／ネガティブ度のスコアリング）
// -------------------------------------------------------------
const POSITIVE_PATTERNS: { pattern: RegExp; weight: number }[] = [
  { pattern: /最高|大満足|超楽しい|神|至福|感動|素晴らしい|圧巻/i, weight: 1.0 },
  { pattern: /嬉しい|うれしい|楽しい|たのしい|幸せ|しあわせ|ハッピー|わくわく/i, weight: 0.8 },
  { pattern: /美味しい|おいしい|美味|うま|絶品|ごちそう/i, weight: 0.8 },
  { pattern: /ありがとう|感謝|助かった|よかった|良かった|いいね|好き|お気に入り/i, weight: 0.7 },
  { pattern: /リラックス|癒やし|癒し|落ち着く|ととのった|ほっこり/i, weight: 0.7 },
  { pattern: /前向き|頑張る|がんばる|やる気|楽しみ|期待/i, weight: 0.6 },
  { pattern: /綺麗|きれい|青空|快晴|いい天気|絶景|美しい/i, weight: 0.6 },
  { pattern: /✨|🎉|💖|❤️|🥰|😆|😍|👍/, weight: 0.5 },
];

const NEGATIVE_PATTERNS: { pattern: RegExp; weight: number }[] = [
  // 強い誹謗中傷・危険語・暴言
  { pattern: /死ね|殺す|消えろ|クソ|ゴミ|カス|きもい|キモい|うざい|ウザい|最悪|最低|害悪/i, weight: 1.0 },
  // 強い怒り・不快感
  { pattern: /ムカつく|むかつく|腹立つ|イライラ|許せない|迷惑|邪魔|キレそう/i, weight: 0.9 },
  // 強い苦痛・絶望・精神的疲弊
  { pattern: /辛い|つらい|苦しい|死にたい|消えたい|絶望|限界|しんどい|病む|鬱/i, weight: 0.9 },
  // 拒絶・強い否定
  { pattern: /行きたくない|やりたくない|見たくない|大嫌い|嫌だ|いやだ|もう無理/i, weight: 0.8 },
  // 悲しみ・不満・落胆
  { pattern: /悲しい|泣きたい|ショック|失敗|落ち込む|だるい|つまらない|面白くない/i, weight: 0.7 },
  // 不安・後悔
  { pattern: /不安|怖い|後悔|疲れた|ヘトヘト/i, weight: 0.5 },
  { pattern: /😡|👿|💀|😭|💔|👎/, weight: 0.5 },
];

export function analyzeSentiment(text: string): SentimentResult {
  if (!text || text.trim().length === 0) {
    return { score: 0, positiveScore: 0, negativeScore: 0, isNegative: false };
  }

  let posRaw = 0;
  for (const p of POSITIVE_PATTERNS) {
    if (p.pattern.test(text)) posRaw += p.weight;
  }

  let negRaw = 0;
  for (const n of NEGATIVE_PATTERNS) {
    if (n.pattern.test(text)) negRaw += n.weight;
  }

  const positiveScore = Math.min(1.0, Number(posRaw.toFixed(2)));
  const negativeScore = Math.min(1.0, Number(negRaw.toFixed(2)));
  const score = Math.max(-1.0, Math.min(1.0, Number((positiveScore - negativeScore).toFixed(2))));
  const isNegative = negativeScore >= 0.6 && negativeScore > positiveScore;

  return {
    score,
    positiveScore,
    negativeScore,
    isNegative,
  };
}

/**
 * 感情タグを除いた高精度タグ抽出エンジン
 */
export function extractHighPrecisionTags(text: string): string[] {
  if (!text || text.trim().length === 0) {
    return DEFAULT_TAGS.slice(0, 4);
  }

  const dimensionCandidateMap: Map<Dimension, { tag: string; weight: number }[]> = new Map();

  const addCandidate = (tag: string, dim: Dimension, weight: number) => {
    if (!dimensionCandidateMap.has(dim)) {
      dimensionCandidateMap.set(dim, []);
    }
    const list = dimensionCandidateMap.get(dim)!;
    const existing = list.find((c) => c.tag === tag);
    if (existing) {
      existing.weight += weight;
    } else {
      list.push({ tag, weight });
    }
  };

  // 1. 基本ルール照合
  for (const rule of TAG_RULES) {
    if (rule.pattern.test(text)) {
      addCandidate(rule.tag, rule.dimension, rule.weight);
    }
  }

  // 2. 絵文字ルール照合
  for (const er of EMOJI_RULES) {
    if (er.emojiPattern.test(text)) {
      addCandidate(er.tag, er.dimension, er.weight);
    }
  }

  // 3. 特徴的カタカナ語の動的抽出
  const dynamicWords = extractKatakanaKeywords(text);
  for (const kw of dynamicWords) {
    addCandidate(kw.tag, kw.dimension, kw.weight);
  }

  // 多面性バランシング
  const selectedTags: string[] = [];

  const sortedDimensions = Array.from(dimensionCandidateMap.entries())
    .map(([dim, list]) => ({
      dim,
      maxWeight: list.reduce((max, cur) => Math.max(max, cur.weight), 0),
    }))
    .sort((a, b) => b.maxWeight - a.maxWeight);

  for (const { dim } of sortedDimensions) {
    if (selectedTags.length >= 4) break;
    const list = dimensionCandidateMap.get(dim);
    if (list && list.length > 0) {
      list.sort((a, b) => b.weight - a.weight);
      const best = list[0];
      if (best && !selectedTags.includes(best.tag)) {
        selectedTags.push(best.tag);
      }
    }
  }

  if (selectedTags.length < 5) {
    const allRemaining = Array.from(dimensionCandidateMap.values())
      .flat()
      .filter((c) => !selectedTags.includes(c.tag))
      .sort((a, b) => b.weight - a.weight);

    for (const item of allRemaining) {
      if (selectedTags.length >= 5) break;
      selectedTags.push(item.tag);
    }
  }

  for (const def of DEFAULT_TAGS) {
    if (selectedTags.length >= 4) break;
    if (!selectedTags.includes(def)) {
      selectedTags.push(def);
    }
  }

  return selectedTags.slice(0, 5);
}

/**
 * 外部LLM（Gemini API）が設定されていれば利用
 */
async function generateViaLLMIfConfigured(message: string): Promise<string[] | null> {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiApiKey) return null;

  try {
    const prompt = `以下の投稿に対して、感情や感想（ハッピー、最高など）を除いた具体的な場所・グルメ・行動・対象に関するハッシュタグを3〜5個提案してください。
必ず "#" で始まる日本語タグのみをカンマ区切りで出力してください。
テキスト: "${message}"`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    if (!response.ok) return null;
    const json = await response.json();
    const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;

    const tags = rawText
      .split(/[,\n]/)
      .map((t: string) => t.trim())
      .filter((t: string) => t.startsWith('#') && t.length > 1)
      .slice(0, 5);

    return tags.length >= 3 ? tags : null;
  } catch (_e) {
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { message } = await req.json().catch(() => ({ message: '' }));
    const trimmedMessage = typeof message === 'string' ? message.trim() : '';

    // 1. 感情・印象系を除外したタグ抽出
    let tags = await generateViaLLMIfConfigured(trimmedMessage);
    if (!tags || tags.length === 0) {
      tags = extractHighPrecisionTags(trimmedMessage);
    }

    // 2. 裏側でのポジティブ／ネガティブ度スコアリング
    const sentiment = analyzeSentiment(trimmedMessage);

    return new Response(JSON.stringify({ tags, sentiment }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
