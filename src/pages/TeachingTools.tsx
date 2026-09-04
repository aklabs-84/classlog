import { useState, useEffect, type FormEvent } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Shuffle, Timer, ClipboardCheck, Dices, ChevronRight, ArrowLeft, BookOpen, Mic, LayoutPanelTop, BarChart2, Lock, Crown, X, HelpCircle, Zap, Layers, Video, StickyNote, FileText, Award, Inbox, Cpu, Boxes } from 'lucide-react';
import { useAuth, checkIsPro, checkIsBasicOrAbove, getAiMonthlyLimit } from '../lib/auth';
import { supabase } from '../lib/supabase';
import GroupPicker from './tools/GroupPicker';
import ClassTimer from './tools/ClassTimer';
import QuizGame from './tools/QuizGame';
import MaterialEditor from './tools/MaterialEditor';
import ClassTranscription from './tools/ClassTranscription';
import WhiteboardList from '../components/whiteboard/WhiteboardList';
import SurveyTool from './tools/SurveyTool';
import SlideDeckEditor from './tools/SlideDeckEditor';
import OnlineMeeting from './tools/OnlineMeeting';
import MyNotes from './tools/MyNotes';
import LessonPlanTool from './tools/LessonPlanTool';
import PortfolioManager from './tools/PortfolioManager';
import SubmissionViewer from './tools/SubmissionViewer';
import MicrobitPythonLab from './tools/MicrobitPythonLab';
import AiServiceCatalog from './tools/AiServiceCatalog';

const CONTACT_ROLES = ['담임 선생님', '교과 선생님', '학원 강사', '개인 강사', '교육 행정직', '기타'];

interface ToolLimits {
  freeDesc?: string;   // undefined = 무료 사용 불가
  basicDesc?: string;  // undefined = basic도 불가 or proDesc와 동일
  proDesc: string;
  usesAi?: boolean;    // AI 월 쿼터 소모 여부
}

interface QuickGuideStep {
  title: string;
  desc: string;
}

interface QuickGuide {
  steps: QuickGuideStep[];
  tip?: string;
}

interface Tool {
  id: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  badge?: string;
  newSince?: string;
  available: boolean;
  planRequired: 'free' | 'limited' | 'basic' | 'pro';
  byokEligible?: boolean; // 내 Gemini API 키를 등록하면 Basic 잠금을 우회할 수 있는 AI 도구
  limits?: ToolLimits;
  component?: React.ReactNode;
  quickGuide?: QuickGuide;
  /** 'learning' = 학생 페이지에 공개해 학생이 직접 사용할 수 있는 도구, 'teaching' = 교사 전용 도구 */
  category: 'learning' | 'teaching';
  /** true면 관리자(plan === 'admin') 계정에만 노출 — 베타 검증 중인 도구용 */
  adminOnly?: boolean;
}

export const tools: Tool[] = [
  {
    id: 'group-picker',
    icon: <Shuffle size={28} />,
    label: '랜덤 조 뽑기',
    description: '학생들을 랜덤으로 조를 나누고 애니메이션과 함께 발표합니다',
    available: true,
    category: 'teaching',
    planRequired: 'free',
    limits: { freeDesc: '무제한', proDesc: '무제한' },
    component: <GroupPicker />,
    quickGuide: {
      steps: [
        { title: '학생 목록 준비', desc: '클래스 불러오기로 학급 학생을 가져오거나 이름을 직접 입력합니다.' },
        { title: '조 구성 방식 선택', desc: '조 수 기준 또는 인원 수 기준으로 나눌 방식을 선택하고 조장 자동 선정 여부도 설정합니다.' },
        { title: '조 뽑기 실행', desc: '조 뽑기 버튼을 클릭하면 애니메이션과 함께 결과가 발표됩니다.' },
        { title: '결과 저장', desc: '이미지로 저장하거나 클래스에 적용해 학급에 조 정보를 저장합니다.' },
      ],
      tip: '저장된 조 탭에서 이전에 저장한 조 배정을 다시 불러올 수 있습니다.',
    },
  },
  {
    id: 'timer',
    icon: <Timer size={28} />,
    label: '수업 타이머',
    description: '발표 시간 제한, 쉬는 시간 등 다양한 타이머를 설정합니다',
    available: true,
    category: 'teaching',
    planRequired: 'free',
    limits: { freeDesc: '무제한', proDesc: '무제한' },
    component: <ClassTimer />,
    quickGuide: {
      steps: [
        { title: '프리셋 선택', desc: '준비(1분), 발표(3분), 쉬는 시간(5분), 모둠 활동(10분), 수업(45분) 중 선택하거나 직접 입력합니다.' },
        { title: '시작 / 일시정지 / 초기화', desc: '▶ 버튼으로 시작하고, 다시 누르면 일시정지됩니다. 🔄로 초기화합니다.' },
        { title: '전체화면 발표 모드', desc: '⬜ 확대 버튼으로 전체화면 전환. TV·프로젝터에 띄울 때 사용합니다.' },
      ],
      tip: '타이머는 다른 도구 사용 중에도 우측 하단 플로팅 버튼으로 빠르게 접근할 수 있습니다.',
    },
  },
  {
    id: 'my-notes',
    icon: <StickyNote size={28} />,
    label: '나의 노트',
    description: '학생 선택 없이 수업 준비나 간단한 생각을 자유롭게 기록하는 개인 메모장입니다',
    newSince: '2026-07-23',
    available: true,
    category: 'teaching',
    planRequired: 'free',
    limits: { freeDesc: '무제한', proDesc: '무제한' },
    component: <MyNotes />,
    quickGuide: {
      steps: [
        { title: '클래스 선택 (선택사항)', desc: '메모를 특정 클래스와 연결하고 싶다면 클래스를 선택하고, 아니면 "클래스 없음"으로 둡니다.' },
        { title: '자유롭게 작성', desc: '제목은 선택사항이며, 학생 지정 없이 내용란에 자유롭게 적으면 됩니다.' },
        { title: '저장 및 필터링', desc: '노트 저장을 누르면 아래 목록에 즉시 추가되고, 상단 필터 칩으로 클래스별로 모아볼 수 있습니다.' },
      ],
      tip: '학생 기록·생기부용 "교사 메모"와는 완전히 별개인, 나만 보는 개인 메모입니다.',
    },
  },
  {
    id: 'quiz',
    icon: <ClipboardCheck size={28} />,
    label: '실시간 퀴즈',
    description: '클래스별 문제를 만들고 Kahoot 스타일의 실시간 퀴즈를 진행합니다',
    newSince: '2026-05-26',
    available: true,
    category: 'teaching',
    planRequired: 'limited',
    limits: {
      freeDesc: '세트당 최대 5문항',
      basicDesc: '문항 수 무제한',
      proDesc: '무제한 + AI 문항 자동 생성',
      usesAi: true,
    },
    component: <QuizGame />,
    quickGuide: {
      steps: [
        { title: '퀴즈 세트 만들기', desc: '+ 새 퀴즈 세트를 클릭해 4지선다 문제를 추가합니다. PRO는 AI 자동 생성도 가능합니다.' },
        { title: '세션 시작', desc: '퀴즈 세트 선택 후 ▶ 세션 시작을 클릭하면 6자리 PIN이 생성됩니다.' },
        { title: 'PIN 공유 → 학생 참여', desc: '학생은 PIN을 입력해 로비에 입장합니다. 참가자가 모이면 퀴즈 시작을 누릅니다.' },
        { title: '진행 및 결과 확인', desc: '문제마다 정답과 실시간 순위가 표시됩니다. 마지막엔 최종 순위 화면이 나옵니다.' },
      ],
      tip: '무료 플랜은 퀴즈 세트당 5문항까지만 사용 가능합니다.',
    },
  },
  {
    id: 'material-editor',
    icon: <BookOpen size={28} />,
    label: '수업 자료 에디터',
    description: '마크다운으로 수업 자료를 작성하고 클래스 주차별로 학생에게 공개합니다',
    newSince: '2026-05-28',
    available: true,
    category: 'teaching',
    planRequired: 'limited',
    byokEligible: true,
    limits: { freeDesc: '자료 2개까지', basicDesc: '자료 수 무제한', proDesc: '자료 수 무제한' },
    component: <MaterialEditor />,
    quickGuide: {
      steps: [
        { title: '클래스 · 주차 선택', desc: '상단에서 대상 클래스와 주차를 선택합니다.' },
        { title: '마크다운으로 작성', desc: '툴바 버튼이나 마크다운 문법으로 자료를 작성합니다. 우측 미리보기에서 실시간 확인이 가능합니다.' },
        { title: '슬라이드 구분', desc: '본문에 --- 를 입력하면 슬라이드가 구분됩니다. 슬라이드 모드로 전체화면 발표를 할 수 있습니다.' },
        { title: '저장 후 공개', desc: '저장 후 🔒 비공개 토글을 켜면 학생이 학생 페이지에서 자료를 확인할 수 있습니다.' },
      ],
      tip: '무료 플랜은 자료 2개까지만 만들 수 있습니다. # 제목 / **굵게** / - 목록 / `코드` 등 마크다운 기초 문법으로 빠르게 작성하세요.',
    },
  },
  {
    id: 'lesson-plan',
    icon: <FileText size={28} />,
    label: '수업 계획서 만들기',
    description: '저장된 수업 자료로 제출용 계획서 초안을 AI가 만들고, 워드·한글용으로 복사하거나 PDF로 내보냅니다',
    newSince: '2026-08-28',
    available: true,
    category: 'teaching',
    planRequired: 'limited',
    byokEligible: true,
    limits: {
      freeDesc: '월 AI 한도 내 사용',
      basicDesc: 'AI 사용 가능',
      proDesc: 'AI 사용 가능',
      usesAi: true,
    },
    component: <LessonPlanTool />,
    quickGuide: {
      steps: [
        { title: '자료 선택', desc: '+ 새 계획서 만들기를 클릭하고, 계획서로 만들 클래스와 저장된 자료를 선택합니다.' },
        { title: '용도 · 옵션 설정', desc: '정식 지도안/간단 요약/학부모 안내 중 용도를 고르고, 필요하면 다른 주차 자료·평가계획·성취기준 연계를 추가합니다.' },
        { title: 'AI 초안 확인 · 수정', desc: 'AI가 만든 초안을 항목별로 확인하고 자유롭게 수정한 뒤 저장합니다.' },
        { title: '내보내기', desc: '저장 후 클립보드 복사(워드·구글독스 붙여넣기) 또는 PDF 다운로드로 바로 제출할 수 있습니다.' },
      ],
      tip: '저장한 계획서는 목록에 남아 언제든 다시 열람하거나 복사·PDF로 재출력할 수 있습니다.',
    },
  },
  {
    id: 'portfolio',
    icon: <Award size={28} />,
    label: '강사 포트폴리오',
    description: '누적된 클래스·수업 자료 통계를 자동 집계해 외부에 공유할 수 있는 포트폴리오 페이지를 만듭니다',
    newSince: '2026-08-28',
    available: true,
    category: 'teaching',
    planRequired: 'limited',
    byokEligible: true,
    limits: {
      freeDesc: '월 AI 한도 내 사용',
      basicDesc: 'AI 사용 가능',
      proDesc: 'AI 사용 가능',
      usesAi: true,
    },
    component: <PortfolioManager />,
    quickGuide: {
      steps: [
        { title: '공개 주소 설정', desc: '영문 소문자/숫자/하이픈으로 나만의 URL을 정합니다.' },
        { title: '공개 범위 · 클래스 선택', desc: '비공개/링크 전용/전체 공개 중 고르고, 통계에 포함할 클래스를 선택합니다.' },
        { title: '대표 수업 사례 선택', desc: '선택한 클래스의 자료 중 소개하고 싶은 사례를 미리보기 확인 후 고릅니다.' },
        { title: '소개글 작성 · 저장', desc: '직접 작성하거나 AI 초안을 생성한 뒤 저장하면 공개 페이지가 즉시 만들어집니다.' },
      ],
      tip: '기본값은 전체 비공개입니다. 선택하지 않은 클래스/자료와 학생 개인정보는 공개 페이지에 전혀 노출되지 않습니다.',
    },
  },
  {
    id: 'submission-viewer',
    icon: <Inbox size={28} />,
    label: '제출물 뷰어',
    description: '학생이 제출한 웹·파이썬·PDF·문서·표 결과물을 다운로드 없이 화면에서 바로 열어봅니다',
    newSince: '2026-09-02',
    available: true,
    category: 'teaching',
    planRequired: 'free',
    limits: { freeDesc: '무제한', proDesc: '무제한' },
    component: <SubmissionViewer />,
    quickGuide: {
      steps: [
        { title: '클래스 선택', desc: '제출물을 확인할 클래스를 상단에서 선택합니다.' },
        { title: '목록 확인', desc: '학생별로 제출된 파일 목록이 최신순으로 나타납니다.' },
        { title: '미리보기 실행', desc: '웹(html/zip)·Python·PDF·문서(docx)·표(csv/xlsx) 파일은 "미리보기" 버튼으로 다운로드 없이 바로 확인할 수 있습니다.' },
      ],
      tip: '지원하지 않는 형식(마이크로비트 hex, 엔트리 등)은 다운로드 버튼만 표시됩니다.',
    },
  },
  {
    id: 'microbit-python-lab',
    icon: <Cpu size={28} />,
    label: '마이크로비트 파이썬 실습',
    description: 'MicroPython 코드를 작성해 화면에서 바로 시뮬레이션하고, 실제 보드에 넣을 수 있는 .hex로 다운로드합니다',
    newSince: '2026-09-02',
    available: true,
    category: 'learning',
    planRequired: 'free',
    limits: { freeDesc: '무제한', proDesc: '무제한' },
    component: <MicrobitPythonLab />,
    quickGuide: {
      steps: [
        { title: '코드 작성', desc: '왼쪽 편집창에 MicroPython 코드를 작성합니다. 기본 예제 코드가 준비되어 있습니다.' },
        { title: '실행 확인', desc: '"실행" 버튼을 누르면 오른쪽 시뮬레이터에서 LED·버튼 동작을 바로 확인할 수 있습니다.' },
        { title: 'hex 다운로드', desc: '".hex 다운로드" 버튼으로 실제 마이크로비트 보드에 옮겨 그대로 실행할 수 있는 파일을 받습니다.' },
      ],
      tip: '블록 코딩(MakeCode)으로 만든 결과물은 이 도구가 아닌 "제출물 뷰어"의 다운로드 기능을 이용해주세요.',
    },
  },
  {
    id: 'ai-service-catalog',
    icon: <Boxes size={28} />,
    label: 'AI 체험 활동 (베타)',
    description: 'AIServiceHub에 올라온 교육용 AI 체험 앱을 학생들과 바로 사용해볼 수 있습니다',
    newSince: '2026-09-04',
    available: true,
    category: 'learning',
    adminOnly: true,
    planRequired: 'free',
    limits: { freeDesc: '무제한', proDesc: '무제한' },
    component: <AiServiceCatalog />,
    quickGuide: {
      steps: [
        { title: '카드 목록 확인', desc: 'AIServiceHub에 등록된 교육용 앱 카드가 표시됩니다.' },
        { title: '체험 활동 열기', desc: '카드를 클릭하면 새 탭에서 해당 앱이 열립니다.' },
      ],
      tip: '아직 관리자 계정에만 보이는 베타 기능입니다.',
    },
  },
  {
    id: 'slide-deck',
    icon: <Layers size={28} />,
    label: '슬라이드 만들기',
    description: 'PPT처럼 텍스트·이미지를 원하는 위치에 자유롭게 배치해 발표 자료를 만듭니다',
    newSince: '2026-07-04',
    available: true,
    category: 'teaching',
    planRequired: 'limited',
    byokEligible: true,
    limits: { freeDesc: '슬라이드덱 1개까지', basicDesc: '슬라이드 수 무제한', proDesc: '슬라이드 수 무제한' },
    component: <SlideDeckEditor />,
    quickGuide: {
      steps: [
        { title: '템플릿 선택', desc: '+ 새 슬라이드를 클릭하고 원하는 디자인 템플릿을 선택합니다.' },
        { title: '텍스트 · 이미지 추가', desc: '상단 툴바에서 텍스트/이미지를 추가하고 드래그로 위치를, 모서리를 드래그해 크기를 조절합니다.' },
        { title: '슬라이드 관리', desc: '왼쪽 목록에서 슬라이드를 추가·복제·삭제하고 클릭해 전환합니다.' },
        { title: '자동 저장', desc: '편집 내용은 잠시 후 자동으로 저장됩니다.' },
      ],
      tip: '무료 플랜은 슬라이드덱 1개까지만 만들 수 있습니다. 텍스트 블록을 더블클릭하면 바로 내용을 수정할 수 있습니다.',
    },
  },
  {
    id: 'transcription',
    icon: <Mic size={28} />,
    label: '수업 전사 & AI 분석',
    description: '수업을 실시간 전사하고 AI가 학생별 관찰 기록과 수업 품질을 자동 분석합니다',
    newSince: '2026-06-04',
    available: true,
    category: 'teaching',
    planRequired: 'limited',
    byokEligible: true,
    limits: {
      freeDesc: '월 20회 AI 분석',
      basicDesc: 'AI 분석 가능',
      proDesc: 'AI 분석 가능',
      usesAi: true,
    },
    component: <ClassTranscription />,
    quickGuide: {
      steps: [
        { title: '클래스 선택', desc: '분석에 사용할 클래스를 선택합니다. 학생 이름이 AI 분석의 기준이 됩니다.' },
        { title: '녹음 시작', desc: '🎙️ 녹음 시작을 클릭하고 마이크 권한을 허용하면 실시간으로 수업이 전사됩니다.' },
        { title: '녹음 중지 후 AI 분석', desc: '■ 중지 후 ✨ AI 분석을 클릭합니다. 학생별 관찰·수업 평가·자기 성찰 3가지 탭으로 결과가 표시됩니다.' },
        { title: '활동 기록으로 저장', desc: '학생별 관찰 초안에서 저장 버튼을 누르면 해당 학생의 활동 기록에 바로 추가됩니다.' },
      ],
      tip: 'Chrome 브라우저에서 가장 잘 작동합니다. Safari·Firefox에서는 실시간 전사가 제한될 수 있습니다.',
    },
  },
  {
    id: 'whiteboard',
    icon: <LayoutPanelTop size={28} />,
    label: '협업 화이트보드',
    description: '조별 협업 보드를 만들고 포스트잇, 도형, 이미지로 수업 활동을 진행합니다',
    newSince: '2026-06-08',
    available: true,
    category: 'teaching',
    planRequired: 'limited',
    limits: { freeDesc: '보드 1개까지', basicDesc: '클래스당 보드 3개', proDesc: '보드 수 무제한' },
    component: <WhiteboardList />,
    quickGuide: {
      steps: [
        { title: '보드 만들기', desc: '+ 새 보드를 클릭해 보드 이름을 입력합니다.' },
        { title: '학생 공유 링크 배포', desc: '보드 공유 버튼을 클릭해 학생용 링크를 복사하고 공유합니다.' },
        { title: '오브젝트 추가', desc: '툴바에서 포스트잇·도형·이미지·섹션을 추가하고 드래그해 배치합니다.' },
        { title: '단축키 활용', desc: 'Ctrl+C/V 복사·붙여넣기, Ctrl+Z 되돌리기, Delete 삭제. 섹션 색상은 우클릭 메뉴로 변경합니다.' },
      ],
      tip: '무료 플랜은 보드 1개까지만 만들 수 있습니다. 수업 종료 후 공유 중지 버튼을 눌러 학생 접근을 차단하세요.',
    },
  },
  {
    id: 'survey',
    icon: <BarChart2 size={28} />,
    label: '실시간 설문',
    description: '객관식, 예/아니오, 별점, 순위 매기기, AI 분석까지 다양한 실시간 설문을 진행합니다',
    newSince: '2026-06-09',
    available: true,
    category: 'teaching',
    planRequired: 'limited',
    byokEligible: true,
    limits: {
      freeDesc: '설문 1개까지',
      basicDesc: '설문 수 무제한',
      proDesc: '무제한 + AI 결과 분석',
      usesAi: true,
    },
    component: <SurveyTool />,
    quickGuide: {
      steps: [
        { title: '설문 양식 만들기', desc: '+ 새 설문 만들기를 클릭해 제목을 입력하고 + 문항 추가로 원하는 타입의 문항을 추가합니다.' },
        { title: '설문 열기 · PIN 공유', desc: '▶ 설문 열기를 클릭하면 6자리 PIN이 생성됩니다. 학생들이 PIN을 입력해 응답합니다.' },
        { title: '실시간 결과 확인', desc: '응답이 들어오는 대로 결과 차트가 실시간으로 업데이트됩니다.' },
        { title: 'AI 분석 · CSV 내보내기', desc: '설문 종료 후 ✨ AI 분석으로 응답을 요약하거나 CSV로 저장합니다.' },
      ],
      tip: '무료 플랜은 설문 1개까지만 만들 수 있습니다. 문항 타입: 객관식 · 예/아니오 · 별점 · 단답형 · 의견 척도(슬라이더) · 순위 매기기 6가지를 조합할 수 있습니다.',
    },
  },
  {
    id: 'online-meeting',
    icon: <Video size={28} />,
    label: '온라인 수업',
    description: 'Google Meet/Zoom 회의 링크를 등록하고 학생들에게 바로 전달합니다',
    newSince: '2026-07-04',
    available: true,
    category: 'teaching',
    planRequired: 'free',
    limits: { freeDesc: '무제한', proDesc: '무제한' },
    component: <OnlineMeeting />,
    quickGuide: {
      steps: [
        { title: '클래스 선택', desc: '온라인 수업을 진행할 클래스를 선택합니다.' },
        { title: '회의 링크 붙여넣기', desc: 'Google Meet(meet.google.com/new) 또는 Zoom에서 직접 생성한 회의 링크를 붙여넣습니다.' },
        { title: '등록하고 학생에게 전달', desc: '등록 즉시 학생 페이지에 입장 버튼이 노출됩니다.' },
        { title: '수업 종료 처리', desc: '수업이 끝나면 목록에서 종료 버튼을 눌러 학생 화면에서 입장 버튼을 숨깁니다.' },
      ],
      tip: '교사가 호스트로 직접 회의를 열어야 하므로, 미리 Google Meet/Zoom에서 링크를 생성한 뒤 붙여넣어 주세요.',
    },
  },
  {
    id: 'random-pick',
    icon: <Dices size={28} />,
    label: '랜덤 학생 뽑기',
    description: '발표자, 청소 당번 등 랜덤으로 학생 1명을 뽑습니다',
    badge: '준비 중',
    available: false,
    category: 'teaching',
    planRequired: 'free',
  },
];

function isNewBadgeActive(newSince?: string): boolean {
  if (!newSince) return false;
  const days = (Date.now() - new Date(newSince).getTime()) / (1000 * 60 * 60 * 24);
  return days < 7;
}

const TeachingTools = () => {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile } = useAuth();
  const hasByokKey = !!localStorage.getItem('gemini_api_key');
  const isToolLocked = (tool: Tool, isProArg: boolean, isBasicOrAboveArg: boolean): boolean => {
    if (!tool.available) return true;
    const byokUnlocked = hasByokKey && !!tool.byokEligible;
    if (tool.planRequired === 'pro') return !isProArg && !byokUnlocked;
    if (tool.planRequired === 'basic') return !isBasicOrAboveArg && !byokUnlocked;
    return false;
  };
  const [activeTool, setActiveTool] = useState<Tool | null>(() => {
    const stateToolId = (location.state as { activeToolId?: string } | null)?.activeToolId;
    const queryToolId = searchParams.get('tool');
    const toolId = stateToolId || queryToolId;
    const requestedTool = toolId ? (tools.find(t => t.id === toolId) ?? null) : null;
    if (!requestedTool) return null;
    // URL/state로 직접 진입해도 잠금 도구는 열리지 않도록 방어 (플랜 체크 우회 방지)
    if (isToolLocked(requestedTool, checkIsPro(profile), checkIsBasicOrAbove(profile))) return null;
    return requestedTool;
  });
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [lockedTool, setLockedTool] = useState<Tool | null>(null);
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactSchool, setContactSchool] = useState('');
  const [contactRole, setContactRole] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [guideTool, setGuideTool] = useState<Tool | null>(null);
  const [activeCategory, setActiveCategory] = useState<'learning' | 'teaching'>('teaching');

  const isPro = checkIsPro(profile);
  const isBasicOrAbove = checkIsBasicOrAbove(profile);

  const aiLimit = getAiMonthlyLimit(profile);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const aiUsed = profile?.ai_monthly_reset === thisMonth ? (profile?.ai_monthly_count ?? 0) : 0;
  const aiRemaining = aiLimit === Infinity ? null : Math.max(0, aiLimit - aiUsed);

  const getMyLimitDesc = (tool: Tool): string => {
    if (!tool.limits) return '';
    if (isPro) return tool.limits.proDesc;
    if (isBasicOrAbove) return tool.limits.basicDesc ?? tool.limits.proDesc;
    return tool.limits.freeDesc ?? '';
  };

  const planLabel = profile?.plan === 'admin' ? 'Admin'
    : isPro ? 'Pro' : isBasicOrAbove ? 'Basic' : 'Free';

  const handleToolClick = (tool: Tool) => {
    if (!tool.available) return;
    if (isToolLocked(tool, isPro, isBasicOrAbove)) {
      setLockedTool(tool);
      setShowUpgradeModal(true);
      return;
    }
    setActiveTool(tool);
  };

  const closeUpgradeModal = () => {
    setShowUpgradeModal(false);
    setLockedTool(null);
    setShowContactForm(false);
    setContactName('');
    setContactEmail('');
    setContactSchool('');
    setContactRole('');
    setContactMessage('');
    setContactSubmitted(false);
    setContactError(null);
  };

  const openContactForm = () => {
    setContactName(profile?.full_name || '');
    setContactEmail(profile?.email || '');
    setContactSchool(profile?.school_name || '');
    setContactRole(profile?.role || '');
    setShowContactForm(true);
  };

  const handleContactSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setContactSubmitting(true);
    setContactError(null);

    // Basic 요금제는 화면 노출만 잠시 끔(가입 경로 없음) — 문의 라벨은 항상 Pro로 안내.
    const requestedPlan = 'Pro';
    const contactPayload = {
      name: contactName,
      email: contactEmail,
      school_name: contactSchool,
      role: contactRole,
      message: `[${requestedPlan} 플랜 문의 - ${lockedTool?.label ?? '수업 도구'}]${contactMessage ? `\n${contactMessage}` : ''}`,
    };

    const { error } = await supabase.from('access_requests').insert(contactPayload);
    if (error) {
      setContactSubmitting(false);
      setContactError('제출 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    try {
      await fetch('/api/slack?type=notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contactPayload),
      });
    } catch {
      // 슬랙 알림 실패해도 신청은 이미 저장됐으므로 무시
    }

    setContactSubmitting(false);
    setContactSubmitted(true);
  };

  // activeTool이 바뀔 때마다 URL tool= 파라미터 동기화
  // state 옵션을 넘기지 않으면 location.state가 undefined로 덮어써져
  // openSessionId 같은 딥링크 payload가 자식 컴포넌트에 도달하기 전에 유실된다.
  useEffect(() => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (activeTool) {
        next.set('tool', activeTool.id);
      } else {
        next.delete('tool');
      }
      return next;
    }, { replace: true, state: location.state });
  }, [activeTool]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        {activeTool && (
          <button
            onClick={() => setActiveTool(null)}
            className="p-2.5 rounded-full bg-surface-container hover:bg-primary/10 text-on-surface-variant hover:text-primary transition-all shadow-sm"
            title="수업 도구 목록으로"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <div>
          <h1 className="text-3xl font-black gradient-text">
            {activeTool ? activeTool.label : '수업 도구'}
          </h1>
          <p className="text-sm text-on-surface-variant mt-0.5">
            {activeTool
              ? activeTool.description
              : '수업에 바로 활용할 수 있는 도구 모음'}
          </p>
        </div>
      </div>

      {/* 업그레이드 모달 */}
      <AnimatePresence>
        {showUpgradeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
            onClick={closeUpgradeModal}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className={`bg-white rounded-3xl p-8 w-full shadow-2xl text-center ${showContactForm ? 'max-w-md' : 'max-w-sm'}`}
            >
              <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Crown size={32} className="text-amber-500" />
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-2">
                PRO 전용 도구입니다
              </h3>
              <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                {isBasicOrAbove
                  ? <>이 도구는 Pro 플랜에서 사용할 수 있습니다.<br />아래에 문의를 남겨주시면 곧 연락드릴게요.</>
                  : <>이 도구는 Pro 플랜에서 사용할 수 있습니다.<br />베타 테스터 또는 플랜 업그레이드는 아래에 문의를 남겨주세요.</>
                }
              </p>

              {contactSubmitted ? (
                <div className="flex flex-col gap-3">
                  <p className="text-sm font-bold text-emerald-600 py-2">문의가 접수되었습니다. 곧 연락드릴게요!</p>
                  <button
                    onClick={closeUpgradeModal}
                    className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    <X size={14} /> 닫기
                  </button>
                </div>
              ) : showContactForm ? (
                <form onSubmit={handleContactSubmit} className="flex flex-col gap-3 text-left">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-600 ml-1">이름 *</label>
                    <input
                      required
                      value={contactName}
                      onChange={e => setContactName(e.target.value)}
                      placeholder="홍길동"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-600 ml-1">이메일 *</label>
                    <input
                      required
                      type="email"
                      value={contactEmail}
                      onChange={e => setContactEmail(e.target.value)}
                      placeholder="teacher@school.edu"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-600 ml-1">학교 / 학원 이름 *</label>
                    <input
                      required
                      value={contactSchool}
                      onChange={e => setContactSchool(e.target.value)}
                      placeholder="아크고등학교 / 아크수학학원"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-600 ml-1">직책 *</label>
                    <select
                      required
                      value={contactRole}
                      onChange={e => setContactRole(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 appearance-none"
                    >
                      <option value="">선택해 주세요</option>
                      {CONTACT_ROLES.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-600 ml-1">신청 이유 (선택)</label>
                    <textarea
                      value={contactMessage}
                      onChange={e => setContactMessage(e.target.value)}
                      placeholder="궁금한 점이나 필요한 이유를 남겨주세요"
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  {contactError && <p className="text-xs text-red-500 font-bold">{contactError}</p>}
                  <button
                    type="submit"
                    disabled={contactSubmitting}
                    className="w-full py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-black rounded-xl text-sm transition-colors mt-1"
                  >
                    {contactSubmitting ? '제출 중...' : '문의 제출하기'}
                  </button>
                  <button
                    type="button"
                    onClick={closeUpgradeModal}
                    className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    <X size={14} /> 닫기
                  </button>
                </form>
              ) : (
                <div className="flex flex-col gap-3">
                  <button
                    onClick={openContactForm}
                    className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-xl text-sm transition-colors"
                  >
                    Pro 업그레이드 문의하기
                  </button>
                  <button
                    onClick={closeUpgradeModal}
                    className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
                  >
                    <X size={14} /> 닫기
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 빠른 사용법 모달 */}
      <AnimatePresence>
        {guideTool && guideTool.quickGuide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
            onClick={() => setGuideTool(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
                    {guideTool.icon}
                  </div>
                  <div>
                    <h3 className="text-base font-black text-gray-900">{guideTool.label}</h3>
                    <p className="text-xs text-gray-400">빠른 사용 가이드</p>
                  </div>
                </div>
                <button
                  onClick={() => setGuideTool(null)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <ol className="flex flex-col gap-3 mb-4">
                {guideTool.quickGuide.steps.map((step, i) => (
                  <li key={i} className="flex gap-3 items-start">
                    <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-black flex items-center justify-center flex-shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-gray-800">{step.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{step.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>

              {guideTool.quickGuide.tip && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 leading-relaxed">
                  <span className="font-bold">💡 팁: </span>{guideTool.quickGuide.tip}
                </div>
              )}

              <button
                onClick={() => { setGuideTool(null); handleToolClick(guideTool); }}
                className="mt-4 w-full py-3 bg-primary hover:bg-primary/90 text-white font-black rounded-xl text-sm transition-colors"
              >
                {guideTool.planRequired === 'pro' && !isPro ? '업그레이드 필요' : '바로 시작하기 →'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {!activeTool && (
        <div className="flex items-center gap-1.5 p-1 bg-surface-container rounded-2xl w-fit">
          <button
            onClick={() => setActiveCategory('teaching')}
            className={`px-4 py-2 rounded-xl text-sm font-black transition-colors ${
              activeCategory === 'teaching' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            수업 도구
          </button>
          <button
            onClick={() => setActiveCategory('learning')}
            className={`px-4 py-2 rounded-xl text-sm font-black transition-colors ${
              activeCategory === 'learning' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            학습 도구
          </button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {activeTool ? (
          <motion.div
            key={activeTool.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            {/* 도구 전용 영역: 페이지 상단 내비게이션(← 전체 도구 목록)과 구분되는 카드 경계 */}
            <div className="bg-white dark:bg-surface-container-lowest rounded-3xl border border-gray-200 dark:border-white/10 shadow-md p-4 md:p-5">
              {activeTool.limits && (
                <div className="mb-4 flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-2xl bg-surface-container border border-white/30 text-xs">
                  <span className="font-black text-primary/80">{planLabel} 플랜</span>
                  <span className="text-on-surface-variant/50">|</span>
                  <span className="text-on-surface-variant font-medium">{getMyLimitDesc(activeTool)}</span>
                  {activeTool.limits.usesAi && (
                    <div className={`ml-auto flex items-center gap-1.5 font-black ${
                      hasByokKey && !!activeTool.byokEligible
                        ? 'text-primary'
                        : aiRemaining !== null && aiRemaining <= 5 ? 'text-red-500' : 'text-primary'
                    }`}>
                      <Zap size={12} />
                      {hasByokKey && !!activeTool.byokEligible
                        ? '내 API 키 사용 중 · 무제한'
                        : aiRemaining !== null
                        ? <>AI 잔여 <strong>{aiRemaining}</strong> / {aiLimit}회</>
                        : 'AI 무제한'}
                    </div>
                  )}
                </div>
              )}
              {activeTool.component}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="menu"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          >
            {tools.filter(tool => tool.category === activeCategory && (!tool.adminOnly || profile?.plan === 'admin')).map((tool, i) => {
              const byokUnlocked = hasByokKey && !!tool.byokEligible;
              const isBasicLocked = !isBasicOrAbove && (tool.planRequired === 'basic' || tool.planRequired === 'pro') && !byokUnlocked;
              const isProLocked = isBasicOrAbove && !isPro && tool.planRequired === 'pro' && !byokUnlocked;
              const isLocked = isBasicLocked || isProLocked;
              return (
                <motion.button
                  key={tool.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                  onClick={() => handleToolClick(tool)}
                  disabled={!tool.available}
                  className={`relative glass rounded-2xl p-6 border text-left flex flex-col gap-4 transition-all duration-300 group ${
                    !tool.available
                      ? 'border-white/20 opacity-60 cursor-not-allowed'
                      : isLocked
                      ? 'border-amber-200/60 hover:border-amber-300 hover:shadow-lg hover:-translate-y-1 cursor-pointer'
                      : 'border-white/40 hover:border-primary/30 hover:shadow-lg hover:-translate-y-1 cursor-pointer'
                  }`}
                >
                  {/* 잠금 배지 */}
                  {isProLocked && (
                    <span className="absolute top-4 right-4 flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 text-white">
                      <Crown size={9} /> PRO
                    </span>
                  )}
                  {isBasicLocked && (
                    <span className="absolute top-4 right-4 flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 text-white">
                      <Crown size={9} /> PRO
                    </span>
                  )}
                  {/* 준비중 등 정적 배지 (잠금 아닐 때만) */}
                  {tool.badge && !isLocked && (
                    <span className="absolute top-4 right-4 text-[10px] font-black px-2 py-0.5 rounded-full bg-on-surface/10 text-on-surface-variant">
                      {tool.badge}
                    </span>
                  )}
                  {/* 등록 후 7일간만 노출되는 NEW 배지 */}
                  {!tool.badge && !isLocked && isNewBadgeActive(tool.newSince) && (
                    <span className="absolute top-4 right-4 text-[10px] font-black px-2 py-0.5 rounded-full bg-gradient-to-r from-violet-500 to-purple-500 text-white">
                      NEW
                    </span>
                  )}

                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                      !tool.available
                        ? 'bg-on-surface/5 text-on-surface-variant'
                        : isLocked
                        ? 'bg-amber-100 text-amber-500 group-hover:bg-amber-500 group-hover:text-white'
                        : 'bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white group-hover:shadow-md group-hover:shadow-primary/30'
                    }`}
                  >
                    {isLocked ? <Lock size={24} /> : tool.icon}
                  </div>

                  <div className="flex-1">
                    <h3 className="font-black text-on-surface text-base">{tool.label}</h3>
                    <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">{tool.description}</p>
                  </div>

                  {/* 플랜별 한도 */}
                  {tool.limits && tool.available && (
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-bold ${
                      isLocked
                        ? 'bg-amber-50 text-amber-600'
                        : 'bg-surface-container/60 text-on-surface-variant'
                    }`}>
                      {isLocked ? (
                        <>
                          <Lock size={10} />
                          <span>Pro 플랜부터 사용 가능</span>
                        </>
                      ) : (
                        <>
                          <span className="opacity-60">{planLabel}</span>
                          <span className="opacity-40">·</span>
                          <span>{getMyLimitDesc(tool)}</span>
                          {tool.limits.usesAi && byokUnlocked && (
                            <span className="ml-auto font-black text-primary">내 키 사용 · 무제한</span>
                          )}
                          {tool.limits.usesAi && !byokUnlocked && aiRemaining !== null && (
                            <span className={`ml-auto font-black ${aiRemaining <= 5 ? 'text-red-500' : 'text-primary'}`}>
                              AI 잔여 {aiRemaining}회
                            </span>
                          )}
                          {tool.limits.usesAi && !byokUnlocked && aiRemaining === null && (
                            <span className="ml-auto font-black text-primary">AI 무제한</span>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {tool.available && (
                    <div className="flex items-center justify-between">
                      <div className={`flex items-center gap-1 text-xs font-black group-hover:gap-2 transition-all ${isLocked ? 'text-amber-500' : 'text-primary'}`}>
                        {isLocked ? '업그레이드 필요' : '시작하기'}
                        <ChevronRight size={14} />
                      </div>
                      {tool.quickGuide && (
                        <button
                          onClick={e => { e.stopPropagation(); setGuideTool(tool); }}
                          className="flex items-center gap-1 text-[10px] font-bold text-gray-400 hover:text-primary transition-colors px-1.5 py-0.5 rounded-lg hover:bg-primary/10"
                        >
                          <HelpCircle size={12} />
                          사용법
                        </button>
                      )}
                    </div>
                  )}
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TeachingTools;
