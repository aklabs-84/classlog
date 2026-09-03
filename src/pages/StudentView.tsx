import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, User as UserIcon, BookOpen, Clock, Activity,
  Sparkles, CheckCircle2, ThumbsUp, Loader2, Pencil, Trash2,
  Check, X, FolderOpen, AlignLeft, Link2, ImageIcon, File,
  Upload, ExternalLink, Megaphone, MessageSquare, Reply, Send,
  RotateCw, AlertCircle, AlertTriangle, BookMarked, ChevronDown, ChevronUp,
  NotebookPen,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import { useAuth, fetchRemainingAiQuota } from '../lib/auth';
import { autoGradeResult, buildGradingContent, isResultGroupGradable, getLastRubric, setLastRubric } from '../lib/gemini';
import { downloadFile, openFile } from '../lib/fileUtils';
import Pagination from '../components/Pagination';
import CodeBlock from '../components/CodeBlock';
import { renderMaterialCallout } from '../components/MaterialCallout';
import { WeeklyTrendChart, type WeeklyTrendPoint } from '../components/share/ShareCharts';

// 모듈 레벨로 고정 — 매 렌더마다 새 참조가 생기면 ReactMarkdown이 details DOM을 리마운트해서 토글 상태가 초기화됨
const NOTE_MD_COMPONENTS: any = {
  h1: ({ children }: any) => <h1 className="text-2xl font-black mb-4 mt-6 text-on-surface">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-xl font-black mb-3 mt-5 text-on-surface">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-lg font-black mb-2 mt-4 text-on-surface">{children}</h3>,
  p: ({ children }: any) => <p className="mb-3 text-[15px] leading-relaxed text-on-surface">{children}</p>,
  ul: ({ children }: any) => <ul className="list-disc pl-6 mb-3 space-y-1">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal pl-6 mb-3 space-y-1">{children}</ol>,
  li: ({ children }: any) => <li className="text-[15px] text-on-surface">{children}</li>,
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-4 border-emerald-400 pl-4 italic text-on-surface-variant my-3 bg-surface-container-low py-2 rounded-r-xl">
      {children}
    </blockquote>
  ),
  code: ({ children, className }: any) => {
    if (!className) return <code className="bg-surface-container px-1.5 py-0.5 rounded text-sm font-mono text-primary">{children}</code>;
    return <code className={className}>{children}</code>;
  },
  pre: ({ children }: any) => {
    const child = (Array.isArray(children) ? children[0] : children) as any;
    const lang = (child?.props?.className || '').replace('language-', '') || 'text';
    const code = String(child?.props?.children ?? '').replace(/\n$/, '');
    return <CodeBlock lang={lang} code={code} />;
  },
  a: ({ href, children }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-emerald-600 underline hover:opacity-70">
      {children}
    </a>
  ),
  img: ({ src, alt, title }: any) => {
    const wm = (title || '').match(/(?:^|,)width:(\d+)/);
    const style = wm ? { width: `${wm[1]}px`, maxWidth: '100%' } : undefined;
    return <img src={src} alt={alt} style={style} className="max-w-full rounded-xl my-3 shadow" />;
  },
  hr: () => <hr className="border-surface-container my-5" />,
  strong: ({ children }: any) => <strong className="font-black text-on-surface">{children}</strong>,
  em: ({ children }: any) => <em className="italic">{children}</em>,
  table: ({ children }: any) => (
    <div className="overflow-auto mb-3">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }: any) => (
    <th className="border border-surface-container px-3 py-2 bg-surface-container font-black text-left">{children}</th>
  ),
  td: ({ children }: any) => (
    <td className="border border-surface-container px-3 py-2">{children}</td>
  ),
  details: ({ children }: any) => (
    <details className="group my-3 rounded-xl border border-surface-container overflow-hidden">{children}</details>
  ),
  summary: ({ children }: any) => (
    <summary className="px-4 py-2.5 bg-surface-container-low cursor-pointer font-black text-sm list-none flex items-center gap-2 hover:bg-surface-container transition-colors">
      <span className="text-emerald-600 text-xs transition-transform duration-200 group-open:rotate-90">▶</span> {children}
    </summary>
  ),
  div: (props: any) => renderMaterialCallout(props),
};

const StudentView = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { state: locationState } = useLocation();
  const fromClassId: string | undefined = locationState?.fromClassId;
  const { user } = useAuth();
  const [student, setStudent] = useState<any>(null);
  const [observations, setObservations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // AI Report States
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [insightCopied, setInsightCopied] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // Results & Suggestions States
  const [results, setResults] = useState<any[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [studentSuggestions, setStudentSuggestions] = useState<any[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [selectedResult, setSelectedResult] = useState<any>(null);

  // Classmates navigation
  const [classmates, setClassmates] = useState<{ id: string; full_name: string; student_number: string | null }[]>([]);

  // Result Action States
  const [rejectModal, setRejectModal] = useState<{ groupId: string } | null>(null);
  const [rejectFeedback, setRejectFeedback] = useState('');
  const [processingGroupId, setProcessingGroupId] = useState<string | null>(null);

  // Result Feedback States (반려 아닌 일반 피드백)
  const [feedbackGroupId, setFeedbackGroupId] = useState<string | null>(null);
  const [resultFeedbackText, setResultFeedbackText] = useState('');
  const [savingResultFeedback, setSavingResultFeedback] = useState(false);

  // Obs Reject States
  const [obsRejectModal, setObsRejectModal] = useState<{ obsId: string } | null>(null);
  const [obsRejectFeedback, setObsRejectFeedback] = useState('');
  const [obsRejectingId, setObsRejectingId] = useState<string | null>(null);

  // 타임라인 탭
  const [timelineTab, setTimelineTab] = useState<'all' | 'teacher' | 'student'>('all');

  // Student Notes (read-only for teacher)
  const [studentNotes, setStudentNotes] = useState<any[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [selectedNoteModal, setSelectedNoteModal] = useState<any | null>(null);

  // Reply States
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [savingReplyId, setSavingReplyId] = useState<string | null>(null);

  const handleSaveReply = async (suggestionId: string) => {
    if (!replyText.trim()) return;
    setSavingReplyId(suggestionId);
    try {
      const { error } = await supabase
        .from('student_suggestions')
        .update({
          teacher_reply: replyText.trim(),
          replied_at: new Date().toISOString(),
          is_reply_read: false
        })
        .eq('id', suggestionId);
      if (error) throw error;
      setStudentSuggestions(prev => prev.map(s =>
        s.id === suggestionId
          ? { ...s, teacher_reply: replyText.trim(), replied_at: new Date().toISOString(), is_reply_read: false }
          : s
      ));
      setReplyingId(null);
      setReplyText('');
      showToast('답변이 저장되었습니다. ✅');
    } catch (err) {
      console.error('Reply save error:', err);
      showToast('저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setSavingReplyId(null);
    }
  };

  // Edit / Delete States
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ activity_name: '', content: '', category: '' });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Unit Submissions States
  const [unitSubmissions, setUnitSubmissions] = useState<any[]>([]);
  const [allUnits, setAllUnits] = useState<any[]>([]);
  const [unitSubmissionsLoading, setUnitSubmissionsLoading] = useState(false);
  const [expandedUnitId, setExpandedUnitId] = useState<string | null>(null);

  // Result Evaluation States
  const [evalForms, setEvalForms] = useState<Record<string, { score: number; tags: string[]; note: string }>>({});
  const [savingEvalId, setSavingEvalId] = useState<string | null>(null);
  const [aiGradingKey, setAiGradingKey] = useState<string | null>(null);
  const [modalRubric, setModalRubric] = useState('');

  // Pagination States
  const TIMELINE_PAGE_SIZE = 1;
  const RESULTS_PAGE_SIZE = 1;
  const SUGGESTIONS_PAGE_SIZE = 1;
  const UNITS_PAGE_SIZE = 1;
  const NOTES_PAGE_SIZE = 1;
  const [timelinePage, setTimelinePage] = useState(1);
  const [resultsPage, setResultsPage] = useState(1);
  const [suggestionsPage, setSuggestionsPage] = useState(1);
  const [unitsPage, setUnitsPage] = useState(1);
  const [notesPage, setNotesPage] = useState(1);

  useEffect(() => { setTimelinePage(1); }, [timelineTab]);

  const timelineFiltered = useMemo(() => observations.filter(o =>
    timelineTab === 'all' ? true :
    timelineTab === 'teacher' ? !o.is_student_record :
    o.is_student_record
  ), [observations, timelineTab]);
  const timelineTotalPages = Math.max(1, Math.ceil(timelineFiltered.length / TIMELINE_PAGE_SIZE));

  // 주차별 성장 추이 — 관찰기록은 weekly_plan의 활동명 매칭으로, 결과제출은 week_number 컬럼으로 주차를 판별
  const weeklyTrendData = useMemo((): WeeklyTrendPoint[] => {
    const weeklyPlan: { week: number; topic: string }[] = student?.classes?.weekly_plan || [];
    const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
    const topicWeekMap: Record<string, number> = {};
    weeklyPlan.forEach(p => { topicWeekMap[norm(p.topic)] = p.week; });

    const weekMap: Record<number, { engagement: number; scoreSum: number; scoreCount: number }> = {};
    const ensure = (w: number) => {
      if (!weekMap[w]) weekMap[w] = { engagement: 0, scoreSum: 0, scoreCount: 0 };
      return weekMap[w];
    };

    observations.forEach(o => {
      const w = topicWeekMap[norm(o.activity_name || '')];
      if (w) ensure(w).engagement += 1;
    });
    results.forEach(r => {
      if (!r.week_number) return;
      const wk = ensure(r.week_number);
      wk.engagement += 1;
      if (typeof r.teacher_eval_score === 'number' && r.teacher_eval_score > 0) {
        wk.scoreSum += r.teacher_eval_score;
        wk.scoreCount += 1;
      }
    });

    return Object.entries(weekMap)
      .map(([week, v]) => ({ week: Number(week), engagement: v.engagement, avgScore: v.scoreCount > 0 ? v.scoreSum / v.scoreCount : null }))
      .sort((a, b) => a.week - b.week);
  }, [student, observations, results]);

  // 학습 상태 요약 — 최근 활동일은 커리큘럼 주차(weekly_plan)가 아닌 실제 기록 날짜 기준으로 계산
  // (weekly_plan 주차는 교사가 진도를 앞당기거나 늦추면 달력 날짜와 어긋날 수 있어 "이번 주" 판정에는 부적합)
  const summaryStats = useMemo(() => {
    const timestamps = [...observations, ...results]
      .map(r => r.created_at ? new Date(r.created_at).getTime() : NaN)
      .filter(t => !isNaN(t));
    const lastActivityTs = timestamps.length > 0 ? Math.max(...timestamps) : null;
    const daysSince = lastActivityTs !== null ? Math.floor((Date.now() - lastActivityTs) / (1000 * 60 * 60 * 24)) : null;

    const scored = results.filter(r => typeof r.teacher_eval_score === 'number' && r.teacher_eval_score > 0);
    const avgScore = scored.length > 0 ? scored.reduce((sum, r) => sum + r.teacher_eval_score, 0) / scored.length : null;

    // Classroom.tsx의 isClassClosed와 동일한 판정(is_closed 플래그 또는 end_date 경과) — 종료된 클래스는 활동이 없는 게 정상이라 활발/보통/저조 배지 대상에서 제외
    const todayStr = new Date().toISOString().slice(0, 10);
    const classEnded = !!student?.classes?.is_closed || (!!student?.classes?.end_date && student.classes.end_date < todayStr);

    return { daysSince, avgScore, classEnded };
  }, [observations, results, student]);

  // 타임라인 좌우 방향키 이동 (입력 중이거나 수정 폼이 열려있을 땐 비활성화)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (editingId) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;

      setTimelinePage(prev => {
        const safePage = Math.min(prev, timelineTotalPages);
        return e.key === 'ArrowLeft'
          ? Math.max(1, safePage - 1)
          : Math.min(timelineTotalPages, safePage + 1);
      });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [timelineTotalPages, editingId]);

  // Toast
  const [toasts, setToasts] = useState<{ id: string; msg: string; type: 'success' | 'error' }[]>([]);
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    const tid = Date.now().toString();
    setToasts(prev => [...prev, { id: tid, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== tid)), 3500);
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    fetchStudentData();
  }, [id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selectedNoteModal) { setSelectedNoteModal(null); return; }
      if (selectedResult) setSelectedResult(null);
      else if (obsRejectModal) { setObsRejectModal(null); setObsRejectFeedback(''); }
      else if (rejectModal) { setRejectModal(null); setRejectFeedback(''); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNoteModal, selectedResult, obsRejectModal, rejectModal]);

  const fetchStudentData = async () => {
    if (!id) return;
    setLoading(true);
    setAiInsight(null);
    try {
      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select(`*, classes(name, subject, teacher_id, weekly_plan, class_type, end_date, is_closed)`)
        .eq('id', id)
        .single();
      if (studentError) throw studentError;
      setStudent(studentData);
      if (studentData.behavior_insight) setAiInsight(studentData.behavior_insight);

      // 같은 반 학생 목록 조회 (번호순)
      const { data: classmatesData } = await supabase
        .from('students')
        .select('id, full_name, student_number')
        .eq('class_id', studentData.class_id)
        .order('student_number', { ascending: true });
      const sorted = (classmatesData || []).slice().sort((a: any, b: any) => {
        const na = parseInt(a.student_number);
        const nb = parseInt(b.student_number);
        const aHas = !isNaN(na) && a.student_number !== null && a.student_number !== '';
        const bHas = !isNaN(nb) && b.student_number !== null && b.student_number !== '';
        if (aHas && bHas) return na - nb;
        if (aHas) return -1;
        if (bHas) return 1;
        return a.full_name.localeCompare(b.full_name, 'ko');
      });
      setClassmates(sorted);

      const { data: obsData, error: obsError } = await supabase
        .from('observations')
        .select('*')
        .eq('student_id', id)
        .order('created_at', { ascending: false });
      if (obsError) throw obsError;
      setObservations(obsData || []);
    } catch (error) {
      console.error('Error fetching student data:', error);
    } finally {
      setLoading(false);
    }

    // results, suggestions, unit_submissions 병렬 조회
    setResultsLoading(true);
    setSuggestionsLoading(true);
    setUnitSubmissionsLoading(true);

    // studentData를 이 시점에 다시 가져올 수 없으므로 별도 조회
    const { data: classInfo } = await supabase
      .from('students')
      .select('class_id')
      .eq('id', id)
      .single();
    const classId = classInfo?.class_id;

    setNotesLoading(true);
    const [resResult, sugResult, unitSubResult, allUnitsResult, notesResult] = await Promise.all([
      supabase.from('student_results').select('*').eq('student_id', id).order('created_at', { ascending: false }),
      supabase.from('student_suggestions').select('*').eq('student_id', id).order('created_at', { ascending: false }),
      supabase.from('unit_submissions')
        .select('*, units(id, title, form_config)')
        .eq('student_id', id)
        .order('submitted_at', { ascending: false }),
      classId
        ? supabase.from('units').select('id, title, form_config, status, created_at').eq('class_id', classId).eq('status', 'completed').order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      classId
        ? supabase.from('student_notes').select('id, title, content, created_at, updated_at').eq('student_id', id).eq('class_id', classId).order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (!notesResult.error) setStudentNotes((notesResult as any).data || []);
    setNotesLoading(false);

    if (!resResult.error && resResult.data) {
      setResults(resResult.data);
      const initialEvals: Record<string, { score: number; tags: string[]; note: string }> = {};
      resResult.data.forEach((r: any) => {
        const gId = r.submission_group || r.id;
        if (!initialEvals[gId] && (r.teacher_eval_score || r.teacher_eval_note || r.teacher_eval_tags?.length)) {
          initialEvals[gId] = {
            score: r.teacher_eval_score || 0,
            tags: r.teacher_eval_tags || [],
            note: r.teacher_eval_note || '',
          };
        }
      });
      setEvalForms(prev => ({ ...prev, ...initialEvals }));
    } else if (!resResult.error) {
      setResults([]);
    }
    setResultsLoading(false);
    if (!sugResult.error) setStudentSuggestions(sugResult.data || []);
    setSuggestionsLoading(false);
    if (!unitSubResult.error) setUnitSubmissions(unitSubResult.data || []);
    if (!allUnitsResult.error) setAllUnits((allUnitsResult as any).data || []);
    setUnitSubmissionsLoading(false);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatRelativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const min = Math.floor(diff / 60000);
    const hour = Math.floor(min / 60);
    const day = Math.floor(hour / 24);
    if (min < 1) return '방금 전';
    if (min < 60) return `${min}분 전`;
    if (hour < 24) return `${hour}시간 전`;
    return `${day}일 전`;
  };

  // 모달이 여러 제출(_subGroups)을 병합해 보여줄 때, 특정 제출(groupId)의 상태 변경을
  // 대표 필드/groupItems/_subGroups 전체에 반영해 모달을 닫지 않고도 최신 상태로 유지
  const patchSelectedResultGroup = (groupId: string, patch: any) => {
    setSelectedResult((prev: any) => {
      if (!prev) return prev;
      const applyPatch = (arr: any[]) =>
        arr.map((r: any) => (r.submission_group || r.id) === groupId ? { ...r, ...patch } : r);
      const isRep = prev.groupId === groupId;
      return {
        ...prev,
        ...(isRep ? patch : {}),
        groupItems: prev.groupItems ? applyPatch(prev.groupItems) : prev.groupItems,
        _subGroups: prev._subGroups
          ? prev._subGroups.map((sg: any) => sg.groupId === groupId ? { ...sg, groupItems: applyPatch(sg.groupItems) } : sg)
          : prev._subGroups,
      };
    });
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('이 결과물을 삭제하시겠습니까?\n복구할 수 없습니다.')) return;
    setProcessingGroupId(groupId);
    try {
      const groupItems = results.filter((r: any) => (r.submission_group || r.id) === groupId);
      const storagePaths = groupItems.map((r: any) => r.storage_path).filter(Boolean);
      if (storagePaths.length > 0) {
        await supabase.storage.from('student-attachments').remove(storagePaths);
      }
      if (groupItems[0]?.submission_group) {
        // student_id 필터 필수 — 같은 submission_group을 가진 다른 조원의 행을 삭제하지 않음
        await supabase.from('student_results').delete()
          .eq('submission_group', groupId)
          .eq('student_id', id!);
      } else {
        await supabase.from('student_results').delete().eq('id', groupId);
      }
      setResults((prev: any[]) => prev.filter((r: any) => (r.submission_group || r.id) !== groupId));
      setSelectedResult((prev: any) => {
        if (!prev) return prev;
        const remaining = (prev._subGroups || [{ groupId: prev.groupId, groupItems: prev.groupItems }])
          .filter((sg: any) => sg.groupId !== groupId);
        if (remaining.length === 0) return null;
        const rep = remaining[0];
        return { ...rep.groupItems[0], groupId: rep.groupId, groupItems: rep.groupItems, _subGroups: remaining };
      });
      showToast('삭제되었습니다.');
    } catch {
      showToast('삭제 중 오류가 발생했습니다.', 'error');
    } finally {
      setProcessingGroupId(null);
    }
  };

  const handleRejectGroup = async (feedback: string) => {
    if (!rejectModal) return;
    const { groupId } = rejectModal;
    setProcessingGroupId(groupId);
    try {
      const firstItem = results.find((r: any) => (r.submission_group || r.id) === groupId);
      if (firstItem?.submission_group) {
        await supabase.from('student_results')
          .update({ status: 'rejected', rejection_feedback: feedback.trim() || null })
          .eq('submission_group', groupId);
      } else {
        await supabase.from('student_results')
          .update({ status: 'rejected', rejection_feedback: feedback.trim() || null })
          .eq('id', groupId);
      }
      setResults((prev: any[]) => prev.map((r: any) =>
        (r.submission_group || r.id) === groupId
          ? { ...r, status: 'rejected', rejection_feedback: feedback.trim() || null }
          : r
      ));
      patchSelectedResultGroup(groupId, { status: 'rejected', rejection_feedback: feedback.trim() || null });
      setRejectModal(null);
      setRejectFeedback('');
      showToast('반려 처리됐습니다. 학생이 수정 후 재제출할 수 있습니다.');
    } catch {
      showToast('처리 중 오류가 발생했습니다.', 'error');
    } finally {
      setProcessingGroupId(null);
    }
  };

  const handleSaveResultFeedback = async (groupId: string) => {
    const feedback = resultFeedbackText.trim();
    if (!feedback) return;
    setSavingResultFeedback(true);
    try {
      const groupItems = results.filter((r: any) => (r.submission_group || r.id) === groupId);
      const firstItem = groupItems[0];
      if (firstItem?.submission_group) {
        await supabase.from('student_results')
          .update({ teacher_feedback: feedback })
          .eq('submission_group', groupId);
      } else {
        await supabase.from('student_results')
          .update({ teacher_feedback: feedback })
          .eq('id', groupId);
      }
      setResults((prev: any[]) => prev.map((r: any) =>
        (r.submission_group || r.id) === groupId ? { ...r, teacher_feedback: feedback } : r
      ));
      patchSelectedResultGroup(groupId, { teacher_feedback: feedback });
      const classId = fromClassId || student?.class_id;
      if (classId) {
        // 조별 제출이면 조원 전원에게, 개인 제출이면 본인에게만 알림
        let memberIds: string[] = [id!];
        if (firstItem?.submission_group) {
          const { data: memberRows } = await supabase
            .from('student_results')
            .select('student_id')
            .eq('submission_group', groupId);
          memberIds = Array.from(new Set((memberRows || []).map((r: any) => r.student_id)));
        }
        const { error: notifErr } = await supabase.from('student_notifications').insert(
          memberIds.map((studentId) => ({
            student_id: studentId,
            class_id: classId,
            title: '결과 제출에 선생님 피드백이 도착했습니다',
            content: `"${firstItem?.title || '결과 제출'}" — ${feedback}`,
            type: 'feedback',
            is_read: false,
          }))
        );
        if (notifErr) console.error('student_notifications insert error (result feedback):', notifErr);
      }
      setFeedbackGroupId(null);
      setResultFeedbackText('');
      showToast('피드백이 저장되었습니다.');
    } catch {
      showToast('피드백 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setSavingResultFeedback(false);
    }
  };

  const handleDeleteResultFeedback = async (groupId: string) => {
    setSavingResultFeedback(true);
    try {
      const groupItems = results.filter((r: any) => (r.submission_group || r.id) === groupId);
      const firstItem = groupItems[0];
      if (firstItem?.submission_group) {
        await supabase.from('student_results')
          .update({ teacher_feedback: null })
          .eq('submission_group', groupId);
      } else {
        await supabase.from('student_results')
          .update({ teacher_feedback: null })
          .eq('id', groupId);
      }
      setResults((prev: any[]) => prev.map((r: any) =>
        (r.submission_group || r.id) === groupId ? { ...r, teacher_feedback: null } : r
      ));
      patchSelectedResultGroup(groupId, { teacher_feedback: null });
      setFeedbackGroupId(null);
      setResultFeedbackText('');
      showToast('피드백이 삭제되었습니다.');
    } catch {
      showToast('피드백 삭제 중 오류가 발생했습니다.', 'error');
    } finally {
      setSavingResultFeedback(false);
    }
  };

  const handleDownloadResult = (result: any) => {
    const { data } = supabase.storage.from('student-attachments').getPublicUrl(result.storage_path);
    downloadFile(data.publicUrl, result.display_name || 'download');
  };

  const handleOpenResultFile = (result: any) => {
    const { data } = supabase.storage.from('student-attachments').getPublicUrl(result.storage_path);
    openFile(data.publicUrl, result.display_name || 'file');
  };

  const handleApprove = async (obsId: string) => {
    setApprovingId(obsId);
    try {
      const { error } = await supabase
        .from('observations')
        .update({ status: 'approved' })
        .eq('id', obsId);
      if (!error) {
        setObservations(prev => prev.map(o => o.id === obsId ? { ...o, status: 'approved' } : o));
      }
    } catch (err) {
      console.error('승인 처리 오류:', err);
    } finally {
      setApprovingId(null);
    }
  };

  const handleRejectObs = async (obsId: string, feedback: string) => {
    setObsRejectingId(obsId);
    try {
      const { error } = await supabase
        .from('observations')
        .update({ status: 'rejected', teacher_feedback: feedback.trim() || null })
        .eq('id', obsId);
      if (!error) {
        setObservations(prev => prev.map(o =>
          o.id === obsId ? { ...o, status: 'rejected', teacher_feedback: feedback.trim() || null } : o
        ));
      }
    } catch (err) {
      console.error('반려 처리 오류:', err);
    } finally {
      setObsRejectingId(null);
      setObsRejectModal(null);
      setObsRejectFeedback('');
    }
  };

  const handleApproveFromRejected = async (obsId: string) => {
    setObsRejectingId(obsId);
    try {
      const { error } = await supabase
        .from('observations')
        .update({ status: 'approved', teacher_feedback: null })
        .eq('id', obsId);
      if (!error) {
        setObservations(prev => prev.map(o =>
          o.id === obsId ? { ...o, status: 'approved', teacher_feedback: null } : o
        ));
      }
    } finally {
      setObsRejectingId(null);
    }
  };

  const handleStartEdit = (obs: any) => {
    setEditingId(obs.id);
    setEditForm({
      activity_name: obs.activity_name || '',
      content: obs.content || '',
      category: obs.category || ''
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({ activity_name: '', content: '', category: '' });
  };

  const handleSaveEdit = async (obsId: string) => {
    if (!editForm.activity_name.trim()) {
      showToast('활동 제목을 입력해주세요.', 'error');
      return;
    }
    setSavingId(obsId);
    try {
      const { error } = await supabase
        .from('observations')
        .update({
          activity_name: editForm.activity_name.trim(),
          content: editForm.content.trim(),
          category: editForm.category.trim() || null
        })
        .eq('id', obsId);
      if (error) throw error;
      setObservations(prev => prev.map(o =>
        o.id === obsId
          ? { ...o, activity_name: editForm.activity_name.trim(), content: editForm.content.trim(), category: editForm.category.trim() || o.category }
          : o
      ));
      setEditingId(null);
      showToast('수정되었습니다.');
    } catch (err: any) {
      showToast('수정 중 오류가 발생했습니다.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (obsId: string) => {
    if (!confirm('이 기록을 삭제하시겠습니까? 삭제 후 복구할 수 없습니다.')) return;
    setDeletingId(obsId);
    try {
      const { error } = await supabase.from('observations').delete().eq('id', obsId);
      if (error) throw error;
      setObservations(prev => prev.filter(o => o.id !== obsId));
      showToast('삭제되었습니다.');
    } catch (err: any) {
      showToast('삭제 중 오류가 발생했습니다.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const copyInsight = () => {
    if (!aiInsight) return;
    navigator.clipboard.writeText(aiInsight);
    setInsightCopied(true);
    setTimeout(() => setInsightCopied(false), 2000);
  };

  const getEval = (groupId: string) => evalForms[groupId] || { score: 0, tags: [], note: '' };

  const toggleEvalTag = (groupId: string, tag: string) => {
    setEvalForms(prev => {
      const current = prev[groupId] || { score: 0, tags: [], note: '' };
      const tags = current.tags.includes(tag)
        ? current.tags.filter(t => t !== tag)
        : [...current.tags, tag];
      return { ...prev, [groupId]: { ...current, tags } };
    });
  };

  // groupId: 평가가 저장되는 대표 키 (모달의 첫 제출 건). allGroupIds: 같은 모달에 묶인 제출 건 전체
  // — 주차(모달) 전체에 대해 평가를 1회만 입력하되, DB에는 묶인 제출 건 전체 행에 동일하게 반영한다.
  const saveEvaluation = async (groupId: string, allGroupIds: string[] = [groupId]) => {
    const evalData = evalForms[groupId];
    if (!evalData) return;
    setSavingEvalId(groupId);
    try {
      const groupItems = results.filter((r: any) => allGroupIds.includes(r.submission_group || r.id));
      const payload = {
        teacher_eval_score: evalData.score || null,
        teacher_eval_tags: evalData.tags.length > 0 ? evalData.tags : null,
        teacher_eval_note: evalData.note.trim() || null,
      };
      // 조별 제출이면 submission_group 전체(다른 조원 포함)에 반영, 개인 제출이면 본인 row만
      const submissionGroups = Array.from(new Set(
        groupItems.filter((r: any) => r.submission_group).map((r: any) => r.submission_group)
      ));
      const standaloneIds = groupItems.filter((r: any) => !r.submission_group).map((r: any) => r.id);
      if (submissionGroups.length > 0) {
        await supabase.from('student_results').update(payload).in('submission_group', submissionGroups);
      }
      if (standaloneIds.length > 0) {
        await supabase.from('student_results').update(payload).in('id', standaloneIds);
      }
      showToast('평가가 저장되었습니다. ✅');
    } catch {
      showToast('저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setSavingEvalId(null);
    }
  };

  // 모달을 새로 열 때마다 이 클래스에서 마지막으로 사용한 채점 기준으로 입력창을 채워둔다.
  useEffect(() => {
    if (!selectedResult) return;
    const classId = student?.class_id;
    if (!classId) return;
    setModalRubric(getLastRubric(classId));
  }, [selectedResult?.groupId, student?.class_id]);

  // 모달에서 직접 입력/수정한 채점 기준으로 이 학생 1건만 채점하고, 다음에도 재사용되도록 저장한다.
  const handleAiSuggest = async (groupId: string, groupItems: any[]) => {
    const classId = student?.class_id;
    if (!classId) return;
    if (!isResultGroupGradable(groupItems)) {
      showToast('링크·압축파일 등은 AI 자동 채점을 지원하지 않아요. 직접 입력해주세요.', 'error');
      return;
    }
    const rubric = modalRubric;
    if (!rubric.trim()) {
      showToast('채점 기준을 먼저 입력해주세요.', 'error');
      return;
    }
    setAiGradingKey(groupId);
    try {
      const remaining = await fetchRemainingAiQuota(user?.id || '');
      if (remaining <= 0) {
        showToast('이번 달 AI 사용 한도에 도달했습니다.', 'error');
        return;
      }
      const content = await buildGradingContent(groupItems);
      const suggestion = await autoGradeResult(rubric, content, classId);
      if (suggestion) {
        setEvalForms(prev => ({ ...prev, [groupId]: { score: suggestion.score, tags: suggestion.tags, note: suggestion.comment } }));
        setLastRubric(classId, rubric);
        showToast('AI 채점 제안을 반영했습니다. 확인 후 저장해주세요. ✅');
      } else {
        showToast('AI 채점에 실패했습니다. 직접 입력해주세요.', 'error');
      }
    } finally {
      setAiGradingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const suggestionsTotalPages = Math.max(1, Math.ceil(studentSuggestions.length / SUGGESTIONS_PAGE_SIZE));
  const suggestionsSafePage = Math.min(suggestionsPage, suggestionsTotalPages);
  const pagedSuggestions = studentSuggestions.slice((suggestionsSafePage - 1) * SUGGESTIONS_PAGE_SIZE, suggestionsSafePage * SUGGESTIONS_PAGE_SIZE);

  const unitsTotalPages = Math.max(1, Math.ceil(allUnits.length / UNITS_PAGE_SIZE));
  const unitsSafePage = Math.min(unitsPage, unitsTotalPages);
  const pagedUnits = allUnits.slice((unitsSafePage - 1) * UNITS_PAGE_SIZE, unitsSafePage * UNITS_PAGE_SIZE);

  const notesTotalPages = Math.max(1, Math.ceil(studentNotes.length / NOTES_PAGE_SIZE));
  const notesSafePage = Math.min(notesPage, notesTotalPages);
  const pagedNotes = studentNotes.slice((notesSafePage - 1) * NOTES_PAGE_SIZE, notesSafePage * NOTES_PAGE_SIZE);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 md:p-8 max-w-7xl mx-auto font-pretendard space-y-6 md:space-y-8 pb-20"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <button
          onClick={() => navigate(`/classroom?id=${fromClassId || student?.class_id}`)}
          className="flex items-center gap-2 px-4 py-2 hover:bg-surface-container rounded-xl text-on-surface-variant font-bold transition-all group"
        >
          <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
          돌아가기
        </button>

        {/* 학생 네비게이션 */}
        {classmates.length > 1 && (() => {
          const currentIdx = classmates.findIndex(s => s.id === id);
          const prev = currentIdx > 0 ? classmates[currentIdx - 1] : null;
          const next = currentIdx < classmates.length - 1 ? classmates[currentIdx + 1] : null;
          const label = (s: typeof prev) => s ? [s.student_number ? `${s.student_number}번` : null, s.full_name].filter(Boolean).join(' ') : '';
          return (
            <div className="flex items-center gap-2">
              <button
                onClick={() => prev && navigate(`/student-view/${prev.id}`, { state: { fromClassId } })}
                disabled={!prev}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-neutral-200 hover:border-primary/40 hover:bg-primary/5 hover:text-primary rounded-xl text-sm font-black transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                title={label(prev)}
              >
                <ArrowLeft size={15} />
                {prev ? label(prev) : '이전 학생'}
              </button>

              <span className="text-[11px] font-black text-on-surface-variant/40 px-2">
                {currentIdx + 1} / {classmates.length}
              </span>

              <button
                onClick={() => next && navigate(`/student-view/${next.id}`, { state: { fromClassId } })}
                disabled={!next}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-neutral-200 hover:border-primary/40 hover:bg-primary/5 hover:text-primary rounded-xl text-sm font-black transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                title={label(next)}
              >
                {next ? label(next) : '다음 학생'}
                <ArrowLeft size={15} className="rotate-180" />
              </button>
            </div>
          );
        })()}

        <span className="px-4 py-1.5 bg-primary/10 text-primary rounded-full text-[11px] font-black uppercase tracking-widest border border-primary/20">
          Integrated Student Record
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Profile & AI */}
        <div className="lg:col-span-4 space-y-8">
          <div className="surface-card p-8 shadow-ambient border border-white/60 text-center relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-br from-primary/10 to-secondary/10" />
            <div className="relative z-10 flex flex-col items-center mt-8">
              <div className="w-24 h-24 bg-white rounded-[2rem] shadow-md flex items-center justify-center text-primary mb-6 group-hover:scale-105 transition-transform overflow-hidden">
                {student?.avatar_url ? (
                  <img src={student.avatar_url} alt={student?.full_name} className="w-full h-full object-cover" />
                ) : (
                  <UserIcon size={40} />
                )}
              </div>
              <h1 className="text-3xl font-black tracking-tight mb-2">{student?.full_name}</h1>
              <p className="text-on-surface-variant font-bold text-sm mb-6 flex items-center gap-2 justify-center">
                <span>{student?.classes?.name || '소속 반 없음'}</span>
                <span className="w-1 h-1 rounded-full bg-neutral-300" />
                <span>{student?.student_number ? `${student.student_number}번` : '번호 없음'}</span>
              </p>
              <div className="flex gap-2">
                <span className="px-3 py-1 bg-surface-container text-[11px] font-black uppercase text-on-surface-variant rounded-lg border border-neutral-200">
                  {student?.tag || '일반 학생'}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-8 pt-8 border-t border-surface-container/50 relative z-10">
              <div className="text-center">
                <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-1">Total Records</p>
                <p className="text-2xl font-black text-on-surface">{observations.length}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-1">Subjects</p>
                <p className="text-2xl font-black text-on-surface">
                  {new Set(observations.map(o => o.category || '기본')).size}
                </p>
              </div>
            </div>
          </div>

          {/* 학습 상태 요약 */}
          <div className="surface-card p-6 shadow-ambient border border-white/60">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-4">학습 상태 요약</p>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-on-surface-variant">최근 활동</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-on-surface">
                    {summaryStats.daysSince === null ? '기록 없음'
                      : summaryStats.daysSince === 0 ? '오늘'
                      : summaryStats.daysSince === 1 ? '어제'
                      : `${summaryStats.daysSince}일 전`}
                  </span>
                  {summaryStats.classEnded ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-neutral-100 text-neutral-400">
                      종료된 클래스
                    </span>
                  ) : summaryStats.daysSince !== null && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      summaryStats.daysSince <= 7 ? 'bg-secondary/10 text-secondary'
                      : summaryStats.daysSince <= 14 ? 'bg-neutral-100 text-neutral-500'
                      : 'bg-amber-100 text-amber-700'
                    }`}>
                      {summaryStats.daysSince <= 7 ? '활발' : summaryStats.daysSince <= 14 ? '보통' : '저조'}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-on-surface-variant">평균 평가점수</span>
                {summaryStats.avgScore !== null ? (
                  <span className="text-xs font-black text-amber-500 flex items-center gap-1">
                    {'★'.repeat(Math.round(summaryStats.avgScore))}{'☆'.repeat(5 - Math.round(summaryStats.avgScore))}
                    <span className="text-on-surface-variant/50 ml-1">{summaryStats.avgScore.toFixed(1)}</span>
                  </span>
                ) : (
                  <span className="text-xs font-bold text-on-surface-variant/40">평가 기록 없음</span>
                )}
              </div>
            </div>
          </div>

          {/* AI Insight — 행동특성 및 종합의견 (읽기전용) */}
          <div className="surface-card p-8 shadow-ambient bg-gradient-to-br from-primary/5 via-white to-secondary/5 border-primary/10 relative overflow-hidden">
            <div className="absolute right-[-10%] top-[-10%] text-primary/5 rotate-12 pointer-events-none"><Sparkles size={120} /></div>
            <div className="flex items-center gap-3 mb-2 relative z-10">
              <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-primary">
                <Sparkles size={20} />
              </div>
              <div>
                <h3 className="font-black text-base text-primary tracking-tight">행동특성 및 종합의견 초안</h3>
                <p className="text-[10px] font-bold text-on-surface-variant/50 mt-0.5">나이스 생기부 → 행동특성 및 종합의견란에 붙여넣기</p>
              </div>
            </div>
            <div className="relative z-10">
              {aiInsight ? (
                <div className="space-y-4">
                  <div className="bg-white/70 rounded-2xl p-4 border border-primary/10">
                    <div className="text-sm font-medium leading-relaxed text-on-surface/90">
                      <ReactMarkdown
                        components={{
                          h1: ({ children }) => <h1 className="text-base font-black mt-3 mb-1.5 first:mt-0">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-sm font-black mt-2.5 mb-1 first:mt-0">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-sm font-bold mt-2 mb-1 first:mt-0">{children}</h3>,
                          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                          strong: ({ children }) => <strong className="font-black">{children}</strong>,
                          ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>,
                          li: ({ children }) => <li className="text-sm">{children}</li>,
                        }}
                      >
                        {aiInsight}
                      </ReactMarkdown>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={copyInsight}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all border ${
                        insightCopied
                          ? 'bg-secondary/10 text-secondary border-secondary/30'
                          : 'bg-white text-on-surface-variant border-neutral-200 hover:border-primary/30 hover:text-primary'
                      }`}
                    >
                      {insightCopied ? <><CheckCircle2 size={13} /> 복사됨!</> : <><CheckCircle2 size={13} /> 나이스 붙여넣기용 복사</>}
                    </button>
                    <button
                      onClick={() => navigate(`/ai-assistant`)}
                      className="text-[10px] font-black text-primary/40 hover:text-primary transition-colors underline underline-offset-4"
                    >
                      AI 초안 페이지에서 재생성 →
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
                  <p className="text-xs font-bold text-on-surface-variant/60">
                    아직 생성된 초안이 없습니다.
                  </p>
                  <button
                    onClick={() => navigate(`/ai-assistant`)}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black border border-primary/20 bg-white text-primary hover:bg-primary/5 transition-colors"
                  >
                    <Sparkles size={13} /> AI 초안 페이지에서 생성하기
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Timeline */}
        <div className="lg:col-span-8 surface-card p-10 shadow-ambient border-white/60 min-h-[600px] flex flex-col">
          <div className="flex items-center justify-between border-b border-surface-container pb-6 mb-6">
            <h2 className="text-xl font-black flex items-center gap-3">
              <Activity size={24} className="text-primary" />
              과목 통합 활동 타임라인
            </h2>
            <div className="px-3 py-1.5 bg-neutral-100 rounded-lg text-xs font-bold text-neutral-500">
              총 {observations.length}건
            </div>
          </div>

          {/* 주차별 성장 추이 */}
          {weeklyTrendData.some(p => p.engagement > 0) && (
            <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-5 mb-8">
              <p className="text-xs font-black text-on-surface-variant/60 mb-2">주차별 성장 추이</p>
              <WeeklyTrendChart data={weeklyTrendData} height={200} />
            </div>
          )}

          {/* 탭 */}
          <div className="flex gap-1.5 mb-8 p-1 bg-surface-container rounded-xl w-fit">
            {([
              { key: 'all',     label: '전체',       count: observations.length },
              { key: 'teacher', label: '교사 메모',    count: observations.filter(o => !o.is_student_record).length },
              { key: 'student', label: '학생 제출',   count: observations.filter(o => o.is_student_record).length },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setTimelineTab(tab.key)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-black transition-all ${
                  timelineTab === tab.key
                    ? 'bg-white shadow-sm text-on-surface'
                    : 'text-on-surface-variant/60 hover:text-on-surface'
                }`}
              >
                {tab.label}
                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${
                  timelineTab === tab.key ? 'bg-primary/10 text-primary' : 'bg-surface-container-high text-on-surface-variant/50'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="flex-1 space-y-8">
            {(() => {
              const filtered = timelineFiltered;
              const timelineSafePage = Math.min(timelinePage, timelineTotalPages);
              const pagedTimeline = filtered.slice((timelineSafePage - 1) * TIMELINE_PAGE_SIZE, timelineSafePage * TIMELINE_PAGE_SIZE);
              return filtered.length > 0 ? (
              <>
              <div className="relative border-l-2 border-neutral-100 ml-4 space-y-10 pb-8">
                {pagedTimeline.map((obs) => {
                  const isEditing = editingId === obs.id;
                  const isDeleting = deletingId === obs.id;

                  return (
                    <div key={obs.id} className="relative pl-8 group">
                      <div className={`absolute left-[-9px] top-1 w-4 h-4 rounded-full bg-white border-4 group-hover:scale-125 transition-all shadow-sm ${obs.is_student_record ? 'border-primary group-hover:border-secondary' : 'border-emerald-400 group-hover:border-emerald-500'}`} />

                      {isEditing ? (
                        /* ── 인라인 수정 폼 ── */
                        <div className="bg-primary/[0.03] border-2 border-primary/20 rounded-2xl p-5 space-y-3">
                          {/* 주차 선택 칩 */}
                          {(() => {
                            const weeklyPlan: { week: number; topic: string }[] = student?.classes?.weekly_plan || [];
                            if (weeklyPlan.length === 0) return null;
                            const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
                            const activeWeek = weeklyPlan.find(p => norm(p.topic) === norm(editForm.activity_name))?.week ?? null;
                            return (
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-primary uppercase tracking-widest">주차 선택</label>
                                <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-0.5 px-0.5 scrollbar-thin">
                                  {weeklyPlan.map(p => (
                                    <button
                                      key={p.week}
                                      type="button"
                                      onClick={() => setEditForm(prev => ({ ...prev, activity_name: p.topic }))}
                                      className={`shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-black border transition-all whitespace-nowrap ${
                                        activeWeek === p.week
                                          ? 'bg-primary text-white border-primary'
                                          : 'bg-white text-neutral-400 border-neutral-200 hover:border-primary/40 hover:text-primary'
                                      }`}
                                    >
                                      {p.week}주차<span className={`ml-1 text-[9px] ${activeWeek === p.week ? 'text-white/70' : 'text-neutral-300'}`}>· {p.topic}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                          <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2 space-y-1">
                              <label className="text-[10px] font-black text-primary uppercase tracking-widest">활동 제목 *</label>
                              <input
                                type="text"
                                value={editForm.activity_name}
                                onChange={e => setEditForm(prev => ({ ...prev, activity_name: e.target.value }))}
                                className="w-full px-4 py-2.5 bg-white rounded-xl text-sm font-bold border-2 border-primary/10 focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">카테고리</label>
                              <input
                                type="text"
                                value={editForm.category}
                                onChange={e => setEditForm(prev => ({ ...prev, category: e.target.value }))}
                                placeholder="예: 국어, 수학..."
                                className="w-full px-4 py-2.5 bg-white rounded-xl text-sm font-bold border-2 border-surface-container focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all"
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">활동 내용</label>
                            <textarea
                              value={editForm.content}
                              onChange={e => setEditForm(prev => ({ ...prev, content: e.target.value }))}
                              rows={5}
                              className="w-full px-4 py-3 bg-white rounded-xl text-sm font-medium leading-relaxed border-2 border-surface-container focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/10 resize-none transition-all"
                            />
                          </div>
                          <div className="flex gap-3 pt-1">
                            <button
                              onClick={() => handleSaveEdit(obs.id)}
                              disabled={savingId === obs.id}
                              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-black text-xs hover:bg-primary/80 active:scale-95 transition-all disabled:opacity-50 shadow-sm"
                            >
                              {savingId === obs.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                              저장
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="flex items-center gap-2 px-5 py-2.5 bg-surface-container text-on-surface-variant rounded-xl font-black text-xs hover:bg-surface-container-high active:scale-95 transition-all"
                            >
                              <X size={13} /> 취소
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* ── 일반 카드 ── */
                        <>
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-3">
                            <div>
                              <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                                {!obs.is_student_record && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-black rounded border border-emerald-200 tracking-widest">
                                    선생님 관찰
                                  </span>
                                )}
                                <span className="inline-block px-2.5 py-1 bg-surface-container text-[10px] font-black uppercase text-on-surface-variant/60 rounded border border-neutral-200 tracking-widest">
                                  {obs.category || '활동'}
                                </span>
                                {(() => {
                                  const weeklyPlan: {week: number; topic: string}[] = student?.classes?.weekly_plan || [];
                                  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
                                  const matched = weeklyPlan.find(p => norm(p.topic) === norm(obs.activity_name || ''));
                                  if (!matched) return null;
                                  return (
                                    <span className="inline-block px-2.5 py-1 bg-primary/10 text-primary text-[10px] font-black rounded border border-primary/20">
                                      {matched.week}주차
                                    </span>
                                  );
                                })()}
                              </div>
                              <h4 className="text-lg font-black tracking-tight text-on-surface group-hover:text-primary transition-colors">
                                {obs.activity_name}
                              </h4>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="flex items-center gap-1 text-[11px] font-bold text-on-surface-variant/40">
                                <Clock size={12} />
                                {new Date(obs.created_at).toLocaleDateString('ko-KR')}
                              </span>
                              {/* 수정/삭제 버튼: 호버 시 표시 */}
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => handleStartEdit(obs)}
                                  title="수정"
                                  className="w-7 h-7 rounded-lg bg-surface-container hover:bg-primary/10 hover:text-primary flex items-center justify-center text-on-surface-variant transition-all"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  onClick={() => handleDelete(obs.id)}
                                  disabled={isDeleting}
                                  title="삭제"
                                  className="w-7 h-7 rounded-lg bg-surface-container hover:bg-error/10 hover:text-error flex items-center justify-center text-on-surface-variant transition-all disabled:opacity-50"
                                >
                                  {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="p-6 bg-neutral-50 rounded-2xl border border-neutral-100/50 text-sm font-medium text-on-surface/80 leading-relaxed group-hover:bg-primary/[0.02] group-hover:border-primary/10 transition-colors whitespace-pre-wrap">
                            {obs.content}
                          </div>

                          {obs.is_student_record && (
                            <div className="mt-3 flex flex-col gap-2">
                              {/* AI 검토 권장 카드 — 상태 무관하게 항상 표시 */}
                              {obs.ai_concern && (
                                <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 overflow-hidden shadow-sm">
                                  {/* 헤더: 라벨 + 처리결과 */}
                                  <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-100 border-b-2 border-amber-200">
                                    <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                                    <span className="text-[11px] font-black text-amber-800 uppercase tracking-widest">AI 검토 권장</span>
                                    <span className={`ml-auto text-[10px] font-black px-2.5 py-1 rounded-full border whitespace-nowrap ${
                                      obs.status === 'approved'
                                        ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                                        : obs.status === 'rejected'
                                        ? 'bg-red-100 text-red-600 border-red-300'
                                        : 'bg-amber-200 text-amber-800 border-amber-300'
                                    }`}>
                                      {obs.status === 'approved' && '✓ 검토 후 승인됨'}
                                      {obs.status === 'rejected' && '✕ 검토 후 반려됨'}
                                      {obs.status === 'pending'  && '⏳ 검토 대기 중'}
                                    </span>
                                  </div>
                                  {/* 검토 사유 본문 */}
                                  <div className="px-4 py-3">
                                    <p className="text-sm font-bold text-amber-900 leading-relaxed">{obs.ai_concern}</p>
                                  </div>
                                </div>
                              )}
                              <div className="flex items-center justify-between flex-wrap gap-2">
                              {obs.status === 'pending' ? (
                                <div className="flex items-center gap-3">
                                  <span className="flex items-center gap-1.5 text-[10px] font-black text-amber-500 uppercase tracking-widest bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">
                                    <Clock size={11} /> 승인 대기
                                  </span>
                                  <button
                                    onClick={() => handleApprove(obs.id)}
                                    disabled={approvingId === obs.id}
                                    className="flex items-center gap-1.5 px-4 py-1.5 bg-secondary text-white rounded-lg text-[11px] font-black hover:bg-secondary/80 active:scale-95 transition-all disabled:opacity-50 shadow-sm"
                                  >
                                    {approvingId === obs.id ? <Loader2 size={12} className="animate-spin" /> : <ThumbsUp size={12} />}
                                    승인하기
                                  </button>
                                </div>
                              ) : obs.status === 'rejected' ? (
                                <div className="flex items-center gap-3 flex-wrap">
                                  <span className="flex items-center gap-1.5 text-[10px] font-black text-red-500 bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg">
                                    <X size={11} /> 반려됨
                                  </span>
                                  {obs.teacher_feedback && (
                                    <span className="text-[10px] font-bold text-red-600/80 italic">"{obs.teacher_feedback}"</span>
                                  )}
                                  <button
                                    onClick={() => handleApproveFromRejected(obs.id)}
                                    disabled={obsRejectingId === obs.id}
                                    className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-lg text-[10px] font-black hover:bg-emerald-100 transition-all disabled:opacity-50"
                                  >
                                    {obsRejectingId === obs.id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                                    반려 취소
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-3">
                                  <div className="flex items-center gap-1.5 text-[10px] font-black text-secondary uppercase tracking-widest">
                                    <CheckCircle2 size={12} /> Student Submitted · 승인 완료
                                  </div>
                                  <button
                                    onClick={() => { setObsRejectModal({ obsId: obs.id }); setObsRejectFeedback(''); }}
                                    disabled={obsRejectingId === obs.id}
                                    className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-600 border border-amber-200 rounded-lg text-[10px] font-black hover:bg-amber-100 transition-all disabled:opacity-50"
                                  >
                                    <RotateCw size={11} /> 반려
                                  </button>
                                </div>
                              )}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              <Pagination page={timelineSafePage} totalPages={timelineTotalPages} onChange={setTimelinePage} />
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center space-y-6 text-on-surface-variant/40 py-20">
                <div className="w-24 h-24 rounded-full bg-neutral-50 flex items-center justify-center border border-neutral-100">
                  <BookOpen size={40} className="opacity-20" />
                </div>
                <div className="text-center">
                  <p className="text-lg font-black tracking-tight text-on-surface-variant/60">활동 기록이 없습니다.</p>
                  <p className="text-xs font-bold mt-2">학생이 활동을 등록하거나 선생님이 관찰 내용을 작성하면<br />여기에 타임라인으로 표시됩니다.</p>
                </div>
              </div>
            );
            })()}
          </div>
        </div>
      </div>

      {/* ─── 결과 제출 / 질문·건의함 / 단원 마무리 기록 / 나의 노트: 2단 그리드 ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

      {/* ─── 결과 제출 목록 ─── */}
      <div className="surface-card p-8 shadow-ambient border border-white/60">
        <div className="flex items-center justify-between mb-6 pb-5 border-b border-surface-container">
          <h2 className="text-xl font-black flex items-center gap-3">
            <FolderOpen size={22} className="text-primary" />
            결과 제출 목록
          </h2>
          <span className="px-3 py-1.5 bg-neutral-100 rounded-lg text-xs font-bold text-neutral-500">
            총 {(() => {
              const keys = new Set(results.map((r: any) => r.submission_group || r.id));
              return keys.size;
            })()}건
          </span>
        </div>

        {resultsLoading ? (
          <div className="flex justify-center py-10"><Loader2 size={28} className="animate-spin text-primary" /></div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center py-12 space-y-3 opacity-30">
            <FolderOpen size={48} />
            <p className="font-black">제출된 결과물이 없습니다.</p>
          </div>
        ) : (() => {
          const typeConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
            text:  { icon: <AlignLeft size={16} />,  color: 'text-primary bg-primary/10',       label: '텍스트' },
            link:  { icon: <Link2 size={16} />,      color: 'text-blue-500 bg-blue-50',         label: '링크' },
            image: { icon: <ImageIcon size={16} />,  color: 'text-emerald-500 bg-emerald-50',   label: '이미지' },
            file:  { icon: <File size={16} />,       color: 'text-amber-500 bg-amber-50',       label: '파일' }
          };

          // submission_group 기준으로 그룹핑
          const groups: Record<string, any[]> = {};
          results.forEach((r: any) => {
            const key = r.submission_group || r.id;
            if (!groups[key]) groups[key] = [];
            groups[key].push(r);
          });
          const groupedEntries = Object.entries(groups).sort(([, a], [, b]) =>
            new Date(b[0].created_at).getTime() - new Date(a[0].created_at).getTime()
          );

          // 같은 주차 + 같은 날짜(달력 기준)에 여러 번 제출한 건은 하나의 카드로 합침
          // — 가장 먼저 제출한 건을 대표로 표시하고, 나머지는 모달에서 각각 확인/처리
          const dayMap: Record<string, { groupId: string; groupItems: any[] }[]> = {};
          groupedEntries.forEach(([groupId, groupItems]) => {
            const weekNum = groupItems.find((r: any) => r.week_number)?.week_number ?? 0;
            const d = new Date(groupItems[0].created_at);
            const dayKey = `w${weekNum}_${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            if (!dayMap[dayKey]) dayMap[dayKey] = [];
            dayMap[dayKey].push({ groupId, groupItems });
          });
          const dayEntries = Object.values(dayMap).map(subGroups => {
            const sorted = [...subGroups].sort((a, b) =>
              new Date(a.groupItems[0].created_at).getTime() - new Date(b.groupItems[0].created_at).getTime()
            );
            return { groupId: sorted[0].groupId, groupItems: sorted[0].groupItems, subGroups: sorted };
          }).sort((a, b) => new Date(b.groupItems[0].created_at).getTime() - new Date(a.groupItems[0].created_at).getTime());

          const resultsTotalPages = Math.max(1, Math.ceil(dayEntries.length / RESULTS_PAGE_SIZE));
          const resultsSafePage = Math.min(resultsPage, resultsTotalPages);
          const pagedResults = dayEntries.slice((resultsSafePage - 1) * RESULTS_PAGE_SIZE, resultsSafePage * RESULTS_PAGE_SIZE);

          return (
            <>
            <div className="grid grid-cols-1 gap-4">
              {pagedResults.map(({ groupId, groupItems, subGroups }) => {
                const firstItem = groupItems[0];
                const isRejected = firstItem.status === 'rejected';
                const isProcessing = processingGroupId === groupId;
                const weekNumber = groupItems.find((r: any) => r.week_number)?.week_number;
                const title = groupItems.find((r: any) => r.title)?.title;
                const isGroupSubmission = groupItems.some((r: any) => r.is_group_submission);
                const types = [...new Set(groupItems.map((r: any) => r.result_type as string))];
                const textItem = groupItems.find((r: any) => r.result_type === 'text');
                const linkItem = groupItems.find((r: any) => r.result_type === 'link');
                const imageItem = groupItems.find((r: any) => r.result_type === 'image');
                const fileItem = groupItems.find((r: any) => r.result_type === 'file');
                const imageUrl = imageItem?.storage_path
                  ? supabase.storage.from('student-attachments').getPublicUrl(imageItem.storage_path).data.publicUrl
                  : null;

                return (
                  <div
                    key={groupId}
                    onClick={() => setSelectedResult({ ...firstItem, groupItems, groupId, _subGroups: subGroups })}
                    className={`p-5 rounded-2xl border-2 bg-surface-container-low hover:shadow-md transition-all group cursor-pointer ${
                      isRejected
                        ? 'border-red-200 bg-red-50/30 hover:border-red-300'
                        : 'border-surface-container hover:border-primary/30'
                    }`}
                  >
                    {/* 헤더: 타입 뱃지들 + 주차 + 반려 */}
                    <div className="flex items-center gap-1.5 flex-wrap mb-3">
                      {title && <p className="font-black text-sm group-hover:text-primary transition-colors w-full">{title}</p>}
                      {isGroupSubmission && (
                        <span className="flex items-center gap-1 text-xs font-black px-2.5 py-1 rounded-md bg-violet-100 text-violet-600 border border-violet-200">
                          👥 조별 제출
                        </span>
                      )}
                      {types.map(type => {
                        const cfg = typeConfig[type] || typeConfig.file;
                        return (
                          <span key={type} className={`flex items-center gap-1 text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-md ${cfg.color}`}>
                            {cfg.icon && <span className="scale-90">{cfg.icon}</span>}{cfg.label}
                          </span>
                        );
                      })}
                      {weekNumber && (
                        <span className="text-xs font-black px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/20">
                          {weekNumber}주차
                        </span>
                      )}
                      {subGroups.length > 1 && (
                        <span className="text-xs font-black px-2.5 py-1 rounded-md bg-amber-100 text-amber-700 border border-amber-200">
                          총 {subGroups.length}회 제출
                        </span>
                      )}
                      {isRejected && (
                        <span className="text-xs font-black text-red-500 bg-red-50 border border-red-200 px-2.5 py-1 rounded-md flex items-center gap-1">
                          <X size={11} /> 반려됨
                        </span>
                      )}
                      {(() => {
                        const cardEv = subGroups.map((s: any) => evalForms[s.groupId]).find((e: any) => (e?.score ?? 0) > 0);
                        return cardEv && cardEv.score > 0 && (
                          <span className="text-xs font-black text-amber-500 flex items-center gap-0.5">
                            {'★'.repeat(cardEv.score)}<span className="text-[10px] text-amber-400/60 ml-0.5">평가됨</span>
                          </span>
                        );
                      })()}
                      {firstItem.teacher_feedback && (
                        <span className="flex items-center gap-1 text-xs font-black px-2.5 py-1 rounded-md bg-indigo-100 text-indigo-600 border border-indigo-200">
                          <MessageSquare size={11} /> 피드백
                        </span>
                      )}
                    </div>

                    {/* 내용 미리보기 */}
                    <div className="space-y-2">
                      {textItem?.text_content && (
                        <div className="flex items-start gap-2">
                          <AlignLeft size={12} className="text-primary shrink-0 mt-0.5" />
                          <p className="text-xs font-medium text-on-surface/80 leading-relaxed line-clamp-2 whitespace-pre-wrap">
                            {textItem.text_content}
                          </p>
                        </div>
                      )}
                      {linkItem?.link_url && (
                        <div className="flex items-center gap-2">
                          <Link2 size={12} className="text-blue-500 shrink-0" />
                          <p className="text-xs font-bold text-blue-500 truncate">{linkItem.link_url}</p>
                        </div>
                      )}
                      {imageItem && imageUrl && (
                        <div className="flex items-center gap-2">
                          <ImageIcon size={12} className="text-emerald-500 shrink-0" />
                          <img src={imageUrl} alt={title || '이미지'} className="max-h-16 rounded-lg object-cover" />
                        </div>
                      )}
                      {fileItem && (
                        <div className="flex items-center gap-2">
                          <File size={12} className="text-amber-500 shrink-0" />
                          <p className="text-xs font-bold text-amber-600 truncate">
                            {fileItem.display_name}{fileItem.file_size ? ` (${formatFileSize(fileItem.file_size)})` : ''}
                          </p>
                        </div>
                      )}
                    </div>

                    <p className="text-[10px] font-bold text-on-surface-variant/40 flex items-center gap-1 mt-3">
                      <Clock size={10} />{formatRelativeTime(firstItem.created_at)}
                    </p>

                    {/* 삭제/반려 버튼 (hover) */}
                    <div className="flex gap-2 pt-3 mt-2 border-t border-surface-container opacity-0 group-hover:opacity-100 transition-opacity">
                      {!isRejected && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRejectModal({ groupId });
                            setRejectFeedback('');
                          }}
                          disabled={isProcessing}
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-600 border border-amber-200 rounded-xl font-black text-xs transition-all"
                        >
                          <RotateCw size={11} /> 반려
                        </button>
                      )}
                      {isRejected && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            setResults((prev: any[]) => prev.map((item: any) =>
                              (item.submission_group || item.id) === groupId
                                ? { ...item, status: 'approved', rejection_feedback: null }
                                : item
                            ));
                            await supabase.from('student_results')
                              .update({ status: 'approved', rejection_feedback: null })
                              .eq(firstItem.submission_group ? 'submission_group' : 'id', groupId);
                          }}
                          disabled={isProcessing}
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 rounded-xl font-black text-xs transition-all"
                        >
                          <Check size={11} /> 반려 취소
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteGroup(groupId);
                        }}
                        disabled={isProcessing}
                        className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-500 border border-red-200 rounded-xl font-black text-xs transition-all"
                      >
                        {isProcessing ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />} 삭제
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <Pagination page={resultsSafePage} totalPages={resultsTotalPages} onChange={setResultsPage} />
            </>
          );
        })()}
      </div>

      {/* ─── 질문·건의함 ─── */}
      <div className="surface-card p-8 shadow-ambient border border-white/60">
        <div className="flex items-center justify-between mb-6 pb-5 border-b border-surface-container">
          <h2 className="text-xl font-black flex items-center gap-3">
            <Megaphone size={22} className="text-primary" />
            질문·건의함
          </h2>
          <span className="px-3 py-1.5 bg-neutral-100 rounded-lg text-xs font-bold text-neutral-500">
            총 {studentSuggestions.length}건
          </span>
        </div>

        {suggestionsLoading ? (
          <div className="flex justify-center py-10"><Loader2 size={28} className="animate-spin text-primary" /></div>
        ) : studentSuggestions.length === 0 ? (
          <div className="flex flex-col items-center py-12 space-y-3 opacity-30">
            <Megaphone size={48} />
            <p className="font-black">등록된 질문·건의함 내용이 없습니다.</p>
          </div>
        ) : (
          <>
          <div className="space-y-3">
            {pagedSuggestions.map(s => {
              const isReplying = replyingId === s.id;
              return (
                <div
                  key={s.id}
                  className="rounded-2xl border border-surface-container bg-surface-container-low overflow-hidden transition-all hover:border-primary/20"
                >
                  {/* 학생 건의 내용 */}
                  <div className="flex items-start gap-4 p-5">
                    <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center text-rose-400 shrink-0 mt-0.5">
                      <MessageSquare size={16} />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-sm font-medium text-on-surface leading-relaxed">{s.content}</p>
                      <p className="text-[10px] font-bold text-on-surface-variant/40 flex items-center gap-1">
                        <Clock size={10} />{formatRelativeTime(s.created_at)}
                      </p>
                    </div>
                  </div>

                  {/* 답변 영역 */}
                  {isReplying ? (
                    <div className="border-t border-surface-container bg-primary/[0.02] p-5 space-y-3">
                      <textarea
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        rows={3}
                        autoFocus
                        placeholder="학생에게 전달할 답변을 입력하세요..."
                        className="w-full px-4 py-3 bg-white rounded-xl text-sm font-medium border border-neutral-200 focus:border-primary/40 focus:outline-none resize-none transition-all"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSaveReply(s.id)}
                          disabled={savingReplyId === s.id || !replyText.trim()}
                          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-xs font-black hover:bg-primary/80 disabled:opacity-50 transition-all shadow-sm"
                        >
                          {savingReplyId === s.id ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                          답변 저장
                        </button>
                        <button
                          onClick={() => { setReplyingId(null); setReplyText(''); }}
                          className="px-5 py-2.5 text-neutral-400 rounded-xl text-xs font-black hover:bg-neutral-100 transition-all"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ) : s.teacher_reply ? (
                    <div className="border-t border-primary/10 bg-primary/[0.03] p-5">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center text-primary shrink-0 mt-0.5">
                          <Reply size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-black text-primary uppercase tracking-wider mb-1.5">선생님 답변</p>
                          <p className="text-sm font-medium text-on-surface leading-relaxed">{s.teacher_reply}</p>
                          {s.replied_at && (
                            <p className="text-[10px] font-bold text-on-surface-variant/30 mt-1.5 flex items-center gap-1">
                              <Clock size={10} />{formatRelativeTime(s.replied_at)}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => { setReplyingId(s.id); setReplyText(s.teacher_reply); }}
                          className="text-xs font-black text-primary/50 hover:text-primary transition-colors shrink-0 px-3 py-1.5 rounded-lg hover:bg-primary/10"
                        >
                          수정
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="border-t border-surface-container px-5 py-3">
                      <button
                        onClick={() => { setReplyingId(s.id); setReplyText(''); }}
                        className="text-sm font-black text-primary/60 hover:text-primary flex items-center gap-2 transition-colors"
                      >
                        <Reply size={14} /> 답변 작성
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Pagination page={suggestionsSafePage} totalPages={suggestionsTotalPages} onChange={setSuggestionsPage} />
          </>
        )}
      </div>

      {/* ─── 단원기록 ─── */}
      <div className="surface-card p-8 shadow-ambient border border-white/60">
        <div className="flex items-center justify-between mb-6 pb-5 border-b border-surface-container">
          <h2 className="text-xl font-black flex items-center gap-3">
            <BookMarked size={22} className="text-primary" />
            단원 마무리 기록
          </h2>
          <span className="px-3 py-1.5 bg-neutral-100 rounded-lg text-xs font-bold text-neutral-500">
            {unitSubmissions.length}건 제출 / 총 {allUnits.length}개 단원
          </span>
        </div>

        {unitSubmissionsLoading ? (
          <div className="flex justify-center py-10"><Loader2 size={28} className="animate-spin text-primary" /></div>
        ) : allUnits.length === 0 ? (
          <div className="flex flex-col items-center py-12 space-y-3 opacity-30">
            <BookMarked size={48} />
            <p className="font-black">생성된 단원이 없습니다.</p>
            <p className="text-xs font-bold text-center">선생님이 단원을 마무리하면 여기에 기록이 표시됩니다.</p>
          </div>
        ) : (
          <>
          <div className="space-y-3">
            {pagedUnits.map(unit => {
              const sub = unitSubmissions.find((s: any) => s.unit_id === unit.id || s.units?.id === unit.id);
              const cfg: Record<string, boolean> = unit.form_config || {};
              const isExpanded = expandedUnitId === unit.id;
              const hasContent = sub && (sub.performance_record || sub.inquiry_reflection || sub.self_eval || sub.reading_record_title);

              const FORM_LABELS: Record<string, string> = {
                performance_record: '수행평가 활동 기술',
                inquiry_reflection: '탐구소감문',
                self_eval: '자기평가서',
                reading_record: '독서기록',
              };
              const enabledFields = Object.entries(cfg).filter(([, v]) => v).map(([k]) => k);

              return (
                <div
                  key={unit.id}
                  className={`rounded-2xl border-2 overflow-hidden transition-colors ${
                    sub ? 'border-secondary/20 bg-secondary/[0.02]' : 'border-surface-container bg-surface-container-low'
                  }`}
                >
                  {/* 단원 헤더 */}
                  <div
                    className="flex items-center gap-4 p-5 cursor-pointer hover:bg-surface-container/30 transition-colors"
                    onClick={() => {
                      if (!hasContent) return;
                      setExpandedUnitId(prev => prev === unit.id ? null : unit.id);
                    }}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      sub ? 'bg-secondary/10 text-secondary' : 'bg-surface-container text-on-surface-variant/40'
                    }`}>
                      <BookMarked size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h4 className="font-black text-sm">{unit.title}</h4>
                        {sub ? (
                          <span className="px-2 py-0.5 rounded-lg text-[9px] font-black bg-secondary/10 text-secondary uppercase tracking-wider">
                            제출 완료
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-lg text-[9px] font-black bg-neutral-100 text-neutral-400 uppercase tracking-wider">
                            미제출
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {enabledFields.map(f => (
                          <span key={f} className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                            sub && sub[f === 'reading_record' ? 'reading_record_title' : f]
                              ? 'bg-secondary/5 text-secondary border-secondary/20'
                              : 'bg-white text-on-surface-variant/40 border-neutral-200'
                          }`}>
                            {FORM_LABELS[f] || f}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {sub?.submitted_at && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-on-surface-variant/40">
                          <Clock size={11} />
                          {new Date(sub.submitted_at).toLocaleDateString('ko-KR')}
                        </span>
                      )}
                      {hasContent && (
                        <div className="text-on-surface-variant/30">
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 제출 내용 펼침 */}
                  {isExpanded && hasContent && (
                    <div className="border-t border-surface-container bg-white p-6 space-y-5">
                      {sub.performance_record && (
                        <div className="space-y-2">
                          <p className="text-[10px] font-black text-primary uppercase tracking-widest">수행평가 활동 기술</p>
                          <div className="p-4 bg-primary/[0.03] rounded-xl border border-primary/10 text-sm font-medium text-on-surface/80 leading-relaxed whitespace-pre-wrap">
                            {sub.performance_record}
                          </div>
                          <p className="text-[10px] font-bold text-on-surface-variant/40 text-right">{sub.performance_record.length}자</p>
                        </div>
                      )}
                      {sub.inquiry_reflection && (
                        <div className="space-y-2">
                          <p className="text-[10px] font-black text-violet-600 uppercase tracking-widest">탐구소감문</p>
                          <div className="p-4 bg-violet-50/40 rounded-xl border border-violet-100 text-sm font-medium text-on-surface/80 leading-relaxed whitespace-pre-wrap">
                            {sub.inquiry_reflection}
                          </div>
                          <p className="text-[10px] font-bold text-on-surface-variant/40 text-right">{sub.inquiry_reflection.length}자</p>
                        </div>
                      )}
                      {sub.self_eval && (
                        <div className="space-y-2">
                          <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">자기평가서</p>
                          <div className="p-4 bg-emerald-50/40 rounded-xl border border-emerald-100 text-sm font-medium text-on-surface/80 leading-relaxed whitespace-pre-wrap">
                            {sub.self_eval}
                          </div>
                          <p className="text-[10px] font-bold text-on-surface-variant/40 text-right">{sub.self_eval.length}자</p>
                        </div>
                      )}
                      {sub.reading_record_title && (
                        <div className="space-y-2">
                          <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">독서기록</p>
                          <div className="p-4 bg-amber-50/40 rounded-xl border border-amber-100 space-y-2">
                            <div className="flex items-center gap-3 text-sm">
                              <span className="font-black text-on-surface">{sub.reading_record_title}</span>
                              {sub.reading_record_author && (
                                <span className="text-on-surface-variant/60 font-bold">— {sub.reading_record_author}</span>
                              )}
                            </div>
                            {sub.reading_record_reflection && (
                              <p className="text-sm font-medium text-on-surface/80 leading-relaxed whitespace-pre-wrap pt-2 border-t border-amber-100">
                                {sub.reading_record_reflection}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Pagination page={unitsSafePage} totalPages={unitsTotalPages} onChange={setUnitsPage} />
          </>
        )}
      </div>

      {/* ─── 나의 노트 (선생님 읽기 전용) ─── */}
      <div className="surface-card p-8 shadow-ambient border border-white/60">
        <div className="flex items-center justify-between mb-6 pb-5 border-b border-surface-container">
          <h2 className="text-xl font-black flex items-center gap-3">
            <NotebookPen size={22} className="text-emerald-500" />
            나의 노트
          </h2>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-black border border-emerald-100">
              읽기 전용
            </span>
            <span className="px-3 py-1.5 bg-neutral-100 rounded-lg text-xs font-bold text-neutral-500">
              총 {studentNotes.length}개
            </span>
          </div>
        </div>

        {notesLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 size={28} className="animate-spin text-emerald-400" />
          </div>
        ) : studentNotes.length === 0 ? (
          <div className="flex flex-col items-center py-12 space-y-3 opacity-30">
            <NotebookPen size={48} />
            <p className="font-black">작성된 노트가 없습니다.</p>
            <p className="text-xs font-bold text-center">학생이 수업 중 노트를 작성하면 여기에 표시됩니다.</p>
          </div>
        ) : (
          <>
          <div className="space-y-3">
            {pagedNotes.map(note => {
              const preview = note.content
                .replace(/[#*_`>\[\]()\-!]/g, '')
                .replace(/\n+/g, ' ')
                .trim()
                .slice(0, 100);
              return (
                <button
                  key={note.id}
                  onClick={() => setSelectedNoteModal(note)}
                  className="w-full text-left rounded-2xl border border-surface-container bg-surface-container-low/50 p-5 transition-all hover:border-emerald-300 hover:bg-emerald-50/30 hover:shadow-sm group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-emerald-100 transition-colors">
                        <NotebookPen size={15} className="text-emerald-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-black text-sm text-on-surface truncate group-hover:text-emerald-700 transition-colors">
                          {note.title || '제목 없음'}
                        </p>
                        {preview && (
                          <p className="text-xs text-on-surface-variant/60 font-medium mt-1 line-clamp-2 leading-relaxed">
                            {preview}
                          </p>
                        )}
                        <p className="text-[10px] font-bold text-on-surface-variant/40 mt-2 flex items-center gap-1">
                          <Clock size={10} />
                          {formatRelativeTime(note.updated_at)} 수정
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 mt-1 px-2.5 py-1 rounded-lg bg-white border border-emerald-100 text-[10px] font-black text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      열기 →
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          <Pagination page={notesSafePage} totalPages={notesTotalPages} onChange={setNotesPage} />
          </>
        )}
      </div>

      </div>

      {/* ─── 노트 상세 모달 ─── */}
      <AnimatePresence>
        {selectedNoteModal && (
          <div
            className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setSelectedNoteModal(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.18 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-2xl max-h-[85vh] bg-white rounded-[2rem] shadow-2xl flex flex-col overflow-hidden"
            >
              {/* 모달 헤더 */}
              <div className="flex items-start justify-between gap-4 px-8 pt-8 pb-5 border-b border-neutral-100 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-100 flex items-center justify-center shrink-0">
                    <NotebookPen size={18} className="text-emerald-600" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-black text-on-surface leading-snug truncate">
                      {selectedNoteModal.title || '제목 없음'}
                    </h2>
                    <p className="text-[11px] font-bold text-on-surface-variant/50 mt-0.5 flex items-center gap-1">
                      <Clock size={10} />
                      {formatRelativeTime(selectedNoteModal.updated_at)} 수정
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedNoteModal(null)}
                  className="shrink-0 w-8 h-8 rounded-xl bg-surface-container flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* 본문 스크롤 영역 */}
              <div className="flex-1 overflow-y-auto px-8 py-6">
                {selectedNoteModal.content.trim() ? (
                  <div className="max-w-none">
                    <ReactMarkdown components={NOTE_MD_COMPONENTS} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                      {selectedNoteModal.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 opacity-30">
                    <NotebookPen size={40} />
                    <p className="font-black mt-3">내용이 없습니다.</p>
                  </div>
                )}
              </div>

              {/* 모달 푸터 */}
              <div className="shrink-0 px-8 py-4 border-t border-neutral-100 flex items-center justify-between">
                <span className="text-[11px] font-bold text-on-surface-variant/40">
                  읽기 전용 · 학생이 작성한 노트입니다
                </span>
                <button
                  onClick={() => setSelectedNoteModal(null)}
                  className="px-4 py-2 rounded-xl bg-surface-container text-xs font-black text-on-surface-variant hover:bg-surface-container-high transition-colors"
                >
                  닫기
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── 결과 상세 모달 ─── */}
      <AnimatePresence>
        {selectedResult && (
          <div className="fixed inset-0 z-[1000] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6" onClick={() => setSelectedResult(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-2xl max-h-[85vh] bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col"
            >
              {/* 모달 헤더 */}
              <div className="flex items-start justify-between p-8 pb-4 shrink-0">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {(() => {
                      const modalItems = selectedResult.groupItems || [selectedResult];
                      const modalTitle = modalItems.find((r: any) => r.title)?.title;
                      const modalWeek = modalItems.find((r: any) => r.week_number)?.week_number;
                      const modalIsGroup = modalItems.some((r: any) => r.is_group_submission);
                      const typeConfig: Record<string, { color: string; label: string }> = {
                        text:  { color: 'text-primary bg-primary/10',     label: '텍스트' },
                        link:  { color: 'text-blue-500 bg-blue-50',       label: '링크' },
                        image: { color: 'text-emerald-500 bg-emerald-50', label: '이미지' },
                        file:  { color: 'text-amber-500 bg-amber-50',     label: '파일' }
                      };
                      const types: string[] = [...new Set<string>(modalItems.map((r: any) => r.result_type as string))];
                      return (
                        <>
                          {modalTitle && <h3 className="text-xl font-black tracking-tight w-full">{modalTitle}</h3>}
                          {modalIsGroup && (
                            <span className="flex items-center gap-1 text-xs font-black px-2.5 py-1 rounded-md bg-violet-100 text-violet-600 border border-violet-200">
                              👥 조별 제출
                            </span>
                          )}
                          {types.map(type => {
                            const cfg = typeConfig[type] || { color: 'text-neutral-500 bg-neutral-100', label: type };
                            return (
                              <span key={type} className={`text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-md ${cfg.color}`}>
                                {cfg.label}
                              </span>
                            );
                          })}
                          {modalWeek && (
                            <span className="text-xs font-black px-2.5 py-1 rounded-md bg-primary/10 text-primary border border-primary/20">
                              {modalWeek}주차
                            </span>
                          )}
                          {selectedResult._subGroups?.length > 1 && (
                            <span className="text-xs font-black px-2.5 py-1 rounded-md bg-amber-100 text-amber-700 border border-amber-200">
                              총 {selectedResult._subGroups.length}회 제출
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <p className="text-[11px] font-bold text-on-surface-variant/50 flex items-center gap-1">
                    <Clock size={11} />{new Date(selectedResult.created_at).toLocaleString('ko-KR')}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedResult(null)}
                  className="p-2 rounded-xl hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-all shrink-0 ml-4"
                >
                  <X size={20} />
                </button>
              </div>

              {/* 모달 내용 — 병합된 제출 각각을 독립적으로 렌더링 */}
              <div className="px-8 pb-8 space-y-4 flex-1 overflow-y-auto overflow-x-hidden">
                {(() => {
                  const weekSubGroups = selectedResult._subGroups || [{ groupId: selectedResult.groupId, groupItems: selectedResult.groupItems }];
                  const weekGroupId = selectedResult.groupId;
                  const weekGroupIds = weekSubGroups.map((s: any) => s.groupId);
                  // 과거에 제출 건별로 평가가 저장된 레거시 데이터도 놓치지 않도록, 대표 키에 값이 없으면
                  // 같은 모달에 묶인 다른 제출 건의 기존 평가를 찾아 보여준다.
                  const weekEv = weekGroupIds
                    .map((gid: string) => evalForms[gid])
                    .find((e: any) => e && (e.score || e.tags?.length || e.note))
                    || getEval(weekGroupId);
                  const weekGroupItems = results.filter((r: any) => weekGroupIds.includes(r.submission_group || r.id));
                  const weekGradable = isResultGroupGradable(weekGroupItems);
                  return (
                    <div className="p-5 bg-violet-50/50 rounded-2xl border border-violet-100 space-y-4">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-[11px] font-black text-violet-700 uppercase tracking-widest">교사 평가 — 나이스 세특 참고용 (이번 제출 전체 기준 1회)</p>
                      </div>
                      {weekGradable ? (
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-on-surface-variant/70">AI 채점 기준 (수정 가능 · 클래스별로 마지막 사용 기준이 자동으로 채워집니다)</label>
                          <div className="flex items-start gap-2">
                            <textarea
                              value={modalRubric}
                              onChange={e => setModalRubric(e.target.value)}
                              placeholder="예: 자료 조사의 깊이와 자기 생각의 논리성을 중점적으로 평가해주세요."
                              rows={2}
                              className="flex-1 px-3 py-2 rounded-xl border border-violet-200 bg-white text-xs text-on-surface resize-none focus:outline-none focus:ring-2 focus:ring-violet-300"
                            />
                            <button
                              onClick={() => handleAiSuggest(weekGroupId, weekGroupItems)}
                              disabled={!modalRubric.trim() || aiGradingKey === weekGroupId}
                              title={!modalRubric.trim() ? '채점 기준을 먼저 입력해주세요.' : undefined}
                              className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-[10px] font-black text-violet-500 bg-white border border-violet-200 hover:bg-violet-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                            >
                              {aiGradingKey === weekGroupId ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                              AI 채점 제안
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-700">
                          <AlertTriangle size={12} className="shrink-0" />
                          이 제출물은 AI 채점 대상이 아니에요 (텍스트·이미지·PDF·HTML 형식만 지원). 직접 확인 후 평가해주세요.
                        </div>
                      )}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-on-surface-variant/70">성취 수준</label>
                        <div className="flex items-center gap-1">
                          {[1,2,3,4,5].map(star => (
                            <button key={star}
                              onClick={() => setEvalForms(prev => ({ ...prev, [weekGroupId]: { ...weekEv, score: weekEv.score === star ? 0 : star } }))}
                              className={`text-2xl transition-colors leading-none ${star <= weekEv.score ? 'text-amber-400' : 'text-neutral-200 hover:text-amber-200'}`}
                            >★</button>
                          ))}
                          {weekEv.score > 0 && <span className="text-xs font-black text-amber-500 ml-2">{weekEv.score}점</span>}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-on-surface-variant/70">역량 태그 (중복 선택)</label>
                        <div className="flex flex-wrap gap-1.5">
                          {['자기주도', '논리적사고', '표현력', '창의성', '협력', '성실성', '탐구력', '문제해결'].map(tag => (
                            <button key={tag} onClick={() => toggleEvalTag(weekGroupId, tag)}
                              className={`px-3 py-1 rounded-full text-[11px] font-black border transition-all ${
                                weekEv.tags.includes(tag)
                                  ? 'bg-violet-500 text-white border-violet-500'
                                  : 'bg-white text-neutral-400 border-neutral-200 hover:border-violet-300 hover:text-violet-500'
                              }`}
                            >{tag}</button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-on-surface-variant/70">평가 코멘트</label>
                        <textarea
                          value={weekEv.note}
                          onChange={e => setEvalForms(prev => ({ ...prev, [weekGroupId]: { ...weekEv, note: e.target.value } }))}
                          placeholder="이번 제출물 전체에 대한 평가 메모 (세특 작성 시 AI 참고 자료로 활용됩니다)"
                          rows={2}
                          className="w-full px-4 py-3 bg-white rounded-xl text-sm border border-violet-100 focus:border-violet-300 focus:outline-none resize-none transition-all"
                        />
                      </div>
                      <button onClick={() => saveEvaluation(weekGroupId, weekGroupIds)} disabled={savingEvalId === weekGroupId}
                        className="flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-xl text-xs font-black transition-all disabled:opacity-50">
                        {savingEvalId === weekGroupId ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                        평가 저장
                      </button>
                    </div>
                  );
                })()}
                {(selectedResult._subGroups || [{ groupId: selectedResult.groupId, groupItems: selectedResult.groupItems }]).map((sub: any, idx: number, arr: any[]) => {
                  const subItems: any[] = sub.groupItems || [selectedResult];
                  const subFirst = subItems[0];
                  const gId = sub.groupId;
                  const isSubRejected = subFirst.status === 'rejected';
                  const isProcessing = processingGroupId === gId;
                  const isEditingFeedback = feedbackGroupId === gId;

                  const textItem = subItems.find((r: any) => r.result_type === 'text');
                  const linkItem = subItems.find((r: any) => r.result_type === 'link');
                  const imageItem = subItems.find((r: any) => r.result_type === 'image');
                  const fileItem = subItems.find((r: any) => r.result_type === 'file');
                  const imageUrl = imageItem?.storage_path
                    ? supabase.storage.from('student-attachments').getPublicUrl(imageItem.storage_path).data.publicUrl
                    : null;

                  return (
                    <div
                      key={gId}
                      className={arr.length > 1 ? `space-y-4 ${idx > 0 ? 'pt-5 mt-1 border-t-2 border-dashed border-neutral-200' : ''}` : 'space-y-4'}
                    >
                      {arr.length > 1 && (
                        <p className="text-[10px] font-black text-on-surface-variant/50 uppercase tracking-widest">
                          {idx + 1}번째 제출 · {new Date(subFirst.created_at).toLocaleString('ko-KR')}
                        </p>
                      )}

                      {textItem?.text_content && (
                        <div className="p-5 bg-neutral-50 rounded-2xl border border-neutral-100">
                          <p className="text-[10px] font-black text-primary/60 uppercase tracking-widest mb-2">텍스트</p>
                          <p className="text-sm font-medium text-on-surface leading-relaxed whitespace-pre-wrap">
                            {textItem.text_content}
                          </p>
                        </div>
                      )}

                      {linkItem?.link_url && (
                        <a
                          href={linkItem.link_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-4 bg-blue-50 rounded-2xl border border-blue-100 hover:border-blue-300 transition-colors group"
                        >
                          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-500 shrink-0">
                            <Link2 size={18} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black text-blue-600 uppercase tracking-widest mb-0.5">링크</p>
                            <p className="text-sm font-bold text-blue-500 group-hover:underline truncate">{linkItem.link_url}</p>
                          </div>
                          <ExternalLink size={16} className="text-blue-400 shrink-0" />
                        </a>
                      )}

                      {imageItem && imageUrl && (
                        <div className="space-y-3">
                          <p className="text-[10px] font-black text-emerald-600/70 uppercase tracking-widest">이미지</p>
                          <img
                            src={imageUrl}
                            alt={subFirst.title || '이미지'}
                            className="w-full rounded-2xl object-contain border border-neutral-100 cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => window.open(imageUrl, '_blank')}
                          />
                          <button
                            onClick={() => handleDownloadResult(imageItem)}
                            className="w-full py-3 flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-black text-sm rounded-xl border border-emerald-200 transition-all"
                          >
                            <Upload size={16} className="rotate-180" /> 이미지 다운로드
                          </button>
                        </div>
                      )}

                      {fileItem && (
                        <div className="flex items-center gap-4 p-5 bg-amber-50 rounded-2xl border border-amber-100">
                          <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center text-amber-500 shrink-0">
                            <File size={22} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-sm text-on-surface">{fileItem.display_name}</p>
                            {fileItem.file_size && (
                              <p className="text-xs font-bold text-amber-500 mt-0.5">{formatFileSize(fileItem.file_size)}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {/\.html?$/i.test(fileItem.display_name || '') && (
                              <button
                                onClick={() => handleOpenResultFile(fileItem)}
                                className="flex items-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-black text-xs rounded-xl transition-all shadow-sm"
                              >
                                <ExternalLink size={14} /> 실행
                              </button>
                            )}
                            <button
                              onClick={() => handleDownloadResult(fileItem)}
                              className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs rounded-xl transition-all shadow-sm"
                            >
                              <Upload size={14} className="rotate-180" /> 다운로드
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 반려됨 피드백 표시 */}
                      {isSubRejected && (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3">
                          <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-black text-red-600 mb-1">반려된 결과물</p>
                            {subFirst.rejection_feedback && (
                              <p className="text-xs font-bold text-red-700 leading-relaxed">{subFirst.rejection_feedback}</p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* 선생님 피드백 (반려 아닌 일반 피드백) */}
                      <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-black text-indigo-600 flex items-center gap-1.5">
                            <MessageSquare size={13} /> 선생님 피드백
                          </p>
                          {!isEditingFeedback && subFirst.teacher_feedback && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => { setFeedbackGroupId(gId); setResultFeedbackText(subFirst.teacher_feedback || ''); }}
                                className="p-1.5 rounded-lg hover:bg-indigo-100 text-indigo-500 transition-colors"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={() => handleDeleteResultFeedback(gId)}
                                disabled={savingResultFeedback}
                                className="p-1.5 rounded-lg hover:bg-red-100 text-red-500 transition-colors"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                        {isEditingFeedback ? (
                          <div className="space-y-2">
                            <textarea
                              value={resultFeedbackText}
                              onChange={e => setResultFeedbackText(e.target.value)}
                              placeholder="이 결과물에 대한 피드백을 입력하세요. 저장 시 학생에게 알림이 전달됩니다."
                              rows={3}
                              autoFocus
                              className="w-full px-4 py-3 bg-white rounded-xl text-sm border border-indigo-200 focus:border-indigo-400 focus:outline-none resize-none transition-all"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleSaveResultFeedback(gId)}
                                disabled={savingResultFeedback || !resultFeedbackText.trim()}
                                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-xs font-black transition-all disabled:opacity-50"
                              >
                                {savingResultFeedback ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                                저장
                              </button>
                              <button
                                onClick={() => { setFeedbackGroupId(null); setResultFeedbackText(''); }}
                                className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-500 rounded-xl text-xs font-black transition-all"
                              >
                                취소
                              </button>
                            </div>
                          </div>
                        ) : subFirst.teacher_feedback ? (
                          <p className="text-sm font-bold text-indigo-700 leading-relaxed">{subFirst.teacher_feedback}</p>
                        ) : (
                          <button
                            onClick={() => { setFeedbackGroupId(gId); setResultFeedbackText(''); }}
                            className="text-xs font-black text-indigo-500 hover:text-indigo-600 transition-colors"
                          >
                            피드백 남기기 +
                          </button>
                        )}
                      </div>

                      {/* 반려 / 반려취소 / 삭제 액션 — 이 제출 건에만 적용 */}
                      <div className="flex gap-3 pt-1">
                        {!isSubRejected ? (
                          <button
                            onClick={() => { setRejectModal({ groupId: gId }); setRejectFeedback(''); }}
                            disabled={!!processingGroupId}
                            className="flex-1 flex items-center justify-center gap-2 py-3 bg-amber-50 hover:bg-amber-100 text-amber-600 border border-amber-200 rounded-2xl font-black text-sm transition-all"
                          >
                            <RotateCw size={14} /> 반려 (재작성 요청)
                          </button>
                        ) : (
                          <button
                            onClick={async () => {
                              await supabase.from('student_results')
                                .update({ status: 'approved', rejection_feedback: null })
                                .eq(subFirst.submission_group ? 'submission_group' : 'id', gId);
                              setResults((prev: any[]) => prev.map((r: any) =>
                                (r.submission_group || r.id) === gId
                                  ? { ...r, status: 'approved', rejection_feedback: null } : r
                              ));
                              patchSelectedResultGroup(gId, { status: 'approved', rejection_feedback: null });
                              showToast('반려를 취소했습니다.');
                            }}
                            disabled={isProcessing}
                            className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 rounded-2xl font-black text-sm transition-all"
                          >
                            <Check size={14} /> 반려 취소
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteGroup(gId)}
                          disabled={isProcessing}
                          className="flex items-center justify-center gap-2 px-6 py-3 bg-red-50 hover:bg-red-100 text-red-500 border border-red-200 rounded-2xl font-black text-sm transition-all"
                        >
                          {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} 삭제
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 관찰기록 반려 모달 */}
      <AnimatePresence>
        {obsRejectModal && (
          <div className="fixed inset-0 z-[1100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm" onClick={() => { setObsRejectModal(null); setObsRejectFeedback(''); }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 space-y-4">
                <div>
                  <h3 className="font-black text-lg">활동 기록 반려</h3>
                  <p className="text-sm text-on-surface-variant/70 mt-1">학생에게 전달할 피드백을 입력하세요. (선택사항)</p>
                </div>
                <textarea
                  value={obsRejectFeedback}
                  onChange={e => setObsRejectFeedback(e.target.value)}
                  placeholder="예: 활동 내용이 너무 간략합니다. 구체적인 활동 과정을 추가해서 다시 제출해주세요."
                  className="w-full min-h-[100px] p-4 rounded-xl border border-neutral-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-200"
                  autoFocus
                />
              </div>
              <div className="px-6 pb-6 flex gap-3">
                <button
                  onClick={() => handleRejectObs(obsRejectModal.obsId, obsRejectFeedback)}
                  disabled={!!obsRejectingId}
                  className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black text-sm transition-all disabled:opacity-50"
                >
                  {obsRejectingId ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
                  반려 처리하기
                </button>
                <button
                  onClick={() => { setObsRejectModal(null); setObsRejectFeedback(''); }}
                  className="px-5 py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-500 rounded-2xl font-black text-sm transition-all"
                >
                  취소
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 결과물 반려 피드백 입력 모달 */}
      <AnimatePresence>
        {rejectModal && (
          <div className="fixed inset-0 z-[1100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm" onClick={() => { setRejectModal(null); setRejectFeedback(''); }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 space-y-4">
                <div>
                  <h3 className="font-black text-lg">반려 처리</h3>
                  <p className="text-sm text-on-surface-variant/70 mt-1">학생에게 전달할 피드백을 입력하세요. (선택사항)</p>
                </div>
                <textarea
                  value={rejectFeedback}
                  onChange={e => setRejectFeedback(e.target.value)}
                  placeholder="예: 결과물에 핵심 내용이 빠져 있습니다. 다시 작성해주세요."
                  className="w-full min-h-[100px] p-4 rounded-xl border border-neutral-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-200"
                  autoFocus
                />
              </div>
              <div className="px-6 pb-6 flex gap-3">
                <button
                  onClick={() => handleRejectGroup(rejectFeedback)}
                  disabled={!!processingGroupId}
                  className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black text-sm transition-all disabled:opacity-50"
                >
                  {processingGroupId ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
                  반려 처리하기
                </button>
                <button
                  onClick={() => { setRejectModal(null); setRejectFeedback(''); }}
                  className="px-5 py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-500 rounded-2xl font-black text-sm transition-all"
                >
                  취소
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notifications */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[2000] flex flex-col gap-3 items-center pointer-events-none">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className={`px-8 py-4 rounded-2xl shadow-2xl text-sm font-black flex items-center gap-3 pointer-events-auto ${
                toast.type === 'error' ? 'bg-error text-white' : 'bg-neutral-900 text-white'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${toast.type === 'error' ? 'bg-white/60' : 'bg-primary animate-pulse'}`} />
              {toast.msg}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default StudentView;
