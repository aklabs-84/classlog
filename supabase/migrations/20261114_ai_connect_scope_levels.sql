-- AI 연결(MCP) 열쇠 권한 단계
--  read          : 읽기만 (기본값, 기존 열쇠 전부)
--  write_create  : 읽기 + 새로 만들기
--  write_edit    : 읽기 + 새로 만들기 + 이미 있는 것 바꾸기
-- 지우기 권한은 만들지 않는다. 기존 'write' 값은 쓴 적이 없지만 안전하게 'read'로 내린다.

update public.ai_connect_tokens set scope = 'read' where scope not in ('read');

alter table public.ai_connect_tokens drop constraint if exists ai_connect_tokens_scope_check;
alter table public.ai_connect_tokens
  add constraint ai_connect_tokens_scope_check check (scope in ('read', 'write_create', 'write_edit'));

-- 열쇠 만들기: 권한 단계를 받는다(기본 read). 모르는 값은 거절.
drop function if exists public.create_ai_connect_token(text, int);
create or replace function public.create_ai_connect_token(p_name text, p_days int default 90, p_scope text default 'read')
returns table (id uuid, token text, last4 text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_raw text;
  v_days int := least(greatest(coalesce(p_days, 90), 1), 365);
  v_scope text := coalesce(p_scope, 'read');
  v_id uuid;
  v_exp timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_name is null or char_length(btrim(p_name)) = 0 then raise exception 'name_required'; end if;
  if v_scope not in ('read', 'write_create', 'write_edit') then raise exception 'invalid_scope'; end if;
  if (select count(*) from ai_connect_tokens t
        where t.teacher_id = v_uid and t.revoked_at is null and t.expires_at > now()) >= 5 then
    raise exception 'too_many_tokens';
  end if;
  v_raw := 'clk_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_exp := now() + make_interval(days => v_days);
  insert into ai_connect_tokens (teacher_id, name, token_hash, last4, scope, expires_at)
  values (v_uid, left(btrim(p_name), 40), encode(sha256(convert_to(v_raw, 'utf8')), 'hex'), right(v_raw, 4), v_scope, v_exp)
  returning ai_connect_tokens.id into v_id;
  return query select v_id, v_raw, right(v_raw, 4), v_exp;
end $$;

revoke all on function public.create_ai_connect_token(text, int, text) from public, anon;
grant execute on function public.create_ai_connect_token(text, int, text) to authenticated;
