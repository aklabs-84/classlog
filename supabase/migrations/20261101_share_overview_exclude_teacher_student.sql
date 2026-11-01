-- 학교 프로젝트 공유 화면: 학생 수·결과 수·최근 활동에서 담당 선생님 칸 제외
do $m$
declare d text; n text;
begin
  d := pg_get_functiondef('public.share_project_overview'::regproc);
  n := replace(d, 'from public.students s where s.class_id = any(v_cids);', 'from public.students s where s.class_id = any(v_cids) and s.registered_via is distinct from ''teacher'';');
  n := replace(n, '(select count(*) from public.students s where s.class_id = c.id)', '(select count(*) from public.students s where s.class_id = c.id and s.registered_via is distinct from ''teacher'')');
  n := replace(n, 'from public.student_results r join public.students s on s.id = r.student_id where s.class_id = c.id', 'from public.student_results r join public.students s on s.id = r.student_id where s.class_id = c.id and s.registered_via is distinct from ''teacher''');
  if n = d then raise exception 'replace failed'; end if;
  execute n;
end $m$;
