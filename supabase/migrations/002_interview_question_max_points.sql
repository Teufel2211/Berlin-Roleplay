alter table public.eghr_interview_questions
  add column if not exists max_points numeric not null default 2;
