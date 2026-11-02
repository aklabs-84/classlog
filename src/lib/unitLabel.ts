// 수업 단위 이름: 길게 이어지는 수업은 '주차', 하루(당일) 수업은 '차시'.
// DB의 week_number 숫자는 그대로 두고 화면에 보이는 낱말만 바꾼다.
export type UnitLabel = '주차' | '차시';

export const toUnitLabel = (v: unknown): UnitLabel => (v === '차시' ? '차시' : '주차');

/** "3주차" / "3차시" */
export const unitText = (n: number | string, unit?: unknown): string => `${n}${toUnitLabel(unit)}`;

/** 수업 일정이 하루뿐인가? (시작일=종료일 또는 지정 날짜가 1개) */
export const isSingleDaySchedule = (s: {
  schedule_mode?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  class_specific_dates?: string[] | null;
}): boolean => {
  if (s.schedule_mode === 'dates') {
    const dates = (s.class_specific_dates || []).filter(Boolean);
    return dates.length === 1;
  }
  return !!s.start_date && !!s.end_date && s.start_date === s.end_date;
};

/** 일정에 맞는 추천 단위 */
export const recommendUnit = (s: Parameters<typeof isSingleDaySchedule>[0]): UnitLabel =>
  isSingleDaySchedule(s) ? '차시' : '주차';
