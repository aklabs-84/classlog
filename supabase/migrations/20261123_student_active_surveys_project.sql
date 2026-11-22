-- 학생 앱 "수업 끝 설문" 칸: 프로젝트에서 시작(status='open')한 설문도 우리 반 학생에게 보이게 한다.
-- 입출력 모양은 그대로(앱 코드 변경 없음). 기존 두 경로(반 설문 / 반별 열림 기록)는 조건을 건드리지 않는다.
-- 학교 일치 조건은 teacher_class_project_surveys 와 동일.
--
-- 되돌리기(이전 정의):
--   where f.class_id = v_class and f.status = 'open'
--      or exists (select 1 from public.survey_class_openings o where o.form_id = f.id and o.class_id = v_class and o.closed_at is null)
create or replace function public.student_active_surveys(p_token uuid)
returns table(id uuid, title text, pin_code text, status text, created_at timestamp with time zone)
language plpgsql stable security definer set search_path = ''
as $$
declare v_sid uuid; v_class uuid; v_school uuid; v_project uuid;
begin
  v_sid := public._student_from_token(p_token);
  if v_sid is null then return; end if;
  select s.class_id into v_class from public.students s where s.id = v_sid;
  select c.school_project_id, sp.parent_project_id into v_school, v_project
    from public.classes c left join public.school_projects sp on sp.id = c.school_project_id
    where c.id = v_class;
  return query
    select f.id, f.title, f.pin_code, 'open'::text, f.created_at from public.survey_forms f
    where (f.class_id = v_class and f.status = 'open')
       or exists (select 1 from public.survey_class_openings o where o.form_id = f.id and o.class_id = v_class and o.closed_at is null)
       or (v_project is not null and f.status = 'open' and f.school_project_id = v_project
           and (f.school_id is null or f.school_id = v_school)
           and (f.target_class_id is null or f.target_class_id = v_class))
    order by f.created_at desc;
end $$;
