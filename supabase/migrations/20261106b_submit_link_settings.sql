-- 학생 '결과 제출 전용 링크' 1단계: 반별 설정 2개 + 제출 함수가 설정을 따르게 한다.
--  submit_link_enabled : 제출 전용 링크 켜짐/꺼짐 (기본 꺼짐)
--  result_review       : 학생 제출을 '승인 대기'로 먼저 받기 (기본 꺼짐 = 지금처럼 바로 승인)
alter table public.classes
  add column if not exists submit_link_enabled boolean not null default false,
  add column if not exists result_review boolean not null default false;

-- 입장 화면이 '링크가 켜져 있는지' 알 수 있게 조회 결과에 추가 (열이 늘어 새로 만든다)
drop function if exists public.class_entry_lookup(text);
create function public.class_entry_lookup(p_code text)
returns table(id uuid, name text, subject text, allow_self_signup boolean, entry_mode text,
              live_roster_accepted boolean, show_student_number boolean, submit_link_enabled boolean)
language sql stable security definer set search_path to '' as $$
  select c.id, c.name, c.subject, c.allow_self_signup, c.entry_mode, c.live_roster_accepted,
         c.show_student_number, c.submit_link_enabled
  from public.classes c where c.entry_code = upper(p_code) or c.entry_code = p_code limit 1;
$$;
grant execute on function public.class_entry_lookup(text) to anon, authenticated;

-- 제출: 반 설정에 따라 '승인 대기' 또는 '승인'으로 저장, 제출 링크를 쓰는 반은 하루 한도 적용
create or replace function public.student_result_insert(p_token uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v_sid uuid; v_class uuid; v_row jsonb; v_out jsonb := '[]'::jsonb; v_new public.student_results;
        v_review boolean; v_link boolean; v_status text; v_today int; v_day timestamptz;
begin
  v_sid := public._student_from_token(p_token);
  if v_sid is null then raise exception 'STUDENT_TOKEN_INVALID'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 10 then raise exception 'BAD_ROWS'; end if;
  select class_id into v_class from public.students where id = v_sid;
  select c.result_review, c.submit_link_enabled into v_review, v_link from public.classes c where c.id = v_class;
  v_status := case when coalesce(v_review, false) then 'pending' else 'approved' end;
  if coalesce(v_link, false) then
    v_day := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
    select count(*) into v_today from public.student_results where class_id = v_class and created_at >= v_day;
    if v_today + jsonb_array_length(p_rows) > 1000 then raise exception 'DAILY_LIMIT'; end if;
  end if;
  for v_row in select * from jsonb_array_elements(p_rows) loop
    if (v_row->>'result_type') not in ('text','link','image','file') then raise exception 'BAD_TYPE'; end if;
    insert into public.student_results (student_id, class_id, week_number, submission_group, title, result_type,
      text_content, link_url, storage_path, storage_paths, display_name, file_size, file_type, group_id, is_group_submission, status)
    values (v_sid, v_class, nullif(v_row->>'week_number','')::int, nullif(v_row->>'submission_group','')::uuid, v_row->>'title', v_row->>'result_type',
      v_row->>'text_content', v_row->>'link_url', v_row->>'storage_path',
      case when jsonb_typeof(v_row->'storage_paths') = 'array' then array(select jsonb_array_elements_text(v_row->'storage_paths')) else null end,
      v_row->>'display_name', nullif(v_row->>'file_size','')::bigint, v_row->>'file_type',
      nullif(v_row->>'group_id','')::uuid, coalesce((v_row->>'is_group_submission')::boolean, false), v_status)
    returning * into v_new;
    v_out := v_out || to_jsonb(v_new);
  end loop;
  return v_out;
end $function$;
