-- 관리자 SQL 세션의 롤백 전용 검증입니다. 오늘의 실제 공용 문제가 생성되기 전에 실행합니다.
begin;
do $$
declare v_user uuid := gen_random_uuid(); v_other uuid := gen_random_uuid();
begin
  if exists(select 1 from public.writing_days where study_date=(now() at time zone 'Asia/Seoul')::date) then raise exception 'TEST_REQUIRES_EMPTY_TODAY'; end if;
  insert into auth.users(id) values(v_user),(v_other);
  perform set_config('test.writing_user',v_user::text,true);
  perform set_config('test.writing_other',v_other::text,true);
  update writing_private.config set secret_hash=encode(sha256(convert_to(repeat('writing-test-',8),'UTF8')),'hex');
end;
$$;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.writing_user'),'role','authenticated')::text,true) is not null as identity_set;
do $$
declare v_secret text := repeat('writing-test-',8); v_claim jsonb; v_questions jsonb; v_snapshot jsonb; v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  begin perform public.writing_command('wrong','snapshot','{}'); raise exception 'TEST_SECRET_FAILED'; exception when raise_exception then if sqlerrm <> 'WRITING_SERVER_NOT_CONFIGURED' then raise; end if; end;
  begin perform 1 from writing_private.solutions; raise exception 'TEST_SOLUTION_VISIBILITY_FAILED'; exception when insufficient_privilege then null; end;
  begin insert into public.writing_days(study_date,status) values(v_today,'ready'); raise exception 'TEST_SHARED_WRITE_FAILED'; exception when insufficient_privilege then null; end;
  v_claim := public.writing_command(v_secret,'generate_claim','{}');
  perform set_config('test.writing_claim',v_claim::text,true);
  begin perform public.writing_command(v_secret,'generate_claim','{}'); raise exception 'TEST_GLOBAL_LOCK_FAILED'; exception when raise_exception then if sqlerrm <> 'WRITING_GENERATING' then raise; end if; end;
  select jsonb_agg(jsonb_build_object('korean','검증 문장 '||i,'key','동일한키','reference','日本語の文です。','reading','にほんごのぶんです。','explanation','한국어 풀이','grammar','["〜ことにする"]'::jsonb,'alternatives','[]'::jsonb)) into v_questions from generate_series(1,10)i;
  begin perform public.writing_command(v_secret,'generate_finish',v_claim||jsonb_build_object('questions',v_questions,'model','test-only')); raise exception 'TEST_DUPLICATE_FAILED'; exception when unique_violation then null; end;
  if exists(select 1 from public.writing_questions) then raise exception 'TEST_ATOMIC_GENERATION_FAILED'; end if;
  select jsonb_agg(jsonb_build_object('korean','검증 문장 '||i,'key',current_setting('test.writing_user')||'-'||i,'reference','日本語の文です。','reading','にほんごのぶんです。','explanation','한국어 풀이','grammar','["〜ことにする"]'::jsonb,'alternatives','[]'::jsonb)) into v_questions from generate_series(1,10)i;
  perform public.writing_command(v_secret,'generate_finish',v_claim||jsonb_build_object('questions',v_questions,'model','test-only'));
  v_snapshot := public.writing_command(v_secret,'snapshot','{}');
  if jsonb_array_length(v_snapshot->'questions')<>10 or v_snapshot::text like '%reference%' then raise exception 'TEST_QUESTION_PROJECTION_FAILED'; end if;
  if (public.writing_command(v_secret,'generate_claim','{}')->>'cached')::boolean is not true then raise exception 'TEST_GLOBAL_REUSE_FAILED'; end if;
end;
$$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.writing_other'),'role','authenticated')::text,true) is not null as other_identity_set;
do $$
declare snapshot jsonb;
begin
  snapshot := public.writing_command(repeat('writing-test-',8),'snapshot','{}');
  if jsonb_array_length(snapshot->'questions')<>10 or jsonb_array_length(snapshot->'answers')<>0 then raise exception 'TEST_CROSS_USER_SHARED_SET_FAILED'; end if;
end;
$$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.writing_user'),'role','authenticated')::text,true) is not null as original_identity_set;
do $$
declare secret text := repeat('writing-test-',8); claim jsonb; snapshot jsonb; body jsonb;
begin
  body := jsonb_build_object('answers','[{"index":0,"answer":"日本語の文です。","version":0}]'::jsonb);
  perform public.writing_command(secret,'save',body);
  claim := public.writing_command(secret,'grade_claim',body);
  perform public.writing_command(secret,'grade_finish',claim||jsonb_build_object('results','[{"index":0,"score":10,"feedback":"의미와 문법이 정확해요.","corrected":"日本語の文です。","points":[]}]'::jsonb));
  snapshot := public.writing_command(secret,'snapshot','{}');
  if jsonb_array_length(snapshot->'results')<>1 or (snapshot->'results'->0->>'score')::int<>10 then raise exception 'TEST_GRADE_SAVE_FAILED'; end if;
  if (public.writing_command(secret,'grade_claim',body)->>'cached')::boolean is not true then raise exception 'TEST_GRADE_CACHE_FAILED'; end if;
  begin perform public.writing_command(secret,'save','{"answers":[{"index":0,"answer":"変更した文。","version":0}]}'); raise exception 'TEST_VERSION_CONFLICT_FAILED'; exception when raise_exception then if sqlerrm<>'DRAFT_CONFLICT' then raise; end if; end;
  body := '{"answers":[{"index":0,"answer":"変更した文。","version":1}]}'::jsonb;
  claim := public.writing_command(secret,'grade_claim',body);
  perform public.writing_command(secret,'save','{"answers":[{"index":0,"answer":"別の文。","version":2}]}');
  perform public.writing_command(secret,'grade_finish',claim||jsonb_build_object('results','[{"index":0,"score":8,"feedback":"一部修正","corrected":"変更した文です。","points":[]}]'::jsonb));
  snapshot := public.writing_command(secret,'snapshot','{}');
  if jsonb_array_length(snapshot->'results')<>0 then raise exception 'TEST_STALE_GRADE_FAILED'; end if;
  body := '{"answers":[{"index":0,"answer":"別の文。","version":3}]}'::jsonb;
  for i in 3..5 loop
    claim := public.writing_command(secret,'grade_claim',body);
    perform public.writing_command(secret,'grade_fail',claim);
  end loop;
  begin perform public.writing_command(secret,'grade_claim',body); raise exception 'TEST_GRADE_LIMIT_FAILED'; exception when raise_exception then if sqlerrm<>'WRITING_GRADE_LIMIT' then raise; end if; end;
end;
$$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.writing_other'),'role','authenticated')::text,true) is not null as isolated_identity_set;
do $$
declare snapshot jsonb;
begin
  snapshot := public.writing_command(repeat('writing-test-',8),'snapshot','{}');
  if exists(select 1 from public.writing_answers) or exists(select 1 from public.writing_results)
     or jsonb_array_length(snapshot->'answers')<>0 or jsonb_array_length(snapshot->'results')<>0 or (snapshot->>'gradeUsed')::integer<>0 then raise exception 'TEST_ACCOUNT_ISOLATION_FAILED'; end if;
end;
$$;
select '공용 10문제 재사용·중복 전체 롤백·정답 비공개·계정 격리·답안 충돌·채점 캐시·오래된 채점 제외·하루 5회 제한 통과' as verification;
rollback;
