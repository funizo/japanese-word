-- 기존 문제·답안·풀이를 유지하며 단어 배열용 서버 작업을 추가합니다.
create function writing_private.word_order_command(p_secret text, p_action text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_snapshot jsonb; v_date date; v_user uuid := auth.uid();
  item jsonb; v_answer public.writing_answers; v_content jsonb; v_correct boolean;
begin
  -- 기존 작업이 사용자, 서버 비밀값, 학습 날짜를 먼저 검증합니다.
  v_snapshot := writing_private.command(p_secret,'snapshot',p_payload);
  v_date := (v_snapshot->>'date')::date;

  if p_action='puzzle_snapshot' then
    return v_snapshot || jsonb_build_object('solutions',coalesce((
      select jsonb_agg(s.content || jsonb_build_object('question_index',s.question_index) order by s.question_index)
      from writing_private.solutions s where s.study_date=v_date
    ),'[]'::jsonb));
  elsif p_action='check' then
    -- 저장 시 획득한 사용자 잠금을 정답 기록까지 같은 트랜잭션에서 유지합니다.
    perform writing_private.command(p_secret,'save',p_payload);
    for item in select value from jsonb_array_elements(p_payload->'answers') loop
      select * into strict v_answer from public.writing_answers
        where user_id=v_user and study_date=v_date and question_index=(item->>'index')::integer;
      select content into strict v_content from writing_private.solutions
        where study_date=v_date and question_index=v_answer.question_index;
      v_correct := regexp_replace(normalize(v_answer.answer,NFKC),'[[:space:]。、，,.!?！？]','','g')
        = regexp_replace(normalize(v_content->>'reference',NFKC),'[[:space:]。、，,.!?！？]','','g')
        or exists(select 1 from jsonb_array_elements_text(v_content->'alternatives') alternative
          where regexp_replace(normalize(v_answer.answer,NFKC),'[[:space:]。、，,.!?！？]','','g')
            = regexp_replace(normalize(alternative,NFKC),'[[:space:]。、，,.!?！？]','','g'));
      insert into public.writing_results(user_id,study_date,question_index,answer_version,score,feedback,corrected,points,reference,reading,explanation,grammar,alternatives)
        values(v_user,v_date,v_answer.question_index,v_answer.version,case when v_correct then 10 else 0 end,
          case when v_correct then '단어를 올바른 순서로 배열했어요.' else '단어의 순서를 다시 확인해 보세요.' end,
          v_content->>'reference','[]'::jsonb,v_content->>'reference',v_content->>'reading',v_content->>'explanation',v_content->'grammar',v_content->'alternatives')
        on conflict(user_id,study_date,question_index,answer_version) do update
          set score=excluded.score,feedback=excluded.feedback,corrected=excluded.corrected,points=excluded.points,graded_at=now();
    end loop;
    return '{}'::jsonb;
  end if;
  raise exception 'INVALID_WRITING_ACTION';
end;
$$;
revoke all on function writing_private.word_order_command(text,text,jsonb) from public, anon, authenticated;
grant execute on function writing_private.word_order_command(text,text,jsonb) to authenticated;

-- 비공개 답안은 서버 전용 증명을 통과한 호출만 조회할 수 있습니다.
create or replace function public.writing_command(p_secret text, p_action text, p_payload jsonb default '{}'::jsonb) returns jsonb
language sql security invoker set search_path = '' as $$
  select case when p_action in ('puzzle_snapshot','check')
    then writing_private.word_order_command(p_secret,p_action,p_payload)
    else writing_private.command(p_secret,p_action,p_payload) end;
$$;
