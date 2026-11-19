import { checkTextSafety } from './safetyFilter';

export type Dimension = 'food' | 'spot' | 'weather' | 'activity' | 'culture' | 'time' | 'general';

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
  /** ネガティブ投稿判定フラグ（フィルタリング・非表示判定用） */
  isNegative: boolean;
}

// 感情・印象系タグは除外し、具体的な場所・グルメ・行動・文化・自然・天候に特化
const TAG_RULES: TagRule[] = [
  // --- グルメ・カフェ・スイーツ ---
  { pattern: /カフェ|珈琲|コーヒー|ラテ|エスプレッソ|フラペチーノ|スタバ|喫茶|窓際席|カウンター席|テラス席/i, tag: '#カフェ', dimension: 'food', weight: 12 },
  { pattern: /カフェ|喫茶|スイーツ|パフェ|プリン|クレープ/i, tag: '#カフェ巡り', dimension: 'food', weight: 9 },
  { pattern: /パン|ベーカリー|クロワッサン|トースト|サンドイッチ/i, tag: '#パン屋', dimension: 'food', weight: 11 },
  { pattern: /スイーツ|ケーキ|タルト|パフェ|プリン|クレープ|アイス|ジェラート|チョコ|甘党|ドーナツ|焼き菓子/i, tag: '#スイーツ', dimension: 'food', weight: 11 },
  { pattern: /抹茶|ほうじ茶|和菓子|あんこ|団子|日本茶/i, tag: '#抹茶', dimension: 'food', weight: 10 },
  { pattern: /ランチ|昼飯|昼ごはん|お昼|定食|プレート/i, tag: '#ランチ', dimension: 'food', weight: 10 },
  { pattern: /ディナー|夕食|夜ご飯|晩御飯|晩飯|ごちそう/i, tag: '#ディナー', dimension: 'food', weight: 10 },
  { pattern: /ラーメン|つけ麺|豚骨|家系|油そば|麺活|中華そば/i, tag: '#ラーメン', dimension: 'food', weight: 12 },
  { pattern: /うどん|蕎麦|そば|パスタ/i, tag: '#麺活', dimension: 'food', weight: 10 },
  { pattern: /カレー|スパイスカレー|ナン/i, tag: '#カレー', dimension: 'food', weight: 11 },
  { pattern: /焼肉|ステーキ|肉|牛タン|ホルモン|もつ鍋|焼き鳥/i, tag: '#焼肉', dimension: 'food', weight: 11 },
  { pattern: /寿司|鮨|海鮮|刺身|サーモン|マグロ/i, tag: '#海鮮', dimension: 'food', weight: 11 },
  { pattern: /居酒屋|ビール|乾杯|ハイボール|飲み会|晩酌|ワイン|日本酒|サワー|はしご酒|バー/i, tag: '#乾杯', dimension: 'food', weight: 10 },
  { pattern: /美味しい|おいしい|うま|美味|絶品|飯テロ|一皿|名店|隠れ家グルメ|料理|ごはん|食事/i, tag: '#グルメ', dimension: 'food', weight: 10 },

  // --- 本・アート・歴史・カルチャー（関心タグ直結） ---
  { pattern: /本|読書|本屋|書店|図書館|小説|単行本|文庫本|愛読|エッセイ|しおり|一節|ページ|マンガ|漫画/i, tag: '#本', dimension: 'culture', weight: 12 },
  { pattern: /読書|カフェ読書|読了|本を読む/i, tag: '#読書', dimension: 'culture', weight: 10 },
  { pattern: /アート|美術館|ギャラリー|展示|個展|壁画|ストリートアート|彫刻|デザイン|建築|オブジェ|イラスト/i, tag: '#アート', dimension: 'culture', weight: 12 },
  { pattern: /歴史|史跡|石碑|城|城跡|昔話|由来|レトロ|老舗|明治|大正|昭和|伝統|古民家/i, tag: '#歴史', dimension: 'culture', weight: 12 },
  { pattern: /神社|お寺|寺院|参拝|御朱印|鳥居|初詣|境内/i, tag: '#神社仏閣', dimension: 'culture', weight: 11 },
  { pattern: /思い出|懐かしい|記憶|あの日|記念|青春|卒業|また来たい|忘れられない/i, tag: '#思い出', dimension: 'culture', weight: 11 },

  // --- スポット・ロケーション・街 ---
  { pattern: /天神|大名|今泉|警固|新天町/i, tag: '#天神', dimension: 'spot', weight: 12 },
  { pattern: /博多|中洲|キャナル|博多駅/i, tag: '#博多', dimension: 'spot', weight: 12 },
  { pattern: /薬院|平尾|高砂/i, tag: '#薬院', dimension: 'spot', weight: 11 },
  { pattern: /糸島|二見ヶ浦|志摩/i, tag: '#糸島', dimension: 'spot', weight: 11 },
  { pattern: /大濠|大濠公園|舞鶴/i, tag: '#大濠公園', dimension: 'spot', weight: 11 },
  { pattern: /公園|芝生|ベンチ|広場|噴水/i, tag: '#公園', dimension: 'spot', weight: 10 },
  { pattern: /展望台|屋上|タワー|景色|眺め|パノラマ|見晴らし/i, tag: '#絶景', dimension: 'spot', weight: 11 },
  { pattern: /隠れ家|穴場|路地|路地裏|裏路地|秘密の場所/i, tag: '#隠れ家', dimension: 'spot', weight: 11 },
  { pattern: /駅|地下鉄|電車|バス停|空港|ホーム/i, tag: '#移動中', dimension: 'spot', weight: 9 },
  { pattern: /街|通り|街角|交差点|風景|歩道/i, tag: '#街歩き', dimension: 'spot', weight: 9 },
  { pattern: /ここ|現在地|発見|AR|足跡|特等席|この席/i, tag: '#スポット', dimension: 'spot', weight: 8 },

  // --- 自然・天気・季節 ---
  { pattern: /自然|木漏れ日|緑|森|木々|草花|風|そよ風|川|水辺|森林浴|植物|ハーブ/i, tag: '#自然', dimension: 'weather', weight: 12 },
  { pattern: /海|海岸|砂浜|ビーチ|波音|潮風/i, tag: '#海', dimension: 'weather', weight: 11 },
  { pattern: /晴れ|青空|快晴|いい天気|太陽|ぽかぽか|日差し|光|陽気/i, tag: '#青空', dimension: 'weather', weight: 10 },
  { pattern: /晴れ|快晴|陽気|いい日/i, tag: '#いい天気', dimension: 'weather', weight: 9 },
  { pattern: /雨|傘|梅雨|あめ|どしゃ降り|雨音/i, tag: '#雨の日', dimension: 'weather', weight: 11 },
  { pattern: /虹|レインボー/i, tag: '#虹', dimension: 'weather', weight: 12 },
  { pattern: /曇|くもり/i, tag: '#曇り空', dimension: 'weather', weight: 7 },
  { pattern: /桜|花見|春|新生活|さくら/i, tag: '#春', dimension: 'weather', weight: 10 },
  { pattern: /夏|プール|花火|祭り|猛暑|向日葵/i, tag: '#夏', dimension: 'weather', weight: 10 },
  { pattern: /秋|紅葉|涼しい|金木犀|秋晴れ|イチョウ/i, tag: '#秋', dimension: 'weather', weight: 10 },
  { pattern: /冬|雪|寒い|こたつ|マフラー/i, tag: '#冬', dimension: 'weather', weight: 10 },
  { pattern: /イルミネーション|ライトアップ/i, tag: '#イルミネーション', dimension: 'weather', weight: 11 },

  // --- 行動・ライフスタイル ---
  { pattern: /散歩|さんぽ|歩く|ウォーキング|ぶらぶら|小道|寄り道|散策/i, tag: '#散歩', dimension: 'activity', weight: 12 },
  { pattern: /散歩|おでかけ|出かけ|外出|寄り道/i, tag: '#お散歩日和', dimension: 'activity', weight: 9 },
  { pattern: /ドライブ|ツーリング/i, tag: '#ドライブ', dimension: 'activity', weight: 11 },
  { pattern: /旅|旅行|観光|一人旅|女子旅|遠出/i, tag: '#旅行', dimension: 'activity', weight: 11 },
  { pattern: /買い物|ショッピング|買った|購入|古着|雑貨屋/i, tag: '#お買い物', dimension: 'activity', weight: 10 },
  { pattern: /サウナ|ととのう|水風呂|温泉|銭湯|スパ/i, tag: '#サウナ', dimension: 'activity', weight: 12 },
  { pattern: /ジム|筋トレ|ランニング|運動|ワークアウト|休憩|ひと休み|一息/i, tag: '#リフレッシュ', dimension: 'activity', weight: 10 },
  { pattern: /勉強|テスト|学習|自習|資格|集中/i, tag: '#勉強中', dimension: 'activity', weight: 10 },
  { pattern: /仕事|残業|mtg|ミーティング|会議|出勤|出社|作業|ノマド/i, tag: '#お仕事中', dimension: 'activity', weight: 10 },
  { pattern: /(?<!ド)ライブ|推し|推し活|現場|フェス|参戦/i, tag: '#推し活', dimension: 'activity', weight: 12 },
  { pattern: /写真|カメラ|スナップ|ファインダー|撮影/i, tag: '#写真', dimension: 'activity', weight: 11 },
  { pattern: /犬|いぬ|わんこ|猫|ねこ|にゃんこ|ペット/i, tag: '#ペット', dimension: 'activity', weight: 11 },
  { pattern: /休み|休日|週末|土曜|日曜|祝日|華金|連休/i, tag: '#休日', dimension: 'activity', weight: 10 },
  { pattern: /日常|ふと|いつも|何気ない|ひとりごと|独り言|今日も/i, tag: '#日常', dimension: 'activity', weight: 9 },

  // --- 時間帯 ---
  { pattern: /朝|モーニング|早起き|朝活|午前/i, tag: '#朝活', dimension: 'time', weight: 10 },
  { pattern: /夜景|ネオン/i, tag: '#夜景', dimension: 'time', weight: 12 },
  { pattern: /夜|夜空|星|月|夜道|夜風/i, tag: '#夜空', dimension: 'time', weight: 9 },
  { pattern: /夕暮れ|夕焼け|夕日|黄昏|放課後|マジックアワー|午後/i, tag: '#夕暮れ', dimension: 'time', weight: 10 },
];

const EMOJI_RULES: { emojiPattern: RegExp; tag: string; dimension: Dimension; weight: number }[] = [
  { emojiPattern: /☕|🍵|🧋/, tag: '#カフェ', dimension: 'food', weight: 11 },
  { emojiPattern: /🍜|🍥|🍝/, tag: '#ラーメン', dimension: 'food', weight: 12 },
  { emojiPattern: /🍰|🍮|🍨|🍩|🧁|🥞/, tag: '#スイーツ', dimension: 'food', weight: 11 },
  { emojiPattern: /🍺|🍻|🍷|🍶|🥂|🍸/, tag: '#乾杯', dimension: 'food', weight: 11 },
  { emojiPattern: /🍽️|🍴|🍱|🍛|🍣|🍖/, tag: '#グルメ', dimension: 'food', weight: 11 },
  { emojiPattern: /📚|📖|📕|📗|📘/, tag: '#本', dimension: 'culture', weight: 12 },
  { emojiPattern: /🎨|🖼️|🏛️|🎭/, tag: '#アート', dimension: 'culture', weight: 12 },
  { emojiPattern: /⛩️|🏯|🏮/, tag: '#歴史', dimension: 'culture', weight: 11 },
  { emojiPattern: /🌿|🌱|🌳|🌲|🍃|🍀/, tag: '#自然', dimension: 'weather', weight: 12 },
  { emojiPattern: /☀️|🌤️/, tag: '#いい天気', dimension: 'weather', weight: 10 },
  { emojiPattern: /🌧️|☔/, tag: '#雨の日', dimension: 'weather', weight: 11 },
  { emojiPattern: /🌸|🌺|🌻|🍁/, tag: '#自然', dimension: 'weather', weight: 10 },
  { emojiPattern: /🚶|👟|🐾/, tag: '#散歩', dimension: 'activity', weight: 11 },
  { emojiPattern: /🧖|♨️/, tag: '#サウナ', dimension: 'activity', weight: 12 },
  { emojiPattern: /📸|📷/, tag: '#写真', dimension: 'activity', weight: 10 },
  { emojiPattern: /🐱|🐶/, tag: '#ペット', dimension: 'activity', weight: 10 },
];

const DEFAULT_TAGS = ['#日常', '#散歩', '#カフェ', '#街歩き', '#スポット'];

function extractKatakanaKeywords(text: string): { tag: string; dimension: Dimension; weight: number }[] {
  const matches = text.match(/[ァ-ヴー]{3,}/g);
  if (!matches) return [];

  const stopWords = new Set([
    'コーヒー', 'ラーメン', 'カフェ', 'スイーツ', 'ランチ', 'ディナー', 'サウナ',
    'タイム', 'スタート', 'ラスト', 'タイプ', 'スタイル', 'スペース', 'ポイント', 'チェック',
    'イライラ', 'ムカムカ', 'モヤモヤ', 'ギリギリ', 'ヘトヘト', 'ワクワク', 'ドキドキ', 'バタバタ', 'クタクタ', 'ショック',
    'メッセージ', 'スポット', 'エリア', 'ベンチ', 'テーブル', 'カウンター', 'テラス',
  ]);
  const result: { tag: string; dimension: Dimension; weight: number }[] = [];

  for (const word of matches) {
    if (!stopWords.has(word) && word.length <= 8) {
      result.push({ tag: `#${word}`, dimension: 'general', weight: 8 });
    }
  }
  return result;
}

// -------------------------------------------------------------
// 感情分析エンジン（ポジティブ度／ネガティブ度のスコアリング・語彙拡充版）
// -------------------------------------------------------------
const POSITIVE_PATTERNS: { pattern: RegExp; weight: number }[] = [
  // 最上級・感動・絶賛
  {
    pattern:
      /最高|さいこう|サイコー|大満足|超楽しい|神回|神対応|至福|感動|素晴らしい|すばらしい|圧巻|天才|完璧|かんぺき|尊い|とうとい|エモい|えもい|優勝|感無量|胸熱|鳥肌|大成功|大勝利|奇跡|幸運|ラッキー|ツイてる|ついてる|絶好調|文句なし|満点|過去一/gi,
    weight: 0.9,
  },
  // 喜び・楽しさ・幸福
  {
    pattern:
      /嬉しい|うれしい|楽しい|たのしい|幸せ|しあわせ|ハッピー|はっぴー|わくわく|ワクワク|ドキドキ|どきどき|ウキウキ|うきうき|ルンルン|るんるん|笑顔|えがお|ニコニコ|にこにこ|爆笑|笑った|面白い|おもしろい|充実|満喫|爽快|そうかい|清々しい|すがすがしい|晴れやか|明るい|ポジティブ|陽気|テンション上がる|気分がいい|気分が良い|ご機嫌/gi,
    weight: 0.75,
  },
  // グルメ・美味しさ
  {
    pattern:
      /美味しい|おいしい|美味い|うまい|ウマい|美味|絶品|ごちそう|とろける|ほっぺが落ち|サクサク|もちもち|ジューシー|香り高い|リピ確|リピート|また食べたい|大当たり|名店|激うま|うますぎ|おいしすぎ|たまらん|たまらない/gi,
    weight: 0.75,
  },
  // 感謝・好意・称賛・応援
  {
    pattern:
      /ありがとう|感謝|かんしゃ|助かった|たすかった|よかった|良かった|いいね|好き|すき|大好き|だいすき|愛してる|お気に入り|おすすめ|オススメ|推し|推せる|優しい|やさしい|親切|温かい|あたたかい|暖かい|頼もしい|心強い|素敵|すてき|かわいい|可愛い|カワイイ|かっこいい|カッコいい|おしゃれ|オシャレ|お洒落|憧れ|尊敬|リスペクト|おめでとう|祝福|応援|すごい|凄い|さすが|流石|えらい|偉い/gi,
    weight: 0.65,
  },
  // 癒やし・リラックス・安心・心地よさ
  {
    pattern:
      /リラックス|癒やし|癒し|いやし|落ち着く|おちつく|ととのった|ととのう|ほっこり|心地いい|ここちいい|心地よい|気持ちいい|きもちいい|快適|かいてき|安心|あんしん|ほっとする|ホッとする|穏やか|おだやか|平和|へいわ|のんびり|ゆったり|まったり|贅沢|ぜいたく|ご褒美|ごほうび|リフレッシュ|スッキリ|すっきり|爽やか|さわやか|ぽかぽか|ぬくもり|居心地|安らぐ|やすらぐ|くつろぐ/gi,
    weight: 0.65,
  },
  // 前向き・達成感・希望・良い思い出
  {
    pattern:
      /前向き|頑張る|がんばる|頑張った|がんばった|やる気|楽しみ|たのしみ|期待|捗る|はかどる|順調|達成感|やりきった|成長|発見|ひらめき|希望|きぼう|いい日|良い日|いい一日|良い一日|また来たい|思い出|宝物|記念日|充実感|ワクワクする|わくわくする|いい感じ|良い感じ|ばっちり|バッチリ/gi,
    weight: 0.55,
  },
  // 景色・自然・美しさ
  {
    pattern:
      /綺麗|きれい|キレイ|青空|快晴|いい天気|良い天気|絶景|美しい|うつくしい|映える|映え|幻想的|神秘的|ロマンチック|キラキラ|きらきら|輝く|かがやく|満開|木漏れ日|そよ風|晴れ渡る|見晴らしがいい/gi,
    weight: 0.55,
  },
  // 英語ポジティブ
  {
    pattern:
      /\b(good|great|awesome|amazing|wonderful|love|lovely|happy|nice|best|fun|delicious|yummy|cool|cute|beautiful|thanks|thank you|relax|relaxing|chill|cozy|perfect|lucky|enjoy|excited|glad|peaceful|smile)\b/gi,
    weight: 0.6,
  },
  // ポジティブ絵文字
  { pattern: /✨|🎉|💖|❤️|💕|🥰|😆|😍|😊|😄|😁|🥳|🤩|👍|👏|🙌|☀️|🌈|🌸|🍀|💐|💫/g, weight: 0.4 },
];

const NEGATIVE_PATTERNS: { pattern: RegExp; weight: number }[] = [
  // 強い誹謗中傷・危険語・暴言
  {
    pattern:
      /死ね|氏ね|殺す|ころす|消えろ|きえろ|失せろ|黙れ|くたばれ|クソ|くそ|糞|ゴミ|ごみくず|カス|クズ|くず|きもい|キモい|きしょい|キショい|うざい|ウザい|最悪|さいあく|最低|さいてい|害悪|老害|バカ|馬鹿|アホ|阿呆|ブス|ブサイク|デブ|ハゲ|キチガイ|ガイジ|無能|役立たず|ポンコツ|ざまあ|ざまぁ/gi,
    weight: 1.0,
  },
  // 強い怒り・攻撃・不快感
  {
    pattern:
      /ムカつく|むかつく|腹立つ|はらたつ|腹が立つ|イライラ|いらいら|イラつく|ムカムカ|むかむか|許せない|ゆるせない|許さない|迷惑|めいわく|邪魔|じゃま|目障り|キレそう|ブチギレ|激怒|ふざけるな|ふざけんな|なめるな|なめんな|うるさい|うるせえ|うっせえ|うっとうしい|鬱陶しい|胸糞|吐き気|不快|不愉快|うんざり|ありえない|信じられない|クレーム|苦情|態度悪い|接客最悪|ぼったくり/gi,
    weight: 0.9,
  },
  // 強い苦痛・絶望・精神的疲弊
  {
    pattern:
      /辛い|つらい|苦しい|くるしい|死にたい|しにたい|消えたい|きえたい|自殺|自傷|リスカ|絶望|ぜつぼう|限界|げんかい|しんどい|病む|病んでる|病みそう|鬱|うつ病|憂鬱|ゆううつ|もう無理|もうだめ|もうダメ|人生終わり|詰んだ|心が折れた|メンタル崩壊|発狂|地獄|生きづらい/gi,
    weight: 0.9,
  },
  // 拒絶・強い否定・嫌悪
  {
    pattern:
      /行きたくない|いきたくない|やりたくない|見たくない|みたくない|会いたくない|働きたくない|大嫌い|だいきらい|嫌い|きらい|嫌だ|いやだ|嫌すぎる|もう嫌|もういや|二度と行かない|二度と来ない|憎い|恨む|呪う|最悪だ|終わってる|オワコン|まずい|不味い|汚い|きたない|臭い|くさい/gi,
    weight: 0.8,
  },
  // 悲しみ・落胆・後悔・孤独
  {
    pattern:
      /悲しい|かなしい|寂しい|さみしい|さびしい|孤独|泣きたい|なきたい|泣いた|涙が出る|ショック|失敗|しっぱい|落ち込む|おちこむ|凹む|へこむ|がっかり|ガッカリ|失望|後悔|こうかい|惨め|みじめ|虚しい|むなしい|切ない|せつない|つらすぎ|悲しすぎ|ダメだった|だめだった|うまくいかない|上手くいかない|報われない/gi,
    weight: 0.7,
  },
  // 疲労・だるさ・退屈・体調不良
  {
    pattern:
      /だるい|ダルい|つまらない|つまんない|面白くない|おもんない|退屈|たいくつ|しょうもない|くだらない|疲れた|つかれた|疲れすぎ|ヘトヘト|へへと|クタクタ|くたくた|ボロボロ|ぼろぼろ|眠すぎる|寝不足|頭痛い|体調悪い|具合悪い|風邪ひいた|気持ち悪い|吐きそう|しんどすぎ|めんどくさい|面倒くさい|めんどい|億劫/gi,
    weight: 0.6,
  },
  // 不安・焦り・モヤモヤ・ストレス
  {
    pattern:
      /不安|ふあん|怖い|こわい|恐ろしい|心配|しんぱい|焦る|あせる|焦り|緊張|モヤモヤ|もやもや|ストレス|プレッシャー|気が重い|気まずい|微妙|びみょう|ハズレ|はずれ|残念|ざんねん|もったいない|混みすぎ|激混み|満員|待ちすぎ|雨うざ|暑すぎ|寒すぎ|ジメジメ|最悪の天気|イマイチ|いまいち|物足りない|損した/gi,
    weight: 0.5,
  },
  // 英語ネガティブ
  {
    pattern:
      /\b(bad|worst|hate|hated|sad|angry|mad|tired|exhausted|boring|bored|terrible|horrible|awful|suck|sucks|annoying|annoyed|pain|painful|lonely|depressed|anxious|scared|fail|failed|failure|disappointed|stress|stressed|sick|gross|disgusting|stupid|idiot|fuck|shit|bitch|trash|garbage)\b/gi,
    weight: 0.65,
  },
  // ネガティブ絵文字
  { pattern: /😡|🤬|👿|💀|😭|😢|😥|😓|😰|😨|😱|💔|👎|💩|🤮|🤢|😞|😔|😟|😕|😫|😩|😤|💢/g, weight: 0.45 },
];

/**
 * テキストのポジティブ度・ネガティブ度を解析してスコアを算出します
 */
export function analyzeSentiment(text: string): SentimentResult {
  if (!text || text.trim().length === 0) {
    return { score: 0, positiveScore: 0, negativeScore: 0, isNegative: false };
  }

  const normalized = text.normalize('NFKC');

  let posRaw = 0;
  for (const p of POSITIVE_PATTERNS) {
    const matches = normalized.match(p.pattern);
    if (matches && matches.length > 0) {
      // 1語目は満額、2語目以降は少しずつ加算して複数語ある感情を強く反映する
      posRaw += p.weight + (matches.length - 1) * (p.weight * 0.35);
    }
  }

  let negRaw = 0;
  for (const n of NEGATIVE_PATTERNS) {
    const matches = normalized.match(n.pattern);
    if (matches && matches.length > 0) {
      negRaw += n.weight + (matches.length - 1) * (n.weight * 0.35);
    }
  }

  const safety = checkTextSafety(text);
  if (safety.blocked) {
    negRaw = Math.max(negRaw, 1.0);
  }

  const positiveScore = Math.min(1.0, Number(posRaw.toFixed(2)));
  const negativeScore = Math.min(1.0, Number(negRaw.toFixed(2)));
  const score = safety.blocked
    ? -1.0
    : Math.max(-1.0, Math.min(1.0, Number((positiveScore - negativeScore).toFixed(2))));
  // 安心フィルターに該当した場合はポジティブ語が混ざっていても必ずネガティブ扱い（すり抜け防止）
  const isNegative = safety.blocked || (negativeScore >= 0.6 && negativeScore > positiveScore);

  return {
    score,
    positiveScore,
    negativeScore,
    isNegative,
  };
}

/**
 * 感情タグを除いた高精度ローカルタグ抽出エンジン（3〜5個を確実に返す）
 */
export function generateTagsLocally(text: string, preferredTags?: string[]): string[] {
  const fallbackPool =
    preferredTags && preferredTags.length > 0
      ? Array.from(new Set([...preferredTags, ...DEFAULT_TAGS]))
      : DEFAULT_TAGS;

  if (!text || text.trim().length === 0) {
    return fallbackPool.slice(0, 4);
  }

  const preferredSet = new Set(
    (preferredTags ?? []).map((t) => (t.startsWith('#') ? t.trim() : `#${t.trim()}`))
  );

  // 文中に直接含まれる #ハッシュタグ があれば最優先候補にする
  const inlineHashtags = (text.match(/#[^\s#、。！？!?,，]+/g) ?? []).map((t) => t.trim());

  const dimensionCandidateMap: Map<Dimension, { tag: string; weight: number }[]> = new Map();

  const addCandidate = (tag: string, dim: Dimension, weight: number) => {
    const normalized = tag.startsWith('#') ? tag : `#${tag}`;
    // ユーザーの関心タグと一致する場合は少し重みをブースト
    const boost = preferredSet.has(normalized) ? 2 : 0;
    if (!dimensionCandidateMap.has(dim)) {
      dimensionCandidateMap.set(dim, []);
    }
    const list = dimensionCandidateMap.get(dim)!;
    const existing = list.find((c) => c.tag === normalized);
    if (existing) {
      existing.weight += weight + boost;
    } else {
      list.push({ tag: normalized, weight: weight + boost });
    }
  };

  for (const inlineTag of inlineHashtags) {
    addCandidate(inlineTag, 'general', 20);
  }

  for (const rule of TAG_RULES) {
    if (rule.pattern.test(text)) {
      addCandidate(rule.tag, rule.dimension, rule.weight);
    }
  }

  for (const er of EMOJI_RULES) {
    if (er.emojiPattern.test(text)) {
      addCandidate(er.tag, er.dimension, er.weight);
    }
  }

  const dynamicWords = extractKatakanaKeywords(text);
  for (const kw of dynamicWords) {
    addCandidate(kw.tag, kw.dimension, kw.weight);
  }

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

  // 最低3〜4個のタグ候補を保証する
  for (const def of fallbackPool) {
    if (selectedTags.length >= 4) break;
    const norm = def.startsWith('#') ? def : `#${def}`;
    if (!selectedTags.includes(norm)) {
      selectedTags.push(norm);
    }
  }

  return selectedTags.slice(0, 5);
}

/**
 * タグ提案と感情分析（ポジティブ／ネガティブ）を同時に取得
 */
export async function suggestTagsAndSentiment(
  message: string,
  preferredTags?: string[]
): Promise<{
  tags: string[];
  sentiment: SentimentResult;
  source: 'local';
}> {
  const trimmed = message.trim();
  const localSentiment = analyzeSentiment(trimmed);
  const localTags = generateTagsLocally(trimmed, preferredTags);

  if (!trimmed) {
    return {
      tags: localTags,
      sentiment: localSentiment,
      source: 'local',
    };
  }

  return {
    tags: localTags,
    sentiment: localSentiment,
    source: 'local',
  };
}
