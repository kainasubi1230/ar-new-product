-- メッセージの本体を「その場所の座標」として保存する
-- Supabase ダッシュボードの SQL Editor で実行する（何度実行しても同じ結果になる）
--
-- これから置く投稿では、lat / lng はスマホではなくカード自体の位置になる
-- （スマホの GPS ＋ AR でのカメラからカードまでのずれ ＋ コンパスで求めた北の向き）。
-- accuracy_m は、そのときの GPS の誤差（位置の確かさ）のまま。
-- これまでの投稿の lat / lng はスマホの位置のまま（カードの位置は後から求められない）

alter table public.posts
  -- カードの高さ（m、GPS の楕円体高 ＋ カメラからの高さのずれ）。GPS が高さを返さないときは null
  add column if not exists alt_m double precision,
  -- カードの面が向いている方位（北=0°、時計回り）。置いたときに北が分からなければ null
  add column if not exists heading_deg double precision,
  -- 置いたときのスマホの位置（カードの位置を求めた元）
  add column if not exists camera_lat double precision,
  add column if not exists camera_lng double precision;
