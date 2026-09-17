-- 사용자별 Day 학습 완료 기록입니다. 재학습해도 최초 완료 시각을 유지합니다.
create table public.completed_study_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day_id text not null check (day_id ~ '^day(0[1-9]|1[0-9]|20)$'),
  completed_at timestamptz not null default now(),
  primary key (user_id, day_id)
);

comment on table public.completed_study_days is '마지막 단어까지 확인하고 학습을 마친 Day 기록';
comment on column public.completed_study_days.completed_at is '최초 학습 완료 시각';

alter table public.completed_study_days enable row level security;
revoke all on table public.completed_study_days from anon, authenticated;
grant select, insert on table public.completed_study_days to authenticated;

create policy "자기 학습 완료 조회"
  on public.completed_study_days for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "자기 학습 완료 저장"
  on public.completed_study_days for insert to authenticated
  with check ((select auth.uid()) = user_id);
