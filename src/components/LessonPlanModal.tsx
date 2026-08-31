import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { generateLessonPlanSections, resolveLessonPlanSectionOrder } from '../lib/gemini';
import type { LessonPlanSections, LessonPlanConfig, LessonPlanSessionRow, LessonPlanCustomSection } from '../lib/gemini';
import { buildLessonPlanHtml, copyLessonPlanToClipboard, exportLessonPlanToPdf } from '../lib/lessonPlanExport';
import {
  X, Sparkles, Loader2, RotateCcw, AlertCircle, Check, Copy, FileDown, Save, FileText, Pencil, Plus,
  GripVertical, Scissors, GitMerge, Trash2,
} from 'lucide-react';

const SECTION_LABELS: Record<string, string> = {
  basicInfo: '기본정보',
  objectives: '학습목표',
  sessionPlans: '차시별 내용',
  materials: '준비물',
  assessment: '평가계획',
  standards: '성취기준 연계',
};

// ── 계획서 만들기 모달 — 미리보기 편집 필드 ─────────────────────────────────
export const LabeledInput = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <div>
    <p className="text-[10px] font-black text-on-surface-variant mb-1">{label}</p>
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-surface-container text-xs focus:outline-none focus:border-primary/40"
    />
  </div>
);

export const LabeledTextarea = ({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) => (
  <div>
    <p className="text-[10px] font-black text-on-surface-variant mb-1">{label}</p>
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      rows={rows}
      className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-surface-container text-xs focus:outline-none focus:border-primary/40 resize-y"
    />
  </div>
);

// 차시별 내용(sessionPlans) 표 편집기 — 행 추가/삭제 가능
export const SessionPlansEditor = ({ rows, onChange }: { rows: LessonPlanSessionRow[]; onChange: (rows: LessonPlanSessionRow[]) => void }) => {
  const updateRow = (idx: number, patch: Partial<LessonPlanSessionRow>) => {
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const addRow = () => onChange([...rows, { session: `${rows.length + 1}차시`, title: '', content: '', note: '' }]);
  const removeRow = (idx: number) => onChange(rows.filter((_, i) => i !== idx));

  // 인접한 두 차시(idx, idx+1)를 한 행으로 합친다 — 각 필드는 " + "/줄바꿈으로 이어붙인다.
  const mergeWithNext = (idx: number) => {
    const a = rows[idx];
    const b = rows[idx + 1];
    if (!a || !b) return;
    const merged: LessonPlanSessionRow = {
      session: [a.session, b.session].filter(Boolean).join(' + '),
      title: [a.title, b.title].filter(Boolean).join(' + '),
      content: [a.content, b.content].filter(Boolean).join('\n\n'),
      note: [a.note, b.note].filter(Boolean).join(' / '),
    };
    const next = [...rows];
    next.splice(idx, 2, merged);
    onChange(next);
  };

  // 한 행을 그대로 복제해 둘로 나눈다 — 자동 분리 로직 없이 사용자가 직접 내용을 나눠 적도록 함.
  const splitRow = (idx: number) => {
    const row = rows[idx];
    if (!row) return;
    const next = [...rows];
    next.splice(idx, 1, { ...row }, { ...row, session: row.session ? `${row.session} (2)` : '' });
    onChange(next);
  };

  return (
    <div>
      <p className="text-[10px] font-black text-on-surface-variant mb-1">차시별 내용</p>
      <div className="space-y-2">
        {rows.map((row, idx) => (
          <div key={idx}>
            <div className="rounded-xl border border-surface-container p-2.5 space-y-1.5 bg-white">
              <div className="flex items-center gap-2">
                <input
                  value={row.session}
                  onChange={e => updateRow(idx, { session: e.target.value })}
                  placeholder="차시 (예: 1차시)"
                  className="w-24 px-2 py-1 bg-surface-container-low rounded-lg text-xs font-bold focus:outline-none"
                />
                <input
                  value={row.title}
                  onChange={e => updateRow(idx, { title: e.target.value })}
                  placeholder="제목"
                  className="flex-1 px-2 py-1 bg-surface-container-low rounded-lg text-xs font-bold focus:outline-none"
                />
                <button onClick={() => splitRow(idx)} title="이 차시를 둘로 분리" className="p-1 rounded-lg text-on-surface-variant/50 hover:bg-surface-container-low shrink-0">
                  <Scissors size={13} />
                </button>
                <button onClick={() => removeRow(idx)} className="p-1 rounded-lg text-red-400 hover:bg-red-50 shrink-0">
                  <X size={13} />
                </button>
              </div>
              <textarea
                value={row.content}
                onChange={e => updateRow(idx, { content: e.target.value })}
                placeholder="이 차시에서 진행할 학습 및 실습 내용"
                rows={7}
                className="w-full px-2 py-1.5 bg-surface-container-low rounded-lg text-xs focus:outline-none resize-y"
              />
              <input
                value={row.note}
                onChange={e => updateRow(idx, { note: e.target.value })}
                placeholder="비고 (선택)"
                className="w-full px-2 py-1 bg-surface-container-low rounded-lg text-xs focus:outline-none"
              />
            </div>
            {idx < rows.length - 1 && (
              <div className="flex justify-center py-1">
                <button
                  onClick={() => mergeWithNext(idx)}
                  title="다음 차시와 합치기"
                  className="flex items-center gap-1 text-[10px] font-bold text-on-surface-variant/40 hover:text-primary transition-colors"
                >
                  <GitMerge size={11} /> 다음 차시와 합치기
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <button onClick={addRow} className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-primary hover:bg-primary/5 transition-colors">
        <Plus size={13} /> 차시 추가
      </button>
    </div>
  );
};

// 계획서의 큰 섹션들(기본정보/학습목표/차시별내용/준비물/평가계획/성취기준/커스텀)을
// 드래그로 재배치하고, 자유 텍스트 커스텀 섹션을 추가/삭제할 수 있는 편집기.
// 계획서 만들기(LessonPlanModal)와 저장된 계획서 편집(LessonPlanTool) 양쪽에서 공유한다.
export const LessonPlanSectionsEditor = ({
  sections,
  onChange,
  hasEvaluation,
  includeStandards,
}: {
  sections: LessonPlanSections;
  onChange: (next: LessonPlanSections) => void;
  hasEvaluation: boolean;
  includeStandards: boolean;
}) => {
  const [dragSectionKey, setDragSectionKey] = useState<string | null>(null);
  const [overSectionKey, setOverSectionKey] = useState<string | null>(null);

  const updateSection = (patch: Partial<LessonPlanSections>) => onChange({ ...sections, ...patch });

  const moveSectionBefore = (fromKey: string, toKey: string) => {
    if (fromKey === toKey) return;
    const order = resolveLessonPlanSectionOrder(sections);
    if (order.indexOf(fromKey) === -1 || order.indexOf(toKey) === -1) return;
    const next = order.filter(k => k !== fromKey);
    next.splice(next.indexOf(toKey), 0, fromKey);
    onChange({ ...sections, sectionOrder: next });
  };

  const addCustomSection = () => {
    const id = crypto.randomUUID();
    const newSection: LessonPlanCustomSection = { id, title: '새 섹션', content: '' };
    const order = resolveLessonPlanSectionOrder(sections);
    onChange({
      ...sections,
      customSections: [...(sections.customSections ?? []), newSection],
      sectionOrder: [...order, `custom:${id}`],
    });
  };

  const updateCustomSection = (id: string, patch: Partial<LessonPlanCustomSection>) => {
    onChange({
      ...sections,
      customSections: (sections.customSections ?? []).map(s => s.id === id ? { ...s, ...patch } : s),
    });
  };

  const removeCustomSection = (id: string) => {
    const order = resolveLessonPlanSectionOrder(sections);
    onChange({
      ...sections,
      customSections: (sections.customSections ?? []).filter(s => s.id !== id),
      sectionOrder: order.filter(k => k !== `custom:${id}`),
    });
  };

  const order = resolveLessonPlanSectionOrder(sections);

  const renderSectionBody = (key: string) => {
    if (key === 'basicInfo') {
      return (
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
      );
    }
    if (key === 'objectives') {
      return <LabeledTextarea label="학습목표" value={sections.objectives} onChange={v => updateSection({ objectives: v })} rows={6} />;
    }
    if (key === 'sessionPlans') {
      if (sections.sessionPlans) {
        return <SessionPlansEditor rows={sections.sessionPlans} onChange={rows => updateSection({ sessionPlans: rows })} />;
      }
      if (sections.activities) {
        return (
          <div className="space-y-3">
            <LabeledTextarea label="도입" value={sections.activities.intro} onChange={v => updateSection({ activities: { ...sections.activities!, intro: v } })} />
            <LabeledTextarea label="전개" value={sections.activities.development} onChange={v => updateSection({ activities: { ...sections.activities!, development: v } })} />
            <LabeledTextarea label="정리" value={sections.activities.closing} onChange={v => updateSection({ activities: { ...sections.activities!, closing: v } })} />
          </div>
        );
      }
      return null;
    }
    if (key === 'materials') {
      return <LabeledTextarea label="준비물" value={sections.materials} onChange={v => updateSection({ materials: v })} />;
    }
    if (key === 'assessment') {
      return hasEvaluation ? <LabeledTextarea label="평가계획" value={sections.assessment} onChange={v => updateSection({ assessment: v })} /> : null;
    }
    if (key === 'standards') {
      return includeStandards ? <LabeledTextarea label="성취기준 연계" value={sections.standards ?? ''} onChange={v => updateSection({ standards: v })} /> : null;
    }
    if (key.startsWith('custom:')) {
      const id = key.slice('custom:'.length);
      const custom = sections.customSections?.find(s => s.id === id);
      if (!custom) return null;
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <input
              value={custom.title}
              onChange={e => updateCustomSection(id, { title: e.target.value })}
              placeholder="섹션 제목"
              className="flex-1 px-2.5 py-1.5 bg-white rounded-lg border border-surface-container text-xs font-black focus:outline-none focus:border-primary/40"
            />
            <button onClick={() => removeCustomSection(id)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 shrink-0">
              <Trash2 size={13} />
            </button>
          </div>
          <textarea
            value={custom.content}
            onChange={e => updateCustomSection(id, { content: e.target.value })}
            placeholder="자유롭게 내용을 입력하세요"
            rows={5}
            className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-surface-container text-xs focus:outline-none focus:border-primary/40 resize-y"
          />
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-3">
      {order.map(key => {
        const body = renderSectionBody(key);
        if (!body) return null;
        return (
          <div key={key}>
            {overSectionKey === key && dragSectionKey !== null && dragSectionKey !== key && (
              <div className="h-0.5 bg-primary rounded-full mb-2" />
            )}
            <div
              draggable
              onDragStart={() => setDragSectionKey(key)}
              onDragOver={e => { e.preventDefault(); if (dragSectionKey !== null && dragSectionKey !== key) setOverSectionKey(key); }}
              onDrop={e => {
                e.preventDefault();
                if (dragSectionKey !== null && dragSectionKey !== key) moveSectionBefore(dragSectionKey, key);
                setDragSectionKey(null);
                setOverSectionKey(null);
              }}
              onDragEnd={() => { setDragSectionKey(null); setOverSectionKey(null); }}
              className={`rounded-2xl border border-surface-container/70 bg-surface-container-low/40 p-3 transition-opacity ${dragSectionKey === key ? 'opacity-40' : ''}`}
            >
              <div className="flex items-center gap-1.5 mb-2 cursor-grab text-on-surface-variant/50 active:cursor-grabbing">
                <GripVertical size={14} />
                <span className="text-[10px] font-black uppercase tracking-wide">{SECTION_LABELS[key] ?? '커스텀 섹션'}</span>
              </div>
              {body}
            </div>
          </div>
        );
      })}
      <button onClick={addCustomSection} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-primary hover:bg-primary/5 transition-colors">
        <Plus size={13} /> 섹션 추가
      </button>
    </div>
  );
};

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
  const [editingSaved, setEditingSaved] = useState(false);
  const [editSnapshot, setEditSnapshot] = useState<LessonPlanSections | null>(null);
  const [savedPlanId, setSavedPlanId] = useState<string | null>(null);

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
      setSavedPlanId(null);
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

  const handleSave = async () => {
    if (!sections || !user) return;
    setSaving(true);
    try {
      if (savedPlanId) {
        const { error } = await supabase
          .from('lesson_plans')
          .update({ purpose, include_standards: includeStandards, sections })
          .eq('id', savedPlanId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('lesson_plans')
          .insert({
            teacher_id: user.id,
            class_id: classId ?? null,
            material_ids: [currentMaterial.id, ...selectedMaterialIds],
            purpose,
            include_standards: includeStandards,
            sections,
          })
          .select('id')
          .single();
        if (error) throw error;
        setSavedPlanId(data.id);
      }
      setSaved(true);
      setEditingSaved(false);
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

  const startEditingSaved = () => {
    setEditSnapshot(sections);
    setEditingSaved(true);
  };

  const cancelEditingSaved = () => {
    if (editSnapshot) setSections(editSnapshot);
    setEditingSaved(false);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9995] flex items-center justify-center bg-black/40 px-4"
      onClick={step === 'loading' ? undefined : onClose}
    >
      <div
        className={`bg-white shadow-2xl flex flex-col overflow-hidden transition-all ${
          step === 'preview' && saved
            ? 'rounded-2xl w-full h-full sm:w-[94vw] sm:h-[92vh] max-w-4xl'
            : 'rounded-3xl w-full max-w-2xl max-h-[85vh]'
        }`}
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
              {step === 'preview' && !saved && '내용을 확인하고 필요하면 수정하세요'}
              {step === 'preview' && saved && editingSaved && '내용을 수정하세요'}
              {step === 'preview' && saved && !editingSaved && '계획서가 저장되었습니다'}
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

          {step === 'preview' && sections && (!saved || editingSaved) && (
            <LessonPlanSectionsEditor
              sections={sections}
              onChange={next => setSections(next)}
              hasEvaluation={hasEvaluation}
              includeStandards={includeStandards}
            />
          )}

          {step === 'preview' && sections && saved && !editingSaved && (
            <div className="max-w-2xl mx-auto py-2">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 text-green-700 text-xs font-bold w-fit mb-5">
                <Check size={13} /> 저장되었습니다
              </div>
              <div className="rounded-2xl border border-surface-container p-6 sm:p-8" dangerouslySetInnerHTML={{ __html: buildLessonPlanHtml(sections) }} />
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
            {step === 'preview' && !saved && (
              <>
                <button
                  onClick={() => { setSaved(false); setStep('configure'); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm text-on-surface-variant hover:bg-surface-container transition-colors"
                >
                  <RotateCcw size={14} /> 다시 생성
                </button>
                <div className="flex-1" />
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-2.5 btn-gradient rounded-xl font-black text-sm text-white shadow-lg hover:scale-[1.02] active:scale-95 disabled:opacity-60 transition-all"
                >
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} 저장
                </button>
              </>
            )}
            {step === 'preview' && saved && editingSaved && (
              <>
                <button
                  onClick={cancelEditingSaved}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm text-on-surface-variant hover:bg-surface-container transition-colors"
                >
                  취소
                </button>
                <div className="flex-1" />
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-2.5 btn-gradient rounded-xl font-black text-sm text-white shadow-lg hover:scale-[1.02] active:scale-95 disabled:opacity-60 transition-all"
                >
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} 저장
                </button>
              </>
            )}
            {step === 'preview' && saved && !editingSaved && (
              <>
                <button
                  onClick={() => { setSaved(false); setStep('configure'); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm text-on-surface-variant hover:bg-surface-container transition-colors"
                >
                  <RotateCcw size={14} /> 다시 생성
                </button>
                <div className="flex-1" />
                <button onClick={startEditingSaved} className="flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-sm text-on-surface-variant hover:bg-surface-container transition-colors">
                  <Pencil size={14} /> 내용 수정
                </button>
                <button onClick={handleCopy} className="flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-sm text-on-surface-variant hover:bg-surface-container transition-colors">
                  <Copy size={14} /> {copyDone ? '복사됨' : '클립보드 복사'}
                </button>
                <button onClick={() => sections && exportLessonPlanToPdf(sections)} className="flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-sm text-on-surface-variant hover:bg-surface-container transition-colors">
                  <FileDown size={14} /> PDF
                </button>
                <button
                  onClick={onClose}
                  className="flex items-center gap-2 px-6 py-2.5 btn-gradient rounded-xl font-black text-sm text-white shadow-lg hover:scale-[1.02] active:scale-95 transition-all"
                >
                  <Check size={15} /> 완료
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
