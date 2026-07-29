import { useState, useEffect } from 'react';
import { X, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';

// beta_expires_at은 자동 가입 체험·관리자 발급 쿠폰·추천인 보너스가 모두 공유하는 컬럼이라
// 이 값이 과거로 지나가는 시점을 감지하는 것만으로 세 경우 모두의 "종료" 안내를 커버함
const BetaEndedBanner = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!profile?.beta_expires_at) return;
    // 유료 플랜으로 전환된 경우는 "체험 종료" 안내가 의미 없으므로 노출하지 않음
    if (profile.plan && profile.plan !== 'free') return;

    const isExpired = new Date(profile.beta_expires_at).getTime() <= Date.now();
    if (!isExpired) return;

    const key = `beta_ended_shown_${profile.beta_expires_at}`;
    if (localStorage.getItem(key)) return;

    setVisible(true);
  }, [profile?.beta_expires_at, profile?.plan]);

  const dismiss = () => {
    if (profile?.beta_expires_at) {
      localStorage.setItem(`beta_ended_shown_${profile.beta_expires_at}`, '1');
    }
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.3 }}
          className="mx-4 md:mx-8 mt-3 mb-0 rounded-2xl overflow-hidden shadow-lg"
        >
          <div className="flex items-center justify-between gap-4 px-5 py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white">
            <div className="flex items-center gap-3 min-w-0">
              <Clock size={18} className="shrink-0 text-white/90" />
              <p className="text-sm font-bold truncate">
                ⏰ Pro 체험이 종료되었습니다.&nbsp;
                <span className="font-normal opacity-90">
                  무료 플랜으로 전환되었어요. 계속 사용하시려면 업그레이드해보세요.
                </span>
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => { dismiss(); navigate('/settings#referral'); }}
                className="text-xs font-black bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
              >
                친구 초대(+7일)
              </button>
              <button
                onClick={() => { dismiss(); navigate('/pricing'); }}
                className="text-xs font-black bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
              >
                요금제 보기
              </button>
              <button
                onClick={dismiss}
                className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                aria-label="닫기"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default BetaEndedBanner;
