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
    title: '新しい言葉が届きました',
    body: '「#思い出」の新しい投稿が追加されました',
    time: '12分前',
    tag: '#思い出',
    distance: '280 m',
  },
  {
    id: 'n3',
    title: '日常のひとこと',
    body: '「#日常」天神ビルのベンチの近くに新しい言葉があります',
    time: '1時間前',
    tag: '#日常',
    distance: '320 m',
  },
];
