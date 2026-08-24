import { useState, useEffect } from 'react';
import { X, Clock, Crown, GraduationCap, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';

const KAKAO_OPEN_CHAT_URL = 'https://open.kakao.com/o/p7ZWBlKi';

// beta_expires_at은 자동 가입 체험·관리자 발급 쿠폰·추천인 보너스가 모두 공유하는 컬럼이라
// 이 값이 과거로 지나가는 시점을 감지하는 것만으로 세 경우 모두의 "종료" 안내를 커버함
const TrialEndedModal = () => {
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
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={dismiss}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="bg-gradient-to-br from-amber-500 to-orange-500 px-6 pt-8 pb-8 text-white text-center relative">
              <button
                onClick={dismiss}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                aria-label="닫기"
              >
                <X size={16} />
              </button>
              <Clock size={32} className="mx-auto mb-3" />
              <h2 className="text-xl font-black mb-1.5">Pro 체험이 종료되었습니다</h2>
              <p className="text-sm text-white/85 leading-relaxed">
                무료 플랜으로 전환되었어요.
                <br />
                계속 사용하시거나 앱 사용법이 궁금하시면 아래에서 도와드릴게요.
              </p>
            </div>

            <div className="px-6 py-6 space-y-3">
              <button
                onClick={() => { dismiss(); navigate('/pricing'); }}
                className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-sm rounded-2xl flex items-center justify-center gap-2 shadow-lg hover:shadow-amber-200 transition-all hover:scale-[1.02] active:scale-95"
              >
                <Crown size={16} /> 유료 플랜 신청하기
              </button>
              <button
                onClick={() => { dismiss(); navigate('/training-request?source=trial_ended_modal'); }}
                className="w-full py-3.5 bg-indigo-50 text-indigo-700 font-black text-sm rounded-2xl flex items-center justify-center gap-2 border border-indigo-200 hover:bg-indigo-100 transition-all active:scale-95"
              >
                <GraduationCap size={16} /> 사용법 교육 신청하기
              </button>
              <a
                href={KAKAO_OPEN_CHAT_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={dismiss}
                className="w-full py-2.5 text-xs font-bold text-gray-500 hover:text-gray-700 transition-colors flex items-center justify-center gap-1.5"
              >
                <MessageCircle size={13} /> 카카오톡 커뮤니티로 편하게 물어보기
              </a>
              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={() => { dismiss(); navigate('/settings#referral'); }}
                  className="text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors"
                >
                  친구 초대하고 +7일 받기
                </button>
                <button
                  onClick={dismiss}
                  className="text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors"
                >
                  나중에 하기
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default TrialEndedModal;
