-- 결과 요약 2단계: 반별 한눈에 보기 + 전체 설문 요약용 집계.
-- get_project_summary_stats 와 같은 범위 규칙(관리자 사업만, 학교 지정 가능)을 따른다.
-- 이름·개별 응답은 내보내지 않고 숫자 집계만 돌려준다.
CREATE OR REPLACE FUNCTION public.get_project_class_overview(p_project_id uuid, p_school_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH allowed AS (
    SELECT p_project_id AS pid
    WHERE p_project_id IN (SELECT public.get_admin_project_ids())
  ),
  scope_schools AS (
    SELECT sp.id, COALESCE(sp.school_name, sp.name) AS school_name
    FROM public.school_projects sp
    WHERE sp.parent_project_id IN (SELECT pid FROM allowed)
      AND (p_school_id IS NULL OR sp.id = p_school_id)
    UNION
    SELECT sp.id, COALESCE(sp.school_name, sp.name)
    FROM public.school_projects sp
    WHERE sp.id IN (SELECT pid FROM allowed)
      AND p_school_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.school_projects c WHERE c.parent_project_id = sp.id)
  ),
  scope_classes AS (
    SELECT c.id, c.name, c.school_project_id, ss.school_name
    FROM public.classes c
    JOIN scope_schools ss ON ss.id = c.school_project_id
    WHERE c.parent_class_id IS NOT NULL
  ),
  per_class AS (
    SELECT
      c.id AS class_id, c.school_project_id AS school_id, c.school_name, c.name AS class_name,
      (SELECT COUNT(*) FROM public.students s WHERE s.class_id = c.id)::INT AS student_count,
      (SELECT COUNT(*) FROM public.attendance a WHERE a.class_id = c.id AND a.status = 'present')::INT AS present,
      (SELECT COUNT(*) FROM public.attendance a WHERE a.class_id = c.id AND a.status = 'absent')::INT AS absent,
      (SELECT COUNT(*) FROM public.attendance a WHERE a.class_id = c.id AND a.status = 'late')::INT AS late,
      (SELECT COUNT(*) FROM public.attendance a WHERE a.class_id = c.id AND a.status = 'early_leave')::INT AS early_leave,
      (SELECT COUNT(*) FROM public.attendance a WHERE a.class_id = c.id AND a.status = 'excused')::INT AS excused,
      (SELECT COUNT(*) FROM public.observations o
         WHERE o.is_student_record AND o.status = 'approved'
           AND o.student_id IN (SELECT s.id FROM public.students s WHERE s.class_id = c.id))::INT AS activity_count,
      (SELECT COUNT(DISTINCT o.student_id) FROM public.observations o
         WHERE o.is_student_record AND o.status = 'approved'
           AND o.student_id IN (SELECT s.id FROM public.students s WHERE s.class_id = c.id))::INT AS activity_student_count,
      (SELECT COUNT(*) FROM public.student_results r
         WHERE r.class_id = c.id AND r.status IS DISTINCT FROM 'rejected')::INT AS result_count,
      (SELECT COUNT(DISTINCT r.student_id) FROM public.student_results r
         WHERE r.class_id = c.id AND r.status IS DISTINCT FROM 'rejected')::INT AS result_student_count,
      (SELECT COUNT(*) FROM public.survey_responses sr WHERE sr.class_id = c.id)::INT AS survey_response_count,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('week', w.week_number, 'cnt', w.cnt) ORDER BY w.week_number)
        FROM (
          SELECT r.week_number, COUNT(*)::INT AS cnt
          FROM public.student_results r
          WHERE r.class_id = c.id AND r.status IS DISTINCT FROM 'rejected' AND r.week_number IS NOT NULL
          GROUP BY r.week_number
        ) w
      ), '[]'::jsonb) AS weekly
    FROM scope_classes c
  ),
  scope_forms AS (
    SELECT f.id, f.title, f.survey_phase,
           (SELECT COUNT(*) FROM public.survey_responses sr
              WHERE sr.form_id = f.id AND sr.class_id IN (SELECT id FROM scope_classes))::INT AS response_count
    FROM public.survey_forms f
    WHERE f.id IN (
      SELECT sr.form_id FROM public.survey_responses sr
      WHERE sr.class_id IN (SELECT id FROM scope_classes)
    )
  ),
  form_json AS (
    SELECT jsonb_build_object(
      'id', f.id, 'title', f.title, 'phase', f.survey_phase, 'response_count', f.response_count,
      'questions', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'text', q.text, 'type', q.type,
          'avg', CASE WHEN q.type IN ('star_rating','opinion_scale') THEN
            (SELECT AVG((a.value->>(CASE WHEN q.type='star_rating' THEN 'rating' ELSE 'score' END))::numeric)
             FROM public.survey_answers a
             WHERE a.question_id = q.id
               AND a.response_id IN (SELECT sr.id FROM public.survey_responses sr
                                      WHERE sr.form_id = f.id AND sr.class_id IN (SELECT id FROM scope_classes)))
            END,
          'pct', CASE WHEN q.type = 'yes_no' THEN
            (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE (a.value->>'value')::boolean IS TRUE) / NULLIF(COUNT(*),0))
             FROM public.survey_answers a
             WHERE a.question_id = q.id
               AND a.response_id IN (SELECT sr.id FROM public.survey_responses sr
                                      WHERE sr.form_id = f.id AND sr.class_id IN (SELECT id FROM scope_classes)))
            END
        ) ORDER BY q.order_index)
        FROM public.survey_questions q
        WHERE q.form_id = f.id AND q.type IN ('star_rating','opinion_scale','yes_no')
      ), '[]'::jsonb)
    ) AS j, f.title
    FROM scope_forms f
  )
  SELECT jsonb_build_object(
    'classes', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.school_name, p.class_name) FROM per_class p), '[]'::jsonb),
    'surveys', COALESCE((SELECT jsonb_agg(j ORDER BY title) FROM form_json), '[]'::jsonb)
  );
$function$;

REVOKE ALL ON FUNCTION public.get_project_class_overview(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_project_class_overview(uuid, uuid) TO authenticated;
