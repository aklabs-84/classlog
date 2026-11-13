-- AI 연결(MCP) 쓰기 도구 1묶음: 반 · 주차 · 공지 · 자료 · 폴더 (학생 정보 제외, 지우기 없음)
-- 모든 함수: 열쇠 지문(p_hash)으로 주인을 확인하고, 건드리는 id가 모두 그 주인 것인지 확인한다.
-- service_role(= mcp 함수)만 실행 가능. 반 개수 제한 등은 기존 DB 트리거가 그대로 지킨다.

-- 공통: 열쇠 주인 확인 (없으면 오류)
create or replace function public._mcp_need_teacher(p_hash text)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v uuid := public._mcp_teacher(p_hash);
begin
  if v is null then raise exception 'invalid_token'; end if;
  return v;
end $$;

-- 새 반 만들기
create or replace function public.mcp_create_class(
  p_hash text, p_name text, p_subject text default '', p_class_type text default 'subject',
  p_start date default null, p_end date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_t uuid := public._mcp_need_teacher(p_hash);
  v_name text := left(btrim(coalesce(p_name, '')), 60);
  v_type text := coalesce(p_class_type, 'subject');
  v_code text; v_id uuid; v_try int := 0;
begin
  if v_name = '' then raise exception 'name_required'; end if;
  if v_type not in ('subject', 'homeroom') then raise exception 'invalid_class_type'; end if;
  if p_start is not null and p_end is not null and p_end < p_start then raise exception 'invalid_dates'; end if;
  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from classes where entry_code = v_code);
    v_try := v_try + 1;
    if v_try > 10 then raise exception 'code_generation_failed'; end if;
  end loop;
  insert into classes (teacher_id, name, subject, class_type, entry_code, start_date, end_date)
  values (v_t, v_name,
          case when v_type = 'homeroom' then '담임' else left(btrim(coalesce(p_subject, '')), 40) end,
          v_type, v_code, p_start, p_end)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'name', v_name, 'entry_code', v_code);
end $$;

-- 반 고치기: 이름 · 과목 · 종료/다시 열기 (지우기 아님)
create or replace function public.mcp_update_class(
  p_hash text, p_id uuid, p_name text default null, p_subject text default null, p_closed boolean default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_t uuid := public._mcp_need_teacher(p_hash); c classes%rowtype;
begin
  select * into c from classes where id = p_id and teacher_id = v_t;
  if not found then raise exception 'not_found'; end if;
  if c.is_demo or c.school_project_id is not null or c.parent_class_id is not null then
    raise exception 'protected_class';
  end if;
  if p_name is not null and btrim(p_name) = '' then raise exception 'name_required'; end if;
  update classes set
    name = coalesce(left(btrim(p_name), 60), name),
    subject = case when class_type = 'homeroom' then subject else coalesce(left(btrim(p_subject), 40), subject) end,
    is_closed = coalesce(p_closed, is_closed)
  where id = p_id;
  return jsonb_build_object('id', p_id, 'ok', true);
end $$;

-- 주차(차시) 하나 추가: 끝에 붙이고, 자료 연결은 선택(자료는 복사하지 않고 가리키기만)
create or replace function public.mcp_add_week(
  p_hash text, p_class uuid, p_topic text, p_url text default '', p_material uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_t uuid := public._mcp_need_teacher(p_hash); c classes%rowtype; v_next int; v_item jsonb;
begin
  select * into c from classes where id = p_class and teacher_id = v_t;
  if not found then raise exception 'not_found'; end if;
  if c.parent_class_id is not null or c.is_demo then raise exception 'protected_class'; end if;
  if p_topic is null or btrim(p_topic) = '' then raise exception 'topic_required'; end if;
  if p_url is not null and p_url <> '' and p_url !~* '^https?://' then raise exception 'invalid_url'; end if;
  if p_material is not null and not exists
     (select 1 from class_materials m where m.id = p_material and m.teacher_id = v_t and m.class_id is null) then
    raise exception 'material_not_found';
  end if;
  select coalesce(max((e->>'week')::int), 0) + 1 into v_next from jsonb_array_elements(coalesce(c.weekly_plan, '[]'::jsonb)) e;
  if v_next > 60 then raise exception 'too_many_weeks'; end if;
  v_item := jsonb_build_object('week', v_next, 'topic', left(btrim(p_topic), 200), 'url', coalesce(p_url, ''),
            'requires_result', false, 'requires_activity', false)
            || case when p_material is not null then jsonb_build_object('material_id', p_material) else '{}'::jsonb end;
  update classes set weekly_plan = coalesce(weekly_plan, '[]'::jsonb) || jsonb_build_array(v_item) where id = p_class;
  return jsonb_build_object('class_id', p_class, 'week', v_next);
end $$;

-- 이미 있는 주차에 자료 연결(바꾸기)
create or replace function public.mcp_link_material_to_week(p_hash text, p_class uuid, p_week int, p_material uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_t uuid := public._mcp_need_teacher(p_hash); c classes%rowtype;
begin
  select * into c from classes where id = p_class and teacher_id = v_t;
  if not found then raise exception 'not_found'; end if;
  if c.parent_class_id is not null or c.is_demo then raise exception 'protected_class'; end if;
  if not exists (select 1 from class_materials m where m.id = p_material and m.teacher_id = v_t and m.class_id is null) then
    raise exception 'material_not_found';
  end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(c.weekly_plan, '[]'::jsonb)) e where (e->>'week') = p_week::text) then
    raise exception 'week_not_found';
  end if;
  update classes set weekly_plan = (
    select coalesce(jsonb_agg(case when (e->>'week') = p_week::text then e || jsonb_build_object('material_id', p_material) else e end order by ord), '[]'::jsonb)
    from jsonb_array_elements(c.weekly_plan) with ordinality t(e, ord)
  ) where id = p_class;
  return jsonb_build_object('class_id', p_class, 'week', p_week, 'material_id', p_material);
end $$;

-- 공지
create or replace function public.mcp_create_announcement(
  p_hash text, p_class uuid, p_title text, p_content text default '', p_pinned boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_t uuid := public._mcp_need_teacher(p_hash); v_id uuid;
begin
  if not exists (select 1 from classes where id = p_class and teacher_id = v_t) then raise exception 'not_found'; end if;
  if p_title is null or btrim(p_title) = '' then raise exception 'title_required'; end if;
  insert into class_announcements (class_id, teacher_id, title, content, is_pinned)
  values (p_class, v_t, left(btrim(p_title), 100), left(coalesce(p_content, ''), 5000), coalesce(p_pinned, false))
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.mcp_update_announcement(
  p_hash text, p_id uuid, p_title text default null, p_content text default null,
  p_pinned boolean default null, p_visible boolean default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_t uuid := public._mcp_need_teacher(p_hash);
begin
  if not exists (select 1 from class_announcements a join classes c on c.id = a.class_id
                  where a.id = p_id and c.teacher_id = v_t) then raise exception 'not_found'; end if;
  if p_title is not null and btrim(p_title) = '' then raise exception 'title_required'; end if;
  update class_announcements set
    title = coalesce(left(btrim(p_title), 100), title),
    content = coalesce(left(p_content, 5000), content),
    is_pinned = coalesce(p_pinned, is_pinned),
    is_visible = coalesce(p_visible, is_visible)
  where id = p_id;
  return jsonb_build_object('id', p_id, 'ok', true);
end $$;

-- 자료 폴더
create or replace function public.mcp_create_folder(p_hash text, p_name text, p_parent uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_t uuid := public._mcp_need_teacher(p_hash); v_id uuid;
begin
  if p_name is null or btrim(p_name) = '' then raise exception 'name_required'; end if;
  if p_parent is not null and not exists (select 1 from material_folders where id = p_parent and teacher_id = v_t) then
    raise exception 'not_found';
  end if;
  insert into material_folders (teacher_id, name, parent_id) values (v_t, left(btrim(p_name), 60), p_parent)
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.mcp_rename_folder(p_hash text, p_id uuid, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_t uuid := public._mcp_need_teacher(p_hash);
begin
  if p_name is null or btrim(p_name) = '' then raise exception 'name_required'; end if;
  update material_folders set name = left(btrim(p_name), 60) where id = p_id and teacher_id = v_t;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('id', p_id, 'ok', true);
end $$;

-- 수업 자료 (선생님 자료실용: 반에 묶이지 않음, 학생에게 공개하지 않은 상태로 만든다)
create or replace function public.mcp_create_material(
  p_hash text, p_title text, p_content text default '', p_folder uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_t uuid := public._mcp_need_teacher(p_hash); v_id uuid;
begin
  if p_title is null or btrim(p_title) = '' then raise exception 'title_required'; end if;
  if length(coalesce(p_content, '')) > 200000 then raise exception 'content_too_long'; end if;
  if p_folder is not null and not exists (select 1 from material_folders where id = p_folder and teacher_id = v_t) then
    raise exception 'not_found';
  end if;
  insert into class_materials (teacher_id, class_id, week_number, title, content, is_published, folder_id)
  values (v_t, null, 1, left(btrim(p_title), 100), coalesce(p_content, ''), false, p_folder)
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

-- 자료 고치기: 제목·본문·폴더만 (공개 여부는 선생님이 클래스로그AI에서 직접)
create or replace function public.mcp_update_material(
  p_hash text, p_id uuid, p_title text default null, p_content text default null, p_folder uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_t uuid := public._mcp_need_teacher(p_hash);
begin
  if not exists (select 1 from class_materials where id = p_id and teacher_id = v_t) then raise exception 'not_found'; end if;
  if p_title is not null and btrim(p_title) = '' then raise exception 'title_required'; end if;
  if p_content is not null and length(p_content) > 200000 then raise exception 'content_too_long'; end if;
  if p_folder is not null and not exists (select 1 from material_folders where id = p_folder and teacher_id = v_t) then
    raise exception 'not_found';
  end if;
  update class_materials set
    title = coalesce(left(btrim(p_title), 100), title),
    content = coalesce(p_content, content),
    folder_id = coalesce(p_folder, folder_id)
  where id = p_id;
  return jsonb_build_object('id', p_id, 'ok', true);
end $$;

-- 수업도구 학생 공개 켜고 끄기: 이미 반에 연결된 도구만
create or replace function public.mcp_set_class_tool(p_hash text, p_class uuid, p_tool_id text, p_published boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_t uuid := public._mcp_need_teacher(p_hash);
begin
  if not exists (select 1 from classes where id = p_class and teacher_id = v_t) then raise exception 'not_found'; end if;
  update class_enabled_tools set is_published = coalesce(p_published, false), updated_at = now()
   where class_id = p_class and tool_id = p_tool_id;
  if not found then raise exception 'tool_not_found'; end if;
  return jsonb_build_object('class_id', p_class, 'tool_id', p_tool_id, 'is_published', coalesce(p_published, false));
end $$;

-- 보기: 반의 수업도구 목록 (켜고 끄기 전에 AI가 id를 알 수 있게)
create or replace function public.mcp_list_class_tools(p_hash text, p_class uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_t uuid := public._mcp_need_teacher(p_hash);
begin
  if not exists (select 1 from classes where id = p_class and teacher_id = v_t) then raise exception 'not_found'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('tool_id', tool_id, 'is_published', is_published) order by tool_id)
                     from class_enabled_tools where class_id = p_class), '[]'::jsonb);
end $$;

-- 실행 권한: service_role 전용
do $$
declare f text;
begin
  foreach f in array array[
    '_mcp_need_teacher(text)',
    'mcp_create_class(text,text,text,text,date,date)',
    'mcp_update_class(text,uuid,text,text,boolean)',
    'mcp_add_week(text,uuid,text,text,uuid)',
    'mcp_link_material_to_week(text,uuid,int,uuid)',
    'mcp_create_announcement(text,uuid,text,text,boolean)',
    'mcp_update_announcement(text,uuid,text,text,boolean,boolean)',
    'mcp_create_folder(text,text,uuid)',
    'mcp_rename_folder(text,uuid,text)',
    'mcp_create_material(text,text,text,uuid)',
    'mcp_update_material(text,uuid,text,text,uuid)',
    'mcp_set_class_tool(text,uuid,text,boolean)',
    'mcp_list_class_tools(text,uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
