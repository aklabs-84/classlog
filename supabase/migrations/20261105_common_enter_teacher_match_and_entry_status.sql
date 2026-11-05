-- 1) 이름으로 입장할 때, 선생님(임시 참여자)으로 분류된 같은 이름이 있으면 그 칸으로 입장시킨다
--    (없으면 기존처럼 일반 학생 칸에서 찾고, 그래도 없으면 새로 만든다)
do $m$
declare d text; n text;
begin
  d := pg_get_functiondef('public.common_enter'::regproc);
  n := replace(d,
    E'  select s.id into v_sid from public.students s\n    where s.class_id = v_home and s.registered_via = ''common'' and s.full_name = v_name limit 1;',
    E'  select s.id into v_sid from public.students s\n    where s.class_id = v_home and s.registered_via = ''teacher'' and s.full_name = v_name limit 1;\n  if v_sid is null then\n    select s.id into v_sid from public.students s\n      where s.class_id = v_home and s.registered_via = ''common'' and s.full_name = v_name limit 1;\n  end if;');
  if n = d then raise exception 'replace failed'; end if;
  execute n;
end $m$;

-- 2) 선생님용: 학생별 마지막 입장 시각 (입장 표를 발급한 시각, 표는 7일 보관). 요청은 목록 불러올 때 1번만.
create or replace function public.class_entry_status(p_class_id uuid)
returns table(student_id uuid, last_entry timestamptz)
language sql security definer set search_path = public stable as $$
  select ss.student_id, max(ss.created_at)
    from public.student_sessions ss
    join public.students s on s.id = ss.student_id
   where s.class_id = p_class_id
     and exists (select 1 from public.classes c where c.id = p_class_id
                 and (c.teacher_id = auth.uid() or c.assigned_teacher_id = auth.uid()))
   group by ss.student_id;
$$;
revoke all on function public.class_entry_status(uuid) from public, anon;
grant execute on function public.class_entry_status(uuid) to authenticated;
