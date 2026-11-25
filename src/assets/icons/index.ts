// アプリ内で使うアイコン。黒単色＋透過PNGなので、Image の tintColor で好きな色に変えられる。
// 画像は表示する大きさの 3 倍まで（アイコンは長い辺 192px、ロゴは 540px、タイトルは 240px）に縮めてある。
// 大きいまま入れると、小さく表示しても読み込みに元の大きさ分のメモリを使う
export const Icons = {
  // UI 共通
  home: require('../../../assets/icons/ui/home.png'),
  search: require('../../../assets/icons/ui/search.png'),
  notice: require('../../../assets/icons/ui/notice.png'),
  mypage: require('../../../assets/icons/ui/mypage.png'),
  setting: require('../../../assets/icons/ui/setting.png'),
  herb: require('../../../assets/icons/ui/herb.png'),
  logo: require('../../../assets/icons/ui/logo.png'),
  title: require('../../../assets/icons/ui/title.png'),
  calendar: require('../../../assets/icons/ui/calendar.png'),
  pin: require('../../../assets/icons/ui/pin.png'),
  footprints: require('../../../assets/icons/ui/footprints.png'),
  // 関心タグのジャンル
  walking: require('../../../assets/icons/tags/walking.png'),
  cafe: require('../../../assets/icons/tags/cafe.png'),
  everyday: require('../../../assets/icons/tags/everyday.png'),
  book: require('../../../assets/icons/tags/book.png'),
  gourmet: require('../../../assets/icons/tags/gourmet.png'),
  history: require('../../../assets/icons/tags/history.png'),
  art: require('../../../assets/icons/tags/art.png'),
  view: require('../../../assets/icons/tags/view.png'),
  // 安心フィルターの見たくないジャンル（黒一色のピクトグラム）
  mutedComplaining: require('../../../assets/icons/muted/complaining.png'),
  mutedMelancholy: require('../../../assets/icons/muted/melancholy.png'),
  mutedNoise: require('../../../assets/icons/muted/noise.png'),
  mutedDanger: require('../../../assets/icons/muted/danger.png'),
  mutedTobacco: require('../../../assets/icons/muted/tobacco.png'),
  mutedClaim: require('../../../assets/icons/muted/claim.png'),
  mutedTrouble: require('../../../assets/icons/muted/trouble.png'),
  mutedBothersome: require('../../../assets/icons/muted/bothersome.png'),
  // 文化遺産の種類（scripts/heritage-icons/icons.swift で描いたもの）
  heritageTemple: require('../../../assets/icons/heritage/temple.png'),
  heritageWorld: require('../../../assets/icons/heritage/world.png'),
  heritageKofun: require('../../../assets/icons/heritage/kofun.png'),
  heritageScenic: require('../../../assets/icons/heritage/scenic.png'),
};



