import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';

export type ShortcutTone = 'red' | 'violet' | 'emerald';
export type ActivityGroup = '설문' | '퀴즈' | '게시판' | '진행';

const KIND_COLOR: Record<ShortcutTone, string> = {
  red: 'text-red-600',
  violet: 'text-violet-600',
  emerald: 'text-emerald-600',
};

export const openActivities = () => window.dispatchEvent(new CustomEvent('classroom-open-activities'));

// 각 줄(ShortcutRow)이 "나 여기 있어요 / 지금 열려 있어요"를 수업 활동 탭(ActivityHub)에 알리는 연결선
export interface ActivityEntry {
  group: ActivityGroup;
  title: string;
  summary?: string;
  highlight: boolean;
  endLabel: string;
  end?: () => void;
}
export const ActivityRegistryContext = createContext<((id: string, entry: ActivityEntry | null) => void) | null>(null);

// 줄 종류 이름('진행중'은 게시판 묶음) → 도구띠 묶음
const groupOf = (kind: string): ActivityGroup => (kind === '진행중' ? '게시판' : (kind as ActivityGroup));

interface RowProps {
  tone: ShortcutTone;
  icon?: ReactNode;      // 예전 호출부 호환용 (메뉴판형에서는 쓰지 않음)
  kind: string;          // 설문 / 퀴즈 / 게시판
  title: string;
  summary?: string;
  help?: string;         // 길어서 접어 둔 설명 (물음표를 누르면 보임)
  highlight?: boolean;   // 학생에게 열려 있는 줄
  linked?: boolean;      // 우리 반에 이미 연결된 항목인가 (새로 시작하는 줄이면 false)
  action: ReactNode;
  endLabel?: string;     // 열려 있을 때 도구띠 오른쪽 버튼 이름 (기본 '끝내기')
  onEnd?: () => void;    // 열려 있을 때 도구띠 버튼이 하는 일
}

export function ShortcutRow({ tone, kind, title, summary, help, highlight, linked = true, action, endLabel = '끝내기', onEnd }: RowProps) {
  const [showHelp, setShowHelp] = useState(false);
  const register = useContext(ActivityRegistryContext);
  const id = useId();
  const endRef = useRef(onEnd);
  endRef.current = onEnd;
  useEffect(() => {
    if (!register) return;
    register(id, { group: groupOf(kind), title, summary, highlight: !!highlight, endLabel, end: () => endRef.current?.() });
    return () => register(id, null);
  }, [register, id, kind, title, summary, highlight, endLabel]);
  return (
    <div data-group={groupOf(kind)} className={`sc-row ${linked ? 'sc-linked' : ''} border-b border-neutral-200 py-3 pr-1 ${highlight ? 'bg-red-50 -mx-2 px-2' : ''}`}>
      <div className="flex items-center gap-3">
        <span className={`shrink-0 w-2 h-2 rounded-full ${highlight ? 'bg-red-500' : 'bg-transparent'}`} aria-hidden />
        <span className={`shrink-0 w-11 text-xs font-black ${highlight ? 'text-red-600' : KIND_COLOR[tone]}`}>{kind}</span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-bold truncate ${highlight ? 'text-red-900' : ''}`}>{title}</p>
          {(summary || highlight) && (
            <p className={`text-xs font-bold mt-0.5 truncate ${highlight ? 'text-red-600' : 'text-neutral-500'}`}>
              {highlight ? '열려 있음 · ' : ''}{summary}
            </p>
          )}
        </div>
        {help && (
          <button type="button" onClick={() => setShowHelp(v => !v)} aria-label="설명 보기" aria-expanded={showHelp} className="shrink-0 text-neutral-300 hover:text-neutral-500">
            <HelpCircle size={16} />
          </button>
        )}
        <div className="shrink-0">{action}</div>
      </div>
      {help && showHelp && <p className="mt-2 ml-[4.5rem] text-xs font-bold text-neutral-500 leading-relaxed">{help}</p>}
    </div>
  );
}
