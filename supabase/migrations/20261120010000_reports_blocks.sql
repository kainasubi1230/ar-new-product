-- 通報とブロック（App Store のガイドライン 1.2：ユーザーが投稿するアプリに必須）
-- Supabase ダッシュボードの SQL Editor で実行する（何度実行しても同じ結果になる）
--
-- ・通報（reports）：ログイン中の人が言葉を通報する。通報した本人だけが自分の通報を読める。
--   運営はダッシュボードの Table Editor で reports を見て、規約に反する投稿を posts から消す（24 時間以内）。
-- ・ブロック（blocks）：ログイン中の人が投稿者をブロックする。本人だけが読める・足せる・外せる。
--   ブロックした人の言葉は、アプリが AR・地図・通知に出さない。
-- アカウントを消すと、その人の通報・ブロックも消える（on delete cascade）

-- 1. 通報
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  reporter_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now(),
  -- 同じ人が同じ言葉を何度も通報しない
  unique (post_id, reporter_id)
);
alter table public.reports enable row level security;

drop policy if exists "reports: insert own" on public.reports;
create policy "reports: insert own"
  on public.reports for insert to authenticated
  with check (auth.uid() = reporter_id);

drop policy if exists "reports: read own" on public.reports;
create policy "reports: read own"
  on public.reports for select to authenticated
  using (auth.uid() = reporter_id);

-- 2. ブロック
create table if not exists public.blocks (
  blocker_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.blocks enable row level security;

drop policy if exists "blocks: insert own" on public.blocks;
create policy "blocks: insert own"
  on public.blocks for insert to authenticated
  with check (auth.uid() = blocker_id);

drop policy if exists "blocks: read own" on public.blocks;
create policy "blocks: read own"
  on public.blocks for select to authenticated
  using (auth.uid() = blocker_id);

drop policy if exists "blocks: delete own" on public.blocks;
create policy "blocks: delete own"
  on public.blocks for delete to authenticated
  using (auth.uid() = blocker_id);
