-- 공용 문제와 비공개 모범답안, 개인 답안·채점 기록을 분리합니다.
create schema writing_private;
revoke all on schema writing_private from public, anon, authenticated;
grant usage on schema writing_private to authenticated;

create table public.writing_days (
  study_date date primary key,
  status text not null check (status in ('generating','ready','failed')),
  model text,
  created_at timestamptz not null default now()
);
create table public.writing_questions (
  study_date date not null references public.writing_days(study_date),
  question_index integer not null check (question_index between 0 and 9),
  korean text not null check (length(korean) between 1 and 220),
  korean_key text not null unique,
  primary key (study_date, question_index)
);
create table public.writing_answers (
  user_id uuid not null references auth.users(id) on delete cascade,
  study_date date not null,
  question_index integer not null,
  answer text not null check (length(answer) <= 600),
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, study_date, question_index),
  foreign key (study_date, question_index) references public.writing_questions(study_date, question_index)
);
create table public.writing_results (
  user_id uuid not null,
  study_date date not null,
  question_index integer not null,
  answer_version integer not null,
  score integer not null check (score between 0 and 10),
  feedback text not null,
  corrected text not null,
  points jsonb not null,
  reference text not null,
  reading text not null,
  explanation text not null,
  grammar jsonb not null,
  alternatives jsonb not null,
  graded_at timestamptz not null default now(),
  primary key (user_id, study_date, question_index, answer_version),
  foreign key (user_id, study_date, question_index) references public.writing_answers(user_id, study_date, question_index) on delete cascade
);

alter table public.writing_days enable row level security;
alter table public.writing_questions enable row level security;
alter table public.writing_answers enable row level security;
alter table public.writing_results enable row level security;
revoke all on public.writing_days, public.writing_questions, public.writing_answers, public.writing_results from anon, authenticated;
grant select on public.writing_days, public.writing_questions, public.writing_answers, public.writing_results to authenticated;
create policy "로그인 사용자 공용 문제 날짜 조회" on public.writing_days for select to authenticated using (true);
create policy "로그인 사용자 공용 작문 문제 조회" on public.writing_questions for select to authenticated using (true);
create policy "본인 작문 답안 조회" on public.writing_answers for select to authenticated using ((select auth.uid()) = user_id);
create policy "본인 작문 채점 조회" on public.writing_results for select to authenticated using ((select auth.uid()) = user_id);

create table writing_private.config (singleton boolean primary key default true check (singleton), secret_hash text not null);
create table writing_private.solutions (
  study_date date not null,
  question_index integer not null,
  content jsonb not null,
  primary key (study_date, question_index),
  foreign key (study_date, question_index) references public.writing_questions(study_date, question_index)
);
create table writing_private.daily_jobs (
  study_date date primary key references public.writing_days(study_date),
  request_id uuid not null,
  expires_at timestamptz not null,
  attempts integer not null check (attempts between 1 and 3)
);
create table writing_private.grade_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  study_date date not null references public.writing_days(study_date),
  request_date date not null default (now() at time zone 'Asia/Seoul')::date,
  slot integer not null check (slot between 1 and 5),
  snapshot jsonb not null,
  expires_at timestamptz not null default now() + interval '4 minutes',
  finished_at timestamptz,
  unique (user_id, request_date, slot)
);
create unique index writing_one_grade_job_idx on writing_private.grade_jobs(user_id) where finished_at is null;
revoke all on all tables in schema writing_private from public, anon, authenticated;

-- 서버가 전달한 버전과 현재 버전이 다르면 다른 기기의 답안을 덮어쓰지 않습니다.
create function writing_private.save_drafts(p_user uuid, p_date date, p_answers jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare item jsonb; v_index integer; v_answer text; v_version integer; old public.writing_answers;
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) not between 1 and 10 then raise exception 'INVALID_ANSWERS'; end if;
  if (select count(distinct value->>'index') from jsonb_array_elements(p_answers)) <> jsonb_array_length(p_answers) then raise exception 'INVALID_ANSWERS'; end if;
  for item in select value from jsonb_array_elements(p_answers) loop
    v_index := (item->>'index')::integer;
    v_answer := btrim(item->>'answer');
    v_version := coalesce((item->>'version')::integer,0);
    if v_index not between 0 and 9 or v_answer is null or length(v_answer)>600 then raise exception 'INVALID_ANSWERS'; end if;
    select * into old from public.writing_answers where user_id=p_user and study_date=p_date and question_index=v_index for update;
    if found then
      if old.answer = v_answer then continue; end if;
      if old.version <> v_version then raise exception 'DRAFT_CONFLICT'; end if;
      update public.writing_answers set answer=v_answer,version=version+1,updated_at=now() where user_id=p_user and study_date=p_date and question_index=v_index;
    else
      if v_version <> 0 then raise exception 'DRAFT_CONFLICT'; end if;
      if v_answer <> '' then insert into public.writing_answers(user_id,study_date,question_index,answer) values(p_user,p_date,v_index,v_answer); end if;
    end if;
  end loop;
end;
$$;
revoke all on function writing_private.save_drafts(uuid,date,jsonb) from public, anon, authenticated;

-- 공용 콘텐츠 쓰기와 정답 읽기는 서버 전용 증명을 검증한 좁은 작업에만 허용합니다.
create function writing_private.command(p_secret text, p_action text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid(); v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_date date := coalesce((p_payload->>'date')::date,v_today);
  v_job writing_private.daily_jobs; v_grade_job writing_private.grade_jobs;
  v_id uuid; v_slot integer; v_items jsonb; item jsonb; grade jsonb; v_index integer;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_secret is null or length(p_secret)<32 or not exists(
    select 1 from writing_private.config where secret_hash=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_secret,'UTF8')),'hex')
  ) then raise exception 'WRITING_SERVER_NOT_CONFIGURED'; end if;
  if v_date > v_today then raise exception 'INVALID_DATE'; end if;

  if p_action='snapshot' then
    return jsonb_build_object(
      'date',v_date,'today',v_today,
      'status',coalesce((select case when d.status='generating' and j.expires_at<now() then 'failed' else d.status end from public.writing_days d left join writing_private.daily_jobs j using(study_date) where d.study_date=v_date),'empty'),
      'questions',coalesce((select jsonb_agg(jsonb_build_object('question_index',q.question_index,'korean',q.korean) order by q.question_index) from public.writing_questions q where q.study_date=v_date),'[]'::jsonb),
      'answers',coalesce((select jsonb_agg(jsonb_build_object('question_index',a.question_index,'answer',a.answer,'version',a.version,'updated_at',a.updated_at) order by a.question_index) from public.writing_answers a where a.user_id=v_user and a.study_date=v_date),'[]'::jsonb),
      'results',coalesce((select jsonb_agg(to_jsonb(r)-'user_id'-'study_date' order by r.question_index) from public.writing_results r join public.writing_answers a on a.user_id=r.user_id and a.study_date=r.study_date and a.question_index=r.question_index and a.version=r.answer_version where r.user_id=v_user and r.study_date=v_date),'[]'::jsonb),
      'history',coalesce((select jsonb_agg(jsonb_build_object('study_date',study_date) order by study_date desc) from public.writing_days where status='ready'),'[]'::jsonb),
      'gradeUsed',(select count(*) from writing_private.grade_jobs where user_id=v_user and request_date=v_today)
    );
  elsif p_action='generate_claim' then
    v_date := v_today;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('writing:'||v_date::text,0));
    if exists(select 1 from public.writing_days where study_date=v_date and status='ready') then return jsonb_build_object('cached',true,'date',v_date); end if;
    select * into v_job from writing_private.daily_jobs where study_date=v_date for update;
    if found then
      if v_job.expires_at>now() then raise exception 'WRITING_GENERATING'; end if;
      if v_job.attempts>=3 then raise exception 'WRITING_GENERATION_LIMIT'; end if;
    end if;
    v_id := gen_random_uuid();
    insert into public.writing_days(study_date,status) values(v_date,'generating') on conflict(study_date) do update set status='generating';
    insert into writing_private.daily_jobs(study_date,request_id,expires_at,attempts) values(v_date,v_id,now()+interval '4 minutes',1)
      on conflict(study_date) do update set request_id=v_id,expires_at=now()+interval '4 minutes',attempts=writing_private.daily_jobs.attempts+1;
    return jsonb_build_object('cached',false,'date',v_date,'requestId',v_id);
  elsif p_action in ('generate_finish','generate_fail') then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('writing:'||v_date::text,0));
    select * into v_job from writing_private.daily_jobs where study_date=v_date and request_id=(p_payload->>'requestId')::uuid and expires_at>now() for update;
    if not found then raise exception 'WRITING_REQUEST_EXPIRED'; end if;
    if exists(select 1 from public.writing_days where study_date=v_date and status='ready') then return '{}'::jsonb; end if;
    if p_action='generate_fail' then
      update writing_private.daily_jobs set expires_at=now() where study_date=v_date;
      update public.writing_days set status='failed' where study_date=v_date;
      return '{}'::jsonb;
    end if;
    v_items := p_payload->'questions';
    if v_items is null or jsonb_typeof(v_items)<>'array' or jsonb_array_length(v_items)<>10 then raise exception 'INVALID_QUESTIONS'; end if;
    for item,v_index in select value,(ordinality-1)::integer from jsonb_array_elements(v_items) with ordinality loop
      insert into public.writing_questions(study_date,question_index,korean,korean_key) values(v_date,v_index,item->>'korean',item->>'key');
      insert into writing_private.solutions(study_date,question_index,content) values(v_date,v_index,item-'key');
    end loop;
    update public.writing_days set status='ready',model=p_payload->>'model' where study_date=v_date;
    update writing_private.daily_jobs set expires_at=now() where study_date=v_date;
    return '{}'::jsonb;
  elsif p_action='previous_questions' then
    return coalesce((select jsonb_agg(korean) from public.writing_questions),'[]'::jsonb);
  elsif p_action in ('save','grade_claim') then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('writing:user:'||v_user::text,0));
    if not exists(select 1 from public.writing_days where study_date=v_date and status='ready') then raise exception 'WRITING_DAY_NOT_FOUND'; end if;
    perform writing_private.save_drafts(v_user,v_date,p_payload->'answers');
    if p_action='save' then return '{}'::jsonb; end if;
    update writing_private.grade_jobs set finished_at=now() where user_id=v_user and finished_at is null and expires_at<=now();
    if exists(select 1 from writing_private.grade_jobs where user_id=v_user and finished_at is null) then raise exception 'WRITING_GRADING'; end if;
    select jsonb_agg(jsonb_build_object('index',a.question_index,'answer',a.answer,'version',a.version)||s.content order by a.question_index) into v_items
      from public.writing_answers a join writing_private.solutions s on s.study_date=a.study_date and s.question_index=a.question_index
      where a.user_id=v_user and a.study_date=v_date and a.answer<>'' and not exists(select 1 from public.writing_results r where r.user_id=v_user and r.study_date=v_date and r.question_index=a.question_index and r.answer_version=a.version);
    if v_items is null then return jsonb_build_object('cached',true); end if;
    select coalesce(max(slot),0)+1 into v_slot from writing_private.grade_jobs where user_id=v_user and request_date=v_today;
    if v_slot>5 then raise exception 'WRITING_GRADE_LIMIT'; end if;
    insert into writing_private.grade_jobs(user_id,study_date,slot,snapshot) values(v_user,v_date,v_slot,v_items) returning id into v_id;
    return jsonb_build_object('cached',false,'requestId',v_id,'items',v_items);
  elsif p_action in ('grade_finish','grade_fail') then
    select * into v_grade_job from writing_private.grade_jobs where id=(p_payload->>'requestId')::uuid and user_id=v_user and finished_at is null and expires_at>now() for update;
    if not found then raise exception 'WRITING_REQUEST_EXPIRED'; end if;
    if p_action='grade_fail' then update writing_private.grade_jobs set finished_at=now() where id=v_grade_job.id; return '{}'::jsonb; end if;
    v_items := p_payload->'results';
    if v_items is null or jsonb_typeof(v_items)<>'array' or jsonb_array_length(v_items)<>jsonb_array_length(v_grade_job.snapshot)
       or (select count(distinct value->>'index') from jsonb_array_elements(v_items))<>jsonb_array_length(v_items) then raise exception 'INVALID_GRADES'; end if;
    for item in select value from jsonb_array_elements(v_grade_job.snapshot) loop
      select value into grade from jsonb_array_elements(v_items) where (value->>'index')::integer=(item->>'index')::integer;
      if not found or (grade->>'score')::integer not between 0 and 10 or grade->>'feedback' is null or grade->>'corrected' is null or jsonb_typeof(grade->'points')<>'array' then raise exception 'INVALID_GRADES'; end if;
      insert into public.writing_results(user_id,study_date,question_index,answer_version,score,feedback,corrected,points,reference,reading,explanation,grammar,alternatives)
        values(v_user,v_grade_job.study_date,(item->>'index')::integer,(item->>'version')::integer,(grade->>'score')::integer,grade->>'feedback',grade->>'corrected',grade->'points',item->>'reference',item->>'reading',item->>'explanation',item->'grammar',item->'alternatives');
    end loop;
    update writing_private.grade_jobs set finished_at=now() where id=v_grade_job.id;
    return '{}'::jsonb;
  end if;
  raise exception 'INVALID_WRITING_ACTION';
end;
$$;
revoke all on function writing_private.command(text,text,jsonb) from public, anon, authenticated;
grant execute on function writing_private.command(text,text,jsonb) to authenticated;

create function public.writing_command(p_secret text, p_action text, p_payload jsonb default '{}'::jsonb) returns jsonb
language sql security invoker set search_path = '' as $$
  select writing_private.command(p_secret,p_action,p_payload);
$$;
revoke all on function public.writing_command(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.writing_command(text,text,jsonb) to authenticated;

comment on table public.writing_questions is '한국 날짜마다 서버 전체가 공유하는 N3 작문 문제 10개. 답안 키는 비공개 스키마에 보관합니다.';
comment on table public.writing_results is '계정과 답안 버전별 AI 채점 결과. 이전 채점 결과는 새 답안의 결과로 표시하지 않습니다.';
