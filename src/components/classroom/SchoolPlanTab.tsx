import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import ImportableMaterialPicker, { type ImportableMaterial } from './ImportableMaterialPicker';
import { BookOpen, Check, Loader2, Plus, RotateCcw, Save, X, AlertTriangle, ExternalLink, ListOrdered, ChevronDown } from 'lucide-react';

interface WeeklyPlanItem {
  week: number;
  topic: string;
  url?: string;
  material_id?: string;
  recap?: string[];
  requires_result?: boolean;
  requires_activity?: boolean;
}

// 학교 페이지의 "주차별 계획" 탭: 이 학교에 적용되는 계획을 보고 바로 고친다.
// 저장하면 이 학교 전체 반이 "학교 단위로 고정"된다(공통 계획이 바뀌어도 따라가지 않음).
export default function SchoolPlanTab({ projectId, schoolId }: { projectId: string; schoolId: string }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [pickIdx, setPickIdx] = useState<number | null>(null);
  const [materialTitles, setMaterialTitles] = useState<Record<string, string>>({});
  const [commonPlan, setCommonPlan] = useState<WeeklyPlanItem[]>([]);
  const [schoolClassIds, setSchoolClassIds] = useState<string[]>([]);
  const [fixed, setFixed] = useState(false);
  const [plan, setPlan] = useState<WeeklyPlanItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: common } = await supabase
        .from('classes').select('id, weekly_plan')
        .eq('school_project_id', projectId).is('parent_class_id', null).maybeSingle();
      const commonP = (common?.weekly_plan || []) as WeeklyPlanItem[];
      setCommonPlan(commonP);

      const { data: rows } = await supabase
        .from('classes').select('id, parent_class_id, weekly_plan, weekly_plan_custom, created_at')
        .eq('school_project_id', schoolId).order('created_at', { ascending: true });
      const list = rows || [];
      setSchoolClassIds(list.map((r: any) => r.id));
      const root: any = list.find((r: any) => r.parent_class_id === null);
      const isFixed = !!root?.weekly_plan_custom;
      setFixed(isFixed);
      setPlan(isFixed ? ((root?.weekly_plan || []) as WeeklyPlanItem[]) : commonP);
    } finally {
      setLoading(false);
    }
  }, [projectId, schoolId]);

  useEffect(() => { load(); }, [load]);

  // 연결된 자료의 제목 조회 (칩 표시용)
  useEffect(() => {
    const ids = [...new Set(plan.map(p => p.material_id).filter((id): id is string => !!id && !materialTitles[id]))];
    if (ids.length === 0) return;
    supabase.from('class_materials').select('id, title').in('id', ids).then(({ data }) => {
      if (!data) return;
      setMaterialTitles(prev => {
        const next = { ...prev };
        data.forEach((m: any) => { next[m.id] = m.title; });
        return next;
      });
    });
  }, [plan]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePick = async (m: ImportableMaterial) => {
    if (pickIdx === null) return;
    update(pickIdx, { topic: m.title, material_id: m.id, url: m.activity_urls?.[0]?.url || plan[pickIdx]?.url || '' });
    setMaterialTitles(prev => ({ ...prev, [m.id]: m.title }));
    setPickIdx(null);
    // 계획에 연결된 자료는 다른 강사·학생도 봐야 하므로 공개 상태로 전환
    await supabase.from('class_materials').update({ is_published: true, updated_at: new Date().toISOString() }).eq('id', m.id);
  };

  const update = (idx: number, patch: Partial<WeeklyPlanItem>) =>
    setPlan(prev => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));

  const handleSave = async () => {
    if (schoolClassIds.length === 0) return;
    setSaving(true);
    try {
      const cleaned = plan.map((p, i) => ({ ...p, week: i + 1 }));
      const { error } = await supabase.from('classes')
        .update({ weekly_plan: cleaned, weekly_plan_custom: true }).in('id', schoolClassIds);
      if (error) throw error;
      setPlan(cleaned);
      setFixed(true);
      setToast({ msg: '이 학교 전체 반에 주차별 계획을 저장했습니다. (학교 단위로 고정됨)', type: 'success' });
    } catch (e: any) {
      setToast({ msg: '저장에 실패했습니다: ' + (e?.message || '알 수 없는 오류'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (schoolClassIds.length === 0) return;
    if (!confirm('이 학교 전체 반을 공통 주차별 계획으로 되돌릴까요? 이 학교에서 따로 만든 계획은 사라집니다.')) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('classes')
        .update({ weekly_plan: commonPlan, weekly_plan_custom: false }).in('id', schoolClassIds);
      if (error) throw error;
      setPlan(commonPlan);
      setFixed(false);
      setToast({ msg: '공통 주차별 계획으로 되돌렸습니다.', type: 'success' });
    } catch (e: any) {
      setToast({ msg: '되돌리기에 실패했습니다: ' + (e?.message || '알 수 없는 오류'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-primary" size={24} /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="text-xs text-on-surface-variant space-y-1">
          <span className={`inline-block text-[10px] font-black px-2 py-0.5 rounded-full ${fixed ? 'bg-amber-100 text-amber-700' : 'bg-surface-container-high text-on-surface-variant'}`}>
            {fixed ? '이 학교 전용 계획 (학교 단위 고정)' : '공통 계획을 따르는 중'}
          </span>
          <p>저장하면 이 학교의 모든 반에 적용되고, 이후 공통 계획이 바뀌어도 이 학교는 따라가지 않습니다.</p>
          <p className="opacity-70">복습 키워드는 프로젝트 전체 화면 &gt; 주차별 계획에서 편집하세요. 여기서 고쳐도 기존 값은 유지됩니다.</p>
        </div>
        {fixed && (
          <button onClick={handleReset} disabled={saving} className="flex items-center gap-1.5 text-xs font-bold text-on-surface-variant hover:text-primary bg-surface-container hover:bg-surface-container-high px-3 py-2 rounded-xl transition-all">
            <RotateCcw size={13} /> 공통으로 되돌리기
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-primary/5 border border-primary/15">
        <p className="text-xs text-on-surface-variant">차시 내용을 직접 만들어 연결하고 싶다면 <b className="text-primary">수업 자료 에디터</b>에서 자료를 만든 뒤, 아래 각 주차의 '수업 자료에서 가져오기'로 연결하세요.</p>
        <a href="/teaching-tools?tool=material-editor" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs font-bold text-primary hover:text-primary-dim shrink-0 whitespace-nowrap">
          에디터 열기 <ExternalLink size={12} />
        </a>
      </div>

      {plan.length === 0 && (
        <p className="text-sm text-on-surface-variant/60 text-center py-8 surface-card border border-surface-container-high">아직 주차별 계획이 없습니다. 아래에서 주차를 추가해 보세요.</p>
      )}

      {plan.length > 0 && (
        <div className="surface-card border border-surface-container-high">
          <p className="flex items-center gap-1.5 text-xs font-black text-on-surface-variant px-4 pt-4 pb-2"><ListOrdered size={14} /> 차시별 목차 ({plan.length}차시) · 눌러서 상세 내용 보기</p>
          <div className="divide-y divide-surface-container-high">
            {plan.map((item, idx) => {
              const open = openIdx === idx;
              return (
                <div key={idx} id={`school-plan-week-${idx}`}>
                  <button type="button" onClick={() => setOpenIdx(open ? null : idx)}
                    className="w-full flex items-center gap-2 text-left px-4 py-3 hover:bg-surface-container/60 transition-all">
                    <ChevronDown size={15} className={`text-on-surface-variant shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
                    <span className="text-[11px] font-black text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">{idx + 1}주차</span>
                    <span className={`text-sm font-bold truncate flex-1 ${item.topic.trim() ? 'text-on-surface' : 'text-on-surface-variant/40'}`}>{item.topic.trim() || '(주제 미입력)'}</span>
                    <span className="hidden sm:flex items-center gap-1 shrink-0">
                      {item.material_id && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">자료 연결</span>}
                      {item.url && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">링크</span>}
                      {item.requires_result !== false && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant">결과제출</span>}
                      {item.requires_activity !== false && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant">활동</span>}
                    </span>
                  </button>
                  {open && (
                    <div className="px-4 pb-4 pt-1 space-y-2.5">
                      <div className="flex items-center gap-2">
                        <input type="text" value={item.topic} onChange={e => update(idx, { topic: e.target.value })} placeholder="주제/제목"
                          className="flex-1 px-3 py-2 bg-surface-container rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20" />
                        <button onClick={() => { setPlan(plan.filter((_, i) => i !== idx)); setOpenIdx(null); }} title="이 주차 삭제"
                          className="p-1.5 rounded-lg text-on-surface-variant/50 hover:text-red-500 hover:bg-red-50 transition-all shrink-0">
                          <X size={14} />
                        </button>
                      </div>
                      {item.material_id ? (
                        <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border-2 border-primary/20 rounded-xl">
                          <BookOpen size={14} className="text-primary shrink-0" />
                          <span className="text-xs font-black text-primary flex-1 truncate">{materialTitles[item.material_id] || '연결된 자료'} 연결됨</span>
                          <button type="button" onClick={() => update(idx, { material_id: '' })} className="p-0.5 text-on-surface-variant/50 hover:text-error transition-colors shrink-0"><X size={14} /></button>
                        </div>
                      ) : (
                        <button onClick={() => setPickIdx(idx)} className="flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary-dim transition-colors">
                          <BookOpen size={13} /> 수업 자료에서 가져오기
                        </button>
                      )}
                      <input type="text" value={item.url || ''} onChange={e => update(idx, { url: e.target.value })} placeholder="자료 링크 (URL, 선택)"
                        className="w-full px-3 py-2 bg-surface-container rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-primary/20" />
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={item.requires_result !== false} onChange={e => update(idx, { requires_result: e.target.checked })} className="w-3.5 h-3.5 rounded accent-primary" />
                          <span className="text-xs font-black text-neutral-600">결과제출 필요</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={item.requires_activity !== false} onChange={e => update(idx, { requires_activity: e.target.checked })} className="w-3.5 h-3.5 rounded accent-primary" />
                          <span className="text-xs font-black text-neutral-600">활동 필요</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button onClick={() => { setPlan(prev => [...prev, { week: prev.length + 1, topic: '', url: '', requires_result: true, requires_activity: true }]); setOpenIdx(plan.length); }}
        className="w-full py-3 rounded-xl border-2 border-dashed border-surface-container-high hover:border-primary/40 text-sm font-bold text-on-surface-variant/60 hover:text-primary transition-all flex items-center justify-center gap-1.5">
        <Plus size={16} /> 주차 추가
      </button>

      <button onClick={handleSave} disabled={saving || schoolClassIds.length === 0}
        className="w-full py-3 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary-dim disabled:opacity-50 transition-all flex items-center justify-center gap-1.5">
        {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} 이 학교 전체 반에 저장
      </button>

      {pickIdx !== null && user && (
        <ImportableMaterialPicker userId={user.id} onPick={handlePick} onClose={() => setPickIdx(null)} />
      )}

      {toast && createPortal(
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 w-full max-w-md pointer-events-none">
          <div className={`flex items-start gap-2 px-4 py-3 rounded-2xl shadow-xl border bg-surface-container-lowest ${toast.type === 'success' ? 'border-primary/30' : 'border-red-300'}`}>
            {toast.type === 'success' ? <Check size={16} className="text-primary mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />}
            <span className="text-sm font-bold text-on-surface">{toast.msg}</span>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
