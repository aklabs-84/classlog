import { useEffect, useState } from 'react';
import { Users, CheckCircle2, X, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Row { id: string; full_name: string; student_number: string; created_at: string }

interface Props {
  classId: string;
  /** 수락이 끝난 뒤(명단 확정) 부모가 반 정보·학생 목록을 다시 불러오도록 */
  onAccepted: () => void | Promise<void>;
}

// 현장 명단 입력 모드에서, 학생들이 입력 중인 명단을 3초마다 갱신해 보여주고 "수락"으로 확정한다
const LiveRosterPanel = ({ classId, onAccepted }: Props) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      const { data, error: e } = await supabase.rpc('live_roster_teacher_list', { p_class_id: classId });
      if (stopped) return;
      if (!e && Array.isArray(data)) setRows(data as Row[]);
    };
    load();
    const timer = setInterval(load, 3000);
    return () => { stopped = true; clearInterval(timer); };
  }, [classId]);

  const handleAccept = async () => {
    if (rows.length > 0 && !window.confirm(`${rows.length}명의 명단을 확정하고 학생 화면을 이름 선택 화면으로 넘길까요?`)) return;
    setAccepting(true);
    setError('');
    const { error: e } = await supabase.rpc('live_roster_accept', { p_class_id: classId });
    setAccepting(false);
    if (e) { setError('수락에 실패했어요. 잠시 후 다시 시도해주세요.'); return; }
    await onAccepted();
  };

  const handleRemove = async (id: string) => {
    await supabase.rpc('live_roster_remove', { p_class_id: classId, p_request_id: id });
    setRows(prev => prev.filter(r => r.id !== id));
  };

  // 입력된 명단을 전부 지우고 처음부터 다시 받는다 (학생은 새로고침 후 다시 입력)
  const handleResetAll = async () => {
    if (rows.length === 0) return;
    if (!window.confirm(`입력된 ${rows.length}명을 모두 지우고 처음부터 다시 받을까요?\n학생들은 화면을 새로고침해서 다시 입력해야 해요.`)) return;
    setResetting(true);
    setError('');
    const results = await Promise.all(rows.map(r => supabase.rpc('live_roster_remove', { p_class_id: classId, p_request_id: r.id })));
    setResetting(false);
    if (results.some(r => r.error)) setError('일부를 지우지 못했어요. 다시 시도해주세요.');
    const { data } = await supabase.rpc('live_roster_teacher_list', { p_class_id: classId });
    if (Array.isArray(data)) setRows(data as Row[]);
  };

  const sorted = [...rows].sort((a, b) => (parseInt(a.student_number) || 9999) - (parseInt(b.student_number) || 9999));

  return (
    <div className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 px-6 py-5 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><Users size={20} /></div>
          <div>
            <p className="text-sm font-black text-on-surface">학생이 명단을 입력하고 있어요</p>
            <p className="text-xs font-bold text-on-surface-variant">지금까지 <span className="text-primary text-base font-black tabular-nums">{rows.length}</span>명 입력 · 모두 입력했다면 수락을 눌러주세요</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setOpen(o => !o)} className="px-4 py-2 rounded-xl text-xs font-black bg-white border border-surface-container-high text-on-surface-variant hover:bg-surface-container transition-all">
            {open ? '명단 접기' : '명단 보기'}
          </button>
          <button onClick={handleResetAll} disabled={resetting || rows.length === 0} title="입력된 명단을 모두 지우고 다시 받기"
            className="px-4 py-2 rounded-xl text-xs font-black bg-white border border-error/30 text-error hover:bg-error/5 transition-all disabled:opacity-40">
            {resetting ? '지우는 중…' : '전체 취소·다시 받기'}
          </button>
          <button onClick={handleAccept} disabled={accepting}
            className="px-5 py-2 rounded-xl text-xs font-black bg-primary text-white flex items-center gap-1.5 hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50">
            {accepting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} 수락하고 시작
          </button>
        </div>
      </div>
      {error && <p className="text-error text-xs font-black">{error}</p>}
      {open && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-64 overflow-y-auto">
          {sorted.length === 0 && <p className="col-span-full text-xs font-bold text-on-surface-variant">아직 입력한 학생이 없어요.</p>}
          {sorted.map(r => (
            <div key={r.id} className="flex items-center justify-between gap-2 bg-white rounded-xl px-3 py-2 border border-surface-container-high">
              <span className="text-xs font-black truncate">{r.student_number}번 {r.full_name}</span>
              <button onClick={() => handleRemove(r.id)} title="이 입력 삭제" className="text-on-surface-variant hover:text-error shrink-0"><X size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LiveRosterPanel;
