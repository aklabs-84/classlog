import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { fetchAttendance, markAttendance, type AttendanceSnapshot, type AttStatus } from '../../lib/galleryAssistant';

// 앱의 출석 탭과 같은 이름·색
const STATUSES: { key: AttStatus; label: string; on: string }[] = [
  { key: 'present', label: '출석', on: 'bg-emerald-600 text-white border-emerald-600' },
  { key: 'late', label: '지각', on: 'bg-amber-500 text-white border-amber-500' },
  { key: 'absent', label: '결석', on: 'bg-rose-600 text-white border-rose-600' },
  { key: 'early_leave', label: '조퇴', on: 'bg-orange-500 text-white border-orange-500' },
  { key: 'excused', label: '공결', on: 'bg-sky-600 text-white border-sky-600' },
];

const POLL_MS = 5000; // 5초마다 한 번만 확인 (실시간 연결을 쓰지 않아 사용량이 거의 늘지 않아요)

const hhmm = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

interface Props {
  token: string;
  /** 표시·기록에 쓸 내 이름 (로그인한 주강사면 서버가 알아서 정해요) */
  name: string;
  isTeacher: boolean;
}

const AssistantAttendance = ({ token, name, isTeacher }: Props) => {
  const [snap, setSnap] = useState<AttendanceSnapshot | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<Set<string>>(new Set());
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const s = await fetchAttendance(token);
      // 내가 방금 누른 학생은 서버 응답이 돌아오기 전까지 화면 값을 유지
      setSnap(prev => {
        if (!prev || pendingRef.current.size === 0) return s;
        const keep = prev.records.filter(r => pendingRef.current.has(r.student_id));
        return { ...s, records: [...s.records.filter(r => !pendingRef.current.has(r.student_id)), ...keep] };
      });
      setError('');
    } catch (e: any) {
      setError(e?.message ?? '불러오지 못했어요.');
    } finally {
      inFlight.current = false;
    }
  }, [token]);

  // 화면이 보일 때만 5초마다 확인
  useEffect(() => {
    load();
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, POLL_MS);
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [load]);

  const mark = async (studentId: string, status: AttStatus) => {
    if (!isTeacher && !name.trim()) { setError('위에 내 이름을 먼저 적어 주세요.'); return; }
    if (!snap) return;
    const cur = snap.records.find(r => r.student_id === studentId)?.status ?? null;
    const next: AttStatus | null = cur === status ? null : status; // 같은 버튼을 다시 누르면 취소
    const who = isTeacher ? '주강사' : name.trim();
    setError('');
    setPending(p => new Set(p).add(studentId));
    setSnap({
      ...snap,
      records: [
        ...snap.records.filter(r => r.student_id !== studentId),
        ...(next ? [{ student_id: studentId, status: next, marked_by: who, marked_at: new Date().toISOString() }] : []),
      ],
    });
    try {
      const s = await markAttendance(token, name.trim(), studentId, next);
      setPending(p => { const n = new Set(p); n.delete(studentId); return n; });
      pendingRef.current = new Set([...pendingRef.current].filter(x => x !== studentId));
      setSnap(s);
    } catch (e: any) {
      setPending(p => { const n = new Set(p); n.delete(studentId); return n; });
      pendingRef.current = new Set([...pendingRef.current].filter(x => x !== studentId));
      setError(e?.message ?? '저장하지 못했어요.');
      load();
    }
  };

  if (!snap) {
    return error
      ? <div className="bg-rose-50 text-rose-700 rounded-xl px-4 py-3 text-sm">{error}</div>
      : <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>;
  }

  const byStudent = new Map(snap.records.map(r => [r.student_id, r]));
  const marked = snap.records.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-bold text-gray-800">{snap.date.slice(5).replace('-', '월 ')}일 출석 · {marked}/{snap.students.length}명 체크</span>
        <button type="button" onClick={load} className="flex items-center gap-1 text-xs text-gray-500 px-2 py-1 rounded-lg hover:bg-gray-100">
          <RefreshCw className="w-3.5 h-3.5" /> 새로고침
        </button>
      </div>
      <p className="text-xs text-gray-400">다른 선생님이 체크하면 5초 안에 이 화면에도 나타나요. 같은 버튼을 한 번 더 누르면 취소돼요.</p>
      {error && <div className="bg-rose-50 text-rose-700 rounded-xl px-3 py-2 text-sm">{error}</div>}
      {snap.students.length === 0 && <p className="text-sm text-gray-500 py-4 text-center">이 반에 등록된 학생이 없어요.</p>}
      <ul className="space-y-2">
        {snap.students.map(s => {
          const r = byStudent.get(s.id);
          return (
            <li key={s.id} className="border border-gray-200 rounded-xl p-3 bg-white">
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <span className="font-bold text-gray-900">{s.full_name}</span>
                {r?.marked_by && <span className="text-[11px] text-gray-400 truncate">{r.marked_by} · {hhmm(r.marked_at)}</span>}
              </div>
              <div className="grid grid-cols-5 gap-1">
                {STATUSES.map(st => (
                  <button
                    key={st.key}
                    type="button"
                    onClick={() => mark(s.id, st.key)}
                    className={`rounded-lg border py-2 text-sm font-bold ${r?.status === st.key ? st.on : 'bg-white text-gray-500 border-gray-200'}`}
                  >{st.label}</button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default AssistantAttendance;
