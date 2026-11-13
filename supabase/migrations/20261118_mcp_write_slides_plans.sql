-- AI 연결(MCP) ③: 슬라이드 · 수업계획서 만들기/고치기
-- 규칙: 열쇠 주인 것만. 슬라이드는 글상자(text)만 허용(그림·유튜브·링크 없음), 공유는 항상 꺼진 채로.
-- 고치기는 글자만(슬라이드) / 항목 단위(계획서). 지우기 없음. service_role(= mcp 함수)만 실행 가능.

create or replace function public.mcp_create_slide_deck(p_hash text, p_title text, p_slides jsonb, p_class uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_t uuid := public._mcp_need_teacher(p_hash); v_id uuid; s jsonb; o jsonb;
begin
  if p_title is null or btrim(p_title) = '' then raise exception 'title_required'; end if;
  if jsonb_typeof(p_slides) <> 'array' or jsonb_array_length(p_slides) = 0 then raise exception 'slides_required'; end if;
  if jsonb_array_length(p_slides) > 30 then raise exception 'too_many_slides'; end if;
  if length(p_slides::text) > 400000 then raise exception 'content_too_long'; end if;
  if p_class is not null and not exists (select 1 from classes where id = p_class and teacher_id = v_t) then
    raise exception 'not_found';
  end if;
  if (select count(*) from slide_decks where teacher_id = v_t and created_at > now() - interval '1 day') >= 20 then
    raise exception 'daily_limit';
  end if;
  for s in select * from jsonb_array_elements(p_slides) loop
    if jsonb_typeof(s->'objects') <> 'array' or jsonb_array_length(s->'objects') > 20 then raise exception 'invalid_slides'; end if;
    for o in select * from jsonb_array_elements(s->'objects') loop
      if o->>'type' <> 'text' then raise exception 'invalid_slides'; end if;
    end loop;
  end loop;

  insert into slide_decks (teacher_id, class_id, title, slides, share_enabled)
  values (v_t, p_class, left(btrim(p_title), 100), p_slides, false)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'slides', jsonb_array_length(p_slides), 'shared', false,
    'note', '슬라이드를 만들었습니다(공유는 꺼져 있음). 그림 넣기·디자인 바꾸기·공유는 클래스로그AI에서 선생님이 직접 하세요.');
end $$;

create or replace function public.mcp_update_slide_text(p_hash text, p_id uuid, p_edits jsonb, p_title text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_t uuid := public._mcp_need_teacher(p_hash); d slide_decks%rowtype;
  e jsonb; v_new jsonb; v_hit int; v_need int; v_edits jsonb := coalesce(p_edits, '[]'::jsonb);
begin
  select * into d from slide_decks where id = p_id and teacher_id = v_t;
  if not found then raise exception 'not_found'; end if;
  if jsonb_typeof(v_edits) <> 'array' then raise exception 'edit_invalid'; end if;
  if jsonb_array_length(v_edits) > 20 then raise exception 'too_many_edits'; end if;
  if jsonb_array_length(v_edits) = 0 and (p_title is null or btrim(p_title) = '') then raise exception 'nothing_to_update'; end if;
  for e in select * from jsonb_array_elements(v_edits) loop
    if coalesce(e->>'object_id', '') = '' or (e->>'text') is null then raise exception 'edit_invalid'; end if;
    if length(e->>'text') > 2000 then raise exception 'content_too_long'; end if;
  end loop;

  select count(distinct e2.value->>'object_id') into v_need from jsonb_array_elements(v_edits) e2;
  select count(distinct o.value->>'id') into v_hit
    from jsonb_array_elements(d.slides) s, jsonb_array_elements(coalesce(s.value->'objects','[]'::jsonb)) o, jsonb_array_elements(v_edits) e2
   where o.value->>'type' = 'text' and coalesce((o.value->>'decorative')::boolean, false) = false
     and o.value->>'id' = e2.value->>'object_id';
  if v_hit < v_need then raise exception 'object_not_found'; end if;

  select coalesce(jsonb_agg(
    jsonb_set(s.value, '{objects}', (
      select coalesce(jsonb_agg(
        case when o.value->>'type' = 'text' and coalesce((o.value->>'decorative')::boolean, false) = false
                  and exists (select 1 from jsonb_array_elements(v_edits) e3 where e3.value->>'object_id' = o.value->>'id')
             then jsonb_set(o.value, '{text}', to_jsonb((select e4.value->>'text' from jsonb_array_elements(v_edits) e4
                                                          where e4.value->>'object_id' = o.value->>'id' limit 1)))
             else o.value end order by o.ord), '[]'::jsonb)
        from jsonb_array_elements(coalesce(s.value->'objects','[]'::jsonb)) with ordinality o(value, ord))
    ) order by s.ord), '[]'::jsonb)
    into v_new from jsonb_array_elements(d.slides) with ordinality s(value, ord);

  update slide_decks set slides = v_new,
         title = case when p_title is not null and btrim(p_title) <> '' then left(btrim(p_title), 100) else title end,
         updated_at = now()
   where id = p_id;
  return jsonb_build_object('id', p_id, 'edited', v_need);
end $$;

create or replace function public.mcp_create_lesson_plan(p_hash text, p_purpose text, p_sections jsonb, p_class uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_t uuid := public._mcp_need_teacher(p_hash); v_id uuid;
begin
  if p_purpose is null or p_purpose not in ('formal','summary','parent') then raise exception 'invalid_purpose'; end if;
  if jsonb_typeof(p_sections) <> 'object' or jsonb_typeof(p_sections->'basicInfo') <> 'object' then raise exception 'invalid_sections'; end if;
  if length(p_sections::text) > 100000 then raise exception 'content_too_long'; end if;
  if p_class is not null and not exists (select 1 from classes where id = p_class and teacher_id = v_t) then
    raise exception 'not_found';
  end if;
  if (select count(*) from lesson_plans where teacher_id = v_t and created_at > now() - interval '1 day') >= 20 then
    raise exception 'daily_limit';
  end if;
  insert into lesson_plans (teacher_id, class_id, material_ids, purpose, include_standards, sections)
  values (v_t, p_class, '{}', p_purpose, btrim(coalesce(p_sections->>'standards', '')) <> '', p_sections)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'note', '수업계획서를 만들었습니다. 내보내기(한글/PDF)는 클래스로그AI에서 직접 하세요.');
end $$;

create or replace function public.mcp_update_lesson_plan(p_hash text, p_id uuid, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_t uuid := public._mcp_need_teacher(p_hash); pl lesson_plans%rowtype; v_s jsonb; k text;
begin
  select * into pl from lesson_plans where id = p_id and teacher_id = v_t;
  if not found then raise exception 'not_found'; end if;
  if jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then raise exception 'nothing_to_update'; end if;
  v_s := pl.sections;
  if p_patch ? 'basicInfo' then
    if jsonb_typeof(p_patch->'basicInfo') <> 'object' then raise exception 'invalid_sections'; end if;
    v_s := jsonb_set(v_s, '{basicInfo}', coalesce(v_s->'basicInfo', '{}'::jsonb) || (p_patch->'basicInfo'));
  end if;
  foreach k in array array['objectives','materials','assessment','standards','sessionPlans'] loop
    if p_patch ? k then v_s := jsonb_set(v_s, array[k], p_patch->k, true); end if;
  end loop;
  if length(v_s::text) > 100000 then raise exception 'content_too_long'; end if;
  update lesson_plans set sections = v_s, updated_at = now() where id = p_id;
  return jsonb_build_object('id', p_id, 'updated', true);
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'mcp_create_slide_deck(text,text,jsonb,uuid)','mcp_update_slide_text(text,uuid,jsonb,text)',
    'mcp_create_lesson_plan(text,text,jsonb,uuid)','mcp_update_lesson_plan(text,uuid,jsonb)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;
