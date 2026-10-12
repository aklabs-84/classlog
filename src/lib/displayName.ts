/** 이 시각 이후 가입한 사람은 "가입 마무리"(실명 확인)를 마쳐야 앱을 쓸 수 있다. 그 전 가입자는 안내 띠만 보인다. */
export const REAL_NAME_GATE_SINCE = '2026-10-12T08:30:00Z';

interface NameLike { full_name?: string | null; nickname?: string | null }

/** 앱 안에서 보이는 이름: 별명이 있으면 별명, 없으면 실명 */
export function displayName(p: NameLike | null | undefined, fallback = '사용자'): string {
  return p?.nickname?.trim() || p?.full_name?.trim() || fallback;
}

/** 실명 입력 검사: 빈칸·숫자/기호만 있는 경우만 막는다 (외국 이름도 허용) */
export function validateRealName(name: string): string | null {
  const v = name.trim();
  if (v.length < 2) return '실명을 2글자 이상 입력해 주세요.';
  if (v.length > 30) return '이름이 너무 길어요.';
  if (!/[A-Za-z가-힣À-ɏ぀-ヿ一-鿿]/.test(v)) return '글자가 들어간 실명을 입력해 주세요.';
  return null;
}

export function validateNickname(name: string): string | null {
  if (name.trim().length > 20) return '별명은 20글자까지 쓸 수 있어요.';
  return null;
}

/** 새로 가입한 사람(가입 마무리 필수)인지 */
export function isNewSignup(profile: { created_at?: string | null } | null | undefined): boolean {
  if (!profile?.created_at) return false;
  return new Date(profile.created_at).getTime() >= new Date(REAL_NAME_GATE_SINCE).getTime();
}
