-- AI 연결(MCP) ChatGPT 정식 연결(OAuth 승인 화면 방식) 1단계: DB
-- 흐름: 연결 요청 등록 → 선생님이 승인 화면에서 권한 선택·허용 → 1회용 승인 코드(5분) → 코드 교환 → 기존 AI 연결 열쇠(clk_…) 발급
-- 원칙
--  * 두 테이블 모두 보안 규칙을 켜고 정책을 만들지 않는다(= 화면에서 직접 접근 불가). 아래 기능으로만 다룬다.
--  * 승인 코드는 지문(sha256)만 저장, 5분 유효, 한 번만 사용, PKCE(S256) 필수.
--  * 연결 요청 주소는 ChatGPT·OpenAI(https)와 내 컴퓨터(localhost)만 허용.
--  * 발급되는 것은 기존 열쇠와 똑같은 열쇠다 → 권한 단계·끄기·사용 기록·분당 제한이 그대로 적용된다.

-- ───────────────────────── 1. 테이블 ─────────────────────────
create table if not exists public.ai_oauth_clients (
  client_id     text primary key,
  client_name   text not null check (char_length(client_name) between 1 and 60),
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 5),
  created_at    timestamptz not null default now()
);
create index if not exists ai_oauth_clients_created_idx on public.ai_oauth_clients (created_at);

create table if not exists public.ai_oauth_codes (
  code_hash      text primary key,
  client_id      text not null references public.ai_oauth_clients(client_id) on delete cascade,
  teacher_id     uuid not null references auth.users(id) on delete cascade,
  scope          text not null check (scope in ('read', 'write_create', 'write_edit')),
  redirect_uri   text not null,
  code_challenge text not null,
  expires_at     timestamptz not null,
  used_at        timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists ai_oauth_codes_teacher_time_idx on public.ai_oauth_codes (teacher_id, created_at desc);

alter table public.ai_oauth_clients enable row level security;
alter table public.ai_oauth_codes enable row level security;
revoke all on public.ai_oauth_clients from anon, authenticated;
revoke all on public.ai_oauth_codes from anon, authenticated;

-- 어느 연결 요청(앱)으로 만든 열쇠인지 표시(다시 연결하면 이전 것을 자동으로 끄기 위함)
alter table public.ai_connect_tokens add column if not exists client_id text;

-- ───────────────────────── 2. 안쪽 도우미 ─────────────────────────
-- 되돌아올 주소 검사: ChatGPT·OpenAI(https) 또는 localhost(내 컴퓨터)만
create or replace function public._oauth_redirect_ok(p_uri text)
returns boolean
language sql immutable set search_path = public as $$
  select p_uri is not null
     and char_length(p_uri) <= 300
     and p_uri !~ '[#\s]'
     and (
       p_uri ~* '^https://(chatgpt\.com|chat\.openai\.com|platform\.openai\.com)(/|$)'
       or p_uri ~* '^http://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?(/|$)'
     );
$$;

-- ───────────────────────── 3. 창구 전용 기능 (service_role만) ─────────────────────────
-- 연결 요청 등록(동적 등록). 누구나 부를 수 있는 입구라서 상한을 둔다.
create or replace function public.mcp_oauth_register(p_name text, p_redirects text[])
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id text; u text;
begin
  if p_redirects is null or cardinality(p_redirects) not between 1 and 5 then raise exception 'invalid_redirect'; end if;
  foreach u in array p_redirects loop
    if not public._oauth_redirect_ok(u) then raise exception 'invalid_redirect'; end if;
  end loop;
  -- 오래된 등록·승인 코드 청소
  delete from ai_oauth_codes where created_at < now() - interval '1 day';
  delete from ai_oauth_clients c where c.created_at < now() - interval '30 days'
     and not exists (select 1 from ai_connect_tokens t where t.client_id = c.client_id and t.revoked_at is null);
  -- 남용 방지: 1시간 100건, 전체 1000건
  if (select count(*) from ai_oauth_clients where created_at > now() - interval '1 hour') >= 100 then raise exception 'rate_limited'; end if;
  if (select count(*) from ai_oauth_clients) >= 1000 then raise exception 'rate_limited'; end if;
  v_id := 'clc_' || replace(gen_random_uuid()::text, '-', '');
  insert into ai_oauth_clients (client_id, client_name, redirect_uris)
  values (v_id, left(coalesce(nullif(btrim(p_name), ''), '외부 AI'), 60), p_redirects);
  return jsonb_build_object('client_id', v_id);
end $$;

-- 승인 코드 → 열쇠 교환(한 번만). PKCE 확인. 같은 앱·같은 선생님의 이전 열쇠는 자동으로 끈다.
create or replace function public.mcp_oauth_exchange(p_code text, p_client_id text, p_redirect_uri text, p_verifier text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c ai_oauth_codes%rowtype; v_cl ai_oauth_clients%rowtype;
  v_raw text; v_exp timestamptz := now() + interval '90 days'; v_chk text;
begin
  if p_code is null or p_verifier is null or char_length(p_verifier) not between 43 and 128 then raise exception 'invalid_grant'; end if;
  select * into c from ai_oauth_codes where code_hash = encode(sha256(convert_to(p_code, 'utf8')), 'hex') for update;
  if not found or c.used_at is not null or c.expires_at < now()
     or c.client_id is distinct from p_client_id or c.redirect_uri is distinct from p_redirect_uri then
    raise exception 'invalid_grant';
  end if;
  v_chk := rtrim(translate(encode(sha256(convert_to(p_verifier, 'utf8')), 'base64'), '+/', '-_'), '=');
  if v_chk is distinct from c.code_challenge then raise exception 'invalid_grant'; end if;
  update ai_oauth_codes set used_at = now() where code_hash = c.code_hash;

  select * into v_cl from ai_oauth_clients where client_id = c.client_id;
  update ai_connect_tokens set revoked_at = now()
   where teacher_id = c.teacher_id and client_id = c.client_id and revoked_at is null;
  if (select count(*) from ai_connect_tokens t where t.teacher_id = c.teacher_id and t.revoked_at is null and t.expires_at > now()) >= 5 then
    raise exception 'too_many_tokens';
  end if;
  v_raw := 'clk_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into ai_connect_tokens (teacher_id, name, token_hash, last4, scope, expires_at, client_id)
  values (c.teacher_id, left(coalesce(v_cl.client_name, '외부 AI'), 40), encode(sha256(convert_to(v_raw, 'utf8')), 'hex'),
          right(v_raw, 4), c.scope, v_exp, c.client_id);
  return jsonb_build_object('access_token', v_raw, 'token_type', 'Bearer',
    'expires_in', 90 * 24 * 3600, 'scope', c.scope);
end $$;

-- ───────────────────────── 4. 선생님이 쓰는 기능 (승인 화면, 로그인 필요) ─────────────────────────
-- 승인 화면에 보여 줄 앱 이름 확인 + 되돌아올 주소가 등록된 것과 같은지 검사
create or replace function public.oauth_client_info(p_client_id text, p_redirect_uri text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_cl ai_oauth_clients%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_cl from ai_oauth_clients where client_id = p_client_id;
  if not found or not (p_redirect_uri = any (v_cl.redirect_uris)) then raise exception 'invalid_client'; end if;
  return jsonb_build_object('name', v_cl.client_name);
end $$;

-- "허용" 누르기: 권한 선택 → 1회용 승인 코드(5분)
create or replace function public.oauth_approve(p_client_id text, p_redirect_uri text, p_code_challenge text, p_scope text)
returns text
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_cl ai_oauth_clients%rowtype; v_raw text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_scope is null or p_scope not in ('read', 'write_create', 'write_edit') then raise exception 'invalid_scope'; end if;
  if p_code_challenge is null or p_code_challenge !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'invalid_request'; end if;
  select * into v_cl from ai_oauth_clients where client_id = p_client_id;
  if not found or not (p_redirect_uri = any (v_cl.redirect_uris)) then raise exception 'invalid_client'; end if;
  if (select count(*) from ai_oauth_codes where teacher_id = v_uid and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'rate_limited';
  end if;
  v_raw := 'occ_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into ai_oauth_codes (code_hash, client_id, teacher_id, scope, redirect_uri, code_challenge, expires_at)
  values (encode(sha256(convert_to(v_raw, 'utf8')), 'hex'), p_client_id, v_uid, p_scope, p_redirect_uri, p_code_challenge,
          now() + interval '5 minutes');
  return v_raw;
end $$;

-- ───────────────────────── 5. 권한 ─────────────────────────
revoke all on function public._oauth_redirect_ok(text) from public, anon, authenticated;
do $$
declare fn text;
begin
  foreach fn in array array['mcp_oauth_register(text,text[])', 'mcp_oauth_exchange(text,text,text,text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
  foreach fn in array array['oauth_client_info(text,text)', 'oauth_approve(text,text,text,text)'] loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end $$;
