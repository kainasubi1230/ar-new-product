-- マイページの設定から、自分のアカウントを削除できるようにする
-- Supabase ダッシュボードの SQL Editor で実行する（何度実行しても同じ結果になる）
--
-- アプリ（authService.deleteMyAccount）は、先に自分の投稿をすべて消し（地図・景色の写真のファイルも一緒に。
-- Storage の削除ポリシーは「投稿の持ち主か」で判定するので、投稿が残っているうちに消す）、最後にこの関数を呼ぶ。
-- 関数は残った自分の投稿を消してから、ログインのアカウント（auth.users）を消す。
-- 拾った記録（post_reads）は auth.users の削除で一緒に消える（on delete cascade）。拾った人数もトリガーで減る

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'ログインしていません';
  end if;
  delete from public.posts where user_id = me;
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
