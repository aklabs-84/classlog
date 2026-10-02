import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { filterMyTeachingClasses } from '../lib/projectClassFilter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar, ChevronDown, Search, Check, Sparkles, X, Save,
  PlusCircle, FileText, Bold, List, Paperclip, Pencil, Trash2,
  Loader2, Clock, BookOpen, User as UserIcon,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const ActivityLog = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // Form States
  const [activityTitle, setActivityTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('과제물');
  const [activityDate, setActivityDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [isSaving, setIsSaving] = useState(false);

  // 내 관찰 기록 목록
  const [myObs, setMyObs] = useState<any[]>([]);
  const [obsLoading, setObsLoading] = useState(false);
  const [editingObsId, setEditingObsId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ activity_name: '', category: '', content: '' });
  const [savingEditId, setSavingEditId] = useState<string | null>(null);
  const [deletingObsId, setDeletingObsId] = useState<string | null>(null);

  useEffect(() => {
    if (user?.id) {
      fetchInitialData();
      fetchMyObs();
    }
  }, [user?.id]);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const { data: rawClassesData } = await supabase
        .from('classes').select('*').eq('teacher_id', user?.id).order('name');
      const classesData = rawClassesData ? filterMyTeachingClasses(rawClassesData, user?.id) : rawClassesData;
      if (classesData) {
        setClasses(classesData);
        const requestedClassId = searchParams.get('classId');
        const requestedClass = requestedClassId && classesData.find(c => c.id === requestedClassId);
        const targetClass = requestedClass || classesData[0];
        if (targetClass) {
          setSelectedClassId(targetClass.id);
          fetchStudents(targetClass.id);
        }
      }
    } catch (error) {
      console.error('Error fetching initial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMyObs = async () => {
    setObsLoading(true);
    try {
      const { data } = await supabase
        .from('observations')
        .select('*, students(full_name, student_number, classes(name))')
        .eq('teacher_id', user?.id)
        .eq('is_student_record', false)
        .order('created_at', { ascending: false });
      setMyObs(data || []);
    } catch (err) {
      console.error('관찰 기록 조회 오류:', err);
    } finally {
      setObsLoading(false);
    }
  };

  const fetchStudents = async (classId: string) => {
    try {
      const { data } = await supabase
        .from('students')
        .select('id, full_name, student_number, observations(activity_name)')
        .eq('class_id', classId);
      if (data) {
        setStudents(data.map(s => ({
          id: s.id,
          name: s.full_name,
          number: s.student_number || '번호 없음',
          lastActivity: s.observations?.[0]?.activity_name || '미기록',
        })));
      }
    } catch (error) {
      console.error('Error fetching students:', error);
    }
  };

  const handleClassChange = (id: string) => {
    setSelectedClassId(id);
    fetchStudents(id);
    setSelectedStudents([]);
  };

  const toggleStudent = (id: string) => {
    setSelectedStudents(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const handleSave = async (goBack: boolean = false) => {
    if (selectedStudents.length === 0 || !activityTitle || !content) {
      alert('학생을 선택하고 활동 명칭 및 내용을 입력해 주세요.');
      return;
    }
    setIsSaving(true);
    try {
      const weeklyPlan: { week: number; topic: string }[] = classes.find(c => c.id === selectedClassId)?.weekly_plan || [];
      const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
      const matchedWeek = weeklyPlan.find(p => norm(p.topic) === norm(activityTitle))?.week ?? null;

      const observations = selectedStudents.map(studentId => ({
        teacher_id: user?.id,
        student_id: studentId,
        content,
        activity_name: activityTitle,
        category,
        is_student_record: false,
        week_number: matchedWeek,
      }));
      const { error } = await supabase.from('observations').insert(observations);
      if (error) throw error;

      // 폼 초기화 + 목록 갱신
      setActivityTitle('');
      setContent('');
      setCategory('과제물');
      setSelectedStudents([]);
      await fetchMyObs();

      if (goBack) navigate('/dashboard');
    } catch (error: any) {
      alert('저장 중 오류가 발생했습니다: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartEdit = (obs: any) => {
    setEditingObsId(obs.id);
    setEditForm({ activity_name: obs.activity_name || '', category: obs.category || '', content: obs.content || '' });
  };

  const handleSaveEdit = async (obsId: string) => {
    if (!editForm.activity_name.trim() || !editForm.content.trim()) return;
    setSavingEditId(obsId);
    try {
      const weeklyPlanEdit: { week: number; topic: string }[] = classes.find(c => c.id === selectedClassId)?.weekly_plan || [];
      const normEdit = (s: string) => s.replace(/\s+/g, '').toLowerCase();
      const editWeek = weeklyPlanEdit.find(p => normEdit(p.topic) === normEdit(editForm.activity_name.trim()))?.week ?? null;
      const { error } = await supabase.from('observations').update({
        activity_name: editForm.activity_name.trim(),
        category: editForm.category.trim(),
        content: editForm.content.trim(),
        week_number: editWeek,
      }).eq('id', obsId);
      if (error) throw error;
      setMyObs(prev => prev.map(o =>
        o.id === obsId ? { ...o, ...editForm } : o
      ));
      setEditingObsId(null);
    } catch (err) {
      console.error('수정 오류:', err);
    } finally {
      setSavingEditId(null);
    }
  };

  const handleDelete = async (obsId: string) => {
    if (!confirm('이 교사 메모를 삭제하시겠습니까?')) return;
    setDeletingObsId(obsId);
    try {
      const { error } = await supabase.from('observations').delete().eq('id', obsId);
      if (error) throw error;
      setMyObs(prev => prev.filter(o => o.id !== obsId));
    } catch (err) {
      console.error('삭제 오류:', err);
    } finally {
      setDeletingObsId(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-10"
    >
      <div className="px-2">
        <p className="text-primary font-bold text-xs uppercase tracking-widest mb-3">Activity Logging</p>
        <h1 className="text-2xl md:text-4xl font-extrabold font-manrope mb-4">교사 메모</h1>
        <p className="text-on-surface-variant text-base max-w-3xl leading-relaxed">
          수업 중 관찰된 학생들의 활동 내용과 성취도를 기록합니다. 기록된 내용은 AI 분석 및 생활기록부 초안 작성에 활용됩니다.
        </p>
      </div>

      {/* 입력 폼 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-10">
        <div className="col-span-12 lg:col-span-8 space-y-8">
          <div className="surface-card p-5 md:p-10 shadow-ambient space-y-6 md:space-y-10">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-8">
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider ml-1">Class Selection</label>
                <div className="relative">
                  <select
                    value={selectedClassId}
                    onChange={(e) => handleClassChange(e.target.value)}
                    className="w-full pl-4 pr-10 py-4 bg-surface-container rounded-xl text-sm font-bold appearance-none focus:ring-2 focus:ring-primary/20 transition-all"
                  >
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider ml-1">Subject</label>
                <div className="relative">
                  <select className="w-full pl-4 pr-10 py-4 bg-surface-container rounded-xl text-sm font-bold appearance-none focus:ring-2 focus:ring-primary/20 transition-all">
                    {classes.find(c => c.id === selectedClassId)?.subject
                      ? <option>{classes.find(c => c.id === selectedClassId)?.subject}</option>
                      : <option>과목 선택</option>}
                  </select>
                  <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-8">
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider ml-1">Activity Date</label>
                <div className="relative">
                  <input type="date" value={activityDate} onChange={e => setActivityDate(e.target.value)} className="w-full pl-4 pr-10 py-4 bg-surface-container rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all" />
                  <Calendar size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider ml-1">Category</label>
                <div className="flex gap-2 flex-wrap">
                  {['발표', '과제물', '토론', '실험'].map(cat => (
                    <button key={cat} onClick={() => setCategory(cat)}
                      className={`px-5 py-3.5 rounded-xl text-xs font-bold transition-all ${category === cat ? 'bg-primary-container text-primary shadow-sm' : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'}`}>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider ml-1">Activity Title</label>
              <input type="text" value={activityTitle} onChange={e => setActivityTitle(e.target.value)}
                placeholder="예: 고전 시가 현대적 재해석 프로젝트"
                className="w-full px-6 py-5 bg-surface-container rounded-2xl text-base font-medium focus:ring-2 focus:ring-primary/20 transition-all" />
            </div>
          </div>

          <div className="surface-card p-10 shadow-ambient border-l-4 border-primary/40">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-bold font-manrope flex items-center gap-3">
                <FileText size={22} className="text-primary" />
                Detailed Activity Observations
              </h2>
              <button className="flex items-center gap-2 px-5 py-2.5 bg-primary-container/40 text-primary rounded-xl text-[11px] font-black tracking-tighter hover:bg-primary-container/60 transition-all">
                <Sparkles size={16} /> AI로 관찰 내용 다듬기
              </button>
            </div>
            <div className="relative">
              <textarea value={content} onChange={e => setContent(e.target.value)}
                placeholder="학생들의 구체적인 활동 모습, 태도, 성취도 등을 입력하세요..."
                className="w-full min-h-[300px] p-8 bg-surface-container-low rounded-3xl text-base leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all resize-none" />
              <div className="absolute bottom-6 right-8 flex items-center gap-4 text-on-surface-variant/40">
                <button className="hover:text-primary transition-colors"><Bold size={20} /></button>
                <button className="hover:text-primary transition-colors"><List size={20} /></button>
                <button className="hover:text-primary transition-colors"><Paperclip size={20} /></button>
              </div>
            </div>
          </div>
        </div>

        {/* 학생 선택 패널 */}
        <div className="col-span-12 lg:col-span-4">
          <div className="surface-card p-8 shadow-ambient sticky top-30">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-bold font-manrope">학생 선택</h3>
              <span className="text-[11px] font-black bg-primary-container text-primary px-2 py-1 rounded-lg">{students.length}명</span>
            </div>
            <div className="relative mb-6 group">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors" />
              <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="이름으로 검색..."
                className="w-full pl-10 pr-4 py-3 bg-surface-container rounded-xl text-[13px] font-medium focus:ring-2 focus:ring-primary/20 transition-all" />
            </div>
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
              {loading ? (
                [1,2,3,4,5].map(i => <div key={i} className="h-[60px] bg-surface-container rounded-2xl animate-pulse" />)
              ) : students.length > 0 ? (
                students.filter(s => s.name.includes(searchQuery)).map(student => (
                  <button key={student.id} onClick={() => toggleStudent(student.id)}
                    className={`w-full p-4 rounded-2xl flex items-center gap-4 transition-all border-2 text-left ${
                      selectedStudents.includes(student.id)
                        ? 'bg-primary-container/10 border-primary shadow-sm'
                        : 'bg-surface-container-low border-transparent hover:bg-surface-container-high'}`}>
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${selectedStudents.includes(student.id) ? 'bg-primary border-primary' : 'border-on-surface-variant/20'}`}>
                      {selectedStudents.includes(student.id) && <Check size={14} className="text-white" />}
                    </div>
                    <div>
                      <p className="text-sm font-bold">{student.name} ({student.number})</p>
                      <p className="text-[11px] text-on-surface-variant">지난 활동: {student.lastActivity}</p>
                    </div>
                  </button>
                ))
              ) : (
                <p className="text-center text-xs text-on-surface-variant py-10">학생이 없습니다.</p>
              )}
            </div>
            <div className="mt-8 pt-8 border-t border-surface-container flex items-center justify-between">
              <p className="text-sm font-bold text-on-surface-variant">선택된 학생</p>
              <p className="text-lg font-black text-primary">{selectedStudents.length}명</p>
            </div>
          </div>
        </div>
      </div>

      {/* 저장 버튼 */}
      <div className="flex items-center justify-between p-8 pt-10 border-t border-surface-container-high">
        <button onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm font-bold text-on-surface-variant hover:text-on-surface transition-all px-6 py-3 rounded-xl hover:bg-surface-container">
          <X size={18} /> 작성 취소
        </button>
        <div className="flex items-center gap-4">
          <button disabled={isSaving} onClick={() => handleSave(false)}
            className="flex items-center gap-2 px-8 py-3.5 bg-primary-container text-primary rounded-xl font-bold text-sm hover:bg-primary-container/80 active:scale-95 transition-all disabled:opacity-50">
            <Save size={18} /> {isSaving ? '저장 중...' : '저장'}
          </button>
          <button disabled={isSaving} onClick={() => handleSave(true)}
            className="flex items-center gap-2 px-10 py-3.5 btn-gradient rounded-xl font-bold text-sm shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:opacity-50">
            <PlusCircle size={18} /> {isSaving ? '등록 중...' : '저장 후 대시보드로'}
          </button>
        </div>
      </div>

      {/* 내 관찰 기록 목록 */}
      <div className="space-y-6 pb-10">
        <div className="flex items-center justify-between px-2">
          <div>
            <p className="text-primary font-bold text-xs uppercase tracking-widest mb-1">My Records</p>
            <h2 className="text-xl font-extrabold font-manrope">내 교사 메모</h2>
          </div>
          <span className="text-[11px] font-black bg-surface-container text-on-surface-variant px-3 py-1.5 rounded-lg">
            총 {myObs.length}건
          </span>
        </div>

        {obsLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-24 bg-surface-container rounded-2xl animate-pulse" />)}
          </div>
        ) : myObs.length === 0 ? (
          <div className="p-12 text-center border-2 border-dashed border-neutral-200 rounded-3xl">
            <BookOpen size={32} className="mx-auto mb-3 text-neutral-300" />
            <p className="text-sm font-bold text-neutral-400">아직 작성된 교사 메모가 없습니다.</p>
            <p className="text-xs text-neutral-300 mt-1">위 폼을 통해 첫 번째 교사 메모를 작성해보세요.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {myObs.map(obs => {
                const isEditing = editingObsId === obs.id;
                const isDeleting = deletingObsId === obs.id;
                return (
                  <motion.div
                    key={obs.id}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="surface-card p-6 shadow-soft group"
                  >
                    {isEditing ? (
                      /* 인라인 수정 폼 */
                      <div className="space-y-3">
                        <div className="flex gap-3">
                          <input value={editForm.activity_name} onChange={e => setEditForm(p => ({ ...p, activity_name: e.target.value }))}
                            className="flex-1 px-4 py-2.5 bg-surface-container rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20" />
                          <div className="flex gap-1.5">
                            {['발표','과제물','토론','실험'].map(cat => (
                              <button key={cat} onClick={() => setEditForm(p => ({ ...p, category: cat }))}
                                className={`px-3 py-2 rounded-lg text-[10px] font-black transition-all ${editForm.category === cat ? 'bg-primary-container text-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
                                {cat}
                              </button>
                            ))}
                          </div>
                        </div>
                        <textarea value={editForm.content} onChange={e => setEditForm(p => ({ ...p, content: e.target.value }))}
                          rows={3} className="w-full px-4 py-3 bg-surface-container rounded-xl text-sm font-medium resize-none focus:outline-none focus:ring-2 focus:ring-primary/20" />
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setEditingObsId(null)}
                            className="px-4 py-2 text-xs font-black text-on-surface-variant bg-surface-container hover:bg-surface-container-high rounded-lg transition-all">
                            취소
                          </button>
                          <button onClick={() => handleSaveEdit(obs.id)} disabled={savingEditId === obs.id}
                            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-xs font-black disabled:opacity-50 hover:bg-primary/80 transition-all">
                            {savingEditId === obs.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} 저장
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* 일반 카드 */
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0 mt-0.5">
                          <UserIcon size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-sm font-black text-on-surface">{obs.students?.full_name}</span>
                            <span className="text-[10px] font-bold text-on-surface-variant/50">{obs.students?.classes?.name}</span>
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-black rounded border border-emerald-200">선생님 관찰</span>
                            {obs.category && (
                              <span className="px-2 py-0.5 bg-surface-container text-on-surface-variant/60 text-[10px] font-black rounded border border-neutral-200 uppercase tracking-widest">{obs.category}</span>
                            )}
                          </div>
                          <p className="text-sm font-black text-on-surface mb-1">{obs.activity_name}</p>
                          <p className="text-xs font-medium text-on-surface/60 line-clamp-2 leading-relaxed">{obs.content}</p>
                          <div className="flex items-center gap-1 mt-2 text-[10px] font-bold text-on-surface-variant/40">
                            <Clock size={10} />
                            {new Date(obs.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                          </div>
                        </div>
                        {/* 수정/삭제 (호버 시 표시) */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button onClick={() => handleStartEdit(obs)} title="수정"
                            className="w-8 h-8 rounded-lg bg-surface-container hover:bg-primary/10 hover:text-primary flex items-center justify-center text-on-surface-variant transition-all">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => handleDelete(obs.id)} disabled={isDeleting} title="삭제"
                            className="w-8 h-8 rounded-lg bg-surface-container hover:bg-error/10 hover:text-error flex items-center justify-center text-on-surface-variant transition-all disabled:opacity-50">
                            {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                          </button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default ActivityLog;
