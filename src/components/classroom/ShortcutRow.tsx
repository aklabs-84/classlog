import { useState, type ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';

export type ShortcutTone = 'red' | 'violet' | 'emerald';

const KIND_COLOR: Record<ShortcutTone, string> = {
  red: 'text-red-600',
  violet: 'text-violet-600',
  emerald: 'text-emerald-600',
};

// 클래스룸 맨 위 "바로가기" 목록: 상자 없이 가는 선으로만 줄을 나눈다. 줄이 하나도 없으면 통째로 숨는다
export function ShortcutSection({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 [&:not(:has(.sc-row))]:hidden">
      <p className="pb-1.5 text-xs font-bold text-neutral-400">바로가기</p>
      <div className="border-t border-neutral-300">{children}</div>
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
  action: ReactNode;
}

export function ShortcutRow({ tone, kind, title, summary, help, highlight, action }: RowProps) {
  const [showHelp, setShowHelp] = useState(false);
  return (
    <div className={`sc-row border-b border-neutral-200 py-3 pr-1 ${highlight ? 'bg-red-50 -mx-2 px-2' : ''}`}>
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
