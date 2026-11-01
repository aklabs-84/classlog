import { Eye, ExternalLink } from 'lucide-react';
import { getViewerKind } from '../classroom/SubmissionViewerModal';

export interface QuickOpenSource {
  id: string;
  created_at: string;
  file_url?: string | null;
  link_url?: string | null;
  display_name?: string | null;
  storage_path?: string | null;
}

export interface QuickOpenTarget {
  kind: 'file' | 'link';
  url: string;
  name: string;
  isFinal: boolean;
}

const fileNameOf = (r: QuickOpenSource) =>
  r.display_name || (r.storage_path ? r.storage_path.split('/').pop() : '') || 'file';

/** 목록 카드에서 한 번에 열 수 있는 결과 하나를 고른다: ⭐ 최종 → 없으면 가장 최근. 열 수 있는 파일 > 링크. */
export const pickQuickOpen = (
  results: QuickOpenSource[],
  marks?: Map<string, 'final' | 'older'>,
): QuickOpenTarget | null => {
  const candidates = results
    .filter(r => (r.file_url && getViewerKind(fileNameOf(r)) !== 'unsupported') || r.link_url)
    .sort((a, b) => {
      const fa = marks?.get(a.id) === 'final' ? 1 : 0;
      const fb = marks?.get(b.id) === 'final' ? 1 : 0;
      if (fa !== fb) return fb - fa;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  const r = candidates[0];
  if (!r) return null;
  const isFinal = marks?.get(r.id) === 'final';
  if (r.file_url && getViewerKind(fileNameOf(r)) !== 'unsupported') {
    return { kind: 'file', url: r.file_url, name: fileNameOf(r), isFinal };
  }
  return { kind: 'link', url: r.link_url as string, name: '', isFinal };
};

/** 카드 아래에 붙는 "바로 열기" 버튼 (카드를 열지 않고 새 탭에서 바로 연다) */
const QuickOpenLink = ({ target, className = '', compact = false }: { target: QuickOpenTarget | null; className?: string; compact?: boolean }) => {
  if (!target) return null;
  const size = compact ? 'whitespace-nowrap px-3 py-1.5' : 'w-full px-3 py-2';
  const base = `flex items-center justify-center gap-1.5 text-[13px] font-black rounded-xl transition-colors ${size} ${
    target.isFinal ? 'bg-amber-400 hover:bg-amber-500 text-white' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
  } ${className}`;
  if (target.kind === 'link') {
    return (
      <a href={target.url} target="_blank" rel="noopener noreferrer" className={base} title={target.isFinal ? '최종 제출 링크를 새 탭에서 바로 열어요' : '링크를 새 탭에서 바로 열어요'}>
        <ExternalLink size={14} /> {compact ? (target.isFinal ? '⭐ 바로 열기' : '바로 열기') : target.isFinal ? '⭐ 최종 링크 바로 열기' : '링크 바로 열기'}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={() => window.open(`/result-view?url=${encodeURIComponent(target.url)}&name=${encodeURIComponent(target.name)}`, '_blank', 'noopener')}
      className={base}
      title={target.isFinal ? '최종 제출 결과를 새 탭에서 바로 열어요' : '가장 최근 결과를 새 탭에서 바로 열어요'}
    >
      <Eye size={14} /> {compact ? (target.isFinal ? '⭐ 바로 열기' : '바로 열기') : target.isFinal ? '⭐ 최종 결과 바로 열기' : '최근 결과 바로 열기'}
    </button>
  );
};

export default QuickOpenLink;
