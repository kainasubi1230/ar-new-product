-- マイページから自分の投稿を削除できるようにする
-- Supabase ダッシュボードの SQL Editor で実行する（何度実行しても同じ結果になる）

-- 1. 投稿者は自分の投稿を削除できる
drop policy if exists "posts: owner can delete" on public.posts;
create policy "posts: owner can delete"
  on public.posts for delete to authenticated
  using (auth.uid() = user_id);

-- 2. 自分の投稿の地図ファイル（<投稿ID>.worldmap）と景色の写真（snapshots/<投稿ID>.jpg）を削除できる。
--    地図は照合した他の人が上書きして育てることもあるので、アップロードした人ではなく投稿の持ち主で判定する。
--    アプリはファイルを先に消してから投稿を消す（投稿が先に消えると、持ち主を確かめられなくなる）
drop policy if exists "worldmaps: post owner can delete" on storage.objects;
create policy "worldmaps: post owner can delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'worldmaps'
    and exists (
      select 1 from public.posts p
      where p.user_id = auth.uid()
        and storage.objects.name in (p.id::text || '.worldmap', 'snapshots/' || p.id::text || '.jpg')
    )
  );
