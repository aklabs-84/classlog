-- 수업 시간에 맞춰 퀴즈 대기실 자동 열기 / 종료 시각에 자동 닫기 (2026-10-12)
-- 이미 운영 DB에 적용 완료. 다시 만들 때 참고용.
-- 마이그레이션: auto_open_close_class_quiz, auto_quiz_assigned_teacher_support
-- 전제: 기존 class_alarm_scan 크론(1분마다 run_class_alarm_scan 실행), fire_class_alarm 함수

-- 1) 열 추가
alter table public.classes
  add column if not exists auto_quiz_set_id uuid references public.quiz_sets(id) on delete set null;
alter table public.quiz_sessions
  add column if not exists auto_created boolean not null default false;

-- 2) 대기실 자동 열기 (하루 1회, 이미 열린 세션이 있으면 건너뜀, 소유자는 배정 강사 우선)
CREATE OR REPLACE FUNCTION public.open_auto_quiz(p_class_id uuid, p_linked_class_id uuid, p_teacher_id uuid, p_quiz_set_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_session_class uuid := coalesce(p_linked_class_id, p_class_id);
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_first_timer integer;
  v_pin text;
  v_try integer := 0;
  v_owner uuid;
begin
  select coalesce(c.assigned_teacher_id, p_teacher_id) into v_owner
  from public.classes c where c.id = p_class_id;
  v_owner := coalesce(v_owner, p_teacher_id);

  select coalesce(q.time_limit, 20) into v_first_timer
  from public.quiz_questions q
  where q.quiz_set_id = p_quiz_set_id
  order by q.order_index asc
  limit 1;
  if not found then return; end if;

  if exists (
    select 1 from public.quiz_sessions s
    where s.class_id = v_session_class and s.state <> 'FINAL'
      and (s.created_at at time zone 'Asia/Seoul')::date = v_today
  ) then return; end if;

  if exists (
    select 1 from public.quiz_sessions s
    where s.class_id = v_session_class and s.auto_created
      and (s.created_at at time zone 'Asia/Seoul')::date = v_today
  ) then return; end if;

  loop
    v_pin := (floor(100000 + random() * 900000))::int::text;
    exit when not exists (select 1 from public.quiz_sessions where pin_code = v_pin);
    v_try := v_try + 1;
    if v_try > 20 then return; end if;
  end loop;

  insert into public.quiz_sessions (quiz_set_id, teacher_id, class_id, pin_code, state, current_question_index, max_timer, auto_created)
  values (p_quiz_set_id, v_owner, v_session_class, v_pin, 'LOBBY', 0, v_first_timer, true);
end;
$function$;

-- 3) 자동으로 열린 세션만 종료 시각(또는 날짜가 바뀌면) 닫기
CREATE OR REPLACE FUNCTION public.close_auto_quizzes()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_kst timestamp := (now() at time zone 'Asia/Seoul');
begin
  update public.quiz_sessions s
  set state = 'FINAL', updated_at = now()
  where s.auto_created and s.state <> 'FINAL'
    and (
      (s.created_at at time zone 'Asia/Seoul')::date < v_kst::date
      or exists (
        select 1 from public.classes c
        where c.auto_quiz_set_id = s.quiz_set_id
          and coalesce(c.linked_class_id, c.id) = s.class_id
          and c.class_end_time is not null
          and v_kst::time >= c.class_end_time
      )
    );
end;
$function$;

revoke execute on function public.open_auto_quiz(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.close_auto_quizzes() from public, anon, authenticated;

-- 4) 배정 강사가 지정된 공통 퀴즈를 읽기만 할 수 있게
create policy "assigned teachers read designated quiz set" on public.quiz_sets
  for select using (exists (
    select 1 from public.classes c
    where c.auto_quiz_set_id = quiz_sets.id and c.assigned_teacher_id = auth.uid()));

create policy "assigned teachers read designated quiz questions" on public.quiz_questions
  for select using (exists (
    select 1 from public.classes c
    where c.auto_quiz_set_id = quiz_questions.quiz_set_id and c.assigned_teacher_id = auth.uid()));

-- 5) run_class_alarm_scan 변경점 (전체 함수는 운영 DB 참고)
--   - 반 조회 select에 auto_quiz_set_id, linked_class_id 추가
--   - 시작 알림 발송(fire_class_alarm) 직후, auto_quiz_set_id가 있으면
--       begin perform public.open_auto_quiz(cls.id, cls.linked_class_id, cls.teacher_id, cls.auto_quiz_set_id);
--       exception when others then null; end;
--   - 반 반복문이 끝난 뒤 begin perform public.close_auto_quizzes(); exception when others then null; end;
-- 주의: 반의 수업 기간(start_date~end_date)과 수업 날짜(요일/지정일)에 오늘이 들어 있어야 열림.
