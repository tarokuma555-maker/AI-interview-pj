-- エージェントが作る招待リンクで面接練習する(設計 2026-10-27 5章)
-- 求職者はログインしない。エージェント・管理者だけが Supabase Auth のユーザーになる。
-- 練習の記録と評価は、サーバーの管理用キー(RLS を通らない)だけが書き込む。

create type public.user_role as enum ('advisor', 'admin');

-- 更新日時をそろえる
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- エージェント・管理者(auth.users と 1:1)
create table public.user_profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  role          public.user_role not null default 'advisor',
  display_name  text not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- 求職者(ログインしないため、auth.users とは結び付けない)
create table public.seekers (
  id                 uuid primary key default gen_random_uuid(),
  advisor_id         uuid not null references public.user_profiles (id),
  name               text not null check (char_length(name) between 1 and 100),
  occupation         text not null default '' check (char_length(occupation) <= 100),
  career_summary     text not null default '' check (char_length(career_summary) <= 20000),
  reason_for_change  text not null default '' check (char_length(reason_for_change) <= 5000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index on public.seekers (advisor_id, created_at desc);

-- 招待リンク(求職者 × 応募先ごとに1つ。鍵そのものは置かず、ハッシュだけを置く)
create table public.practice_links (
  id               uuid primary key default gen_random_uuid(),
  seeker_id        uuid not null references public.seekers (id) on delete cascade,
  key_hash         text not null unique,
  company_name     text not null check (char_length(company_name) between 1 and 200),
  position         text not null default '' check (char_length(position) <= 200),
  job_description  text not null default '' check (char_length(job_description) <= 20000),
  stage            text not null check (stage in ('first', 'second', 'final')),
  style            text not null check (style in ('gentle', 'standard', 'strict')),
  duration_min     smallint not null check (duration_min in (5, 15, 30)),
  disabled_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on public.practice_links (seeker_id, created_at);

-- 1回の練習(そのときの設定・前提情報の写しと、会話の記録をまとめて持つ)
create table public.interview_sessions (
  id           uuid primary key default gen_random_uuid(),
  link_id      uuid not null references public.practice_links (id) on delete cascade,
  seeker_id    uuid not null references public.seekers (id) on delete cascade,
  settings     jsonb not null,
  context      jsonb not null,
  plan         jsonb,
  history      jsonb not null default '[]',
  started_at   timestamptz not null default now(),
  finished_at  timestamptz
);
create index on public.interview_sessions (seeker_id, started_at desc);
create index on public.interview_sessions (link_id, started_at desc);

-- 評価(1回の練習に1つ)
create table public.evaluations (
  session_id  uuid primary key references public.interview_sessions (id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  result      jsonb,
  error       text,
  attempts    smallint not null default 0,
  updated_at  timestamptz not null default now()
);

create trigger seekers_updated_at before update on public.seekers
  for each row execute function public.set_updated_at();
create trigger practice_links_updated_at before update on public.practice_links
  for each row execute function public.set_updated_at();
create trigger evaluations_updated_at before update on public.evaluations
  for each row execute function public.set_updated_at();

-- ログインしている人の権限(利用を止めた人・プロフィールのない人は null)
create function public.current_user_role() returns public.user_role
language sql stable security definer set search_path = '' as $$
  select role from public.user_profiles where id = auth.uid() and is_active
$$;
revoke all on function public.current_user_role() from public, anon;
grant execute on function public.current_user_role() to authenticated, service_role;

-- Auth にユーザーが追加されたら(管理者がエージェントを招待したら)、エージェントとして登録する
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.user_profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(new.email, ''), '@', 1))
  );
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- アクセス制限。Supabase は新しい表に anon・authenticated の全権限を付けるため、いったん外してから必要なものだけ与える
alter table public.user_profiles      enable row level security;
alter table public.seekers            enable row level security;
alter table public.practice_links     enable row level security;
alter table public.interview_sessions enable row level security;
alter table public.evaluations        enable row level security;

revoke all on public.user_profiles, public.seekers, public.practice_links, public.interview_sessions, public.evaluations
  from anon, authenticated;
grant all on public.user_profiles, public.seekers, public.practice_links, public.interview_sessions, public.evaluations
  to service_role;
grant select on public.user_profiles to authenticated;
grant select, insert, update, delete on public.seekers, public.practice_links to authenticated;
grant select on public.interview_sessions, public.evaluations to authenticated;

-- 本人の行だけを見られる(権限・利用可否はサーバーだけが変える)
create policy "本人を参照" on public.user_profiles for select to authenticated
  using (id = auth.uid());

-- 担当のエージェント(利用中)と管理者だけが扱える
create policy "担当を参照" on public.seekers for select to authenticated
  using ((advisor_id = auth.uid() and public.current_user_role() is not null) or public.current_user_role() = 'admin');
create policy "担当として追加" on public.seekers for insert to authenticated
  with check ((advisor_id = auth.uid() and public.current_user_role() is not null) or public.current_user_role() = 'admin');
create policy "担当を更新" on public.seekers for update to authenticated
  using ((advisor_id = auth.uid() and public.current_user_role() is not null) or public.current_user_role() = 'admin')
  with check ((advisor_id = auth.uid() and public.current_user_role() is not null) or public.current_user_role() = 'admin');
create policy "担当を削除" on public.seekers for delete to authenticated
  using ((advisor_id = auth.uid() and public.current_user_role() is not null) or public.current_user_role() = 'admin');

-- リンク・練習・評価は、親の求職者を見られる人だけが扱える(seekers の RLS がそのまま効く)
create policy "担当のリンク" on public.practice_links for all to authenticated
  using (exists (select 1 from public.seekers s where s.id = practice_links.seeker_id))
  with check (exists (select 1 from public.seekers s where s.id = practice_links.seeker_id));
create policy "担当の練習を参照" on public.interview_sessions for select to authenticated
  using (exists (select 1 from public.seekers s where s.id = interview_sessions.seeker_id));
create policy "担当の評価を参照" on public.evaluations for select to authenticated
  using (exists (select 1 from public.interview_sessions i where i.id = evaluations.session_id));
