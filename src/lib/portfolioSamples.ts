import { emptyResume, type ResumeData } from './portfolioResume';

/** 강사 포트폴리오 "샘플 보기"용 예시 (모두 가상의 인물·기관, 저장되지 않음) */
/** 샘플 페이지 → 포트폴리오 관리 화면으로 샘플 id를 넘기는 임시 저장 키 */
export const SAMPLE_START_KEY = 'portfolio-sample-start';

export interface PortfolioSample {
  id: string;
  label: string;
  desc: string;
  name: string;
  intro: string;
  resume: ResumeData;
}

const outside: ResumeData = {
  ...emptyResume(),
  name: '김하늘',
  title: 'AI & SW EDUCATION INSTRUCTOR',
  lead: '어려운 AI를 오늘 수업에서 바로 써 보는 도구로 바꿔 드립니다.\n직접 만들어 보는 경험으로 배움이 오래 남는 수업을 합니다.',
  tags: ['AI 활용 교육', '바이브코딩', '교원 연수', '진로 특강'],
  org: '예시교육연구소 대표',
  showContact: false,
  showClassHistory: false,
  experience: [
    { title: '초·중·고 AI·SW 교육', org: '예시초 · 예시중 · 예시고', period: '2022 ~ 현재', items: [
      '예시초: 5~6학년 생성형 AI 활용 프로젝트 수업 (연 24차시)',
      '예시중: 코딩과 AI를 묶은 자유학기 진로 체험 운영',
      '예시고: 동아리 대상 앱 만들기 · 발표 지도'] },
    { title: '교원 직무연수 · 특강', org: '예시교육지원청 · 예시교원연수원', period: '2023 ~ 현재', items: [
      '교원 연수: 수업에 바로 쓰는 생성형 AI 도구 활용 (연 10회)',
      '학부모 특강: 우리 아이 AI 시대 학습 도우미 되기'] },
    { title: '기업·기관 교육', org: '예시기업 · 예시도서관', period: '', items: [
      '예시기업: 업무 자동화 입문 과정 설계 · 강의',
      '예시도서관: 지역 주민 대상 AI 글쓰기 · 이미지 만들기 교실'] },
  ],
  projects: [
    { title: '예시 수업 자료 허브', period: '2024', desc: '차시별 슬라이드·활동지를 한곳에 모은 수업 자료 사이트 제작' },
    { title: '예시 학교 진로 프로젝트', period: '2023', desc: '학생이 직접 만든 앱 12개를 모아 전시한 발표회 운영' },
  ],
  skills: [{ title: '역량', items: ['생성형 AI 수업 설계', '앱·웹 프로토타이핑', '교원 연수 기획·진행', '학습 자료 제작'] }],
  tools: ['ChatGPT / Claude / Gemini', 'Google NotebookLM', 'Python / Streamlit', 'Notion · Canva'],
  education: [{ school: '예시대학교', detail: '컴퓨터교육 석사', period: '2018.03 – 2020.02' }],
  awards: [{ title: '교육 콘텐츠 공모전 우수상', detail: '2023 · 예시 교육재단' }],
  publications: ['《쉽게 시작하는 AI 수업》 공저'],
  strengths: ['현장 중심 실습형 수업', '교사 눈높이 연수 설계', '결과물이 남는 프로젝트 수업'],
};

const teacher: ResumeData = {
  ...emptyResume(),
  design: 'editorial',
  name: '이도윤',
  title: 'ELEMENTARY TEACHER / AFTER-SCHOOL INSTRUCTOR',
  lead: '아이들이 직접 만지고 기록하며 배우는 수업을 합니다.\n종이로 생각을 펼치고, 디지털로 정리하는 수업을 지향합니다.',
  tags: ['초등 교사', '방과후 강사', '융합 수업', '학급 경영'],
  org: '예시초등학교 교사',
  showContact: false,
  showClassHistory: false,
  experience: [
    { title: '학교 교육과정 운영', org: '예시초등학교', period: '2016 ~ 현재', items: [
      '학년 담임 8년: 학급 자치 · 독서 · 프로젝트 수업 운영',
      '정보 교육 담당: 학교 SW·AI 교육 계획 수립 및 교사 연수',
      '학교 행사: 학예회 · 과학의 날 기획 및 운영'] },
    { title: '방과후 · 돌봄 프로그램', org: '예시초 방과후학교', period: '2020 ~ 현재', items: [
      '로봇 코딩반: 학기당 20명 운영, 대회 참가 지도',
      '독서 토론반: 책 읽고 말하기 · 글쓰기 수업'] },
    { title: '연수 · 수업 나눔', org: '예시교육지원청 · 예시 교사 모임', period: '', items: [
      '수업 사례 발표: 아날로그와 디지털을 섞은 모둠 수업',
      '교내 동료 연수: 학급 운영에 쓰는 도구 소개'] },
  ],
  projects: [
    { title: '우리 반 프로젝트 전시회', period: '2024', desc: '학생 작품과 활동 기록을 모아 학부모 초청 전시 진행' },
    { title: '학교 정보 교육 계획', period: '2023', desc: '전 학년 연간 SW·AI 교육 시수와 단원 구성 설계' },
  ],
  skills: [{ title: '역량', items: ['초등 교육과정 재구성', '모둠 활동 · 토의 수업', '학급 경영 · 상담', 'SW·AI 교육 지도'] }],
  tools: ['학급 운영 앱', 'Canva · 슬라이드', '엔트리 · 스크래치', '로봇 키트'],
  education: [{ school: '예시교육대학교', detail: '초등교육 학사', period: '2010.03 – 2014.02' }],
  awards: [{ title: '우수 수업 사례 공모 우수상', detail: '2022 · 예시교육청' }],
  publications: [],
  strengths: ['아이 눈높이 설명', '꼼꼼한 학급 기록', '동료와 나누는 수업 자료'],
};

export const PORTFOLIO_SAMPLES: PortfolioSample[] = [
  { id: 'outside-instructor', label: '문서형 (왼쪽 칸) · 외부 강사', desc: '푸른색 문서 느낌, 한눈에 정리되는 모양', name: '김하늘', intro: '', resume: outside },
  { id: 'school-teacher', label: '잡지형 (큰 제목) · 학교 교사', desc: '따뜻한 종이색과 명조체, 읽는 맛이 있는 모양', name: '이도윤', intro: '', resume: teacher },
];
