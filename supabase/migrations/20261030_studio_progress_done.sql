-- 어느 앱이든 "끝났다"를 직접 알릴 수 있게 한다 (기존 스튜디오는 4번 화면 제출 = 끝으로 계속 인정)
alter table public.studio_progress add column if not exists done boolean not null default false;
update public.studio_progress set done = true where 4 = any(submitted_pages);
