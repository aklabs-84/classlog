-- 아이스브레이킹 단계가 추가되어 화면이 0~4 (5개)가 됨
alter table public.studio_progress drop constraint if exists studio_progress_page_check;
alter table public.studio_progress add constraint studio_progress_page_check check (page between 0 and 4);
