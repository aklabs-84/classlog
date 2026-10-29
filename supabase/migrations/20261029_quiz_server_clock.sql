-- 실시간 퀴즈: 모든 기기가 서버 시계 하나를 보도록 고침
-- 1) 문제 시작 시각은 서버(DB)가 직접 찍는다 (선생님 기기 시계를 믿지 않음)
-- 2) 학생/선생님 화면이 기기 시계 차이를 보정할 수 있게 서버 시각(server_now_ms)을 내려준다
-- 3) 같은 학생이 한 문제에 답을 두 번 넣는 경합(더블 탭)을 막는다
-- 4) 같은 이름 동시 입장 경합 방지, 문제 풀이 중 폴링 응답 크기 축소

-- 서버 현재 시각(ms) — 선생님 화면용
create or replace function public.quiz_server_now()
returns bigint language sql stable security definer set search_path = ''
as $$ select (extract(epoch from clock_timestamp()) * 1000)::bigint $$;
grant execute on function public.quiz_server_now() to anon, authenticated;

-- 세션 JSON에 server_now_ms 추가 (기존 필드는 그대로)
create or replace function public._quiz_session_json(p_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('id',s.id,'quiz_set_id',s.quiz_set_id,'pin_code',s.pin_code,'state',s.state,
    'current_question_index',s.current_question_index,'max_timer',s.max_timer,'question_started_at',s.question_started_at,
    'class_id',s.class_id,'created_at',s.created_at,'updated_at',s.updated_at,
    'server_now_ms',(extract(epoch from clock_timestamp()) * 1000)::bigint)
  from public.quiz_sessions s where s.id = p_id
$$;

-- 문제가 시작되는 순간(QUIZ로 바뀌거나 문제 번호/시작 시각이 바뀜) 서버 시각을 찍는다
create or replace function public.quiz_stamp_question_start()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.state = 'QUIZ' and (
       old.state is distinct from 'QUIZ'
    or new.current_question_index is distinct from old.current_question_index
    or new.question_started_at is distinct from old.question_started_at
  ) then
    new.question_started_at := clock_timestamp();
  end if;
  return new;
end $$;

drop trigger if exists quiz_sessions_stamp_start on public.quiz_sessions;
create trigger quiz_sessions_stamp_start
  before update on public.quiz_sessions
  for each row execute function public.quiz_stamp_question_start();

-- 객관식 제출: 같은 학생·같은 문제 동시 제출을 순서대로 처리
create or replace function public.quiz_submit_answer(p_participant_id uuid, p_question_id uuid, p_option integer)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare c record; ok boolean; sc int := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_participant_id::text || p_question_id::text, 0));
  select * into c from public._quiz_answer_context(p_participant_id, p_question_id);
  if exists (select 1 from public.quiz_answers where participant_id = p_participant_id and question_id = p_question_id) then
    return jsonb_build_object('error','ALREADY_ANSWERED');
  end if;
  ok := (p_option = (c.q).correct_answer);
  if ok then sc := greatest(0, 500 + floor((1 - c.elapsed / greatest((c.q).time_limit,1)) * 500)::int); end if;
  insert into public.quiz_answers(session_id, participant_id, question_id, selected_option, is_correct, score, response_time, needs_review)
    values ((c.sess).id, p_participant_id, p_question_id, p_option, ok, sc, c.elapsed, false);
  if sc > 0 then update public.quiz_participants set score = score + sc where id = p_participant_id; end if;
  return jsonb_build_object('is_correct', ok, 'score', sc, 'correct_answer', (c.q).correct_answer);
end $$;

-- 주관식 제출도 동일하게
create or replace function public.quiz_submit_short(p_participant_id uuid, p_question_id uuid, p_text text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare c record; aid uuid;
begin
  if p_text is null or length(btrim(p_text)) = 0 or length(p_text) > 500 then raise exception 'BAD_TEXT'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_participant_id::text || p_question_id::text, 0));
  select * into c from public._quiz_answer_context(p_participant_id, p_question_id);
  if exists (select 1 from public.quiz_answers where participant_id = p_participant_id and question_id = p_question_id) then
    return jsonb_build_object('error','ALREADY_ANSWERED');
  end if;
  insert into public.quiz_answers(session_id, participant_id, question_id, selected_option, answer_text, is_correct, score, response_time, needs_review)
    values ((c.sess).id, p_participant_id, p_question_id, null, btrim(p_text), false, 0, c.elapsed, true) returning id into aid;
  return jsonb_build_object('answer_id', aid);
end $$;

-- 입장: 같은 이름이 동시에 들어와도 오류 없이 같은 참가자로 처리
create or replace function public.quiz_join(p_pin text, p_name text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare s public.quiz_sessions; n text := btrim(coalesce(p_name,'')); pid uuid; qs jsonb;
begin
  select * into s from public.quiz_sessions where pin_code = p_pin and state <> 'FINAL';
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if length(n) = 0 or length(n) > 30 then raise exception 'BAD_NAME'; end if;
  insert into public.quiz_participants(session_id, student_name, score) values (s.id, n, 0)
    on conflict (session_id, student_name) do nothing;
  select id into pid from public.quiz_participants where session_id = s.id and student_name = n;
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'quiz_set_id',q.quiz_set_id,'order_index',q.order_index,'text',q.text,
      'option_1',q.option_1,'option_2',q.option_2,'option_3',q.option_3,'option_4',q.option_4,'time_limit',q.time_limit,
      'question_type',q.question_type,'image_url',q.image_url,
      'youtube_id',q.youtube_id,'youtube_start',q.youtube_start,'youtube_end',q.youtube_end,
      'audio_url',q.audio_url) order by q.order_index), '[]'::jsonb)
    into qs from public.quiz_questions q where q.quiz_set_id = s.quiz_set_id;
  return jsonb_build_object('session', public._quiz_session_json(s.id),
    'participant', (select jsonb_build_object('id',p.id,'session_id',p.session_id,'student_name',p.student_name,'score',p.score) from public.quiz_participants p where p.id = pid),
    'questions', qs);
end $$;

-- 폴링: 문제 푸는 중(QUIZ)에는 전체 참가자 목록을 생략해 응답 크기를 줄인다 (순위/대기실/결과에서만 필요)
create or replace function public.quiz_poll(p_participant_id uuid, p_answer_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare p public.quiz_participants; s public.quiz_sessions; cq public.quiz_questions; reveal jsonb; ans jsonb;
begin
  select * into p from public.quiz_participants where id = p_participant_id;
  if not found then return null; end if;
  select * into s from public.quiz_sessions where id = p.session_id;
  if s.state in ('RESULT','RANKING','FINAL') then
    select * into cq from public.quiz_questions where quiz_set_id = s.quiz_set_id order by order_index offset s.current_question_index limit 1;
    if cq.id is not null then
      reveal := jsonb_build_object('question_id',cq.id,'correct_answer',cq.correct_answer,'correct_answers',to_jsonb(cq.correct_answers),'explanation',cq.explanation,
        'explanation_audio_url',cq.explanation_audio_url,'explanation_youtube_id',cq.explanation_youtube_id,
        'explanation_youtube_start',cq.explanation_youtube_start,'explanation_youtube_end',cq.explanation_youtube_end);
    end if;
  end if;
  if p_answer_id is not null then
    select jsonb_build_object('id',a.id,'is_correct',a.is_correct,'score',a.score,'needs_review',a.needs_review) into ans
    from public.quiz_answers a where a.id = p_answer_id and a.participant_id = p.id;
  end if;
  return jsonb_build_object('session', public._quiz_session_json(s.id),
    'participant', jsonb_build_object('id',p.id,'session_id',p.session_id,'student_name',p.student_name,'score',p.score),
    'participants', case when s.state = 'QUIZ' then null else
        (select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'student_name',x.student_name,'score',x.score) order by x.score desc), '[]'::jsonb)
         from public.quiz_participants x where x.session_id = s.id) end,
    'reveal', reveal, 'answer', ans);
end $$;
