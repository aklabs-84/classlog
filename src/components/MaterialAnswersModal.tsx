import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, ArrowLeft, Monitor } from 'lucide-react';
import { supabase } from '../lib/supabase';
import StudentMaterialPage, { AnswerPreviewMarkdown } from './StudentMaterialPage';
import type { ActivityLink } from './ActivityLinksButton';

// 교사용 "학생 답변 보기" — 자료의 입력칸(표 빈 칸 · [ ] · ___)에 학생들이 적은 내용을
// 학생별로 골라, 학생이 보던 그 화면 그대로(읽기 전용) 확인한다.

interface Props {
  material: { id: string; class_id: string | null; title: string; content: string; activity_urls?: ActivityLink[]; viewer_style?: string | null };
  mdComponents: any;
  onClose: () => void;
}

interface StudentRow { id: string; full_name: string; student_number: string | null }
interface StudentAnswers { values: Record<string, string>; filled: number; updatedAt: string }

// 체크 해제('0')와 빈 문자열은 "입력 안 함"으로 센다
const isFilled = (v: string) => v.trim() !== '' && v !== '0';

// "한눈에 보기"에서 입력칸마다 붙일 이름. 저장된 키는 "n번째 입력칸(f1, f2…)"뿐이라,
// 자료를 화면 밖에서 한 번 그려 각 칸의 주변 글(표의 왼쪽 칸 · 같은 줄 문장)을 이름으로 뽑는다.
interface FieldInfo { key: string; label: string; checkbox: boolean; group: string }

const clean = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').trim();

const collectFields = (root: HTMLElement): FieldInfo[] => {
  // 입력칸 앞에 나온 가장 가까운 제목을 "묶음 이름"으로 쓴다
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('h1, h2, h3, [data-fkey]'));
  const groupOf = new Map<Element, string>();
  let curGroup = '';
  nodes.forEach(n => { if (/^H[123]$/.test(n.tagName)) curGroup = clean(n.textContent); else groupOf.set(n, curGroup); });
  const els = nodes.filter(n => n.hasAttribute('data-fkey'));
  const perParent = new Map<Element, number>();
  return els.map((el, i) => {
    const checkbox = (el as HTMLInputElement).type === 'checkbox';
    let label = '';
    const td = el.closest('td');
    if (td && td.parentElement) {
      const cells = Array.from(td.parentElement.children);
      const idx = cells.indexOf(td);
      for (let c = idx - 1; c >= 0 && !label; c--) label = clean(cells[c].textContent);
      if (!label) label = clean(td.closest('table')?.querySelectorAll('thead th')[idx]?.textContent);
    } else {
      const parent = el.closest('li, p');
      if (parent) {
        const copy = parent.cloneNode(true) as HTMLElement;
        copy.querySelectorAll('input, textarea').forEach(n => n.remove());
        label = clean(copy.textContent);
        const n = (perParent.get(parent) ?? 0) + 1;
        perParent.set(parent, n);
        if (n > 1 || parent.querySelectorAll('[data-fkey]').length > 1) label = `${label} (${n}번째 칸)`;
      }
    }
    if (label.length > 60) label = `${label.slice(0, 60)}…`;
    return { key: `f${i + 1}`, label: label || `입력칸 ${i + 1}`, checkbox, group: groupOf.get(el) || '' };
  });
};

const MaterialAnswersModal = ({ material, mdComponents, onClose }: Props) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [byStudent, setByStudent] = useState<Record<string, StudentAnswers>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [tab, setTab] = useState<'q' | 'a' | 'map' | 'table'>('q');
  const [selQ, setSelQ] = useState<string | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const [showCheck, setShowCheck] = useState(false);
  const [fields, setFields] = useState<FieldInfo[]>([]);
  const [live, setLive] = useState(false);
  const measureRef = useRef<HTMLDivElement>(null);

  // 화면 밖에 자료를 그려 입력칸 이름을 뽑는다(그려진 순서 = 저장 키 순번)
  useEffect(() => {
    if (measureRef.current) setFields(collectFields(measureRef.current));
  }, [material.content, mdComponents, loading]);

  // 학생들의 답만 다시 읽는다(최초 로딩 · 실시간 알림 · 주기 갱신이 함께 쓴다)
  const loadAnswers = useCallback(async () => {
    const { data, error: e } = await supabase
      .from('student_material_answers')
      .select('student_id, field_key, value, updated_at')
      .eq('material_id', material.id)
      .limit(10000);
    if (e) throw e;
    const map: Record<string, StudentAnswers> = {};
    (data || []).forEach((r: any) => {
      const cur = map[r.student_id] || (map[r.student_id] = { values: {}, filled: 0, updatedAt: '' });
      cur.values[r.field_key] = r.value;
      if (isFilled(r.value)) cur.filled += 1;
      if (r.updated_at > cur.updatedAt) cur.updatedAt = r.updated_at;
    });
    setByStudent(map);
  }, [material.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 내 자료함 원본(class_id 없음)은 주차 계획이 이 자료를 가리키는 반 + 그 반에서 만든 수업용 수정본의 반 학생을 모은다
        let classIds: string[] = material.class_id ? [material.class_id] : [];
        if (!material.class_id) {
          const [planRes, forkRes] = await Promise.all([
            supabase.from('classes').select('id').contains('weekly_plan', [{ material_id: material.id }]),
            supabase.from('class_materials').select('class_id').eq('plan_origin_id', material.id).not('class_id', 'is', null),
          ]);
          const ids = new Set<string>();
          (planRes.data || []).forEach((c: any) => ids.add(c.id));
          (forkRes.data || []).forEach((m: any) => m.class_id && ids.add(m.class_id));
          classIds = [...ids];
        }
        const stuRes = classIds.length > 0
          ? await supabase.from('students').select('id, full_name, student_number').in('class_id', classIds)
          : { data: [] as StudentRow[], error: null };
        if (stuRes.error) throw stuRes.error;
        await loadAnswers();
        if (cancelled) return;
        const list = ((stuRes.data || []) as StudentRow[]).slice().sort((a, b) =>
          (a.student_number || '').localeCompare(b.student_number || '', 'ko', { numeric: true }) ||
          a.full_name.localeCompare(b.full_name, 'ko'));
        setStudents(list);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || '학생 답변을 불러오지 못했어요.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [material.id, material.class_id, loadAnswers]);

  // 실시간: 학생이 적으면 바로 반영. DB 실시간이 꺼져 있어도 5초마다 다시 읽어 따라간다.
  useEffect(() => {
    if (loading || error) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) return;
      timer = setTimeout(() => { timer = null; loadAnswers().catch(() => {}); }, 300);
    };
    const channel = supabase
      .channel(`answers-${material.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_material_answers', filter: `material_id=eq.${material.id}` }, refresh)
      .subscribe(status => setLive(status === 'SUBSCRIBED'));
    const poll = setInterval(() => { if (!document.hidden) loadAnswers().catch(() => {}); }, 5000);
    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [loading, error, material.id, loadAnswers]);

  useEffect(() => {
    if (showOriginal) return; // 학생 화면이 열려 있을 땐 그쪽 나가기 버튼만 사용
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selectedId) setSelectedId(null); else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, showOriginal, onClose]);

  const answeredCount = useMemo(() => students.filter(s => (byStudent[s.id]?.filled ?? 0) > 0).length, [students, byStudent]);
  const selected = selectedId ? students.find(s => s.id === selectedId) : null;

  // 학생이 보던 화면을 그대로(읽기 전용)
  if (selected && showOriginal) {
    return (
      <StudentMaterialPage
        key={selected.id}
        title={`${material.title} · ${selected.full_name}`}
        content={material.content}
        links={material.activity_urls}
        mdComponents={mdComponents}
        answers={{ load: async () => byStudent[selected.id]?.values ?? {} }}
        viewerStyle={material.viewer_style}
        progressKey={`answers-${material.id}`}
        onClose={() => setShowOriginal(false)}
      />
    );
  }

  const valueOf = (sid: string, key: string) => byStudent[sid]?.values[key] ?? '';
  const answeredBy = (key: string) => students.filter(s => isFilled(valueOf(s.id, key)));
  const currentQ = fields.find(f => f.key === selQ) ?? fields.find(f => !f.checkbox) ?? fields[0];
  const goQuestion = (key: string) => { setSelQ(key); setTab('q'); };
  const goStudent = (sid: string) => { setSelectedId(sid); setTab('a'); };
  const mostFilled = students.reduce<StudentRow | undefined>((best, s) => (!best || (byStudent[s.id]?.filled ?? 0) > (byStudent[best.id]?.filled ?? 0) ? s : best), undefined);
  const currentS = selected ?? mostFilled;
  const tabs = [['q', '문항별'], ['a', '학생별'], ['map', '한눈 지도'], ['table', '표']] as const;
  const empty = (msg: string) => <p className="text-base font-bold text-[#6f685c] py-16 text-center">{msg}</p>;

  const questionPane = () => {
    if (!currentQ) return empty('이 자료에는 학생이 적는 입력칸이 없어요.');
    const w = answeredBy(currentQ.key);
    const no = students.filter(s => !isFilled(valueOf(s.id, currentQ.key)));
    const idx = fields.indexOf(currentQ) + 1;
    return (
      <div className="max-w-[820px]">
        <p className="text-sm font-bold text-[#6f685c]">{currentQ.group}</p>
        <h2 className="font-serif text-[28px] leading-snug font-bold text-[#1d1b18]">{idx}. {currentQ.label}</h2>
        <p className="text-[#6f685c] mt-1 mb-6"><b className="text-[#1d1b18] text-xl">{w.length}명</b> 답함 · {no.length}명 아직</p>
        {currentQ.checkbox ? (
          <>
            <div className="flex h-6"><i style={{ width: `${(w.length / Math.max(students.length, 1)) * 100}%` }} className="bg-[#1f7a4d] transition-all" /><i className="flex-1 bg-[#ddd5c6]" /></div>
            <p className="text-[#6f685c] text-base mt-2">체크함 {w.length}명 · 안 함 {no.length}명</p>
            <div className="grid grid-cols-[110px_1fr] gap-4 py-3 border-t border-[#ddd5c6] mt-4">
              <b className="text-[#1f7a4d]">체크함</b><span className="text-xl">{w.map(s => s.full_name).join(', ') || '아직 없어요'}</span>
            </div>
          </>
        ) : w.map(s => (
          <div key={s.id} className="grid grid-cols-[110px_1fr] gap-4 py-3 border-t border-[#ddd5c6] hover:bg-[#efe9dc] hover:pl-2 transition-all">
            <button onClick={() => goStudent(s.id)} className="font-bold text-left hover:underline">{s.full_name}</button>
            <span className="text-xl whitespace-pre-wrap break-words">{valueOf(s.id, currentQ.key)}</span>
          </div>
        ))}
        {no.length > 0 && (
          <div className="mt-8 border-t-2 border-[#1d1b18] pt-3 text-[#b4531b]">
            <b>아직 안 쓴 학생 {no.length}명</b>
            <p className="mt-1">{no.map(s => s.full_name).join(' · ')}</p>
          </div>
        )}
      </div>
    );
  };

  const studentPane = () => {
    if (!currentS) return null;
    const A = fields.filter(f => isFilled(valueOf(currentS.id, f.key)));
    const E = fields.filter(f => !isFilled(valueOf(currentS.id, f.key)));
    return (
      <div className="max-w-[820px]">
        <div className="flex items-center gap-3">
          <h2 className="font-serif text-[28px] font-bold">{currentS.full_name} 학생</h2>
          <button onClick={() => { setSelectedId(currentS.id); setShowOriginal(true); }} className="flex items-center gap-1 text-sm font-bold text-[#3b3bd6] hover:underline"><Monitor size={15} />학생 화면 그대로 보기</button>
        </div>
        <p className="text-[#6f685c] mt-1 mb-6"><b className="text-[#1d1b18] text-xl">{A.length}칸</b> 작성 · {E.length}칸 비어 있음</p>
        {A.length === 0 ? <p className="border-t-2 border-[#1d1b18] pt-3 text-[#b4531b]">아직 아무것도 쓰지 않았어요.</p> : A.map(f => (
          <div key={f.key} className="grid grid-cols-[minmax(0,260px)_1fr] gap-5 py-3 border-t border-[#ddd5c6] hover:bg-[#efe9dc] hover:pl-2 transition-all">
            <button onClick={() => goQuestion(f.key)} className="text-left text-base font-semibold text-[#6f685c] hover:text-[#3b3bd6]">{fields.indexOf(f) + 1}. {f.label}</button>
            {f.checkbox ? <span className="text-[#1f7a4d] font-bold">✔ 체크했어요</span> : <span className="text-xl whitespace-pre-wrap break-words">{valueOf(currentS.id, f.key)}</span>}
          </div>
        ))}
        {E.length > 0 && (
          <button onClick={() => setShowEmpty(v => !v)} className="block w-full text-left border-t border-[#ddd5c6] py-3 text-[#6f685c] hover:text-[#1d1b18]">
            {showEmpty ? '▾' : '▸'} 안 쓴 칸 {E.length}개 {showEmpty ? '접기' : '보기'}
          </button>
        )}
        {showEmpty && E.map(f => <p key={f.key} className="py-1.5 text-[#6f685c] text-base">{fields.indexOf(f) + 1}. {f.label}</p>)}
      </div>
    );
  };

  const mapPane = () => (
    <div className="p-8 overflow-auto">
      <p className="text-sm text-[#6f685c] mb-3">누가 어느 칸을 썼는지 한눈에 봐요 · 칸을 누르면 그 문항으로, 이름을 누르면 그 학생으로 이동해요</p>
      <div className="inline-grid gap-[3px]" style={{ gridTemplateColumns: `auto repeat(${fields.length}, 22px)` }}>
        <div />
        {fields.map((f, i) => <button key={f.key} title={f.label} onClick={() => goQuestion(f.key)} className="text-[12px] font-semibold text-[#6f685c] hover:text-[#3b3bd6]">{i + 1}</button>)}
        {students.map(s => (
          <Fragment key={s.id}>
            <button onClick={() => goStudent(s.id)} className="text-sm text-[#6f685c] hover:text-[#1d1b18] text-left pr-3 whitespace-nowrap leading-[22px]">{s.full_name}</button>
            {fields.map(f => {
              const v = valueOf(s.id, f.key);
              const ok = isFilled(v);
              return <button key={f.key} onClick={() => goQuestion(f.key)} title={`${s.full_name} · ${f.label}${ok && !f.checkbox ? ` : ${v}` : ''}`}
                className={`h-[22px] rounded-[3px] transition-transform hover:scale-125 ${ok ? (f.checkbox ? 'bg-[#1f7a4d]' : 'bg-[#3b3bd6]') : 'bg-[#e6dccb]'}`} />;
            })}
          </Fragment>
        ))}
      </div>
      <p className="mt-4 text-sm text-[#6f685c] flex gap-5">
        <span><i className="inline-block w-3 h-3 rounded-sm bg-[#3b3bd6] mr-1.5" />글로 씀</span>
        <span><i className="inline-block w-3 h-3 rounded-sm bg-[#1f7a4d] mr-1.5" />체크함</span>
        <span><i className="inline-block w-3 h-3 rounded-sm bg-[#e6dccb] mr-1.5" />아직 안 씀</span>
      </p>
    </div>
  );

  const tablePane = () => {
    const cols = fields.filter(f => showCheck || !f.checkbox);
    return (
      <div className="p-8 overflow-auto">
        <label className="flex items-center gap-2 text-base text-[#6f685c] mb-4 cursor-pointer w-fit">
          <input type="checkbox" checked={showCheck} onChange={e => setShowCheck(e.target.checked)} className="accent-[#3b3bd6]" />체크 문항도 보기 · 붉은 칸은 아직 안 쓴 칸이에요
        </label>
        <table className="border-collapse text-base">
          <thead><tr>
            <th className="sticky top-0 left-0 z-20 bg-[#f6f2ea] border-b border-[#ddd5c6] px-3 py-2 text-left min-w-[90px]">학생</th>
            {cols.map(f => (
              <th key={f.key} className="sticky top-0 z-10 bg-[#f6f2ea] border-b border-[#ddd5c6] px-3 py-2 text-left align-top min-w-[160px] max-w-[260px] font-semibold text-sm text-[#6f685c]">
                <button onClick={() => goQuestion(f.key)} className="text-left hover:text-[#3b3bd6]">{fields.indexOf(f) + 1}. {f.label}<br /><span className="font-normal">{answeredBy(f.key).length}/{students.length}</span></button>
              </th>
            ))}
          </tr></thead>
          <tbody>
            {students.map(s => (
              <tr key={s.id} className="hover:bg-[#efe9dc]">
                <th className="sticky left-0 z-10 bg-[#f6f2ea] border-b border-[#ddd5c6] px-3 py-2 text-left"><button onClick={() => goStudent(s.id)} className="hover:underline">{s.full_name}</button></th>
                {cols.map(f => {
                  const v = valueOf(s.id, f.key);
                  const ok = isFilled(v);
                  return <td key={f.key} className={`border-b border-[#ddd5c6] px-3 py-2 align-top ${ok ? '' : 'bg-[#fbeadb] text-[#b4531b]'}`}>{!ok ? '–' : f.checkbox ? <span className="text-[#1f7a4d] font-bold">✔</span> : <span className="whitespace-pre-wrap break-words">{v}</span>}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const listItem = (on: boolean, onClick: () => void, title: React.ReactNode, sub: string, pct: number) => (
    <button onClick={onClick} className={`block w-full text-left px-7 py-2.5 border-l-[3px] transition-colors hover:bg-[#efe9dc] ${on ? 'bg-[#efe9dc] border-[#3b3bd6]' : 'border-transparent'}`}>
      <span className="block text-[17px] leading-snug">{title}</span>
      <span className="text-sm text-[#6f685c]">{sub}</span>
      <div className="h-1 bg-[#ddd5c6] mt-1.5 relative"><i className="absolute inset-y-0 left-0 bg-[#3b3bd6] transition-all" style={{ width: `${pct}%` }} /></div>
    </button>
  );

  const sidebar = () => {
    if (tab === 'q') {
      let g = '\u0000';
      return fields.map((f, i) => (
        <Fragment key={f.key}>
          {f.group !== g && (g = f.group, true) && <p className="text-sm tracking-wide text-[#6f685c] px-7 pt-5 pb-1.5">{f.group || '입력칸'}</p>}
          {listItem(currentQ?.key === f.key, () => setSelQ(f.key), <><span className="text-sm text-[#6f685c] mr-1.5">{i + 1}</span>{f.label}</>, `${answeredBy(f.key).length}/${students.length}명`, (answeredBy(f.key).length / Math.max(students.length, 1)) * 100)}
        </Fragment>
      ));
    }
    return (
      <>
        <p className="text-sm text-[#6f685c] px-7 pt-5 pb-1.5">학생 {students.length}명</p>
        {students.map(s => {
          const c = byStudent[s.id]?.filled ?? 0;
          return <Fragment key={s.id}>{listItem(currentS?.id === s.id, () => setSelectedId(s.id), <b>{s.full_name}</b>, c ? `${c}/${fields.length}칸` : '미작성', (c / Math.max(fields.length, 1)) * 100)}</Fragment>;
        })}
      </>
    );
  };

  const showSide = tab === 'q' || tab === 'a';
  return createPortal(
    <div className="fixed inset-0 z-[10000] bg-[#f6f2ea] text-[#1d1b18] flex flex-col" style={{ fontFamily: "'Pretendard Variable', system-ui, sans-serif" }}>
      {/* 입력칸 이름을 뽑기 위해 화면 밖에서만 그리는 자료 (보이지 않음) */}
      <div ref={measureRef} aria-hidden style={{ display: 'none' }}>
        <AnswerPreviewMarkdown content={material.content} mdComponents={mdComponents} />
      </div>
      <header className="flex items-center gap-6 px-8 py-4 border-b border-[#ddd5c6] flex-wrap">
        <button onClick={onClose} className="flex items-center gap-1.5 text-[#6f685c] hover:text-[#1d1b18]"><ArrowLeft size={18} />나가기</button>
        <div className="min-w-0">
          <h1 className="font-serif text-2xl font-bold truncate">{material.title}</h1>
          {!loading && !error && (
            <p className="text-base text-[#6f685c]">{students.length}명 중 <b className="text-[#3b3bd6]">{answeredCount}명</b>이 입력했어요 ·{' '}
              <span className="text-sm text-[#1f7a4d]"><span className="inline-block w-2 h-2 rounded-full bg-[#1f7a4d] mr-1.5 animate-pulse" />{live ? '실시간' : '5초마다 갱신'}</span></p>
          )}
        </div>
        <nav className="ml-auto flex gap-6">
          {tabs.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`py-1.5 text-lg font-semibold border-b-[3px] transition-colors ${tab === k ? 'border-[#3b3bd6] text-[#1d1b18]' : 'border-transparent text-[#6f685c] hover:text-[#1d1b18]'}`}>{label}</button>
          ))}
        </nav>
      </header>
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-[#6f685c]"><Loader2 className="animate-spin" size={28} /></div>
      ) : error ? (
        <p className="text-base font-bold text-red-600 py-16 text-center">{error}</p>
      ) : students.length === 0 ? (
        empty('이 자료가 연결된 반에 등록된 학생이 없어요.')
      ) : fields.length === 0 ? (
        empty('이 자료에는 학생이 적는 입력칸이 없어요.')
      ) : (
        <div className={`flex-1 min-h-0 grid ${showSide ? 'grid-cols-[340px_1fr]' : 'grid-cols-1'}`}>
          {showSide && <aside className="border-r border-[#ddd5c6] overflow-y-auto py-3">{sidebar()}</aside>}
          <section className="overflow-y-auto min-h-0">
            {tab === 'q' && <div className="px-14 py-9">{questionPane()}</div>}
            {tab === 'a' && <div className="px-14 py-9">{studentPane()}</div>}
            {tab === 'map' && mapPane()}
            {tab === 'table' && tablePane()}
          </section>
        </div>
      )}
    </div>,
    document.body
  );
};

export default MaterialAnswersModal;
