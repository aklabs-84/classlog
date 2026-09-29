import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X, PenLine, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import StudentMaterialPage from './StudentMaterialPage';
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

const MaterialAnswersModal = ({ material, mdComponents, onClose }: Props) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [byStudent, setByStudent] = useState<Record<string, StudentAnswers>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [stuRes, ansRes] = await Promise.all([
          material.class_id
            ? supabase.from('students').select('id, full_name, student_number').eq('class_id', material.class_id)
            : Promise.resolve({ data: [] as StudentRow[], error: null }),
          supabase.from('student_material_answers').select('student_id, field_key, value, updated_at').eq('material_id', material.id).limit(10000),
        ]);
        if (stuRes.error) throw stuRes.error;
        if (ansRes.error) throw ansRes.error;
        if (cancelled) return;
        const map: Record<string, StudentAnswers> = {};
        (ansRes.data || []).forEach((r: any) => {
          const cur = map[r.student_id] || (map[r.student_id] = { values: {}, filled: 0, updatedAt: '' });
          cur.values[r.field_key] = r.value;
          if (isFilled(r.value)) cur.filled += 1;
          if (r.updated_at > cur.updatedAt) cur.updatedAt = r.updated_at;
        });
        const list = ((stuRes.data || []) as StudentRow[]).slice().sort((a, b) =>
          (a.student_number || '').localeCompare(b.student_number || '', 'ko', { numeric: true }) ||
          a.full_name.localeCompare(b.full_name, 'ko'));
        setStudents(list);
        setByStudent(map);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || '학생 답변을 불러오지 못했어요.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [material.id, material.class_id]);

  useEffect(() => {
    if (selectedId) return; // 학생 화면이 열려 있을 땐 그쪽 나가기 버튼만 사용
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, onClose]);

  const answeredCount = useMemo(() => students.filter(s => (byStudent[s.id]?.filled ?? 0) > 0).length, [students, byStudent]);
  const selected = selectedId ? students.find(s => s.id === selectedId) : null;

  // 학생이 보던 화면을 그대로(읽기 전용) 보여준다. 저장 함수를 주지 않으면 입력칸이 잠긴다.
  if (selected) {
    return (
      <StudentMaterialPage
        key={selected.id}
        title={`${material.title} · ${selected.full_name}`}
        content={material.content}
        links={material.activity_urls}
        mdComponents={mdComponents}
        answers={{ load: async () => byStudent[selected.id]?.values ?? {} }}
        onClose={() => setSelectedId(null)}
      />
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[9998] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[85vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-6 pt-6 pb-4 border-b border-surface-container">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <PenLine size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-black text-lg leading-tight">학생 답변 보기</h3>
            <p className="text-sm text-on-surface-variant font-bold truncate mt-0.5">{material.title}</p>
            {!loading && !error && (
              <p className="text-xs text-on-surface-variant font-bold mt-1">
                {students.length}명 중 <span className="text-primary">{answeredCount}명</span>이 입력했어요
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-surface-container text-on-surface-variant" title="닫기">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          {loading ? (
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
