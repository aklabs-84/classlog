import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Backpack, GraduationCap, X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  /** "저는 학생이에요" → 수업 참여 화면으로 */
  onStudent: () => void;
  /** "저는 선생님이에요" → 구글 계정 선택창으로 */
  onTeacher: () => void;
}

// 학생이 습관적으로 "구글로 시작"을 눌러 가입되는 것을 막는 확인 창
const TeacherConfirmModal = ({ open, onClose, onStudent, onTeacher }: Props) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="teacher-confirm-title"
    >
      <div
        className="relative w-full max-w-md rounded-3xl bg-white p-6 sm:p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute right-4 top-4 rounded-full p-2 text-on-surface-variant hover:bg-surface-container"
        >
          <X size={18} />
        </button>

        <h2 id="teacher-confirm-title" className="mb-2 pr-8 text-xl font-black text-on-surface">
          잠깐! 선생님이신가요?
        </h2>
        <p className="mb-6 text-sm leading-relaxed text-on-surface-variant">
          구글 로그인은 <b>선생님 전용</b>이에요. 학생은 구글 계정으로 가입하지 않고,
          선생님이 알려준 코드로 수업에 들어가요.
        </p>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onStudent}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-4 text-base font-black text-white transition-all active:scale-95"
          >
            <Backpack size={20} /> 저는 학생이에요
          </button>
          <button
            type="button"
            onClick={onTeacher}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-on-surface/15 bg-white px-4 py-4 text-base font-black text-on-surface transition-all hover:bg-surface-container/60 active:scale-95"
          >
            <GraduationCap size={20} /> 저는 선생님이에요
          </button>
        </div>
        <p className="mt-3 text-center text-xs text-on-surface-variant">
          학생이에요 → 수업 참여 화면 · 선생님이에요 → 구글 계정 선택
        </p>
      </div>
    </div>,
    document.body,
  );
};

export default TeacherConfirmModal;
