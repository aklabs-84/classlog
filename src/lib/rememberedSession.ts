// "이 컴퓨터가 기억하기" — 학생 입장표를 이 컴퓨터(localStorage)에 24시간 보관한다.
// 브라우저를 닫거나 컴퓨터가 꺼져도 "아까 수업으로 돌아가기" 한 번으로 다시 들어오게 하기 위함.
// 서버 입장표(student_sessions)는 7일 유효하고 학생 본인 정보에만 쓸 수 있다. 여기서는 24시간만 보관한다.
const KEY = 'student_session_remembered';
const KEEP_MS = 24 * 60 * 60 * 1000;

export interface RememberedSession {
  student_id: string;
  student_name: string;
  class_id: string;
  class_name: string;
  subject?: string;
  token: string;
  common_mode?: any;
  entry_code?: string;
  saved_at: number;
}

export function saveRememberedSession(s: Omit<RememberedSession, 'saved_at'>) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...s, saved_at: Date.now() })); } catch { /* 저장 불가 환경은 무시 */ }
}

export function clearRememberedSession() {
  try { localStorage.removeItem(KEY); } catch { /* 무시 */ }
}

export function loadRememberedSession(): RememberedSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s?.token || !s?.student_id || !s?.class_id || Date.now() - Number(s.saved_at) > KEEP_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return s as RememberedSession;
  } catch {
    return null;
  }
}
