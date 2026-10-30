import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ShortcutRow } from './ShortcutRow';

interface ProgressRow {
  student_id: string; team_name: string | null; page: number; page_label: string | null;
  step_no: number | null; step_total: number | null; step_label: string | null;
  completed_pages: number[]; submitted_pages: number[]; online: boolean; last_seen: string;
}
interface Student { id: string; full_name: string; student_number: string | null }

const PAGE_NAMES = ['팀 프로필', '아이스브레이킹', '몬스터 스타트업', '기획서', '앱 만들기'];
const STALE_SEC = 60;
const LEFT_SEC = 10;
const RECENT_HOURS = 12;

type St = 'off' | 'done' | 'left' | 'stale' | 'go';
const ST_LABEL: Record<St, string> = { off: '접속 전', done: '끝', left: '나감', stale: '신호 없음', go: '진행 중' };
const ST_COLOR: Record<St, string> = {
  off: 'bg-neutral-100 text-neutral-500', done: 'bg-blue-100 text-blue-700',
  left: 'bg-amber-100 text-amber-700', stale: 'bg-red-100 text-red-700', go: 'bg-emerald-100 text-emerald-700',
};

function statusOf(r: ProgressRow | undefined, now: number): St {
  if (!r) return 'off';
  if ((r.submitted_pages || []).includes(4)) return 'done';
  const age = (now - Date.parse(r.last_seen)) / 1000;
  if (!r.online && age > LEFT_SEC) return 'left';
  if (age > STALE_SEC) return 'stale';
  return 'go';
}

function useProgress(classId: string, active: boolean) {
  const [rows, setRows] = useState<ProgressRow[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [now, setNow] = useState(Date.now());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const load = async () => {
      const [p, s] = await Promise.all([
        supabase.from('studio_progress').select('*').eq('class_id', classId).limit(500),
        supabase.from('students').select('id, full_name, student_number').eq('class_id', classId).limit(500),
      ]);
      if (!alive) return;
      if (p.data) setRows(p.data as ProgressRow[]);
      if (s.data) setStudents(s.data as Student[]);
      setNow(Date.now());
      setReady(true);
    };
    load();
    const poll = setInterval(load, 5000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { alive = false; clearInterval(poll); clearInterval(tick); };
  }, [classId, active]);

  return { rows, students, now, ready };
}

// 클래스룸: 바이브코딩 스튜디오 학생 진행 현황. 학생이 한 명이라도 들어온 반에만 보인다.
export default function ClassStudioProgressPanel({ classId }: { classId: string }) {
  const [hasData, setHasData] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const since = new Date(Date.now() - RECENT_HOURS * 3600 * 1000).toISOString();
    supabase.from('studio_progress').select('student_id', { count: 'exact', head: true })
      .eq('class_id', classId).gte('last_seen', since)
      .then(({ count }) => { if (alive) setHasData((count ?? 0) > 0); });
    return () => { alive = false; };
  }, [classId]);

  if (!hasData && !open) return null;
  return (
    <>
      <ShortcutRow
        tone="violet"
        kind="진행"
        title="바이브코딩 스튜디오 진행 현황"
        summary="학생들이 지금 어느 단계에 있는지 실시간으로 봐요"
        action={
          <button onClick={() => setOpen(true)}
            className="text-xs font-black px-3 py-2 rounded-lg border border-violet-300 text-violet-700 hover:bg-violet-50 bg-white">
            현황 보기
          </button>
        }
      />
      {open && <ProgressBoard classId={classId} onClose={() => setOpen(false)} />}
    </>
  );
}

function ProgressBoard({ classId, onClose }: { classId: string; onClose: () => void }) {
  const { rows, students, now, ready } = useProgress(classId, true);
  const [sort, setSort] = useState<'team' | 'name' | 'slow'>('team');

  const list = useMemo(() => {
    const by = new Map(rows.map(r => [r.student_id, r]));
    const mapped = students.map(s => {
      const r = by.get(s.id);
      return { s, r, st: statusOf(r, now) };
    });
    const need = (x: { st: St }) => ({ stale: 0, left: 1, go: 2, off: 3, done: 4 }[x.st]);
    const num = (x: { s: Student }) => parseInt(x.s.student_number || '') || 9999;
    return mapped.sort((a, b) => {
      if (sort === 'slow') return need(a) - need(b) || num(a) - num(b);
      if (sort === 'team') return (a.r?.team_name || '힣').localeCompare(b.r?.team_name || '힣', 'ko') || num(a) - num(b);
      return num(a) - num(b) || a.s.full_name.localeCompare(b.s.full_name, 'ko');
    });
  }, [rows, students, now, sort]);

  const count = (st: St) => list.filter(x => x.st === st).length;
  const stage = PAGE_NAMES.map((n, i) => ({ n, i, c: list.filter(x => x.r && x.st !== 'done' && x.r.page === i).length }));

  return (
    <div onClick={onClose} className="fixed inset-0 z-[1000] bg-black/50 flex items-center justify-center p-3">
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-neutral-200">
          <h3 className="flex-1 text-base font-black">바이브코딩 스튜디오 진행 현황</h3>
          <span className="text-xs font-bold text-neutral-400">5초마다 자동 갱신</span>
          <button onClick={onClose} aria-label="닫기" className="p-1 text-neutral-400 hover:text-neutral-700"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap gap-2 mb-3">
            {(['go', 'stale', 'left', 'done', 'off'] as St[]).map(k => (
              <span key={k} className={`text-xs font-black px-3 py-1.5 rounded-lg ${ST_COLOR[k]}`}>{ST_LABEL[k]} {count(k)}명</span>
            ))}
          </div>
          <div className="grid grid-cols-5 border border-neutral-200 rounded-xl mb-4 text-center overflow-hidden">
            {stage.map(g => (
              <div key={g.i} className="py-2 px-1 border-r last:border-r-0 border-neutral-200">
                <div className="text-lg font-black tabular-nums">{g.c}명</div>
                <div className="text-[11px] font-bold text-neutral-500 leading-tight">{g.n} 중</div>
              </div>
            ))}
          </div>
          <div className="flex gap-1 mb-3">
            {([['team', '팀별'], ['name', '번호순'], ['slow', '도움 필요 먼저']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setSort(k)}
                className={`text-xs font-black px-3 py-1.5 rounded-lg border ${sort === k ? 'border-violet-500 text-violet-700 bg-violet-50' : 'border-neutral-200 text-neutral-500 bg-white'}`}>{l}</button>
            ))}
          </div>
          {!ready && <p className="text-sm font-bold text-neutral-400 py-6 text-center">불러오는 중…</p>}
          <ul className="divide-y divide-neutral-100">
            {list.map(({ s, r, st }) => {
              const finished = new Set([...(r?.completed_pages || []), ...(r?.submitted_pages || [])]);
              const age = r ? Math.max(0, Math.round((now - Date.parse(r.last_seen)) / 1000)) : 0;
              const frac = r?.step_total ? ` (${r.step_no}/${r.step_total})` : '';
              return (
                <li key={s.id} className="py-2.5 flex items-center gap-3">
                  <div className="w-28 shrink-0 min-w-0">
                    <p className="text-sm font-black truncate">{s.student_number ? `${s.student_number}번 ` : ''}{s.full_name}</p>
                    {r?.team_name && <p className="text-[11px] font-bold text-neutral-400 truncate">{r.team_name}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0" aria-hidden>
                    {PAGE_NAMES.map((n, i) => {
                      const cur = !!r && st !== 'done' && r.page === i && !finished.has(i);
                      return <span key={i} title={n}
                        className={`w-4 h-2 rounded-sm ${finished.has(i) ? 'bg-blue-500' : cur ? (st === 'go' ? 'bg-emerald-500' : 'bg-red-400') : 'bg-neutral-200'}`} />;
                    })}
                  </div>
                  <p className="flex-1 min-w-0 text-xs font-bold text-neutral-600 truncate">
                    {!r ? '아직 스튜디오에 들어오지 않았어요'
                      : st === 'done' ? '앱 만들기까지 제출 완료'
                      : `${r.page_label || PAGE_NAMES[r.page] || ''} · ${r.step_label || ''}${frac}`}
                  </p>
                  <span className="shrink-0 text-[11px] font-bold text-neutral-400 w-14 text-right">{r && st !== 'done' ? `${age}초 전` : ''}</span>
                  <span className={`shrink-0 text-[11px] font-black px-2 py-1 rounded-md ${ST_COLOR[st]}`}>{ST_LABEL[st]}</span>
                </li>
              );
            })}
          </ul>
          {ready && list.length === 0 && <p className="text-sm font-bold text-neutral-400 py-6 text-center">이 반에 등록된 학생이 없어요</p>}
        </div>
      </div>
    </div>
  );
}
