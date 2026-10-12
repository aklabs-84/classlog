-- 사업 담당자가 만든 퀴즈를 선택한 반의 담당 강사에게 "복사본"으로 보내는 창구
-- 적용 순서: INSTRUCTOR_DOCS_SCHOOL_SCOPE.sql(idoc_is_manager) → 이 파일
-- 복사본은 반마다 따로 진행·채점된다. source_set_id로 같은 반에 중복 전송을 막는다.
-- (이미 DB에는 migration manager_send_quiz 로 적용됨. 함수 본문은 DB에서 확인: select pg_get_functiondef('public.manager_send_quiz(uuid,uuid[])'::regprocedure);)
ALTER TABLE public.quiz_sets ADD COLUMN IF NOT EXISTS source_set_id uuid;
-- manager_send_quiz(p_set uuid, p_classes uuid[]) RETURNS jsonb  -- SECURITY DEFINER, authenticated만 실행
--   검사: 내 퀴즈인가 / 반마다 담당 강사 배정+내가 그 학교 담당자인가 / 최대 100개 반
--   결과: {ok:true, sent:N, skipped:M} 또는 {error:'FORBIDDEN'|'INVALID_LIST'}
-- (2026-10-12 추가, migration manager_send_notify_teacher) 보낸 반마다 받는 강사에게 notifications 알림 1건 생성(type 'material_received', link '/teaching-tools'). 건너뛴 반은 알림 없음.
