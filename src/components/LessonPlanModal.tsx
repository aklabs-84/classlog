import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { generateLessonPlanSections } from '../lib/gemini';
import type { LessonPlanSections, LessonPlanConfig } from '../lib/gemini';
import { copyLessonPlanToClipboard, exportLessonPlanToPdf } from '../lib/lessonPlanExport';
import {
  X, Sparkles, Loader2, RotateCcw, AlertCircle, Check, Copy, FileDown, Save, FileText,
} from 'lucide-react';

// ── 계획서 만들기 모달 — 미리보기 편집 필드 ─────────────────────────────────
const LabeledInput = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <div>
    <p className="text-[10px] font-black text-on-surface-variant mb-1">{label}</p>
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-surface-container text-xs focus:outline-none focus:border-primary/40"
    />
  </div>
);

const LabeledTextarea = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <div>
    <p className="text-[10px] font-black text-on-surface-variant mb-1">{label}</p>
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      rows={3}
      className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-surface-container text-xs focus:outline-none focus:border-primary/40 resize-none"
    />
  </div>
);

type LessonPlanStep = 'configure' | 'loading' | 'preview' | 'error';
interface ClassMaterialLite { id: string; title: string; week_number: number; content: string; }

export interface LessonPlanSourceMaterial {
  id: string;
  title: string;
  content: string;
  week_number: number;
}

export const LessonPlanModal = ({
  currentMaterial,
  classId,
  classSubject,
  className,
  onClose,
  onSaved,
}: {
  currentMaterial: LessonPlanSourceMaterial;
  classId?: string | null;
  classSubject?: string;
  className?: string;
  onClose: () => void;
  onSaved?: () => void;
}) => {
  const { user } = useAuth();
  const [step, setStep] = useState<LessonPlanStep>('configure');
  const [purpose, setPurpose] = useState<LessonPlanConfig['purpose']>('formal');
  const [hasEvaluation, setHasEvaluation] = useState(false);
  const [evaluationMethod, setEvaluationMethod] = useState('');
  const [includeStandards, setIncludeStandards] = useState(false);
  const [otherMaterials, setOtherMaterials] = useState<ClassMaterialLite[]>([]);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [sections, setSections] = useState<LessonPlanSections | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copyDone, setCopyDone] = useState(false);

  useEffect(() => {
    if (!classId) return;
    supabase
      .from('class_materials')
      .select('id, title, week_number, content')
      .eq('class_id', classId)
      .neq('id', currentMaterial.id)
      .order('week_number', { ascending: true })
      .then(({ data }) => { if (data) setOtherMaterials(data as ClassMaterialLite[]); });
  }, [classId, currentMaterial.id]);

  const toggleMaterial = (id: string) => {
    setSelectedMaterialIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const runGenerate = async () => {
    setStep('loading');
    setErrorMessage('');
    try {
      const picked = [
        { title: currentMaterial.title, content: currentMaterial.content, weekNumber: currentMaterial.week_number },
        ...otherMaterials
          .filter(m => selectedMaterialIds.includes(m.id))
          .map(m => ({ title: m.title, content: m.content, weekNumber: m.week_number })),
      ];
      const config: LessonPlanConfig = {
        purpose,
        materialIds: [currentMaterial.id, ...selectedMaterialIds],
        hasEvaluation,
        evaluationMethod: hasEvaluation ? evaluationMethod : undefined,
        includeStandards,
      };
      const result = await generateLessonPlanSections(picked, config, {
        subject: classSubject,
        className,
        classId: classId ?? undefined,
      });
      setSections(result);
      setSaved(false);
      setStep('preview');
    } catch (err: any) {
      setErrorMessage(
        err?.message === 'AI_LIMIT_EXCEEDED'
          ? '이번 달 AI 사용 한도에 도달했습니다.'
          : (err?.message || '계획서 생성 중 오류가 발생했습니다.')
      );
      setStep('error');
    }
  };

  const updateSection = (patch: Partial<LessonPlanSections>) => {
    setSections(prev => prev ? { ...prev, ...patch } : prev);
  };

  const handleSave = async () => {
    if (!sections || !user) return;
    setSaving(true);
    try {
      await supabase.from('lesson_plans').insert({
        teacher_id: user.id,
        class_id: classId ?? null,
        material_ids: [currentMaterial.id, ...selectedMaterialIds],
        purpose,
        include_standards: includeStandards,
        sections,
      });
      setSaved(true);
      onSaved?.();
    } catch {
      setErrorMessage('저장 중 오류가 발생했습니다.');
      setStep('error');
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    if (!sections) return;
    await copyLessonPlanToClipboard(sections);
    setCopyDone(true);
    setTimeout(() => setCopyDone(false), 2000);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9995] flex items-center justify-center bg-black/40 px-4"
      onClick={step === 'loading' ? undefined : onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-container shrink-0">
          <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <FileText size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-sm text-on-surface">계획서 만들기</p>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {step === 'configure' && '수업 자료를 바탕으로 제출용 계획서 초안을 만듭니다'}
              {step === 'loading' && 'AI가 계획서 초안을 작성하는 중입니다...'}
              {step === 'preview' && '내용을 확인하고 필요하면 수정하세요'}
              {step === 'error' && '오류가 발생했습니다'}
            </p>
          </div>
          {step !== 'loading' && (
            <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-surface-container transition-colors text-on-surface-variant shrink-0">
              <X size={16} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {step === 'configure' && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-black text-on-surface-variant mb-1.5">용도</p>
                <div className="flex items-center gap-2 p-1 rounded-2xl bg-surface-container-low">
                  {([['formal', '정식 지도안'], ['summary', '간단 요약'], ['parent', '학부모 안내']] as const).map(([v, label]) => (
                    <button
                      key={v}
                      onClick={() => setPurpose(v)}
                      className={`flex-1 px-3 py-2 rounded-xl text-xs font-black transition-all ${purpose === v ? 'bg-white text-primary shadow' : 'text-on-surface-variant hover:text-on-surface'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {otherMaterials.length > 0 && (
                <div>
                  <p className="text-xs font-black text-on-surface-variant mb-1.5">포함할 다른 주차 자료 (선택)</p>
                  <div className="max-h-32 overflow-y-auto space-y-1 rounded-xl border border-surface-container p-2">
                    {otherMaterials.map(m => (
                      <label key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-container-low cursor-pointer">
                        <input type="checkbox" checked={selectedMaterialIds.includes(m.id)} onChange={() => toggleMaterial(m.id)} className="accent-primary" />
                        <span className="text-xs font-bold text-on-surface truncate">{m.week_number}주차 · {m.title}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={hasEvaluation} onChange={e => setHasEvaluation(e.target.checked)} className="accent-primary" />
                  <span className="text-xs font-black text-on-surface-variant">평가계획 포함</span>
                </label>
                {hasEvaluation && (
                  <input
                    value={evaluationMethod}
                    onChange={e => setEvaluationMethod(e.target.value)}
                    placeholder="예: 관찰평가, 수행평가 등"
                    className="mt-1.5 w-full px-3 py-2 bg-white rounded-xl border border-surface-container text-sm focus:outline-none focus:border-primary/40"
                  />
                )}
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={includeStandards} onChange={e => setIncludeStandards(e.target.checked)} className="accent-primary" />
                <span className="text-xs font-black text-on-surface-variant">2022 개정 교육과정 성취기준 연계</span>
              </label>
            </div>
          )}

          {step === 'loading' && (
            <div className="flex flex-col items-center py-16 gap-3">
              <Loader2 size={28} className="animate-spin text-primary" />
              <p className="text-sm font-bold text-on-surface-variant">AI가 계획서 초안을 작성하는 중입니다...</p>
            </div>
          )}

          {step === 'preview' && sections && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <LabeledInput label="과목" value={sections.basicInfo.subject} onChange={v => updateSection({ basicInfo: { ...sections.basicInfo, subject: v } })} />
                <LabeledInput label="단원/차시" value={sections.basicInfo.unitTitle} onChange={v => updateSection({ basicInfo: { ...sections.basicInfo, unitTitle: v } })} />
                <LabeledInput label="대상" value={sections.basicInfo.target} onChange={v => updateSection({ basicInfo: { ...sections.basicInfo, target: v } })} />
                <LabeledInput label="차시" value={sections.basicInfo.periods} onChange={v => updateSection({ basicInfo: { ...sections.basicInfo, periods: v } })} />
              </div>
              <LabeledTextarea label="학습목표" value={sections.objectives} onChange={v => updateSection({ objectives: v })} />
              <LabeledTextarea label="도입" value={sections.activities.intro} onChange={v => updateSection({ activities: { ...sections.activities, intro: v } })} />
              <LabeledTextarea label="전개" value={sections.activities.development} onChange={v => updateSection({ activities: { ...sections.activities, development: v } })} />
              <LabeledTextarea label="정리" value={sections.activities.closing} onChange={v => updateSection({ activities: { ...sections.activities, closing: v } })} />
              <LabeledTextarea label="준비물" value={sections.materials} onChange={v => updateSection({ materials: v })} />
              {hasEvaluation && (
                <LabeledTextarea label="평가계획" value={sections.assessment} onChange={v => updateSection({ assessment: v })} />
              )}
              {includeStandards && (
                <LabeledTextarea label="성취기준 연계" value={sections.standards ?? ''} onChange={v => updateSection({ standards: v })} />
              )}
              {saved && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 text-green-700 text-xs font-bold">
                  <Check size={13} /> 저장되었습니다
                </div>
              )}
            </div>
          )}

          {step === 'error' && (
            <div className="flex flex-col items-center py-12 gap-3 text-center">
              <AlertCircle size={32} className="text-red-400" />
              <p className="text-sm font-bold text-on-surface-variant">{errorMessage}</p>
            </div>
          )}
        </div>

        {step !== 'loading' && (
          <div className="flex items-center gap-2 px-5 py-4 border-t border-surface-container bg-surface-container-low/50 shrink-0 flex-wrap">
            {step === 'configure' && (
              <>
                <button onClick={onClose} className="px-4 py-2 rounded-xl font-bold text-sm text-on-surface-variant hover:bg-surface-container transition-colors">
                  취소
                </button>
                <div className="flex-1" />
                <button
                  onClick={runGenerate}
                  className="flex items-center gap-2 px-6 py-2.5 btn-gradient rounded-xl font-black text-sm text-white shadow-lg hover:scale-[1.02] active:scale-95 transition-all"
                >
                  <Sparkles size={15} /> 초안 생성
                </button>
              </>
            )}
            {step === 'preview' && (
              <>
                <button
                  onClick={() => { setSaved(false); setStep('configure'); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm text-on-surface-variant hover:bg-surface-container transition-colors"
                >
                  <RotateCcw size={14} /> 다시 생성
                </button>
                <div className="flex-1" />
                {saved && (
                  <>
                    <button onClick={handleCopy} className="flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-sm text-on-surface-variant hover:bg-surface-container transition-colors">
                      <Copy size={14} /> {copyDone ? '복사됨' : '클립보드 복사'}
                    </button>
                    <button onClick={() => sections && exportLessonPlanToPdf(sections)} className="flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-sm text-on-surface-variant hover:bg-surface-container transition-colors">
                      <FileDown size={14} /> PDF
                    </button>
                  </>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-2.5 btn-gradient rounded-xl font-black text-sm text-white shadow-lg hover:scale-[1.02] active:scale-95 disabled:opacity-60 transition-all"
                >
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {saved ? '다시 저장' : '저장'}
                </button>
              </>
            )}
            {step === 'error' && (
              <>
                <div className="flex-1" />
                <button onClick={() => setStep('configure')} className="px-4 py-2 rounded-xl font-bold text-sm text-on-surface-variant hover:bg-surface-container transition-colors">
                  뒤로
                </button>
                <button onClick={onClose} className="px-4 py-2 rounded-xl font-black text-sm text-white bg-red-400 hover:bg-red-500 transition-colors">
                  닫기
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
