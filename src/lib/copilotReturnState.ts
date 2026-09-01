// AI 코파일럿에서 다른 화면(클래스룸/수업 도구 등)으로 딥링크 이동할 때
// "대화로 돌아가기" 배지(CopilotReturnBadge)가 표시할 정보를 sessionStorage에 임시로 남겨둔다.
const COPILOT_RETURN_KEY = 'copilot_return_badge_v1';

export type CopilotReturnInfo = {
  mode: string;
  personaName: string;
  personaAvatar: string;
  themeColor: string;
  ts: number;
};

export function stashCopilotReturn(info: CopilotReturnInfo) {
  try {
    sessionStorage.setItem(COPILOT_RETURN_KEY, JSON.stringify(info));
  } catch {
    // sessionStorage 사용 불가 시 배지 없이 진행 — 치명적이지 않음
  }
}

export function readCopilotReturn(): CopilotReturnInfo | null {
  try {
    const raw = sessionStorage.getItem(COPILOT_RETURN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearCopilotReturn() {
  try {
    sessionStorage.removeItem(COPILOT_RETURN_KEY);
  } catch {
    // ignore
  }
}
