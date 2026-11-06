-- 직접 입장 등록: 같은 반에 같은 이름이 이미 있으면 새로 만들지 않고 막는다.
-- (같은 이름 학생이 2명이면 도구 제출이 STUDENT_NOT_FOUND 로 막히던 문제 예방)
-- 그 밖의 동작은 20261030_live_roster_auto_attendance.sql 의 함수와 같다.
create or replace function public.self_register_student(p_entry_code text, p_full_name text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_class record; v_target_class_id uuid; v_student_id uuid;
  v_name text := trim(p_full_name);
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if p_full_name is null or length(v_name) = 0 then raise exception 'INVALID_NAME'; end if;
  select * into v_class from public.classes where entry_code = p_entry_code;
  if not found then raise exception 'CLASS_NOT_FOUND'; end if;
  if v_class.allow_self_signup is not true then raise exception 'SELF_SIGNUP_DISABLED'; end if;
  v_target_class_id := coalesce(v_class.linked_class_id, v_class.id);

  -- 같은 이름이 이미 있으면 막는다 (앞뒤 공백 무시)
  if exists (
    select 1 from public.students
     where class_id = v_target_class_id and trim(full_name) = v_name
  ) then
    raise exception 'NAME_ALREADY_EXISTS';
  end if;

  insert into public.students (class_id, full_name, registered_via)
  values (v_target_class_id, v_name, 'self_signup')
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
