// 슬라이드 도구 — 캔버스는 항상 1280x720(16:9) 디자인 좌표 기준.
// 화면 크기에 따라 SlideStage가 이 좌표 전체를 transform: scale()로 축소/확대해서 보여준다.
// 1280x720 = 96dpi 기준 13.333 x 7.5in — PPTX 내보내기(파워포인트 와이드스크린 기본값) 시 나누기 96만 하면 그대로 인치 변환됨.
export const DECK_CANVAS_W = 1280;
export const DECK_CANVAS_H = 720;

export type SlideObjectType = 'text' | 'image' | 'link' | 'emoji' | 'code' | 'youtube';

export type ImageFrame = 'none' | 'rounded' | 'circle' | 'polaroid' | 'full';

export interface SlideObjectStyle {
  fontSize?: number;              // px
  color?: string;                 // hex — 없으면 템플릿 기본 텍스트색 상속
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  background?: string;            // 텍스트 블록 카드형 배경(hex/rgba)
  borderRadius?: number;
  fontFamily?: string;            // 템플릿별 타이포그래피 차별화
  frame?: ImageFrame;             // type: 'image' 프레임 스타일
  rotate?: number;                // deg — 콜라주/폴라로이드 연출용 미세 회전
  opacity?: number;               // 0~1, 기본 1 = 불투명. text/image/emoji 오브젝트 투명도
}

export interface SlideObject {
  id: string;
  type: SlideObjectType;
  x: number; y: number; width: number; height: number;  // 1280x720 디자인 좌표계 px
  zIndex: number;
  text?: string;    // type: 'text' | 'link'(라벨) | 'emoji'(글자 자체) | 'code'(코드 내용)
  src?: string; alt?: string;  // type: 'image' | 'youtube'(사용자가 입력한 유튜브 URL 원문)
  href?: string;    // type: 'link'(필수) | 'text'/'image'(선택 — 있으면 발표 모드에서 클릭 시 새 탭으로 열림)
  codeLang?: string;  // type: 'code' — 언어 라벨(예: Python, JavaScript)
  style?: SlideObjectStyle;
  decorative?: boolean;  // true면 템플릿이 깔아둔 배경 장식용 도형(포인트 바/구분선/듀오톤 패널/커버 스크림 등) — 편집 화면에서 선택·드래그·더블클릭 편집 불가
}

// 유튜브 URL(watch/youtu.be/embed/shorts 등 다양한 형태) → videoId 파싱. 매칭 실패 시 null.
export function extractYoutubeVideoId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

export interface DeckSlide {
  id: string;
  bg: string;        // css background(color/gradient)
  textColor: string; // 슬라이드 기본 텍스트색(오브젝트 style.color 없을 때 fallback)
  bgImage?: string;         // 배경 이미지 URL — 오브젝트들보다 아래, slide.bg 위에 렌더링
  bgImageOpacity?: number;  // 0~1, 기본 1 = 원본 밝기. 낮출수록 검정 오버레이가 진해져 이미지가 어두워짐(텍스트 가독성 확보)
  objects: SlideObject[];
}

export interface SlideDeck {
  id: string;
  teacher_id: string;
  class_id: string | null;
  title: string;
  slides: DeckSlide[];
  thumbnail_url: string | null;
  share_enabled: boolean;
  created_at: string;
  updated_at: string;
}

// 교사 개인 저장함 — 슬라이드 1장을 통째로 담아뒀다가 다른 덱을 만들 때 재사용.
export interface SlideSnippet {
  id: string;
  teacher_id: string;
  title: string;
  slide: DeckSlide;
  created_at: string;
}

// 슬라이드 성격별 초기 배치 타입 — 템플릿마다 이 4가지를 정의해두고
// "직접 만들기" 시작 슬라이드나 "AI 가져오기" 자동배치의 기준으로 쓴다.
export type SlideLayoutKind = 'title' | 'textOnly' | 'textImage1' | 'textImagesMany';

export interface SlideTemplate {
  id: string;
  name: string;
  description: string;
  bg: string;
  textColor: string;
  accentColor: string;
  swatch: string;   // 갤러리 카드에 보여줄 대표 색상
  layouts: Record<SlideLayoutKind, Omit<SlideObject, 'id'>[]>;
  // 레이아웃(구조)과 테마(색상)를 분리해서 만든 템플릿끼리 묶는 키.
  // 같은 layoutGroup을 가진 템플릿들은 오브젝트 배치가 동일하고 색상만 다르다 — 갤러리에서 색상 스와치 선택 UI로 보여줄 때 사용.
  layoutGroup?: string;
  themeName?: string;  // 이 템플릿의 색상 테마 이름(갤러리 스와치 라벨용)
}
