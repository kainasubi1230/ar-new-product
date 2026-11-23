// アプリ内で使うアイコン。黒単色＋透過PNGなので、Image の tintColor で好きな色に変えられる。
// 画像は表示する大きさの 3 倍まで（アイコンは長い辺 192px、ロゴは 540px、タイトルは 240px）に縮めてある。
// 大きいまま入れると、小さく表示しても読み込みに元の大きさ分のメモリを使う
export const Icons = {
  home: require('./home.png'),
  search: require('./search.png'),
  notice: require('./notice.png'),
  mypage: require('./mypage.png'),
  setting: require('./setting.png'),
  herb: require('./herb.png'),
  logo: require('./logo.png'),
  title: require('./title.png'),
  calendar: require('./calendar.png'),
  pin: require('./pin.png'),
  footprints: require('./footprints.png'),
  walking: require('./walking.png'),
  cafe: require('./cafe.png'),
  everyday: require('./everyday.png'),
  book: require('./book.png'),
  gourmet: require('./gourmet.png'),
  history: require('./history.png'),
  art: require('./art.png'),
  view: require('./view.png'),
  // 文化遺産の種類（scripts/heritage-icons/icons.swift で描いたもの）
  heritageTemple: require('./heritage_temple.png'),
  heritageWorld: require('./heritage_world.png'),
  heritageKofun: require('./heritage_kofun.png'),
  heritageScenic: require('./heritage_scenic.png'),
};



