import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Grid,
  List,
  Search,
  BookOpen,
  Plus,
  Pencil,
  Trash2,
  ArrowRight,
  ArrowLeftRight,
  Check,
  X,
  CheckCheck,
  CheckCircle2,
  Clock as ClockIcon,
  BarChart2,
  ChevronDown,
  ChevronUp,
  KeyRound,
  Eye,
  EyeOff,
  Save,
  Megaphone,
  SlidersHorizontal,
  RotateCw,
  Loader2,
  FolderOpen,
  AlignLeft,
  Link2,
  ImageIcon,
  File,
  ExternalLink,
} from 'lucide-react';
import { useColumnVisibility } from '../../hooks/useColumnVisibility';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';

interface SubjectDashboardProps {
  classInfo: any;
  students: any[];
  viewMode: 'grid' | 'list';
  setViewMode: (mode: 'grid' | 'list') => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onAddStudent: () => void;
  onEditStudent: (id: string, number: string, name: string) => Promise<void>;
  onDeleteStudent: (id: string) => void;
  onNavigateAI: (studentId: string) => void;
  sortConfig: { key: string, direction: 'asc' | 'desc' };
  onSort: (key: any) => void;
  selectedIds: string[];
  onSelectStudent: (id: string) => void;
  onSelectAll: (isSelect: boolean) => void;
  onBulkApprove: () => void;
  onResetPin: (id: string) => void;
  groupMap?: Record<string, { name: string; color: string }>;
  statsRefreshKey?: number;
}

const SubjectDashboard = ({
  classInfo,
  students,
  viewMode,
  setViewMode,
  searchQuery,
  setSearchQuery,
  onAddStudent,
  onEditStudent,
  onDeleteStudent,
  onNavigateAI,
  sortConfig,
  onSort,
  selectedIds,
  onSelectStudent,
  onSelectAll,
  onBulkApprove,
  onResetPin,
  groupMap = {},
  statsRefreshKey = 0,
}: SubjectDashboardProps) => {
  const navigate = useNavigate();
  const SUBJECT_COL_DEFAULTS = { number: true, group: true, activity: true, approval: true };
  const SUBJECT_COL_LABELS: Record<string, string> = {
    number: '번호 (NO.)',
    group: '지정 조',
    activity: '활동 기록',
    approval: '승인 현황',
  };
  const { visibility: colVis, toggle: toggleCol, reset: resetCols } = useColumnVisibility(
    'scholar_col_subject',
    SUBJECT_COL_DEFAULTS
  );
  const [showColDropdown, setShowColDropdown] = useState(false);
  const [copyCodeSuccess, setCopyCodeSuccess] = useState(false);

  const handleCopyEntryCode = () => {
    if (!classInfo?.entry_code) return;
    navigator.clipboard.writeText(classInfo.entry_code);
    setCopyCodeSuccess(true);
    setTimeout(() => setCopyCodeSuccess(false), 2000);
  };

  const [showActivityModal, setShowActivityModal] = useState(false);
  const [selectedActivityWeek, setSelectedActivityWeek] = useState<number | null>(null);
  const [activityTab, setActivityTab] = useState<'obs' | 'results'>('obs');
  const [mobileStatusTab, setMobileStatusTab] = useState<'submitted' | 'notSubmitted'>('submitted');

  // 결과물 상세 (삭제/반려)
  const [resultDetailStudent, setResultDetailStudent] = useState<any>(null);
  const [resultDetailItems, setResultDetailItems] = useState<any[]>([]);
  const [resultDetailLoading, setResultDetailLoading] = useState(false);
  const [resultRejectModal, setResultRejectModal] = useState<{ groupId: string } | null>(null);
  const [resultRejectFeedback, setResultRejectFeedback] = useState('');
  const [resultProcessingGroupId, setResultProcessingGroupId] = useState<string | null>(null);

  const handleResultStudentClick = async (student: any) => {
    setResultDetailStudent(student);
    setResultDetailItems([]);
    setResultDetailLoading(true);
    try {
      let q = supabase.from('student_results').select('*').eq('student_id', student.id).order('created_at', { ascending: false });
      if (selectedActivityWeek !== null) q = q.eq('week_number', selectedActivityWeek);
      const { data } = await q;
      setResultDetailItems(data || []);
    } finally {
      setResultDetailLoading(false);
    }
  };

  const handleDashboardDeleteGroup = async (groupId: string) => {
    if (!confirm('이 결과물을 삭제하시겠습니까?')) return;
    setResultProcessingGroupId(groupId);
    try {
      const groupItems = resultDetailItems.filter((r: any) => (r.submission_group || r.id) === groupId);
      const storagePaths = groupItems.map((r: any) => r.storage_path).filter(Boolean);
      if (storagePaths.length > 0) await supabase.storage.from('student-attachments').remove(storagePaths);
      if (groupItems[0]?.submission_group) {
        // student_id 필터 필수 — 같은 submission_group을 가진 다른 조원의 행을 삭제하지 않음
        await supabase.from('student_results').delete()
          .eq('submission_group', groupId)
          .eq('student_id', resultDetailStudent!.id);
      } else {
        await supabase.from('student_results').delete().eq('id', groupId);
      }
      setResultDetailItems(prev => prev.filter((r: any) => (r.submission_group || r.id) !== groupId));
    } catch { alert('삭제 중 오류가 발생했습니다.'); }
    finally { setResultProcessingGroupId(null); }
  };

  const handleDashboardRejectGroup = async (feedback: string) => {
    if (!resultRejectModal) return;
    const { groupId } = resultRejectModal;
    setResultProcessingGroupId(groupId);
    try {
      const firstItem = resultDetailItems.find((r: any) => (r.submission_group || r.id) === groupId);
      const col = firstItem?.submission_group ? 'submission_group' : 'id';
      await supabase.from('student_results')
        .update({ status: 'rejected', rejection_feedback: feedback.trim() || null })
        .eq(col, groupId);
      setResultDetailItems(prev => prev.map((r: any) =>
        (r.submission_group || r.id) === groupId ? { ...r, status: 'rejected', rejection_feedback: feedback.trim() || null } : r
      ));
      if (resultDetailStudent?.id) {
        const rTitle = firstItem?.title || (firstItem?.week_number ? `${firstItem.week_number}주차 결과물` : '결과물');
        const { error: notifErr } = await supabase.from('student_notifications').insert({
          student_id: resultDetailStudent.id,
          class_id: classInfo?.id,
          title: '결과물이 반려되었습니다',
          content: `"${rTitle}"${feedback.trim() ? ` — ${feedback.trim()}` : ' (수정 후 재제출하세요)'}`,
          type: 'rejection',
          is_read: false,
        });
        if (notifErr) console.error('student_notifications insert error (reject result):', notifErr);
      }
      setResultRejectModal(null);
      setResultRejectFeedback('');
    } catch { alert('처리 중 오류가 발생했습니다.'); }
    finally { setResultProcessingGroupId(null); }
  };
  const [pinPopupId, setPinPopupId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNumber, setEditNumber] = useState('');
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const [memoDraft, setMemoDraft] = useState('');

  const saveMemo = async (studentId: string, text: string) => {
    try {
      await supabase.from('students').update({ memo: text.trim() }).eq('id', studentId);
    } catch (e) {
      console.error('[SubjectDashboard] memo save error:', e);
    }
  };

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

  // 주차별 제출 통계
  const [showStats, setShowStats] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [selectedStatsWeek, setSelectedStatsWeek] = useState<number | null>(null);
  const [rawObs, setRawObs] = useState<Array<{created_at: string, student_id: string, activity_name: string, status: string}>>([]);
  const [rawResults, setRawResults] = useState<Array<{created_at: string, student_id: string, week_number: number | null, status: string, title: string | null}>>([]);
  const [suggestionCounts, setSuggestionCounts] = useState<Record<string, number>>({});
  // 연결된 담임반의 weekly_plan (학생이 담임반 코드로 입장 시 activity_name이 담임반 주제로 저장됨)
  const [linkedWeeklyPlan, setLinkedWeeklyPlan] = useState<{week: number, topic: string}[]>([]);

  // 주차 목록: parent_class의 weekly_plan 우선, 없으면 본인 클래스
  const weeklyPlan: {week: number, topic: string}[] = classInfo?.parent_class_id
    ? (linkedWeeklyPlan.length > 0 ? linkedWeeklyPlan : classInfo?.weekly_plan || [])
    : classInfo?.weekly_plan || [];
  const submittedWeekNums = [...new Set(rawResults.map(r => r.week_number).filter((w): w is number => w !== null))];
  const statsWeeks = [...new Set([...weeklyPlan.map(p => p.week), ...submittedWeekNums])].sort((a, b) => a - b);

  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

  // 주어진 주차에 해당하는 매칭 주제 목록 (과목반 + 담임반 모두)
  const getTopicsForWeek = (week: number): string[] => {
    const topics: string[] = [];
    const subjectTopic = weeklyPlan.find(p => p.week === week)?.topic;
    const linkedTopic = linkedWeeklyPlan.find(p => p.week === week)?.topic;
    if (subjectTopic) topics.push(norm(subjectTopic));
    if (linkedTopic && norm(linkedTopic) !== (subjectTopic ? norm(subjectTopic) : '')) topics.push(norm(linkedTopic));
    return topics;
  };

  // 주차별 제출 학생 ID 집합 (결과제출 + 관찰기록 합산 — 주차 칩 카운트용)
  const _getSubmittedOnWeek = (week: number | null): Set<string> => {
    if (week === null) return new Set();
    const topics = getTopicsForWeek(week);
    const resultIds = rawResults.filter(r => r.week_number === week).map(r => r.student_id);
    const obsIds = topics.length > 0
      ? rawObs.filter(r => topics.includes(norm(r.activity_name))).map(r => r.student_id)
      : [];
    return new Set([...resultIds, ...obsIds]);
  };
  void _getSubmittedOnWeek;

  // 테이블용 — 관찰기록 / 결과제출 각각 분리
  const getObsOnWeek = (week: number | null): Set<string> => {
    if (week === null) return new Set();
    const topics = getTopicsForWeek(week);
    if (topics.length === 0) return new Set();
    return new Set(rawObs.filter(r => topics.includes(norm(r.activity_name))).map(r => r.student_id));
  };
  const getResultsOnWeek = (week: number | null): Set<string> =>
    week === null ? new Set() : new Set(rawResults.filter(r => r.week_number === week).map(r => r.student_id));

  // 선택된 주차의 obs + results 상태 기반 승인 상태 계산
  // 우선순위: 승인 대기 > 반려됨 > 승인 완료 > —
  const getApprovalStatusForWeek = (studentId: string, week: number): 'none' | 'pending' | 'rejected' | 'done' => {
    const topics = getTopicsForWeek(week);
    const weekObs = rawObs.filter(r => r.student_id === studentId && topics.includes(norm(r.activity_name)));
    const weekResults = rawResults.filter(r => r.student_id === studentId && r.week_number === week);
    if (weekObs.length === 0 && weekResults.length === 0) return 'none';
    if (weekObs.some(r => r.status === 'pending')) return 'pending';
    if (weekObs.some(r => r.status === 'rejected') || weekResults.some(r => r.status === 'rejected')) return 'rejected';
    return 'done';
  };

  // 선택 주차의 활동 텍스트: obs activity_name 우선, 없으면 result title
  const getActivityTextForWeek = (studentId: string, week: number): string | null => {
    const topics = getTopicsForWeek(week);
    const weekObs = rawObs
      .filter(r => r.student_id === studentId && topics.includes(norm(r.activity_name)))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (weekObs.length > 0) return weekObs[0].activity_name;
    const weekResults = rawResults
      .filter(r => r.student_id === studentId && r.week_number === week)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (weekResults.length > 0) return weekResults[0].title || `${week}주차 결과 제출`;
    return null;
  };

  const obsOnWeek = getObsOnWeek(selectedStatsWeek);
  const resultsOnWeek = getResultsOnWeek(selectedStatsWeek);

  useEffect(() => {
    const fetchStats = async () => {
      if (!classInfo?.id || students.length === 0) return;
      setStatsLoading(true);
      try {
        const studentIds = students.map((s: any) => s.id);
        // student_results: class_id가 아닌 student_id로 조회
        // → 학생은 담임반 입장코드로 로그인하므로 저장 class_id = 담임반 ID
        //   과목반 ID로 조회하면 결과가 없어 주차별 결과제출이 항상 공백으로 표시됨
        //   HomeroomDashboard와 동일하게 student_id 기반 조회로 통일
        const [obsRes, resultsRes, suggRes] = await Promise.all([
          supabase.from('observations').select('created_at, student_id, activity_name, status').in('student_id', studentIds).eq('is_student_record', true),
          supabase.from('student_results').select('created_at, student_id, week_number, status, title').in('student_id', studentIds),
          supabase.from('student_suggestions').select('student_id').eq('class_id', classInfo.id).is('teacher_reply', null),
        ]);
        setRawObs(obsRes.data || []);
        setRawResults(resultsRes.data || []);

        // linked_class_id 또는 parent_class_id에서 weekly_plan 로드
        const refClassId = classInfo.parent_class_id || classInfo.linked_class_id;
        if (refClassId) {
          const linkedClassRes = await supabase
            .from('classes')
            .select('weekly_plan')
            .eq('id', refClassId)
            .single();
          if (linkedClassRes.data?.weekly_plan) {
            setLinkedWeeklyPlan(linkedClassRes.data.weekly_plan);
          }
        } else {
          setLinkedWeeklyPlan([]);
        }
        const counts: Record<string, number> = {};
        (suggRes.data || []).forEach((r: { student_id: string }) => {
          counts[r.student_id] = (counts[r.student_id] || 0) + 1;
        });
        setSuggestionCounts(counts);
      } catch (err) {
        console.error('fetchStats error:', err);
      } finally {
        setStatsLoading(false);
      }
    };
    fetchStats();
  }, [classInfo?.id, students.length, statsRefreshKey]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (resultDetailStudent) setResultDetailStudent(null);
      else if (resultRejectModal) setResultRejectModal(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [resultDetailStudent, resultRejectModal]);

  const pendingCount = students.reduce((acc, s) => acc + (s.pending_obs_ids?.length || 0), 0);
  const isAllSelected = students.length > 0 && selectedIds.length === students.length;
  const filteredStudents = students.filter(s =>
    s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.number?.toString().includes(searchQuery.toLowerCase())
  );
  const activeStudents = students.filter(s => s.activity && s.status !== '미작성');

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.05 }
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
              Subject Dashboard
            </span>
            {classInfo?.linked_class_id && (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-secondary/10 text-secondary border border-secondary/20 rounded-full text-xs font-black uppercase tracking-[0.12em] whitespace-nowrap">
                <ArrowLeftRight size={10} /> Sync Active
              </span>
            )}
          </div>
          <div className="flex flex-col">
            <h1 className="text-3xl md:text-4xl font-black tracking-tightest leading-tight">
              <span className="gradient-text">{classInfo?.name}</span>
            </h1>
            <p className="text-on-surface-variant font-bold text-base mt-1 tracking-tight">{classInfo?.subject} 교과 대시보드</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => navigate(`/suggestions?classId=${classInfo.id}`)}
            className="relative flex items-center gap-2 px-4 py-3 rounded-2xl font-black text-sm border-2 border-rose-200 text-rose-500 hover:bg-rose-50 transition-all whitespace-nowrap"
          >
            <Megaphone size={15} />
            <span>질문·건의함</span>
            {Object.values(suggestionCounts).reduce((a, b) => a + b, 0) > 0 && (
              <span className="absolute -top-2 -right-2 bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {Object.values(suggestionCounts).reduce((a, b) => a + b, 0)}
              </span>
            )}
          </button>
          <div className="flex p-1 glass rounded-2xl border border-white/40 shadow-soft">
            <button onClick={() => setViewMode('grid')} className={`p-2.5 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-white text-primary shadow-soft' : 'text-on-surface-variant/65 hover:text-on-surface'}`}>
              <Grid size={17} />
            </button>
            <button onClick={() => setViewMode('list')} className={`p-2.5 rounded-xl transition-all ${viewMode === 'list' ? 'bg-white text-primary shadow-soft' : 'text-on-surface-variant/65 hover:text-on-surface'}`}>
              <List size={17} />
            </button>
          </div>
        </div>
      </header>

      {/* 2. Stats Cards */}
      <section className="px-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Total Students */}
          <div className="layered-card bg-white/80 rounded-3xl p-8 flex items-start gap-6 shadow-soft border border-white/60">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <Users size={26} className="text-primary/60" strokeWidth={1.8} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-on-surface-variant/75">전체 학생 수</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-black tracking-tight font-manrope">{students.length}</span>
                <span className="text-base font-bold text-on-surface-variant/80">명</span>
              </div>
              <span className="text-xs font-bold text-on-surface-variant/70 mt-0.5">전체 등록 인원</span>
            </div>
          </div>

          {/* Activity Rate */}
          <div
            onClick={() => setShowActivityModal(true)}
            className="layered-card bg-white/80 rounded-3xl p-8 flex items-start gap-6 shadow-soft border border-white/60 cursor-pointer hover:border-secondary/30 hover:bg-secondary/5 transition-all group"
          >
            <div className="w-14 h-14 rounded-2xl bg-secondary/10 flex items-center justify-center shrink-0">
              <BookOpen size={26} className="text-secondary/70" strokeWidth={1.8} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-on-surface-variant/75">활동 참여율</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-black tracking-tight font-manrope">{activeStudents.length}</span>
                <span className="text-base font-bold text-on-surface-variant/80">명</span>
              </div>
              <span className="text-xs font-bold text-on-surface-variant/70 mt-0.5">최근 활동 참여</span>
              <span className="text-xs font-black text-secondary/75 group-hover:text-secondary transition-colors mt-1">클릭하여 현황 보기 →</span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Strategy & Search Bento Bar */}
      <section className="px-4">
        <div className="glass p-3 rounded-3xl border border-white/60 shadow-soft flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
          {/* 검색 */}
          <div className="relative flex-1 min-w-0 group">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              placeholder="학생 또는 번호 검색..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border-2 border-neutral-200 hover:border-neutral-300 focus:border-primary/40 rounded-2xl text-sm font-bold text-neutral-900 outline-none transition-all placeholder:text-neutral-400 shadow-sm"
            />
          </div>

          {/* 아이콘 액션 버튼들 (참여 코드 + 컬럼 표시 설정만 유지, 나머지는 우하단 빠른 메뉴로 이동) */}
          <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 bg-white/20 rounded-2xl border border-white/40 backdrop-blur-md overflow-x-auto w-full sm:w-auto">
            <button
              onClick={handleCopyEntryCode}
              className={`flex items-center gap-1.5 h-9 sm:h-10 px-2.5 sm:px-3 rounded-xl font-black text-xs transition-all shadow-soft border shrink-0 ${
                copyCodeSuccess
                  ? 'bg-emerald-500 text-white border-emerald-400'
                  : 'bg-white hover:bg-emerald-500 hover:text-white text-on-surface-variant/60 border-transparent'
              }`}
              title="수업 입장 코드 복사"
            >
              {copyCodeSuccess ? <Check size={14} /> : <KeyRound size={14} />}
              <span className="hidden sm:inline">{copyCodeSuccess ? '복사됨!' : (classInfo?.entry_code ?? '코드 없음')}</span>
            </button>
            <div className="relative shrink-0">
              <button
                onClick={() => setShowColDropdown(true)}
                className={`w-9 h-9 sm:w-10 sm:h-10 bg-white rounded-xl flex items-center justify-center transition-all shadow-soft ${showColDropdown ? 'text-primary bg-primary/10' : 'text-on-surface-variant/80 hover:bg-primary/10 hover:text-primary'}`}
                title="컬럼 표시 설정"
              >
                <SlidersHorizontal size={17} />
              </button>
            </div>
          </div>

          {/* 전체승인 + 학생등록 */}
          <div className="flex items-center gap-2 flex-wrap">
            {pendingCount > 0 && (
              <button
                data-tour="approve-btn"
                onClick={onBulkApprove}
                className="flex items-center gap-2 px-4 py-3 rounded-2xl font-black text-sm shadow-soft bg-amber-500 hover:bg-amber-600 text-white transition-all active:scale-95 whitespace-nowrap"
              >
                <CheckCheck size={16} strokeWidth={2.5} />
                <span>전체 승인</span>
                <span className="bg-white/30 text-[10px] font-black px-1.5 py-0.5 rounded-lg">{pendingCount}건</span>
              </button>
            )}
            <button onClick={onAddStudent} className="btn-vibrant px-4 py-3 rounded-2xl font-black text-sm flex items-center gap-2 shadow-soft whitespace-nowrap flex-1 sm:flex-none justify-center">
              <Plus size={16} strokeWidth={3} />
              <span>학생 등록</span>
            </button>
          </div>
        </div>
      </section>
      
      {/* 4. 주차별 제출 현황 통계 */}
      <section className="px-4">
        <div className="rounded-2xl border border-neutral-100 bg-neutral-50/60 overflow-hidden">
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
                <span className="text-xs font-black text-primary bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20">
                  {selectedStatsWeek}주차 선택됨
                </span>
              )}
            </div>
            {showStats ? <ChevronUp size={16} className="text-on-surface-variant/70" /> : <ChevronDown size={16} className="text-on-surface-variant/70" />}
          </button>

          {showStats && (
            <div className="px-6 pb-5">
              {statsLoading ? (
                <div className="flex items-center justify-center py-6">
                  <span className="text-xs font-bold text-on-surface-variant/70">불러오는 중...</span>
                </div>
              ) : statsWeeks.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-xs font-black text-on-surface-variant/70">등록된 주차 계획이 없습니다. 학급 설정에서 주차별 계획을 추가해 주세요.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-0.5 px-0.5 scrollbar-thin">
                    {statsWeeks.map(week => {
                      const topic = weeklyPlan.find(p => p.week === week)?.topic;
                      const weekResultCount = getObsOnWeek(week).size;
                      const isSelected = selectedStatsWeek === week;
                      return (
                        <button
                          key={week}
                          onClick={() => setSelectedStatsWeek(isSelected ? null : week)}
                          className={`shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all border ${
                            isSelected
                              ? 'bg-primary text-white border-primary shadow-sm'
                              : 'bg-white text-neutral-600 border-neutral-300 hover:border-primary/40 hover:text-primary'
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
      </section>

      {/* 5. Student Content Area */}
      <section className="px-2 pb-20">
        {students.length === 0 ? (
          <div className="py-32 flex flex-col items-center justify-center space-y-8 layered-card rounded-[3rem] border-dashed border-primary/20 bg-gradient-to-br from-white via-white to-primary/5">
            <div className="w-24 h-24 bg-primary/5 rounded-[2rem] flex items-center justify-center shadow-inner group">
               <Users size={40} className="text-primary/40 group-hover:scale-110 transition-all duration-700" />
            </div>
            <div className="text-center space-y-3">
              <h3 className="text-2xl font-black tracking-tightest">등록된 학생이 없습니다.</h3>
              <p className="text-sm font-bold text-on-surface-variant leading-relaxed max-w-sm mx-auto">
                학생을 직접 추가하거나 <br /><span className="text-primary font-black underline decoration-primary/20 underline-offset-4">입장 코드</span>를 연동하세요.
              </p>
            </div>
            <div className="flex gap-4">
              <button onClick={onAddStudent} className="btn-vibrant px-8 py-4 rounded-2xl font-black text-sm flex items-center gap-3"><Plus size={18} /> 학생 추가</button>
            </div>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {viewMode === 'list' ? (
              <>
              {/* ── 모바일 카드 뷰 (md 미만) ── */}
              <div className="md:hidden space-y-3">
                {filteredStudents.length === 0 ? (
                  <div className="text-center py-16 text-on-surface-variant/70 font-bold">학생이 없습니다</div>
                ) : filteredStudents.map((s) => {
                  const approvalStatus = selectedStatsWeek !== null
                    ? getApprovalStatusForWeek(s.id, selectedStatsWeek)
                    : (!s.activity || s.status === '미작성') ? 'none'
                    : s.pending_obs_ids?.length > 0 ? 'pending'
                    : s.has_rejected ? 'rejected' : 'done';
                  return (
                    <motion.div
                      key={s.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => onNavigateAI(s.id)}
                      className={`layered-card bg-white/80 rounded-2xl border border-white/60 shadow-soft p-4 cursor-pointer hover:bg-primary/[0.02] transition-all ${selectedIds.includes(s.id) ? 'ring-2 ring-primary/30' : ''}`}
                    >
                      {/* 카드 헤더 */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0" onClick={(e) => e.stopPropagation()}>
                          <label className="flex items-center cursor-pointer shrink-0">
                            <input type="checkbox" className="hidden" checked={selectedIds.includes(s.id)} onChange={() => onSelectStudent(s.id)} />
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
                              {suggestionCounts[s.id] > 0 && (
                                <span className="text-[8px] font-black text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">💬 {suggestionCounts[s.id]}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        {/* 승인 상태 배지 */}
                        <div className="shrink-0 flex items-center gap-2">
                          {approvalStatus === 'pending' && (
                            <span className="text-xs font-black px-2 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-300 whitespace-nowrap">⏳ 대기</span>
                          )}
                          {approvalStatus === 'rejected' && (
                            <span className="text-xs font-black px-2 py-1 rounded-lg bg-red-50 text-red-500 border border-red-200 whitespace-nowrap">반려됨</span>
                          )}
                          {approvalStatus === 'done' && (
                            <span className="text-xs font-black px-2 py-1 rounded-lg bg-secondary/10 text-secondary border border-secondary/30 whitespace-nowrap">✅ 완료</span>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); onNavigateAI(s.id); }}
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

                      {/* 메모 */}
                      <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                        {editingMemoId === s.id ? (
                          <textarea
                            autoFocus
                            rows={2}
                            className="w-full text-xs font-medium bg-surface-container/60 rounded-xl px-3 py-2 resize-none outline-none focus:ring-1 focus:ring-primary/30 border border-surface-container"
                            value={memoDraft}
                            onChange={(e) => setMemoDraft(e.target.value)}
                            onBlur={() => { saveMemo(s.id, memoDraft); setEditingMemoId(null); }}
                            placeholder="메모 입력..."
                          />
                        ) : (
                          <button
                            onClick={() => { setEditingMemoId(s.id); setMemoDraft(s.memo || ''); }}
                            className={`w-full text-left text-xs font-medium rounded-xl px-3 py-2 transition-all ${
                              s.memo
                                ? 'bg-amber-50 border border-amber-100 text-on-surface-variant'
                                : 'bg-neutral-50 text-neutral-300 italic hover:bg-neutral-100'
                            }`}
                          >
                            {s.memo || '+ 메모 추가'}
                          </button>
                        )}
                      </div>

                      {/* 관리 버튼 */}
                      <div className="mt-3 pt-3 border-t border-neutral-100 flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button onClick={(e) => handleStartEdit(e, s)} className="p-2 hover:bg-primary/10 text-neutral-400 hover:text-primary transition-all rounded-lg"><Pencil size={14} /></button>
                        <button onClick={(e) => { e.stopPropagation(); onDeleteStudent(s.id); }} className="p-2 hover:bg-error/10 text-neutral-400 hover:text-error transition-all rounded-lg"><Trash2 size={14} /></button>
                        <button onClick={(e) => { e.stopPropagation(); onResetPin(s.id); }} className="p-2 hover:bg-violet-50 text-neutral-400 hover:text-violet-500 transition-all rounded-lg"><KeyRound size={14} /></button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* ── 데스크탑 테이블 (md 이상) ── */}
              <motion.div
                key="list"
                initial={{ opacity: 0, scale: 0.99 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.01 }}
                className="hidden md:block layered-card rounded-3xl border-white/60 shadow-soft overflow-hidden bg-white/60"
              >
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse min-w-[800px]">
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
                          <th className="p-4 lg:p-6 text-[11px] lg:text-[13px] font-black text-on-surface/80 uppercase tracking-widest whitespace-nowrap hidden sm:table-cell">
                            <button className="flex items-center gap-2 group" onClick={() => onSort('number')}>
                              NO. <ArrowRight size={14} className={`group-hover:text-primary transition-all rotate-90 ${sortConfig.key === 'number' ? 'text-primary' : 'opacity-20'}`} />
                            </button>
                          </th>
                        )}
                        <th className="p-4 lg:p-6 text-[11px] lg:text-[13px] font-black text-on-surface/80 uppercase tracking-widest whitespace-nowrap">학생 정보</th>
                        {colVis.activity && (
                          <th className="p-4 lg:p-6 text-[11px] lg:text-[13px] font-black text-on-surface/80 uppercase tracking-widest whitespace-nowrap hidden lg:table-cell">활동 및 관찰 기록</th>
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
                    <tbody className="bg-white divide-y divide-neutral-100">
                      {filteredStudents.map((s) => {
                        const isEditing = editingId === s.id;
                        return (
                        <motion.tr
                          key={s.id}
                          layout
                          onClick={() => !isEditing && onNavigateAI(s.id)}
                          className={`group hover:bg-neutral-50/50 transition-all ${isEditing ? 'bg-primary/[0.02] cursor-default' : 'cursor-pointer'} ${selectedIds.includes(s.id) ? 'bg-primary/[0.03]' : ''}`}
                        >
                          <td className="p-3 lg:p-6 text-center" onClick={(e) => e.stopPropagation()}>
                            <label className="flex items-center justify-center cursor-pointer">
                              <input
                                type="checkbox"
                                className="hidden"
                                checked={selectedIds.includes(s.id)}
                                onChange={() => onSelectStudent(s.id)}
                              />
                              <div className={`w-5 h-5 rounded-md border-2 transition-all flex items-center justify-center ${selectedIds.includes(s.id) ? 'bg-primary border-primary' : 'border-neutral-300 group-hover:border-primary/40'}`}>
                                {selectedIds.includes(s.id) && <Check size={14} className="text-white" strokeWidth={4} />}
                              </div>
                            </label>
                          </td>
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
                                    <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-rose-50 text-[8px] font-black text-rose-500 rounded border border-rose-100">
                                      💬 {suggestionCounts[s.id]}건
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            )}
                          </td>
                          {colVis.activity && (
                            <td className="p-3 lg:p-6 hidden lg:table-cell">
                              <div className="max-w-[400px]">
                                {(() => {
                                  const text = selectedStatsWeek !== null
                                    ? getActivityTextForWeek(s.id, selectedStatsWeek)
                                    : s.activity || null;
                                  return text
                                    ? <p className="text-sm font-medium text-on-surface/80 group-hover:text-on-surface transition-colors line-clamp-1 italic">"{text}"</p>
                                    : <span className="text-sm text-on-surface-variant/30">기록 없음</span>;
                                })()}
                              </div>
                            </td>
                          )}
                          {colVis.approval && (
                            <td className="p-6 text-center">
                              {(() => {
                                if (selectedStatsWeek !== null) {
                                  const ws = getApprovalStatusForWeek(s.id, selectedStatsWeek);
                                  if (ws === 'none') return <span className="text-on-surface-variant/50 text-xs font-bold">—</span>;
                                  if (ws === 'pending') return <span className="px-3 py-1 rounded-lg text-xs font-black border bg-amber-50 text-amber-700 border-amber-300">승인 대기</span>;
                                  if (ws === 'rejected') return <span className="px-3 py-1 rounded-lg text-xs font-black border bg-red-50 text-red-500 border-red-200">반려됨</span>;
                                  return <span className="px-3 py-1 rounded-lg text-xs font-black border bg-secondary/10 text-secondary border-secondary/30">승인 완료</span>;
                                }
                                if (s.status === '미작성') return <span className="text-on-surface-variant/50 text-xs font-bold">—</span>;
                                if (s.pending_obs_ids?.length > 0) return <span className="px-3 py-1 rounded-lg text-xs font-black border bg-amber-50 text-amber-700 border-amber-300">승인 대기</span>;
                                if (s.has_rejected) return <span className="px-3 py-1 rounded-lg text-xs font-black border bg-red-50 text-red-500 border-red-200">반려됨</span>;
                                return <span className="px-3 py-1 rounded-lg text-xs font-black border bg-secondary/10 text-secondary border-secondary/30">승인 완료</span>;
                              })()}
                            </td>
                          )}
                          {/* 주차별 관찰기록 / 결과제출 현황 셀 */}
                          {selectedStatsWeek !== null && (
                            <>
                              <td className="p-3 lg:p-6 text-center whitespace-nowrap">
                                {obsOnWeek.has(s.id) ? (
                                  <span className="px-2 py-1 rounded-md text-xs font-black bg-violet-50 text-violet-700 border border-violet-200 whitespace-nowrap">📝 제출</span>
                                ) : (
                                  <span className="text-neutral-500 font-bold text-sm">—</span>
                                )}
                              </td>
                              <td className="p-3 lg:p-6 text-center whitespace-nowrap">
                                {resultsOnWeek.has(s.id) ? (
                                  <span className="px-2 py-1 rounded-md text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">📁 제출</span>
                                ) : (
                                  <span className="text-neutral-500 font-bold text-sm">—</span>
                                )}
                              </td>
                            </>
                          )}

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
                              <button onClick={(e) => handleStartEdit(e, s)} className="p-2 hover:bg-primary/10 text-neutral-400 hover:text-primary transition-all rounded-lg" title="편집"><Pencil size={14} /></button>
                              <button onClick={(e) => { e.stopPropagation(); onDeleteStudent(s.id); }} className="p-2 hover:bg-error/10 text-neutral-400 hover:text-error transition-all rounded-lg" title="삭제"><Trash2 size={14} /></button>
                              {/* PIN 보기 */}
                              <div className="relative">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setPinPopupId(pinPopupId === s.id ? null : s.id); }}
                                  className="p-2 hover:bg-violet-50 text-neutral-400 hover:text-violet-500 transition-all rounded-lg"
                                  title="PIN 보기"
                                >
                                  {pinPopupId === s.id ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                                {pinPopupId === s.id && (
                                  <div className="absolute right-0 bottom-9 z-50 bg-neutral-900 text-white rounded-xl px-4 py-2.5 shadow-xl whitespace-nowrap">
                                    <p className="text-xs font-black text-neutral-400 uppercase tracking-widest mb-1">PIN</p>
                                    <p className="text-lg font-black tracking-widest font-manrope">
                                      {s.pin ?? <span className="text-neutral-500 text-sm">미설정</span>}
                                    </p>
                                    <div className="absolute bottom-[-5px] right-4 w-2.5 h-2.5 bg-neutral-900 rotate-45" />
                                  </div>
                                )}
                              </div>
                              <button onClick={(e) => { e.stopPropagation(); onResetPin(s.id); }} className="p-2 hover:bg-amber-50 text-neutral-400 hover:text-amber-500 transition-all rounded-lg" title="PIN 초기화"><KeyRound size={14} /></button>
                              <button onClick={(e) => { e.stopPropagation(); onNavigateAI(s.id); }} className="p-2 hover:bg-primary/10 text-primary/70 hover:text-primary transition-all rounded-lg" title="상세 보기"><ArrowRight size={16} /></button>
                            </div>
                            )}
                          </td>
                        </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </motion.div>
              </>
            ) : (
              <motion.div
                key="grid"
                variants={containerVariants}
                className="grid grid-cols-2 lg:grid-cols-3 gap-3 px-2"
              >
                {filteredStudents.map((s) => (
                  <motion.div
                    key={s.id}
                    variants={itemVariants}
                    className="layered-card rounded-2xl bg-white/90 shadow-soft border border-white/60 hover:bg-white hover:shadow-md transition-all flex flex-col overflow-hidden"
                  >
                    {/* 상단: 아바타 + 이름 + 상태 */}
                    <div
                      className="p-4 pb-2 flex items-start gap-2.5 cursor-pointer"
                      onClick={() => onNavigateAI(s.id)}
                    >
                      <div className="relative shrink-0">
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/15 to-secondary/15 flex items-center justify-center font-black text-primary text-base select-none overflow-hidden">
                          {s.avatar ? (
                            <img src={s.avatar} alt={s.name} className="w-full h-full object-cover" />
                          ) : (
                            s.name.charAt(0)
                          )}
                        </div>
                        {s.number && s.number !== '-' && (
                          <span className="absolute -bottom-1 -right-1 min-w-[18px] h-[18px] px-1 bg-on-surface text-surface rounded text-[9px] font-black flex items-center justify-center shadow-sm leading-none">
                            {s.number}
                          </span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0 pt-0.5">
                        <p className="font-black text-sm leading-tight truncate">{s.name}</p>
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          {colVis.group && groupMap[s.id] && (
                            <span
                              className="text-[9px] font-black px-1.5 py-0.5 rounded-md text-white"
                              style={{ backgroundColor: groupMap[s.id].color }}
                            >
                              {groupMap[s.id].name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 최근 활동 */}
                    <div
                      className="px-4 py-1.5 cursor-pointer"
                      onClick={() => onNavigateAI(s.id)}
                    >
                      <p className="text-xs text-on-surface-variant/75 font-medium line-clamp-2 leading-relaxed">
                        {(() => {
                          const text = selectedStatsWeek !== null
                            ? getActivityTextForWeek(s.id, selectedStatsWeek)
                            : (s.activity && s.activity !== '기록 없음' ? s.activity : null);
                          return text
                            ? <span className="italic">"{text}"</span>
                            : <span className="opacity-40">활동 기록 없음</span>;
                        })()}
                      </p>
                    </div>

                    {/* 메모 영역 */}
                    <div className="px-3 pb-2" onClick={(e) => e.stopPropagation()}>
                      {editingMemoId === s.id ? (
                        <textarea
                          autoFocus
                          rows={2}
                          className="w-full text-[11px] font-medium bg-surface-container/60 rounded-lg px-2.5 py-1.5 resize-none outline-none focus:ring-1 focus:ring-primary/30 border border-surface-container"
                          value={memoDraft}
                          onChange={(e) => setMemoDraft(e.target.value)}
                          onBlur={() => {
                            saveMemo(s.id, memoDraft);
                            setEditingMemoId(null);
                          }}
                          placeholder="메모 입력..."
                        />
                      ) : (
                        <button
                          onClick={() => {
                            setEditingMemoId(s.id);
                            setMemoDraft(s.memo || '');
                          }}
                          className={`w-full text-left text-[11px] font-medium rounded-lg px-2.5 py-1.5 transition-all min-h-[30px] ${
                            s.memo
                              ? 'text-on-surface-variant bg-amber-50/70 border border-amber-100 hover:bg-amber-50'
                              : 'text-on-surface-variant/30 italic bg-surface-container/20 hover:bg-surface-container/40'
                          }`}
                        >
                          {s.memo
                            ? <span className="line-clamp-2 not-italic">{s.memo}</span>
                            : '+ 메모 추가'
                          }
                        </button>
                      )}
                    </div>

                    {/* 하단 액션 버튼 */}
                    <div
                      className="mt-auto px-4 py-2.5 border-t border-surface-container/40 flex items-center justify-between"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => onNavigateAI(s.id)}
                        className="text-xs font-black text-primary flex items-center gap-0.5 hover:gap-1.5 transition-all"
                      >
                        기록 보기 <ArrowRight size={11} />
                      </button>
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={(e) => handleStartEdit(e, s)}
                          className="p-1.5 hover:bg-primary/10 text-on-surface-variant/65 hover:text-primary rounded-lg transition-all"
                          title="이름/번호 수정"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onDeleteStudent(s.id); }}
                          className="p-1.5 hover:bg-error/10 text-on-surface-variant/65 hover:text-error rounded-lg transition-all"
                          title="삭제"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </section>
    </motion.div>

    {/* 컬럼 표시 설정 모달 */}
    <AnimatePresence>
      {showColDropdown && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[900] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm"
          onClick={() => setShowColDropdown(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                  <SlidersHorizontal size={16} />
                </div>
                <h3 className="text-base font-black text-on-surface">컬럼 표시 설정</h3>
              </div>
              <button onClick={() => setShowColDropdown(false)} className="p-2 rounded-xl text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-all">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-1 mb-5">
              {Object.entries(SUBJECT_COL_LABELS).map(([key, label]) => (
                <label
                  key={key}
                  onClick={() => toggleCol(key)}
                  className="flex items-center gap-3 py-2.5 px-3 rounded-xl cursor-pointer hover:bg-neutral-50 group transition-colors"
                >
                  <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all shrink-0 ${colVis[key] ? 'bg-primary border-primary' : 'border-neutral-300'}`}>
                    {colVis[key] && <Check size={11} className="text-white" strokeWidth={3.5} />}
                  </div>
                  <span className="text-sm font-bold text-neutral-700 group-hover:text-primary transition-colors">{label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={resetCols}
                className="flex-1 py-2.5 text-sm font-black text-neutral-500 hover:text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-2xl transition-all"
              >
                기본값으로 초기화
              </button>
              <button
                onClick={() => setShowColDropdown(false)}
                className="flex-1 py-2.5 text-sm font-black text-white bg-primary hover:bg-primary/90 rounded-2xl transition-all"
              >
                확인
              </button>
            </div>
          </motion.div>
        </motion.div>
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
          <div className="fixed inset-0 z-[900] flex items-end sm:items-center justify-center px-4 pb-4 pt-20 sm:p-8 bg-slate-900/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-[2.5rem] shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
            >
              {/* Modal Header */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-5 sm:px-10 py-4 sm:py-5 border-b border-neutral-100">
                <div className="space-y-1 min-w-0">
                  <p className="text-xs font-black text-secondary uppercase tracking-[0.2em]">활동 참여율</p>
                  <h3 className="text-lg sm:text-xl font-black tracking-tight truncate">
                    {classInfo?.name} {selectedActivityWeek !== null ? `${selectedActivityWeek}주차 ` : ''}{tabLabel} 현황
                  </h3>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-6 shrink-0">
                  <div className="flex items-center gap-3 sm:gap-4 text-right">
                    <div className="space-y-0.5 whitespace-nowrap">
                      <p className="text-xl sm:text-2xl font-black text-secondary">{submitted.length}<span className="text-sm ml-1 opacity-70">명</span></p>
                      <p className="text-[10px] sm:text-xs font-black text-secondary/70 uppercase tracking-widest whitespace-nowrap">제출 완료</p>
                    </div>
                    <div className="w-px h-10 bg-neutral-200 shrink-0" />
                    <div className="space-y-0.5 whitespace-nowrap">
                      <p className="text-xl sm:text-2xl font-black text-amber-500">{notSubmitted.length}<span className="text-sm ml-1 opacity-70">명</span></p>
                      <p className="text-[10px] sm:text-xs font-black text-amber-500/70 uppercase tracking-widest whitespace-nowrap">미제출</p>
                    </div>
                  </div>
                  <button onClick={closeModal} className="p-2.5 rounded-xl text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 transition-all shrink-0">
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* 탭 선택 */}
              <div className="px-5 sm:px-10 py-3 border-b border-neutral-100 flex items-center gap-2">
                <button
                  onClick={() => setActivityTab('obs')}
                  className={`flex items-center gap-1.5 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs font-black transition-all border whitespace-nowrap ${
                    activityTab === 'obs'
                      ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                      : 'bg-white text-neutral-500 border-neutral-200 hover:border-violet-300 hover:text-violet-600'
                  }`}
                >
                  📋 활동 기록
                  {activityTab === 'obs' && selectedActivityWeek === null && (
                    <span className="bg-white/20 px-1.5 py-0.5 rounded-md text-xs">{allObsIds.size}명</span>
                  )}
                </button>
                <button
                  onClick={() => setActivityTab('results')}
                  className={`flex items-center gap-1.5 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs font-black transition-all border whitespace-nowrap ${
                    activityTab === 'results'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-white text-neutral-500 border-neutral-200 hover:border-emerald-300 hover:text-emerald-600'
                  }`}
                >
                  📦 결과제출
                  {activityTab === 'results' && selectedActivityWeek === null && (
                    <span className="bg-white/20 px-1.5 py-0.5 rounded-md text-xs">{allResultIds.size}명</span>
                  )}
                </button>
              </div>

              {/* 주차 필터 칩 */}
              {statsWeeks.length > 0 && (
                <div className="pl-5 sm:pl-10 pt-4 sm:pt-5 pb-6 sm:pb-8 border-b border-neutral-100 flex items-center gap-2 overflow-x-auto custom-scrollbar">
                  <button
                    onClick={() => setSelectedActivityWeek(null)}
                    className={`shrink-0 px-4 py-2 rounded-full text-xs font-black transition-all border ${
                      selectedActivityWeek === null
                        ? 'bg-neutral-700 text-white border-neutral-700 shadow-sm'
                        : 'bg-white text-neutral-500 border-neutral-300 hover:border-neutral-500'
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
                        className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-black transition-all border ${
                          selectedActivityWeek === week
                            ? tabColor === 'violet' ? 'bg-violet-600 text-white border-violet-600 shadow-sm' : 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                            : 'bg-white text-neutral-600 border-neutral-300 hover:border-neutral-500'
                        }`}
                      >
                        {week}주차{topic && <span className="opacity-75">· {topic}</span>}
                        {weekCount > 0 && (
                          <span className={`px-1.5 py-0.5 rounded-md text-xs font-black ${
                            selectedActivityWeek === week ? 'bg-white/20 text-white' : tabColor === 'violet' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>{weekCount}</span>
                        )}
                      </button>
                    );
                  })}
                  {/* 마지막 칩 오른쪽 여백 확보 */}
                  <div className="shrink-0 w-10" />
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
                    <span className={`text-sm font-black ${tabColor === 'violet' ? 'text-violet-700' : 'text-emerald-700'}`}>
                      ✓ 제출 완료 ({submitted.length}명)
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar py-3">
                    {submitted.length > 0 ? (
                      submitted.map(s => (
                        <div
                          key={s.id}
                          onClick={() => activityTab === 'results' ? handleResultStudentClick(s) : undefined}
                          className={`flex items-center gap-3 px-5 sm:px-8 py-3 transition-all group ${
                            activityTab === 'results' ? 'cursor-pointer' : ''
                          } ${tabColor === 'violet' ? 'hover:bg-violet-50' : 'hover:bg-emerald-50'}`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tabColor === 'violet' ? 'bg-violet-100 text-violet-600' : 'bg-emerald-100 text-emerald-600'}`}>
                            <Users size={14} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-black transition-colors ${tabColor === 'violet' ? 'group-hover:text-violet-600' : 'group-hover:text-emerald-600'}`}>
                              {s.number && s.number !== '-' ? `${s.number}번 ` : ''}{s.name}
                            </p>
                            <p className="text-xs text-neutral-500 font-medium truncate">{getActivityLabel(s)}</p>
                          </div>
                          {activityTab === 'results' ? (
                            <ExternalLink size={13} className="shrink-0 text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                          ) : (
                            <CheckCircle2 size={14} className={`shrink-0 ${tabColor === 'violet' ? 'text-violet-500' : 'text-emerald-500'}`} />
                          )}
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
                    <span className="text-sm font-black text-amber-700">⏳ 미제출 ({notSubmitted.length}명)</span>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar py-3">
                    {notSubmitted.length > 0 ? (
                      notSubmitted.map(s => (
                        <div key={s.id} className="flex items-center gap-3 px-5 sm:px-8 py-3 hover:bg-amber-50 transition-all group">
                          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-400 shrink-0">
                            <Users size={14} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-black group-hover:text-amber-600 transition-colors">
                              {s.number && s.number !== '-' ? `${s.number}번 ` : ''}{s.name}
                            </p>
                            <p className="text-xs text-neutral-500 font-medium">미제출</p>
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
                  <span className="text-sm font-black text-on-surface-variant/80 whitespace-nowrap">
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

    {/* 결과물 상세 모달 (학생 클릭 시) */}
    <AnimatePresence>
      {resultDetailStudent && (
        <div className="fixed inset-0 z-[950] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm" onClick={() => setResultDetailStudent(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            style={{ maxHeight: 'calc(100vh - 4rem)' }}
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 shrink-0">
              <div>
                <p className="font-black text-base">
                  {resultDetailStudent.number && resultDetailStudent.number !== '-' ? `${resultDetailStudent.number}번 ` : ''}
                  {resultDetailStudent.name}
                </p>
                <p className="text-[11px] text-neutral-400 font-bold mt-0.5">
                  {selectedActivityWeek ? `${selectedActivityWeek}주차 결과물` : '전체 결과물'} · 삭제/반려 처리
                </p>
              </div>
              <button onClick={() => setResultDetailStudent(null)} className="p-2 rounded-xl hover:bg-neutral-100 text-neutral-400 transition-all">
                <X size={18} />
              </button>
            </div>

            {/* 목록 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {resultDetailLoading ? (
                <div className="flex justify-center py-10"><Loader2 size={24} className="animate-spin text-primary" /></div>
              ) : resultDetailItems.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-neutral-400 gap-2">
                  <FolderOpen size={36} className="opacity-40" />
                  <p className="text-sm font-bold">결과물이 없습니다</p>
                </div>
              ) : (() => {
                const typeConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
                  text:  { icon: <AlignLeft size={13} />,  color: 'text-primary bg-primary/10',     label: '텍스트' },
                  link:  { icon: <Link2 size={13} />,      color: 'text-blue-500 bg-blue-50',       label: '링크' },
                  image: { icon: <ImageIcon size={13} />,  color: 'text-emerald-500 bg-emerald-50', label: '이미지' },
                  file:  { icon: <File size={13} />,       color: 'text-amber-500 bg-amber-50',     label: '파일' },
                };
                // submission_group 기준으로 그룹화
                const groups = Object.values(
                  resultDetailItems.reduce((acc: any, r: any) => {
                    const gId = r.submission_group || r.id;
                    if (!acc[gId]) acc[gId] = { groupId: gId, items: [], status: r.status || 'submitted', rejection_feedback: r.rejection_feedback, created_at: r.created_at, week_number: r.week_number };
                    acc[gId].items.push(r);
                    if (r.status === 'rejected') acc[gId].status = 'rejected';
                    return acc;
                  }, {})
                ) as any[];

                return groups.map((g: any) => {
                  const isRejected = g.status === 'rejected';
                  const isProcessing = resultProcessingGroupId === g.groupId;
                  return (
                    <div key={g.groupId} className={`p-4 rounded-2xl border-2 ${isRejected ? 'border-red-200 bg-red-50/30' : 'border-neutral-200 bg-neutral-50'}`}>
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {g.week_number && (
                              <span className="text-[10px] font-black text-primary bg-primary/10 px-2 py-0.5 rounded-md">{g.week_number}주차</span>
                            )}
                            {g.items.map((r: any) => {
                              const cfg = typeConfig[r.result_type] || typeConfig.file;
                              return (
                                <span key={r.id} className={`flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md ${cfg.color}`}>
                                  {cfg.icon}{cfg.label}
                                </span>
                              );
                            })}
                            {isRejected && (
                              <span className="text-[10px] font-black text-red-500 bg-red-50 border border-red-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                                <X size={9} /> 반려됨
                              </span>
                            )}
                          </div>
                          {g.items[0]?.title && <p className="text-sm font-black text-on-surface">{g.items[0].title}</p>}
                          {g.rejection_feedback && isRejected && (
                            <p className="text-xs text-red-600 font-bold bg-red-50 border border-red-100 rounded-xl px-3 py-2">{g.rejection_feedback}</p>
                          )}
                          <p className="text-[10px] text-neutral-400 font-bold">
                            {new Date(g.created_at).toLocaleString('ko-KR')}
                          </p>
                        </div>
                      </div>
                      {/* 액션 버튼 */}
                      <div className="flex gap-2 mt-3">
                        {!isRejected ? (
                          <button
                            onClick={() => { setResultRejectModal({ groupId: g.groupId }); setResultRejectFeedback(''); }}
                            disabled={isProcessing}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-600 border border-amber-200 rounded-xl font-black text-xs transition-all"
                          >
                            <RotateCw size={11} /> 반려
                          </button>
                        ) : (
                          <button
                            onClick={async () => {
                              setResultProcessingGroupId(g.groupId);
                              const col = g.items[0]?.submission_group ? 'submission_group' : 'id';
                              await supabase.from('student_results').update({ status: 'approved', rejection_feedback: null }).eq(col, g.groupId);
                              setResultDetailItems(prev => prev.map((r: any) =>
                                (r.submission_group || r.id) === g.groupId ? { ...r, status: 'approved', rejection_feedback: null } : r
                              ));
                              setResultProcessingGroupId(null);
                            }}
                            disabled={isProcessing}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 rounded-xl font-black text-xs transition-all"
                          >
                            <Check size={11} /> 반려 취소
                          </button>
                        )}
                        <button
                          onClick={() => handleDashboardDeleteGroup(g.groupId)}
                          disabled={isProcessing}
                          className="flex items-center justify-center gap-1.5 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-500 border border-red-200 rounded-xl font-black text-xs transition-all"
                        >
                          {isProcessing ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} 삭제
                        </button>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>

    {/* 반려 피드백 입력 모달 */}
    <AnimatePresence>
      {resultRejectModal && (
        <div className="fixed inset-0 z-[960] flex items-center justify-center p-6 bg-slate-900/50 backdrop-blur-sm" onClick={() => setResultRejectModal(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="p-6 space-y-4">
              <h3 className="font-black text-lg">반려 처리</h3>
              <p className="text-sm text-neutral-500">학생에게 전달할 피드백을 입력하세요. (선택사항)</p>
              <textarea
                value={resultRejectFeedback}
                onChange={e => setResultRejectFeedback(e.target.value)}
                placeholder="예: 결과물 내용이 부족합니다. 보완 후 다시 제출해주세요."
                className="w-full min-h-[90px] p-4 rounded-xl border border-neutral-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-200"
                autoFocus
              />
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => handleDashboardRejectGroup(resultRejectFeedback)}
                disabled={!!resultProcessingGroupId}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black text-sm transition-all disabled:opacity-50"
              >
                반려 처리하기
              </button>
              <button
                onClick={() => { setResultRejectModal(null); setResultRejectFeedback(''); }}
                className="px-5 py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-500 rounded-2xl font-black text-sm transition-all"
              >
                취소
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
    </>
  );
};

export default SubjectDashboard;
