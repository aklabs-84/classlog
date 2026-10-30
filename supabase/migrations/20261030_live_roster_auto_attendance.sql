-- 현장 입력(live_roster) 방식: 수락/늦은 입장 시 오늘 출석 자동 + 오늘 수업 시작 자동
-- 이미 기록된 출석(결석·지각 등)은 덮어쓰지 않고, 수업 시작이 이미 눌려 있으면 건드리지 않는다.

create or replace function public.live_roster_accept(p_class_id uuid)
returns integer language plpgsql security definer set search_path to '' as $$
declare v_home uuid; v_ins int; v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  select coalesce(c.linked_class_id, c.id) into v_home from public.classes c
   where c.id = p_class_id and (c.teacher_id = auth.uid() or c.assigned_teacher_id = auth.uid());
  if auth.uid() is null or v_home is null then raise exception 'NOT_CLASS_TEACHER'; end if;
  with ins as (
    insert into public.students(class_id, full_name, student_number, registered_via)
    select v_home, r.full_name, nullif(r.student_number,''), 'self_signup'
    from public.class_roster_requests r
    where r.class_id = p_class_id
      and not exists (select 1 from public.students s where s.class_id = v_home
          and s.full_name = r.full_name and coalesce(s.student_number,'') = r.student_number)
    returning 1)
  select count(*) into v_ins from ins;

  -- 수락된 학생 전원 오늘 출석 (이미 기록이 있으면 그대로 둠)
  insert into public.attendance(class_id, student_id, date, status, teacher_id, marked_by, marked_at)
  select p_class_id, s.id, v_today, 'present', auth.uid(), '입장 자동', now()
  from public.class_roster_requests r
  join public.students s on s.class_id = v_home and s.full_name = r.full_name
       and coalesce(s.student_number,'') = r.student_number
  where r.class_id = p_class_id
  on conflict (class_id, student_id, date) do nothing;

  delete from public.class_roster_requests where class_id = p_class_id;
  update public.classes set live_roster_accepted = true, allow_self_signup = true where id = p_class_id;

  -- 오늘 수업 시작이 안 눌려 있으면 자동으로 시작
  update public.classes set today_started_at = now(), today_ended_at = null
   where id = p_class_id
     and (today_started_at is null or (today_started_at at time zone 'Asia/Seoul')::date <> v_today);
  return v_ins;
end $$;

create or replace function public.self_register_student(p_entry_code text, p_full_name text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_class record; v_target_class_id uuid; v_student_id uuid;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if p_full_name is null or length(trim(p_full_name)) = 0 then raise exception 'INVALID_NAME'; end if;
  select * into v_class from public.classes where entry_code = p_entry_code;
  if not found then raise exception 'CLASS_NOT_FOUND'; end if;
  if v_class.allow_self_signup is not true then raise exception 'SELF_SIGNUP_DISABLED'; end if;
  v_target_class_id := coalesce(v_class.linked_class_id, v_class.id);
  insert into public.students (class_id, full_name, registered_via)
  values (v_target_class_id, trim(p_full_name), 'self_signup')
  returning id into v_student_id;

  -- 현장 입력 방식 반의 늦은 입장: 오늘 출석 + 수업 시작 자동
  if v_class.entry_mode = 'live_roster' then
    insert into public.attendance(class_id, student_id, date, status, teacher_id, marked_by, marked_at)
    values (v_class.id, v_student_id, v_today, 'present', v_class.teacher_id, '입장 자동', now())
    on conflict (class_id, student_id, date) do nothing;
    update public.classes set today_started_at = now(), today_ended_at = null
     where id = v_class.id
       and (today_started_at is null or (today_started_at at time zone 'Asia/Seoul')::date <> v_today);
  end if;
  return v_student_id;
end $$;
