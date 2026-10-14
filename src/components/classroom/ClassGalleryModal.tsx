import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import SchoolGalleryTab from './SchoolGalleryTab';

interface Props { userId: string; classId: string; className: string; onClose: () => void }

// 클래스룸 + 메뉴에서 여는 "수업 사진·동의" 창 (배정받은 담당 선생님도 사용)
const ClassGalleryModal = ({ userId, classId, className, onClose }: Props) => createPortal(
  <div className="fixed inset-0 z-[10000] bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
    <div className="bg-gray-50 w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-4 sm:p-5" onClick={e => e.stopPropagation()}>
      <div className="flex items-center mb-3">
        <p className="font-bold text-gray-900 flex-1">수업 사진·동의 · {className}</p>
        <button onClick={onClose} aria-label="닫기" className="p-1"><X className="w-5 h-5 text-gray-500" /></button>
      </div>
      <SchoolGalleryTab userId={userId} classes={[{ id: classId, name: className }]} />
    </div>
  </div>,
  document.body,
);

export default ClassGalleryModal;
