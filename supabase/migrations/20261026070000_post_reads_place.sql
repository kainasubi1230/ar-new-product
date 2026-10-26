-- 拾った場所を残す（マイページの「拾った言葉」に「📍 天神 ・ 10/26 に拾った」と出す）
-- Supabase ダッシュボードの SQL Editor で実行する（何度実行しても同じ結果になる）

alter table public.post_reads
  -- 拾ったときの自分の位置
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  -- その場所の名前（iOS の CLGeocoder で緯度経度から求めたもの。取れなければ null）
  add column if not exists place_name text;
