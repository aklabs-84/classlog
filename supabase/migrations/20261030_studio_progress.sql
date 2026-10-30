-- 바이브코딩 스튜디오 진행 현황: 학생 한 명당 한 줄을 계속 덮어쓴다. (쌓이지 않음)
-- 서버(service role)만 읽고 쓴다. 정책을 만들지 않아 브라우저에서는 접근할 수 없다.
create table if not exists public.studio_progress (
  student_id uuid primary key references public.students(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  team_name text,
  page smallint not null default 0 check (page between 0 and 3),
  page_label text,
  step_no smallint,
  step_total smallint,
  step_label text,
  completed_pages smallint[] not null default '{}',
  submitted_pages smallint[] not null default '{}',
  online boolean not null default true,
  last_seen timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists studio_progress_class_idx on public.studio_progress (class_id);

alter table public.studio_progress enable row level security;
