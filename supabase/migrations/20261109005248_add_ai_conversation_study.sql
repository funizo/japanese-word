-- 계정별 회화 자료와 중복 방지 목록을 분리합니다. 모든 함수는 호출자의 RLS를 따릅니다.
create table public.ai_study_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  study_date date not null,
  lessons jsonb not null check (jsonb_typeof(lessons) = 'array' and jsonb_array_length(lessons) = 5),
  model text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, study_date)
);

create table public.ai_study_terms (
  user_id uuid not null,
  term_key text not null check (length(term_key) between 1 and 120),
  term text not null,
  reading text not null,
  meaning text not null,
  study_date date not null,
  primary key (user_id, term_key),
  foreign key (user_id, study_date) references public.ai_study_days(user_id, study_date) on delete cascade
);
create index ai_study_terms_date_idx on public.ai_study_terms(user_id, study_date);

create table public.ai_study_progress (
  user_id uuid not null,
  study_date date not null,
  lesson_index integer not null check (lesson_index between 0 and 4),
  completed_at timestamptz not null default now(),
  primary key (user_id, study_date, lesson_index),
  foreign key (user_id, study_date) references public.ai_study_days(user_id, study_date) on delete cascade
);

-- 생성 요청은 삭제하거나 횟수를 줄일 수 없는 일별 원장으로 보관합니다.
create table public.ai_generation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  study_date date not null default (now() at time zone 'Asia/Seoul')::date,
  slot integer not null check (slot between 1 and 10),
  kind text not null check (kind in ('daily', 'more')),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (user_id, study_date, slot)
);
create unique index ai_generation_one_active_idx on public.ai_generation_requests(user_id) where finished_at is null;

alter table public.ai_study_days enable row level security;
alter table public.ai_study_terms enable row level security;
alter table public.ai_study_progress enable row level security;
alter table public.ai_generation_requests enable row level security;

revoke all on public.ai_study_days, public.ai_study_terms, public.ai_study_progress, public.ai_generation_requests from anon, authenticated;
grant select, insert on public.ai_study_days, public.ai_study_terms, public.ai_study_progress to authenticated;
grant update (lessons) on public.ai_study_days to authenticated;
grant select on public.ai_generation_requests to authenticated;
grant insert (user_id, slot, kind) on public.ai_generation_requests to authenticated;
grant update (finished_at) on public.ai_generation_requests to authenticated;

create policy "본인 회화 자료 조회" on public.ai_study_days for select to authenticated using ((select auth.uid()) = user_id);
create policy "본인 회화 자료 저장" on public.ai_study_days for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "본인 회화 예문 추가" on public.ai_study_days for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "본인 회화 용어 조회" on public.ai_study_terms for select to authenticated using ((select auth.uid()) = user_id);
create policy "본인 회화 용어 저장" on public.ai_study_terms for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "본인 회화 완료 조회" on public.ai_study_progress for select to authenticated using ((select auth.uid()) = user_id);
create policy "본인 회화 완료 저장" on public.ai_study_progress for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "본인 생성 요청 조회" on public.ai_generation_requests for select to authenticated using ((select auth.uid()) = user_id);
create policy "본인 생성 요청 예약" on public.ai_generation_requests for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "본인 생성 요청 종료" on public.ai_generation_requests for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create function public.claim_ai_generation(p_kind text) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare v_user uuid := auth.uid(); v_slot integer; v_id uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_kind not in ('daily','more') then raise exception 'INVALID_REQUEST'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 0));
  -- 실행 중 프로세스가 종료되어도 4분 뒤 다시 시도할 수 있습니다.
  update public.ai_generation_requests set finished_at = now()
    where user_id = v_user and finished_at is null and created_at < now() - interval '4 minutes';
  if exists (select 1 from public.ai_generation_requests where user_id = v_user and finished_at is null) then
    raise exception 'GENERATION_BUSY';
  end if;
  select coalesce(max(slot),0) + 1 into v_slot from public.ai_generation_requests
    where user_id = v_user and study_date = (now() at time zone 'Asia/Seoul')::date;
  if v_slot > 10 then raise exception 'DAILY_LIMIT'; end if;
  insert into public.ai_generation_requests(user_id, slot, kind) values(v_user, v_slot, p_kind) returning id into v_id;
  return v_id;
end;
$$;

create function public.save_ai_study_day(p_request_id uuid, p_lessons jsonb, p_terms jsonb, p_model text) returns void
language plpgsql security invoker set search_path = '' as $$
declare v_request public.ai_generation_requests; v_term jsonb;
begin
  select * into v_request from public.ai_generation_requests
    where id = p_request_id and user_id = auth.uid() and kind = 'daily' and finished_at is null
      and created_at >= now() - interval '4 minutes' for update;
  if not found then raise exception 'INVALID_GENERATION'; end if;
  if jsonb_typeof(p_lessons) <> 'array' or jsonb_array_length(p_lessons) <> 5
     or jsonb_typeof(p_terms) <> 'array' or jsonb_array_length(p_terms) <> 15 then raise exception 'INVALID_LESSONS'; end if;
  -- 자료와 모든 용어를 같은 트랜잭션에 저장하고, 하나라도 중복되면 전체를 되돌립니다.
  insert into public.ai_study_days(user_id, study_date, lessons, model)
    values(auth.uid(), v_request.study_date, p_lessons, p_model);
  for v_term in select value from jsonb_array_elements(p_terms) loop
    insert into public.ai_study_terms(user_id, term_key, term, reading, meaning, study_date)
      values(auth.uid(), v_term->>'key', v_term->>'term', v_term->>'reading', v_term->>'meaning', v_request.study_date);
  end loop;
  update public.ai_generation_requests set finished_at = now() where id = p_request_id;
end;
$$;

create function public.append_ai_study_examples(p_request_id uuid, p_date date, p_index integer, p_examples jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare v_request public.ai_generation_requests; v_lessons jsonb; v_examples jsonb;
begin
  select * into v_request from public.ai_generation_requests
    where id = p_request_id and user_id = auth.uid() and kind = 'more' and finished_at is null
      and created_at >= now() - interval '4 minutes' for update;
  if not found then raise exception 'INVALID_GENERATION'; end if;
  if p_index not between 0 and 4 or jsonb_typeof(p_examples) <> 'array' or jsonb_array_length(p_examples) <> 4 then raise exception 'INVALID_EXAMPLES'; end if;
  select lessons into v_lessons from public.ai_study_days where user_id = auth.uid() and study_date = p_date for update;
  if not found then raise exception 'DAY_NOT_FOUND'; end if;
  v_examples := v_lessons->p_index->'examples';
  if jsonb_array_length(v_examples) + 4 > 30 then raise exception 'EXAMPLE_LIMIT'; end if;
  update public.ai_study_days set lessons = jsonb_set(v_lessons, array[p_index::text, 'examples'], v_examples || p_examples)
    where user_id = auth.uid() and study_date = p_date;
  update public.ai_generation_requests set finished_at = now() where id = p_request_id;
end;
$$;

revoke all on function public.claim_ai_generation(text), public.save_ai_study_day(uuid,jsonb,jsonb,text), public.append_ai_study_examples(uuid,date,integer,jsonb) from public, anon;
grant execute on function public.claim_ai_generation(text), public.save_ai_study_day(uuid,jsonb,jsonb,text), public.append_ai_study_examples(uuid,date,integer,jsonb) to authenticated;

comment on table public.ai_study_terms is '신규 학습 대상 표현과 어휘의 계정별 중복 방지 목록. 예문 속 일반 단어의 반복은 허용합니다.';
comment on table public.ai_generation_requests is '계정별 하루 최대 10회. 실패한 생성 시도도 포함하며 요청자는 횟수를 되돌릴 수 없습니다.';
