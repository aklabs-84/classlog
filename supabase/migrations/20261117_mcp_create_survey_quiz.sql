-- AI 연결(MCP) 2-B: 설문·퀴즈 "초안" 만들기
-- 규칙: 열쇠 주인 것만. 설문은 항상 draft(시작은 선생님이 직접). 퀴즈는 글자만(그림·소리·유튜브 없음).
-- 전부 만들거나 하나도 안 만든다(함수 하나 = 한 트랜잭션). service_role(= mcp 함수)만 실행 가능.

create or replace function public.mcp_create_survey(
  p_hash text, p_title text, p_questions jsonb, p_class uuid default null, p_anonymous boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_t uuid := public._mcp_need_teacher(p_hash);
  v_form uuid; v_pin text; v_try int := 0;
  q jsonb; i int := 0; v_type text; v_text text; v_opts jsonb; v_n int; v_max int;
  v_plan text; v_beta timestamptz;
begin
  if p_title is null or btrim(p_title) = '' then raise exception 'title_required'; end if;
  if jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) = 0 then raise exception 'questions_required'; end if;
  if jsonb_array_length(p_questions) > 20 then raise exception 'too_many_questions'; end if;
  if p_class is not null and not exists (select 1 from classes where id = p_class and teacher_id = v_t) then
    raise exception 'not_found';
  end if;

  -- 무료 플랜 한도(앱과 동일: 5개). Basic 이상·베타는 무제한
  select plan, beta_expires_at into v_plan, v_beta from profiles where id = v_t;
  if not (coalesce(v_plan,'free') in ('basic','pro','school','admin') or (v_beta is not null and v_beta > now())) then
    if (select count(*) from survey_forms where teacher_id = v_t) >= 5 then raise exception 'plan_limit_survey'; end if;
  end if;
  -- 하루 생성 상한
  if (select count(*) from survey_forms where teacher_id = v_t and created_at > now() - interval '1 day') >= 20 then
    raise exception 'daily_limit';
  end if;

  -- 입장 번호(PIN) 6자리, 겹치면 다시 뽑기
  loop
    v_pin := (100000 + floor(random() * 900000))::int::text;
    exit when not exists (select 1 from survey_forms where pin_code = v_pin);
    v_try := v_try + 1;
    if v_try > 20 then raise exception 'pin_failed'; end if;
  end loop;

  insert into survey_forms (teacher_id, class_id, title, pin_code, status, is_anonymous)
  values (v_t, p_class, left(btrim(p_title), 100), v_pin, 'draft', coalesce(p_anonymous, true))
  returning id into v_form;

  for q in select * from jsonb_array_elements(p_questions) loop
    v_type := q->>'type';
    v_text := btrim(coalesce(q->>'text', ''));
    if v_text = '' then raise exception 'question_text_required'; end if;
    if length(v_text) > 300 then raise exception 'question_too_long'; end if;
    if v_type not in ('multiple_choice','yes_no','star_rating','short_text','opinion_scale','ranking') then
      raise exception 'invalid_question_type';
    end if;

    if v_type in ('multiple_choice','ranking') then
      if jsonb_typeof(q->'options') <> 'array' then raise exception 'options_required'; end if;
      select coalesce(jsonb_agg(jsonb_build_object('label', left(btrim(o), 100))), '[]'::jsonb) into v_opts
        from jsonb_array_elements_text(q->'options') o where btrim(o) <> '';
      v_n := jsonb_array_length(v_opts);
      if v_n < 2 or v_n > 6 then raise exception 'options_count'; end if;
    elsif v_type = 'opinion_scale' then
      v_max := case when (q->>'max') = '10' then 10 else 5 end;
      v_opts := jsonb_build_array(
        jsonb_build_object('label', left(coalesce(nullif(btrim(q->>'low_label'), ''), '전혀 그렇지 않다'), 30)),
        jsonb_build_object('label', left(coalesce(nullif(btrim(q->>'high_label'), ''), '매우 그렇다'), 30)),
        jsonb_build_object('label', v_max::text));
    else
      v_opts := '[]'::jsonb;
    end if;

    insert into survey_questions (form_id, order_index, type, text, options) values (v_form, i, v_type, v_text, v_opts);
    i := i + 1;
  end loop;

  return jsonb_build_object('id', v_form, 'status', 'draft', 'questions', i,
    'note', '초안으로 만들었습니다. 학생에게 여는 것은 클래스로그AI 설문 도구에서 선생님이 직접 하세요.');
end $$;

create or replace function public.mcp_create_quiz(
  p_hash text, p_title text, p_questions jsonb, p_class uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_t uuid := public._mcp_need_teacher(p_hash);
  v_set uuid; q jsonb; i int := 0; v_type text; v_text text; v_ans int; v_list text[]; v_tl int; v_o text[];
begin
  if p_title is null or btrim(p_title) = '' then raise exception 'title_required'; end if;
  if jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) = 0 then raise exception 'questions_required'; end if;
  if jsonb_array_length(p_questions) > 30 then raise exception 'too_many_questions'; end if;
  if p_class is not null and not exists (select 1 from classes where id = p_class and teacher_id = v_t) then
    raise exception 'not_found';
  end if;
  if (select count(*) from quiz_sets where teacher_id = v_t and created_at > now() - interval '1 day') >= 20 then
    raise exception 'daily_limit';
  end if;

  insert into quiz_sets (teacher_id, class_id, title) values (v_t, p_class, left(btrim(p_title), 100))
  returning id into v_set;

  for q in select * from jsonb_array_elements(p_questions) loop
    v_type := coalesce(q->>'type', 'multiple_choice');
    v_text := btrim(coalesce(q->>'text', ''));
    if v_text = '' then raise exception 'question_text_required'; end if;
    if length(v_text) > 300 then raise exception 'question_too_long'; end if;
    if v_type not in ('multiple_choice','short_answer') then raise exception 'invalid_question_type'; end if;
    v_tl := least(greatest(coalesce(nullif(q->>'time_limit','')::int, 20), 5), 120);

    if v_type = 'multiple_choice' then
      if jsonb_typeof(q->'options') <> 'array' or jsonb_array_length(q->'options') <> 4 then raise exception 'quiz_options_count'; end if;
      select array_agg(left(btrim(o), 100)) into v_o from jsonb_array_elements_text(q->'options') o;
      if exists (select 1 from unnest(v_o) x where x = '') then raise exception 'quiz_options_count'; end if;
      v_ans := nullif(q->>'correct','')::int;
      if v_ans is null or v_ans < 1 or v_ans > 4 then raise exception 'invalid_correct'; end if;
      insert into quiz_questions (quiz_set_id, order_index, question_type, text, option_1, option_2, option_3, option_4,
                                  correct_answer, correct_answers, time_limit, explanation)
      values (v_set, i, 'multiple_choice', v_text, v_o[1], v_o[2], v_o[3], v_o[4], v_ans - 1, null, v_tl,
              nullif(left(btrim(coalesce(q->>'explanation','')), 500), ''));
    else
      if jsonb_typeof(q->'correct_answers') <> 'array' then raise exception 'short_answers_required'; end if;
      select array_agg(left(btrim(a), 50)) into v_list from jsonb_array_elements_text(q->'correct_answers') a where btrim(a) <> '';
      if v_list is null or array_length(v_list, 1) > 10 then raise exception 'short_answers_required'; end if;
      insert into quiz_questions (quiz_set_id, order_index, question_type, text, option_1, option_2, option_3, option_4,
                                  correct_answer, correct_answers, time_limit, explanation)
      values (v_set, i, 'short_answer', v_text, '', '', '', '', 0, v_list, v_tl,
              nullif(left(btrim(coalesce(q->>'explanation','')), 500), ''));
    end if;
    i := i + 1;
  end loop;

  return jsonb_build_object('id', v_set, 'questions', i,
    'note', '퀴즈 세트를 만들었습니다. 학생에게 시작하는 것은 클래스로그AI 퀴즈 도구에서 선생님이 직접 하세요.');
end $$;

do $$
declare fn text;
begin
  foreach fn in array array['mcp_create_survey(text,text,jsonb,uuid,boolean)','mcp_create_quiz(text,text,jsonb,uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;
