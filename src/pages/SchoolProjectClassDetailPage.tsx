import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import {
  ArrowLeft,
  Users,
  BookOpen,
  Loader2,
  Eye,
  EyeOff,
  ClipboardList,
  FileText,
  Plus,
  X,
  ChevronDown,
  Link2,
  Trash2,
  Save,
  CalendarRange,
} from 'lucide-react';

interface StudentRow {
  id: string;
  full_name: string;
  resultCount: number;
  lastResultAt: string | null;
}

interface MaterialRow {
  id: string;
  title: string;
  week_number: number | null;
  is_published: boolean;
  updated_at: string;
}

interface LessonPlanRow {
  id: string;
  purpose: string | null;
  updated_at: string;
}

interface WeeklyPlanItem {
  week: number;
  topic: string;
  url?: string;
  material_id?: string;
  requires_result?: boolean;
  requires_activity?: boolean;
}

interface GeneralMaterialRow {
  id: string;
  title: string;
  url: string;
}

const TABS = [
  { key: 'students', label: '학생 현황' },
  { key: 'materials', label: '수업 자료 현황' },
  { key: 'plan', label: '주차별 자료 설정' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const SchoolProjectClassDetailPage = () => {
  const { projectId, schoolId, classId } = useParams<{ projectId: string; schoolId: string; classId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('students');
  const [classInfo, setClassInfo] = useState<{ id: string; name: string; teacherName: string | null } | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [lessonPlans, setLessonPlans] = useState<LessonPlanRow[]>([]);

  // 주차별 계획(syllabus) 관리 — 배정 강사가 직접 설정할 수 없어 관리자가 대신 구성
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlanItem[]>([]);
  const [planSaving, setPlanSaving] = useState(false);
  const [materialDropdownIdx, setMaterialDropdownIdx] = useState<number | null>(null);

  // 일반 자료(주차와 무관한 링크) 관리
  const [generalMaterials, setGeneralMaterials] = useState<GeneralMaterialRow[]>([]);
  const [generalMatForm, setGeneralMatForm] = useState({ title: '', url: '' });
  const [showAddGeneralForm, setShowAddGeneralForm] = useState(false);
  const [generalMatSaving, setGeneralMatSaving] = useState(false);

  const fetchData = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    try {
      const { data: cls } = await supabase
        .from('classes')
        .select('id, name, assigned_teacher_id, weekly_plan')
        .eq('id', classId)
        .single();

      let teacherName: string | null = null;
      if (cls?.assigned_teacher_id) {
        const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', cls.assigned_teacher_id).single();
        teacherName = profile?.full_name || null;
      }
      setClassInfo(cls ? { id: cls.id, name: cls.name, teacherName } : null);
      setWeeklyPlan(cls?.weekly_plan || []);

      const { data: generalRows } = await supabase
        .from('class_general_materials')
        .select('id, title, url')
        .eq('class_id', classId)
        .eq('type', 'link')
        .order('created_at', { ascending: false });
      setGeneralMaterials(generalRows || []);

      const { data: studentRows } = await supabase.from('students').select('id, full_name').eq('class_id', classId);
      const studentIds = (studentRows || []).map(s => s.id);

      const resultStatsByStudent: Record<string, { count: number; last: string | null }> = {};
      if (studentIds.length > 0) {
        const { data: results } = await supabase
          .from('student_results')
          .select('student_id, created_at')
          .in('student_id', studentIds);
        (results || []).forEach((r: any) => {
          if (!resultStatsByStudent[r.student_id]) resultStatsByStudent[r.student_id] = { count: 0, last: null };
          const stat = resultStatsByStudent[r.student_id];
          stat.count++;
          if (!stat.last || r.created_at > stat.last) stat.last = r.created_at;
        });
      }

      setStudents((studentRows || []).map(s => ({
        id: s.id,
        full_name: s.full_name,
        resultCount: resultStatsByStudent[s.id]?.count || 0,
        lastResultAt: resultStatsByStudent[s.id]?.last || null,
      })));

      const { data: materialRows } = await supabase
        .from('class_materials')
        .select('id, title, week_number, is_published, updated_at')
        .eq('class_id', classId)
        .order('week_number', { ascending: true, nullsFirst: true })
        .order('updated_at', { ascending: false });
      setMaterials(materialRows || []);

      const { data: planRows } = await supabase
        .from('lesson_plans')
        .select('id, purpose, updated_at')
        .eq('class_id', classId)
        .order('updated_at', { ascending: false });
      setLessonPlans(planRows || []);
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSavePlan = async () => {
    if (!classId) return;
    setPlanSaving(true);
    try {
      const { error } = await supabase.from('classes').update({ weekly_plan: weeklyPlan }).eq('id', classId);
      if (error) throw error;
      alert('주차별 계획이 저장되었습니다.');
    } catch (err) {
      console.error('handleSavePlan error:', err);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setPlanSaving(false);
    }
  };

  const handleAddGeneralMat = async () => {
    if (!user || !classId || !generalMatForm.title.trim() || !generalMatForm.url.trim()) return;
    setGeneralMatSaving(true);
    try {
      const { error } = await supabase.from('class_general_materials').insert({
        class_id: classId,
        teacher_id: user.id,
        title: generalMatForm.title.trim(),
        type: 'link',
        url: generalMatForm.url.trim(),
        is_published: true,
      });
      if (error) throw error;
      setGeneralMatForm({ title: '', url: '' });
      setShowAddGeneralForm(false);
      await fetchData();
    } catch (err) {
      console.error('handleAddGeneralMat error:', err);
      alert('자료 등록 중 오류가 발생했습니다.');
    } finally {
      setGeneralMatSaving(false);
    }
  };

  const handleDeleteGeneralMat = async (id: string) => {
    if (!confirm('이 자료를 삭제할까요?')) return;
    try {
      const { error } = await supabase.from('class_general_materials').delete().eq('id', id);
      if (error) throw error;
      setGeneralMaterials(prev => prev.filter(m => m.id !== id));
    } catch (err) {
      console.error('handleDeleteGeneralMat error:', err);
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  if (!classInfo) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 text-center text-on-surface-variant">
        반 정보를 찾을 수 없습니다.
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <button
        onClick={() => navigate(`/school-projects/${projectId}/schools/${schoolId}`)}
        className="flex items-center gap-1.5 text-xs font-bold text-on-surface-variant hover:text-primary transition-colors"
      >
        <ArrowLeft size={14} /> 강사 관리로
      </button>

      <div>
        <h1 className="text-2xl font-black">{classInfo.name}</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          {classInfo.teacherName ? `담당 강사: ${classInfo.teacherName}` : <span className="text-orange-500">담당 강사 미배정</span>}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="surface-card p-4 border border-surface-container-high">
          <Users size={18} className="text-primary" />
          <p className="text-2xl font-black mt-2 tabular-nums">{students.length}</p>
          <p className="text-xs text-on-surface-variant mt-0.5">학생</p>
        </div>
        <div className="surface-card p-4 border border-surface-container-high">
          <BookOpen size={18} className="text-secondary" />
          <p className="text-2xl font-black mt-2 tabular-nums">{materials.length}</p>
          <p className="text-xs text-on-surface-variant mt-0.5">등록 자료</p>
        </div>
        <div className="surface-card p-4 border border-surface-container-high">
          <ClipboardList size={18} className="text-accent" />
          <p className="text-2xl font-black mt-2 tabular-nums">{lessonPlans.length}</p>
          <p className="text-xs text-on-surface-variant mt-0.5">수업 계획서</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-surface-container-high">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-bold border-b-2 transition-all ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant/60 hover:text-on-surface-variant'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'students' && (
        students.length === 0 ? (
          <div className="surface-card p-10 text-center text-on-surface-variant/60 text-sm">
            아직 등록된 학생이 없습니다.
          </div>
        ) : (
          <div className="surface-card border border-surface-container-high overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-container-high text-left text-xs text-on-surface-variant/70">
                    <th className="px-4 py-3 font-bold">이름</th>
                    <th className="px-4 py-3 font-bold text-right">제출/기록 수</th>
                    <th className="px-4 py-3 font-bold">최근 제출일</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map(s => (
                    <tr key={s.id} className="border-b border-surface-container-high last:border-0">
                      <td className="px-4 py-3 font-bold">{s.full_name}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {s.resultCount === 0 ? (
                          <span className="text-orange-500 font-bold">0</span>
                        ) : s.resultCount}
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant">
                        {s.lastResultAt ? new Date(s.lastResultAt).toLocaleDateString('ko-KR') : <span className="text-on-surface-variant/40">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {tab === 'materials' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-black mb-2 flex items-center gap-1.5"><BookOpen size={14} /> 수업 자료</h2>
            {materials.length === 0 ? (
              <div className="surface-card p-6 text-center text-on-surface-variant/60 text-sm">
                아직 등록된 수업 자료가 없습니다.
              </div>
            ) : (
              <div className="surface-card border border-surface-container-high divide-y divide-surface-container-high">
                {materials.map(m => (
                  <div key={m.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {m.week_number != null && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">
                          {m.week_number}주차
                        </span>
                      )}
                      <span className="text-sm font-bold truncate">{m.title}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full ${m.is_published ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                        {m.is_published ? <Eye size={10} /> : <EyeOff size={10} />}
                        {m.is_published ? '공개' : '비공개'}
                      </span>
                      <span className="text-[10px] text-on-surface-variant/50">{new Date(m.updated_at).toLocaleDateString('ko-KR')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-sm font-black mb-2 flex items-center gap-1.5"><FileText size={14} /> 수업 계획서</h2>
            {lessonPlans.length === 0 ? (
              <div className="surface-card p-6 text-center text-on-surface-variant/60 text-sm">
                아직 작성된 수업 계획서가 없습니다.
              </div>
            ) : (
              <div className="surface-card border border-surface-container-high divide-y divide-surface-container-high">
                {lessonPlans.map(p => (
                  <div key={p.id} className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm font-bold truncate">{p.purpose || '제목 없음'}</span>
                    <span className="text-[10px] text-on-surface-variant/50 shrink-0">{new Date(p.updated_at).toLocaleDateString('ko-KR')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'plan' && (
        <div className="space-y-6">
          <div className="flex items-start gap-3 px-4 py-3 bg-primary/5 border border-primary/20 rounded-2xl">
            <CalendarRange size={16} className="text-primary shrink-0 mt-0.5" />
            <p className="text-xs font-bold text-on-surface-variant">
              공용 프로젝트 반이라 배정 강사가 직접 주차별 설정을 할 수 없어요. 이 화면에서 관리자가 전체 주차 수·주차별 제목·자료를 대신 구성합니다.
              주차별 자료는 강사가 "수업 자료 에디터"로 작성한 자료를 연결하거나, 특정 수업 페이지 URL을 직접 입력해 사용할 수 있어요.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-black flex items-center gap-1.5"><ClipboardList size={14} /> 주차별 수업 계획</h2>
              <button
                type="button"
                onClick={() => setWeeklyPlan(prev => [...prev, { week: prev.length + 1, topic: '', url: '', material_id: '', requires_result: true, requires_activity: true }])}
                className="flex items-center gap-1 text-xs font-black px-3 py-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary hover:text-white transition-all"
              >
                <Plus size={13} /> 주차 추가
              </button>
            </div>

            {weeklyPlan.length === 0 ? (
              <div className="surface-card p-8 text-center text-on-surface-variant/60 text-sm border-2 border-dashed border-surface-container-high">
                등록된 주차별 계획이 없습니다. [+ 주차 추가]를 눌러 시작하세요.
              </div>
            ) : (
              <div className="space-y-3">
                {weeklyPlan.map((item, idx) => (
                  <div key={idx} className="surface-card p-4 border border-surface-container-high space-y-3 relative">
                    <button
                      type="button"
                      onClick={() => setWeeklyPlan(prev => prev.filter((_, i) => i !== idx))}
                      className="absolute top-3 right-3 text-on-surface-variant/40 hover:text-red-500 transition-colors"
                    >
                      <X size={15} />
                    </button>

                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 bg-surface-container border border-surface-container-high rounded-xl flex flex-col items-center justify-center shrink-0">
                        <span className="text-[9px] font-black text-on-surface-variant/60 uppercase">Week</span>
                        <span className="text-sm font-black text-primary">{item.week}</span>
                      </div>
                      <div className="flex-1 space-y-3 min-w-0">
                        <input
                          type="text"
                          value={item.topic}
                          onChange={e => setWeeklyPlan(prev => prev.map((p, i) => i === idx ? { ...p, topic: e.target.value } : p))}
                          placeholder="예: 1주차 오리엔테이션"
                          className="w-full px-3.5 py-2 bg-surface-container-low border border-surface-container-high rounded-xl text-sm font-bold focus:border-primary/40 outline-none"
                        />

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-on-surface-variant/60 uppercase tracking-widest ml-0.5">자료 링크 (URL)</label>
                          <input
                            type="text"
                            value={item.url || ''}
                            disabled={!!item.material_id}
                            onChange={e => setWeeklyPlan(prev => prev.map((p, i) => i === idx ? { ...p, url: e.target.value, material_id: '' } : p))}
                            placeholder={item.material_id ? '수업 자료 에디터 자료가 연결됨' : 'https://...'}
                            className={`w-full px-3.5 py-2 border rounded-xl text-sm font-bold outline-none transition-all ${
                              item.material_id
                                ? 'bg-surface-container border-surface-container-high text-on-surface-variant/40 cursor-not-allowed'
                                : 'bg-surface-container-low border-surface-container-high focus:border-primary/40'
                            }`}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-on-surface-variant/60 uppercase tracking-widest ml-0.5">
                            수업 자료 에디터 연결 {materials.length === 0 && <span className="normal-case font-bold">(등록된 자료 없음)</span>}
                          </label>
                          {item.material_id ? (
                            <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border-2 border-primary/20 rounded-xl">
                              <BookOpen size={13} className="text-primary shrink-0" />
                              <span className="text-sm font-black text-primary flex-1 truncate">
                                {materials.find(m => m.id === item.material_id)?.title || '선택된 자료'}
                              </span>
                              <button
                                type="button"
                                onClick={() => setWeeklyPlan(prev => prev.map((p, i) => i === idx ? { ...p, material_id: '' } : p))}
                                className="p-0.5 text-on-surface-variant/40 hover:text-red-500 transition-colors"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          ) : (
                            <div className="relative">
                              <button
                                type="button"
                                disabled={materials.length === 0}
                                onClick={() => setMaterialDropdownIdx(materialDropdownIdx === idx ? null : idx)}
                                className={`w-full flex items-center justify-between px-3.5 py-2 border rounded-xl text-sm font-bold transition-all ${
                                  materials.length === 0
                                    ? 'bg-surface-container border-surface-container-high text-on-surface-variant/30 cursor-not-allowed'
                                    : 'bg-surface-container-low border-surface-container-high hover:border-primary/40 cursor-pointer'
                                }`}
                              >
                                <span className="text-on-surface-variant/50">에디터 자료 선택...</span>
                                <ChevronDown size={13} className="text-on-surface-variant/40" />
                              </button>
                              {materialDropdownIdx === idx && materials.length > 0 && (
                                <div className="absolute top-full mt-1 left-0 right-0 bg-white rounded-xl shadow-xl border border-surface-container-high z-20 overflow-hidden max-h-48 overflow-y-auto">
                                  {materials.map(mat => (
                                    <button
                                      key={mat.id}
                                      type="button"
                                      onClick={() => {
                                        setWeeklyPlan(prev => prev.map((p, i) => i === idx ? { ...p, material_id: mat.id, url: '' } : p));
                                        setMaterialDropdownIdx(null);
                                      }}
                                      className="w-full text-left px-4 py-2.5 hover:bg-primary/5 transition-colors flex items-center gap-2"
                                    >
                                      {mat.week_number != null && (
                                        <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary text-[10px] font-black flex items-center justify-center shrink-0">
                                          {mat.week_number}
                                        </span>
                                      )}
                                      <span className="text-sm font-bold truncate">{mat.title}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end mt-3">
              <button
                type="button"
                onClick={handleSavePlan}
                disabled={planSaving}
                className="flex items-center gap-1.5 text-sm font-black px-5 py-2.5 bg-primary text-white rounded-xl hover:bg-primary-dim transition-all disabled:opacity-50"
              >
                {planSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {planSaving ? '저장 중...' : '주차별 계획 저장'}
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-black flex items-center gap-1.5"><Link2 size={14} /> 일반 자료 (링크)</h2>
              <button
                type="button"
                onClick={() => setShowAddGeneralForm(v => !v)}
                className="flex items-center gap-1 text-xs font-black px-3 py-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary hover:text-white transition-all"
              >
                <Plus size={13} /> 자료 추가
              </button>
            </div>

            {showAddGeneralForm && (
              <div className="surface-card p-4 border border-surface-container-high space-y-2.5 mb-3">
                <input
                  type="text"
                  value={generalMatForm.title}
                  onChange={e => setGeneralMatForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="자료 제목"
                  className="w-full px-3.5 py-2 bg-surface-container-low border border-surface-container-high rounded-xl text-sm font-bold focus:border-primary/40 outline-none"
                />
                <input
                  type="text"
                  value={generalMatForm.url}
                  onChange={e => setGeneralMatForm(f => ({ ...f, url: e.target.value }))}
                  placeholder="https://..."
                  className="w-full px-3.5 py-2 bg-surface-container-low border border-surface-container-high rounded-xl text-sm font-bold focus:border-primary/40 outline-none"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowAddGeneralForm(false); setGeneralMatForm({ title: '', url: '' }); }}
                    className="text-xs font-black px-3 py-2 text-on-surface-variant/60 hover:text-on-surface-variant transition-colors"
                  >취소</button>
                  <button
                    type="button"
                    onClick={handleAddGeneralMat}
                    disabled={generalMatSaving || !generalMatForm.title.trim() || !generalMatForm.url.trim()}
                    className="text-xs font-black px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary-dim transition-all disabled:opacity-50"
                  >{generalMatSaving ? '저장 중...' : '저장'}</button>
                </div>
              </div>
            )}

            {generalMaterials.length === 0 ? (
              <div className="surface-card p-6 text-center text-on-surface-variant/60 text-sm">
                등록된 일반 자료가 없습니다.
              </div>
            ) : (
              <div className="surface-card border border-surface-container-high divide-y divide-surface-container-high">
                {generalMaterials.map(m => (
                  <div key={m.id} className="flex items-center justify-between px-4 py-3 gap-3">
                    <a href={m.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 min-w-0 text-sm font-bold hover:text-primary transition-colors">
                      <Link2 size={13} className="text-on-surface-variant/40 shrink-0" />
                      <span className="truncate">{m.title}</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => handleDeleteGeneralMat(m.id)}
                      className="text-on-surface-variant/40 hover:text-red-500 transition-colors shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SchoolProjectClassDetailPage;
