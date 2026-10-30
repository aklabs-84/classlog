import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { ActivityRegistryContext, type ActivityEntry } from './ShortcutRow';

// 클래스룸 "수업 활동" 탭의 부품들
// - ActivityProvider: 설문·퀴즈·게시판·진행 현황 줄(ShortcutRow)이 보내 주는 "여기 있어요 / 지금 열려 있어요"를 모은다
//   (줄들은 탭을 보고 있지 않아도 계속 켜 둔다 → 탭 이름의 빨간 표시와 빨간 한 줄이 어느 탭에서든 동작)
// - ActivityPanel: 줄들을 담는 탭 화면. 다른 탭을 보는 중에는 숨기기만 한다
// - ActivityStrip: 학생에게 열려 있는 활동이 있을 때만 나오는 빨간 한 줄 + 끝내기 버튼
// - useActivityState: 탭 이름 옆 빨간 숫자용

interface ActivityState { count: number; open: ActivityEntry[] }
const ActivityStateContext = createContext<ActivityState>({ count: 0, open: [] });
export const useActivityState = () => useContext(ActivityStateContext);

export function ActivityProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Record<string, ActivityEntry>>({});

  const register = useCallback((id: string, entry: ActivityEntry | null) => {
    setEntries(prev => {
      if (!entry) {
        if (!(id in prev)) return prev;
        const { [id]: _gone, ...rest } = prev;
        return rest;
      }
      const old = prev[id];
      if (old && old.group === entry.group && old.title === entry.title && old.summary === entry.summary && old.highlight === entry.highlight && old.endLabel === entry.endLabel) {
        return { ...prev, [id]: { ...old, end: entry.end } };
      }
      return { ...prev, [id]: entry };
    });
  }, []);

  const state = useMemo<ActivityState>(() => {
    const list = Object.values(entries);
    return { count: list.length, open: list.filter(e => e.highlight) };
  }, [entries]);

  return (
    <ActivityRegistryContext.Provider value={register}>
      <ActivityStateContext.Provider value={state}>{children}</ActivityStateContext.Provider>
    </ActivityRegistryContext.Provider>
  );
}

// 탭 화면 (보고 있지 않을 때는 숨기기만 해서 줄들이 계속 열림 상태를 알린다)
export function ActivityPanel({ visible, children }: { visible: boolean; children: ReactNode }) {
  const { count } = useActivityState();
  return (
    <div className={visible ? '' : 'hidden'}>
      <p className="mb-2 text-[14px] text-on-surface-variant">
        우리 반 학생에게 열어 줄 설문·퀴즈·게시판을 여기서 시작하고 끝내요. 열려 있는 활동은 빨갛게 보여요.
      </p>
      <div className="border-t border-slate-300 dark:border-slate-600">{children}</div>
      {count === 0 && <p className="py-10 text-center text-[15px] font-bold text-on-surface-variant">아직 연결된 활동이 없어요.</p>}
    </div>
  );
}

// 학생에게 열려 있는 활동이 있을 때만 나오는 빨간 한 줄 (어느 탭에서든 바로 끝낼 수 있게)
export function ActivityStrip({ onOpenTab }: { onOpenTab: () => void }) {
  const { open } = useActivityState();
  if (open.length === 0) return null;
  const one = open.length === 1 ? open[0] : null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5" role="status">
      <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
        <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-60 animate-ping" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
      </span>
      <span className="min-w-0 flex-1 basis-48 truncate text-[15px] font-bold text-red-700">
        {one ? `${one.title} 열려 있음${one.summary ? ` · ${one.summary}` : ''}` : `학생에게 열려 있는 활동 ${open.length}개`}
      </span>
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" onClick={onOpenTab} className="h-9 px-3 rounded-lg text-[14px] font-bold text-red-700 hover:bg-red-100">
          수업 활동 보기
        </button>
        {one && (
          <button type="button" onClick={() => one.end?.()} className="h-9 px-4 rounded-lg bg-red-500 hover:bg-red-600 text-[14px] font-black text-white">
            {one.endLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// 탭 이름 옆 빨간 표시: 열려 있는 활동이 있으면 빨간 숫자
export function ActivityTabMark() {
  const { open } = useActivityState();
  if (open.length === 0) return null;
  return (
    <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[12px] font-black inline-flex items-center justify-center" aria-label={`열려 있는 활동 ${open.length}개`}>
      {open.length}
    </span>
  );
}
