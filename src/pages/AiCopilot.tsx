import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Send, User, Loader2, FolderPlus, Presentation, Paperclip, X, Check, ArrowRight, Image as ImageIcon, ListChecks, Lightbulb, Maximize2, Minimize2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '../lib/supabase';
import { useAuth, checkIsPro, checkIsBasicOrAbove, getAiMonthlyLimit } from '../lib/auth';
import { chatWithLessonPlanCopilot, chatWithObservationAnalyst, chatWithSlideDeckCopilot, chatWithMaterialCopilot, chatWithQuizCopilot, chatWithSurveyCopilot, chatWithIdeaHandoffCopilot, embedText, generateSeatukDraft, generateSlideDeckDraft, generateCoverPromptSuggestions, quizGeneratorAI, surveyGeneratorAI, transcriptionAI } from '../lib/gemini';
import UpgradeModal from '../components/UpgradeModal';
import CodeBlock from '../components/CodeBlock';
import type { DeckSlide, SlideLayoutKind } from '../components/slidedeck/types';
import { SLIDE_TEMPLATES, getTemplate, getLayoutSlotSpec, buildDraftDeckSlides } from '../components/slidedeck/templates';

const DRAFT_MARKER = '[[LESSON_PLAN_DRAFT]]';
const SLIDE_DECK_DRAFT_MARKER = '[[SLIDE_DECK_DRAFT]]';
const MATERIAL_DRAFT_MARKER = '[[MATERIAL_DRAFT]]';
const QUIZ_DRAFT_MARKER = '[[QUIZ_DRAFT]]';
const SURVEY_DRAFT_MARKER = '[[SURVEY_DRAFT]]';
const IDEA_DRAFT_MARKER = '[[IDEA_DRAFT]]';
const ALL_LAYOUT_KINDS: SlideLayoutKind[] = ['title', 'textOnly', 'textImage1', 'textImagesMany'];
const FREE_SLIDE_DECK_LIMIT = 1;
const FREE_SURVEY_LIMIT = 1;

// DeckSlide.objects[]의 텍스트류 값만 이어붙여 참고용 텍스트로 사용 (IdeaRecord.tsx의 동일 로직을 자체 함수로 복제)
const extractSlideDeckPreviewText = (slides: DeckSlide[]): string =>
  slides
    .flatMap(slide => slide.objects.map(obj => obj.text))
    .filter((text): text is string => !!text && text.trim().length > 0)
    .join('\n');

// match_my_content RPC 반환 행 — 내 노트/자료/슬라이드 중 임베딩 유사도가 높은 것들 (IdeaRecord.tsx와 동일 shape)
type MatchedContent = { source_type: 'note' | 'material' | 'slide'; id: string; title: string; snippet: string; similarity: number };

const SOURCE_TYPE_LABEL: Record<MatchedContent['source_type'], string> = {
  note: '아이디어 기록',
  material: '수업 자료',
  slide: '슬라이드',
};

function normalizeMarkdown(text: string) {
  let result = text.replace(/([^\n])\n(#{1,6} )/g, '$1\n\n$2');
  result = result.replace(/(\*\*[^\n*]*[\p{P}])\*\*(?=[^\s\p{P}])/gu, '$1** ');
  return result;
}

function extractDraftTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : '수업 계획안';
}

function stripDraftPreamble(content: string): string {
  const match = content.match(/^#\s+.+$/m);
  return match ? content.slice(content.indexOf(match[0])).trim() : content.trim();
}

function formatTranscriptChipLabel(recordedAt: string, durationSeconds: number): string {
  const date = new Date(recordedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  const mm = Math.floor(durationSeconds / 60);
  const ss = durationSeconds % 60;
  return `${date} · ${mm}:${String(ss).padStart(2, '0')}`;
}

const chatMdComponents: any = {
  h1: ({ children }: any) => <h1 className="text-lg font-black mb-3 mt-4 text-on-surface">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-base font-black mb-2 mt-4 text-on-surface">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-sm font-black mb-2 mt-3 text-on-surface">{children}</h3>,
  p: ({ children }: any) => <p className="mb-3 last:mb-0 leading-relaxed text-sm font-bold text-on-surface">{children}</p>,
  ul: ({ children }: any) => <ul className="list-disc pl-5 mb-3 space-y-1 text-sm">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal pl-5 mb-3 space-y-1 text-sm">{children}</ol>,
  li: ({ children }: any) => <li className="text-sm font-bold text-on-surface">{children}</li>,
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-4 border-primary pl-4 italic text-on-surface-variant my-3 bg-surface-container-low py-2 rounded-r-xl">
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
    const codeClassName = child?.props?.className || '';
    const lang = codeClassName.replace('language-', '') || 'text';
    const code = String(child?.props?.children ?? '').replace(/\n$/, '');
    return <CodeBlock lang={lang} code={code} />;
  },
  a: ({ href, children }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:opacity-70">
      {children}
    </a>
  ),
  hr: () => <hr className="border-surface-container my-4" />,
  strong: ({ children }: any) => <strong className="font-black text-on-surface">{children}</strong>,
  em: ({ children }: any) => <em className="italic">{children}</em>,
  table: ({ children }: any) => (
    <div className="overflow-auto mb-3 rounded-xl border border-surface-container">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }: any) => (
    <th className="border border-surface-container px-3 py-2 bg-surface-container font-black text-left">{children}</th>
  ),
  td: ({ children }: any) => (
    <td className="border border-surface-container px-3 py-2">{children}</td>
  ),
};

// seatuk_writer 탭의 결과 요약 버블에 "이동하기" 버튼을 달기 위한 필드 — 우리가 직접 구성하는 메시지라
// LESSON_PLAN_DRAFT처럼 텍스트 마커를 파싱하지 않고 타입으로 구분한다.
type CopilotMessage = { id: string; role: 'user' | 'ai'; text: string; meta?: { navigateTo: string; state?: Record<string, any> } };

// 페르소나(탭)별 순수 카피/UI 플래그. 쿼리·호출 함수 같은 로직은 컴포넌트 안에서 모드별로 직접 분기한다
// (페르소나마다 실제 로직이 다르므로 여기 억지로 파라미터화하지 않음 — 프로젝트 관행상 성급한 공용 추상화 지양).
type CopilotModeId = 'lesson_plan' | 'observation_analyst' | 'seatuk_writer' | 'slide_deck_maker' | 'material_maker' | 'quiz_maker' | 'survey_maker' | 'idea_brainstorm';

type CopilotModeConfig = {
  tabLabel: string;
  heroTitle: string;
  heroSubtitle: string;
  chatHeaderTitle: string;
  chatHeaderSubtitle: string;
  emptyTitle: string;
  emptyBody: string;
  inputPlaceholder: string;
  showDraftActions: boolean;
  showReferenceSearch: boolean;
  showStudentPicker?: boolean;
  showTemplatePicker?: boolean;
  quickStarts?: string[];
  draftMarker?: string;
  showCoverPromptAction?: boolean;
  showQuizAction?: boolean;
  showTranscriptTrigger?: boolean;
  showSurveyAction?: boolean;
  showIdeaAction?: boolean;
};

const COPILOT_MODES: Record<CopilotModeId, CopilotModeConfig> = {
  lesson_plan: {
    tabLabel: '🧭 수업 기획',
    heroTitle: '수업 기획 전문가',
    heroSubtitle: '동료 교사와 대화하듯 편하게 수업 아이디어를 이야기해 보세요. 필요한 것만 되물으며 계획안 초안까지 함께 만들어 드립니다.',
    chatHeaderTitle: 'AI 코파일럿 · 수업 기획 전문가',
    chatHeaderSubtitle: '대화로 수업 계획안 만들기',
    emptyTitle: '어떤 수업을 준비하고 계신가요?',
    emptyBody: '예: "중학교 2학년 과학, 광합성 수업 하나 짜줘" 처럼 편하게 말씀해 주세요.',
    inputPlaceholder: '수업 아이디어를 편하게 이야기해 보세요...',
    showDraftActions: true,
    showReferenceSearch: true,
    draftMarker: DRAFT_MARKER,
  },
  observation_analyst: {
    tabLabel: '👀 관찰기록 분석',
    heroTitle: '관찰기록 분석가',
    heroSubtitle: '쌓아온 관찰 기록을 함께 들여다보며 특이사항과 패턴을 찾아 드립니다. 기록에 근거해서만 답변해요.',
    chatHeaderTitle: 'AI 코파일럿 · 관찰기록 분석가',
    chatHeaderSubtitle: '기록 기반으로만 답변해요',
    emptyTitle: '관찰 기록에 대해 물어보세요',
    emptyBody: '이번 주 특이사항, 참여도 변화, 기록이 뜸한 학생 등을 물어볼 수 있어요.',
    inputPlaceholder: '관찰기록에 대해 궁금한 점을 물어보세요...',
    showDraftActions: false,
    showReferenceSearch: false,
    quickStarts: ['이번 주 특이사항 요약해줘', '관찰기록이 뜸한 학생 있어?', '학생별 참여도 변화 비교해줘'],
    showTranscriptTrigger: true,
  },
  seatuk_writer: {
    tabLabel: '✍️ 세특 작성',
    heroTitle: '세특 작성가',
    heroSubtitle: '학생을 고르고 요청하면 초안을 만들어 드려요. 채팅에는 결과 요약만 보여드리고, 실제 문구는 AI 초안 페이지에서 확인·다듬을 수 있어요.',
    chatHeaderTitle: 'AI 코파일럿 · 세특 작성가',
    chatHeaderSubtitle: '요청하면 AI 초안 페이지에 저장돼요',
    emptyTitle: '학생을 선택하고 요청해 보세요',
    emptyBody: '위에서 학생을 고르고, 참고할 지침이 있다면 적은 뒤 전송해 주세요. 지침은 비워둬도 괜찮아요.',
    inputPlaceholder: '참고할 지침이 있다면 적어주세요 (선택)',
    showDraftActions: false,
    showReferenceSearch: false,
    showStudentPicker: true,
  },
  slide_deck_maker: {
    tabLabel: '🖼 슬라이드 제작',
    heroTitle: '슬라이드 제작가',
    heroSubtitle: '만들고 싶은 슬라이드의 내용을 편하게 이야기해 보세요. 내용이 정리되면 디자인을 골라 바로 슬라이드로 만들어 드립니다.',
    chatHeaderTitle: 'AI 코파일럿 · 슬라이드 제작가',
    chatHeaderSubtitle: '대화로 슬라이드 만들기',
    emptyTitle: '어떤 슬라이드를 만들고 싶으신가요?',
    emptyBody: '예: "중학교 2학년 과학, 광합성 관련 5장짜리 슬라이드 만들어줘" 처럼 편하게 말씀해 주세요.',
    inputPlaceholder: '슬라이드에 담고 싶은 내용을 편하게 이야기해 보세요...',
    showDraftActions: false,
    showReferenceSearch: true,
    showTemplatePicker: true,
  },
  material_maker: {
    tabLabel: '📄 자료 제작',
    heroTitle: '자료 제작가',
    heroSubtitle: '학생에게 나눠줄 학습지·유인물을 편하게 이야기해 보세요. 내용이 정리되면 자료함으로 바로 저장하거나 표지 이미지 아이디어도 받을 수 있어요.',
    chatHeaderTitle: 'AI 코파일럿 · 자료 제작가',
    chatHeaderSubtitle: '대화로 학습지 만들기',
    emptyTitle: '어떤 자료를 만들고 싶으신가요?',
    emptyBody: '예: "중학교 2학년 과학, 광합성 관련 학습지 만들어줘" 처럼 편하게 말씀해 주세요.',
    inputPlaceholder: '자료에 담고 싶은 내용을 편하게 이야기해 보세요...',
    showDraftActions: true,
    showReferenceSearch: true,
    draftMarker: MATERIAL_DRAFT_MARKER,
    showCoverPromptAction: true,
  },
  quiz_maker: {
    tabLabel: '✅ 퀴즈 제작',
    heroTitle: '퀴즈 제작가',
    heroSubtitle: '어떤 내용으로, 몇 문항을, 어떤 난이도로 퀴즈를 낼지 편하게 이야기해 보세요. 사양이 정해지면 실제 퀴즈 문항까지 만들어 드립니다.',
    chatHeaderTitle: 'AI 코파일럿 · 퀴즈 제작가',
    chatHeaderSubtitle: '대화로 퀴즈 만들기',
    emptyTitle: '어떤 퀴즈를 만들고 싶으신가요?',
    emptyBody: '예: "중학교 2학년 과학, 광합성 관련 5문항 퀴즈 만들어줘" 처럼 편하게 말씀해 주세요.',
    inputPlaceholder: '퀴즈에 담고 싶은 내용을 편하게 이야기해 보세요...',
    showDraftActions: false,
    showReferenceSearch: true,
    showQuizAction: true,
  },
  survey_maker: {
    tabLabel: '📊 설문 제작',
    heroTitle: '설문 제작가',
    heroSubtitle: '어떤 목적으로, 몇 문항짜리 설문을 만들지 편하게 이야기해 보세요. 사양이 정해지면 다양한 유형의 문항으로 실제 설문까지 만들어 드립니다.',
    chatHeaderTitle: 'AI 코파일럿 · 설문 제작가',
    chatHeaderSubtitle: '대화로 설문 만들기',
    emptyTitle: '어떤 설문을 만들고 싶으신가요?',
    emptyBody: '예: "이번 학기 수업 만족도 조사 5문항 만들어줘" 처럼 편하게 말씀해 주세요.',
    inputPlaceholder: '설문에 담고 싶은 내용을 편하게 이야기해 보세요...',
    showDraftActions: false,
    showReferenceSearch: true,
    showSurveyAction: true,
  },
  idea_brainstorm: {
    tabLabel: '💡 아이디어 기획',
    heroTitle: '아이디어 정리가',
    heroSubtitle: '막연한 수업 아이디어를 편하게 이야기해 보세요. 정리되면 아이디어 기록으로 보내드려요, 거기서 더 구체적인 질문으로 이어서 수업 기획안까지 발전시킬 수 있어요.',
    chatHeaderTitle: 'AI 코파일럿 · 아이디어 정리가',
    chatHeaderSubtitle: '대화로 아이디어 정리하기',
    emptyTitle: '어떤 아이디어를 떠올리셨나요?',
    emptyBody: '예: "다음 주에 모둠별로 뭔가 발표하는 활동을 해보고 싶어" 처럼 편하게 말씀해 주세요.',
    inputPlaceholder: '떠오른 수업 아이디어를 편하게 이야기해 보세요...',
    showDraftActions: false,
    showReferenceSearch: false,
    showIdeaAction: true,
  },
};

const COPILOT_MODE_IDS = Object.keys(COPILOT_MODES) as CopilotModeId[];

const AiCopilot = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [activeMode, setActiveMode] = useState<CopilotModeId>('lesson_plan');
  const [messagesByMode, setMessagesByMode] = useState<Record<CopilotModeId, CopilotMessage[]>>({
    lesson_plan: [],
    observation_analyst: [],
    seatuk_writer: [],
    slide_deck_maker: [],
    material_maker: [],
    quiz_maker: [],
    survey_maker: [],
    idea_brainstorm: [],
  });
  const messages = messagesByMode[activeMode];

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState<{ id: string; name: string; subject?: string; class_type?: string; weekly_plan?: { week: number; topic: string }[] }[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [monthAiCount, setMonthAiCount] = useState(0);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<'ai_limit' | 'ai_bulk'>('ai_limit');
  const [lessonPlanObservations, setLessonPlanObservations] = useState<any[]>([]);
  const [analystObservations, setAnalystObservations] = useState<any[]>([]);
  const [referenceSuggestions, setReferenceSuggestions] = useState<MatchedContent[]>([]);
  const [loadedReferences, setLoadedReferences] = useState<{ id: string; title: string; content: string }[]>([]);
  const [loadingReferenceId, setLoadingReferenceId] = useState<string | null>(null);
  const [seatukStudents, setSeatukStudents] = useState<{ id: string; full_name: string; hasObservation: boolean; alreadyDraft: boolean }[]>([]);
  const [seatukSelectedIds, setSeatukSelectedIds] = useState<string[]>([]);
  const [seatukProgress, setSeatukProgress] = useState({ current: 0, total: 0 });
  const [pendingTranscripts, setPendingTranscripts] = useState<{ id: string; class_name: string | null; subject: string | null; transcript_text: string; duration_seconds: number; recorded_at: string }[]>([]);
  const [analyzingTranscriptId, setAnalyzingTranscriptId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    supabase.from('classes').select('id, name, subject, class_type, weekly_plan').eq('teacher_id', user.id).then(({ data }) => {
      if (data) setClasses(data);
    });
  }, [user?.id]);

  // 수업 기획 전문가용 그라운딩 — 학생 자기기록만(is_student_record=true, 승인/대기), 노이즈 억제 목적으로 60건 제한
  useEffect(() => {
    if (!selectedClassId) { setLessonPlanObservations([]); return; }
    (async () => {
      const { data: students } = await supabase.from('students').select('id, full_name').eq('class_id', selectedClassId);
      const studentIds = (students || []).map(s => s.id);
      if (!studentIds.length) { setLessonPlanObservations([]); return; }
      const nameMap: Record<string, string> = Object.fromEntries((students || []).map(s => [s.id, s.full_name]));
      const { data: obs } = await supabase
        .from('observations')
        .select('student_id, activity_name, content, created_at, status')
        .in('student_id', studentIds)
        .eq('is_student_record', true)
        .in('status', ['pending', 'approved'])
        .order('created_at', { ascending: false })
        .limit(60);
      setLessonPlanObservations((obs || []).map(o => ({ ...o, student_name: nameMap[o.student_id] || '학생' })));
    })();
  }, [selectedClassId]);

  // 관찰기록 분석가용 그라운딩 — 교사가 직접 쓴 메모(is_student_record=false)까지 전부 포함,
  // 이 페르소나의 목적 자체가 "가진 기록을 최대한 분석"이므로 상한도 100까지 넓힘
  useEffect(() => {
    if (!selectedClassId) { setAnalystObservations([]); return; }
    (async () => {
      const { data: students } = await supabase.from('students').select('id, full_name').eq('class_id', selectedClassId);
      const studentIds = (students || []).map(s => s.id);
      if (!studentIds.length) { setAnalystObservations([]); return; }
      const nameMap: Record<string, string> = Object.fromEntries((students || []).map(s => [s.id, s.full_name]));
      const { data: obs } = await supabase
        .from('observations')
        .select('student_id, activity_name, content, created_at, status, is_student_record')
        .in('student_id', studentIds)
        .neq('status', 'rejected')
        .order('created_at', { ascending: false })
        .limit(100);
      setAnalystObservations((obs || []).map(o => ({ ...o, student_name: nameMap[o.student_id] || '학생' })));
    })();
  }, [selectedClassId]);

  // 관찰기록 분석가용 — 분석 대기 중(analysis_result=null)인 전사록 목록. 어떤 전사록을 분석할지 AI가
  // 채팅 텍스트에서 추측하지 않고 사용자가 직접 칩을 클릭해 트리거하도록 하기 위한 후보 목록.
  useEffect(() => {
    if (!selectedClassId || !user?.id) { setPendingTranscripts([]); return; }
    (async () => {
      const { data } = await supabase
        .from('class_transcriptions')
        .select('id, class_name, subject, transcript_text, duration_seconds, recorded_at')
        .eq('teacher_id', user.id)
        .eq('class_id', selectedClassId)
        .is('analysis_result', null)
        .order('recorded_at', { ascending: false });
      setPendingTranscripts(data || []);
    })();
  }, [selectedClassId, user?.id]);

  // 세특 작성가용 학생 목록 — 관찰기록 보유 여부/이미 초안 있는지 표시해 "관찰기록 있는 학생만"/"미작성만" 필터를 지원.
  // 기본 선택은 "관찰기록은 있는데 아직 초안이 없는" 학생만(가장 흔한 사용 패턴).
  useEffect(() => {
    if (!selectedClassId) { setSeatukStudents([]); setSeatukSelectedIds([]); return; }
    (async () => {
      const { data: students } = await supabase
        .from('students')
        .select('id, full_name')
        .eq('class_id', selectedClassId)
        .order('student_number', { ascending: true });
      const list = students || [];
      const ids = list.map(s => s.id);
      if (ids.length === 0) { setSeatukStudents([]); setSeatukSelectedIds([]); return; }

      const [{ data: obs }, { data: evals }] = await Promise.all([
        supabase.from('observations').select('student_id').in('student_id', ids),
        supabase
          .from('student_evaluations')
          .select('student_id, status')
          .in('student_id', ids)
          .eq('class_id', selectedClassId)
          .eq('academic_year', new Date().getFullYear()),
      ]);
      const withObs = new Set((obs || []).map(o => o.student_id));
      const withDraft = new Set((evals || []).filter(e => e.status && e.status !== 'empty').map(e => e.student_id));

      const merged = list.map(s => ({
        id: s.id,
        full_name: s.full_name,
        hasObservation: withObs.has(s.id),
        alreadyDraft: withDraft.has(s.id),
      }));
      setSeatukStudents(merged);
      setSeatukSelectedIds(merged.filter(s => s.hasObservation && !s.alreadyDraft).map(s => s.id));
    })();
  }, [selectedClassId]);

  useEffect(() => {
    if (!profile?.ai_monthly_reset) { setMonthAiCount(0); return; }
    const thisMonth = new Date().toISOString().slice(0, 7);
    setMonthAiCount(profile.ai_monthly_reset === thisMonth ? (profile.ai_monthly_count ?? 0) : 0);
  }, [profile]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // 입력창 높이를 내용에 맞춰 자동으로 늘림(최대 8줄 정도까지, 그 이상은 스크롤)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  // Task 3(수업 기획 탭 전용): 이번 메시지 내용과 의미적으로 유사한 내 과거 자료(노트/수업자료/슬라이드)를 검색해
  // "참고자료" 카드로 제안한다. 메인 AI 응답을 막지 않도록 별도로 병행 실행한다.
  const searchReferences = async (query: string) => {
    try {
      const vector = await embedText(query);
      if (vector.length === 0) return;
      const { data, error } = await supabase.rpc('match_my_content', {
        query_embedding: vector,
        match_count: 5,
        exclude_note_id: null,
      });
      if (error) throw error;
      const loadedIds = new Set(loadedReferences.map(r => r.id));
      setReferenceSuggestions(
        ((data ?? []) as MatchedContent[]).filter(r => r.similarity > 0.55 && !loadedIds.has(r.id)).slice(0, 3)
      );
    } catch (err) {
      console.error('[AiCopilot] 참고자료 검색 오류:', err);
    }
  };

  // "불러오기" 클릭 시 스니펫(200자) 대신 원문 전체를 가져와 다음 AI 호출부터 컨텍스트로 포함시킨다
  const handleLoadReference = async (item: MatchedContent) => {
    setLoadingReferenceId(item.id);
    try {
      let content = item.snippet;
      if (item.source_type === 'note') {
        const { data } = await supabase.from('teacher_notes').select('content').eq('id', item.id).single();
        content = data?.content ?? item.snippet;
      } else if (item.source_type === 'material') {
        const { data } = await supabase.from('class_materials').select('content').eq('id', item.id).single();
        content = data?.content ?? item.snippet;
      } else {
        const { data } = await supabase.from('slide_decks').select('slides').eq('id', item.id).single();
        content = data?.slides ? extractSlideDeckPreviewText(data.slides as DeckSlide[]) : item.snippet;
      }
      setLoadedReferences(prev => [...prev, { id: item.id, title: item.title, content }]);
      setReferenceSuggestions(prev => prev.filter(r => r.id !== item.id));
    } catch (err) {
      console.error('[AiCopilot] 참고자료 로드 오류:', err);
    } finally {
      setLoadingReferenceId(null);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    if (!checkIsPro(profile) && monthAiCount >= getAiMonthlyLimit(profile)) {
      setUpgradeReason('ai_limit');
      setUpgradeOpen(true);
      return;
    }

    // 전송 시점의 탭을 고정 — 응답이 오기 전에 사용자가 다른 탭으로 전환해도 원래 탭에 귀속시키기 위함
    const modeAtSend = activeMode;
    const userMessage = input.trim();
    setInput('');
    setMessagesByMode(prev => ({
      ...prev,
      [modeAtSend]: [...prev[modeAtSend], { id: crypto.randomUUID(), role: 'user', text: userMessage }],
    }));
    setLoading(true);
    if (modeAtSend === 'lesson_plan' || modeAtSend === 'slide_deck_maker' || modeAtSend === 'material_maker' || modeAtSend === 'quiz_maker' || modeAtSend === 'survey_maker') searchReferences(userMessage);

    try {
      const history = messagesByMode[modeAtSend].map(m => ({ role: m.role, text: m.text }));
      const selectedClass = classes.find(c => c.id === selectedClassId);
      const response = modeAtSend === 'lesson_plan'
        ? await chatWithLessonPlanCopilot(
            history,
            userMessage,
            selectedClass?.name,
            selectedClassId || undefined,
            selectedClass?.subject,
            selectedClass?.weekly_plan,
            lessonPlanObservations,
            loadedReferences,
          )
        : modeAtSend === 'slide_deck_maker'
        ? await chatWithSlideDeckCopilot(
            history,
            userMessage,
            selectedClass?.name,
            selectedClassId || undefined,
            selectedClass?.subject,
            selectedClass?.weekly_plan,
            loadedReferences,
          )
        : modeAtSend === 'material_maker'
        ? await chatWithMaterialCopilot(
            history,
            userMessage,
            selectedClass?.name,
            selectedClassId || undefined,
            selectedClass?.subject,
            selectedClass?.weekly_plan,
            loadedReferences,
          )
        : modeAtSend === 'quiz_maker'
        ? await chatWithQuizCopilot(
            history,
            userMessage,
            selectedClass?.name,
            selectedClassId || undefined,
            selectedClass?.subject,
            loadedReferences,
          )
        : modeAtSend === 'survey_maker'
        ? await chatWithSurveyCopilot(
            history,
            userMessage,
            selectedClass?.name,
            selectedClassId || undefined,
            selectedClass?.subject,
            loadedReferences,
          )
        : modeAtSend === 'idea_brainstorm'
        ? await chatWithIdeaHandoffCopilot(
            history,
            userMessage,
            selectedClass?.name,
            selectedClassId || undefined,
            selectedClass?.subject,
            [],
          )
        : await chatWithObservationAnalyst(
            history,
            userMessage,
            selectedClass?.name,
            selectedClassId || undefined,
            analystObservations,
          );
      setMessagesByMode(prev => ({
        ...prev,
        [modeAtSend]: [...prev[modeAtSend], { id: crypto.randomUUID(), role: 'ai', text: response }],
      }));
      setMonthAiCount(prev => prev + 1);
    } catch (error: any) {
      if (error?.message === 'AI_LIMIT_EXCEEDED') {
        setUpgradeReason('ai_limit');
        setUpgradeOpen(true);
      } else {
        console.error('AI Copilot Error:', error);
        setMessagesByMode(prev => ({
          ...prev,
          [modeAtSend]: [...prev[modeAtSend], { id: crypto.randomUUID(), role: 'ai', text: '죄송합니다. 답변 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }],
        }));
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleSeatukStudent = (id: string) => {
    setSeatukSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // seatuk_writer 탭 전용 — 일반 채팅(chatWith*) 호출이 아니라 기존 AIAssistant.tsx의 세특 생성 파이프라인을
  // 그대로 재사용해 학생별로 순차 생성하고, 결과는 문구 자체가 아니라 결정론적 요약만 채팅에 남긴다.
  const handleSeatukGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || !selectedClassId || seatukSelectedIds.length === 0) return;

    const isNotPro = !checkIsPro(profile);
    if (isNotPro) {
      if (seatukSelectedIds.length > 1) {
        setUpgradeReason('ai_bulk');
        setUpgradeOpen(true);
        return;
      }
      if (monthAiCount >= getAiMonthlyLimit(profile)) {
        setUpgradeReason('ai_limit');
        setUpgradeOpen(true);
        return;
      }
    }

    const selectedClass = classes.find(c => c.id === selectedClassId);
    const isHomeroom = selectedClass?.class_type === 'homeroom';
    const docType = isHomeroom ? '행동특성 및 종합의견(행특)' : '교과 세부능력 및 특기사항(세특)';
    const teacherPrompt = input.trim();
    const targets = seatukStudents.filter(s => seatukSelectedIds.includes(s.id));

    setInput('');
    setMessagesByMode(prev => ({
      ...prev,
      seatuk_writer: [...prev.seatuk_writer, {
        id: crypto.randomUUID(),
        role: 'user',
        text: `선택 학생 ${targets.length}명: ${targets.map(s => s.full_name).join(', ')}${teacherPrompt ? `\n지침: ${teacherPrompt}` : ''}`,
      }],
    }));
    setLoading(true);

    try {
      const ids = targets.map(s => s.id);
      const { data: allObs, error } = await supabase
        .from('observations')
        .select('content, activity_name, student_id')
        .in('student_id', ids);
      if (error) throw error;

      const obsByStudent: Record<string, { activity_name: string; content: string }[]> = {};
      targets.forEach(s => { obsByStudent[s.id] = []; });
      (allObs || []).forEach(o => { if (obsByStudent[o.student_id]) obsByStudent[o.student_id].push(o); });

      const withObs = targets.filter(s => obsByStudent[s.id].length > 0);
      const skipped = targets.filter(s => obsByStudent[s.id].length === 0);

      setSeatukProgress({ current: 0, total: withObs.length });
      let localAiCount = monthAiCount;

      for (let i = 0; i < withObs.length; i++) {
        const student = withObs[i];
        setSeatukProgress({ current: i + 1, total: withObs.length });

        const content = await generateSeatukDraft(obsByStudent[student.id], docType, teacherPrompt);
        const originEntry = { label: '원본', content, createdAt: new Date().toISOString() };

        await supabase.from('student_evaluations').upsert({
          student_id: student.id,
          class_id: selectedClassId,
          teacher_id: user?.id,
          academic_year: new Date().getFullYear(),
          setech_content: content,
          refine_history: [originEntry],
          status: 'draft',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'student_id,class_id,academic_year' });

        if (isHomeroom) {
          await supabase.from('students').update({ behavior_insight: content }).eq('id', student.id);
        }

        localAiCount += 1;
        setMonthAiCount(localAiCount);
      }

      const summaryLines: string[] = [
        withObs.length > 0
          ? `✅ ${withObs.length}명의 ${docType} 초안을 만들었어요: ${withObs.map(s => s.full_name).join(', ')}`
          : '⚠️ 선택한 학생 중 관찰 기록이 있는 학생이 없어 생성하지 못했어요.',
      ];
      if (skipped.length > 0) {
        summaryLines.push(`⏭️ 관찰기록이 없어 건너뛴 학생: ${skipped.map(s => s.full_name).join(', ')}`);
      }
      if (withObs.length > 0) {
        summaryLines.push('AI 초안 페이지에서 확인하고 다듬을 수 있어요.');
      }

      setMessagesByMode(prev => ({
        ...prev,
        seatuk_writer: [...prev.seatuk_writer, {
          id: crypto.randomUUID(),
          role: 'ai',
          text: summaryLines.join('\n\n'),
          ...(withObs.length > 0 && { meta: { navigateTo: `/ai-assistant?classId=${selectedClassId}` } }),
        }],
      }));

      if (withObs.length > 0) {
        const doneIds = new Set(withObs.map(s => s.id));
        setSeatukStudents(prev => prev.map(s => doneIds.has(s.id) ? { ...s, alreadyDraft: true } : s));
      }
    } catch (err: any) {
      if (err?.message === 'AI_LIMIT_EXCEEDED') {
        setUpgradeReason('ai_limit');
        setUpgradeOpen(true);
      } else {
        console.error('[AiCopilot] 세특 생성 오류:', err);
        setMessagesByMode(prev => ({
          ...prev,
          seatuk_writer: [...prev.seatuk_writer, { id: crypto.randomUUID(), role: 'ai', text: '죄송합니다. 초안 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }],
        }));
      }
    } finally {
      setLoading(false);
      setSeatukProgress({ current: 0, total: 0 });
    }
  };

  const handleSaveDraft = (target: 'material-editor' | 'slide-deck', draftContent: string) => {
    const title = extractDraftTitle(draftContent);
    const classId = selectedClassId || null;
    if (target === 'material-editor') {
      navigate('/teaching-tools', {
        state: { activeToolId: 'material-editor', draftMaterial: { noteId: '', title, content: draftContent, classId } },
      });
    } else {
      navigate('/teaching-tools', {
        state: { activeToolId: 'slide-deck', draftSlide: { noteId: '', title, content: draftContent, classId } },
      });
    }
  };

  // 자료 제작가 탭 전용 — 기존 MaterialEditor.tsx의 표지 이미지 프롬프트 제안 기능(generateCoverPromptSuggestions)을
  // 그대로 재사용해 영어 프롬프트 3개만 채팅에 나열한다. DB 쓰기 없는 단발 호출이라 chat 프록시를 거치지 않으므로
  // 사용량 집계도 다른 트리거 함수들과 동일하게 수동으로 체크·증가한다.
  const handleGenerateCoverPrompts = async (title: string) => {
    if (loading) return;

    if (!checkIsPro(profile) && monthAiCount >= getAiMonthlyLimit(profile)) {
      setUpgradeReason('ai_limit');
      setUpgradeOpen(true);
      return;
    }

    setLoading(true);
    try {
      const prompts = await generateCoverPromptSuggestions(title, undefined, selectedClassId || undefined);
      setMonthAiCount(prev => prev + 1);
      const text = `🎨 표지 이미지 아이디어 3가지예요 — 영어 프롬프트를 복사해 이미지 생성 도구에 붙여넣어 보세요.\n\n${prompts.map((p, i) => `${i + 1}. ${p}`).join('\n\n')}`;
      setMessagesByMode(prev => ({
        ...prev,
        material_maker: [...prev.material_maker, { id: crypto.randomUUID(), role: 'ai', text }],
      }));
    } catch (err: any) {
      if (err?.message === 'AI_LIMIT_EXCEEDED') {
        setUpgradeReason('ai_limit');
        setUpgradeOpen(true);
      } else {
        console.error('[AiCopilot] 표지 이미지 프롬프트 생성 오류:', err);
        setMessagesByMode(prev => ({
          ...prev,
          material_maker: [...prev.material_maker, { id: crypto.randomUUID(), role: 'ai', text: '죄송합니다. 표지 이미지 아이디어 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }],
        }));
      }
    } finally {
      setLoading(false);
    }
  };

  // 슬라이드 제작가 탭 전용 — 대화로 정리된 초안 텍스트 + 선택한 템플릿으로 실제 슬라이드 덱을 생성·저장하고,
  // 채팅에는 결정론적 요약만 남긴 뒤 /teaching-tools의 슬라이드 도구로 바로 이동할 수 있게 안내한다
  // (세특 작성가와 동일한 "트리거 + 요약" 원칙 — 채팅에서 슬라이드 내용을 직접 다듬지 않음).
  const handleGenerateSlideDeck = async (templateId: string, draftContent: string, draftTitle: string) => {
    if (loading || !user?.id) return;

    if (!checkIsBasicOrAbove(profile)) {
      const { count } = await supabase
        .from('slide_decks')
        .select('id', { count: 'exact', head: true })
        .eq('teacher_id', user.id);
      if ((count || 0) >= FREE_SLIDE_DECK_LIMIT) {
        setMessagesByMode(prev => ({
          ...prev,
          slide_deck_maker: [...prev.slide_deck_maker, {
            id: crypto.randomUUID(),
            role: 'ai',
            text: '⚠️ 무료 플랜에서는 슬라이드를 1개까지만 만들 수 있어요. 더 만들려면 요금제를 업그레이드해 주세요.',
          }],
        }));
        return;
      }
    }
    if (!checkIsPro(profile) && monthAiCount >= getAiMonthlyLimit(profile)) {
      setUpgradeReason('ai_limit');
      setUpgradeOpen(true);
      return;
    }

    const template = getTemplate(templateId);
    setMessagesByMode(prev => ({
      ...prev,
      slide_deck_maker: [...prev.slide_deck_maker, {
        id: crypto.randomUUID(),
        role: 'user',
        text: `'${template.name}' 디자인으로 슬라이드를 만들어 주세요`,
      }],
    }));
    setLoading(true);

    try {
      const layoutSpecs = ALL_LAYOUT_KINDS.map(kind => getLayoutSlotSpec(template, kind));
      const { slides: aiSlides, imageUrls, codeBlocks } = await generateSlideDeckDraft(draftContent, layoutSpecs, selectedClassId || undefined);
      const draftSlides = buildDraftDeckSlides(template, aiSlides, imageUrls, codeBlocks);

      const { data: newDeck, error } = await supabase
        .from('slide_decks')
        .insert({ teacher_id: user.id, class_id: selectedClassId || null, title: draftTitle, slides: draftSlides })
        .select()
        .single();
      if (error) throw error;

      setMonthAiCount(prev => prev + 1);

      embedText(extractSlideDeckPreviewText(draftSlides))
        .then(embedding => supabase.from('slide_decks').update({ embedding }).eq('id', newDeck.id))
        .catch(err => console.error('[AiCopilot] 슬라이드 임베딩 갱신 실패:', err));

      setMessagesByMode(prev => ({
        ...prev,
        slide_deck_maker: [...prev.slide_deck_maker, {
          id: crypto.randomUUID(),
          role: 'ai',
          text: `✅ '${draftTitle}' 슬라이드 ${draftSlides.length}장을 '${template.name}' 디자인으로 만들었어요.`,
          meta: { navigateTo: '/teaching-tools', state: { activeToolId: 'slide-deck', openSlideId: newDeck.id } },
        }],
      }));
    } catch (err: any) {
      if (err?.message === 'AI_LIMIT_EXCEEDED') {
        setUpgradeReason('ai_limit');
        setUpgradeOpen(true);
      } else {
        console.error('[AiCopilot] 슬라이드 생성 오류:', err);
        setMessagesByMode(prev => ({
          ...prev,
          slide_deck_maker: [...prev.slide_deck_maker, { id: crypto.randomUUID(), role: 'ai', text: '죄송합니다. 슬라이드 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }],
        }));
      }
    } finally {
      setLoading(false);
    }
  };

  // 퀴즈 제작가 탭 전용 — 대화로 확정된 사양(참고 내용/문항 수/난이도)을 바탕으로 QuizGame.tsx의
  // handleAiGenerate()와 동일한 프롬프트·파싱 로직으로 실제 문항을 생성·저장하고, 채팅에는 결정론적
  // 요약만 남긴 뒤 /teaching-tools의 퀴즈 도구로 바로 이동할 수 있게 안내한다.
  const handleGenerateQuiz = async (title: string, draftSummary: string) => {
    if (loading || !user?.id) return;

    if (!checkIsPro(profile) && monthAiCount >= getAiMonthlyLimit(profile)) {
      setUpgradeReason('ai_limit');
      setUpgradeOpen(true);
      return;
    }

    setLoading(true);
    try {
      const countMatch = draftSummary.match(/문항\s*수[:：]\s*(\d+)/);
      const count = countMatch ? Math.max(1, Math.min(20, parseInt(countMatch[1], 10))) : 5;
      const diffMatch = draftSummary.match(/난이도[:：]\s*(쉬움|보통|어려움)/);
      const diffLabel = diffMatch ? diffMatch[1] : '보통';
      const contentSource = loadedReferences.length > 0
        ? loadedReferences.map(r => `### ${r.title}\n${r.content}`).join('\n\n')
        : `(참고 자료 없음 — 아래 요청 내용을 바탕으로 출제)\n${draftSummary}`;

      const prompt = `다음 내용을 바탕으로 4지선다형 퀴즈 문제를 ${count}개 만들어주세요.
난이도: ${diffLabel}
수업 자료:
${contentSource}

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만 출력하세요:
{
  "questions": [
    {
      "text": "문제 내용",
      "option_1": "선택지1",
      "option_2": "선택지2",
      "option_3": "선택지3",
      "option_4": "선택지4",
      "correct_answer": 0
    }
  ]
}
correct_answer는 0~3 중 하나입니다 (0=option_1이 정답).`;

      const { data: qs, error: qsError } = await supabase
        .from('quiz_sets')
        .insert({ teacher_id: user.id, class_id: selectedClassId || null, title })
        .select()
        .single();
      if (qsError || !qs) throw qsError || new Error('퀴즈 세트 생성 실패');

      const result = await quizGeneratorAI.generateContent(prompt);
      const raw = result.response.text();
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('AI 응답 파싱 실패');
      const parsed = JSON.parse(jsonMatch[0]);
      if (!parsed.questions || !Array.isArray(parsed.questions)) throw new Error('형식 오류');

      const rows = parsed.questions.map((q: any, i: number) => ({
        quiz_set_id: qs.id,
        order_index: i,
        text: q.text || '',
        option_1: q.option_1 || '',
        option_2: q.option_2 || '',
        option_3: q.option_3 || '',
        option_4: q.option_4 || '',
        correct_answer: q.correct_answer ?? 0,
        time_limit: 20,
      }));
      const { error: insertError } = await supabase.from('quiz_questions').insert(rows);
      if (insertError) throw insertError;

      setMonthAiCount(prev => prev + 1);
      setMessagesByMode(prev => ({
        ...prev,
        quiz_maker: [...prev.quiz_maker, {
          id: crypto.randomUUID(),
          role: 'ai',
          text: `✅ '${title}' 퀴즈에 문항 ${rows.length}개를 만들었어요.`,
          meta: { navigateTo: '/teaching-tools', state: { activeToolId: 'quiz', openQuizSetId: qs.id } },
        }],
      }));
    } catch (err: any) {
      if (err?.message === 'AI_LIMIT_EXCEEDED') {
        setUpgradeReason('ai_limit');
        setUpgradeOpen(true);
      } else {
        console.error('[AiCopilot] 퀴즈 생성 오류:', err);
        setMessagesByMode(prev => ({
          ...prev,
          quiz_maker: [...prev.quiz_maker, { id: crypto.randomUUID(), role: 'ai', text: '죄송합니다. 퀴즈 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }],
        }));
      }
    } finally {
      setLoading(false);
    }
  };

  // 설문 제작가 탭 전용 — 대화로 정리된 목적/문항 수로 실제 survey_forms+survey_questions를 생성·저장하고,
  // 채팅에는 결정론적 요약만 남긴 뒤 /teaching-tools의 설문 도구로 바로 이동할 수 있게 안내한다
  // (퀴즈 제작가와 동일한 "트리거 + 요약" 원칙 — 문항 유형 구성은 채팅이 아닌 이 생성 단계에서 AI가 정한다).
  const handleGenerateSurvey = async (title: string, draftSummary: string) => {
    if (loading || !user?.id) return;

    if (!checkIsBasicOrAbove(profile)) {
      const { count } = await supabase
        .from('survey_forms')
        .select('id', { count: 'exact', head: true })
        .eq('teacher_id', user.id);
      if ((count || 0) >= FREE_SURVEY_LIMIT) {
        setMessagesByMode(prev => ({
          ...prev,
          survey_maker: [...prev.survey_maker, {
            id: crypto.randomUUID(),
            role: 'ai',
            text: '⚠️ 무료 플랜에서는 설문을 1개까지만 만들 수 있어요. 더 만들려면 요금제를 업그레이드해 주세요.',
          }],
        }));
        return;
      }
    }

    if (!checkIsPro(profile) && monthAiCount >= getAiMonthlyLimit(profile)) {
      setUpgradeReason('ai_limit');
      setUpgradeOpen(true);
      return;
    }

    setLoading(true);
    try {
      const countMatch = draftSummary.match(/문항\s*수[:：]\s*(\d+)/);
      const count = countMatch ? Math.max(1, Math.min(15, parseInt(countMatch[1], 10))) : 5;
      const contentSource = loadedReferences.length > 0
        ? loadedReferences.map(r => `### ${r.title}\n${r.content}`).join('\n\n')
        : `(참고 자료 없음 — 아래 요청 내용을 바탕으로 출제)\n${draftSummary}`;

      const prompt = `다음 내용을 바탕으로 설문 문항을 ${count}개 만들어주세요.
아래 6가지 유형(multiple_choice/yes_no/star_rating/short_text/opinion_scale/ranking)을 설문 목적에 맞게 자연스럽게 섞어 구성하세요. 모든 유형을 억지로 다 쓸 필요는 없습니다.
설문 목적:
${contentSource}

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만 출력하세요:
{
  "questions": [
    { "type": "multiple_choice", "text": "문항 내용", "options": [{"label": "선택지1"}, {"label": "선택지2"}] },
    { "type": "yes_no", "text": "문항 내용", "options": [] },
    { "type": "star_rating", "text": "문항 내용", "options": [] },
    { "type": "short_text", "text": "문항 내용", "options": [] },
    { "type": "opinion_scale", "text": "문항 내용", "options": [{"label": "전혀 그렇지 않다"}, {"label": "매우 그렇다"}, {"label": "5"}] },
    { "type": "ranking", "text": "문항 내용", "options": [{"label": "항목1"}, {"label": "항목2"}, {"label": "항목3"}] }
  ]
}
- multiple_choice/ranking의 options는 2개 이상.
- opinion_scale의 options는 반드시 정확히 3개: 저점 라벨, 고점 라벨, 최대점수("5" 또는 "10").
- yes_no/star_rating/short_text의 options는 빈 배열 [].`;

      const { data: form, error: formError } = await supabase
        .from('survey_forms')
        .insert({
          teacher_id: user.id,
          class_id: selectedClassId || null,
          title,
          pin_code: Math.floor(100000 + Math.random() * 900000).toString(),
          status: 'draft',
        })
        .select()
        .single();
      if (formError || !form) throw formError || new Error('설문 생성 실패');

      const result = await surveyGeneratorAI.generateContent(prompt);
      const raw = result.response.text();
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('AI 응답 파싱 실패');
      const parsed = JSON.parse(jsonMatch[0]);
      if (!parsed.questions || !Array.isArray(parsed.questions)) throw new Error('형식 오류');

      const rows = parsed.questions.map((q: any, i: number) => ({
        form_id: form.id,
        order_index: i,
        type: q.type || 'short_text',
        text: q.text || '',
        options: Array.isArray(q.options) ? q.options : [],
      }));
      const { error: insertError } = await supabase.from('survey_questions').insert(rows);
      if (insertError) throw insertError;

      setMonthAiCount(prev => prev + 1);
      setMessagesByMode(prev => ({
        ...prev,
        survey_maker: [...prev.survey_maker, {
          id: crypto.randomUUID(),
          role: 'ai',
          text: `✅ '${title}' 설문에 문항 ${rows.length}개를 만들었어요.`,
          meta: { navigateTo: '/teaching-tools', state: { activeToolId: 'survey', openSurveyFormId: form.id } },
        }],
      }));
    } catch (err: any) {
      if (err?.message === 'AI_LIMIT_EXCEEDED') {
        setUpgradeReason('ai_limit');
        setUpgradeOpen(true);
      } else {
        console.error('[AiCopilot] 설문 생성 오류:', err);
        setMessagesByMode(prev => ({
          ...prev,
          survey_maker: [...prev.survey_maker, { id: crypto.randomUUID(), role: 'ai', text: '죄송합니다. 설문 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }],
        }));
      }
    } finally {
      setLoading(false);
    }
  };

  // 아이디어 정리가 탭 전용 — 대화로 정리된 아이디어를 teacher_notes에 기록만 하고,
  // 실제 구체화(7단계 위저드)는 /dashboard(아이디어 기록)의 기존 화면으로 넘겨서 이어가게 한다
  // (다른 탭들과 달리 AI 생성 호출이 없어 훨씬 단순 — DB insert + 딥링크뿐).
  const handleGenerateIdeaHandoff = async (title: string, content: string) => {
    if (loading || !user?.id) return;

    setLoading(true);
    try {
      const { data: note, error: noteError } = await supabase
        .from('teacher_notes')
        .insert({
          teacher_id: user.id,
          class_id: selectedClassId || null,
          title,
          content,
        })
        .select()
        .single();
      if (noteError || !note) throw noteError || new Error('아이디어 기록 실패');

      setMessagesByMode(prev => ({
        ...prev,
        idea_brainstorm: [...prev.idea_brainstorm, {
          id: crypto.randomUUID(),
          role: 'ai',
          text: `✅ '${title}' 아이디어를 기록했어요.`,
          meta: { navigateTo: '/dashboard', state: { openNoteId: note.id } },
        }],
      }));
    } catch (err: any) {
      console.error('[AiCopilot] 아이디어 기록 오류:', err);
      setMessagesByMode(prev => ({
        ...prev,
        idea_brainstorm: [...prev.idea_brainstorm, { id: crypto.randomUUID(), role: 'ai', text: '죄송합니다. 아이디어를 기록하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }],
      }));
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeTranscript = async (session: { id: string; class_name: string | null; subject: string | null; transcript_text: string }) => {
    if (loading || !user?.id) return;

    if (!checkIsPro(profile) && monthAiCount >= getAiMonthlyLimit(profile)) {
      setUpgradeReason('ai_limit');
      setUpgradeOpen(true);
      return;
    }

    setLoading(true);
    setAnalyzingTranscriptId(session.id);
    try {
      const { data: students } = await supabase.from('students').select('id, full_name').eq('class_id', selectedClassId);
      const studentNames = (students || []).map(s => s.full_name).join(', ');

      // ClassTranscription.tsx의 analyzeTranscript() 프롬프트를 그대로 재사용 — 결과 일관성이 중요하므로 요약/축약하지 않음.
      // lessonGoal/lessonKeywords는 이 트리거에서 얻을 수 없는 값이라 비워 보내며, 프롬프트가 이미 "미입력 시 전사본에서 추론"을 처리한다.
      const prompt = `
당신은 수업 분석 전문가입니다. 아래 수업 전사본을 분석하여 JSON 형식으로만 응답하세요.

[수업 정보]
학급: ${session.class_name ?? '미지정'} / 과목: ${session.subject ?? '미지정'}
학생 명단: ${studentNames || '(명단 없음)'}

[전사본]
${session.transcript_text}

━━━━━━━━━━━━━━━━━━━━━━

[Part 1 — 학생별 관찰]
학생 명단에 있는 각 학생에 대해 분석하세요:
- 이름이 언급된 횟수와 맥락 (칭찬 / 피드백 / 질문 / 지적 등)
- 참여 수준: 적극적(3회 이상 언급 또는 질문) / 보통(1~2회) / 소극적(언급 없음)
- 오늘 수업의 한 줄 관찰 요약 (구체적으로)
- 추가 지도 필요 여부 (오답·이해 부족·집중력 저하 등)
- 명단에 없거나 전혀 언급되지 않은 학생은 notMentioned 배열에 포함

[Part 2 — 수업 품질 평가]
전사본 내용만을 근거로 다음 5개 항목을 5점 만점으로 평가하세요:
1. structure(수업 구성): 도입→전개→마무리 흐름
2. clarity(설명 명확성): 핵심 개념을 이해하기 쉽게 전달했는가
3. engagement(학생 참여 유도): 질문·활동으로 반응을 이끌어냈는가
4. feedback(피드백 품질): 오답·발언에 구체적으로 반응했는가
5. timeManagement(시간 관리): 중요 내용에 적절한 시간을 배분했는가

다음도 포함하세요:
- strengths: 오늘 수업에서 가장 잘된 점 (2~3문장)
- improvements: 개선하면 더 좋을 점 (2~3문장)
- nextClassTip: 다음 수업에서 신경 쓸 것 한 가지 제안 (1문장)

[Part 3 — 선생님 자기평가 리포트]
수업 목표: (미입력 — 전사본에서 목표를 추론하세요)
핵심 개념: (미입력 — 전사본에서 핵심 개념을 추론하세요)

위 수업 목표와 핵심 개념을 기반으로, 전사본 내용만을 근거로 다음을 평가하세요:
1. goalAchievement (목표 달성도, 1-5점): 수업 목표가 전사본에서 얼마나 충실히 다뤄졌는가
2. goalAchievementDetail: 목표 달성도에 대한 구체적 근거 (2~3문장, 전사본의 구체적 장면 언급)
3. coreConceptCoverage (핵심 개념 전달도, 1-5점): 핵심 개념들이 충분히 명확하게 전달됐는가
4. coreConceptDetail: 개념 전달 품질에 대한 구체적 설명 (2문장)
5. questioningSkills (질문 기술, 1-5점): 학생 사고를 유도하는 열린/탐구적 질문을 활용했는가
6. strengths: 오늘 수업의 구체적 강점 3가지 (배열, 각 항목 1~2문장)
7. improvements: 개선하면 더 효과적일 점 3가지 (배열, 각 항목 1~2문장)
8. nextActionItem: 다음 수업에서 바로 실행할 수 있는 구체적 과제 1가지 (1문장)
9. patterns.speechDensity: 전사본의 발언 밀도/속도 판단 ("빠름" | "보통" | "느림")
10. patterns.questionStyle: 질문 스타일 ("닫힌 질문 위주" | "균형적" | "열린 질문 위주")
11. patterns.repeatPhrases: 전사본에서 반복되는 표현 최대 3개 배열 (없으면 빈 배열)

━━━━━━━━━━━━━━━━━━━━━━

아래 JSON 형식으로만 응답하세요. 마크다운이나 다른 텍스트 없이 JSON만 출력하세요:

{
  "studentObservations": [
    {
      "name": "학생이름",
      "participation": "적극적|보통|소극적",
      "mentions": ["언급 내용 1", "언급 내용 2"],
      "summary": "한 줄 관찰 요약",
      "needsAttention": false
    }
  ],
  "notMentioned": ["언급되지 않은 학생 이름"],
  "classEvaluation": {
    "structure": 4,
    "clarity": 4,
    "engagement": 3,
    "feedback": 4,
    "timeManagement": 3,
    "strengths": "잘된 점 설명",
    "improvements": "개선할 점 설명",
    "nextClassTip": "다음 수업 제안"
  },
  "teacherSelfEval": {
    "goalAchievement": 4,
    "goalAchievementDetail": "목표 달성 근거 설명...",
    "coreConceptCoverage": 3,
    "coreConceptDetail": "개념 전달 설명...",
    "questioningSkills": 3,
    "strengths": ["강점1", "강점2", "강점3"],
    "improvements": ["개선점1", "개선점2", "개선점3"],
    "nextActionItem": "다음 수업 실행 과제",
    "patterns": {
      "speechDensity": "보통",
      "questionStyle": "닫힌 질문 위주",
      "repeatPhrases": ["반복 표현1", "반복 표현2"]
    }
  }
}`;

      const response = await transcriptionAI.generateContent(prompt);
      const raw = response.response.text().trim();
      const jsonStr = raw
        .replace(/^```json\s*/m, '')
        .replace(/^```\s*/m, '')
        .replace(/\s*```$/m, '')
        .trim();
      const parsed = JSON.parse(jsonStr);
      parsed.studentObservations = (parsed.studentObservations || []).map((o: any) => ({ ...o, saved: false }));

      const { error: updateError } = await supabase
        .from('class_transcriptions')
        .update({ analysis_result: parsed })
        .eq('id', session.id);
      if (updateError) throw updateError;

      setMonthAiCount(prev => prev + 1);
      setPendingTranscripts(prev => prev.filter(t => t.id !== session.id));

      const evalItems = ['structure', 'clarity', 'engagement', 'feedback', 'timeManagement'];
      const avgScore = (evalItems.reduce((a, k) => a + (parsed.classEvaluation[k] as number), 0) / evalItems.length).toFixed(1);

      setMessagesByMode(prev => ({
        ...prev,
        observation_analyst: [...prev.observation_analyst, {
          id: crypto.randomUUID(),
          role: 'ai',
          text: `✅ '${session.class_name || '학급'}' 수업 전사록을 분석했어요. 학생 ${parsed.studentObservations.length}명 관찰 · 평균 ${avgScore}/5.0`,
          meta: { navigateTo: '/teaching-tools', state: { activeToolId: 'transcription', openSessionId: session.id } },
        }],
      }));
    } catch (err: any) {
      const msg: string = err?.message ?? '';
      if (msg === 'AI_LIMIT_EXCEEDED') {
        setUpgradeReason('ai_limit');
        setUpgradeOpen(true);
      } else {
        console.error('[AiCopilot] 전사 분석 오류:', err);
        let errText = 'AI 분석 중 오류가 발생했습니다. 다시 시도해 주세요.';
        if (msg.includes('429') || msg.toLowerCase().includes('prepayment') || msg.toLowerCase().includes('credits') || msg.toLowerCase().includes('billing')) {
          errText = 'Gemini API 크레딧이 소진되었습니다. Google AI Studio(aistudio.google.com)에서 결제 정보를 확인해주세요.';
        } else if (msg.includes('401') || msg.includes('Invalid') || msg.includes('Unauthorized')) {
          errText = '인증 오류가 발생했습니다. 페이지를 새로고침 후 다시 시도해주세요.';
        }
        setMessagesByMode(prev => ({
          ...prev,
          observation_analyst: [...prev.observation_analyst, { id: crypto.randomUUID(), role: 'ai', text: errText }],
        }));
      }
    } finally {
      setLoading(false);
      setAnalyzingTranscriptId(null);
    }
  };

  const modeConfig = COPILOT_MODES[activeMode];

  const chatPanel = (
      <div className={isFullscreen ? 'fixed inset-0 z-[9999] flex flex-col bg-white' : 'flex flex-col rounded-[2rem] border border-surface-container bg-white shadow-ambient overflow-hidden h-[70vh]'}>
        <div className="px-6 py-4 border-b border-surface-container flex items-center justify-between gap-4 bg-surface/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 text-primary rounded-2xl flex items-center justify-center">
              <Bot size={20} />
            </div>
            <div>
              <p className="text-sm font-black text-on-surface">{modeConfig.chatHeaderTitle}</p>
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{modeConfig.chatHeaderSubtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {classes.length > 0 && (
              <select
                value={selectedClassId}
                onChange={e => setSelectedClassId(e.target.value)}
                className="text-xs font-bold bg-surface-container-low border border-surface-container rounded-xl px-3 py-2 text-on-surface focus:outline-none"
              >
                <option value="">클래스 선택 안 함</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => setIsFullscreen(v => !v)}
              className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container-low hover:text-primary transition-colors"
              aria-label={isFullscreen ? '전체화면 닫기' : '전체화면으로 보기'}
              title={isFullscreen ? '전체화면 닫기' : '전체화면으로 보기'}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
        </div>

        {modeConfig.showStudentPicker && (
          <div className="px-5 py-3 border-b border-surface-container bg-surface/40 shrink-0 space-y-2">
            {!selectedClassId ? (
              <p className="text-[11px] font-bold text-primary/70">먼저 클래스를 선택해 주세요</p>
            ) : seatukStudents.length === 0 ? (
              <p className="text-[11px] font-bold text-on-surface-variant">이 클래스에 등록된 학생이 없어요</p>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setSeatukSelectedIds(seatukStudents.map(s => s.id))}
                    className="px-3 py-1.5 bg-white border border-surface-container rounded-lg text-[11px] font-black text-on-surface-variant hover:border-primary/40 hover:text-primary transition-colors"
                  >
                    전체선택
                  </button>
                  <button
                    type="button"
                    onClick={() => setSeatukSelectedIds(seatukStudents.filter(s => s.hasObservation).map(s => s.id))}
                    className="px-3 py-1.5 bg-white border border-surface-container rounded-lg text-[11px] font-black text-on-surface-variant hover:border-primary/40 hover:text-primary transition-colors"
                  >
                    관찰기록 있는 학생만
                  </button>
                  <button
                    type="button"
                    onClick={() => setSeatukSelectedIds(seatukStudents.filter(s => s.hasObservation && !s.alreadyDraft).map(s => s.id))}
                    className="px-3 py-1.5 bg-white border border-surface-container rounded-lg text-[11px] font-black text-on-surface-variant hover:border-primary/40 hover:text-primary transition-colors"
                  >
                    미작성만
                  </button>
                  <span className="ml-auto text-[11px] font-bold text-on-surface-variant">{seatukSelectedIds.length}명 선택됨</span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar">
                  {seatukStudents.map(s => {
                    const checked = seatukSelectedIds.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleSeatukStudent(s.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black border transition-colors ${
                          checked ? 'bg-primary text-white border-primary' : 'bg-white text-on-surface-variant border-surface-container hover:border-primary/40'
                        } ${!s.hasObservation ? 'opacity-40' : ''}`}
                      >
                        {checked && <Check size={12} />}
                        {s.full_name}
                        {s.alreadyDraft && <span className="opacity-70">·초안</span>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-6 bg-surface/30">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center space-y-4 text-center">
              <div className="w-16 h-16 bg-primary/10 text-primary rounded-3xl flex items-center justify-center">
                <Bot size={32} />
              </div>
              <p className="text-lg font-black text-on-surface">{modeConfig.emptyTitle}</p>
              <p className="text-xs font-bold text-on-surface-variant max-w-sm leading-relaxed">
                {modeConfig.emptyBody}
              </p>
              {modeConfig.quickStarts && (
                selectedClassId ? (
                  <div className="flex flex-wrap justify-center gap-2 pt-2 max-w-md">
                    {modeConfig.quickStarts.map(q => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setInput(q)}
                        className="px-4 py-2 bg-white border border-surface-container rounded-xl text-xs font-bold text-on-surface-variant hover:border-primary/40 hover:text-primary transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] font-bold text-primary/70">먼저 클래스를 선택해 주세요</p>
                )
              )}
            </div>
          )}

          <AnimatePresence initial={false}>
            {messages.map(m => {
              const isDraft = m.role === 'ai' && modeConfig.showDraftActions && !!modeConfig.draftMarker && m.text.includes(modeConfig.draftMarker);
              const isSlideDraft = m.role === 'ai' && modeConfig.showTemplatePicker && m.text.includes(SLIDE_DECK_DRAFT_MARKER);
              const isQuizDraft = m.role === 'ai' && modeConfig.showQuizAction && m.text.includes(QUIZ_DRAFT_MARKER);
              const isSurveyDraft = m.role === 'ai' && modeConfig.showSurveyAction && m.text.includes(SURVEY_DRAFT_MARKER);
              const isIdeaDraft = m.role === 'ai' && modeConfig.showIdeaAction && m.text.includes(IDEA_DRAFT_MARKER);
              const displayText = isDraft
                ? m.text.replace(modeConfig.draftMarker!, '').trim()
                : isSlideDraft
                ? m.text.replace(SLIDE_DECK_DRAFT_MARKER, '').trim()
                : isQuizDraft
                ? m.text.replace(QUIZ_DRAFT_MARKER, '').trim()
                : isSurveyDraft
                ? m.text.replace(SURVEY_DRAFT_MARKER, '').trim()
                : isIdeaDraft
                ? m.text.replace(IDEA_DRAFT_MARKER, '').trim()
                : m.text;
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div className={`w-10 h-10 rounded-2xl shrink-0 flex items-center justify-center border-2 ${m.role === 'user' ? 'bg-surface-container-high border-white text-on-surface' : 'bg-primary text-white border-primary/20 shadow-lg shadow-primary/20'}`}>
                    {m.role === 'user' ? <User size={18} /> : <Bot size={18} />}
                  </div>
                  <div className={`max-w-[85%] p-5 rounded-[1.75rem] text-sm font-bold leading-relaxed shadow-sm ${m.role === 'user' ? 'bg-white rounded-tr-none text-on-surface' : 'bg-white border border-surface-container rounded-tl-none'}`}>
                    <div className="prose prose-sm prose-stone max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={chatMdComponents}>{normalizeMarkdown(displayText)}</ReactMarkdown>
                    </div>
                    {isDraft && (
                      <div className="mt-4 pt-4 border-t border-surface-container flex flex-wrap gap-2">
                        <button
                          onClick={() => handleSaveDraft('material-editor', stripDraftPreamble(displayText))}
                          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-2xl text-xs font-black hover:bg-primary-dim transition-all active:scale-95"
                        >
                          <FolderPlus size={16} />
                          자료함에 저장
                        </button>
                        <button
                          onClick={() => handleSaveDraft('slide-deck', stripDraftPreamble(displayText))}
                          className="flex items-center gap-2 px-4 py-2.5 bg-surface-container-high text-on-surface rounded-2xl text-xs font-black hover:bg-surface-container transition-all active:scale-95"
                        >
                          <Presentation size={16} />
                          슬라이드로 만들기
                        </button>
                        {modeConfig.showCoverPromptAction && (
                          <button
                            onClick={() => handleGenerateCoverPrompts(extractDraftTitle(displayText))}
                            disabled={loading}
                            className="flex items-center gap-2 px-4 py-2.5 bg-surface-container-high text-on-surface rounded-2xl text-xs font-black hover:bg-surface-container transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ImageIcon size={16} />
                            표지 이미지 아이디어 받기
                          </button>
                        )}
                      </div>
                    )}
                    {isSlideDraft && (
                      <div className="mt-4 pt-4 border-t border-surface-container">
                        <p className="text-[11px] font-bold text-on-surface-variant mb-3">디자인을 골라주세요</p>
                        <div className="grid grid-cols-2 gap-2">
                          {SLIDE_TEMPLATES.map(t => (
                            <button
                              key={t.id}
                              type="button"
                              disabled={loading}
                              onClick={() => handleGenerateSlideDeck(t.id, stripDraftPreamble(displayText), extractDraftTitle(displayText))}
                              className="flex items-center gap-2 px-3 py-2.5 bg-surface-container-high text-on-surface rounded-2xl text-xs font-black hover:bg-surface-container transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-left"
                            >
                              <span className="w-5 h-5 rounded-full shrink-0 border border-surface-container" style={{ background: t.swatch }} />
                              <span className="truncate">{t.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {isQuizDraft && (
                      <div className="mt-4 pt-4 border-t border-surface-container">
                        <button
                          onClick={() => handleGenerateQuiz(extractDraftTitle(displayText), displayText)}
                          disabled={loading}
                          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-2xl text-xs font-black hover:bg-primary-dim transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ListChecks size={16} />
                          퀴즈 만들기
                        </button>
                      </div>
                    )}
                    {isSurveyDraft && (
                      <div className="mt-4 pt-4 border-t border-surface-container">
                        <button
                          onClick={() => handleGenerateSurvey(extractDraftTitle(displayText), displayText)}
                          disabled={loading}
                          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-2xl text-xs font-black hover:bg-primary-dim transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ListChecks size={16} />
                          설문 만들기
                        </button>
                      </div>
                    )}
                    {isIdeaDraft && (
                      <div className="mt-4 pt-4 border-t border-surface-container">
                        <button
                          onClick={() => handleGenerateIdeaHandoff(extractDraftTitle(displayText), stripDraftPreamble(displayText))}
                          disabled={loading}
                          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-2xl text-xs font-black hover:bg-primary-dim transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Lightbulb size={16} />
                          아이디어 기록하기
                        </button>
                      </div>
                    )}
                    {m.meta?.navigateTo && (
                      <div className="mt-4 pt-4 border-t border-surface-container">
                        <button
                          onClick={() => navigate(m.meta!.navigateTo, m.meta!.state ? { state: m.meta!.state } : undefined)}
                          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-2xl text-xs font-black hover:bg-primary-dim transition-all active:scale-95"
                        >
                          <ArrowRight size={16} />
                          {activeMode === 'slide_deck_maker' ? '슬라이드 보러 가기' : activeMode === 'quiz_maker' ? '퀴즈 보러 가기' : activeMode === 'survey_maker' ? '설문 보러 가기' : activeMode === 'observation_analyst' ? '분석 결과 보러 가기' : activeMode === 'idea_brainstorm' ? '아이디어 보러 가기' : 'AI 초안 페이지로 이동'}
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {loading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
              <div className="w-10 h-10 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20"><Loader2 size={18} className="animate-spin" /></div>
              <div className="p-5 rounded-[1.75rem] rounded-tl-none bg-white shadow-sm border border-surface-container flex items-center gap-3">
                {activeMode === 'seatuk_writer' && seatukProgress.total > 0 ? (
                  <span className="text-xs font-bold text-on-surface-variant">{seatukProgress.current}/{seatukProgress.total}명 생성 중...</span>
                ) : (
                  <>
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.4s]" />
                  </>
                )}
              </div>
            </motion.div>
          )}
        </div>

        {modeConfig.showReferenceSearch && (loadedReferences.length > 0 || referenceSuggestions.length > 0) && (
        <div className="px-5 pt-4 border-t border-surface-container-high bg-neutral-50 shrink-0 space-y-2">
          {loadedReferences.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {loadedReferences.map(r => (
                <span key={r.id} className="flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 bg-primary/10 text-primary rounded-xl text-[11px] font-black">
                  <Paperclip size={12} />
                  {r.title}
                  <button
                    type="button"
                    onClick={() => setLoadedReferences(prev => prev.filter(x => x.id !== r.id))}
                    className="p-0.5 hover:bg-primary/20 rounded-full transition-colors"
                    aria-label="참고자료 해제"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {referenceSuggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {referenceSuggestions.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handleLoadReference(r)}
                  disabled={loadingReferenceId === r.id}
                  className="flex items-center gap-1.5 pl-3 pr-3 py-1.5 bg-white border border-surface-container rounded-xl text-[11px] font-black text-on-surface-variant hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50"
                >
                  {loadingReferenceId === r.id ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />}
                  <span className="text-primary/70">[{SOURCE_TYPE_LABEL[r.source_type]}]</span> {r.title}
                </button>
              ))}
            </div>
          )}
        </div>
        )}

        {modeConfig.showTranscriptTrigger && pendingTranscripts.length > 0 && (
        <div className="px-5 pt-4 border-t border-surface-container-high bg-neutral-50 shrink-0 space-y-2">
          <p className="text-[11px] font-black text-on-surface-variant/60">분석 대기 중인 전사록</p>
          <div className="flex flex-wrap gap-2">
            {pendingTranscripts.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleAnalyzeTranscript(t)}
                disabled={loading}
                className="flex items-center gap-1.5 pl-3 pr-3 py-1.5 bg-white border border-surface-container rounded-xl text-[11px] font-black text-on-surface-variant hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50"
              >
                {analyzingTranscriptId === t.id ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />}
                {formatTranscriptChipLabel(t.recorded_at, t.duration_seconds)} 분석하기
              </button>
            ))}
          </div>
        </div>
        )}

        <div className={`p-5 shrink-0 bg-neutral-50 ${modeConfig.showReferenceSearch && (loadedReferences.length > 0 || referenceSuggestions.length > 0) ? 'pt-3' : 'border-t border-surface-container-high'}`}>
          <form
            ref={formRef}
            onSubmit={activeMode === 'seatuk_writer' ? handleSeatukGenerate : handleSend}
            className="flex items-end gap-3 bg-white rounded-[1.75rem] border-2 border-transparent focus-within:border-primary/20 shadow-md pl-5 pr-2 py-2"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  formRef.current?.requestSubmit();
                }
              }}
              placeholder={modeConfig.inputPlaceholder}
              rows={1}
              className="flex-1 py-3 bg-transparent text-sm font-black focus:outline-none placeholder:text-neutral-400 resize-none max-h-[200px] overflow-y-auto custom-scrollbar leading-relaxed"
            />
            <button
              type="submit"
              disabled={activeMode === 'seatuk_writer' ? (seatukSelectedIds.length === 0 || loading) : (!input.trim() || loading)}
              className="p-3.5 bg-primary text-white rounded-2xl shadow hover:shadow-primary/40 transition-all disabled:opacity-20 disabled:pointer-events-none active:scale-95 shrink-0"
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>
    );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="px-2">
        <p className="text-primary font-bold text-xs uppercase tracking-widest mb-3">AI 코파일럿 · 파일럿</p>
        <h1 className="text-xl md:text-4xl font-extrabold font-manrope mb-4">{modeConfig.heroTitle}</h1>
        <p className="text-on-surface-variant text-base max-w-2xl leading-relaxed">
          {modeConfig.heroSubtitle}
        </p>
      </div>

      <div className="flex items-center gap-2 px-2">
        {COPILOT_MODE_IDS.map(id => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveMode(id)}
            className={`px-4 py-2 rounded-2xl text-xs font-black transition-all ${
              activeMode === id
                ? 'bg-primary text-white shadow-md shadow-primary/20'
                : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            {COPILOT_MODES[id].tabLabel}
          </button>
        ))}
      </div>

      {isFullscreen ? createPortal(chatPanel, document.body) : chatPanel}

      <UpgradeModal isOpen={upgradeOpen} onClose={() => setUpgradeOpen(false)} reason={upgradeReason} />
    </motion.div>
  );
};

export default AiCopilot;
