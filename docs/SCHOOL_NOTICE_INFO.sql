-- 학교 공지 만들기: 학교별 안내 수첩 + 저장된 최종 공지 문구 (매니저만 읽기/쓰기)
CREATE TABLE IF NOT EXISTS public.school_notice_info (
  school_id uuid PRIMARY KEY REFERENCES public.school_projects(id) ON DELETE CASCADE,
  address text NOT NULL DEFAULT '', waiting_place text NOT NULL DEFAULT '',
  parking text NOT NULL DEFAULT '', wifi text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '',
  class_info jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { 반id: { location, wifi } }
  messages jsonb NOT NULL DEFAULT '{}'::jsonb,     -- { docs|before|after: { text, base } }
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.school_notice_info ENABLE ROW LEVEL SECURITY;
CREATE POLICY school_notice_manager_all ON public.school_notice_info FOR ALL TO authenticated
  USING (public.idoc_is_manager(school_id)) WITH CHECK (public.idoc_is_manager(school_id));
