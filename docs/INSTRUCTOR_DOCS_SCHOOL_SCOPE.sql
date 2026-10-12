-- ══════════════════════════════════════════════════════════
-- 강사 제출 서류: 학교별 서류 + 사업 담당자의 반별 학생 명단 등록
--  · requirements.school_id : NULL = 사업 공통, 값 = 그 학교 전용
--  · instructor_doc_school_settings : 학교별로 '공통 적용(common)' / '학교별 지정(custom)' 선택
--      custom 이면 그 학교 강사에게는 그 학교 전용 서류만 적용(공통 서류 대신)
--  · manager_add_students : 사업 담당자가 반에 학생 명단 등록 (기존 40명 제한 트리거 그대로 적용)
-- ══════════════════════════════════════════════════════════

ALTER TABLE public.instructor_doc_requirements
  ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.school_projects(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_idoc_req_school ON public.instructor_doc_requirements(school_id);

CREATE TABLE IF NOT EXISTS public.instructor_doc_school_settings (
  school_id  uuid PRIMARY KEY REFERENCES public.school_projects(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.school_projects(id) ON DELETE CASCADE,
  mode       text NOT NULL DEFAULT 'common' CHECK (mode IN ('common','custom')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.instructor_doc_school_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS idoc_set_select ON public.instructor_doc_school_settings;
CREATE POLICY idoc_set_select ON public.instructor_doc_school_settings FOR SELECT TO authenticated
  USING (public.idoc_is_manager(project_id) OR public.idoc_is_instructor(project_id));
-- 쓰기 정책 없음: set_school_docs_mode RPC로만

-- 학교의 현재 방식 (설정이 없으면 공통)
CREATE OR REPLACE FUNCTION public.idoc_school_mode(p_school uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE((SELECT mode FROM public.instructor_doc_school_settings WHERE school_id = p_school), 'common'); $$;

-- 이 서류가 지금 로그인한 강사에게 적용되는가 (내가 맡은 반의 학교 기준)
CREATE OR REPLACE FUNCTION public.idoc_applies_to_me(p_project uuid, p_req_school uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.classes c
    JOIN public.school_projects sp ON sp.id = c.school_project_id
    WHERE c.assigned_teacher_id = auth.uid()
      AND c.parent_class_id IS NOT NULL
      AND public.idoc_root_project(c.school_project_id) = public.idoc_root_project(p_project)
      AND (
        (public.idoc_school_mode(CASE WHEN sp.parent_project_id IS NOT NULL THEN sp.id END) = 'custom'
           AND p_req_school IS NOT NULL AND p_req_school = sp.id)
        OR
        (public.idoc_school_mode(CASE WHEN sp.parent_project_id IS NOT NULL THEN sp.id END) <> 'custom'
           AND p_req_school IS NULL)
      )
  );
$$;

-- 서류 읽기: 담당자는 전부, 강사는 나에게 적용되는 것만
DROP POLICY IF EXISTS idoc_req_select ON public.instructor_doc_requirements;
CREATE POLICY idoc_req_select ON public.instructor_doc_requirements FOR SELECT TO authenticated
  USING (public.idoc_is_manager(project_id)
         OR (public.idoc_is_instructor(project_id) AND public.idoc_applies_to_me(project_id, school_id)));

-- 서류 추가 시 school_id 가 이 프로젝트의 학교인지 검증
CREATE OR REPLACE FUNCTION public.idoc_school_belongs(p_project uuid, p_school uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT p_school IS NULL OR EXISTS (
  SELECT 1 FROM public.school_projects sp
  WHERE sp.id = p_school AND sp.parent_project_id = public.idoc_root_project(p_project)); $$;

DROP POLICY IF EXISTS idoc_req_insert ON public.instructor_doc_requirements;
CREATE POLICY idoc_req_insert ON public.instructor_doc_requirements FOR INSERT TO authenticated
  WITH CHECK (public.idoc_is_manager(project_id) AND public.idoc_school_belongs(project_id, school_id));
DROP POLICY IF EXISTS idoc_req_update ON public.instructor_doc_requirements;
CREATE POLICY idoc_req_update ON public.instructor_doc_requirements FOR UPDATE TO authenticated
  USING (public.idoc_is_manager(project_id))
  WITH CHECK (public.idoc_is_manager(project_id) AND public.idoc_school_belongs(project_id, school_id));

-- 강사 제출: 나에게 적용되는 서류만 제출 가능
CREATE OR REPLACE FUNCTION public.idoc_check_applies(p_requirement uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.instructor_doc_requirements r
  WHERE r.id = p_requirement AND public.idoc_applies_to_me(r.project_id, r.school_id)); $$;

DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.submit_instructor_doc(uuid,text,text,boolean,text,text,text)'::regprocedure);
  IF position('idoc_applies_to_me' IN d) = 0 THEN
    d := replace(d,
      E'IF NOT public.idoc_is_instructor(r.project_id) THEN RETURN jsonb_build_object(''error'',''NOT_INSTRUCTOR''); END IF;',
      E'IF NOT public.idoc_is_instructor(r.project_id) OR NOT public.idoc_applies_to_me(r.project_id, r.school_id) THEN RETURN jsonb_build_object(''error'',''NOT_INSTRUCTOR''); END IF;');
    EXECUTE d;
  END IF;
END $$;

-- 학교 방식 바꾸기 (담당자만)
CREATE OR REPLACE FUNCTION public.set_school_docs_mode(p_school uuid, p_mode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_root uuid;
BEGIN
  IF p_mode NOT IN ('common','custom') THEN RETURN jsonb_build_object('error','INVALID_MODE'); END IF;
  SELECT parent_project_id INTO v_root FROM public.school_projects WHERE id = p_school;
  IF v_root IS NULL OR NOT public.idoc_is_manager(v_root) THEN RETURN jsonb_build_object('error','FORBIDDEN'); END IF;
  INSERT INTO public.instructor_doc_school_settings (school_id, project_id, mode)
  VALUES (p_school, v_root, p_mode)
  ON CONFLICT (school_id) DO UPDATE SET mode = EXCLUDED.mode, updated_at = now();
  RETURN jsonb_build_object('ok', true);
END; $$;

-- 사업 담당자가 반에 학생 명단 등록: p_students = [{"name":"홍길동","number":"1"}, ...]
CREATE OR REPLACE FUNCTION public.manager_add_students(p_class uuid, p_students jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_school uuid; v_n integer;
BEGIN
  SELECT school_project_id INTO v_school FROM public.classes WHERE id = p_class;
  IF v_school IS NULL OR NOT public.idoc_is_manager(v_school) THEN RETURN jsonb_build_object('error','FORBIDDEN'); END IF;
  IF jsonb_typeof(p_students) <> 'array' OR jsonb_array_length(p_students) = 0 OR jsonb_array_length(p_students) > 100 THEN
    RETURN jsonb_build_object('error','INVALID_LIST'); END IF;
  INSERT INTO public.students (class_id, full_name, student_number, tag)
  SELECT p_class, left(trim(e->>'name'), 50), nullif(left(trim(e->>'number'), 10), ''), '학생'
  FROM jsonb_array_elements(p_students) e
  WHERE coalesce(trim(e->>'name'), '') <> '';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'added', v_n);
END; $$;

REVOKE ALL ON FUNCTION public.idoc_school_mode(uuid), public.idoc_applies_to_me(uuid,uuid), public.idoc_school_belongs(uuid,uuid),
  public.idoc_check_applies(uuid), public.set_school_docs_mode(uuid,text), public.manager_add_students(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.idoc_school_mode(uuid), public.idoc_applies_to_me(uuid,uuid), public.idoc_school_belongs(uuid,uuid),
  public.idoc_check_applies(uuid), public.set_school_docs_mode(uuid,text), public.manager_add_students(uuid,jsonb) TO authenticated;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.instructor_doc_school_settings;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
