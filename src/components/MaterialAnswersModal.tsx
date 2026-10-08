import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X, PenLine, ChevronRight, ArrowLeft, Monitor } from 'lucide-react';
import { supabase } from '../lib/supabase';
import StudentMaterialPage, { AnswerPreviewMarkdown } from './StudentMaterialPage';
import type { ActivityLink } from './ActivityLinksButton';

// 교사용 "학생 답변 보기" — 자료의 입력칸(표 빈 칸 · [ ] · ___)에 학생들이 적은 내용을
// 학생별로 골라, 학생이 보던 그 화면 그대로(읽기 전용) 확인한다.

interface Props {
  material: { id: string; class_id: string | null; title: string; content: string; activity_urls?: ActivityLink[] };
  mdComponents: any;
  onClose: () => void;
}

interface StudentRow { id: string; full_name: string; student_number: string | null }
interface StudentAnswers { values: Record<string, string>; filled: number; updatedAt: string }

// 체크 해제('0')와 빈 문자열은 "입력 안 함"으로 센다
const isFilled = (v: string) => v.trim() !== '' && v !== '0';

// "한눈에 보기"에서 입력칸마다 붙일 이름. 저장된 키는 "n번째 입력칸(f1, f2…)"뿐이라,
// 자료를 화면 밖에서 한 번 그려 각 칸의 주변 글(표의 왼쪽 칸 · 같은 줄 문장)을 이름으로 뽑는다.
interface FieldInfo { key: string; label: string; checkbox: boolean }

const clean = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').trim();

const collectFields = (root: HTMLElement): FieldInfo[] => {
  const els = Array.from(root.querySelectorAll<HTMLElement>('[data-fkey]'));
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
    return { key: `f${i + 1}`, label: label || `입력칸 ${i + 1}`, checkbox };
  });
};

const MaterialAnswersModal = ({ material, mdComponents, onClose }: Props) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [byStudent, setByStudent] = useState<Record<string, StudentAnswers>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [mode, setMode] = useState<'student' | 'overview'>('student');
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
        const stuRes = material.class_id
          ? await supabase.from('students').select('id, full_name, student_number').eq('class_id', material.class_id)
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

  // 학생이 보던 화면을 그대로(읽기 전용) 보여준다. 저장 함수를 주지 않으면 입력칸이 잠긴다.
  if (selected && showOriginal) {
    return (
      <StudentMaterialPage
        key={selected.id}
        title={`${material.title} · ${selected.full_name}`}
        content={material.content}
        links={material.activity_urls}
        mdComponents={mdComponents}
        answers={{ load: async () => byStudent[selected.id]?.values ?? {} }}
        onClose={() => setShowOriginal(false)}
      />
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[9998] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className={`w-full ${mode === 'overview' && !selected ? 'max-w-6xl' : selected ? 'max-w-2xl' : 'max-w-lg'} max-h-[85vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden`}
        onClick={e => e.stopPropagation()}
      >
        {/* 입력칸 이름을 뽑기 위해 화면 밖에서만 그리는 자료 (보이지 않음) */}
        <div ref={measureRef} aria-hidden style={{ display: 'none' }}>
          <AnswerPreviewMarkdown content={material.content} mdComponents={mdComponents} />
        </div>
        <div className="flex items-start gap-3 px-6 pt-6 pb-4 border-b border-surface-container">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <PenLine size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-black text-lg leading-tight">{selected ? `${selected.full_name} 학생의 답변` : '학생 답변 보기'}</h3>
            <p className="text-sm text-on-surface-variant font-bold truncate mt-0.5">{material.title}</p>
            {!loading && !error && (
              <p className="text-xs text-on-surface-variant font-bold mt-1 flex items-center gap-2">
                <span>{students.length}명 중 <span className="text-primary">{answeredCount}명</span>이 입력했어요</span>
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600" title="학생이 적으면 자동으로 갱신돼요">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />{live ? '실시간' : '5초마다 갱신'}
                </span>
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-surface-container text-on-surface-variant" title="닫기">
            <X size={18} />
          </button>
        </div>

        {!loading && !error && students.length > 0 && !selected && (
          <div className="flex gap-1 px-6 pt-3">
            {([['student', '학생별'], ['overview', '한눈에 보기 (표)']] as const).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-4 py-1.5 rounded-full text-xs font-black transition-colors ${
                  mode === m ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          {selected && !loading && !error ? (
            <div className="px-2 pb-2">
              <div className="flex items-center gap-2 mb-3">
                <button onClick={() => setSelectedId(null)} className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-surface-container text-xs font-black text-on-surface-variant hover:bg-surface-container-high">
                  <ArrowLeft size={14} />목록
                </button>
                <button onClick={() => setShowOriginal(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary/10 text-xs font-black text-primary hover:bg-primary/20">
                  <Monitor size={14} />학생 화면 그대로 보기
                </button>
              </div>
              {fields.length === 0 ? (
                <p className="text-sm font-bold text-on-surface-variant px-3 py-10 text-center">이 자료에는 학생이 적는 입력칸이 없어요.</p>
              ) : (
                <ol className="space-y-2">
                  {fields.map((f, i) => {
                    const v = byStudent[selected.id]?.values[f.key] ?? '';
                    const filled = isFilled(v);
                    return (
                      <li key={f.key} className={`rounded-2xl border px-4 py-3 ${filled ? 'border-primary/25 bg-primary/5' : 'border-surface-container'}`}>
                        <p className="text-xs font-black text-on-surface-variant mb-1"><span className="text-primary mr-1.5">{i + 1}</span>{f.label}</p>
                        {!filled ? (
                          <p className="text-sm font-bold text-on-surface-variant/50">{f.checkbox ? '체크 안 함' : '적지 않았어요'}</p>
                        ) : f.checkbox ? (
                          <p className="text-sm font-black text-emerald-600">✔ 체크했어요</p>
                        ) : (
                          <p className="text-sm font-bold whitespace-pre-wrap break-words">{v}</p>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          ) : !loading && !error && students.length > 0 && mode === 'overview' ? (
            fields.length === 0 ? (
              <p className="text-sm font-bold text-on-surface-variant px-3 py-10 text-center">이 자료에는 학생이 적는 입력칸이 없어요.</p>
            ) : (
              <div className="overflow-auto max-h-[60vh] rounded-2xl border border-surface-container">
                <table className="border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr>
                      <th className="sticky top-0 left-0 z-30 bg-surface-container-low border-b border-r border-surface-container px-3 py-2 text-left text-xs font-black text-on-surface-variant min-w-[96px]">학생</th>
                      {fields.map((f, i) => {
                        const n = students.filter(s => isFilled(byStudent[s.id]?.values[f.key] ?? '')).length;
                        return (
                          <th key={f.key} title={f.label} className="sticky top-0 z-20 bg-surface-container-low border-b border-r border-surface-container px-3 py-2 text-left align-top min-w-[170px] max-w-[260px]">
                            <span className="block text-[11px] font-black text-primary">{i + 1}번 · {n}/{students.length}명</span>
                            <span className="block text-xs font-black text-on-surface line-clamp-2">{f.label}</span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {students.map(s => (
                      <tr key={s.id}>
                        <th className="sticky left-0 z-10 bg-white border-b border-r border-surface-container px-3 py-2 text-left font-black whitespace-nowrap">
                          <button onClick={() => setSelectedId(s.id)} className="hover:text-primary hover:underline">{s.full_name}</button>
                        </th>
                        {fields.map(f => {
                          const v = byStudent[s.id]?.values[f.key] ?? '';
                          const filled = isFilled(v);
                          return (
                            <td key={f.key} className={`border-b border-r border-surface-container px-3 py-2 align-top min-w-[170px] max-w-[260px] ${filled ? 'bg-primary/5' : 'bg-white'}`}>
                              {!filled ? (
                                <span className="text-on-surface-variant/30">–</span>
                              ) : f.checkbox ? (
                                <span className="font-black text-emerald-600">✔</span>
                              ) : (
                                <span className="font-medium whitespace-pre-wrap break-words">{v}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : loading ? (
            <div className="flex items-center justify-center py-16 text-on-surface-variant">
              <Loader2 className="animate-spin" size={24} />
            </div>
          ) : error ? (
            <p className="text-sm font-bold text-red-600 px-3 py-10 text-center">{error}</p>
          ) : students.length === 0 ? (
            <p className="text-sm font-bold text-on-surface-variant px-3 py-10 text-center">이 자료가 연결된 반에 등록된 학생이 없어요.</p>
          ) : (
            <ul className="space-y-1.5">
              {students.map(s => {
                const a = byStudent[s.id];
                const has = !!a && a.filled > 0;
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => setSelectedId(s.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left border border-surface-container hover:border-primary/40 hover:bg-primary/5 transition-colors"
                    >
                      <span className="w-8 text-xs font-black text-on-surface-variant shrink-0 text-center">{s.student_number || ''}</span>
                      <span className="flex-1 min-w-0 font-black truncate">{s.full_name}</span>
                      {has ? (
                        <span className="text-xs font-black text-primary bg-primary/10 rounded-full px-2.5 py-1 shrink-0">
                          {a.filled}칸 · {new Date(a.updatedAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-on-surface-variant/60 shrink-0">미작성</span>
                      )}
                      <ChevronRight size={16} className="text-on-surface-variant/50 shrink-0" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default MaterialAnswersModal;
