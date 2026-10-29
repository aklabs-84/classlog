import type { CSSProperties } from 'react';
import { ChevronRight, Files, Maximize2, Minimize2 } from 'lucide-react';

// 우리 반 보드 카드/팝업에서 "같은 날·같은 주차에 여러 번 제출"을 눈에 띄게 알리는 공용 부품
// (학생 보드, 선생님 클래스룸 보드, 우리반 보드 화면 3곳이 함께 쓴다)

/** 제출이 2개 이상이면 카드 뒤에 종이가 겹친 것처럼 보이게 하는 스타일 */
export const stackedCardStyle = (multi: boolean): CSSProperties | undefined =>
  multi
    ? {
        boxShadow: '5px 5px 0 0 rgba(52,211,153,0.5), 10px 10px 0 0 rgba(52,211,153,0.25)',
        marginRight: 10,
        marginBottom: 12,
      }
    : undefined;

/** 카드 맨 아래 "제출 N개 · 눌러서 모두 보기" 줄 (카드 안쪽 여백 p-5를 상쇄) */
export const MultiSubmitStrip = ({ count }: { count: number }) => (
  <div className="-mx-5 -mb-5 mt-3 flex items-center justify-between gap-2 px-5 py-2.5 rounded-b-[inherit] bg-amber-100 border-t border-amber-300 text-amber-800 text-sm font-black dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-700/50">
    <span className="flex items-center gap-1.5"><Files size={15} /> 제출 {count}개 · 눌러서 모두 보기</span>
    <ChevronRight size={16} />
  </div>
);

/** 팝업 맨 위 "1번째 · 04:06" 칩 — 누르면 그 제출로 이동 */
export const SubmissionChips = ({ subs, className = '' }: { subs: { id: string; created_at: string }[]; className?: string }) => (
  <div className={`flex flex-wrap gap-1.5 ${className}`}>
    {subs.map((s, i) => (
      <button
        key={s.id}
        type="button"
        onClick={() => document.getElementById(`sub-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        className="text-sm font-black px-3 py-1 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
      >
        {i + 1}번째 · {new Date(s.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
      </button>
    ))}
  </div>
);

/** 팝업 헤더의 전체 화면 확대/축소 버튼 */
export const ExpandToggle = ({ full, onToggle }: { full: boolean; onToggle: () => void }) => (
  <button
    type="button"
    onClick={onToggle}
    title={full ? '작게 보기 (Esc)' : '전체 화면으로 크게 보기'}
    aria-label={full ? '작게 보기' : '전체 화면으로 크게 보기'}
    className="shrink-0 w-9 h-9 rounded-xl border-2 border-emerald-400 bg-white text-emerald-700 hover:bg-emerald-50 flex items-center justify-center transition-all"
  >
    {full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
  </button>
);
