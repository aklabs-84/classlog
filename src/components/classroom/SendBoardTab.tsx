import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Send, FileQuestion } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import SentStatusPanel from './SentStatusPanel';

interface Props {
  schools: { id: string; name: string }[];
  teacherNames: Record<string, string>;
}

interface QuizRow { id: string; title: string }
interface ClassRow { id: string; name: string; school_project_id: string; assigned_teacher_id: string }

/** 사업 담당자가 만든 화이트보드를 선택한 반의 담당 강사에게 복사본으로 보내 주는 탭 */
export default function SendBoardTab({ schools, teacherNames }: Props) {
  const { user } = useAuth();
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [quizId, setQuizId] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const schoolKey = schools.map(s => s.id).join(',');

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: qs }, { data: cs }] = await Promise.all([
        supabase.from('whiteboards').select('id, title').eq('created_by', user.id).is('session_id', null).eq('is_template', false).is('archived_at', null).order('updated_at', { ascending: false }),
        schools.length === 0 ? Promise.resolve({ data: [] as any[] }) :
          supabase.from('classes').select('id, name, school_project_id, assigned_teacher_id')
            .in('school_project_id', schools.map(s => s.id)).not('parent_class_id', 'is', null).not('assigned_teacher_id', 'is', null)
            .eq('is_archived', false).order('name'),
      ]);
      if (cancelled) return;
      setQuizzes((qs || []).map((q: any) => ({ id: q.id, title: q.title })));
      setClasses((cs || []) as ClassRow[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, schoolKey]);

  const bySchool = useMemo(() => schools
    .map(s => ({ school: s, rows: classes.filter(c => c.school_project_id === s.id) }))
    .filter(g => g.rows.length > 0), [schools, classes]);

  const toggle = (id: string) => setPicked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSchool = (rows: ClassRow[]) => setPicked(prev => {
    const n = new Set(prev);
    const all = rows.every(r => n.has(r.id));
    rows.forEach(r => (all ? n.delete(r.id) : n.add(r.id)));
    return n;
  });

  const send = async () => {
    if (!quizId || picked.size === 0) return;
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc('manager_send_board', { p_board: quizId, p_classes: [...picked] });
    setBusy(false);
    if (error || (data as any)?.error) { setMsg({ ok: false, text: '보내지 못했어요. 잠시 후 다시 시도해 주세요.' }); return; }
    const d = data as any;
    setMsg({ ok: true, text: `${d.sent}개 반에 보냈어요.${d.skipped > 0 ? ` (${d.skipped}개 반은 이미 받은 보드라 건너뛰었어요)` : ''}` });
    setPicked(new Set());
    setRefreshKey(k => k + 1);
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={24} /></div>;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-black text-lg">공통 보드 틀 보내기</h3>
        <p className="text-sm text-on-surface-variant mt-1">내가 만든 화이트보드를 고른 반의 담당 강사에게 '보드 틀'로 복사해서 보내요. 강사가 조별 보드를 만들 때 이 틀을 고르면 조마다 같은 내용이 채워져요. 조 수와 입장은 반마다 강사가 정해요.</p>
      </div>

      {quizzes.length === 0 ? (
        <div className="rounded-2xl border border-outline-variant/40 p-6 text-center space-y-2">
          <FileQuestion className="mx-auto text-on-surface-variant" size={28} />
          <p className="text-sm font-bold">보낼 화이트보드가 아직 없어요.</p>
          <p className="text-xs text-on-surface-variant">수업 도구의 화이트보드에서 먼저 보드를 만들고 내용을 채워 주세요.</p>
          <Link to="/teaching-tools" className="inline-block text-xs font-black text-primary hover:underline">수업 도구로 가기</Link>
        </div>
      ) : (
        <>
          <div>
            <p className="text-xs font-black text-on-surface-variant mb-1.5">1. 보낼 보드 고르기</p>
            <select value={quizId} onChange={e => { setQuizId(e.target.value); setMsg(null); }}
              className="w-full max-w-md rounded-xl border border-outline-variant px-3 py-2.5 text-sm bg-surface-container-lowest">
              <option value="">보드를 선택하세요</option>
              {quizzes.map(q => <option key={q.id} value={q.id}>{q.title}</option>)}
            </select>
          </div>

          <div>
            <p className="text-xs font-black text-on-surface-variant mb-1.5">2. 받을 반 고르기 (담당 강사가 배정된 반만 나와요)</p>
            {bySchool.length === 0 ? (
              <p className="text-sm text-on-surface-variant">강사가 배정된 반이 아직 없어요.</p>
            ) : (
              <div className="space-y-3">
                {bySchool.map(({ school, rows }) => (
                  <div key={school.id} className="rounded-2xl border border-outline-variant/40 overflow-hidden">
                    <label className="flex items-center gap-2 px-4 py-2.5 bg-surface-container-low cursor-pointer text-sm font-black">
                      <input type="checkbox" checked={rows.every(r => picked.has(r.id))} onChange={() => toggleSchool(rows)} />
                      {school.name} 전체 <span className="text-xs font-bold text-on-surface-variant">({rows.length}개 반)</span>
                    </label>
                    <div className="grid sm:grid-cols-2 gap-x-4 px-4 py-2">
                      {rows.map(r => (
                        <label key={r.id} className="flex items-center gap-2 py-1.5 text-sm cursor-pointer min-w-0">
                          <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} />
                          <span className="truncate font-semibold">{r.name}</span>
                          <span className="text-xs text-on-surface-variant truncate">{teacherNames[r.assigned_teacher_id] || '강사'}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {msg && <p className={`text-sm font-bold ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{msg.text}</p>}
          <button disabled={!quizId || picked.size === 0 || busy} onClick={send}
            className="px-5 py-3 rounded-xl bg-primary text-on-primary font-bold text-sm disabled:opacity-40 inline-flex items-center gap-1.5">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} {picked.size}개 반에 보내기
          </button>
        </>
      )}
      <SentStatusPanel kind="board" schoolIds={schools.map(s => s.id)} teacherNames={teacherNames} refreshKey={refreshKey} />
    </div>
  );
}
