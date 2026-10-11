export type EntryMode = 'roster' | 'common_named' | 'common_anon' | 'live_roster';

const OPTIONS: { value: EntryMode; title: string; desc: string }[] = [
  { value: 'roster', title: '명단으로 입장 (기본)', desc: '선생님이 학생 명단을 미리 입력하고, 학생은 자기 이름을 눌러 PIN으로 입장해요.' },
  { value: 'live_roster', title: '현장에서 학생이 직접 입력', desc: '명단이 없을 때. 학생이 번호·이름을 입력하면 선생님이 확인 후 수락해요.' },
  { value: 'common_named', title: '명단 없이 (이름만 받기)', desc: '입장 코드 후 이름만 쓰고 바로 입장. 간단한 수업용이며 PIN이 없어요.' },
  { value: 'common_anon', title: '명단 없이 (익명)', desc: '입장 코드만 넣으면 바로 입장. 누가 냈는지 구분하지 않아요.' },
];

interface Props {
  value: EntryMode;
  onChange: (v: EntryMode) => void;
}

const EntryModeSelect = ({ value, onChange }: Props) => (
  <div className="space-y-1.5">
    <label className="text-xs font-black text-neutral-600 ml-1 uppercase tracking-widest">학생 입장 방식</label>
    <div className="grid gap-2">
      {OPTIONS.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`text-left px-4 py-3 rounded-xl border-2 transition-all ${
              active ? 'bg-white border-primary/40 shadow-sm' : 'bg-neutral-100 border-neutral-200 hover:border-neutral-300'
            }`}
          >
            <p className={`text-sm font-black ${active ? 'text-primary' : 'text-neutral-700'}`}>{o.title}</p>
            <p className="text-[11px] font-bold text-neutral-500 mt-0.5">{o.desc}</p>
          </button>
        );
      })}
    </div>
    {value !== 'roster' && value !== 'live_roster' && (
      <p className="text-[11px] font-bold text-amber-600 ml-1">PIN이 없어서 다른 친구 이름을 쓸 수 있어요. 평가가 필요한 수업에는 맞지 않아요.</p>
    )}
  </div>
);

export default EntryModeSelect;
