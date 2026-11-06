-- 학교를 통째로 다른 학교 프로젝트로 옮기기 (이름표 parent_project_id 교체).
-- 내 프로젝트 → 내 프로젝트만 가능. 반의 '과정' 표시는 옛 프로젝트 것이라 비운다.
create or replace function public.move_school_to_project(p_school_id uuid, p_target_project_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_parent uuid;
begin
  select parent_project_id into v_parent from public.school_projects
   where id = p_school_id and admin_id = auth.uid() and parent_project_id is not null;
  if not found then raise exception 'forbidden'; end if;
  if v_parent = p_target_project_id then raise exception 'same project'; end if;
  if not exists (select 1 from public.school_projects
                  where id = p_target_project_id and admin_id = auth.uid() and parent_project_id is null) then
    raise exception 'forbidden target';
  end if;
  update public.school_projects set parent_project_id = p_target_project_id where id = p_school_id;
  update public.classes set course_id = null where school_project_id = p_school_id and course_id is not null;
end $$;
revoke all on function public.move_school_to_project(uuid, uuid) from public, anon;
grant execute on function public.move_school_to_project(uuid, uuid) to authenticated;
