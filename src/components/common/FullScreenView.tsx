import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft } from 'lucide-react';

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  onClose: () => void;
  /** 겹쳐 열 때(예: 결과 목록 위에 상세) 더 위에 올리려면 크게 */
  z?: number;
  children: ReactNode;
}

/** 작은 창 대신 화면을 꽉 채워 보여 주는 결과 보기 틀. 맨 위에 "돌아가기"가 항상 보인다. */
const FullScreenView = ({ title, subtitle, icon, onClose, z = 60, children }: Props) => {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 bg-slate-50 flex flex-col" style={{ zIndex: z }}>
      <div className="shrink-0 bg-white border-b border-gray-200 flex items-center gap-3 px-3 sm:px-6 py-3">
        <button onClick={onClose} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-black text-sm shrink-0">
          <ArrowLeft size={16} /> 돌아가기
        </button>
        {icon && <div className="shrink-0">{icon}</div>}
        <div className="min-w-0 flex-1">
          <p className="font-black text-gray-900 text-base sm:text-lg truncate">{title}</p>
          {subtitle && <p className="text-[13px] text-gray-500 truncate">{subtitle}</p>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 space-y-4">{children}</div>
      </div>
    </div>,
    document.body
  );
};

export default FullScreenView;
