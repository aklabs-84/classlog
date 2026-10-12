-- 사업 담당자가 학교 페이지에서 학생 한 명을 명단에서 지우는 창구
-- 적용 순서: INSTRUCTOR_DOCS_SCHEMA.sql → INSTRUCTOR_DOCS_SCHOOL_SCOPE.sql(idoc_is_manager, manager_add_students) → 이 파일
-- 학생 RLS는 배정 강사만 삭제할 수 있어서, 담당자는 이 함수로만 지운다.
-- 담당자 확인: 학생이 속한 반의 학교(school_project_id) 기준 idoc_is_manager

CREATE OR REPLACE FUNCTION public.manager_delete_student(p_student uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_school uuid;
BEGIN
  SELECT c.school_project_id INTO v_school
  FROM public.students s JOIN public.classes c ON c.id = s.class_id
  WHERE s.id = p_student;
  IF v_school IS NULL OR NOT public.idoc_is_manager(v_school) THEN RETURN jsonb_build_object('error','FORBIDDEN'); END IF;
  DELETE FROM public.students WHERE id = p_student;
  RETURN jsonb_build_object('ok', true);
END; $function$;

REVOKE ALL ON FUNCTION public.manager_delete_student(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manager_delete_student(uuid) TO authenticated;
