-- AI 연결(MCP) 학교 프로젝트 B단계: 프로젝트 틀 만들기 + 학교·반 구조 읽기 + 설문 목록에 소속 표시
-- 원칙
--  * 모두 service_role 전용(화면에서 직접 호출 불가).
--  * 공유 링크 열쇠(share_token)·입장 코드(entry_code)는 어떤 기능도 돌려주지 않는다.
--  * 만들기는 '프로젝트 틀 + 사업 전체 반'만(앱에서 만들 때와 똑같은 모양). 학교·반 추가, 초대, 공유는 앱에서.
--  * 읽기는 학생 이름 없이 학생 수·응답 건수 같은 숫자만.

-- ───────── 프로젝트 틀 만들기 ─────────
create or replace function public.mcp_create_school_project(p_hash text, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_t uuid := public._mcp_need_teacher(p_hash);
  v_name text := left(btrim(coalesce(p_name, '')), 60);
  v_pid uuid; v_cid uuid; v_code text; v_try int;
begin
  if v_name = '' then raise exception 'name_required'; end if;
  -- 남용 방지: 한 선생님이 만든 프로젝트 최대 30개
  if (select count(*) from school_projects where admin_id = v_t and parent_project_id is null) >= 30 then
    raise exception 'too_many_projects';
  end if;
  -- 프로젝트 입장 코드 (겹치지 않게)
  v_try := 0;
  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from school_projects where entry_code = v_code);
    v_try := v_try + 1;
    if v_try > 10 then raise exception 'code_generation_failed'; end if;
  end loop;
  insert into school_projects (name, admin_id, banner_color, entry_code)
  values (v_name, v_t, 'violet', v_code) returning id into v_pid;
  -- 사업 전체 반 (앱과 동일)
  v_try := 0;
  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from classes where entry_code = v_code);
    v_try := v_try + 1;
    if v_try > 10 then raise exception 'code_generation_failed'; end if;
  end loop;
  insert into classes (name, subject, teacher_id, entry_code, school_project_id)
  values (left(v_name || ' (사업 전체)', 80), v_name, v_t, v_code, v_pid) returning id into v_cid;
  return jsonb_build_object('id', v_pid, 'name', v_name, 'root_class_id', v_cid);
end $$;

-- ───────── 프로젝트 목록: 사업(project)과 학교(school) 구분 표시 ─────────
create or replace function public.mcp_list_school_projects(p_hash text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_t uuid := public._mcp_need_teacher(p_hash);
begin
  return coalesce((select jsonb_agg(r) from (
    select p.id, p.name, p.school_name, p.status, p.start_date, p.end_date, p.parent_project_id,
           case when p.parent_project_id is null then 'project' else 'school' end as kind,
           (select count(*) from school_project_classes pc where pc.project_id = p.id) as classes
    from school_projects p
    where p.admin_id = v_t
       or exists (select 1 from school_project_classes pc where pc.project_id = p.id and pc.teacher_id = v_t)
    order by p.created_at desc limit 50) r), '[]'::jsonb);
end $$;

-- ───────── 프로젝트 한 건: 학교 → 반 구조 + 설문 요약 (열쇠·코드·학생 이름 없음) ─────────
create or replace function public.mcp_get_school_project(p_hash text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_t uuid := public._mcp_need_teacher(p_hash); p school_projects%rowtype; v_ids uuid[];
begin
  select * into p from school_projects where id = p_id
    and (admin_id = v_t or exists (select 1 from school_project_classes pc where pc.project_id = p_id and pc.teacher_id = v_t));
  if not found then raise exception 'not_found'; end if;
  -- 본인이 관리하는 사업이면 그 아래 학교까지, 아니면 이 항목만
  if p.admin_id = v_t then
    select array_agg(id) into v_ids from (select p_id as id union all select id from school_projects where parent_project_id = p_id) x;
  else
    v_ids := array[p_id];
  end if;
  return jsonb_build_object(
    'id', p.id, 'name', p.name, 'school_name', p.school_name, 'status', p.status,
    'start_date', p.start_date, 'end_date', p.end_date, 'region', p.region,
    'kind', case when p.parent_project_id is null then 'project' else 'school' end,
    'schools', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'status', s.status, 'start_date', s.start_date, 'end_date', s.end_date,
        'classes', coalesce((select jsonb_agg(jsonb_build_object(
            'id', c.id, 'name', c.name, 'is_root', c.parent_class_id is null,
            'course', (select k.name from school_project_courses k where k.id = c.course_id),
            'student_count', (select count(*) from students st where st.class_id = c.id)
          ) order by c.parent_class_id nulls first, c.created_at)
          from classes c where c.school_project_id = s.id), '[]'::jsonb)
      ) order by s.created_at) from school_projects s where s.parent_project_id = p_id and p.admin_id = v_t), '[]'::jsonb),
    'root_classes', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name)) from classes c
        where c.school_project_id = p_id and c.parent_class_id is null), '[]'::jsonb),
    'surveys', coalesce((select jsonb_agg(jsonb_build_object(
        'id', f.id, 'title', f.title, 'status', f.status, 'survey_phase', f.survey_phase,
        'school_project_id', f.school_project_id,
        'responses', (select count(*) from survey_responses r where r.form_id = f.id)
      ) order by f.created_at desc) from survey_forms f
        where f.school_project_id = any (v_ids) and f.teacher_id = v_t), '[]'::jsonb)
  );
end $$;

-- ───────── 설문 목록에 소속 학교 프로젝트 표시 ─────────
create or replace function public.mcp_list_surveys(p_hash text, p_limit int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_t uuid := public._mcp_need_teacher(p_hash);
begin
  return coalesce((select jsonb_agg(r) from (
    select f.id, f.title, f.status, f.is_anonymous, f.class_id, f.school_project_id, f.survey_phase, f.created_at,
           (select count(*) from survey_questions q where q.form_id = f.id) as questions,
           (select count(*) from survey_responses s where s.form_id = f.id) as responses
    from survey_forms f where f.teacher_id = v_t
    order by f.created_at desc limit least(greatest(p_limit,1),100)) r), '[]'::jsonb);
end $$;

-- ───────── 권한 ─────────
do $$
declare fn text;
begin
  foreach fn in array array['mcp_create_school_project(text,text)','mcp_get_school_project(text,uuid)',
                            'mcp_list_school_projects(text)','mcp_list_surveys(text,int)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;
