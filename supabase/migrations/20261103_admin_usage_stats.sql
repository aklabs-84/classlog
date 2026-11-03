-- 관리자 화면 "서버 사용량" 탭용: DB 크기·파일 저장 크기·최근 요청 수를 한 번에 돌려준다.
-- 관리자(profiles.is_admin)만 호출 가능. 탭을 열 때 1회만 호출(자동 새로고침 없음).

create or replace function public.admin_usage_stats()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin = true) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'db_bytes',      pg_database_size(current_database()),
    'storage_bytes', (select coalesce(sum((metadata->>'size')::numeric), 0) from storage.objects),
    'requests',      coalesce((
      select jsonb_agg(jsonb_build_object('day', substr(key, 5), 'total', level) order by key)
      from (select key, level from public.usage_alert_state where key like 'req\_%' order by key desc limit 8) t
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_usage_stats() from public, anon;
grant execute on function public.admin_usage_stats() to authenticated;
