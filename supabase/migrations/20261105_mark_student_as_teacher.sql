-- 반 주인(또는 담당) 선생님이 학생 목록에서 "이 사람은 선생님(임시 참여자)"으로 직접 분류/해제.
-- 선생님으로 분류된 칸(registered_via='teacher')은 일반 조회 규칙에서 숨겨져 있으므로 전용 함수로 다룬다.
create or replace function public.set_student_teacher_flag(p_student_id uuid, p_is_teacher boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_class uuid;
begin
  select class_id into v_class from public.students where id = p_student_id;
  if v_class is null then raise exception 'not found'; end if;
  if not exists (select 1 from public.classes c where c.id = v_class
                 and (c.teacher_id = auth.uid() or c.assigned_teacher_id = auth.uid())) then
    raise exception 'forbidden';
  end if;
  update public.students
     set registered_via = case when p_is_teacher then 'teacher' else 'teacher_roster' end
   where id = p_student_id;
end $$;

create or replace function public.list_temp_participants(p_class_id uuid)
returns table(id uuid, full_name text) language sql security definer set search_path = public stable as $$
  select s.id, s.full_name from public.students s
   where s.class_id = p_class_id and s.registered_via = 'teacher'
     and exists (select 1 from public.classes c where c.id = p_class_id
                 and (c.teacher_id = auth.uid() or c.assigned_teacher_id = auth.uid()))
   order by s.full_name;
$$;

create or replace function public.delete_temp_participant(p_student_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_class uuid;
begin
  select class_id into v_class from public.students where id = p_student_id and registered_via = 'teacher';
  if v_class is null then raise exception 'not found'; end if;
  if not exists (select 1 from public.classes c where c.id = v_class
                 and (c.teacher_id = auth.uid() or c.assigned_teacher_id = auth.uid())) then
    raise exception 'forbidden';
  end if;
  delete from public.students where id = p_student_id;
end $$;

revoke all on function public.set_student_teacher_flag(uuid, boolean) from public, anon;
revoke all on function public.list_temp_participants(uuid) from public, anon;
revoke all on function public.delete_temp_participant(uuid) from public, anon;
grant execute on function public.set_student_teacher_flag(uuid, boolean) to authenticated;
grant execute on function public.list_temp_participants(uuid) to authenticated;
grant execute on function public.delete_temp_participant(uuid) to authenticated;
