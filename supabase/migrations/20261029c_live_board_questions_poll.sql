-- 실시간 참여 게시판: 질문 여러 장(글로 답하기/투표하기) 돌려쓰기 + 복수 선택 투표
-- 더하기 위주 설계: 기존 live_boards.question 칸과 옛 화면(question_id 없이 제출)도 그대로 동작한다.

create table if not exists public.live_board_questions (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.live_boards(id) on delete cascade,
  position int not null,
  kind text not null default 'text' check (kind in ('text', 'poll')),
  question text not null check (char_length(question) <= 200),
  options jsonb,
  allow_multiple boolean not null default false,
  created_at timestamptz not null default now(),
  unique (board_id, position),
  constraint live_board_questions_poll_options check (
    kind = 'text'
    or (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 8)
  )
);

alter table public.live_board_questions enable row level security;

drop policy if exists "teacher manages own live_board_questions" on public.live_board_questions;
create policy "teacher manages own live_board_questions" on public.live_board_questions
  for all to authenticated
  using (exists (select 1 from public.live_boards b where b.id = board_id and b.teacher_id = auth.uid()))
  with check (exists (select 1 from public.live_boards b where b.id = board_id and b.teacher_id = auth.uid()));

-- 학생(익명 로그인 포함)은 질문 카드를 읽기만 한다. 코드를 아는 사람만 보드 id를 알 수 있다.
drop policy if exists "authenticated read live_board_questions" on public.live_board_questions;
create policy "authenticated read live_board_questions" on public.live_board_questions
  for select to authenticated using (true);

alter table public.live_boards
  add column if not exists current_question_id uuid references public.live_board_questions(id) on delete set null;

alter table public.live_board_responses
  add column if not exists question_id uuid references public.live_board_questions(id) on delete cascade,
  add column if not exists choices smallint[];

-- 기존 게시판 → 1번 카드로 이관
insert into public.live_board_questions (board_id, position, kind, question)
select b.id, 1, 'text', b.question
from public.live_boards b
where not exists (select 1 from public.live_board_questions q where q.board_id = b.id);

update public.live_boards b
set current_question_id = q.id
from public.live_board_questions q
where q.board_id = b.id and q.position = 1 and b.current_question_id is null;

update public.live_board_responses r
set question_id = b.current_question_id
from public.live_boards b
where b.id = r.board_id and r.question_id is null;

-- 유니크 키: 게시판당 1번 → 질문당 1번
alter table public.live_board_responses drop constraint if exists live_board_responses_board_id_student_user_id_key;
alter table public.live_board_responses
  add constraint live_board_responses_question_student_key unique (question_id, student_user_id);
create index if not exists live_board_responses_board_question_idx on public.live_board_responses (board_id, question_id);

-- 새 게시판이 만들어지면 입력한 질문을 자동으로 1번 카드(글로 답하기)로 만든다.
-- (옛 화면에서 만들어도 동작하고, 새 화면은 이 카드를 투표용으로 고쳐 쓴다)
create or replace function public.live_board_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare qid uuid;
begin
  if new.current_question_id is null then
    insert into live_board_questions (board_id, position, kind, question)
    values (new.id, 1, 'text', new.question)
    returning id into qid;
    update live_boards set current_question_id = qid where id = new.id;
  end if;
  return null;
end $$;

drop trigger if exists trg_live_board_after_insert on public.live_boards;
create trigger trg_live_board_after_insert
  after insert on public.live_boards
  for each row execute function public.live_board_after_insert();

-- 답변 제출 검사: 지금 열린 질문에만, 질문 종류에 맞는 형식으로만
create or replace function public.live_board_response_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cur uuid;
  q live_board_questions%rowtype;
  n int;
begin
  select current_question_id into cur from live_boards where id = new.board_id;
  if new.question_id is null then
    new.question_id := cur;  -- 옛 화면 호환
  end if;
  if new.question_id is distinct from cur then
    raise exception '지금 열려 있는 질문이 아닙니다' using errcode = '42501';
  end if;
  select * into q from live_board_questions where id = new.question_id and board_id = new.board_id;
  if not found then
    raise exception '질문을 찾을 수 없습니다' using errcode = '23503';
  end if;

  if q.kind = 'poll' then
    n := jsonb_array_length(q.options);
    if new.choices is null or coalesce(array_length(new.choices, 1), 0) = 0 then
      raise exception '보기를 하나 이상 골라주세요' using errcode = '23514';
    end if;
    if (select count(distinct c) from unnest(new.choices) c) <> array_length(new.choices, 1) then
      raise exception '같은 보기를 중복해서 고를 수 없습니다' using errcode = '23514';
    end if;
    if exists (select 1 from unnest(new.choices) c where c < 0 or c >= n) then
      raise exception '없는 보기입니다' using errcode = '23514';
    end if;
    if not q.allow_multiple and array_length(new.choices, 1) <> 1 then
      raise exception '하나만 고를 수 있습니다' using errcode = '23514';
    end if;
    new.content := '';
  else
    new.choices := null;
    if char_length(btrim(coalesce(new.content, ''))) = 0 then
      raise exception '답변을 입력해주세요' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_live_board_response_before_insert on public.live_board_responses;
create trigger trg_live_board_response_before_insert
  before insert on public.live_board_responses
  for each row execute function public.live_board_response_before_insert();

alter table public.live_board_responses alter column question_id set not null;

-- 코드 입장 함수에 "지금 질문" 알려주기 (칸을 더하기만 해서 옛 화면도 안전)
drop function if exists public.get_live_board_by_code(text);
create function public.get_live_board_by_code(p_code text)
returns table(id uuid, question text, is_open boolean, expired boolean, current_question_id uuid)
language sql security definer set search_path to 'public' as $$
  select id, question, is_open, (expires_at < now()) as expired, current_question_id
  from public.live_boards
  where code = p_code;
$$;
grant execute on function public.get_live_board_by_code(text) to anon, authenticated;

-- 학생이 선생님의 질문 전환을 놓쳤을 때(새로고침·재접속) 지금 질문을 다시 알아내는 함수
create or replace function public.get_live_board_state(p_board_id uuid)
returns table(is_open boolean, expired boolean, current_question_id uuid)
language sql security definer set search_path to 'public' as $$
  select is_open, (expires_at < now()) as expired, current_question_id
  from public.live_boards where id = p_board_id;
$$;
grant execute on function public.get_live_board_state(uuid) to anon, authenticated;
