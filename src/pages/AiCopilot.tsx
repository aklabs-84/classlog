import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, User, Loader2, FolderPlus, Presentation, Paperclip, X, Check, ArrowRight, Image as ImageIcon, ListChecks, Lightbulb, Maximize2, Minimize2, Users, BookOpen, History, MessageSquarePlus, Trash2, FileText, Sparkles, Link2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '../lib/supabase';
import { useAuth, checkIsPro, checkIsBasicOrAbove, getAiMonthlyLimit, getClassLimit, getStudentLimit, getAiUsageStatus, getBetaDaysLeft } from '../lib/auth';
import { isDemoTeacher } from '../lib/demo';
import { chatWithCopilot, type CopilotModeId as CopilotEngineMode, embedText, generateSeatukDraft, generateSeatukDraftBatch, generateSlideDeckDraft, generateCoverPromptSuggestions, quizGeneratorAI, surveyGeneratorAI, transcriptionAI } from '../lib/gemini';
import UpgradeModal from '../components/UpgradeModal';
import CodeBlock from '../components/CodeBlock';
import type { DeckSlide, SlideLayoutKind } from '../components/slidedeck/types';
import { getTemplate, getLayoutSlotSpec, buildDraftDeckSlides, getSlideTemplateGroups } from '../components/slidedeck/templates';
import ImportMaterialModal, { type ImportableMaterial, resolveSourceContent } from '../components/slidedeck/ImportMaterialModal';
import { tools as TEACHING_TOOLS } from './TeachingTools';
import { PLANS, FEATURE_ROWS } from './Pricing';
import { stashCopilotReturn } from '../lib/copilotReturnState';

const DRAFT_MARKER = '[[LESSON_PLAN_DRAFT]]';
const SLIDE_DECK_DRAFT_MARKER = '[[SLIDE_DECK_DRAFT]]';
const MATERIAL_DRAFT_MARKER = '[[MATERIAL_DRAFT]]';
const QUIZ_DRAFT_MARKER = '[[QUIZ_DRAFT]]';
const SURVEY_DRAFT_MARKER = '[[SURVEY_DRAFT]]';
const IDEA_DRAFT_MARKER = '[[IDEA_DRAFT]]';
const CLASS_CREATE_MARKER = '[[CLASS_CREATE]]';
const STUDENT_ADD_MARKER = '[[STUDENT_ADD]]';
const GROUP_CREATE_MARKER = '[[GROUP_CREATE]]';
const ALL_LAYOUT_KINDS: SlideLayoutKind[] = ['title', 'textOnly', 'textImage1', 'textImagesMany'];
const FREE_SLIDE_DECK_LIMIT = 1;
const FREE_SURVEY_LIMIT = 1;

// 페르소나 아바타 이미지 로드 실패 시(파일 누락/CDN 오류 등) 깨진 이미지 아이콘 대신 보여줄 기본 이미지
const FALLBACK_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='10' fill='%23E5E7EB'/%3E%3Ccircle cx='20' cy='16' r='6' fill='%239CA3AF'/%3E%3Cpath d='M8 33c1.5-7 6.5-11 12-11s10.5 4 12 11' fill='%239CA3AF'/%3E%3C/svg%3E";
const handleAvatarError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.onerror = null;
  e.currentTarget.src = FALLBACK_AVATAR;
};

// 사용법 가이드 탭의 그라운딩 데이터 — TeachingTools.tsx/Pricing.tsx의 실제 화면 데이터를 그대로 재사용해
// 가이드 답변이 실제 앱 상태와 어긋나지 않도록 한다(직접 설명 문구를 새로 쓰지 않음).
const TOOLS_GUIDE_TEXT = TEACHING_TOOLS.map(t => {
  const steps = t.quickGuide?.steps.map((s, i) => `  ${i + 1}. ${s.title} — ${s.desc}`).join('\n') ?? '  (사용 단계 안내 없음)';
  const tip = t.quickGuide?.tip ? `\n  TIP: ${t.quickGuide.tip}` : '';
  return `### ${t.label}\n${t.description}\n${steps}${tip}`;
}).join('\n\n');

const PLANS_GUIDE_TEXT = PLANS.map(p => {
  const feats = FEATURE_ROWS.map(r => {
    const v = p.features[r.key];
    const display = v === true ? '가능' : v === false ? '불가' : v;
    return `  - ${r.label}: ${display}`;
  }).join('\n');
  return `### ${p.name} 플랜 (${p.price}${p.priceAnnual ? ` · 연간 결제 시 ${p.priceAnnual}` : ''})\n${feats}`;
}).join('\n\n')
  + `\n\n### 환불 정책\n  - 결제 후 7일 이내이고 서비스를 이용하지 않았다면 전액 환불.\n  - 7일이 지난 뒤 해지하면, 이미 이용한 기간을 제외한 잔여 기간을 일할 계산해 환불.\n  - Free 플랜은 환불 대상이 아님(결제한 적이 없으므로).`;

// DeckSlide.objects[]의 텍스트류 값만 이어붙여 참고용 텍스트로 사용 (IdeaRecord.tsx의 동일 로직을 자체 함수로 복제)
const extractSlideDeckPreviewText = (slides: DeckSlide[]): string =>
  slides
    .flatMap(slide => slide.objects.map(obj => obj.text))
    .filter((text): text is string => !!text && text.trim().length > 0)
    .join('\n');

// match_my_content RPC 반환 행 — 내 노트/자료/슬라이드 중 임베딩 유사도가 높은 것들 (IdeaRecord.tsx와 동일 shape)
type MatchedContent = { source_type: 'note' | 'material' | 'slide'; id: string; title: string; snippet: string; similarity: number };
// source: 'manual' = 사용자가 직접 불러오거나 선택한 자료, 'auto' = AI가 유사도 기준으로 스스로 찾아 붙인 자료,
// 'handoff' = 다른 에이전트 탭에서 "이어서 만들기"로 넘어온 초안 — 칩 UI에서 구분 표시용
type LoadedReference = { id: string; title: string; content: string; source: 'manual' | 'auto' | 'handoff' };

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

// 학급 관리 코파일럿 전용 — 마커 다음 줄의 JSON 한 줄을 파싱하고, 그 이후 줄들을 화면에 보여줄 자연어 요약으로 분리
function parseActionPayload<T = any>(content: string, marker: string): { payload: T | null; displayText: string } {
  const withoutMarker = content.replace(marker, '').trim();
  const newlineIdx = withoutMarker.indexOf('\n');
  const jsonLine = (newlineIdx === -1 ? withoutMarker : withoutMarker.slice(0, newlineIdx)).trim();
  const rest = newlineIdx === -1 ? '' : withoutMarker.slice(newlineIdx + 1).trim();
  let payload: T | null = null;
  try {
    payload = JSON.parse(jsonLine);
  } catch {
    payload = null;
  }
  return { payload, displayText: rest || '확정된 내용을 확인해 주세요.' };
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

// 대화 기록 저장/불러오기 — 목록에서는 messages 본문 없이 요약만 조회
type ConversationSummary = { id: string; title: string; updated_at: string };

// 페르소나(탭)별 순수 카피/UI 플래그. 쿼리·호출 함수 같은 로직은 컴포넌트 안에서 모드별로 직접 분기한다
// (페르소나마다 실제 로직이 다르므로 여기 억지로 파라미터화하지 않음 — 프로젝트 관행상 성급한 공용 추상화 지양).
type CopilotModeId = 'lesson_plan' | 'observation_analyst' | 'seatuk_writer' | 'slide_deck_maker' | 'material_maker' | 'quiz_maker' | 'survey_maker' | 'idea_brainstorm' | 'class_manager' | 'app_guide';

// 대화 상태(메시지/선택 학급 등)를 sessionStorage에 보존 — 딥링크로 다른 화면(클래스룸 등)에 다녀와도
// 컴포넌트가 언마운트-리마운트되면서 대화가 초기화되지 않도록 한다.
const COPILOT_SESSION_KEY = 'copilot_session_state_v1';
type PersistedCopilotState = {
  messagesByMode?: Partial<Record<CopilotModeId, CopilotMessage[]>>;
  activeMode?: CopilotModeId;
  selectedClassId?: string;
  loadedReferences?: LoadedReference[];
};
const readPersistedCopilotState = (): PersistedCopilotState => {
  try {
    const raw = sessionStorage.getItem(COPILOT_SESSION_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

type CopilotModeConfig = {
  tabLabel: string;
  personaName: string;
  personaEnglishName: string;
  personaRole: string;
  personaAvatar: string;
  themeColor: string;
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
  showClassManagerAction?: boolean;
  showMaterialImport?: boolean;
};

const COPILOT_MODES: Record<CopilotModeId, CopilotModeConfig> = {
  app_guide: {
    tabLabel: '사용법 가이드',
    personaName: '나비',
    personaEnglishName: 'Navi',
    personaRole: '친절한 내비게이터',
    personaAvatar: '/agents/navi.jpg',
    themeColor: '#0284c7',
    heroTitle: '나비 · 사용법 가이드',
    heroSubtitle: '이 앱을 어떻게 쓰는지 무엇이든 물어보세요. 클래스 생성 방법부터 수업 도구 사용법, 요금제, 지금 내 AI 사용량까지 안내해 드려요.',
    chatHeaderTitle: '나비 · 사용법 가이드',
    chatHeaderSubtitle: '앱 사용법에 대해 무엇이든 물어보세요',
    emptyTitle: '무엇이 궁금하신가요?',
    emptyBody: '예: "클래스는 어떻게 만들어?", "지금 내 AI 사용량이 얼마나 남았어?", "무료랑 Pro 뭐가 달라?" 처럼 편하게 물어보세요.',
    inputPlaceholder: '앱 사용법에 대해 궁금한 점을 물어보세요...',
    showDraftActions: false,
    showReferenceSearch: false,
    quickStarts: [
      '클래스는 어떻게 만들어?',
      '지금 내 AI 사용량이 얼마나 남았어?',
      '수업 도구에는 어떤 기능이 있어?',
      '무료랑 Pro 플랜 차이가 뭐야?',
    ],
  },
  class_manager: {
    tabLabel: '학급 관리',
    personaName: '레오',
    personaEnglishName: 'Leo',
    personaRole: '학급 경영 캡틴',
    personaAvatar: '/agents/leo.jpg',
    themeColor: '#0f766e',
    heroTitle: '레오 · 학급 관리 비서',
    heroSubtitle: '대화만으로 학급을 만들고, 학생을 추가하고, 조를 나눠 자동으로 배치할 수 있어요. 세부 설정은 확정 후 기존 화면에서 마무리해요.',
    chatHeaderTitle: '레오 · 학급 관리 비서',
    chatHeaderSubtitle: '대화로 학급/학생/조 만들기',
    emptyTitle: '어떤 학급 작업을 도와드릴까요?',
    emptyBody: '예: "3학년 2반 담임 학급 만들어줘", "1번 김민준, 2번 이서연 학생 추가해줘", "조 4개 만들고 자동으로 배치해줘" 처럼 편하게 말씀해 주세요.',
    inputPlaceholder: '학급/학생/조 관련 요청을 편하게 이야기해 보세요...',
    showDraftActions: false,
    showReferenceSearch: false,
    showClassManagerAction: true,
    quickStarts: [
      '3학년 2반 담임 학급 만들어줘',
      '1번 김민준, 2번 이서연, 3번 박지후 학생 추가해줘',
      '학생 4명씩 6개 모둠으로 자동 편성해줘',
      '학급 자치 규칙 5가지 추천해줘',
    ],
  },
  idea_brainstorm: {
    tabLabel: '아이디어 기획',
    personaName: '스파크',
    personaEnglishName: 'Spark',
    personaRole: '영감 메이커',
    personaAvatar: '/agents/spark.jpg',
    themeColor: '#9333ea',
    heroTitle: '스파크 · 아이디어 정리가',
    heroSubtitle: '막연한 수업 아이디어를 편하게 이야기해 보세요. 정리되면 아이디어 기록으로 보내드려요, 거기서 더 구체적인 질문으로 이어서 수업 기획안까지 발전시킬 수 있어요.',
    chatHeaderTitle: '스파크 · 아이디어 정리가',
    chatHeaderSubtitle: '대화로 아이디어 정리하기',
    emptyTitle: '어떤 아이디어를 떠올리셨나요?',
    emptyBody: '예: "다음 주에 모둠별로 뭔가 발표하는 활동을 해보고 싶어" 처럼 편하게 말씀해 주세요.',
    inputPlaceholder: '떠오른 수업 아이디어를 편하게 이야기해 보세요...',
    showDraftActions: false,
    showReferenceSearch: false,
    showIdeaAction: true,
    quickStarts: [
      '중2 과학 광합성 모둠 실험 및 참여형 활동 아이디어 3가지',
      '수학 일차함수 실생활 연계 프로젝트 수업 아이디어',
      '학생 참여도를 높이는 토론 수업 주제 추천해줘',
      '학기 초 학생들과 친해지는 10분 아이스브레이킹 게임',
    ],
  },
  lesson_plan: {
    tabLabel: '수업 기획',
    personaName: '루카스',
    personaEnglishName: 'Lucas',
    personaRole: '수업 설계 마스터',
    personaAvatar: '/agents/lucas.jpg',
    themeColor: '#059669',
    heroTitle: '루카스 · 수업 기획 전문가',
    heroSubtitle: '동료 교사와 대화하듯 편하게 수업 아이디어를 이야기해 보세요. 필요한 것만 되물으며 계획안 초안까지 함께 만들어 드립니다.',
    chatHeaderTitle: '루카스 · 수업 기획 전문가',
    chatHeaderSubtitle: '대화로 수업 계획안 만들기',
    emptyTitle: '어떤 수업을 준비하고 계신가요?',
    emptyBody: '예: "중학교 2학년 과학, 광합성 수업 하나 짜줘" 처럼 편하게 말씀해 주세요.',
    inputPlaceholder: '수업 아이디어를 편하게 이야기해 보세요...',
    showDraftActions: true,
    showReferenceSearch: true,
    showMaterialImport: true,
    draftMarker: DRAFT_MARKER,
    quickStarts: [
      '중2 과학 광합성 단원 50분 차시 수업 계획안 짜줘',
      '고1 통합사회 인권 단원 참여형 교수학습 과정안',
      '학생 주도적 탐구 활동이 들어간 2차시 블록수업안',
      '스마트 기기를 활용한 디지털 기반 참여형 수업 지도안',
    ],
  },
  material_maker: {
    tabLabel: '수업 가이드 제작',
    personaName: '밀로',
    personaEnglishName: 'Milo',
    personaRole: '학습지 아키텍트',
    personaAvatar: '/agents/milo.jpg',
    themeColor: '#d97706',
    heroTitle: '밀로 · 수업 가이드 제작가',
    heroSubtitle: '학생에게 나눠줄 학습지·유인물을 편하게 이야기해 보세요. 내용이 정리되면 자료함으로 바로 저장하거나 표지 이미지 아이디어도 받을 수 있어요.',
    chatHeaderTitle: '밀로 · 수업 가이드 제작가',
    chatHeaderSubtitle: '대화로 학습지 만들기',
    emptyTitle: '어떤 자료를 만들고 싶으신가요?',
    emptyBody: '예: "중학교 2학년 과학, 광합성 관련 학습지 만들어줘" 처럼 편하게 말씀해 주세요.',
    inputPlaceholder: '자료에 담고 싶은 내용을 편하게 이야기해 보세요...',
    showDraftActions: true,
    showReferenceSearch: true,
    showMaterialImport: true,
    draftMarker: MATERIAL_DRAFT_MARKER,
    showCoverPromptAction: true,
    quickStarts: [
      '중2 과학 광합성 모둠 탐구 실험 활동지 만들어줘',
      '수업 마무리용 빈칸 채우기 핵심 정리 학습지',
      '초등 5학년 역사 삼국통일 사건 흐름도 유인물',
      '자기주도 문제 해결을 위한 단계별 가이드 학습지',
    ],
  },
  slide_deck_maker: {
    tabLabel: '슬라이드 제작',
    personaName: '루나',
    personaEnglishName: 'Luna',
    personaRole: '비주얼 프레젠터',
    personaAvatar: '/agents/luna.jpg',
    themeColor: '#ea580c',
    heroTitle: '루나 · 슬라이드 제작가',
    heroSubtitle: '만들고 싶은 슬라이드의 내용을 편하게 이야기해 보세요. 내용이 정리되면 디자인을 골라 바로 슬라이드로 만들어 드립니다.',
    chatHeaderTitle: '루나 · 슬라이드 제작가',
    chatHeaderSubtitle: '대화로 슬라이드 만들기',
    emptyTitle: '어떤 슬라이드를 만들고 싶으신가요?',
    emptyBody: '예: "중학교 2학년 과학, 광합성 관련 5장짜리 슬라이드 만들어줘" 처럼 편하게 말씀해 주세요.',
    inputPlaceholder: '슬라이드에 담고 싶은 내용을 편하게 이야기해 보세요...',
    showDraftActions: false,
    showReferenceSearch: true,
    showTemplatePicker: true,
    showMaterialImport: true,
    quickStarts: [
      '중2 과학 광합성 핵심 개념 설명 5장 슬라이드',
      '학기 초 첫 시간 오리엔테이션 및 수업 규칙 4장',
      '모둠 활동 방법 및 유의사항 안내 3장 슬라이드',
      '수업 도입용 흥미 유발 질문과 퀴즈 4장 슬라이드',
    ],
  },
  quiz_maker: {
    tabLabel: '퀴즈 제작',
    personaName: '피코',
    personaEnglishName: 'Pico',
    personaRole: '퀴즈 챌린저',
    personaAvatar: '/agents/pico.jpg',
    themeColor: '#dc2626',
    heroTitle: '피코 · 퀴즈 제작가',
    heroSubtitle: '어떤 내용으로, 몇 문항을, 어떤 난이도로 퀴즈를 낼지 편하게 이야기해 보세요. 사양이 정해지면 실제 퀴즈 문항까지 만들어 드립니다.',
    chatHeaderTitle: '피코 · 퀴즈 제작가',
    chatHeaderSubtitle: '대화로 퀴즈 만들기',
    emptyTitle: '어떤 퀴즈를 만들고 싶으신가요?',
    emptyBody: '예: "중학교 2학년 과학, 광합성 관련 5문항 퀴즈 만들어줘" 처럼 편하게 말씀해 주세요.',
    inputPlaceholder: '퀴즈에 담고 싶은 내용을 편하게 이야기해 보세요...',
    showDraftActions: false,
    showReferenceSearch: true,
    showQuizAction: true,
    showMaterialImport: true,
    quickStarts: [
      '중2 과학 광합성 단원 4지선다 객관식 5문항',
      '수업 직후 3분 형성평가용 O/X 퀴즈 5문항',
      '상/중/하 난이도별 서술형 및 단답형 퀴즈 3문항',
      '모둠 대항전 골든벨용 재미있는 퀴즈 5문항',
    ],
  },
  survey_maker: {
    tabLabel: '설문 제작',
    personaName: '소피',
    personaEnglishName: 'Sophie',
    personaRole: '피드백 컨설턴트',
    personaAvatar: '/agents/sophie.jpg',
    themeColor: '#4338ca',
    heroTitle: '소피 · 설문 제작가',
    heroSubtitle: '어떤 목적으로, 몇 문항짜리 설문을 만들지 편하게 이야기해 보세요. 사양이 정해지면 다양한 유형의 문항으로 실제 설문까지 만들어 드립니다.',
    chatHeaderTitle: '소피 · 설문 제작가',
    chatHeaderSubtitle: '대화로 설문 만들기',
    emptyTitle: '어떤 설문을 만들고 싶으신가요?',
    emptyBody: '예: "이번 학기 수업 만족도 조사 5문항 만들어줘" 처럼 편하게 말씀해 주세요.',
    inputPlaceholder: '설문에 담고 싶은 내용을 편하게 이야기해 보세요...',
    showDraftActions: false,
    showReferenceSearch: true,
    showSurveyAction: true,
    showMaterialImport: true,
    quickStarts: [
      '이번 학기 수업 만족도 및 개선점 조사 5문항',
      '모둠 협동 활동 동료 평가 및 자기성찰 설문 4문항',
      '학기 초 학생 학습 성향 및 진로 희망 사전 설문',
      '현장체험학습 사후 만족도 및 소감 조사 5문항',
    ],
  },
  observation_analyst: {
    tabLabel: '관찰기록 분석',
    personaName: '올리버',
    personaEnglishName: 'Oliver',
    personaRole: '관찰 데이터 탐정',
    personaAvatar: '/agents/oliver.jpg',
    themeColor: '#2563eb',
    heroTitle: '올리버 · 관찰기록 분석가',
    heroSubtitle: '쌓아온 관찰 기록을 함께 들여다보며 특이사항과 패턴을 찾아 드립니다. 기록에 근거해서만 답변해요.',
    chatHeaderTitle: '올리버 · 관찰기록 분석가',
    chatHeaderSubtitle: '기록 기반으로만 답변해요',
    emptyTitle: '관찰 기록에 대해 물어보세요',
    emptyBody: '이번 주 특이사항, 참여도 변화, 기록이 뜸한 학생 등을 물어볼 수 있어요.',
    inputPlaceholder: '관찰기록에 대해 궁금한 점을 물어보세요...',
    showDraftActions: false,
    showReferenceSearch: false,
    showTranscriptTrigger: true,
    quickStarts: [
      '이번 주 우리 반 관찰기록 핵심 요약해줘',
      '최근 한 달간 관찰기록이 뜸한 학생 누구야?',
      '학생별 수업 참여도 및 발표 태도 변화 비교해줘',
      '칭찬이나 상담이 필요한 학생 추천해줘',
    ],
  },
  seatuk_writer: {
    tabLabel: '세특 작성',
    personaName: '클레어',
    personaEnglishName: 'Claire',
    personaRole: '생기부 문장가',
    personaAvatar: '/agents/claire.jpg',
    themeColor: '#7c3aed',
    heroTitle: '클레어 · 세특 작성가',
    heroSubtitle: '학생을 고르고 요청하면 초안을 만들어 드려요. 채팅에는 결과 요약만 보여드리고, 실제 문구는 AI 초안 페이지에서 확인·다듬을 수 있어요.',
    chatHeaderTitle: '클레어 · 세특 작성가',
    chatHeaderSubtitle: '요청하면 AI 초안 페이지에 저장돼요',
    emptyTitle: '학생을 선택하고 요청해 보세요',
    emptyBody: '위에서 학생을 고르고, 참고할 지침이 있다면 적은 뒤 전송해 주세요. 지침은 비워둬도 괜찮아요.',
    inputPlaceholder: '참고할 지침이 있다면 적어주세요 (선택)',
    showDraftActions: false,
    showReferenceSearch: false,
    showStudentPicker: true,
    quickStarts: [
      '선택한 학생들의 관찰기록 기반 세특 초안 작성해줘',
      '학생의 주도성과 협동심을 돋보이게 하는 문장으로 다듬어줘',
    ],
  },
};

// 교사의 실제 업무 사이클 기준 10개 탭 순서
const COPILOT_MODE_IDS: CopilotModeId[] = [
  'app_guide',
  'class_manager',
  'idea_brainstorm',
  'lesson_plan',
  'material_maker',
  'slide_deck_maker',
  'quiz_maker',
  'survey_maker',
  'observation_analyst',
  'seatuk_writer',
];

type AgentCategory = 'all' | 'start' | 'plan_material' | 'eval_activity';

const AGENT_CATEGORIES: { key: AgentCategory; label: string; icon: string; modeIds: CopilotModeId[] }[] = [
  { key: 'all', label: '전체 보기 (10)', icon: '🌟', modeIds: COPILOT_MODE_IDS },
  { key: 'start', label: '🚀 시작 & 학급 (2)', icon: '🚀', modeIds: ['app_guide', 'class_manager'] },
  { key: 'plan_material', label: '🧭 기획 & 자료 (4)', icon: '🧭', modeIds: ['idea_brainstorm', 'lesson_plan', 'material_maker', 'slide_deck_maker'] },
  { key: 'eval_activity', label: '🎯 참여 & 평가 (4)', icon: '🎯', modeIds: ['quiz_maker', 'survey_maker', 'observation_analyst', 'seatuk_writer'] },
];

// 탭 간 "이어가기" — 한 탭에서 확정된 초안을 다음 탭의 참고자료로 넘길 수 있는 자연스러운 조합만 선별.
const HANDOFF_TARGETS: Partial<Record<CopilotModeId, CopilotModeId[]>> = {
  idea_brainstorm: ['lesson_plan', 'material_maker', 'slide_deck_maker', 'quiz_maker', 'survey_maker'],
  lesson_plan: ['slide_deck_maker', 'material_maker', 'quiz_maker', 'survey_maker'],
  material_maker: ['slide_deck_maker', 'quiz_maker', 'survey_maker'],
  slide_deck_maker: ['quiz_maker', 'survey_maker'],
};

const AiCopilot = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  // 딥링크로 다른 화면에 다녀와도 대화가 끊기지 않도록, 최초 마운트 시 sessionStorage에서 이전 세션을 복원한다.
  const [persistedState] = useState<PersistedCopilotState>(() => readPersistedCopilotState());

  const [activeMode, setActiveMode] = useState<CopilotModeId>(persistedState.activeMode || 'app_guide');
  const [selectedCategory, setSelectedCategory] = useState<AgentCategory>('all');
  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [messagesByMode, setMessagesByMode] = useState<Record<CopilotModeId, CopilotMessage[]>>({
    app_guide: [],
    class_manager: [],
    idea_brainstorm: [],
    lesson_plan: [],
    material_maker: [],
    slide_deck_maker: [],
    quiz_maker: [],
    survey_maker: [],
    observation_analyst: [],
    seatuk_writer: [],
    ...persistedState.messagesByMode,
  });
  const messages = messagesByMode[activeMode];

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  // 채팅 내 슬라이드 템플릿 픽커 — 레이아웃 그룹별로 고른 색상 테마 인덱스(TemplateGallery와 동일한 방식)
  const [slideThemeIdxByGroup, setSlideThemeIdxByGroup] = useState<Record<string, number>>({});
  const [classes, setClasses] = useState<{ id: string; name: string; subject?: string; class_type?: string; weekly_plan?: { week: number; topic: string }[] }[]>([]);
  const [selectedClassId, setSelectedClassId] = useState(persistedState.selectedClassId || '');
  const [monthAiCount, setMonthAiCount] = useState(0);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<'ai_limit' | 'ai_bulk' | 'class_limit'>('ai_limit');
  const [seatukCostConfirmOpen, setSeatukCostConfirmOpen] = useState(false);
  const [seatukPendingCount, setSeatukPendingCount] = useState(0);
  const [lessonPlanObservations, setLessonPlanObservations] = useState<any[]>([]);
  const [analystObservations, setAnalystObservations] = useState<any[]>([]);
  const [referenceSuggestions, setReferenceSuggestions] = useState<MatchedContent[]>([]);
  const [loadedReferences, setLoadedReferences] = useState<LoadedReference[]>(persistedState.loadedReferences || []);
  // "이어서 만들기"로 다른 탭에서 넘어온 직후를 표시하는 배너용 — 사용자가 탭을 직접 클릭하면 해제된다
  const [handoffOrigin, setHandoffOrigin] = useState<{ fromMode: CopilotModeId; title: string } | null>(null);
  const [libraryIndex, setLibraryIndex] = useState<{ title: string; snippet: string }[]>([]);
  const [loadingReferenceId, setLoadingReferenceId] = useState<string | null>(null);
  const [showMaterialImportModal, setShowMaterialImportModal] = useState(false);
  const [seatukStudents, setSeatukStudents] = useState<{ id: string; full_name: string; hasObservation: boolean; alreadyDraft: boolean }[]>([]);
  const [seatukSelectedIds, setSeatukSelectedIds] = useState<string[]>([]);
  const [seatukProgress, setSeatukProgress] = useState({ current: 0, total: 0 });
  const [pendingTranscripts, setPendingTranscripts] = useState<{ id: string; class_name: string | null; subject: string | null; transcript_text: string; duration_seconds: number; recorded_at: string }[]>([]);
  const [analyzingTranscriptId, setAnalyzingTranscriptId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const isComposingRef = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 대화 기록 저장/불러오기 — 모드별로 현재 이어쓰고 있는 conversation row id를 추적(없으면 다음 저장 시 새로 생성)
  const [conversationIdByMode, setConversationIdByMode] = useState<Record<CopilotModeId, string | null>>({
    app_guide: null, class_manager: null, idea_brainstorm: null, lesson_plan: null,
    material_maker: null, slide_deck_maker: null, quiz_maker: null, survey_maker: null,
    observation_analyst: null, seatuk_writer: null,
  });
  const conversationIdByModeRef = useRef(conversationIdByMode);
  useEffect(() => { conversationIdByModeRef.current = conversationIdByMode; }, [conversationIdByMode]);
  const saveTimersRef = useRef<Partial<Record<CopilotModeId, ReturnType<typeof setTimeout>>>>({});

  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [conversationList, setConversationList] = useState<ConversationSummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);

  // 딥링크로 다른 화면에 다녀오는 짧은 왕복 동안 대화/선택 학급을 잃지 않도록 sessionStorage에 계속 동기화.
  // DB에 저장되는 "대화 기록"(conversationIdByMode)과는 별개로, 새로고침 없이 페이지를 오갈 때만 쓰는 임시 캐시.
  useEffect(() => {
    try {
      sessionStorage.setItem(COPILOT_SESSION_KEY, JSON.stringify({ messagesByMode, activeMode, selectedClassId, loadedReferences }));
    } catch {
      // sessionStorage 가득 참/비활성화 시에도 대화 자체는 계속 진행 가능하므로 조용히 무시
    }
  }, [messagesByMode, activeMode, selectedClassId, loadedReferences]);

  useEffect(() => {
    if (!user?.id) return;
    supabase.from('classes').select('id, name, subject, class_type, weekly_plan').eq('teacher_id', user.id).then(({ data }) => {
      if (data) setClasses(data);
    });
  }, [user?.id]);

  // 공통 자료함(class_id 없음) 제목+짧은 요약 목록 — AI가 "공통자료에 뭐 있어?" 같은 질문에
  // 매번 검색 없이도 바로 답할 수 있게 항상 가벼운 형태로 시스템 프롬프트에 포함시킨다
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('class_materials')
      .select('title, content')
      .is('class_id', null)
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false })
      .limit(60)
      .then(({ data }) => {
        setLibraryIndex((data || []).map(m => ({ title: m.title, snippet: (m.content || '').replace(/\s+/g, ' ').trim().slice(0, 120) })));
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

  // 사용법 가이드 탭용 — 지금 이 선생님의 실제 플랜/AI 사용량 상태를 문장으로 요약해 그라운딩 데이터로 전달
  const guideAccountContext = (() => {
    const planLabel = profile?.plan === 'free' ? 'Free'
      : profile?.plan === 'basic' ? 'Basic'
      : profile?.plan === 'pro' ? 'Pro'
      : profile?.plan === 'school' ? 'School'
      : profile?.plan === 'admin' ? 'Admin'
      : (profile?.plan ?? '알 수 없음');
    const hasByokKey = typeof window !== 'undefined' && !!localStorage.getItem('gemini_api_key');
    const betaDaysLeft = getBetaDaysLeft(profile);
    const usage = getAiUsageStatus(profile);
    const parts = [`현재 플랜: ${planLabel}`];
    if (hasByokKey) parts.push('내 Gemini API 키(BYOK)를 설정에 등록해 사용 중 → AI 사용량 무제한');
    else if (betaDaysLeft != null) parts.push(`베타 체험 기간 중(${betaDaysLeft}일 남음) → 이 기간 동안 Pro 기능을 무제한으로 사용 가능`);
    else if (!usage) parts.push('이 플랜은 AI 사용량이 넉넉하거나 제한이 없음');
    else if (usage.kind === 'count') parts.push(`이번 달 AI 사용: ${usage.used}/${usage.limit}회 사용함(매월 1일 초기화)`);
    else parts.push(`이번 달 AI 사용 예산 소진율: 약 ${usage.percent}%${usage.state === 'saving' ? ' → 현재 절약 모드(더 저렴한 모델)로 자동 전환된 상태' : usage.state === 'critical' ? ' → 한도에 근접' : ''}`);
    return parts.join('\n');
  })();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // 대화 기록 자동 저장 — 메시지가 바뀔 때마다(주고받을 때마다) 600ms 디바운스로 upsert.
  // 모드별로 이어쓰는 row가 있으면 update, 없으면 새로 insert 후 id를 기억해둔다.
  useEffect(() => {
    if (!user?.id || messages.length === 0) return;
    const mode = activeMode;
    const msgsSnapshot = messages;
    if (saveTimersRef.current[mode]) clearTimeout(saveTimersRef.current[mode]);
    saveTimersRef.current[mode] = setTimeout(async () => {
      const existingId = conversationIdByModeRef.current[mode];
      const firstUserMsg = msgsSnapshot.find(m => m.role === 'user')?.text.trim() || COPILOT_MODES[mode].tabLabel;
      const title = firstUserMsg.length > 60 ? `${firstUserMsg.slice(0, 60)}…` : firstUserMsg;
      if (existingId) {
        await supabase.from('ai_copilot_conversations')
          .update({ messages: msgsSnapshot, title, updated_at: new Date().toISOString() })
          .eq('id', existingId);
      } else {
        const { data } = await supabase.from('ai_copilot_conversations')
          .insert({ teacher_id: user.id, mode, title, messages: msgsSnapshot })
          .select('id')
          .single();
        if (data) setConversationIdByMode(prev => ({ ...prev, [mode]: data.id }));
      }
    }, 600);
  }, [messages, activeMode, user?.id]);

  const openHistoryModal = async () => {
    setHistoryModalOpen(true);
    if (!user?.id) return;
    setLoadingHistory(true);
    const { data } = await supabase
      .from('ai_copilot_conversations')
      .select('id, title, updated_at')
      .eq('teacher_id', user.id)
      .eq('mode', activeMode)
      .order('updated_at', { ascending: false })
      .limit(50);
    setConversationList(data || []);
    setLoadingHistory(false);
  };

  const handleLoadConversation = async (id: string) => {
    const { data } = await supabase.from('ai_copilot_conversations').select('messages').eq('id', id).single();
    if (data?.messages) {
      setMessagesByMode(prev => ({ ...prev, [activeMode]: data.messages }));
      setConversationIdByMode(prev => ({ ...prev, [activeMode]: id }));
    }
    setHistoryModalOpen(false);
  };

  const handleDeleteConversation = async (id: string) => {
    setDeletingConversationId(id);
    await supabase.from('ai_copilot_conversations').delete().eq('id', id);
    setConversationList(prev => prev.filter(c => c.id !== id));
    if (conversationIdByModeRef.current[activeMode] === id) {
      setConversationIdByMode(prev => ({ ...prev, [activeMode]: null }));
      setMessagesByMode(prev => ({ ...prev, [activeMode]: [] }));
    }
    setDeletingConversationId(null);
  };

  const handleStartNewConversation = () => {
    setMessagesByMode(prev => ({ ...prev, [activeMode]: [] }));
    setConversationIdByMode(prev => ({ ...prev, [activeMode]: null }));
    setHistoryModalOpen(false);
  };

  // 입력창 높이를 내용에 맞춰 자동으로 늘림(최대 8줄 정도까지, 그 이상은 스크롤)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  // MatchedContent 한 건의 원문 전체를 가져온다 (스니펫은 200자로 잘려 있어 AI 컨텍스트로 쓰기엔 부족)
  const fetchReferenceContent = async (item: MatchedContent): Promise<string> => {
    if (item.source_type === 'note') {
      const { data } = await supabase.from('teacher_notes').select('content').eq('id', item.id).single();
      return data?.content ?? item.snippet;
    } else if (item.source_type === 'material') {
      const { data } = await supabase.from('class_materials').select('content').eq('id', item.id).single();
      return data?.content ?? item.snippet;
    } else {
      const { data } = await supabase.from('slide_decks').select('slides').eq('id', item.id).single();
      return data?.slides ? extractSlideDeckPreviewText(data.slides as DeckSlide[]) : item.snippet;
    }
  };

  const AUTO_LOAD_SIMILARITY = 0.62;
  const SUGGEST_SIMILARITY = 0.55;

  // 이번 메시지와 의미적으로 유사한 내 과거 자료(노트/수업자료/슬라이드 — 공통자료함 포함)를 검색해,
  // 확신도가 높은 자료는 원문까지 자동으로 불러와 이번 AI 응답부터 바로 대화로 참고할 수 있게 하고,
  // 애매한 것들은 기존처럼 "참고자료 제안" 카드로 남겨 수동으로 고르게 한다.
  // AI 호출 직전에 await로 실행되어야 이번 턴 응답에 반영되므로, 화면에 보여줄 참고자료 목록을 그대로 반환한다.
  const resolveAutoReferences = async (
    query: string,
    currentLoaded: LoadedReference[],
  ): Promise<LoadedReference[]> => {
    try {
      const vector = await embedText(query);
      if (vector.length === 0) return currentLoaded;
      const { data, error } = await supabase.rpc('match_my_content', {
        query_embedding: vector,
        match_count: 5,
        exclude_note_id: null,
      });
      if (error) throw error;
      const loadedIds = new Set(currentLoaded.map(r => r.id));
      const matches = ((data ?? []) as MatchedContent[]).filter(r => !loadedIds.has(r.id));

      setReferenceSuggestions(
        matches.filter(r => r.similarity > SUGGEST_SIMILARITY && r.similarity <= AUTO_LOAD_SIMILARITY).slice(0, 3)
      );

      const autoLoad = matches.filter(r => r.similarity > AUTO_LOAD_SIMILARITY).slice(0, 2);
      if (autoLoad.length === 0) return currentLoaded;

      const fetched = await Promise.all(autoLoad.map(async item => ({
        id: item.id,
        title: item.title,
        content: await fetchReferenceContent(item),
        source: 'auto' as const,
      })));
      return [...currentLoaded, ...fetched];
    } catch (err) {
      console.error('[AiCopilot] 참고자료 자동 검색 오류:', err);
      return currentLoaded;
    }
  };

  // "불러오기" 클릭 시 스니펫(200자) 대신 원문 전체를 가져와 다음 AI 호출부터 컨텍스트로 포함시킨다
  const handleLoadReference = async (item: MatchedContent) => {
    setLoadingReferenceId(item.id);
    try {
      const content = await fetchReferenceContent(item);
      setLoadedReferences(prev => [...prev, { id: item.id, title: item.title, content, source: 'manual' }]);
      setReferenceSuggestions(prev => prev.filter(r => r.id !== item.id));
    } catch (err) {
      console.error('[AiCopilot] 참고자료 로드 오류:', err);
    } finally {
      setLoadingReferenceId(null);
    }
  };

  // "학급 자료에서 불러오기" 모달(클래스 → 주차별 자료 2단계 선택)에서 자료를 고르면 참고자료로 추가하고,
  // 그 자료가 속한 클래스로 상단 클래스 선택도 맞춰준다 — 대화로 어떤 자료인지 다시 설명할 필요가 없게 한다.
  const handleImportMaterialAsReference = (material: ImportableMaterial) => {
    if (loadedReferences.some(r => r.id === material.id)) return;
    const content = resolveSourceContent(material);
    setLoadedReferences(prev => [...prev, { id: material.id, title: material.title, content, source: 'manual' }]);
    if (material.class_id && material.class_id !== selectedClassId) {
      setSelectedClassId(material.class_id);
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
    const usesReferences = modeAtSend === 'lesson_plan' || modeAtSend === 'slide_deck_maker' || modeAtSend === 'material_maker' || modeAtSend === 'quiz_maker' || modeAtSend === 'survey_maker';
    let activeReferences = loadedReferences;
    if (usesReferences) {
      activeReferences = await resolveAutoReferences(userMessage, loadedReferences);
      if (activeReferences !== loadedReferences) setLoadedReferences(activeReferences);
    }

    try {
      const history = messagesByMode[modeAtSend].map(m => ({ role: m.role, text: m.text }));
      const selectedClass = classes.find(c => c.id === selectedClassId);
      // modeAtSend는 이 파일의 CopilotModeId(seatuk_writer 포함 10종)이지만, seatuk_writer 탭은
      // onSubmit에서 handleSeatukGenerate로 분기되어 이 함수(handleSend)에는 절대 들어오지 않는다.
      const engineMode = modeAtSend as CopilotEngineMode;
      const response = modeAtSend === 'lesson_plan'
        ? await chatWithCopilot(engineMode, history, userMessage, {
            className: selectedClass?.name,
            classId: selectedClassId || undefined,
            subject: selectedClass?.subject,
            weeklyPlan: selectedClass?.weekly_plan,
            observations: lessonPlanObservations,
            referenceMaterials: activeReferences,
            libraryIndex,
          })
        : modeAtSend === 'slide_deck_maker' || modeAtSend === 'material_maker'
        ? await chatWithCopilot(engineMode, history, userMessage, {
            className: selectedClass?.name,
            classId: selectedClassId || undefined,
            subject: selectedClass?.subject,
            weeklyPlan: selectedClass?.weekly_plan,
            referenceMaterials: activeReferences,
            libraryIndex,
          })
        : modeAtSend === 'quiz_maker' || modeAtSend === 'survey_maker'
        ? await chatWithCopilot(engineMode, history, userMessage, {
            className: selectedClass?.name,
            classId: selectedClassId || undefined,
            subject: selectedClass?.subject,
            referenceMaterials: activeReferences,
            libraryIndex,
          })
        : modeAtSend === 'idea_brainstorm'
        ? await chatWithCopilot(engineMode, history, userMessage, {
            className: selectedClass?.name,
            classId: selectedClassId || undefined,
            subject: selectedClass?.subject,
            referenceMaterials: [],
          })
        : modeAtSend === 'class_manager'
        ? await chatWithCopilot(engineMode, history, userMessage, {
            className: selectedClass?.name,
            classId: selectedClassId || undefined,
            existingClassNames: classes.map(c => c.name),
            weeklyPlan: selectedClass?.weekly_plan,
          })
        : modeAtSend === 'app_guide'
        ? await chatWithCopilot(engineMode, history, userMessage, {
            toolsGuideText: TOOLS_GUIDE_TEXT,
            plansGuideText: PLANS_GUIDE_TEXT,
            accountContext: guideAccountContext,
          })
        : await chatWithCopilot(engineMode, history, userMessage, {
            className: selectedClass?.name,
            classId: selectedClassId || undefined,
            observations: analystObservations,
            weeklyPlan: selectedClass?.weekly_plan,
          });
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

  // 세특 대량 생성은 AI 호출이 다수 발생하는 작업이라, 임계치 이상 선택 시 실행 전에
  // 한 번 더 확인받는다(사용량이 많은 상태에서 실수로 대량 재생성을 누르는 것을 방지).
  const SEATUK_COST_CONFIRM_THRESHOLD = 5;

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

    if (seatukSelectedIds.length >= SEATUK_COST_CONFIRM_THRESHOLD) {
      setSeatukPendingCount(seatukSelectedIds.length);
      setSeatukCostConfirmOpen(true);
      return;
    }

    await runSeatukGenerate();
  };

  const runSeatukGenerate = async () => {
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
      let doneCount = 0;

      // 학생별로 매번 시스템 프롬프트를 반복 전송하는 비용을 줄이기 위해 SEATUK_BATCH_SIZE명씩 묶어서 호출한다.
      // 배치 응답 파싱에 실패한 학생(모델이 형식을 지키지 않은 경우)은 개별 호출로 폴백해 결과 누락을 방지한다.
      const SEATUK_BATCH_SIZE = 3;
      for (let i = 0; i < withObs.length; i += SEATUK_BATCH_SIZE) {
        const batch = withObs.slice(i, i + SEATUK_BATCH_SIZE);

        let batchResults: Record<string, string> = {};
        try {
          batchResults = await generateSeatukDraftBatch(
            batch.map(s => ({ id: s.id, observations: obsByStudent[s.id] })),
            docType,
            teacherPrompt,
          );
        } catch (batchErr) {
          console.error('[AiCopilot] 세특 배치 생성 오류, 개별 생성으로 폴백:', batchErr);
        }

        for (const student of batch) {
          const content = batchResults[student.id] ?? await generateSeatukDraft(obsByStudent[student.id], docType, teacherPrompt);
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
          doneCount += 1;
          setSeatukProgress({ current: doneCount, total: withObs.length });
        }
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

  // 대화 도중 다른 화면으로 이동하기 직전 호출 — CopilotReturnBadge가 어느 에이전트로 돌아갈지 표시할 수 있게 남겨둔다.
  const markCopilotDeparture = () => {
    stashCopilotReturn({
      mode: activeMode,
      personaName: COPILOT_MODES[activeMode].personaName,
      personaAvatar: COPILOT_MODES[activeMode].personaAvatar,
      themeColor: COPILOT_MODES[activeMode].themeColor,
      ts: Date.now(),
    });
  };

  const handleSaveDraft = (target: 'material-editor' | 'slide-deck' | 'lesson-plan', draftContent: string) => {
    const title = extractDraftTitle(draftContent);
    const classId = selectedClassId || null;
    markCopilotDeparture();
    if (target === 'material-editor') {
      navigate('/teaching-tools', {
        state: { activeToolId: 'material-editor', draftMaterial: { noteId: '', title, content: draftContent, classId } },
      });
    } else if (target === 'slide-deck') {
      navigate('/teaching-tools', {
        state: { activeToolId: 'slide-deck', draftSlide: { noteId: '', title, content: draftContent, classId } },
      });
    } else {
      navigate('/teaching-tools', {
        state: { activeToolId: 'lesson-plan', draftLessonPlan: { title, content: draftContent, classId } },
      });
    }
  };

  // 탭 간 "이어가기" — 현재 탭의 확정 초안(제목/본문)을 대상 탭의 참고자료로 걸어두고 전환만 한다.
  // 자동으로 메시지를 보내지 않고, 사용자가 직접 다음 요청을 입력하게 한다.
  const handleContinueInTab = (targetMode: CopilotModeId, title: string, content: string) => {
    const sourceMode = activeMode;
    const sourceLabel = COPILOT_MODES[sourceMode].tabLabel.replace(/^\S+\s*/, '');
    setLoadedReferences(prev => [...prev, { id: crypto.randomUUID(), title: `[${sourceLabel}] ${title}`, content, source: 'handoff' }]);
    setHandoffOrigin({ fromMode: sourceMode, title });
    setActiveMode(targetMode);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // 수업 가이드 제작가(밀로) 탭 전용 — 기존 MaterialEditor.tsx의 표지 이미지 프롬프트 제안 기능(generateCoverPromptSuggestions)을
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
      // draftSummary(피코의 확정 요약)에는 실제 문항이 담기지 않으므로, 사용자가 채팅에 직접
      // 붙여넣은 원문(문제/보기/정답 등)을 재료로 써야 그대로 반영된다. 대화 중 자동으로 붙는
      // "참고 자료"(학급 자료 추천)는 원문이 없을 때의 보조 재료일 뿐 — 원문이 있으면 그것을
      // 최우선으로 쓰고, 참고 자료는 부족한 배경 설명 정도로만 덧붙인다.
      const rawUserContent = messagesByMode.quiz_maker
        .filter(m => m.role === 'user')
        .map(m => m.text)
        .join('\n\n');
      const referenceContent = loadedReferences.length > 0
        ? loadedReferences.map(r => `### ${r.title}\n${r.content}`).join('\n\n')
        : '';
      const contentSource = rawUserContent
        ? (referenceContent ? `[선생님이 직접 제시한 내용 — 최우선]\n${rawUserContent}\n\n[참고 자료 — 보조 자료]\n${referenceContent}` : rawUserContent)
        : (referenceContent || `(참고 자료 없음 — 아래 요청 내용을 바탕으로 출제)\n${draftSummary}`);

      const prompt = `다음 자료를 바탕으로 4지선다형 퀴즈 문제를 ${count}개 준비해주세요.
난이도: ${diffLabel}
수업 자료:
${contentSource}

중요: "선생님이 직접 제시한 내용"에 이미 완성된 문제·보기·정답이 포함돼 있다면, 내용을 바꾸거나 새로 만들지 말고 그 문제·보기·정답을 그대로 정확히 옮기세요(문항 수가 다르면 그 안에 있는 문항 수를 우선하세요). "참고 자료"는 절대 우선하지 마세요 — 직접 제시된 완성 문제가 없을 때 배경지식 보충용으로만 참고하세요. 완성된 문제가 전혀 없고 주제/설명만 있을 때만 자료 내용을 바탕으로 새로 출제하세요.

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
      // draftSummary(피코의 확정 요약)에는 실제 문항이 담기지 않으므로, 사용자가 채팅에 직접
      // 붙여넣은 원문(문항 목록 등)을 재료로 써야 그대로 반영된다. 대화 중 자동으로 붙는
      // "참고 자료"(학급 자료 추천)는 원문이 없을 때의 보조 재료일 뿐 — 원문이 있으면 그것을
      // 최우선으로 쓰고, 참고 자료는 부족한 배경 설명 정도로만 덧붙인다.
      const rawUserContent = messagesByMode.survey_maker
        .filter(m => m.role === 'user')
        .map(m => m.text)
        .join('\n\n');
      const referenceContent = loadedReferences.length > 0
        ? loadedReferences.map(r => `### ${r.title}\n${r.content}`).join('\n\n')
        : '';
      const contentSource = rawUserContent
        ? (referenceContent ? `[선생님이 직접 제시한 내용 — 최우선]\n${rawUserContent}\n\n[참고 자료 — 보조 자료]\n${referenceContent}` : rawUserContent)
        : (referenceContent || `(참고 자료 없음 — 아래 요청 내용을 바탕으로 출제)\n${draftSummary}`);

      const prompt = `다음 자료를 바탕으로 설문 문항을 ${count}개 준비해주세요.
아래 6가지 유형(multiple_choice/yes_no/star_rating/short_text/opinion_scale/ranking)을 설문 목적에 맞게 자연스럽게 섞어 구성하세요. 모든 유형을 억지로 다 쓸 필요는 없습니다.
설문 목적:
${contentSource}

중요: "선생님이 직접 제시한 내용"에 이미 완성된 문항(질문 문구, 선택지 등)이 포함돼 있다면, 내용을 바꾸거나 새로 만들지 말고 그대로 정확히 옮기세요(문항 수가 다르면 그 안에 있는 문항 수를 우선하세요). "참고 자료"는 절대 우선하지 마세요 — 직접 제시된 완성 문항이 없을 때 배경지식 보충용으로만 참고하세요. 완성된 문항이 전혀 없고 목적/설명만 있을 때만 자료 내용을 바탕으로 새로 구성하세요.

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

  // 학급 관리 비서 탭 전용 — Classroom.tsx의 handleCreateClass()와 동일한 필드/기본값/플랜 제한을 복제.
  // 대화로는 최소 필드(이름/유형/과목/기간)만 받고, 나머지 세부 설정은 완료 버블의 딥링크로 기존 화면에서 마무리한다.
  const handleCreateClassAction = async (payload: { name?: string; class_type?: string; subject?: string; start_date?: string; end_date?: string }) => {
    if (loading || !user?.id) return;
    if (isDemoTeacher(user)) {
      setMessagesByMode(prev => ({
        ...prev,
        class_manager: [...prev.class_manager, { id: crypto.randomUUID(), role: 'ai', text: '체험 계정에서는 새 학급을 만들 수 없어요. 무료로 가입하면 나만의 학급을 만들 수 있어요!' }],
      }));
      return;
    }
    const classType = payload.class_type === 'homeroom' ? 'homeroom' : 'subject';
    if (!payload.name || (classType === 'subject' && !payload.subject) || !payload.start_date || !payload.end_date) {
      setMessagesByMode(prev => ({
        ...prev,
        class_manager: [...prev.class_manager, { id: crypto.randomUUID(), role: 'ai', text: '학급을 만들기에 정보가 부족해요. 이름/유형/기간을 다시 확인해 주세요.' }],
      }));
      return;
    }

    setLoading(true);
    try {
      const classLimit = getClassLimit(profile);
      const { count } = await supabase
        .from('classes')
        .select('*', { count: 'exact', head: true })
        .eq('teacher_id', user.id);
      if ((count ?? 0) >= classLimit) {
        setUpgradeReason('class_limit');
        setUpgradeOpen(true);
        return;
      }

      const entryCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const { data: newClass, error } = await supabase
        .from('classes')
        .insert({
          teacher_id: user.id,
          name: payload.name,
          subject: classType === 'homeroom' ? '담임' : payload.subject,
          class_type: classType,
          student_guide_prompt: '수업 시간에 배운 내용과 본인의 활동 역할을 구체적으로 작성하세요. 단답형이나 단순 감상평은 지양해 주세요. 의미없이 반복되는 문장이나 맥락상 전혀 이해 할 수 없는 아무 의미없는 내용을 작성하는 것도 지양해 주세요. 글의 일부에라도 같은 글자·자음·모음이 의미 없이 반복되는 부분이 있다면, 앞부분에 정상적인 내용이 있더라도 반드시 반려 처리해 주세요.',
          teacher_report_prompt: '교육부 기재 요령을 준수하여 사실 기반의 객관적인 문체(~함, ~임)로 작성해줘. 학생의 개별적인 성취가 잘 드러나야 해.',
          min_obs_chars: 0,
          blocked_keywords: [],
          ai_review_enabled: true,
          weekly_plan: [],
          entry_code: entryCode,
          start_date: payload.start_date,
          end_date: payload.end_date,
          class_days_of_week: [],
          class_specific_dates: [],
          break_times: [],
          end_alarm_minutes: [],
        })
        .select()
        .single();
      if (error || !newClass) throw error || new Error('학급 생성 실패');

      setClasses(prev => [...prev, { id: newClass.id, name: newClass.name, subject: newClass.subject, class_type: newClass.class_type, weekly_plan: [] }]);
      setSelectedClassId(newClass.id);
      sessionStorage.setItem('notif_open_class_settings', newClass.id);

      setMessagesByMode(prev => ({
        ...prev,
        class_manager: [...prev.class_manager, {
          id: crypto.randomUUID(),
          role: 'ai',
          text: `✅ '${newClass.name}' 학급을 만들었어요. 요일/시간표 같은 세부 설정은 학급 설정 화면에서 마무리해 주세요.`,
          meta: { navigateTo: `/classroom?id=${newClass.id}`, state: { openClassSettingsId: newClass.id } },
        }],
      }));
    } catch (err: any) {
      console.error('[AiCopilot] 학급 생성 오류:', err);
      setMessagesByMode(prev => ({
        ...prev,
        class_manager: [...prev.class_manager, { id: crypto.randomUUID(), role: 'ai', text: '죄송합니다. 학급 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }],
      }));
    } finally {
      setLoading(false);
    }
  };

  // 학급 관리 비서 탭 전용 — Classroom.tsx의 handleBulkRegister()와 동일한 이름 파싱/스키마/플랜 제한을 복제.
  // 대상 학급은 탭 상단 공용 학급 선택 select의 selectedClassId를 그대로 사용한다.
  const handleAddStudentsAction = async (payload: { names?: string[] }) => {
    if (loading || !user?.id) return;
    if (!selectedClassId) {
      setMessagesByMode(prev => ({
        ...prev,
        class_manager: [...prev.class_manager, { id: crypto.randomUUID(), role: 'ai', text: '먼저 위에서 학급을 선택해 주세요.' }],
      }));
      return;
    }
    const names = (payload.names || []).map(n => n.trim()).filter(n => n.length > 0);
    if (names.length === 0) {
      setMessagesByMode(prev => ({
        ...prev,
        class_manager: [...prev.class_manager, { id: crypto.randomUUID(), role: 'ai', text: '추가할 학생 이름을 확인하지 못했어요. 다시 말씀해 주세요.' }],
      }));
      return;
    }

    setLoading(true);
    try {
      const studentLimit = getStudentLimit(profile);
      const { count } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('class_id', selectedClassId);
      const currentCount = count ?? 0;
      if (currentCount + names.length > studentLimit) {
        const remaining = Math.max(0, studentLimit - currentCount);
        setMessagesByMode(prev => ({
          ...prev,
          class_manager: [...prev.class_manager, { id: crypto.randomUUID(), role: 'ai', text: `현재 플랜에서는 한 학급에 최대 ${studentLimit}명까지 등록할 수 있어요.\n현재 ${currentCount}명 등록 중이라 ${remaining}명만 추가할 수 있어요. 플랜을 업그레이드하면 더 많은 학생을 추가할 수 있어요.` }],
        }));
        return;
      }

      const newStudents = names.map(rawText => {
        let name = rawText;
        let number: string | null = null;
        const match = rawText.match(/(\d+)번?/);
        if (match) {
          number = match[1];
          name = rawText.replace(match[0], '').trim();
          name = name.replace(/^[\s.\-]+|[\s.\-]+$/g, '');
        }
        return { class_id: selectedClassId, full_name: name, student_number: number, tag: '학생' };
      });

      const { error } = await supabase.from('students').insert(newStudents);
      if (error) throw error;

      setMessagesByMode(prev => ({
        ...prev,
        class_manager: [...prev.class_manager, {
          id: crypto.randomUUID(),
          role: 'ai',
          text: `✅ 학생 ${newStudents.length}명을 추가했어요.`,
          meta: { navigateTo: `/classroom?id=${selectedClassId}` },
        }],
      }));
    } catch (err: any) {
      console.error('[AiCopilot] 학생 추가 오류:', err);
      setMessagesByMode(prev => ({
        ...prev,
        class_manager: [...prev.class_manager, { id: crypto.randomUUID(), role: 'ai', text: '죄송합니다. 학생 추가 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }],
      }));
    } finally {
      setLoading(false);
    }
  };

  // 학급 관리 비서 탭 전용 — GroupTab.tsx의 조 생성/autoAssign() 로직을 복제. 조에는 플랜 제한이 없다.
  const handleCreateGroupsAction = async (payload: { groups?: string[]; auto_assign?: boolean }) => {
    if (loading || !user?.id) return;
    if (!selectedClassId) {
      setMessagesByMode(prev => ({
        ...prev,
        class_manager: [...prev.class_manager, { id: crypto.randomUUID(), role: 'ai', text: '먼저 위에서 학급을 선택해 주세요.' }],
      }));
      return;
    }
    const groupNames = (payload.groups || []).map(n => n.trim()).filter(n => n.length > 0);
    if (groupNames.length === 0) {
      setMessagesByMode(prev => ({
        ...prev,
        class_manager: [...prev.class_manager, { id: crypto.randomUUID(), role: 'ai', text: '만들 조 이름을 확인하지 못했어요. 다시 말씀해 주세요.' }],
      }));
      return;
    }

    setLoading(true);
    try {
      const GROUP_COLORS = ['#6366F1', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#EF4444', '#8B5CF6', '#06B6D4'];
      const { count: existingCount } = await supabase
        .from('class_groups')
        .select('*', { count: 'exact', head: true })
        .eq('class_id', selectedClassId);
      const baseOrder = existingCount ?? 0;

      const { data: newGroups, error } = await supabase
        .from('class_groups')
        .insert(groupNames.map((name, idx) => ({
          class_id: selectedClassId,
          name,
          color: GROUP_COLORS[(baseOrder + idx) % GROUP_COLORS.length],
          sort_order: baseOrder + idx,
        })))
        .select();
      if (error || !newGroups) throw error || new Error('조 생성 실패');

      let assignedCount = 0;
      if (payload.auto_assign) {
        const { data: allGroups } = await supabase
          .from('class_groups')
          .select('id')
          .eq('class_id', selectedClassId);
        const { data: studentRows } = await supabase
          .from('students')
          .select('id')
          .eq('class_id', selectedClassId);
        const groupIds = (allGroups || []).map(g => g.id);
        if (groupIds.length > 0 && studentRows && studentRows.length > 0) {
          await supabase.from('class_group_members').delete().in('group_id', groupIds);
          const shuffled = [...studentRows].sort(() => Math.random() - 0.5);
          const inserts = shuffled.map((s, idx) => ({ group_id: groupIds[idx % groupIds.length], student_id: s.id }));
          await supabase.from('class_group_members').insert(inserts);
          assignedCount = inserts.length;
        }
      }

      setMessagesByMode(prev => ({
        ...prev,
        class_manager: [...prev.class_manager, {
          id: crypto.randomUUID(),
          role: 'ai',
          text: payload.auto_assign
            ? `✅ 조 ${newGroups.length}개를 만들고 학생 ${assignedCount}명을 자동으로 배치했어요.`
            : `✅ 조 ${newGroups.length}개를 만들었어요.`,
          meta: { navigateTo: `/classroom?id=${selectedClassId}` },
        }],
      }));
    } catch (err: any) {
      console.error('[AiCopilot] 조 생성 오류:', err);
      setMessagesByMode(prev => ({
        ...prev,
        class_manager: [...prev.class_manager, { id: crypto.randomUUID(), role: 'ai', text: '죄송합니다. 조 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }],
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
      <div className={isFullscreen
        ? 'fixed inset-0 z-[9999] flex flex-col bg-white h-[100dvh] w-full overflow-hidden'
        : 'flex flex-col rounded-[1.75rem] sm:rounded-[2rem] border border-surface-container bg-white shadow-ambient overflow-hidden h-[74vh] sm:h-[72vh]'
      }>
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-surface-container flex items-center justify-between gap-2 sm:gap-4 bg-surface/50 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="relative shrink-0">
              <img
                src={modeConfig.personaAvatar}
                onError={handleAvatarError}
                alt={modeConfig.personaName}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl object-cover border-2 border-white shadow-md shadow-primary/10"
              />
              <span
                className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full border-2 border-white"
                style={{ backgroundColor: modeConfig.themeColor }}
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <p className="text-xs sm:text-sm font-black text-on-surface truncate">{modeConfig.personaName} · {modeConfig.tabLabel}</p>
                <span className="hidden sm:inline-block px-2 py-0.5 text-[9px] font-black rounded-full text-white shrink-0" style={{ backgroundColor: modeConfig.themeColor }}>
                  {modeConfig.personaRole}
                </span>
              </div>
              <p className="text-[9px] sm:text-[10px] font-bold text-on-surface-variant uppercase tracking-wider truncate">{modeConfig.chatHeaderSubtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {classes.length > 0 && (
              <select
                value={selectedClassId}
                onChange={e => setSelectedClassId(e.target.value)}
                className="text-[11px] sm:text-xs font-bold bg-surface-container-low border border-surface-container rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2 text-on-surface focus:outline-none max-w-[95px] sm:max-w-[160px] truncate"
              >
                <option value="">(전체 학급)</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={handleStartNewConversation}
              className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container-low hover:text-primary transition-colors shrink-0"
              aria-label="새 대화 시작"
              title="새 대화 시작"
            >
              <MessageSquarePlus size={16} />
            </button>
            <button
              type="button"
              onClick={openHistoryModal}
              className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container-low hover:text-primary transition-colors shrink-0"
              aria-label="대화 기록"
              title="대화 기록"
            >
              <History size={16} />
            </button>
            <button
              type="button"
              onClick={() => setIsFullscreen(v => !v)}
              className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container-low hover:text-primary transition-colors shrink-0"
              aria-label={isFullscreen ? '전체화면 닫기' : '전체화면으로 보기'}
              title={isFullscreen ? '전체화면 닫기' : '전체화면으로 보기'}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
        </div>

        {handoffOrigin && (
          <div className="px-4 sm:px-5 py-2 border-b border-primary/15 bg-primary/5 shrink-0 flex items-center gap-2">
            <img
              src={COPILOT_MODES[handoffOrigin.fromMode].personaAvatar}
              onError={handleAvatarError}
              alt={COPILOT_MODES[handoffOrigin.fromMode].personaName}
              className="w-5 h-5 rounded-full object-cover shrink-0 border border-white shadow-sm"
            />
            <p className="flex-1 min-w-0 text-[11px] font-bold text-primary truncate">
              🔗 {COPILOT_MODES[handoffOrigin.fromMode].personaName}에서 이어진 대화 · '{handoffOrigin.title}' 참고 중
            </p>
            <button
              type="button"
              onClick={() => setHandoffOrigin(null)}
              className="p-1 rounded-full text-primary/60 hover:bg-primary/10 hover:text-primary transition-colors shrink-0"
              aria-label="이어받기 표시 닫기"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {modeConfig.showStudentPicker && (
          <div className="px-4 sm:px-5 py-2.5 sm:py-3 border-b border-surface-container bg-surface/40 shrink-0 space-y-2">
            {!selectedClassId ? (
              <p className="text-[11px] font-bold text-primary/70">먼저 클래스를 선택해 주세요</p>
            ) : seatukStudents.length === 0 ? (
              <p className="text-[11px] font-bold text-on-surface-variant">이 클래스에 등록된 학생이 없어요</p>
            ) : (
              <>
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setSeatukSelectedIds(seatukStudents.map(s => s.id))}
                    className="px-2.5 py-1 sm:px-3 sm:py-1.5 bg-white border border-surface-container rounded-lg text-[10px] sm:text-[11px] font-black text-on-surface-variant hover:border-primary/40 hover:text-primary transition-colors"
                  >
                    전체선택
                  </button>
                  <button
                    type="button"
                    onClick={() => setSeatukSelectedIds(seatukStudents.filter(s => s.hasObservation).map(s => s.id))}
                    className="px-2.5 py-1 sm:px-3 sm:py-1.5 bg-white border border-surface-container rounded-lg text-[10px] sm:text-[11px] font-black text-on-surface-variant hover:border-primary/40 hover:text-primary transition-colors"
                  >
                    기록있는 학생만
                  </button>
                  <button
                    type="button"
                    onClick={() => setSeatukSelectedIds(seatukStudents.filter(s => s.hasObservation && !s.alreadyDraft).map(s => s.id))}
                    className="px-2.5 py-1 sm:px-3 sm:py-1.5 bg-white border border-surface-container rounded-lg text-[10px] sm:text-[11px] font-black text-on-surface-variant hover:border-primary/40 hover:text-primary transition-colors"
                  >
                    미작성만
                  </button>
                  <span className="ml-auto text-[10px] sm:text-[11px] font-bold text-on-surface-variant">{seatukSelectedIds.length}명 선택됨</span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-20 sm:max-h-24 overflow-y-auto custom-scrollbar">
                  {seatukStudents.map(s => {
                    const checked = seatukSelectedIds.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleSeatukStudent(s.id)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl text-[10px] sm:text-[11px] font-black border transition-colors ${
                          checked ? 'bg-primary text-white border-primary' : 'bg-white text-on-surface-variant border-surface-container hover:border-primary/40'
                        } ${!s.hasObservation ? 'opacity-40' : ''}`}
                      >
                        {checked && <Check size={11} />}
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

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar space-y-4 sm:space-y-6 bg-surface/30">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center space-y-3.5 sm:space-y-4 text-center py-4">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="relative"
              >
                <img
                  src={modeConfig.personaAvatar}
                  onError={handleAvatarError}
                  alt={modeConfig.personaName}
                  className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-3xl object-cover shadow-2xl border-4 border-white mx-auto ring-4 ring-primary/10"
                />
                <span
                  className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] sm:text-[11px] font-black text-white shadow-md whitespace-nowrap"
                  style={{ backgroundColor: modeConfig.themeColor }}
                >
                  {modeConfig.personaName} · {modeConfig.personaRole}
                </span>
              </motion.div>
              <div className="space-y-1 pt-1">
                <p className="text-base sm:text-lg font-black text-on-surface">{modeConfig.emptyTitle}</p>
                <p className="text-xs font-bold text-on-surface-variant max-w-sm leading-relaxed mx-auto px-2">
                  {modeConfig.emptyBody}
                </p>
              </div>

              {/* Zero-Class State Onboarding Banner for class-dependent tabs */}
              {classes.length === 0 && (activeMode === 'observation_analyst' || activeMode === 'seatuk_writer') && (
                <div className="max-w-md w-full mx-auto p-3.5 sm:p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-left flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-500 text-white shrink-0 flex items-center justify-center font-black text-sm">
                    🏫
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <p className="text-xs font-black text-amber-900">등록된 학급이 아직 없으신가요?</p>
                    <p className="text-[11px] font-bold text-amber-800/80 leading-relaxed">
                      관찰기록 분석이나 세특 작성은 학급과 학생이 등록되어 있어야 해요. <strong>학급 관리 비서 레오</strong>에게 말 한마디로 30초 만에 학급을 만들어 보세요!
                    </p>
                    <button
                      type="button"
                      onClick={() => { setHandoffOrigin(null); setActiveMode('class_manager'); }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white rounded-xl text-[11px] font-black hover:bg-amber-700 transition-colors shadow-sm mt-1"
                    >
                      <ArrowRight size={12} />
                      레오에게 학급 만들러 가기
                    </button>
                  </div>
                </div>
              )}

              {/* Zero-Class Hint for general creation tabs */}
              {classes.length === 0 && (activeMode === 'lesson_plan' || activeMode === 'material_maker' || activeMode === 'slide_deck_maker' || activeMode === 'quiz_maker' || activeMode === 'survey_maker') && (
                <div className="px-3.5 py-1.5 rounded-xl bg-primary/5 border border-primary/10 text-[11px] font-bold text-primary max-w-md mx-auto">
                  💡 학급을 선택하지 않아도 자유롭게 질문하고 계획안·자료를 만드실 수 있어요!
                </div>
              )}

              {/* Seatuk Writer Nudge: guide away from per-student chat toward the bulk single-shot generator */}
              {activeMode === 'observation_analyst' && classes.length > 0 && (
                <div className="max-w-md w-full mx-auto p-3.5 rounded-2xl bg-violet-500/10 border border-violet-500/20 text-left flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-violet-600 text-white shrink-0 flex items-center justify-center font-black text-sm">
                    ✍️
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <p className="text-xs font-black text-violet-900">세특 초안이 필요하신가요?</p>
                    <p className="text-[11px] font-bold text-violet-800/80 leading-relaxed">
                      올리버는 관찰기록을 함께 들여다보는 대화용이에요. 여러 학생 세특을 한 번에 만들려면 <strong>클레어(세특 작성)</strong> 탭이 더 빠르고 저렴해요.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveMode('seatuk_writer')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded-xl text-[11px] font-black hover:bg-violet-700 transition-colors shadow-sm mt-1"
                    >
                      <ArrowRight size={12} />
                      클레어에게 세특 작성하러 가기
                    </button>
                  </div>
                </div>
              )}

              {/* Recommended Prompts (QuickStarts) */}
              {modeConfig.quickStarts && (
                <div className="space-y-2 pt-1 max-w-lg w-full">
                  <p className="text-[10px] sm:text-[11px] font-black text-on-surface-variant/70 uppercase tracking-wider">
                    💡 추천 질문을 눌러 바로 시작해 보세요
                  </p>
                  <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
                    {modeConfig.quickStarts.map(q => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setInput(q)}
                        className="px-3 py-1.5 sm:px-3.5 sm:py-2 bg-white border border-surface-container rounded-2xl text-[11px] sm:text-xs font-bold text-on-surface hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all shadow-sm active:scale-95 text-left"
                      >
                        💬 {q}
                      </button>
                    ))}
                  </div>
                </div>
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
              const isClassCreateDraft = m.role === 'ai' && modeConfig.showClassManagerAction && m.text.includes(CLASS_CREATE_MARKER);
              const isStudentAddDraft = m.role === 'ai' && modeConfig.showClassManagerAction && m.text.includes(STUDENT_ADD_MARKER);
              const isGroupCreateDraft = m.role === 'ai' && modeConfig.showClassManagerAction && m.text.includes(GROUP_CREATE_MARKER);
              const classCreatePayload = isClassCreateDraft ? parseActionPayload<{ name?: string; class_type?: string; subject?: string; start_date?: string; end_date?: string }>(m.text, CLASS_CREATE_MARKER) : null;
              const studentAddPayload = isStudentAddDraft ? parseActionPayload<{ names?: string[] }>(m.text, STUDENT_ADD_MARKER) : null;
              const groupCreatePayload = isGroupCreateDraft ? parseActionPayload<{ groups?: string[]; auto_assign?: boolean }>(m.text, GROUP_CREATE_MARKER) : null;
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
                : classCreatePayload
                ? classCreatePayload.displayText
                : studentAddPayload
                ? studentAddPayload.displayText
                : groupCreatePayload
                ? groupCreatePayload.displayText
                : m.text;
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-2.5 sm:gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-2xl shrink-0 overflow-hidden border-2 flex items-center justify-center ${m.role === 'user' ? 'bg-surface-container-high border-white text-on-surface' : 'border-white shadow-md'}`}>
                    {m.role === 'user' ? (
                      <User size={16} />
                    ) : (
                      <img
                        src={modeConfig.personaAvatar}
                        onError={handleAvatarError}
                        alt={modeConfig.personaName}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className={`max-w-[90%] sm:max-w-[85%] p-4 sm:p-5 rounded-[1.5rem] sm:rounded-[1.75rem] text-xs sm:text-sm font-bold leading-relaxed shadow-sm ${m.role === 'user' ? 'bg-white rounded-tr-none text-on-surface' : 'bg-white border border-surface-container rounded-tl-none'}`}>
                    <div className="prose prose-sm prose-stone max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={chatMdComponents}>{normalizeMarkdown(displayText)}</ReactMarkdown>
                    </div>
                    {isDraft && (
                      <div className="mt-4 pt-3 border-t border-surface-container flex flex-wrap gap-2">
                        {activeMode === 'lesson_plan' ? (
                          <button
                            onClick={() => handleSaveDraft('lesson-plan', stripDraftPreamble(displayText))}
                            className="flex items-center gap-1.5 px-3.5 py-2 bg-primary text-white rounded-xl text-xs font-black hover:bg-primary-dim transition-all active:scale-95"
                          >
                            <FileText size={14} />
                            계획서로 만들기
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => handleSaveDraft('material-editor', stripDraftPreamble(displayText))}
                              className="flex items-center gap-1.5 px-3.5 py-2 bg-primary text-white rounded-xl text-xs font-black hover:bg-primary-dim transition-all active:scale-95"
                            >
                              <FolderPlus size={14} />
                              자료함에 저장
                            </button>
                            <button
                              onClick={() => handleSaveDraft('slide-deck', stripDraftPreamble(displayText))}
                              className="flex items-center gap-1.5 px-3.5 py-2 bg-surface-container-high text-on-surface rounded-xl text-xs font-black hover:bg-surface-container transition-all active:scale-95"
                            >
                              <Presentation size={14} />
                              슬라이드로 만들기
                            </button>
                          </>
                        )}
                        {modeConfig.showCoverPromptAction && (
                          <button
                            onClick={() => handleGenerateCoverPrompts(extractDraftTitle(displayText))}
                            disabled={loading}
                            className="flex items-center gap-1.5 px-3.5 py-2 bg-surface-container-high text-on-surface rounded-xl text-xs font-black hover:bg-surface-container transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ImageIcon size={14} />
                            표지 아이디어
                          </button>
                        )}
                      </div>
                    )}
                    {isSlideDraft && (() => {
                      const { flatTemplates, groups } = getSlideTemplateGroups();
                      return (
                        <div className="mt-4 pt-3 border-t border-surface-container">
                          <p className="text-[11px] font-bold text-on-surface-variant mb-2.5">디자인을 골라주세요</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {flatTemplates.map(t => (
                              <button
                                key={t.id}
                                type="button"
                                disabled={loading}
                                onClick={() => handleGenerateSlideDeck(t.id, stripDraftPreamble(displayText), extractDraftTitle(displayText))}
                                className="flex items-center gap-2 px-3 py-2 bg-surface-container-high text-on-surface rounded-xl text-xs font-black hover:bg-surface-container transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-left"
                              >
                                <span className="w-4 h-4 rounded-full shrink-0 border border-surface-container" style={{ background: t.swatch }} />
                                <span className="truncate">{t.name}</span>
                              </button>
                            ))}
                          </div>
                          {groups.length > 0 && (
                            <div className="mt-2 space-y-2">
                              {groups.map(g => {
                                const idx = slideThemeIdxByGroup[g.key] ?? 0;
                                const current = g.variants[idx];
                                const layoutName = current.name.split(' · ')[0];
                                return (
                                  <div key={g.key} className="flex items-center gap-2 px-3 py-2 bg-surface-container-high rounded-2xl">
                                    <button
                                      type="button"
                                      disabled={loading}
                                      onClick={() => handleGenerateSlideDeck(current.id, stripDraftPreamble(displayText), extractDraftTitle(displayText))}
                                      className="flex-1 min-w-0 text-left text-xs font-black text-on-surface truncate disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      {layoutName}
                                    </button>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {g.variants.map((v, i) => (
                                        <button
                                          key={v.id}
                                          type="button"
                                          title={v.themeName}
                                          aria-label={v.themeName}
                                          onClick={() => setSlideThemeIdxByGroup(s => ({ ...s, [g.key]: i }))}
                                          style={{
                                            width: 16, height: 16, borderRadius: '50%', background: v.swatch,
                                            border: i === idx ? '2px solid #111827' : '2px solid #fff',
                                            boxShadow: '0 0 0 1px #e5e7eb', cursor: 'pointer', padding: 0,
                                          }}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    {isQuizDraft && (
                      <div className="mt-4 pt-3 border-t border-surface-container">
                        <button
                          onClick={() => handleGenerateQuiz(extractDraftTitle(displayText), displayText)}
                          disabled={loading}
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-primary text-white rounded-xl text-xs font-black hover:bg-primary-dim transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ListChecks size={14} />
                          퀴즈 만들기
                        </button>
                      </div>
                    )}
                    {isSurveyDraft && (
                      <div className="mt-4 pt-3 border-t border-surface-container">
                        <button
                          onClick={() => handleGenerateSurvey(extractDraftTitle(displayText), displayText)}
                          disabled={loading}
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-primary text-white rounded-xl text-xs font-black hover:bg-primary-dim transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ListChecks size={14} />
                          설문 만들기
                        </button>
                      </div>
                    )}
                    {isIdeaDraft && (
                      <div className="mt-4 pt-3 border-t border-surface-container">
                        <button
                          onClick={() => handleGenerateIdeaHandoff(extractDraftTitle(displayText), stripDraftPreamble(displayText))}
                          disabled={loading}
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-primary text-white rounded-xl text-xs font-black hover:bg-primary-dim transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Lightbulb size={14} />
                          아이디어 기록하기
                        </button>
                      </div>
                    )}
                    {isClassCreateDraft && classCreatePayload?.payload && (
                      <div className="mt-4 pt-3 border-t border-surface-container">
                        <button
                          onClick={() => handleCreateClassAction(classCreatePayload.payload!)}
                          disabled={loading}
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-primary text-white rounded-xl text-xs font-black hover:bg-primary-dim transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <FolderPlus size={14} />
                          이대로 학급 만들기
                        </button>
                      </div>
                    )}
                    {isStudentAddDraft && studentAddPayload?.payload && (
                      <div className="mt-4 pt-3 border-t border-surface-container">
                        <button
                          onClick={() => handleAddStudentsAction(studentAddPayload.payload!)}
                          disabled={loading}
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-primary text-white rounded-xl text-xs font-black hover:bg-primary-dim transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <User size={14} />
                          이대로 학생 추가하기
                        </button>
                      </div>
                    )}
                    {isGroupCreateDraft && groupCreatePayload?.payload && (
                      <div className="mt-4 pt-3 border-t border-surface-container">
                        <button
                          onClick={() => handleCreateGroupsAction(groupCreatePayload.payload!)}
                          disabled={loading}
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-primary text-white rounded-xl text-xs font-black hover:bg-primary-dim transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Users size={14} />
                          이대로 조 만들기
                        </button>
                      </div>
                    )}
                    {(() => {
                      const targets = HANDOFF_TARGETS[activeMode];
                      const isFinalDraft = isDraft || isSlideDraft || isQuizDraft || isSurveyDraft || isIdeaDraft;
                      if (!isFinalDraft || !targets || targets.length === 0) return null;
                      const handoffTitle = extractDraftTitle(displayText);
                      const handoffContent = stripDraftPreamble(displayText);
                      return (
                        <div className="mt-4 pt-3 border-t border-surface-container flex flex-wrap gap-1.5 sm:gap-2 items-center">
                          <span className="w-full text-[10px] sm:text-[11px] font-bold text-on-surface-variant">이 내용으로 이어서 만들기</span>
                          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto custom-scrollbar pb-1 w-full">
                            {targets.map(t => (
                              <button
                                key={t}
                                type="button"
                                onClick={() => handleContinueInTab(t, handoffTitle, handoffContent)}
                                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 bg-surface-container-high text-on-surface rounded-xl text-[11px] sm:text-xs font-black hover:bg-surface-container transition-all active:scale-95"
                              >
                                <ArrowRight size={13} />
                                {COPILOT_MODES[t].tabLabel}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                    {m.meta?.navigateTo && (
                      <div className="mt-4 pt-3 border-t border-surface-container">
                        <button
                          onClick={() => { markCopilotDeparture(); navigate(m.meta!.navigateTo, m.meta!.state ? { state: m.meta!.state } : undefined); }}
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-primary text-white rounded-xl text-xs font-black hover:bg-primary-dim transition-all active:scale-95"
                        >
                          <ArrowRight size={14} />
                          {activeMode === 'slide_deck_maker' ? '슬라이드 보러 가기' : activeMode === 'quiz_maker' ? '퀴즈 보러 가기' : activeMode === 'survey_maker' ? '설문 보러 가기' : activeMode === 'observation_analyst' ? '분석 결과 보러 가기' : activeMode === 'idea_brainstorm' ? '아이디어 보러 가기' : activeMode === 'class_manager' ? (m.meta?.state?.openClassSettingsId ? '학급 설정 마무리하기' : '학급으로 가기') : 'AI 초안 페이지로 이동'}
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {loading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2.5 sm:gap-3">
              <div className="relative w-8 h-8 sm:w-10 sm:h-10 rounded-2xl shrink-0 overflow-hidden border-2 border-white shadow-md">
                <img
                  src={modeConfig.personaAvatar}
                  onError={handleAvatarError}
                  alt={modeConfig.personaName}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <Loader2 size={14} className="animate-spin text-white" />
                </div>
              </div>
              <div className="p-4 sm:p-5 rounded-[1.5rem] sm:rounded-[1.75rem] rounded-tl-none bg-white shadow-sm border border-surface-container flex items-center gap-3">
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

        {modeConfig.showReferenceSearch && (loadedReferences.length > 0 || referenceSuggestions.length > 0 || modeConfig.showMaterialImport) && (
        <div className="px-4 sm:px-5 py-2.5 border-t border-surface-container-high bg-neutral-50 shrink-0 space-y-1.5">
          {(loadedReferences.length > 0 || referenceSuggestions.length > 0) && (
            <p className="text-[10px] font-bold text-on-surface-variant/70">
              아래 자료들은 답변 생성 시 참고됩니다
            </p>
          )}
          <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-0.5">
            {modeConfig.showMaterialImport && (
              <button
                type="button"
                onClick={() => setShowMaterialImportModal(true)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white border border-dashed border-primary/40 rounded-xl text-[11px] font-black text-primary hover:bg-primary/5 transition-colors"
              >
                <BookOpen size={12} />
                학급 자료 불러오기
              </button>
            )}
            {loadedReferences.map(r => (
              <span
                key={r.id}
                title={
                  r.source === 'auto'
                    ? 'AI가 대화 내용과 관련성이 높다고 판단해 자동으로 참고한 자료입니다. 필요 없으면 ×로 제외하세요.'
                    : r.source === 'handoff'
                    ? '다른 에이전트 탭에서 "이어서 만들기"로 넘어온 초안입니다.'
                    : '직접 불러온 참고자료입니다.'
                }
                className={`shrink-0 flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 rounded-xl text-[11px] font-black ${
                  r.source === 'auto'
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : r.source === 'handoff'
                    ? 'bg-violet-50 text-violet-700 border border-violet-200'
                    : 'bg-primary/10 text-primary'
                }`}
              >
                {r.source === 'auto' ? <Sparkles size={12} /> : r.source === 'handoff' ? <Link2 size={12} /> : <Paperclip size={12} />}
                <span className="max-w-[120px] truncate">{r.title}</span>
                {r.source === 'auto' && <span className="shrink-0 text-[9px] font-black text-amber-600/80">AI 추천 참고</span>}
                {r.source === 'handoff' && <span className="shrink-0 text-[9px] font-black text-violet-600/80">이어받음</span>}
                <button
                  type="button"
                  onClick={() => setLoadedReferences(prev => prev.filter(x => x.id !== r.id))}
                  className={`p-0.5 rounded-full transition-colors ${
                    r.source === 'auto' ? 'hover:bg-amber-200/60' : r.source === 'handoff' ? 'hover:bg-violet-200/60' : 'hover:bg-primary/20'
                  }`}
                  aria-label="참고자료 해제"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
            {referenceSuggestions.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => handleLoadReference(r)}
                disabled={loadingReferenceId === r.id}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white border border-surface-container rounded-xl text-[11px] font-black text-on-surface-variant hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50"
              >
                {loadingReferenceId === r.id ? <Loader2 size={11} className="animate-spin" /> : <Paperclip size={11} />}
                <span className="text-primary/70">[{SOURCE_TYPE_LABEL[r.source_type]}]</span> <span className="max-w-[100px] truncate">{r.title}</span>
              </button>
            ))}
          </div>
        </div>
        )}

        {modeConfig.showTranscriptTrigger && pendingTranscripts.length > 0 && (
        <div className="px-4 sm:px-5 py-2.5 border-t border-surface-container-high bg-neutral-50 shrink-0 space-y-1.5">
          <p className="text-[10px] sm:text-[11px] font-black text-on-surface-variant/60">분석 대기 중인 전사록</p>
          <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-0.5">
            {pendingTranscripts.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleAnalyzeTranscript(t)}
                disabled={loading}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white border border-surface-container rounded-xl text-[11px] font-black text-on-surface-variant hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50"
              >
                {analyzingTranscriptId === t.id ? <Loader2 size={11} className="animate-spin" /> : <Paperclip size={11} />}
                {formatTranscriptChipLabel(t.recorded_at, t.duration_seconds)} 분석하기
              </button>
            ))}
          </div>
        </div>
        )}

        <div className={`p-3.5 sm:p-5 shrink-0 bg-neutral-50 ${modeConfig.showReferenceSearch && (loadedReferences.length > 0 || referenceSuggestions.length > 0) ? 'pt-2' : 'border-t border-surface-container-high'}`}>
          <form
            ref={formRef}
            onSubmit={activeMode === 'seatuk_writer' ? handleSeatukGenerate : handleSend}
            className="flex items-end gap-2 sm:gap-3 bg-white rounded-[1.5rem] sm:rounded-[1.75rem] border-2 border-transparent focus-within:border-primary/20 shadow-md pl-4 sm:pl-5 pr-1.5 sm:pr-2 py-1.5 sm:py-2"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onCompositionStart={() => { isComposingRef.current = true; }}
              onCompositionEnd={() => { isComposingRef.current = false; }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  if (isComposingRef.current || e.nativeEvent.isComposing) return;
                  e.preventDefault();
                  formRef.current?.requestSubmit();
                }
              }}
              placeholder={modeConfig.inputPlaceholder}
              rows={1}
              className="flex-1 py-2.5 sm:py-3 bg-transparent text-xs sm:text-sm font-black focus:outline-none placeholder:text-neutral-400 resize-none max-h-[160px] sm:max-h-[200px] overflow-y-auto custom-scrollbar leading-relaxed"
            />
            <button
              type="submit"
              disabled={activeMode === 'seatuk_writer' ? (seatukSelectedIds.length === 0 || loading) : (!input.trim() || loading)}
              className="p-2.5 sm:p-3.5 bg-primary text-white rounded-xl sm:rounded-2xl shadow hover:shadow-primary/40 transition-all disabled:opacity-20 disabled:pointer-events-none active:scale-90 shrink-0"
            >
              <Send size={16} className="sm:w-[18px] sm:h-[18px]" />
            </button>
          </form>
        </div>
      </div>
    );

  const displayedModeIds = selectedCategory === 'all'
    ? COPILOT_MODE_IDS
    : (AGENT_CATEGORIES.find(c => c.key === selectedCategory)?.modeIds || COPILOT_MODE_IDS);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* 2026 Modern Bento Hero Profile Card */}
      <div className="relative overflow-hidden rounded-[2rem] border border-surface-container bg-gradient-to-br from-white via-surface/40 to-surface-container-low p-6 md:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5 relative z-10">
          <div className="flex items-center gap-4 md:gap-6 flex-1 min-w-0">
            <motion.div
              key={activeMode}
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              className="relative shrink-0"
            >
              <img
                src={modeConfig.personaAvatar}
                onError={handleAvatarError}
                alt={modeConfig.personaName}
                className="w-16 h-16 md:w-24 md:h-24 rounded-3xl object-cover shadow-xl border-4 border-white ring-4 ring-primary/10"
              />
              <span
                className="absolute -bottom-2 -right-2 px-2.5 py-0.5 rounded-full text-[10px] font-black text-white shadow-md border-2 border-white"
                style={{ backgroundColor: modeConfig.themeColor }}
              >
                {modeConfig.personaEnglishName}
              </span>
            </motion.div>

            <div className="space-y-1.5 flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-primary font-black text-xs uppercase tracking-widest">
                  AI 전문 에이전트 10인 라인업
                </span>
                <span
                  className="px-2.5 py-0.5 rounded-full text-[10px] font-black text-white shadow-sm"
                  style={{ backgroundColor: modeConfig.themeColor }}
                >
                  {modeConfig.personaRole}
                </span>
              </div>
              <h1 className="text-xl md:text-3xl font-extrabold text-on-surface font-manrope flex flex-wrap items-center gap-2">
                <span>{modeConfig.personaName}</span>
                <span className="text-sm font-bold text-on-surface-variant/70">· {modeConfig.heroTitle}</span>
              </h1>
              <p className="text-on-surface-variant text-xs md:text-sm max-w-2xl leading-relaxed font-bold">
                {modeConfig.heroSubtitle}
              </p>
            </div>
          </div>

          {/* Guide Modal Trigger Button */}
          <button
            type="button"
            onClick={() => setGuideModalOpen(true)}
            className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-white border-2 border-primary/30 text-primary hover:bg-primary hover:text-white rounded-2xl text-xs font-black transition-all shadow-sm active:scale-95"
          >
            <Lightbulb size={16} />
            <span>어떤 에이전트를 써야 할까요?</span>
          </button>
        </div>

        {/* Subtle decorative background glow */}
        <div
          className="absolute -top-12 -right-12 w-64 h-64 rounded-full blur-3xl opacity-20 pointer-events-none"
          style={{ backgroundColor: modeConfig.themeColor }}
        />
      </div>

      {/* Category Filter & Agent Tab Bar */}
      <div className="space-y-3 px-1">
        {/* Category Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1">
          {AGENT_CATEGORIES.map(cat => {
            const isCatActive = selectedCategory === cat.key;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => setSelectedCategory(cat.key)}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                  isCatActive
                    ? 'bg-neutral-900 text-white shadow-sm'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Agent Selector Tab Bar */}
        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar py-1">
          {displayedModeIds.map(id => {
            const mode = COPILOT_MODES[id];
            const isActive = activeMode === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => { setHandoffOrigin(null); setActiveMode(id); }}
                className={`shrink-0 flex items-center gap-2 pl-2 pr-3.5 py-2 rounded-2xl text-[11px] md:text-xs font-black transition-all ${
                  isActive
                    ? 'bg-primary text-white shadow-md shadow-primary/20 scale-[1.02]'
                    : 'bg-white border border-surface-container text-on-surface-variant hover:border-primary/40 hover:text-primary shadow-sm'
                }`}
              >
                <img
                  src={mode.personaAvatar}
                  onError={handleAvatarError}
                  alt={mode.personaName}
                  className="w-5 h-5 rounded-full object-cover shrink-0 border border-white/60"
                />
                <span>{mode.tabLabel}</span>
                <span className={`text-[10px] font-bold ${isActive ? 'opacity-80' : 'text-on-surface-variant/50'}`}>
                  {mode.personaName}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {isFullscreen ? createPortal(chatPanel, document.body) : chatPanel}

      {/* 10 Agent Guide Tour Modal */}
      {guideModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[2rem] max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-surface-container"
          >
            <div className="p-6 border-b border-surface-container flex items-center justify-between bg-surface/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-black">
                  🧭
                </div>
                <div>
                  <h2 className="text-base font-black text-on-surface">10인 AI 코파일럿 에이전트 가이드</h2>
                  <p className="text-xs font-bold text-on-surface-variant">선생님의 상황에 딱 맞는 전담 에이전트를 선택해 보세요</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGuideModalOpen(false)}
                className="p-2 text-on-surface-variant hover:text-on-surface rounded-xl hover:bg-surface-container"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
              {AGENT_CATEGORIES.filter(c => c.key !== 'all').map(cat => (
                <div key={cat.key} className="space-y-3">
                  <h3 className="text-xs font-black text-primary uppercase tracking-wider flex items-center gap-1.5">
                    <span>{cat.icon}</span> {cat.label}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {cat.modeIds.map(id => {
                      const agent = COPILOT_MODES[id];
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            setHandoffOrigin(null);
                            setActiveMode(id);
                            setGuideModalOpen(false);
                          }}
                          className="flex items-start gap-3.5 p-4 rounded-2xl border border-surface-container hover:border-primary/50 hover:bg-primary/5 text-left transition-all group"
                        >
                          <img
                            src={agent.personaAvatar}
                            onError={handleAvatarError}
                            alt={agent.personaName}
                            className="w-12 h-12 rounded-2xl object-cover shrink-0 border-2 border-white shadow-md group-hover:scale-105 transition-transform"
                          />
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-black text-on-surface">{agent.personaName} · {agent.tabLabel}</span>
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: agent.themeColor }}>
                                {agent.personaRole}
                              </span>
                            </div>
                            <p className="text-[11px] font-bold text-on-surface-variant line-clamp-2 leading-relaxed">
                              {agent.heroSubtitle}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-surface-container bg-neutral-50 flex justify-end">
              <button
                type="button"
                onClick={() => setGuideModalOpen(false)}
                className="px-5 py-2.5 bg-neutral-900 text-white rounded-xl text-xs font-black hover:bg-neutral-800 transition-colors"
              >
                닫기
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* 대화 기록 불러오기 모달 */}
      {historyModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl sm:rounded-[2rem] max-w-md w-full max-h-[80vh] flex flex-col shadow-2xl overflow-hidden border border-surface-container"
          >
            <div className="p-4 sm:p-6 border-b border-surface-container flex items-center justify-between bg-surface/50 shrink-0">
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-black text-on-surface truncate">{modeConfig.tabLabel} 대화 기록</h2>
                <p className="text-[10px] sm:text-xs font-bold text-on-surface-variant mt-0.5">지난 대화를 이어서 보거나 새로 시작해 보세요</p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryModalOpen(false)}
                className="p-2 text-on-surface-variant hover:text-on-surface rounded-xl hover:bg-surface-container shrink-0"
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-3 sm:p-4 border-b border-surface-container shrink-0">
              <button
                type="button"
                onClick={handleStartNewConversation}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 sm:py-3 bg-neutral-900 text-white rounded-xl text-xs sm:text-sm font-black hover:bg-neutral-800 transition-colors"
              >
                <MessageSquarePlus size={16} />
                새 대화 시작
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-4 space-y-2">
              {loadingHistory ? (
                <div className="flex items-center justify-center py-10 text-on-surface-variant">
                  <Loader2 size={20} className="animate-spin" />
                </div>
              ) : conversationList.length === 0 ? (
                <p className="text-center text-xs font-bold text-on-surface-variant py-10">
                  아직 저장된 대화가 없어요.<br />대화를 시작하면 자동으로 기록됩니다.
                </p>
              ) : (
                conversationList.map(conv => (
                  <div
                    key={conv.id}
                    className={`flex items-center gap-2 rounded-xl border p-2.5 sm:p-3 transition-colors ${
                      conversationIdByMode[activeMode] === conv.id ? 'border-primary/50 bg-primary/5' : 'border-surface-container hover:border-primary/30 hover:bg-surface-container-low'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleLoadConversation(conv.id)}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className="text-xs sm:text-sm font-black text-on-surface truncate">{conv.title}</p>
                      <p className="text-[10px] sm:text-[11px] font-bold text-on-surface-variant mt-0.5">
                        {new Date(conv.updated_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteConversation(conv.id)}
                      disabled={deletingConversationId === conv.id}
                      className="p-1.5 sm:p-2 rounded-lg text-on-surface-variant hover:bg-red-50 hover:text-red-500 transition-colors shrink-0 disabled:opacity-40"
                      aria-label="삭제"
                      title="삭제"
                    >
                      {deletingConversationId === conv.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </div>
      )}

      <UpgradeModal isOpen={upgradeOpen} onClose={() => setUpgradeOpen(false)} reason={upgradeReason} />
      {seatukCostConfirmOpen && (() => {
        const usage = getAiUsageStatus(profile);
        return (
          <div
            className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4"
            onClick={() => setSeatukCostConfirmOpen(false)}
          >
            <div
              className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-600 shrink-0 flex items-center justify-center">
                  <Sparkles size={18} />
                </div>
                <div>
                  <p className="font-black text-sm text-slate-900">학생 {seatukPendingCount}명 세특을 한 번에 생성할까요?</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">한 번에 여러 명을 생성하면 AI 호출이 그만큼 여러 번 발생해요.</p>
                </div>
              </div>
              {usage && (
                <div className="rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-600">
                  {usage.kind === 'count'
                    ? `이번 달 AI 사용량 ${usage.used}/${usage.limit}회 (${usage.percent}%)`
                    : `이번 달 AI 사용률 ${usage.percent}%${usage.state !== 'normal' ? ' — 사용량이 많은 편이에요' : ''}`}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSeatukCostConfirmOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-black text-sm hover:bg-slate-50 transition-colors"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => { setSeatukCostConfirmOpen(false); runSeatukGenerate(); }}
                  className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white font-black text-sm hover:bg-violet-700 transition-colors"
                >
                  계속 생성
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {showMaterialImportModal && user?.id && (
        <ImportMaterialModal
          userId={user.id}
          onSelect={handleImportMaterialAsReference}
          onClose={() => setShowMaterialImportModal(false)}
        />
      )}
    </motion.div>
  );
};

export default AiCopilot;
