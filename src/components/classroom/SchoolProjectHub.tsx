import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import RecapKeywordsEditor from './RecapKeywordsEditor';
import { School, Users, Calendar, Plus, Trash2, Save, BookOpen, Package, ExternalLink, Link2, ChevronDown } from 'lucide-react';

interface Props {
  classInfo: any;
  onOpenResources: () => void;
  onOpenProjectModal: () => void;
  onSaved?: () => void;
}

const SchoolProjectHub = ({ classInfo, onOpenResources, onOpenProjectModal, onSaved }: Props) => {
  const [project, setProject] = useState<any>(null);
  const [subClasses, setSubClasses] = useState<any[]>([]);
  const [weeklyPlan, setWeeklyPlan] = useState<any[]>([]);
  const [classMaterials, setClassMaterials] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // 각 주차별 자료 선택 드롭다운 열림 여부
  const [matDropdownIdx, setMatDropdownIdx] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    if (!classInfo) return;

    setWeeklyPlan(classInfo.weekly_plan || []);

    if (classInfo.school_project_id) {
      const { data: proj } = await supabase
        .from('school_projects')
        .select('*')
        .eq('id', classInfo.school_project_id)
        .single();
      setProject(proj);
    }

    // 수업 자료 에디터 자료 로드 (class_materials)
    const { data: mats } = await supabase
      .from('class_materials')
      .select('id, title, week_number, is_published')
      .eq('class_id', classInfo.id)
      .order('week_number', { ascending: true });
    setClassMaterials(mats || []);

    const { data: subs } = await supabase
      .from('classes')
      .select('id, name, assigned_teacher_id')
      .eq('parent_class_id', classInfo.id)
      .order('created_at', { ascending: true });

    if (!subs) return;

    const enriched = await Promise.all(
      subs.map(async (sub: any) => {
        const [{ count }, profileRes] = await Promise.all([
          supabase.from('students').select('*', { count: 'exact', head: true }).eq('class_id', sub.id),
          sub.assigned_teacher_id
            ? supabase.from('profiles').select('full_name').eq('id', sub.assigned_teacher_id).single()
            : Promise.resolve({ data: null }),
        ]);
        return {
          ...sub,
          studentCount: count ?? 0,
          teacherName: (profileRes as any)?.data?.full_name ?? '미지정',
        };
      })
    );
    setSubClasses(enriched);
  }, [classInfo?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const saveWeeklyPlan = async () => {
    setSaving(true);
    await supabase.from('classes').update({ weekly_plan: weeklyPlan }).eq('id', classInfo.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSaved?.();
  };

  const addWeek = () => {
    const next = weeklyPlan.length + 1;
    setWeeklyPlan([...weeklyPlan, { week: next, topic: '', url: '', requires_result: true, requires_activity: true }]);
  };

  const removeWeek = (idx: number) => {
    setWeeklyPlan(weeklyPlan.filter((_, i) => i !== idx));
  };

  const updateWeek = (idx: number, field: string, value: any) => {
    const updated = [...weeklyPlan];
    updated[idx] = { ...updated[idx], [field]: value };
    setWeeklyPlan(updated);
  };

  const linkMaterial = (idx: number, mat: any) => {
    const updated = [...weeklyPlan];
    updated[idx] = { ...updated[idx], material_id: mat.id, url: '', topic: updated[idx].topic || mat.title };
    setWeeklyPlan(updated);
    setMatDropdownIdx(null);
  };

  const unlinkMaterial = (idx: number) => {
    const updated = [...weeklyPlan];
    const { material_id: _, ...rest } = updated[idx];
    updated[idx] = rest;
    setWeeklyPlan(updated);
  };

  const startDate = project?.start_date ? new Date(project.start_date).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) : null;
  const endDate = classInfo?.end_date ? new Date(classInfo.end_date).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) : null;

  return (
    <div className="space-y-8">
      {/* 프로젝트 헤더 */}
      <div className="bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-200 rounded-3xl p-6 md:p-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-violet-500 text-white flex items-center justify-center shadow-lg shadow-violet-200 shrink-0">
              <School size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-black bg-violet-100 text-violet-600 px-2 py-0.5 rounded-full uppercase tracking-widest">학교 프로젝트</span>
              </div>
              <h2 className="text-xl md:text-2xl font-black text-violet-900 tracking-tight">{classInfo?.name}</h2>
              <p className="text-sm text-violet-600 font-bold mt-0.5">{classInfo?.subject}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {startDate && endDate && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/70 rounded-xl border border-violet-200">
                <Calendar size={12} className="text-violet-500" />
                <span className="text-xs font-black text-violet-700">{startDate} ~ {endDate}</span>
              </div>
            )}
            <button
              onClick={onOpenProjectModal}
              className="px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-violet-200 flex items-center gap-1.5"
            >
              <ExternalLink size={13} />
              프로젝트 관리
            </button>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* 담당 반 현황 */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-black text-on-surface flex items-center gap-2">
              <Users size={16} className="text-violet-500" />
              담당 반 현황
              <span className="text-[11px] text-on-surface-variant/60 font-bold bg-surface-container px-2 py-0.5 rounded-lg">{subClasses.length}개 반</span>
            </h3>
          </div>

          {subClasses.length === 0 ? (
            <div className="text-center py-12 bg-surface-container-low rounded-2xl border border-dashed border-neutral-300">
              <Users size={32} className="text-neutral-300 mx-auto mb-3" />
              <p className="text-sm font-black text-on-surface-variant">등록된 하위 반이 없습니다</p>
              <p className="text-xs text-on-surface-variant/60 mt-1">프로젝트 관리에서 반을 추가해 주세요</p>
            </div>
          ) : (
            <div className="space-y-3">
              {subClasses.map((sub) => (
                <div key={sub.id} className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-neutral-200 shadow-sm">
                  <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center shrink-0 font-black text-sm">
                    {sub.name.slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm text-on-surface">{sub.name}</p>
                    <p className="text-xs text-on-surface-variant font-bold truncate">{sub.teacherName}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Users size={12} className="text-on-surface-variant/60" />
                    <span className="text-xs font-black text-on-surface-variant">{sub.studentCount}명</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 주차별 수업 계획 (전 반 공통 적용) */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-black text-on-surface flex items-center gap-2">
              <BookOpen size={16} className="text-violet-500" />
              주차별 계획
            </h3>
            <span className="text-[10px] font-black text-violet-500 bg-violet-50 border border-violet-200 px-2 py-1 rounded-lg">전 반 공통 적용</span>
          </div>

          <div className="space-y-2 max-h-[360px] overflow-y-auto custom-scrollbar pr-1">
            {weeklyPlan.map((item, idx) => {
              const linkedMat = item.material_id
                ? classMaterials.find((m: any) => m.id === item.material_id)
                : null;
              const isMatOpen = matDropdownIdx === idx;

              return (
                <div key={idx} className="bg-white border border-neutral-200 rounded-xl px-3 py-2 shadow-sm group">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-violet-500 bg-violet-50 px-1.5 py-0.5 rounded-lg shrink-0 w-10 text-center">{item.week}주</span>
                    <input
                      className="flex-1 text-sm font-bold text-on-surface bg-transparent outline-none placeholder:text-neutral-300"
                      placeholder="수업 주제 입력"
                      value={item.topic}
                      onChange={(e) => updateWeek(idx, 'topic', e.target.value)}
                    />
                    {/* 자료 연결 토글 */}
                    {linkedMat ? (
                      <button
                        onClick={() => unlinkMaterial(idx)}
                        className="flex items-center gap-1 text-[10px] font-black text-secondary bg-secondary/10 px-2 py-0.5 rounded-lg hover:bg-error/10 hover:text-error transition-all shrink-0"
                        title="연결 해제"
                      >
                        <BookOpen size={10} />
                        {linkedMat.title?.slice(0, 6) || '자료'}
                      </button>
                    ) : (
                      <div className="relative shrink-0">
                        <button
                          onClick={() => setMatDropdownIdx(isMatOpen ? null : idx)}
                          className="flex items-center gap-1 text-[10px] font-black text-on-surface-variant/50 hover:text-violet-500 transition-all"
                          title="자료에디터 자료 연결"
                        >
                          <BookOpen size={11} />
                          <ChevronDown size={10} />
                        </button>
                        {isMatOpen && (
                          <div className="absolute right-0 top-6 z-10 w-48 bg-white border border-neutral-200 rounded-xl shadow-lg overflow-hidden">
                            {classMaterials.length === 0 ? (
                              <p className="text-[10px] text-on-surface-variant/60 px-3 py-2">자료에디터에 등록된 자료 없음</p>
                            ) : (
                              classMaterials.map((mat: any) => (
                                <button
                                  key={mat.id}
                                  onClick={() => linkMaterial(idx, mat)}
                                  className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-violet-50 text-on-surface transition-all flex items-center gap-2"
                                >
                                  <BookOpen size={11} className="text-violet-400 shrink-0" />
                                  <span className="truncate">{mat.title}</span>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    {/* URL 입력 (자료 연결 안 된 경우만) */}
                    {!linkedMat && (
                      <input
                        className="w-28 text-xs font-bold text-on-surface-variant bg-transparent outline-none placeholder:text-neutral-300"
                        placeholder="URL"
                        value={item.url || ''}
                        onChange={(e) => updateWeek(idx, 'url', e.target.value)}
                      />
                    )}
                    {linkedMat && (
                      <div className="flex items-center gap-1 text-[10px] text-on-surface-variant/40 shrink-0">
                        <Link2 size={10} />
                        자료 연결됨
                      </div>
                    )}
                    <button onClick={() => removeWeek(idx)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-error/10 rounded-lg text-error/60 hover:text-error transition-all">
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div className="mt-2">
                    <RecapKeywordsEditor
                      recap={item.recap}
                      materialId={item.material_id}
                      topic={item.topic}
                      classId={classInfo.id}
                      onChange={(recap) => setWeeklyPlan(prev => prev.map((p, i) => i === idx ? { ...p, recap } : p))}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={addWeek}
              className="flex items-center gap-1.5 px-3 py-2 bg-surface-container hover:bg-surface-container-high rounded-xl text-xs font-black text-on-surface-variant hover:text-on-surface transition-all"
            >
              <Plus size={13} strokeWidth={3} />
              주차 추가
            </button>
            {classMaterials.length > 0 && (
              <span className="text-[10px] text-on-surface-variant/50 font-bold">
                <BookOpen size={10} className="inline mr-1" />
                자료에디터 {classMaterials.length}개 연결 가능
              </span>
            )}
            <div className="flex-1" />
            <button
              onClick={saveWeeklyPlan}
              disabled={saving}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all ${
                saved
                  ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                  : 'bg-violet-500 hover:bg-violet-600 text-white shadow-md shadow-violet-200'
              }`}
            >
              <Save size={13} />
              {saved ? '저장됨 ✓' : saving ? '저장 중...' : '저장 (전 반 적용)'}
            </button>
          </div>
        </div>
      </div>

      {/* 수업 자료 */}
      <div className="bg-surface-container-low rounded-2xl border border-neutral-200 p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center">
            <Package size={18} />
          </div>
          <div>
            <p className="font-black text-sm text-on-surface">수업 자료 관리</p>
            <p className="text-xs text-on-surface-variant mt-0.5">여기서 등록한 자료가 모든 하위 반에 표시됩니다</p>
          </div>
        </div>
        <button
          onClick={onOpenResources}
          className="flex items-center gap-1.5 px-4 py-2 bg-white border border-neutral-200 hover:border-violet-300 hover:bg-violet-50 text-on-surface-variant hover:text-violet-700 rounded-xl text-xs font-black transition-all"
        >
          <Package size={13} />
          자료 관리
        </button>
      </div>
    </div>
  );
};

export default SchoolProjectHub;
