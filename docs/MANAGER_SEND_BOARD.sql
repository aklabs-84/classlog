-- 사업 담당자가 만든 화이트보드를 반별 "보드 틀"(복사본)로 보내는 창구
-- 적용 순서: INSTRUCTOR_DOCS_SCHOOL_SCOPE.sql(idoc_is_manager) → 이 파일 (DB에는 migration manager_send_board 로 적용됨)
-- whiteboards 에 is_template(받은 틀 표시), source_board_id(원본, 중복 전송 방지) 추가
-- manager_send_board(p_board uuid, p_classes uuid[]) → {ok, sent, skipped} | {error}
-- 함수 본문 확인: select pg_get_functiondef('public.manager_send_board(uuid,uuid[])'::regprocedure);

-- 담당자용 진행 보기 (읽기 전용): manager_distribution_status(p_schools uuid[]) → {ok, quizzes[], boards[]}
-- 퀴즈: 반별 진행 횟수·참여 기록·마지막 진행 / 보드: 틀을 받은 뒤 그 반에서 만든 조 보드 수. 담당자가 아닌 학교는 결과에서 빠진다.
