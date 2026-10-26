-- 置いた場所の名前を残す（マイページの「残した言葉」に「📍 天神に 10/26 に置いた」と出す）
-- Supabase ダッシュボードの SQL Editor で実行する（何度実行しても同じ結果になる）

alter table public.posts
  -- カードを置いた場所の名前（iOS の CLGeocoder で lat / lng から求めたもの。取れなければ null）
  add column if not exists place_name text;
