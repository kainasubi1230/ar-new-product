export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  time: string;
  tag: string;
  distance?: string;
};

export const NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'n1',
    title: '近くに関心タグのメッセージ',
    body: '近くにあなたの関心タグ「#カフェ」のメッセージがあります（約150m先）',
    time: '2分前',
    tag: '#カフェ',
    distance: '150 m',
  },
  {
    id: 'n2',
    title: '散歩コースの発見',
    body: '「#散歩」警固公園の小道に、おすすめの休憩スポットの言葉が残されています',
    time: '8分前',
    tag: '#散歩',
    distance: '190 m',
  },
  {
    id: 'n3',
    title: '読書のしおりが見つかりました',
    body: '「#本」静かなカフェの窓際席に、心に残る一節のしおりが置かれています',
    time: '18分前',
    tag: '#本',
    distance: '220 m',
  },
  {
    id: 'n4',
    title: '日常のひとこと',
    body: '「#日常」天神ビルのベンチの近くに新しい言葉があります',
    time: '35分前',
    tag: '#日常',
    distance: '280 m',
  },
  {
    id: 'n5',
    title: '新しい言葉が届きました',
    body: '「#思い出」の新しい投稿が追加されました',
    time: '1時間前',
    tag: '#思い出',
    distance: '320 m',
  },
  {
    id: 'n6',
    title: '路地裏のグルメ情報',
    body: '「#グルメ」ランチにおすすめの隠れ家スポットが投稿されました',
    time: '2時間前',
    tag: '#グルメ',
    distance: '350 m',
  },
  {
    id: 'n7',
    title: '季節の自然スポット',
    body: '「#自然」木漏れ日が綺麗なベンチの記録が近くにあります',
    time: '3時間前',
    tag: '#自然',
    distance: '410 m',
  },
];
