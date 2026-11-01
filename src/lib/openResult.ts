/** 마우스로 쓰는 컴퓨터인지 (폰·태블릿·터치 전용 기기, 설치된 앱은 false) */
const isDesktopMouse = (): boolean => {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return false;
    if ((navigator as Navigator & { standalone?: boolean }).standalone) return false;
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  } catch {
    return false;
  }
};

/**
 * 제출 결과 파일 열기: 컴퓨터는 새 탭(/result-view), 폰·태블릿·설치 앱은 기존처럼 그 자리 미리보기.
 * 새 탭이 막히면(팝업 차단) 그 자리 미리보기로 대신한다.
 */
export const openResultFile = (
  file: { url: string; name: string },
  openInPlace: (f: { url: string; name: string }) => void,
) => {
  if (isDesktopMouse()) {
    const w = window.open(
      `/result-view?url=${encodeURIComponent(file.url)}&name=${encodeURIComponent(file.name)}`,
      '_blank',
    );
    // 'noopener' 옵션을 쓰면 열렸어도 항상 null이 돌아와 열림 여부를 알 수 없어서, 열린 뒤에 연결만 끊는다
    if (w) { try { w.opener = null; } catch { /* 무시 */ } return; }
  }
  openInPlace(file);
};
