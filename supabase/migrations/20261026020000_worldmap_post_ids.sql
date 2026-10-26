-- 照合する地図を選ぶため、その地図で出せる投稿（地図に入っている post: アンカー）の一覧を記録する
-- Supabase ダッシュボードの SQL Editor で実行する（何度実行しても同じ結果になる）

alter table public.posts
  add column if not exists worldmap_post_ids text[];

-- これまでの地図は中身を読めないので、少なくとも自分自身のアンカーは入っているものとして埋める
update public.posts
set worldmap_post_ids = array[id::text]
where worldmap_path is not null
  and worldmap_post_ids is null;

-- snapshot_path 列が無かった間に置いた投稿も、Storage に写真が上がっていれば場所を埋める
update public.posts p
set snapshot_path = 'snapshots/' || p.id::text || '.jpg'
where p.snapshot_path is null
  and exists (
    select 1 from storage.objects o
    where o.bucket_id = 'worldmaps'
      and o.name = 'snapshots/' || p.id::text || '.jpg'
  );
