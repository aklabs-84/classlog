import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { openFile, downloadFile } from '../lib/fileUtils';
import SubmissionViewerModal, { getViewerKind } from '../components/classroom/SubmissionViewerModal';
import AvatarPicker from '../components/AvatarPicker';
import MicrobitPythonLab from './tools/MicrobitPythonLab';
import { ImageCarousel, getResultImagePublicUrls } from '../components/common/ImageCarousel';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GraduationCap,
  User,
  Bell,
  MessageSquare,
  History,
  Trophy,
  Send,
  Save,
  Lightbulb,
  ArrowLeft,
  BookOpen,
  CheckCircle,
  CheckCircle2,
  Loader2,
  Clock,
  FileText,
  Upload,
  Trash2,
  X,
  Pencil,
  Check,
  File,
  ClipboardList,
  AlertCircle,
  FolderOpen,
  AlignLeft,
  Link2,
  ImageIcon,
  ExternalLink,
  Megaphone,
  LayoutDashboard,
  ArrowRight,
  Gamepad2,
  Play,
  RefreshCw,
  MoreHorizontal,
  Users2,
  StickyNote,
  Heart,
  Download,
  BarChart2,
  Maximize2,
  Eye,
  NotebookPen,
  ChevronDown,
  ChevronUp,
  ChevronsLeft,
  ChevronsRight,
  Plus,
  Cpu,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { observationReviewAI } from '../lib/gemini';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import CodeBlock from '../components/CodeBlock';
import { renderMaterialCallout } from '../components/MaterialCallout';
import TourGuide, { type TourStep } from '../components/TourGuide';
import RichEditor from '../components/RichEditor';

const TOUR_STEPS: TourStep[] = [
  {
    emoji: '👋',
    title: '클래스로그 사용 방법 안내',
    description: '수업 활동을 기록하고 선생님과 소통하는 앱이에요. 주요 메뉴를 하나씩 살펴볼게요!',
  },
  {
    targetId: 'tour-tab-home',
    emoji: '🏠',
    title: '홈',
    description: '이번 주 수업 주제와 일정을 확인하고, 활동 기록·결과 제출로 빠르게 이동할 수 있어요.',
    placement: 'top',
  },
  {
    targetId: 'tour-tab-record',
    emoji: '✏️',
    title: '활동 기록',
    description: '수업에서 배운 내용과 활동을 기록해요. 구체적으로 쓸수록 생활기록부에 도움이 돼요!',
    placement: 'top',
  },
  {
    targetId: 'tour-tab-results',
    emoji: '📁',
    title: '결과 제출',
    description: '만든 결과물(링크·이미지·파일·텍스트)을 선생님께 주차별로 제출하는 곳이에요.',
    placement: 'top',
  },
  {
    targetId: 'tour-tab-board',
    emoji: '🎨',
    title: '보드',
    description: '선생님이 열어주신 화이트보드 세션에 실시간으로 참여할 수 있어요.',
    placement: 'top',
  },
  {
    targetId: 'tour-tab-more',
    emoji: '⋯',
    title: '더보기',
    description: '퀴즈, 설문, 수업 자료, 나의 기록, 나의 노트, 단원 마무리, 질문·건의함 등 더 많은 메뉴가 있어요.',
    placement: 'top',
  },
  {
    emoji: '🎉',
    title: '준비 완료!',
    description: '이제 직접 사용해 보세요. 나중에 더보기 → "사용 방법 보기"를 누르면 다시 볼 수 있어요.',
  },
];

// 모듈 레벨로 고정 — 매 렌더마다 새 참조가 생기면 ReactMarkdown이 details DOM을 리마운트해서 토글 상태가 초기화됨
const MATERIAL_MD_COMPONENTS = {
  h1: ({ children }: any) => <h1 className="text-2xl font-black mb-4 mt-6">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-xl font-black mb-3 mt-5">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-lg font-black mb-2 mt-4">{children}</h3>,
  p: ({ children }: any) => <p className="mb-3 text-sm leading-relaxed">{children}</p>,
  ul: ({ children }: any) => <ul className="list-disc pl-6 mb-3 space-y-1">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal pl-6 mb-3 space-y-1">{children}</ol>,
  li: ({ children }: any) => <li className="text-sm">{children}</li>,
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-4 border-cyan-400 pl-4 italic text-on-surface-variant my-3 bg-cyan-50 py-2 rounded-r-xl text-sm">{children}</blockquote>
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
  img: ({ src, alt, title }: any) => {
    const wm = (title || '').match(/(?:^|,)width:(\d+)/);
    const style = wm ? { width: `${wm[1]}px`, maxWidth: '100%' } : undefined;
    return <img src={src} alt={alt} style={style} className="max-w-full rounded-xl my-3 shadow" />;
  },
  a: ({ href, children }: any) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline text-sm hover:opacity-70">{children}</a>,
  hr: () => <hr className="border-surface-container my-5" />,
  strong: ({ children }: any) => <strong className="font-black">{children}</strong>,
  em: ({ children }: any) => <em className="italic">{children}</em>,
  details: ({ children }: any) => <details className="group my-3 rounded-xl border border-surface-container overflow-hidden">{children}</details>,
  summary: ({ children }: any) => (
    <summary className="px-4 py-2.5 bg-surface-container-low cursor-pointer font-black text-sm list-none flex items-center gap-2 hover:bg-surface-container transition-colors">
      <span className="text-primary text-xs transition-transform duration-200 group-open:rotate-90">▶</span> {children}
    </summary>
  ),
  div: (props: any) => renderMaterialCallout(props),
};

// 공지사항 내용 마크다운 렌더러 (카드 안에서 컴팩트하게 표시) — 모듈 레벨 고정으로 리마운트 방지
const ANNOUNCEMENT_MD_COMPONENTS = {
  p: ({ children }: any) => <p className="mb-2 last:mb-0 leading-relaxed text-sm font-bold text-on-surface-variant">{children}</p>,
  h1: ({ children }: any) => <h1 className="text-sm font-black mb-1.5 mt-2">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-sm font-black mb-1.5 mt-2">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-xs font-black mb-1 mt-2">{children}</h3>,
  ul: ({ children }: any) => <ul className="list-disc pl-5 mb-2 space-y-0.5 text-sm">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal pl-5 mb-2 space-y-0.5 text-sm">{children}</ol>,
  li: ({ children }: any) => <li className="text-sm text-on-surface-variant">{children}</li>,
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-4 border-amber-400 pl-3 italic text-on-surface-variant my-2 bg-amber-50 py-1.5 rounded-r-lg text-sm">{children}</blockquote>
  ),
  code: ({ children, className }: any) => {
    if (!className) return <code className="bg-surface-container px-1.5 py-0.5 rounded text-xs font-mono text-primary">{children}</code>;
    return <code className={className}>{children}</code>;
  },
  pre: ({ children }: any) => {
    const child = (Array.isArray(children) ? children[0] : children) as any;
    const lang = (child?.props?.className || '').replace('language-', '') || 'text';
    const code = String(child?.props?.children ?? '').replace(/\n$/, '');
    return <CodeBlock lang={lang} code={code} />;
  },
  a: ({ href, children }: any) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:opacity-70">{children}</a>,
  img: ({ src, alt }: any) => <img src={src} alt={alt} className="max-w-full rounded-xl my-2 shadow" />,
  hr: () => <hr className="border-amber-200 my-3" />,
  strong: ({ children }: any) => <strong className="font-black">{children}</strong>,
  table: ({ children }: any) => <div className="overflow-auto mb-2"><table className="w-full border-collapse text-xs">{children}</table></div>,
  th: ({ children }: any) => <th className="border border-surface-container px-2 py-1.5 bg-surface-container font-black text-left">{children}</th>,
  td: ({ children }: any) => <td className="border border-surface-container px-2 py-1.5">{children}</td>,
};

interface NoteItem {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

const notePreview = (content: string) =>
  content.replace(/[#*_`>\[\]()\-!]/g, '').replace(/\n+/g, ' ').trim().slice(0, 65);

// Classroom.tsx의 LEARNING_TOOLS와 동일한 id 체계 유지 (교사가 공개 처리하는 도구 카탈로그)
const STUDENT_LEARNING_TOOLS: { id: string; label: string; description: string; icon: React.ReactNode; render: () => React.ReactNode }[] = [
  {
    id: 'microbit-python-lab',
    label: '마이크로비트 파이썬 실습',
    description: 'MicroPython 코드를 작성해 화면에서 바로 시뮬레이션하고, 실제 보드에 넣을 수 있는 .hex로 다운로드합니다',
    icon: <Cpu size={24} />,
    render: () => <MicrobitPythonLab />,
  },
];

const StudentLog = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<any>(null);
  const [studentAvatar, setStudentAvatar] = useState<string | null>(null);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'home' | 'record' | 'history' | 'badges' | 'materials' | 'tools' | 'results' | 'unit' | 'suggestions' | 'quiz' | 'survey' | 'board' | 'notes' | 'meeting'>('home');
  const [isMoreSheetOpen, setIsMoreSheetOpen] = useState(false);
  // 데스크탑 사이드바 접기/펼치기 (기본 펼침, localStorage에 저장)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('studentlog_sidebar_collapsed') === 'true'; } catch { return false; }
  });
  const toggleSidebarCollapsed = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('studentlog_sidebar_collapsed', String(next)); } catch { /* noop */ }
      return next;
    });
  };
  const [selectedHomeWeek, setSelectedHomeWeek] = useState<number | null>(null);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'obs' | 'result'>('all');
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editLogForm, setEditLogForm] = useState({ activity_name: '', content: '' });
  const [savingLogId, setSavingLogId] = useState<string | null>(null);
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);
  const [guidePrompt, setGuidePrompt] = useState<string>('');
  const [minObsChars, setMinObsChars] = useState(0);
  const [blockedKeywords, setBlockedKeywords] = useState<string[]>([]);
  const [aiReviewEnabled, setAiReviewEnabled] = useState(true);
  const [isClassClosed, setIsClassClosed] = useState(false);
  const [reminderModal, setReminderModal] = useState<{
    type: 'need_result' | 'need_obs';
    week: number;
    topic: string;
  } | null>(null);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectModalType, setRejectModalType] = useState<'block' | 'auto_reject'>('block');
  const [aiFeedback, setAiFeedback] = useState<{reason: string, guide: string} | null>(null);

  // 학생 알림
  const [studentNotifs, setStudentNotifs] = useState<any[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const unreadNotifCount = studentNotifs.filter(n => !n.is_read).length;

  const [rejectionNotification, setRejectionNotification] = useState<{
    type: 'obs' | 'result';
    title: string;
    feedback: string | null;
  } | null>(null);
  const [approvalNotification, setApprovalNotification] = useState<{
    type: 'obs' | 'result';
    title: string;
  } | null>(null);
  const seenRejectionIds = useRef(new Set<string>());
  const seenApprovalIds = useRef(new Set<string>());
  // 폴링용 상태 추적 (Realtime 미지원 테이블 대비)
  const statusTrackMap = useRef(new Map<string, string>());
  const isFirstStatusPoll = useRef(true);
  const isFirstBoardPoll = useRef(true);
  const seenBoardSessionIds = useRef(new Set<string>());
  const isFirstQuizPoll = useRef(true);
  const seenQuizSessionIds = useRef(new Set<string>());
  
  // 공지사항
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [expandedAnnouncementId, setExpandedAnnouncementId] = useState<string | null>(null);

  // Resources State (weekly_plan + class_materials + general)
  const [classResources, setClassResources] = useState<any[]>([]);
  const [activeWeek, setActiveWeek] = useState<number | null>(null);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [classMaterials, setClassMaterials] = useState<any[]>([]);
  const [fullscreenMaterial, setFullscreenMaterial] = useState<{ title: string; content: string } | null>(null);
  const [generalMaterials, setGeneralMaterials] = useState<any[]>([]);
  const [editorMaterials, setEditorMaterials] = useState<any[]>([]);
  const [materialsSubTab, setMaterialsSubTab] = useState<'weekly' | 'editor' | 'general'>('weekly');
  const [enabledToolIds, setEnabledToolIds] = useState<string[]>([]);
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);

  // Result Submission State
  const [results, setResults] = useState<any[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [resultTitle, setResultTitle] = useState('');
  const [resultText, setResultText] = useState('');
  const [resultUrl, setResultUrl] = useState('');
  const [resultSubmitting, setResultSubmitting] = useState(false);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [resultImageFiles, setResultImageFiles] = useState<File[]>([]);
  const [resultFileUpload, setResultFileUpload] = useState<File | null>(null);
  const resultImageInputRef = useRef<HTMLInputElement | null>(null);
  const resultFileInputRef = useRef<HTMLInputElement | null>(null);
  const [editingResult, setEditingResult] = useState<any>(null);
  const [editingGroupResults, setEditingGroupResults] = useState<any[]>([]);
  const resultFormRef = useRef<HTMLDivElement | null>(null);
  // 조별 제출
  const [isGroupSubmission, setIsGroupSubmission] = useState(false);
  const [myClassGroup, setMyClassGroup] = useState<{ id: string; name: string; memberNames: string[] } | null>(null);
  const [filterWeek, setFilterWeek] = useState<number | null>(null);

  // 오늘 진행 주차가 지정돼 있으면 신규 결과 제출 폼을 해당 주차로 고정
  useEffect(() => {
    if (!editingResult && activeWeek) setSelectedWeek(activeWeek);
  }, [activeWeek, editingResult]);

  // 오늘 진행 주차가 지정돼 있으면 신규 활동 기록 작성 폼의 주제를 해당 주차로 고정
  const activeWeekTopic = activeWeek ? classResources.find((r: any) => r.week === activeWeek)?.topic : undefined;
  useEffect(() => {
    if (activeWeekTopic && !title) setTitle(activeWeekTopic);
  }, [activeWeekTopic]);
  const [detailItem, setDetailItem] = useState<any>(null);
  const [viewerFile, setViewerFile] = useState<{ url: string; name: string } | null>(null);

  // 가이드 투어 State
  const [showGuideModal, setShowGuideModal] = useState(false);

  // Toast State
  const [toasts, setToasts] = useState<{id: string; msg: string; type: 'success' | 'error'}[]>([]);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  };

  const handleCloseGuide = (dontShowToday: boolean) => {
    if (dontShowToday && session?.student_id) {
      const today = new Date().toISOString().slice(0, 10);
      localStorage.setItem(`guide_hidden_${session.student_id}`, today);
    }
    setShowGuideModal(false);
  };

  // Form States
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [feeling, setFeeling] = useState('');

  // Suggestions State
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionContent, setSuggestionContent] = useState('');
  const [suggestionSubmitting, setSuggestionSubmitting] = useState(false);
  const [editingSuggestionId, setEditingSuggestionId] = useState<string | null>(null);
  const [editSuggestionContent, setEditSuggestionContent] = useState('');
  const [savingSuggestionId, setSavingSuggestionId] = useState<string | null>(null);
  const [deletingSuggestionId, setDeletingSuggestionId] = useState<string | null>(null);
  const [unreadReplyCount, setUnreadReplyCount] = useState(0);

  // Unit Submission States
  const [pendingUnits, setPendingUnits] = useState<any[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [unitPendingCount, setUnitPendingCount] = useState(0);
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null);
  const [unitForm, setUnitForm] = useState<Record<string, any>>({});
  const [unitSubmitting, setUnitSubmitting] = useState(false);

  // Quiz Tab States
  const [activeQuizSessions, setActiveQuizSessions] = useState<any[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizSessionAlert, setQuizSessionAlert] = useState<{ id: string; pin_code: string; title: string } | null>(null);
  const [quizHistory, setQuizHistory] = useState<any[]>([]);
  const [quizHistoryLoading, setQuizHistoryLoading] = useState(false);

  // Survey Tab States
  const [activeSurveyForms, setActiveSurveyForms] = useState<any[]>([]);
  const [surveyLoading, setSurveyLoading] = useState(false);

  // Notes Tab States
  const [noteList, setNoteList] = useState<NoteItem[]>([]);
  const [noteListLoading, setNoteListLoading] = useState(false);
  const [selectedNote, setSelectedNote] = useState<NoteItem | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [noteTitleInput, setNoteTitleInput] = useState('');
  const [noteSaveStatus, setNoteSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteHasUnsavedChanges, setNoteHasUnsavedChanges] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [isNoteImageUploading, setIsNoteImageUploading] = useState(false);
  const [noteEditorKey, setNoteEditorKey] = useState(0);
  const [noteGuideOpen, setNoteGuideOpen] = useState(false);
  const [noteCreating, setNoteCreating] = useState(false);
  const [noteDeleteId, setNoteDeleteId] = useState<string | null>(null);
  const isNoteImageUploadingRef = useRef(false); // 이미지 업로드 중 여부 (ref로 stale closure 방지)
  const latestNoteContentRef = useRef('');       // 최신 노트 내용 (이미지 URL 교체 후 값)

  // Board Tab States
  const [activeBoardSessions, setActiveBoardSessions] = useState<any[]>([]);
  const [boardSessionAlert, setBoardSessionAlert] = useState<{ id: string; class_name: string; session_code: string; group_count: number } | null>(null);
  const [boardPosts, setBoardPosts] = useState<any[]>([]);
  const [boardLoading, setBoardLoading] = useState(false);
  const [boardWeekFilter, setBoardWeekFilter] = useState<number | 'all'>('all');
  const [boardTypeFilter, setBoardTypeFilter] = useState<'all' | 'obs' | 'result'>('all');
  const [boardSelectedPost, setBoardSelectedPost] = useState<any | null>(null);
  const [boardGroupModalInfo, setBoardGroupModalInfo] = useState<{ name: string; memberNames: string[] } | null>(null);
  const [boardLikes, setBoardLikes] = useState<Record<string, boolean>>({}); // postId → liked

  // Online Meeting Tab States
  const [activeMeeting, setActiveMeeting] = useState<any | null>(null);
  const [meetingLoading, setMeetingLoading] = useState(false);
  const [meetingHistory, setMeetingHistory] = useState<any[]>([]);

  useEffect(() => {
    const sessionData = sessionStorage.getItem('student_session');
    if (!sessionData) {
      alert('입장 정보가 유효하지 않습니다. 다시 수업에 입장해 주세요.');
      navigate('/classroom-entry');
      return;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(sessionData);
      if (!parsed?.student_id || !parsed?.class_id) throw new Error('invalid');
    } catch {
      sessionStorage.removeItem('student_session');
      alert('세션 정보가 손상되었습니다. 다시 입장해 주세요.');
      navigate('/classroom-entry');
      return;
    }

    // 세션 무결성 서버 검증 — student_id + class_id 조합이 실제로 유효한지 확인
    (async () => {
      try {
        // class의 linked_class_id 확인 (연결 학급 구조 대응)
        const { data: classData } = await supabase
          .from('classes')
          .select('id, linked_class_id')
          .eq('id', parsed.class_id)
          .maybeSingle();

        if (!classData) throw new Error('class not found');

        const effectiveClassId = classData.linked_class_id || classData.id;

        // student가 해당 class에 실제로 속하는지 서버에서 확인
        const { data: studentExists } = await supabase
          .from('students')
          .select('id, avatar_url')
          .eq('id', parsed.student_id)
          .eq('class_id', effectiveClassId)
          .maybeSingle();

        if (!studentExists) throw new Error('student not in class');

        // 검증 통과 — 세션 활성화
        setSession(parsed);
        setStudentAvatar(studentExists.avatar_url || null);
        fetchClassDetails(parsed.class_id);
        fetchAnnouncements(parsed.class_id);
        fetchUnreadReplyCount(parsed.student_id, parsed.class_id);
        fetchMyGroup(parsed.student_id, parsed.class_id);
        fetchStudentNotifs(parsed.student_id);
        fetchQuizHistory(parsed.class_id, parsed.student_name);
        supabase.from('class_enabled_tools').select('tool_id').eq('class_id', parsed.class_id).eq('is_published', true)
          .then(({ data }) => setEnabledToolIds((data || []).map((t: any) => t.tool_id)));

        // 가이드 모달 표시 여부 확인
        // PIN 재입장 여부와 무관하게 '오늘 하루 보지 않기' localStorage 값만으로 판단
        const today = new Date().toISOString().slice(0, 10);
        const guideKey = `guide_hidden_${parsed.student_id}`;
        const hiddenToday = localStorage.getItem(guideKey) === today;
        if (parsed.is_fresh_entry) {
          // fresh 플래그 소모 — 이후 새로고침에선 아래 조건으로만 판단
          const { is_fresh_entry: _, ...rest } = parsed;
          sessionStorage.setItem('student_session', JSON.stringify(rest));
        }
        if (!hiddenToday) {
          setShowGuideModal(true);
        }
      } catch {
        sessionStorage.removeItem('student_session');
        alert('세션이 유효하지 않습니다. 다시 입장해 주세요.');
        navigate('/classroom-entry');
      }
    })();
  }, []);

  // 반려/승인 알림 — 초기 seen ID 로드 + Realtime 구독
  useEffect(() => {
    if (!session?.student_id) return;

    // 마운트 시 이미 반려/승인된 항목을 seen으로 등록 (알림 없이)
    const initSeen = async () => {
      try {
        const { data: processedObs } = await supabase
          .from('observations')
          .select('id, status')
          .eq('student_id', session.student_id)
          .in('status', ['rejected', 'approved'])
          .eq('is_student_record', true);
        // 현재 상태에 맞는 set에만 추가 (cross-오염 방지)
        for (const obs of (processedObs || [])) {
          if (obs.status === 'rejected') seenRejectionIds.current.add(`obs-${obs.id}`);
          else if (obs.status === 'approved') seenApprovalIds.current.add(`obs-${obs.id}`);
        }

        const { data: processedResults } = await supabase
          .from('student_results')
          .select('id, submission_group, status')
          .eq('student_id', session.student_id)
          .in('status', ['rejected', 'approved']);
        const seenGroups = new Set<string>();
        for (const r of (processedResults || [])) {
          const gId = r.submission_group || r.id;
          if (!seenGroups.has(gId)) {
            seenGroups.add(gId);
            if (r.status === 'rejected') seenRejectionIds.current.add(`result-${gId}`);
            else if (r.status === 'approved') seenApprovalIds.current.add(`result-${gId}`);
          }
        }
      } catch { /* 무시 */ }
    };

    initSeen();

    // 관찰기록 반려/승인 Realtime 구독
    const obsChannel = supabase
      .channel(`obs-status-rt-${session.student_id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'observations',
        filter: `student_id=eq.${session.student_id}`,
      }, (payload: any) => {
        const obs = payload.new;
        if (!obs?.is_student_record) return;
        const key = `obs-${obs.id}`;
        const obsTitle = obs.activity_name || '활동 기록';

        if (obs?.status === 'rejected') {
          // 재반려 감지 허용: 승인 seen에서 제거
          seenApprovalIds.current.delete(key);
          if (!seenRejectionIds.current.has(key)) {
            seenRejectionIds.current.add(key);
            statusTrackMap.current.set(key, 'rejected'); // 폴링과 동기화
            setRejectionNotification({ type: 'obs', title: obsTitle, feedback: obs.teacher_feedback || null });
            fetchHistory();
          }
        } else if (obs?.status === 'approved') {
          seenRejectionIds.current.delete(key);
          if (!seenApprovalIds.current.has(key)) {
            seenApprovalIds.current.add(key);
            statusTrackMap.current.set(key, 'approved'); // 폴링과 동기화
            setApprovalNotification({ type: 'obs', title: obsTitle });
            fetchHistory();
          }
        } else {
          seenRejectionIds.current.delete(key);
          seenApprovalIds.current.delete(key);
          statusTrackMap.current.set(key, obs.status);
        }
      })
      .subscribe();

    // 결과물 반려/승인 Realtime 구독
    const resultChannel = supabase
      .channel(`result-status-rt-${session.student_id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'student_results',
        filter: `student_id=eq.${session.student_id}`,
      }, (payload: any) => {
        const r = payload.new;
        const gId = r.submission_group || r.id;
        const key = `result-${gId}`;
        const rTitle = r.title || (r.week_number ? `${r.week_number}주차 결과물` : '결과물');

        if (r?.status === 'rejected') {
          seenApprovalIds.current.delete(key);
          if (!seenRejectionIds.current.has(key)) {
            seenRejectionIds.current.add(key);
            statusTrackMap.current.set(key, 'rejected');
            setRejectionNotification({ type: 'result', title: rTitle, feedback: r.rejection_feedback || null });
            fetchResults();
          }
        } else if (r?.status === 'approved') {
          seenRejectionIds.current.delete(key);
          if (!seenApprovalIds.current.has(key)) {
            seenApprovalIds.current.add(key);
            statusTrackMap.current.set(key, 'approved');
            setApprovalNotification({ type: 'result', title: rTitle });
            fetchResults();
          }
        } else {
          seenRejectionIds.current.delete(key);
          seenApprovalIds.current.delete(key);
          statusTrackMap.current.set(key, r.status);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(obsChannel);
      supabase.removeChannel(resultChannel);
    };
  }, [session?.student_id]);

  // 반려/승인 폴링 — observations/student_results가 realtime publication에 없을 때 대비
  useEffect(() => {
    if (!session?.student_id) return;

    const check = async () => {
      try {
        const [{ data: obsData }, { data: resultsData }] = await Promise.all([
          supabase.from('observations')
            .select('id, activity_name, status, teacher_feedback')
            .eq('student_id', session.student_id)
            .eq('is_student_record', true),
          supabase.from('student_results')
            .select('id, submission_group, week_number, title, status, rejection_feedback')
            .eq('student_id', session.student_id),
        ]);

        if (!isFirstStatusPoll.current) {
          // 관찰기록 상태 변화 감지
          for (const obs of (obsData || [])) {
            const key = `obs-${obs.id}`;
            const prev = statusTrackMap.current.get(key);
            const obsTitle = obs.activity_name || '활동 기록';
            if (obs.status === 'rejected' && prev !== 'rejected' && prev !== undefined) {
              seenApprovalIds.current.delete(key);
              seenRejectionIds.current.add(key);
              statusTrackMap.current.set(key, 'rejected');
              setRejectionNotification({ type: 'obs', title: obsTitle, feedback: obs.teacher_feedback || null });
              fetchHistory();
              setStudentNotifs(p => [{
                id: `local-rej-${key}`, student_id: session.student_id,
                title: '활동 기록이 반려되었습니다',
                content: `"${obsTitle}"${obs.teacher_feedback ? ` — ${obs.teacher_feedback}` : ''}`,
                type: 'rejection', is_read: false, created_at: new Date().toISOString(),
              }, ...p.filter(n => n.id !== `local-rej-${key}`)]);
              break;
            } else if (obs.status === 'approved' && prev !== 'approved' && prev !== undefined) {
              seenRejectionIds.current.delete(key);
              seenApprovalIds.current.add(key);
              statusTrackMap.current.set(key, 'approved');
              setApprovalNotification({ type: 'obs', title: obsTitle });
              fetchHistory();
              setStudentNotifs(p => [{
                id: `local-apr-${key}`, student_id: session.student_id,
                title: '활동 기록이 승인되었습니다 ✅',
                content: `"${obsTitle}"이 선생님께 승인되었습니다.`,
                type: 'approval', is_read: false, created_at: new Date().toISOString(),
              }, ...p.filter(n => n.id !== `local-apr-${key}`)]);
              break;
            } else {
              statusTrackMap.current.set(key, obs.status);
            }
          }

          // 결과물 상태 변화 감지
          const seenGroups = new Set<string>();
          for (const r of (resultsData || [])) {
            const gId = r.submission_group || r.id;
            if (seenGroups.has(gId)) continue;
            seenGroups.add(gId);
            const key = `result-${gId}`;
            const prev = statusTrackMap.current.get(key);
            const rTitle = r.title || (r.week_number ? `${r.week_number}주차 결과물` : '결과물');
            if (r.status === 'rejected' && prev !== 'rejected' && prev !== undefined) {
              seenApprovalIds.current.delete(key);
              seenRejectionIds.current.add(key);
              statusTrackMap.current.set(key, 'rejected');
              setRejectionNotification({ type: 'result', title: rTitle, feedback: r.rejection_feedback || null });
              fetchResults();
              setStudentNotifs(p => [{
                id: `local-rej-${key}`, student_id: session.student_id,
                title: '결과물이 반려되었습니다',
                content: `"${rTitle}"${r.rejection_feedback ? ` — ${r.rejection_feedback}` : ' (수정 후 재제출하세요)'}`,
                type: 'rejection', is_read: false, created_at: new Date().toISOString(),
              }, ...p.filter(n => n.id !== `local-rej-${key}`)]);
              break;
            } else if (r.status === 'approved' && prev !== 'approved' && prev !== undefined) {
              seenRejectionIds.current.delete(key);
              seenApprovalIds.current.add(key);
              statusTrackMap.current.set(key, 'approved');
              setApprovalNotification({ type: 'result', title: rTitle });
              fetchResults();
              setStudentNotifs(p => [{
                id: `local-apr-${key}`, student_id: session.student_id,
                title: '결과물이 승인되었습니다 ✅',
                content: `"${rTitle}"이 선생님께 승인되었습니다.`,
                type: 'approval', is_read: false, created_at: new Date().toISOString(),
              }, ...p.filter(n => n.id !== `local-apr-${key}`)]);
              break;
            } else {
              statusTrackMap.current.set(key, r.status);
            }
          }
        } else {
          // 첫 폴링: 현재 상태 기록만 (팝업 없음)
          (obsData || []).forEach(obs => statusTrackMap.current.set(`obs-${obs.id}`, obs.status));
          const seenGroups = new Set<string>();
          (resultsData || []).forEach(r => {
            const gId = r.submission_group || r.id;
            if (!seenGroups.has(gId)) { seenGroups.add(gId); statusTrackMap.current.set(`result-${gId}`, r.status); }
          });
        }
      } catch { /* 무시 */ } finally {
        isFirstStatusPoll.current = false;
      }
    };

    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, [session?.student_id]);

  // 수업 보드 세션 폴링 + Realtime 구독 — 선생님 공유 중지/시작 즉시 반영
  useEffect(() => {
    if (!session?.class_id) return;
    fetchActiveBoardSessions();
    const interval = setInterval(fetchActiveBoardSessions, 5_000);

    const channel = supabase
      .channel(`board-session-rt-${session.class_id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'class_board_sessions',
        filter: `class_id=eq.${session.class_id}`,
      }, () => { fetchActiveBoardSessions(); })
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [session?.class_id]);

  // 퀴즈 세션 Realtime 구독 — 선생님이 퀴즈 시작 시 팝업 알림
  useEffect(() => {
    if (!session?.class_id) return;
    fetchActiveQuizSessions();

    const channel = supabase
      .channel(`quiz-session-rt-${session.class_id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'quiz_sessions',
        filter: `class_id=eq.${session.class_id}`,
      }, () => { fetchActiveQuizSessions(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session?.class_id]);

  // 온라인 수업 미팅 Realtime 구독 — 선생님이 등록/종료 시 즉시 반영
  useEffect(() => {
    if (!session?.class_id) return;
    fetchActiveMeeting();

    const channel = supabase
      .channel(`class-meeting-rt-${session.class_id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'class_meetings',
        filter: `class_id=eq.${session.class_id}`,
      }, () => { fetchActiveMeeting(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session?.class_id]);

  // 화이트보드에서 돌아올 때 보드 탭 자동 복원
  // - "나가기" 버튼: location.state.activeTab = 'board'
  // - 브라우저 뒤로가기: sessionStorage 'studentLog_returnTab' = 'board'
  useEffect(() => {
    if (!session?.class_id) return;
    const stateTab = (location.state as Record<string, unknown> | null)?.activeTab as string | undefined;
    const sessionTab = sessionStorage.getItem('studentLog_returnTab');
    if (stateTab === 'board' || sessionTab === 'board') {
      if (sessionTab) sessionStorage.removeItem('studentLog_returnTab');
      setActiveTab('board');
      fetchBoard();
    }
  }, [session?.class_id]);

  // 학생 알림 Realtime 구독
  useEffect(() => {
    if (!session?.student_id) return;
    const channel = supabase
      .channel(`student-notifs-${session.student_id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'student_notifications',
        filter: `student_id=eq.${session.student_id}`,
      }, (payload: any) => {
        setStudentNotifs(prev => [payload.new, ...prev]);
        if (payload.new?.type === 'group_assignment') {
          fetchMyGroup(session.student_id, session.class_id);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.student_id]);

  // 조 편성 Realtime 구독 — 선생님이 배정/변경하면 자동 반영
  useEffect(() => {
    if (!session?.student_id || !session?.class_id) return;
    const channel = supabase
      .channel(`group-members-${session.student_id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'class_group_members',
        filter: `student_id=eq.${session.student_id}`,
      }, () => {
        fetchMyGroup(session.student_id, session.class_id);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.student_id, session?.class_id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isRejectModalOpen) setIsRejectModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRejectModalOpen]);

  useEffect(() => {
    if (!boardSelectedPost || boardSelectedPost._type === 'obs' || !boardSelectedPost._isGroupSub) {
      setBoardGroupModalInfo(null);
      return;
    }
    const groupId = (boardSelectedPost._group || []).find((r: any) => r.group_id)?.group_id;
    const fetchBoardGroupInfo = async () => {
      if (groupId) {
        const [{ data: groupData }, { data: members }] = await Promise.all([
          supabase.from('class_groups').select('name').eq('id', groupId).single(),
          supabase.from('class_group_members').select('student_id, students(full_name)').eq('group_id', groupId),
        ]);
        const memberNames = (members || []).map((m: any) => m.students?.full_name).filter(Boolean);
        setBoardGroupModalInfo({ name: groupData?.name || '조별 제출', memberNames });
      } else {
        setBoardGroupModalInfo({ name: '조별 제출', memberNames: [] });
      }
    };
    fetchBoardGroupInfo();
  }, [boardSelectedPost]);

  const fetchMyGroup = async (studentId: string, classId: string) => {
    const { data: memberData } = await supabase
      .from('class_group_members')
      .select('group_id, class_groups(id, name, class_id)')
      .eq('student_id', studentId);

    if (!memberData || memberData.length === 0) return;

    // 현재 클래스에 해당하는 조 찾기 (여러 클래스 조 멤버일 수 있음)
    const matched = memberData.find(
      (row: any) => row.class_groups?.class_id === classId
    );
    const group = (matched as any)?.class_groups;
    if (!group) return;

    // 같은 조 멤버 이름 조회
    const { data: allMembers } = await supabase
      .from('class_group_members')
      .select('students(full_name)')
      .eq('group_id', group.id);

    const memberNames = (allMembers || [])
      .map((m: any) => m.students?.full_name)
      .filter(Boolean) as string[];

    setMyClassGroup({ id: group.id, name: group.name, memberNames });
  };

  const fetchStudentNotifs = async (studentId: string) => {
    const { data, error: _error } = await supabase
      .from('student_notifications')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setStudentNotifs(data);
  };

  const markAllNotifsRead = async (_studentId: string) => {
    setStudentNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  // 벨 패널 닫을 때 확인된 알림 삭제 (휘발성 처리)
  const deleteReadNotifs = async () => {
    const readIds = studentNotifs.filter(n => n.is_read).map(n => n.id);
    if (readIds.length === 0) return;
    await supabase.from('student_notifications').delete().in('id', readIds);
    setStudentNotifs(prev => prev.filter(n => !n.is_read));
  };

  const fetchUnreadReplyCount = async (studentId: string, classId: string) => {
    const { count } = await supabase
      .from('student_suggestions')
      .select('*', { count: 'exact', head: true })
      .eq('student_id', studentId)
      .eq('class_id', classId)
      .eq('is_reply_read', false)
      .not('teacher_reply', 'is', null);
    if (count !== null) setUnreadReplyCount(count);
  };

  const fetchClassDetails = async (classId: string) => {
    try {
      const { data } = await supabase
        .from('classes')
        .select('teacher_id, student_guide_prompt, weekly_plan, min_obs_chars, blocked_keywords, ai_review_enabled, start_date, end_date, is_closed, parent_class_id, today_started_at, active_week')
        .eq('id', classId)
        .single();

      if (data) {
        setTeacherId(data.teacher_id);
        const startedToday = data.today_started_at &&
          new Date(data.today_started_at).toDateString() === new Date().toDateString();
        setActiveWeek(startedToday ? (data.active_week ?? null) : null);
        setGuidePrompt(data.student_guide_prompt || '수업 시간에 배운 내용과 본인의 활동 역할을 구체적으로 작성하세요. 글의 일부에라도 같은 글자·자음·모음이 의미 없이 반복되는 부분이 있다면, 앞부분에 정상적인 내용이 있더라도 반드시 반려 처리해 주세요.');
        setMinObsChars(data.min_obs_chars || 0);
        setBlockedKeywords(data.blocked_keywords || []);
        setAiReviewEnabled(data.ai_review_enabled ?? true);
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const autoClosedByDate = data.end_date && data.end_date < today;
        setIsClassClosed(!!(data.is_closed || autoClosedByDate));

        // 하위 클래스인 경우 부모 클래스의 weekly_plan 사용
        let resolvedWeeklyPlan = data.weekly_plan;
        if (data.parent_class_id && (!resolvedWeeklyPlan || resolvedWeeklyPlan.length === 0)) {
          const { data: parentData } = await supabase.from('classes').select('weekly_plan').eq('id', data.parent_class_id).single();
          if (parentData?.weekly_plan?.length > 0) resolvedWeeklyPlan = parentData?.weekly_plan;
        }

        if (resolvedWeeklyPlan && Array.isArray(resolvedWeeklyPlan) && resolvedWeeklyPlan.length > 0) {
          setClassResources(resolvedWeeklyPlan);

          // weekly_plan 중 material_id가 있는 항목의 자료 미리 로드
          const materialIds = resolvedWeeklyPlan
            .map((p: any) => p.material_id)
            .filter(Boolean);
          if (materialIds.length > 0) {
            const { data: mats } = await supabase
              .from('class_materials')
              .select('*')
              .in('id', materialIds);
            if (mats) setClassMaterials(mats);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching teacher info:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnnouncements = async (classId: string) => {
    try {
      const { data } = await supabase
        .from('class_announcements')
        .select('*')
        .eq('class_id', classId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(10);
      setAnnouncements(data || []);
    } catch (err) {
      console.error('fetchAnnouncements error:', err);
    }
  };

  // MY HISTORY 탭용 이전 기록 조회
  const fetchHistory = async () => {
    if (!session?.student_id) return;
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('observations')
        .select('*')
        .eq('student_id', session.student_id)
        .eq('is_student_record', true)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('fetchHistory RLS/DB 오류:', error);
      }
      if (data) setHistoryLogs(data);
    } catch (err) {
      console.error('Error fetching history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchResources = async () => {
    if (!session?.class_id) return;
    setResourcesLoading(true);
    try {
      const plan = classResources as any[];
      const materialIds = plan.map(p => p.material_id).filter(Boolean);

      const [matsResult, generalResult, editorResult, toolsResult] = await Promise.all([
        materialIds.length > 0
          ? supabase.from('class_materials').select('*').in('id', materialIds)
          : Promise.resolve({ data: [] }),
        supabase.from('class_general_materials').select('*').eq('class_id', session.class_id).eq('is_published', true).order('created_at', { ascending: false }),
        supabase.from('class_materials').select('*').eq('class_id', session.class_id).eq('is_published', true).order('week_number', { ascending: true }).order('created_at', { ascending: false }),
        supabase.from('class_enabled_tools').select('tool_id').eq('class_id', session.class_id).eq('is_published', true),
      ]);

      setClassMaterials(matsResult.data || []);
      setGeneralMaterials(generalResult.data || []);
      setEditorMaterials(editorResult.data || []);
      setEnabledToolIds((toolsResult.data || []).map((t: any) => t.tool_id));
    } catch (err) {
      console.error('Error fetching resources:', err);
    } finally {
      setResourcesLoading(false);
    }
  };

  // 수업 자료 열람 기록 (학생별 1회)
  const recordMaterialView = async (materialId: string) => {
    if (!session?.student_id) return;
    await supabase.from('student_material_views').upsert(
      { material_id: materialId, student_id: session.student_id },
      { onConflict: 'material_id,student_id', ignoreDuplicates: true }
    );
  };

  const handleStartEditLog = (log: any) => {
    setEditingLogId(log.id);
    setEditLogForm({ activity_name: log.activity_name || '', content: log.content || '' });
  };

  const handleCancelEditLog = () => {
    setEditingLogId(null);
    setEditLogForm({ activity_name: '', content: '' });
  };

  const handleSaveEditLog = async (logId: string) => {
    const hasTopics = classResources && classResources.length > 0 && classResources[0]?.topic;
    const normE = (s: string) => s?.replace(/\s+/g, '').toLowerCase() || '';
    const editWeekMatch = (classResources as any[]).find(r => normE(r.topic) === normE(editLogForm.activity_name.trim()));
    if (!editLogForm.activity_name.trim() || (hasTopics && !editWeekMatch)) {
      showToast(hasTopics ? '주차를 선택해주세요.' : '활동 제목을 입력해주세요.', 'error'); return;
    }
    setSavingLogId(logId);
    try {
      const editWeekNumber = editWeekMatch?.week ?? null;
      const { error } = await supabase
        .from('observations')
        .update({ activity_name: editLogForm.activity_name.trim(), content: editLogForm.content.trim(), week_number: editWeekNumber })
        .eq('id', logId);
      if (error) throw error;
      setHistoryLogs(prev => prev.map(l =>
        l.id === logId ? { ...l, activity_name: editLogForm.activity_name.trim(), content: editLogForm.content.trim(), week_number: editWeekNumber } : l
      ));
      setEditingLogId(null);
      showToast('수정되었습니다.');
    } catch {
      showToast('수정 중 오류가 발생했습니다.', 'error');
    } finally {
      setSavingLogId(null);
    }
  };

  const handleDeleteLog = async (logId: string) => {
    if (!confirm('이 기록을 삭제하시겠습니까?')) return;
    setDeletingLogId(logId);
    try {
      const { error } = await supabase.from('observations').delete().eq('id', logId);
      if (error) throw error;
      setHistoryLogs(prev => prev.filter(l => l.id !== logId));
      showToast('삭제되었습니다.');
    } catch {
      showToast('삭제 중 오류가 발생했습니다.', 'error');
    } finally {
      setDeletingLogId(null);
    }
  };

  const fetchResults = async () => {
    if (!session?.student_id || !session?.class_id) return;
    setResultsLoading(true);
    try {
      const { data, error } = await supabase
        .from('student_results')
        .select('*')
        .eq('student_id', session.student_id)
        .eq('class_id', session.class_id)
        .order('created_at', { ascending: false });
      if (!error && data) setResults(data);
    } catch (err) {
      console.error('Error fetching results:', err);
    } finally {
      setResultsLoading(false);
    }
  };

  const MAX_RESULT_IMAGES = 10;

  const handleImageFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (files.length > MAX_RESULT_IMAGES) {
      alert(`이미지는 최대 ${MAX_RESULT_IMAGES}장까지 선택할 수 있습니다.`);
      e.target.value = '';
      return;
    }
    const oversized = files.find(f => f.size > 20 * 1024 * 1024);
    if (oversized) { alert('파일 크기는 각각 20MB를 초과할 수 없습니다.'); e.target.value = ''; return; }
    setResultImageFiles(files);
    Promise.all(files.map(file => new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve(ev.target?.result as string);
      reader.readAsDataURL(file);
    }))).then(setImagePreviews);
  };

  const handleUploadFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { alert('파일 크기는 20MB를 초과할 수 없습니다.'); e.target.value = ''; return; }
    setResultFileUpload(file);
  };

  const resetResultForm = () => {
    setResultTitle(''); setResultText(''); setResultUrl('');
    setResultImageFiles([]); setResultFileUpload(null); setImagePreviews([]);
    setEditingResult(null); setEditingGroupResults([]); setIsGroupSubmission(false);
    if (resultImageInputRef.current) resultImageInputRef.current.value = '';
    if (resultFileInputRef.current) resultFileInputRef.current.value = '';
  };

  const uploadFile = async (file: File, type: 'image' | 'file') => {
    const ext = file.name.split('.').pop() || '';
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `results/${session.student_id}/${type}-${Date.now()}-${rand}.${ext}`;
    const { error } = await supabase.storage.from('student-attachments').upload(path, file);
    if (error) throw error;
    return { path, displayName: file.name, fileSize: file.size, fileType: file.type };
  };

  const uploadImageFiles = async (files: File[]) => Promise.all(files.map(f => uploadFile(f, 'image')));

  const handleSubmitResult = async () => {
    if (!session?.student_id || !session?.class_id) return;

    // 수정 모드: 그룹 전체 업데이트
    if (editingResult) {
      if (!selectedWeek) {
        showToast('주차를 선택해주세요.', 'error'); return;
      }
      const hasText  = resultText.trim() !== '';
      const hasLink  = resultUrl.trim() !== '';
      const hasImage = resultImageFiles.length > 0;
      const hasFile  = resultFileUpload !== null;
      const keepImg  = imagePreviews.length > 0 && !hasImage; // 기존 이미지 유지 여부

      setResultSubmitting(true);
      try {
        const groupId = editingResult.submission_group || crypto.randomUUID();
        const base = {
          student_id:       editingResult.student_id,
          class_id:         editingResult.class_id,
          week_number:      selectedWeek,
          submission_group: groupId,
          title:            resultTitle.trim() || null,
        };

        // 본인 row만 필터 — RLS 때문에 다른 조원 row를 eq('id',...)로 update하면 0건 처리됨
        const myGroupResults = editingGroupResults.filter((r: any) => r.student_id === session!.student_id);
        const existingText  = myGroupResults.find((r: any) => r.result_type === 'text');
        const existingLink  = myGroupResults.find((r: any) => r.result_type === 'link');
        const existingImage = myGroupResults.find((r: any) => r.result_type === 'image');
        const existingFile  = myGroupResults.find((r: any) => r.result_type === 'file');

        // ── 텍스트 ──
        if (hasText) {
          if (existingText) {
            const { error } = await supabase.from('student_results').update({ title: base.title, week_number: base.week_number, text_content: resultText.trim() }).eq('id', existingText.id);
            if (error) throw error;
          } else {
            const { error } = await supabase.from('student_results').insert({ ...base, result_type: 'text', text_content: resultText.trim() });
            if (error) throw error;
          }
        } else if (existingText) {
          // 텍스트 비움 → 삭제
          await supabase.from('student_results').delete().eq('id', existingText.id);
        }

        // ── 링크 ──
        if (hasLink) {
          if (existingLink) {
            const { error } = await supabase.from('student_results').update({ title: base.title, week_number: base.week_number, link_url: resultUrl.trim() }).eq('id', existingLink.id);
            if (error) throw error;
          } else {
            const { error } = await supabase.from('student_results').insert({ ...base, result_type: 'link', link_url: resultUrl.trim() });
            if (error) throw error;
          }
        } else if (existingLink) {
          await supabase.from('student_results').delete().eq('id', existingLink.id);
        }

        // ── 이미지 ──
        if (hasImage) {
          const oldPaths = existingImage?.storage_paths?.length ? existingImage.storage_paths : (existingImage?.storage_path ? [existingImage.storage_path] : []);
          if (oldPaths.length > 0) await supabase.storage.from('student-attachments').remove(oldPaths);
          const ups = await uploadImageFiles(resultImageFiles);
          const imgPayload = { title: base.title, week_number: base.week_number, storage_paths: ups.map(u => u.path), storage_path: ups[0].path, display_name: ups[0].displayName, file_size: ups.reduce((s, u) => s + u.fileSize, 0), file_type: ups[0].fileType };
          if (existingImage) {
            const { error } = await supabase.from('student_results').update(imgPayload).eq('id', existingImage.id);
            if (error) throw error;
          } else {
            const { error } = await supabase.from('student_results').insert({ ...base, result_type: 'image', ...imgPayload });
            if (error) throw error;
          }
        } else if (existingImage && keepImg) {
          // 기존 이미지 유지 — title, 주차만 반영
          await supabase.from('student_results').update({ title: base.title, week_number: base.week_number }).eq('id', existingImage.id);
        }

        // ── 파일 ──
        if (hasFile) {
          if (existingFile?.storage_path) await supabase.storage.from('student-attachments').remove([existingFile.storage_path]);
          const up = await uploadFile(resultFileUpload!, 'file');
          if (existingFile) {
            const { error } = await supabase.from('student_results').update({ title: base.title, week_number: base.week_number, storage_path: up.path, display_name: up.displayName, file_size: up.fileSize, file_type: up.fileType }).eq('id', existingFile.id);
            if (error) throw error;
          } else {
            const { error } = await supabase.from('student_results').insert({ ...base, result_type: 'file', storage_path: up.path, display_name: up.displayName, file_size: up.fileSize, file_type: up.fileType });
            if (error) throw error;
          }
        } else if (existingFile) {
          // 기존 파일 유지 — title, 주차만 반영
          await supabase.from('student_results').update({ title: base.title, week_number: base.week_number }).eq('id', existingFile.id);
        }

        // 반려 상태였으면 승인 상태로 초기화 — student_id 필터로 본인 행만 처리
        if (editingResult.submission_group) {
          await supabase.from('student_results')
            .update({ status: 'approved', rejection_feedback: null })
            .eq('submission_group', editingResult.submission_group)
            .eq('student_id', session!.student_id);
        }

        // 조별 제출 상태 전환 처리 (SECURITY DEFINER RPC)
        const wasGroup = !!editingResult.is_group_submission;
        const nowGroup = isGroupSubmission && !!myClassGroup;

        if (nowGroup) {
          // 본인 row에 조 정보 반영
          await supabase.from('student_results')
            .update({ group_id: myClassGroup!.id, is_group_submission: true })
            .eq('submission_group', groupId)
            .eq('student_id', session!.student_id);

          if (wasGroup) {
            // 기존 조원들과 내용 동기화
            const { error: syncErr } = await supabase.rpc('sync_group_submission', {
              p_submission_group: editingResult.submission_group,
              p_submitter_id: session!.student_id,
            });
            if (syncErr) console.error('[sync_group_submission 오류]', syncErr);
          } else {
            // 개별 제출 → 조별 제출 전환: 다른 조원에게 새로 복사
            const { data: myRows } = await supabase
              .from('student_results').select('*')
              .eq('submission_group', groupId).eq('student_id', session!.student_id);
            if (myRows && myRows.length > 0) {
              const { error: rpcError } = await supabase.rpc('submit_group_results', {
                p_group_id: myClassGroup!.id,
                p_submitter_id: session!.student_id,
                p_rows: myRows,
              });
              if (rpcError) console.error('[submit_group_results 오류]', rpcError);
            }
          }
        } else if (wasGroup) {
          // 조별 제출 → 개별 제출 전환: 본인 row 조 정보 해제 + 다른 조원 row 삭제
          await supabase.from('student_results')
            .update({ group_id: null, is_group_submission: false })
            .eq('submission_group', editingResult.submission_group)
            .eq('student_id', session!.student_id);

          const { error: unlinkErr } = await supabase.rpc('unlink_group_submission', {
            p_submission_group: editingResult.submission_group,
            p_requester_id: session!.student_id,
          });
          if (unlinkErr) console.error('[unlink_group_submission 오류]', unlinkErr);
        }

        resetResultForm();
        await fetchResults();
        showToast('수정되었습니다! ✅');
      } catch { showToast('오류가 발생했습니다.', 'error'); }
      finally { setResultSubmitting(false); }
      return;
    }

    // 신규 제출 모드
    const hasText = resultText.trim() !== '';
    const hasLink = resultUrl.trim() !== '';
    const hasImage = resultImageFiles.length > 0;
    const hasFile = resultFileUpload !== null;
    if (!hasText && !hasLink && !hasImage && !hasFile) {
      showToast('하나 이상의 항목을 입력해주세요.', 'error'); return;
    }
    if (!selectedWeek) {
      showToast('주차를 선택해주세요.', 'error'); return;
    }

    setResultSubmitting(true);
    try {
      const groupId = crypto.randomUUID();
      const base = { student_id: session.student_id, class_id: session.class_id, week_number: selectedWeek, submission_group: groupId, title: resultTitle.trim() || null, status: 'approved' };
      const rows: any[] = [];

      if (hasText) rows.push({ ...base, result_type: 'text', text_content: resultText.trim() });
      if (hasLink) rows.push({ ...base, result_type: 'link', link_url: resultUrl.trim() });
      if (hasImage) {
        const ups = await uploadImageFiles(resultImageFiles);
        rows.push({ ...base, result_type: 'image', storage_paths: ups.map(u => u.path), storage_path: ups[0].path, display_name: ups[0].displayName, file_size: ups.reduce((s, u) => s + u.fileSize, 0), file_type: ups[0].fileType });
      }
      if (hasFile) {
        const up = await uploadFile(resultFileUpload!, 'file');
        rows.push({ ...base, result_type: 'file', storage_path: up.path, display_name: up.displayName, file_size: up.fileSize, file_type: up.fileType });
      }

      // 조별 제출 시 제출자 row에도 group 표시 추가
      const finalRows = (isGroupSubmission && myClassGroup)
        ? rows.map((r: any) => ({ ...r, group_id: myClassGroup!.id, is_group_submission: true }))
        : rows;

      const { error } = await supabase.from('student_results').insert(finalRows);
      if (error) throw error;

      // 조별 제출: SECURITY DEFINER RPC로 다른 조원에게 동일 결과 복사 (RLS 우회)
      if (isGroupSubmission && myClassGroup) {
        const { data: rpcData, error: rpcError } = await supabase.rpc('submit_group_results', {
          p_group_id: myClassGroup.id,
          p_submitter_id: session.student_id,
          p_rows: finalRows,
        });
        if (rpcError) {
          console.error('조별 제출 RPC 오류:', rpcError);
        } else if (rpcData?.success === false) {
          console.warn('조별 제출 RPC 경고:', rpcData.error);
        }
      }

      if (teacherId) {
        const groupLabel = isGroupSubmission && myClassGroup ? ` [${myClassGroup.name} 조별 제출]` : '';
        await supabase.from('notifications').insert({
          user_id: teacherId,
          title: `📁 ${session.student_name}이(가) ${selectedWeek}주차 결과를 제출했습니다${groupLabel}`,
          content: `${rows.map((r: any) => r.result_type).join('·')} — ${session.class_name}`,
          type: 'result_submission',
          link: `/classroom?id=${session.class_id}&student_id=${session.student_id}`
        });
      }

      resetResultForm();
      await fetchResults();
      const groupMsg = isGroupSubmission && myClassGroup ? ` (${myClassGroup.name} 전체)` : '';
      showToast(`${selectedWeek}주차 결과물이 제출되었습니다${groupMsg}! ✅`);

      // 관찰기록 리마인더 체크
      if (selectedWeek) {
        const norm2 = (s: string) => s?.replace(/\s+/g, '').toLowerCase() || '';
        const weekPlan = (classResources as any[]).find(r => r.week === selectedWeek);
        const weekTopic = weekPlan?.topic || '';
        if (weekTopic && weekPlan?.requires_activity !== false) {
          const hasObs = historyLogs.some((l: any) => norm2(l.activity_name || '') === norm2(weekTopic));
          if (!hasObs) {
            setTimeout(() => setReminderModal({
              type: 'need_obs',
              week: selectedWeek,
              topic: weekTopic,
            }), 3600);
          }
        }
      }
    } catch { showToast('오류가 발생했습니다.', 'error'); }
    finally { setResultSubmitting(false); }
  };

  const handleEditResult = async (result: any) => {
    setEditingResult(result);
    setIsGroupSubmission(!!result.is_group_submission);
    setResultTitle(result.title || '');
    setResultImageFiles([]); setResultFileUpload(null); setImagePreviews([]);
    if (resultImageInputRef.current) resultImageInputRef.current.value = '';
    if (resultFileInputRef.current) resultFileInputRef.current.value = '';

    // submission_group으로 같은 그룹의 모든 row 조회
    let groupResults: any[] = [result];
    if (result.submission_group) {
      const { data } = await supabase
        .from('student_results')
        .select('*')
        .eq('submission_group', result.submission_group);
      if (data && data.length > 0) groupResults = data;
    }
    setEditingGroupResults(groupResults);

    // 각 타입별 pre-populate
    const textRow  = groupResults.find((r: any) => r.result_type === 'text');
    const linkRow  = groupResults.find((r: any) => r.result_type === 'link');
    const imageRow = groupResults.find((r: any) => r.result_type === 'image');

    setResultText(textRow?.text_content || '');
    setResultUrl(linkRow?.link_url || '');

    if (imageRow) {
      setImagePreviews(getResultImagePublicUrls(supabase.storage, imageRow));
    }

    // 수정 중인 주차 고정
    setSelectedWeek(result.week_number || null);

    resultFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleDownloadResult = (result: any) => {
    const { data } = supabase.storage.from('student-attachments').getPublicUrl(result.storage_path);
    downloadFile(data.publicUrl, result.display_name || 'download');
  };

  const handleDeleteResult = async (result: any) => {
    // 그룹 카드에서 삭제 시 그룹 전체 삭제
    const groupRows: any[] = result._group && result._group.length > 1
      ? result._group
      : [result];
    const confirmMsg = groupRows.length > 1
      ? `이 결과 제출(${groupRows.length}개 항목)을 모두 삭제하시겠습니까?`
      : '이 결과물을 삭제하시겠습니까?';
    if (!confirm(confirmMsg)) return;
    try {
      const storagePaths = Array.from(new Set(groupRows.flatMap(r => [r.storage_path, ...(r.storage_paths || [])].filter(Boolean))));
      if (storagePaths.length > 0) {
        await supabase.storage.from('student-attachments').remove(storagePaths);
      }
      if (result.submission_group && groupRows.length > 1) {
        // student_id 필터 필수 — 같은 submission_group을 가진 다른 조원의 행을 삭제하지 않음
        const { error } = await supabase.from('student_results').delete()
          .eq('submission_group', result.submission_group)
          .eq('student_id', session!.student_id);
        if (error) throw error;
        setResults(prev => prev.filter(r => r.submission_group !== result.submission_group));
      } else {
        const { error } = await supabase.from('student_results').delete().eq('id', result.id);
        if (error) throw error;
        setResults(prev => prev.filter(r => r.id !== result.id));
      }
      showToast('삭제되었습니다.');
    } catch (err: any) {
      showToast('삭제 중 오류가 발생했습니다.', 'error');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const fetchPendingUnits = async () => {
    if (!session?.student_id || !session?.class_id) return;
    setUnitsLoading(true);
    try {
      // 완료된 단원 목록 조회
      const { data: units, error: unitsError } = await supabase
        .from('units')
        .select('*')
        .eq('class_id', session.class_id)
        .eq('status', 'completed')
        .order('ended_at', { ascending: false });

      if (unitsError) throw unitsError;
      if (!units || units.length === 0) {
        setPendingUnits([]);
        setUnitPendingCount(0);
        return;
      }

      // 이미 제출한 단원 ID 조회
      const unitIds = units.map((u: any) => u.id);
      const { data: submittedData, error: subError } = await supabase
        .from('unit_submissions')
        .select('unit_id')
        .eq('student_id', session.student_id)
        .in('unit_id', unitIds);

      if (subError) throw subError;

      const submittedIds = new Set((submittedData || []).map((s: any) => s.unit_id));
      const pending = units.filter((u: any) => !submittedIds.has(u.id));

      setPendingUnits(pending);
      setUnitPendingCount(pending.length);
      if (pending.length > 0 && !activeUnitId) {
        setActiveUnitId(pending[0].id);
      }
    } catch (err) {
      console.error('Error fetching pending units:', err);
    } finally {
      setUnitsLoading(false);
    }
  };

  const handleUnitSubmit = async (unitId: string) => {
    if (!session?.student_id) return;

    const unit = pendingUnits.find(u => u.id === unitId);
    const cfg = unit?.form_config || {};

    const MIN_CHARS: Record<string, number> = {
      self_eval: 50,
      inquiry_reflection: 100,
      performance_record: 150,
    };
    const LABELS: Record<string, string> = {
      self_eval: '자기평가서',
      inquiry_reflection: '탐구소감문',
      performance_record: '수행평가 활동 기술',
    };
    for (const key of ['self_eval', 'inquiry_reflection', 'performance_record'] as const) {
      if (!cfg[key]) continue;
      const val = (unitForm[`${unitId}_${key}`] || '').trim();
      const min = MIN_CHARS[key];
      if (val.length < min) {
        showToast(`${LABELS[key]}을(를) 최소 ${min}자 이상 작성해주세요. (현재 ${val.length}자)`, 'error');
        return;
      }
    }
    if (cfg.reading_record) {
      const reflection = (unitForm[`${unitId}_reading_reflection`] || '').trim();
      if (reflection.length < 50) {
        showToast(`독서기록 소감을 최소 50자 이상 작성해주세요. (현재 ${reflection.length}자)`, 'error');
        return;
      }
    }

    setUnitSubmitting(true);
    try {
      const { error } = await supabase
        .from('unit_submissions')
        .insert({
          unit_id: unitId,
          student_id: session.student_id,
          class_id: session.class_id,
          self_eval: unitForm[`${unitId}_self_eval`] || null,
          inquiry_reflection: unitForm[`${unitId}_inquiry_reflection`] || null,
          performance_record: unitForm[`${unitId}_performance_record`] || null,
          reading_record_title: unitForm[`${unitId}_reading_title`] || null,
          reading_record_author: unitForm[`${unitId}_reading_author`] || null,
          reading_record_reflection: unitForm[`${unitId}_reading_reflection`] || null
        });
      if (error) throw error;

      showToast('단원 마무리 서식이 제출되었습니다! 선생님이 세특 초안 작성 시 활용됩니다. ✅');
      await fetchPendingUnits();
      setUnitForm({});
    } catch (err: any) {
      showToast('제출 중 오류가 발생했습니다.', 'error');
    } finally {
      setUnitSubmitting(false);
    }
  };

  const fetchSuggestions = async () => {
    if (!session?.student_id || !session?.class_id) return;
    setSuggestionsLoading(true);
    try {
      const { data, error } = await supabase
        .from('student_suggestions')
        .select('*')
        .eq('student_id', session.student_id)
        .eq('class_id', session.class_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (data) {
        setSuggestions(data);
        // 읽지 않은 답변이 있으면 읽음 처리
        const unreadIds = data
          .filter(s => s.teacher_reply && !s.is_reply_read)
          .map(s => s.id);
        if (unreadIds.length > 0) {
          await supabase.from('student_suggestions')
            .update({ is_reply_read: true })
            .in('id', unreadIds);
          setUnreadReplyCount(0);
        }
      }
    } catch (err) {
      console.error('Error fetching suggestions:', err);
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const handleSubmitSuggestion = async () => {
    if (!suggestionContent.trim()) {
      showToast('질문·건의함 내용을 입력해주세요.', 'error'); return;
    }
    if (!session?.student_id || !session?.class_id || !teacherId) return;
    setSuggestionSubmitting(true);
    try {
      const { error } = await supabase
        .from('student_suggestions')
        .insert({
          student_id: session.student_id,
          class_id: session.class_id,
          teacher_id: teacherId,
          student_name: session.student_name,
          content: suggestionContent.trim()
        });
      if (error) throw error;

      await supabase.from('notifications').insert({
        user_id: teacherId,
        title: `💬 ${session.student_name}이(가) 질문·건의함에 등록했습니다`,
        content: suggestionContent.trim().slice(0, 80),
        type: 'student_submission',
        link: `/classroom?id=${session.class_id}&student_id=${session.student_id}`
      });

      setSuggestionContent('');
      showToast('질문·건의함에 등록되었습니다! ✅');
      await fetchSuggestions();
    } catch {
      showToast('등록 중 오류가 발생했습니다.', 'error');
    } finally {
      setSuggestionSubmitting(false);
    }
  };

  const handleStartEditSuggestion = (s: any) => {
    setEditingSuggestionId(s.id);
    setEditSuggestionContent(s.content);
  };

  const handleCancelEditSuggestion = () => {
    setEditingSuggestionId(null);
    setEditSuggestionContent('');
  };

  const handleSaveEditSuggestion = async (id: string) => {
    if (!editSuggestionContent.trim()) {
      showToast('내용을 입력해주세요.', 'error'); return;
    }
    setSavingSuggestionId(id);
    try {
      const { error } = await supabase
        .from('student_suggestions')
        .update({ content: editSuggestionContent.trim() })
        .eq('id', id);
      if (error) throw error;
      setSuggestions(prev => prev.map(s =>
        s.id === id ? { ...s, content: editSuggestionContent.trim() } : s
      ));
      setEditingSuggestionId(null);
      showToast('수정되었습니다.');
    } catch {
      showToast('수정 중 오류가 발생했습니다.', 'error');
    } finally {
      setSavingSuggestionId(null);
    }
  };

  const handleDeleteSuggestion = async (id: string) => {
    if (!confirm('이 내용을 삭제하시겠습니까?')) return;
    setDeletingSuggestionId(id);
    try {
      const { error } = await supabase.from('student_suggestions').delete().eq('id', id);
      if (error) throw error;
      setSuggestions(prev => prev.filter(s => s.id !== id));
      showToast('삭제되었습니다.');
    } catch {
      showToast('삭제 중 오류가 발생했습니다.', 'error');
    } finally {
      setDeletingSuggestionId(null);
    }
  };

  const fetchActiveQuizSessions = async () => {
    if (!session?.class_id) return;
    setQuizLoading(true);
    try {
      const { data, error } = await supabase
        .from('quiz_sessions')
        .select('id, pin_code, state, created_at, quiz_sets(title)')
        .eq('class_id', session.class_id)
        .neq('state', 'FINAL')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setActiveQuizSessions(data);
        // 새 퀴즈 세션 팝업 알림 (최초 로드 제외)
        if (!isFirstQuizPoll.current) {
          const newSession = data.find(s => !seenQuizSessionIds.current.has(s.id));
          if (newSession && session?.student_id) {
            const title = (newSession.quiz_sets as any)?.title ?? '퀴즈';
            setQuizSessionAlert({ id: newSession.id, pin_code: newSession.pin_code, title });
            setStudentNotifs(prev => [{
              id: `local-quiz-${newSession.id}`,
              student_id: session.student_id,
              title: '퀴즈가 시작되었습니다! 🎮',
              content: `"${title}" — PIN: ${newSession.pin_code}`,
              type: 'quiz_started',
              is_read: false,
              created_at: new Date().toISOString(),
            }, ...prev]);
          }
        }
        data.forEach(s => seenQuizSessionIds.current.add(s.id));
        isFirstQuizPoll.current = false;
      }
    } catch (err) {
      console.error('Error fetching quiz sessions:', err);
    } finally {
      setQuizLoading(false);
    }
  };

  const fetchQuizHistory = async (classId?: string, studentName?: string) => {
    const cId = classId ?? session?.class_id;
    const sName = studentName ?? session?.student_name;
    if (!cId || !sName) return;
    setQuizHistoryLoading(true);
    const { data } = await supabase
      .from('quiz_score_history')
      .select('id, quiz_set_title, rank, score, played_at')
      .eq('class_id', cId)
      .eq('student_name', sName)
      .order('played_at', { ascending: false })
      .limit(20);
    if (data) setQuizHistory(data);
    setQuizHistoryLoading(false);
  };

  const fetchActiveSurveyForms = async () => {
    if (!session?.class_id) return;
    setSurveyLoading(true);
    try {
      const { data, error } = await supabase
        .from('survey_forms')
        .select('id, title, pin_code, status, created_at')
        .eq('class_id', session.class_id)
        .eq('status', 'open')
        .order('created_at', { ascending: false });
      if (!error && data) setActiveSurveyForms(data);
    } catch (err) {
      console.error('Error fetching survey forms:', err);
    } finally {
      setSurveyLoading(false);
    }
  };

  const fetchActiveBoardSessions = async () => {
    if (!session?.class_id) return;
    const { data } = await supabase
      .from('class_board_sessions')
      .select('id, class_name, session_code, group_count, group_size, created_at')
      .eq('class_id', session.class_id)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    const sessions = data || [];

    // 세션이 있어도 실제로 공개된 보드가 없으면 입장 버튼 숨김
    // (선생님이 공유 중지 시 session.status 업데이트가 RLS로 막혀도 안전하게 동작)
    if (sessions.length > 0) {
      const { data: publicBoards } = await supabase
        .from('whiteboards')
        .select('id')
        .eq('class_id', session.class_id)
        .eq('is_public', true)
        .limit(1);
      if (!publicBoards || publicBoards.length === 0) {
        setActiveBoardSessions([]);
        isFirstBoardPoll.current = false;
        return;
      }
    }

    if (!isFirstBoardPoll.current) {
      const newSession = sessions.find(s => !seenBoardSessionIds.current.has(s.id));
      if (newSession) {
        setBoardSessionAlert(newSession);
        setStudentNotifs(prev => [{
          id: `local-board-${newSession.id}`,
          student_id: session?.student_id ?? '',
          title: '수업 보드가 시작되었습니다! 🎨',
          content: '보드 탭에서 바로 참여할 수 있습니다.',
          type: 'board_started',
          is_read: false,
          created_at: new Date().toISOString(),
        }, ...prev]);
      }
    }
    sessions.forEach(s => seenBoardSessionIds.current.add(s.id));
    isFirstBoardPoll.current = false;
    setActiveBoardSessions(sessions);
  };

  const fetchActiveMeeting = async () => {
    if (!session?.class_id) return;
    setMeetingLoading(true);
    try {
      const { data } = await supabase
        .from('class_meetings')
        .select('id, title, platform, meeting_url, scheduled_at, is_active, created_at')
        .eq('class_id', session.class_id)
        .order('created_at', { ascending: false })
        .limit(10);
      const all = data || [];
      setMeetingHistory(all);
      setActiveMeeting(all.find(m => m.is_active) ?? null);
    } catch (err) {
      console.error('Error fetching class meetings:', err);
    } finally {
      setMeetingLoading(false);
    }
  };

  const fetchBoard = async () => {
    if (!session?.class_id) return;
    setBoardLoading(true);
    try {
      const norm = (s: string) => s?.replace(/\s+/g, '').toLowerCase() || '';

      // 1. 학생 목록 조회
      const { data: studentList } = await supabase
        .from('students')
        .select('id, full_name')
        .eq('class_id', session.class_id);
      const studentIds = (studentList || []).map((s: any) => s.id);
      const nameMap: Record<string, string> = Object.fromEntries(
        (studentList || []).map((s: any) => [s.id, s.full_name])
      );

      // activity_name → week_number 매핑 (이미 로드된 classResources 사용)
      const topicWeekMap: Record<string, number> = {};
      (classResources as any[]).forEach((p: any) => {
        if (p.topic && p.week) topicWeekMap[norm(p.topic)] = Number(p.week);
      });

      if (studentIds.length === 0) { setBoardPosts([]); setBoardLoading(false); return; }

      // 2. 관찰기록 + 결과 병렬 조회 (최신 100건씩 제한 — 학생 뷰)
      const [{ data: obs }, { data: results }] = await Promise.all([
        supabase
          .from('observations')
          .select('id, student_id, activity_name, content, created_at, status')
          .in('student_id', studentIds)
          .eq('is_student_record', true)
          .eq('status', 'approved')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('student_results')
          .select('id, student_id, week_number, title, text_content, storage_path, storage_paths, display_name, link_url, result_type, submission_group, is_group_submission, group_id, created_at')
          .in('student_id', studentIds)
          .order('created_at', { ascending: false })
          .limit(300),
      ]);

      // 3. student_name 매핑 + 이미지 URL 변환(썸네일) + 관찰기록에 week_number 부여
      const obsPosts = (obs || []).map((o: any) => ({
        ...o,
        week_number: topicWeekMap[norm(o.activity_name)] ?? null,
        student_name: nameMap[o.student_id] || '학생',
        _type: 'obs' as const,
      }));

      // 2단계 그룹핑:
      // Pass1: submission_group 또는 학생별 10분 시간버킷으로 1차 묶기
      // Pass2: 조별 제출은 group_id + week + 30분 버킷으로 학생 간 병합
      const boardPass1Key = (r: any): string => {
        if (r.submission_group) return r.submission_group;
        const b = Math.floor(new Date(r.created_at).getTime() / (1000 * 60 * 10));
        return `s_${r.student_id}_w_${r.week_number ?? 0}_b_${b}`;
      };
      const boardPass1: Record<string, any[]> = {};
      (results || []).forEach((r: any) => {
        const key = boardPass1Key(r);
        if (!boardPass1[key]) boardPass1[key] = [];
        boardPass1[key].push(r);
      });
      const boardGroupMap: Record<string, any[]> = {};
      Object.values(boardPass1).forEach((group: any[]) => {
        const rep = group[0];
        const anyGroupId = group.find((r: any) => r.group_id)?.group_id;
        const anyIsGroup = group.some((r: any) => r.is_group_submission);
        let finalKey: string;
        if (anyIsGroup && anyGroupId) {
          const b = Math.floor(new Date(rep.created_at).getTime() / (1000 * 60 * 30));
          finalKey = `g_${anyGroupId}_w_${rep.week_number ?? 0}_b_${b}`;
        } else {
          finalKey = boardPass1Key(rep);
        }
        if (!boardGroupMap[finalKey]) boardGroupMap[finalKey] = [];
        boardGroupMap[finalKey].push(...group);
      });

      const resultPosts = Object.values(boardGroupMap).map((group: any[]) => {
        const rep = group[0];
        const imageItem = group.find((r: any) => r.result_type === 'image');
        const fileItem  = group.find((r: any) => r.result_type === 'file');
        const textItem  = group.find((r: any) => r.result_type === 'text');
        const linkItem  = group.find((r: any) => r.result_type === 'link');

        let image_url = null;
        let image_original_url = null;
        let file_url = null;

        const image_urls = getResultImagePublicUrls(supabase.storage, imageItem);
        if (image_urls.length > 0) {
          image_original_url = image_urls[0];
          image_url = image_original_url;
        }
        if (fileItem?.storage_path) {
          const { data: urlData } = supabase.storage.from('student-attachments').getPublicUrl(fileItem.storage_path);
          file_url = urlData?.publicUrl || null;
        }

        return {
          ...rep,
          text_content: textItem?.text_content || null,
          link_url: linkItem?.link_url || null,
          display_name: fileItem?.display_name || rep.display_name,
          image_url,
          image_original_url,
          image_urls,
          file_url,
          student_name: nameMap[rep.student_id] || '학생',
          _type: 'result' as const,
          _group: group,
          _types: [...new Set(group.map((r: any) => r.result_type))] as string[],
          _isGroupSub: group.some((r: any) => r.is_group_submission) || new Set(group.map((r: any) => r.student_id)).size > 1,
        };
      });

      // 3단계: 같은 학생 + 같은 주차 + 같은 날짜(달력 기준)에 여러 번 제출한 건을
      // 하나의 카드로 합침 — 가장 먼저 제출한 건을 대표로, 나머지는 모달에서 시간순 표시
      const dayMergeMap: Record<string, any[]> = {};
      resultPosts.forEach((post: any) => {
        const d = new Date(post.created_at);
        const dayStr = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        const key = `${post.student_id}_w${post.week_number ?? 0}_${dayStr}`;
        if (!dayMergeMap[key]) dayMergeMap[key] = [];
        dayMergeMap[key].push(post);
      });
      const mergedResultPosts = Object.values(dayMergeMap).map((subs: any[]) => {
        const sorted = [...subs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        return { ...sorted[0], _submissions: sorted };
      });

      setBoardPosts([...obsPosts, ...mergedResultPosts].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
    } catch (err) {
      console.error('fetchBoard error:', err);
    } finally {
      setBoardLoading(false);
    }
  };

  const fetchNotes = async () => {
    if (!session?.student_id || !session?.class_id) return;
    setNoteListLoading(true);
    try {
      const { data } = await supabase
        .from('student_notes')
        .select('id, title, content, created_at, updated_at')
        .eq('student_id', session.student_id)
        .eq('class_id', session.class_id)
        .order('created_at', { ascending: false });
      setNoteList(data ?? []);
    } catch {
      // 조용히 실패
    } finally {
      setNoteListLoading(false);
    }
  };

  const createNote = async () => {
    if (!session?.student_id || !session?.class_id) return;
    setNoteCreating(true);
    try {
      const { data, error } = await supabase
        .from('student_notes')
        .insert({ student_id: session.student_id, class_id: session.class_id, title: '제목 없음', content: '' })
        .select('id, title, content, created_at, updated_at')
        .single();
      if (error) throw error;
      setNoteList(prev => [data, ...prev]);
      setSelectedNote(data);
      setNoteContent('');
      setNoteTitleInput('제목 없음');
      setNoteEditorKey(k => k + 1);
      setNoteSaveStatus('idle');
      setNoteHasUnsavedChanges(false);
    } catch {
      showToast('노트 생성에 실패했습니다.');
    } finally {
      setNoteCreating(false);
    }
  };

  const selectNote = (note: NoteItem) => {
    setSelectedNote(note);
    setNoteContent(note.content);
    setNoteTitleInput(note.title);
    setNoteEditorKey(k => k + 1);
    setNoteSaveStatus('idle');
    setNoteHasUnsavedChanges(false);
  };

  const navigateToNoteList = () => {
    setSelectedNote(null);
    setNoteContent('');
    setNoteTitleInput('');
    setNoteSaveStatus('idle');
    setNoteHasUnsavedChanges(false);
    setShowUnsavedModal(false);
    fetchNotes();
  };

  const backToNoteList = () => {
    if (noteHasUnsavedChanges) {
      setShowUnsavedModal(true);
      return;
    }
    navigateToNoteList();
  };

  const handleManualSave = async () => {
    if (!selectedNote || isNoteImageUploadingRef.current || noteSaving) return;
    const content = latestNoteContentRef.current;
    if (content.includes('data:image/')) return;
    setNoteSaving(true);
    try {
      await supabase
        .from('student_notes')
        .update({ content, title: noteTitleInput, updated_at: new Date().toISOString() })
        .eq('id', selectedNote.id);
      setNoteHasUnsavedChanges(false);
      setNoteSaveStatus('saved');
      setTimeout(() => setNoteSaveStatus('idle'), 2500);
    } catch {
      setNoteSaveStatus('error');
    } finally {
      setNoteSaving(false);
    }
  };

  // 노트 이미지 업로드 (WebP 변환 후 Supabase Storage 저장)
  const handleNoteImageUpload = async (file: File): Promise<string> => {
    if (!session?.student_id) throw new Error('세션 없음');
    // canvas.toBlob 콜백 안에서 new File() 사용 시 Vite 8 / Rolldown 번들러가 생성자를
    // 잘못 최적화하여 'zl is not a constructor' 오류 발생 + Promise hang 유발.
    // new File() 대신 Blob 그대로 업로드 (Supabase storage.upload은 Blob 허용).
    const compressed = await new Promise<Blob>((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        let { width, height } = img;
        const MAX = 1280;
        if (width > MAX) { height = Math.round(height * MAX / width); width = MAX; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        canvas.toBlob(
          blob => (blob ? resolve(blob) : resolve(file)),
          'image/webp',
          0.85
        );
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지 로드 실패')); };
      img.src = url;
    });
    const path = `notes/${session.student_id}/${Date.now()}.webp`;
    const { error } = await supabase.storage.from('student-attachments').upload(path, compressed);
    if (error) throw error;
    const { data } = supabase.storage.from('student-attachments').getPublicUrl(path);
    return data.publicUrl;
  };

  // 이미지 업로드 상태 변화 콜백 (RichEditor → StudentLog)
  const handleNoteImageUploadingChange = (uploading: boolean) => {
    isNoteImageUploadingRef.current = uploading;
    setIsNoteImageUploading(uploading);
    // 업로드 완료 시 content는 handleNoteChange에서 이미 최신화됨 (URL 교체 → onUpdate 발생)
  };

  const handleNoteChange = (content: string) => {
    setNoteContent(content);
    latestNoteContentRef.current = content;
    setNoteHasUnsavedChanges(true);
  };

  const handleNoteTitleChange = (title: string) => {
    setNoteTitleInput(title);
    setNoteHasUnsavedChanges(true);
  };

  const deleteNote = async (id: string) => {
    try {
      await supabase.from('student_notes').delete().eq('id', id);
      setNoteList(prev => prev.filter(n => n.id !== id));
      setNoteDeleteId(null);
      showToast('노트가 삭제되었습니다.');
    } catch {
      showToast('삭제에 실패했습니다.');
    }
  };

  const handleTabChange = (tab: 'home' | 'record' | 'history' | 'badges' | 'materials' | 'tools' | 'results' | 'unit' | 'suggestions' | 'quiz' | 'survey' | 'board' | 'notes' | 'meeting') => {
    setActiveTab(tab);
    setIsMoreSheetOpen(false);
    if (tab === 'history') { fetchHistory(); fetchResults(); }
    if (tab === 'materials') fetchResources();
    if (tab === 'tools') fetchResources();
    if (tab === 'results') fetchResults();
    if (tab === 'unit') fetchPendingUnits();
    if (tab === 'suggestions') fetchSuggestions();
    if (tab === 'quiz') { fetchActiveQuizSessions(); fetchQuizHistory(); }
    if (tab === 'survey') fetchActiveSurveyForms();
    if (tab === 'board') { fetchBoard(); fetchActiveBoardSessions(); }
    if (tab === 'notes') { setSelectedNote(null); fetchNotes(); }
    if (tab === 'meeting') fetchActiveMeeting();
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

  const handleSubmit = async () => {
    const hasTopics = classResources && classResources.length > 0 && classResources[0]?.topic;
    const normTitle = (s: string) => s?.replace(/\s+/g, '').toLowerCase() || '';
    const titleWeekMatch = hasTopics ? (classResources as any[]).find(r => normTitle(r.topic) === normTitle(title)) : null;
    if (!title || (hasTopics && !titleWeekMatch)) {
      showToast(hasTopics ? '주차를 선택해주세요.' : '활동 제목을 입력해주세요.', 'error');
      return;
    }
    if (!content) {
      showToast('활동 내용을 입력해주세요.', 'error');
      return;
    }

    if (!session?.student_id || !teacherId) return;

    // ── 최소 글자수 검사 (하드 차단) ────────────────────────────────────────
    if (minObsChars > 0 && content.trim().length < minObsChars) {
      showToast(`주요 활동 내용을 최소 ${minObsChars}자 이상 작성해주세요. (현재 ${content.trim().length}자)`, 'error');
      return;
    }

    // ── 금지어 검사 (하드 차단) ───────────────────────────────────────────────
    if (blockedKeywords.length > 0) {
      const fullText = `${title} ${content} ${feeling}`.toLowerCase();
      const hit = blockedKeywords.find(kw => kw && fullText.includes(kw.toLowerCase()));
      if (hit) {
        showToast(`"${hit}"은(는) 사용할 수 없는 단어입니다. 내용을 수정한 후 다시 제출해주세요.`, 'error');
        return;
      }
    }

    setSubmitting(true);
    try {
      // ── AI 가이드 검토 ──────────────────────────────────────────────────────
      // guidePrompt가 있을 때만 실행. AI 오류가 나더라도 제출 자체는 막지 않음.
      // AI 검토 결과를 저장해서 관찰기록 저장 시 함께 사용
      let aiReviewFlag: 'good' | 'review_needed' | null = null;
      let aiConcern = '';
      let aiFeedbackForModal: { reason: string; guide: string } | null = null;

      if (guidePrompt && aiReviewEnabled) {
        try {
          const contentLength = content.trim().length;
          const prompt = `
당신은 학생이 제출한 활동 기록의 내용 품질을 판단하는 AI입니다.
글자수 미달·금지어는 이미 사전에 차단되었으므로 당신은 내용의 질만 평가합니다.

[교사의 지침]
${guidePrompt}

[학생이 제출한 활동 정보]
제목: "${title}"
내용(${contentLength}자): "${content}"
배운 점 및 느낀 점: "${feeling}"

━━ 평가 기준 (두 가지만) ━━

1. review_needed (교사 검토 필요):
   - 교사 지침의 핵심 요구사항을 명백히 충족하지 못한 경우
   - 수업과 무관하거나 구체적 활동 없이 단순 감상·감정만 나열한 경우
   - 의미 없는 문장 반복으로 분량만 채운 경우
   - 같은 글자·자음·모음이 의미 없이 반복되는 부분(예: "아아아아", "ㅋㅋㅋㅋㅋ", "ㅠㅠㅠㅠㅠ" 등)이 내용에 조금이라도 포함된 경우
     → 앞부분에 정상적인 내용이 있어 전체적으로는 승인할 만해 보이더라도, 이 경우는 예외 없이 반드시 review_needed로 처리하세요.
   → reason: 학생에게 보여줄 반려 사유 (한두 문장, 구체적으로)
   → guide: 어떻게 수정하면 좋을지 친절한 개선 방향 (한두 문장)

2. good (승인):
   - 교사 지침을 어느 정도 충족하거나 수업과 관련된 내용이 있으면 승인
   - 분량·문체·맞춤법 무관, 진정성 있는 내용이면 승인
   - 위 review_needed 사유(특히 무의미한 문자 반복)에 해당하지 않는 한, 애매한 경우는 반드시 good으로 처리

반드시 아래 JSON 형식만 반환하세요 (다른 텍스트 없이):
{"status":"good","reason":"","guide":""}
`;
          const aiResult = await observationReviewAI.generateContent(prompt, { class_id: session?.class_id });
          const aiResponseText = aiResult.response.text();

          const jsonMatch = aiResponseText.match(/\{[\s\S]*?\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.status === 'review_needed' && parsed.reason) {
              aiReviewFlag = 'review_needed';
              aiConcern = parsed.reason;
              aiFeedbackForModal = { reason: parsed.reason, guide: parsed.guide || '교사 지침을 참고하여 구체적인 활동 내용을 추가해 주세요.' };
            } else {
              aiReviewFlag = 'good';
            }
          }
        } catch (aiErr) {
          console.warn('[AI 검토 오류 — 제출 진행]', aiErr);
        }
      }

      // ── 1. 관찰 기록 저장 ──────────────────────────────────────────────────
      // review_needed → rejected 자동 반려 (teacher_feedback = AI 사유)
      const obsStatus = aiReviewFlag === 'review_needed' ? 'rejected' : 'approved';
      const weekMatch = titleWeekMatch ?? (classResources as any[]).find(r => normTitle(r.topic) === normTitle(title));
      const { error: obsError } = await supabase
        .from('observations')
        .insert({
          teacher_id: teacherId,
          student_id: session.student_id,
          activity_name: title,
          content: `${content}\n\n[배운 점 및 느낀 점]\n${feeling}`,
          is_student_record: true,
          status: obsStatus,
          ai_concern: aiConcern || null,
          teacher_feedback: aiReviewFlag === 'review_needed' ? aiConcern : null,
          category: session?.subject || '학생 제출',
          week_number: weekMatch?.week ?? null,
        });

      if (obsError) throw new Error(`기록 저장 오류: ${obsError.message}`);

      // ── 2. 교사 알림 전송 (실패해도 제출 성공으로 처리) ───────────────────
      if (aiReviewFlag !== 'review_needed') {
        // 승인된 제출만 일반 알림 전송
        supabase
          .from('notifications')
          .insert({
            user_id: teacherId,
            title: `📝 ${session.student_name}이(가) 활동을 제출했습니다`,
            content: `"${title}" — ${session.class_name}`,
            type: 'student_submission',
            link: `/classroom?id=${session.class_id}&student_id=${session.student_id}`,
          })
          .then(({ error }) => {
            if (error) console.warn('[알림 전송 실패]', error.message);
          });
      } else {
        // 자동 반려 → 선생님에게 "재검토 가능" 알림
        supabase
          .from('notifications')
          .insert({
            user_id: teacherId,
            title: `🔄 AI 자동 반려 · ${session.student_name} "${title}"`,
            content: `반려 사유: ${aiConcern} (승인으로 변경 가능)`,
            type: 'ai_review_needed',
            link: `/classroom?id=${session.class_id}&student_id=${session.student_id}`,
          })
          .then(({ error }) => {
            if (error) console.warn('[자동반려 알림 실패]', error.message);
          });
      }

      // ── 3. 자동 반려인 경우 즉시 반려 모달 표시 후 종료 ──────────────────
      if (aiReviewFlag === 'review_needed' && aiFeedbackForModal) {
        setAiFeedback(aiFeedbackForModal);
        setRejectModalType('auto_reject');
        setIsRejectModalOpen(true);
        await fetchHistory();
        setSubmitting(false);
        return;
      }

      showToast('제출 완료! ✅');

      // 결과제출 리마인더 체크 — stale state 대신 DB 직접 조회
      const normR = (s: string) => s?.replace(/\s+/g, '').toLowerCase() || '';
      const matchedWeekPlan = (classResources as any[]).find(r => normR(r.topic) === normR(title));
      if (matchedWeekPlan && matchedWeekPlan.requires_result !== false) {
        const { count } = await supabase
          .from('student_results')
          .select('*', { count: 'exact', head: true })
          .eq('student_id', session.student_id)
          .eq('class_id', session.class_id)
          .eq('week_number', matchedWeekPlan.week);
        if ((count ?? 0) === 0) {
          setTimeout(() => setReminderModal({
            type: 'need_result',
            week: matchedWeekPlan.week,
            topic: matchedWeekPlan.topic,
          }), 3600);
        }
      }

      setTitle('');
      setContent('');
      setFeeling('');
      handleTabChange('history');

    } catch (err: any) {
      console.error('[handleSubmit 오류]', err);
      showToast('저장 중 오류가 발생했습니다: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }

  // 주차별 자료 탭에 이미 노출되는(주차에 연결된) 에디터 자료는 자료 에디터 탭에서 중복 표시하지 않음
  const linkedEditorMaterialIds = new Set((classResources as any[]).map(r => r.material_id).filter(Boolean));
  const unlinkedEditorMaterials = editorMaterials.filter((mat: any) => !linkedEditorMaterialIds.has(mat.id));

  return (
    <>
    {fullscreenMaterial && createPortal(
      <div className="fixed inset-0 z-[9999] bg-white flex flex-col">
        <div className="flex items-center gap-3 px-5 py-3 bg-slate-800 shrink-0">
          <button
            onClick={() => setFullscreenMaterial(null)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-slate-800 font-black text-sm hover:bg-slate-100 active:scale-95 transition-all shadow"
          >
            <ArrowLeft size={15} /> 나가기
          </button>
          <div className="flex items-center gap-2 ml-2">
            <Eye size={15} className="text-white/60" />
            <span className="font-black text-sm text-white/80 truncate max-w-xs">{fullscreenMaterial.title}</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-8 py-10">
            <ReactMarkdown
              rehypePlugins={[rehypeRaw]}
              components={MATERIAL_MD_COMPONENTS}
            >
              {fullscreenMaterial.content}
            </ReactMarkdown>
          </div>
        </div>
      </div>,
      document.body
    )}
    <div className={`min-h-screen bg-surface flex flex-col p-6 pb-28 lg:pb-6 transition-[padding] duration-200 ${isSidebarCollapsed ? 'lg:pl-28' : 'lg:pl-72'}`}>
      {/* Top Navbar */}
      <header className="flex items-center justify-between px-6 py-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white rotate-3 shadow-lg shadow-primary/20">
            <GraduationCap size={24} />
          </div>
          <h1 className="text-xl font-black font-manrope tracking-tighter">클래스로그</h1>
        </div>
        
        <div className="flex items-center gap-6">
          {/* Bell 알림 버튼 */}
          <div className="relative">
            <button
              onClick={() => {
                if (notifOpen) {
                  // 닫을 때: 읽은 알림 삭제 (휘발성)
                  markAllNotifsRead(session?.student_id || '');
                  setTimeout(deleteReadNotifs, 300);
                  setNotifOpen(false);
                } else {
                  setNotifOpen(true);
                  if (session?.student_id) markAllNotifsRead(session.student_id);
                }
              }}
              className="relative p-2.5 rounded-xl bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-all"
            >
              <Bell size={20} />
              {unreadNotifCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center shadow">
                  {unreadNotifCount}
                </span>
              )}
            </button>

            {/* 알림 패널 드롭다운 */}
            <AnimatePresence>
              {notifOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => {
                    markAllNotifsRead(session?.student_id || '');
                    setTimeout(deleteReadNotifs, 300);
                    setNotifOpen(false);
                  }} />
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-80 z-40 bg-white rounded-2xl shadow-2xl border border-neutral-100 overflow-hidden"
                  >
                    <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
                      <span className="font-black text-sm">알림</span>
                      {studentNotifs.length > 0 && (
                        <span className="text-[10px] font-bold text-neutral-400">{studentNotifs.length}개</span>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {studentNotifs.length === 0 ? (
                        <div className="py-10 text-center text-neutral-400 text-xs font-bold">알림이 없습니다</div>
                      ) : studentNotifs.map(n => {
                        const iconMap: Record<string, string> = {
                          rejection: '🚨',
                          approval: '✅',
                          quiz_started: '🎮',
                          board_started: '🎨',
                          group_assignment: '📋',
                        };
                        const bgMap: Record<string, string> = {
                          rejection: 'bg-red-50/60',
                          approval: 'bg-green-50/60',
                          quiz_started: 'bg-violet-50/60',
                          board_started: 'bg-blue-50/60',
                          group_assignment: 'bg-indigo-50/40',
                        };
                        const dotMap: Record<string, string> = {
                          rejection: 'bg-red-500',
                          approval: 'bg-green-500',
                          quiz_started: 'bg-violet-500',
                          board_started: 'bg-blue-500',
                          group_assignment: 'bg-indigo-500',
                        };
                        const icon = iconMap[n.type] ?? '🔔';
                        const bg = n.is_read ? '' : (bgMap[n.type] ?? 'bg-indigo-50/40');
                        const dot = dotMap[n.type] ?? 'bg-indigo-500';
                        return (
                          <div key={n.id} className={`px-5 py-3.5 border-b border-neutral-50 last:border-0 ${n.is_read ? 'opacity-60' : bg}`}>
                            <div className="flex items-start gap-2.5">
                              <span className="text-base shrink-0 mt-0.5">{icon}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  {!n.is_read && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />}
                                  <p className="text-xs font-black text-on-surface leading-snug">{n.title}</p>
                                </div>
                                {n.content && <p className="text-[11px] text-neutral-500 mt-0.5 leading-snug">{n.content}</p>}
                                <p className="text-[10px] text-neutral-400 mt-1">{new Date(n.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-4 pl-4 border-l border-surface-container">
            <div className="text-right">
              <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-0.5">STUDENT LOG</p>
              <p className="text-sm font-black">{session?.student_name}</p>
              {myClassGroup && (
                <p className="text-[10px] font-bold text-on-surface-variant/60 mt-0.5">{myClassGroup.name}</p>
              )}
            </div>
            <button
              onClick={() => setShowAvatarPicker(true)}
              title="아바타 수정"
              className="group relative w-12 h-12 rounded-[1rem] bg-primary/10 flex items-center justify-center text-primary shadow-sm border border-primary/10 overflow-hidden shrink-0"
            >
              {studentAvatar ? (
                <img src={studentAvatar} alt="내 아바타" className="w-full h-full object-cover" />
              ) : (
                <User size={24} />
              )}
              <span className="absolute inset-0 bg-on-surface/0 group-hover:bg-on-surface/40 transition-colors flex items-center justify-center">
                <Pencil size={14} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </span>
            </button>
          </div>
        </div>
      </header>

      <AvatarPicker
        isOpen={showAvatarPicker}
        onClose={() => setShowAvatarPicker(false)}
        title="아바타 바꾸기"
        description="헤어, 눈, 입, 안경까지 세세하게 다시 골라보세요."
        currentAvatarUrl={studentAvatar}
        onSelect={async (url) => {
          await supabase.from('students').update({ avatar_url: url }).eq('id', session.student_id);
          setStudentAvatar(url);
          setShowAvatarPicker(false);
        }}
      />

      <div className="max-w-6xl mx-auto w-full py-10 space-y-12">
        {/* Session Card & Identity */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          <div className="col-span-1 md:col-span-8 glass p-12 rounded-[2.5rem] flex items-center justify-between relative overflow-hidden border border-white/20 shadow-ambient h-[280px] group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:scale-110 transition-transform duration-1000" />
            <div className="relative z-10 space-y-4">
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                <p className="text-primary font-black text-[11px] uppercase tracking-[0.3em]">Current Active Session</p>
              </div>
              <h2 className="text-5xl font-black font-manrope tracking-tighter leading-[0.9]">{session?.class_name}</h2>
              <h3 className="text-3xl font-bold text-on-surface-variant/40 font-manrope">{session?.subject} 과목</h3>
            </div>
            <div className="absolute right-10 bottom-[-40px] opacity-10 group-hover:rotate-12 transition-transform duration-700">
              <BookOpen size={200} />
            </div>
          </div>

          <div className="col-span-1 md:col-span-4 glass p-10 rounded-[2rem] border border-white/20 shadow-ambient flex flex-col justify-center relative overflow-hidden">
            <div className="absolute -top-10 -left-10 text-primary/5"><User size={120} /></div>
            <div className="relative z-10 space-y-6">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] opacity-60">Verified Participant</p>
                <h3 className="text-3xl font-black font-manrope">{session?.student_name}</h3>
              </div>
              <div className="pt-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-on-surface-variant">
                  <CheckCircle size={16} className="text-secondary" />
                  <span>{session?.class_name} 참여 중</span>
                </div>
                <p className="text-[11px] text-on-surface-variant/60 font-bold ml-6">{new Date().toLocaleDateString('ko-KR')} 기록 활성화</p>
                {myClassGroup && (
                  <div className="mt-3 ml-0 p-3 rounded-2xl bg-white/30 border border-white/20 backdrop-blur-sm">
                    <p className="text-[10px] font-black text-on-surface-variant/50 uppercase tracking-widest mb-1.5">My Group</p>
                    <p className="text-lg font-black text-on-surface">{myClassGroup.name}</p>
                    <p className="text-[11px] font-bold text-on-surface-variant/60 mt-1">
                      {myClassGroup.memberNames.join(' · ')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Main Card with Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="surface-card rounded-[2.5rem] shadow-ambient overflow-hidden border border-surface-container-highest"
        >

          {/* Tab Contents */}
          <AnimatePresence mode="wait">
            {/* ─── 홈 탭 ─── */}
            {activeTab === 'home' && (() => {
              const weeklyPlan: {week: number; topic: string}[] = classResources as {week: number; topic: string}[];
              const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

              // 기본 선택 주차: 마지막 주차
              const displayWeek = selectedHomeWeek ?? activeWeek ?? (weeklyPlan.length > 0 ? weeklyPlan[weeklyPlan.length - 1].week : null);
              const weekInfo = weeklyPlan.find(p => p.week === displayWeek);

              // 완료 여부
              const obsSubmitted = displayWeek !== null && weekInfo
                ? historyLogs.some(l => norm(l.activity_name || '') === norm(weekInfo.topic))
                : false;
              const resultSubmitted = displayWeek !== null
                ? results.some(r => r.week_number === displayWeek)
                : false;

              const steps = [
                {
                  step: 1,
                  label: '활동 기록 작성',
                  desc: '수업에서 한 활동, 배운 점, 느낀 점을 기록하세요',
                  done: obsSubmitted,
                  tab: 'record' as const,
                  color: 'violet',
                },
                {
                  step: 2,
                  label: '결과물 제출',
                  desc: '만든 결과물을 텍스트·이미지·링크·파일로 올리세요',
                  done: resultSubmitted,
                  tab: 'results' as const,
                  color: 'emerald',
                },
              ];

              return (
                <motion.div key="home" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="p-6 md:p-8 space-y-6">

                  {/* 인사 */}
                  <div>
                    <p className="text-sm font-bold text-on-surface-variant/60">{new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })} · {session?.class_name}</p>
                    <h2 className="text-2xl font-black mt-0.5">안녕하세요, {session?.student_name}님! 👋</h2>
                  </div>

                  {/* 온라인 수업 배너 */}
                  {activeMeeting && (
                    <motion.button
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => window.open(activeMeeting.meeting_url, '_blank')}
                      className="w-full flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-rose-500 to-orange-500 shadow-lg shadow-rose-200 active:scale-98 transition-all text-left"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-white/25 flex items-center justify-center text-2xl shrink-0 shadow-inner">
                        🎥
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-black text-sm">지금 온라인 수업이 진행 중이에요</p>
                        <p className="text-white/80 text-xs font-bold truncate">{activeMeeting.title}</p>
                      </div>
                      <span className="text-white text-xs font-black shrink-0 bg-white/20 px-3 py-1.5 rounded-full">입장하기 →</span>
                    </motion.button>
                  )}

                  {/* 공지사항 */}
                  {announcements.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-black text-on-surface-variant/50 uppercase tracking-widest flex items-center gap-1.5">
                        <Megaphone size={11} /> 공지사항
                      </p>
                      {announcements.map(a => (
                        <div key={a.id}
                          className={`rounded-2xl border-2 overflow-hidden ${a.is_pinned ? 'border-amber-400 bg-amber-50' : 'border-surface-container-high bg-white'}`}>
                          <button
                            onClick={() => setExpandedAnnouncementId(prev => prev === a.id ? null : a.id)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${a.is_pinned ? 'bg-amber-200' : 'bg-amber-100'}`}>
                              <Megaphone size={14} className="text-amber-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                {a.is_pinned && <span className="text-[9px] font-black px-1.5 py-0.5 bg-amber-200 text-amber-800 rounded-full">📌 고정</span>}
                                <p className="text-sm font-black truncate">{a.title}</p>
                              </div>
                              <p className="text-[10px] text-on-surface-variant/50 font-bold mt-0.5">
                                {new Date(a.created_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}
                              </p>
                            </div>
                            {a.content && (
                              <ChevronDown size={14} className={`text-on-surface-variant/40 shrink-0 transition-transform ${expandedAnnouncementId === a.id ? 'rotate-180' : ''}`} />
                            )}
                          </button>
                          {expandedAnnouncementId === a.id && a.content && (
                            <div className="px-4 pb-4">
                              <div className="p-3 bg-white/60 rounded-xl border border-amber-100">
                                <ReactMarkdown components={ANNOUNCEMENT_MD_COMPONENTS} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                                  {a.content}
                                </ReactMarkdown>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 퀴즈 배지 카드 (기록이 있을 때만 표시) */}
                  {quizHistory.length > 0 && (() => {
                    const totalScore = quizHistory.reduce((s, h) => s + (h.score ?? 0), 0);
                    const bestRank = Math.min(...quizHistory.map(h => h.rank));
                    const topThreeCount = quizHistory.filter(h => h.rank <= 3).length;
                    const badge =
                      bestRank === 1 ? { icon: '👑', label: '챔피언', from: 'from-amber-400', to: 'to-yellow-500', glow: 'shadow-amber-200' } :
                      bestRank === 2 ? { icon: '🥈', label: '파이터', from: 'from-slate-400', to: 'to-slate-500', glow: 'shadow-slate-200' } :
                      bestRank === 3 ? { icon: '🥉', label: '도전자', from: 'from-orange-400', to: 'to-orange-500', glow: 'shadow-orange-200' } :
                      topThreeCount > 0 ? { icon: '🌟', label: '라이징스타', from: 'from-violet-400', to: 'to-purple-500', glow: 'shadow-violet-200' } :
                      { icon: '🎮', label: '퀴즈 참여자', from: 'from-indigo-400', to: 'to-blue-500', glow: 'shadow-indigo-200' };
                    return (
                      <button
                        onClick={() => handleTabChange('quiz')}
                        className={`w-full flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r ${badge.from} ${badge.to} shadow-lg ${badge.glow} active:scale-98 transition-all text-left`}
                      >
                        <div className="w-14 h-14 rounded-2xl bg-white/25 flex items-center justify-center text-3xl shrink-0 shadow-inner">
                          {badge.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white font-black text-base">{badge.label}</span>
                            <span className="text-white/70 text-xs font-bold">· {quizHistory.length}회 참여</span>
                          </div>
                          <p className="text-white/80 text-sm font-bold mt-0.5">
                            누적 <span className="text-white font-black">{totalScore.toLocaleString()}점</span>
                            {bestRank <= 3 && <span className="ml-2">· 최고 {bestRank}위 달성!</span>}
                          </p>
                        </div>
                        <span className="text-white/60 text-xs font-bold shrink-0">기록 보기 →</span>
                      </button>
                    );
                  })()}

                  {/* 주차 선택 */}
                  {weeklyPlan.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-black text-on-surface-variant/50 uppercase tracking-widest">주차 선택</p>
                      <div className="flex flex-wrap gap-2">
                        {weeklyPlan.map(p => {
                          const isActive = p.week === displayWeek;
                          const wObs = historyLogs.some(l => norm(l.activity_name || '') === norm(p.topic));
                          const wRes = results.some(r => r.week_number === p.week);
                          const allDone = wObs && wRes;
                          return (
                            <button
                              key={p.week}
                              onClick={() => setSelectedHomeWeek(p.week)}
                              className={`relative flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-black border-2 transition-all ${
                                isActive ? 'bg-primary text-white border-primary shadow-md' : 'bg-white text-neutral-500 border-neutral-200 hover:border-primary/40 hover:text-primary'
                              }`}
                            >
                              {allDone && <CheckCircle2 size={14} className={isActive ? 'text-white/80' : 'text-emerald-500'} />}
                              {p.week}주차
                              <span className={`text-[10px] font-bold ${isActive ? 'text-white/70' : 'text-neutral-400'}`}>· {p.topic}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 체크리스트 */}
                  {displayWeek !== null ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <p className="text-[11px] font-black text-on-surface-variant/50 uppercase tracking-widest">
                          {displayWeek}주차 할 일
                        </p>
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500">
                          {steps.filter(s => s.done).length}/{steps.length} 완료
                        </span>
                      </div>

                      {steps.map((s) => (
                        <div key={s.step} className={`flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${
                          s.done
                            ? 'bg-emerald-50 border-emerald-200'
                            : 'bg-white border-neutral-200 hover:border-primary/30'
                        }`}>
                          {/* 완료 아이콘 */}
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-black text-sm ${
                            s.done ? 'bg-emerald-500 text-white' : 'bg-neutral-100 text-neutral-400'
                          }`}>
                            {s.done ? <Check size={18} /> : s.step}
                          </div>

                          {/* 텍스트 */}
                          <div className="flex-1 min-w-0">
                            <p className={`font-black text-sm ${s.done ? 'text-emerald-700 line-through decoration-emerald-300' : 'text-on-surface'}`}>
                              Step {s.step} · {s.label}
                            </p>
                            <p className="text-xs font-bold text-on-surface-variant/60 mt-0.5">{s.desc}</p>
                          </div>

                          {/* 버튼 */}
                          {s.done ? (
                            <span className="text-[11px] font-black text-emerald-600 shrink-0">완료 ✓</span>
                          ) : isClassClosed ? (
                            <span className="flex items-center gap-1 text-[11px] font-black text-slate-400 shrink-0">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
                              종료됨
                            </span>
                          ) : (
                            <button
                              onClick={() => {
                                if (s.tab === 'results') setSelectedWeek(displayWeek);
                                handleTabChange(s.tab);
                              }}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-black hover:bg-primary/80 active:scale-95 transition-all shrink-0 shadow-sm"
                            >
                              시작하기 <ArrowRight size={13} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-on-surface-variant/40">
                      <p className="font-black">등록된 주차 계획이 없습니다.</p>
                      <p className="text-sm font-bold mt-1">선생님께 주차 계획을 요청하세요.</p>
                    </div>
                  )}

                  {/* 바로가기 */}
                  <div className="pt-2 border-t border-neutral-100">
                    <p className="text-[11px] font-black text-on-surface-variant/40 uppercase tracking-widest mb-3">바로가기</p>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { key: 'materials' as const,   label: '수업 자료', icon: BookOpen,  iconColor: 'text-cyan-600',   bg: 'bg-cyan-50',   border: 'border-cyan-200',   hoverBg: 'hover:bg-cyan-100' },
                        { key: 'history' as const,     label: '나의 기록', icon: History,   iconColor: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200', hoverBg: 'hover:bg-violet-100' },
                        { key: 'suggestions' as const, label: '질문·건의함',  icon: Megaphone, iconColor: 'text-rose-600',   bg: 'bg-rose-50',   border: 'border-rose-200',   hoverBg: 'hover:bg-rose-100' },
                      ].map(item => (
                        <button key={item.key} onClick={() => handleTabChange(item.key)}
                          className={`flex flex-col items-center gap-2 py-4 px-2 rounded-2xl border ${item.bg} ${item.border} ${item.hoverBg} active:scale-95 transition-all`}>
                          <div className={`w-10 h-10 rounded-xl bg-white/70 flex items-center justify-center shadow-sm`}>
                            <item.icon size={20} className={item.iconColor} strokeWidth={2} />
                          </div>
                          <span className={`text-[12px] font-black ${item.iconColor}`}>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              );
            })()}

            {/* ─── RECORD FORM 탭 ─── */}
            {activeTab === 'record' && (
              <motion.div
                key="record"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-12 space-y-12"
              >
                {/* 수업 종료 안내 */}
                {isClassClosed && (
                  <div className="flex items-center gap-4 px-6 py-5 rounded-2xl bg-slate-800 border border-slate-700">
                    <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center shrink-0">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
                    </div>
                    <div>
                      <p className="text-sm font-black text-white">수업이 종료되었습니다</p>
                      <p className="text-xs font-bold text-slate-400 mt-0.5">활동 기록 작성은 더 이상 이용할 수 없습니다. 나의 기록에서 이전 기록을 확인할 수 있습니다.</p>
                    </div>
                  </div>
                )}

                {/* Step 1 배너 */}
                {!isClassClosed && (
                <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-violet-50 border border-violet-200">
                  <div className="w-8 h-8 rounded-xl bg-violet-500 text-white flex items-center justify-center font-black text-sm shrink-0">1</div>
                  <div>
                    <p className="text-xs font-black text-violet-700">Step 1 · 활동 기록 작성</p>
                    <p className="text-[11px] font-bold text-violet-500/80">수업에서 한 활동, 배운 점, 느낀 점을 기록하고 제출하세요.</p>
                  </div>
                  <button onClick={() => handleTabChange('home')} className="ml-auto text-[11px] font-black text-violet-400 hover:text-violet-600 shrink-0">홈으로 →</button>
                </div>
                )}

                {!isClassClosed && classResources && classResources.length > 0 && classResources[0]?.topic ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between ml-2">
                      <label className="text-[11px] font-black text-primary uppercase tracking-[0.2em]">
                        주차별 주제 선택 <span className="text-red-400 ml-0.5">*</span>
                      </label>
                      <span className="text-[10px] text-on-surface-variant/40 font-bold">주제를 선택해야 제출할 수 있습니다</span>
                    </div>
                    {activeWeekTopic && (
                      <p className="text-[11px] font-bold text-primary/60 ml-2">오늘 선생님이 진행 중인 {activeWeek}주차로 고정되어 있습니다.</p>
                    )}
                    <div className="relative">
                      <select
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        disabled={!!activeWeekTopic}
                        className={`w-full px-10 py-6 rounded-2xl text-xl font-black focus:ring-8 transition-all border-2 appearance-none ${
                          activeWeekTopic ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'
                        } ${
                          title
                            ? 'bg-primary/5 border-primary/30 text-primary focus:ring-primary/10 focus:border-primary/50'
                            : 'bg-neutral-100 border-neutral-200/50 text-neutral-400 focus:ring-primary/10 focus:border-primary/30'
                        }`}
                      >
                        <option value="">주차를 선택하세요...</option>
                        {classResources.map((item: any, idx: number) => (
                          <option key={idx} value={item.topic}>
                            {item.week}주차: {item.topic}
                          </option>
                        ))}
                      </select>
                      <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-primary/60">▼</div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between ml-2">
                      <label className="text-[11px] font-black text-primary uppercase tracking-[0.2em]">활동 주제</label>
                      <span className="text-[10px] text-on-surface-variant/40 font-bold">* 명확한 핵심 활동명을 입력하세요</span>
                    </div>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="예: 구운몽의 환상 구조와 주제 의식 탐구"
                      className="w-full px-10 py-6 bg-neutral-100 rounded-2xl text-xl font-black focus:ring-8 focus:ring-primary/10 transition-all border-2 border-neutral-200/50 focus:border-primary/30 shadow-inner"
                    />
                  </div>
                )}

                {!isClassClosed && (<><div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                  <div className="space-y-4">
                    <label className="text-[11px] font-black text-primary uppercase tracking-[0.2em] ml-2">주요 활동 내용</label>
                    <textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder="오늘 수업에서 내가 어떤 역할을 맡았고, 어떤 구체적인 활동 과정을 거쳤는지 자세히 입력하세요..."
                      className={`w-full min-h-[350px] p-10 bg-neutral-100/80 backdrop-blur-sm rounded-[1.75rem] text-base leading-relaxed font-semibold focus:ring-8 transition-all border-2 resize-none shadow-sm ${
                        minObsChars > 0 && content.trim().length < minObsChars && content.trim().length > 0
                          ? 'border-amber-300 focus:border-amber-400 focus:ring-amber-100'
                          : minObsChars > 0 && content.trim().length >= minObsChars
                          ? 'border-emerald-300 focus:border-emerald-400 focus:ring-emerald-100'
                          : 'border-neutral-200/50 focus:border-primary/30 focus:ring-primary/10'
                      }`}
                    />
                    {minObsChars > 0 && (
                      <div className="mt-3 px-2 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-black ${
                            content.trim().length === 0 ? 'text-neutral-400' :
                            content.trim().length < minObsChars ? 'text-amber-500' : 'text-emerald-600'
                          }`}>
                            {content.trim().length === 0
                              ? `최소 ${minObsChars}자 이상 작성해야 제출할 수 있어요`
                              : content.trim().length < minObsChars
                              ? `${minObsChars - content.trim().length}자 더 작성해야 제출할 수 있어요`
                              : '✓ 충분히 작성됐어요!'}
                          </span>
                          <span className={`text-xs font-black tabular-nums ${
                            content.trim().length < minObsChars ? 'text-amber-500' : 'text-emerald-600'
                          }`}>
                            {content.trim().length} / {minObsChars}자
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              content.trim().length >= minObsChars ? 'bg-emerald-400' : 'bg-amber-400'
                            }`}
                            style={{ width: `${Math.min((content.trim().length / minObsChars) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-10">
                    <div className="space-y-4 flex-1">
                      <label className="text-[11px] font-black text-primary uppercase tracking-[0.2em] ml-2">배운 점 및 느낀 점</label>
                      <textarea 
                        value={feeling}
                        onChange={(e) => setFeeling(e.target.value)}
                        placeholder="활동을 통해 새롭게 깨달은 지식, 확장된 호기심, 또는 어려웠던 점을 어떻게 해결했는지 기록하세요."
                        className="w-full min-h-[220px] p-10 bg-neutral-100/80 backdrop-blur-sm rounded-[1.75rem] text-sm leading-relaxed font-bold focus:ring-8 focus:ring-primary/10 transition-all border-2 border-neutral-200/50 focus:border-primary/30 resize-none shadow-sm"
                      />
                    </div>

                    <div className="glass p-10 rounded-[1.75rem] flex items-start gap-6 border border-primary/10 relative overflow-hidden group">
                      <div className="absolute top-0 left-0 w-2 h-full bg-primary/20 group-hover:bg-primary transition-all duration-500" />
                      <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center text-primary shadow-sm mt-1 shrink-0">
                        <Lightbulb size={24} />
                      </div>
                      <div className="space-y-2">
                        <h4 className="font-black text-lg text-primary tracking-tight">작성 팁 (Saenggi Tips)</h4>
                        <p className="text-sm text-on-surface leading-relaxed font-bold opacity-80">
                          {guidePrompt || '수동적인 학습 태도보다는 본인이 직접 시도한 능동적인 탐구 과정을 중심으로 작성하는 것이 생활기록부 작성에 큰 도움이 됩니다.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 제출 버튼 — 입력창 바로 아래 */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 mt-4">
                  <button className="flex items-center gap-2 px-5 py-3 text-sm font-black text-slate-500 hover:text-slate-700 transition-all rounded-2xl hover:bg-slate-100 whitespace-nowrap">
                    <Save size={15} />임시 저장
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex items-center gap-2 px-8 py-3.5 btn-gradient rounded-2xl font-black text-sm shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 whitespace-nowrap"
                  >
                    {submitting ? <Loader2 size={15} className="animate-spin" /> : (
                      <><Send size={15} /> 활동 기록 제출하기</>
                    )}
                  </button>
                </div>
                </>)}
              </motion.div>
            )}

            {/* ─── MY HISTORY 탭 ─── */}
            {activeTab === 'history' && (() => {
              // 관찰 기록 + 결과 제출 통합 타임라인
              const obsItems = historyLogs.map(l => ({ ...l, _kind: 'obs' as const }));

              // submission_group 기준으로 결과 제출 그룹핑
              const groupedResultMap: Record<string, any[]> = {};
              results.forEach(r => {
                const gKey = r.submission_group || r.id;
                if (!groupedResultMap[gKey]) groupedResultMap[gKey] = [];
                groupedResultMap[gKey].push(r);
              });
              const resItems = Object.values(groupedResultMap).map(group => {
                const rep = group[0];
                const types = [...new Set(group.map((r: any) => r.result_type))] as string[];
                const hasRejected = group.some((r: any) => r.status === 'rejected');
                const allApproved = group.every((r: any) => r.status === 'approved');
                return {
                  ...rep,
                  _kind: 'result' as const,
                  _group: group,
                  _types: types,
                  _isGroupSubmission: group.some((r: any) => r.is_group_submission),
                  _groupStatus: hasRejected ? 'rejected' : allApproved ? 'approved' : 'pending',
                  _rejectionFeedback: group.find((r: any) => r.rejection_feedback)?.rejection_feedback,
                  _teacherFeedback: group.find((r: any) => r.teacher_feedback)?.teacher_feedback,
                  _teacherEvalScore: group.find((r: any) => r.teacher_eval_score)?.teacher_eval_score,
                  _teacherEvalTags: group.find((r: any) => r.teacher_eval_tags?.length)?.teacher_eval_tags,
                  _teacherEvalNote: group.find((r: any) => r.teacher_eval_note)?.teacher_eval_note,
                };
              }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

              const allItems = [...obsItems, ...resItems].sort(
                (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
              );
              const filtered = historyFilter === 'all' ? allItems
                : historyFilter === 'obs' ? allItems.filter(i => i._kind === 'obs')
                : allItems.filter(i => i._kind === 'result');

              const resultTypeConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
                text:  { icon: <AlignLeft size={13} />,  label: '텍스트', color: 'text-primary bg-primary/10' },
                link:  { icon: <Link2 size={13} />,      label: '링크',   color: 'text-blue-500 bg-blue-50' },
                image: { icon: <ImageIcon size={13} />,  label: '이미지', color: 'text-emerald-500 bg-emerald-50' },
                file:  { icon: <File size={13} />,       label: '파일',   color: 'text-amber-500 bg-amber-50' },
              };

              return (
                <motion.div
                  key="history"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="p-12 space-y-6 min-h-[400px]"
                >
                  {/* 헤더 + 필터 */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                        <History size={24} />
                      </div>
                      <div>
                        <h3 className="text-2xl font-black font-manrope">제출 기록 이력</h3>
                        <p className="text-on-surface-variant text-sm font-bold mt-1">활동 기록과 결과 제출 내역을 함께 확인하세요.</p>
                      </div>
                    </div>
                    {/* 필터 칩 */}
                    <div className="flex gap-2 shrink-0">
                      {([
                        { key: 'all' as const,    label: `전체 (${allItems.length})` },
                        { key: 'obs' as const,    label: `📝 활동 기록 (${obsItems.length})` },
                        { key: 'result' as const, label: `📁 결과 제출 (${resItems.length})` },
                      ]).map(f => (
                        <button
                          key={f.key}
                          onClick={() => setHistoryFilter(f.key)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black border-2 transition-all whitespace-nowrap ${
                            historyFilter === f.key
                              ? 'bg-primary text-white border-primary'
                              : 'bg-surface-container text-on-surface-variant border-transparent hover:border-primary/30'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {historyLoading || resultsLoading ? (
                    <div className="flex items-center justify-center py-20">
                      <Loader2 size={36} className="animate-spin text-primary" />
                    </div>
                  ) : filtered.length > 0 ? (
                    <div className="space-y-4">
                      {filtered.map((item) => {
                        if (item._kind === 'obs') {
                          const log = item;
                          const isEditing = editingLogId === log.id;
                          const isDeleting = deletingLogId === log.id;
                          return (
                            <motion.div
                              key={`obs-${log.id}`}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              onClick={() => { if (!isEditing) setDetailItem(log); }}
                              className={`rounded-2xl border transition-all group ${
                                isEditing
                                  ? 'p-6 border-primary/30 bg-primary/[0.02] cursor-default'
                                  : 'p-6 bg-surface-container-low border-surface-container hover:border-violet-200 cursor-pointer'
                              }`}
                            >
                              {isEditing ? (
                                <div className="space-y-3">
                                  {classResources.length > 0 && (
                                    <div className="space-y-1.5">
                                      <label className="text-[10px] font-black text-primary uppercase tracking-widest">주차 선택</label>
                                      <div className="flex flex-wrap gap-1.5">
                                        {(classResources as {week: number; topic: string}[]).map(p => {
                                          const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
                                          const isActive = norm(editLogForm.activity_name) === norm(p.topic);
                                          return (
                                            <button key={p.week} type="button"
                                              onClick={() => setEditLogForm(prev => ({ ...prev, activity_name: p.topic }))}
                                              className={`px-3 py-1.5 rounded-xl text-[11px] font-black border transition-all ${isActive ? 'bg-primary text-white border-primary' : 'bg-white text-neutral-400 border-neutral-200 hover:border-primary/40 hover:text-primary'}`}>
                                              {p.week}주차<span className={`ml-1 text-[9px] ${isActive ? 'text-white/70' : 'text-neutral-300'}`}>· {p.topic}</span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-black text-primary uppercase tracking-widest">활동 제목 *</label>
                                    <input type="text" value={editLogForm.activity_name}
                                      onChange={e => setEditLogForm(prev => ({ ...prev, activity_name: e.target.value }))}
                                      className="w-full px-5 py-3 bg-white rounded-2xl font-bold text-sm border-2 border-primary/10 focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all" />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">활동 내용</label>
                                    <textarea value={editLogForm.content} rows={5}
                                      onChange={e => setEditLogForm(prev => ({ ...prev, content: e.target.value }))}
                                      className="w-full px-5 py-3 bg-white rounded-2xl font-medium text-sm leading-relaxed border-2 border-surface-container focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/10 resize-none transition-all" />
                                  </div>
                                  <div className="flex gap-3">
                                    <button onClick={() => handleSaveEditLog(log.id)} disabled={savingLogId === log.id}
                                      className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-black text-xs hover:bg-primary/80 active:scale-95 transition-all disabled:opacity-50 shadow-sm">
                                      {savingLogId === log.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} 저장
                                    </button>
                                    <button onClick={handleCancelEditLog}
                                      className="flex items-center gap-2 px-5 py-2.5 bg-surface-container text-on-surface-variant rounded-xl font-black text-xs hover:bg-surface-container-high active:scale-95 transition-all">
                                      <X size={13} /> 취소
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-start gap-4 flex-1 min-w-0">
                                      <div className="w-10 h-10 rounded-2xl bg-violet-100 flex items-center justify-center text-violet-600 shrink-0 mt-1">
                                        <FileText size={18} />
                                      </div>
                                      <div className="space-y-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className="text-[10px] font-black text-violet-600 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-md">📝 활동 기록</span>
                                          {log.category && <span className="text-[10px] font-black text-secondary bg-secondary/10 px-2 py-0.5 rounded-md">{log.category}</span>}
                                        </div>
                                        <p className="font-black text-base group-hover:text-primary transition-colors">{log.activity_name}</p>
                                        <p className="text-sm text-on-surface-variant font-medium leading-relaxed line-clamp-2">{log.content}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <div className="text-right space-y-1">
                                        <p className="text-[11px] text-on-surface-variant font-bold flex items-center gap-1 justify-end">
                                          <Clock size={10} />{formatRelativeTime(log.created_at)}
                                        </p>
                                      </div>
                                      {log.status === 'rejected' ? (
                                        <div className="flex flex-col items-center gap-1">
                                          <div className="w-8 h-8 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center">
                                            <X size={14} className="text-red-500" />
                                          </div>
                                          <span className="text-[9px] font-black text-red-500">반려됨</span>
                                        </div>
                                      ) : log.status === 'pending' ? (
                                        <div className="flex flex-col items-center gap-1">
                                          <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
                                            <Clock size={14} className="text-amber-500" />
                                          </div>
                                          <span className="text-[9px] font-black text-amber-500">대기중</span>
                                        </div>
                                      ) : (
                                        <div className="flex flex-col items-center gap-1">
                                          <CheckCircle2 size={18} className="text-secondary" />
                                          <span className="text-[9px] font-black text-secondary">승인됨</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  {/* 선생님 피드백 (반려 시) */}
                                  {log.status === 'rejected' && log.teacher_feedback && (
                                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-2xl">
                                      <p className="text-[10px] font-black text-red-500 mb-1">선생님 피드백</p>
                                      <p className="text-xs font-bold text-red-700 leading-relaxed">{log.teacher_feedback}</p>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setTitle(log.activity_name || '');
                                          setContent('');
                                          setFeeling('');
                                          setActiveTab('record');
                                        }}
                                        className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-[10px] font-black transition-all"
                                      >
                                        <RefreshCw size={10} /> 수정 후 재제출
                                      </button>
                                    </div>
                                  )}
                                  <div className="flex justify-end gap-2 pt-1 border-t border-surface-container opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={(e) => { e.stopPropagation(); handleStartEditLog(log); }}
                                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-surface-container hover:bg-primary/10 hover:text-primary text-on-surface-variant font-black text-xs transition-all">
                                      <Pencil size={12} /> 수정
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteLog(log.id); }} disabled={isDeleting}
                                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-surface-container hover:bg-error/10 hover:text-error text-on-surface-variant font-black text-xs transition-all disabled:opacity-50">
                                      {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} 삭제
                                    </button>
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          );
                        }

                        // 결과 제출 그룹 카드
                        const r = item;
                        const weekLabel = r.week_number
                          ? `${r.week_number}주차${classResources.find((c: any) => c.week === r.week_number)?.topic ? ` · ${classResources.find((c: any) => c.week === r.week_number).topic}` : ''}`
                          : null;
                        const groupKey = r.submission_group || r.id;
                        // 그룹 내 텍스트 프리뷰 (첫 번째 텍스트 row)
                        const textRow = r._group?.find((gr: any) => gr.result_type === 'text');
                        const linkRow = r._group?.find((gr: any) => gr.result_type === 'link');
                        const imageRow = r._group?.find((gr: any) => gr.result_type === 'image');
                        const fileRow = r._group?.find((gr: any) => gr.result_type === 'file');
                        return (
                          <motion.div
                            key={`result-${groupKey}`}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            onClick={() => setDetailItem({ ...r, _isGroupCard: true })}
                            className="p-6 bg-surface-container-low border border-surface-container hover:border-emerald-200 rounded-2xl transition-all group cursor-pointer"
                          >
                            <div className="flex items-start gap-4">
                              <div className="w-10 h-10 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0 mt-1">
                                <FolderOpen size={18} />
                              </div>
                              <div className="flex-1 min-w-0 space-y-1.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">📁 결과 제출</span>
                                  {/* 포함된 타입 뱃지 */}
                                  {(r._types as string[])?.map((t: string) => {
                                    const tc = resultTypeConfig[t];
                                    if (!tc) return null;
                                    return (
                                      <span key={t} className={`flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md ${tc.color}`}>
                                        {tc.icon}{tc.label}
                                      </span>
                                    );
                                  })}
                                  {/* 조별 제출 뱃지 */}
                                  {r._isGroupSubmission && (
                                    <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                                      👥 조별 제출
                                    </span>
                                  )}
                                  {r._groupStatus === 'rejected' && (
                                    <span className="text-[10px] font-black text-red-500 bg-red-50 border border-red-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                                      <X size={9} /> 반려됨
                                    </span>
                                  )}
                                  {weekLabel && <span className="text-[10px] font-black text-primary bg-primary/10 px-2 py-0.5 rounded-md">{weekLabel}</span>}
                                </div>
                                {r.title && <p className="font-black text-base group-hover:text-primary transition-colors">{r.title}</p>}
                                {/* 그룹 내 콘텐츠 프리뷰 */}
                                <div className="space-y-1">
                                  {textRow?.text_content && (
                                    <p className="text-sm text-on-surface-variant font-medium leading-relaxed line-clamp-2">{textRow.text_content}</p>
                                  )}
                                  {linkRow?.link_url && (
                                    <p className="text-sm text-blue-500 font-bold line-clamp-1 break-all">{linkRow.link_url}</p>
                                  )}
                                  {imageRow?.display_name && (
                                    <p className="text-sm text-on-surface-variant font-medium flex items-center gap-1"><ImageIcon size={12} className="text-emerald-500" />{imageRow.display_name}</p>
                                  )}
                                  {fileRow?.display_name && (
                                    <p className="text-sm text-on-surface-variant font-medium flex items-center gap-1"><File size={12} className="text-amber-500" />{fileRow.display_name}</p>
                                  )}
                                </div>
                              </div>
                              <p className="text-[11px] text-on-surface-variant font-bold flex items-center gap-1 shrink-0">
                                <Clock size={10} />{formatRelativeTime(r.created_at)}
                              </p>
                            </div>
                            {/* 반려 피드백 */}
                            {r._groupStatus === 'rejected' && (
                              <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-2xl">
                                <p className="text-[10px] font-black text-red-500 mb-1">선생님 피드백</p>
                                {r._rejectionFeedback && (
                                  <p className="text-xs font-bold text-red-700 leading-relaxed mb-2">{r._rejectionFeedback}</p>
                                )}
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleEditResult(r); handleTabChange('results'); }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-[10px] font-black transition-all"
                                >
                                  <RefreshCw size={10} /> 수정 후 재제출
                                </button>
                              </div>
                            )}
                            {/* 선생님 피드백 (반려 아닌 일반 피드백) */}
                            {r._groupStatus !== 'rejected' && r._teacherFeedback && (
                              <div className="mt-2 p-3 bg-indigo-50 border border-indigo-200 rounded-2xl">
                                <p className="text-[10px] font-black text-indigo-500 mb-1 flex items-center gap-1">
                                  <MessageSquare size={11} /> 선생님 피드백
                                </p>
                                <p className="text-xs font-bold text-indigo-700 leading-relaxed">{r._teacherFeedback}</p>
                              </div>
                            )}
                            {/* 선생님 평가 (성취수준/역량 태그/평가 코멘트) */}
                            {r._groupStatus !== 'rejected' && (r._teacherEvalScore || r._teacherEvalTags?.length || r._teacherEvalNote) && (
                              <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-2xl space-y-1.5">
                                <p className="text-[10px] font-black text-amber-600 mb-0.5 flex items-center gap-1">
                                  <Trophy size={11} /> 선생님 평가
                                </p>
                                {r._teacherEvalScore && (
                                  <p className="text-xs font-black text-amber-600">{'★'.repeat(r._teacherEvalScore)}{'☆'.repeat(5 - r._teacherEvalScore)}</p>
                                )}
                                {r._teacherEvalTags?.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {r._teacherEvalTags.map((tag: string) => (
                                      <span key={tag} className="text-[10px] font-black text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-md">{tag}</span>
                                    ))}
                                  </div>
                                )}
                                {r._teacherEvalNote && (
                                  <p className="text-xs font-bold text-amber-800 leading-relaxed">{r._teacherEvalNote}</p>
                                )}
                              </div>
                            )}
                            {/* 수정/삭제 버튼 */}
                            <div className="flex justify-end gap-2 pt-3 mt-2 border-t border-surface-container opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleEditResult(r); handleTabChange('results'); }}
                                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-surface-container hover:bg-primary/10 hover:text-primary text-on-surface-variant font-black text-xs transition-all"
                              >
                                <Pencil size={12} /> 수정
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteResult(r); }}
                                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-surface-container hover:bg-error/10 hover:text-error text-on-surface-variant font-black text-xs transition-all"
                              >
                                <Trash2 size={12} /> 삭제
                              </button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-24 space-y-4 opacity-30">
                      <History size={64} />
                      <p className="font-black text-lg">아직 제출한 기록이 없습니다.</p>
                    </div>
                  )}
                </motion.div>
              );
            })()}


            {/* ─── CLASS MATERIALS 탭 ─── */}
            {activeTab === 'materials' && (
              <motion.div
                key="materials"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-6 space-y-5 min-h-[400px]"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-cyan-100 rounded-2xl flex items-center justify-center text-cyan-600">
                    <BookOpen size={22} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black">수업 자료실</h3>
                    <p className="text-on-surface-variant text-xs font-bold mt-0.5">선생님이 공유한 자료입니다.</p>
                  </div>
                </div>

                {/* 서브탭 */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setMaterialsSubTab('weekly')}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-black border-2 transition-all ${materialsSubTab === 'weekly' ? 'border-cyan-500 bg-cyan-500 text-white' : 'border-neutral-200 text-neutral-400 hover:border-cyan-200'}`}
                  >주차별 자료</button>
                  <button
                    onClick={() => setMaterialsSubTab('editor')}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-black border-2 transition-all ${materialsSubTab === 'editor' ? 'border-violet-500 bg-violet-500 text-white' : 'border-neutral-200 text-neutral-400 hover:border-violet-200'}`}
                  >
                    자료 에디터
                    {unlinkedEditorMaterials.length > 0 && (
                      <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-md ${materialsSubTab === 'editor' ? 'bg-white/20' : 'bg-violet-500/10 text-violet-600'}`}>{unlinkedEditorMaterials.length}</span>
                    )}
                  </button>
                  <button
                    onClick={() => setMaterialsSubTab('general')}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-black border-2 transition-all ${materialsSubTab === 'general' ? 'border-primary bg-primary text-white' : 'border-neutral-200 text-neutral-400 hover:border-primary/30'}`}
                  >
                    일반 자료
                    {generalMaterials.length > 0 && (
                      <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-md ${materialsSubTab === 'general' ? 'bg-white/20' : 'bg-primary/10 text-primary'}`}>{generalMaterials.length}</span>
                    )}
                  </button>
                </div>

                {resourcesLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 size={32} className="animate-spin text-primary" />
                  </div>
                ) : materialsSubTab === 'weekly' ? (() => {
                  // weekly_plan에 자료(material_id 또는 url)가 있는 주차만 필터링
                  const weeks = (classResources as any[]).filter(r => r.material_id || r.url);
                  if (weeks.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-24 space-y-4 opacity-30">
                        <BookOpen size={64} />
                        <p className="font-black text-lg">아직 등록된 주차별 자료가 없습니다.</p>
                        <p className="text-sm font-bold">선생님이 자료를 공유해주시면 이곳에 표시됩니다.</p>
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-3">
                      {weeks.map((res: any) => {
                        // material_id가 있으면 에디터 자료 사용
                        const mat = res.material_id
                          ? classMaterials.find(m => m.id === res.material_id)
                          : null;

                        if (res.material_id && mat) {
                          // ── 에디터 자료 카드 — 클릭 시 바로 전체화면 ──
                          return (
                            <button
                              key={res.week}
                              className="w-full flex items-center gap-3 p-4 text-left bg-white rounded-2xl border border-surface-container hover:border-cyan-200 hover:shadow-sm transition-all"
                              onClick={() => {
                                recordMaterialView(mat.id);
                                setFullscreenMaterial({ title: mat.title, content: mat.content });
                              }}
                            >
                              <div className="w-9 h-9 rounded-xl bg-cyan-100 text-cyan-700 flex items-center justify-center text-xs font-black shrink-0">
                                {res.week}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-black text-sm">{res.topic || mat.title}</p>
                                <p className="text-[11px] text-cyan-600 font-bold mt-0.5">{mat.title}</p>
                              </div>
                              <Maximize2 size={15} className="shrink-0 text-on-surface-variant/50" />
                            </button>
                          );
                        }

                        // ── URL 링크 카드 ──
                        if (res.url) {
                          const href = res.url.startsWith('http') ? res.url : `https://${res.url}`;
                          return (
                            <a
                              key={res.week}
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-surface-container hover:border-primary/30 hover:shadow-sm transition-all group"
                            >
                              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-xs font-black shrink-0">
                                {res.week}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-black text-sm truncate group-hover:text-primary transition-colors">
                                  {res.topic || '수업 자료'}
                                </p>
                                <p className="text-[11px] text-on-surface-variant truncate opacity-60 font-medium">{res.url}</p>
                              </div>
                              <ExternalLink size={14} className="shrink-0 text-on-surface-variant group-hover:text-primary transition-colors" />
                            </a>
                          );
                        }

                        return null;
                      })}
                    </div>
                  );
                })() : materialsSubTab === 'editor' ? (
                  /* ── 자료 에디터 탭 (주차에 연결된 자료는 '주차별 자료' 탭에 표시되므로 제외) ── */
                  unlinkedEditorMaterials.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 space-y-4 opacity-30">
                      <BookOpen size={64} />
                      <p className="font-black text-lg">공개된 자료가 없습니다.</p>
                      <p className="text-sm font-bold">선생님이 자료 에디터에서 자료를 공개하면 이곳에 표시됩니다.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {unlinkedEditorMaterials.map((mat: any) => (
                        <button
                          key={mat.id}
                          className="w-full flex items-center gap-3 p-4 text-left bg-white rounded-2xl border border-surface-container hover:border-violet-200 hover:shadow-sm transition-all"
                          onClick={() => {
                            recordMaterialView(mat.id);
                            setFullscreenMaterial({ title: mat.title, content: mat.content });
                          }}
                        >
                          <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
                            <BookOpen size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-sm truncate">{mat.title}</p>
                            {mat.content && (
                              <p className="text-[11px] text-on-surface-variant truncate opacity-60 font-medium mt-0.5">
                                {mat.content.slice(0, 60)}
                              </p>
                            )}
                          </div>
                          <Maximize2 size={15} className="shrink-0 text-on-surface-variant/50" />
                        </button>
                      ))}
                    </div>
                  )
                ) : (
                  /* ── 일반 자료 탭 ── */
                  generalMaterials.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 space-y-4 opacity-30">
                      <File size={64} />
                      <p className="font-black text-lg">등록된 일반 자료가 없습니다.</p>
                      <p className="text-sm font-bold">선생님이 자료를 공유해주시면 이곳에 표시됩니다.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {[...generalMaterials].sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ko', { numeric: true, sensitivity: 'base' })).map((mat: any) => {
                        if (mat.type === 'link') {
                          const href = mat.url?.startsWith('http') ? mat.url : `https://${mat.url}`;
                          return (
                            <div key={mat.id} className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-surface-container">
                              <div className="w-10 h-10 rounded-xl bg-cyan-100 text-cyan-600 flex items-center justify-center shrink-0">
                                <Link2 size={18} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-black text-sm truncate">{mat.title}</p>
                                <p className="text-[11px] text-on-surface-variant truncate opacity-60 font-medium">{mat.url}</p>
                              </div>
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2.5 rounded-xl bg-cyan-500 text-white hover:bg-cyan-600 transition-all shrink-0"
                                title="바로가기"
                              >
                                <ExternalLink size={18} />
                              </a>
                            </div>
                          );
                        }
                        // 파일 자료
                        const handleOpenMaterialFile = () => {
                          const { data } = supabase.storage.from('student-attachments').getPublicUrl(mat.file_path);
                          openFile(data.publicUrl, mat.file_name || mat.title);
                        };
                        return (
                          <div key={mat.id} className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-surface-container">
                            <button
                              onClick={handleOpenMaterialFile}
                              className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 hover:bg-amber-200 transition-all"
                            >
                              <File size={18} />
                            </button>
                            <button
                              onClick={handleOpenMaterialFile}
                              className="flex-1 min-w-0 text-left"
                            >
                              <p className="font-black text-sm truncate hover:text-amber-600 transition-colors">{mat.title}</p>
                              <p className="text-[11px] text-on-surface-variant truncate opacity-60 font-medium">
                                {mat.file_name}{mat.file_size ? ` · ${(mat.file_size / 1024).toFixed(0)}KB` : ''}
                              </p>
                            </button>
                            <button
                              onClick={async () => {
                                const { data } = supabase.storage.from('student-attachments').getPublicUrl(mat.file_path);
                                const res = await fetch(data.publicUrl);
                                const blob = await res.blob();
                                const blobUrl = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = blobUrl;
                                a.download = mat.file_name || mat.title;
                                a.click();
                                URL.revokeObjectURL(blobUrl);
                              }}
                              className="p-2.5 rounded-xl bg-amber-500 text-white hover:bg-amber-600 transition-all shrink-0"
                              title="다운로드"
                            >
                              <Download size={18} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )
                )}
              </motion.div>
            )}

            {/* ─── 학습 도구 탭 ─── */}
            {activeTab === 'tools' && (
              <motion.div
                key="tools"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="min-h-[400px]"
              >
                {(() => {
                  const availableTools = STUDENT_LEARNING_TOOLS.filter(t => enabledToolIds.includes(t.id));
                  const selectedTool = availableTools.find(t => t.id === selectedToolId);

                  if (availableTools.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-24 space-y-4 opacity-30">
                        <Cpu size={64} />
                        <p className="font-black text-lg">아직 공개된 학습 도구가 없습니다.</p>
                      </div>
                    );
                  }

                  if (selectedTool) {
                    return (
                      <div className="space-y-3">
                        <button
                          onClick={() => setSelectedToolId(null)}
                          className="flex items-center gap-1.5 text-xs font-black text-on-surface-variant/60 hover:text-primary transition-colors"
                        >
                          <ArrowLeft size={14} /> 학습 도구 목록으로
                        </button>
                        {selectedTool.render()}
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {availableTools.map(tool => (
                        <button
                          key={tool.id}
                          onClick={() => setSelectedToolId(tool.id)}
                          className="flex flex-col items-start gap-3 p-5 bg-white rounded-2xl border-2 border-surface-container-high hover:border-fuchsia-300 hover:shadow-md transition-all text-left"
                        >
                          <div className="w-11 h-11 rounded-xl bg-fuchsia-50 text-fuchsia-600 flex items-center justify-center">
                            {tool.icon}
                          </div>
                          <div>
                            <p className="font-black text-sm">{tool.label}</p>
                            <p className="text-xs font-bold text-on-surface-variant/60 mt-1 line-clamp-2">{tool.description}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </motion.div>
            )}

            {/* ─── 결과 제출 탭 ─── */}
            {activeTab === 'results' && (
              <motion.div
                key="results"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-12 space-y-10 min-h-[400px]"
              >
                {/* 수업 종료 안내 */}
                {isClassClosed && (
                  <div className="flex items-center gap-4 px-6 py-5 rounded-2xl bg-slate-800 border border-slate-700">
                    <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center shrink-0">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
                    </div>
                    <div>
                      <p className="text-sm font-black text-white">수업이 종료되었습니다</p>
                      <p className="text-xs font-bold text-slate-400 mt-0.5">결과 제출은 더 이상 이용할 수 없습니다. 나의 기록에서 제출한 결과물을 확인할 수 있습니다.</p>
                    </div>
                  </div>
                )}

                {/* Step 2 배너 */}
                {!isClassClosed && (
                  <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-emerald-50 border border-emerald-200">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-black text-sm shrink-0">2</div>
                    <div>
                      <p className="text-xs font-black text-emerald-700">Step 2 · 결과물 제출</p>
                      <p className="text-[11px] font-bold text-emerald-500/80">활동 기록 작성 후 결과물을 업로드하세요.</p>
                    </div>
                    <button onClick={() => handleTabChange('home')} className="ml-auto text-[11px] font-black text-emerald-400 hover:text-emerald-600 shrink-0">홈으로 →</button>
                  </div>
                )}

                {!isClassClosed && (
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                      <FolderOpen size={24} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black font-manrope">결과 제출</h3>
                      <p className="text-on-surface-variant text-sm font-bold mt-1">
                        주차를 선택하고 텍스트·링크·이미지·파일을 한 번에 제출하세요.
                      </p>
                    </div>
                  </div>
                )}

                {/* ── 주차 선택 + 제출 폼 (수업 종료 시 비표시) ── */}
                {!isClassClosed && (<>
                <div ref={resultFormRef} className="space-y-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary/70">
                    주차 선택 *
                  </p>
                  {!editingResult && activeWeek && (
                    <p className="text-[11px] font-bold text-primary/60">오늘 선생님이 진행 중인 {activeWeek}주차로 고정되어 있습니다.</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {(classResources.length > 0
                      ? classResources.map((r: any) => ({ week: r.week, label: `${r.week}주차${r.topic ? `: ${r.topic}` : ''}` }))
                      : Array.from({ length: 16 }, (_, i) => ({ week: i + 1, label: `${i + 1}주차` }))
                    ).map(({ week, label }) => {
                      const weekLocked = !editingResult && !!activeWeek && week !== activeWeek;
                      return (
                        <button
                          key={week}
                          onClick={() => { if (!weekLocked) setSelectedWeek(week); }}
                          disabled={weekLocked}
                          className={`px-4 py-2 rounded-xl text-xs font-black border-2 transition-all ${
                            selectedWeek === week
                              ? 'bg-primary text-white border-primary shadow-md'
                              : weekLocked
                              ? 'bg-surface-container/50 text-on-surface-variant/30 border-transparent cursor-not-allowed'
                              : 'bg-surface-container text-on-surface-variant border-transparent hover:border-primary/30'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ── 수정 중 배너 ── */}
                {editingResult && (
                  <div className="flex items-center justify-between px-5 py-4 bg-amber-50 border border-amber-200 rounded-2xl">
                    <div>
                      <p className="text-sm font-black text-amber-700">
                        ✏️ {editingResult.week_number}주차 결과물 수정 중
                      </p>
                      <p className="text-xs font-bold text-amber-500 mt-0.5">
                        항목을 추가하거나 내용을 수정할 수 있습니다
                      </p>
                    </div>
                    <button onClick={resetResultForm} className="text-xs font-black text-amber-500 hover:text-amber-700 flex items-center gap-1">
                      <X size={14} /> 취소
                    </button>
                  </div>
                )}

                {/* ── 통합 입력 폼 ── */}
                <div className="space-y-4 bg-surface-container-low rounded-2xl p-6 border border-surface-container">
                  <input
                    type="text"
                    value={resultTitle}
                    onChange={e => setResultTitle(e.target.value)}
                    placeholder="제목 (선택사항)"
                    className="w-full px-5 py-3.5 bg-white rounded-2xl font-bold text-sm focus:outline-none focus:ring-4 focus:ring-primary/10 border-2 border-transparent focus:border-primary/20 transition-all"
                  />

                  {/* 텍스트 */}
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 text-[11px] font-black text-primary/70 uppercase tracking-widest">
                      <AlignLeft size={13} /> 텍스트
                    </label>
                    <textarea
                      value={resultText}
                      onChange={e => setResultText(e.target.value)}
                      placeholder="수업 내용, 느낀 점 등을 자유롭게 작성하세요..."
                      rows={4}
                      className="w-full p-5 bg-white rounded-2xl font-bold text-sm leading-relaxed focus:outline-none focus:ring-4 focus:ring-primary/10 border-2 border-transparent focus:border-primary/20 resize-none transition-all"
                    />
                  </div>

                  {/* 링크 */}
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 text-[11px] font-black text-blue-500/80 uppercase tracking-widest">
                      <Link2 size={13} /> 링크
                    </label>
                    <input
                      type="url"
                      value={resultUrl}
                      onChange={e => setResultUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full px-5 py-3.5 bg-white rounded-2xl font-bold text-sm focus:outline-none focus:ring-4 focus:ring-blue-100 border-2 border-transparent focus:border-blue-300 transition-all"
                    />
                  </div>

                  {/* 이미지 */}
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 text-[11px] font-black text-emerald-600/80 uppercase tracking-widest">
                      <ImageIcon size={13} /> 이미지
                    </label>
                    <div
                      onClick={() => resultImageInputRef.current?.click()}
                      className="border-2 border-dashed border-emerald-200 rounded-2xl p-6 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/50 transition-all text-center group"
                    >
                      {imagePreviews.length > 0 ? (
                        <div>
                          <div className="flex flex-wrap justify-center gap-2">
                            {imagePreviews.map((src, i) => (
                              <img key={i} src={src} alt={`preview-${i}`} className="h-20 w-20 rounded-xl object-cover" />
                            ))}
                          </div>
                          <p className="text-xs font-bold text-emerald-600 mt-2">
                            {resultImageFiles.length > 0
                              ? `이미지 ${resultImageFiles.length}장 선택됨`
                              : `현재 이미지 ${imagePreviews.length}장 — 새로 선택 시 전체 교체`}
                          </p>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-3">
                          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
                            <ImageIcon size={20} className="text-emerald-500" />
                          </div>
                          <div className="text-left">
                            <p className="font-black text-emerald-600 text-sm">이미지 선택 (여러 장 가능)</p>
                            <p className="text-xs font-bold text-emerald-400">JPG, PNG, GIF, WEBP · 장당 최대 20MB · 최대 {MAX_RESULT_IMAGES}장</p>
                          </div>
                        </div>
                      )}
                    </div>
                    <input ref={resultImageInputRef} type="file" multiple className="hidden" accept="image/*" onChange={handleImageFileSelect} />
                  </div>

                  {/* 파일 */}
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 text-[11px] font-black text-amber-600/80 uppercase tracking-widest">
                      <File size={13} /> 파일
                    </label>
                    <div
                      onClick={() => resultFileInputRef.current?.click()}
                      className="border-2 border-dashed border-amber-200 rounded-2xl p-6 cursor-pointer hover:border-amber-400 hover:bg-amber-50/50 transition-all group"
                    >
                      {(() => {
                        const existingFile = editingGroupResults.find((r: any) => r.result_type === 'file');
                        if (resultFileUpload) {
                          return (
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                                <File size={18} className="text-amber-500" />
                              </div>
                              <div>
                                <p className="font-black text-sm">{resultFileUpload.name}</p>
                                <p className="text-xs font-bold text-amber-500">{formatFileSize(resultFileUpload.size)}</p>
                              </div>
                            </div>
                          );
                        }
                        if (editingResult && existingFile?.storage_path) {
                          return (
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                                <File size={18} className="text-amber-500" />
                              </div>
                              <div>
                                <p className="font-black text-sm text-amber-700">{existingFile.display_name || '현재 파일'}</p>
                                <p className="text-xs font-bold text-amber-400">새 파일 선택 시 교체됩니다</p>
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div className="flex items-center justify-center gap-3">
                            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center group-hover:bg-amber-200 transition-colors">
                              <Upload size={18} className="text-amber-500" />
                            </div>
                            <div>
                              <p className="font-black text-amber-600 text-sm">파일 선택</p>
                              <p className="text-xs font-bold text-amber-400">모든 파일 형식 (최대 20MB)</p>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <input ref={resultFileInputRef} type="file" className="hidden" accept="*" onChange={handleUploadFileSelect} />
                  </div>
                </div>

                {/* 조별 제출 토글 — 조가 있는 경우만 표시 */}
                {myClassGroup && (
                  <div
                    onClick={() => setIsGroupSubmission(v => !v)}
                    className={`flex items-center justify-between px-4 py-3.5 rounded-2xl border-2 cursor-pointer transition-all select-none ${
                      isGroupSubmission
                        ? 'bg-emerald-50 border-emerald-300'
                        : 'bg-surface-container border-transparent hover:border-emerald-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg ${isGroupSubmission ? 'bg-emerald-500' : 'bg-surface-container-high'}`}>
                        👥
                      </div>
                      <div>
                        <p className={`text-sm font-black ${isGroupSubmission ? 'text-emerald-800' : 'text-on-surface-variant'}`}>
                          {myClassGroup.name} 조별 제출
                        </p>
                        <p className="text-[10px] text-on-surface-variant/50 mt-0.5">
                          {isGroupSubmission
                            ? (editingResult && editingResult.is_group_submission
                                ? `끄면 다른 조원의 제출 기록이 삭제되고 본인 제출만 남습니다`
                                : `조원 전체에게 같은 결과가 제출됩니다`)
                            : `켜면 ${myClassGroup.name} 조원 전체에게 동일 제출`}
                        </p>
                      </div>
                    </div>
                    <div className={`w-10 h-6 rounded-full transition-all flex items-center px-0.5 ${isGroupSubmission ? 'bg-emerald-500' : 'bg-neutral-200'}`}>
                      <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${isGroupSubmission ? 'translate-x-4' : 'translate-x-0'}`} />
                    </div>
                  </div>
                )}

                <button
                  onClick={handleSubmitResult}
                  disabled={resultSubmitting}
                  className="w-full py-5 btn-gradient rounded-[1.25rem] font-black text-lg shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {resultSubmitting
                    ? <Loader2 size={20} className="animate-spin" />
                    : editingResult
                    ? <><Send size={20} /> 수정 완료</>
                    : isGroupSubmission && myClassGroup
                    ? <><Send size={20} /> {selectedWeek ? `${selectedWeek}주차 · ${myClassGroup.name} 조별 제출` : '조별 제출하기'}</>
                    : <><Send size={20} /> {selectedWeek ? `${selectedWeek}주차 결과 제출` : '결과 제출하기'}</>
                  }
                </button>

                {/* 제출 내역은 나의 기록 탭에서 확인 */}
                <div className="pt-2 border-t border-surface-container">
                  <button onClick={() => handleTabChange('history')}
                    className="flex items-center gap-2 text-sm font-black text-primary/60 hover:text-primary transition-colors">
                    <History size={14} /> 제출 내역은 나의 기록 탭에서 확인하세요 →
                  </button>
                </div>

                {false && <div className="space-y-4 pt-4 border-t border-surface-container">
                  <div className="flex items-center justify-between">
                    <h4 className="font-black text-base">제출 내역</h4>
                    <span className="text-xs font-bold text-on-surface-variant bg-surface-container px-3 py-1 rounded-lg">{results.length}개</span>
                  </div>

                  {resultsLoading ? (
                    <div className="flex justify-center py-10"><Loader2 size={28} className="animate-spin text-primary" /></div>
                  ) : results.length === 0 ? (
                    <div className="flex flex-col items-center py-16 space-y-3 opacity-30">
                      <FolderOpen size={48} />
                      <p className="font-black">아직 제출한 결과물이 없습니다.</p>
                    </div>
                  ) : (() => {
                    const typeConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
                      text:  { icon: <AlignLeft size={15} />,  color: 'text-primary bg-primary/10',     label: '텍스트' },
                      link:  { icon: <Link2 size={15} />,      color: 'text-blue-500 bg-blue-50',       label: '링크' },
                      image: { icon: <ImageIcon size={15} />,  color: 'text-emerald-500 bg-emerald-50', label: '이미지' },
                      file:  { icon: <File size={15} />,       color: 'text-amber-500 bg-amber-50',     label: '파일' }
                    };
                    // 주차별 그룹핑 (week_number 없으면 0으로)
                    const grouped: Record<number, any[]> = {};
                    results.forEach(r => {
                      const w = r.week_number ?? 0;
                      if (!grouped[w]) grouped[w] = [];
                      grouped[w].push(r);
                    });
                    const weeks = Object.keys(grouped).map(Number).sort((a, b) => b - a);
                    const visibleWeeks = filterWeek === null ? weeks : weeks.filter(w => w === filterWeek);

                    return (
                      <div className="space-y-5">
                        {/* 주차 필터 칩 */}
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => setFilterWeek(null)}
                            className={`px-4 py-1.5 rounded-xl text-xs font-black border-2 transition-all ${
                              filterWeek === null
                                ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
                                : 'bg-surface-container text-on-surface-variant border-transparent hover:border-primary/30'
                            }`}
                          >
                            전체 <span className="opacity-60 font-bold">({results.length})</span>
                          </button>
                          {weeks.map(w => {
                            const topic = classResources.find((r: any) => r.week === w)?.topic;
                            const chipLabel = w === 0 ? '미지정' : topic ? `${w}주차 · ${topic}` : `${w}주차`;
                            return (
                              <button
                                key={w}
                                onClick={() => setFilterWeek(w)}
                                className={`px-4 py-1.5 rounded-xl text-xs font-black border-2 transition-all ${
                                  filterWeek === w
                                    ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
                                    : 'bg-surface-container text-on-surface-variant border-transparent hover:border-primary/30'
                                }`}
                              >
                                {chipLabel} <span className="opacity-60 font-bold">({grouped[w].length})</span>
                              </button>
                            );
                          })}
                        </div>

                        {visibleWeeks.map(week => {
                          const weekLabel = week === 0 ? '주차 미지정'
                            : classResources.find((r: any) => r.week === week)?.topic
                              ? `${week}주차 — ${classResources.find((r: any) => r.week === week).topic}`
                              : `${week}주차`;
                          const weekItems = grouped[week];
                          return (
                            <div key={week} className="space-y-3">
                              <div className="flex items-center gap-3">
                                <span className="px-3 py-1 bg-primary/10 text-primary text-[11px] font-black rounded-lg">{weekLabel}</span>
                                <span className="text-[10px] font-bold text-on-surface-variant/40">{weekItems.length}개 항목</span>
                              </div>
                              <div className="space-y-2 pl-1">
                                {weekItems.map(r => {
                                  const cfg = typeConfig[r.result_type] || typeConfig.file;
                                  const imageUrls = r.result_type === 'image' ? getResultImagePublicUrls(supabase.storage, r) : [];
                                  const isEditing = editingResult?.id === r.id;
                                  return (
                                    <motion.div
                                      key={r.id}
                                      initial={{ opacity: 0, y: 6 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      className={`p-4 rounded-2xl border-2 transition-all group ${isEditing ? 'border-amber-300 bg-amber-50/50' : 'border-surface-container bg-white hover:border-primary/20'}`}
                                    >
                                      <div className="flex items-start gap-3">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.color}`}>{cfg.icon}</div>
                                        <div className="flex-1 min-w-0 space-y-1">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            {r.title && <p className="font-black text-sm">{r.title}</p>}
                                            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${cfg.color}`}>{cfg.label}</span>
                                            {isEditing && <span className="text-[9px] font-black text-amber-600 bg-amber-100 px-2 py-0.5 rounded-md">수정 중</span>}
                                          </div>
                                          {r.text_content && <p className="text-xs font-bold text-on-surface-variant line-clamp-2 leading-relaxed">{r.text_content}</p>}
                                          {r.link_url && (
                                            <a href={r.link_url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-blue-500 hover:underline flex items-center gap-1 truncate">
                                              <ExternalLink size={11} />{r.link_url}
                                            </a>
                                          )}
                                          {imageUrls.length > 0 && (
                                            <div className="mt-1">
                                              <ImageCarousel urls={imageUrls} alt={r.title || '이미지'} thumbClassName="max-h-24 rounded-xl object-cover" />
                                            </div>
                                          )}
                                          {r.result_type === 'file' && (
                                            <p className="text-xs font-bold text-amber-600 flex items-center gap-1">
                                              <File size={11} />{r.display_name} {r.file_size ? `(${formatFileSize(r.file_size)})` : ''}
                                            </p>
                                          )}
                                          <p className="text-[10px] font-bold text-on-surface-variant/40 flex items-center gap-1">
                                            <Clock size={10} />{formatRelativeTime(r.created_at)}
                                          </p>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                          {(r.result_type === 'image' || r.result_type === 'file') && r.storage_path && (
                                            <button onClick={() => handleDownloadResult(r)} title="다운로드" className="w-7 h-7 rounded-lg bg-surface-container hover:bg-primary/10 hover:text-primary flex items-center justify-center text-on-surface-variant transition-all">
                                              <Upload size={12} className="rotate-180" />
                                            </button>
                                          )}
                                          <button onClick={() => handleEditResult(r)} title="수정" className="w-7 h-7 rounded-lg bg-surface-container hover:bg-amber-100 hover:text-amber-600 flex items-center justify-center text-on-surface-variant transition-all">
                                            <FileText size={12} />
                                          </button>
                                          <button onClick={() => handleDeleteResult(r)} title="삭제" className="w-7 h-7 rounded-lg bg-surface-container hover:bg-error/10 hover:text-error flex items-center justify-center text-on-surface-variant transition-all">
                                            <Trash2 size={12} />
                                          </button>
                                        </div>
                                      </div>
                                    </motion.div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>}
                </>)}
              </motion.div>
            )}

            {/* ─── 단원 마무리 탭 ─── */}
            {activeTab === 'unit' && (
              <motion.div
                key="unit"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-12 space-y-8 min-h-[400px]"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                    <ClipboardList size={24} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black font-manrope">단원 마무리 서식</h3>
                    <p className="text-on-surface-variant text-sm font-bold mt-1">
                      선생님이 마무리한 단원의 제출 서식을 작성하세요.
                    </p>
                  </div>
                </div>

                {unitsLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 size={36} className="animate-spin text-primary" />
                  </div>
                ) : pendingUnits.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 space-y-4 opacity-30">
                    <CheckCircle2 size={64} />
                    <p className="font-black text-lg">제출할 서식이 없습니다.</p>
                    <p className="text-sm font-bold text-center">
                      선생님이 단원을 마무리하면 여기에 서식이 표시됩니다.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* 단원 선택 버튼 목록 */}
                    {pendingUnits.length > 1 && (
                      <div className="flex gap-3 flex-wrap">
                        {pendingUnits.map(unit => (
                          <button
                            key={unit.id}
                            onClick={() => setActiveUnitId(unit.id)}
                            className={`px-5 py-2.5 rounded-2xl font-black text-sm transition-all ${
                              activeUnitId === unit.id
                                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                                : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                            }`}
                          >
                            {unit.title}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* 선택된 단원 서식 */}
                    {pendingUnits
                      .filter(u => u.id === activeUnitId)
                      .map(unit => {
                        const cfg = unit.form_config || {};
                        const guides = unit.form_guides || {};
                        const defaultGuides: Record<string, string> = {
                          self_eval: '이번 단원에서 본인이 가장 잘 수행한 부분과 부족했던 점을 솔직하게 작성하고, 다음에 개선하고 싶은 점을 구체적으로 서술하세요. (50자 이상)',
                          inquiry_reflection: '탐구 과정에서 발견한 점, 어려움과 해결 과정, 새롭게 알게 된 내용을 구체적인 근거와 함께 100자 이상 300자 이내로 작성하세요.',
                          performance_record: '수행평가 활동에서 본인이 담당한 역할, 활동 과정, 결과물의 특징을 구체적으로 기술하세요. 선생님이 생활기록부(세특) 작성 시 활용합니다. (150자 이상 500자 이내)',
                          reading_record: '이번 단원과 연계하여 읽은 책의 제목, 저자, 인상 깊은 내용과 탐구 방향을 50자 이상 작성하세요.'
                        };

                        return (
                          <div key={unit.id} className="space-y-6">
                            <div className="p-5 bg-primary/5 border border-primary/10 rounded-2xl">
                              <h4 className="font-black text-lg text-primary">{unit.title}</h4>
                              {unit.description && (
                                <p className="text-sm font-bold text-primary/70 mt-1">{unit.description}</p>
                              )}
                            </div>

                            {/* 자기평가서 */}
                            {cfg.self_eval && (
                              <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 bg-primary rounded-full" />
                                  <label className="text-[11px] font-black text-primary uppercase tracking-widest">자기평가서</label>
                                </div>
                                <div className="flex items-start gap-3 bg-primary/5 p-4 rounded-xl border border-primary/10 mb-3">
                                  <Lightbulb size={14} className="text-primary mt-0.5 shrink-0" />
                                  <p className="text-xs font-bold text-primary/70 leading-relaxed">
                                    {guides.self_eval || defaultGuides.self_eval}
                                  </p>
                                </div>
                                <div className="relative">
                                  <textarea
                                    value={unitForm[`${unit.id}_self_eval`] || ''}
                                    onChange={e => setUnitForm(prev => ({ ...prev, [`${unit.id}_self_eval`]: e.target.value }))}
                                    placeholder="이번 단원에서 본인의 수행을 평가해 주세요... (50자 이상)"
                                    rows={5}
                                    maxLength={300}
                                    className="w-full p-6 bg-neutral-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-4 focus:ring-primary/10 border-2 border-transparent focus:border-primary/20 resize-none transition-all leading-relaxed"
                                  />
                                  <span className={`absolute bottom-4 right-4 text-[10px] font-black ${
                                    (unitForm[`${unit.id}_self_eval`] || '').length < 50
                                      ? 'text-error'
                                      : 'text-on-surface-variant/40'
                                  }`}>
                                    {(unitForm[`${unit.id}_self_eval`] || '').length}/300
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* 탐구소감문 */}
                            {cfg.inquiry_reflection && (
                              <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 bg-secondary rounded-full" />
                                  <label className="text-[11px] font-black text-secondary uppercase tracking-widest">탐구소감문</label>
                                </div>
                                <div className="flex items-start gap-3 bg-secondary/5 p-4 rounded-xl border border-secondary/10 mb-3">
                                  <Lightbulb size={14} className="text-secondary mt-0.5 shrink-0" />
                                  <p className="text-xs font-bold text-secondary/70 leading-relaxed">
                                    {guides.inquiry_reflection || defaultGuides.inquiry_reflection}
                                  </p>
                                </div>
                                <div className="relative">
                                  <textarea
                                    value={unitForm[`${unit.id}_inquiry_reflection`] || ''}
                                    onChange={e => setUnitForm(prev => ({ ...prev, [`${unit.id}_inquiry_reflection`]: e.target.value }))}
                                    placeholder="탐구 활동에서 배운 점과 소감을 작성하세요... (100자 이상)"
                                    rows={5}
                                    maxLength={300}
                                    className="w-full p-6 bg-neutral-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-4 focus:ring-secondary/10 border-2 border-transparent focus:border-secondary/20 resize-none transition-all leading-relaxed"
                                  />
                                  <span className={`absolute bottom-4 right-4 text-[10px] font-black ${
                                    (unitForm[`${unit.id}_inquiry_reflection`] || '').length < 100
                                      ? 'text-error'
                                      : 'text-on-surface-variant/40'
                                  }`}>
                                    {(unitForm[`${unit.id}_inquiry_reflection`] || '').length}/300
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* 수행평가 활동 기술 */}
                            {cfg.performance_record && (
                              <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 bg-amber-500 rounded-full" />
                                  <label className="text-[11px] font-black text-amber-600 uppercase tracking-widest">수행평가 활동 기술</label>
                                  <span className="text-[9px] font-black text-amber-500 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">NEIS 세특 기준</span>
                                </div>
                                <div className="flex items-start gap-3 bg-amber-50 p-4 rounded-xl border border-amber-100 mb-3">
                                  <AlertCircle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                                  <p className="text-xs font-bold text-amber-600/80 leading-relaxed">
                                    {guides.performance_record || defaultGuides.performance_record}
                                  </p>
                                </div>
                                <div className="relative">
                                  <textarea
                                    value={unitForm[`${unit.id}_performance_record`] || ''}
                                    onChange={e => setUnitForm(prev => ({ ...prev, [`${unit.id}_performance_record`]: e.target.value }))}
                                    placeholder="수행평가 활동 내용을 구체적으로 기술하세요... (150자 이상, 생활기록부 작성에 활용됩니다)"
                                    rows={6}
                                    maxLength={500}
                                    className="w-full p-6 bg-neutral-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-4 focus:ring-amber-200 border-2 border-transparent focus:border-amber-200 resize-none transition-all leading-relaxed"
                                  />
                                  <span className={`absolute bottom-4 right-4 text-[10px] font-black ${
                                    (unitForm[`${unit.id}_performance_record`] || '').length < 150
                                      ? 'text-error'
                                      : (unitForm[`${unit.id}_performance_record`] || '').length > 450
                                        ? 'text-amber-500'
                                        : 'text-on-surface-variant/40'
                                  }`}>
                                    {(unitForm[`${unit.id}_performance_record`] || '').length}/500
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* 독서기록 */}
                            {cfg.reading_record && (
                              <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 bg-violet-500 rounded-full" />
                                  <label className="text-[11px] font-black text-violet-600 uppercase tracking-widest">독서기록</label>
                                </div>
                                <div className="flex items-start gap-3 bg-violet-50 p-4 rounded-xl border border-violet-100 mb-3">
                                  <Lightbulb size={14} className="text-violet-500 mt-0.5 shrink-0" />
                                  <p className="text-xs font-bold text-violet-600/70 leading-relaxed">
                                    {guides.reading_record || defaultGuides.reading_record}
                                  </p>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                  <input
                                    type="text"
                                    value={unitForm[`${unit.id}_reading_title`] || ''}
                                    onChange={e => setUnitForm(prev => ({ ...prev, [`${unit.id}_reading_title`]: e.target.value }))}
                                    placeholder="책 제목"
                                    className="px-5 py-3 bg-neutral-100 rounded-xl text-sm font-bold focus:outline-none focus:ring-4 focus:ring-violet-100 border-2 border-transparent focus:border-violet-200 transition-all"
                                  />
                                  <input
                                    type="text"
                                    value={unitForm[`${unit.id}_reading_author`] || ''}
                                    onChange={e => setUnitForm(prev => ({ ...prev, [`${unit.id}_reading_author`]: e.target.value }))}
                                    placeholder="저자"
                                    className="px-5 py-3 bg-neutral-100 rounded-xl text-sm font-bold focus:outline-none focus:ring-4 focus:ring-violet-100 border-2 border-transparent focus:border-violet-200 transition-all"
                                  />
                                </div>
                                <textarea
                                  value={unitForm[`${unit.id}_reading_reflection`] || ''}
                                  onChange={e => setUnitForm(prev => ({ ...prev, [`${unit.id}_reading_reflection`]: e.target.value }))}
                                  placeholder="독서 소감 및 탐구 연계 내용..."
                                  rows={4}
                                  className="w-full p-6 bg-neutral-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-4 focus:ring-violet-100 border-2 border-transparent focus:border-violet-200 resize-none transition-all leading-relaxed"
                                />
                              </div>
                            )}

                            {/* 제출 버튼 */}
                            <button
                              onClick={() => handleUnitSubmit(unit.id)}
                              disabled={unitSubmitting}
                              className="w-full py-5 btn-gradient rounded-[1.25rem] font-black text-lg shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                            >
                              {unitSubmitting ? (
                                <Loader2 className="animate-spin" size={20} />
                              ) : (
                                <>
                                  <Send size={20} />
                                  단원 마무리 서식 제출하기
                                </>
                              )}
                            </button>
                          </div>
                        );
                      })}
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'badges' && (
              <motion.div
                key="badges"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-12 min-h-[400px] flex flex-col items-center justify-center space-y-4 opacity-30"
              >
                <Trophy size={64} />
                <p className="font-black text-xl">뱃지 시스템 준비 중</p>
                <p className="text-sm font-bold text-on-surface-variant">활동 기록을 계속 제출하면 곧 뱃지를 획득할 수 있습니다!</p>
              </motion.div>
            )}

            {/* ─── 질문·건의함 탭 ─── */}
            {activeTab === 'suggestions' && (
              <motion.div
                key="suggestions"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-12 space-y-10 min-h-[400px]"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                    <Megaphone size={24} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black font-manrope">질문·건의함</h3>
                    <p className="text-on-surface-variant text-sm font-bold mt-1">
                      선생님께 궁금한 점이나 의견을 자유롭게 전달하세요.
                    </p>
                  </div>
                </div>

                {/* 입력 폼 */}
                <div className="space-y-4">
                  <textarea
                    value={suggestionContent}
                    onChange={e => setSuggestionContent(e.target.value)}
                    placeholder="수업 방식, 과제, 환경 등 자유롭게 의견을 작성해 주세요. 선생님께 전달됩니다."
                    rows={5}
                    className="w-full p-6 bg-neutral-100 rounded-[1.5rem] text-sm font-bold leading-relaxed focus:outline-none focus:ring-4 focus:ring-primary/10 border-2 border-transparent focus:border-primary/20 resize-none transition-all"
                  />
                  <button
                    onClick={handleSubmitSuggestion}
                    disabled={suggestionSubmitting || !suggestionContent.trim()}
                    className="w-full py-5 btn-gradient rounded-[1.25rem] font-black text-lg shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                  >
                    {suggestionSubmitting
                      ? <Loader2 size={20} className="animate-spin" />
                      : <><Send size={20} /> 전달하기</>
                    }
                  </button>
                </div>

                {/* 내가 보낸 건의사항 목록 */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between pt-4 border-t border-surface-container">
                    <h4 className="font-black text-base">내가 보낸 질문·건의</h4>
                    <span className="text-xs font-bold text-on-surface-variant bg-surface-container px-3 py-1 rounded-lg">
                      {suggestions.length}개
                    </span>
                  </div>

                  {suggestionsLoading ? (
                    <div className="flex justify-center py-10">
                      <Loader2 size={28} className="animate-spin text-primary" />
                    </div>
                  ) : suggestions.length === 0 ? (
                    <div className="flex flex-col items-center py-16 space-y-3 opacity-30">
                      <Megaphone size={48} />
                      <p className="font-black">아직 보낸 질문·건의가 없습니다.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {suggestions.map(s => {
                        const isEditing = editingSuggestionId === s.id;
                        const isDeleting = deletingSuggestionId === s.id;

                        return (
                          <motion.div
                            key={s.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className={`rounded-2xl border transition-all group cursor-default ${
                              isEditing
                                ? 'p-6 border-primary/30 bg-primary/[0.02]'
                                : 'p-6 bg-surface-container-low border-surface-container hover:border-primary/20'
                            }`}
                          >
                            {isEditing ? (
                              <div className="space-y-3">
                                <textarea
                                  value={editSuggestionContent}
                                  onChange={e => setEditSuggestionContent(e.target.value)}
                                  rows={4}
                                  className="w-full px-5 py-3 bg-white rounded-2xl font-medium text-sm leading-relaxed border-2 border-surface-container focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/10 resize-none transition-all"
                                />
                                <div className="flex gap-3">
                                  <button
                                    onClick={() => handleSaveEditSuggestion(s.id)}
                                    disabled={savingSuggestionId === s.id}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-black text-xs hover:bg-primary/80 active:scale-95 transition-all disabled:opacity-50 shadow-sm"
                                  >
                                    {savingSuggestionId === s.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                                    저장
                                  </button>
                                  <button
                                    onClick={handleCancelEditSuggestion}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-surface-container text-on-surface-variant rounded-xl font-black text-xs hover:bg-surface-container-high active:scale-95 transition-all"
                                  >
                                    <X size={13} /> 취소
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                <div className="flex items-start gap-4">
                                  <div className="w-10 h-10 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-400 shrink-0 mt-0.5">
                                    <MessageSquare size={18} />
                                  </div>
                                  <div className="flex-1 min-w-0 space-y-1">
                                    <p className="text-sm font-medium text-on-surface leading-relaxed">{s.content}</p>
                                    <p className="text-[10px] font-bold text-on-surface-variant/50 flex items-center gap-1">
                                      <Clock size={10} />
                                      {formatRelativeTime(s.created_at)}
                                    </p>
                                  </div>
                                </div>

                                {/* 선생님 답변 버블 */}
                                {s.teacher_reply ? (
                                  <div className="ml-14 p-4 rounded-2xl bg-primary/5 border border-primary/10 space-y-1">
                                    <p className="text-[9px] font-black text-primary uppercase tracking-[0.15em] flex items-center gap-1.5">
                                      <span className="w-4 h-4 rounded-md bg-primary/20 flex items-center justify-center text-primary">↩</span>
                                      선생님 답변
                                    </p>
                                    <p className="text-sm font-medium text-on-surface leading-relaxed">{s.teacher_reply}</p>
                                    {s.replied_at && (
                                      <p className="text-[9px] font-bold text-on-surface-variant/30 flex items-center gap-1">
                                        <Clock size={9} /> {formatRelativeTime(s.replied_at)}
                                      </p>
                                    )}
                                  </div>
                                ) : (
                                  <div className="ml-14 px-4 py-2.5 rounded-xl bg-surface-container border border-dashed border-surface-container-highest flex items-center gap-2">
                                    <Clock size={12} className="text-on-surface-variant/30" />
                                    <p className="text-[11px] font-bold text-on-surface-variant/40">답변 대기 중</p>
                                  </div>
                                )}

                                <div className="flex justify-end gap-2 pt-1 border-t border-surface-container opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => handleStartEditSuggestion(s)}
                                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-surface-container hover:bg-primary/10 hover:text-primary text-on-surface-variant font-black text-xs transition-all"
                                  >
                                    <Pencil size={12} /> 수정
                                  </button>
                                  <button
                                    onClick={() => handleDeleteSuggestion(s.id)}
                                    disabled={isDeleting}
                                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-surface-container hover:bg-error/10 hover:text-error text-on-surface-variant font-black text-xs transition-all disabled:opacity-50"
                                  >
                                    {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                    삭제
                                  </button>
                                </div>
                              </div>
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ─── 퀴즈 탭 ─── */}
            {activeTab === 'quiz' && (
              <motion.div
                key="quiz"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                className="p-8 space-y-6"
              >
                {/* 헤더 */}
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-purple-500 uppercase tracking-[0.25em]">Live Quiz</p>
                    <h2 className="text-2xl font-black">실시간 퀴즈</h2>
                    <p className="text-sm text-on-surface-variant font-bold">선생님이 시작한 퀴즈에 바로 참여하세요</p>
                  </div>
                  <button
                    onClick={fetchActiveQuizSessions}
                    disabled={quizLoading}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-surface-container hover:bg-surface-container-high text-on-surface-variant font-black text-xs transition-all disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={quizLoading ? 'animate-spin' : ''} />
                    새로고침
                  </button>
                </div>

                {/* 내용 */}
                {/* ── 나의 퀴즈 누적 기록 ── */}
                {(() => {
                  const totalScore = quizHistory.reduce((s, h) => s + (h.score ?? 0), 0);
                  const playCount = quizHistory.length;
                  const bestRank = quizHistory.length > 0 ? Math.min(...quizHistory.map(h => h.rank)) : null;
                  const topThreeCount = quizHistory.filter(h => h.rank <= 3).length;
                  const rankBadge =
                    bestRank === 1 ? { icon: '👑', label: '챔피언', color: 'from-amber-400 to-yellow-500' } :
                    bestRank === 2 ? { icon: '🥈', label: '파이터', color: 'from-slate-400 to-slate-500' } :
                    bestRank === 3 ? { icon: '🥉', label: '도전자', color: 'from-orange-400 to-orange-500' } :
                    topThreeCount > 0 ? { icon: '🌟', label: '라이징스타', color: 'from-violet-400 to-purple-500' } :
                    playCount > 0 ? { icon: '🎮', label: '참여자', color: 'from-purple-400 to-violet-500' } : null;

                  if (playCount === 0 && !quizHistoryLoading) return null;
                  return (
                    <div className="rounded-2xl border border-purple-100 bg-gradient-to-br from-purple-50/80 to-violet-50/60 p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black text-purple-500 uppercase tracking-widest">나의 퀴즈 기록</p>
                        {rankBadge && (
                          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r ${rankBadge.color} text-white text-xs font-black shadow-sm`}>
                            <span>{rankBadge.icon}</span>
                            {rankBadge.label}
                          </div>
                        )}
                      </div>
                      {quizHistoryLoading ? (
                        <div className="flex justify-center py-4"><Loader2 size={20} className="animate-spin text-purple-400" /></div>
                      ) : (
                        <>
                          <div className="grid grid-cols-3 gap-3">
                            <div className="bg-white/70 rounded-2xl p-3 text-center">
                              <p className="text-2xl font-black text-purple-600">{totalScore.toLocaleString()}</p>
                              <p className="text-[10px] font-bold text-on-surface-variant mt-0.5">누적 점수</p>
                            </div>
                            <div className="bg-white/70 rounded-2xl p-3 text-center">
                              <p className="text-2xl font-black text-violet-600">{playCount}</p>
                              <p className="text-[10px] font-bold text-on-surface-variant mt-0.5">참여 횟수</p>
                            </div>
                            <div className="bg-white/70 rounded-2xl p-3 text-center">
                              <p className="text-2xl font-black text-indigo-600">{bestRank ? `${bestRank}위` : '-'}</p>
                              <p className="text-[10px] font-bold text-on-surface-variant mt-0.5">최고 순위</p>
                            </div>
                          </div>
                          {quizHistory.length > 0 && (
                            <div className="space-y-2 max-h-44 overflow-y-auto">
                              {quizHistory.slice(0, 8).map((h) => (
                                <div key={h.id} className="flex items-center gap-3 bg-white/60 rounded-xl px-3 py-2.5">
                                  <span className="text-base shrink-0">
                                    {h.rank === 1 ? '👑' : h.rank === 2 ? '🥈' : h.rank === 3 ? '🥉' : `${h.rank}위`}
                                  </span>
                                  <span className="font-bold text-sm text-on-surface flex-1 truncate">{h.quiz_set_title || '퀴즈'}</span>
                                  <span className="text-xs font-black text-purple-600">{(h.score ?? 0).toLocaleString()}점</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}

                {quizLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 size={28} className="animate-spin text-purple-500" />
                  </div>
                ) : activeQuizSessions.length === 0 ? (
                  <div className="flex flex-col items-center py-20 space-y-4">
                    <div className="w-20 h-20 rounded-2xl bg-purple-50 flex items-center justify-center">
                      <Gamepad2 size={36} className="text-purple-300" />
                    </div>
                    <div className="text-center space-y-1">
                      <p className="font-black text-on-surface opacity-40">진행 중인 퀴즈가 없습니다</p>
                      <p className="text-sm text-on-surface-variant/50 font-bold">선생님이 퀴즈를 시작하면 여기에 표시됩니다</p>
                    </div>
                    <button
                      onClick={fetchActiveQuizSessions}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-600 font-black text-sm hover:bg-purple-100 transition-all"
                    >
                      <RefreshCw size={14} />
                      다시 확인하기
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activeQuizSessions.map((qs) => {
                      const quizTitle = (qs.quiz_sets as any)?.title ?? '퀴즈';
                      const stateLabel: Record<string, { text: string; color: string }> = {
                        LOBBY:   { text: '대기 중',   color: 'bg-amber-100 text-amber-700' },
                        QUIZ:    { text: '진행 중 🔥', color: 'bg-red-100 text-red-700' },
                        RESULT:  { text: '결과 확인', color: 'bg-blue-100 text-blue-700' },
                        RANKING: { text: '순위 발표', color: 'bg-violet-100 text-violet-700' },
                      };
                      const st = stateLabel[qs.state] ?? { text: qs.state, color: 'bg-surface-container text-on-surface-variant' };

                      return (
                        <motion.div
                          key={qs.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="rounded-2xl border-2 border-purple-100 bg-gradient-to-r from-purple-50 to-violet-50 p-6 flex items-center justify-between gap-4"
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-lg shadow-purple-200 shrink-0">
                              <Gamepad2 size={26} className="text-white" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${st.color}`}>
                                  {st.text}
                                </span>
                                <span className="text-[10px] font-black text-on-surface-variant/50 bg-white/60 px-2 py-0.5 rounded-full border border-surface-container">
                                  PIN: {qs.pin_code}
                                </span>
                              </div>
                              <h3 className="font-black text-on-surface text-base truncate">{quizTitle}</h3>
                              <p className="text-xs text-on-surface-variant font-bold mt-0.5">
                                {session?.student_name}으로 자동 입장됩니다
                              </p>
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              navigate(`/quiz/${qs.pin_code}`, {
                                state: { autoJoinName: session?.student_name }
                              });
                            }}
                            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-purple-500 to-violet-600 text-white font-black text-sm shadow-lg shadow-purple-200 hover:brightness-110 active:scale-95 transition-all shrink-0"
                          >
                            <Play size={16} />
                            입장하기
                          </button>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}
            {/* ─── 설문 탭 ─── */}
            {activeTab === 'survey' && (
              <motion.div
                key="survey"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                className="p-8 space-y-6"
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-teal-500 uppercase tracking-[0.25em]">Live Survey</p>
                    <h2 className="text-2xl font-black">실시간 설문</h2>
                    <p className="text-sm text-on-surface-variant font-bold">선생님이 시작한 설문에 바로 참여하세요</p>
                  </div>
                  <button
                    onClick={fetchActiveSurveyForms}
                    disabled={surveyLoading}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-surface-container hover:bg-surface-container-high text-on-surface-variant font-black text-xs transition-all disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={surveyLoading ? 'animate-spin' : ''} />
                    새로고침
                  </button>
                </div>

                {surveyLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 size={28} className="animate-spin text-teal-500" />
                  </div>
                ) : activeSurveyForms.length === 0 ? (
                  <div className="flex flex-col items-center py-20 space-y-4">
                    <div className="w-20 h-20 rounded-2xl bg-teal-50 flex items-center justify-center">
                      <BarChart2 size={36} className="text-teal-300" />
                    </div>
                    <div className="text-center space-y-1">
                      <p className="font-black text-on-surface opacity-40">진행 중인 설문이 없습니다</p>
                      <p className="text-sm text-on-surface-variant/50 font-bold">선생님이 설문을 시작하면 여기에 표시됩니다</p>
                    </div>
                    <button
                      onClick={fetchActiveSurveyForms}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-50 border border-teal-200 text-teal-600 font-black text-sm hover:bg-teal-100 transition-all"
                    >
                      <RefreshCw size={14} />
                      다시 확인하기
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activeSurveyForms.map((sf) => (
                      <motion.div
                        key={sf.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="rounded-2xl border-2 border-teal-100 bg-gradient-to-r from-teal-50 to-emerald-50 p-6 flex items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-teal-200 shrink-0">
                            <BarChart2 size={26} className="text-white" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-700">
                                진행 중 🟢
                              </span>
                              <span className="text-[10px] font-black text-on-surface-variant/50 bg-white/60 px-2 py-0.5 rounded-full border border-surface-container">
                                PIN: {sf.pin_code}
                              </span>
                            </div>
                            <h3 className="font-black text-on-surface text-base truncate">{sf.title}</h3>
                          </div>
                        </div>

                        <button
                          onClick={() => navigate(`/survey/${sf.pin_code}`, {
                            state: { autoJoinName: session?.student_name }
                          })}
                          className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-black text-sm shadow-lg shadow-teal-200 hover:brightness-110 active:scale-95 transition-all shrink-0"
                        >
                          <Play size={16} />
                          참여하기
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* ─── 온라인 수업 탭 ─── */}
            {activeTab === 'meeting' && (
              <motion.div
                key="meeting"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                className="p-8 space-y-6"
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-rose-500 uppercase tracking-[0.25em]">Online Class</p>
                    <h2 className="text-2xl font-black">온라인 수업</h2>
                    <p className="text-sm text-on-surface-variant font-bold">선생님이 등록한 회의 링크로 바로 입장하세요</p>
                  </div>
                  <button
                    onClick={fetchActiveMeeting}
                    disabled={meetingLoading}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-surface-container hover:bg-surface-container-high text-on-surface-variant font-black text-xs transition-all disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={meetingLoading ? 'animate-spin' : ''} />
                    새로고침
                  </button>
                </div>

                {meetingLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 size={28} className="animate-spin text-rose-500" />
                  </div>
                ) : meetingHistory.length === 0 ? (
                  <div className="flex flex-col items-center py-20 space-y-4">
                    <div className="w-20 h-20 rounded-2xl bg-rose-50 flex items-center justify-center">
                      <ExternalLink size={36} className="text-rose-300" />
                    </div>
                    <div className="text-center space-y-1">
                      <p className="font-black text-on-surface opacity-40">등록된 온라인 수업이 없습니다</p>
                      <p className="text-sm text-on-surface-variant/50 font-bold">선생님이 회의 링크를 등록하면 여기에 표시됩니다</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {meetingHistory.map((m) => (
                      <motion.div
                        key={m.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`rounded-2xl border-2 p-6 flex items-center justify-between gap-4 ${
                          m.is_active
                            ? 'border-rose-100 bg-gradient-to-r from-rose-50 to-orange-50'
                            : 'border-surface-container bg-surface-container-low opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg shrink-0 ${
                            m.is_active
                              ? 'bg-gradient-to-br from-rose-500 to-orange-500 shadow-rose-200'
                              : 'bg-surface-container-high shadow-none'
                          }`}>
                            <ExternalLink size={26} className={m.is_active ? 'text-white' : 'text-on-surface-variant/50'} />
                          </div>
                          <div className="min-w-0">
                            {m.is_active && (
                              <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-700 mb-1 inline-block">
                                진행 중 🔴
                              </span>
                            )}
                            <h3 className="font-black text-on-surface text-base truncate">{m.title}</h3>
                            <p className="text-xs text-on-surface-variant/60 font-bold">
                              {new Date(m.created_at).toLocaleString('ko-KR')}
                            </p>
                          </div>
                        </div>

                        {m.is_active && (
                          <a
                            href={m.meeting_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-rose-500 to-orange-500 text-white font-black text-sm shadow-lg shadow-rose-200 hover:brightness-110 active:scale-95 transition-all shrink-0"
                          >
                            <ExternalLink size={16} />
                            입장하기
                          </a>
                        )}
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* ─── 보드 탭 ─── */}
            {activeTab === 'board' && (
              <motion.div
                key="board"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-6 md:p-8"
              >
                {/* 활성 수업 보드 세션 */}
                {activeBoardSessions.length > 0 && (
                  <div className="mb-8">
                    <div className="mb-4 space-y-0.5">
                      <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.25em]">Live Board</p>
                      <h3 className="text-xl font-black">수업 보드 참여</h3>
                      <p className="text-sm text-on-surface-variant font-bold">선생님이 시작한 수업 보드에 입장하세요</p>
                    </div>
                    <div className="space-y-3">
                      {activeBoardSessions.map(bs => (
                        <motion.div
                          key={bs.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="rounded-2xl border-2 border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-6 flex items-center justify-between gap-4"
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-200 shrink-0">
                              <StickyNote size={26} className="text-white" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700">진행 중 🎨</span>
                                <span className="text-[10px] font-black text-on-surface-variant/50 bg-white/60 px-2 py-0.5 rounded-full border border-surface-container">
                                  {bs.group_count}개 조
                                </span>
                              </div>
                              <h3 className="font-black text-on-surface text-base truncate">{bs.class_name} 수업 보드</h3>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              sessionStorage.setItem('studentLog_returnTab', 'board');
                              navigate(`/wb-join?code=${bs.session_code}&name=${encodeURIComponent(session?.student_name ?? '')}`, {
                                state: { returnTo: '/student-log' },
                              });
                            }}
                            className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl transition-all shrink-0"
                          >
                            입장하기 <ArrowRight size={14} />
                          </button>
                        </motion.div>
                      ))}
                    </div>
                    <hr className="mt-8 border-surface-container-high" />
                  </div>
                )}

                {/* 헤더 */}
                <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center">
                        <Users2 size={16} className="text-indigo-600" />
                      </div>
                      <h2 className="text-xl font-black">우리 반 보드</h2>
                    </div>
                    <p className="text-xs text-on-surface-variant font-bold ml-10">승인된 활동 기록·결과를 함께 봐요</p>
                  </div>
                  <button
                    onClick={fetchBoard}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 font-black text-xs hover:bg-indigo-100 transition-all"
                  >
                    <RefreshCw size={12} /> 새로고침
                  </button>
                </div>

                {/* 필터 바 */}
                <div className="flex items-center gap-2 mb-6 flex-wrap">
                  {/* 타입 필터 */}
                  <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                    {[
                      { key: 'all', label: '전체' },
                      { key: 'obs', label: '📝 활동 기록' },
                      { key: 'result', label: '📁 결과' },
                    ].map(f => (
                      <button
                        key={f.key}
                        onClick={() => setBoardTypeFilter(f.key as any)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                          boardTypeFilter === f.key
                            ? 'bg-white text-indigo-700 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  {/* 주차 필터 */}
                  <div className="flex items-center gap-1.5 overflow-x-auto">
                    <button
                      onClick={() => setBoardWeekFilter('all')}
                      className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-black border transition-all ${
                        boardWeekFilter === 'all'
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      전체 주차
                    </button>
                    {Array.from(new Set(boardPosts.map(p => p.week_number).filter(Boolean))).sort((a,b)=>a-b).map(w => (
                      <button
                        key={w}
                        onClick={() => setBoardWeekFilter(w)}
                        className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-black border transition-all ${
                          boardWeekFilter === w
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                            : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'
                        }`}
                      >
                        {w}주차
                      </button>
                    ))}
                  </div>
                </div>

                {/* 보드 콘텐츠 */}
                {boardLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 size={28} className="animate-spin text-indigo-500" />
                  </div>
                ) : (() => {
                  const filtered = boardPosts.filter(p => {
                    if (boardTypeFilter !== 'all' && p._type !== boardTypeFilter) return false;
                    if (boardWeekFilter !== 'all' && p.week_number !== boardWeekFilter) return false;
                    return true;
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="flex flex-col items-center py-20 space-y-4">
                        <div className="w-20 h-20 rounded-2xl bg-indigo-50 flex items-center justify-center">
                          <StickyNote size={36} className="text-indigo-200" />
                        </div>
                        <div className="text-center space-y-1">
                          <p className="font-black text-on-surface opacity-40">아직 게시물이 없어요</p>
                          <p className="text-sm text-on-surface-variant/50 font-bold">선생님이 승인한 기록이 여기에 나타납니다</p>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
                      {filtered.map((post) => {
                        const isObs = post._type === 'obs';
                        const isMe = post.student_id === session?.student_id;
                        const liked = !!boardLikes[post.id];

                        return (
                          <motion.div
                            key={`${post._type}-${post.id}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            onClick={() => setBoardSelectedPost(post)}
                            className={`break-inside-avoid rounded-2xl border-2 p-5 space-y-3 transition-all cursor-pointer hover:scale-[1.02] hover:shadow-md ${
                              isMe
                                ? isObs
                                  ? 'bg-violet-50 border-violet-200 hover:border-violet-300'
                                  : 'bg-emerald-50 border-emerald-200 hover:border-emerald-300'
                                : 'bg-white border-slate-100 hover:border-indigo-200 hover:shadow-sm'
                            }`}
                          >
                            {/* 카드 헤더 */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black shrink-0 ${
                                  isObs ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'
                                }`}>
                                  {isObs ? '📝' : '📁'}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-black truncate">
                                    {post.student_name}
                                    {isMe && <span className="ml-1 text-[9px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">나</span>}
                                  </p>
                                  <p className="text-[10px] text-on-surface-variant font-bold">
                                    {post.week_number ? `${post.week_number}주차 · ` : ''}{new Date(post.created_at).toLocaleDateString('ko-KR')}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {!isObs && post._isGroupSub && (
                                  <span className="text-xs font-black px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-600">조별</span>
                                )}
                                {!isObs && post._submissions?.length > 1 && (
                                  <span className="text-xs font-black px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                                    총 {post._submissions.length}회 제출
                                  </span>
                                )}
                                <span className={`text-xs font-black px-2.5 py-1 rounded-full ${
                                  isObs ? 'bg-violet-100 text-violet-600' : 'bg-emerald-100 text-emerald-600'
                                }`}>
                                  {isObs ? '활동 기록' : '결과'}
                                </span>
                              </div>
                            </div>

                            {/* 카드 내용 */}
                            <div className="space-y-1.5">
                              <p className="text-sm font-black leading-snug line-clamp-2">
                                {isObs ? post.activity_name : post.title}
                              </p>
                              {isObs && post.content && (
                                <p className="text-xs text-on-surface-variant font-bold leading-relaxed line-clamp-4">
                                  {post.content}
                                </p>
                              )}
                              {isObs && post.feeling && (
                                <p className="text-[11px] text-on-surface-variant/60 font-bold italic line-clamp-2">
                                  💬 {post.feeling}
                                </p>
                              )}
                              {!isObs && (
                                <div className="space-y-1.5">
                                  {post.text_content && (
                                    <p className="text-xs text-on-surface-variant font-bold leading-relaxed line-clamp-4">
                                      {post.text_content}
                                    </p>
                                  )}
                                  {post.image_url && (
                                    <div className="relative">
                                      <img
                                        src={post.image_url}
                                        alt="결과 이미지"
                                        className="w-full rounded-xl object-cover max-h-40"
                                        loading="lazy"
                                        onError={e => {
                                          if (post.image_original_url) (e.target as HTMLImageElement).src = post.image_original_url;
                                        }}
                                      />
                                      {post.image_urls?.length > 1 && (
                                        <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                          1/{post.image_urls.length}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {post.link_url && (
                                    <a
                                      href={post.link_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={e => e.stopPropagation()}
                                      className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline"
                                    >
                                      <ExternalLink size={11} className="shrink-0" />
                                      <span className="truncate">{post.link_url}</span>
                                    </a>
                                  )}
                                  {post.file_url && (
                                    <div className="flex items-center gap-1.5 text-xs font-bold text-on-surface-variant">
                                      <File size={11} className="shrink-0" />
                                      <span className="truncate">{post.display_name || '파일'}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* 좋아요 버튼 */}
                            <div className="pt-1 border-t border-slate-100">
                              <button
                                onClick={(e) => { e.stopPropagation(); setBoardLikes(prev => ({ ...prev, [post.id]: !prev[post.id] })); }}
                                className={`flex items-center gap-1.5 text-xs font-black transition-all px-2 py-1 rounded-lg ${
                                  liked
                                    ? 'text-rose-500 bg-rose-50'
                                    : 'text-slate-400 hover:text-rose-400 hover:bg-rose-50'
                                }`}
                              >
                                <Heart size={13} className={liked ? 'fill-rose-500' : ''} />
                                공감
                              </button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  );
                })()}
              </motion.div>
            )}

            {/* ─── 미저장 확인 모달 ─── */}
            {showUnsavedModal && (
              <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }}
                  className="bg-white rounded-2xl shadow-2xl p-7 w-80 mx-4"
                >
                  <div className="flex flex-col items-center gap-2 mb-5">
                    <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center mb-1">
                      <AlertCircle size={24} className="text-amber-500" />
                    </div>
                    <h3 className="text-base font-black text-center">저장하지 않고 나가기</h3>
                    <p className="text-sm text-neutral-500 text-center">변경 내용이 저장되지 않았습니다.</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={async () => { await handleManualSave(); navigateToNoteList(); }}
                      className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-black transition-colors"
                    >
                      저장 후 나가기
                    </button>
                    <button
                      onClick={navigateToNoteList}
                      className="w-full py-3 rounded-2xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-sm font-black transition-colors"
                    >
                      저장 안 함
                    </button>
                    <button
                      onClick={() => setShowUnsavedModal(false)}
                      className="w-full py-2.5 text-neutral-400 hover:text-neutral-600 text-sm font-bold transition-colors"
                    >
                      취소
                    </button>
                  </div>
                </motion.div>
              </div>
            )}

            {/* ─── NOTES 탭 ─── */}
            {activeTab === 'notes' && (
              <motion.div
                key="notes"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col min-h-[400px]"
              >
                {/* ── 에디터 뷰 ─────────────────── */}
                {selectedNote ? (
                  <>
                    {/* 에디터 헤더 */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-100 sticky top-0 bg-white z-10">
                      <button
                        onClick={backToNoteList}
                        className="flex items-center gap-1.5 text-xs font-black text-neutral-500 hover:text-neutral-800 transition-colors shrink-0"
                      >
                        <ArrowLeft size={14} /> 목록
                      </button>
                      <div className="w-px h-4 bg-neutral-200 shrink-0" />
                      {/* 제목 인라인 편집 */}
                      <input
                        value={noteTitleInput}
                        onChange={e => handleNoteTitleChange(e.target.value)}
                        placeholder="제목 없음"
                        className="flex-1 text-sm font-black text-on-surface bg-transparent outline-none placeholder:text-neutral-300 truncate min-w-0"
                      />
                      {/* 업로드 중 표시 */}
                      {isNoteImageUploading && (
                        <div className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200">
                          <Loader2 size={11} className="animate-spin text-amber-500" />
                          <span className="text-[11px] font-black text-amber-600">업로드 중</span>
                        </div>
                      )}
                      {/* 저장됨 피드백 */}
                      <AnimatePresence mode="wait">
                        {noteSaveStatus === 'saved' && (
                          <motion.div key="saved"
                            initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }}
                            className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200"
                          >
                            <CheckCircle2 size={11} className="text-emerald-500" />
                            <span className="text-[11px] font-black text-emerald-600">저장됨</span>
                          </motion.div>
                        )}
                        {noteSaveStatus === 'error' && (
                          <motion.div key="error"
                            initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }}
                            className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 border border-red-200"
                          >
                            <AlertCircle size={11} className="text-red-500" />
                            <span className="text-[11px] font-black text-red-600">저장 오류</span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      {/* 저장 버튼 */}
                      <button
                        onClick={handleManualSave}
                        disabled={noteSaving || isNoteImageUploading || !noteHasUnsavedChanges}
                        className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white text-sm font-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {noteSaving
                          ? <Loader2 size={15} className="animate-spin" />
                          : <Save size={15} />}
                        저장
                      </button>
                      {/* 삭제 버튼 */}
                      <button
                        onClick={() => setNoteDeleteId(selectedNote.id)}
                        className="shrink-0 p-2 rounded-xl text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>

                    {/* 삭제 확인 배너 */}
                    {noteDeleteId === selectedNote.id && (
                      <div className="mx-5 mt-3 px-4 py-3 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-between gap-3">
                        <p className="text-xs font-black text-red-600">이 노트를 삭제할까요?</p>
                        <div className="flex gap-2">
                          <button onClick={() => setNoteDeleteId(null)} className="px-3 py-1.5 rounded-xl text-xs font-black text-neutral-500 bg-white border border-neutral-200">취소</button>
                          <button
                            onClick={async () => { await deleteNote(selectedNote.id); setSelectedNote(null); fetchNotes(); }}
                            className="px-3 py-1.5 rounded-xl text-xs font-black text-white bg-red-500 hover:bg-red-600"
                          >삭제</button>
                        </div>
                      </div>
                    )}

                    {/* 에디터 */}
                    <div className="relative mx-5 mt-4 mb-6 rounded-2xl border border-neutral-200 bg-white shadow-sm">
                      <RichEditor
                        key={noteEditorKey}
                        value={noteContent}
                        onChange={handleNoteChange}
                        onUploadImage={handleNoteImageUpload}
                        onUploadingChange={handleNoteImageUploadingChange}
                        minHeight="420px"
                        toolbarTopClassName="top-[61px]"
                      />

                    </div>
                  </>
                ) : (
                  /* ── 목록 뷰 ─────────────────── */
                  <>
                    {/* 목록 헤더 */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                          <NotebookPen size={16} className="text-emerald-600" />
                        </div>
                        <div>
                          <h2 className="text-base font-black leading-tight">나의 노트</h2>
                          <p className="text-[10px] font-bold text-emerald-500/80">
                            📢 담당 선생님에게 공개됩니다
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={createNote}
                        disabled={noteCreating}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black disabled:opacity-50 transition-all active:scale-95"
                      >
                        {noteCreating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                        새 노트
                      </button>
                    </div>

                    {/* 사용법 가이드 */}
                    <div className="mx-4 mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 overflow-hidden">
                      <button
                        onClick={() => setNoteGuideOpen(v => !v)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left"
                      >
                        <span className="text-xs font-black text-emerald-700">💡 사용 방법 보기</span>
                        {noteGuideOpen ? <ChevronUp size={14} className="text-emerald-500" /> : <ChevronDown size={14} className="text-emerald-500" />}
                      </button>
                      {noteGuideOpen && (
                        <div className="px-4 pb-4 space-y-2.5 border-t border-emerald-100">
                          {[
                            { icon: '+', title: '새 노트 만들기', desc: '오른쪽 위 "새 노트" 버튼을 눌러 노트를 추가하세요. 노트마다 제목을 붙일 수 있어요.' },
                            { icon: '/', title: '슬래시 명령어', desc: '/ 를 입력하면 제목, 목록, 코드블록, 인용구 등 블록을 삽입할 수 있어요.' },
                            { icon: 'B', title: '서식 툴바', desc: '텍스트를 드래그하면 굵게·기울임·링크 등 서식 도구가 나타나요.' },
                            { icon: '💾', title: '저장', desc: '오른쪽 위 "저장" 버튼을 눌러 노트를 저장하세요. 이미지 업로드 중에는 완료 후 저장이 가능해요.' },
                          ].map(item => (
                            <div key={item.title} className="flex items-start gap-3">
                              <span className="w-7 h-7 rounded-lg bg-emerald-200 text-emerald-800 flex items-center justify-center text-[11px] font-black shrink-0 mt-0.5">{item.icon}</span>
                              <div>
                                <p className="text-xs font-black text-emerald-800">{item.title}</p>
                                <p className="text-[11px] font-bold text-emerald-600/80">{item.desc}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 노트 목록 */}
                    <div className="px-4 mt-4 mb-6 space-y-3">
                      {noteListLoading ? (
                        <div className="flex justify-center py-10">
                          <Loader2 size={24} className="animate-spin text-emerald-400" />
                        </div>
                      ) : noteList.length === 0 ? (
                        <div className="flex flex-col items-center gap-4 py-12 text-center">
                          <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center">
                            <NotebookPen size={28} className="text-emerald-300" />
                          </div>
                          <div>
                            <p className="font-black text-on-surface/60">아직 작성한 노트가 없어요</p>
                            <p className="text-sm font-bold text-on-surface-variant/40 mt-1">수업 내용을 자유롭게 메모해 보세요</p>
                          </div>
                          <button
                            onClick={createNote}
                            disabled={noteCreating}
                            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-sm disabled:opacity-50 transition-all active:scale-95 shadow-sm shadow-emerald-200"
                          >
                            {noteCreating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                            첫 노트 작성하기
                          </button>
                        </div>
                      ) : (
                        noteList.map(note => (
                          <div key={note.id} className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
                            {/* 삭제 확인 */}
                            {noteDeleteId === note.id ? (
                              <div className="px-4 py-3 bg-red-50 flex items-center justify-between gap-3">
                                <p className="text-xs font-black text-red-600">이 노트를 삭제할까요?</p>
                                <div className="flex gap-2">
                                  <button onClick={() => setNoteDeleteId(null)} className="px-3 py-1.5 rounded-xl text-xs font-black text-neutral-500 bg-white border border-neutral-200">취소</button>
                                  <button onClick={() => deleteNote(note.id)} className="px-3 py-1.5 rounded-xl text-xs font-black text-white bg-red-500">삭제</button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => selectNote(note)}
                                className="w-full text-left px-4 py-4 hover:bg-neutral-50 transition-colors group"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <NotebookPen size={13} className="text-emerald-400 shrink-0" />
                                      <p className="text-sm font-black text-on-surface truncate">
                                        {note.title || '제목 없음'}
                                      </p>
                                    </div>
                                    {notePreview(note.content) && (
                                      <p className="text-xs text-on-surface-variant/60 font-bold line-clamp-2 ml-5">
                                        {notePreview(note.content)}
                                      </p>
                                    )}
                                    <p className="text-[10px] font-bold text-neutral-300 mt-1.5 ml-5">
                                      {formatRelativeTime(note.updated_at)}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                                    <button
                                      onClick={e => { e.stopPropagation(); setNoteDeleteId(note.id); }}
                                      className="p-1.5 rounded-lg text-neutral-200 hover:text-red-400 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                    <ArrowRight size={14} className="text-neutral-300 group-hover:text-emerald-400 transition-colors" />
                                  </div>
                                </div>
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <button
          onClick={() => navigate('/classroom-entry')}
          className="flex items-center gap-3 text-on-surface-variant hover:text-primary text-[12px] font-black uppercase tracking-[0.3em] transition-all mx-auto pb-10 group"
        >
          <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
          다른 수업의 참여 코드가 있나요?
        </button>
      </div>

      {/* ── 데스크탑 사이드바 (lg 이상 전용) ── */}
      <aside className={`hidden lg:flex fixed top-0 left-0 h-screen z-40 flex-col bg-slate-900 border-r border-slate-700/60 transition-[width] duration-200 ${isSidebarCollapsed ? 'w-20' : 'w-64'}`}>
        <div className={`flex items-center gap-2 px-4 py-5 shrink-0 ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
          {!isSidebarCollapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white shrink-0">
                <GraduationCap size={18} />
              </div>
              <span className="font-black text-sm text-white truncate">클래스로그</span>
            </div>
          )}
          <button
            onClick={toggleSidebarCollapsed}
            title={isSidebarCollapsed ? '메뉴 펼치기' : '메뉴 접기'}
            className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-all shrink-0"
          >
            {isSidebarCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1 custom-scrollbar">
          {[
            { key: 'home' as const,        icon: LayoutDashboard, label: '홈',        activeColor: 'text-sky-400' },
            { key: 'record' as const,      icon: MessageSquare,   label: '기록',      activeColor: 'text-violet-400' },
            { key: 'results' as const,     icon: FolderOpen,      label: '결과',      activeColor: 'text-emerald-400' },
            { key: 'board' as const,       icon: Users2,          label: '보드',      activeColor: 'text-indigo-400' },
            { key: 'materials' as const,   icon: BookOpen,        label: '수업 자료',  activeColor: 'text-cyan-400' },
            ...(enabledToolIds.length > 0 ? [{ key: 'tools' as const, icon: Cpu, label: '학습 도구', activeColor: 'text-fuchsia-400' }] : []),
            { key: 'history' as const,     icon: History,         label: '나의 기록',  activeColor: 'text-blue-400' },
            { key: 'notes' as const,       icon: NotebookPen,     label: '나의 노트',  activeColor: 'text-emerald-400' },
            { key: 'quiz' as const,        icon: Gamepad2,        label: '퀴즈',      activeColor: 'text-purple-400' },
            { key: 'survey' as const,      icon: BarChart2,       label: '설문',      activeColor: 'text-teal-400' },
            { key: 'meeting' as const,     icon: ExternalLink,    label: '온라인수업', activeColor: 'text-rose-400', live: !!activeMeeting },
            { key: 'unit' as const,        icon: ClipboardList,   label: '단원마무리', activeColor: 'text-amber-400', badge: unitPendingCount },
            { key: 'suggestions' as const, icon: Megaphone,       label: '질문·건의함',  activeColor: 'text-rose-400', badge: unreadReplyCount },
          ].map((item) => {
            const isActive = activeTab === item.key;
            const isLocked = isClassClosed && (item.key === 'record' || item.key === 'results');
            const badge = (item as any).badge as number | undefined;
            return (
              <button
                key={item.key}
                onClick={() => {
                  if (isLocked) {
                    showToast('수업이 종료되어 이용할 수 없습니다.', 'error');
                    return;
                  }
                  handleTabChange(item.key);
                }}
                title={isSidebarCollapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all relative ${
                  isSidebarCollapsed ? 'justify-center' : ''
                } ${isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'} ${isLocked ? 'opacity-40' : ''}`}
              >
                <div className="relative shrink-0">
                  <item.icon size={19} className={isActive ? item.activeColor : ''} />
                  {!!badge && badge > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-rose-500 text-white rounded-full text-[8px] font-black flex items-center justify-center">
                      {badge}
                    </span>
                  )}
                  {item.live && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  )}
                </div>
                {!isSidebarCollapsed && (
                  <span className="text-sm font-black truncate flex-1 text-left">{item.label}</span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* ── 하단 바텀 탭 바 (모바일 전용) ── */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900 border-t border-slate-700/60 shadow-[0_-8px_40px_rgba(0,0,0,0.35)]">
        <div className="max-w-lg mx-auto flex items-center px-1 pb-safe">
          {[
            { key: 'home' as const,    icon: LayoutDashboard, label: '홈',   activeColor: 'text-sky-400',     activeBg: 'bg-sky-400/15' },
            { key: 'record' as const,  icon: MessageSquare,   label: '기록', activeColor: 'text-violet-400',  activeBg: 'bg-violet-400/15' },
            { key: 'results' as const, icon: FolderOpen,      label: '결과', activeColor: 'text-emerald-400', activeBg: 'bg-emerald-400/15' },
            { key: 'board' as const,   icon: Users2,          label: '보드', activeColor: 'text-indigo-400',  activeBg: 'bg-indigo-400/15' },
          ].map((tab) => {
            const isActive = activeTab === tab.key && !isMoreSheetOpen;
            const isLocked = isClassClosed && (tab.key === 'record' || tab.key === 'results');
            return (
              <button
                id={`tour-tab-${tab.key}`}
                key={tab.key}
                onClick={() => {
                  if (isLocked) {
                    showToast('수업이 종료되어 이용할 수 없습니다.', 'error');
                    return;
                  }
                  handleTabChange(tab.key);
                }}
                className="flex-1 flex flex-col items-center gap-1.5 py-3.5 transition-all"
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all relative ${
                  isActive ? `${tab.activeBg} scale-105` : 'hover:bg-white/5'
                } ${isLocked ? 'opacity-40' : ''}`}>
                  <tab.icon size={26} className={isActive ? tab.activeColor : 'text-white/75'} strokeWidth={isActive ? 2.5 : 2} />
                  {isLocked && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-slate-600 rounded-full flex items-center justify-center">
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="white"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
                    </span>
                  )}
                </div>
                <span className={`text-[11px] font-black tracking-tight transition-colors ${isActive ? tab.activeColor : 'text-white/60'} ${isLocked ? 'opacity-40' : ''}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}

          {/* 더보기 버튼 */}
          <button
            id="tour-tab-more"
            onClick={() => setIsMoreSheetOpen(prev => !prev)}
            className="flex-1 flex flex-col items-center gap-1.5 py-3.5 transition-all"
          >
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all relative ${
              isMoreSheetOpen ? 'bg-white/15 scale-105' : 'hover:bg-white/5'
            }`}>
              <MoreHorizontal size={26} className={isMoreSheetOpen ? 'text-white' : 'text-white/75'} strokeWidth={isMoreSheetOpen ? 2.5 : 2} />
              {(unitPendingCount + unreadReplyCount) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-rose-500 text-white rounded-full text-[8px] font-black flex items-center justify-center">
                  {unitPendingCount + unreadReplyCount}
                </span>
              )}
            </div>
            <span className={`text-[11px] font-black tracking-tight transition-colors ${isMoreSheetOpen ? 'text-white' : 'text-white/60'}`}>
              더보기
            </span>
          </button>
        </div>
      </div>

      {/* ── 더보기 슬라이드업 시트 ── */}
      <AnimatePresence>
        {isMoreSheetOpen && (
          <>
            {/* 딤 레이어 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMoreSheetOpen(false)}
              className="lg:hidden fixed inset-0 z-30 bg-black/30 backdrop-blur-sm"
            />
            {/* 시트 */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 350 }}
              className="lg:hidden fixed bottom-[68px] left-0 right-0 z-40 bg-white rounded-t-[1.5rem] shadow-2xl border-t border-slate-200 overflow-hidden"
            >
              {/* 핸들 */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 bg-slate-300 rounded-full" />
              </div>

              <div className="px-4 pt-1 pb-6 grid grid-cols-5 gap-1">
                {[
                  { key: 'materials' as const, icon: BookOpen,    label: '수업 자료', color: 'text-cyan-600',   activeBg: 'bg-cyan-50'   },
                  ...(enabledToolIds.length > 0 ? [{ key: 'tools' as const, icon: Cpu, label: '학습 도구', color: 'text-fuchsia-600', activeBg: 'bg-fuchsia-50' }] : []),
                  { key: 'history' as const,   icon: History,     label: '나의 기록', color: 'text-blue-600',   activeBg: 'bg-blue-50'   },
                  { key: 'notes' as const,     icon: NotebookPen, label: '나의 노트', color: 'text-emerald-600', activeBg: 'bg-emerald-50' },
                  { key: 'quiz' as const,      icon: Gamepad2,    label: '퀴즈',      color: 'text-purple-600', activeBg: 'bg-purple-50' },
                  { key: 'survey' as const,    icon: BarChart2,   label: '설문',      color: 'text-teal-600',   activeBg: 'bg-teal-50' },
                  { key: 'meeting' as const,   icon: ExternalLink, label: '온라인수업', color: 'text-rose-600',  activeBg: 'bg-rose-50',  live: !!activeMeeting },
                  { key: 'unit' as const,      icon: ClipboardList, label: '단원마무리', color: 'text-amber-600', activeBg: 'bg-amber-50', badge: unitPendingCount },
                  { key: 'suggestions' as const, icon: Megaphone, label: '질문·건의함',  color: 'text-rose-600',   activeBg: 'bg-rose-50',  badge: unreadReplyCount },
                ].map((item) => {
                  const isActive = activeTab === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={() => handleTabChange(item.key)}
                      className={`relative flex flex-col items-center gap-1.5 py-4 px-2 rounded-2xl transition-all ${
                        isActive ? item.activeBg : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                        isActive ? `${item.activeBg} shadow-sm` : 'bg-slate-100'
                      }`}>
                        <item.icon size={20} className={isActive ? item.color : 'text-slate-500'} />
                      </div>
                      <span className={`text-[10px] font-black text-center leading-tight ${isActive ? item.color : 'text-slate-500'}`}>
                        {item.label}
                      </span>
                      {(item as any).badge > 0 && (
                        <span className="absolute top-2 right-2 w-4 h-4 bg-error text-white rounded-full text-[8px] font-black flex items-center justify-center shadow-sm">
                          {(item as any).badge}
                        </span>
                      )}
                      {(item as any).live && (
                        <span className="absolute top-3 right-3 w-2.5 h-2.5 bg-red-500 rounded-full shadow-sm animate-pulse" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* 사용 방법 보기 */}
              <div className="px-4 pb-5">
                <button
                  onClick={() => {
                    setIsMoreSheetOpen(false);
                    setShowGuideModal(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 transition-all"
                >
                  <BookOpen size={16} className="text-slate-500" />
                  <span className="text-[12px] font-black text-slate-500">사용 방법 보기</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 인터랙티브 가이드 투어 */}
      {showGuideModal && (
        <TourGuide
          steps={TOUR_STEPS}
          onClose={handleCloseGuide}
        />
      )}

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
                toast.type === 'error'
                  ? 'bg-error text-white'
                  : 'bg-neutral-900 text-white'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${toast.type === 'error' ? 'bg-white/60' : 'bg-primary animate-pulse'}`} />
              {toast.msg}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {isRejectModalOpen && aiFeedback && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md" onClick={() => setIsRejectModalOpen(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-lg bg-white p-10 rounded-[2rem] space-y-8 shadow-2xl relative overflow-hidden"
            >
              {/* 상단 색상 바 */}
              <div className={`absolute top-0 left-0 w-full h-2 bg-gradient-to-r ${
                rejectModalType === 'auto_reject'
                  ? 'from-amber-400 to-orange-500'
                  : 'from-error/60 to-error'
              }`} />

              <div className="flex justify-center mb-4">
                <div className={`w-20 h-20 rounded-2xl flex items-center justify-center shadow-inner border ${
                  rejectModalType === 'auto_reject'
                    ? 'bg-amber-50 text-amber-500 border-amber-100'
                    : 'bg-error/5 text-error border-error/10'
                }`}>
                  {rejectModalType === 'auto_reject' ? '🔄' : <Lightbulb size={36} />}
                </div>
              </div>

              <div className="text-center space-y-2">
                {rejectModalType === 'auto_reject' ? (
                  <>
                    <h3 className="text-2xl font-black text-slate-900 font-manrope">기록이 반려되었어요</h3>
                    <p className="text-sm font-bold text-slate-500">아래 피드백을 참고해서 수정 후 다시 제출해주세요.</p>
                  </>
                ) : (
                  <>
                    <h3 className="text-3xl font-black text-slate-900 font-manrope">잠깐만요! ✨</h3>
                    <p className="text-sm font-bold text-slate-500">조금만 더 내용을 다듬어볼까요?</p>
                  </>
                )}
              </div>

              <div className="space-y-4 pt-2">
                <div className="space-y-2 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <h4 className={`text-xs font-black uppercase tracking-widest flex items-center gap-2 ${
                    rejectModalType === 'auto_reject' ? 'text-amber-600' : 'text-error'
                  }`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      rejectModalType === 'auto_reject' ? 'bg-amber-500' : 'bg-error'
                    }`} />
                    {rejectModalType === 'auto_reject' ? '반려 사유' : 'AI 피드백'}
                  </h4>
                  <p className="text-sm font-bold text-slate-600 leading-relaxed">{aiFeedback.reason}</p>
                </div>
                {aiFeedback.guide && (
                  <div className="space-y-2 bg-primary/5 p-6 rounded-2xl border border-primary/10">
                    <h4 className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" /> 이렇게 수정해보세요
                    </h4>
                    <p className="text-sm font-bold text-primary/80 leading-relaxed">{aiFeedback.guide}</p>
                  </div>
                )}
                {rejectModalType === 'auto_reject' && (
                  <p className="text-[11px] text-slate-400 font-bold text-center">
                    선생님이 직접 검토 후 승인으로 변경할 수도 있습니다.
                  </p>
                )}
              </div>

              <div className="pt-2">
                <button
                  onClick={() => {
                    setIsRejectModalOpen(false);
                    if (rejectModalType === 'auto_reject') handleTabChange('record');
                  }}
                  className="w-full py-5 rounded-2xl bg-slate-900 text-white font-black hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 active:scale-95"
                >
                  {rejectModalType === 'auto_reject' ? '수정 후 재제출하기 →' : '내용 수정하러 가기'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 상세 보기 모달 */}
      <AnimatePresence>
        {detailItem && (() => {
          const isObs = detailItem._kind === 'obs' || !detailItem._kind;
          const weeklyPlan: {week: number; topic: string}[] = classResources || [];
          const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

          let weekLabel: string | null = null;
          if (isObs) {
            const matched = weeklyPlan.find(p => norm(p.topic) === norm(detailItem.activity_name || ''));
            if (matched) weekLabel = `${matched.week}주차 · ${matched.topic}`;
          } else if (detailItem.week_number) {
            const topic = weeklyPlan.find(p => p.week === detailItem.week_number)?.topic;
            weekLabel = topic ? `${detailItem.week_number}주차 · ${topic}` : `${detailItem.week_number}주차`;
          }

          const imagePublicUrls = !isObs && (detailItem.result_type === 'image' || detailItem.submission_type === 'image')
            ? getResultImagePublicUrls(supabase.storage, detailItem)
            : [];

          return (
            <div
              className="fixed inset-0 z-[1100] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-slate-900/60 backdrop-blur-md"
              onClick={() => setDetailItem(null)}
            >
              <motion.div
                initial={{ opacity: 0, y: 60 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 60 }}
                transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                onClick={e => e.stopPropagation()}
                className="w-full sm:max-w-lg bg-white rounded-t-[1.75rem] sm:rounded-[1.75rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
              >
                {/* 헤더 */}
                <div className={`px-8 pt-8 pb-6 shrink-0 ${isObs ? 'bg-violet-50 border-b border-violet-100' : 'bg-emerald-50 border-b border-emerald-100'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isObs ? (
                          <span className="text-[10px] font-black text-violet-600 bg-white border border-violet-200 px-2.5 py-1 rounded-lg">📝 활동 기록</span>
                        ) : (
                          <span className="text-[10px] font-black text-emerald-600 bg-white border border-emerald-200 px-2.5 py-1 rounded-lg">📁 결과 제출</span>
                        )}
                        {weekLabel && (
                          <span className="text-[10px] font-black text-primary bg-primary/10 px-2.5 py-1 rounded-lg">{weekLabel}</span>
                        )}
                      </div>
                      <p className="font-black text-xl leading-tight">
                        {isObs ? detailItem.activity_name : (detailItem.title || '제목 없음')}
                      </p>
                      <p className="text-xs text-on-surface-variant font-bold flex items-center gap-1">
                        <Clock size={11} />
                        {new Date(detailItem.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <button
                      onClick={() => setDetailItem(null)}
                      className="w-9 h-9 rounded-xl bg-white/80 hover:bg-white flex items-center justify-center text-on-surface-variant shrink-0 transition-all border border-black/5"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {/* 본문 */}
                <div className="px-8 py-6 overflow-y-auto flex-1 space-y-5">
                  {isObs ? (
                    <>
                      {detailItem.category && (
                        <div className="space-y-1">
                          <p className="text-[10px] font-black text-primary uppercase tracking-widest">카테고리</p>
                          <p className="text-sm font-bold">{detailItem.category}</p>
                        </div>
                      )}
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">활동 내용</p>
                        <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{detailItem.content || '내용 없음'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">상태</p>
                        {detailItem.status === 'pending' ? (
                          <span className="flex items-center gap-1 text-xs font-black text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">
                            <Clock size={11} /> 승인 대기중
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs font-black text-secondary bg-secondary/10 border border-secondary/20 px-2.5 py-1 rounded-lg">
                            <CheckCircle2 size={11} /> 승인됨
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      {/* 그룹 카드: _group 배열 내 모든 타입 순서대로 표시 */}
                      {detailItem._isGroupCard && detailItem._group ? (
                        (() => {
                          const groupRows: any[] = detailItem._group;
                          return (
                            <div className="space-y-4">
                              {/* 조별 제출 안내 */}
                              {detailItem._isGroupSubmission && (
                                <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-2xl">
                                  <span className="text-sm">👥</span>
                                  <p className="text-xs font-black text-indigo-600">조별 제출 결과물입니다</p>
                                </div>
                              )}
                              {groupRows.find((r: any) => r.result_type === 'text')?.text_content && (
                                <div className="space-y-1">
                                  <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">텍스트 내용</p>
                                  <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap bg-surface-container rounded-2xl px-5 py-4">
                                    {groupRows.find((r: any) => r.result_type === 'text').text_content}
                                  </p>
                                </div>
                              )}
                              {groupRows.find((r: any) => r.result_type === 'link')?.link_url && (
                                <div className="space-y-1">
                                  <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">링크</p>
                                  <a
                                    href={groupRows.find((r: any) => r.result_type === 'link').link_url.startsWith('http') ? groupRows.find((r: any) => r.result_type === 'link').link_url : `https://${groupRows.find((r: any) => r.result_type === 'link').link_url}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 text-sm font-bold text-blue-600 bg-blue-50 border border-blue-200 px-5 py-4 rounded-2xl hover:bg-blue-100 transition-all break-all"
                                  >
                                    <ExternalLink size={14} className="shrink-0" />
                                    {groupRows.find((r: any) => r.result_type === 'link').link_url}
                                  </a>
                                </div>
                              )}
                              {groupRows.find((r: any) => r.result_type === 'image') && (() => {
                                const imgRow = groupRows.find((r: any) => r.result_type === 'image');
                                const imgUrls = getResultImagePublicUrls(supabase.storage, imgRow);
                                return (
                                  <div className="space-y-2">
                                    <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">이미지</p>
                                    {imgUrls.length > 0 ? (
                                      <ImageCarousel
                                        urls={imgUrls}
                                        alt={imgRow.display_name || '제출 이미지'}
                                        thumbClassName="w-full rounded-2xl object-contain max-h-[50vh] border border-surface-container bg-surface-container"
                                      />
                                    ) : (
                                      <p className="text-sm text-on-surface-variant">{imgRow.display_name}</p>
                                    )}
                                  </div>
                                );
                              })()}
                              {groupRows.find((r: any) => r.result_type === 'file')?.display_name && (() => {
                                const fileRow = groupRows.find((r: any) => r.result_type === 'file');
                                return (
                                  <div className="space-y-2">
                                    <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">파일</p>
                                    <div className="flex items-center justify-between gap-4 bg-amber-50 border border-amber-200 px-5 py-4 rounded-2xl">
                                      <div className="flex items-center gap-3 min-w-0">
                                        <File size={18} className="text-amber-600 shrink-0" />
                                        <div className="min-w-0">
                                          <p className="text-sm font-black truncate">{fileRow.display_name}</p>
                                          {fileRow.file_size && <p className="text-xs text-on-surface-variant font-bold">{(fileRow.file_size / 1024).toFixed(1)} KB</p>}
                                        </div>
                                      </div>
                                      <button
                                        onClick={() => handleDownloadResult(fileRow)}
                                        className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white rounded-xl text-xs font-black hover:bg-amber-600 transition-all shrink-0"
                                      >
                                        <ExternalLink size={12} /> 다운로드
                                      </button>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })()
                      ) : (
                        <>
                          {(detailItem.result_type === 'text' || detailItem.submission_type === 'text') && detailItem.text_content && (
                            <div className="space-y-1">
                              <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">텍스트 내용</p>
                              <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap bg-surface-container rounded-2xl px-5 py-4">{detailItem.text_content}</p>
                            </div>
                          )}
                          {(detailItem.result_type === 'link' || detailItem.submission_type === 'link') && detailItem.link_url && (
                            <div className="space-y-1">
                              <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">링크</p>
                              <a
                                href={detailItem.link_url.startsWith('http') ? detailItem.link_url : `https://${detailItem.link_url}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-sm font-bold text-blue-600 bg-blue-50 border border-blue-200 px-5 py-4 rounded-2xl hover:bg-blue-100 transition-all break-all"
                              >
                                <ExternalLink size={14} className="shrink-0" />
                                {detailItem.link_url}
                              </a>
                            </div>
                          )}
                          {(detailItem.result_type === 'image' || detailItem.submission_type === 'image') && (
                            <div className="space-y-2">
                              <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">이미지</p>
                              {imagePublicUrls.length > 0 ? (
                                <ImageCarousel
                                  urls={imagePublicUrls}
                                  alt={detailItem.display_name || '제출 이미지'}
                                  thumbClassName="w-full rounded-2xl object-contain max-h-[50vh] border border-surface-container bg-surface-container"
                                />
                              ) : (
                                <p className="text-sm text-on-surface-variant">{detailItem.display_name}</p>
                              )}
                            </div>
                          )}
                          {(detailItem.result_type === 'file' || detailItem.submission_type === 'file') && detailItem.display_name && (
                            <div className="space-y-2">
                              <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">파일</p>
                              <div className="flex items-center justify-between gap-4 bg-amber-50 border border-amber-200 px-5 py-4 rounded-2xl">
                                <div className="flex items-center gap-3 min-w-0">
                                  <File size={18} className="text-amber-600 shrink-0" />
                                  <div className="min-w-0">
                                    <p className="text-sm font-black truncate">{detailItem.display_name}</p>
                                    {detailItem.file_size && <p className="text-xs text-on-surface-variant font-bold">{(detailItem.file_size / 1024).toFixed(1)} KB</p>}
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleDownloadResult(detailItem)}
                                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white rounded-xl text-xs font-black hover:bg-amber-600 transition-all shrink-0"
                                >
                                  <ExternalLink size={12} /> 다운로드
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                      {/* 선생님 피드백 (반려 아닌 일반 피드백) */}
                      {detailItem._teacherFeedback && (
                        <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl">
                          <p className="text-[10px] font-black text-indigo-500 mb-1.5 flex items-center gap-1">
                            <MessageSquare size={12} /> 선생님 피드백
                          </p>
                          <p className="text-sm font-bold text-indigo-700 leading-relaxed">{detailItem._teacherFeedback}</p>
                        </div>
                      )}
                      {/* 선생님 평가 (성취수준/역량 태그/평가 코멘트) */}
                      {(detailItem._teacherEvalScore || detailItem._teacherEvalTags?.length || detailItem._teacherEvalNote) && (
                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-2">
                          <p className="text-[10px] font-black text-amber-600 mb-0.5 flex items-center gap-1">
                            <Trophy size={12} /> 선생님 평가
                          </p>
                          {detailItem._teacherEvalScore && (
                            <p className="text-sm font-black text-amber-600">{'★'.repeat(detailItem._teacherEvalScore)}{'☆'.repeat(5 - detailItem._teacherEvalScore)}</p>
                          )}
                          {detailItem._teacherEvalTags?.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {detailItem._teacherEvalTags.map((tag: string) => (
                                <span key={tag} className="text-[10px] font-black text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-md">{tag}</span>
                              ))}
                            </div>
                          )}
                          {detailItem._teacherEvalNote && (
                            <p className="text-sm font-bold text-amber-800 leading-relaxed">{detailItem._teacherEvalNote}</p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* 하단 액션 */}
                <div className="px-8 pb-8 pt-4 border-t border-surface-container shrink-0 flex gap-3">
                  <button
                    onClick={() => setDetailItem(null)}
                    className="flex-1 py-3.5 rounded-2xl bg-surface-container text-on-surface-variant font-black text-sm hover:bg-surface-container-high transition-all"
                  >
                    닫기
                  </button>
                  {isObs ? (
                    <button
                      onClick={() => { handleStartEditLog(detailItem); setDetailItem(null); }}
                      className="flex items-center justify-center gap-2 flex-1 py-3.5 rounded-2xl bg-primary text-white font-black text-sm hover:bg-primary/80 transition-all"
                    >
                      <Pencil size={14} /> 수정하기
                    </button>
                  ) : (
                    <button
                      onClick={() => { handleEditResult(detailItem); handleTabChange('results'); setDetailItem(null); }}
                      className="flex items-center justify-center gap-2 flex-1 py-3.5 rounded-2xl bg-primary text-white font-black text-sm hover:bg-primary/80 transition-all"
                    >
                      <Pencil size={14} /> 수정하기
                    </button>
                  )}
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* 보드 카드 상세 모달 */}
      <AnimatePresence>
        {boardSelectedPost && (() => {
          const p = boardSelectedPost;
          const isObs = p._type === 'obs';
          const isMe = p.student_id === session?.student_id;
          return (
            <>
              <motion.div
                key="board-detail-backdrop"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setBoardSelectedPost(null)}
                className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm"
              />
              <motion.div
                key="board-detail-modal"
                initial={{ opacity: 0, y: 16, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                className="fixed inset-0 z-[200] flex items-center justify-center px-4 pointer-events-none"
              >
                <div
                  onClick={e => e.stopPropagation()}
                  className={`pointer-events-auto w-full max-w-lg max-h-[75vh] overflow-y-auto rounded-2xl border-2 shadow-2xl bg-white ${
                    isMe
                      ? isObs ? 'border-violet-200' : 'border-emerald-200'
                      : 'border-slate-200'
                  }`}
                >
                  {/* 모달 헤더 */}
                  <div className={`sticky top-0 flex items-center justify-between gap-3 px-5 py-4 border-b ${
                    isMe
                      ? isObs ? 'bg-violet-50 border-violet-100' : 'bg-emerald-50 border-emerald-100'
                      : 'bg-slate-50 border-slate-100'
                  }`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-base shrink-0 ${
                        isObs ? 'bg-violet-100' : 'bg-emerald-100'
                      }`}>
                        {isObs ? '📝' : '📁'}
                      </div>
                      <div className="min-w-0">
                        <p className="font-black truncate text-sm">
                          {p.student_name}
                          {isMe && <span className="ml-1.5 text-[9px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">나</span>}
                        </p>
                        <p className="text-[11px] text-on-surface-variant font-bold">
                          {p.week_number ? `${p.week_number}주차 · ` : ''}
                          {new Date(p.created_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}
                          &nbsp;·&nbsp;
                          <span className={isObs ? 'text-violet-600' : 'text-emerald-600'}>
                            {isObs ? '활동 기록' : '결과물'}
                          </span>
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setBoardSelectedPost(null)}
                      className="shrink-0 w-9 h-9 rounded-xl hover:bg-surface-container flex items-center justify-center transition-all"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* 모달 본문 */}
                  <div className="p-5 space-y-4">
                    <h2 className="text-base font-black leading-snug">
                      {isObs ? p.activity_name : p.title}
                    </h2>
                    {/* 조별 제출 정보 */}
                    {!isObs && p._isGroupSub && boardGroupModalInfo && (
                      <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-indigo-50 border border-indigo-100">
                        <span className="text-lg shrink-0">👥</span>
                        <div>
                          <p className="text-sm font-black text-indigo-700">{boardGroupModalInfo.name}</p>
                          {boardGroupModalInfo.memberNames.length > 0 && (
                            <p className="text-xs text-indigo-500 font-bold mt-0.5">
                              {boardGroupModalInfo.memberNames.join(' · ')}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                    {isObs && p.content && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-violet-500 uppercase tracking-widest">관찰 내용</p>
                        <p className="text-sm text-on-surface-variant font-bold leading-relaxed whitespace-pre-wrap">{p.content}</p>
                      </div>
                    )}
                    {isObs && p.feeling && (
                      <div className="px-4 py-3 rounded-2xl bg-violet-50 border border-violet-100">
                        <p className="text-sm text-on-surface-variant/70 font-bold italic leading-relaxed">💬 {p.feeling}</p>
                      </div>
                    )}
                    {!isObs && (p._submissions || [p]).map((sub: any, idx: number, arr: any[]) => (
                      <div key={sub.id} className={arr.length > 1 ? `space-y-3 ${idx > 0 ? 'pt-4 border-t border-dashed border-slate-200' : ''}` : 'space-y-3'}>
                        {arr.length > 1 && (
                          <p className="text-[10px] font-black text-on-surface-variant/60 uppercase tracking-widest">
                            {idx + 1}번째 제출 · {new Date(sub.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                        {sub.text_content && (
                          <div className="space-y-1">
                            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">내용</p>
                            <p className="text-sm text-on-surface-variant font-bold leading-relaxed whitespace-pre-wrap">{sub.text_content}</p>
                          </div>
                        )}
                        {sub.image_urls?.length > 0 && (
                          <ImageCarousel
                            urls={sub.image_urls}
                            thumbClassName="w-full rounded-2xl object-contain max-h-72 cursor-zoom-in"
                          />
                        )}
                        {sub.link_url && (
                          <a href={sub.link_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 font-black text-sm hover:bg-blue-100 transition-all">
                            <ExternalLink size={14} /><span className="truncate">{sub.link_url}</span>
                          </a>
                        )}
                        {sub._group && sub._group.filter((r: any) => r.result_type === 'link' && r.link_url !== sub.link_url).map((r: any) => (
                          <a key={r.id} href={r.link_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 font-black text-sm hover:bg-blue-100 transition-all">
                            <ExternalLink size={14} /><span className="truncate">{r.link_url}</span>
                          </a>
                        ))}
                        {sub.file_url && (
                          <div className="w-full flex items-center gap-2 px-4 py-3.5 bg-amber-50 border border-amber-100 rounded-2xl">
                            <File size={15} className="text-amber-500 shrink-0" />
                            <span className="text-sm font-black text-amber-700 truncate flex-1">{sub.display_name || '첨부 파일'}</span>
                            {getViewerKind(sub.display_name || '') !== 'unsupported' && (
                              <button
                                onClick={() => setViewerFile({ url: sub.file_url, name: sub.display_name || '첨부파일' })}
                                title="미리보기"
                                className="w-8 h-8 rounded-lg hover:bg-amber-100 flex items-center justify-center text-amber-500 hover:text-amber-700 transition-colors shrink-0"
                              >
                                <ExternalLink size={15} />
                              </button>
                            )}
                            <button
                              onClick={() => openFile(sub.file_url, sub.display_name || '첨부파일')}
                              title="다운로드"
                              className="w-8 h-8 rounded-lg hover:bg-amber-100 flex items-center justify-center text-amber-400 hover:text-amber-600 transition-colors shrink-0"
                            >
                              <Download size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </>
          );
        })()}
      </AnimatePresence>

      {/* ── 수업 보드 시작 알림 바텀시트 ── */}
      <AnimatePresence>
        {boardSessionAlert && (
          <div className="fixed inset-0 z-[1600] flex items-end justify-center">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setBoardSessionAlert(null)}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="relative w-full max-w-lg bg-white rounded-t-2xl px-6 pt-5 pb-8 shadow-2xl border-t-4 border-blue-400"
            >
              <div className="w-10 h-1.5 bg-neutral-200 rounded-full mx-auto mb-5" />
              <div className="flex items-start gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center text-2xl shrink-0">🎨</div>
                <div className="flex-1">
                  <p className="font-black text-on-surface text-base leading-snug">
                    선생님이 수업 보드를 시작했어요!
                  </p>
                  <p className="text-sm text-on-surface-variant font-bold mt-1">
                    보드 탭에서 바로 참여할 수 있습니다
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setBoardSessionAlert(null);
                    handleTabChange('board');
                  }}
                  className="flex-1 py-4 btn-gradient rounded-2xl font-black text-sm"
                >
                  보드 탭으로 이동 →
                </button>
                <button
                  onClick={() => setBoardSessionAlert(null)}
                  className="px-5 py-4 bg-neutral-100 hover:bg-neutral-200 rounded-2xl font-black text-sm text-neutral-500 transition-all"
                >
                  닫기
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── 퀴즈 시작 알림 바텀시트 ── */}
      <AnimatePresence>
        {quizSessionAlert && (
          <div className="fixed inset-0 z-[1600] flex items-end justify-center">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setQuizSessionAlert(null)}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="relative w-full max-w-lg bg-white rounded-t-2xl px-6 pt-5 pb-8 shadow-2xl border-t-4 border-violet-400"
            >
              <div className="w-10 h-1.5 bg-neutral-200 rounded-full mx-auto mb-5" />
              <div className="flex items-start gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center text-2xl shrink-0">🎮</div>
                <div className="flex-1">
                  <p className="font-black text-on-surface text-base leading-snug">
                    선생님이 퀴즈를 시작했어요!
                  </p>
                  <p className="text-sm text-on-surface-variant font-bold mt-1">
                    "{quizSessionAlert.title}"에 지금 바로 참여하세요
                  </p>
                  <div className="mt-2 flex items-center gap-2 bg-violet-50 rounded-xl px-3 py-2">
                    <span className="text-xs font-black text-violet-500">PIN</span>
                    <span className="text-xl font-black tracking-widest text-violet-700">{quizSessionAlert.pin_code}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setQuizSessionAlert(null);
                    handleTabChange('quiz');
                  }}
                  className="flex-1 py-4 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-2xl font-black text-sm"
                >
                  퀴즈 탭으로 이동 →
                </button>
                <button
                  onClick={() => setQuizSessionAlert(null)}
                  className="px-5 py-4 bg-neutral-100 hover:bg-neutral-200 rounded-2xl font-black text-sm text-neutral-500 transition-all"
                >
                  닫기
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── 반려 알림 바텀시트 ── */}
      <AnimatePresence>
        {rejectionNotification && (
          <div className="fixed inset-0 z-[1600] flex items-end justify-center">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setRejectionNotification(null)}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="relative w-full max-w-lg bg-white rounded-t-2xl px-6 pt-5 pb-8 shadow-2xl border-t-4 border-red-400"
            >
              <div className="w-10 h-1.5 bg-neutral-200 rounded-full mx-auto mb-5" />
              <div className="flex items-start gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center text-2xl shrink-0">🚨</div>
                <div className="flex-1">
                  <p className="font-black text-on-surface text-base leading-snug">
                    {rejectionNotification.type === 'obs'
                      ? `"${rejectionNotification.title}" 활동 기록이 반려되었습니다`
                      : `"${rejectionNotification.title}" 결과물이 반려되었습니다`}
                  </p>
                  {rejectionNotification.feedback && (
                    <div className="mt-2 p-3 bg-red-50 border border-red-100 rounded-xl">
                      <p className="text-[10px] font-black text-red-500 mb-1">선생님 피드백</p>
                      <p className="text-sm font-bold text-red-700 leading-relaxed">{rejectionNotification.feedback}</p>
                    </div>
                  )}
                  <p className="text-xs text-on-surface-variant/60 font-bold mt-2">수정 후 재제출할 수 있습니다.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    const type = rejectionNotification.type;
                    setRejectionNotification(null);
                    handleTabChange(type === 'obs' ? 'record' : 'results');
                  }}
                  className="flex-1 py-4 btn-gradient rounded-2xl font-black text-sm"
                >
                  지금 수정하러 가기 →
                </button>
                <button
                  onClick={() => setRejectionNotification(null)}
                  className="px-5 py-4 bg-neutral-100 hover:bg-neutral-200 rounded-2xl font-black text-sm text-neutral-500 transition-all"
                >
                  확인
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── 승인 알림 바텀시트 ── */}
      <AnimatePresence>
        {approvalNotification && (
          <div className="fixed inset-0 z-[1600] flex items-end justify-center">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setApprovalNotification(null)}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="relative w-full max-w-lg bg-white rounded-t-2xl px-6 pt-5 pb-8 shadow-2xl border-t-4 border-green-400"
            >
              <div className="w-10 h-1.5 bg-neutral-200 rounded-full mx-auto mb-5" />
              <div className="flex items-start gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center text-2xl shrink-0">✅</div>
                <div className="flex-1">
                  <p className="font-black text-on-surface text-base leading-snug">
                    {approvalNotification.type === 'obs'
                      ? `"${approvalNotification.title}" 활동 기록이 승인되었습니다`
                      : `"${approvalNotification.title}" 결과물이 승인되었습니다`}
                  </p>
                  <p className="text-xs text-on-surface-variant/60 font-bold mt-2">선생님이 확인하고 승인했습니다. 🎉</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    const type = approvalNotification.type;
                    setApprovalNotification(null);
                    handleTabChange(type === 'obs' ? 'record' : 'results');
                  }}
                  className="flex-1 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-2xl font-black text-sm"
                >
                  확인하러 가기 →
                </button>
                <button
                  onClick={() => setApprovalNotification(null)}
                  className="px-5 py-4 bg-neutral-100 hover:bg-neutral-200 rounded-2xl font-black text-sm text-neutral-500 transition-all"
                >
                  닫기
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── 제출 리마인더 바텀시트 ── */}
      <AnimatePresence>
        {reminderModal && (
          <div className="fixed inset-0 z-[1500] flex items-end justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setReminderModal(null)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="relative w-full max-w-lg bg-white rounded-t-2xl px-6 pt-5 pb-8 shadow-2xl"
            >
              {/* 드래그 핸들 */}
              <div className="w-10 h-1.5 bg-neutral-200 rounded-full mx-auto mb-5" />

              <div className="flex items-start gap-4 mb-6">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0 ${
                  reminderModal.type === 'need_result' ? 'bg-emerald-100' : 'bg-violet-100'
                }`}>
                  {reminderModal.type === 'need_result' ? '📁' : '📝'}
                </div>
                <div className="flex-1">
                  <p className="font-black text-on-surface text-base leading-snug">
                    {reminderModal.type === 'need_result'
                      ? `${reminderModal.week}주차 결과물도 제출해주세요!`
                      : `${reminderModal.week}주차 활동 기록도 작성해주세요!`}
                  </p>
                  <p className="text-sm text-on-surface-variant/70 mt-1.5 leading-relaxed">
                    {reminderModal.type === 'need_result'
                      ? `"${reminderModal.topic}" 활동 기록은 제출됐어요.\n이번 주차 결과물도 함께 제출해야 완성돼요.`
                      : `"${reminderModal.topic}" 결과물은 제출됐어요.\n활동 기록도 빠짐없이 작성해주세요.`}
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    const type = reminderModal.type;
                    const week = reminderModal.week;
                    setReminderModal(null);
                    if (type === 'need_result') {
                      setSelectedWeek(week);
                      setActiveTab('results');
                    } else {
                      setActiveTab('record');
                    }
                  }}
                  className="flex-1 py-4 btn-gradient rounded-2xl font-black text-sm"
                >
                  지금 {reminderModal.type === 'need_result' ? '결과물' : '활동 기록'} 작성하기 →
                </button>
                <button
                  onClick={() => setReminderModal(null)}
                  className="px-5 py-4 bg-neutral-100 hover:bg-neutral-200 rounded-2xl font-black text-sm text-neutral-500 transition-all"
                >
                  나중에
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
    <SubmissionViewerModal
      isOpen={!!viewerFile}
      onClose={() => setViewerFile(null)}
      fileUrl={viewerFile?.url || ''}
      fileName={viewerFile?.name || ''}
    />
    </>
  );
};

export default StudentLog;

