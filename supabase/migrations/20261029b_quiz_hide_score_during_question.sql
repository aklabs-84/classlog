-- 실시간 퀴즈: 문제를 푸는 동안에는 방금 낸 답의 점수를 학생에게 보여주지 않는다
-- (점수가 오르는 것만 봐도 정답 여부를 알 수 있으므로). 선생님이 결과를 열면(RESULT) 반영된 점수가 보인다.
-- 서버가 직접 숨기므로 새로고침·재입장·네트워크 확인으로도 알 수 없다. 저장된 실제 점수는 그대로다.

create or replace function public._quiz_visible_score(p_pid uuid)
returns integer language sql stable security definer set search_path = ''
as $$
  select case when s.state = 'QUIZ' then greatest(0, p.score - coalesce((
      select sum(a.score)::int from public.quiz_answers a
      where a.participant_id = p.id
        and a.question_id = (select q.id from public.quiz_questions q where q.quiz_set_id = s.quiz_set_id
                             order by q.order_index offset s.current_question_index limit 1)), 0))
    else p.score end
  from public.quiz_participants p join public.quiz_sessions s on s.id = p.session_id
  where p.id = p_pid
$$;

revoke execute on function public._quiz_visible_score(uuid) from public, anon, authenticated;

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
    'participant', (select jsonb_build_object('id',p.id,'session_id',p.session_id,'student_name',p.student_name,'score',public._quiz_visible_score(p.id)) from public.quiz_participants p where p.id = pid),
    'questions', qs);
end $$;

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
  if p_answer_id is not null and s.state <> 'QUIZ' then
    select jsonb_build_object('id',a.id,'is_correct',a.is_correct,'score',a.score,'needs_review',a.needs_review) into ans
    from public.quiz_answers a where a.id = p_answer_id and a.participant_id = p.id;
  end if;
  return jsonb_build_object('session', public._quiz_session_json(s.id),
    'participant', jsonb_build_object('id',p.id,'session_id',p.session_id,'student_name',p.student_name,'score',public._quiz_visible_score(p.id)),
    'participants', case when s.state = 'QUIZ' then null else
        (select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'student_name',x.student_name,'score',x.score) order by x.score desc), '[]'::jsonb)
         from public.quiz_participants x where x.session_id = s.id) end,
    'reveal', reveal, 'answer', ans);
end $$;
