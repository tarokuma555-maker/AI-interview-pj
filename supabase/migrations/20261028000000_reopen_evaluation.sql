-- 設計 2026-10-27 6章(段階D)。結果をまとめられなかった練習・作成中のまま止まった練習を作り直す。
-- 作り直しの権利は1回だけ取れる(同時に押されても、評価の処理は1回だけ動く)。
create function public.reopen_evaluation(p_link uuid, p_session uuid, p_stale_before timestamptz)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.evaluations e
  set status = 'pending', attempts = e.attempts + 1, error = null, result = null
  from public.interview_sessions s
  where e.session_id = p_session and s.id = e.session_id and s.link_id = p_link and s.finished_at is not null
    and (e.status = 'failed' or (e.status = 'pending' and e.updated_at < p_stale_before));
  return found;
end;
$$;

-- 一般のログイン権限には実行を許さない。サーバーが担当・リンクを確かめてから呼ぶ。
revoke all on function public.reopen_evaluation(uuid,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.reopen_evaluation(uuid,uuid,timestamptz) to service_role;
