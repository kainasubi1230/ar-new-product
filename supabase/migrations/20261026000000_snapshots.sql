-- 置いたときの景色の写真：照合のとき、半透明で画面に重ねて「この景色に合わせてください」と案内する
-- Supabase ダッシュボードの SQL Editor で実行する（何度実行しても同じ結果になる）
-- 写真は既存の worldmaps バケットの snapshots/<投稿ID>.jpg に置くので、Storage の設定変更は不要

alter table public.posts
  add column if not exists snapshot_path text;
