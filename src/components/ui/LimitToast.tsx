import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// 무료/Basic 플랜의 도구별 생성 개수 한도에 도달했을 때 보여주는 공통 안내 토스트.
// alert()는 도구마다 다르게 보여 UX가 어긋나므로, 이 훅+컴포넌트로 전 도구가 동일한 스타일을 쓰도록 통일함.
export function useLimitToast() {
  const [limitToastMessage, setLimitToastMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showLimitToast = useCallback((message: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setLimitToastMessage(message);
    timerRef.current = setTimeout(() => setLimitToastMessage(null), 3500);
  }, []);

  return { limitToastMessage, showLimitToast };
}

const LimitToast = ({ message }: { message: string | null }) => {
  if (!message) return null;
  return createPortal(
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: '#1E293B', color: '#fff', borderRadius: 12, padding: '12px 20px',
      fontSize: 13, fontWeight: 600, zIndex: 9999, display: 'flex', alignItems: 'center', gap: 8,
      boxShadow: '0 4px 20px rgba(0,0,0,0.25)', maxWidth: '90vw', textAlign: 'center',
    }}>
      <span>🔒</span>
      {message}
    </div>,
    document.body
  );
};

export default LimitToast;
