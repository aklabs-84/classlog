-- AI 연결(MCP) ④: 학생 "별칭"으로만 칸 추가 (실명·PIN은 클래스로그AI에서 직접)
-- 별칭은 이름 칸(full_name)에 들어가고, 선생님이 나중에 앱에서 실명으로 바꿀 수 있다.
-- 추가만 한다(읽기·수정·삭제 없음). PIN·id는 돌려주지 않는다. 학생 수 한도는 기존 트리거(40명)가 지킨다.
create or replace function public.mcp_add_students(p_hash text, p_class uuid, p_aliases jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_t uuid := public._mcp_need_teacher(p_hash); c classes%rowtype;
  v_n int; v_next int; a text; v_out jsonb := '[]'::jsonb; i int := 0;
begin
  select * into c from classes where id = p_class and teacher_id = v_t;
  if not found then raise exception 'not_found'; end if;
  if c.parent_class_id is not null or c.is_demo or c.school_project_id is not null then raise exception 'protected_class'; end if;
  if jsonb_typeof(p_aliases) <> 'array' or jsonb_array_length(p_aliases) = 0 then raise exception 'aliases_required'; end if;
  v_n := jsonb_array_length(p_aliases);
  if v_n > 30 then raise exception 'too_many_aliases'; end if;
  -- 하루 추가 상한(선생님 전체 반 합계)
  if (select count(*) from students s join classes k on k.id = s.class_id
      where k.teacher_id = v_t and s.created_at > now() - interval '1 day') + v_n > 200 then
    raise exception 'daily_limit';
  end if;

  select coalesce(max(nullif(regexp_replace(student_number, '\D', '', 'g'), '')::int), 0) into v_next
    from students where class_id = p_class;

  for a in select btrim(x) from jsonb_array_elements_text(p_aliases) x loop
    if a = '' then raise exception 'alias_empty'; end if;
    if length(a) > 20 then raise exception 'alias_too_long'; end if;
    v_next := v_next + 1; i := i + 1;
    insert into students (class_id, full_name, student_number, tag) values (p_class, a, v_next::text, '학생');
    v_out := v_out || jsonb_build_object('number', v_next, 'alias', a);
  end loop;

  return jsonb_build_object('added', i, 'students', v_out,
    'note', '별칭으로 추가했습니다. 실명 입력·PIN 확인·입장 방식은 클래스로그AI에서 선생님이 직접 하세요.');
end $$;

revoke all on function public.mcp_add_students(text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.mcp_add_students(text,uuid,jsonb) to service_role;
