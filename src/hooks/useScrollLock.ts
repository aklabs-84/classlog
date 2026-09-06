import { useEffect } from 'react';

// 여러 화면(전체화면 자료 보기, 발표 모드, 타이머 전체화면 등)이 동시에/연달아
// body 스크롤을 잠글 수 있으므로 참조 카운트로 관리한다. 카운트가 0으로 돌아올 때만
// 실제로 스크롤을 풀어, 한 곳의 잠금 해제가 다른 곳이 아직 필요로 하는 잠금을
// 지워버리는 문제를 막는다.
let lockCount = 0;
let prevHtmlOverflow = '';
let prevBodyOverflow = '';

function acquire() {
  if (lockCount === 0) {
    prevHtmlOverflow = document.documentElement.style.overflow;
    prevBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  }
  lockCount += 1;
}

function release() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.documentElement.style.overflow = prevHtmlOverflow;
    document.body.style.overflow = prevBodyOverflow;
  }
}

/** active가 true인 동안 body/html 스크롤을 잠근다. 여러 컴포넌트에서 동시에 사용해도 안전하다. */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    acquire();
    return () => release();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
