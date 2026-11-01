-- 선생님 공유 화면: 담당 선생님 미리보기용 학생 칸(registered_via='teacher')을 명단·결과에서 제외
do $m$
declare d text; n text;
begin
  d := pg_get_functiondef('public._share_class_payload'::regproc);
  n := replace(d, 'from public.students s where s.class_id = p_class_id;', 'from public.students s where s.class_id = p_class_id and s.registered_via is distinct from ''teacher'';');
  n := replace(n, 'from public.students s where s.class_id = p_class_id), ''[]''::jsonb)', 'from public.students s where s.class_id = p_class_id and s.registered_via is distinct from ''teacher''), ''[]''::jsonb)');
  if n = d or position('distinct from ''teacher''' in n) = 0 then raise exception 'replace failed'; end if;
  execute n;
end $m$;
