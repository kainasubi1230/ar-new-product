-- posts に投稿者を記録し、投稿者が自分の投稿の worldmap_path を更新できるようにする
-- Supabase ダッシュボードの SQL Editor で実行する（何度実行しても同じ結果になる）

-- 1. 投稿者の列。insert 時にログイン中のユーザーIDが自動で入る（アプリ側の変更は不要）
alter table public.posts
  add column if not exists user_id uuid references auth.users (id) on delete set null
  default auth.uid();

-- 2. 投稿者は自分の投稿を更新できる
drop policy if exists "posts: owner can update" on public.posts;
create policy "posts: owner can update"
  on public.posts for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. すでに地図ファイルがアップロード済みなのに worldmap_path が空の投稿を埋める
update public.posts p
set worldmap_path = p.id::text || '.worldmap'
where p.worldmap_path is null
  and exists (
    select 1 from storage.objects o
    where o.bucket_id = 'worldmaps'
      and o.name = p.id::text || '.worldmap'
  );
