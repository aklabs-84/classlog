-- 보조강사 링크에서 현장 학생 추가(임시 등록) 허용 스위치. 기본은 꺼짐.
alter table public.class_gallery_upload_keys
  add column if not exists allow_student_add boolean not null default false;
