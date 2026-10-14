import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import ImportableMaterialPicker, { type ImportableMaterial } from './ImportableMaterialPicker';
import { applyOriginUpdate, hasOriginUpdate, type PlanMaterialRow } from '../../lib/planMaterialOverride';
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
  const [plan, setPlan] = useState<WeeklyPlanItem[]>([]);
  const [commonLoaded, setCommonLoaded] = useState(false);
  const [classRows, setClassRows] = useState<{ id: string; name: string; custom: boolean; plan: WeeklyPlanItem[] }[]>([]);
  const [baseId, setBaseId] = useState<string | null>(null);
  // 적용 대상: 'all' = 이 학교 전체 반, 그 외 = 반 id (그 반에만 적용)
  const [target, setTarget] = useState<string>('all');
  const [baseline, setBaseline] = useState('[]');
  const [pendingPublishIds, setPendingPublishIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  // 원본 자료 id → 이 학교 반들이 쓰는 "내 수업용 복사본" 목록 (원본이 더 새로우면 hasUpdate)
  const [copyInfo, setCopyInfo] = useState<Record<string, { copy: PlanMaterialRow; classId: string; hasUpdate: boolean }[]>>({});
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    // 다른 학교로 바뀌었을 때 이전 학교의 열림/선택/대기 상태가 남지 않도록 초기화
    setOpenIdx(null);
    setPickIdx(null);
    setPendingPublishIds([]);
    setCommonLoaded(false);
    setTarget('all');
    try {
      const { data: common, error: commonErr } = await supabase
        .from('classes').select('id, weekly_plan')
        .eq('school_project_id', projectId).is('parent_class_id', null).maybeSingle();
      if (commonErr) throw commonErr;
      const commonP = (common?.weekly_plan || []) as WeeklyPlanItem[];
      setCommonPlan(commonP);
      setCommonLoaded(true);

      const { data: rows, error: rowsErr } = await supabase
        .from('classes').select('id, name, parent_class_id, weekly_plan, weekly_plan_custom, created_at')
        .eq('school_project_id', schoolId).order('created_at', { ascending: true });
      if (rowsErr) throw rowsErr;
      const list = (rows || []) as any[];
      setSchoolClassIds(list.map(r => r.id));
      const rowsState = list.map(r => ({ id: r.id, name: r.name || '이름 없는 반', custom: !!r.weekly_plan_custom, plan: (r.weekly_plan || []) as WeeklyPlanItem[] }));
      setClassRows(rowsState);
      const root = list.find(r => r.parent_class_id === null);
      setBaseId(root?.id ?? null);
      // 학교 대표 반이 없으면 반들 중 하나라도 고정이면 고정으로 본다
      const isFixed = root ? !!root.weekly_plan_custom : list.some(r => r.weekly_plan_custom);
      const base = root ?? list.find(r => r.weekly_plan_custom);
      const shown = isFixed ? ((base?.weekly_plan || []) as WeeklyPlanItem[]) : commonP;
      setPlan(shown);
      setBaseline(JSON.stringify(shown));
    } catch (e: any) {
      setToast({ msg: '계획을 불러오지 못했습니다: ' + (e?.message || '알 수 없는 오류'), type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [projectId, schoolId]);

  useEffect(() => { load(); }, [load]);

  // 학교 전체 보기에서 보여 줄 계획과 고정 여부 (대표 반 기준)
  const { fixed, allPlan } = useMemo(() => {
    const base = classRows.find(r => r.id === baseId) ?? classRows.find(r => r.custom);
    const isFixed = baseId ? !!classRows.find(r => r.id === baseId)?.custom : classRows.some(r => r.custom);
    return { fixed: isFixed, allPlan: isFixed ? (base?.plan || []) : commonPlan };
  }, [classRows, baseId, commonPlan]);

  const isAll = target === 'all';
  const targetRow = classRows.find(r => r.id === target);
  const targetFixed = isAll ? fixed : !!targetRow?.custom;
  const targetName = isAll ? '이 학교 전체 반' : (targetRow?.name || '이 반');
  // 반마다 계획이 서로 다른지 (전체 보기에서 안내용)
  const classesDiffer = useMemo(() => {
    const eff = classRows.map(r => JSON.stringify(r.custom ? r.plan : commonPlan));
    return new Set(eff).size > 1;
  }, [classRows, commonPlan]);

  const switchTarget = (next: string) => {
    if (next === target) return;
    if (JSON.stringify(plan) !== baseline && !confirm('저장하지 않은 수정이 있습니다. 버리고 다른 대상으로 옮길까요?')) return;
    const row = classRows.find(r => r.id === next);
    const shown = next === 'all' ? allPlan : (row?.custom ? row.plan : commonPlan);
    setTarget(next);
    setOpenIdx(null);
    setPickIdx(null);
    setPendingPublishIds([]);
    setPlan(shown);
    setBaseline(JSON.stringify(shown));
  };

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

  // 이 학교 반 중 "내 수업용 복사본"을 쓰는 반 찾기 (복사본이 있으면 원본을 고쳐도 그 반 화면엔 안 바뀌므로 안내용)
  const loadCopies = useCallback(async () => {
    const ids = [...new Set(plan.map(p => p.material_id).filter((id): id is string => !!id))];
    if (ids.length === 0 || schoolClassIds.length === 0) { setCopyInfo({}); return; }
    const [{ data: copies }, { data: origs }] = await Promise.all([
      supabase.from('class_materials')
        .select('id, class_id, week_number, title, content, ai_versions, attachments, activity_urls, is_published, plan_origin_id, origin_synced_at, origin_dismissed_at, origin_backup, content_updated_at')
        .in('plan_origin_id', ids).in('class_id', schoolClassIds),
      supabase.from('class_materials').select('id, content_updated_at').in('id', ids),
    ]);
    const origAt = new Map<string, string | null>((origs || []).map((o: any) => [o.id, o.content_updated_at]));
    const next: Record<string, { copy: PlanMaterialRow; classId: string; hasUpdate: boolean }[]> = {};
    ((copies || []) as PlanMaterialRow[]).forEach(c => {
      if (!c.plan_origin_id || !c.class_id) return;
      const hasUpdate = hasOriginUpdate({ content_updated_at: origAt.get(c.plan_origin_id) ?? null }, c);
      (next[c.plan_origin_id] ||= []).push({ copy: c, classId: c.class_id, hasUpdate });
    });
    setCopyInfo(next);
  }, [plan, schoolClassIds]);

  useEffect(() => { loadCopies(); }, [loadCopies]);

  const handleReplaceWithOrigin = async (copy: PlanMaterialRow, className: string) => {
    if (!confirm(`'${className}'의 복사본을 원본 내용으로 교체할까요?\n지금 복사본 내용은 1단계 백업되어, 자료 에디터의 "되돌리기"로 복구할 수 있습니다.`)) return;
    setReplacingId(copy.id);
    try {
      await applyOriginUpdate(copy);
      await loadCopies();
      setToast({ msg: `'${className}'이(가) 원본 내용으로 교체되었습니다.`, type: 'success' });
    } catch (e: any) {
      setToast({ msg: '교체에 실패했습니다: ' + (e?.message || '알 수 없는 오류'), type: 'error' });
    } finally {
      setReplacingId(null);
    }
  };

  const handlePick = (m: ImportableMaterial) => {
    if (pickIdx === null) return;
    update(pickIdx, { topic: m.title, material_id: m.id, url: m.activity_urls?.[0]?.url || plan[pickIdx]?.url || '' });
    setMaterialTitles(prev => ({ ...prev, [m.id]: m.title }));
    setPickIdx(null);
    // 공개 전환은 "저장"을 눌렀을 때 한 번에 처리 (연결만 하고 저장 안 하면 공개되지 않음)
    setPendingPublishIds(prev => (prev.includes(m.id) ? prev : [...prev, m.id]));
  };

  const update = (idx: number, patch: Partial<WeeklyPlanItem>) =>
    setPlan(prev => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));

  const handleSave = async () => {
    if (schoolClassIds.length === 0) return;
    if (!isAll && !targetRow) return;
    setSaving(true);
    try {
      const cleaned = plan.map((p, i) => ({ ...p, week: i + 1 }));
      // 전체 저장일 때, 대표 반 말고 반마다 따로 고정해 둔 계획이 있으면 덮어쓰기 전에 확인
      const cleanedJson = JSON.stringify(cleaned);
      const overwritten = classRows.filter(r => r.id !== baseId && r.custom && JSON.stringify(r.plan) !== cleanedJson);
      if (isAll && overwritten.length > 0 &&
        !confirm(`이 학교의 ${overwritten.length}개 반은 따로 고정된 주차별 계획이 있습니다. 저장하면 그 계획이 지금 계획으로 덮어씌워집니다. 계속할까요?`)) {
        return;
      }
      // 계획에 연결한 자료는 다른 강사·학생도 봐야 하므로 이때 공개로 전환
      const stillLinked = pendingPublishIds.filter(id => cleaned.some(p => p.material_id === id));
      if (stillLinked.length > 0) {
        const { error: pubErr } = await supabase.from('class_materials')
          .update({ is_published: true, updated_at: new Date().toISOString() }).in('id', stillLinked);
        if (pubErr) throw new Error('연결한 자료를 공개로 바꾸지 못했습니다: ' + pubErr.message);
      }
      const ids = isAll ? schoolClassIds : [target];
      const { error } = await supabase.from('classes')
        .update({ weekly_plan: cleaned, weekly_plan_custom: true }).in('id', ids);
      if (error) throw error;
      setPendingPublishIds([]);
      setClassRows(prev => prev.map(r => (ids.includes(r.id) ? { ...r, custom: true, plan: cleaned } : r)));
      setPlan(cleaned);
      setBaseline(JSON.stringify(cleaned));
      setToast({
        msg: isAll
          ? '이 학교 전체 반에 주차별 계획을 저장했습니다. (학교 단위로 고정됨)'
          : `'${targetName}'의 주차별 계획을 저장했습니다. (이 반만 적용)`,
        type: 'success',
      });
    } catch (e: any) {
      setToast({ msg: '저장에 실패했습니다: ' + (e?.message || '알 수 없는 오류'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (schoolClassIds.length === 0) return;
    if (!isAll && !targetRow) return;
    if (!commonLoaded) {
      setToast({ msg: '공통 계획을 불러오지 못해 되돌릴 수 없습니다. 새로고침 후 다시 시도해 주세요.', type: 'error' });
      return;
    }
    const msg = commonPlan.length === 0
      ? `공통 주차별 계획이 비어 있습니다. 되돌리면 ${targetName}의 계획도 빈 상태가 됩니다. 그래도 되돌릴까요?`
      : `${targetName}을(를) 공통 주차별 계획으로 되돌릴까요? 따로 만든 계획은 사라집니다.`;
    if (!confirm(msg)) return;
    setSaving(true);
    try {
      const ids = isAll ? schoolClassIds : [target];
      const { error } = await supabase.from('classes')
        .update({ weekly_plan: commonPlan, weekly_plan_custom: false }).in('id', ids);
      if (error) throw error;
      setClassRows(prev => prev.map(r => (ids.includes(r.id) ? { ...r, custom: false, plan: commonPlan } : r)));
      setPendingPublishIds([]);
      setPlan(commonPlan);
      setBaseline(JSON.stringify(commonPlan));
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
      {classRows.length > 1 && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-black text-on-surface-variant">적용 대상</span>
          <select value={target} onChange={e => switchTarget(e.target.value)}
            className="px-3 py-2 bg-surface-container rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20">
            <option value="all">이 학교 전체 반</option>
            {classRows.map(r => (
              <option key={r.id} value={r.id}>{r.name}{r.custom ? ' · 개별 수정됨' : ''}</option>
            ))}
          </select>
        </div>
      )}
      {isAll && classesDiffer && (
        <p className="flex items-start gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          반마다 계획이 서로 다릅니다. 여기서 저장하면 모든 반이 같은 계획으로 바뀝니다. 한 반만 고치려면 위에서 반을 고르세요.
        </p>
      )}

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="text-xs text-on-surface-variant space-y-1">
          <span className={`inline-block text-[10px] font-black px-2 py-0.5 rounded-full ${targetFixed ? 'bg-amber-100 text-amber-700' : 'bg-surface-container-high text-on-surface-variant'}`}>
            {isAll
              ? (fixed ? '이 학교 전용 계획 (학교 단위 고정)' : '공통 계획을 따르는 중')
              : (targetFixed ? `${targetName} 전용 계획 (이 반만 적용)` : '공통 계획을 따르는 중')}
          </span>
          <p>{isAll
            ? '저장하면 이 학교의 모든 반에 적용되고, 이후 공통 계획이 바뀌어도 이 학교는 따라가지 않습니다.'
            : `저장하면 '${targetName}'에만 적용됩니다. 다른 반과 공통 계획은 바뀌지 않습니다.`}</p>
          <p className="opacity-70">복습 키워드는 프로젝트 전체 화면 &gt; 주차별 계획에서 편집하세요. 여기서 고쳐도 기존 값은 유지됩니다.</p>
        </div>
        {targetFixed && (
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
                      {item.material_id && copyInfo[item.material_id]?.some(c => c.hasUpdate)
                        ? <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">원본 업데이트</span>
                        : item.material_id && copyInfo[item.material_id]?.length > 0 && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">복사본 사용 중</span>}
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
                      {item.material_id && (copyInfo[item.material_id]?.length ?? 0) > 0 && (
                        <div className="px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl space-y-1.5">
                          <p className="text-xs font-bold text-amber-900">아래 반은 선생님이 고친 "내 수업용 복사본"을 쓰고 있어서, 원본을 수정해도 그 반 화면에는 바로 반영되지 않습니다.</p>
                          {copyInfo[item.material_id].map(c => {
                            const cn = classRows.find(r => r.id === c.classId)?.name || '이름 없는 반';
                            return (
                              <div key={c.copy.id} className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-black text-on-surface">{cn}</span>
                                {c.hasUpdate ? (
                                  <>
                                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">원본이 더 새로워요</span>
                                    <button type="button" disabled={replacingId === c.copy.id} onClick={() => handleReplaceWithOrigin(c.copy, cn)}
                                      className="flex items-center gap-1 text-[11px] font-black text-white bg-primary hover:bg-primary-dim disabled:opacity-50 px-2.5 py-1 rounded-lg transition-all">
                                      {replacingId === c.copy.id ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />} 원본으로 교체
                                    </button>
                                  </>
                                ) : <span className="text-[10px] font-bold text-on-surface-variant/70">원본과 같거나 내 버전 유지 중</span>}
                              </div>
                            );
                          })}
                        </div>
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
        {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {isAll ? '이 학교 전체 반에 저장' : '이 반에만 저장'}
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
