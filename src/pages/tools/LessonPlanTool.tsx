import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import type { LessonPlanConfig, LessonPlanSections } from '../../lib/gemini';
import { generateLessonPlanSections } from '../../lib/gemini';
import { buildLessonPlanHtml, copyLessonPlanToClipboard, exportLessonPlanToPdf } from '../../lib/lessonPlanExport';
import { LessonPlanModal, LessonPlanSectionsEditor, type LessonPlanSourceMaterial } from '../../components/LessonPlanModal';
import {
  Plus, FileText, Loader2, X, ChevronRight, ArrowLeft, BookOpen, Library, Trash2, Copy, FileDown, Pencil, Save, RotateCcw,
} from 'lucide-react';

const PURPOSE_LABEL: Record<string, string> = { formal: '정식 지도안', summary: '간단 요약', parent: '학부모 안내' };

interface SavedLessonPlan {
  id: string;
  class_id: string | null;
  material_ids: string[];
  purpose: 'formal' | 'summary' | 'parent';
  include_standards: boolean;
  sections: LessonPlanSections;
  created_at: string;
}

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return ''; }
};

interface PickerMaterial { id: string; title: string; content: string; week_number: number; is_published: boolean; }

// ── 새 계획서 만들기 — 클래스/자료 선택 모달 (여러 자료를 묶어서 선택 가능) ──────
const MaterialPickerModal = ({
  userId,
  onPick,
  onClose,
}: {
  userId: string;
  onPick: (materials: LessonPlanSourceMaterial[], classId: string | null, classSubject?: string, className?: string) => void;
  onClose: () => void;
}) => {
  const [step, setStep] = useState<'class' | 'material'>('class');
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [isLibrary, setIsLibrary] = useState(false);
  const [materials, setMaterials] = useState<PickerMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    supabase
      .from('classes')
      .select('id, name, subject')
      .eq('teacher_id', userId)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setClasses(data || []); setLoading(false); });
  }, [userId]);

  const loadMaterials = async (classId: string | null) => {
    setLoading(true);
    const query = classId
      ? supabase.from('class_materials').select('id, title, content, week_number, is_published').eq('class_id', classId).order('week_number', { ascending: true })
      : supabase.from('class_materials').select('id, title, content, week_number, is_published').is('class_id', null).eq('teacher_id', userId).order('created_at', { ascending: false });
    const { data } = await query;
    setMaterials((data || []) as PickerMaterial[]);
    setSelectedIds([]);
    setLoading(false);
    setStep('material');
  };

  const handleSelectClass = (cls: any) => { setSelectedClass(cls); setIsLibrary(false); loadMaterials(cls.id); };
  const handleSelectLibrary = () => { setSelectedClass(null); setIsLibrary(true); loadMaterials(null); };

  const toggleId = (id: string) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleConfirm = () => {
    const picked = materials
      .filter(m => selectedIds.includes(m.id))
      .map(m => ({ id: m.id, title: m.title, content: m.content ?? '', week_number: m.week_number ?? 1 }));
    if (picked.length === 0) return;
    onPick(picked, selectedClass?.id ?? null, selectedClass?.subject, selectedClass?.name);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-container shrink-0">
          {step === 'material' && (
            <button
              onClick={() => { setStep('class'); setSelectedClass(null); setIsLibrary(false); setMaterials([]); setSelectedIds([]); }}
              className="p-1.5 rounded-xl hover:bg-surface-container transition-colors text-on-surface-variant"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-black text-sm text-on-surface">
              {step === 'class' ? '계획서를 만들 자료 선택' : isLibrary ? '공통 자료함' : selectedClass?.name}
            </p>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {step === 'class' ? '자료가 저장된 클래스나 공통 자료함을 선택하세요' : '계획서로 묶을 자료를 하나 이상 선택하세요'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-surface-container transition-colors text-on-surface-variant shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-primary" /></div>
          ) : step === 'class' ? (
            <div className="flex flex-col gap-1.5">
              <button
                onClick={handleSelectLibrary}
                className="flex items-center gap-3 w-full text-left px-4 py-3 rounded-2xl hover:bg-surface-container-low transition-colors group"
              >
                <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><Library size={15} /></div>
                <span className="font-bold text-sm flex-1 text-on-surface">공통 자료함</span>
                <ChevronRight size={14} className="text-on-surface-variant group-hover:text-primary transition-colors" />
              </button>
              {classes.length === 0 ? (
                <div className="flex flex-col items-center py-12 gap-3 opacity-40">
                  <BookOpen size={36} />
                  <p className="font-black text-sm">클래스가 없습니다</p>
                </div>
              ) : (
                classes.map(cls => (
                  <button
                    key={cls.id}
                    onClick={() => handleSelectClass(cls)}
                    className="flex items-center gap-3 w-full text-left px-4 py-3 rounded-2xl hover:bg-surface-container-low transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><BookOpen size={15} /></div>
                    <span className="font-bold text-sm flex-1 text-on-surface">{cls.name}</span>
                    <ChevronRight size={14} className="text-on-surface-variant group-hover:text-primary transition-colors" />
                  </button>
                ))
              )}
            </div>
          ) : materials.length === 0 ? (
            <div className="flex flex-col items-center py-12 gap-3 opacity-40">
              <BookOpen size={36} />
              <p className="font-black text-sm">{isLibrary ? '공통 자료함에 자료가 없습니다' : '이 클래스에 자료가 없습니다'}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {materials.map(m => {
                const checked = selectedIds.includes(m.id);
                return (
                  <label
                    key={m.id}
                    className={`flex items-center gap-3 w-full text-left px-4 py-3 rounded-2xl border transition-all cursor-pointer ${
                      checked ? 'bg-primary/5 border-primary/30' : 'border-transparent hover:bg-surface-container-low hover:border-primary/10'
                    }`}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggleId(m.id)} className="accent-primary shrink-0" />
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${m.is_published ? 'bg-emerald-100 text-emerald-700' : 'bg-surface-container text-on-surface-variant'}`}>
                      <BookOpen size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-on-surface truncate">{m.week_number}주차 · {m.title}</p>
                      {m.content && <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-1 opacity-60">{m.content.slice(0, 60)}…</p>}
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {step === 'material' && materials.length > 0 && (
          <div className="flex items-center gap-2 px-5 py-4 border-t border-surface-container bg-surface-container-low/50 shrink-0">
            <p className="text-xs font-bold text-on-surface-variant flex-1">{selectedIds.length}개 선택됨</p>
            <button
              onClick={handleConfirm}
              disabled={selectedIds.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 btn-gradient rounded-xl font-black text-sm text-white shadow-lg hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              선택 완료
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

// ── 저장된 계획서 열람 모달 ───────────────────────────────────────────────────
const SavedPlanViewModal = ({
  plan,
  onClose,
  onDeleted,
  onUpdated,
}: {
  plan: SavedLessonPlan;
  onClose: () => void;
  onDeleted: () => void;
  onUpdated: () => void;
}) => {
  const [copyDone, setCopyDone] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sections, setSections] = useState<LessonPlanSections>(plan.sections);
  const [editSnapshot, setEditSnapshot] = useState<LessonPlanSections | null>(null);
  const [showRegenerateInput, setShowRegenerateInput] = useState(false);
  const [regenerateInstruction, setRegenerateInstruction] = useState('');
  const [regenerating, setRegenerating] = useState(false);

  const startEditing = () => { setEditSnapshot(sections); setEditing(true); };
  const cancelEditing = () => { if (editSnapshot) setSections(editSnapshot); setEditing(false); };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const [{ data: materialsData, error: materialsError }, classRow] = await Promise.all([
        supabase
          .from('class_materials')
          .select('title, content, week_number')
          .in('id', plan.material_ids),
        plan.class_id
          ? supabase.from('classes').select('name, subject').eq('id', plan.class_id).single().then(r => r.data)
          : Promise.resolve(null),
      ]);
      if (materialsError) throw materialsError;
      const materials = (materialsData || []).map(m => ({ title: m.title, content: m.content, weekNumber: m.week_number }));
      const config: LessonPlanConfig = {
        purpose: plan.purpose,
        materialIds: plan.material_ids,
        hasEvaluation: Boolean(sections.assessment?.trim()),
        evaluationMethod: sections.assessment?.trim() || undefined,
        includeStandards: plan.include_standards,
        customInstruction: regenerateInstruction.trim() || undefined,
      };
      const result = await generateLessonPlanSections(materials, config, {
        subject: classRow?.subject,
        className: classRow?.name,
        classId: plan.class_id ?? undefined,
      });
      const { error } = await supabase.from('lesson_plans').update({ sections: result }).eq('id', plan.id);
      if (error) throw error;
      setSections(result);
      setShowRegenerateInput(false);
      setRegenerateInstruction('');
      onUpdated();
    } catch (err: any) {
      window.alert(err?.message === 'AI_LIMIT_EXCEEDED' ? '이번 달 AI 사용 한도에 도달했습니다.' : '재생성 중 오류가 발생했습니다.');
    } finally {
      setRegenerating(false);
    }
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('lesson_plans').update({ sections }).eq('id', plan.id);
      if (error) throw error;
      setEditing(false);
      onUpdated();
    } catch {
      window.alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    await copyLessonPlanToClipboard(sections);
    setCopyDone(true);
    setTimeout(() => setCopyDone(false), 2000);
  };

  const handleDelete = async () => {
    if (!window.confirm('이 계획서를 삭제하시겠습니까?')) return;
    setDeleting(true);
    await supabase.from('lesson_plans').delete().eq('id', plan.id);
    setDeleting(false);
    onDeleted();
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[9995] flex items-center justify-center bg-black/40 px-4" onClick={editing ? undefined : onClose}>
      <div className="bg-white shadow-2xl rounded-2xl w-full h-full sm:w-[94vw] sm:h-[92vh] max-w-4xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-container shrink-0">
          <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><FileText size={15} /></div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-sm text-on-surface truncate">{sections?.basicInfo?.unitTitle || '수업 계획서'}</p>
            <p className="text-xs text-on-surface-variant mt-0.5">{PURPOSE_LABEL[plan.purpose]} · {formatDate(plan.created_at)}</p>
          </div>
          {!editing && (
            <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-surface-container transition-colors text-on-surface-variant shrink-0"><X size={16} /></button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {editing ? (
            <LessonPlanSectionsEditor
              sections={sections}
              onChange={next => setSections(next)}
              hasEvaluation={true}
              includeStandards={plan.include_standards}
            />
          ) : (
            <div className="max-w-2xl mx-auto py-2">
              <div className="rounded-2xl border border-surface-container p-6 sm:p-8" dangerouslySetInnerHTML={{ __html: buildLessonPlanHtml(sections) }} />
            </div>
          )}
        </div>

        {!editing && showRegenerateInput && (
          <div className="px-5 py-4 border-t border-surface-container bg-surface-container-low/50 shrink-0 space-y-2">
            <textarea
              value={regenerateInstruction}
              onChange={e => setRegenerateInstruction(e.target.value)}
              placeholder="원하는 방향을 알려주세요 (예: 좀 더 실습 위주로 / 저학년 눈높이에 맞게 / 협동학습 요소를 강조해줘)"
              rows={2}
              autoFocus
              disabled={regenerating}
              className="w-full px-3 py-2 bg-white rounded-xl border border-surface-container text-xs resize-none focus:outline-none focus:border-primary/40 disabled:opacity-60"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => { setShowRegenerateInput(false); setRegenerateInstruction(''); }}
                disabled={regenerating}
                className="px-3 py-1.5 text-xs font-black text-on-surface-variant hover:bg-surface-container rounded-lg transition-all disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="flex items-center gap-1.5 px-4 py-1.5 btn-gradient rounded-lg font-black text-xs shadow-lg shadow-primary/20 disabled:opacity-60"
              >
                {regenerating ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} 지침 반영해서 재생성
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 px-5 py-4 border-t border-surface-container bg-surface-container-low/50 shrink-0">
          {editing ? (
            <>
              <button onClick={cancelEditing} className="px-4 py-2 rounded-xl font-bold text-sm text-on-surface-variant hover:bg-surface-container transition-colors">
                취소
              </button>
              <div className="flex-1" />
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2.5 btn-gradient rounded-xl font-black text-sm text-white shadow-lg hover:scale-[1.02] active:scale-95 disabled:opacity-60 transition-all"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} 저장
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-sm text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} 삭제
              </button>
              <div className="flex-1" />
              <button
                onClick={() => setShowRegenerateInput(v => !v)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-sm text-on-surface-variant hover:bg-surface-container transition-colors"
              >
                <RotateCcw size={14} /> 다시 생성
              </button>
              <button onClick={startEditing} className="flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-sm text-on-surface-variant hover:bg-surface-container transition-colors">
                <Pencil size={14} /> 내용 수정
              </button>
              <button onClick={handleCopy} className="flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-sm text-on-surface-variant hover:bg-surface-container transition-colors">
                <Copy size={14} /> {copyDone ? '복사됨' : '클립보드 복사'}
              </button>
              <button onClick={() => exportLessonPlanToPdf(sections)} className="flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-sm text-on-surface-variant hover:bg-surface-container transition-colors">
                <FileDown size={14} /> PDF
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

// ── 수업 계획서 만들기 — 수업도구 탭 ──────────────────────────────────────────
const LessonPlanTool = () => {
  const { user } = useAuth();
  const location = useLocation();
  const draftHandledRef = useRef(false);
  const [classes, setClasses] = useState<any[]>([]);
  const [plans, setPlans] = useState<SavedLessonPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [activeMaterial, setActiveMaterial] = useState<{ materials: LessonPlanSourceMaterial[]; classId: string | null; classSubject?: string; className?: string } | null>(null);
  const [viewingPlan, setViewingPlan] = useState<SavedLessonPlan | null>(null);

  // AI 코파일럿(루카스)의 대화 초안을 넘겨받은 경우 — 초안 텍스트를 class_materials에
  // 실제 자료 레코드로 저장한 뒤 "계획서 만들기" 모달을 바로 연다. id를 빈 문자열로 두면
  // 계획서 저장 후 "다시 생성" 시 material_ids로 재조회가 안 돼 원본 내용이 사라지므로,
  // 처음부터 진짜 레코드로 만들어 저장/재생성 흐름 전체에서 동일하게 동작하게 한다.
  useEffect(() => {
    if (draftHandledRef.current) return;
    const draft = (location.state as { draftLessonPlan?: { title: string; content: string; classId: string | null } } | null)?.draftLessonPlan;
    if (!draft || !user) return;
    draftHandledRef.current = true;
    (async () => {
      const cls = draft.classId ? classes.find(c => c.id === draft.classId) : null;
      const { data, error } = await supabase
        .from('class_materials')
        .insert({
          class_id: draft.classId,
          teacher_id: user.id,
          week_number: 1,
          title: draft.title,
          content: draft.content,
          is_published: false,
        })
        .select('id')
        .single();
      setActiveMaterial({
        materials: [{ id: error ? '' : data.id, title: draft.title, content: draft.content, week_number: 1 }],
        classId: draft.classId,
        className: cls?.name,
        classSubject: cls?.subject,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes, user]);

  const fetchPlans = () => {
    if (!user) return;
    setLoadingPlans(true);
    supabase
      .from('lesson_plans')
      .select('id, class_id, material_ids, purpose, include_standards, sections, created_at')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setPlans((data || []) as SavedLessonPlan[]); setLoadingPlans(false); });
  };

  useEffect(() => {
    if (!user) return;
    supabase.from('classes').select('id, name, subject').eq('teacher_id', user.id).eq('is_archived', false)
      .then(({ data }) => setClasses(data || []));
    fetchPlans();
  }, [user?.id]);

  if (!user) return null;

  const classNameMap = new Map(classes.map(c => [c.id, c.name]));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-on-surface-variant max-w-md">
          저장된 수업 자료를 바탕으로 제출용 계획서 초안을 만들고, 이전에 만든 계획서를 다시 열람·복사·PDF로 내보낼 수 있습니다.
        </p>
        <button
          onClick={() => setShowPicker(true)}
          className="flex items-center gap-2 px-4 py-2.5 btn-gradient rounded-xl font-black text-sm text-white shadow hover:scale-[1.02] active:scale-95 transition-all shrink-0"
        >
          <Plus size={15} /> 새 계획서 만들기
        </button>
      </div>

      {loadingPlans ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-primary" /></div>
      ) : plans.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-2 opacity-40">
          <FileText size={40} />
          <p className="font-black text-sm">아직 만든 계획서가 없습니다</p>
          <p className="text-xs">저장된 수업 자료를 선택해 계획서 초안을 만들어보세요</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {plans.map(plan => (
            <button
              key={plan.id}
              onClick={() => setViewingPlan(plan)}
              className="text-left glass rounded-2xl p-4 border border-white/40 hover:border-primary/30 hover:shadow-lg hover:-translate-y-0.5 transition-all"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><FileText size={14} /></div>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant">{PURPOSE_LABEL[plan.purpose]}</span>
              </div>
              <p className="font-black text-sm text-on-surface truncate">{plan.sections?.basicInfo?.unitTitle || '(제목 없음)'}</p>
              <p className="text-xs text-on-surface-variant mt-1 truncate">
                {plan.class_id ? (classNameMap.get(plan.class_id) || '삭제된 클래스') : '클래스 없음'} · {formatDate(plan.created_at)}
              </p>
            </button>
          ))}
        </div>
      )}

      {showPicker && (
        <MaterialPickerModal
          userId={user.id}
          onPick={(materials, classId, classSubject, className) => setActiveMaterial({ materials, classId, classSubject, className })}
          onClose={() => setShowPicker(false)}
        />
      )}

      {activeMaterial && (
        <LessonPlanModal
          materials={activeMaterial.materials}
          classId={activeMaterial.classId}
          classSubject={activeMaterial.classSubject}
          className={activeMaterial.className}
          onClose={() => setActiveMaterial(null)}
          onSaved={fetchPlans}
        />
      )}

      {viewingPlan && (
        <SavedPlanViewModal plan={viewingPlan} onClose={() => setViewingPlan(null)} onDeleted={fetchPlans} onUpdated={fetchPlans} />
      )}
    </div>
  );
};

export default LessonPlanTool;
