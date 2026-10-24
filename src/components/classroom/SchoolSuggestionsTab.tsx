import { useEffect, useState } from 'react';
import { Loader2, Megaphone, CheckCircle2, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Props {
  classes: { id: string; name: string; teacherName?: string | null }[];
}

type Row = {
  id: string;
  class_id: string;
  content: string;
  student_name: string | null;
  teacher_reply: string | null;
  replied_at: string | null;
  created_at: string;
};

/** 학교 안 모든 반에서 학생이 올린 질문·건의를 반별로 모아 읽기만 하는 탭 (답글은 담당 선생님이 건의함에서) */
const SchoolSuggestionsTab = ({ classes }: Props) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [classId, setClassId] = useState('');

  const idsKey = classes.map(c => c.id).join(',');
  useEffect(() => {
    const ids = idsKey ? idsKey.split(',') : [];
    if (ids.length === 0) { setRows([]); setLoading(false); return; }
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('student_suggestions')
        .select('id, class_id, content, student_name, teacher_reply, replied_at, created_at')
        .in('class_id', ids)
        .order('created_at', { ascending: false });
      setRows((data as Row[]) || []);
      setLoading(false);
    })();
  }, [idsKey]);

  const shown = classId ? rows.filter(r => r.class_id === classId) : rows;
  const countOf = (id: string) => rows.filter(r => r.class_id === id).length;

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setClassId('')} className={`px-3.5 py-2 rounded-xl text-sm font-bold border ${classId === '' ? 'bg-primary text-on-primary border-primary' : 'bg-white border-slate-200 text-slate-600'}`}>
          전체 {rows.length}
        </button>
        {classes.map(c => (
          <button key={c.id} onClick={() => setClassId(c.id)} className={`px-3.5 py-2 rounded-xl text-sm font-bold border ${classId === c.id ? 'bg-primary text-on-primary border-primary' : 'bg-white border-slate-200 text-slate-600'}`}>
            {c.name} {countOf(c.id)}
          </button>
        ))}
      </div>
      <p className="text-sm text-slate-500">읽기만 할 수 있어요. 답글은 그 반의 담당 선생님이 건의함에서 남겨요.</p>

      {shown.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Megaphone size={32} className="mx-auto mb-2" />
          <p className="font-bold">올라온 질문·건의가 없어요.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map(r => {
            const cls = classes.find(c => c.id === r.class_id);
            return (
              <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 flex-wrap mb-2 text-sm">
                  <span className="font-black text-slate-800">{r.student_name || '익명'}</span>
                  <span className="text-slate-500">{cls?.name}{cls?.teacherName ? ` · ${cls.teacherName}` : ''}</span>
                  <span className="text-slate-400">{new Date(r.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  {r.teacher_reply
                    ? <span className="flex items-center gap-1 text-emerald-600 font-bold"><CheckCircle2 size={14} /> 답변함</span>
                    : <span className="flex items-center gap-1 text-amber-600 font-bold"><Clock size={14} /> 답변 대기</span>}
                </div>
                <p className="text-base text-slate-800 whitespace-pre-wrap leading-relaxed">{r.content}</p>
                {r.teacher_reply && (
                  <p className="mt-2 text-base text-slate-600 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap leading-relaxed">↳ {r.teacher_reply}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SchoolSuggestionsTab;
