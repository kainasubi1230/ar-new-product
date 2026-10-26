-- 言葉が拾われた人数を posts.read_count に持たせる（AR のカードの「👣 3」と、マイページの「◯人が読んだよ」）。
-- 拾った記録（post_reads）は本人と投稿者しか読めないが、人数だけは誰でも読めるようにするため、
-- 拾われる・外されるたびに DB が自動で数を増減する（トリガー）
-- Supabase ダッシュボードの SQL Editor で実行する（何度実行しても同じ結果になる）

alter table public.posts
  add column if not exists read_count integer not null default 0;

-- post_reads の追加・削除に合わせて posts.read_count を増減する。
-- 拾った人は他人の投稿を更新できない（RLS）ので、この関数は持ち主の権限（security definer）で動かす
create or replace function public.update_post_read_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set read_count = read_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts set read_count = greatest(read_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;

drop trigger if exists post_reads_count on public.post_reads;
create trigger post_reads_count
  after insert or delete on public.post_reads
  for each row execute function public.update_post_read_count();

-- これまでに拾われた分を数え直す
update public.posts p
set read_count = (select count(*) from public.post_reads r where r.post_id = p.id);
