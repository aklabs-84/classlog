import { useState, useEffect } from 'react';
import { X, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';

const DISMISS_KEY = 'waitlist_banner_dismissed';

const WaitlistBanner = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const plan = profile.plan ?? 'free';
    if (plan !== 'free' && plan !== 'basic') return;
    if (localStorage.getItem(DISMISS_KEY)) return;
    setVisible(true);
  }, [profile]);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
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
          <div className="flex items-center justify-between gap-4 px-5 py-3.5 bg-writer-obsidian text-white">
            <div className="flex items-center gap-3 min-w-0">
              <Sparkles size={18} className="shrink-0 text-amber-300" />
              <p className="text-sm font-bold truncate">
                🎉 유료 플랜 곧 오픈!&nbsp;
                <span className="font-normal opacity-90">
                  지금 얼리버드 신청하면 <span className="text-amber-300 font-bold">첫 달 50% 할인</span>을 드려요.
                </span>
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => { dismiss(); navigate('/waitlist'); }}
                className="text-xs font-black bg-amber-400 text-writer-obsidian hover:bg-amber-300 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
              >
                얼리버드 신청
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

export default WaitlistBanner;
