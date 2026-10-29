import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, HelpCircle } from 'lucide-react';

export type ShortcutTone = 'red' | 'violet' | 'emerald';

const KIND_COLOR: Record<ShortcutTone, string> = {
  red: 'text-red-600',
  violet: 'text-violet-600',
  emerald: 'text-emerald-600',
};

export const openActivities = () => window.dispatchEvent(new CustomEvent('classroom-open-activities'));
const OPEN_KEY = 'classroom_activities_open_v1';

// 클래스룸 맨 위 "수업 활동 시작" 목록: 상자 없이 가는 선으로만 줄을 나눈다.
// - 우리 반에 연결된 설문·퀴즈·진행 중 게시판(.sc-linked)이 있으면 처음부터 보이고, 없으면 숨긴다
// - 숨겨진 경우 오른쪽 "바로가기" 메뉴의 "설문·퀴즈·게시판"(openActivities)을 누르면 나타난다
// - 제목을 누르면 접고 펼 수 있고, 직접 바꾼 상태는 이 브라우저에 기억한다
export function ShortcutSection({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(OPEN_KEY) !== '0'; } catch { return true; }
  });

  useEffect(() => {
    const onOpen = () => {
      setRevealed(true);
      setOpen(true);
      setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    };
    window.addEventListener('classroom-open-activities', onOpen);
    return () => window.removeEventListener('classroom-open-activities', onOpen);
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(OPEN_KEY, next ? '1' : '0'); } catch { /* 기억 못 해도 화면은 정상 */ }
  };

  return (
    <div ref={ref} className={`mb-6 ${revealed ? '' : '[&:not(:has(.sc-linked))]:hidden'}`}>
      <button type="button" onClick={toggle} aria-expanded={open} className="w-full flex items-center gap-1 pb-1.5 text-left text-xs font-bold text-neutral-500 hover:text-neutral-700">
        <span className="flex-1">수업 활동 시작</span>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
      </button>
      <div className={`border-t border-neutral-300 ${open ? '' : 'hidden'}`}>{children}</div>
    </div>
  );
}

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
}

export function ShortcutRow({ tone, kind, title, summary, help, highlight, linked = true, action }: RowProps) {
  const [showHelp, setShowHelp] = useState(false);
  return (
    <div className={`sc-row ${linked ? 'sc-linked' : ''} border-b border-neutral-200 py-3 pr-1 ${highlight ? 'bg-red-50 -mx-2 px-2' : ''}`}>
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
