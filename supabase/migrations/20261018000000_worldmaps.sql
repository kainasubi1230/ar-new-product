-- ARWorldMap（置いた場所の空間の地図）を保存するための設定
-- Supabase ダッシュボードの SQL Editor で実行する（何度実行しても同じ結果になる）

-- 1. posts に地図ファイルの場所（worldmaps バケット内のパス）を記録する列
alter table public.posts
  add column if not exists worldmap_path text;

-- 2. 地図ファイルの置き場所（非公開バケット。読み書きは下のポリシーで許可）
insert into storage.buckets (id, name, public)
values ('worldmaps', 'worldmaps', false)
on conflict (id) do nothing;

-- 3. ログインユーザーは地図をアップロード（上書き含む）できる
drop policy if exists "worldmaps: authenticated can upload" on storage.objects;
create policy "worldmaps: authenticated can upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'worldmaps');

drop policy if exists "worldmaps: authenticated can overwrite" on storage.objects;
create policy "worldmaps: authenticated can overwrite"
  on storage.objects for update to authenticated
  using (bucket_id = 'worldmaps');

-- 4. 地図は誰でも読み込める（近くに来た未ログインユーザーもカードを見られるように）
drop policy if exists "worldmaps: anyone can read" on storage.objects;
create policy "worldmaps: anyone can read"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'worldmaps');

-- 注意: アプリは投稿の保存後に posts.worldmap_path を UPDATE する。
-- posts で RLS が有効なら、投稿者が自分の行を更新できる UPDATE ポリシーが別途必要。
