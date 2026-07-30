import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import {
  Users,
  BookOpen,
  LayoutDashboard,
  Search,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  ArrowLeftRight,
  UserPlus,
  Plus,
  Check,
  Pencil,
  X,
  Save,
  Maximize2,
  CheckCheck,
  Clock as ClockIcon,
  BarChart2,
  ChevronDown,
  ChevronUp,
  Trash2,
  KeyRound,
  Eye,
  EyeOff,
  Megaphone,
  SlidersHorizontal,
} from 'lucide-react';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';

interface HomeroomDashboardProps {
  classInfo: any;
  students: any[];
  onInviteTeachers: () => void;
  onSelectStudent: (id: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  copySuccess: boolean;
  onCopyCode: () => void;
  selectedIds: string[];
  onSelectStudentToggle: (id: string) => void;
  onSelectAll: (isSelect: boolean) => void;
  onAddStudent: () => void;
  linkedClasses: any[];
  onSelectClass: (id: string) => void;
  onEditStudent: (id: string, number: string, name: string) => Promise<void>;
  onDeleteStudent: (id: string) => void;
  onBulkApprove: () => void;
  onResetPin: (id: string) => void;
  groupMap?: Record<string, { name: string; color: string }>;
}

const HomeroomDashboard = ({
  classInfo,
  students,
  onInviteTeachers,
  onSelectStudent: onNavigateToStudent,
  searchQuery,
  setSearchQuery,
  copySuccess,
  onCopyCode,
  selectedIds,
  onSelectStudentToggle,
  onSelectAll,
  onAddStudent,
  linkedClasses,
  onSelectClass: _onSelectClass,
  onEditStudent,
  onDeleteStudent,
  onBulkApprove,
  onResetPin,
  groupMap = {},
}: HomeroomDashboardProps) => {
  const navigate = useNavigate();
  const isAllSelected = students.length > 0 && selectedIds.length === students.length;
  const filteredStudents = students.filter(s =>
    s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.number?.toString().includes(searchQuery.toLowerCase())
  );

  const [showCodeModal, setShowCodeModal] = useState(false);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setShowCodeModal(false); setShowFullscreen(false); }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [activityTab, setActivityTab] = useState<'obs' | 'results'>('obs');
  const [mobileStatusTab, setMobileStatusTab] = useState<'submitted' | 'notSubmitted'>('submitted');

  // ── 주차별 제출 통계 ──
  const HOMEROOM_COL_DEFAULTS = { number: true, group: true, linkedSubjects: true, approval: true };
  const HOMEROOM_COL_LABELS: Record<string, string> = {
    number: '번호 (NO.)',
    group: '지정 조',
    linkedSubjects: '연동 과목',
    approval: '승인 현황',
  };
  const { visibility: colVis, toggle: toggleCol, reset: resetCols } = useColumnVisibility(
    'scholar_col_homeroom',
    HOMEROOM_COL_DEFAULTS
  );
  const [showColDropdown, setShowColDropdown] = useState(false);

  const [showStats, setShowStats] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [selectedStatsWeek, setSelectedStatsWeek] = useState<number | null>(null);
  const [rawObs, setRawObs] = useState<Array<{created_at: string, student_id: string, activity_name: string}>>([]);
  const [rawResults, setRawResults] = useState<Array<{created_at: string, student_id: string, week_number: number | null}>>([]);
  const [suggestionCounts, setSuggestionCounts] = useState<Record<string, number>>({});

  // 주차 목록: weekly_plan + 실제 제출된 주차 union
  const weeklyPlan: {week: number, topic: string}[] = classInfo?.weekly_plan || [];
  const submittedWeekNums = [...new Set(rawResults.map(r => r.week_number).filter((w): w is number => w !== null))];
  const statsWeeks = [...new Set([...weeklyPlan.map(p => p.week), ...submittedWeekNums])].sort((a, b) => a - b);

  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

  const _getSubmittedOnWeek = (week: number | null): Set<string> => {
    if (week === null) return new Set();
    const weekTopic = weeklyPlan.find(p => p.week === week)?.topic;
    const resultIds = rawResults.filter(r => r.week_number === week).map(r => r.student_id);
    const obsIds = weekTopic ? rawObs.filter(r => norm(r.activity_name) === norm(weekTopic)).map(r => r.student_id) : [];
    return new Set([...resultIds, ...obsIds]);
  };
  void _getSubmittedOnWeek;

  const getObsOnWeek = (week: number | null): Set<string> => {
    if (week === null) return new Set();
    const weekTopic = weeklyPlan.find(p => p.week === week)?.topic;
    if (!weekTopic) return new Set();
    return new Set(rawObs.filter(r => norm(r.activity_name) === norm(weekTopic)).map(r => r.student_id));
  };
  const getResultsOnWeek = (week: number | null): Set<string> =>
    week === null ? new Set() : new Set(rawResults.filter(r => r.week_number === week).map(r => r.student_id));

  const obsOnWeek = getObsOnWeek(selectedStatsWeek);
  const resultsOnWeek = getResultsOnWeek(selectedStatsWeek);

  useEffect(() => {
    const fetchActivityStats = async () => {
      if (!classInfo?.id || students.length === 0) return;
      setStatsLoading(true);
      try {
        const studentIds = students.map((s: any) => s.id);
        // 담임반: 학생ID 기반으로 모든 교과 결과 조회
        const [obsRes, resultsRes, suggRes] = await Promise.all([
          supabase.from('observations').select('created_at, student_id, activity_name').in('student_id', studentIds).eq('is_student_record', true),
          supabase.from('student_results').select('created_at, student_id, week_number').in('student_id', studentIds),
          supabase.from('student_suggestions').select('student_id').in('student_id', studentIds).is('teacher_reply', null),
        ]);
        setRawObs(obsRes.data || []);
        setRawResults(resultsRes.data || []);
        const counts: Record<string, number> = {};
        (suggRes.data || []).forEach((r: { student_id: string }) => {
          counts[r.student_id] = (counts[r.student_id] || 0) + 1;
        });
        setSuggestionCounts(counts);
      } catch (err) {
        console.error('fetchActivityStats error:', err);
      } finally {
        setStatsLoading(false);
      }
    };
    fetchActivityStats();
  }, [classInfo?.id, students.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showActivityModal) {
        setShowActivityModal(false);
        setSelectedActivityWeek(null);
        setActivityTab('obs');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showActivityModal]);

  const [selectedActivityWeek, setSelectedActivityWeek] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNumber, setEditNumber] = useState('');
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [pinPopupId, setPinPopupId] = useState<string | null>(null);

  const handleStartEdit = (e: React.MouseEvent, s: any) => {
    e.stopPropagation();
    setEditingId(s.id);
    setEditNumber(s.number === '-' ? '' : s.number.toString());
    setEditName(s.name);
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const handleSaveEdit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editingId) return;
    setSaving(true);
    await onEditStudent(editingId, editNumber, editName);
    setSaving(false);
    setEditingId(null);
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 }
  };

  return (
    <>
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-12 font-pretendard"
    >
      {/* 1. Header Section */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-4 py-2">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-[0.12em] bg-primary/10 text-primary border border-primary/20 whitespace-nowrap">
              Homeroom Dashboard
            </span>
            {classInfo?.linked_class_id && (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-secondary/10 text-secondary border border-secondary/20 rounded-full text-xs font-black uppercase tracking-[0.12em] whitespace-nowrap">
                <ArrowLeftRight size={10} /> Live Synced
              </span>
            )}
          </div>
          <div className="flex flex-col">
            <h1 className="text-3xl md:text-4xl font-black tracking-tightest leading-tight">
              <span className="gradient-text">{classInfo?.name}</span>
            </h1>
            <p className="text-on-surface-variant font-bold text-base mt-1 tracking-tight">담임 학급 관리 시스템</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => navigate(`/suggestions?classId=${classInfo.id}`)}
            className="relative flex items-center gap-2 px-4 py-3 rounded-2xl font-black text-sm border-2 border-rose-200 text-rose-500 hover:bg-rose-50 transition-all whitespace-nowrap"
          >
            <Megaphone size={16} />
            <span>질문·건의함</span>
            {Object.values(suggestionCounts).reduce((a, b) => a + b, 0) > 0 && (
              <span className="absolute -top-2 -right-2 bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {Object.values(suggestionCounts).reduce((a, b) => a + b, 0)}
              </span>
            )}
          </button>
          <button
            onClick={onInviteTeachers}
            className="btn-vibrant group px-4 py-3 rounded-2xl font-black text-sm flex items-center gap-2 transition-all whitespace-nowrap"
          >
            <UserPlus size={16} className="group-hover:rotate-12 transition-transform" />
            <span>선생님 초대</span>
          </button>
        </div>
      </header>

      {/* 2. Bento Grid Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 px-4">
        <motion.div variants={itemVariants} className="layered-card p-6 flex flex-col justify-between min-h-[200px] group relative overflow-hidden">
          <div className="absolute -top-8 -left-8 w-32 h-32 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors" />
          <div className="flex items-center justify-between relative z-10">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary group-hover:scale-110 transition-transform shadow-sm"><Users size={20} /></div>
            <span className="text-xs font-black text-on-surface-variant/75 tracking-[0.12em] uppercase">전체 학생</span>
          </div>
          <div className="relative z-10">
            <h3 className="text-4xl font-black tracking-tighter">{students.length}<span className="text-base ml-1.5 opacity-70">명</span></h3>
            <p className="text-xs font-bold text-on-surface-variant/75 uppercase tracking-wide">학급 전체 인원</p>
          </div>
        </motion.div>

        <motion.div
          variants={itemVariants}
          onClick={() => setShowActivityModal(true)}
          className="layered-card p-6 flex flex-col justify-between min-h-[200px] group relative overflow-hidden cursor-pointer hover:shadow-lg hover:border-secondary/30 transition-all"
        >
          <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-secondary/5 rounded-full blur-3xl group-hover:bg-secondary/10 transition-colors" />
          <div className="flex items-center justify-between relative z-10">
            <div className="w-10 h-10 bg-secondary/10 rounded-xl flex items-center justify-center text-secondary group-hover:scale-110 transition-transform shadow-sm"><BookOpen size={20} /></div>
            <span className="text-xs font-black text-on-surface-variant/75 tracking-[0.12em] uppercase">활동 참여율</span>
          </div>
          <div className="relative z-10">
            <h3 className="text-4xl font-black tracking-tighter">
              {students.filter(s => s.activity && s.activity !== '기록 없음').length}<span className="text-base ml-1.5 opacity-70">명</span>
            </h3>
            <p className="text-xs font-bold text-on-surface-variant/75 uppercase tracking-wide">최근 활동 참여</p>
            <p className="text-xs font-black text-secondary/75 mt-1 uppercase tracking-widest group-hover:text-secondary transition-colors">클릭하여 현황 보기 →</p>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="layered-card p-6 col-span-1 md:col-span-2 flex flex-col justify-between min-h-[200px] group relative overflow-hidden border-primary/5 bg-gradient-to-br from-white via-white to-primary/5">
          <div className="absolute -top-10 -right-10 text-primary/5 group-hover:scale-110 transition-all duration-1000"><Sparkles size={200} /></div>
          <div className="flex items-center justify-between relative z-10">
            <div className="w-10 h-10 bg-accent/10 rounded-xl flex items-center justify-center text-accent shadow-sm"><CheckCircle2 size={20} /></div>
            <button
              onClick={() => { onCopyCode(); setShowCodeModal(true); }}
              className="px-6 py-2.5 bg-on-surface text-surface rounded-xl text-[10px] font-black uppercase tracking-[0.12em] hover:bg-primary transition-all shadow-soft active:scale-95"
            >
              {copySuccess ? 'Copied! ✨' : `Code: ${classInfo.entry_code}`}
            </button>
          </div>
          <div className="relative z-10 space-y-2 max-w-sm">
             <p className="text-sm font-bold text-on-surface leading-snug">
               학생들에게 참여 코드를 공유하여 <span className="text-primary font-black underline decoration-primary/20 underline-offset-4">수업 기록</span>을 시작하세요.
             </p>
             <p className="text-xs font-black text-on-surface-variant/75 tracking-[0.12em] uppercase">학생 전용 입장 코드</p>
          </div>
        </motion.div>
      </div>

      {/* 3. Student Data Center - Full Width */}
      <section className="px-4 pb-16">
        <div className="layered-card p-8 bg-white flex flex-col">
           <div className="flex flex-col gap-4 mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-xl md:text-2xl font-black flex items-center gap-3 tracking-tight">
                    <div className="w-9 h-9 md:w-10 md:h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary shrink-0"><LayoutDashboard size={18} /></div>
                    학급 데이터 센터
                  </h2>
                  <p className="text-xs font-bold text-on-surface-variant/60 ml-12">실시간 연동 데이터 기반 학생 프로필</p>
                </div>
                {/* 전체화면 버튼 — 오른쪽 상단 */}
                <button
                  onClick={() => setShowFullscreen(true)}
                  className="self-start sm:self-auto p-3 rounded-2xl border-2 border-neutral-200 hover:border-primary/40 hover:bg-primary/5 text-neutral-400 hover:text-primary transition-all"
                  title="전체화면으로 보기"
                >
                  <Maximize2 size={18} />
                </button>
              </div>

              {/* 검색 + 액션 버튼 — 모바일 세로 스택 */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative group flex-1">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-primary transition-colors" />
                  <input
                    type="text"
                    placeholder="학생 검색..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="bg-white border-2 border-neutral-200 hover:border-neutral-300 focus:border-primary/40 text-sm font-bold text-neutral-900 outline-none pl-10 pr-4 py-3 rounded-2xl w-full transition-all placeholder:text-neutral-400 shadow-sm"
                  />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {(() => {
                    const pendingCount = students.reduce((acc, s) => acc + (s.pending_obs_ids?.length || 0), 0);
                    return pendingCount > 0 ? (
                      <button
                        onClick={onBulkApprove}
                        className="flex items-center gap-2 px-4 py-3 rounded-2xl font-black text-sm bg-amber-50 border-2 border-amber-200 text-amber-700 hover:bg-amber-100 transition-all whitespace-nowrap"
                      >
                        <CheckCheck size={15} />
                        <span>일괄 승인</span>
                        <span className="bg-amber-200 text-amber-800 text-[10px] font-black px-1.5 py-0.5 rounded-lg">{pendingCount}</span>
                      </button>
                    ) : null;
                  })()}
                  <div className="relative">
                    <button
                      onClick={() => setShowColDropdown(v => !v)}
                      className={`w-10 h-10 bg-white border-2 rounded-2xl flex items-center justify-center transition-all shadow-soft shrink-0 ${showColDropdown ? 'border-primary text-primary' : 'border-neutral-200 text-on-surface-variant/60 hover:border-primary/40 hover:text-primary'}`}
                      title="컬럼 표시 설정"
                    >
                      <SlidersHorizontal size={16} />
                    </button>
                    {showColDropdown && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowColDropdown(false)} />
                        <div className="absolute top-full right-0 mt-2 z-50 bg-white rounded-2xl shadow-xl border border-neutral-100 p-4 min-w-[180px]">
                          <p className="text-xs font-black text-neutral-600 uppercase tracking-widest mb-3">컬럼 표시 설정</p>
                          <div className="space-y-1">
                            {Object.entries(HOMEROOM_COL_LABELS).map(([key, label]) => (
                              <label
                                key={key}
                                onClick={() => toggleCol(key)}
                                className="flex items-center gap-2.5 py-1.5 px-1 rounded-lg cursor-pointer hover:bg-neutral-50 group"
                              >
                                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all shrink-0 ${colVis[key] ? 'bg-primary border-primary' : 'border-neutral-300'}`}>
                                  {colVis[key] && <Check size={10} className="text-white" strokeWidth={3.5} />}
                                </div>
                                <span className="text-sm font-bold text-neutral-700 group-hover:text-primary transition-colors">{label}</span>
                              </label>
                            ))}
                          </div>
                          <button
                            onClick={resetCols}
                            className="mt-3 w-full text-xs font-black text-neutral-500 hover:text-neutral-700 transition-colors text-center py-1.5 rounded-lg hover:bg-neutral-50"
                          >
                            기본값으로 초기화
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    onClick={onAddStudent}
                    className="btn-vibrant group flex items-center gap-2 px-4 py-3 rounded-2xl font-black text-sm transition-all whitespace-nowrap flex-1 sm:flex-none justify-center"
                  >
                    <Plus size={16} className="group-hover:rotate-90 transition-transform duration-500" />
                    <span>학생 등록</span>
                  </button>
                </div>
              </div>
           </div>

           {/* ── 주차별 제출 현황 통계 ── */}
           <div className="mb-6 rounded-2xl border border-neutral-100 bg-neutral-50/60 overflow-hidden">
             <button
               onClick={() => setShowStats(v => !v)}
               className="w-full flex items-center justify-between px-6 py-4 hover:bg-neutral-100/60 transition-colors"
             >
               <div className="flex items-center gap-3">
                 <div className="w-7 h-7 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                   <BarChart2 size={14} />
                 </div>
                 <span className="text-sm font-black text-on-surface">주차별 제출 현황</span>
                 {statsWeeks.length > 0 && (
                   <span className="text-[10px] font-bold text-on-surface-variant/50 bg-white px-2 py-0.5 rounded-md border border-neutral-200">
                     총 {statsWeeks.length}주차
                   </span>
                 )}
                 {selectedStatsWeek !== null && (
                   <span className="text-[10px] font-black text-primary bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20">
                     {selectedStatsWeek}주차 선택됨
                   </span>
                 )}
               </div>
               {showStats ? <ChevronUp size={16} className="text-on-surface-variant/70" /> : <ChevronDown size={16} className="text-on-surface-variant/70" />}
             </button>

             {showStats && (
               <div className="px-6 pb-5">
                 {statsLoading ? (
                   <div className="flex items-center justify-center py-6 text-on-surface-variant/70">
                     <span className="text-xs font-bold">불러오는 중...</span>
                   </div>
                 ) : statsWeeks.length === 0 ? (
                   <div className="text-center py-6 text-on-surface-variant/70">
                     <p className="text-xs font-black">등록된 주차 계획이 없습니다. 학급 설정에서 주차별 계획을 추가해 주세요.</p>
                   </div>
                 ) : (
                   <div className="space-y-4">
                     {/* 주차 칩 */}
                     <div className="flex items-center gap-2 flex-wrap">
                       {statsWeeks.map(week => {
                         const topic = weeklyPlan.find(p => p.week === week)?.topic;
                         const weekResultCount = getObsOnWeek(week).size;
                         const isSelected = selectedStatsWeek === week;
                         return (
                           <button
                             key={week}
                             onClick={() => setSelectedStatsWeek(isSelected ? null : week)}
                             className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all border ${
                               isSelected
                                 ? 'bg-primary text-white border-primary shadow-sm'
                                 : 'bg-white text-neutral-400 border-neutral-200 hover:border-primary/40 hover:text-primary'
                             }`}
                           >
                             <span>{week}주차</span>
                             {topic && <span className={`text-[11px] ${isSelected ? 'text-white/90' : 'text-neutral-500'}`}>· {topic}</span>}
                             {weekResultCount > 0 && (
                               <span className={`ml-0.5 px-1.5 py-0.5 rounded-md text-[11px] font-black ${isSelected ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'}`}>
                                 {weekResultCount}
                               </span>
                             )}
                           </button>
                         );
                       })}
                     </div>

                     {/* 선택 주차 요약 */}
                     {selectedStatsWeek !== null ? (
                       <div className="flex items-center gap-3 flex-wrap">
                         <div className="flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-black bg-emerald-50 border-emerald-100 text-emerald-700">
                           <span>📋 제출완료</span>
                           <span className="text-base font-black">{obsOnWeek.size}</span>
                           <span className="font-bold opacity-60">명</span>
                         </div>
                         <p className="text-xs font-bold text-on-surface-variant/70 ml-1">아래 표에서 주차별 결과 제출 현황을 확인하세요</p>
                       </div>
                     ) : (
                       <p className="text-xs font-bold text-on-surface-variant/70">주차를 선택하면 해당 주차 결과 제출 현황이 아래 표에 표시됩니다.</p>
                     )}
                   </div>
                 )}
               </div>
             )}
           </div>

           {/* ── 모바일 카드 뷰 (md 미만) ── */}
           <div className="md:hidden space-y-3">
             {filteredStudents.length === 0 ? (
               <div className="text-center py-16 text-on-surface-variant/70 font-bold">학생이 없습니다</div>
             ) : filteredStudents.map((s) => {
               const approvalStatus = (!s.activity || s.activity === '기록 없음')
                 ? 'none'
                 : s.pending_obs_ids?.length > 0 ? 'pending' : 'done';
               return (
                 <motion.div
                   key={s.id}
                   initial={{ opacity: 0, y: 10 }}
                   animate={{ opacity: 1, y: 0 }}
                   onClick={() => onNavigateToStudent(s.id)}
                   className={`bg-white rounded-2xl border border-neutral-100 shadow-sm p-4 cursor-pointer hover:bg-primary/[0.02] transition-all ${selectedIds.includes(s.id) ? 'ring-2 ring-primary/30' : ''}`}
                 >
                   {/* 카드 헤더 */}
                   <div className="flex items-center justify-between gap-2">
                     <div className="flex items-center gap-3 min-w-0" onClick={(e) => e.stopPropagation()}>
                       <label className="flex items-center cursor-pointer shrink-0">
                         <input type="checkbox" className="hidden" checked={selectedIds.includes(s.id)} onChange={() => onSelectStudentToggle(s.id)} />
                         <div className={`w-5 h-5 rounded-md border-2 transition-all flex items-center justify-center ${selectedIds.includes(s.id) ? 'bg-primary border-primary' : 'border-neutral-300'}`}>
                           {selectedIds.includes(s.id) && <Check size={12} className="text-white" strokeWidth={4} />}
                         </div>
                       </label>
                       {s.number !== '-' && (
                         <span className="text-xs font-black text-on-surface-variant/70 shrink-0 w-6">
                           {s.number?.toString().padStart(2, '0')}
                         </span>
                       )}
                       <div className="min-w-0">
                         <p className="text-sm font-black text-on-surface truncate">{s.name}</p>
                         <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                           <span className="text-xs font-bold text-on-surface-variant/70">{s.tag || '학생'}</span>
                           {colVis.group && groupMap[s.id] && (
                             <span
                               className="text-[9px] font-black px-1.5 py-0.5 rounded-md text-white"
                               style={{ backgroundColor: groupMap[s.id].color }}
                             >
                               {groupMap[s.id].name}
                             </span>
                           )}
                           {suggestionCounts[s.id] > 0 && (
                             <span className="text-[8px] font-black text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">💬 {suggestionCounts[s.id]}</span>
                           )}
                         </div>
                       </div>
                     </div>
                     <div className="shrink-0 flex items-center gap-2">
                       {approvalStatus === 'pending' && (
                         <span className="text-xs font-black px-2 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-300 whitespace-nowrap">⏳ 대기</span>
                       )}
                       {approvalStatus === 'done' && (
                         <span className="text-xs font-black px-2 py-1 rounded-lg bg-secondary/10 text-secondary border border-secondary/30 whitespace-nowrap">✅ 완료</span>
                       )}
                       <button
                         onClick={(e) => { e.stopPropagation(); onNavigateToStudent(s.id); }}
                         className="p-1.5 rounded-lg hover:bg-primary/10 text-on-surface-variant/70 hover:text-primary transition-all"
                       >
                         <ArrowRight size={14} />
                       </button>
                     </div>
                   </div>

                   {/* 주차별 현황 */}
                   {statsWeeks.length > 0 && (
                     <div className="mt-3 pt-3 border-t border-neutral-100 space-y-1.5">
                       {statsWeeks.map(w => {
                         const hasObs = getObsOnWeek(w).has(s.id);
                         const hasResult = getResultsOnWeek(w).has(s.id);
                         const topic = weeklyPlan.find(p => p.week === w)?.topic;
                         return (
                           <div key={w} className="flex items-center gap-2">
                             <span className="text-xs font-black text-on-surface-variant/75 w-10 shrink-0">{w}주차</span>
                             {topic && <span className="text-xs font-bold text-on-surface-variant/70 truncate flex-1 min-w-0">{topic}</span>}
                             <div className="flex items-center gap-1.5 shrink-0">
                               <span className={`text-[11px] font-black px-1.5 py-0.5 rounded-md border ${hasObs ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-neutral-100 text-neutral-500 border-neutral-200'}`}>
                                 📝 {hasObs ? '제출' : '미제출'}
                               </span>
                               <span className={`text-[11px] font-black px-1.5 py-0.5 rounded-md border ${hasResult ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-neutral-100 text-neutral-500 border-neutral-200'}`}>
                                 📁 {hasResult ? '제출' : '미제출'}
                               </span>
                             </div>
                           </div>
                         );
                       })}
                     </div>
                   )}

                   {/* 관리 버튼 */}
                   <div className="mt-3 pt-3 border-t border-neutral-100 flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                     <button onClick={(e) => { e.stopPropagation(); handleStartEdit(e, s); }} className="p-2 hover:bg-primary/10 text-neutral-400 hover:text-primary transition-all rounded-lg"><Pencil size={14} /></button>
                     <button onClick={(e) => { e.stopPropagation(); onDeleteStudent(s.id); }} className="p-2 hover:bg-error/10 text-neutral-400 hover:text-error transition-all rounded-lg"><Trash2 size={14} /></button>
                     <button onClick={(e) => { e.stopPropagation(); onResetPin(s.id); }} className="p-2 hover:bg-violet-50 text-neutral-400 hover:text-violet-500 transition-all rounded-lg"><KeyRound size={14} /></button>
                   </div>
                 </motion.div>
               );
             })}
           </div>

           {/* ── 데스크탑 테이블 (md 이상) ── */}
           <div className="hidden md:block overflow-x-auto bg-white rounded-3xl border border-neutral-100 shadow-sm">
             <table className="w-full text-left border-collapse min-w-[700px]">
               <thead className="sticky top-0 z-10">
                 <tr className="bg-neutral-50 border-b border-neutral-100">
                   <th className="p-4 lg:p-6 text-center w-12 lg:w-16 whitespace-nowrap">
                     <label className="flex items-center justify-center cursor-pointer">
                       <input
                         type="checkbox"
                         className="hidden"
                         checked={isAllSelected}
                         onChange={(e) => onSelectAll(e.target.checked)}
                       />
                       <div className={`w-5 h-5 rounded-md border-2 transition-all flex items-center justify-center ${isAllSelected ? 'bg-primary border-primary' : 'border-neutral-300'}`}>
                         {isAllSelected && <Check size={14} className="text-white" strokeWidth={4} />}
                       </div>
                     </label>
                   </th>
                   {colVis.number && (
                     <th className="p-4 lg:p-6 text-[11px] lg:text-[13px] font-black text-on-surface/80 uppercase tracking-widest whitespace-nowrap hidden sm:table-cell">NO.</th>
                   )}
                   <th className="p-4 lg:p-6 text-[11px] lg:text-[13px] font-black text-on-surface/80 uppercase tracking-widest whitespace-nowrap">학생 정보</th>
                   {colVis.linkedSubjects && (
                     <th className="p-4 lg:p-6 text-[11px] lg:text-[13px] font-black text-on-surface/80 uppercase tracking-widest text-center whitespace-nowrap hidden lg:table-cell">연동 과목</th>
                   )}
                   {colVis.approval && (
                     <th className="p-4 lg:p-6 text-[11px] lg:text-[13px] font-black text-on-surface/80 uppercase tracking-widest text-center whitespace-nowrap">승인</th>
                   )}
                   {selectedStatsWeek !== null && (
                     <>
                       <th className="p-4 lg:p-6 text-[11px] lg:text-[13px] font-black text-violet-600/80 uppercase tracking-widest text-center whitespace-nowrap">
                         {selectedStatsWeek}주차 활동 기록
                       </th>
                       <th className="p-4 lg:p-6 text-[11px] lg:text-[13px] font-black text-emerald-600/80 uppercase tracking-widest text-center whitespace-nowrap">
                         {selectedStatsWeek}주차 결과제출
                       </th>
                     </>
                   )}
                   <th className="p-4 lg:p-6 text-[11px] lg:text-[13px] font-black text-on-surface/80 uppercase tracking-widest text-right pr-8 lg:pr-12 whitespace-nowrap">관리</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-neutral-100">
                 {filteredStudents.length > 0 ? (
                   filteredStudents.map((s) => {
                     const isEditing = editingId === s.id;
                     return (
                       <motion.tr
                         key={s.id}
                         layout
                         onClick={() => !isEditing && onNavigateToStudent(s.id)}
                         className={`group hover:bg-neutral-50/50 transition-all ${isEditing ? 'bg-primary/[0.02] cursor-default' : 'cursor-pointer'} ${selectedIds.includes(s.id) ? 'bg-primary/[0.03]' : ''}`}
                       >
                         <td className="p-3 lg:p-6 text-center" onClick={(e) => e.stopPropagation()}>
                           <label className="flex items-center justify-center cursor-pointer">
                             <input
                               type="checkbox"
                               className="hidden"
                               checked={selectedIds.includes(s.id)}
                               onChange={() => onSelectStudentToggle(s.id)}
                             />
                             <div className={`w-5 h-5 rounded-md border-2 transition-all flex items-center justify-center ${selectedIds.includes(s.id) ? 'bg-primary border-primary' : 'border-neutral-300 group-hover:border-primary/40'}`}>
                               {selectedIds.includes(s.id) && <Check size={14} className="text-white" strokeWidth={4} />}
                             </div>
                           </label>
                         </td>

                         {/* NO. 셀 */}
                         {colVis.number && (
                           <td className="p-3 lg:p-6 w-20 lg:w-24 hidden sm:table-cell" onClick={(e) => isEditing && e.stopPropagation()}>
                             {isEditing ? (
                               <input
                                 type="text"
                                 value={editNumber}
                                 onChange={(e) => setEditNumber(e.target.value)}
                                 onClick={(e) => e.stopPropagation()}
                                 placeholder="번호"
                                 className="w-16 px-3 py-2 bg-white border-2 border-primary/30 rounded-xl text-sm font-black text-primary focus:outline-none focus:border-primary"
                               />
                             ) : (
                               <span className="font-manrope font-black text-on-surface-variant/60 group-hover:text-primary transition-colors text-lg">
                                 {s.number === '-' ? <span className="text-neutral-500 text-sm">미입력</span> : s.number.toString().padStart(2, '0')}
                               </span>
                             )}
                           </td>
                         )}

                         {/* 학생 정보 셀 */}
                         <td className="p-3 lg:p-6" onClick={(e) => isEditing && e.stopPropagation()}>
                           {isEditing ? (
                             <input
                               type="text"
                               value={editName}
                               onChange={(e) => setEditName(e.target.value)}
                               onClick={(e) => e.stopPropagation()}
                               placeholder="이름"
                               className="w-40 px-3 py-2 bg-white border-2 border-primary/30 rounded-xl text-sm font-black focus:outline-none focus:border-primary"
                             />
                           ) : (
                             <div className="flex items-center gap-3 lg:gap-4">
                               <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-lg flex items-center justify-center bg-primary/5 text-primary/40 shrink-0 shadow-sm border border-primary/10 group-hover:bg-primary/10 group-hover:text-primary transition-all overflow-hidden">
                                 {s.avatar ? (
                                   <img src={s.avatar} alt={s.name} className="w-full h-full object-cover" />
                                 ) : (
                                   <Users size={18} strokeWidth={2.5} />
                                 )}
                               </div>
                               <div className="flex flex-col">
                                 <p className="text-sm font-black text-on-surface group-hover:text-primary transition-colors tracking-tight">{s.name}</p>
                                 <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="px-1.5 py-0.5 bg-primary/5 text-[8px] font-black text-primary/70 uppercase tracking-wider rounded border border-primary/10">{s.tag || '학생'}</span>
                                    {colVis.group && groupMap[s.id] && (
                                      <span
                                        className="text-[9px] font-black px-1.5 py-0.5 rounded-md text-white"
                                        style={{ backgroundColor: groupMap[s.id].color }}
                                      >
                                        {groupMap[s.id].name}
                                      </span>
                                    )}
                                    {suggestionCounts[s.id] > 0 && (
                                      <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-rose-50 text-[8px] font-black text-rose-500 rounded border border-rose-100">
                                        💬 {suggestionCounts[s.id]}건
                                      </span>
                                    )}
                                 </div>
                               </div>
                             </div>
                           )}
                         </td>

                         {colVis.linkedSubjects && (
                           <td className="p-3 lg:p-6 text-center hidden lg:table-cell">
                             <div className="flex items-center justify-center gap-1.5 overflow-hidden">
                               {linkedClasses.length > 0 ? (
                                 linkedClasses.map((linkedClass) => (
                                   <div
                                     key={linkedClass.id}
                                     title={linkedClass.subject}
                                     className="w-8 h-8 rounded-lg border border-neutral-200 bg-white flex items-center justify-center text-xs font-black text-on-surface-variant/70 group-hover:border-primary/20 group-hover:text-primary transition-all shadow-sm shrink-0"
                                   >
                                     {linkedClass.subject.charAt(0)}
                                   </div>
                                 ))
                               ) : (
                                 <span className="text-xs font-bold text-on-surface-variant/60 italic">연동 과목 없음</span>
                               )}
                             </div>
                           </td>
                         )}

                         {/* 승인 셀 */}
                         {colVis.approval && (
                           <td className="p-3 lg:p-6 text-center">
                             {(!s.activity || s.activity === '기록 없음') ? (
                               <span className="text-on-surface-variant/50 text-xs font-bold">—</span>
                             ) : (s.pending_obs_ids?.length > 0) ? (
                               <span className="px-2 lg:px-3 py-1 rounded-lg text-xs font-black border bg-amber-50 text-amber-700 border-amber-300 whitespace-nowrap">승인 대기</span>
                             ) : (
                               <span className="px-2 lg:px-3 py-1 rounded-lg text-xs font-black border bg-secondary/10 text-secondary border-secondary/30 whitespace-nowrap">승인 완료</span>
                             )}
                           </td>
                         )}

                         {/* 주차별 관찰기록 / 결과제출 현황 셀 */}
                         {selectedStatsWeek !== null && (
                           <>
                             <td className="p-3 lg:p-6 text-center whitespace-nowrap">
                               {obsOnWeek.has(s.id) ? (
                                 <span className="px-2 py-1 rounded-md text-[9px] font-black bg-violet-50 text-violet-600 border border-violet-100 whitespace-nowrap">📝 제출</span>
                               ) : (
                                 <span className="text-neutral-300 font-bold text-sm">—</span>
                               )}
                             </td>
                             <td className="p-3 lg:p-6 text-center whitespace-nowrap">
                               {resultsOnWeek.has(s.id) ? (
                                 <span className="px-2 py-1 rounded-md text-[9px] font-black bg-emerald-50 text-emerald-600 border border-emerald-100 whitespace-nowrap">📁 제출</span>
                               ) : (
                                 <span className="text-neutral-300 font-bold text-sm">—</span>
                               )}
                             </td>
                           </>
                         )}

                         {/* 관리 셀 */}
                         <td className="p-3 lg:p-6 text-right pr-6 lg:pr-10" onClick={(e) => e.stopPropagation()}>
                           {isEditing ? (
                             <div className="flex items-center justify-end gap-2">
                               <button
                                 onClick={handleSaveEdit}
                                 disabled={saving}
                                 className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-xl text-xs font-black hover:bg-primary/80 active:scale-95 transition-all disabled:opacity-50"
                               >
                                 <Save size={13} />
                                 {saving ? '저장 중' : '저장'}
                               </button>
                               <button
                                 onClick={handleCancelEdit}
                                 className="p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-xl transition-all"
                               >
                                 <X size={16} />
                               </button>
                             </div>
                           ) : (
                             <div className="flex items-center justify-end gap-1">
                               <button
                                 onClick={(e) => handleStartEdit(e, s)}
                                 className="p-2 text-neutral-400 hover:text-primary hover:bg-primary/10 rounded-xl transition-all"
                                 title="학생 정보 편집"
                               >
                                 <Pencil size={16} />
                               </button>
                               <button
                                 onClick={(e) => { e.stopPropagation(); onDeleteStudent(s.id); }}
                                 className="p-2 text-neutral-400 hover:text-error hover:bg-error/10 rounded-xl transition-all"
                                 title="학생 삭제"
                               >
                                 <Trash2 size={16} />
                               </button>
                               <div className="relative">
                                 <button
                                   onClick={(e) => { e.stopPropagation(); setPinPopupId(pinPopupId === s.id ? null : s.id); }}
                                   className="p-2 text-neutral-400 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                                   title="PIN 보기"
                                 >
                                   {pinPopupId === s.id ? <EyeOff size={14} /> : <Eye size={14} />}
                                 </button>
                                 {pinPopupId === s.id && (
                                   <div className="absolute right-0 bottom-9 z-50 bg-neutral-900 text-white rounded-xl px-4 py-2.5 shadow-xl whitespace-nowrap">
                                     <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest mb-1">PIN</p>
                                     <p className="text-lg font-black tracking-widest font-manrope">
                                       {s.pin ?? <span className="text-neutral-500 text-sm">미설정</span>}
                                     </p>
                                     <div className="absolute bottom-[-5px] right-4 w-2.5 h-2.5 bg-neutral-900 rotate-45" />
                                   </div>
                                 )}
                               </div>
                               <button
                                 onClick={(e) => { e.stopPropagation(); onResetPin(s.id); }}
                                 className="p-2 text-neutral-400 hover:text-amber-500 hover:bg-amber-50 rounded-xl transition-all"
                                 title="PIN 초기화"
                               >
                                 <KeyRound size={16} />
                               </button>
                               <button
                                 onClick={(e) => { e.stopPropagation(); onNavigateToStudent(s.id); }}
                                 className="p-2 text-primary/40 hover:text-primary hover:bg-primary/10 rounded-xl transition-all"
                                 title="상세 보기"
                               >
                                 <ArrowRight size={18} />
                               </button>
                             </div>
                           )}
                         </td>
                       </motion.tr>
                     );
                   })
                 ) : (
                    <tr>
                      <td colSpan={selectedStatsWeek !== null ? 7 : 6} className="py-24 text-center">
                        <div className="flex flex-col items-center justify-center text-on-surface-variant/20 gap-4">
                          <div className="p-6 bg-neutral-50 rounded-full shadow-inner"><Search size={40} /></div>
                          <p className="font-black text-xs tracking-widest uppercase">일치하는 학생이 없습니다</p>
                        </div>
                      </td>
                    </tr>
                 )}
               </tbody>
             </table>
           </div>
        </div>
      </section>
    </motion.div>

    {/* 참여 코드 전체화면 모달 */}
    <AnimatePresence>
      {showCodeModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[900] flex flex-col items-center justify-center bg-[#0a0a0f]"
          onClick={() => setShowCodeModal(false)}
        >
          {/* 닫기 */}
          <button
            onClick={() => setShowCodeModal(false)}
            className="absolute top-8 right-8 p-3 rounded-2xl text-white/30 hover:text-white hover:bg-white/10 transition-all z-10"
          >
            <X size={24} />
          </button>

          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0.25 }}
            className="flex flex-col items-center gap-10 px-8 w-full max-w-3xl"
            onClick={e => e.stopPropagation()}
          >
            {/* 상단 레이블 */}
            <div className="text-center space-y-2">
              <p className="text-xs font-black text-white/40 uppercase tracking-[0.5em]">학생 참여 코드</p>
              <p className="text-white/70 font-bold text-lg">{classInfo.name}</p>
            </div>

            {/* 코드 박스 — 진한 배경 + 노란색 코드 */}
            <div className="w-full bg-[#111118] border-2 border-yellow-400/30 rounded-[2.5rem] py-16 px-10 flex items-center justify-center shadow-[0_0_80px_rgba(250,204,21,0.15)] overflow-hidden">
              <p
                className="font-black font-manrope text-yellow-300 select-all text-center leading-none w-full"
                style={{ fontSize: 'clamp(3rem, 12vw, 7rem)', letterSpacing: '0.08em' }}
              >
                {classInfo.entry_code}
              </p>
            </div>

            {/* 안내 */}
            <p className="text-white/40 font-bold text-sm text-center leading-relaxed">
              학생들이 <span className="text-yellow-300 font-black">클래스로그 → 수업 입장하기</span>에서<br />
              위 코드를 입력하면 바로 참여할 수 있습니다.
            </p>

            {/* 버튼 */}
            <button
              onClick={() => { onCopyCode(); }}
              className="px-12 py-5 btn-gradient rounded-2xl font-black text-base flex items-center justify-center gap-3 shadow-2xl shadow-primary/30 active:scale-95 transition-all"
            >
              {copySuccess ? '✨ 링크 복사 완료!' : '📋 학생 입장 링크 복사'}
            </button>

            <p className="text-white/15 text-[10px] font-bold uppercase tracking-widest">배경 클릭 또는 ESC로 닫기</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* 전체화면 학생 목록 모달 */}
    <AnimatePresence>
      {showFullscreen && (
        <div className="fixed inset-0 z-[950] flex flex-col bg-white">
          {/* Fullscreen Header */}
          <div className="flex items-center justify-between px-10 py-6 border-b border-neutral-100 bg-white shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                <LayoutDashboard size={20} />
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight">{classInfo?.name} — 학급 학생 목록</h2>
                <p className="text-xs font-bold text-on-surface-variant/60">전체 {students.length}명</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="학생 검색..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="bg-neutral-50 border border-neutral-200 text-sm font-bold text-neutral-900 outline-none pl-10 pr-6 py-3 rounded-xl w-64 transition-all focus:border-primary/40"
                />
              </div>
              <button
                onClick={() => setShowFullscreen(false)}
                className="p-3 rounded-xl text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-all"
              >
                <X size={22} />
              </button>
            </div>
          </div>

          {/* Fullscreen Table */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-neutral-50 border-b border-neutral-200">
                <tr>
                  <th className="px-8 py-5 text-[11px] font-black text-on-surface/60 uppercase tracking-widest w-20">NO.</th>
                  <th className="px-8 py-5 text-[11px] font-black text-on-surface/60 uppercase tracking-widest">학생 이름</th>
                  <th className="px-8 py-5 text-[11px] font-black text-on-surface/60 uppercase tracking-widest">최근 활동</th>
                  <th className="px-8 py-5 text-[11px] font-black text-on-surface/60 uppercase tracking-widest">연동 과목</th>
                  <th className="px-8 py-5 text-[11px] font-black text-on-surface/60 uppercase tracking-widest text-right">상세 보기</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredStudents.map((s, _idx) => (
                  <tr
                    key={s.id}
                    onClick={() => { onNavigateToStudent(s.id); setShowFullscreen(false); }}
                    className="hover:bg-primary/[0.02] cursor-pointer transition-all group"
                  >
                    <td className="px-8 py-4">
                      <span className="font-black text-on-surface-variant/30 text-base font-manrope">
                        {s.number === '-' ? <span className="text-neutral-300 text-sm">-</span> : s.number.toString().padStart(2, '0')}
                      </span>
                    </td>
                    <td className="px-8 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-primary/5 text-primary/40 shrink-0 border border-primary/10 group-hover:bg-primary/10 group-hover:text-primary transition-all overflow-hidden">
                          {s.avatar ? (
                            <img src={s.avatar} alt={s.name} className="w-full h-full object-cover" />
                          ) : (
                            <Users size={16} strokeWidth={2.5} />
                          )}
                        </div>
                        <span className="text-sm font-black group-hover:text-primary transition-colors">{s.name}</span>
                      </div>
                    </td>
                    <td className="px-8 py-4">
                      {s.activity && s.activity !== '기록 없음' ? (
                        <div className="flex items-center gap-2">
                          <CheckCheck size={14} className="text-secondary shrink-0" />
                          <span className="text-sm font-bold text-on-surface truncate max-w-[240px]">{s.activity}</span>
                        </div>
                      ) : (
                        <span className="text-xs font-bold text-neutral-300 italic">기록 없음</span>
                      )}
                    </td>
                    <td className="px-8 py-4">
                      <div className="flex items-center gap-1.5">
                        {linkedClasses.length > 0 ? (
                          linkedClasses.map((lc) => (
                            <div key={lc.id} title={lc.subject} className="w-7 h-7 rounded-lg border border-neutral-200 bg-white flex items-center justify-center text-[10px] font-black text-on-surface-variant/40 shadow-sm">
                              {lc.subject.charAt(0)}
                            </div>
                          ))
                        ) : (
                          <span className="text-xs text-neutral-300">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-4 text-right">
                      <ArrowRight size={16} className="text-primary/30 group-hover:text-primary ml-auto transition-colors" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Fullscreen Footer */}
          <div className="px-10 py-4 border-t border-neutral-100 bg-neutral-50 flex items-center justify-between">
            <p className="text-xs font-bold text-neutral-400">
              전체 {students.length}명 중 {filteredStudents.length}명 표시
              {searchQuery && ` — "${searchQuery}" 검색 결과`}
            </p>
            <button
              onClick={() => setShowFullscreen(false)}
              className="px-6 py-2.5 bg-neutral-200 hover:bg-neutral-300 rounded-xl text-sm font-black text-neutral-600 transition-all"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </AnimatePresence>

    {/* 활동 참여 현황 모달 */}
    <AnimatePresence>
      {showActivityModal && (() => {
        // 탭 + 주차 기준 필터
        const allObsIds = new Set(rawObs.map(r => r.student_id));
        const allResultIds = new Set(rawResults.map(r => r.student_id));

        const getTabSubmittedIds = (): Set<string> => {
          if (activityTab === 'obs') {
            return selectedActivityWeek !== null
              ? getObsOnWeek(selectedActivityWeek)
              : allObsIds;
          } else {
            return selectedActivityWeek !== null
              ? getResultsOnWeek(selectedActivityWeek)
              : allResultIds;
          }
        };
        const submittedIds = getTabSubmittedIds();
        const submitted = students.filter(s => submittedIds.has(s.id));
        const notSubmitted = students.filter(s => !submittedIds.has(s.id));

        const getActivityLabel = (s: any) => {
          if (submittedIds.has(s.id)) {
            if (selectedActivityWeek !== null) {
              return activityTab === 'obs' ? `${selectedActivityWeek}주차 활동 기록 제출` : `${selectedActivityWeek}주차 결과물 제출`;
            }
            return activityTab === 'obs' ? '활동 기록 제출' : '결과물 제출';
          }
          return s.activity || '기록 없음';
        };

        const closeModal = () => {
          setShowActivityModal(false);
          setSelectedActivityWeek(null);
          setActivityTab('obs');
          setMobileStatusTab('submitted');
        };

        const tabColor = activityTab === 'obs' ? 'violet' : 'emerald';
        const tabLabel = activityTab === 'obs' ? '활동 기록' : '결과제출';

        return (
          <div className="fixed inset-0 z-[900] flex items-end sm:items-center justify-center px-4 pb-4 pt-20 sm:p-8 bg-slate-900/60 backdrop-blur-md" onClick={closeModal}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="relative bg-white rounded-[2.5rem] shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
            >
              {/* Modal Header */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-5 sm:px-10 py-4 sm:py-7 border-b border-neutral-100">
                <div className="space-y-1 min-w-0">
                  <p className="text-[10px] font-black text-secondary uppercase tracking-[0.25em]">Activity Rate</p>
                  <h3 className="text-lg sm:text-2xl font-black tracking-tight truncate">
                    {classInfo?.name} {selectedActivityWeek !== null ? `${selectedActivityWeek}주차 ` : ''}{tabLabel} 현황
                  </h3>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-6 shrink-0">
                  <div className="flex items-center gap-3 sm:gap-4 text-right">
                    <div className="space-y-0.5 whitespace-nowrap">
                      <p className="text-xl sm:text-2xl font-black text-secondary">{submitted.length}<span className="text-sm ml-1 opacity-50">명</span></p>
                      <p className="text-[9px] font-black text-secondary/60 uppercase tracking-widest whitespace-nowrap">제출 완료</p>
                    </div>
                    <div className="w-px h-10 bg-neutral-100 shrink-0" />
                    <div className="space-y-0.5 whitespace-nowrap">
                      <p className="text-xl sm:text-2xl font-black text-amber-500">{notSubmitted.length}<span className="text-sm ml-1 opacity-50">명</span></p>
                      <p className="text-[9px] font-black text-amber-500/60 uppercase tracking-widest whitespace-nowrap">미제출</p>
                    </div>
                  </div>
                  <button onClick={closeModal} className="p-2.5 rounded-xl text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-all shrink-0">
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* 탭 선택 */}
              <div className="px-5 sm:px-10 py-3 border-b border-neutral-100 flex items-center gap-2">
                <button
                  onClick={() => setActivityTab('obs')}
                  className={`flex items-center gap-1.5 px-4 sm:px-5 py-2 rounded-xl text-[11px] font-black transition-all border whitespace-nowrap ${
                    activityTab === 'obs'
                      ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                      : 'bg-white text-neutral-400 border-neutral-200 hover:border-violet-300 hover:text-violet-600'
                  }`}
                >
                  📋 활동 기록
                  {activityTab === 'obs' && selectedActivityWeek === null && (
                    <span className="bg-white/20 px-1.5 py-0.5 rounded-md text-[9px]">{allObsIds.size}명</span>
                  )}
                </button>
                <button
                  onClick={() => setActivityTab('results')}
                  className={`flex items-center gap-1.5 px-4 sm:px-5 py-2 rounded-xl text-[11px] font-black transition-all border whitespace-nowrap ${
                    activityTab === 'results'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-white text-neutral-400 border-neutral-200 hover:border-emerald-300 hover:text-emerald-600'
                  }`}
                >
                  📦 결과제출
                  {activityTab === 'results' && selectedActivityWeek === null && (
                    <span className="bg-white/20 px-1.5 py-0.5 rounded-md text-[9px]">{allResultIds.size}명</span>
                  )}
                </button>
              </div>

              {/* 주차 필터 칩 */}
              {statsWeeks.length > 0 && (
                <div className="px-5 sm:px-10 py-3 border-b border-neutral-100 flex items-center gap-2 overflow-x-auto custom-scrollbar">
                  <button
                    onClick={() => setSelectedActivityWeek(null)}
                    className={`shrink-0 px-4 py-1.5 rounded-full text-[11px] font-black transition-all border ${
                      selectedActivityWeek === null
                        ? 'bg-neutral-700 text-white border-neutral-700 shadow-sm'
                        : 'bg-white text-neutral-400 border-neutral-200 hover:border-neutral-400'
                    }`}
                  >
                    전체
                  </button>
                  {statsWeeks.map(week => {
                    const topic = weeklyPlan.find(p => p.week === week)?.topic;
                    const weekCount = activityTab === 'obs' ? getObsOnWeek(week).size : getResultsOnWeek(week).size;
                    return (
                      <button
                        key={week}
                        onClick={() => setSelectedActivityWeek(week)}
                        className={`shrink-0 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11px] font-black transition-all border ${
                          selectedActivityWeek === week
                            ? tabColor === 'violet' ? 'bg-violet-600 text-white border-violet-600 shadow-sm' : 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                            : 'bg-white text-neutral-400 border-neutral-200 hover:border-neutral-400'
                        }`}
                      >
                        {week}주차{topic && <span className="opacity-60">· {topic}</span>}
                        {weekCount > 0 && (
                          <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black ${
                            selectedActivityWeek === week ? 'bg-white/20 text-white' : tabColor === 'violet' ? 'bg-violet-100 text-violet-600' : 'bg-emerald-100 text-emerald-600'
                          }`}>{weekCount}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 모바일 전용: 제출완료/미제출 서브탭 */}
              <div className="sm:hidden flex border-b border-neutral-100">
                <button
                  onClick={() => setMobileStatusTab('submitted')}
                  className={`flex-1 py-3 text-xs font-black transition-all border-b-2 ${
                    mobileStatusTab === 'submitted'
                      ? tabColor === 'violet' ? 'text-violet-600 border-violet-600' : 'text-emerald-600 border-emerald-600'
                      : 'text-neutral-400 border-transparent'
                  }`}
                >
                  ✓ 제출 완료 ({submitted.length})
                </button>
                <button
                  onClick={() => setMobileStatusTab('notSubmitted')}
                  className={`flex-1 py-3 text-xs font-black transition-all border-b-2 ${
                    mobileStatusTab === 'notSubmitted'
                      ? 'text-amber-600 border-amber-600'
                      : 'text-neutral-400 border-transparent'
                  }`}
                >
                  ⏳ 미제출 ({notSubmitted.length})
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-hidden grid grid-cols-1 sm:grid-cols-2 sm:divide-x divide-neutral-100">
                {/* 제출 완료 */}
                <div className={`${mobileStatusTab === 'submitted' ? 'flex' : 'hidden'} sm:flex flex-col overflow-hidden`}>
                  <div className={`hidden sm:flex px-5 sm:px-8 py-3 sm:py-4 border-b items-center gap-2 ${tabColor === 'violet' ? 'bg-violet-50 border-violet-100' : 'bg-emerald-50 border-emerald-100'}`}>
                    <CheckCheck size={14} className={tabColor === 'violet' ? 'text-violet-600' : 'text-emerald-600'} />
                    <span className={`text-[11px] font-black uppercase tracking-widest ${tabColor === 'violet' ? 'text-violet-700' : 'text-emerald-700'}`}>
                      제출 완료 ({submitted.length}명)
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar py-3">
                    {submitted.length > 0 ? (
                      submitted.map(s => (
                        <div
                          key={s.id}
                          onClick={() => { onNavigateToStudent(s.id); closeModal(); }}
                          className={`flex items-center gap-3 px-5 sm:px-8 py-3 cursor-pointer transition-all group ${tabColor === 'violet' ? 'hover:bg-violet-50' : 'hover:bg-emerald-50'}`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tabColor === 'violet' ? 'bg-violet-100 text-violet-600' : 'bg-emerald-100 text-emerald-600'}`}>
                            <Users size={14} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-black transition-colors ${tabColor === 'violet' ? 'group-hover:text-violet-600' : 'group-hover:text-emerald-600'}`}>
                              {s.number !== '-' ? `${s.number}번 ` : ''}{s.name}
                            </p>
                            <p className="text-[10px] text-neutral-400 font-medium truncate">{getActivityLabel(s)}</p>
                          </div>
                          <CheckCircle2 size={14} className={`shrink-0 ${tabColor === 'violet' ? 'text-violet-500' : 'text-emerald-500'}`} />
                        </div>
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full py-10 text-neutral-300 gap-2">
                        <CheckCheck size={32} />
                        <p className="text-xs font-bold">제출한 학생이 없습니다</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 미제출 */}
                <div className={`${mobileStatusTab === 'notSubmitted' ? 'flex' : 'hidden'} sm:flex flex-col overflow-hidden`}>
                  <div className="hidden sm:flex px-5 sm:px-8 py-3 sm:py-4 bg-amber-50 border-b border-amber-100 items-center gap-2">
                    <ClockIcon size={14} className="text-amber-500" />
                    <span className="text-[11px] font-black text-amber-600 uppercase tracking-widest">미제출 ({notSubmitted.length}명)</span>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar py-3">
                    {notSubmitted.length > 0 ? (
                      notSubmitted.map(s => (
                        <div
                          key={s.id}
                          onClick={() => { onNavigateToStudent(s.id); closeModal(); }}
                          className="flex items-center gap-3 px-5 sm:px-8 py-3 hover:bg-amber-50 cursor-pointer transition-all group"
                        >
                          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-400 shrink-0">
                            <Users size={14} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-black group-hover:text-amber-600 transition-colors">
                              {s.number !== '-' ? `${s.number}번 ` : ''}{s.name}
                            </p>
                            <p className="text-[10px] text-neutral-300 font-medium">미제출</p>
                          </div>
                          <ClockIcon size={14} className="text-amber-300 shrink-0" />
                        </div>
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full py-10 text-neutral-300 gap-2">
                        <ClockIcon size={32} />
                        <p className="text-xs font-bold">모두 제출 완료!</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-5 sm:px-10 py-4 sm:py-5 border-t border-neutral-100 bg-neutral-50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-2 bg-neutral-100 rounded-full flex-1 sm:w-40 sm:flex-none overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${tabColor === 'violet' ? 'bg-violet-500' : 'bg-emerald-500'}`}
                      style={{ width: students.length > 0 ? `${(submitted.length / students.length) * 100}%` : '0%' }}
                    />
                  </div>
                  <span className="text-xs font-black text-on-surface-variant/60 whitespace-nowrap">
                    {tabLabel} 참여율 {students.length > 0 ? Math.round((submitted.length / students.length) * 100) : 0}%
                  </span>
                </div>
                <button onClick={closeModal} className="w-full sm:w-auto px-6 py-2.5 bg-neutral-200 hover:bg-neutral-300 rounded-xl text-sm font-black text-neutral-600 transition-all">
                  닫기
                </button>
              </div>
            </motion.div>
          </div>
        );
      })()}
    </AnimatePresence>
    </>
  );
};

export default HomeroomDashboard;
