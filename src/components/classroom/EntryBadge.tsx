// 학생 목록용 "입장 여부" 표시: 오늘 입장 / 어제 / N일 전 / 입장 기록 없음 (입장 표 기록 기준, 실시간 접속 아님)
const EntryBadge = ({ lastEntry }: { lastEntry?: number | null }) => {
  let text = '입장 전';
  let on = false;
  if (lastEntry) {
    const day = (t: number) => new Date(new Date(t).toDateString()).getTime();
    const diff = Math.round((day(Date.now()) - day(lastEntry)) / 86400000);
    on = diff === 0;
    text = diff === 0 ? '오늘 입장' : diff === 1 ? '어제 입장' : `${diff}일 전 입장`;
  }
  return (
    <span
      title="입장 표를 받은 기록 기준이에요 (지금 접속 중인지는 아니에요)"
      className={`inline-flex items-center gap-1 text-[13px] font-bold whitespace-nowrap ${on ? 'text-emerald-600' : 'text-on-surface-variant/55'}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${on ? 'bg-emerald-500' : 'bg-slate-300'}`} />
      {text}
    </span>
  );
};

export default EntryBadge;
