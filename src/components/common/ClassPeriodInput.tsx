import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

export type PeriodMode = 'single' | 'range' | 'dates';

export interface PeriodValue {
  mode: PeriodMode;
  startDate: string;
  endDate: string;
  /** 'dates' 모드에서만 의미 있음. 빈 값 제거·중복 제거·오름차순 정렬된 상태 */
  dates: string[];
  /** '날짜 직접 선택'에서 다른 방식으로 막 바꾼 순간에만 true */
  leftDatesMode?: boolean;
}

interface Props {
  startDate: string;
  endDate: string;
  /** 저장돼 있던 날짜 목록이 있으면 '날짜 직접 선택'으로 시작 */
  initialDates?: string[];
  onChange: (value: PeriodValue) => void;
  /** surface: 학교 모달 계열, neutral: 클래스룸 계열 */
  variant?: 'surface' | 'neutral';
}

export const normalizeDates = (dates: string[]): string[] =>
  Array.from(new Set(dates.filter(Boolean))).sort();

const MODES: { mode: PeriodMode; label: string }[] = [
  { mode: 'single', label: '하루 수업' },
  { mode: 'range', label: '연속된 기간' },
  { mode: 'dates', label: '날짜 직접 선택' },
];

const ClassPeriodInput = ({ startDate, endDate, initialDates, onChange, variant = 'surface' }: Props) => {
  const [mode, setMode] = useState<PeriodMode>(() => {
    if (initialDates && initialDates.length > 0) return 'dates';
    if (startDate && startDate === endDate) return 'single';
    return 'range';
  });
  const [dates, setDates] = useState<string[]>(() => (initialDates && initialDates.length > 0 ? [...initialDates] : ['']));

  const inputCls = variant === 'neutral'
    ? 'w-full px-4 py-3 bg-neutral-100 border-2 border-neutral-200 hover:border-neutral-300 focus:border-primary/40 focus:bg-white rounded-xl font-bold text-sm text-neutral-900 transition-all outline-none'
    : 'w-full px-3 py-2.5 rounded-xl text-sm bg-surface-container border border-transparent focus:outline-none focus:ring-2 focus:ring-primary/20';
  const labelCls = variant === 'neutral'
    ? 'text-[10px] font-black text-neutral-400 ml-1'
    : 'text-xs font-bold text-on-surface-variant';
  const hintCls = variant === 'neutral'
    ? 'text-[11px] text-neutral-400 font-bold ml-1'
    : 'text-[11px] text-on-surface-variant/70 font-bold';

  const emitDates = (next: string[]) => {
    const clean = normalizeDates(next);
    onChange({
      mode: 'dates',
      startDate: clean[0] || '',
      endDate: clean[clean.length - 1] || '',
      dates: clean,
    });
  };

  const switchMode = (next: PeriodMode) => {
    if (next === mode) return;
    const leftDatesMode = mode === 'dates';
    setMode(next);
    if (next === 'single') {
      onChange({ mode: next, startDate, endDate: startDate, dates: [], leftDatesMode });
    } else if (next === 'range') {
      onChange({ mode: next, startDate, endDate, dates: [], leftDatesMode });
    } else {
      const seed = startDate ? [startDate] : [''];
      setDates(seed);
      emitDates(seed);
    }
  };

  const clean = normalizeDates(dates);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        {MODES.map((opt) => (
          <button
            key={opt.mode}
            type="button"
            onClick={() => switchMode(opt.mode)}
            className={`flex-1 py-2 text-[11px] font-black rounded-lg border transition-all ${mode === opt.mode ? 'bg-white shadow-sm text-primary border-primary/30' : 'text-neutral-500 border-transparent hover:text-neutral-700 hover:bg-neutral-100'}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {mode === 'single' && (
        <div className="space-y-1">
          <label className={labelCls}>수업 날짜</label>
          <input
            type="date"
            value={startDate}
            onChange={e => onChange({ mode, startDate: e.target.value, endDate: e.target.value, dates: [] })}
            className={inputCls}
          />
        </div>
      )}

      {mode === 'range' && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className={labelCls}>시작일</label>
            <input
              type="date"
              value={startDate}
              onChange={e => {
                const v = e.target.value;
                // 종료일이 비었거나 시작일보다 앞서면 시작일에 맞춰 채움
                const nextEnd = !endDate || endDate < v ? v : endDate;
                onChange({ mode, startDate: v, endDate: nextEnd, dates: [] });
              }}
              className={inputCls}
            />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>종료일</label>
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={e => onChange({ mode, startDate, endDate: e.target.value, dates: [] })}
              className={inputCls}
            />
          </div>
        </div>
      )}

      {mode === 'dates' && (
        <div className="space-y-2">
          {dates.map((date, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="date"
                value={date}
                onChange={e => {
                  const next = [...dates];
                  next[idx] = e.target.value;
                  setDates(next);
                  emitDates(next);
                }}
                className={`flex-1 ${inputCls}`}
              />
              {dates.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const next = dates.filter((_, i) => i !== idx);
                    setDates(next);
                    emitDates(next);
                  }}
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-neutral-400 hover:text-error hover:bg-error/10 transition-colors shrink-0"
                  aria-label="날짜 삭제"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setDates([...dates, ''])}
            className="flex items-center gap-1.5 text-xs font-black text-primary hover:text-primary/80 transition-colors ml-1"
          >
            <Plus size={13} /> 날짜 추가
          </button>
        </div>
      )}

      {mode === 'dates' && clean.length > 0 && (
        <p className="text-[11px] font-black text-primary ml-1">
          시작 {clean[0]} ~ 종료 {clean[clean.length - 1]} (수업 {clean.length}일)
        </p>
      )}
      <p className={hintCls}>
        {mode === 'dates'
          ? '시작일·종료일은 찍은 날짜 중 가장 빠른 날과 늦은 날로 자동 정해져요. 마지막 수업일이 지나면 학생 제출이 닫혀요.'
          : mode === 'single'
            ? '하루만 하는 수업이에요. 그날이 지나면 학생 제출이 닫혀요.'
            : '종료일(마지막 수업일)이 지나면 학생 제출이 닫혀요.'}
      </p>
    </div>
  );
};

export default ClassPeriodInput;
