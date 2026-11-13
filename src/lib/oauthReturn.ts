// AI 연결 승인 화면(/oauth/authorize)에서 로그인하러 갔다가 돌아오기 위한 메모
// 로그인 후 다시 승인 화면으로 보내 주려고, 가려던 주소를 이 탭에만 잠깐 적어 둔다.
const KEY = 'oauth_return';
const PREFIX = '/oauth/authorize?';

export const saveOAuthReturn = (pathAndSearch: string) => {
  try {
    if (pathAndSearch.startsWith(PREFIX)) sessionStorage.setItem(KEY, pathAndSearch);
  } catch { /* 저장이 막힌 브라우저면 그냥 넘어감 */ }
};

// 적어 둔 주소를 꺼내며 지운다. 우리 승인 화면 주소가 아니면 무시한다.
export const takeOAuthReturn = (): string | null => {
  try {
    const v = sessionStorage.getItem(KEY);
    if (v) sessionStorage.removeItem(KEY);
    return v && v.startsWith(PREFIX) ? v : null;
  } catch {
    return null;
  }
};

export const hasOAuthReturn = (): boolean => {
  try {
    return !!sessionStorage.getItem(KEY)?.startsWith(PREFIX);
  } catch {
    return false;
  }
};
