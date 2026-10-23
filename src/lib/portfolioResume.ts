/** 강사 포트폴리오 이력서 데이터 (teacher_portfolios.resume jsonb) */
export interface ResumeExperienceGroup {
  title: string;      // 예: 강의 경력
  org: string;        // 기관 줄 (파란색)
  period: string;     // 예: 2023 ~ 현재
  items: string[];
}
export interface ResumeProject { title: string; period: string; desc: string; }
export interface ResumeSkillGroup { title: string; items: string[]; }
export interface ResumeEducation { school: string; detail: string; period: string; }
export interface ResumeAward { title: string; detail: string; }

export interface ResumeData {
  name: string;           // 표시 이름 (비우면 프로필 이름)
  title: string;          // 직함
  lead: string;           // 한 줄 소개
  tags: string[];
  org: string;            // 소속
  phone: string;
  email: string;
  showContact: boolean;   // false면 서버(RPC)가 phone/email을 응답에서 제거
  showClassHistory: boolean;
  design: 'sidebar' | 'editorial'; // 이력서 모양 (기본 sidebar)
  experience: ResumeExperienceGroup[];
  projects: ResumeProject[];
  skills: ResumeSkillGroup[];
  tools: string[];
  education: ResumeEducation[];
  awards: ResumeAward[];
  publications: string[];
  strengths: string[];
}

export const emptyResume = (): ResumeData => ({
  name: '', title: '', lead: '', tags: [], org: '', phone: '', email: '',
  showContact: false, showClassHistory: true, design: 'sidebar',
  experience: [], projects: [], skills: [], tools: [],
  education: [], awards: [], publications: [], strengths: [],
});

/** DB에서 읽은 값을 안전하게 기본값과 합친다 (옛 데이터·빈 {} 대응) */
export const normalizeResume = (raw: unknown): ResumeData => {
  const base = emptyResume();
  if (!raw || typeof raw !== 'object') return base;
  return { ...base, ...(raw as Partial<ResumeData>) };
};

export const hasResumeContent = (r: ResumeData): boolean =>
  !!(r.title || r.lead || r.tags.length || r.experience.length || r.projects.length ||
     r.skills.length || r.tools.length || r.education.length || r.awards.length ||
     r.publications.length || r.strengths.length);
