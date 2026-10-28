-- 학생 화면 자동 새로고침 egress 절감: 자료 전체 대신 지문(md5)만 먼저 확인 (이미 적용됨)
create or replace function public.student_class_content_hash(p_token uuid, p_plan_ids uuid[] default '{}'::uuid[])
returns text
language sql
stable
security definer
set search_path to ''
as $$
  select md5(public.student_class_content(p_token, p_plan_ids)::text)
$$;
revoke all on function public.student_class_content_hash(uuid, uuid[]) from public;
grant execute on function public.student_class_content_hash(uuid, uuid[]) to anon, authenticated;
