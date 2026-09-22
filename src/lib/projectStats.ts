import { supabase } from './supabase';

// ── 서버 집계 함수(get_project_teacher_stats / get_project_summary_stats) 응답 형태 ──
// 관리자가 아니면 서버가 빈 결과를 돌려주므로, 빈 배열은 "권한 없음"과 "데이터 없음"을 구분하지 않는다.

export interface TeacherStatRow {
  teacher_id: string;
  class_count: number;
  student_count: number;
  session_days: number;
  last_attendance_date: string | null; // YYYY-MM-DD
  result_count: number;
  last_result_at: string | null; // ISO
}

export interface SchoolStatRow {
  school_id: string;
  school_name: string;
  class_count: number;
  student_count: number;
  present: number;
  absent: number;
  late: number;
  early_leave: number;
  excused: number;
  result_count: number;
  result_student_count: number;
}

export interface WeeklyResultRow {
  week_number: number;
  cnt: number;
}

export interface ProjectSummaryStats {
  schools: SchoolStatRow[];
  weekly: WeeklyResultRow[];
}

export async function fetchProjectTeacherStats(projectId: string): Promise<TeacherStatRow[]> {
  const { data, error } = await supabase.rpc('get_project_teacher_stats', { p_project_id: projectId });
  if (error) throw error;
  return (data ?? []) as TeacherStatRow[];
}

export async function fetchProjectSummaryStats(projectId: string): Promise<ProjectSummaryStats> {
  const { data, error } = await supabase.rpc('get_project_summary_stats', { p_project_id: projectId });
  if (error) throw error;
  const d = (data ?? {}) as Partial<ProjectSummaryStats>;
  return { schools: d.schools ?? [], weekly: d.weekly ?? [] };
}

// ── 출석률 ──
// (출석+지각+조퇴) ÷ (전체 − 공결). 분모가 0이면 null(기록 없음).
// 공결은 분모에서 뺀다. 기관이 기준을 바꿔 다시 계산할 수 있도록 건수는 화면에 그대로 보여준다.

export interface AttendanceCounts {
  present: number;
  absent: number;
  late: number;
  early_leave: number;
  excused: number;
}

export function sumAttendance(rows: AttendanceCounts[]): AttendanceCounts {
  return rows.reduce<AttendanceCounts>(
    (acc, r) => ({
      present: acc.present + r.present,
      absent: acc.absent + r.absent,
      late: acc.late + r.late,
      early_leave: acc.early_leave + r.early_leave,
      excused: acc.excused + r.excused,
    }),
    { present: 0, absent: 0, late: 0, early_leave: 0, excused: 0 },
  );
}

export function attendanceRate(c: AttendanceCounts): number | null {
  const denom = c.present + c.absent + c.late + c.early_leave;
  if (denom === 0) return null;
  return ((c.present + c.late + c.early_leave) / denom) * 100;
}

/** 표시용 퍼센트 문자열. 기록이 없으면 '-' */
export function formatRate(rate: number | null): string {
  return rate === null ? '-' : `${rate.toFixed(1)}%`;
}

// ── 강사 상태 배지 ──
// 최근 14일 안에 출결 또는 결과물 활동이 있으면 정상, 없으면 주의, 한 번도 없으면 미시작.

export const ACTIVE_WINDOW_DAYS = 14;

export type TeacherStatus = 'ok' | 'warn' | 'idle';

export const TEACHER_STATUS_LABEL: Record<TeacherStatus, string> = {
  ok: '정상',
  warn: '주의',
  idle: '미시작',
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' 또는 ISO 문자열을 ms로. 날짜만 있으면 한국 시간 자정 기준으로 본다. */
function toMs(v: string): number {
  return v.length <= 10 ? new Date(`${v}T00:00:00+09:00`).getTime() : new Date(v).getTime();
}

export function lastActivityMs(row: Pick<TeacherStatRow, 'last_attendance_date' | 'last_result_at'>): number | null {
  const times = [row.last_attendance_date, row.last_result_at]
    .filter((v): v is string => !!v)
    .map(toMs)
    .filter(n => !Number.isNaN(n));
  return times.length ? Math.max(...times) : null;
}

export function teacherStatus(
  row: Pick<TeacherStatRow, 'last_attendance_date' | 'last_result_at'>,
  now: number = Date.now(),
): TeacherStatus {
  const last = lastActivityMs(row);
  if (last === null) return 'idle';
  // 출결은 날짜만 기록되므로 "오늘 자정(한국 시간)"을 기준으로 날짜 단위로 비교한다.
  const KST_MS = 9 * 60 * 60 * 1000;
  const todayStart = Math.floor((now + KST_MS) / DAY_MS) * DAY_MS - KST_MS;
  return todayStart - last <= ACTIVE_WINDOW_DAYS * DAY_MS ? 'ok' : 'warn';
}
