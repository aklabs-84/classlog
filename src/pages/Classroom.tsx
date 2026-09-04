import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { openFile } from '../lib/fileUtils';
import SubmissionViewerModal, { getViewerKind } from '../components/classroom/SubmissionViewerModal';
import { ImageCarousel, getResultImagePublicUrls } from '../components/common/ImageCarousel';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import RichEditor from '../components/RichEditor';
import CodeBlock from '../components/CodeBlock';
import {
  Trash2,
  X,
  LayoutDashboard,
  Sparkles,
  Archive,
  RefreshCcw,
  AlertCircle,
  GraduationCap,
  ChevronDown,
  Users,
  BookOpen,
  Link2,
  Plus,
  ClipboardList,
  Users2,
  Layers,
  Maximize2,
  StickyNote,
  RefreshCw,
  ExternalLink,
  File,
  Loader2,
  Download,
  Headphones,
  Search,
  Upload,
  FileText,
  CheckCircle2,
  Lock,
  Unlock,
  CalendarDays,
  Clock,
  School,
  Copy,
  Megaphone,
  Pin,
  Eye,
  EyeOff,
  NotebookPen,
  Library,
  Settings2,
  Pencil,
  Wand2,
  Cpu,
} from 'lucide-react';
import { useAuth, getClassLimit, getStudentLimit } from '../lib/auth';
import { validateTeacherPrompt, validateStudentGuidePrompt } from '../lib/gemini';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { isDemoTeacher } from '../lib/demo';
import { setDemoTourState } from '../components/DemoTourOverlay';
import DemoModeBanner from '../components/DemoModeBanner';

import PresentationModal from '../components/PresentationModal';
import type { ActivityLink } from '../components/ActivityLinksButton';

// Modular Components
import ClassSelector from '../components/classroom/ClassSelector';
import BriefingModal from '../components/classroom/BriefingModal';
import SubjectDashboard from '../components/classroom/SubjectDashboard';
import HomeroomDashboard from '../components/classroom/HomeroomDashboard';
import ClassroomFabMenu from '../components/classroom/ClassroomFabMenu';
import StudentPreviewModal from '../components/classroom/StudentPreviewModal';
import AIInsightBanner from '../components/classroom/AIInsightBanner';
import AIReportModal from '../components/classroom/AIReportModal';
import AIChatModal from '../components/classroom/AIChatModal';
import StudentDetailDrawer from '../components/classroom/StudentDetailDrawer';
import UnitManager from '../components/classroom/UnitManager';
import AttendanceTab from '../components/classroom/AttendanceTab';
import GroupTab from '../components/classroom/GroupTab';
import AutoGradingPanel from '../components/classroom/AutoGradingPanel';
import GlobalStudentSearch from '../components/classroom/GlobalStudentSearch';
import UpgradeModal from '../components/UpgradeModal';
import SchoolProjectHub from '../components/classroom/SchoolProjectHub';
import SchoolProjectModal from '../components/classroom/SchoolProjectModal';
import ImportMaterialModal, { type ImportableMaterial } from '../components/slidedeck/ImportMaterialModal';

type BreakGenSettings = {
  periodMinutes: number;
  breakMinutes: number;
  lunchEnabled: boolean;
  lunchAfterPeriod: number;
  lunchMinutes: number;
};

const DEFAULT_BREAK_GEN: BreakGenSettings = {
  periodMinutes: 0,
  breakMinutes: 10,
  lunchEnabled: false,
  lunchAfterPeriod: 3,
  lunchMinutes: 50,
};

// 참고용 기본값이며 학교마다 다르므로 생성 전 자유롭게 수정 가능
const SCHOOL_LEVEL_PRESETS = [
  { label: '초등학교', periodMinutes: 40, breakMinutes: 10 },
  { label: '중학교', periodMinutes: 45, breakMinutes: 10 },
  { label: '고등학교', periodMinutes: 50, breakMinutes: 10 },
];

// 시작~종료 시각 사이를 (수업시간+쉬는시간) 단위로 나눠 쉬는시간 시작 시각 목록을 생성
const generateBreakTimes = (startTime: string, endTime: string, gen: BreakGenSettings): string[] => {
  if (!startTime || !endTime || !gen.periodMinutes) return [];
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const toStr = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  const endMin = toMin(endTime);
  let cur = toMin(startTime);
  const times: string[] = [];
  let period = 0;
  while (cur + gen.periodMinutes < endMin) {
    period += 1;
    cur += gen.periodMinutes;
    times.push(toStr(cur));
    cur += gen.lunchEnabled && period === gen.lunchAfterPeriod ? gen.lunchMinutes : gen.breakMinutes;
  }
  return times;
};

// ── 공지사항 내용 마크다운 렌더러 (카드 안에서 컴팩트하게 표시) ─────────────────
const announcementMdComponents: any = {
  p: ({ children }: any) => <p className="mb-2 last:mb-0 leading-relaxed text-xs font-bold text-on-surface-variant/70">{children}</p>,
  h1: ({ children }: any) => <h1 className="text-sm font-black mb-1.5 mt-2 text-on-surface">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-sm font-black mb-1.5 mt-2 text-on-surface">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-xs font-black mb-1 mt-2 text-on-surface">{children}</h3>,
  ul: ({ children }: any) => <ul className="list-disc pl-5 mb-2 space-y-0.5 text-xs">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal pl-5 mb-2 space-y-0.5 text-xs">{children}</ol>,
  li: ({ children }: any) => <li className="text-xs text-on-surface-variant/70">{children}</li>,
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-4 border-amber-400 pl-3 italic text-on-surface-variant my-2 bg-amber-50 py-1.5 rounded-r-lg text-xs">
      {children}
    </blockquote>
  ),
  code: ({ children, className }: any) => {
    if (!className) {
      return <code className="bg-surface-container px-1.5 py-0.5 rounded text-xs font-mono text-primary">{children}</code>;
    }
    return <code className={className}>{children}</code>;
  },
  pre: ({ children }: any) => {
    const child = (Array.isArray(children) ? children[0] : children) as any;
    const className = child?.props?.className || '';
    const lang = className.replace('language-', '') || 'text';
    const code = String(child?.props?.children ?? '').replace(/\n$/, '');
    return <CodeBlock lang={lang} code={code} />;
  },
  a: ({ href, children }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:opacity-70">{children}</a>
  ),
  img: ({ src, alt }: any) => <img src={src} alt={alt} className="max-w-full rounded-xl my-2 shadow" />,
  hr: () => <hr className="border-amber-200 my-3" />,
  strong: ({ children }: any) => <strong className="font-black">{children}</strong>,
  table: ({ children }: any) => <div className="overflow-auto mb-2"><table className="w-full border-collapse text-xs">{children}</table></div>,
  th: ({ children }: any) => <th className="border border-surface-container px-2 py-1.5 bg-surface-container font-black text-left">{children}</th>,
  td: ({ children }: any) => <td className="border border-surface-container px-2 py-1.5">{children}</td>,
};

// TeachingTools.tsx의 category: 'learning' 도구와 동일하게 유지 (전체 모듈을 import하면 번들이 무거워져 메타데이터만 복제)
const LEARNING_TOOLS: { id: string; label: string; icon: React.ReactNode }[] = [
  { id: 'microbit-python-lab', label: '마이크로비트 파이썬 실습', icon: <Cpu size={14} /> },
];

const Classroom = () => {
  const { user, profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  // student_id → { name, color }
  const [groupMap, setGroupMap] = useState<Record<string, { name: string; color: string }>>({});
  const [activeClassId, setActiveClassId] = useState<string | null>(
    searchParams.get('id') || localStorage.getItem('teacher_last_class_id')
  );
  const [classInfo, setClassInfo] = useState<any>(null);
  const [viewerFile, setViewerFile] = useState<{ url: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [shareTeacherSuccess, setShareTeacherSuccess] = useState(false);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [upgradeModalReason, setUpgradeModalReason] = useState<'class_limit' | 'ai_limit' | 'ai_bulk' | 'teacher_invite' | 'naiss_export' | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [newClassData, setNewClassData] = useState({
    name: '',
    subject: '',
    class_type: 'subject',
    student_guide_prompt: '',
    teacher_report_prompt: '',
    weekly_plan: [{ week: 1, topic: '', url: '', requires_result: true, requires_activity: true }],
    min_obs_chars: 0,
    blocked_keywords: [] as string[],
    ai_review_enabled: true,
    start_date: '',
    end_date: '',
    class_start_time: '',
    class_end_time: '',
    end_alarm_minutes: [] as number[],
    break_times: [] as string[],
    schedule_mode: null as 'weekday' | 'dates' | null,
    class_days_of_week: [] as number[],
    class_specific_dates: [] as string[],
  });
  const [updateClassData, setUpdateClassData] = useState<any>(null);
  const [breakGenNew, setBreakGenNew] = useState<BreakGenSettings>(DEFAULT_BREAK_GEN);
  const [breakGenEdit, setBreakGenEdit] = useState<BreakGenSettings>(DEFAULT_BREAK_GEN);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [activeTab, setActiveTab] = useState<'list' | 'ai' | 'units' | 'attendance' | 'board' | 'groups' | 'notice' | 'teacher_materials' | 'grading'>(
    (searchParams.get('tab') as 'list' | 'ai' | 'units' | 'attendance' | 'board' | 'groups' | 'notice' | 'teacher_materials' | 'grading') || 'list'
  );
  // 보드 탭 state
  const [boardPosts, setBoardPosts] = useState<any[]>([]);
  const [boardLoading, setBoardLoading] = useState(false);
  const [boardTypeFilter, setBoardTypeFilter] = useState<'all' | 'obs' | 'result'>('all');
  const [boardWeekFilter, setBoardWeekFilter] = useState<number | 'all'>('all');
  const [boardSelectedPost, setBoardSelectedPost] = useState<any | null>(null);
  const [boardGroupModalInfo, setBoardGroupModalInfo] = useState<{ name: string; memberNames: string[] } | null>(null);
  const [isBriefingOpen, setIsBriefingOpen] = useState(false);
  const [editModalTab, setEditModalTab] = useState<'basic' | 'ai' | 'syllabus'>('basic');
  const [promptValidation, setPromptValidation] = useState<{ feasible: boolean; message: string; guide?: string } | null>(null);
  const [isValidatingPrompt, setIsValidatingPrompt] = useState(false);
  const [guideValidation, setGuideValidation] = useState<{ feasible: boolean; message: string; guide?: string } | null>(null);
  const [isValidatingGuide, setIsValidatingGuide] = useState(false);
  
  // 아카이브 관련 상태
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [archivedClasses, setArchivedClasses] = useState<any[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  // 아카이브 모달 내 탭: 아카이브함 / 종료된 학급
  const [archiveModalTab, setArchiveModalTab] = useState<'archived' | 'closed'>('archived');

  // 학교 프로젝트 모달
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);

  // 담임반 연동 과목 클래스 목록
  const [linkedClasses, setLinkedClasses] = useState<any[]>([]);

  // 학교 그룹 관련 상태
  const [isSchoolModalOpen, setIsSchoolModalOpen] = useState(false);
  const [schools, setSchools] = useState<any[]>([]);
  const [schoolsLoading, setSchoolsLoading] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [schoolCreating, setSchoolCreating] = useState(false);
  const [schoolCopiedId, setSchoolCopiedId] = useState<string | null>(null);
  const [schoolCodeCopiedId, setSchoolCodeCopiedId] = useState<string | null>(null);
  const [assigningClassId, setAssigningClassId] = useState<string | null>(null);
  const [editingSchoolId, setEditingSchoolId] = useState<string | null>(null);
  const [editingSchoolName, setEditingSchoolName] = useState('');
  const [schoolUpdating, setSchoolUpdating] = useState(false);
  const [deletingSchoolId, setDeletingSchoolId] = useState<string | null>(null);
  
  
  // 정렬 상태
  type SortKey = 'name' | 'number' | 'created_at' | 'activity_time';
  const [sortConfig, setSortConfig] = useState<{ key: SortKey, direction: 'asc' | 'desc' }>({ key: 'number', direction: 'asc' });

  // 실시간 모니터링 상태
  const [realtimeToasts, setRealtimeToasts] = useState<{id: string; msg: string}[]>([]);
  const [statsRefreshKey, setStatsRefreshKey] = useState(0);
  
  // QR 코드 모달 상태
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [isTeacherShareQRModalOpen, setIsTeacherShareQRModalOpen] = useState(false);
  const [isStudentPreviewOpen, setIsStudentPreviewOpen] = useState(false);

  // AI 인사이트 모달 상태
  const [isAIReportOpen, setIsAIReportOpen] = useState(false);
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [aiChatFocusStudentId, setAiChatFocusStudentId] = useState<string | null>(null);

  // 학생 명단 관리 모달 상태
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [newStudentData, setNewStudentData] = useState({ name: '', number: '' });
  const [bulkNames, setBulkNames] = useState('');
  const [registerMode, setRegisterMode] = useState<'bulk' | 'single'>('bulk');

  // 수업 자료 관리 상태
  const [isResourceModalOpen, setIsResourceModalOpen] = useState(false);
  const [classMaterials, setClassMaterials] = useState<any[]>([]);
  // 학생 페이지에 공개된 학습 도구 (class_enabled_tools) - key: tool_id
  const [enabledTools, setEnabledTools] = useState<Record<string, boolean>>({});
  const [togglingToolId, setTogglingToolId] = useState<string | null>(null);
  // 서브클래스의 부모 weekly_plan (수업 자료실 모달에서 사용)
  const [parentWeeklyPlan, setParentWeeklyPlan] = useState<any[]>([]);
  const [fullscreenMaterial, setFullscreenMaterial] = useState<{ title: string; content: string; weekNumber?: number; activity_urls?: ActivityLink[] } | null>(null);
  // 발표 화면에서 "이전/다음 주차"로 바로 이동할 수 있도록 — weekly_plan 중 자료 에디터(class_materials)에
  // 연결된 주차만 모아 정렬. content는 fetchResources에서 이미 함께 불러와두므로 추가 API 호출 없이 즉시 전환 가능.
  const weekNavList = useMemo(() => {
    const effectivePlan: any[] = classInfo?.parent_class_id ? parentWeeklyPlan : (classInfo?.weekly_plan || []);
    return effectivePlan
      .filter((p: any) => p.material_id)
      .map((p: any) => {
        const mat = classMaterials.find((m: any) => m.id === p.material_id);
        return {
          week: p.week as number,
          title: (mat?.title as string) || `${p.week}주차`,
          content: (mat?.content as string) ?? null,
          activity_urls: mat?.activity_urls as ActivityLink[] | undefined,
        };
      })
      .filter((w: any) => w.content !== null)
      .sort((a: any, b: any) => a.week - b.week);
  }, [classInfo, parentWeeklyPlan, classMaterials]);

  const handleNavigateWeek = (week: number) => {
    const target = weekNavList.find((w: any) => w.week === week);
    if (!target) return;
    setFullscreenMaterial({ title: target.title, content: target.content, weekNumber: week, activity_urls: target.activity_urls });
  };

  // 학급정보 수정 팝업에서 에디터 자료 선택용
  const [editingClassMaterials, setEditingClassMaterials] = useState<any[]>([]);
  const [editingClassSurveyForms, setEditingClassSurveyForms] = useState<{ id: string; title: string }[]>([]);
  const [materialDropdownIdx, setMaterialDropdownIdx] = useState<number | null>(null);
  // 일반 자료 관리 상태
  const [generalMaterials, setGeneralMaterials] = useState<any[]>([]);
  const [showAddGeneralForm, setShowAddGeneralForm] = useState(false);
  const [generalMatForm, setGeneralMatForm] = useState<{ title: string; type: 'link' | 'file'; url: string; file: File | null }>({ title: '', type: 'link', url: '', file: null });
  const [generalMatUploading, setGeneralMatUploading] = useState(false);
  const [deletingGeneralMatId, setDeletingGeneralMatId] = useState<string | null>(null);
  const [editingGeneralMatId, setEditingGeneralMatId] = useState<string | null>(null);
  const [showEditorMatPicker, setShowEditorMatPicker] = useState(false);
  const [togglingEditorMatId, setTogglingEditorMatId] = useState<string | null>(null);
  // 자료 에디터 목록에서 주차별 자료에 이미 연결된 항목을 접어서 보여줄지 여부 (기본 접힘)
  const [showLinkedEditorMats, setShowLinkedEditorMats] = useState(false);
  const [deletingEditorMatId, setDeletingEditorMatId] = useState<string | null>(null);

  // 공지사항 상태
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [announcementLoading, setAnnouncementLoading] = useState(false);
  const [announcementForm, setAnnouncementForm] = useState({ title: '', content: '' });
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);
  const [deletingAnnouncementId, setDeletingAnnouncementId] = useState<string | null>(null);
  const [pinningAnnouncementId, setPinningAnnouncementId] = useState<string | null>(null);
  const [togglingVisibilityId, setTogglingVisibilityId] = useState<string | null>(null);

  // 선생님 전용 자료 상태
  const [privateMatList, setPrivateMatList] = useState<any[]>([]);
  const [privateMatLoading, setPrivateMatLoading] = useState(false);
  const [privateMatForm, setPrivateMatForm] = useState<{ title: string; content: string; type: 'note' | 'link' | 'file' | 'material'; url: string; file: File | null; materialId: string | null }>({ title: '', content: '', type: 'note', url: '', file: null, materialId: null });
  const [showPrivateMatForm, setShowPrivateMatForm] = useState(false);
  const [savingPrivateMat, setSavingPrivateMat] = useState(false);
  const [deletingPrivateMatId, setDeletingPrivateMatId] = useState<string | null>(null);
  const [editingPrivateMatId, setEditingPrivateMatId] = useState<string | null>(null);
  const [selectedPrivateMat, setSelectedPrivateMat] = useState<any | null>(null);
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);
  const [openingPrivateMatId, setOpeningPrivateMatId] = useState<string | null>(null);

  // 학생 선택 및 드로어 상태
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [detailedStudentId, setDetailedStudentId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // 전체화면 뷰어 — body/html 스크롤 잠금
  useEffect(() => {
    if (fullscreenMaterial) {
      const prev = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      return () => {
        document.documentElement.style.overflow = prev;
        document.body.style.overflow = '';
      };
    }
  }, [fullscreenMaterial]);

  // 토스트 알림 헬퍼
  const showToast = (msg: string) => {
    const id = Date.now().toString();
    setRealtimeToasts(prev => [...prev, { id, msg }]);
    setTimeout(() => setRealtimeToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  useEffect(() => {
    if (user) {
      fetchClasses();
      setSelectedStudentIds([]);
    }
  }, [user]);

  // Cmd+K / Ctrl+K 전체 검색 단축키
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsGlobalSearchOpen(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // activeClassId가 바뀔 때마다 URL + localStorage에 동기화 → 페이지 재진입 시 선택 클래스 복원
  useEffect(() => {
    if (activeClassId) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set('id', activeClassId);
        return next;
      }, { replace: true });
      localStorage.setItem('teacher_last_class_id', activeClassId);
    }
  }, [activeClassId]);

  // activeTab이 바뀔 때마다 URL tab= 파라미터 동기화 → 페이지 재진입 시 탭 복원
  useEffect(() => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (activeTab === 'list') {
        next.delete('tab');
      } else {
        next.set('tab', activeTab);
      }
      return next;
    }, { replace: true });
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'teacher_materials' && activeClassId) {
      fetchPrivateMaterials(activeClassId);
    }
  }, [activeTab, activeClassId]);

  // 알림 바로가기: 이미 해당 클래스룸에 있는 경우 → 커스텀 이벤트로 직접 drawer 오픈
  useEffect(() => {
    const openFromStorage = () => {
      const raw = sessionStorage.getItem('notif_open_student');
      if (!raw) return;
      try {
        const { studentId } = JSON.parse(raw);
        sessionStorage.removeItem('notif_open_student');
        if (!studentId) return;
        setDetailedStudentId(studentId);
        setIsDrawerOpen(true);
      } catch (_e) {
        sessionStorage.removeItem('notif_open_student');
      }
    };

    window.addEventListener('notif_open_student', openFromStorage);
    return () => window.removeEventListener('notif_open_student', openFromStorage);
  }, []);

  // 알림 바로가기: 다른 페이지/클래스에서 navigate로 진입한 경우 → location.key 변화로 처리
  useEffect(() => {
    const raw = sessionStorage.getItem('notif_open_student');
    if (!raw) return;

    try {
      const { studentId, classId } = JSON.parse(raw);
      sessionStorage.removeItem('notif_open_student');

      if (!studentId) return;

      if (classId && classId !== activeClassId) {
        setActiveClassId(classId);
      }
      setDetailedStudentId(studentId);
      setIsDrawerOpen(true);
    } catch (_e) {
      sessionStorage.removeItem('notif_open_student');
    }
  }, [location.key]);

  // AI 코파일럿 '학급 관리' 탭에서 학급을 생성한 뒤 딥링크로 진입한 경우 → 학급 설정(수정) 모달 자동 오픈
  // (location.state는 activeClassId 동기화 useEffect의 setSearchParams(replace)로 인해 유실될 수 있어 sessionStorage 사용)
  useEffect(() => {
    const openClassSettingsId = sessionStorage.getItem('notif_open_class_settings');
    if (!openClassSettingsId) return;
    const target = classes.find(c => c.id === openClassSettingsId);
    if (!target) return;
    sessionStorage.removeItem('notif_open_class_settings');
    handleOpenEditClass(target);
  }, [classes]);

  // 알림에서 student_id URL 파라미터로 진입한 경우 (하위 호환)
  useEffect(() => {
    const studentId = searchParams.get('student_id');
    if (!studentId) return;

    const urlClassId = searchParams.get('id');
    if (urlClassId && urlClassId !== activeClassId) {
      setActiveClassId(urlClassId);
    }

    setDetailedStudentId(studentId);
    setIsDrawerOpen(true);

    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('student_id');
      return next;
    }, { replace: true });
  }, [searchParams.get('student_id')]);

  useEffect(() => {
    const importId = searchParams.get('importId');
    const importName = searchParams.get('name');
    if (importId && importName) {
      setNewClassData(prev => ({
        ...prev,
        name: importName,
        class_type: 'subject',
      }));
      setIsCreateModalOpen(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [searchParams]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isUpdateModalOpen) { setIsUpdateModalOpen(false); setEditModalTab('basic'); }
      else if (isCreateModalOpen) { setIsCreateModalOpen(false); }
      else if (isQRModalOpen) { setIsQRModalOpen(false); }
      else if (isTeacherShareQRModalOpen) { setIsTeacherShareQRModalOpen(false); }
      else if (isStudentModalOpen) { setIsStudentModalOpen(false); }
      else if (isArchiveModalOpen) { setIsArchiveModalOpen(false); }
      else if (isResourceModalOpen) { setIsResourceModalOpen(false); setShowAddGeneralForm(false); }
      else if (isSchoolModalOpen) { setIsSchoolModalOpen(false); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isUpdateModalOpen, isCreateModalOpen, isQRModalOpen, isTeacherShareQRModalOpen, isStudentModalOpen, isArchiveModalOpen, isResourceModalOpen, isSchoolModalOpen]);

  // 서브클래스의 부모 weekly_plan 로드 (수업 자료실 모달용)
  const loadParentWeeklyPlan = async (parentClassId: string) => {
    try {
      const { data } = await supabase.from('classes').select('weekly_plan').eq('id', parentClassId).single();
      setParentWeeklyPlan(data?.weekly_plan || []);
    } catch (_e) {
      setParentWeeklyPlan([]);
    }
  };

  useEffect(() => {
    const handleClassActivation = async () => {
      if (!activeClassId) return;

      const currentLocalClass = classes.find(c => c.id === activeClassId);
      if (currentLocalClass) {
        setClassInfo(currentLocalClass);
        if (currentLocalClass.parent_class_id) {
          loadParentWeeklyPlan(currentLocalClass.parent_class_id);
        } else {
          setParentWeeklyPlan([]);
        }
        fetchStudents(activeClassId);
        loadGroupMap(activeClassId);
      } else {
        // 내 학급 목록에 없는 경우 직접 fetch
        try {
          const { data, error } = await supabase
            .from('classes')
            .select('*')
            .eq('id', activeClassId)
            .single();

          if (error) throw error;
          if (data) {
            setClassInfo(data);
            if (data.parent_class_id) {
              loadParentWeeklyPlan(data.parent_class_id);
            } else {
              setParentWeeklyPlan([]);
            }
            fetchStudents(activeClassId);
          }
        } catch (err) {
          console.error('Error fetching external class:', err);
        }
      }
    };

    handleClassActivation();
  }, [activeClassId, classes]);

  // 담임반 → 연동 과목 클래스 fetch
  useEffect(() => {
    if (!classInfo?.id || classInfo.class_type !== 'homeroom' || !classInfo.school_project_id) {
      setLinkedClasses([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('classes')
        .select('id, name, subject, teacher_id, assigned_teacher_id')
        .eq('school_project_id', classInfo.school_project_id)
        .not('parent_class_id', 'is', null);
      setLinkedClasses(data || []);
    })();
  }, [classInfo?.id, classInfo?.school_project_id]);

  // 실시간 모니터링 구독
  useEffect(() => {
    if (!activeClassId) return;

    const channel = supabase
      .channel(`classroom-monitor-${activeClassId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'observations'
      }, async (payload: any) => {
        const { data: studentData } = await supabase
          .from('students')
          .select('full_name, class_id')
          .eq('id', payload.new.student_id)
          .single();

        const studentName = studentData?.full_name || '학생';
        showToast(`📝 ${studentName}이(가) "${payload.new.activity_name}" 활동을 제출했습니다!`);
        fetchStudents(activeClassId);
        setStatsRefreshKey(k => k + 1);
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'student_results'
      }, async (payload: any) => {
        const { data: studentData } = await supabase
          .from('students')
          .select('full_name')
          .eq('id', payload.new.student_id)
          .single();

        const studentName = studentData?.full_name || '학생';
        const title = payload.new.title || `${payload.new.week_number}주차 결과물`;
        showToast(`📎 ${studentName}이(가) "${title}"을(를) 제출했습니다!`);
        setStatsRefreshKey(k => k + 1);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeClassId]);

  useEffect(() => {
    if (!boardSelectedPost || boardSelectedPost._type === 'obs' || !boardSelectedPost._isGroupSub) {
      setBoardGroupModalInfo(null);
      return;
    }
    const groupId = (boardSelectedPost._group || []).find((r: any) => r.group_id)?.group_id;
    const fetchGroupInfo = async () => {
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
    fetchGroupInfo();
  }, [boardSelectedPost]);

  const fetchClasses = async () => {
    try {
      setLoading(true);
      // 직접 만든 클래스 + 학교 프로젝트에서 담당으로 지정된 하위 반 클래스 모두 포함
      const { data: ownData, error } = await supabase
        .from('classes').select('*').eq('teacher_id', user?.id).eq('is_archived', false).order('created_at', { ascending: false });

      if (error) throw error;

      // assigned_teacher_id 컬럼이 아직 없을 수 있으므로 별도로 시도하고 실패 시 무시
      let assignedData: any[] = [];
      try {
        const { data: ad } = await supabase
          .from('classes').select('*').eq('assigned_teacher_id', user?.id).eq('is_archived', false).order('created_at', { ascending: false });
        assignedData = ad || [];
      } catch (_e) { /* 컬럼 미존재 시 무시 */ }

      const seen = new Set<string>();
      const combined = [...(ownData || []), ...assignedData].filter(c => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      });

      // 데모 교사 계정은 여러 방문자가 동시에 공유하므로, 현재 방문자가 방금 발급받은
      // 학급(URL의 ?id=)만 보이도록 좁힌다. 그렇지 않으면 다른 방문자의 체험 학급까지 노출된다.
      const classData = isDemoTeacher(user)
        ? combined.filter(c => c.id === activeClassId)
        : combined;
      setClasses(classData);
      
      if (classData.length > 0) {
        if (!activeClassId) {
          // URL 파라미터도 없고 현재 선택된 것도 없으면 첫 번째 학급 선택
          setActiveClassId(classData[0].id);
        } else {
          // 이미 activeClassId가 있다면(URL에서 왔거나 기존 선택) 데이터만 갱신
          const active = classData.find(c => c.id === activeClassId);
          if (active) {
            setClassInfo(active);
          } else {
            // 만약 URL로 넘어온 ID가 유효하지 않으면 첫 번째로 폴백
            setActiveClassId(classData[0].id);
          }
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error('Error fetching classes:', error);
      setLoading(false);
    }
  };


  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    // 데모 체험 계정은 방문자마다 공유되므로, 새로 만든 학급은 자동 삭제 대상에 포함되지 않아
    // 계정에 영구적으로 쌓이게 된다. 새 학급 생성 자체를 막고 가입을 안내한다.
    if (isDemoTeacher(user)) {
      setIsCreateModalOpen(false);
      showToast('체험 계정에서는 새 학급을 만들 수 없어요. 무료로 가입하면 나만의 학급을 만들 수 있어요!');
      return;
    }
    const isSubjectRequired = newClassData.class_type === 'subject';
    if (!newClassData.name || (isSubjectRequired && !newClassData.subject) || !user) return;
    if (!newClassData.start_date || !newClassData.end_date) return;

    // 플랜별 클래스 수 제한 (admin만 무제한)
    if (profile?.plan !== 'admin') {
      const classLimit = getClassLimit(profile);
      const { count } = await supabase
        .from('classes')
        .select('*', { count: 'exact', head: true })
        .eq('teacher_id', user.id);
      if ((count ?? 0) >= classLimit) {
        setIsCreateModalOpen(false);
        setUpgradeModalReason('class_limit');
        return;
      }
    }

    const entryCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    try {
      const { data, error } = await supabase
        .from('classes')
        .insert({
          teacher_id: user.id,
          name: newClassData.name,
          subject: newClassData.class_type === 'homeroom' ? '담임' : newClassData.subject,
          class_type: newClassData.class_type,
          student_guide_prompt: newClassData.student_guide_prompt || '수업 시간에 배운 내용과 본인의 활동 역할을 구체적으로 작성하세요. 단답형이나 단순 감상평은 지양해 주세요. 의미없이 반복되는 문장이나 맥락상 전혀 이해 할 수 없는 아무 의미없는 내용을 작성하는 것도 지양해 주세요. 글의 일부에라도 같은 글자·자음·모음이 의미 없이 반복되는 부분이 있다면, 앞부분에 정상적인 내용이 있더라도 반드시 반려 처리해 주세요.',
          teacher_report_prompt: newClassData.teacher_report_prompt || '교육부 기재 요령을 준수하여 사실 기반의 객관적인 문체(~함, ~임)로 작성해줘. 학생의 개별적인 성취가 잘 드러나야 해.',
          min_obs_chars: newClassData.min_obs_chars || 0,
          blocked_keywords: newClassData.blocked_keywords || [],
          ai_review_enabled: newClassData.ai_review_enabled ?? true,
          weekly_plan: newClassData.weekly_plan.filter((item: any) => item.topic.trim()),
          entry_code: entryCode,
          start_date: newClassData.start_date || null,
          end_date: newClassData.end_date || null,
          class_start_time: newClassData.class_start_time || null,
          class_end_time: newClassData.class_end_time || null,
          end_alarm_minutes: newClassData.end_alarm_minutes || [],
          break_times: (newClassData.break_times || []).filter((t) => t),
          schedule_mode: newClassData.schedule_mode,
          class_days_of_week: newClassData.class_days_of_week || [],
          class_specific_dates: (newClassData.class_specific_dates || []).filter((d) => d)
        })
        .select()
        .single();

      if (error) throw error;

      setIsCreateModalOpen(false);
      setNewClassData({
        name: '',
        subject: '',
        class_type: 'subject',
        student_guide_prompt: '',
        teacher_report_prompt: '',
        weekly_plan: [{ week: 1, topic: '', url: '', requires_result: true, requires_activity: true }],
        min_obs_chars: 0,
        blocked_keywords: [],
        ai_review_enabled: true,
        start_date: '',
        end_date: '',
        class_start_time: '',
        class_end_time: '',
        end_alarm_minutes: [],
        break_times: [],
        schedule_mode: null,
        class_days_of_week: [],
        class_specific_dates: [],
      });
      await fetchClasses();
      if (data) setActiveClassId(data.id);
      showToast("학급이 성공적으로 생성되었습니다. ✨");
    } catch (error: any) {
      console.error('Error creating class:', error);
      if (typeof error?.message === 'string' && error.message.includes('CLASS_LIMIT_EXCEEDED')) {
        setUpgradeModalReason('class_limit');
      } else {
        showToast("학급 생성 중 오류가 발생했습니다.");
      }
    }
  };

  const handleUpdateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    const isSubjectRequired = updateClassData?.class_type === 'subject';
    if (!updateClassData?.name || (isSubjectRequired && !updateClassData?.subject) || !user) return;

    // 하위 클래스에 공통 적용할 설정값
    const sharedSettings = {
      student_guide_prompt: updateClassData.student_guide_prompt,
      teacher_report_prompt: updateClassData.teacher_report_prompt,
      min_obs_chars: updateClassData.min_obs_chars || 0,
      blocked_keywords: updateClassData.blocked_keywords || [],
      ai_review_enabled: updateClassData.ai_review_enabled ?? true,
      show_learning_journey: updateClassData.show_learning_journey ?? true,
      show_attendance_summary: updateClassData.show_attendance_summary ?? true,
      start_date: updateClassData.start_date || null,
      end_date: updateClassData.end_date || null,
      is_closed: updateClassData.is_closed ?? false,
      class_start_time: updateClassData.class_start_time || null,
      class_end_time: updateClassData.class_end_time || null,
      end_alarm_minutes: updateClassData.end_alarm_minutes || [],
      break_times: (updateClassData.break_times || []).filter((t: string) => t),
      schedule_mode: updateClassData.schedule_mode || null,
      class_days_of_week: updateClassData.class_days_of_week || [],
      class_specific_dates: (updateClassData.class_specific_dates || []).filter((d: string) => d),
    };

    try {
      const { error } = await supabase
        .from('classes')
        .update({
          name: updateClassData.name,
          subject: updateClassData.subject,
          weekly_plan: updateClassData.weekly_plan || [],
          shared_survey_form_id: updateClassData.shared_survey_form_id || null,
          ...sharedSettings,
        })
        .eq('id', updateClassData.id);

      if (error) throw error;

      // 클래스명이 바뀌었으면 협업보드 세션 class_name도 동기화
      await supabase.from('class_board_sessions')
        .update({ class_name: updateClassData.name })
        .eq('class_id', updateClassData.id);

      // 학교 프로젝트 부모 클래스이면 하위 클래스 전체에 공통 설정 cascade
      if (updateClassData.school_project_id && !updateClassData.parent_class_id) {
        await supabase.from('classes').update(sharedSettings).eq('parent_class_id', updateClassData.id);
      }

      setIsUpdateModalOpen(false);
      setUpdateClassData(null);
      setEditingClassMaterials([]);
      setMaterialDropdownIdx(null);
      await fetchClasses();
      showToast("학급 정보가 성공적으로 수정되었습니다. 💾");
    } catch (error) {
      console.error('Error updating class:', error);
      showToast("학급 수정 중 오류가 발생했습니다.");
    }
  };

  // 오늘 날짜(YYYY-MM-DD) 및 학급 종료 여부(수동 종료 또는 종료일 경과) 판정
  const getTodayStr = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };
  const isClassClosed = (c: any) => !!c.is_closed || (!!c.end_date && c.end_date < getTodayStr());

  // 학급 설정(수정) 모달 열기 — ClassSelector와 종료된 학급 탭에서 공용으로 사용
  const handleOpenEditClass = async (c: any) => {
    setUpdateClassData(c);
    setBreakGenEdit(DEFAULT_BREAK_GEN);
    setIsUpdateModalOpen(true);
    setMaterialDropdownIdx(null);
    setIsArchiveModalOpen(false);
    const { data } = await supabase
      .from('class_materials')
      .select('id, week_number, title')
      .eq('class_id', c.id)
      .order('week_number', { ascending: true });
    setEditingClassMaterials(data || []);
    const { data: forms } = await supabase
      .from('survey_forms')
      .select('id, title')
      .eq('class_id', c.id)
      .order('created_at', { ascending: false });
    setEditingClassSurveyForms(forms || []);
  };

  const handleToggleClassClosed = async (classId: string, currentIsClosed: boolean) => {
    const newState = !currentIsClosed;
    const msg = newState
      ? '수업을 종료하면 학생들은 활동기록 작성과 결과 제출을 할 수 없습니다. 수업을 종료하시겠습니까?'
      : '수업을 다시 진행 중으로 변경하시겠습니까?';
    if (!confirm(msg)) return;
    try {
      const { error } = await supabase.from('classes').update({ is_closed: newState }).eq('id', classId);
      if (error) throw error;
      await fetchClasses();
      showToast(newState ? '수업이 종료되었습니다.' : '수업이 재개되었습니다.');
    } catch (_e) {
      showToast('상태 변경 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteClass = async (id: string) => {
    if (!confirm('정말 이 학급을 삭제하시겠습니까? 삭제된 학급은 아카이브함으로 이동하며, 언제든지 복원할 수 있습니다.')) return;
    
    try {
      const { error } = await supabase
        .from('classes')
        .update({ is_archived: true })
        .eq('id', id);

      if (error) throw error;
      
      showToast("학급이 아카이브함으로 이동되었습니다. 📦");
      
      // 만약 삭제한 학급이 현재 활성화된 학급이면 다른 학급으로 전환
      if (id === activeClassId) {
        const remainingClasses = classes.filter(c => c.id !== id);
        if (remainingClasses.length > 0) {
          setActiveClassId(remainingClasses[0].id);
        } else {
          setActiveClassId(null);
          setClassInfo(null);
          setStudents([]);
        }
      }
      
      await fetchClasses();
    } catch (error) {
      console.error('Error deleting class:', error);
      showToast("학급 삭제 중 오류가 발생했습니다.");
    }
  };

  const fetchArchivedClasses = async () => {
    try {
      setArchiveLoading(true);
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .eq('teacher_id', user?.id)
        .eq('is_archived', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setArchivedClasses(data || []);
    } catch (error) {
      console.error('Error fetching archived classes:', error);
    } finally {
      setArchiveLoading(false);
    }
  };

  const handleRestoreClass = async (id: string) => {
    try {
      const { error } = await supabase
        .from('classes')
        .update({ is_archived: false })
        .eq('id', id);

      if (error) throw error;
      
      showToast("학급이 복원되었습니다. ✨");
      await fetchArchivedClasses();
      await fetchClasses();
    } catch (error) {
      console.error('Error restoring class:', error);
      showToast("학급 복원 중 오류가 발생했습니다.");
    }
  };

  const handlePermanentDelete = async (id: string, name: string) => {
    if (!confirm(`"${name}" 학급을 영구적으로 삭제하시겠습니까? 이 작업은 되돌릴 수 없으며 모든 관련 데이터(학생, 기록 등)가 사라질 수 있습니다.`)) return;
    
    try {
      const { error } = await supabase
        .from('classes')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      showToast("학급이 영구적으로 삭제되었습니다.");
      await fetchArchivedClasses();
    } catch (error) {
      console.error('Error permanent deleting class:', error);
      showToast("영구 삭제 중 오류가 발생했습니다.");
    }
  };

  const handleExportCSV = () => {
    if (students.length === 0) return;
    const headers = ['이름', '번호', '태그', '최근 활동', '기록 시간'];
    const rows = students.map(s => [s.name, s.number, s.tag, s.activity, s.time]);
    const csvContent = ['\uFEFF' + headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${classInfo?.name || '학급'}_명단.csv`;
    link.click();
  };

  const loadGroupMap = async (classId: string) => {
    const { data: groups } = await supabase
      .from('class_groups')
      .select('id, name, color')
      .eq('class_id', classId)
      .eq('is_archived', false);
    if (!groups || groups.length === 0) { setGroupMap({}); return; }

    const { data: members } = await supabase
      .from('class_group_members')
      .select('group_id, student_id')
      .in('group_id', groups.map((g: any) => g.id));

    const map: Record<string, { name: string; color: string }> = {};
    (members || []).forEach((m: any) => {
      const g = groups.find((g: any) => g.id === m.group_id);
      if (g) map[m.student_id] = { name: g.name, color: g.color };
    });
    setGroupMap(map);
  };

  const fetchStudents = async (classId: string) => {
    if (!classInfo) setLoading(true);

    const targetClassId = classId;

    try {
      // 1. 학생 명단 조회
      let query = supabase
        .from('students')
        .select(`
          id,
          full_name,
          student_number,
          tag,
          avatar_url,
          created_at,
          memo,
          pin,
          observations(id, student_id, content, activity_name, created_at, teacher_id, status),
          reports(is_published)
        `)
        .eq('class_id', targetClassId);

      const { data, error } = await query.order('full_name');

      if (error) throw error;

      if (data) {
        const formattedStudents = data.map(s => {
          const latestObs = s.observations && s.observations.length > 0 
            ? [...s.observations].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
            : null;
          
          const report = s.reports && s.reports.length > 0 ? s.reports[0] : null;

          return {
            id: s.id,
            name: s.full_name,
            number: s.student_number || '-',
            tag: s.tag === '일반' ? '학생' : (s.tag || '학생'),
            memo: s.memo || '',
            pin: s.pin || null,
            avatar: s.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(s.full_name)}&background=random`,
            activity: latestObs ? latestObs.activity_name : '기록 없음',
            time: latestObs ? new Date(latestObs.created_at).toLocaleDateString('ko-KR') : '-',
            status: report ? (report.is_published ? '발행됨' : '초안 완료') : (s.observations && s.observations.length > 0 ? '기록 제출됨' : '미작성'),
            created_at: new Date(s.created_at).getTime(),
            activity_time: latestObs ? new Date(latestObs.created_at).getTime() : 0,
            all_observations: s.observations || [],
            // teacher_id 필터: 다른 선생님(예: 담임)의 pending 기록이 과목선생님 승인 대기 카운트에 포함되지 않도록
            pending_obs_ids: (s.observations || []).filter((o: any) => o.status === 'pending' && o.teacher_id === user?.id).map((o: any) => o.id),
            has_rejected: (s.observations || []).some((o: any) => o.status === 'rejected')
          };
        });
        setStudents(formattedStudents);
      }
    } catch (error) {
      console.error('Error fetching students:', error);
    } finally {
      setLoading(false);
    }
  };


  const handleCopyLink = () => {
    if (classInfo?.entry_code) {
      const url = `${window.location.origin}/classroom-entry?code=${classInfo.entry_code}`;
      navigator.clipboard.writeText(url);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
      showToast('🔗 학생 입장 링크가 복사되었습니다.');
    }
  };

  const handleShareTeacher = () => {
    if (!activeClassId) return;
    const url = `${window.location.origin}/share/${activeClassId}`;
    navigator.clipboard.writeText(url);
    setShareTeacherSuccess(true);
    setTimeout(() => setShareTeacherSuccess(false), 2000);
    showToast('📋 학교 선생님 공유 링크가 복사되었습니다.');
  };

  const fetchSchools = async () => {
    if (!user) return;
    setSchoolsLoading(true);
    try {
      const { data } = await supabase
        .from('schools')
        .select('id, name, entry_code, share_enabled, created_at')
        .eq('teacher_id', user.id)
        .order('created_at', { ascending: false });
      setSchools(data || []);
    } finally {
      setSchoolsLoading(false);
    }
  };

  const handleCreateSchool = async () => {
    if (!newSchoolName.trim() || !user) return;
    setSchoolCreating(true);
    try {
      const entryCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const { data, error } = await supabase
        .from('schools')
        .insert({ name: newSchoolName.trim(), teacher_id: user.id, entry_code: entryCode })
        .select()
        .single();
      if (error) throw error;
      setNewSchoolName('');
      setSchools(prev => [data, ...prev]);
      showToast(`🏫 "${data.name}" 학교 그룹이 생성되었습니다.`);
    } catch (err: any) {
      showToast('학교 그룹 생성 중 오류가 발생했습니다.');
    } finally {
      setSchoolCreating(false);
    }
  };

  const handleAssignClassToSchool = async (classId: string, schoolId: string | null) => {
    setAssigningClassId(classId);
    try {
      const { error } = await supabase
        .from('classes')
        .update({ school_id: schoolId })
        .eq('id', classId);
      if (error) throw error;
      setClasses(prev => prev.map(c => c.id === classId ? { ...c, school_id: schoolId } : c));
      showToast(schoolId ? '✅ 학급이 학교 그룹에 배정되었습니다.' : '✅ 학교 그룹 배정이 해제되었습니다.');
    } catch (err) {
      showToast('배정 중 오류가 발생했습니다.');
    } finally {
      setAssigningClassId(null);
    }
  };

  const handleCopySchoolLink = (schoolId: string) => {
    const url = `${window.location.origin}/school-share/${schoolId}`;
    navigator.clipboard.writeText(url);
    setSchoolCopiedId(schoolId);
    setTimeout(() => setSchoolCopiedId(null), 2000);
    showToast('🏫 학교 전체 공유 링크가 복사되었습니다.');
  };

  const handleCopySchoolCode = (schoolId: string, code: string) => {
    navigator.clipboard.writeText(code);
    setSchoolCodeCopiedId(schoolId);
    setTimeout(() => setSchoolCodeCopiedId(null), 2000);
    showToast('입장코드가 복사되었습니다.');
  };

  const handleUpdateSchool = async (schoolId: string) => {
    if (!editingSchoolName.trim()) return;
    setSchoolUpdating(true);
    try {
      const { error } = await supabase
        .from('schools')
        .update({ name: editingSchoolName.trim() })
        .eq('id', schoolId);
      if (error) throw error;
      setSchools(prev => prev.map(s => s.id === schoolId ? { ...s, name: editingSchoolName.trim() } : s));
      setEditingSchoolId(null);
      showToast('✅ 학교 이름이 수정되었습니다.');
    } catch (_e) {
      showToast('수정 중 오류가 발생했습니다.');
    } finally {
      setSchoolUpdating(false);
    }
  };

  const handleDeleteSchool = async (schoolId: string, schoolName: string) => {
    if (!window.confirm(`"${schoolName}" 학교 그룹을 삭제할까요?\n배정된 학급은 그룹에서 해제되지만 삭제되지는 않습니다.`)) return;
    setDeletingSchoolId(schoolId);
    try {
      const { error } = await supabase.from('schools').delete().eq('id', schoolId);
      if (error) throw error;
      setSchools(prev => prev.filter(s => s.id !== schoolId));
      setClasses(prev => prev.map(c => c.school_id === schoolId ? { ...c, school_id: null } : c));
      showToast('🗑️ 학교 그룹이 삭제되었습니다.');
    } catch (_e) {
      showToast('삭제 중 오류가 발생했습니다.');
    } finally {
      setDeletingSchoolId(null);
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClassId || !newStudentData.name) return;

    // 플랜별 학생 수 제한 체크
    const studentLimit = getStudentLimit(profile);
    if (students.length >= studentLimit) {
      alert(`현재 플랜에서는 한 클래스에 최대 ${studentLimit}명까지 등록할 수 있습니다.\n플랜을 업그레이드하면 더 많은 학생을 추가할 수 있습니다.`);
      return;
    }

    try {
      const { error } = await supabase
        .from('students')
        .insert({
          class_id: activeClassId,
          full_name: newStudentData.name,
          student_number: newStudentData.number,
          tag: '학생'
        });

      if (error) throw error;
      setNewStudentData({ name: '', number: '' });
      fetchStudents(activeClassId);
    } catch (err: any) {
      console.error('Error adding student:', err);
      if (typeof err?.message === 'string' && err.message.includes('STUDENT_LIMIT_EXCEEDED')) {
        alert(`현재 플랜에서는 한 클래스에 최대 ${studentLimit}명까지 등록할 수 있습니다.\n플랜을 업그레이드하면 더 많은 학생을 추가할 수 있습니다.`);
      }
    }
  };

  const handleEditStudent = async (id: string, number: string, name: string) => {
    if (!activeClassId) return;
    try {
      const { error } = await supabase
        .from('students')
        .update({ student_number: number || null, full_name: name })
        .eq('id', id);
      if (error) throw error;
      fetchStudents(activeClassId);
    } catch (err) {
      console.error('Error editing student:', err);
    }
  };

  const handleBulkRegister = async () => {
    if (!activeClassId || !bulkNames.trim()) return;

    const names = bulkNames.split('\n')
      .map(n => n.trim())
      .filter(n => n.length > 0);

    if (names.length === 0) return;

    // 플랜별 학생 수 제한 체크 (일괄 등록 포함)
    const studentLimit = getStudentLimit(profile);
    if (students.length + names.length > studentLimit) {
      const remaining = Math.max(0, studentLimit - students.length);
      alert(`현재 플랜에서는 한 클래스에 최대 ${studentLimit}명까지 등록할 수 있습니다.\n현재 ${students.length}명 등록 중 — ${remaining}명만 추가 가능합니다.\n플랜을 업그레이드하면 더 많은 학생을 추가할 수 있습니다.`);
      return;
    }

    try {
      const newStudents = names.map(rawText => {
        let name = rawText;
        let number = null;
        const match = rawText.match(/(\d+)번?/);
        if (match) {
          number = match[1];
          name = rawText.replace(match[0], '').trim();
          name = name.replace(/^[\s.\-]+|[\s.\-]+$/g, '');
        }

        return {
          class_id: activeClassId,
          full_name: name,
          student_number: number,
          tag: '학생'
        };
      });

      const { error } = await supabase.from('students').insert(newStudents);
      if (error) throw error;

      setBulkNames('');
      setIsStudentModalOpen(false);
      fetchStudents(activeClassId);
    } catch (err: any) {
      console.error('Error bulk registering students:', err);
      if (typeof err?.message === 'string' && err.message.includes('STUDENT_LIMIT_EXCEEDED')) {
        alert(`현재 플랜에서는 한 클래스에 최대 ${studentLimit}명까지 등록할 수 있습니다.\n플랜을 업그레이드하면 더 많은 학생을 추가할 수 있습니다.`);
      }
    }
  };

  const handleSelectStudent = (id: string) => {
    setSelectedStudentIds(prev => 
      prev.includes(id) ? prev.filter(studentId => studentId !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (isSelect: boolean) => {
    if (isSelect) {
      setSelectedStudentIds(students.map(s => s.id));
    } else {
      setSelectedStudentIds([]);
    }
  };

  const handleBulkApprove = async () => {
    const pendingIds = students.flatMap(s => s.pending_obs_ids || []);
    if (pendingIds.length === 0) {
      showToast('승인 대기 중인 활동 기록이 없습니다.');
      return;
    }
    if (!confirm(`이 반의 승인 대기 기록 ${pendingIds.length}건을 모두 승인하시겠습니까?`)) return;

    try {
      const { error } = await supabase
        .from('observations')
        .update({ status: 'approved' })
        .in('id', pendingIds);

      if (error) throw error;

      setStudents(prev => prev.map(s => ({
        ...s,
        pending_obs_ids: [],
        all_observations: s.all_observations.map((o: any) =>
          s.pending_obs_ids?.includes(o.id) ? { ...o, status: 'approved' } : o
        )
      })));

      showToast(`✅ ${pendingIds.length}건 일괄 승인 완료!`);
    } catch (err) {
      console.error(err);
      showToast('일괄 승인 중 오류가 발생했습니다.');
    }
  };

  const handleBulkDelete = async () => {
    const count = selectedStudentIds.length;
    if (count === 0) return;
    if (!confirm(`선택한 ${count}명의 학생 정보를 모두 삭제하시겠습니까? 기록된 모든 데이터가 영구적으로 사라집니다.`)) return;

    try {
      const { error } = await supabase
        .from('students')
        .delete()
        .in('id', selectedStudentIds);
      
      if (error) throw error;
      showToast(`${count}명의 학생이 성공적으로 삭제되었습니다. ✨`);
      setSelectedStudentIds([]);
      fetchStudents(activeClassId!);
    } catch (err) {
      console.error('Error bulk deleting students:', err);
      showToast('일괄 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleResetPin = async (studentId: string) => {
    if (!confirm('이 학생의 PIN을 초기화하시겠습니까? 학생이 다음 접속 시 새 PIN을 설정하게 됩니다.')) return;
    try {
      const { error } = await supabase.from('students').update({ pin: null }).eq('id', studentId);
      if (error) throw error;
      showToast('PIN이 초기화되었습니다. 🔑');
    } catch (err) {
      showToast('PIN 초기화 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteStudent = async (studentId: string, studentName: string) => {
    if (!confirm(`"${studentName}" 학생의 정보를 삭제하시겠습니까? 기록된 모든 데이터가 사라집니다.`)) return;
    try {
      const { error } = await supabase.from('students').delete().eq('id', studentId);
      if (error) throw error;
      fetchStudents(activeClassId!);
    } catch (err) {
      console.error('Error deleting student:', err);
    }
  };

  const fetchBoard = async (classId: string) => {
    setBoardLoading(true);
    try {
      const norm = (s: string) => s?.replace(/\s+/g, '').toLowerCase() || '';

      // 1. 학생 목록 + 수업 weekly_plan 병렬 조회
      const [{ data: studentList }, { data: classInfoData }] = await Promise.all([
        supabase.from('students').select('id, full_name').eq('class_id', classId),
        supabase.from('classes').select('weekly_plan, parent_class_id').eq('id', classId).single(),
      ]);
      const studentIds = (studentList || []).map((s: any) => s.id);
      const nameMap: Record<string, string> = Object.fromEntries(
        (studentList || []).map((s: any) => [s.id, s.full_name])
      );

      // 하위 클래스인 경우 부모 클래스의 weekly_plan 로드
      let resolvedWeeklyPlan: any[] = classInfoData?.weekly_plan || [];
      if (classInfoData?.parent_class_id && resolvedWeeklyPlan.length === 0) {
        const { data: parentData } = await supabase.from('classes').select('weekly_plan').eq('id', classInfoData.parent_class_id).single();
        if (parentData?.weekly_plan) resolvedWeeklyPlan = parentData.weekly_plan;
      }

      // activity_name → week_number 매핑 (weekly_plan 기반)
      const topicWeekMap: Record<string, number> = {};
      (resolvedWeeklyPlan as any[]).forEach((p: any) => {
        if (p.topic && p.week) topicWeekMap[norm(p.topic)] = Number(p.week);
      });

      if (studentIds.length === 0) { setBoardPosts([]); setBoardLoading(false); return; }

      // 2. 관찰기록 + 결과 병렬 조회 (최신 150건씩 제한)
      const [{ data: obs }, { data: results }] = await Promise.all([
        supabase
          .from('observations')
          .select('id, student_id, activity_name, content, created_at, status')
          .in('student_id', studentIds)
          .eq('is_student_record', true)
          .eq('status', 'approved')
          .order('created_at', { ascending: false })
          .limit(150),
        supabase
          .from('student_results')
          .select('id, student_id, week_number, title, text_content, storage_path, storage_paths, display_name, link_url, result_type, submission_group, is_group_submission, group_id, created_at')
          .in('student_id', studentIds)
          .order('created_at', { ascending: false })
          .limit(300),
      ]);

      // 3. student_name 매핑 + 관찰기록에 week_number 부여
      const obsPosts = (obs || []).map((o: any) => ({
        ...o,
        week_number: topicWeekMap[norm(o.activity_name)] ?? null,
        student_name: nameMap[o.student_id] || '학생',
        _type: 'obs' as const,
      }));

      // 2단계 그룹핑: 같은 제출(submission_group)을 1카드로, 조별은 group_id로 병합
      const pass1Key = (r: any): string => {
        if (r.submission_group) return r.submission_group;
        const b = Math.floor(new Date(r.created_at).getTime() / (1000 * 60 * 10));
        return `s_${r.student_id}_w_${r.week_number ?? 0}_b_${b}`;
      };
      const pass1: Record<string, any[]> = {};
      (results || []).forEach((r: any) => {
        const key = pass1Key(r);
        if (!pass1[key]) pass1[key] = [];
        pass1[key].push(r);
      });
      const groupMap: Record<string, any[]> = {};
      Object.values(pass1).forEach((group: any[]) => {
        const rep = group[0];
        const anyGroupId = group.find((r: any) => r.group_id)?.group_id;
        const anyIsGroup = group.some((r: any) => r.is_group_submission);
        let finalKey: string;
        if (anyIsGroup && anyGroupId) {
          const b = Math.floor(new Date(rep.created_at).getTime() / (1000 * 60 * 30));
          finalKey = `g_${anyGroupId}_w_${rep.week_number ?? 0}_b_${b}`;
        } else {
          finalKey = pass1Key(rep);
        }
        if (!groupMap[finalKey]) groupMap[finalKey] = [];
        groupMap[finalKey].push(...group);
      });

      const resPosts = Object.values(groupMap).map((group: any[]) => {
        const rep = group[0];
        const imageItem = group.find((r: any) => r.result_type === 'image');
        const fileItem  = group.find((r: any) => r.result_type === 'file');
        const textItem  = group.find((r: any) => r.result_type === 'text');
        const linkItem  = group.find((r: any) => r.result_type === 'link');

        let image_url: string | null = null;
        let image_original_url: string | null = null;
        let file_url: string | null = null;

        const image_urls = getResultImagePublicUrls(supabase.storage, imageItem);
        if (image_urls.length > 0) {
          image_original_url = image_urls[0];
          image_url = image_original_url;
        }
        if (fileItem?.storage_path) {
          const { data: urlData } = supabase.storage.from('student-attachments').getPublicUrl(fileItem.storage_path);
          file_url = urlData?.publicUrl || null;
        }

        const uniqueStudentIds = new Set(group.map((r: any) => r.student_id));
        const isGroupSub = group.some((r: any) => r.is_group_submission) || uniqueStudentIds.size > 1;

        return {
          ...rep,
          text_content: textItem?.text_content || null,
          link_url: linkItem?.link_url || null,
          display_name: fileItem?.display_name || rep.display_name,
          student_name: nameMap[rep.student_id] || '학생',
          image_url,
          image_original_url,
          image_urls,
          file_url,
          _type: 'result' as const,
          _group: group,
          _types: [...new Set(group.map((r: any) => r.result_type))] as string[],
          _isGroupSub: isGroupSub,
        };
      });

      // 3단계: 같은 학생 + 같은 주차 + 같은 날짜(달력 기준)에 여러 번 제출한 건을
      // 하나의 카드로 합침 — 가장 먼저 제출한 건을 대표로, 나머지는 모달에서 시간순 표시
      const dayMergeMap: Record<string, any[]> = {};
      resPosts.forEach((post: any) => {
        const d = new Date(post.created_at);
        const dayStr = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        const key = `${post.student_id}_w${post.week_number ?? 0}_${dayStr}`;
        if (!dayMergeMap[key]) dayMergeMap[key] = [];
        dayMergeMap[key].push(post);
      });
      const mergedResPosts = Object.values(dayMergeMap).map((subs: any[]) => {
        const sorted = [...subs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        return { ...sorted[0], _submissions: sorted };
      });

      setBoardPosts([...obsPosts, ...mergedResPosts].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
    } catch (err) {
      console.error('fetchBoard error:', err);
    } finally {
      setBoardLoading(false);
    }
  };

  const fetchResources = async (classId: string) => {
    try {
      // 서브클래스인 경우 부모 클래스의 자료를 사용
      const sourceId = classInfo?.parent_class_id || classId;
      const [matsRes, generalRes, toolsRes] = await Promise.all([
        supabase.from('class_materials').select('id, title, content, week_number, is_published, activity_urls').eq('class_id', sourceId).order('week_number', { ascending: true }),
        supabase.from('class_general_materials').select('*').eq('class_id', sourceId).order('created_at', { ascending: false }),
        supabase.from('class_enabled_tools').select('tool_id, is_published').eq('class_id', classId),
      ]);
      setClassMaterials(matsRes.data || []);
      setGeneralMaterials(generalRes.data || []);
      const toolMap: Record<string, boolean> = {};
      (toolsRes.data || []).forEach((t: any) => { toolMap[t.tool_id] = t.is_published; });
      setEnabledTools(toolMap);
    } catch (err) {
      console.error('Error fetching resources:', err);
    }
  };

  const handleToggleTool = async (toolId: string) => {
    if (!activeClassId) return;
    const next = !enabledTools[toolId];
    setTogglingToolId(toolId);
    try {
      const { error } = await supabase
        .from('class_enabled_tools')
        .upsert({ class_id: activeClassId, tool_id: toolId, is_published: next, updated_at: new Date().toISOString() }, { onConflict: 'class_id,tool_id' });
      if (error) throw error;
      setEnabledTools(prev => ({ ...prev, [toolId]: next }));
    } catch (err) {
      console.error('handleToggleTool error:', err);
      showToast('학습 도구 공개 설정 변경 중 오류가 발생했습니다.');
    } finally {
      setTogglingToolId(null);
    }
  };

  // 연동 학급(교과/협력 교사)의 class row는 linked_class_id로 원본 담임 학급을 가리킴 —
  // 학생은 담임반 입장코드로 로그인하므로, 공지도 항상 담임반 id 기준으로 저장/조회해야 학생 화면에 보임
  const resolveClassId = (classId: string | null) => {
    if (!classId) return classId;
    const cls = classes.find(c => c.id === classId);
    return cls?.linked_class_id || classId;
  };

  const fetchAnnouncements = async (classId: string) => {
    setAnnouncementLoading(true);
    try {
      const { data } = await supabase
        .from('class_announcements')
        .select('*')
        .eq('class_id', resolveClassId(classId))
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });
      setAnnouncements(data || []);
    } catch (err) {
      console.error('fetchAnnouncements error:', err);
    } finally {
      setAnnouncementLoading(false);
    }
  };

  const handleAddAnnouncement = async () => {
    if (!activeClassId || !user) return;
    if (!announcementForm.title.trim()) { showToast('제목을 입력해주세요.'); return; }
    setSavingAnnouncement(true);
    try {
      const { error } = await supabase.from('class_announcements').insert({
        class_id: resolveClassId(activeClassId),
        teacher_id: user.id,
        title: announcementForm.title.trim(),
        content: announcementForm.content.trim(),
        is_pinned: false,
      });
      if (error) throw error;
      setAnnouncementForm({ title: '', content: '' });
      setShowAnnouncementForm(false);
      await fetchAnnouncements(activeClassId);
      showToast('공지사항이 등록되었습니다.');
    } catch (err) {
      console.error('handleAddAnnouncement error:', err);
      showToast('등록 중 오류가 발생했습니다.');
    } finally {
      setSavingAnnouncement(false);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    if (!activeClassId) return;
    setDeletingAnnouncementId(id);
    try {
      await supabase.from('class_announcements').delete().eq('id', id);
      setAnnouncements(prev => prev.filter(a => a.id !== id));
      showToast('공지사항이 삭제되었습니다.');
    } catch {
      showToast('삭제 중 오류가 발생했습니다.');
    } finally {
      setDeletingAnnouncementId(null);
    }
  };

  const handleTogglePin = async (id: string, currentPinned: boolean) => {
    setPinningAnnouncementId(id);
    try {
      await supabase.from('class_announcements').update({ is_pinned: !currentPinned }).eq('id', id);
      if (activeClassId) await fetchAnnouncements(activeClassId);
    } catch {
      showToast('핀 변경 중 오류가 발생했습니다.');
    } finally {
      setPinningAnnouncementId(null);
    }
  };

  const handleToggleAnnouncementVisibility = async (id: string, currentVisible: boolean) => {
    setTogglingVisibilityId(id);
    try {
      await supabase.from('class_announcements').update({ is_visible: !currentVisible }).eq('id', id);
      if (activeClassId) await fetchAnnouncements(activeClassId);
      showToast(currentVisible ? '학생에게 숨겼습니다.' : '학생에게 공개했습니다.');
    } catch {
      showToast('공개 설정 변경 중 오류가 발생했습니다.');
    } finally {
      setTogglingVisibilityId(null);
    }
  };

  const fetchPrivateMaterials = async (classId: string) => {
    setPrivateMatLoading(true);
    try {
      const { data } = await supabase
        .from('teacher_private_materials')
        .select('*')
        .eq('class_id', classId)
        .order('created_at', { ascending: false });
      setPrivateMatList(data || []);
    } catch (err) {
      console.error('fetchPrivateMaterials error:', err);
    } finally {
      setPrivateMatLoading(false);
    }
  };

  const handleEditPrivateMat = (m: any) => {
    setEditingPrivateMatId(m.id);
    setPrivateMatForm({
      title: m.title || '',
      content: m.type === 'note' ? (m.content || '') : '',
      type: m.type,
      url: m.type === 'link' ? (m.url || '') : '',
      file: null,
      materialId: m.type === 'material' ? (m.material_id || null) : null,
    });
    setShowPrivateMatForm(true);
  };

  const handleSavePrivateMat = async () => {
    if (!activeClassId || !user) return;
    if (!privateMatForm.title.trim()) { showToast('제목을 입력해주세요.'); return; }
    if (privateMatForm.type === 'link' && !privateMatForm.url.trim()) { showToast('링크 URL을 입력해주세요.'); return; }
    if (privateMatForm.type === 'file' && !editingPrivateMatId && !privateMatForm.file) { showToast('파일을 선택해주세요.'); return; }
    if (privateMatForm.type === 'file' && privateMatForm.file && privateMatForm.file.size > 50 * 1024 * 1024) { showToast('파일 크기는 50MB 이하여야 합니다.'); return; }
    if (privateMatForm.type === 'material' && !privateMatForm.materialId) { showToast('자료에디터/공통자료함에서 자료를 선택해주세요.'); return; }
    setSavingPrivateMat(true);
    try {
      const editingTarget = editingPrivateMatId ? privateMatList.find(m => m.id === editingPrivateMatId) : null;
      let filePath: string | null = editingTarget?.file_path ?? null;
      let fileName: string | null = editingTarget?.file_name ?? null;
      let fileSize: number | null = editingTarget?.file_size ?? null;

      if (privateMatForm.type === 'file' && privateMatForm.file) {
        const ext = privateMatForm.file.name.split('.').pop() || '';
        const path = `private-materials/${activeClassId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('student-attachments').upload(path, privateMatForm.file);
        if (upErr) throw upErr;
        if (editingTarget?.file_path) {
          await supabase.storage.from('student-attachments').remove([editingTarget.file_path]);
        }
        filePath = path;
        fileName = privateMatForm.file.name;
        fileSize = privateMatForm.file.size;
      }

      const payload = {
        title: privateMatForm.title.trim(),
        content: privateMatForm.type === 'note' ? privateMatForm.content.trim() : '',
        type: privateMatForm.type,
        url: privateMatForm.type === 'link' ? privateMatForm.url.trim() : null,
        file_path: filePath,
        file_name: fileName,
        file_size: fileSize,
        material_id: privateMatForm.type === 'material' ? privateMatForm.materialId : null,
      };

      if (editingPrivateMatId) {
        const { error } = await supabase.from('teacher_private_materials').update(payload).eq('id', editingPrivateMatId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('teacher_private_materials').insert({
          class_id: activeClassId,
          teacher_id: user.id,
          ...payload,
        });
        if (error) throw error;
      }
      setPrivateMatForm({ title: '', content: '', type: 'note', url: '', file: null, materialId: null });
      setEditingPrivateMatId(null);
      setShowPrivateMatForm(false);
      await fetchPrivateMaterials(activeClassId);
      showToast(editingPrivateMatId ? '자료가 수정되었습니다.' : '자료가 등록되었습니다.');
    } catch (err) {
      console.error('handleSavePrivateMat error:', err);
      showToast(editingPrivateMatId ? '수정 중 오류가 발생했습니다.' : '등록 중 오류가 발생했습니다.');
    } finally {
      setSavingPrivateMat(false);
    }
  };

  const handleDeletePrivateMat = async (id: string, filePath?: string | null) => {
    setDeletingPrivateMatId(id);
    try {
      if (filePath) {
        await supabase.storage.from('student-attachments').remove([filePath]);
      }
      await supabase.from('teacher_private_materials').delete().eq('id', id);
      setPrivateMatList(prev => prev.filter(m => m.id !== id));
      if (editingPrivateMatId === id) {
        setEditingPrivateMatId(null);
        setShowPrivateMatForm(false);
        setPrivateMatForm({ title: '', content: '', type: 'note', url: '', file: null, materialId: null });
      }
      showToast('자료가 삭제되었습니다.');
    } catch {
      showToast('삭제 중 오류가 발생했습니다.');
    } finally {
      setDeletingPrivateMatId(null);
    }
  };

  // 자료에디터/공통자료함에서 가져온 자료는 원본을 실시간 조회해서 보여줌
  const handleOpenLinkedMaterial = async (privateMatId: string, materialId: string) => {
    setOpeningPrivateMatId(privateMatId);
    try {
      const { data, error } = await supabase
        .from('class_materials')
        .select('title, content, activity_urls')
        .eq('id', materialId)
        .single();
      if (error || !data) { showToast('원본 자료를 찾을 수 없습니다. 삭제되었을 수 있어요.'); return; }
      setFullscreenMaterial({ title: data.title, content: data.content || '', activity_urls: data.activity_urls });
    } catch {
      showToast('자료를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setOpeningPrivateMatId(null);
    }
  };

  // 일반 자료(링크/파일) 열기 — 수업 자료실 목록과 발표 화면 자료함 패널이 공유
  const openGeneralMaterial = async (mat: any) => {
    if (mat.type === 'link') {
      window.open(mat.url, '_blank');
      return;
    }
    const { data } = supabase.storage.from('student-attachments').getPublicUrl(mat.file_path);
    const fileName = (mat.file_name || '').toLowerCase();
    if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
      const res = await fetch(data.publicUrl);
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/html' });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    } else {
      window.open(data.publicUrl, '_blank');
    }
  };

  // 발표 화면 "자료함" 패널에 넘길 일반 자료(링크/파일) 목록 — 실제 여는 동작은 openGeneralMaterial이 담당
  const presentationResources = useMemo(() => (
    [...generalMaterials]
      .sort((a: any, b: any) => (a.title || '').localeCompare(b.title || '', 'ko', { numeric: true, sensitivity: 'base' }))
      .map((m: any) => ({
        id: m.id,
        title: m.title,
        subtitle: m.type === 'link' ? m.url : m.file_name,
        type: m.type as 'link' | 'file',
        onOpen: () => openGeneralMaterial(m),
      }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [generalMaterials]);

  const handleEditGeneralMat = (m: any) => {
    setEditingGeneralMatId(m.id);
    setGeneralMatForm({
      title: m.title || '',
      type: m.type,
      url: m.type === 'link' ? (m.url || '') : '',
      file: null,
    });
    setShowAddGeneralForm(true);
  };

  const handleAddGeneralMat = async () => {
    if (!activeClassId || !user) return;
    if (!generalMatForm.title.trim()) { showToast('제목을 입력해주세요.'); return; }
    if (generalMatForm.type === 'link' && !generalMatForm.url.trim()) { showToast('링크 URL을 입력해주세요.'); return; }
    if (generalMatForm.type === 'file' && !editingGeneralMatId && !generalMatForm.file) { showToast('파일을 선택해주세요.'); return; }
    if (generalMatForm.type === 'file' && generalMatForm.file && generalMatForm.file.size > 50 * 1024 * 1024) { showToast('파일 크기는 50MB 이하여야 합니다.'); return; }

    setGeneralMatUploading(true);
    try {
      const editingTarget = editingGeneralMatId ? generalMaterials.find(m => m.id === editingGeneralMatId) : null;
      let filePath: string | null = editingTarget?.file_path ?? null;
      let fileName: string | null = editingTarget?.file_name ?? null;
      let fileSize: number | null = editingTarget?.file_size ?? null;

      if (generalMatForm.type === 'file' && generalMatForm.file) {
        const ext = generalMatForm.file.name.split('.').pop() || '';
        const path = `general-materials/${activeClassId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('student-attachments').upload(path, generalMatForm.file);
        if (upErr) throw upErr;
        if (editingTarget?.file_path) {
          await supabase.storage.from('student-attachments').remove([editingTarget.file_path]);
        }
        filePath = path;
        fileName = generalMatForm.file.name;
        fileSize = generalMatForm.file.size;
      }

      const payload = {
        title: generalMatForm.title.trim(),
        type: generalMatForm.type,
        url: generalMatForm.type === 'link' ? generalMatForm.url.trim() : null,
        file_path: filePath,
        file_name: fileName,
        file_size: fileSize,
      };

      if (editingGeneralMatId) {
        const { error } = await supabase.from('class_general_materials').update(payload).eq('id', editingGeneralMatId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('class_general_materials').insert({
          class_id: activeClassId,
          teacher_id: user.id,
          ...payload,
          is_published: true,
        });
        if (error) throw error;
      }

      await fetchResources(activeClassId);
      setGeneralMatForm({ title: '', type: 'link', url: '', file: null });
      setEditingGeneralMatId(null);
      setShowAddGeneralForm(false);
      showToast(editingGeneralMatId ? '자료가 수정되었습니다.' : '자료가 등록되었습니다.');
    } catch (err) {
      console.error('handleAddGeneralMat error:', err);
      showToast(editingGeneralMatId ? '수정 중 오류가 발생했습니다.' : '등록 중 오류가 발생했습니다.');
    } finally {
      setGeneralMatUploading(false);
    }
  };

  const handleDeleteGeneralMat = async (id: string, filePath?: string | null) => {
    setDeletingGeneralMatId(id);
    try {
      if (filePath) {
        await supabase.storage.from('student-attachments').remove([filePath]);
      }
      await supabase.from('class_general_materials').delete().eq('id', id);
      setGeneralMaterials(prev => prev.filter(m => m.id !== id));
      if (editingGeneralMatId === id) {
        setEditingGeneralMatId(null);
        setShowAddGeneralForm(false);
        setGeneralMatForm({ title: '', type: 'link', url: '', file: null });
      }
      showToast('자료가 삭제되었습니다.');
    } catch (err) {
      console.error('handleDeleteGeneralMat error:', err);
      showToast('삭제 중 오류가 발생했습니다.');
    } finally {
      setDeletingGeneralMatId(null);
    }
  };

  const handleToggleEditorMatPublish = async (mat: any) => {
    setTogglingEditorMatId(mat.id);
    try {
      const next = !mat.is_published;
      const { error } = await supabase.from('class_materials').update({ is_published: next, updated_at: new Date().toISOString() }).eq('id', mat.id);
      if (error) throw error;
      setClassMaterials(prev => prev.map(m => m.id === mat.id ? { ...m, is_published: next } : m));
    } catch (err) {
      console.error('handleToggleEditorMatPublish error:', err);
      showToast('공개 설정 변경 중 오류가 발생했습니다.');
    } finally {
      setTogglingEditorMatId(null);
    }
  };

  const handleDeleteEditorMat = async (id: string) => {
    // 주차별 자료(weekly_plan)에 연결된 자료인지 확인 — 연결된 채로 삭제하면 주차별 자료실에서 끊어진 링크가 남는다
    const effectivePlan: any[] = classInfo?.parent_class_id ? parentWeeklyPlan : (classInfo?.weekly_plan || []);
    const linkedWeeks = effectivePlan.filter((p: any) => p.material_id === id).map((p: any) => p.week);
    if (linkedWeeks.length > 0) {
      const ok = confirm(`이 자료는 ${linkedWeeks.join(', ')}주차 주차별 자료에 연결되어 있습니다.\n삭제하면 해당 주차에서 자료를 열 수 없게 됩니다. 그래도 삭제하시겠습니까?`);
      if (!ok) return;
    }
    setDeletingEditorMatId(id);
    try {
      if (linkedWeeks.length > 0) {
        const ownerClassId = classInfo?.parent_class_id || activeClassId;
        const newPlan = effectivePlan.map((p: any) => p.material_id === id ? { ...p, material_id: '' } : p);
        const { error: planError } = await supabase.from('classes').update({ weekly_plan: newPlan }).eq('id', ownerClassId);
        if (planError) throw planError;
        if (classInfo?.parent_class_id) {
          setParentWeeklyPlan(newPlan);
        } else {
          setClassInfo((prev: any) => prev ? { ...prev, weekly_plan: newPlan } : prev);
        }
      }
      const { error } = await supabase.from('class_materials').delete().eq('id', id);
      if (error) throw error;
      setClassMaterials(prev => prev.filter(m => m.id !== id));
      showToast('자료가 삭제되었습니다.');
    } catch (err) {
      console.error('handleDeleteEditorMat error:', err);
      showToast('삭제 중 오류가 발생했습니다.');
    } finally {
      setDeletingEditorMatId(null);
    }
  };

  // ImportMaterialModal에서 선택한 자료를 이 클래스의 "자료 에디터" 자료로 추가
  // 이미 이 클래스 소속이면 공개 처리만, 다른 클래스/공통 자료함이면 복사본을 만들어 연결
  const handleImportEditorMat = async (m: ImportableMaterial) => {
    if (!activeClassId || !user) return;
    try {
      if (m.class_id === activeClassId) {
        const { error } = await supabase.from('class_materials').update({ is_published: true, updated_at: new Date().toISOString() }).eq('id', m.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('class_materials').insert({
          class_id: activeClassId,
          teacher_id: user.id,
          title: m.title,
          content: m.content,
          week_number: null,
          is_published: true,
          source_material_id: m.id,
          ai_versions: m.ai_versions ?? [],
        });
        if (error) throw error;
      }
      await fetchResources(activeClassId);
      showToast('자료가 추가되었습니다.');
    } catch (err) {
      console.error('handleImportEditorMat error:', err);
      showToast('자료를 추가하는 중 오류가 발생했습니다.');
    }
  };

  const handleSort = (key: SortKey) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedStudents = [...students].filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.number.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort((a, b) => {
    let valA = a[sortConfig.key];
    let valB = b[sortConfig.key];
    if (sortConfig.key === 'number') {
      const numA = parseInt(valA) || 0;
      const numB = parseInt(valB) || 0;
      return sortConfig.direction === 'asc' ? numA - numB : numB - numA;
    }
    if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
    if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  return (
    <>
    {fullscreenMaterial && (
      <PresentationModal
        material={fullscreenMaterial}
        onClose={() => setFullscreenMaterial(null)}
        weekNav={
          fullscreenMaterial.weekNumber != null && weekNavList.length > 1
            ? { weeks: weekNavList.map((w: any) => ({ week: w.week, title: w.title })), currentWeek: fullscreenMaterial.weekNumber, onNavigate: handleNavigateWeek }
            : undefined
        }
        resources={presentationResources}
      />
    )}
    {isDemoTeacher(user) && activeClassId && (
      <DemoModeBanner
        classId={activeClassId}
        extraAction={classInfo?.entry_code ? {
          label: '학생 화면 체험하기',
          onClick: () => {
            setDemoTourState({
              roleLabel: '🧑‍🎓 학생 시점',
              stageTitle: '학생 입장 → 활동기록 제출 → 퀴즈 참여',
              classId: activeClassId,
              entryCode: classInfo.entry_code,
            });
            navigate(`/classroom-entry?code=${classInfo.entry_code}`);
          },
        } : undefined}
      />
    )}
    <div className="flex flex-col relative bg-surface-container-low/20 rounded-[2rem] border border-white/40 shadow-2xl">
      {/* 1. 상단 학급 선택기 (기존 사이드바에서 수평형으로 전환) */}
      <ClassSelector
        classes={classes}
        activeClassId={activeClassId}
        onSelectClass={setActiveClassId}
        onCreateClass={() => {
          if (isDemoTeacher(user)) {
            showToast('체험 계정에서는 새 학급을 만들 수 없어요. 무료로 가입하면 나만의 학급을 만들 수 있어요!');
            return;
          }
          setBreakGenNew(DEFAULT_BREAK_GEN);
          setIsCreateModalOpen(true);
        }}
        schoolName={profile?.school_name || ''}
        onSchoolSettings={() => navigate('/settings')}
        onEditClass={handleOpenEditClass}
        onDeleteClass={handleDeleteClass}
        currentUserId={user?.id}
        onOpenArchive={() => {
          setArchiveModalTab('archived');
          fetchArchivedClasses();
          setIsArchiveModalOpen(true);
        }}
        onOpenClosedClasses={() => {
          setArchiveModalTab('closed');
          setIsArchiveModalOpen(true);
        }}
        closedClassesCount={classes.filter(isClassClosed).length}
      />

      {/* 2. 메인 대시보드 영역 (통합 스크롤) */}
      <main className="flex flex-col relative">
        <div className="fixed top-24 right-4 md:right-10 z-[9999] flex flex-col gap-3 pointer-events-none max-w-[calc(100vw-2rem)]">
          <AnimatePresence>
            {realtimeToasts.map((toast) => (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, x: 60, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 60, scale: 0.9 }}
                className="bg-neutral-900/90 backdrop-blur-xl text-white px-8 py-5 rounded-[1.5rem] shadow-2xl text-sm font-black flex items-center gap-4 pointer-events-auto border border-white/10"
              >
                <div className="w-2.5 h-2.5 bg-primary rounded-full animate-pulse shadow-[0_0_12px_rgba(var(--primary-rgb),0.8)]" />
                {toast.msg}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="p-4 md:p-8 lg:p-12 max-w-[1600px] mx-auto w-full">
          {/* 상단 버튼 행 */}
          <div className="flex items-center justify-between mb-4 md:mb-6">
            {/* 전체 학생 검색 버튼 */}
            {classes.length > 0 && (
              <button
                onClick={() => setIsGlobalSearchOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/80 hover:bg-white border border-neutral-200 hover:border-primary/30 text-neutral-500 hover:text-primary font-black text-xs transition-all shadow-sm group"
              >
                <Search size={14} className="group-hover:scale-110 transition-transform" />
                <span>전체 학생 검색</span>
                <span className="hidden sm:inline text-[11px] font-bold text-neutral-500 bg-neutral-100 px-1.5 py-0.5 rounded-md">⌘K</span>
              </button>
            )}
            {/* 우측 버튼 그룹 */}
            <div className="ml-auto flex items-center gap-2">
              {/* 학교 그룹 관리 버튼 */}
              <button
                onClick={() => { fetchSchools(); setIsSchoolModalOpen(true); }}
                title="담당 선생님께 공유할 수 있는 학교 단위 묶음이에요 (공유 링크 생성 가능)"
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 text-violet-600 font-black text-xs transition-all hover:scale-[1.02] active:scale-95"
              >
                <GraduationCap size={14} />
                <span className="hidden sm:inline">학교 그룹</span>
              </button>
              {/* 이동 중 브리핑 버튼 */}
              {activeClassId && (
                <button
                  onClick={() => setIsBriefingOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-600 font-black text-xs transition-all hover:scale-[1.02] active:scale-95"
                >
                  <Headphones size={14} />
                  <span className="hidden sm:inline">이동 중 브리핑</span>
                </button>
              )}
              {/* AI에게 물어보기 버튼 */}
              {activeClassId && (
                <button
                  onClick={() => { setAiChatFocusStudentId(null); setIsAIChatOpen(true); }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-primary to-primary-dim text-white font-black text-xs shadow-elevated transition-all hover:scale-[1.02] active:scale-95"
                >
                  <Sparkles size={14} />
                  <span className="hidden sm:inline">AI에게 물어보기</span>
                </button>
              )}
            </div>
          </div>

          {/* 학교 프로젝트 최상위 클래스 → 허브 뷰 */}
          {classInfo?.school_project_id && !classInfo?.parent_class_id && (
            <SchoolProjectHub
              classInfo={classInfo}
              onOpenResources={() => {
                if (activeClassId) fetchResources(activeClassId);
                setIsResourceModalOpen(true);
              }}
              onOpenProjectModal={async () => {
                if (!classInfo?.school_project_id) return;
                const { data } = await supabase
                  .from('school_projects')
                  .select('*')
                  .eq('id', classInfo.school_project_id)
                  .single();
                setEditingProject(data || null);
                setIsProjectModalOpen(true);
              }}
              onSaved={async () => {
                if (!activeClassId) return;
                const { data } = await supabase.from('classes').select('*').eq('id', activeClassId).single();
                if (data) {
                  setClassInfo(data);
                  setClasses(prev => prev.map(c => c.id === data.id ? data : c));
                }
              }}
            />
          )}

          {/* 2.1 Cohesive Segmented Control - 일반 클래스만 표시 */}
          {(!classInfo?.school_project_id || classInfo?.parent_class_id) && (
          <>
          <div className="flex justify-center mb-8 md:mb-16">
            <div className="p-1 md:p-1.5 bg-surface-container/50 backdrop-blur-xl rounded-[1.5rem] md:rounded-[1.75rem] flex items-center border border-white/40 shadow-soft relative overflow-x-auto max-w-full custom-scrollbar">
              {[
                { id: 'list', label: '전체 명단', icon: LayoutDashboard },
                { id: 'units', label: '단원 관리', icon: BookOpen },
                { id: 'attendance', label: '출석 체크', icon: ClipboardList },
                { id: 'groups', label: '조 편성', icon: Layers },
                { id: 'grading', label: '결과 일괄 채점', icon: Wand2 },
                { id: 'board', label: '우리반 보드', icon: Users2 },
                { id: 'notice', label: '공지사항', icon: Megaphone },
                { id: 'teacher_materials', label: '선생님 자료', icon: Lock },
                { id: 'ai', label: 'AI 분석 인사이트', icon: Sparkles }
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    data-tour={tab.id === 'list' ? 'tab-list' : tab.id === 'grading' ? 'tab-grading' : undefined}
                    onClick={() => {
                      setActiveTab(tab.id as 'list' | 'ai' | 'units' | 'attendance' | 'board' | 'groups' | 'notice' | 'teacher_materials' | 'grading');
                      if (tab.id === 'board' && activeClassId) fetchBoard(activeClassId);
                      if (tab.id === 'notice' && activeClassId) fetchAnnouncements(activeClassId);
                      if (tab.id === 'teacher_materials' && activeClassId) fetchPrivateMaterials(activeClassId);
                    }}
                    className={`
                      relative z-10 flex items-center gap-1.5 md:gap-3 px-4 md:px-8 py-3 md:py-4 rounded-[1.5rem] md:rounded-[1.5rem] font-black text-xs md:text-sm transition-all duration-500 whitespace-nowrap shrink-0
                      ${isActive ? 'text-surface' : 'text-on-surface-variant hover:text-on-surface hover:bg-white/30'}
                    `}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="active-pill"
                        className="absolute inset-0 bg-on-surface rounded-[1.5rem] shadow-elevated -z-10"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                    <tab.icon size={18} className={`transition-colors duration-500 ${isActive ? 'text-primary' : 'text-on-surface-variant/65'}`} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {loading && !classInfo ? (
            <DashboardSkeleton />
          ) : (
            <>
              {activeTab === 'units' && classInfo && (
                <div className="max-w-3xl mx-auto">
                  <UnitManager
                    classId={activeClassId!}
                    teacherId={user?.id || ''}
                  />
                </div>
              )}

              {activeTab === 'attendance' && classInfo && (
                <div className="max-w-4xl mx-auto">
                  <AttendanceTab classId={activeClassId!} students={sortedStudents} />
                </div>
              )}

              {activeTab === 'groups' && classInfo && (
                <div className="max-w-5xl mx-auto">
                  <GroupTab
                    classId={activeClassId!}
                    students={sortedStudents.map(s => ({ id: s.id, name: s.name, number: s.number }))}
                    onGroupsChanged={() => loadGroupMap(activeClassId!)}
                  />
                </div>
              )}

              {activeTab === 'grading' && classInfo && (
                <AutoGradingPanel
                  classId={activeClassId!}
                  teacherId={user?.id || ''}
                  weeklyPlan={classInfo.weekly_plan || []}
                  students={sortedStudents.map(s => ({ id: s.id, name: s.name, number: s.number }))}
                />
              )}

              {activeTab === 'ai' && classInfo && (
                <div className="min-h-[600px] flex flex-col items-center justify-center">
                  <AIInsightBanner
                    className={classInfo.name}
                    classId={activeClassId ?? undefined}
                    students={sortedStudents}
                    onOpenReport={() => setIsAIReportOpen(true)}
                    onOpenChat={() => { setAiChatFocusStudentId(null); setIsAIChatOpen(true); }}
                  />
                  {sortedStudents.length > 0 && (
                     <p className="mt-10 text-on-surface-variant/70 text-sm font-bold flex items-center gap-2">
                       <Sparkles size={16} /> 
                       명단 데이터를 기반으로 분석된 실시간 결과입니다.
                     </p>
                  )}
                </div>
              )}

              {activeTab === 'board' && activeClassId && (
                <div>
                  {/* 보드 헤더 */}
                  <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-indigo-100 flex items-center justify-center">
                        <Users2 size={20} className="text-indigo-600" />
                      </div>
                      <div>
                        <h2 className="text-xl font-black">우리반 보드</h2>
                        <p className="text-xs text-on-surface-variant/80 font-bold">승인된 활동 기록·결과를 한눈에</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => activeClassId && fetchBoard(activeClassId)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 font-black text-xs hover:bg-indigo-100 transition-all"
                      >
                        <RefreshCw size={13} /> 새로고침
                      </button>
                      <button
                        onClick={() => window.open(`/board/${activeClassId}`, '_blank')}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white font-black text-xs hover:bg-indigo-700 transition-all shadow-sm"
                      >
                        <Maximize2 size={13} /> 전체화면
                      </button>
                    </div>
                  </div>

                  {/* 필터 바 */}
                  <div className="flex items-center gap-3 mb-8 flex-wrap">
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
                            boardTypeFilter === f.key ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5 overflow-x-auto">
                      <button
                        onClick={() => setBoardWeekFilter('all')}
                        className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-black border transition-all ${
                          boardWeekFilter === 'all' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'
                        }`}
                      >
                        전체 주차
                      </button>
                      {Array.from(new Set(boardPosts.map(p => p.week_number).filter(Boolean))).sort((a, b) => a - b).map(w => (
                        <button
                          key={w}
                          onClick={() => setBoardWeekFilter(w)}
                          className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-black border transition-all ${
                            boardWeekFilter === w ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'
                          }`}
                        >
                          {w}주차
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 보드 콘텐츠 */}
                  {boardLoading ? (
                    <div className="flex items-center justify-center py-24">
                      <Loader2 size={32} className="animate-spin text-indigo-400" />
                    </div>
                  ) : (() => {
                    const filtered = boardPosts.filter(p => {
                      if (boardTypeFilter !== 'all' && p._type !== boardTypeFilter) return false;
                      if (boardWeekFilter !== 'all' && p.week_number !== boardWeekFilter) return false;
                      return true;
                    });
                    if (filtered.length === 0) return (
                      <div className="flex flex-col items-center py-24 space-y-4">
                        <div className="w-20 h-20 rounded-2xl bg-indigo-50 flex items-center justify-center">
                          <StickyNote size={36} className="text-indigo-200" />
                        </div>
                        <p className="font-black text-on-surface opacity-60">아직 승인된 게시물이 없어요</p>
                        <p className="text-sm text-on-surface-variant/75 font-bold">학생 제출물을 승인하면 보드에 나타납니다</p>
                      </div>
                    );
                    return (
                      <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4">
                        {filtered.map(post => {
                          const isObs = post._type === 'obs';
                          return (
                            <motion.div
                              key={`${post._type}-${post.id}`}
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              onClick={() => setBoardSelectedPost(post)}
                              className={`break-inside-avoid rounded-2xl border-2 p-5 space-y-3 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg ${
                                isObs ? 'bg-violet-50 border-violet-100 hover:border-violet-300 hover:bg-violet-50/80' : 'bg-emerald-50 border-emerald-100 hover:border-emerald-300 hover:bg-emerald-50/80'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black shrink-0 ${
                                    isObs ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'
                                  }`}>
                                    {isObs ? '📝' : '📁'}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-black truncate">{post.student_name}</p>
                                    <p className="text-xs text-on-surface-variant/80 font-bold">
                                      {post.week_number ? `${post.week_number}주차 · ` : ''}{new Date(post.created_at).toLocaleDateString('ko-KR')}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {!isObs && post._isGroupSub && (
                                    <span className="text-xs font-black px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-600">
                                      조별
                                    </span>
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
                              <div className="space-y-1.5">
                                <p className="text-sm font-black leading-snug line-clamp-2">
                                  {isObs ? post.activity_name : post.title}
                                </p>
                                {isObs && post.content && (
                                  <p className="text-xs text-on-surface-variant font-bold leading-relaxed line-clamp-4">{post.content}</p>
                                )}
                                {isObs && post.feeling && (
                                  <p className="text-xs text-on-surface-variant/75 font-bold italic line-clamp-2">💬 {post.feeling}</p>
                                )}
                                {!isObs && post.text_content && (
                                  <p className="text-xs text-on-surface-variant font-bold leading-relaxed line-clamp-4">{post.text_content}</p>
                                )}
                                {!isObs && post.image_url && (
                                  <div className="relative">
                                    <img
                                      src={post.image_url}
                                      alt=""
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
                                {!isObs && post.link_url && (
                                  <a href={post.link_url} target="_blank" rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 text-xs font-black text-blue-600 hover:underline">
                                    <ExternalLink size={11} /><span className="truncate">{post.link_url}</span>
                                  </a>
                                )}
                                {!isObs && post.file_url && (
                                  <div
                                    onClick={e => {
                                      e.stopPropagation();
                                      setViewerFile({ url: post.file_url, name: post.display_name || '파일' });
                                    }}
                                    className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-100 rounded-xl hover:bg-amber-100 transition-colors cursor-pointer"
                                  >
                                    <File size={13} className="text-amber-500 shrink-0" />
                                    <span className="text-xs font-black text-amber-700 truncate flex-1">{post.display_name || '파일'}</span>
                                    <Download size={11} className="text-amber-400 shrink-0" />
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* ─── 공지사항 탭 ─── */}
              {activeTab === 'notice' && activeClassId && (
                <div className="max-w-2xl mx-auto space-y-6">
                  {/* 헤더 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center">
                        <Megaphone size={20} className="text-amber-600" />
                      </div>
                      <div>
                        <h2 className="text-xl font-black">공지사항</h2>
                        <p className="text-xs text-on-surface-variant/70 font-bold">학생에게 전달할 공지를 작성하세요</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowAnnouncementForm(v => !v)}
                      className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-2xl text-sm font-black hover:bg-amber-600 transition-all active:scale-95 shadow-sm"
                    >
                      <Plus size={16} /> 공지 작성
                    </button>
                  </div>

                  {/* 작성 폼 */}
                  {showAnnouncementForm && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                      className="p-5 bg-amber-50 border border-amber-200 rounded-2xl space-y-3">
                      <input
                        value={announcementForm.title}
                        onChange={e => setAnnouncementForm(f => ({ ...f, title: e.target.value }))}
                        placeholder="공지 제목"
                        className="w-full px-4 py-3 rounded-2xl border border-amber-200 bg-white text-sm font-black focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder:font-normal"
                      />
                      <div className="rounded-2xl border border-amber-200 overflow-hidden bg-white">
                        <RichEditor
                          value={announcementForm.content}
                          onChange={content => setAnnouncementForm(f => ({ ...f, content }))}
                          minHeight="140px"
                          stickyToolbar={false}
                        />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => { setShowAnnouncementForm(false); setAnnouncementForm({ title: '', content: '' }); }}
                          className="px-4 py-2 rounded-xl text-sm font-black text-on-surface-variant hover:bg-amber-100 transition-all">취소</button>
                        <button onClick={handleAddAnnouncement} disabled={savingAnnouncement}
                          className="flex items-center gap-2 px-5 py-2 rounded-xl bg-amber-500 text-white text-sm font-black hover:bg-amber-600 transition-all disabled:opacity-50">
                          {savingAnnouncement ? <Loader2 size={14} className="animate-spin" /> : null}
                          등록
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* 목록 */}
                  {announcementLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 size={24} className="animate-spin text-amber-500" />
                    </div>
                  ) : announcements.length === 0 ? (
                    <div className="text-center py-16 text-on-surface-variant/40">
                      <Megaphone size={40} className="mx-auto mb-3 opacity-20" />
                      <p className="text-sm font-black">아직 공지사항이 없습니다</p>
                      <p className="text-xs mt-1">위 버튼으로 첫 공지를 작성해보세요</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {announcements.map(a => (
                        <motion.div key={a.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                          className={`p-5 rounded-2xl border-2 ${a.is_visible === false ? 'border-surface-container bg-surface-container/40 opacity-60' : a.is_pinned ? 'border-amber-400 bg-amber-50' : 'border-surface-container bg-white'}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                {a.is_pinned && (
                                  <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 bg-amber-200 text-amber-800 rounded-full">
                                    <Pin size={9} /> 고정
                                  </span>
                                )}
                                {a.is_visible === false && (
                                  <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 bg-surface-container-high text-on-surface-variant/60 rounded-full">
                                    <EyeOff size={9} /> 학생에게 숨김
                                  </span>
                                )}
                                <p className="text-sm font-black">{a.title}</p>
                              </div>
                              {a.content && (
                                <div className="mt-1">
                                  <ReactMarkdown components={announcementMdComponents} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                                    {a.content}
                                  </ReactMarkdown>
                                </div>
                              )}
                              <p className="text-[10px] text-on-surface-variant/40 font-bold mt-2">
                                {new Date(a.created_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => handleToggleAnnouncementVisibility(a.id, a.is_visible !== false)}
                                disabled={togglingVisibilityId === a.id}
                                className={`p-2 rounded-xl transition-all ${a.is_visible === false ? 'bg-surface-container text-on-surface-variant/50 hover:bg-surface-container-high' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}
                                title={a.is_visible === false ? '학생에게 공개하기' : '학생에게 숨기기'}
                              >
                                {togglingVisibilityId === a.id ? <Loader2 size={13} className="animate-spin" /> : a.is_visible === false ? <EyeOff size={13} /> : <Eye size={13} />}
                              </button>
                              <button
                                onClick={() => handleTogglePin(a.id, a.is_pinned)}
                                disabled={pinningAnnouncementId === a.id}
                                className={`p-2 rounded-xl transition-all ${a.is_pinned ? 'bg-amber-200 text-amber-700 hover:bg-amber-300' : 'bg-surface-container text-on-surface-variant/50 hover:bg-amber-100 hover:text-amber-600'}`}
                                title={a.is_pinned ? '핀 해제' : '상단 고정'}
                              >
                                {pinningAnnouncementId === a.id ? <Loader2 size={13} className="animate-spin" /> : <Pin size={13} />}
                              </button>
                              <button
                                onClick={() => handleDeleteAnnouncement(a.id)}
                                disabled={deletingAnnouncementId === a.id}
                                className="p-2 rounded-xl bg-surface-container text-on-surface-variant/40 hover:bg-red-100 hover:text-red-500 transition-all"
                                title="삭제"
                              >
                                {deletingAnnouncementId === a.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ─── 선생님 전용 자료 탭 ─── */}
              {activeTab === 'teacher_materials' && activeClassId && (
                <div className="max-w-2xl mx-auto space-y-6">
                  {/* 헤더 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-violet-100 flex items-center justify-center">
                        <Lock size={20} className="text-violet-600" />
                      </div>
                      <div>
                        <h2 className="text-xl font-black">선생님 전용 자료</h2>
                        <p className="text-xs text-on-surface-variant/70 font-bold">학생에게 보이지 않는 교사 전용 노트 · 링크</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (showPrivateMatForm && !editingPrivateMatId) {
                          setShowPrivateMatForm(false);
                        } else {
                          setEditingPrivateMatId(null);
                          setPrivateMatForm({ title: '', content: '', type: 'note', url: '', file: null, materialId: null });
                          setShowPrivateMatForm(true);
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-2xl text-sm font-black hover:bg-violet-700 transition-all active:scale-95 shadow-sm"
                    >
                      <Plus size={16} /> 자료 추가
                    </button>
                  </div>

                  {/* 작성 폼 */}
                  {showPrivateMatForm && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                      className="p-5 bg-violet-50 border border-violet-200 rounded-2xl space-y-3">
                      {editingPrivateMatId && (
                        <p className="text-xs font-black text-violet-600">자료 수정 중</p>
                      )}
                      <div className="flex gap-2">
                        {(['note', 'link', 'file', 'material'] as const).map(t => (
                          <button key={t}
                            disabled={!!editingPrivateMatId && privateMatForm.type !== t}
                            onClick={() => setPrivateMatForm(f => ({ ...f, type: t, file: null, materialId: t === 'material' ? f.materialId : null }))}
                            className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${privateMatForm.type === t ? 'bg-violet-600 text-white' : 'bg-white text-on-surface-variant border border-violet-200 hover:bg-violet-100'} ${!!editingPrivateMatId && privateMatForm.type !== t ? 'opacity-30 cursor-not-allowed hover:bg-white' : ''}`}>
                            {t === 'note' ? '📝 노트' : t === 'link' ? '🔗 링크' : t === 'file' ? '📎 파일' : '🔗 자료함'}
                          </button>
                        ))}
                      </div>
                      <input
                        value={privateMatForm.title}
                        onChange={e => setPrivateMatForm(f => ({ ...f, title: e.target.value }))}
                        placeholder="제목"
                        className="w-full px-4 py-3 rounded-2xl border border-violet-200 bg-white text-sm font-black focus:outline-none focus:ring-2 focus:ring-violet-400 placeholder:font-normal"
                      />
                      {privateMatForm.type === 'material' ? (
                        privateMatForm.materialId ? (
                          <div className="flex items-center gap-3 p-4 bg-white border border-violet-200 rounded-2xl">
                            <div className="w-9 h-9 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center shrink-0">
                              <Library size={16} />
                            </div>
                            <p className="flex-1 text-sm font-black truncate">{privateMatForm.title || '선택된 자료'}</p>
                            <button onClick={() => setShowMaterialPicker(true)}
                              className="px-3 py-1.5 rounded-xl text-xs font-black text-violet-600 hover:bg-violet-100 transition-all shrink-0">
                              다시 선택
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setShowMaterialPicker(true)}
                            className="w-full flex flex-col items-center gap-2 p-4 bg-white border-2 border-dashed border-violet-200 rounded-2xl hover:border-violet-400 transition-all"
                          >
                            <Library size={20} className="text-violet-400" />
                            <span className="text-xs font-black text-neutral-500">자료에디터 · 공통 자료함에서 선택</span>
                          </button>
                        )
                      ) : privateMatForm.type === 'note' ? (
                        <textarea
                          value={privateMatForm.content}
                          onChange={e => setPrivateMatForm(f => ({ ...f, content: e.target.value }))}
                          placeholder="노트 내용"
                          rows={5}
                          className="w-full px-4 py-3 rounded-2xl border border-violet-200 bg-white text-sm font-bold focus:outline-none focus:ring-2 focus:ring-violet-400 placeholder:font-normal resize-none"
                        />
                      ) : privateMatForm.type === 'link' ? (
                        <input
                          value={privateMatForm.url}
                          onChange={e => setPrivateMatForm(f => ({ ...f, url: e.target.value }))}
                          placeholder="https://..."
                          className="w-full px-4 py-3 rounded-2xl border border-violet-200 bg-white text-sm font-bold focus:outline-none focus:ring-2 focus:ring-violet-400 placeholder:font-normal"
                        />
                      ) : (
                        (() => {
                          const overLimit = !!privateMatForm.file && privateMatForm.file.size > 50 * 1024 * 1024;
                          const sizeMB = privateMatForm.file ? (privateMatForm.file.size / (1024 * 1024)).toFixed(1) : null;
                          const editingFileName = editingPrivateMatId ? privateMatList.find(m => m.id === editingPrivateMatId)?.file_name : null;
                          return (
                            <div className="space-y-1.5">
                              {editingFileName && !privateMatForm.file && (
                                <p className="text-[11px] font-bold text-on-surface-variant/60">현재 파일: {editingFileName} (새 파일을 선택하면 교체됩니다)</p>
                              )}
                              <label className={`flex flex-col items-center gap-2 p-4 bg-white border-2 border-dashed rounded-2xl cursor-pointer transition-all ${overLimit ? 'border-red-400 hover:border-red-500' : 'border-violet-200 hover:border-violet-400'}`}>
                                <Upload size={20} className={overLimit ? 'text-red-400' : 'text-violet-400'} />
                                <span className={`text-xs font-black ${overLimit ? 'text-red-500' : 'text-neutral-500'}`}>
                                  {privateMatForm.file ? privateMatForm.file.name : (editingFileName ? '새 파일 선택 (선택 안 하면 기존 파일 유지)' : '파일 선택 (PDF, PPT, HWP 등)')}
                                </span>
                                {sizeMB && (
                                  <span className={`text-[10px] font-bold ${overLimit ? 'text-red-500' : 'text-neutral-400'}`}>
                                    {sizeMB}MB {overLimit ? '— 50MB 초과! 더 작은 파일을 선택해주세요' : '/ 50MB'}
                                  </span>
                                )}
                                {!privateMatForm.file && !editingFileName && (
                                  <span className="text-[10px] text-neutral-300 font-bold">최대 50MB</span>
                                )}
                                <input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setPrivateMatForm(prev => ({ ...prev, file: f })); }} />
                              </label>
                            </div>
                          );
                        })()
                      )}
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => { setShowPrivateMatForm(false); setEditingPrivateMatId(null); setPrivateMatForm({ title: '', content: '', type: 'note', url: '', file: null, materialId: null }); }}
                          className="px-4 py-2 rounded-xl text-sm font-black text-on-surface-variant hover:bg-violet-100 transition-all">취소</button>
                        <button onClick={handleSavePrivateMat} disabled={savingPrivateMat || (privateMatForm.type === 'file' && !!privateMatForm.file && privateMatForm.file.size > 50 * 1024 * 1024) || (privateMatForm.type === 'material' && !privateMatForm.materialId)}
                          className="flex items-center gap-2 px-5 py-2 rounded-xl bg-violet-600 text-white text-sm font-black hover:bg-violet-700 transition-all disabled:opacity-50">
                          {savingPrivateMat ? <Loader2 size={14} className="animate-spin" /> : null}
                          {editingPrivateMatId ? '수정 완료' : '저장'}
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {showMaterialPicker && user && (
                    <ImportMaterialModal
                      userId={user.id}
                      onClose={() => setShowMaterialPicker(false)}
                      onSelect={(m: ImportableMaterial) => {
                        setPrivateMatForm(f => ({ ...f, materialId: m.id, title: f.title.trim() ? f.title : m.title }));
                      }}
                    />
                  )}

                  {/* 목록 */}
                  {privateMatLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 size={24} className="animate-spin text-violet-500" />
                    </div>
                  ) : privateMatList.length === 0 ? (
                    <div className="text-center py-16 text-on-surface-variant/40">
                      <NotebookPen size={40} className="mx-auto mb-3 opacity-20" />
                      <p className="text-sm font-black">아직 자료가 없습니다</p>
                      <p className="text-xs mt-1">위 버튼으로 첫 번째 전용 자료를 추가해보세요</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {privateMatList.map(m => (
                        <motion.div key={m.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                          className="p-5 rounded-2xl border border-violet-200 bg-white">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${m.type === 'link' ? 'bg-blue-100' : m.type === 'file' ? 'bg-amber-100' : m.type === 'material' ? 'bg-secondary/10' : 'bg-violet-100'}`}>
                                {m.type === 'link' ? <Link2 size={16} className="text-blue-600" /> : m.type === 'file' ? <File size={16} className="text-amber-600" /> : m.type === 'material' ? <Library size={16} className="text-secondary" /> : <NotebookPen size={16} className="text-violet-600" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                {m.type === 'material' ? (
                                  <button
                                    onClick={() => m.material_id && handleOpenLinkedMaterial(m.id, m.material_id)}
                                    disabled={openingPrivateMatId === m.id}
                                    className="flex items-center gap-2 text-sm font-black hover:text-secondary transition-colors truncate text-left"
                                  >
                                    {openingPrivateMatId === m.id && <Loader2 size={12} className="animate-spin shrink-0" />}
                                    {m.title}
                                  </button>
                                ) : m.type === 'file' && m.file_path ? (
                                  <button
                                    onClick={async () => {
                                      const { data } = supabase.storage.from('student-attachments').getPublicUrl(m.file_path);
                                      const fileName = (m.file_name || '').toLowerCase();
                                      if (fileName.endsWith('.html') || fileName.endsWith('.htm')) {
                                        const res = await fetch(data.publicUrl);
                                        const text = await res.text();
                                        const blob = new Blob([text], { type: 'text/html' });
                                        window.open(URL.createObjectURL(blob), '_blank');
                                      } else {
                                        window.open(data.publicUrl, '_blank');
                                      }
                                    }}
                                    className="text-sm font-black hover:text-amber-600 transition-colors truncate block text-left"
                                  >{m.title}</button>
                                ) : (
                                  <p className="text-sm font-black">{m.title}</p>
                                )}
                                {m.type === 'link' && m.url && (
                                  <a href={m.url} target="_blank" rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline mt-1 truncate">
                                    <ExternalLink size={11} />{m.url}
                                  </a>
                                )}
                                {m.type === 'file' && m.file_name && (
                                  <p className="text-[10px] text-on-surface-variant/50 mt-1 truncate">{m.file_name}</p>
                                )}
                                {m.type === 'material' && (
                                  <p className="flex items-center gap-1 text-[10px] font-bold text-secondary mt-1">
                                    <Library size={10} /> 자료에디터 · 공통자료함 연동
                                  </p>
                                )}
                                {m.type === 'note' && m.content && (
                                  <button
                                    onClick={() => setSelectedPrivateMat(selectedPrivateMat?.id === m.id ? null : m)}
                                    className="text-xs font-bold text-on-surface-variant/60 hover:text-violet-600 mt-1 transition-colors text-left">
                                    {selectedPrivateMat?.id === m.id ? '접기 ▲' : '내용 보기 ▼'}
                                  </button>
                                )}
                                {selectedPrivateMat?.id === m.id && m.type === 'note' && (
                                  <p className="text-xs font-bold text-on-surface-variant mt-2 leading-relaxed whitespace-pre-wrap p-3 bg-violet-50 rounded-xl border border-violet-100">
                                    {m.content}
                                  </p>
                                )}
                                <p className="text-[10px] text-on-surface-variant/40 font-bold mt-2">
                                  {new Date(m.created_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {m.type === 'file' && m.file_path && (
                                <button
                                  onClick={async () => {
                                    const { data } = supabase.storage.from('student-attachments').getPublicUrl(m.file_path);
                                    const res = await fetch(data.publicUrl);
                                    const blob = await res.blob();
                                    const blobUrl = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = blobUrl;
                                    a.download = m.file_name || m.title;
                                    a.click();
                                    URL.revokeObjectURL(blobUrl);
                                  }}
                                  className="p-2 rounded-xl text-amber-600 hover:bg-amber-100 transition-all"
                                  title="다운로드"
                                >
                                  <Download size={13} />
                                </button>
                              )}
                            <button
                              onClick={() => handleEditPrivateMat(m)}
                              className="p-2 rounded-xl text-on-surface-variant/40 hover:bg-violet-100 hover:text-violet-600 transition-all"
                              title="수정"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => handleDeletePrivateMat(m.id, m.file_path)}
                              disabled={deletingPrivateMatId === m.id}
                              className="p-2 rounded-xl text-on-surface-variant/40 hover:bg-red-100 hover:text-red-500 transition-all">
                              {deletingPrivateMatId === m.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                            </button>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'list' && classInfo && (() => {
                const now = new Date();
                const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                const autoClosedByDate = classInfo.end_date && classInfo.end_date < today;
                const isClosed = classInfo.is_closed || autoClosedByDate;
                return isClosed ? (
                  <div className="mb-6 flex items-center justify-between gap-4 px-6 py-4 bg-rose-50 border border-rose-200 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                        <Lock size={16} className="text-rose-500" />
                      </div>
                      <div>
                        <p className="text-sm font-black text-rose-700">수업이 종료된 학급입니다</p>
                        <p className="text-xs font-bold text-rose-400 mt-0.5">
                          {autoClosedByDate && !classInfo.is_closed
                            ? `종료일(${classInfo.end_date}) 경과로 자동 종료`
                            : '선생님이 수업 종료를 선언했습니다'}
                          · 학생의 활동기록·결과 제출이 차단됩니다.
                        </p>
                      </div>
                    </div>
                    {!autoClosedByDate && (
                      <button
                        onClick={() => handleToggleClassClosed(classInfo.id, true)}
                        className="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-white border border-rose-200 text-rose-600 rounded-xl text-xs font-black hover:bg-rose-100 transition-all"
                      >
                        <Unlock size={13} /> 수업 재개
                      </button>
                    )}
                  </div>
                ) : null;
              })()}

              {activeTab === 'list' && (
                classInfo?.class_type === 'homeroom' ? (
                  <HomeroomDashboard
                    classInfo={classInfo}
                    students={sortedStudents}
                    onInviteTeachers={async () => {
                      if (classInfo?.school_project_id) {
                        const { data } = await supabase
                          .from('school_projects')
                          .select('*')
                          .eq('id', classInfo.school_project_id)
                          .single();
                        setEditingProject(data || null);
                        setIsProjectModalOpen(true);
                      } else {
                        setUpgradeModalReason('teacher_invite');
                      }
                    }}
                    onSelectStudent={(id) => {
                      setDetailedStudentId(id);
                      setIsDrawerOpen(true);
                    }}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    copySuccess={copySuccess}
                    onCopyCode={handleCopyLink}
                    selectedIds={selectedStudentIds}
                    onSelectStudentToggle={handleSelectStudent}
                    onSelectAll={handleSelectAll}
                    onAddStudent={() => setIsStudentModalOpen(true)}
                    linkedClasses={linkedClasses}
                    onSelectClass={(id) => setActiveClassId(id)}
                    onEditStudent={handleEditStudent}
                    onDeleteStudent={(id) => handleDeleteStudent(id, students.find(s => s.id === id)?.name || '')}
                    onBulkApprove={handleBulkApprove}
                    onResetPin={handleResetPin}
                    groupMap={groupMap}
                  />
                ) : (
                  <SubjectDashboard
                    classInfo={classInfo}
                    students={sortedStudents}
                    viewMode={viewMode}
                    setViewMode={setViewMode}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    onAddStudent={() => setIsStudentModalOpen(true)}
                    onEditStudent={handleEditStudent}
                    onDeleteStudent={(id) => handleDeleteStudent(id, students.find(s => s.id === id)?.name || '')}
                    onNavigateAI={(id) => {
                      setDetailedStudentId(id);
                      setIsDrawerOpen(true);
                    }}
                    onSort={handleSort}
                    sortConfig={sortConfig}
                    selectedIds={selectedStudentIds}
                    onSelectStudent={handleSelectStudent}
                    onSelectAll={handleSelectAll}
                    onBulkApprove={handleBulkApprove}
                    onResetPin={handleResetPin}
                    groupMap={groupMap}
                    statsRefreshKey={statsRefreshKey}
                  />
                )
              )}
            </>
          )}
          </>
          )}
        </div>
      </main>

      {/* 2.5 Bulk Action Bar */}
      <AnimatePresence>
        {selectedStudentIds.length > 0 && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-xl px-4"
          >
            <div className="bg-neutral-900/90 backdrop-blur-2xl p-6 rounded-[1.75rem] border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex items-center justify-between gap-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center text-white shadow-lg shadow-primary/20">
                  <Users size={20} />
                </div>
                <div>
                  <h4 className="text-white font-black text-lg tracking-tight">
                    <span className="text-primary">{selectedStudentIds.length}명</span> 선택됨
                  </h4>
                  <p className="text-xs text-neutral-300 font-bold uppercase tracking-widest">선택된 학생에 대해 일괄 작업</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setSelectedStudentIds([])}
                  className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-black transition-all"
                >
                  선택 취소
                </button>
                <button 
                  onClick={handleBulkDelete}
                  className="px-8 py-3 bg-error hover:bg-error/90 text-white rounded-xl text-xs font-black shadow-lg shadow-error/20 transition-all active:scale-95 flex items-center gap-2"
                >
                  <Trash2 size={16} />
                  일괄 삭제
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. 모달 레이어 */}
      <GlobalStudentSearch
        isOpen={isGlobalSearchOpen}
        onClose={() => setIsGlobalSearchOpen(false)}
        classes={classes}
      />

      <AIReportModal
        isOpen={isAIReportOpen}
        onClose={() => setIsAIReportOpen(false)}
        className={classInfo?.name || ''}
        classId={activeClassId ?? undefined}
        students={students}
      />

      <AIChatModal
        isOpen={isAIChatOpen}
        onClose={() => { setIsAIChatOpen(false); setAiChatFocusStudentId(null); }}
        className={classInfo?.name || ''}
        classId={activeClassId ?? undefined}
        students={students}
        focusStudentId={aiChatFocusStudentId}
        onClearFocus={() => setAiChatFocusStudentId(null)}
      />

      <StudentDetailDrawer
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          setDetailedStudentId(null);
        }}
        studentId={detailedStudentId}
        fromClassId={activeClassId || undefined}
        onAskAI={(studentId) => {
          setIsDrawerOpen(false);
          setDetailedStudentId(null);
          setAiChatFocusStudentId(studentId);
          setIsAIChatOpen(true);
        }}
      />

      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 md:p-6 bg-on-surface/20 backdrop-blur-sm overflow-y-auto" onClick={() => setIsCreateModalOpen(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md bg-white p-8 md:p-10 rounded-[1.75rem] space-y-8 shadow-2xl border border-neutral-200 my-auto" onClick={e => e.stopPropagation()}>
              <h3 className="text-2xl font-black text-center text-neutral-900">새 학급 만들기</h3>
              <form onSubmit={handleCreateClass} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-neutral-600 ml-1 uppercase tracking-widest">학급 명칭</label>
                  <input type="text" placeholder="예: 2학년 3반" value={newClassData.name} onChange={e => setNewClassData({...newClassData, name: e.target.value})} className="w-full px-5 py-3.5 bg-neutral-100 border-2 border-neutral-200 hover:border-neutral-300 focus:border-primary/40 focus:bg-white rounded-xl font-bold text-neutral-900 transition-all outline-none placeholder:text-neutral-400" required />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-neutral-600 ml-1 uppercase tracking-widest flex items-center gap-1.5">
                    <CalendarDays size={13} /> 수업 기간 <span className="text-error">*</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 space-y-1">
                      <p className="text-[10px] font-black text-neutral-400 ml-1">시작일</p>
                      <input
                        type="date"
                        value={newClassData.start_date}
                        onChange={e => setNewClassData({...newClassData, start_date: e.target.value})}
                        className={`w-full px-4 py-3 bg-neutral-100 border-2 rounded-xl font-bold text-sm text-neutral-900 transition-all outline-none ${!newClassData.start_date ? 'border-error/40 bg-error/5' : 'border-neutral-200 hover:border-neutral-300 focus:border-primary/40 focus:bg-white'}`}
                        required
                      />
                    </div>
                    <span className="text-neutral-400 font-black text-sm mt-5">~</span>
                    <div className="flex-1 space-y-1">
                      <p className="text-[10px] font-black text-neutral-400 ml-1">종료일</p>
                      <input
                        type="date"
                        value={newClassData.end_date}
                        onChange={e => setNewClassData({...newClassData, end_date: e.target.value})}
                        className={`w-full px-4 py-3 bg-neutral-100 border-2 rounded-xl font-bold text-sm text-neutral-900 transition-all outline-none ${!newClassData.end_date ? 'border-error/40 bg-error/5' : 'border-neutral-200 hover:border-neutral-300 focus:border-primary/40 focus:bg-white'}`}
                        required
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-neutral-400 font-bold ml-1">종료일이 지나면 학생의 활동기록·결과 제출이 자동으로 차단됩니다.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-neutral-600 ml-1 uppercase tracking-widest flex items-center gap-1.5">
                    <Clock size={13} /> 수업 시간 & 시작·종료 알람 (선택)
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 space-y-1">
                      <p className="text-[10px] font-black text-neutral-400 ml-1">시작 시각</p>
                      <input
                        type="time"
                        value={newClassData.class_start_time}
                        onChange={e => setNewClassData({...newClassData, class_start_time: e.target.value})}
                        className="w-full px-4 py-3 bg-neutral-100 border-2 border-neutral-200 hover:border-neutral-300 focus:border-primary/40 focus:bg-white rounded-xl font-bold text-sm text-neutral-900 transition-all outline-none"
                      />
                    </div>
                    <span className="text-neutral-400 font-black text-sm mt-5">~</span>
                    <div className="flex-1 space-y-1">
                      <p className="text-[10px] font-black text-neutral-400 ml-1">종료 시각</p>
                      <input
                        type="time"
                        value={newClassData.class_end_time}
                        onChange={e => setNewClassData({...newClassData, class_end_time: e.target.value})}
                        className="w-full px-4 py-3 bg-neutral-100 border-2 border-neutral-200 hover:border-neutral-300 focus:border-primary/40 focus:bg-white rounded-xl font-bold text-sm text-neutral-900 transition-all outline-none"
                      />
                    </div>
                  </div>
                  {newClassData.class_start_time && (
                    <p className="text-[11px] text-blue-500 font-bold ml-1">매일 시작 시각이 되면 출석체크 알림이 자동으로 울립니다.</p>
                  )}
                  {newClassData.class_end_time && (
                    <div className="flex items-center gap-4 pt-1 animate-in fade-in slide-in-from-top-2 duration-300">
                      {[30, 15, 10].map((m) => (
                        <label key={m} onClick={(e) => e.stopPropagation()} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newClassData.end_alarm_minutes.includes(m)}
                            onChange={(e) => {
                              const minutes = e.target.checked
                                ? [...newClassData.end_alarm_minutes, m]
                                : newClassData.end_alarm_minutes.filter((x) => x !== m);
                              setNewClassData({ ...newClassData, end_alarm_minutes: minutes });
                            }}
                            className="w-3.5 h-3.5 rounded accent-primary"
                          />
                          <span className="text-xs font-black text-neutral-600">{m}분 전</span>
                        </label>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-neutral-400 font-bold ml-1">매일 설정한 종료 시각 기준으로 플로팅 알림이 울립니다.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-neutral-600 ml-1 uppercase tracking-widest flex items-center gap-1.5">
                    <CalendarDays size={13} /> 출석 알림 요일 (선택)
                  </label>
                  <div className="flex items-center gap-1.5">
                    {([
                      { mode: null, label: '매일' },
                      { mode: 'weekday', label: '요일 지정' },
                      { mode: 'dates', label: '날짜 지정' },
                    ] as const).map((opt) => (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => setNewClassData({ ...newClassData, schedule_mode: opt.mode })}
                        className={`flex-1 py-2 text-[11px] font-black rounded-lg border transition-all ${newClassData.schedule_mode === opt.mode ? 'bg-white shadow-sm text-primary border-primary/30' : 'text-neutral-500 border-transparent hover:text-neutral-700 hover:bg-neutral-100'}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {newClassData.schedule_mode === 'weekday' && (
                    <div className="flex items-center gap-1.5 pt-1 animate-in fade-in slide-in-from-top-2 duration-300">
                      {['일', '월', '화', '수', '목', '금', '토'].map((label, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            const current = newClassData.class_days_of_week || [];
                            const days = current.includes(idx) ? current.filter((d) => d !== idx) : [...current, idx];
                            setNewClassData({ ...newClassData, class_days_of_week: days });
                          }}
                          className={`flex-1 py-2 text-xs font-black rounded-lg border transition-all ${(newClassData.class_days_of_week || []).includes(idx) ? 'bg-primary text-white border-primary' : 'bg-neutral-100 text-neutral-500 border-neutral-200 hover:border-neutral-300'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                  {newClassData.schedule_mode === 'dates' && (
                    <div className="space-y-2 pt-1 animate-in fade-in slide-in-from-top-2 duration-300">
                      {newClassData.class_specific_dates.map((date, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="date"
                            value={date}
                            onChange={e => {
                              const dates = [...newClassData.class_specific_dates];
                              dates[idx] = e.target.value;
                              setNewClassData({ ...newClassData, class_specific_dates: dates });
                            }}
                            className="flex-1 px-4 py-3 bg-neutral-100 border-2 border-neutral-200 hover:border-neutral-300 focus:border-primary/40 focus:bg-white rounded-xl font-bold text-sm text-neutral-900 transition-all outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setNewClassData({ ...newClassData, class_specific_dates: newClassData.class_specific_dates.filter((_, i) => i !== idx) })}
                            className="w-9 h-9 rounded-lg flex items-center justify-center text-neutral-400 hover:text-error hover:bg-error/10 transition-colors shrink-0"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setNewClassData({ ...newClassData, class_specific_dates: [...newClassData.class_specific_dates, ''] })}
                        className="flex items-center gap-1.5 text-xs font-black text-primary hover:text-primary/80 transition-colors ml-1"
                      >
                        <Plus size={13} /> 날짜 추가
                      </button>
                    </div>
                  )}
                  <p className="text-[11px] text-neutral-400 font-bold ml-1">
                    {newClassData.schedule_mode === 'weekday' ? '선택한 요일에만 출석체크 알림이 울립니다.' : newClassData.schedule_mode === 'dates' ? '선택한 날짜에만 출석체크 알림이 울립니다.' : '수업 기간 내 매일 출석체크 알림이 울립니다.'}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-neutral-600 ml-1 uppercase tracking-widest flex items-center gap-1.5">
                    <Clock size={13} /> 쉬는시간 알림 (선택)
                  </label>

                  <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl space-y-2.5">
                    <div className="flex items-center gap-1.5">
                      {SCHOOL_LEVEL_PRESETS.map((p) => (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => setBreakGenNew({ ...breakGenNew, periodMinutes: p.periodMinutes, breakMinutes: p.breakMinutes })}
                          className={`flex-1 py-2 text-[11px] font-black rounded-lg border transition-all ${breakGenNew.periodMinutes === p.periodMinutes && breakGenNew.breakMinutes === p.breakMinutes ? 'bg-white shadow-sm text-primary border-primary/30' : 'text-neutral-500 border-transparent hover:text-neutral-700 hover:bg-white'}`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 space-y-1">
                        <p className="text-[10px] font-black text-neutral-400 ml-1">1교시 수업시간(분)</p>
                        <input
                          type="number"
                          min={1}
                          value={breakGenNew.periodMinutes || ''}
                          onChange={e => setBreakGenNew({ ...breakGenNew, periodMinutes: parseInt(e.target.value, 10) || 0 })}
                          className="w-full px-3 py-2 bg-white border-2 border-neutral-200 hover:border-neutral-300 focus:border-primary/40 rounded-lg font-bold text-sm text-neutral-900 transition-all outline-none"
                        />
                      </div>
                      <div className="flex-1 space-y-1">
                        <p className="text-[10px] font-black text-neutral-400 ml-1">쉬는시간(분)</p>
                        <input
                          type="number"
                          min={0}
                          value={breakGenNew.breakMinutes}
                          onChange={e => setBreakGenNew({ ...breakGenNew, breakMinutes: parseInt(e.target.value, 10) || 0 })}
                          className="w-full px-3 py-2 bg-white border-2 border-neutral-200 hover:border-neutral-300 focus:border-primary/40 rounded-lg font-bold text-sm text-neutral-900 transition-all outline-none"
                        />
                      </div>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer ml-1">
                      <input
                        type="checkbox"
                        checked={breakGenNew.lunchEnabled}
                        onChange={e => setBreakGenNew({ ...breakGenNew, lunchEnabled: e.target.checked })}
                        className="w-3.5 h-3.5 rounded accent-primary"
                      />
                      <span className="text-xs font-black text-neutral-600">점심시간 포함</span>
                    </label>
                    {breakGenNew.lunchEnabled && (
                      <div className="flex items-center gap-3 pl-5 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="flex-1 space-y-1">
                          <p className="text-[10px] font-black text-neutral-400 ml-1">몇 교시 후</p>
                          <input
                            type="number"
                            min={1}
                            value={breakGenNew.lunchAfterPeriod}
                            onChange={e => setBreakGenNew({ ...breakGenNew, lunchAfterPeriod: parseInt(e.target.value, 10) || 1 })}
                            className="w-full px-3 py-2 bg-white border-2 border-neutral-200 hover:border-neutral-300 focus:border-primary/40 rounded-lg font-bold text-sm text-neutral-900 transition-all outline-none"
                          />
                        </div>
                        <div className="flex-1 space-y-1">
                          <p className="text-[10px] font-black text-neutral-400 ml-1">점심시간(분)</p>
                          <input
                            type="number"
                            min={1}
                            value={breakGenNew.lunchMinutes}
                            onChange={e => setBreakGenNew({ ...breakGenNew, lunchMinutes: parseInt(e.target.value, 10) || 0 })}
                            className="w-full px-3 py-2 bg-white border-2 border-neutral-200 hover:border-neutral-300 focus:border-primary/40 rounded-lg font-bold text-sm text-neutral-900 transition-all outline-none"
                          />
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (!newClassData.class_start_time || !newClassData.class_end_time) {
                          showToast('먼저 수업 시작·종료 시각을 입력해주세요.');
                          return;
                        }
                        const times = generateBreakTimes(newClassData.class_start_time, newClassData.class_end_time, breakGenNew);
                        setNewClassData({ ...newClassData, break_times: times });
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-primary/10 hover:bg-primary/15 text-primary text-xs font-black rounded-lg transition-colors"
                    >
                      <Sparkles size={13} /> 쉬는시간 자동 생성
                    </button>
                  </div>

                  <div className="space-y-2">
                    {newClassData.break_times.map((time, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="time"
                          value={time}
                          onChange={e => {
                            const times = [...newClassData.break_times];
                            times[idx] = e.target.value;
                            setNewClassData({ ...newClassData, break_times: times });
                          }}
                          className="flex-1 px-4 py-3 bg-neutral-100 border-2 border-neutral-200 hover:border-neutral-300 focus:border-primary/40 focus:bg-white rounded-xl font-bold text-sm text-neutral-900 transition-all outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setNewClassData({ ...newClassData, break_times: newClassData.break_times.filter((_, i) => i !== idx) })}
                          className="w-9 h-9 rounded-lg flex items-center justify-center text-neutral-400 hover:text-error hover:bg-error/10 transition-colors shrink-0"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setNewClassData({ ...newClassData, break_times: [...newClassData.break_times, ''] })}
                    className="flex items-center gap-1.5 text-xs font-black text-primary hover:text-primary/80 transition-colors ml-1"
                  >
                    <Plus size={13} /> 쉬는시간 추가
                  </button>
                  <p className="text-[11px] text-neutral-400 font-bold ml-1">매일 설정한 쉬는시간 시작 5분 전에 플로팅 알림이 울립니다.</p>
                </div>

                {newClassData.class_type === 'subject' && (
                  <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="text-xs font-black text-neutral-600 ml-1 uppercase tracking-widest">담당 과목</label>
                    <input type="text" placeholder="예: 국어" value={newClassData.subject} onChange={e => setNewClassData({...newClassData, subject: e.target.value})} className="w-full px-5 py-3.5 bg-neutral-100 border-2 border-neutral-200 hover:border-neutral-300 focus:border-primary/40 focus:bg-white rounded-xl font-bold text-neutral-900 transition-all outline-none placeholder:text-neutral-400" required />
                  </div>
                )}
                <div className="flex p-1.5 bg-neutral-100 border border-neutral-200 rounded-2xl">
                  <button type="button" onClick={() => setNewClassData({...newClassData, class_type: 'subject'})} className={`flex-1 py-3 text-xs font-black rounded-xl transition-all ${newClassData.class_type === 'subject' ? 'bg-white shadow-sm text-primary border border-primary/10' : 'text-neutral-500 hover:text-neutral-700'}`}>과목 수업 (세특 기반)</button>
                  <button type="button" onClick={() => setNewClassData({...newClassData, class_type: 'homeroom'})} className={`flex-1 py-3 text-xs font-black rounded-xl transition-all ${newClassData.class_type === 'homeroom' ? 'bg-white shadow-sm text-secondary border border-secondary/10' : 'text-neutral-500 hover:text-neutral-700'}`}>담임 반 (행특 기반)</button>
                </div>
                
                <div className="pt-2 animate-in fade-in slide-in-from-top-2 duration-500 space-y-3">
                  <details className="group [&_summary::-webkit-details-marker]:hidden [&_summary]:list-none">
                    <summary className="flex items-center justify-between gap-2 text-xs font-black text-secondary cursor-pointer select-none py-3 px-5 bg-secondary/5 rounded-2xl hover:bg-secondary/10 transition-all">
                      <div className="flex items-center gap-2">
                        <BookOpen size={14} />
                        주차별 수업 계획 (Syllabus)
                      </div>
                      <ChevronDown size={14} className="group-open:rotate-180 transition-transform duration-300" />
                    </summary>
                    <div className="space-y-4 pt-4 px-1">
                      <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {newClassData.weekly_plan.map((item: any, idx: number) => (
                          <div key={idx} className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 space-y-3 relative">
                            {idx > 0 && (
                              <button type="button" onClick={() => {
                                const plan = newClassData.weekly_plan.filter((_: any, i: number) => i !== idx);
                                setNewClassData({ ...newClassData, weekly_plan: plan });
                              }} className="absolute top-3 right-3 text-neutral-500 hover:text-error transition-colors"><X size={14} /></button>
                            )}
                            <div className="flex items-center gap-3">
                               <div className="w-10 h-10 bg-white border border-neutral-100 rounded-lg flex flex-col items-center justify-center shrink-0">
                                 <span className="text-[7px] font-black text-neutral-400 uppercase leading-none">W</span>
                                 <span className="text-xs font-black text-secondary leading-none">{item.week}</span>
                               </div>
                               <div className="flex-1 space-y-2">
                                 <input type="text" value={item.topic} onChange={(e) => {
                                   const plan = [...newClassData.weekly_plan];
                                   plan[idx].topic = e.target.value;
                                   setNewClassData({ ...newClassData, weekly_plan: plan });
                                 }} placeholder="주제 (예: 국어의 기술)" className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-xs font-bold outline-none focus:border-secondary/40" />
                                 <input type="text" value={item.url} onChange={(e) => {
                                   const plan = [...newClassData.weekly_plan];
                                   plan[idx].url = e.target.value;
                                   setNewClassData({ ...newClassData, weekly_plan: plan });
                                 }} placeholder="자료 링크 (URL)" className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-lg text-xs font-bold outline-none focus:border-secondary/40" />
                                 <div className="flex items-center gap-4 mt-1">
                                   <label onClick={(e) => e.stopPropagation()} className="flex items-center gap-2 cursor-pointer">
                                     <input type="checkbox" checked={item.requires_result !== false} onChange={(e) => {
                                       const plan = [...newClassData.weekly_plan];
                                       plan[idx].requires_result = e.target.checked;
                                       setNewClassData({ ...newClassData, weekly_plan: plan });
                                     }} className="w-3.5 h-3.5 rounded accent-secondary" />
                                     <span className="text-xs font-black text-neutral-600">결과제출 필요</span>
                                   </label>
                                   <label onClick={(e) => e.stopPropagation()} className="flex items-center gap-2 cursor-pointer">
                                     <input type="checkbox" checked={item.requires_activity !== false} onChange={(e) => {
                                       const plan = [...newClassData.weekly_plan];
                                       plan[idx].requires_activity = e.target.checked;
                                       setNewClassData({ ...newClassData, weekly_plan: plan });
                                     }} className="w-3.5 h-3.5 rounded accent-secondary" />
                                     <span className="text-xs font-black text-neutral-600">활동기록 필요</span>
                                   </label>
                                 </div>
                               </div>
                            </div>
                          </div>
                        ))}
                        <button type="button" onClick={() => {
                          const plan = newClassData.weekly_plan;
                          setNewClassData({ ...newClassData, weekly_plan: [...plan, { week: plan.length + 1, topic: '', url: '', requires_result: true, requires_activity: true }] });
                        }} className="w-full py-2 border-2 border-dashed border-neutral-300 rounded-xl text-xs font-black text-neutral-500 hover:border-secondary/40 hover:text-secondary transition-all">+ 주차 추가</button>
                      </div>
                    </div>
                  </details>

                  <details className="group [&_summary::-webkit-details-marker]:hidden [&_summary]:list-none">
                    <summary className="flex items-center justify-between gap-2 text-xs font-black text-primary cursor-pointer select-none py-3 px-5 bg-primary/5 rounded-2xl hover:bg-primary/10 transition-all">
                      <div className="flex items-center gap-2">
                        <Sparkles size={14} />
                        고급 AI 설정 (선택 사항)
                      </div>
                      <ChevronDown size={14} className="group-open:rotate-180 transition-transform duration-300" />
                    </summary>
                    <div className="space-y-4 pt-4 px-1">
                      <div className="space-y-1.5">
                        <label className="text-xs font-black text-neutral-600 uppercase tracking-widest ml-1">학생 활동 가이드</label>
                        <textarea value={newClassData.student_guide_prompt} onChange={e => setNewClassData({...newClassData, student_guide_prompt: e.target.value})} placeholder="미입력 시 기본 지침이 적용됩니다." className="w-full h-24 px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold focus:bg-white outline-none resize-none" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-black text-neutral-600 uppercase tracking-widest ml-1">AI 초안 작성 지침</label>
                        <textarea value={newClassData.teacher_report_prompt} onChange={e => setNewClassData({...newClassData, teacher_report_prompt: e.target.value})} placeholder="미입력 시 기본 지침이 적용됩니다." className="w-full h-24 px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold focus:bg-white outline-none resize-none" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-black text-neutral-600 uppercase tracking-widest ml-1">최소 제출 글자수</label>
                        <div className="flex items-center gap-3">
                          <input
                            type="number"
                            min={0}
                            max={500}
                            value={newClassData.min_obs_chars || ''}
                            onChange={e => setNewClassData({...newClassData, min_obs_chars: parseInt(e.target.value) || 0})}
                            placeholder="0 (제한 없음)"
                            className="w-40 px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-black focus:bg-white outline-none"
                          />
                          <span className="text-xs font-bold text-neutral-500">자 미만이면 제출 차단 (0 = 제한 없음)</span>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-black text-neutral-600 uppercase tracking-widest ml-1">제출 금지어 (하드 차단)</label>
                        <textarea
                          value={(newClassData.blocked_keywords || []).join('\n')}
                          onChange={e => {
                            const raw = e.target.value;
                            const keywords = raw.split('\n').map(k => k.trim()).filter(Boolean);
                            setNewClassData({...newClassData, blocked_keywords: keywords});
                          }}
                          placeholder={"한 줄에 하나씩 입력\n예: 모름\n예: 복붙\n예: 없음"}
                          className="w-full h-20 px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold focus:bg-white outline-none resize-none"
                        />
                        <span className="text-xs font-bold text-neutral-500 ml-1">입력한 단어/문장이 포함되면 제출 즉시 차단</span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between px-1">
                          <div>
                            <p className="text-xs font-black text-neutral-600 uppercase tracking-widest">AI 내용 품질 검토</p>
                            <p className="text-xs font-bold text-neutral-500 mt-0.5">꺼두면 글자수·금지어만 차단</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setNewClassData({...newClassData, ai_review_enabled: !newClassData.ai_review_enabled})}
                            className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${newClassData.ai_review_enabled ? 'bg-primary' : 'bg-neutral-300'}`}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${newClassData.ai_review_enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                          </button>
                        </div>
                        <div className={`rounded-xl px-3 py-2.5 text-[10px] font-bold leading-relaxed transition-colors ${newClassData.ai_review_enabled ? 'bg-primary/5 text-primary/80 border border-primary/10' : 'bg-neutral-100 text-neutral-400 border border-neutral-200'}`}>
                          {newClassData.ai_review_enabled ? (
                            <>
                              <span className="font-black">ON</span> — 학생이 제출하면 AI가 내용의 구체성·관련성을 판단합니다.<br />
                              교사 지침에 맞지 않으면 자동으로 <span className="font-black">반려 플래그</span>가 붙어 교사 화면에 표시됩니다.<br />
                              <span className="text-primary/50">※ 글자수·금지어 차단은 AI와 무관하게 항상 작동합니다.</span>
                            </>
                          ) : (
                            <>
                              <span className="font-black">OFF</span> — AI 검토 없이 글자수·금지어 조건만 통과하면 즉시 승인됩니다.<br />
                              <span className="text-neutral-400">Gemini API가 호출되지 않으므로 비용이 발생하지 않습니다.</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </details>
                </div>

                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setIsCreateModalOpen(false)} className="flex-1 py-4 bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 rounded-2xl font-black text-neutral-700 transition-all">취소</button>
                  <button
                    type="submit"
                    disabled={!newClassData.start_date || !newClassData.end_date}
                    className="flex-1 py-4 bg-primary hover:bg-primary/90 text-white rounded-2xl font-black shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100 disabled:shadow-none"
                  >생성하기</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {isUpdateModalOpen && updateClassData && (
          <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 md:p-6 bg-black/30 backdrop-blur-md overflow-y-auto" onClick={() => { setIsUpdateModalOpen(false); setEditModalTab('basic'); }}>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-2xl bg-white p-8 md:p-10 rounded-[2rem] space-y-8 shadow-2xl border border-neutral-200 my-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-black text-neutral-900">학급 정보 관리</h3>
                <div className="flex p-1 bg-neutral-100 rounded-2xl border border-neutral-200">
                  <button type="button" onClick={() => setEditModalTab('basic')} className={`px-6 py-2 text-xs font-black rounded-xl transition-all ${editModalTab === 'basic' ? 'bg-white shadow-sm text-primary' : 'text-neutral-500 hover:text-neutral-700'}`}>기본 정보</button>
                  <button type="button" onClick={() => setEditModalTab('syllabus')} className={`px-6 py-2 text-xs font-black rounded-xl transition-all ${editModalTab === 'syllabus' ? 'bg-white shadow-sm text-primary' : 'text-neutral-500 hover:text-neutral-700'}`}>주차별 계획</button>
                  <button type="button" onClick={() => setEditModalTab('ai')} className={`px-6 py-2 text-xs font-black rounded-xl transition-all ${editModalTab === 'ai' ? 'bg-white shadow-sm text-primary' : 'text-neutral-500 hover:text-neutral-700'}`}>AI 지침 설정</button>
                </div>
              </div>

              {/* 학교 프로젝트 부모 클래스 안내 */}
              {updateClassData.school_project_id && !updateClassData.parent_class_id && (
                <div className="flex items-center gap-3 px-4 py-3 bg-violet-50 border border-violet-200 rounded-2xl">
                  <School size={15} className="text-violet-500 shrink-0" />
                  <p className="text-xs font-bold text-violet-700">
                    AI 지침·수업 기간 등 공통 설정은 <strong>하위 반 전체에 동일하게 적용</strong>됩니다.
                  </p>
                </div>
              )}

              <form onSubmit={handleUpdateClass} className="space-y-6">
                <AnimatePresence mode="wait">
                  {editModalTab === 'basic' ? (
                    <motion.div 
                      key="basic"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="space-y-5"
                    >
                      <div className="space-y-1.5">
                        <label className="text-xs font-black text-neutral-600 ml-1 uppercase tracking-widest">학급 명칭</label>
                        <input type="text" placeholder="학급 명칭" value={updateClassData.name} onChange={e => setUpdateClassData({...updateClassData, name: e.target.value})} className="w-full px-5 py-3.5 bg-neutral-100 border-2 border-neutral-200 hover:border-neutral-300 focus:border-primary/40 focus:bg-white rounded-xl font-bold text-neutral-900 transition-all outline-none" required />
                      </div>
                      {updateClassData.class_type === 'subject' && (
                        <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
                          <label className="text-xs font-black text-neutral-600 ml-1 uppercase tracking-widest">담당 과목</label>
                          <input type="text" placeholder="담당 과목" value={updateClassData.subject} onChange={e => setUpdateClassData({...updateClassData, subject: e.target.value})} className="w-full px-5 py-3.5 bg-neutral-100 border-2 border-neutral-200 hover:border-neutral-300 focus:border-primary/40 focus:bg-white rounded-xl font-bold text-neutral-900 transition-all outline-none" required />
                        </div>
                      )}

                      {/* 수업 기간 */}
                      <div className="space-y-2 pt-1">
                        <label className="text-xs font-black text-neutral-600 ml-1 uppercase tracking-widest flex items-center gap-1.5">
                          <CalendarDays size={13} /> 수업 기간 (선택)
                        </label>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 space-y-1">
                            <p className="text-[10px] font-black text-neutral-400 ml-1">시작일</p>
                            <input
                              type="date"
                              value={updateClassData.start_date || ''}
                              onChange={e => setUpdateClassData({...updateClassData, start_date: e.target.value || null})}
                              className="w-full px-4 py-3 bg-neutral-100 border-2 border-neutral-200 hover:border-neutral-300 focus:border-primary/40 focus:bg-white rounded-xl font-bold text-sm text-neutral-900 transition-all outline-none"
                            />
                          </div>
                          <span className="text-neutral-400 font-black text-sm mt-5">~</span>
                          <div className="flex-1 space-y-1">
                            <p className="text-[10px] font-black text-neutral-400 ml-1">종료일</p>
                            <input
                              type="date"
                              value={updateClassData.end_date || ''}
                              onChange={e => setUpdateClassData({...updateClassData, end_date: e.target.value || null})}
                              className="w-full px-4 py-3 bg-neutral-100 border-2 border-neutral-200 hover:border-neutral-300 focus:border-primary/40 focus:bg-white rounded-xl font-bold text-sm text-neutral-900 transition-all outline-none"
                            />
                          </div>
                        </div>
                        <p className="text-[11px] text-neutral-400 font-bold ml-1">종료일이 지나면 학생의 활동기록·결과 제출이 자동으로 차단됩니다.</p>
                      </div>

                      {/* 수업 시간 & 시작·종료 알람 */}
                      <div className="space-y-2 pt-1">
                        <label className="text-xs font-black text-neutral-600 ml-1 uppercase tracking-widest flex items-center gap-1.5">
                          <Clock size={13} /> 수업 시간 & 시작·종료 알람 (선택)
                        </label>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 space-y-1">
                            <p className="text-[10px] font-black text-neutral-400 ml-1">시작 시각</p>
                            <input
                              type="time"
                              value={updateClassData.class_start_time || ''}
                              onChange={e => setUpdateClassData({...updateClassData, class_start_time: e.target.value || null})}
                              className="w-full px-4 py-3 bg-neutral-100 border-2 border-neutral-200 hover:border-neutral-300 focus:border-primary/40 focus:bg-white rounded-xl font-bold text-sm text-neutral-900 transition-all outline-none"
                            />
                          </div>
                          <span className="text-neutral-400 font-black text-sm mt-5">~</span>
                          <div className="flex-1 space-y-1">
                            <p className="text-[10px] font-black text-neutral-400 ml-1">종료 시각</p>
                            <input
                              type="time"
                              value={updateClassData.class_end_time || ''}
                              onChange={e => setUpdateClassData({...updateClassData, class_end_time: e.target.value || null})}
                              className="w-full px-4 py-3 bg-neutral-100 border-2 border-neutral-200 hover:border-neutral-300 focus:border-primary/40 focus:bg-white rounded-xl font-bold text-sm text-neutral-900 transition-all outline-none"
                            />
                          </div>
                        </div>
                        {updateClassData.class_start_time && (
                          <p className="text-[11px] text-blue-500 font-bold ml-1">매일 시작 시각이 되면 출석체크 알림이 자동으로 울립니다.</p>
                        )}
                        {updateClassData.class_end_time && (
                          <div className="flex items-center gap-4 pt-1 animate-in fade-in slide-in-from-top-2 duration-300">
                            {[30, 15, 10].map((m) => (
                              <label key={m} onClick={(e) => e.stopPropagation()} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={(updateClassData.end_alarm_minutes || []).includes(m)}
                                  onChange={(e) => {
                                    const current: number[] = updateClassData.end_alarm_minutes || [];
                                    const minutes = e.target.checked
                                      ? [...current, m]
                                      : current.filter((x) => x !== m);
                                    setUpdateClassData({ ...updateClassData, end_alarm_minutes: minutes });
                                  }}
                                  className="w-3.5 h-3.5 rounded accent-primary"
                                />
                                <span className="text-xs font-black text-neutral-600">{m}분 전</span>
                              </label>
                            ))}
                          </div>
                        )}
                        <p className="text-[11px] text-neutral-400 font-bold ml-1">매일 설정한 종료 시각 기준으로 플로팅 알림이 울립니다.</p>
                      </div>

                      {/* 출석 알림 요일 */}
                      <div className="space-y-2 pt-1">
                        <label className="text-xs font-black text-neutral-600 ml-1 uppercase tracking-widest flex items-center gap-1.5">
                          <CalendarDays size={13} /> 출석 알림 요일 (선택)
                        </label>
                        <div className="flex items-center gap-1.5">
                          {([
                            { mode: null, label: '매일' },
                            { mode: 'weekday', label: '요일 지정' },
                            { mode: 'dates', label: '날짜 지정' },
                          ] as const).map((opt) => (
                            <button
                              key={opt.label}
                              type="button"
                              onClick={() => setUpdateClassData({ ...updateClassData, schedule_mode: opt.mode })}
                              className={`flex-1 py-2 text-[11px] font-black rounded-lg border transition-all ${(updateClassData.schedule_mode || null) === opt.mode ? 'bg-white shadow-sm text-primary border-primary/30' : 'text-neutral-500 border-transparent hover:text-neutral-700 hover:bg-neutral-100'}`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        {updateClassData.schedule_mode === 'weekday' && (
                          <div className="flex items-center gap-1.5 pt-1 animate-in fade-in slide-in-from-top-2 duration-300">
                            {['일', '월', '화', '수', '목', '금', '토'].map((label, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  const current: number[] = updateClassData.class_days_of_week || [];
                                  const days = current.includes(idx) ? current.filter((d: number) => d !== idx) : [...current, idx];
                                  setUpdateClassData({ ...updateClassData, class_days_of_week: days });
                                }}
                                className={`flex-1 py-2 text-xs font-black rounded-lg border transition-all ${(updateClassData.class_days_of_week || []).includes(idx) ? 'bg-primary text-white border-primary' : 'bg-neutral-100 text-neutral-500 border-neutral-200 hover:border-neutral-300'}`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        )}
                        {updateClassData.schedule_mode === 'dates' && (
                          <div className="space-y-2 pt-1 animate-in fade-in slide-in-from-top-2 duration-300">
                            {(updateClassData.class_specific_dates || []).map((date: string, idx: number) => (
                              <div key={idx} className="flex items-center gap-2">
                                <input
                                  type="date"
                                  value={date}
                                  onChange={e => {
                                    const dates = [...(updateClassData.class_specific_dates || [])];
                                    dates[idx] = e.target.value;
                                    setUpdateClassData({ ...updateClassData, class_specific_dates: dates });
                                  }}
                                  className="flex-1 px-4 py-3 bg-neutral-100 border-2 border-neutral-200 hover:border-neutral-300 focus:border-primary/40 focus:bg-white rounded-xl font-bold text-sm text-neutral-900 transition-all outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => setUpdateClassData({ ...updateClassData, class_specific_dates: (updateClassData.class_specific_dates || []).filter((_: string, i: number) => i !== idx) })}
                                  className="w-9 h-9 rounded-lg flex items-center justify-center text-neutral-400 hover:text-error hover:bg-error/10 transition-colors shrink-0"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => setUpdateClassData({ ...updateClassData, class_specific_dates: [...(updateClassData.class_specific_dates || []), ''] })}
                              className="flex items-center gap-1.5 text-xs font-black text-primary hover:text-primary/80 transition-colors ml-1"
                            >
                              <Plus size={13} /> 날짜 추가
                            </button>
                          </div>
                        )}
                        <p className="text-[11px] text-neutral-400 font-bold ml-1">
                          {updateClassData.schedule_mode === 'weekday' ? '선택한 요일에만 출석체크 알림이 울립니다.' : updateClassData.schedule_mode === 'dates' ? '선택한 날짜에만 출석체크 알림이 울립니다.' : '수업 기간 내 매일 출석체크 알림이 울립니다.'}
                        </p>
                      </div>

                      {/* 쉬는시간 알림 */}
                      <div className="space-y-2 pt-1">
                        <label className="text-xs font-black text-neutral-600 ml-1 uppercase tracking-widest flex items-center gap-1.5">
                          <Clock size={13} /> 쉬는시간 알림 (선택)
                        </label>

                        <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl space-y-2.5">
                          <div className="flex items-center gap-1.5">
                            {SCHOOL_LEVEL_PRESETS.map((p) => (
                              <button
                                key={p.label}
                                type="button"
                                onClick={() => setBreakGenEdit({ ...breakGenEdit, periodMinutes: p.periodMinutes, breakMinutes: p.breakMinutes })}
                                className={`flex-1 py-2 text-[11px] font-black rounded-lg border transition-all ${breakGenEdit.periodMinutes === p.periodMinutes && breakGenEdit.breakMinutes === p.breakMinutes ? 'bg-white shadow-sm text-primary border-primary/30' : 'text-neutral-500 border-transparent hover:text-neutral-700 hover:bg-white'}`}
                              >
                                {p.label}
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex-1 space-y-1">
                              <p className="text-[10px] font-black text-neutral-400 ml-1">1교시 수업시간(분)</p>
                              <input
                                type="number"
                                min={1}
                                value={breakGenEdit.periodMinutes || ''}
                                onChange={e => setBreakGenEdit({ ...breakGenEdit, periodMinutes: parseInt(e.target.value, 10) || 0 })}
                                className="w-full px-3 py-2 bg-white border-2 border-neutral-200 hover:border-neutral-300 focus:border-primary/40 rounded-lg font-bold text-sm text-neutral-900 transition-all outline-none"
                              />
                            </div>
                            <div className="flex-1 space-y-1">
                              <p className="text-[10px] font-black text-neutral-400 ml-1">쉬는시간(분)</p>
                              <input
                                type="number"
                                min={0}
                                value={breakGenEdit.breakMinutes}
                                onChange={e => setBreakGenEdit({ ...breakGenEdit, breakMinutes: parseInt(e.target.value, 10) || 0 })}
                                className="w-full px-3 py-2 bg-white border-2 border-neutral-200 hover:border-neutral-300 focus:border-primary/40 rounded-lg font-bold text-sm text-neutral-900 transition-all outline-none"
                              />
                            </div>
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer ml-1">
                            <input
                              type="checkbox"
                              checked={breakGenEdit.lunchEnabled}
                              onChange={e => setBreakGenEdit({ ...breakGenEdit, lunchEnabled: e.target.checked })}
                              className="w-3.5 h-3.5 rounded accent-primary"
                            />
                            <span className="text-xs font-black text-neutral-600">점심시간 포함</span>
                          </label>
                          {breakGenEdit.lunchEnabled && (
                            <div className="flex items-center gap-3 pl-5 animate-in fade-in slide-in-from-top-2 duration-300">
                              <div className="flex-1 space-y-1">
                                <p className="text-[10px] font-black text-neutral-400 ml-1">몇 교시 후</p>
                                <input
                                  type="number"
                                  min={1}
                                  value={breakGenEdit.lunchAfterPeriod}
                                  onChange={e => setBreakGenEdit({ ...breakGenEdit, lunchAfterPeriod: parseInt(e.target.value, 10) || 1 })}
                                  className="w-full px-3 py-2 bg-white border-2 border-neutral-200 hover:border-neutral-300 focus:border-primary/40 rounded-lg font-bold text-sm text-neutral-900 transition-all outline-none"
                                />
                              </div>
                              <div className="flex-1 space-y-1">
                                <p className="text-[10px] font-black text-neutral-400 ml-1">점심시간(분)</p>
                                <input
                                  type="number"
                                  min={1}
                                  value={breakGenEdit.lunchMinutes}
                                  onChange={e => setBreakGenEdit({ ...breakGenEdit, lunchMinutes: parseInt(e.target.value, 10) || 0 })}
                                  className="w-full px-3 py-2 bg-white border-2 border-neutral-200 hover:border-neutral-300 focus:border-primary/40 rounded-lg font-bold text-sm text-neutral-900 transition-all outline-none"
                                />
                              </div>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (!updateClassData.class_start_time || !updateClassData.class_end_time) {
                                showToast('먼저 수업 시작·종료 시각을 입력해주세요.');
                                return;
                              }
                              const times = generateBreakTimes(updateClassData.class_start_time, updateClassData.class_end_time, breakGenEdit);
                              setUpdateClassData({ ...updateClassData, break_times: times });
                            }}
                            className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-primary/10 hover:bg-primary/15 text-primary text-xs font-black rounded-lg transition-colors"
                          >
                            <Sparkles size={13} /> 쉬는시간 자동 생성
                          </button>
                        </div>

                        <div className="space-y-2">
                          {(updateClassData.break_times || []).map((time: string, idx: number) => (
                            <div key={idx} className="flex items-center gap-2">
                              <input
                                type="time"
                                value={time}
                                onChange={e => {
                                  const times = [...(updateClassData.break_times || [])];
                                  times[idx] = e.target.value;
                                  setUpdateClassData({ ...updateClassData, break_times: times });
                                }}
                                className="flex-1 px-4 py-3 bg-neutral-100 border-2 border-neutral-200 hover:border-neutral-300 focus:border-primary/40 focus:bg-white rounded-xl font-bold text-sm text-neutral-900 transition-all outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => setUpdateClassData({ ...updateClassData, break_times: (updateClassData.break_times || []).filter((_: string, i: number) => i !== idx) })}
                                className="w-9 h-9 rounded-lg flex items-center justify-center text-neutral-400 hover:text-error hover:bg-error/10 transition-colors shrink-0"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => setUpdateClassData({ ...updateClassData, break_times: [...(updateClassData.break_times || []), ''] })}
                          className="flex items-center gap-1.5 text-xs font-black text-primary hover:text-primary/80 transition-colors ml-1"
                        >
                          <Plus size={13} /> 쉬는시간 추가
                        </button>
                        <p className="text-[11px] text-neutral-400 font-bold ml-1">매일 설정한 쉬는시간 시작 5분 전에 플로팅 알림이 울립니다.</p>
                      </div>

                      {/* 수업 종료 선언 */}
                      {(() => {
                        const endDatePassed = !!updateClassData.end_date && updateClassData.end_date < getTodayStr();
                        return (
                        <div className="space-y-2">
                          <div className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${updateClassData.is_closed ? 'bg-rose-50 border-rose-200' : 'bg-neutral-50 border-neutral-200'}`}>
                            <div className="flex items-center gap-3">
                              {updateClassData.is_closed ? <Lock size={18} className="text-rose-500 shrink-0" /> : <Unlock size={18} className="text-neutral-400 shrink-0" />}
                              <div>
                                <p className={`text-sm font-black ${updateClassData.is_closed ? 'text-rose-700' : 'text-neutral-700'}`}>수업 종료 선언</p>
                                <p className="text-[11px] font-bold text-neutral-400 mt-0.5">
                                  {updateClassData.is_closed
                                    ? '현재 수업이 종료된 상태입니다.'
                                    : endDatePassed
                                      ? '토글은 꺼져 있지만 종료일이 지나 여전히 종료된 상태입니다.'
                                      : '수업을 종료하면 학생의 기록·제출이 차단됩니다.'}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setUpdateClassData({...updateClassData, is_closed: !updateClassData.is_closed})}
                              className={`relative w-12 h-6 rounded-full transition-all duration-300 ${updateClassData.is_closed ? 'bg-rose-500' : 'bg-neutral-300'}`}
                            >
                              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-300 ${updateClassData.is_closed ? 'left-6' : 'left-0.5'}`} />
                            </button>
                          </div>
                          {endDatePassed && (
                            <p className="text-[11px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-start gap-1.5">
                              <span>⚠</span>
                              <span>이 토글과 무관하게, 위의 종료일({updateClassData.end_date})이 지나 수업이 자동 종료된 상태예요. 수업을 재개하려면 종료일을 오늘 이후 날짜로 변경하거나 비워야 합니다.</span>
                            </p>
                          )}
                        </div>
                        );
                      })()}
                    </motion.div>
                  ) : editModalTab === 'syllabus' ? (
                    <motion.div 
                      key="syllabus"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className="space-y-5"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between ml-1 text-primary">
                          <label className="text-xs font-black uppercase tracking-widest">주차별 수업 계획 (Syllabus)</label>
                          <button
                            type="button"
                            onClick={() => {
                              const plan = updateClassData.weekly_plan || [];
                              setUpdateClassData({
                                ...updateClassData,
                                weekly_plan: [...plan, { week: plan.length + 1, topic: '', url: '', requires_result: true, requires_activity: true }]
                              });
                            }}
                            className="text-xs font-black px-3 py-1 bg-primary/10 rounded-lg hover:bg-primary hover:text-white transition-all"
                          >+ 주차 추가</button>
                        </div>
                        <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                          {(updateClassData.weekly_plan || []).map((item: any, idx: number) => (
                            <div key={idx} className="p-5 bg-neutral-50 rounded-2xl border border-neutral-200 space-y-4 relative group">
                              <button 
                                type="button"
                                onClick={() => {
                                  const plan = updateClassData.weekly_plan.filter((_: any, i: number) => i !== idx);
                                  setUpdateClassData({ ...updateClassData, weekly_plan: plan });
                                }}
                                className="absolute top-4 right-4 text-neutral-300 hover:text-error transition-colors"
                              ><X size={16} /></button>
                              
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-white border-2 border-neutral-100 rounded-xl flex flex-col items-center justify-center shrink-0">
                                  <span className="text-[10px] font-black text-neutral-500 uppercase">Week</span>
                                  <span className="text-sm font-black text-primary">{item.week}</span>
                                </div>
                                <div className="flex-1 space-y-4">
                                  <div className="space-y-1">
                                    <label className="text-xs font-black text-neutral-600 uppercase tracking-widest ml-1">수업 주제</label>
                                    <input 
                                      type="text" 
                                      value={item.topic} 
                                      onChange={(e) => {
                                        const plan = [...updateClassData.weekly_plan];
                                        plan[idx].topic = e.target.value;
                                        setUpdateClassData({ ...updateClassData, weekly_plan: plan });
                                      }}
                                      placeholder="예: 구운몽의 환상 구조 탐구"
                                      className="w-full px-4 py-2 bg-white border border-neutral-200 rounded-xl text-sm font-bold focus:border-primary/40 outline-none"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-xs font-black text-neutral-600 uppercase tracking-widest ml-1">자료 링크 (URL)</label>
                                    <input
                                      type="text"
                                      value={item.url || ''}
                                      disabled={!!item.material_id}
                                      onChange={(e) => {
                                        const plan = [...updateClassData.weekly_plan];
                                        plan[idx].url = e.target.value;
                                        plan[idx].material_id = '';
                                        setUpdateClassData({ ...updateClassData, weekly_plan: plan });
                                      }}
                                      placeholder={item.material_id ? '에디터 자료가 연결됨' : 'https://...'}
                                      className={`w-full px-4 py-2 border rounded-xl text-sm font-bold focus:border-primary/40 outline-none transition-all ${
                                        item.material_id
                                          ? 'bg-neutral-100 border-neutral-100 text-neutral-400 cursor-not-allowed'
                                          : 'bg-white border-neutral-200'
                                      }`}
                                    />
                                    <div className="flex items-center gap-4 mt-1">
                                      <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={item.requires_result !== false} onChange={(e) => {
                                          const plan = [...updateClassData.weekly_plan];
                                          plan[idx].requires_result = e.target.checked;
                                          setUpdateClassData({ ...updateClassData, weekly_plan: plan });
                                        }} className="w-3.5 h-3.5 rounded accent-primary" />
                                        <span className="text-xs font-black text-neutral-600">결과제출 필요</span>
                                      </label>
                                      <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={item.requires_activity !== false} onChange={(e) => {
                                          const plan = [...updateClassData.weekly_plan];
                                          plan[idx].requires_activity = e.target.checked;
                                          setUpdateClassData({ ...updateClassData, weekly_plan: plan });
                                        }} className="w-3.5 h-3.5 rounded accent-primary" />
                                        <span className="text-xs font-black text-neutral-600">활동기록 필요</span>
                                      </label>
                                    </div>
                                  </div>

                                  {/* ── 에디터 자료 연결 ── */}
                                  <div className="space-y-1">
                                    <label className="text-xs font-black text-neutral-600 uppercase tracking-widest ml-1">
                                      수업자료 에디터 연결 {editingClassMaterials.length === 0 && <span className="normal-case font-bold text-neutral-400">(에디터에서 작성한 자료 없음)</span>}
                                    </label>

                                    {item.material_id ? (
                                      /* 선택된 자료 표시 */
                                      <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border-2 border-primary/20 rounded-xl">
                                        <BookOpen size={14} className="text-primary shrink-0" />
                                        <span className="text-sm font-black text-primary flex-1 truncate">
                                          {editingClassMaterials.find(m => m.id === item.material_id)?.title || '선택된 자료'}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const plan = [...updateClassData.weekly_plan];
                                            plan[idx].material_id = '';
                                            setUpdateClassData({ ...updateClassData, weekly_plan: plan });
                                          }}
                                          className="p-0.5 text-neutral-400 hover:text-error transition-colors"
                                        >
                                          <X size={14} />
                                        </button>
                                      </div>
                                    ) : (
                                      /* 자료 선택 드롭다운 */
                                      <div className="relative">
                                        <button
                                          type="button"
                                          disabled={editingClassMaterials.length === 0}
                                          onClick={() => setMaterialDropdownIdx(materialDropdownIdx === idx ? null : idx)}
                                          className={`w-full flex items-center justify-between px-4 py-2 border rounded-xl text-sm font-bold transition-all ${
                                            editingClassMaterials.length === 0
                                              ? 'bg-neutral-50 border-neutral-100 text-neutral-300 cursor-not-allowed'
                                              : 'bg-white border-neutral-200 hover:border-primary/40 cursor-pointer'
                                          }`}
                                        >
                                          <span className="text-neutral-400">에디터 자료 선택...</span>
                                          <ChevronDown size={14} className="text-neutral-300" />
                                        </button>

                                        {materialDropdownIdx === idx && editingClassMaterials.length > 0 && (
                                          <div className="absolute top-full mt-1 left-0 right-0 bg-white rounded-xl shadow-xl border border-neutral-200 z-50 overflow-hidden max-h-48 overflow-y-auto">
                                            {editingClassMaterials.map(mat => (
                                              <button
                                                key={mat.id}
                                                type="button"
                                                onClick={() => {
                                                  const plan = [...updateClassData.weekly_plan];
                                                  plan[idx].material_id = mat.id;
                                                  plan[idx].url = '';
                                                  setUpdateClassData({ ...updateClassData, weekly_plan: plan });
                                                  setMaterialDropdownIdx(null);
                                                }}
                                                className="w-full text-left px-4 py-2.5 hover:bg-primary/5 transition-colors flex items-center gap-2"
                                              >
                                                <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary text-[10px] font-black flex items-center justify-center shrink-0">
                                                  {mat.week_number}
                                                </span>
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
                          {(!updateClassData.weekly_plan || updateClassData.weekly_plan.length === 0) && (
                            <div className="py-10 text-center border-2 border-dashed border-neutral-100 rounded-[1.5rem]">
                              <p className="text-xs font-bold text-neutral-400">등록된 주차별 계획이 없습니다. 상단 [+ 주차 추가] 버튼을 눌러보세요!</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ) : editModalTab === 'ai' ? (
                    <motion.div 
                      key="ai"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className="space-y-5"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between ml-1">
                          <label className="text-xs font-black text-primary uppercase tracking-widest">학생 활동 가이드 (Guide Prompt)</label>
                          <span className="text-xs text-neutral-500 font-bold">학생 입력 시 AI가 참고할 지침</span>
                        </div>
                        <textarea
                          value={updateClassData.student_guide_prompt}
                          onChange={e => { setUpdateClassData({...updateClassData, student_guide_prompt: e.target.value}); setGuideValidation(null); }}
                          className="w-full h-32 px-5 py-4 bg-neutral-100 border-2 border-neutral-200 hover:border-neutral-300 focus:border-primary/40 focus:bg-white rounded-2xl font-bold text-sm text-neutral-800 transition-all outline-none resize-none"
                          placeholder="학생들에게 강조하고 싶은 기록 요령을 입력하세요..."
                        />
                        <button
                          type="button"
                          disabled={isValidatingGuide || !updateClassData.student_guide_prompt?.trim()}
                          onClick={async () => {
                            setIsValidatingGuide(true);
                            setGuideValidation(null);
                            const result = await validateStudentGuidePrompt(updateClassData.student_guide_prompt);
                            setGuideValidation(result);
                            setIsValidatingGuide(false);
                          }}
                          className="mt-2 flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all border disabled:opacity-40 disabled:cursor-not-allowed bg-white border-primary/30 text-primary hover:bg-primary/5"
                        >
                          {isValidatingGuide ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                          {isValidatingGuide ? '검증 중...' : '가이드 동작 검증'}
                        </button>
                        {guideValidation && (
                          <div className={`mt-2 p-4 rounded-2xl border-2 text-sm font-bold space-y-1.5 ${guideValidation.feasible ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
                            <div className="flex items-center gap-2 font-black">
                              {guideValidation.feasible ? <CheckCircle2 size={15} className="text-emerald-600" /> : <AlertCircle size={15} className="text-rose-500" />}
                              {guideValidation.feasible ? 'AI가 이 가이드로 학생 제출물을 정상 판단할 수 있습니다' : 'AI가 이 가이드로 정확히 판단하기 어렵습니다'}
                            </div>
                            <p className="text-xs leading-relaxed">{guideValidation.message}</p>
                            {guideValidation.guide && (
                              <p className="text-xs leading-relaxed pt-1 border-t border-rose-200 text-rose-700">
                                💡 {guideValidation.guide}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between ml-1">
                          <label className="text-xs font-black text-secondary uppercase tracking-widest">
                            {updateClassData.class_type === 'homeroom' ? 'AI 행특 초안 작성 지침' : 'AI 세특 초안 작성 지침'}
                          </label>
                          <span className="text-xs text-neutral-500 font-bold">AI 분석 및 생성 시 적용할 스타일</span>
                        </div>
                        <textarea
                          value={updateClassData.teacher_report_prompt}
                          onChange={e => { setUpdateClassData({...updateClassData, teacher_report_prompt: e.target.value}); setPromptValidation(null); }}
                          className="w-full h-32 px-5 py-4 bg-neutral-100 border-2 border-neutral-200 hover:border-neutral-300 focus:border-secondary/40 focus:bg-white rounded-2xl font-bold text-sm text-neutral-800 transition-all outline-none resize-none"
                          placeholder="AI가 문구를 작성할 때 특별히 반영하길 원하는 스타일을 입력하세요..."
                        />
                        <button
                          type="button"
                          disabled={isValidatingPrompt || !updateClassData.teacher_report_prompt?.trim()}
                          onClick={async () => {
                            setIsValidatingPrompt(true);
                            setPromptValidation(null);
                            const result = await validateTeacherPrompt(updateClassData.teacher_report_prompt);
                            setPromptValidation(result);
                            setIsValidatingPrompt(false);
                          }}
                          className="mt-2 flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all border disabled:opacity-40 disabled:cursor-not-allowed bg-white border-secondary/30 text-secondary hover:bg-secondary/5"
                        >
                          {isValidatingPrompt ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                          {isValidatingPrompt ? '검증 중...' : '지침 동작 검증'}
                        </button>
                        {promptValidation && (
                          <div className={`mt-2 p-4 rounded-2xl border-2 text-sm font-bold space-y-1.5 ${promptValidation.feasible ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
                            <div className="flex items-center gap-2 font-black">
                              {promptValidation.feasible ? <CheckCircle2 size={15} className="text-emerald-600" /> : <AlertCircle size={15} className="text-rose-500" />}
                              {promptValidation.feasible ? '이 지침은 정상적으로 동작합니다' : '이 지침은 동작하지 않는 내용을 포함합니다'}
                            </div>
                            <p className="text-xs leading-relaxed">{promptValidation.message}</p>
                            {promptValidation.guide && (
                              <p className="text-xs leading-relaxed pt-1 border-t border-rose-200 text-rose-700">
                                💡 {promptValidation.guide}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between ml-1">
                          <label className="text-xs font-black text-rose-500 uppercase tracking-widest">최소 제출 글자수</label>
                          <span className="text-xs text-neutral-500 font-bold">미달 시 학생 제출 차단</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <input
                            type="number"
                            min={0}
                            max={500}
                            value={updateClassData.min_obs_chars || ''}
                            onChange={e => setUpdateClassData({...updateClassData, min_obs_chars: parseInt(e.target.value) || 0})}
                            placeholder="0"
                            className="w-40 px-5 py-3 bg-neutral-100 border-2 border-neutral-200 hover:border-rose-200 focus:border-rose-400 focus:bg-white rounded-2xl font-black text-sm outline-none transition-all"
                          />
                          <span className="text-xs font-bold text-neutral-500">자 미만 제출 차단 <span className="text-neutral-400">(0 = 제한 없음)</span></span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between ml-1">
                          <label className="text-xs font-black text-orange-500 uppercase tracking-widest">제출 금지어 (하드 차단)</label>
                          <span className="text-xs text-neutral-500 font-bold">포함 시 즉시 제출 차단</span>
                        </div>
                        <textarea
                          value={(updateClassData.blocked_keywords || []).join('\n')}
                          onChange={e => {
                            const raw = e.target.value;
                            const keywords = raw.split('\n').map((k: string) => k.trim()).filter(Boolean);
                            setUpdateClassData({...updateClassData, blocked_keywords: keywords});
                          }}
                          placeholder={"한 줄에 하나씩 입력\n예: 모름\n예: 복붙\n예: 없음"}
                          className="w-full h-28 px-5 py-4 bg-neutral-100 border-2 border-neutral-200 hover:border-orange-200 focus:border-orange-400 focus:bg-white rounded-2xl font-bold text-sm text-neutral-800 transition-all outline-none resize-none"
                        />
                        <span className="text-xs font-bold text-neutral-400 ml-1">입력한 단어/문장이 내용에 포함되면 AI 검토 없이 즉시 차단</span>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between px-1 py-1">
                          <div>
                            <p className="text-xs font-black text-primary uppercase tracking-widest">AI 내용 품질 검토</p>
                            <p className="text-xs font-bold text-neutral-400 mt-0.5">꺼두면 글자수·금지어만 차단</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setUpdateClassData({...updateClassData, ai_review_enabled: !(updateClassData.ai_review_enabled ?? true)})}
                            className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${(updateClassData.ai_review_enabled ?? true) ? 'bg-primary' : 'bg-neutral-300'}`}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${(updateClassData.ai_review_enabled ?? true) ? 'translate-x-6' : 'translate-x-0'}`} />
                          </button>
                        </div>
                        <div className={`rounded-2xl px-4 py-3 text-xs font-bold leading-relaxed transition-colors ${(updateClassData.ai_review_enabled ?? true) ? 'bg-primary/5 text-primary/80 border border-primary/10' : 'bg-neutral-100 text-neutral-400 border border-neutral-200'}`}>
                          {(updateClassData.ai_review_enabled ?? true) ? (
                            <>
                              <span className="font-black">ON</span> — 학생이 제출하면 AI가 내용의 구체성·관련성을 판단합니다.<br />
                              교사 지침에 맞지 않으면 자동으로 <span className="font-black">반려 플래그</span>가 붙어 교사 화면에 표시됩니다.<br />
                              <span className="text-primary/50 text-[11px]">※ 글자수·금지어 차단은 AI와 무관하게 항상 작동합니다.</span>
                            </>
                          ) : (
                            <>
                              <span className="font-black">OFF</span> — AI 검토 없이 글자수·금지어 조건만 통과하면 즉시 승인됩니다.<br />
                              <span className="text-[11px]">Gemini API가 호출되지 않으므로 비용이 발생하지 않습니다.</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between px-1 py-1">
                          <div>
                            <p className="text-xs font-black text-primary uppercase tracking-widest">학교 공유페이지 - 학습 여정 탭 표시</p>
                            <p className="text-xs font-bold text-neutral-400 mt-0.5">클래스로그 도입 전 수업 등 여정 표시가 애매하면 꺼두세요</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setUpdateClassData({...updateClassData, show_learning_journey: !(updateClassData.show_learning_journey ?? true)})}
                            className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${(updateClassData.show_learning_journey ?? true) ? 'bg-primary' : 'bg-neutral-300'}`}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${(updateClassData.show_learning_journey ?? true) ? 'translate-x-6' : 'translate-x-0'}`} />
                          </button>
                        </div>
                        <div className={`rounded-2xl px-4 py-3 text-xs font-bold leading-relaxed transition-colors ${(updateClassData.show_learning_journey ?? true) ? 'bg-primary/5 text-primary/80 border border-primary/10' : 'bg-neutral-100 text-neutral-400 border border-neutral-200'}`}>
                          {(updateClassData.show_learning_journey ?? true) ? (
                            <>
                              <span className="font-black">ON</span> — 학교 전체 공유페이지(/school-share)에서 이 학급의 <span className="font-black">학습 여정</span> 탭이 학부모/선생님에게 노출됩니다.
                            </>
                          ) : (
                            <>
                              <span className="font-black">OFF</span> — 학습 여정 탭이 숨겨지고, 공유페이지는 결과 확인 탭부터 보여집니다.
                            </>
                          )}
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between px-1 py-1">
                          <div>
                            <p className="text-xs font-black text-primary uppercase tracking-widest">학교 공유페이지 - 출석 요약 표시</p>
                            <p className="text-xs font-bold text-neutral-400 mt-0.5">학생별 상세 없이 학급 전체 출석 통계만 노출됩니다</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setUpdateClassData({...updateClassData, show_attendance_summary: !(updateClassData.show_attendance_summary ?? true)})}
                            className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${(updateClassData.show_attendance_summary ?? true) ? 'bg-primary' : 'bg-neutral-300'}`}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${(updateClassData.show_attendance_summary ?? true) ? 'translate-x-6' : 'translate-x-0'}`} />
                          </button>
                        </div>
                        <div className={`rounded-2xl px-4 py-3 text-xs font-bold leading-relaxed transition-colors ${(updateClassData.show_attendance_summary ?? true) ? 'bg-primary/5 text-primary/80 border border-primary/10' : 'bg-neutral-100 text-neutral-400 border border-neutral-200'}`}>
                          {(updateClassData.show_attendance_summary ?? true) ? (
                            <>
                              <span className="font-black">ON</span> — 공유페이지에 학급 전체 <span className="font-black">출석률·상태별 건수</span> 요약 카드가 노출됩니다.
                            </>
                          ) : (
                            <>
                              <span className="font-black">OFF</span> — 출석 요약 카드가 숨겨집니다.
                            </>
                          )}
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="px-1 py-1">
                          <p className="text-xs font-black text-primary uppercase tracking-widest">학교 공유페이지 - 설문 결과 공개</p>
                          <p className="text-xs font-bold text-neutral-400 mt-0.5">선택한 설문 1개의 집계 결과만 노출됩니다 (응답자 이름은 노출되지 않음)</p>
                        </div>
                        <select
                          value={updateClassData.shared_survey_form_id || ''}
                          onChange={e => setUpdateClassData({...updateClassData, shared_survey_form_id: e.target.value || null})}
                          className="w-full px-5 py-3.5 bg-neutral-100 border-2 border-neutral-200 hover:border-neutral-300 focus:border-primary/40 focus:bg-white rounded-xl font-bold text-neutral-900 transition-all outline-none"
                        >
                          <option value="">공개 안 함</option>
                          {editingClassSurveyForms.map(f => (
                            <option key={f.id} value={f.id}>{f.title}</option>
                          ))}
                        </select>
                        {editingClassSurveyForms.length === 0 && (
                          <p className="text-xs font-bold text-neutral-400 ml-1">이 학급에 생성된 설문이 아직 없습니다.</p>
                        )}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => {
                    setIsUpdateModalOpen(false);
                    setEditModalTab('basic');
                  }} className="flex-1 py-4 bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 rounded-2xl font-black text-neutral-700 transition-all">취소</button>
                  <button type="submit" className="flex-1 py-4 bg-primary hover:bg-primary/90 text-white rounded-2xl font-black shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-95">설정 저장하기</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {classInfo && (
          <ClassroomFabMenu
            onOpenStudentPreview={students.length > 0 ? () => setIsStudentPreviewOpen(true) : undefined}
            onOpenQR={classInfo.class_type !== 'homeroom' ? () => setIsQRModalOpen(true) : undefined}
            onOpenResources={() => {
              if (activeClassId) fetchResources(activeClassId);
              setIsResourceModalOpen(true);
            }}
            onCopyLink={handleCopyLink}
            copySuccess={copySuccess}
            onShareTeacher={handleShareTeacher}
            shareTeacherSuccess={shareTeacherSuccess}
            onOpenTeacherShareQR={() => setIsTeacherShareQRModalOpen(true)}
            onExport={classInfo.class_type !== 'homeroom' ? handleExportCSV : undefined}
          />
        )}

        {isStudentPreviewOpen && activeClassId && students.length > 0 && (
          <StudentPreviewModal
            classId={activeClassId}
            students={students.map(s => ({ id: s.id, name: s.name, number: s.number }))}
            onClose={() => setIsStudentPreviewOpen(false)}
          />
        )}

        {isQRModalOpen && classInfo && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-on-surface/40 backdrop-blur-xl" onClick={() => setIsQRModalOpen(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm glass p-10 rounded-[2rem] text-center space-y-8 relative shadow-2xl border border-white/20" onClick={e => e.stopPropagation()}>
              <button onClick={() => setIsQRModalOpen(false)} className="absolute top-6 right-6 p-2 rounded-full hover:bg-surface-container transition-all"><X size={24} /></button>
              <div className="space-y-2">
                <h3 className="text-3xl font-black font-manrope">{classInfo.name}</h3>
                <p className="text-on-surface-variant font-bold">학생 입장용 QR 코드</p>
              </div>
              <div className="bg-white p-6 rounded-[1.75rem] shadow-inner inline-block aspect-square">
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`https://classlog-ai.vercel.app/classroom-entry?code=${classInfo.entry_code}`)}`} alt="QR Code" className="w-full h-full object-contain" />
              </div>
              <div className="bg-primary/5 p-6 rounded-2xl space-y-2">
                <p className="text-xs font-black text-primary uppercase tracking-widest">입장 코드</p>
                <p className="text-4xl font-black font-manrope text-primary tracking-[0.2em]">{classInfo.entry_code}</p>
              </div>
            </motion.div>
          </div>
        )}

        {isTeacherShareQRModalOpen && classInfo && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-on-surface/40 backdrop-blur-xl" onClick={() => setIsTeacherShareQRModalOpen(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm glass p-10 rounded-[2rem] text-center space-y-8 relative shadow-2xl border border-white/20" onClick={e => e.stopPropagation()}>
              <button onClick={() => setIsTeacherShareQRModalOpen(false)} className="absolute top-6 right-6 p-2 rounded-full hover:bg-surface-container transition-all"><X size={24} /></button>
              <div className="space-y-2">
                <h3 className="text-3xl font-black font-manrope">{classInfo.name}</h3>
                <p className="text-on-surface-variant font-bold">학교 선생님 공유용 QR 코드</p>
              </div>
              <div className="bg-white p-6 rounded-[1.75rem] shadow-inner inline-block aspect-square">
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`https://classlog-ai.vercel.app/share/${classInfo.id}`)}`} alt="QR Code" className="w-full h-full object-contain" />
              </div>
              <p className="text-xs font-bold text-on-surface-variant/60 leading-relaxed">
                이 QR을 스캔하면 로그인 없이<br />학급 공유 페이지로 바로 이동합니다.
              </p>
            </motion.div>
          </div>
        )}

        {/* 학생 명찰 관리 모달 (개별 추가/일괄 등록) */}
        {isStudentModalOpen && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-on-surface/40 backdrop-blur-xl" onClick={() => setIsStudentModalOpen(false)}>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-lg surface-card shadow-2xl p-10 rounded-[2rem] space-y-8 relative" onClick={e => e.stopPropagation()}>
              <button onClick={() => setIsStudentModalOpen(false)} className="absolute top-8 right-8 p-2 rounded-full hover:bg-surface-container transition-all"><X size={24} /></button>
              <h3 className="text-3xl font-black font-manrope">학생 명단 관리</h3>
              <div className="flex p-1 bg-surface-container rounded-2xl mb-6">
                <button onClick={() => setRegisterMode('bulk')} className={`flex-1 py-3 text-sm font-black rounded-xl transition-all ${registerMode === 'bulk' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant'}`}>명렬표 일괄 붙여넣기</button>
                <button onClick={() => setRegisterMode('single')} className={`flex-1 py-3 text-sm font-black rounded-xl transition-all ${registerMode === 'single' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant'}`}>개별 추가</button>
              </div>
              {registerMode === 'bulk' ? (
                <div className="space-y-4">
                  <textarea value={bulkNames} onChange={(e) => setBulkNames(e.target.value)} placeholder="홍길동&#10;김철수..." className="w-full h-48 px-6 py-4 bg-neutral-100 border-2 border-transparent focus:border-primary/20 rounded-2xl text-sm font-bold focus:bg-white border-none resize-none transition-all shadow-inner" />
                  <button onClick={handleBulkRegister} className="w-full py-5 btn-gradient rounded-2xl font-black text-lg shadow-xl shadow-primary/20">총 {bulkNames.split('\n').filter(n => n.trim()).length}명 등록하기</button>
                </div>
              ) : (
                <form onSubmit={handleAddStudent} className="space-y-4">
                  <input type="text" value={newStudentData.name} onChange={(e) => setNewStudentData({...newStudentData, name: e.target.value})} placeholder="이름" className="w-full px-6 py-4 bg-neutral-100 border-2 border-transparent focus:border-primary/20 rounded-2xl font-bold transition-all focus:bg-white" required />
                  <input type="text" value={newStudentData.number} onChange={(e) => setNewStudentData({...newStudentData, number: e.target.value})} placeholder="번호" className="w-full px-6 py-4 bg-neutral-100 border-2 border-transparent focus:border-primary/20 rounded-2xl font-bold transition-all focus:bg-white" />
                  <button type="submit" className="w-full py-5 btn-gradient rounded-2xl font-black text-lg shadow-xl shadow-primary/20">학생 추가하기</button>
                </form>
              )}
            </motion.div>
          </div>
        )}

        {isArchiveModalOpen && (() => {
          const closedClasses = classes.filter(isClassClosed);
          const today = getTodayStr();
          return (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-on-surface/40 backdrop-blur-xl" onClick={() => setIsArchiveModalOpen(false)}>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-2xl glass p-10 rounded-[2rem] space-y-6 relative shadow-2xl border border-white/20" onClick={e => e.stopPropagation()}>
              <button onClick={() => setIsArchiveModalOpen(false)} className="absolute top-8 right-8 p-2 rounded-full hover:bg-surface-container transition-all"><X size={24} /></button>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-secondary/10 rounded-2xl flex items-center justify-center text-secondary shadow-sm">
                  {archiveModalTab === 'archived' ? <Archive size={24} /> : <Lock size={24} />}
                </div>
                <div className="space-y-1">
                  <h3 className="text-3xl font-black font-manrope">{archiveModalTab === 'archived' ? '학급 아카이브함' : '종료된 학급'}</h3>
                  <p className="text-xs font-bold text-on-surface-variant/80 uppercase tracking-widest">
                    {archiveModalTab === 'archived' ? '아카이브된 학급 목록' : '수업이 종료되었지만 데이터는 남아있는 학급'}
                  </p>
                </div>
              </div>

              {/* 탭 스위처 */}
              <div className="flex gap-2 p-1.5 bg-surface-container rounded-2xl w-fit">
                <button
                  onClick={() => setArchiveModalTab('archived')}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${archiveModalTab === 'archived' ? 'bg-white shadow-sm text-secondary' : 'text-on-surface-variant/60 hover:text-on-surface'}`}
                >
                  아카이브함 {archivedClasses.length > 0 && `(${archivedClasses.length})`}
                </button>
                <button
                  onClick={() => setArchiveModalTab('closed')}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${archiveModalTab === 'closed' ? 'bg-white shadow-sm text-secondary' : 'text-on-surface-variant/60 hover:text-on-surface'}`}
                >
                  종료된 학급 {closedClasses.length > 0 && `(${closedClasses.length})`}
                </button>
              </div>

              <div className="space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                {archiveModalTab === 'archived' ? (
                  archiveLoading ? (
                    <div className="py-20 text-center space-y-4 opacity-70">
                      <RefreshCcw size={40} className="mx-auto animate-spin" />
                      <p className="text-xs font-black uppercase tracking-widest">아카이브 불러오는 중...</p>
                    </div>
                  ) : archivedClasses.length > 0 ? (
                    archivedClasses.map(c => (
                      <div key={c.id} className="flex items-center justify-between p-6 bg-white/60 rounded-[1.5rem] border border-surface-container-high transition-all hover:bg-white hover:shadow-soft">
                        <div className="flex items-center gap-5">
                           <div className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center text-on-surface-variant/60"><GraduationCap size={24} /></div>
                           <div className="flex flex-col">
                              <h4 className="text-lg font-black tracking-tight">{c.name}</h4>
                              <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant/70">{c.subject}</p>
                           </div>
                        </div>
                        <div className="flex items-center gap-2">
                           <button onClick={() => handleRestoreClass(c.id)} className="flex items-center gap-2 px-5 py-2.5 bg-primary/5 hover:bg-primary/10 text-primary rounded-xl text-xs font-black border border-primary/10 transition-all">
                              <RefreshCcw size={14} /> 복원하기
                           </button>
                           <button onClick={() => handlePermanentDelete(c.id, c.name)} className="p-2.5 hover:bg-error/10 text-error/60 hover:text-error transition-all rounded-xl" title="영구 삭제">
                              <Trash2 size={16} />
                           </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-20 text-center space-y-6 flex flex-col items-center">
                      <div className="w-20 h-20 bg-surface-container rounded-[1.5rem] flex items-center justify-center opacity-50"><Archive size={32} /></div>
                      <div className="space-y-2">
                        <p className="text-base font-black tracking-tight">아카이브함이 비어 있습니다.</p>
                        <p className="text-xs font-bold text-on-surface-variant/60 uppercase tracking-widest">아카이브된 학급이 없습니다.</p>
                      </div>
                    </div>
                  )
                ) : (
                  closedClasses.length > 0 ? (
                    closedClasses.map(c => {
                      const autoClosedByDate = c.end_date && c.end_date < today;
                      const canResume = c.is_closed && !autoClosedByDate;
                      return (
                        <div key={c.id} className="flex items-center justify-between p-6 bg-white/60 rounded-[1.5rem] border border-surface-container-high transition-all hover:bg-white hover:shadow-soft gap-4">
                          <div className="flex items-center gap-5 min-w-0">
                             <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center text-rose-400 shrink-0"><Lock size={20} /></div>
                             <div className="flex flex-col min-w-0">
                                <h4 className="text-lg font-black tracking-tight truncate">{c.name}</h4>
                                <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant/70 truncate">{c.subject}</p>
                                <p className="text-[11px] font-bold text-rose-400 mt-1">
                                  {autoClosedByDate ? `종료일(${c.end_date}) 경과로 자동 종료` : '선생님이 수업 종료를 선언함'}
                                </p>
                             </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                             <button onClick={() => { setActiveClassId(c.id); setIsArchiveModalOpen(false); }} className="flex items-center gap-2 px-5 py-2.5 bg-primary/5 hover:bg-primary/10 text-primary rounded-xl text-xs font-black border border-primary/10 transition-all">
                                열기
                             </button>
                             {canResume ? (
                               <button onClick={() => handleToggleClassClosed(c.id, true)} className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-xl text-xs font-black border border-rose-100 transition-all">
                                  <Unlock size={13} /> 수업 재개
                               </button>
                             ) : (
                               <button onClick={() => handleOpenEditClass(c)} title="종료일을 변경하려면 학급 설정을 여세요" className="p-2.5 hover:bg-surface-container text-on-surface-variant/60 hover:text-on-surface transition-all rounded-xl">
                                  <Settings2 size={16} />
                               </button>
                             )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-20 text-center space-y-6 flex flex-col items-center">
                      <div className="w-20 h-20 bg-surface-container rounded-[1.5rem] flex items-center justify-center opacity-50"><Lock size={32} /></div>
                      <div className="space-y-2">
                        <p className="text-base font-black tracking-tight">종료된 학급이 없습니다.</p>
                        <p className="text-xs font-bold text-on-surface-variant/60 uppercase tracking-widest">진행 중인 학급만 있어요.</p>
                      </div>
                    </div>
                  )
                )}
              </div>

              {archiveModalTab === 'archived' && (
                <div className="bg-error/5 p-6 rounded-2xl flex items-start gap-4 border border-error/10">
                  <AlertCircle size={20} className="text-error/70 mt-0.5" />
                  <p className="text-xs text-error/70 leading-relaxed font-bold">
                    아카이브함의 학급을 영구 삭제하면 학생 명단과 해당 학급에 기록된 모든 관찰 데이터가 영구적으로 손실됩니다. <br />
                    중요한 데이터는 사전에 [데이터 내보내기] 기능을 통해 백업하세요.
                  </p>
                </div>
              )}
            </motion.div>
          </div>
          );
        })()}

        {/* 이동 중 브리핑 모달 */}
        {isBriefingOpen && activeClassId && classInfo && (
          <BriefingModal
            classId={activeClassId}
            className={classInfo.name + (classInfo.subject ? ` · ${classInfo.subject}` : '')}
            onClose={() => setIsBriefingOpen(false)}
          />
        )}

        {/* 보드 카드 상세 모달 */}
        {boardSelectedPost && (() => {
          const p = boardSelectedPost;
          const isObs = p._type === 'obs';
          return (
            <>
              <motion.div
                key="board-backdrop"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setBoardSelectedPost(null)}
                className="fixed inset-0 z-[2000] bg-black/50 backdrop-blur-sm"
              />
              <motion.div
                key="board-modal"
                initial={{ opacity: 0, scale: 0.92, y: 24 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 24 }}
                transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                className="fixed inset-0 z-[2000] flex items-center justify-center p-4 pointer-events-none"
              >
                <div
                  onClick={e => e.stopPropagation()}
                  className={`pointer-events-auto w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border-2 shadow-2xl bg-white ${
                    isObs ? 'border-violet-200' : 'border-emerald-200'
                  }`}
                >
                  {/* 모달 헤더 */}
                  <div className={`sticky top-0 flex items-center justify-between gap-3 px-6 py-4 border-b ${
                    isObs ? 'bg-violet-50 border-violet-100' : 'bg-emerald-50 border-emerald-100'
                  }`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-base shrink-0 ${
                        isObs ? 'bg-violet-100' : 'bg-emerald-100'
                      }`}>
                        {isObs ? '📝' : '📁'}
                      </div>
                      <div className="min-w-0">
                        <p className="font-black truncate">{p.student_name}</p>
                        <p className="text-[11px] text-on-surface-variant font-bold">
                          {p.week_number ? `${p.week_number}주차 · ` : ''}
                          {new Date(p.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
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
                  <div className="p-6 space-y-5">
                    <h2 className="text-lg font-black leading-snug">
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
                      <div className="space-y-1.5">
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
                      <div key={sub.id} className={arr.length > 1 ? `space-y-3 ${idx > 0 ? 'pt-4 border-t border-dashed border-surface-container-high' : ''}` : 'space-y-3'}>
                        {arr.length > 1 && (
                          <p className="text-[10px] font-black text-on-surface-variant/60 uppercase tracking-widest">
                            {idx + 1}번째 제출 · {new Date(sub.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                        {sub.text_content && (
                          <div className="space-y-1.5">
                            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">내용</p>
                            <p className="text-sm text-on-surface-variant font-bold leading-relaxed whitespace-pre-wrap">{sub.text_content}</p>
                          </div>
                        )}
                        {sub.image_urls?.length > 0 && (
                          <ImageCarousel
                            urls={sub.image_urls}
                            thumbClassName="w-full rounded-2xl object-contain max-h-96 cursor-zoom-in"
                          />
                        )}
                        {sub.link_url && (
                          <a href={sub.link_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 font-black text-sm hover:bg-blue-100 transition-all">
                            <ExternalLink size={15} /><span className="truncate">{sub.link_url}</span>
                          </a>
                        )}
                        {sub._group && sub._group.filter((r: any) => r.result_type === 'link' && r.link_url !== sub.link_url).map((r: any) => (
                          <a key={r.id} href={r.link_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 font-black text-sm hover:bg-blue-100 transition-all">
                            <ExternalLink size={15} /><span className="truncate">{r.link_url}</span>
                          </a>
                        ))}
                        {sub.file_url && (
                          <div className="w-full flex items-center gap-2 px-4 py-3.5 bg-amber-50 border border-amber-100 rounded-2xl">
                            <File size={16} className="text-amber-500 shrink-0" />
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

        {/* 수업 자료실 모달 */}
        {isResourceModalOpen && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-on-surface/40 backdrop-blur-xl" onClick={() => { setIsResourceModalOpen(false); setShowAddGeneralForm(false); }}>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-lg glass p-8 rounded-[2rem] space-y-6 relative shadow-2xl border border-white/20" onClick={e => e.stopPropagation()}>
              <button onClick={() => { setIsResourceModalOpen(false); setShowAddGeneralForm(false); }} className="absolute top-6 right-6 p-2 rounded-full hover:bg-surface-container transition-all"><X size={22} /></button>

              {/* 헤더 */}
              <div className="pr-8">
                <h3 className="text-2xl font-black font-manrope">수업 자료실</h3>
                <p className="text-xs text-on-surface-variant/60 mt-0.5">클릭하면 새 탭으로 열립니다</p>
              </div>

              {/* 목록 */}
              {(() => {
                // 서브클래스면 부모 weekly_plan, 아니면 본인 weekly_plan 사용
                const effectivePlan = classInfo?.parent_class_id
                  ? parentWeeklyPlan
                  : (classInfo?.weekly_plan || []);
                // weekly_plan 에서 url 또는 material_id 가 있는 항목만 추출
                const planItems: any[] = effectivePlan.filter(
                  (p: any) => p.url?.trim() || p.material_id
                );
                const hasAnything = planItems.length > 0;

                return (
                  <div className="space-y-2 max-h-[55vh] overflow-y-auto custom-scrollbar pr-1">

                    {/* 주차별 자료 (weekly_plan 기반) */}
                    {planItems.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-black text-on-surface-variant/50 uppercase tracking-widest px-1">주차별 자료</p>
                        {planItems.map((item: any) => {
                          const isMaterial = !!item.material_id;
                          const matInfo = isMaterial
                            ? classMaterials.find((m: any) => m.id === item.material_id)
                            : null;

                          return (
                            <button
                              key={`plan-${item.week}`}
                              onClick={() => {
                                if (isMaterial) {
                                  if (matInfo) {
                                    setFullscreenMaterial({ title: matInfo.title, content: matInfo.content || '', weekNumber: item.week, activity_urls: matInfo.activity_urls });
                                  } else {
                                    showToast('연결된 자료가 삭제되었습니다. 학급 수정에서 다시 연결해주세요.');
                                  }
                                } else {
                                  window.open(item.url, '_blank');
                                }
                              }}
                              className={`w-full flex items-center gap-3 p-4 bg-white rounded-2xl border border-surface-container-high group transition-all text-left ${
                                isMaterial && !matInfo ? 'opacity-50' : isMaterial ? 'hover:bg-secondary/5' : 'hover:bg-primary/5'
                              }`}
                            >
                              {/* 아이콘 */}
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                isMaterial ? 'bg-secondary/10' : 'bg-primary/10'
                              }`}>
                                {isMaterial
                                  ? <BookOpen size={16} className="text-secondary" />
                                  : <Link2 size={16} className="text-primary" />
                                }
                              </div>

                              {/* 텍스트 */}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-black truncate">
                                  {isMaterial
                                    ? (matInfo ? (matInfo.title || '수업 자료 에디터') : '연결된 자료가 삭제됨')
                                    : (item.topic || item.url)
                                  }
                                </p>
                                <p className="text-[10px] text-on-surface-variant/50 truncate">
                                  {item.week}주차
                                  {item.topic && !isMaterial && ` · ${item.topic}`}
                                  {isMaterial ? ' · 수업 자료 에디터' : ` · ${item.url}`}
                                </p>
                              </div>

                              {/* 뱃지 + 아이콘 */}
                              <div className="flex items-center gap-2 shrink-0">
                                {isMaterial && matInfo?.is_published && (
                                  <span className="text-[9px] font-black px-1.5 py-0.5 bg-secondary/10 text-secondary rounded-md">공개</span>
                                )}
                                {isMaterial
                                  ? <Maximize2 size={14} className="text-on-surface-variant/30 group-hover:text-secondary transition-colors" />
                                  : <ExternalLink size={14} className="text-on-surface-variant/30 group-hover:text-primary transition-colors" />
                                }
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* 빈 상태 */}
                    {!hasAnything && (
                      <div className="text-center py-6 text-on-surface-variant/30">
                        <BookOpen size={28} className="mx-auto mb-2 opacity-30" />
                        <p className="text-sm font-black">주차별 자료 없음</p>
                        <p className="text-xs mt-0.5">학급 수정에서 주차별 계획에 URL 또는 에디터를 연결해보세요</p>
                      </div>
                    )}

                    {/* ── 자료 에디터 섹션 ── */}
                    <div className="pt-2">
                      <div className="flex items-center justify-between mb-2 px-1">
                        <p className="text-[10px] font-black text-on-surface-variant/50 uppercase tracking-widest">자료 에디터</p>
                        <button
                          onClick={() => setShowEditorMatPicker(true)}
                          className="flex items-center gap-1 text-[10px] font-black text-secondary hover:bg-secondary/10 px-2 py-1 rounded-lg transition-all"
                        >
                          <Plus size={11} /> 추가
                        </button>
                      </div>

                      {classMaterials.length === 0 ? (
                        <div className="text-center py-6 text-on-surface-variant/30">
                          <BookOpen size={28} className="mx-auto mb-2 opacity-30" />
                          <p className="text-xs font-black">등록된 자료 에디터 자료가 없습니다</p>
                        </div>
                      ) : (() => {
                        const matsWithLinks = classMaterials.map((mat: any) => ({
                          mat,
                          linkedWeeks: effectivePlan.filter((p: any) => p.material_id === mat.id).map((p: any) => p.week),
                        }));
                        const unlinkedMats = matsWithLinks.filter(({ linkedWeeks }) => linkedWeeks.length === 0);
                        const linkedMats = matsWithLinks.filter(({ linkedWeeks }) => linkedWeeks.length > 0);

                        const renderMatRow = ({ mat, linkedWeeks }: { mat: any; linkedWeeks: number[] }) => (
                          <div key={mat.id} className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-surface-container-high group">
                            <button
                              onClick={() => setFullscreenMaterial({ title: mat.title, content: mat.content || '', weekNumber: linkedWeeks.length === 1 ? linkedWeeks[0] : undefined, activity_urls: mat.activity_urls })}
                              className="flex items-center gap-3 flex-1 min-w-0 text-left"
                            >
                              <div className="w-8 h-8 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center shrink-0">
                                <BookOpen size={14} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-black truncate group-hover:text-secondary transition-colors">{mat.title}</p>
                                  {linkedWeeks.length > 0 && (
                                    <span className="text-[9px] font-black px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded-md shrink-0">{linkedWeeks.join(', ')}주차 연결됨</span>
                                  )}
                                </div>
                                {mat.week_number != null && (
                                  <p className="text-[10px] text-on-surface-variant/50 truncate">{mat.week_number}주차</p>
                                )}
                              </div>
                            </button>
                            {(classInfo?.teacher_id === user?.id || classInfo?.assigned_teacher_id === user?.id) && (
                              <>
                                <button
                                  onClick={() => handleToggleEditorMatPublish(mat)}
                                  disabled={togglingEditorMatId === mat.id}
                                  title={mat.is_published ? '비공개로 전환' : '학생에게 공개'}
                                  className={`shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-black text-xs transition-colors ${
                                    mat.is_published
                                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                      : 'bg-surface-container text-on-surface-variant hover:bg-primary/10 hover:text-primary'
                                  }`}
                                >
                                  {togglingEditorMatId === mat.id ? (
                                    <Loader2 size={13} className="animate-spin" />
                                  ) : mat.is_published ? (
                                    <><Unlock size={13} /> 공개 중</>
                                  ) : (
                                    <><Lock size={13} /> 비공개</>
                                  )}
                                </button>
                                <button
                                  onClick={() => handleDeleteEditorMat(mat.id)}
                                  disabled={deletingEditorMatId === mat.id}
                                  className="p-2.5 text-error bg-error/10 hover:bg-error/20 rounded-xl transition-all shrink-0"
                                >
                                  {deletingEditorMatId === mat.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                </button>
                              </>
                            )}
                          </div>
                        );

                        return (
                          <div className="space-y-1.5">
                            {unlinkedMats.map(renderMatRow)}

                            {linkedMats.length > 0 && (
                              <div className="pt-1">
                                <button
                                  onClick={() => setShowLinkedEditorMats(v => !v)}
                                  className="w-full flex items-center gap-1.5 px-1 py-1.5 text-[10px] font-black text-on-surface-variant/50 hover:text-on-surface-variant transition-colors"
                                >
                                  <ChevronDown size={12} className={`transition-transform ${showLinkedEditorMats ? '' : '-rotate-90'}`} />
                                  주차에 연결된 자료 ({linkedMats.length})
                                </button>
                                {showLinkedEditorMats && (
                                  <div className="space-y-1.5 mt-1.5">
                                    {linkedMats.map(renderMatRow)}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* ── 학습 도구 섹션 ── */}
                    {(classInfo?.teacher_id === user?.id || classInfo?.assigned_teacher_id === user?.id) && (
                      <div className="pt-2">
                        <div className="flex items-center justify-between mb-2 px-1">
                          <p className="text-[10px] font-black text-on-surface-variant/50 uppercase tracking-widest">학습 도구</p>
                        </div>
                        <div className="space-y-1.5">
                          {LEARNING_TOOLS.map(tool => {
                            const isPublished = !!enabledTools[tool.id];
                            return (
                              <div key={tool.id} className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-surface-container-high">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <div className="w-8 h-8 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center shrink-0">
                                    {tool.icon}
                                  </div>
                                  <p className="text-sm font-black truncate">{tool.label}</p>
                                </div>
                                <button
                                  onClick={() => handleToggleTool(tool.id)}
                                  disabled={togglingToolId === tool.id}
                                  title={isPublished ? '비공개로 전환' : '학생에게 공개'}
                                  className={`shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-black text-xs transition-colors ${
                                    isPublished
                                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                      : 'bg-surface-container text-on-surface-variant hover:bg-primary/10 hover:text-primary'
                                  }`}
                                >
                                  {togglingToolId === tool.id ? (
                                    <Loader2 size={13} className="animate-spin" />
                                  ) : isPublished ? (
                                    <><Unlock size={13} /> 공개 중</>
                                  ) : (
                                    <><Lock size={13} /> 비공개</>
                                  )}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* ── 일반 자료 섹션 ── */}
                    <div className="pt-2">
                      <div className="flex items-center justify-between mb-2 px-1">
                        <p className="text-[10px] font-black text-on-surface-variant/50 uppercase tracking-widest">일반 자료</p>
                        <button
                          onClick={() => {
                            if (showAddGeneralForm && !editingGeneralMatId) {
                              setShowAddGeneralForm(false);
                            } else {
                              setEditingGeneralMatId(null);
                              setGeneralMatForm({ title: '', type: 'link', url: '', file: null });
                              setShowAddGeneralForm(true);
                            }
                          }}
                          className="flex items-center gap-1 text-[10px] font-black text-primary hover:bg-primary/10 px-2 py-1 rounded-lg transition-all"
                        >
                          <Plus size={11} /> 추가
                        </button>
                      </div>

                      {/* 추가/수정 폼 */}
                      {showAddGeneralForm && (
                        <div className="mb-3 p-4 bg-primary/5 border border-primary/20 rounded-2xl space-y-3">
                          {editingGeneralMatId && (
                            <p className="text-xs font-black text-primary">자료 수정 중</p>
                          )}
                          <input
                            type="text"
                            placeholder="자료 제목"
                            value={generalMatForm.title}
                            onChange={e => setGeneralMatForm(f => ({ ...f, title: e.target.value }))}
                            className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-xl text-sm font-bold focus:border-primary/40 outline-none"
                          />
                          <div className="flex gap-2">
                            <button
                              disabled={!!editingGeneralMatId}
                              onClick={() => setGeneralMatForm(f => ({ ...f, type: 'link', file: null }))}
                              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black border-2 transition-all ${generalMatForm.type === 'link' ? 'border-primary bg-primary text-white' : 'border-neutral-200 text-neutral-400 hover:border-primary/30'} ${!!editingGeneralMatId && generalMatForm.type !== 'link' ? 'opacity-30 cursor-not-allowed hover:border-neutral-200' : ''}`}
                            >
                              <Link2 size={12} /> 링크
                            </button>
                            <button
                              disabled={!!editingGeneralMatId}
                              onClick={() => setGeneralMatForm(f => ({ ...f, type: 'file', url: '' }))}
                              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black border-2 transition-all ${generalMatForm.type === 'file' ? 'border-primary bg-primary text-white' : 'border-neutral-200 text-neutral-400 hover:border-primary/30'} ${!!editingGeneralMatId && generalMatForm.type !== 'file' ? 'opacity-30 cursor-not-allowed hover:border-neutral-200' : ''}`}
                            >
                              <Upload size={12} /> 파일
                            </button>
                          </div>
                          {generalMatForm.type === 'link' ? (
                            <input
                              type="url"
                              placeholder="https://..."
                              value={generalMatForm.url}
                              onChange={e => setGeneralMatForm(f => ({ ...f, url: e.target.value }))}
                              className="w-full px-3 py-2 bg-white border border-neutral-200 rounded-xl text-sm font-bold focus:border-primary/40 outline-none"
                            />
                          ) : (
                            (() => {
                              const overLimit = !!generalMatForm.file && generalMatForm.file.size > 50 * 1024 * 1024;
                              const sizeMB = generalMatForm.file ? (generalMatForm.file.size / (1024 * 1024)).toFixed(1) : null;
                              const editingFileName = editingGeneralMatId ? generalMaterials.find(m => m.id === editingGeneralMatId)?.file_name : null;
                              return (
                                <div className="space-y-1">
                                  {editingFileName && !generalMatForm.file && (
                                    <p className="text-[11px] font-bold text-on-surface-variant/60">현재 파일: {editingFileName} (새 파일을 선택하면 교체됩니다)</p>
                                  )}
                                  <label className={`flex flex-col items-center gap-1.5 p-3 bg-white border-2 border-dashed rounded-xl cursor-pointer transition-all ${overLimit ? 'border-red-400 hover:border-red-500' : 'border-neutral-200 hover:border-primary/40'}`}>
                                    <Upload size={18} className={overLimit ? 'text-red-400' : 'text-primary/60'} />
                                    <span className={`text-xs font-black ${overLimit ? 'text-red-500' : 'text-neutral-500'}`}>
                                      {generalMatForm.file ? generalMatForm.file.name : (editingFileName ? '새 파일 선택 (선택 안 하면 기존 파일 유지)' : '파일 선택 (PDF, PPT, HWP 등)')}
                                    </span>
                                    {sizeMB && (
                                      <span className={`text-[10px] font-bold ${overLimit ? 'text-red-500' : 'text-neutral-400'}`}>
                                        {sizeMB}MB {overLimit ? '— 50MB 초과! 더 작은 파일을 선택해주세요' : '/ 50MB'}
                                      </span>
                                    )}
                                    {!generalMatForm.file && !editingFileName && (
                                      <span className="text-[10px] text-neutral-300 font-bold">최대 50MB</span>
                                    )}
                                    <input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setGeneralMatForm(prev => ({ ...prev, file: f })); }} />
                                  </label>
                                </div>
                              );
                            })()
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setShowAddGeneralForm(false); setEditingGeneralMatId(null); setGeneralMatForm({ title: '', type: 'link', url: '', file: null }); }}
                              className="flex-1 py-2 rounded-xl text-xs font-black border border-neutral-200 text-neutral-400 hover:bg-neutral-50 transition-all"
                            >취소</button>
                            <button
                              onClick={handleAddGeneralMat}
                              disabled={generalMatUploading || (generalMatForm.type === 'file' && !!generalMatForm.file && generalMatForm.file.size > 50 * 1024 * 1024)}
                              className="flex-1 py-2 rounded-xl text-xs font-black bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center justify-center gap-1"
                            >
                              {generalMatUploading ? <Loader2 size={12} className="animate-spin" /> : null}
                              {generalMatUploading ? (editingGeneralMatId ? '수정 중...' : '등록 중...') : (editingGeneralMatId ? '수정 완료' : '등록')}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 일반 자료 목록 */}
                      {generalMaterials.length === 0 && !showAddGeneralForm ? (
                        <div className="text-center py-6 text-on-surface-variant/30">
                          <FileText size={28} className="mx-auto mb-2 opacity-30" />
                          <p className="text-xs font-black">등록된 일반 자료가 없습니다</p>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {[...generalMaterials].sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ko', { numeric: true, sensitivity: 'base' })).map(mat => (
                            <div key={mat.id} className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-surface-container-high group">
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${mat.type === 'file' ? 'bg-amber-100' : 'bg-cyan-100'}`}>
                                {mat.type === 'file' ? <File size={14} className="text-amber-600" /> : <Link2 size={14} className="text-cyan-600" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                {mat.type === 'link' ? (
                                  <a href={mat.url} target="_blank" rel="noopener noreferrer" className="text-sm font-black hover:text-primary transition-colors truncate block">{mat.title}</a>
                                ) : (
                                  <button
                                    onClick={() => openGeneralMaterial(mat)}
                                    className="text-sm font-black hover:text-primary transition-colors truncate block text-left"
                                  >{mat.title}</button>
                                )}
                                <p className="text-[10px] text-on-surface-variant/50 truncate">
                                  {mat.type === 'link' ? mat.url : mat.file_name}
                                </p>
                              </div>
                              {mat.type === 'file' && (
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
                                  className="p-2.5 text-primary bg-primary/10 hover:bg-primary/20 rounded-xl transition-all shrink-0"
                                  title="다운로드"
                                >
                                  <Download size={17} />
                                </button>
                              )}
                              {(classInfo?.teacher_id === user?.id || classInfo?.assigned_teacher_id === user?.id) && (
                                <>
                                  <button
                                    onClick={() => handleEditGeneralMat(mat)}
                                    className="p-2.5 text-on-surface-variant/40 bg-surface-container-high hover:bg-primary/10 hover:text-primary rounded-xl transition-all shrink-0"
                                    title="수정"
                                  >
                                    <Pencil size={17} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteGeneralMat(mat.id, mat.file_path)}
                                    disabled={deletingGeneralMatId === mat.id}
                                    className="p-2.5 text-error bg-error/10 hover:bg-error/20 rounded-xl transition-all shrink-0"
                                  >
                                    {deletingGeneralMatId === mat.id ? <Loader2 size={17} className="animate-spin" /> : <Trash2 size={17} />}
                                  </button>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {showEditorMatPicker && user && (
        <ImportMaterialModal
          userId={user.id}
          onClose={() => setShowEditorMatPicker(false)}
          onSelect={(m: ImportableMaterial) => { handleImportEditorMat(m); }}
        />
      )}

      <UpgradeModal
        isOpen={!!upgradeModalReason}
        onClose={() => setUpgradeModalReason(null)}
        reason={upgradeModalReason ?? 'class_limit'}
      />

      {/* ── 학교 프로젝트 관리 모달 ── */}
      <SchoolProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => { setIsProjectModalOpen(false); setEditingProject(null); }}
        onSaved={() => {}}
        editProject={editingProject}
      />

      {/* ── 학교 그룹 관리 모달 ── */}
      <AnimatePresence>
        {isSchoolModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
            onClick={() => setIsSchoolModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* 헤더 */}
              <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-8 py-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center">
                    <GraduationCap size={20} className="text-white" />
                  </div>
                  <div>
                    <h2 className="text-white font-black text-base">학교 그룹 관리</h2>
                    <p className="text-violet-200 text-[11px] font-semibold">같은 학교 학급을 묶어 담당 선생님께 공유 링크 전달</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsSchoolModalOpen(false)}
                  className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                {/* 새 학교 그룹 만들기 */}
                <div className="space-y-3">
                  <p className="text-xs font-black text-gray-500 uppercase tracking-widest">새 학교 그룹 만들기</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newSchoolName}
                      onChange={e => setNewSchoolName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleCreateSchool()}
                      placeholder="예: ○○고등학교"
                      className="flex-1 px-4 py-3 bg-gray-50 border-2 border-gray-200 focus:border-violet-400 focus:bg-white rounded-xl font-bold text-gray-900 outline-none transition-all text-sm placeholder:text-gray-400"
                    />
                    <button
                      onClick={handleCreateSchool}
                      disabled={!newSchoolName.trim() || schoolCreating}
                      className="px-5 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-black rounded-xl text-sm flex items-center gap-2 transition-all"
                    >
                      {schoolCreating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                      만들기
                    </button>
                  </div>
                </div>

                {/* 학교 목록 */}
                <div className="space-y-3">
                  <p className="text-xs font-black text-gray-500 uppercase tracking-widest">내 학교 그룹</p>
                  {schoolsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 size={24} className="animate-spin text-violet-400" />
                    </div>
                  ) : schools.length === 0 ? (
                    <div className="py-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                      <GraduationCap size={28} className="text-gray-300 mx-auto mb-2" />
                      <p className="text-sm font-bold text-gray-400">아직 학교 그룹이 없습니다</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {schools.map(school => {
                        const assignedClasses = classes.filter(c => c.school_id === school.id);
                        const isCopied = schoolCopiedId === school.id;
                        const isEditing = editingSchoolId === school.id;
                        const isDeleting = deletingSchoolId === school.id;
                        return (
                          <div key={school.id} className="bg-gray-50 rounded-2xl border border-gray-100 p-4 space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                {/* 학교 이름 — 인라인 편집 */}
                                {isEditing ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      autoFocus
                                      type="text"
                                      value={editingSchoolName}
                                      onChange={e => setEditingSchoolName(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') handleUpdateSchool(school.id);
                                        if (e.key === 'Escape') setEditingSchoolId(null);
                                      }}
                                      className="flex-1 px-3 py-1.5 bg-white border-2 border-violet-400 rounded-lg text-sm font-black text-gray-900 outline-none"
                                    />
                                    <button
                                      onClick={() => handleUpdateSchool(school.id)}
                                      disabled={schoolUpdating}
                                      className="px-3 py-1.5 bg-violet-600 text-white text-xs font-black rounded-lg hover:bg-violet-700 disabled:opacity-50 flex items-center gap-1"
                                    >
                                      {schoolUpdating ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                                      저장
                                    </button>
                                    <button
                                      onClick={() => setEditingSchoolId(null)}
                                      className="px-3 py-1.5 bg-gray-200 text-gray-600 text-xs font-black rounded-lg hover:bg-gray-300"
                                    >
                                      취소
                                    </button>
                                  </div>
                                ) : (
                                  <p className="font-black text-gray-900 text-sm truncate">{school.name}</p>
                                )}
                                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                                  <button
                                    onClick={() => handleCopySchoolCode(school.id, school.entry_code)}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 transition-all ${
                                      schoolCodeCopiedId === school.id
                                        ? 'bg-green-50 border-green-300 text-green-700'
                                        : 'bg-violet-50 border-violet-200 hover:border-violet-400 text-violet-700'
                                    }`}
                                    title="클릭하여 입장코드 복사"
                                  >
                                    <span className="text-[10px] font-bold text-gray-400">입장코드</span>
                                    <span className="text-base font-black tracking-[0.2em] font-mono">
                                      {schoolCodeCopiedId === school.id ? '복사됨!' : school.entry_code}
                                    </span>
                                    {schoolCodeCopiedId === school.id
                                      ? <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                                      : <Copy size={13} className="text-violet-400 shrink-0" />
                                    }
                                  </button>
                                  <span className="text-[10px] font-bold text-gray-400">배정된 학급: {assignedClasses.length}개</span>
                                </div>
                              </div>
                              {/* 링크복사 / 수정 / 삭제 버튼 */}
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  onClick={() => handleCopySchoolLink(school.id)}
                                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all ${
                                    isCopied ? 'bg-green-500 text-white' : 'bg-violet-100 hover:bg-violet-200 text-violet-700'
                                  }`}
                                >
                                  <Link2 size={12} />
                                  {isCopied ? '복사됨!' : '링크 복사'}
                                </button>
                                {!isEditing && (
                                  <button
                                    onClick={() => { setEditingSchoolId(school.id); setEditingSchoolName(school.name); }}
                                    className="w-8 h-8 rounded-xl bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-500 transition-all"
                                    title="이름 수정"
                                  >
                                    <RefreshCw size={13} />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDeleteSchool(school.id, school.name)}
                                  disabled={isDeleting}
                                  className="w-8 h-8 rounded-xl bg-red-50 hover:bg-red-100 flex items-center justify-center text-red-400 hover:text-red-600 transition-all disabled:opacity-50"
                                  title="삭제"
                                >
                                  {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                </button>
                              </div>
                            </div>

                            {/* 클래스 배정 */}
                            <div className="space-y-1.5">
                              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">학급 배정</p>
                              <div className="flex flex-wrap gap-1.5">
                                {classes.map(cls => {
                                  const isAssigned = cls.school_id === school.id;
                                  const isAssigning = assigningClassId === cls.id;
                                  return (
                                    <button
                                      key={cls.id}
                                      onClick={() => handleAssignClassToSchool(cls.id, isAssigned ? null : school.id)}
                                      disabled={isAssigning || (cls.school_id !== null && cls.school_id !== school.id)}
                                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black transition-all disabled:opacity-40 ${
                                        isAssigned
                                          ? 'bg-violet-600 text-white shadow-sm'
                                          : cls.school_id !== null && cls.school_id !== school.id
                                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                            : 'bg-white border border-gray-200 text-gray-600 hover:border-violet-300 hover:text-violet-600'
                                      }`}
                                      title={
                                        cls.school_id !== null && cls.school_id !== school.id
                                          ? '다른 학교 그룹에 이미 배정됨'
                                          : isAssigned ? '클릭하여 배정 해제' : '클릭하여 배정'
                                      }
                                    >
                                      {isAssigning
                                        ? <Loader2 size={10} className="animate-spin" />
                                        : isAssigned ? <CheckCircle2 size={10} /> : null
                                      }
                                      {cls.name}
                                      {cls.subject && cls.subject !== '담임' && (
                                        <span className="opacity-60">· {cls.subject}</span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                              {assignedClasses.length > 0 && (
                                <p className="text-[10px] text-violet-600 font-semibold pt-1">
                                  배정됨: {assignedClasses.map(c => c.name).join(', ')}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="pt-2 pb-1">
                  <p className="text-[11px] text-gray-400 leading-relaxed text-center">
                    학교 링크를 복사하여 관리자·부장 선생님께 공유하세요.<br />
                    입장 코드를 알면 학교 전체 반의 결과를 탭으로 볼 수 있습니다.
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
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

const DashboardSkeleton = () => (
  <div className="space-y-8 animate-pulse">
    <div className="h-44 bg-surface-container rounded-[1.75rem]" />
    <div className="grid grid-cols-12 gap-8">
      <div className="col-span-3 h-96 bg-surface-container rounded-[1.75rem]" />
      <div className="col-span-9 h-96 bg-surface-container rounded-[1.75rem]" />
    </div>
  </div>
);

export default Classroom;
