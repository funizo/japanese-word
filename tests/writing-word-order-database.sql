-- 관리자 SQL 세션에서 실행하며 임시 계정과 문제를 포함한 모든 변경을 롤백합니다.
begin;
do $$
declare v_date date; v_user uuid := gen_random_uuid(); v_other uuid := gen_random_uuid();
begin
  select day::date into v_date from generate_series('2000-01-01'::date,'2000-12-31'::date,'1 day') day
    where not exists(select 1 from public.writing_days where study_date=day::date) limit 1;
  if v_date is null then raise exception 'TEST_REQUIRES_UNUSED_DATE'; end if;
  insert into auth.users(id) values(v_user),(v_other);
  perform set_config('test.writing_date',v_date::text,true);
  perform set_config('test.writing_user',v_user::text,true);
  perform set_config('test.writing_other',v_other::text,true);
  update writing_private.config set secret_hash=encode(sha256(convert_to(repeat('writing-test-',8),'UTF8')),'hex');
  insert into public.writing_days(study_date,status) values(v_date,'ready');
  insert into public.writing_questions(study_date,question_index,korean,korean_key)
    select v_date,i,'검증용 한국어 문장 '||i,v_user::text||':'||i from generate_series(0,9)i;
  insert into writing_private.solutions(study_date,question_index,content)
    select v_date,i,jsonb_build_object('reference','私は明日行きます。','tokens','["私は","明日","行きます"]'::jsonb,
      'reading','わたしはあしたいきます。','explanation','일본어 어순 풀이','grammar','["〜ます"]'::jsonb,
      'alternatives','["明日私は行きます。"]'::jsonb) from generate_series(0,9)i;
end;
$$;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.writing_user'),'role','authenticated')::text,true) is not null as identity_set;
do $$
declare v_secret text := repeat('writing-test-',8); v_body jsonb := jsonb_build_object('date',current_setting('test.writing_date')); v_snapshot jsonb;
begin
  begin perform public.writing_command('wrong','puzzle_snapshot',v_body); raise exception 'TEST_SECRET_FAILED'; exception when raise_exception then if sqlerrm<>'WRITING_SERVER_NOT_CONFIGURED' then raise; end if; end;
  begin perform public.writing_command('wrong','check',v_body); raise exception 'TEST_CHECK_SECRET_FAILED'; exception when raise_exception then if sqlerrm<>'WRITING_SERVER_NOT_CONFIGURED' then raise; end if; end;
  begin perform 1 from writing_private.solutions; raise exception 'TEST_PRIVATE_SOLUTION_FAILED'; exception when insufficient_privilege then null; end;
  v_snapshot := public.writing_command(v_secret,'puzzle_snapshot',v_body);
  if jsonb_array_length(v_snapshot->'solutions')<>10 then raise exception 'TEST_SERVER_SOLUTIONS_FAILED'; end if;
  v_snapshot := public.writing_command(v_secret,'snapshot',v_body);
  if v_snapshot ? 'solutions' or v_snapshot::text like '%reference%' then raise exception 'TEST_PUBLIC_PROJECTION_FAILED'; end if;
  perform public.writing_command(v_secret,'check',v_body||'{"answers":[{"index":0,"answer":"私は 明日 行きます","version":0}]}');
  v_snapshot := public.writing_command(v_secret,'snapshot',v_body);
  if (v_snapshot->'results'->0->>'score')::integer<>10 then raise exception 'TEST_CORRECT_FAILED'; end if;
  perform public.writing_command(v_secret,'check',v_body||'{"answers":[{"index":0,"answer":"私は 明日 行きます","version":0}]}');
  if (select count(*) from public.writing_results)<>1 then raise exception 'TEST_RECHECK_FAILED'; end if;
  begin perform public.writing_command(v_secret,'check',v_body||'{"answers":[{"index":0,"answer":"行きます 明日 私は","version":0}]}'); raise exception 'TEST_CONFLICT_FAILED'; exception when raise_exception then if sqlerrm<>'DRAFT_CONFLICT' then raise; end if; end;
  perform public.writing_command(v_secret,'check',v_body||'{"answers":[{"index":0,"answer":"行きます 明日 私は","version":1}]}');
  v_snapshot := public.writing_command(v_secret,'snapshot',v_body);
  if (v_snapshot->'results'->0->>'score')::integer<>0 or (v_snapshot->'answers'->0->>'version')::integer<>2 then raise exception 'TEST_INCORRECT_FAILED'; end if;
  perform public.writing_command(v_secret,'check',v_body||'{"answers":[{"index":0,"answer":"明日 私は 行きます","version":2}]}');
  v_snapshot := public.writing_command(v_secret,'snapshot',v_body);
  if (v_snapshot->'results'->0->>'score')::integer<>10 then raise exception 'TEST_ALTERNATIVE_FAILED'; end if;
  for i in 1..6 loop
    perform public.writing_command(v_secret,'check',v_body||jsonb_build_object('answers',jsonb_build_array(jsonb_build_object('index',i,'answer','私は 明日 行きます','version',0))));
  end loop;
  v_snapshot := public.writing_command(v_secret,'snapshot',v_body);
  if jsonb_array_length(v_snapshot->'results')<>7 or (v_snapshot->>'gradeUsed')::integer<>0 then raise exception 'TEST_UNLIMITED_CHECK_FAILED'; end if;
  perform public.writing_command(v_secret,'save',v_body||'{"answers":[{"index":0,"answer":"私は","version":3}]}');
  v_snapshot := public.writing_command(v_secret,'snapshot',v_body);
  if jsonb_array_length(v_snapshot->'results')<>6 then raise exception 'TEST_STALE_RESULT_FAILED'; end if;
end;
$$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.writing_other'),'role','authenticated')::text,true) is not null as other_identity_set;
do $$
declare v_snapshot jsonb;
begin
  v_snapshot := public.writing_command(repeat('writing-test-',8),'puzzle_snapshot',jsonb_build_object('date',current_setting('test.writing_date')));
  if exists(select 1 from public.writing_answers) or exists(select 1 from public.writing_results)
    or jsonb_array_length(v_snapshot->'answers')<>0 or jsonb_array_length(v_snapshot->'results')<>0 then raise exception 'TEST_ACCOUNT_ISOLATION_FAILED'; end if;
end;
$$;
select '단어 배열 DB 검증 통과: 서버 증명, 비공개 정답, 정오답, 다른 어순 허용, 재확인, 버전 충돌, 횟수 제한 없음, 오래된 결과 제외, 계정 격리' as verification;
rollback;
