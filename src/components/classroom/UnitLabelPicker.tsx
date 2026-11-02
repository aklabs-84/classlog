import type { UnitLabel } from '../../lib/unitLabel';

interface Props {
  value: UnitLabel;
  /** 일정으로 추천되는 단위 (하루 수업이면 '차시') */
  recommended: UnitLabel;
  onChange: (v: UnitLabel) => void;
}

/** 수업 단위 고르기 — 학생 제출·기록 화면에 "3주차" 대신 "3차시"로 보이게 한다 */
const UnitLabelPicker = ({ value, recommended, onChange }: Props) => (
  <div className="space-y-2">
    <label className="text-xs font-black text-neutral-600 ml-1 uppercase tracking-widest">수업 나누는 단위</label>
    <div className="flex gap-2 p-1 bg-neutral-100 rounded-xl">
      {(['주차', '차시'] as UnitLabel[]).map(u => (
        <button
          key={u}
          type="button"
          onClick={() => onChange(u)}
          className={`flex-1 py-2.5 text-sm font-black rounded-lg border transition-all ${value === u ? 'bg-white shadow-sm text-primary border-primary/30' : 'text-neutral-500 border-transparent hover:text-neutral-700 hover:bg-neutral-50'}`}
        >
          {u === '주차' ? '주차 (여러 주에 걸친 수업)' : '차시 (하루 수업)'}
        </button>
      ))}
    </div>
    <p className="text-[11px] text-neutral-400 font-bold ml-1">
      {recommended === '차시' ? '수업 일정이 하루라서 "차시"를 추천해요. ' : ''}학생 제출·기록 화면에 "1{value}"처럼 보여요.
    </p>
  </div>
);

export default UnitLabelPicker;
