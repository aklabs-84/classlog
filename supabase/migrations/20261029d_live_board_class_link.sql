-- 실시간 참여 게시판을 클래스(학급)에 연결: 연결된 반 학생 화면에 "진행 중인 게시판" 입장 칸이 켜진다.
-- 더하기 위주: class_id가 비어 있으면(연결 안 함) 예전처럼 코드로만 입장한다.

alter table public.live_boards
  add column if not exists class_id uuid references public.classes(id) on delete set null;

create index if not exists live_boards_class_idx on public.live_boards (class_id) where class_id is not null;

-- 내 클래스(담임/배정 교사)이거나 그 클래스가 가리키는 담임반(linked_class_id)에만 연결 가능
create or replace function public.live_board_check_class()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.class_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.class_id is not distinct from old.class_id then return new; end if;
  if not exists (
    select 1 from classes x
    where (x.teacher_id = auth.uid() or x.assigned_teacher_id = auth.uid())
      and (x.id = new.class_id or x.linked_class_id = new.class_id)
  ) then
    raise exception '내 클래스에만 연결할 수 있습니다' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_live_board_check_class on public.live_boards;
create trigger trg_live_board_check_class
  before insert or update of class_id on public.live_boards
  for each row execute function public.live_board_check_class();

-- 학생(토큰 로그인): 우리 반에 연결된, 아직 끝나지 않은 게시판 목록
create or replace function public.student_active_live_boards(p_token uuid)
returns jsonb
language plpgsql stable security definer set search_path to ''
as $$
declare v_sid uuid; v_class uuid;
begin
  v_sid := public._student_from_token(p_token);
  if v_sid is null then raise exception 'STUDENT_TOKEN_INVALID'; end if;
  select class_id into v_class from public.students where id = v_sid;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', b.id, 'code', b.code, 'question', b.question, 'is_open', b.is_open,
      'kind', coalesce(q.kind, 'text'), 'created_at', b.created_at
    ) order by b.created_at desc), '[]'::jsonb)
    from public.live_boards b
    left join public.live_board_questions q on q.id = b.current_question_id
    where b.class_id = v_class and b.ended_at is null and b.expires_at > now()
  );
end $$;
revoke all on function public.student_active_live_boards(uuid) from public;
grant execute on function public.student_active_live_boards(uuid) to anon, authenticated;
