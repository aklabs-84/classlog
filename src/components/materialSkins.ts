// 수업 자료 보기 모양(스킨) — 자료마다 강사가 고른다. 내용(마크다운)은 그대로이고 겉모습만 바뀐다.
// DB: class_materials.viewer_style (default | mission | storybook | challenge | note)
import './materialSkins.css';

export type ViewerStyle = 'default' | 'mission' | 'storybook' | 'challenge' | 'note';

export interface ViewerStyleInfo {
  id: ViewerStyle;
  label: string;
  desc: string;
  grade: string; // 추천 학년 (student-guide 스킬·AI 생성 프롬프트와 같은 표)
  clearLabel: string; // 단계 완료 버튼 글자
  doneLabel: string;
  unit: string; // 진행 표시 단위
  startLabel: string; // 첫 화면의 시작 버튼 글자(비면 버튼 없음)
}

export const VIEWER_STYLES: ViewerStyleInfo[] = [
  { id: 'default', label: '기본', desc: '지금까지 쓰던 화면 그대로', grade: '전 학년', clearLabel: '', doneLabel: '', unit: '', startLabel: '' },
  { id: 'mission', label: 'A. 게임 미션형', desc: '진행 바·별·미션 클리어 버튼. 게임처럼 한 단계씩', grade: '초등 중·고학년 추천', clearLabel: '미션 클리어!', doneLabel: '클리어 ⭐', unit: '클리어', startLabel: '미션 시작 ▶' },
  { id: 'storybook', label: 'B. 그림책형', desc: '큰 글씨와 넉넉한 여백. 책장을 넘기듯 차분하게', grade: '초등 저·중학년 추천', clearLabel: '이 쪽 다 읽었어요', doneLabel: '잘 읽었어요 🌱', unit: '쪽 읽음', startLabel: '' },
  { id: 'note', label: 'C. 노트형', desc: '담백한 노트형. 학습 목표와 흐름 위주', grade: '고등학생 추천', clearLabel: '이 단계 완료', doneLabel: '완료됨', unit: '완료', startLabel: '' },
  { id: 'challenge', label: 'D. 챌린지형', desc: '굵은 테두리·점수판·CHALLENGE 단계. 활기찬 도전 느낌', grade: '중학생 추천', clearLabel: '✔ 클리어', doneLabel: '클리어 완료', unit: '클리어', startLabel: '도전 시작 ▶' },
];

const IDS = new Set<string>(VIEWER_STYLES.map(s => s.id));

export const normalizeViewerStyle = (v: unknown): ViewerStyle => (typeof v === 'string' && IDS.has(v) ? (v as ViewerStyle) : 'default');

export const viewerStyleInfo = (v: unknown): ViewerStyleInfo => VIEWER_STYLES.find(s => s.id === normalizeViewerStyle(v)) ?? VIEWER_STYLES[0];
