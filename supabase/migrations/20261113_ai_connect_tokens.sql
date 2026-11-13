-- AI 연결(MCP) 1단계: 연결 키 + 사용 기록 + 읽기 전용 조회 기능
-- 원칙
--  * 열쇠 원본은 저장하지 않고 지문(sha256)만 저장한다. 원본은 만들 때 한 번만 돌려준다.
--  * 두 테이블 모두 보안 규칙을 켜고 정책을 만들지 않는다(= 화면에서 직접 접근 불가). 아래 기능으로만 다룬다.
--  * 조회 기능(mcp_*)은 service_role(= mcp 창구 함수)만 부를 수 있고,
--    기능 안에서 열쇠 지문 -> 선생님을 찾아 그 선생님 자료만 고른다.
--  * 삭제 기능은 만들지 않는다. 학생 정보는 다루지 않는다.

-- ───────────────────────── 1. 테이블 ─────────────────────────
create table if not exists public.ai_connect_tokens (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references auth.users(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 40),
  token_hash   text not null unique,
  last4        text not null,
  scope        text not null default 'read' check (scope in ('read', 'write')),
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  last_used_at timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists ai_connect_tokens_teacher_idx on public.ai_connect_tokens (teacher_id);

create table if not exists public.ai_connect_log (
  id         bigint generated always as identity primary key,
  token_id   uuid not null references public.ai_connect_tokens(id) on delete cascade,
  teacher_id uuid not null,
  tool       text not null,
  ok         boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_connect_log_token_time_idx on public.ai_connect_log (token_id, created_at desc);
create index if not exists ai_connect_log_created_idx on public.ai_connect_log (created_at);

alter table public.ai_connect_tokens enable row level security;
alter table public.ai_connect_log enable row level security;
revoke all on public.ai_connect_tokens from anon, authenticated;
revoke all on public.ai_connect_log from anon, authenticated;

-- ───────────────────────── 2. 선생님이 쓰는 기능 (설정 화면) ─────────────────────────
-- 열쇠 만들기: 원본은 이 호출의 결과로 딱 한 번만 돌려준다.
create or replace function public.create_ai_connect_token(p_name text, p_days int default 90)
returns table (id uuid, token text, last4 text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_raw text;
  v_days int := least(greatest(coalesce(p_days, 90), 1), 365);
  v_id uuid;
  v_exp timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_name is null or char_length(btrim(p_name)) = 0 then raise exception 'name_required'; end if;
  if (select count(*) from ai_connect_tokens t
        where t.teacher_id = v_uid and t.revoked_at is null and t.expires_at > now()) >= 5 then
    raise exception 'too_many_tokens';
  end if;
  v_raw := 'clk_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_exp := now() + make_interval(days => v_days);
  insert into ai_connect_tokens (teacher_id, name, token_hash, last4, scope, expires_at)
  values (v_uid, left(btrim(p_name), 40), encode(sha256(convert_to(v_raw, 'utf8')), 'hex'), right(v_raw, 4), 'read', v_exp)
  returning ai_connect_tokens.id into v_id;
  return query select v_id, v_raw, right(v_raw, 4), v_exp;
end $$;

-- 열쇠 끄기(본인 것만)
create or replace function public.revoke_ai_connect_token(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update ai_connect_tokens set revoked_at = now()
   where id = p_id and teacher_id = auth.uid() and revoked_at is null;
end $$;

-- 열쇠 목록(지문·원본 없음)
create or replace function public.list_ai_connect_tokens()
returns table (id uuid, name text, last4 text, scope text, expires_at timestamptz,
               revoked_at timestamptz, last_used_at timestamptz, created_at timestamptz)
language sql security definer set search_path = public as $$
  select t.id, t.name, t.last4, t.scope, t.expires_at, t.revoked_at, t.last_used_at, t.created_at
    from ai_connect_tokens t
   where t.teacher_id = auth.uid()
   order by t.created_at desc;
$$;

revoke all on function public.create_ai_connect_token(text, int) from public, anon;
revoke all on function public.revoke_ai_connect_token(uuid) from public, anon;
revoke all on function public.list_ai_connect_tokens() from public, anon;
grant execute on function public.create_ai_connect_token(text, int) to authenticated;
grant execute on function public.revoke_ai_connect_token(uuid) to authenticated;
grant execute on function public.list_ai_connect_tokens() to authenticated;

-- ───────────────────────── 3. 창구 전용 기능 (service_role만) ─────────────────────────
-- 안쪽 도우미: 지문 -> 선생님. 끈/만료된 열쇠는 null.
create or replace function public._mcp_teacher(p_hash text)
returns uuid
language sql stable security definer set search_path = public as $$
  select t.teacher_id from ai_connect_tokens t
   where t.token_hash = p_hash and t.revoked_at is null and t.expires_at > now()
   limit 1;
$$;

-- 열쇠 확인 + 분당 60회 제한 + 마지막 사용 시각(1분에 한 번만 갱신해 쓰기 줄이기)
create or replace function public.mcp_auth(p_hash text)
returns table (token_id uuid, teacher_id uuid, scope text)
language plpgsql security definer set search_path = public as $$
declare r ai_connect_tokens%rowtype;
begin
  select * into r from ai_connect_tokens t
   where t.token_hash = p_hash and t.revoked_at is null and t.expires_at > now();
  if not found then return; end if;
  if (select count(*) from ai_connect_log l
        where l.token_id = r.id and l.created_at > now() - interval '1 minute') >= 60 then
    raise exception 'rate_limited';
  end if;
  if r.last_used_at is null or r.last_used_at < now() - interval '1 minute' then
    update ai_connect_tokens set last_used_at = now() where id = r.id;
  end if;
  return query select r.id, r.teacher_id, r.scope;
end $$;

create or replace function public.mcp_log(p_token_id uuid, p_tool text, p_ok boolean)
returns void
language sql security definer set search_path = public as $$
  insert into ai_connect_log (token_id, teacher_id, tool, ok)
  select t.id, t.teacher_id, left(p_tool, 60), p_ok from ai_connect_tokens t where t.id = p_token_id;
$$;

-- 반 목록 (본인이 만든 반만)
create or replace function public.mcp_list_classes(p_hash text, p_limit int default 50)
returns table (id uuid, name text, subject text, is_archived boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.subject, c.is_archived, c.created_at
    from classes c
   where c.teacher_id = public._mcp_teacher(p_hash)
   order by c.created_at desc
   limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

-- 자료 폴더
create or replace function public.mcp_list_folders(p_hash text)
returns table (id uuid, name text, parent_id uuid, class_id uuid)
language sql stable security definer set search_path = public as $$
  select f.id, f.name, f.parent_id, f.class_id
    from material_folders f
   where f.teacher_id = public._mcp_teacher(p_hash)
   order by f.name
   limit 300;
$$;

-- 자료 목록: 제목·날짜·글자 수만 (본문 없음)
create or replace function public.mcp_list_materials(
  p_hash text, p_folder uuid default null, p_class uuid default null,
  p_limit int default 30, p_offset int default 0)
returns table (id uuid, title text, week_number int, class_id uuid, folder_id uuid,
               is_published boolean, chars int, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  with me as (select public._mcp_teacher(p_hash) as tid)
  select m.id, m.title, m.week_number, m.class_id, m.folder_id, m.is_published,
         coalesce(length(m.content), 0), m.updated_at
    from class_materials m, me
   where me.tid is not null
     and (m.teacher_id = me.tid or m.class_id in (select c.id from classes c where c.teacher_id = me.tid))
     and (p_folder is null or m.folder_id = p_folder)
     and (p_class is null or m.class_id = p_class)
   order by m.updated_at desc nulls last
   limit least(greatest(coalesce(p_limit, 30), 1), 100)
   offset greatest(coalesce(p_offset, 0), 0);
$$;

-- 자료 본문: 길면 조각으로 (기본 3만자씩)
create or replace function public.mcp_get_material(p_hash text, p_id uuid, p_offset int default 0, p_max int default 30000)
returns table (id uuid, title text, week_number int, class_id uuid, content text,
               total_chars int, from_char int, has_more boolean)
language sql stable security definer set search_path = public as $$
  with me as (select public._mcp_teacher(p_hash) as tid), q as (
    select least(greatest(coalesce(p_max, 30000), 1000), 60000) as mx, greatest(coalesce(p_offset, 0), 0) as off
  )
  select m.id, m.title, m.week_number, m.class_id,
         substr(coalesce(m.content, ''), q.off + 1, q.mx),
         coalesce(length(m.content), 0), q.off,
         (q.off + q.mx) < coalesce(length(m.content), 0)
    from class_materials m, me, q
   where me.tid is not null and m.id = p_id
     and (m.teacher_id = me.tid or m.class_id in (select c.id from classes c where c.teacher_id = me.tid));
$$;

-- 슬라이드 목록: 제목·장 수만
create or replace function public.mcp_list_slide_decks(p_hash text, p_limit int default 30)
returns table (id uuid, title text, class_id uuid, slide_count int, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select d.id, d.title, d.class_id, jsonb_array_length(d.slides), d.updated_at
    from slide_decks d
   where d.teacher_id = public._mcp_teacher(p_hash)
   order by d.updated_at desc
   limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

-- 슬라이드 본문: 장 단위(기본 3장), 이미지 데이터(data:image...)는 생략 표시
create or replace function public.mcp_get_slide_deck(p_hash text, p_id uuid, p_from int default 0, p_count int default 3)
returns table (id uuid, title text, slide_count int, from_slide int, slides jsonb)
language sql stable security definer set search_path = public as $$
  with me as (select public._mcp_teacher(p_hash) as tid), q as (
    select greatest(coalesce(p_from, 0), 0) as f, least(greatest(coalesce(p_count, 3), 1), 10) as n
  )
  select d.id, d.title, jsonb_array_length(d.slides), q.f,
         coalesce((
           select jsonb_agg(regexp_replace(e.value::text, '"data:image[^"]*"', '"[이미지 생략]"', 'g')::jsonb order by e.ord)
             from jsonb_array_elements(d.slides) with ordinality as e(value, ord)
            where e.ord > q.f and e.ord <= q.f + q.n
         ), '[]'::jsonb)
    from slide_decks d, me, q
   where me.tid is not null and d.id = p_id and d.teacher_id = me.tid;
$$;

-- 수업 계획서
create or replace function public.mcp_list_lesson_plans(p_hash text, p_limit int default 30)
returns table (id uuid, class_id uuid, purpose text, title text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.class_id, p.purpose, p.sections -> 'basicInfo' ->> 'title', p.updated_at
    from lesson_plans p
   where p.teacher_id = public._mcp_teacher(p_hash)
   order by p.updated_at desc
   limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

create or replace function public.mcp_get_lesson_plan(p_hash text, p_id uuid)
returns table (id uuid, class_id uuid, purpose text, include_standards boolean, sections jsonb, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.class_id, p.purpose, p.include_standards, p.sections, p.updated_at
    from lesson_plans p
   where p.teacher_id = public._mcp_teacher(p_hash) and p.id = p_id;
$$;

-- 창구(service_role) 전용으로 잠그기
do $$
declare f text;
begin
  foreach f in array array[
    '_mcp_teacher(text)', 'mcp_auth(text)', 'mcp_log(uuid,text,boolean)',
    'mcp_list_classes(text,int)', 'mcp_list_folders(text)',
    'mcp_list_materials(text,uuid,uuid,int,int)', 'mcp_get_material(text,uuid,int,int)',
    'mcp_list_slide_decks(text,int)', 'mcp_get_slide_deck(text,uuid,int,int)',
    'mcp_list_lesson_plans(text,int)', 'mcp_get_lesson_plan(text,uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
