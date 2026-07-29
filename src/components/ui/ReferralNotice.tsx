import { createPortal } from 'react-dom';
import { useAuth } from '../../lib/auth';

// 구글 가입 시 추천인 코드 적용 결과(성공/실패)를 전역으로 안내하는 토스트.
// 실제 적용은 auth.tsx의 fetchProfile 이후 백그라운드에서 일어나므로,
// 리다이렉트 후 어느 페이지에 도착하든 이 컴포넌트 하나로 결과를 보여준다.
const ReferralNotice = () => {
  const { referralNotice, dismissReferralNotice } = useAuth();
  if (!referralNotice) return null;

  const isSuccess = referralNotice.type === 'success';

  return createPortal(
    <div
      onClick={dismissReferralNotice}
      style={{
        position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        background: isSuccess ? '#065F46' : '#1E293B', color: '#fff', borderRadius: 12, padding: '12px 20px',
        fontSize: 13, fontWeight: 600, zIndex: 9999, display: 'flex', alignItems: 'center', gap: 8,
        boxShadow: '0 4px 20px rgba(0,0,0,0.25)', maxWidth: '90vw', textAlign: 'center', cursor: 'pointer',
      }}
    >
      <span>{isSuccess ? '🎁' : '⚠️'}</span>
      {referralNotice.text}
    </div>,
    document.body
  );
};

export default ReferralNotice;
