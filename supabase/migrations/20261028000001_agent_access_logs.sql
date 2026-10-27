-- エージェント・管理者が求職者のデータを見た記録(要件 8.3「閲覧は操作ログに記録する」)。
-- 求職者を削除しても記録は残す(だれが・いつ・どの求職者を見たかを後から確かめられるように)。
create table public.agent_access_logs (
  id          bigint generated always as identity primary key,
  agent_id    uuid not null,
  seeker_id   uuid not null,
  session_id  uuid,
  action      text not null check (action in ('seeker_view', 'practice_list', 'practice_view')),
  created_at  timestamptz not null default now(),
  check ((action = 'practice_view') = (session_id is not null))
);
create index on public.agent_access_logs (seeker_id, created_at desc);
create index on public.agent_access_logs (agent_id, created_at desc);

alter table public.agent_access_logs enable row level security;
revoke all on public.agent_access_logs from public, anon, authenticated;
revoke all on sequence public.agent_access_logs_id_seq from public, anon, authenticated;
grant all on public.agent_access_logs to service_role;
grant select on public.agent_access_logs to authenticated;
grant insert (agent_id, seeker_id, session_id, action) on public.agent_access_logs to authenticated;

-- 自分の名前で、見られる求職者についてだけ記録できる。書き換え・削除はできない
create policy "本人の閲覧を記録" on public.agent_access_logs for insert to authenticated
  with check (agent_id = auth.uid() and public.current_user_role() is not null
    and exists (select 1 from public.seekers s where s.id = agent_access_logs.seeker_id)
    and (session_id is null or exists (
      select 1 from public.interview_sessions i
      where i.id = agent_access_logs.session_id and i.seeker_id = agent_access_logs.seeker_id
    )));
-- 記録を読めるのは管理者だけ
create policy "管理者が参照" on public.agent_access_logs for select to authenticated
  using (public.current_user_role() = 'admin');
