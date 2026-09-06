import { useState, useEffect } from 'react';
import { X, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { stories } from '../../data/stories';

const DISMISS_KEY = 'story_banner_dismissed_v1';

const StoryBanner = () => {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return;
    setVisible(true);
  }, []);

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
          <div className="flex items-center justify-between gap-4 px-5 py-3.5 bg-gradient-to-r from-amber-400 to-orange-500 text-white">
            <div className="flex items-center gap-3 min-w-0">
              <BookOpen size={18} className="shrink-0" />
              <p className="text-sm font-bold truncate">
                모르고 계셨던 기능이 있을지도?&nbsp;
                <span className="font-normal opacity-90">
                  개발자가 직접 알려주는 클래스로그 AI 활용법 {stories.length}편을 확인해 보세요.
                </span>
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => { dismiss(); navigate('/stories'); }}
                className="text-xs font-black bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
              >
                둘러보기
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

export default StoryBanner;
