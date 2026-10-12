import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ClassLite { id: string; name: string; students: { id: string; full_name: string }[] }
interface Props { classes: ClassLite[] }

const ATT_LABEL: Record<string, string> = { present: '출석', absent: '결석', late: '지각', early_leave: '조퇴', excused: '공결' };
const kstDate = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const ago = (days: number) => new Date(Date.now() + 9 * 3600 * 1000 - days * 86400000).toISOString().slice(0, 10);
const weekday = (d: string) => ['일', '월', '화', '수', '목', '금', '토'][new Date(d + 'T00:00:00Z').getUTCDay()];

interface Day {
  att: Record<string, number>;
  results: { title: string; student: string; cls: string }[];
  records: { activity: string; student: string; cls: string }[];
  quizzes: { title: string; cls: string; players: number }[];
}
const emptyDay = (): Day => ({ att: {}, results: [], records: [], quizzes: [] });

/** 학교 페이지의 '일자별' 탭: 날짜마다 출석·결과물·승인된 기록·퀴즈를 모아 읽기 전용으로 보여 준다 */
export default function DailyLogTab({ classes }: Props) {
  const [classId, setClassId] = useState('all');
  const [from, setFrom] = useState(ago(30));
  const [to, setTo] = useState(ago(0));
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<Record<string, Day>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());

  const target = useMemo(() => (classId === 'all' ? classes : classes.filter(c => c.id === classId)), [classes, classId]);
  const key = target.map(c => c.id).join(',');

  useEffect(() => {
    if (target.length === 0 || from > to) { setDays({}); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const classIds = target.map(c => c.id);
      const studentIds = target.flatMap(c => c.students.map(s => s.id));
      const stuMap = new Map<string, { name: string; cls: string }>();
      target.forEach(c => c.students.forEach(s => stuMap.set(s.id, { name: s.full_name, cls: c.name })));
      const clsName = new Map(target.map(c => [c.id, c.name]));
      const fromTs = `${from}T00:00:00+09:00`, toTs = `${to}T23:59:59+09:00`;

      const [att, res, obs, quiz] = await Promise.all([
        supabase.from('attendance').select('student_id, status, date').in('class_id', classIds).gte('date', from).lte('date', to).limit(5000),
        studentIds.length ? supabase.from('student_results').select('student_id, title, created_at').in('student_id', studentIds).gte('created_at', fromTs).lte('created_at', toTs).limit(3000) : Promise.resolve({ data: [] as any[] }),
        studentIds.length ? supabase.from('observations').select('student_id, activity_name, created_at').in('student_id', studentIds).eq('is_student_record', true).eq('status', 'approved').gte('created_at', fromTs).lte('created_at', toTs).limit(3000) : Promise.resolve({ data: [] as any[] }),
        supabase.from('quiz_score_history').select('class_id, session_id, quiz_set_title, played_at').in('class_id', classIds).gte('played_at', fromTs).lte('played_at', toTs).limit(5000),
      ]);
      if (cancelled) return;

      const m: Record<string, Day> = {};
      const get = (d: string) => (m[d] ||= emptyDay());
      (att.data || []).forEach((r: any) => { const d = get(r.date); d.att[r.status] = (d.att[r.status] || 0) + 1; });
      (res.data || []).forEach((r: any) => { const s = stuMap.get(r.student_id); get(kstDate(r.created_at)).results.push({ title: r.title || '제목 없음', student: s?.name || '', cls: s?.cls || '' }); });
      (obs.data || []).forEach((r: any) => { const s = stuMap.get(r.student_id); get(kstDate(r.created_at)).records.push({ activity: r.activity_name || '활동', student: s?.name || '', cls: s?.cls || '' }); });
      const qmap = new Map<string, { date: string; title: string; cls: string; players: number }>();
      (quiz.data || []).forEach((r: any) => {
        const k = r.session_id || `${r.class_id}-${r.quiz_set_title}-${r.played_at}`;
        const cur = qmap.get(k);
        if (cur) cur.players += 1;
        else qmap.set(k, { date: kstDate(r.played_at), title: r.quiz_set_title || '퀴즈', cls: clsName.get(r.class_id) || '', players: 1 });
      });
      qmap.forEach(q => get(q.date).quizzes.push({ title: q.title, cls: q.cls, players: q.players }));
      setDays(m);
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, from, to]);

  const dates = Object.keys(days).sort().reverse();
  const toggle = (d: string) => setOpen(prev => { const n = new Set(prev); n.has(d) ? n.delete(d) : n.add(d); return n; });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-black text-on-surface-variant">반
          <select value={classId} onChange={e => setClassId(e.target.value)} className="block mt-1 rounded-xl border border-outline-variant px-3 py-2 text-sm bg-surface-container-lowest text-on-surface font-semibold">
            <option value="all">전체 반</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-black text-on-surface-variant">시작일
          <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="block mt-1 rounded-xl border border-outline-variant px-3 py-2 text-sm bg-surface-container-lowest text-on-surface" />
        </label>
        <label className="text-xs font-black text-on-surface-variant">종료일
          <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className="block mt-1 rounded-xl border border-outline-variant px-3 py-2 text-sm bg-surface-container-lowest text-on-surface" />
        </label>
      </div>
      <p className="text-xs text-on-surface-variant">읽기 전용이에요. 출석, 학생 결과물, 승인된 학생 기록, 퀴즈 진행을 날짜별로 모아 보여 줘요. 기본은 최근 30일이에요.</p>

      {loading ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" size={22} /></div>
        : dates.length === 0 ? <div className="surface-card p-8 text-center text-sm text-on-surface-variant/70">이 기간에는 기록이 없어요.</div>
        : (
          <div className="space-y-2">
            {dates.map(d => {
              const day = days[d];
              const attTotal = Object.values(day.att).reduce((a, b) => a + b, 0);
              const isOpen = open.has(d);
              return (
                <div key={d} className="surface-card border border-surface-container-high overflow-hidden">
                  <button onClick={() => toggle(d)} className="w-full flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-surface-container-low/40">
                    {isOpen ? <ChevronDown size={15} className="text-on-surface-variant/50" /> : <ChevronRight size={15} className="text-on-surface-variant/50" />}
                    <span className="font-black text-sm">{d.slice(5).replace('-', '월 ')}일 ({weekday(d)})</span>
                    <span className="text-xs text-on-surface-variant">
                      출석 {attTotal ? `${day.att.present || 0}/${attTotal}` : '-'} · 결과물 {day.results.length} · 기록 {day.records.length} · 퀴즈 {day.quizzes.length}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 space-y-3 text-sm border-t border-surface-container-high">
                      <Section title="출석">
                        {attTotal ? Object.entries(day.att).map(([k, v]) => <span key={k} className="mr-3">{ATT_LABEL[k] || k} {v}명</span>) : null}
                      </Section>
                      <Section title="학생 결과물">
                        {day.results.length ? day.results.map((r, i) => <div key={i}>{r.cls} · {r.student} — {r.title}</div>) : null}
                      </Section>
                      <Section title="승인된 학생 기록">
                        {day.records.length ? day.records.map((r, i) => <div key={i}>{r.cls} · {r.student} — {r.activity}</div>) : null}
                      </Section>
                      <Section title="퀴즈">
                        {day.quizzes.length ? day.quizzes.map((q, i) => <div key={i}>{q.cls} — {q.title} ({q.players}명 참여)</div>) : null}
                      </Section>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pt-2">
      <p className="text-xs font-black text-on-surface-variant mb-1">{title}</p>
      {children ? <div className="space-y-0.5">{children}</div> : <p className="text-xs text-on-surface-variant/60">기록 없음</p>}
    </div>
  );
}
