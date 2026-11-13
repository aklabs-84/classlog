-- AI 연결(MCP) 2묶음: 읽기 확장 (아이디어 기록 · 수업 메모 · 설문 · 퀴즈 · 포트폴리오 · 갤러리 · 학교 프로젝트)
-- 규칙: 열쇠 주인 것만 읽는다. 학생 이름·응답자·올린 사람·공유 열쇠·입장 코드·파일 주소는 절대 내보내지 않는다.
-- service_role(= mcp 함수)만 실행 가능. 쓰기 없음.

-- 아이디어 기록 목록
create or replace function public.mcp_list_idea_notes(p_hash text, p_limit int default 30, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_t uuid := public._mcp_need_teacher(p_hash);
begin
  return coalesce((select jsonb_agg(r) from (
    select id, title, status, tags, class_id, updated_at, length(coalesce(content,'')) as chars
    from teacher_notes where teacher_id = v_t
    order by updated_at desc limit least(greatest(p_limit,1),100) offset greatest(p_offset,0)) r), '[]'::jsonb);
end $$;

-- 아이디어 기록 한 건
create or replace function public.mcp_get_idea_note(p_hash text, p_id uuid, p_offset int default 0, p_max int default 30000)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_t uuid := public._mcp_need_teacher(p_hash); n teacher_notes%rowtype; v_off int := greatest(coalesce(p_offset,0),0); v_max int := least(greatest(coalesce(p_max,30000),1000),60000);
begin
  select * into n from teacher_notes where id = p_id and teacher_id = v_t;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('id', n.id, 'title', n.title, 'status', n.status, 'tags', n.tags,
    'ai_summary', n.ai_summary, 'reference_links', n.reference_links, 'class_id', n.class_id,
    'content', substr(coalesce(n.content,''), v_off + 1, v_max),
    'total_chars', length(coalesce(n.content,'')),
    'has_more', length(coalesce(n.content,'')) > v_off + v_max);
end $$;

-- 수업 메모(반별) 목록 + 내용
create or replace function public.mcp_list_lesson_memos(p_hash text, p_class uuid default null, p_limit int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_t uuid := public._mcp_need_teacher(p_hash);
begin
  return coalesce((select jsonb_agg(r) from (
    select m.id, m.class_id, c.name as class_name, left(coalesce(m.content,''), 5000) as content, m.updated_at
    from lesson_memos m join classes c on c.id = m.class_id
    where m.teacher_id = v_t and (p_class is null or m.class_id = p_class)
    order by m.updated_at desc limit least(greatest(p_limit,1),100)) r), '[]'::jsonb);
end $$;

-- 설문 목록
create or replace function public.mcp_list_surveys(p_hash text, p_limit int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_t uuid := public._mcp_need_teacher(p_hash);
begin
  return coalesce((select jsonb_agg(r) from (
    select f.id, f.title, f.status, f.is_anonymous, f.class_id, f.survey_phase, f.created_at,
           (select count(*) from survey_questions q where q.form_id = f.id) as questions,
           (select count(*) from survey_responses s where s.form_id = f.id) as responses
    from survey_forms f where f.teacher_id = v_t
    order by f.created_at desc limit least(greatest(p_limit,1),100)) r), '[]'::jsonb);
end $$;

-- 설문 한 건: 질문 + 문항별 통계(응답자 이름·개별 응답 없음, 주관식은 응답 개수만)
create or replace function public.mcp_get_survey(p_hash text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_t uuid := public._mcp_need_teacher(p_hash); f survey_forms%rowtype; v_resp int;
begin
  select * into f from survey_forms where id = p_id and teacher_id = v_t;
  if not found then raise exception 'not_found'; end if;
  select count(*) into v_resp from survey_responses where form_id = p_id;
  return jsonb_build_object('id', f.id, 'title', f.title, 'status', f.status, 'is_anonymous', f.is_anonymous,
    'survey_phase', f.survey_phase, 'responses', v_resp,
    'questions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', q.id, 'order', q.order_index, 'type', q.type, 'text', q.text, 'options', q.options,
        'answer_count', (select count(*) from survey_answers a where a.question_id = q.id),
        'distribution', case when q.type in ('short_text','ranking') then null else
           (select coalesce(jsonb_object_agg(k, c), '{}'::jsonb) from (
              select (a.value ->> coalesce(
                        case when a.value ? 'selected' then 'selected' when a.value ? 'rating' then 'rating'
                             when a.value ? 'scale' then 'scale' else 'value' end, 'value')) as k, count(*) as c
              from survey_answers a where a.question_id = q.id group by 1) d where k is not null) end
      ) order by q.order_index) from survey_questions q where q.form_id = p_id), '[]'::jsonb));
end $$;

-- 퀴즈 세트 목록
create or replace function public.mcp_list_quizzes(p_hash text, p_limit int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_t uuid := public._mcp_need_teacher(p_hash);
begin
  return coalesce((select jsonb_agg(r) from (
    select s.id, s.title, s.class_id, s.updated_at,
           (select count(*) from quiz_questions q where q.quiz_set_id = s.id) as questions,
           (select count(*) from quiz_sessions x where x.quiz_set_id = s.id) as plays
    from quiz_sets s where s.teacher_id = v_t
    order by s.updated_at desc limit least(greatest(p_limit,1),100)) r), '[]'::jsonb);
end $$;

-- 퀴즈 한 건: 문제·정답·해설 + 문제별 전체 정답률(학생 이름·학생별 점수 없음)
create or replace function public.mcp_get_quiz(p_hash text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_t uuid := public._mcp_need_teacher(p_hash); s quiz_sets%rowtype;
begin
  select * into s from quiz_sets where id = p_id and teacher_id = v_t;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('id', s.id, 'title', s.title, 'class_id', s.class_id,
    'questions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', q.id, 'order', q.order_index, 'type', q.question_type, 'text', q.text,
        'options', jsonb_build_array(q.option_1, q.option_2, q.option_3, q.option_4),
        'correct_answer', q.correct_answer, 'correct_answers', q.correct_answers,
        'explanation', q.explanation, 'time_limit', q.time_limit,
        'answers', (select count(*) from quiz_answers a where a.question_id = q.id),
        'correct_rate', (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where a.is_correct) / count(*)) end
                         from quiz_answers a where a.question_id = q.id)
      ) order by q.order_index) from quiz_questions q where q.quiz_set_id = p_id), '[]'::jsonb));
end $$;

-- 포트폴리오(본인 것)
create or replace function public.mcp_get_portfolio(p_hash text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_t uuid := public._mcp_need_teacher(p_hash); p teacher_portfolios%rowtype;
begin
  select * into p from teacher_portfolios where teacher_id = v_t;
  if not found then return jsonb_build_object('exists', false); end if;
  return jsonb_build_object('exists', true, 'intro', p.intro, 'visibility', p.visibility, 'resume', p.resume,
    'showcase_plan_ids', p.showcase_plan_ids, 'included_class_ids', p.included_class_ids);
end $$;

-- 갤러리: 목록만 (주차·종류·캡션). 올린 사람·파일 이름·파일 주소·업로드 열쇠는 내보내지 않는다
create or replace function public.mcp_list_gallery(p_hash text, p_class uuid, p_limit int default 50, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_t uuid := public._mcp_need_teacher(p_hash);
begin
  if not exists (select 1 from classes where id = p_class and teacher_id = v_t) then raise exception 'not_found'; end if;
  return jsonb_build_object(
    'total', (select count(*) from class_gallery_items where class_id = p_class),
    'items', coalesce((select jsonb_agg(r) from (
      select id, week_number, file_type, left(coalesce(caption,''), 100) as caption, review_status, is_featured, created_at
      from class_gallery_items where class_id = p_class
      order by created_at desc limit least(greatest(p_limit,1),100) offset greatest(p_offset,0)) r), '[]'::jsonb));
end $$;

-- 학교 프로젝트: 이름·기간·참여 반 (공유 링크 열쇠·입장 코드 없음)
create or replace function public.mcp_list_school_projects(p_hash text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_t uuid := public._mcp_need_teacher(p_hash);
begin
  return coalesce((select jsonb_agg(r) from (
    select p.id, p.name, p.school_name, p.status, p.start_date, p.end_date,
           (select count(*) from school_project_classes pc where pc.project_id = p.id) as classes
    from school_projects p
    where p.admin_id = v_t or exists (select 1 from school_project_classes pc where pc.project_id = p.id and pc.teacher_id = v_t)
    order by p.created_at desc limit 50) r), '[]'::jsonb);
end $$;

-- 자료 화면 스타일 읽기 / 바꾸기 (본인 자료만, 정해진 7가지 중에서만)
create or replace function public.mcp_get_material_style(p_hash text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_t uuid := public._mcp_need_teacher(p_hash); v text;
begin
  select viewer_style into v from class_materials where id = p_id and teacher_id = v_t;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('id', p_id, 'viewer_style', v);
end $$;

create or replace function public.mcp_set_material_style(p_hash text, p_id uuid, p_style text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_t uuid := public._mcp_need_teacher(p_hash);
begin
  if p_style is null or p_style not in ('default','mission','storybook','challenge','note','manual','workshop') then
    raise exception 'invalid_style';
  end if;
  if not exists (select 1 from class_materials where id = p_id and teacher_id = v_t) then raise exception 'not_found'; end if;
  update class_materials set viewer_style = p_style where id = p_id;
  return jsonb_build_object('id', p_id, 'viewer_style', p_style);
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'mcp_list_idea_notes(text,int,int)','mcp_get_idea_note(text,uuid,int,int)','mcp_list_lesson_memos(text,uuid,int)',
    'mcp_list_surveys(text,int)','mcp_get_survey(text,uuid)','mcp_list_quizzes(text,int)','mcp_get_quiz(text,uuid)',
    'mcp_get_portfolio(text)','mcp_list_gallery(text,uuid,int,int)','mcp_list_school_projects(text)','mcp_get_material_style(text,uuid)','mcp_set_material_style(text,uuid,text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;
