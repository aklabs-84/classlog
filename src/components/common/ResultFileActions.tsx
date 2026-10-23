import { Download, Eye } from 'lucide-react';
import { getViewerKind } from '../classroom/SubmissionViewerModal';
import { downloadFile } from '../../lib/fileUtils';

interface Props {
  url: string;
  /** 원래 파일 이름 (없으면 저장 경로에서 뽑는다) */
  displayName?: string | null;
  storagePath?: string | null;
  /** 버튼 색 (tailwind 색 이름) */
  tone?: 'amber' | 'emerald';
  size?: 'sm' | 'md';
}

const TONES = {
  amber: { open: 'bg-amber-500 hover:bg-amber-600 text-white', down: 'bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200' },
  emerald: { open: 'bg-emerald-500 hover:bg-emerald-600 text-white', down: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200' },
};

/** 파일 제출물: "열기(바로 보기)"와 "다운로드"를 따로 보여 준다. 열 수 없는 형식은 다운로드만. */
const ResultFileActions = ({ url, displayName, storagePath, tone = 'amber', size = 'md' }: Props) => {
  const name = displayName || (storagePath ? storagePath.split('/').pop() : '') || 'file';
  const canOpen = getViewerKind(name) !== 'unsupported';
  const t = TONES[tone];
  const btn = `flex-1 min-w-[120px] flex items-center justify-center gap-1.5 font-black rounded-2xl transition-colors ${size === 'sm' ? 'text-sm px-3 py-2.5' : 'text-base px-4 py-3'}`;

  return (
    <div className="mt-2">
      <p className="text-[13px] text-gray-500 font-bold mb-1.5 break-all">{name}</p>
      <div className="flex flex-wrap gap-2">
        {canOpen && (
          <button type="button" onClick={e => { e.stopPropagation(); window.open(`/result-view?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`, '_blank', 'noopener'); }} className={`${btn} ${t.open} shadow-sm`}>
            <Eye size={16} /> 열기
          </button>
        )}
        <button type="button" onClick={e => { e.stopPropagation(); void downloadFile(url, name); }} className={`${btn} ${canOpen ? t.down : t.open + ' shadow-sm'}`}>
          <Download size={16} /> 다운로드
        </button>
      </div>
    </div>
  );
};

export default ResultFileActions;
