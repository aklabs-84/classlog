import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Smartphone, RefreshCw } from 'lucide-react';

interface PreviewStudent {
  id: string;
  name: string;
  number?: string;
}

interface StudentPreviewModalProps {
  classId: string;
  students: PreviewStudent[];
  onClose: () => void;
}

const SESSION_KEY = 'student_session';

const StudentPreviewModal = ({ classId, students, onClose }: StudentPreviewModalProps) => {
  const [selectedId, setSelectedId] = useState(students[0]?.id || '');
  const [reloadTick, setReloadTick] = useState(0);
  const previousSessionRef = useRef<string | null>(null);
  const hasSavedPrevRef = useRef(false);

  // 모달을 여는 동안 교사 탭의 sessionStorage에 임시 학생 세션을 심어
  // 실제 학생 화면(/student-log)을 그대로 재사용한다. 렌더 단계에서 동기적으로
  // 써야 아래 iframe이 마운트되며 세션을 읽기 전에 값이 확정된다.
  if (!hasSavedPrevRef.current) {
    previousSessionRef.current = sessionStorage.getItem(SESSION_KEY);
    hasSavedPrevRef.current = true;
  }
  const selectedStudent = students.find(s => s.id === selectedId);
  if (selectedStudent) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      student_id: selectedStudent.id,
      class_id: classId,
      student_name: selectedStudent.name,
    }));
  }

  useEffect(() => {
    return () => {
      if (previousSessionRef.current) {
        sessionStorage.setItem(SESSION_KEY, previousSessionRef.current);
      } else {
        sessionStorage.removeItem(SESSION_KEY);
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (students.length === 0) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center p-4 sm:p-8 bg-on-surface/50 backdrop-blur-xl"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col w-full max-w-[440px] h-[88vh] bg-white rounded-[2rem] shadow-2xl border border-white/20 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-100 bg-surface-container-low/40 shrink-0">
          <Smartphone size={18} className="text-primary shrink-0" />
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className="flex-1 min-w-0 text-sm font-bold bg-transparent focus:outline-none truncate"
          >
            {students.map(s => (
              <option key={s.id} value={s.id}>
                {s.number ? `${s.number}번 ` : ''}{s.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setReloadTick(t => t + 1)}
            className="p-2 rounded-full hover:bg-surface-container transition-all shrink-0"
            title="새로고침"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-surface-container transition-all shrink-0"
            title="닫기"
          >
            <X size={18} />
          </button>
        </div>
        <iframe
          key={`${selectedId}-${reloadTick}`}
          src="/student-log"
          title="학생 화면 미리보기"
          className="flex-1 w-full border-0 bg-white"
        />
      </motion.div>
    </div>,
    document.body
  );
};

export default StudentPreviewModal;
