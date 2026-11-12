-- 학생이 처음 입장할 때 오늘 출석 자동 처리 (이름만/PIN 등 모든 입장 방식 공통)
-- 1) 시간표(시작·끝 시간)가 있는 반: 수업 날 + 시작 10분 전 ~ 끝난 뒤 30분 안에서만 출석
-- 2) 시간표가 없는 반: '오늘 수업 시작'이 눌려 있고 아직 끝나지 않았을 때만 출석
-- 3) 그 외: 출석 안 찍음. 선생님이 이미 정한 출석(결석·지각 등)은 덮어쓰지 않음
-- 선생님 미리보기 학생, 이름 없이 입장(common_anon)은 제외. 반환: marked / exists / outside / skip
create or replace function public.student_mark_present(p_token uuid, p_class_id uuid)
returns text language plpgsql security definer set search_path to '' as $$
declare
  v_sid uuid; v_home uuid; v_via text; v_c record;
  v_now timestamp := now() at time zone 'Asia/Seoul';
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_ok boolean := false; v_scheduled_today boolean; v_start timestamp; v_end timestamp; v_ins int;
begin
  v_sid := public._student_from_token(p_token);
  if v_sid is null then raise exception 'STUDENT_TOKEN_INVALID'; end if;
  select s.class_id, s.registered_via into v_home, v_via from public.students s where s.id = v_sid;
  if v_via = 'teacher' then return 'skip'; end if;

  select * into v_c from public.classes c
   where c.id = p_class_id and (c.id = v_home or c.linked_class_id = v_home);
  if not found then return 'skip'; end if;
  if v_c.entry_mode = 'common_anon' then return 'skip'; end if;
  if coalesce(v_c.is_closed,false) or coalesce(v_c.is_archived,false) then return 'skip'; end if;

  if v_c.class_start_time is not null and v_c.class_end_time is not null then
    -- 시간표 기준
    if v_c.schedule_mode = 'weekday' then
      v_scheduled_today := extract(dow from v_today)::int = any(coalesce(v_c.class_days_of_week::text[], '{}')::int[]);
    elsif v_c.schedule_mode = 'dates' then
      v_scheduled_today := v_today::text = any(coalesce(v_c.class_specific_dates::text[], '{}'));
    else
      v_scheduled_today := (v_c.start_date is null or v_today >= v_c.start_date)
                       and (v_c.end_date is null or v_today <= v_c.end_date);
    end if;
    v_start := v_today + v_c.class_start_time - interval '10 minutes';
    v_end   := v_today + v_c.class_end_time   + interval '30 minutes';
    v_ok := v_scheduled_today and v_now between v_start and v_end;
  else
    -- 시간표 없음: 오늘 수업 시작이 눌려 있고 끝나지 않은 동안
    v_ok := v_c.today_started_at is not null
        and (v_c.today_started_at at time zone 'Asia/Seoul')::date = v_today
        and (v_c.today_ended_at is null or v_c.today_ended_at < v_c.today_started_at);
  end if;
  if not v_ok then return 'outside'; end if;

  insert into public.attendance(class_id, student_id, date, status, teacher_id, marked_by, marked_at)
  values (p_class_id, v_sid, v_today, 'present', v_c.teacher_id, '입장 자동', now())
  on conflict (class_id, student_id, date) do nothing;
  get diagnostics v_ins = row_count;
  return case when v_ins > 0 then 'marked' else 'exists' end;
end $$;

revoke all on function public.student_mark_present(uuid, uuid) from public;
grant execute on function public.student_mark_present(uuid, uuid) to anon, authenticated;
