-- ══════════════════════════════════════════════════════════
-- 강사 제출 서류 (프로젝트별 서류 정의 + 강사 제출 기록)
-- 프로젝트 담당자가 필요한 서류를 정하고, 배정 강사가 파일/동의/서명으로 제출
-- Supabase SQL Editor 또는 apply_migration 으로 실행 (승인 후)
--
-- 서류 종류(kind)
--   file          : 파일 올리기 (PDF/HWP/HWPX/JPG/PNG, 10MB)
--   consent       : 동의 체크 (동의문 표시)
--   signature     : 동의 서명 (서약 문구 + 손서명 이미지)
--   contract_sign : 계약서 직접 서명 (담당자가 올린 PDF에 서명을 찍은 서명본 PDF 생성)
--
-- 기존 profiles.instructor_checklist (설정 화면 체크리스트)는 건드리지 않음
-- ══════════════════════════════════════════════════════════

-- 1. 프로젝트 최상위 id 찾기 (학교 단위 행이면 부모 프로젝트로 올라감)
CREATE OR REPLACE FUNCTION public.idoc_root_project(p_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(sp.parent_project_id, sp.id) FROM public.school_projects sp WHERE sp.id = p_id;
$$;

-- 2. 이 프로젝트의 담당자인가 (프로젝트 만든 관리자 또는 플랫폼 관리자)
CREATE OR REPLACE FUNCTION public.idoc_is_manager(p_project uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.school_projects sp
    WHERE sp.id = public.idoc_root_project(p_project) AND sp.admin_id = auth.uid()
  );
$$;

-- 3. 이 프로젝트에 배정된 강사인가 (하위 반의 담당 강사)
CREATE OR REPLACE FUNCTION public.idoc_is_instructor(p_project uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.assigned_teacher_id = auth.uid()
      AND c.parent_class_id IS NOT NULL
      AND public.idoc_root_project(c.school_project_id) = public.idoc_root_project(p_project)
  );
$$;

-- 4. 서류 정의 표
CREATE TABLE IF NOT EXISTS public.instructor_doc_requirements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES public.school_projects(id) ON DELETE CASCADE,
  title         text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  description   text,                       -- 발급/작성 방법 안내
  kind          text NOT NULL CHECK (kind IN ('file','consent','signature','contract_sign')),
  consent_text  text,                       -- consent/signature 의 동의문·서약 문구
  form_path     text,                       -- 담당자가 붙인 양식 파일 (강사가 내려받음)
  form_name     text,
  contract_path text,                       -- contract_sign 대상 계약서 PDF
  contract_name text,
  required      boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_idoc_req_project ON public.instructor_doc_requirements(project_id, sort_order);

-- 5. 제출 기록 표 (서류 × 강사 1건)
CREATE TABLE IF NOT EXISTS public.instructor_doc_submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id  uuid NOT NULL REFERENCES public.instructor_doc_requirements(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES public.school_projects(id) ON DELETE CASCADE,
  instructor_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','rejected')),
  file_path       text,
  file_name       text,
  consent_checked boolean,
  signature_path  text,                     -- 손서명 PNG
  signed_pdf_path text,                     -- 계약서 서명본 PDF
  signed_name     text,
  signed_at       timestamptz,
  review_note     text,
  reviewed_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at     timestamptz,
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requirement_id, instructor_id)
);
CREATE INDEX IF NOT EXISTS idx_idoc_sub_project ON public.instructor_doc_submissions(project_id);
CREATE INDEX IF NOT EXISTS idx_idoc_sub_instructor ON public.instructor_doc_submissions(instructor_id);

ALTER TABLE public.instructor_doc_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instructor_doc_submissions  ENABLE ROW LEVEL SECURITY;

-- 6. 서류 정의: 담당자는 전부, 배정 강사는 읽기만
DROP POLICY IF EXISTS idoc_req_select ON public.instructor_doc_requirements;
CREATE POLICY idoc_req_select ON public.instructor_doc_requirements FOR SELECT TO authenticated
  USING (public.idoc_is_manager(project_id) OR public.idoc_is_instructor(project_id));

DROP POLICY IF EXISTS idoc_req_insert ON public.instructor_doc_requirements;
CREATE POLICY idoc_req_insert ON public.instructor_doc_requirements FOR INSERT TO authenticated
  WITH CHECK (public.idoc_is_manager(project_id));

DROP POLICY IF EXISTS idoc_req_update ON public.instructor_doc_requirements;
CREATE POLICY idoc_req_update ON public.instructor_doc_requirements FOR UPDATE TO authenticated
  USING (public.idoc_is_manager(project_id)) WITH CHECK (public.idoc_is_manager(project_id));

DROP POLICY IF EXISTS idoc_req_delete ON public.instructor_doc_requirements;
CREATE POLICY idoc_req_delete ON public.instructor_doc_requirements FOR DELETE TO authenticated
  USING (public.idoc_is_manager(project_id));

-- 7. 제출 기록: 읽기는 본인 또는 담당자. 쓰기는 아래 RPC로만 (직접 INSERT/UPDATE 정책 없음)
DROP POLICY IF EXISTS idoc_sub_select ON public.instructor_doc_submissions;
CREATE POLICY idoc_sub_select ON public.instructor_doc_submissions FOR SELECT TO authenticated
  USING (instructor_id = auth.uid() OR public.idoc_is_manager(project_id));

-- 8. 기본 서류 4개 채우기 (서류가 하나도 없을 때만, 담당자만)
CREATE OR REPLACE FUNCTION public.seed_default_instructor_docs(p_project uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_root uuid := public.idoc_root_project(p_project);
BEGIN
  IF v_root IS NULL OR NOT public.idoc_is_manager(v_root) THEN RETURN 0; END IF;
  IF EXISTS (SELECT 1 FROM public.instructor_doc_requirements WHERE project_id = v_root) THEN RETURN 0; END IF;
  INSERT INTO public.instructor_doc_requirements (project_id, title, kind, required, sort_order) VALUES
    (v_root, '오리엔테이션 이수증', 'file', true, 1),
    (v_root, '안전 교육 이수증', 'file', true, 2),
    (v_root, '계약서', 'file', true, 3),
    (v_root, '성범죄경력 및 아동학대 범죄전력조회 회신서(본인)', 'file', true, 4);
  RETURN 4;
END; $$;

-- 9. 강사 제출 (파일 경로 소유 검증 포함)
CREATE OR REPLACE FUNCTION public.submit_instructor_doc(
  p_requirement uuid,
  p_file_path text DEFAULT NULL, p_file_name text DEFAULT NULL,
  p_consent boolean DEFAULT NULL,
  p_signature_path text DEFAULT NULL, p_signed_pdf_path text DEFAULT NULL,
  p_signed_name text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r public.instructor_doc_requirements%ROWTYPE;
  v_prefix text;
  v_old public.instructor_doc_submissions%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.instructor_doc_requirements WHERE id = p_requirement;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','NOT_FOUND'); END IF;
  IF NOT public.idoc_is_instructor(r.project_id) THEN RETURN jsonb_build_object('error','NOT_INSTRUCTOR'); END IF;

  SELECT * INTO v_old FROM public.instructor_doc_submissions
   WHERE requirement_id = r.id AND instructor_id = auth.uid();
  IF FOUND AND v_old.status = 'approved' THEN RETURN jsonb_build_object('error','ALREADY_APPROVED'); END IF;

  v_prefix := r.project_id::text || '/' || auth.uid()::text || '/';

  IF r.kind = 'file' THEN
    IF p_file_path IS NULL OR p_file_name IS NULL OR left(p_file_path, length(v_prefix)) <> v_prefix THEN
      RETURN jsonb_build_object('error','INVALID_FILE'); END IF;
  ELSIF r.kind = 'consent' THEN
    IF p_consent IS DISTINCT FROM true THEN RETURN jsonb_build_object('error','CONSENT_REQUIRED'); END IF;
  ELSIF r.kind = 'signature' THEN
    IF p_consent IS DISTINCT FROM true OR coalesce(trim(p_signed_name),'') = ''
       OR p_signature_path IS NULL OR left(p_signature_path, length(v_prefix)) <> v_prefix THEN
      RETURN jsonb_build_object('error','SIGNATURE_REQUIRED'); END IF;
  ELSIF r.kind = 'contract_sign' THEN
    IF coalesce(trim(p_signed_name),'') = ''
       OR p_signature_path IS NULL OR left(p_signature_path, length(v_prefix)) <> v_prefix
       OR p_signed_pdf_path IS NULL OR left(p_signed_pdf_path, length(v_prefix)) <> v_prefix THEN
      RETURN jsonb_build_object('error','SIGNATURE_REQUIRED'); END IF;
  END IF;

  INSERT INTO public.instructor_doc_submissions AS s
    (requirement_id, project_id, instructor_id, status, file_path, file_name, consent_checked,
     signature_path, signed_pdf_path, signed_name, signed_at, submitted_at)
  VALUES
    (r.id, r.project_id, auth.uid(), 'submitted', p_file_path, p_file_name, p_consent,
     p_signature_path, p_signed_pdf_path, nullif(trim(p_signed_name),''),
     CASE WHEN r.kind IN ('signature','contract_sign') THEN now() END, now())
  ON CONFLICT (requirement_id, instructor_id) DO UPDATE SET
    status = 'submitted', file_path = EXCLUDED.file_path, file_name = EXCLUDED.file_name,
    consent_checked = EXCLUDED.consent_checked, signature_path = EXCLUDED.signature_path,
    signed_pdf_path = EXCLUDED.signed_pdf_path, signed_name = EXCLUDED.signed_name,
    signed_at = EXCLUDED.signed_at, submitted_at = now(),
    review_note = NULL, reviewed_by = NULL, reviewed_at = NULL;
  RETURN jsonb_build_object('ok', true);
END; $$;

-- 10. 담당자 확인/반려
CREATE OR REPLACE FUNCTION public.review_instructor_doc(p_submission uuid, p_status text, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_project uuid;
BEGIN
  IF p_status NOT IN ('approved','rejected','submitted') THEN RETURN jsonb_build_object('error','INVALID_STATUS'); END IF;
  SELECT project_id INTO v_project FROM public.instructor_doc_submissions WHERE id = p_submission;
  IF v_project IS NULL OR NOT public.idoc_is_manager(v_project) THEN RETURN jsonb_build_object('error','FORBIDDEN'); END IF;
  UPDATE public.instructor_doc_submissions
     SET status = p_status,
         review_note = CASE WHEN p_status = 'rejected' THEN nullif(trim(p_note),'') ELSE NULL END,
         reviewed_by = CASE WHEN p_status = 'submitted' THEN NULL ELSE auth.uid() END,
         reviewed_at = CASE WHEN p_status = 'submitted' THEN NULL ELSE now() END
   WHERE id = p_submission;
  RETURN jsonb_build_object('ok', true);
END; $$;

REVOKE ALL ON FUNCTION public.seed_default_instructor_docs(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_instructor_doc(uuid,text,text,boolean,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_instructor_doc(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_default_instructor_docs(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_instructor_doc(uuid,text,text,boolean,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_instructor_doc(uuid,text,text) TO authenticated;
-- 헬퍼 함수는 RLS/스토리지 정책에서 쓰이므로 authenticated 에만 허용
REVOKE ALL ON FUNCTION public.idoc_root_project(uuid), public.idoc_is_manager(uuid), public.idoc_is_instructor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.idoc_root_project(uuid), public.idoc_is_manager(uuid), public.idoc_is_instructor(uuid) TO authenticated;

-- 11. 비공개 보관함 (확장자는 정책에서 검사: HWP/HWPX는 브라우저가 형식 이름을 제대로 알려주지 않아 mime 제한을 쓰지 않음)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('instructor-docs', 'instructor-docs', false, 10485760)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760, allowed_mime_types = NULL;

-- 경로 규칙
--   {project_id}/{강사 id}/...    강사 본인 제출물 (파일/서명 PNG/서명본 PDF)
--   {project_id}/_forms/...       담당자가 올린 양식·계약서 원본
-- 폴더 첫 칸이 uuid 모양일 때만 uuid로 바꿔 오류를 막음
CREATE OR REPLACE FUNCTION public.idoc_path_project(p_name text)
RETURNS uuid
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE WHEN split_part(p_name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN split_part(p_name,'/',1)::uuid END;
$$;

DROP POLICY IF EXISTS idoc_storage_insert ON storage.objects;
CREATE POLICY idoc_storage_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'instructor-docs'
  AND lower(name) ~ '\.(pdf|hwp|hwpx|jpg|jpeg|png)$'
  AND public.idoc_path_project(name) IS NOT NULL
  AND (
    (split_part(name,'/',2) = '_forms' AND public.idoc_is_manager(public.idoc_path_project(name)))
    OR (split_part(name,'/',2) = auth.uid()::text AND public.idoc_is_instructor(public.idoc_path_project(name)))
  )
);

DROP POLICY IF EXISTS idoc_storage_select ON storage.objects;
CREATE POLICY idoc_storage_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'instructor-docs'
  AND public.idoc_path_project(name) IS NOT NULL
  AND (
    public.idoc_is_manager(public.idoc_path_project(name))
    OR (split_part(name,'/',2) = auth.uid()::text)
    OR (split_part(name,'/',2) = '_forms' AND public.idoc_is_instructor(public.idoc_path_project(name)))
  )
);

DROP POLICY IF EXISTS idoc_storage_delete ON storage.objects;
CREATE POLICY idoc_storage_delete ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'instructor-docs'
  AND public.idoc_path_project(name) IS NOT NULL
  AND public.idoc_is_manager(public.idoc_path_project(name))
);

-- 12. 실시간 반영
ALTER PUBLICATION supabase_realtime ADD TABLE public.instructor_doc_requirements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.instructor_doc_submissions;
