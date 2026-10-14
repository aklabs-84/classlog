import { useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Props {
  kind: 'quiz' | 'board';
  schoolIds: string[];
  teacherNames: Record<string, string>;
  refreshKey: number;
}

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : '-');

/** 담당자가 보낸 퀴즈·보드 틀이 각 반에서 어떻게 쓰이는지 읽기 전용으로 보여 주는 표 */
export default function SentStatusPanel({ kind, schoolIds, teacherNames, refreshKey }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const key = schoolIds.join(',');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const unsend = async (r: any) => {
    if (!r.id || busyId) return;
    const label = kind === 'quiz' ? '퀴즈' : '보드 틀';
    if (!window.confirm(`'${r.class_name}'에 보낸 "${r.title}" ${label}를 취소(삭제)할까요?\n받은 강사 화면에서도 사라지고, 되돌릴 수 없어요.`)) return;
    setBusyId(r.id); setMsg('');
    const { data, error } = await supabase.rpc(kind === 'quiz' ? 'manager_unsend_quiz' : 'manager_unsend_board', kind === 'quiz' ? { p_quiz: r.id } : { p_board: r.id });
    const d = data as any;
    if (error || d?.error) {
      setMsg(d?.error === 'ALREADY_USED' ? '이미 수업에서 진행된 퀴즈라 삭제할 수 없어요.' : '삭제하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } else {
      setRows(prev => prev.filter(x => x.id !== r.id));
    }
    setBusyId(null);
  };

  useEffect(() => {
    if (schoolIds.length === 0) { setRows([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setFailed(false);
    supabase.rpc('manager_distribution_status', { p_schools: schoolIds }).then(({ data, error }) => {
      if (cancelled) return;
      const d = data as any;
      if (error || d?.error) setFailed(true);
      else setRows((kind === 'quiz' ? d.quizzes : d.boards) || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, kind, refreshKey]);

  return (
    <div className="pt-4 border-t border-outline-variant/40 space-y-2">
      <h4 className="font-black text-base">보낸 {kind === 'quiz' ? '퀴즈' : '보드 틀'} 현황 <span className="text-xs font-bold text-on-surface-variant">(읽기 전용)</span></h4>
      {msg && <p className="text-sm text-red-600 font-bold">{msg}</p>}
      {loading ? <Loader2 className="animate-spin text-primary" size={18} />
        : failed ? <p className="text-sm text-red-600 font-bold">현황을 불러오지 못했어요.</p>
        : rows.length === 0 ? <p className="text-sm text-on-surface-variant">아직 보낸 {kind === 'quiz' ? '퀴즈' : '보드 틀'}가 없어요.</p>
        : (
          <div className="overflow-x-auto rounded-2xl border border-outline-variant/40">
            <table className="w-full text-sm">
              <thead className="bg-surface-container-low text-xs text-on-surface-variant">
                <tr>
                  <th className="text-left px-3 py-2">반</th>
                  <th className="text-left px-3 py-2">강사</th>
                  <th className="text-left px-3 py-2">{kind === 'quiz' ? '퀴즈' : '보드 틀'}</th>
                  <th className="text-left px-3 py-2">보낸 날</th>
                  {kind === 'quiz'
                    ? <><th className="text-right px-3 py-2">진행 횟수</th><th className="text-right px-3 py-2">참여 기록</th><th className="text-left px-3 py-2">마지막 진행</th></>
                    : <th className="text-right px-3 py-2">그 뒤 만든 조 보드</th>}
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-outline-variant/30">
                    <td className="px-3 py-2 font-semibold whitespace-nowrap">{r.class_name}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{teacherNames[r.teacher_id] || '-'}</td>
                    <td className="px-3 py-2">{r.title}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmt(r.sent_at)}</td>
                    {kind === 'quiz' ? (
                      <>
                        <td className="px-3 py-2 text-right">{r.sessions > 0 ? `${r.sessions}회` : <span className="text-on-surface-variant">아직 안 함</span>}</td>
                        <td className="px-3 py-2 text-right">{r.players}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{fmt(r.last_played)}</td>
                      </>
                    ) : (
                      <td className="px-3 py-2 text-right">{r.boards_made > 0 ? `${r.boards_made}개` : <span className="text-on-surface-variant">아직 안 만듦</span>}</td>
                    )}
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button type="button" onClick={() => unsend(r)} disabled={busyId === r.id || (kind === 'quiz' && r.sessions > 0)}
                        title={kind === 'quiz' && r.sessions > 0 ? '이미 진행된 퀴즈는 삭제할 수 없어요' : '보낸 것 취소(삭제)'}
                        className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed">
                        {busyId === r.id ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />} 취소
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
