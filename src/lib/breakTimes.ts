export type BreakGenSettings = {
  periodMinutes: number;
  breakMinutes: number;
  lunchEnabled: boolean;
  lunchAfterPeriod: number;
  lunchMinutes: number;
};

export const DEFAULT_BREAK_GEN: BreakGenSettings = {
  periodMinutes: 0,
  breakMinutes: 10,
  lunchEnabled: false,
  lunchAfterPeriod: 3,
  lunchMinutes: 50,
};

// 참고용 기본값이며 학교마다 다르므로 생성 전 자유롭게 수정 가능
export const SCHOOL_LEVEL_PRESETS = [
  { label: '초등학교', periodMinutes: 40, breakMinutes: 10 },
  { label: '중학교', periodMinutes: 45, breakMinutes: 10 },
  { label: '고등학교', periodMinutes: 50, breakMinutes: 10 },
];

// 시작~종료 시각 사이를 (수업시간+쉬는시간) 단위로 나눠 쉬는시간 시작 시각 목록을 생성
export const generateBreakTimes = (startTime: string, endTime: string, gen: BreakGenSettings): string[] => {
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

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const toHm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// 시작 시각 + 교시 수로 종료 시각과 쉬는시간 시작 시각을 한 번에 계산 (예: 09:00, 45분, 쉬는 10분, 3교시 → 종료 11:15)
export const buildDaySchedule = (startTime: string, periods: number, periodMinutes: number, breakMinutes: number) => {
  if (!startTime || periods < 1 || periodMinutes < 1) return null;
  let cur = toMin(startTime);
  const breaks: string[] = [];
  for (let i = 1; i <= periods; i++) {
    cur += periodMinutes;
    if (i < periods) { breaks.push(toHm(cur)); cur += breakMinutes; }
  }
  return { end: toHm(cur), breaks };
};
