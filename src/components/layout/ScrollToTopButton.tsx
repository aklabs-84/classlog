import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { ArrowUp } from 'lucide-react';

const ScrollToTopButton = () => {
  const [visible, setVisible] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const location = useLocation();
  // 클래스 상세 페이지는 우하단에 빠른 메뉴 FAB가 있어 그 위로 올려 겹치지 않게 함
  const hasClassroomFab = location.pathname.includes('/classroom');

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 300);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    // FAB는 별도 스태킹 컨텍스트 안에서 렌더링돼 z-index 비교가 무력화되므로,
    // 메뉴가 펼쳐진 동안에는 이 버튼을 아예 숨겨 겹침을 방지한다.
    const onFabToggle = (e: Event) => setFabOpen(Boolean((e as CustomEvent<boolean>).detail));
    window.addEventListener('classroom-fab-toggle', onFabToggle);
    return () => window.removeEventListener('classroom-fab-toggle', onFabToggle);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return createPortal(
    <AnimatePresence>
      {visible && !(hasClassroomFab && fabOpen) && (
        <motion.button
          initial={{ opacity: 0, scale: 0.7, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.7, y: 10 }}
          transition={{ type: 'spring', stiffness: 300, damping: 22 }}
          onClick={scrollToTop}
          className={`fixed right-7 w-11 h-11 rounded-2xl bg-primary text-white shadow-lg hover:bg-primary/90 active:scale-95 transition-colors flex items-center justify-center ${
            'bottom-7'
          }`}
          style={{ zIndex: 9990 }}
          title="맨 위로 이동"
          aria-label="맨 위로 이동"
        >
          <ArrowUp size={18} strokeWidth={2.5} />
        </motion.button>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default ScrollToTopButton;
