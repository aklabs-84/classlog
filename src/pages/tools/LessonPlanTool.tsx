import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import type { LessonPlanSections } from '../../lib/gemini';
import { buildLessonPlanHtml, copyLessonPlanToClipboard, exportLessonPlanToPdf } from '../../lib/lessonPlanExport';
import { LessonPlanModal, LabeledInput, LabeledTextarea, SessionPlansEditor, type LessonPlanSourceMaterial } from '../../components/LessonPlanModal';
import {
  Plus, FileText, Loader2, X, ChevronRight, ArrowLeft, BookOpen, Library, Trash2, Copy, FileDown, Pencil, Save,
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

// ── 새 계획서 만들기 — 클래스/자료 선택 모달 ─────────────────────────────────
const MaterialPickerModal = ({
  userId,
  onPick,
  onClose,
}: {
  userId: string;
  onPick: (material: LessonPlanSourceMaterial, classId: string | null, classSubject?: string, className?: string) => void;
  onClose: () => void;
}) => {
  const [step, setStep] = useState<'class' | 'material'>('class');
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [isLibrary, setIsLibrary] = useState(false);
  const [materials, setMaterials] = useState<PickerMaterial[]>([]);
  const [loading, setLoading] = useState(true);

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
    setLoading(false);
    setStep('material');
  };

  const handleSelectClass = (cls: any) => { setSelectedClass(cls); setIsLibrary(false); loadMaterials(cls.id); };
  const handleSelectLibrary = () => { setSelectedClass(null); setIsLibrary(true); loadMaterials(null); };

  const handleSelectMaterial = (m: PickerMaterial) => {
    onPick(
      { id: m.id, title: m.title, content: m.content ?? '', week_number: m.week_number ?? 1 },
      selectedClass?.id ?? null,
      selectedClass?.subject,
      selectedClass?.name,
    );
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-container shrink-0">
          {step === 'material' && (
            <button
              onClick={() => { setStep('class'); setSelectedClass(null); setIsLibrary(false); setMaterials([]); }}
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
              {step === 'class' ? '자료가 저장된 클래스나 공통 자료함을 선택하세요' : '계획서로 만들 자료를 선택하세요'}
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
              {materials.map(m => (
                <button
                  key={m.id}
                  onClick={() => handleSelectMaterial(m)}
                  className="flex items-center gap-3 w-full text-left px-4 py-3 rounded-2xl hover:bg-primary/5 border border-transparent hover:border-primary/20 transition-all group"
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${m.is_published ? 'bg-emerald-100 text-emerald-700' : 'bg-surface-container text-on-surface-variant'}`}>
                    <BookOpen size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-on-surface truncate">{m.week_number}주차 · {m.title}</p>
                    {m.content && <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-1 opacity-60">{m.content.slice(0, 60)}…</p>}
                  </div>
                  <ChevronRight size={14} className="text-on-surface-variant group-hover:text-primary transition-colors shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
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

  const updateSection = (patch: Partial<LessonPlanSections>) => {
    setSections(prev => ({ ...prev, ...patch }));
  };

  const startEditing = () => { setEditSnapshot(sections); setEditing(true); };
  const cancelEditing = () => { if (editSnapshot) setSections(editSnapshot); setEditing(false); };

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
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <LabeledInput label="과목" value={sections.basicInfo.subject} onChange={v => updateSection({ basicInfo: { ...sections.basicInfo, subject: v } })} />
                <LabeledInput label="단원/차시" value={sections.basicInfo.unitTitle} onChange={v => updateSection({ basicInfo: { ...sections.basicInfo, unitTitle: v } })} />
                <LabeledInput label="대상" value={sections.basicInfo.target} onChange={v => updateSection({ basicInfo: { ...sections.basicInfo, target: v } })} />
                <LabeledInput label="차시" value={sections.basicInfo.periods} onChange={v => updateSection({ basicInfo: { ...sections.basicInfo, periods: v } })} />
                <LabeledInput label="일자" value={sections.basicInfo.date} onChange={v => updateSection({ basicInfo: { ...sections.basicInfo, date: v } })} />
                <LabeledInput
                  label="학생 수"
                  value={sections.basicInfo.studentCount != null ? String(sections.basicInfo.studentCount) : ''}
                  onChange={v => updateSection({ basicInfo: { ...sections.basicInfo, studentCount: v.trim() === '' ? null : Number(v) || 0 } })}
                />
              </div>
              <LabeledTextarea label="학습목표" value={sections.objectives} onChange={v => updateSection({ objectives: v })} rows={6} />
              {sections.sessionPlans ? (
                <SessionPlansEditor rows={sections.sessionPlans} onChange={rows => updateSection({ sessionPlans: rows })} />
              ) : sections.activities ? (
                <>
                  <LabeledTextarea label="도입" value={sections.activities.intro} onChange={v => updateSection({ activities: { ...sections.activities!, intro: v } })} />
                  <LabeledTextarea label="전개" value={sections.activities.development} onChange={v => updateSection({ activities: { ...sections.activities!, development: v } })} />
                  <LabeledTextarea label="정리" value={sections.activities.closing} onChange={v => updateSection({ activities: { ...sections.activities!, closing: v } })} />
                </>
              ) : null}
              <LabeledTextarea label="준비물" value={sections.materials} onChange={v => updateSection({ materials: v })} />
              <LabeledTextarea label="평가계획" value={sections.assessment} onChange={v => updateSection({ assessment: v })} />
              {plan.include_standards && (
                <LabeledTextarea label="성취기준 연계" value={sections.standards ?? ''} onChange={v => updateSection({ standards: v })} />
              )}
            </div>
          ) : (
            <div className="max-w-2xl mx-auto py-2">
              <div className="rounded-2xl border border-surface-container p-6 sm:p-8" dangerouslySetInnerHTML={{ __html: buildLessonPlanHtml(sections) }} />
            </div>
          )}
        </div>

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
  const [classes, setClasses] = useState<any[]>([]);
  const [plans, setPlans] = useState<SavedLessonPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [activeMaterial, setActiveMaterial] = useState<{ material: LessonPlanSourceMaterial; classId: string | null; classSubject?: string; className?: string } | null>(null);
  const [viewingPlan, setViewingPlan] = useState<SavedLessonPlan | null>(null);

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
    supabase.from('classes').select('id, name').eq('teacher_id', user.id).eq('is_archived', false)
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
          onPick={(material, classId, classSubject, className) => setActiveMaterial({ material, classId, classSubject, className })}
          onClose={() => setShowPicker(false)}
        />
      )}

      {activeMaterial && (
        <LessonPlanModal
          currentMaterial={activeMaterial.material}
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
