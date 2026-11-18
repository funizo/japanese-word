-- 관리자 SQL 세션에서 실행하며 검증용 데이터와 계정은 모두 롤백합니다.
begin;

do $$
declare v_user uuid := gen_random_uuid(); v_other uuid := gen_random_uuid();
begin
  insert into auth.users(id) values(v_user),(v_other);
  perform set_config('test.stars_user',v_user::text,true);
  perform set_config('test.stars_other',v_other::text,true);
  insert into public.saved_words(user_id,word_id) values(v_user,'별표-검증'),(v_other,'별표-검증');
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.stars_user'),'role','authenticated')::text,true) is not null as identity_set;

do $$
declare v_count integer;
begin
  if (select is_starred from public.saved_words where word_id='별표-검증') then raise exception '기본 별표는 해제 상태여야 합니다'; end if;
  update public.saved_words set is_starred=true where word_id='별표-검증';
  get diagnostics v_count = row_count;
  if v_count<>1 then raise exception '본인 단어만 수정해야 합니다'; end if;
  if not (select is_starred from public.saved_words where word_id='별표-검증') then raise exception '별표 저장 실패'; end if;
  -- 반복 저장이나 브라우저 가져오기가 기존 별표를 지우지 않는지 확인합니다.
  insert into public.saved_words(user_id,word_id) values(auth.uid(),'별표-검증') on conflict(user_id,word_id) do nothing;
  if not (select is_starred from public.saved_words where word_id='별표-검증') then raise exception '반복 저장이 별표를 지웠습니다'; end if;
  begin
    update public.saved_words set user_id=current_setting('test.stars_other')::uuid where word_id='별표-검증';
    raise exception '소유자 변경이 허용되었습니다';
  exception when insufficient_privilege then null;
  end;
  update public.saved_words set is_starred=false where word_id='별표-검증';
  if (select count(*) from public.saved_words where word_id='별표-검증' and not is_starred)<>1 then raise exception '별표 해제 후 단어를 유지해야 합니다'; end if;
  update public.saved_words set is_starred=true where word_id='별표-검증';
end;
$$;

select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.stars_other'),'role','authenticated')::text,true) is not null as other_identity_set;
do $$
declare v_count integer;
begin
  if exists(select 1 from public.saved_words where is_starred) then raise exception '다른 계정 별표가 노출되었습니다'; end if;
  update public.saved_words set is_starred=false where user_id=current_setting('test.stars_user')::uuid;
  get diagnostics v_count = row_count;
  if v_count<>0 then raise exception '다른 계정 별표를 변경했습니다'; end if;
end;
$$;

set local role anon;
do $$
begin
  begin
    update public.saved_words set is_starred=true where word_id='별표-검증';
    raise exception '비로그인 DB 수정이 허용되었습니다';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
do $$
begin
  if not (select is_starred from public.saved_words where user_id=current_setting('test.stars_user')::uuid and word_id='별표-검증') then raise exception '다른 계정이 별표를 변경했습니다'; end if;
end;
$$;
select '별표 DB 검증 통과: 저장·해제, 중복 저장 유지, 계정 격리, 소유자 변경 차단, 비로그인 차단' as verification;
rollback;
