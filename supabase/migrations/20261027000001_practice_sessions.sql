-- 設計 2026-10-27 6章。開始・終了を一度だけ記録し、求職者単位で上限を守る。
-- CLIが生成した日時が既存の初期定義より前だったため、依存順にファイル名を調整。
alter table public.interview_sessions add column request_id uuid;
create unique index interview_start_request on public.interview_sessions(link_id, request_id);

create function public.start_practice(p_hash text, p_request uuid, p_answer_by text, p_voice text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  l public.practice_links;
  s public.seekers;
  existing uuid;
  day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo';
  month_start timestamptz := date_trunc('month', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo';
begin
  if p_answer_by not in ('voice','text') or p_request is null then raise exception 'INVALID_INPUT'; end if;
  select * into l from public.practice_links where key_hash = p_hash and disabled_at is null for share;
  if not found then raise exception 'INVALID_LINK'; end if;
  -- 同じ求職者の別リンクから同時に開始しても、ここで直列化する。
  select * into s from public.seekers where id = l.seeker_id for update;
  if not found then raise exception 'INVALID_LINK'; end if;
  if not exists(select 1 from public.user_profiles where id = s.advisor_id and is_active) then raise exception 'INVALID_LINK'; end if;
  select id into existing from public.interview_sessions where link_id = l.id and request_id = p_request;
  if existing is not null then return existing; end if;
  if (select count(*) from public.interview_sessions where seeker_id = s.id and started_at >= month_start) >= 30 then raise exception 'MONTH_LIMIT'; end if;
  if (select count(*) from public.interview_sessions where seeker_id = s.id and started_at >= day_start) >= 3 then raise exception 'DAY_LIMIT'; end if;
  insert into public.interview_sessions(link_id,seeker_id,request_id,settings,context)
  values(l.id,s.id,p_request,
    jsonb_build_object('stage',l.stage,'style',l.style,'durationMin',l.duration_min,'interviewerModel','opus','voiceId',p_voice,'interviewerName','佐藤 健一','answerBy',p_answer_by),
    jsonb_build_object('companyName',l.company_name,'position',coalesce(nullif(l.position,''),s.occupation),'jobDescription',l.job_description,'careerSummary',s.career_summary,'reasonForChange',s.reason_for_change))
  returning id into existing;
  return existing;
end;
$$;

create function public.finish_practice(p_link uuid, p_session uuid, p_history jsonb, p_plan jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.interview_sessions set history = p_history, plan = p_plan, finished_at = now()
  where id = p_session and link_id = p_link and finished_at is null;
  if not found then return false; end if;
  insert into public.evaluations(session_id,status,attempts) values(p_session,'pending',1);
  return true;
end;
$$;

-- 一般のログイン権限には実行を許さない。サーバーが毎回リンクを確認してから呼ぶ。
revoke all on function public.start_practice(text,uuid,text,text) from public, anon, authenticated;
revoke all on function public.finish_practice(uuid,uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.start_practice(text,uuid,text,text) to service_role;
grant execute on function public.finish_practice(uuid,uuid,jsonb,jsonb) to service_role;
