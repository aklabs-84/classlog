import { useState, type ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';

export type ShortcutTone = 'red' | 'violet' | 'emerald';

const TONE: Record<ShortcutTone, { bar: string; icon: string; label: string }> = {
  red: { bar: 'border-l-red-400', icon: 'bg-red-50 text-red-500', label: 'text-red-500' },
  violet: { bar: 'border-l-violet-400', icon: 'bg-violet-50 text-violet-500', label: 'text-violet-600' },
  emerald: { bar: 'border-l-emerald-400', icon: 'bg-emerald-50 text-emerald-600', label: 'text-emerald-600' },
};

// 클래스룸 맨 위 "바로가기" 묶음: 안에 한 줄짜리(ShortcutRow)가 하나도 없으면 통째로 숨는다
export function ShortcutSection({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-3 [&:not(:has(.sc-row))]:hidden">
      <p className="px-1 pb-2 text-[11px] font-black tracking-wide text-neutral-400">바로가기</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

interface RowProps {
  tone: ShortcutTone;
  icon: ReactNode;
  kind: string;          // 설문 / 퀴즈 / 게시판
  title: string;
  summary?: string;
  help?: string;         // 길어서 접어 둔 설명 (물음표를 누르면 보임)
  highlight?: boolean;   // 학생에게 열려 있는 줄
  action: ReactNode;
}

export function ShortcutRow({ tone, icon, kind, title, summary, help, highlight, action }: RowProps) {
  const [showHelp, setShowHelp] = useState(false);
  const t = TONE[tone];
  return (
    <div className={`sc-row rounded-xl border border-neutral-200 border-l-4 ${highlight ? 'border-l-red-500 bg-red-50' : `${t.bar} bg-white`} px-3 py-2.5`}>
      <div className="flex items-center gap-3">
        <span className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${highlight ? 'bg-red-100 text-red-600' : t.icon}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold truncate">
            <span className={`mr-1.5 text-[11px] font-black ${highlight ? 'text-red-600' : t.label}`}>{kind}</span>
            {title}
            {highlight && <span className="ml-2 align-middle text-[10px] font-black px-1.5 py-0.5 rounded-full bg-red-500 text-white">열려 있음</span>}
          </p>
          {summary && <p className="text-[11px] font-bold text-neutral-400 mt-0.5 truncate">{summary}</p>}
        </div>
        {help && (
          <button type="button" onClick={() => setShowHelp(v => !v)} aria-label="설명 보기" aria-expanded={showHelp} className="shrink-0 text-neutral-300 hover:text-neutral-500">
            <HelpCircle size={16} />
          </button>
        )}
        <div className="shrink-0">{action}</div>
      </div>
      {help && showHelp && <p className="mt-2 text-xs font-bold text-neutral-500 leading-relaxed">{help}</p>}
    </div>
  );
}
