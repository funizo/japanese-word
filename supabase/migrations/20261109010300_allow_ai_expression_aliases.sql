-- 표현의 기본형과 표시형이 다를 때 두 표기를 모두 중복 방지 목록에 보관합니다.
create or replace function public.save_ai_study_day(p_request_id uuid, p_lessons jsonb, p_terms jsonb, p_model text) returns void
language plpgsql security invoker set search_path = '' as $$
declare v_request public.ai_generation_requests; v_term jsonb;
begin
  select * into v_request from public.ai_generation_requests
    where id = p_request_id and user_id = auth.uid() and kind = 'daily' and finished_at is null
      and created_at >= now() - interval '4 minutes' for update;
  if not found then raise exception 'INVALID_GENERATION'; end if;
  if jsonb_typeof(p_lessons) <> 'array' or jsonb_array_length(p_lessons) <> 5
     or jsonb_typeof(p_terms) <> 'array' or jsonb_array_length(p_terms) not between 15 and 20 then raise exception 'INVALID_LESSONS'; end if;
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
