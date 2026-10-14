import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, QrCode, BookOpen, ExternalLink, Share2, Download, Smartphone, Camera } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface ClassroomFabMenuProps {
  onOpenQR?: () => void;
  onOpenResources?: () => void;
  onOpenStudentPage?: () => void;
  onOpenTeacherShareQR?: () => void;
  onExport?: () => void;
  onOpenGallery?: () => void;
  galleryPending?: number;
  onOpenStudentPreview?: () => void;
}

interface FabAction {
  key: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  badge?: number;
}

const ClassroomFabMenu = ({
  onOpenQR,
  onOpenResources,
  onOpenStudentPage,
  onOpenTeacherShareQR,
  onExport,
  onOpenGallery,
  galleryPending = 0,
  onOpenStudentPreview,
}: ClassroomFabMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);

  // 스크롤업 버튼이 별도 포털(document.body)에 렌더링돼 z-index 비교가 무력화되므로,
  // 메뉴가 펼쳐진 동안에는 커스텀 이벤트로 스크롤업 버튼을 직접 숨긴다.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('classroom-fab-toggle', { detail: isOpen }));
    return () => {
      window.dispatchEvent(new CustomEvent('classroom-fab-toggle', { detail: false }));
    };
  }, [isOpen]);

  // 사용 안내 투어가 다음 단계로 넘어갈 때 펼쳐진 메뉴를 닫아 달라고 보내는 신호
  useEffect(() => {
    const close = () => setIsOpen(false);
    window.addEventListener('classroom-fab-close', close);
    return () => window.removeEventListener('classroom-fab-close', close);
  }, []);

  const actions: FabAction[] = [
    onOpenStudentPreview && { key: 'studentPreview', label: '학생 화면 미리보기', icon: Smartphone, onClick: onOpenStudentPreview },
    onOpenQR && { key: 'qr', label: '학생 입장 코드 확인', icon: QrCode, onClick: onOpenQR },
    onOpenResources && { key: 'resources', label: '수업 자료실', icon: BookOpen, onClick: onOpenResources },
    onOpenStudentPage && { key: 'openStudentPage', label: '학생 페이지 이동', icon: ExternalLink, onClick: onOpenStudentPage },
    onOpenTeacherShareQR && { key: 'shareQr', label: '교사용 결과 공유', icon: Share2, onClick: onOpenTeacherShareQR },
    onOpenGallery && { key: 'gallery', label: '수업 사진·동의', icon: Camera, onClick: onOpenGallery, badge: galleryPending },
    onExport && { key: 'export', label: '내보내기', icon: Download, onClick: onExport },
  ].filter((action): action is FabAction => Boolean(action));

  if (actions.length === 0) return null;

  const handleSelect = (fn: () => void) => {
    fn();
    setIsOpen(false);
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-on-surface/20 backdrop-blur-[2px]"
              style={{ zIndex: 9992 }}
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 12 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              className={`fixed bottom-[92px] right-7 grid gap-2 p-3 bg-white rounded-3xl shadow-elevated border border-white/60 ${
                actions.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'
              }`}
              style={{ zIndex: 9993 }}
            >
              {actions.map(({ key, label, icon: Icon, onClick, badge }) => (
                <button
                  key={key}
                  onClick={() => handleSelect(onClick)}
                  className="flex flex-col items-center gap-1.5 w-20 py-3 px-2 rounded-2xl hover:bg-primary/10 transition-all active:scale-95"
                >
                  <div className="relative w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface-variant">
                    <Icon size={18} />
                    {!!badge && <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-orange-500 text-white text-[10px] font-black flex items-center justify-center">{badge}</span>}
                  </div>
                  <span className="text-[11px] font-bold text-on-surface-variant text-center leading-tight">{label}</span>
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <motion.button
        onClick={() => setIsOpen((v) => !v)}
        animate={{ rotate: isOpen ? 45 : 0 }}
        className="fixed bottom-7 right-7 w-14 h-14 rounded-2xl bg-primary text-white shadow-lg hover:bg-primary/90 active:scale-95 transition-colors flex items-center justify-center"
        style={{ zIndex: 9993 }}
        data-tour="fab-plus"
        title="빠른 메뉴"
        aria-label="빠른 메뉴"
      >
        <Plus size={22} strokeWidth={2.5} />
      </motion.button>
    </>
  );
};

export default ClassroomFabMenu;
