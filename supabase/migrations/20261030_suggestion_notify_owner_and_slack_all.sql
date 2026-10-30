-- 질문·건의함: 알림을 반 주인 + 배정 선생님 모두에게, Slack은 모든 건의에, 실시간 숫자용 Realtime 등록
create or replace function public.student_suggestion_create(p_token uuid, p_content text)
 returns student_suggestions
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_sid uuid; v_class uuid; v_name text; v_teacher uuid; v_assigned uuid; v_to uuid; r public.student_suggestions;
begin
  v_sid := public._student_from_token(p_token);
  if v_sid is null then raise exception 'STUDENT_TOKEN_INVALID'; end if;
  if p_content is null or length(btrim(p_content)) = 0 or length(p_content) > 5000 then raise exception 'BAD_CONTENT'; end if;
  select s.class_id, s.full_name into v_class, v_name from public.students s where s.id = v_sid;
  select c.teacher_id, c.assigned_teacher_id into v_teacher, v_assigned from public.classes c where c.id = v_class;
  insert into public.student_suggestions(student_id, class_id, teacher_id, student_name, content)
    values (v_sid, v_class, v_teacher, v_name, btrim(p_content)) returning * into r;
  -- 반 주인과 배정받은 선생님 모두에게 (같은 사람이면 한 번만)
  for v_to in select distinct x from unnest(array[v_teacher, v_assigned]) as x where x is not null loop
    insert into public.notifications(user_id, title, content, type, link)
    values (v_to, '💬 ' || v_name || '이(가) 질문·건의함에 등록했습니다', left(btrim(p_content), 80), 'student_submission',
            '/suggestions?classId=' || v_class);
  end loop;
  return r;
end $function$;

create or replace function public.notify_admin_flagged_suggestion()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_flagged boolean := NEW.content ~* '(신고|오류|버그|결제|환불|개인정보|폭언|욕설|사기)';
begin
  IF v_flagged THEN
    PERFORM public.notify_admins(
      '⚠️ 건의사항에 주의 키워드 감지: ' || NEW.student_name,
      left(NEW.content, 80),
      'flagged_suggestion',
      '/classroom?id=' || NEW.class_id::text || '&student_id=' || NEW.student_id::text
    );
  END IF;
  -- Slack: 모든 건의 (실패해도 건의 등록은 멈추지 않음)
  BEGIN
    PERFORM net.http_post(
      url := 'https://classlog-ai.vercel.app/api/slack?type=flagged-suggestion',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'push_webhook_secret')
      ),
      body := jsonb_build_object(
        'student_name', NEW.student_name,
        'content', left(NEW.content, 80),
        'flagged', v_flagged,
        'link', '/suggestions?classId=' || NEW.class_id::text
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'suggestion slack notify failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

alter publication supabase_realtime add table public.student_suggestions;
