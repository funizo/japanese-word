-- 저장한 단어 중 빨리 외울 단어를 계정별로 표시합니다.
alter table public.saved_words
  add column is_starred boolean not null default false;

-- 별표만 수정할 수 있도록 컬럼 단위 권한과 본인 확인 정책을 함께 적용합니다.
grant update (is_starred) on public.saved_words to authenticated;

create policy "자기 단어장 별표 수정"
  on public.saved_words for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on column public.saved_words.is_starred is '빨리 외우기 위해 별표로 표시한 단어인지 여부';
