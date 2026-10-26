-- 拾った言葉：AR で実際に目にした（カードが置かれた場所に現れた）他の人の言葉を記録する。
-- マイページの「拾った言葉」と、自分の言葉の「誰かが読んだよ ◯」に使う
-- Supabase ダッシュボードの SQL Editor で実行する（何度実行しても同じ結果になる）

create table if not exists public.post_reads (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  read_at timestamptz not null default now(),
  -- 同じ人が同じ言葉を拾うのは 1 回だけ
  primary key (post_id, user_id)
);

alter table public.post_reads enable row level security;

-- ログイン中のユーザーは、自分の「拾った」記録だけ追加できる
drop policy if exists "post_reads: insert own" on public.post_reads;
create policy "post_reads: insert own"
  on public.post_reads for insert to authenticated
  with check (auth.uid() = user_id);

-- 自分が拾った記録と、自分の言葉が拾われた記録（「誰かが読んだよ」の数）だけ読める
drop policy if exists "post_reads: read own or about own posts" on public.post_reads;
create policy "post_reads: read own or about own posts"
  on public.post_reads for select to authenticated
  using (
    auth.uid() = user_id
    or exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid())
  );
