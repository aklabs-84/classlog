import type { SlideTemplate, DeckSlide, SlideDeck, SlideLayoutKind, SlideObject } from './types';
import type { AiDraftSlide, SlideLayoutSpec } from '../../lib/gemini';

// 4개 템플릿 — 수업/학원 학습활동에서 실제로 쓰는 발표 목적별로 구성.
// 색상/폰트뿐 아니라 오브젝트 구성 자체(코드블록, 이미지 프레임, 스텝 배지 등)가 서로 다르다.
// 좌표는 1280x720 디자인 캔버스 기준.

const MANROPE = "'Manrope', 'Pretendard Variable', sans-serif";
const PUBLIC_SANS = "'Public Sans', 'Pretendard Variable', sans-serif";
const PRETENDARD = "'Pretendard Variable', sans-serif";

const BASE_TEMPLATES: SlideTemplate[] = [
  {
    id: 'bold-statement',
    name: '핵심 강조',
    description: '큰 타이포그래피로 핵심 문장 하나를 임팩트 있게 보여주는 스타일',
    bg: '#0f0f10',
    textColor: '#ffffff',
    accentColor: '#FACC15',
    swatch: '#0f0f10',
    layouts: {
      title: [
        { type: 'text', x: 600, y: 200, width: 80, height: 6, zIndex: 1,
          text: '', decorative: true, style: { background: '#FACC15' } },
        { type: 'text', x: 140, y: 190, width: 1000, height: 230, zIndex: 2,
          text: '핵심 메시지를\n입력하세요',
          style: { fontSize: 80, align: 'center', bold: true, fontFamily: MANROPE } },
        { type: 'text', x: 140, y: 440, width: 1000, height: 60, zIndex: 3,
          text: '부제목이나 발표자 정보를 입력하세요',
          style: { fontSize: 22, align: 'center', color: '#9CA3AF', fontFamily: MANROPE } },
        { type: 'emoji', x: 880, y: 40, width: 340, height: 340, zIndex: 0,
          text: '💡', style: { opacity: 0.05 } },
      ],
      textOnly: [
        { type: 'emoji', x: 920, y: 380, width: 320, height: 320, zIndex: 1,
          text: '💡', style: { opacity: 0.06 } },
        { type: 'text', x: 440, y: 120, width: 400, height: 44, zIndex: 2,
          text: 'KEY POINT',
          style: { fontSize: 16, align: 'center', bold: true, color: '#FACC15', fontFamily: MANROPE, background: 'rgba(250,204,21,0.12)', borderRadius: 18 } },
        { type: 'text', x: 140, y: 200, width: 1000, height: 190, zIndex: 3,
          text: '이 슬라이드의 핵심 문장을\n크고 굵게 입력하세요',
          style: { fontSize: 48, align: 'center', bold: true, color: '#FACC15', fontFamily: MANROPE } },
        { type: 'text', x: 240, y: 410, width: 800, height: 130, zIndex: 4,
          text: '핵심 문장에 대한 간단한 설명을 입력하세요',
          style: { fontSize: 22, align: 'center', color: '#9CA3AF', fontFamily: MANROPE } },
      ],
      textImage1: [
        { type: 'text', x: 100, y: 220, width: 560, height: 300, zIndex: 1,
          text: '핵심 문장을\n입력하세요',
          style: { fontSize: 40, align: 'left', bold: true, fontFamily: MANROPE } },
        { type: 'image', x: 700, y: 140, width: 480, height: 440, zIndex: 2, style: { frame: 'rounded' } },
        { type: 'text', x: 100, y: 160, width: 180, height: 36, zIndex: 0,
          text: 'POINT',
          style: { fontSize: 14, align: 'center', bold: true, color: '#FACC15', fontFamily: MANROPE, background: 'rgba(250,204,21,0.12)', borderRadius: 16 } },
      ],
      textImagesMany: [
        { type: 'text', x: 100, y: 200, width: 480, height: 340, zIndex: 1,
          text: '핵심 문장을\n입력하세요',
          style: { fontSize: 32, align: 'left', bold: true, fontFamily: MANROPE } },
        { type: 'image', x: 620, y: 110, width: 560, height: 230, zIndex: 2, style: { frame: 'rounded' } },
        { type: 'image', x: 620, y: 360, width: 560, height: 230, zIndex: 3, style: { frame: 'rounded' } },
        { type: 'text', x: 100, y: 150, width: 180, height: 36, zIndex: 0,
          text: 'POINT',
          style: { fontSize: 14, align: 'center', bold: true, color: '#FACC15', fontFamily: MANROPE, background: 'rgba(250,204,21,0.12)', borderRadius: 16 } },
      ],
    },
  },
  {
    id: 'image-focus',
    name: '이미지 강조',
    description: '폴라로이드·원형·풀블리드 등 다양한 프레임으로 이미지를 크게 보여주는 스타일',
    bg: '#fafaf9',
    textColor: '#27272a',
    accentColor: '#0EA5E9',
    swatch: '#e0f2fe',
    layouts: {
      title: [
        { type: 'image', x: 0, y: 0, width: 1280, height: 720, zIndex: 1, style: { frame: 'full' } },
        { type: 'text', x: 100, y: 560, width: 1080, height: 120, zIndex: 2,
          text: '슬라이드 제목을 입력하세요',
          style: { fontSize: 48, align: 'left', bold: true, color: '#fff', background: 'rgba(0,0,0,0.45)', borderRadius: 12, fontFamily: PUBLIC_SANS } },
        { type: 'text', x: 100, y: 50, width: 200, height: 32, zIndex: 3,
          text: 'GALLERY',
          style: { fontSize: 14, align: 'left', bold: true, color: '#fff', background: 'rgba(14,165,233,0.55)', borderRadius: 4, fontFamily: PUBLIC_SANS } },
      ],
      textOnly: [
        { type: 'text', x: 100, y: 70, width: 300, height: 24, zIndex: 0,
          text: 'GALLERY',
          style: { fontSize: 14, align: 'left', bold: true, color: '#0EA5E9', fontFamily: PUBLIC_SANS } },
        { type: 'text', x: 100, y: 100, width: 80, height: 6, zIndex: 1,
          text: '', decorative: true, style: { background: '#0EA5E9' } },
        { type: 'text', x: 100, y: 130, width: 1080, height: 480, zIndex: 2,
          text: '제목을 입력하세요\n\n이미지에 대한 설명이나 활동 안내를 입력하세요',
          style: { fontSize: 30, align: 'left', fontFamily: PUBLIC_SANS } },
      ],
      textImage1: [
        { type: 'text', x: 100, y: 50, width: 1080, height: 60, zIndex: 1,
          text: '제목을 입력하세요',
          style: { fontSize: 28, align: 'left', bold: true, fontFamily: PUBLIC_SANS } },
        { type: 'image', x: 390, y: 130, width: 500, height: 420, zIndex: 2, style: { frame: 'polaroid', rotate: -3 } },
        { type: 'text', x: 390, y: 570, width: 500, height: 50, zIndex: 3,
          text: '사진 설명을 입력하세요',
          style: { fontSize: 18, align: 'center', color: '#6b7280', fontFamily: PUBLIC_SANS } },
        { type: 'text', x: 100, y: 18, width: 200, height: 24, zIndex: 0,
          text: 'GALLERY',
          style: { fontSize: 14, align: 'left', bold: true, color: '#0EA5E9', fontFamily: PUBLIC_SANS } },
      ],
      textImagesMany: [
        { type: 'text', x: 100, y: 50, width: 1080, height: 50, zIndex: 1,
          text: '제목을 입력하세요',
          style: { fontSize: 26, align: 'left', bold: true, fontFamily: PUBLIC_SANS } },
        { type: 'image', x: 100, y: 140, width: 280, height: 280, zIndex: 2, style: { frame: 'circle' } },
        { type: 'image', x: 460, y: 110, width: 360, height: 300, zIndex: 3, style: { frame: 'rounded', rotate: 2 } },
        { type: 'image', x: 880, y: 150, width: 300, height: 320, zIndex: 4, style: { frame: 'polaroid', rotate: -4 } },
        { type: 'text', x: 100, y: 470, width: 1080, height: 140, zIndex: 5,
          text: '각 이미지에 대한 설명을 입력하세요',
          style: { fontSize: 22, align: 'center', fontFamily: PUBLIC_SANS } },
        { type: 'text', x: 100, y: 18, width: 200, height: 24, zIndex: 0,
          text: 'GALLERY',
          style: { fontSize: 14, align: 'left', bold: true, color: '#0EA5E9', fontFamily: PUBLIC_SANS } },
      ],
    },
  },
  {
    id: 'code-practice',
    name: '코드 실습',
    description: '복사해서 바로 쓸 수 있는 코드블록 중심의 실습용 스타일',
    bg: '#1e1e2e',
    textColor: '#e2e2e8',
    accentColor: '#89b4fa',
    swatch: '#1e1e2e',
    layouts: {
      title: [
        { type: 'text', x: 490, y: 180, width: 300, height: 40, zIndex: 1,
          text: '🖥️ 코드 실습',
          style: { fontSize: 16, align: 'center', bold: true, color: '#89b4fa', background: 'rgba(137,180,250,0.12)', borderRadius: 20, fontFamily: PRETENDARD } },
        { type: 'text', x: 140, y: 250, width: 1000, height: 140, zIndex: 2,
          text: '실습 제목을 입력하세요',
          style: { fontSize: 56, align: 'center', bold: true, fontFamily: PRETENDARD } },
        { type: 'text', x: 140, y: 420, width: 1000, height: 50, zIndex: 3,
          text: '함께 실습해봐요',
          style: { fontSize: 20, align: 'center', color: '#a6adc8', fontFamily: PRETENDARD } },
        { type: 'emoji', x: 900, y: 60, width: 300, height: 300, zIndex: 0,
          text: '💻', style: { opacity: 0.05 } },
      ],
      textOnly: [
        { type: 'text', x: 120, y: 80, width: 1040, height: 140, zIndex: 1,
          text: '실습 목표를 입력하세요\n- 목표 1\n- 목표 2',
          style: { fontSize: 24, align: 'left', fontFamily: PRETENDARD } },
        { type: 'code', x: 140, y: 250, width: 1000, height: 380, zIndex: 2,
          text: 'print("Hello, World!")', codeLang: 'Python', style: { fontSize: 20 } },
      ],
      textImage1: [
        { type: 'code', x: 90, y: 140, width: 620, height: 440, zIndex: 1,
          text: 'def greet(name):\n    print(f"안녕, {name}!")\n\ngreet("학생")', codeLang: 'Python', style: { fontSize: 18 } },
        { type: 'text', x: 740, y: 100, width: 460, height: 32, zIndex: 2,
          text: '실행 결과',
          style: { fontSize: 18, align: 'left', color: '#a6adc8', fontFamily: PRETENDARD } },
        { type: 'image', x: 740, y: 140, width: 460, height: 440, zIndex: 3, style: { frame: 'rounded' } },
      ],
      textImagesMany: [
        { type: 'code', x: 100, y: 90, width: 1080, height: 260, zIndex: 1,
          text: 'const students = ["지민", "서연", "하준"];\nstudents.forEach(name => console.log(name));', codeLang: 'JavaScript', style: { fontSize: 18 } },
        { type: 'image', x: 100, y: 380, width: 520, height: 260, zIndex: 2, style: { frame: 'rounded' } },
        { type: 'image', x: 660, y: 380, width: 520, height: 260, zIndex: 3, style: { frame: 'rounded' } },
      ],
    },
  },
  {
    id: 'step-by-step',
    name: '단계별 실습',
    description: 'STEP 배지로 실습 과정을 한 단계씩 순서대로 안내하는 스타일',
    bg: 'linear-gradient(160deg, #ecfdf5, #d1fae5)',
    textColor: '#065f46',
    accentColor: '#10B981',
    swatch: '#d1fae5',
    layouts: {
      title: [
        { type: 'text', x: 140, y: 240, width: 1000, height: 140, zIndex: 1,
          text: '실습 이름을 입력하세요',
          style: { fontSize: 56, align: 'center', bold: true, fontFamily: PRETENDARD } },
        { type: 'text', x: 140, y: 400, width: 1000, height: 50, zIndex: 2,
          text: '단계별 실습 가이드',
          style: { fontSize: 22, align: 'center', color: '#047857', fontFamily: PRETENDARD } },
        { type: 'emoji', x: 900, y: 440, width: 260, height: 260, zIndex: 0,
          text: '🪜', style: { opacity: 0.07 } },
      ],
      textOnly: [
        { type: 'text', x: 100, y: 90, width: 170, height: 52, zIndex: 1,
          text: 'STEP 1',
          style: { fontSize: 22, align: 'center', bold: true, color: '#fff', background: '#10B981', borderRadius: 26, fontFamily: PRETENDARD } },
        { type: 'text', x: 100, y: 170, width: 1080, height: 430, zIndex: 2,
          text: '이 단계에서 할 일을 설명하세요\n\n1. 세부 내용 1\n2. 세부 내용 2',
          style: { fontSize: 30, align: 'left', fontFamily: PRETENDARD } },
        { type: 'emoji', x: 900, y: 380, width: 280, height: 280, zIndex: 0,
          text: '🪜', style: { opacity: 0.07 } },
      ],
      textImage1: [
        { type: 'text', x: 100, y: 90, width: 170, height: 52, zIndex: 1,
          text: 'STEP 1',
          style: { fontSize: 22, align: 'center', bold: true, color: '#fff', background: '#10B981', borderRadius: 26, fontFamily: PRETENDARD } },
        { type: 'text', x: 100, y: 170, width: 520, height: 430, zIndex: 2,
          text: '이 단계에서 할 일을 설명하세요\n\n1. 세부 내용 1\n2. 세부 내용 2',
          style: { fontSize: 26, align: 'left', fontFamily: PRETENDARD } },
        { type: 'image', x: 660, y: 170, width: 520, height: 430, zIndex: 3, style: { frame: 'rounded' } },
      ],
      textImagesMany: [
        { type: 'text', x: 100, y: 90, width: 170, height: 52, zIndex: 1,
          text: 'STEP 1',
          style: { fontSize: 22, align: 'center', bold: true, color: '#fff', background: '#10B981', borderRadius: 26, fontFamily: PRETENDARD } },
        { type: 'text', x: 100, y: 170, width: 1080, height: 100, zIndex: 2,
          text: '이 단계에서 할 일을 설명하세요',
          style: { fontSize: 24, align: 'left', fontFamily: PRETENDARD } },
        { type: 'text', x: 100, y: 290, width: 500, height: 30, zIndex: 3,
          text: 'Before',
          style: { fontSize: 16, align: 'left', bold: true, color: '#047857', fontFamily: PRETENDARD } },
        { type: 'text', x: 680, y: 290, width: 500, height: 30, zIndex: 4,
          text: 'After',
          style: { fontSize: 16, align: 'left', bold: true, color: '#047857', fontFamily: PRETENDARD } },
        { type: 'image', x: 100, y: 330, width: 500, height: 280, zIndex: 5, style: { frame: 'rounded' } },
        { type: 'image', x: 680, y: 330, width: 500, height: 280, zIndex: 6, style: { frame: 'rounded' } },
      ],
    },
  },
];

// ── 테마(색상) × 템플릿(레이아웃 구조) 축 분리 ─────────────────────────────
// Marp로 탐색한 4개 색상 테마 × 4개 레이아웃 구조를 별도 축으로 두고,
// 여기서 16개 SlideTemplate을 자동 생성해 BASE_TEMPLATES 뒤에 이어붙인다.
// 레이아웃 구조 함수는 색상 토큰(ThemeColors)만 받아 오브젝트 배열을 만들고,
// 실제 색상 결정은 THEME_COLORS 목록을 순회하며 이루어진다.

interface ThemeColors {
  id: string;
  name: string;
  bg: string;
  ink: string;        // 밝은 배경 위에 쓰는 기본 텍스트색
  accent: string;
  accentSoft: string;  // 카드/배지 배경 등 옅은 강조색
}

const THEME_COLORS: ThemeColors[] = [
  { id: 'indigo', name: '인디고', bg: 'linear-gradient(160deg, #eef2ff 0%, #ffffff 60%)', ink: '#1e1b2e', accent: '#4f46e5', accentSoft: '#eef2ff' },
  { id: 'coral', name: '선셋코랄', bg: 'linear-gradient(160deg, #fff1e6 0%, #ffffff 60%)', ink: '#2b1a12', accent: '#ea580c', accentSoft: '#fff1e6' },
  { id: 'teal', name: '포레스트틸', bg: 'linear-gradient(160deg, #e6f5f3 0%, #ffffff 60%)', ink: '#0a2e2b', accent: '#0f766e', accentSoft: '#e6f5f3' },
  { id: 'midnight', name: '미드나잇', bg: 'linear-gradient(160deg, #1c1b2e 0%, #0f0e1a 60%)', ink: '#f4f2ff', accent: '#a78bfa', accentSoft: 'rgba(167,139,250,0.16)' },
];

type ThemedLayouts = Record<SlideLayoutKind, Omit<SlideObject, 'id'>[]>;

// 카드 그리드형 — 개조식 내용을 카드형 박스로 나눠 보여준다
function cardsLayouts(t: ThemeColors): ThemedLayouts {
  return {
    title: [
      { type: 'text', x: 600, y: 220, width: 80, height: 6, zIndex: 1,
        text: '', decorative: true, style: { background: t.accent } },
      { type: 'text', x: 140, y: 250, width: 1000, height: 130, zIndex: 2,
        text: '슬라이드 제목을 입력하세요',
        style: { fontSize: 52, align: 'center', bold: true, color: t.ink, fontFamily: PRETENDARD } },
      { type: 'text', x: 140, y: 400, width: 1000, height: 50, zIndex: 3,
        text: '부제목을 입력하세요',
        style: { fontSize: 20, align: 'center', color: t.accent, fontFamily: PRETENDARD } },
    ],
    textOnly: [
      { type: 'text', x: 100, y: 60, width: 1080, height: 60, zIndex: 1,
        text: '제목을 입력하세요',
        style: { fontSize: 30, align: 'left', bold: true, color: t.ink, fontFamily: PRETENDARD } },
      { type: 'text', x: 100, y: 170, width: 330, height: 430, zIndex: 2,
        text: '카드 1의 내용을 입력하세요',
        style: { fontSize: 20, align: 'left', color: t.ink, background: t.accentSoft, borderRadius: 16, fontFamily: PRETENDARD } },
      { type: 'text', x: 475, y: 170, width: 330, height: 430, zIndex: 3,
        text: '카드 2의 내용을 입력하세요',
        style: { fontSize: 20, align: 'left', color: t.ink, background: t.accentSoft, borderRadius: 16, fontFamily: PRETENDARD } },
      { type: 'text', x: 850, y: 170, width: 330, height: 430, zIndex: 4,
        text: '카드 3의 내용을 입력하세요',
        style: { fontSize: 20, align: 'left', color: t.ink, background: t.accentSoft, borderRadius: 16, fontFamily: PRETENDARD } },
    ],
    textImage1: [
      { type: 'text', x: 100, y: 60, width: 1080, height: 50, zIndex: 1,
        text: '제목을 입력하세요',
        style: { fontSize: 28, align: 'left', bold: true, color: t.ink, fontFamily: PRETENDARD } },
      { type: 'text', x: 100, y: 150, width: 520, height: 460, zIndex: 2,
        text: '카드 설명을 입력하세요',
        style: { fontSize: 22, align: 'left', color: t.ink, background: t.accentSoft, borderRadius: 16, fontFamily: PRETENDARD } },
      { type: 'image', x: 660, y: 150, width: 520, height: 460, zIndex: 3, style: { frame: 'rounded' } },
    ],
    textImagesMany: [
      { type: 'text', x: 100, y: 50, width: 1080, height: 50, zIndex: 1,
        text: '제목을 입력하세요',
        style: { fontSize: 26, align: 'left', bold: true, color: t.ink, fontFamily: PRETENDARD } },
      { type: 'image', x: 100, y: 140, width: 330, height: 330, zIndex: 2, style: { frame: 'rounded' } },
      { type: 'image', x: 475, y: 140, width: 330, height: 330, zIndex: 3, style: { frame: 'rounded' } },
      { type: 'image', x: 850, y: 140, width: 330, height: 330, zIndex: 4, style: { frame: 'rounded' } },
      { type: 'text', x: 100, y: 500, width: 1080, height: 100, zIndex: 5,
        text: '각 카드에 대한 설명을 입력하세요',
        style: { fontSize: 20, align: 'center', color: t.ink, fontFamily: PRETENDARD } },
    ],
  };
}

// 타임라인·스텝형 — 번호 원 + 세로선으로 순서를 안내한다
function timelineLayouts(t: ThemeColors): ThemedLayouts {
  const circle = (n: string) => ({
    type: 'text' as const,
    text: n,
    style: { fontSize: 20, align: 'center' as const, bold: true, color: '#ffffff', background: t.accent, borderRadius: 24, fontFamily: PRETENDARD },
  });
  return {
    title: [
      { type: 'text', x: 140, y: 250, width: 1000, height: 130, zIndex: 1,
        text: '실습/활동 이름을 입력하세요',
        style: { fontSize: 52, align: 'center', bold: true, color: t.ink, fontFamily: PRETENDARD } },
      { type: 'text', x: 140, y: 400, width: 1000, height: 50, zIndex: 2,
        text: '단계별로 함께 진행해요',
        style: { fontSize: 20, align: 'center', color: t.accent, fontFamily: PRETENDARD } },
      { type: 'emoji', x: 900, y: 440, width: 240, height: 240, zIndex: 0,
        text: '🧭', style: { opacity: 0.08 } },
    ],
    textOnly: [
      { type: 'text', x: 122, y: 90, width: 4, height: 500, zIndex: 0,
        text: '', decorative: true, style: { background: t.accentSoft } },
      { x: 100, y: 90, width: 48, height: 48, zIndex: 1, ...circle('1') },
      { type: 'text', x: 170, y: 92, width: 1010, height: 100, zIndex: 2,
        text: '1단계에서 할 일을 입력하세요',
        style: { fontSize: 24, align: 'left', color: t.ink, fontFamily: PRETENDARD } },
      { x: 100, y: 260, width: 48, height: 48, zIndex: 1, ...circle('2') },
      { type: 'text', x: 170, y: 262, width: 1010, height: 100, zIndex: 2,
        text: '2단계에서 할 일을 입력하세요',
        style: { fontSize: 24, align: 'left', color: t.ink, fontFamily: PRETENDARD } },
      { x: 100, y: 430, width: 48, height: 48, zIndex: 1, ...circle('3') },
      { type: 'text', x: 170, y: 432, width: 1010, height: 100, zIndex: 2,
        text: '3단계에서 할 일을 입력하세요',
        style: { fontSize: 24, align: 'left', color: t.ink, fontFamily: PRETENDARD } },
    ],
    textImage1: [
      { x: 100, y: 150, width: 48, height: 48, zIndex: 1, ...circle('1') },
      { type: 'text', x: 170, y: 152, width: 430, height: 170, zIndex: 2,
        text: '1단계 내용을 입력하세요',
        style: { fontSize: 22, align: 'left', color: t.ink, fontFamily: PRETENDARD } },
      { x: 100, y: 400, width: 48, height: 48, zIndex: 1, ...circle('2') },
      { type: 'text', x: 170, y: 402, width: 430, height: 170, zIndex: 2,
        text: '2단계 내용을 입력하세요',
        style: { fontSize: 22, align: 'left', color: t.ink, fontFamily: PRETENDARD } },
      { type: 'image', x: 660, y: 150, width: 520, height: 420, zIndex: 3, style: { frame: 'rounded' } },
    ],
    textImagesMany: [
      { x: 100, y: 70, width: 48, height: 48, zIndex: 1, ...circle('1') },
      { type: 'text', x: 170, y: 72, width: 1010, height: 60, zIndex: 2,
        text: '1단계 내용을 입력하세요',
        style: { fontSize: 20, align: 'left', color: t.ink, fontFamily: PRETENDARD } },
      { x: 100, y: 170, width: 48, height: 48, zIndex: 1, ...circle('2') },
      { type: 'text', x: 170, y: 172, width: 1010, height: 60, zIndex: 2,
        text: '2단계 내용을 입력하세요',
        style: { fontSize: 20, align: 'left', color: t.ink, fontFamily: PRETENDARD } },
      { type: 'image', x: 100, y: 270, width: 520, height: 340, zIndex: 3, style: { frame: 'rounded' } },
      { type: 'image', x: 660, y: 270, width: 520, height: 340, zIndex: 4, style: { frame: 'rounded' } },
    ],
  };
}

// 듀오톤 와이드형 — 화면을 반으로 나눠 텍스트와 이미지를 대비시킨다
function duotoneLayouts(t: ThemeColors): ThemedLayouts {
  const panel: Omit<SlideObject, 'id'> = { type: 'text', x: 640, y: 0, width: 640, height: 720, zIndex: 0, text: '', decorative: true, style: { background: t.accent } };
  return {
    title: [
      panel,
      { type: 'emoji', x: 820, y: 260, width: 280, height: 280, zIndex: 1, text: '✨', style: { opacity: 0.9 } },
      { type: 'text', x: 100, y: 120, width: 200, height: 30, zIndex: 2,
        text: 'POINT',
        style: { fontSize: 14, align: 'left', bold: true, color: t.accent, fontFamily: PRETENDARD } },
      { type: 'text', x: 100, y: 170, width: 480, height: 200, zIndex: 3,
        text: '제목을 입력하세요',
        style: { fontSize: 44, align: 'left', bold: true, color: t.ink, fontFamily: PRETENDARD } },
      { type: 'text', x: 100, y: 390, width: 480, height: 100, zIndex: 4,
        text: '부제목을 입력하세요',
        style: { fontSize: 18, align: 'left', color: t.ink, fontFamily: PRETENDARD } },
    ],
    textOnly: [
      panel,
      { type: 'emoji', x: 820, y: 260, width: 280, height: 280, zIndex: 1, text: '✨', style: { opacity: 0.9 } },
      { type: 'text', x: 100, y: 90, width: 480, height: 110, zIndex: 2,
        text: '제목을 입력하세요',
        style: { fontSize: 32, align: 'left', bold: true, color: t.ink, fontFamily: PRETENDARD } },
      { type: 'text', x: 100, y: 220, width: 480, height: 400, zIndex: 3,
        text: '본문 내용을 입력하세요\n- 첫 번째 내용\n- 두 번째 내용',
        style: { fontSize: 20, align: 'left', color: t.ink, fontFamily: PRETENDARD } },
    ],
    textImage1: [
      { type: 'text', x: 100, y: 80, width: 480, height: 140, zIndex: 0,
        text: '제목을 입력하세요',
        style: { fontSize: 34, align: 'left', bold: true, color: t.ink, fontFamily: PRETENDARD } },
      { type: 'text', x: 100, y: 240, width: 480, height: 380, zIndex: 1,
        text: '설명을 입력하세요',
        style: { fontSize: 20, align: 'left', color: t.ink, fontFamily: PRETENDARD } },
      { type: 'image', x: 660, y: 0, width: 620, height: 720, zIndex: 2, style: { frame: 'none' } },
    ],
    textImagesMany: [
      { type: 'text', x: 100, y: 70, width: 480, height: 100, zIndex: 0,
        text: '제목을 입력하세요',
        style: { fontSize: 30, align: 'left', bold: true, color: t.ink, fontFamily: PRETENDARD } },
      { type: 'text', x: 100, y: 190, width: 480, height: 430, zIndex: 1,
        text: '설명을 입력하세요',
        style: { fontSize: 20, align: 'left', color: t.ink, fontFamily: PRETENDARD } },
      { type: 'image', x: 660, y: 0, width: 620, height: 360, zIndex: 2, style: { frame: 'none' } },
      { type: 'image', x: 660, y: 360, width: 620, height: 360, zIndex: 3, style: { frame: 'none' } },
    ],
  };
}

// 빅 커버형 — 이미지를 전체 배경으로 채우고 하단에 그라데이션+제목을 얹는다.
// 이미지가 없는 textOnly는 슬라이드 배경 자체가 accent색이라 컬러 블록형 커버가 된다.
function coverLayouts(): ThemedLayouts {
  const scrim = (y: number, height: number, zIndex: number): Omit<SlideObject, 'id'> => ({
    type: 'text', x: 0, y, width: 1280, height, zIndex, text: '', decorative: true,
    style: { background: 'linear-gradient(0deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 100%)' },
  });
  return {
    title: [
      { type: 'image', x: 0, y: 0, width: 1280, height: 720, zIndex: 1, style: { frame: 'full' } },
      scrim(400, 320, 2),
      { type: 'text', x: 100, y: 460, width: 300, height: 30, zIndex: 3,
        text: 'COVER',
        style: { fontSize: 14, align: 'left', bold: true, color: '#ffffff', fontFamily: PRETENDARD } },
      { type: 'text', x: 100, y: 500, width: 1080, height: 140, zIndex: 4,
        text: '제목을 입력하세요',
        style: { fontSize: 48, align: 'left', bold: true, color: '#ffffff', fontFamily: PRETENDARD } },
    ],
    textOnly: [
      { type: 'text', x: 100, y: 120, width: 300, height: 30, zIndex: 0,
        text: 'COVER',
        style: { fontSize: 14, align: 'left', bold: true, color: '#ffffff', fontFamily: PRETENDARD } },
      { type: 'text', x: 140, y: 260, width: 1000, height: 160, zIndex: 1,
        text: '제목을 입력하세요',
        style: { fontSize: 56, align: 'center', bold: true, color: '#ffffff', fontFamily: PRETENDARD } },
      { type: 'text', x: 140, y: 430, width: 1000, height: 60, zIndex: 2,
        text: '부제목을 입력하세요',
        style: { fontSize: 22, align: 'center', color: 'rgba(255,255,255,0.85)', fontFamily: PRETENDARD } },
    ],
    textImage1: [
      { type: 'image', x: 0, y: 0, width: 1280, height: 720, zIndex: 1, style: { frame: 'full' } },
      scrim(460, 260, 2),
      { type: 'text', x: 100, y: 500, width: 1080, height: 90, zIndex: 3,
        text: '제목을 입력하세요',
        style: { fontSize: 36, align: 'left', bold: true, color: '#ffffff', fontFamily: PRETENDARD } },
      { type: 'text', x: 100, y: 600, width: 1080, height: 60, zIndex: 4,
        text: '설명을 입력하세요',
        style: { fontSize: 18, align: 'left', color: 'rgba(255,255,255,0.85)', fontFamily: PRETENDARD } },
    ],
    textImagesMany: [
      { type: 'image', x: 0, y: 0, width: 640, height: 720, zIndex: 1, style: { frame: 'full' } },
      { type: 'image', x: 640, y: 0, width: 640, height: 720, zIndex: 2, style: { frame: 'full' } },
      scrim(500, 220, 3),
      { type: 'text', x: 100, y: 560, width: 1080, height: 100, zIndex: 4,
        text: '제목을 입력하세요',
        style: { fontSize: 36, align: 'left', bold: true, color: '#ffffff', fontFamily: PRETENDARD } },
    ],
  };
}

interface LayoutStructure {
  key: string;
  name: string;
  description: string;
  bgMode: 'paper' | 'accent';   // 'accent' = 슬라이드 배경 자체를 테마 accent색으로 채움(빅 커버형)
  textColorMode: 'ink' | 'white';
  build: (t: ThemeColors) => ThemedLayouts;
}

const LAYOUT_STRUCTURES: LayoutStructure[] = [
  { key: 'cards', name: '카드 그리드', description: '개조식 내용을 카드형 박스로 나눠 보여주는 스타일', bgMode: 'paper', textColorMode: 'ink', build: cardsLayouts },
  { key: 'timeline', name: '타임라인·스텝', description: '번호 원과 세로선으로 순서·단계를 안내하는 스타일', bgMode: 'paper', textColorMode: 'ink', build: timelineLayouts },
  { key: 'duotone', name: '듀오톤 와이드', description: '화면을 반으로 나눠 텍스트와 이미지를 선명하게 대비시키는 스타일', bgMode: 'paper', textColorMode: 'ink', build: duotoneLayouts },
  { key: 'cover', name: '빅 커버', description: '이미지를 전체 배경으로 채우고 하단에 제목을 얹는 임팩트 있는 스타일', bgMode: 'accent', textColorMode: 'white', build: coverLayouts },
];

const THEMED_TEMPLATES: SlideTemplate[] = LAYOUT_STRUCTURES.flatMap(layout =>
  THEME_COLORS.map((theme): SlideTemplate => ({
    id: `${layout.key}-${theme.id}`,
    name: `${layout.name} · ${theme.name}`,
    description: layout.description,
    bg: layout.bgMode === 'accent' ? theme.accent : theme.bg,
    textColor: layout.textColorMode === 'white' ? '#ffffff' : theme.ink,
    accentColor: theme.accent,
    swatch: theme.accent,
    layoutGroup: layout.key,
    themeName: theme.name,
    layouts: layout.build(theme),
  }))
);

const THEMED_FILL_SLOTS: Record<string, Record<SlideLayoutKind, FillSlot[]>> = {
  cards: {
    title: [
      { objectIndex: 1, role: '헤드라인 문장', maxChars: 30 },
      { objectIndex: 2, role: '부제목', maxChars: 50 },
    ],
    textOnly: [
      { objectIndex: 0, role: '제목', maxChars: 30 },
      { objectIndex: 1, role: '카드 1 내용', maxChars: 80 },
      { objectIndex: 2, role: '카드 2 내용', maxChars: 80 },
      { objectIndex: 3, role: '카드 3 내용', maxChars: 80 },
    ],
    textImage1: [
      { objectIndex: 0, role: '제목', maxChars: 30 },
      { objectIndex: 1, role: '카드 설명', maxChars: 100 },
    ],
    textImagesMany: [
      { objectIndex: 0, role: '제목', maxChars: 30 },
      { objectIndex: 4, role: '카드들에 대한 설명', maxChars: 80 },
    ],
  },
  timeline: {
    title: [
      { objectIndex: 0, role: '실습/활동 이름', maxChars: 30 },
      { objectIndex: 1, role: '부제목', maxChars: 40 },
    ],
    textOnly: [
      { objectIndex: 2, role: '1단계 설명', maxChars: 60 },
      { objectIndex: 4, role: '2단계 설명', maxChars: 60 },
      { objectIndex: 6, role: '3단계 설명', maxChars: 60 },
    ],
    textImage1: [
      { objectIndex: 1, role: '1단계 설명', maxChars: 70 },
      { objectIndex: 3, role: '2단계 설명', maxChars: 70 },
    ],
    textImagesMany: [
      { objectIndex: 1, role: '1단계 설명', maxChars: 60 },
      { objectIndex: 3, role: '2단계 설명', maxChars: 60 },
    ],
  },
  duotone: {
    title: [
      { objectIndex: 3, role: '제목', maxChars: 30 },
      { objectIndex: 4, role: '부제목', maxChars: 50 },
    ],
    textOnly: [
      { objectIndex: 2, role: '제목', maxChars: 30 },
      { objectIndex: 3, role: '본문(줄바꿈으로 여러 줄 가능)', maxChars: 150 },
    ],
    textImage1: [
      { objectIndex: 0, role: '제목', maxChars: 30 },
      { objectIndex: 1, role: '설명', maxChars: 120 },
    ],
    textImagesMany: [
      { objectIndex: 0, role: '제목', maxChars: 30 },
      { objectIndex: 1, role: '설명', maxChars: 120 },
    ],
  },
  cover: {
    title: [{ objectIndex: 3, role: '제목', maxChars: 30 }],
    textOnly: [
      { objectIndex: 1, role: '제목', maxChars: 30 },
      { objectIndex: 2, role: '부제목', maxChars: 50 },
    ],
    textImage1: [
      { objectIndex: 2, role: '제목', maxChars: 30 },
      { objectIndex: 3, role: '설명', maxChars: 60 },
    ],
    textImagesMany: [{ objectIndex: 3, role: '제목', maxChars: 30 }],
  },
};

export const SLIDE_TEMPLATES: SlideTemplate[] = [...BASE_TEMPLATES, ...THEMED_TEMPLATES];

export const getTemplate = (id: string): SlideTemplate =>
  SLIDE_TEMPLATES.find(t => t.id === id) ?? SLIDE_TEMPLATES[0];

// 템플릿 갤러리 UI(웹 갤러리 화면 + AI 코파일럿 채팅 내 픽커)가 공통으로 쓰는 그룹핑.
// layoutGroup 없는 기존 4개는 플랫 카드로, layoutGroup 있는 템플릿은 레이아웃 구조 하나에
// 색상 변형(테마) 여러 개가 묶인 그룹으로 나눈다.
export const getSlideTemplateGroups = () => {
  const flatTemplates = SLIDE_TEMPLATES.filter(t => !t.layoutGroup);
  const groupKeys = Array.from(
    new Set(SLIDE_TEMPLATES.filter(t => t.layoutGroup).map(t => t.layoutGroup!))
  );
  const groups = groupKeys.map(key => ({
    key,
    variants: SLIDE_TEMPLATES.filter(t => t.layoutGroup === key),
  }));
  return { flatTemplates, groups };
};

// 템플릿의 레이아웃 원본(Omit<SlideObject,'id'>[])에 새 id를 부여해 실제 슬라이드로 인스턴스화
export const instantiateSlide = (template: SlideTemplate, kind: SlideLayoutKind): DeckSlide => ({
  id: crypto.randomUUID(),
  bg: template.bg,
  textColor: template.textColor,
  objects: template.layouts[kind].map(o => ({ ...o, id: crypto.randomUUID() })),
});

// 이미 만들어진 덱(직접 제작 or PPT 가져오기)에 템플릿 디자인을 통째로 입힌다.
// 오브젝트의 위치/크기/내용은 그대로 두고, 슬라이드 배경과 모든 텍스트 계열 오브젝트의 색상만
// 선택한 템플릿의 배경/글자/강조색으로 통일한다 — 레이아웃을 다시 만드는 게 아니라 "배색만 교체".
export const applyTemplateToDeck = (deck: SlideDeck, templateId: string): SlideDeck => {
  const template = getTemplate(templateId);
  return {
    ...deck,
    slides: deck.slides.map(slide => ({
      ...slide,
      bg: template.bg,
      textColor: template.textColor,
      bgImage: undefined,
      bgImageOpacity: undefined,
      objects: slide.objects.map(obj => {
        if (obj.type === 'text' || obj.type === 'emoji') {
          if (!obj.style?.color) return obj; // 색 지정 없으면 이미 slide.textColor를 상속하므로 그대로 둠
          return { ...obj, style: { ...obj.style, color: template.textColor } };
        }
        if (obj.type === 'link') {
          return { ...obj, style: { ...obj.style, color: template.accentColor } };
        }
        return obj;
      }),
    })),
  };
};

// ── AI 초안 생성: 레이아웃별 "채울 수 있는" 텍스트 슬롯 ──────────────────────
// layouts[kind] 배열의 텍스트 오브젝트 중 실제 콘텐츠용인 것만 objectIndex로 지정한다.
// 여기 없는 텍스트 오브젝트(장식 바, "KEY POINT"/"STEP 1"/"Before"/"After"/"실행 결과" 같은
// 고정 라벨)는 AI가 건드리지 않고 템플릿 기본값을 그대로 유지한다.
interface FillSlot { objectIndex: number; role: string; maxChars: number }

const BASE_FILL_SLOTS: Record<string, Record<SlideLayoutKind, FillSlot[]>> = {
  'bold-statement': {
    title: [
      { objectIndex: 1, role: '헤드라인 문장', maxChars: 30 },
      { objectIndex: 2, role: '부제목', maxChars: 50 },
    ],
    textOnly: [
      { objectIndex: 2, role: '핵심 문장', maxChars: 40 },
      { objectIndex: 3, role: '핵심 문장에 대한 간단한 설명', maxChars: 90 },
    ],
    textImage1: [{ objectIndex: 0, role: '핵심 문장', maxChars: 40 }],
    textImagesMany: [{ objectIndex: 0, role: '핵심 문장', maxChars: 50 }],
  },
  'image-focus': {
    title: [{ objectIndex: 1, role: '슬라이드 제목', maxChars: 30 }],
    textOnly: [{ objectIndex: 2, role: '본문(제목+설명, 필요하면 줄바꿈 두 번으로 구분)', maxChars: 120 }],
    textImage1: [
      { objectIndex: 0, role: '제목', maxChars: 30 },
      { objectIndex: 2, role: '사진 설명', maxChars: 30 },
    ],
    textImagesMany: [
      { objectIndex: 0, role: '제목', maxChars: 30 },
      { objectIndex: 4, role: '이미지들에 대한 설명', maxChars: 60 },
    ],
  },
  'code-practice': {
    title: [
      { objectIndex: 1, role: '실습 제목', maxChars: 30 },
      { objectIndex: 2, role: '부제목', maxChars: 40 },
    ],
    textOnly: [{ objectIndex: 0, role: '실습 목표(줄바꿈으로 여러 줄 가능)', maxChars: 100 }],
    textImage1: [],
    textImagesMany: [],
  },
  'step-by-step': {
    title: [
      { objectIndex: 0, role: '실습 이름', maxChars: 30 },
      { objectIndex: 1, role: '부제목', maxChars: 40 },
    ],
    textOnly: [{ objectIndex: 1, role: '이 단계 설명(줄바꿈으로 여러 줄 가능)', maxChars: 140 }],
    textImage1: [{ objectIndex: 1, role: '이 단계 설명', maxChars: 120 }],
    textImagesMany: [{ objectIndex: 1, role: '이 단계 설명', maxChars: 80 }],
  },
};

// 새로 추가한 4개 레이아웃(카드/타임라인/듀오톤/커버)은 색상 4종이 전부 같은 오브젝트 구조를
// 공유하므로, 슬롯 정의도 레이아웃당 하나씩만 만들고 테마별 id(cards-indigo 등)에 그대로 복제한다.
const THEMED_FILL_SLOTS_BY_ID: Record<string, Record<SlideLayoutKind, FillSlot[]>> =
  Object.fromEntries(
    LAYOUT_STRUCTURES.flatMap(layout =>
      THEME_COLORS.map(theme => [`${layout.key}-${theme.id}`, THEMED_FILL_SLOTS[layout.key]])
    )
  );

export const LAYOUT_FILL_SLOTS: Record<string, Record<SlideLayoutKind, FillSlot[]>> = {
  ...BASE_FILL_SLOTS,
  ...THEMED_FILL_SLOTS_BY_ID,
};

// 템플릿·레이아웃의 텍스트/이미지/코드 슬롯 스펙 — AI 프롬프트에 그대로 전달
export const getLayoutSlotSpec = (template: SlideTemplate, kind: SlideLayoutKind): SlideLayoutSpec => {
  const objs = template.layouts[kind];
  const fillSlots = LAYOUT_FILL_SLOTS[template.id]?.[kind] ?? [];
  return {
    kind,
    textSlots: fillSlots.map(f => ({ role: f.role, maxChars: f.maxChars })),
    imageSlotCount: objs.filter(o => o.type === 'image').length,
    codeSlotCount: objs.filter(o => o.type === 'code').length,
  };
};

const STEP_BADGE_RE = /^STEP \d+$/;

// AI가 생성한 슬라이드 초안(레이아웃 + texts/images/code 참조)을 실제 DeckSlide[]로 변환
export const buildDraftDeckSlides = (
  template: SlideTemplate,
  aiSlides: AiDraftSlide[],
  imageUrls: string[],
  codeBlocks: { lang: string; code: string }[]
): DeckSlide[] => {
  let stepCounter = 0;
  return aiSlides.map(draft => {
    const kind: SlideLayoutKind = template.layouts[draft.layout] ? draft.layout : 'textOnly';
    const layoutObjs = template.layouts[kind];
    const fillSlots = LAYOUT_FILL_SLOTS[template.id]?.[kind] ?? [];
    if (kind !== 'title') stepCounter += 1;

    let imgCursor = 0;
    let codeCursor = 0;
    const objects: SlideObject[] = layoutObjs.map((o, idx) => {
      const obj: SlideObject = { ...o, id: crypto.randomUUID() };
      const slotPos = fillSlots.findIndex(f => f.objectIndex === idx);

      if (slotPos !== -1) {
        const text = draft.texts?.[slotPos];
        if (text) obj.text = text;
      } else if (obj.type === 'text' && STEP_BADGE_RE.test(obj.text ?? '')) {
        obj.text = `STEP ${stepCounter}`;
      }

      if (obj.type === 'image') {
        const ref = draft.images?.[imgCursor];
        imgCursor += 1;
        if (ref !== undefined && imageUrls[ref]) obj.src = imageUrls[ref];
      }

      if (obj.type === 'code') {
        const ref = draft.code?.[codeCursor];
        codeCursor += 1;
        if (ref !== undefined && codeBlocks[ref]) {
          obj.text = codeBlocks[ref].code;
          if (codeBlocks[ref].lang) obj.codeLang = codeBlocks[ref].lang;
        }
      }

      return obj;
    });

    return { id: crypto.randomUUID(), bg: template.bg, textColor: template.textColor, objects };
  });
};
