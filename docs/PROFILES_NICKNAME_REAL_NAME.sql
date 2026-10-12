-- 실명(full_name)과 별명(nickname)을 나누고, 실명 확인 여부를 기록한다 (2026-10-12 적용)
-- 신규 가입자 = created_at 이 src/lib/displayName.ts 의 REAL_NAME_GATE_SINCE 이후 → 가입 마무리 화면 필수
-- 기존 가입자 = 설정 안내 띠
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nickname text,
  ADD COLUMN IF NOT EXISTS real_name_confirmed boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_nickname_len CHECK (nickname IS NULL OR char_length(nickname) <= 20);
-- 보호 트리거(protect_profile_sensitive_columns)는 지정된 컬럼만 막으므로 두 컬럼은 본인이 수정 가능
