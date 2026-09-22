import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import {
  fetchProjectTeacherStats,
  lastActivityMs,
  teacherStatus,
  ACTIVE_WINDOW_DAYS,
  TEACHER_STATUS_LABEL,
  type TeacherStatRow,
  type TeacherStatus,
} from '../../lib/projectStats';

interface Props {
  projectId: string;
  /** 페이지가 이미 불러온 강사 이름표 (teacher_id → 이름) */
  teacherNames: Record<string, string>;
  /** 반 배정이 바뀌면 값을 올려서 다시 조회 */
  refreshKey?: number | string;
}

const STATUS_STYLE: Record<TeacherStatus, string> = {
  ok: 'text-green-700 bg-green-50',
  warn: 'text-orange-600 bg-orange-50',
  idle: 'text-on-surface-variant bg-surface-container-high',
};

function formatLastActivity(row: TeacherStatRow): string {
  const ms = lastActivityMs(row);
  if (ms === null) return '-';
  const d = new Date(ms + 9 * 60 * 60 * 1000); // 한국 시간
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

export default function ProjectTeacherStatus({ projectId, teacherNames, refreshKey = 0 }: Props) {
  const [rows, setRows] = useState<TeacherStatRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    fetchProjectTeacherStats(projectId)
      .then(data => { if (!cancelled) setRows(data); })
      .catch(() => { if (!cancelled) { setRows([]); setFailed(true); } });
    return () => { cancelled = true; };
  }, [projectId, refreshKey]);

  if (rows === null) {
    return <div className="surface-card border border-surface-container-high p-4 text-xs text-on-surface-variant/60">강사 현황을 불러오는 중…</div>;
  }
  if (failed) {
    return <div className="surface-card border border-surface-container-high p-4 text-xs text-red-500">강사 현황을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</div>;
  }
  if (rows.length === 0) return null; // 배정된 강사가 없으면 안내 문구 없이 숨김

  const sorted = [...rows].sort((a, b) => (teacherNames[a.teacher_id] || '').localeCompare(teacherNames[b.teacher_id] || '', 'ko'));

  return (
    <div className="surface-card border border-surface-container-high overflow-hidden">
      <div className="px-4 py-2.5 border-b border-surface-container-high bg-surface-container-low/40 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="text-sm font-bold flex items-center gap-1.5 whitespace-nowrap">
          <Activity size={13} className="text-on-surface-variant/50" />
          강사별 현황
        </span>
        <span className="text-[10px] text-on-surface-variant/60">
          상태는 참고용 · 최근 {ACTIVE_WINDOW_DAYS}일 내 출결·결과물 활동 기준
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-container-high text-left text-xs text-on-surface-variant/70">
              <th className="px-4 py-2.5 font-bold whitespace-nowrap">강사</th>
              <th className="px-4 py-2.5 font-bold text-right whitespace-nowrap">담당 반</th>
              <th className="px-4 py-2.5 font-bold text-right whitespace-nowrap">참가자</th>
              <th className="px-4 py-2.5 font-bold text-right whitespace-nowrap">진행 회차</th>
              <th className="px-4 py-2.5 font-bold text-right whitespace-nowrap">결과물</th>
              <th className="px-4 py-2.5 font-bold text-right whitespace-nowrap">마지막 활동</th>
              <th className="px-4 py-2.5 font-bold whitespace-nowrap">상태</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => {
              const status = teacherStatus(r);
              return (
                <tr key={r.teacher_id} className="border-b border-surface-container-high last:border-0">
                  <td className="px-4 py-2.5 font-bold whitespace-nowrap">{teacherNames[r.teacher_id] || '이름 미확인'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.class_count}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.student_count}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.session_days}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.result_count}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">{formatLastActivity(r)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_STYLE[status]}`}>
                      {TEACHER_STATUS_LABEL[status]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
