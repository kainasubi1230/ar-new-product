-- 拾った言葉を、マイページから外せるようにする（自分の「拾った」記録だけ消せる）
-- Supabase ダッシュボードの SQL Editor で実行する（何度実行しても同じ結果になる）

drop policy if exists "post_reads: delete own" on public.post_reads;
create policy "post_reads: delete own"
  on public.post_reads for delete to authenticated
  using (auth.uid() = user_id);
