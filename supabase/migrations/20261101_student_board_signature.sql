-- 학생 보드 자동 새로고침용: "새 제출이 있나?"만 아주 작게 알려 주는 창구 (데이터 본문은 안 줌)
create or replace function public.student_class_board_signature(p_token uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_sid uuid; v_class uuid; v_r text; v_o text;
begin
  v_sid := public._student_from_token(p_token);
  if v_sid is null then return null; end if;
  select s.class_id into v_class from public.students s where s.id = v_sid;
  select count(*)::text || '|' || coalesce(max(r.created_at)::text, '') into v_r
    from public.student_results r join public.students st on st.id = r.student_id
    where st.class_id = v_class and r.status is distinct from 'rejected';
  select count(*)::text || '|' || coalesce(max(o.created_at)::text, '') into v_o
    from public.observations o join public.students st on st.id = o.student_id
    where st.class_id = v_class and o.is_student_record = true and o.status = 'approved';
  return v_r || '#' || v_o;
end $$;
revoke all on function public.student_class_board_signature(uuid) from public;
grant execute on function public.student_class_board_signature(uuid) to anon, authenticated;
