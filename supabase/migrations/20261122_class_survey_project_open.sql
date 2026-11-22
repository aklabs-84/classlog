-- 클래스룸 설문 목록: 프로젝트에서 시작(status='open')한 설문도 "진행 중"으로 보이게 한다.
-- 학생 쪽 판단(_survey_effective_open)과 같은 규칙. project_open=true 이면 화면은 종료 버튼 대신 안내 문구를 보여 준다.
drop function if exists public.teacher_class_project_surveys(uuid);

create function public.teacher_class_project_surveys(p_class_id uuid)
returns table(id uuid, title text, week_number integer, survey_phase text, is_open boolean, response_count bigint, scope text, project_open boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare c public.classes; v_project uuid;
begin
  select * into c from public.classes where classes.id = p_class_id and (classes.teacher_id = auth.uid() or classes.assigned_teacher_id = auth.uid());
  if not found then return; end if;
  select sp.parent_project_id into v_project from public.school_projects sp where sp.id = c.school_project_id;
  if v_project is null then return; end if;
  return query
    select f.id, f.title, f.week_number, f.survey_phase,
      (f.status = 'open') or exists (select 1 from public.survey_class_openings o where o.form_id = f.id and o.class_id = c.id and o.closed_at is null),
      (select count(*) from public.survey_responses r where r.form_id = f.id and r.class_id = c.id),
      case when f.target_class_id is not null then 'class' when f.school_id is not null then 'school' else 'common' end,
      (f.status = 'open')
    from public.survey_forms f
    where f.school_project_id = v_project
      and (f.school_id is null or f.school_id = c.school_project_id)
      and (f.target_class_id is null or f.target_class_id = c.id)
    order by f.week_number nulls last, f.created_at;
end $$;

revoke all on function public.teacher_class_project_surveys(uuid) from public, anon;
grant execute on function public.teacher_class_project_surveys(uuid) to authenticated;
