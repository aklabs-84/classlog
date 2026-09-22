import { useEffect, useMemo, useState } from 'react';
import { FileBarChart, Printer, FileSpreadsheet, Loader2 } from 'lucide-react';
import {
  fetchProjectSummaryStats,
  sumAttendance,
  attendanceRate,
  formatRate,
  type ProjectSummaryStats,
  type SchoolStatRow,
} from '../../lib/projectStats';
import { fetchProjectSurveyComparisons, type SurveyPairSummary } from '../../lib/surveyCompare';
import { buildXlsxBlob } from '../../lib/xlsxBuilder';
import type { XCell } from '../../lib/xlsxBuilder';

interface ProgramLite {
  name: string;
  school_name: string | null;
  start_date: string | null;
  end_date: string | null;
}

interface Totals {
  schoolCount: number;
  teacherCount: number;
  studentCount: number;
}

interface Props {
  projectId: string;
  program: ProgramLite | null;
  totals: Totals;
}

function fmtDate(v: string | null): string {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

// 문항 텍스트 → 점수(1~5 등) 평균 표시용
function fmtAvg(v: number | null): string {
  return v === null ? '-' : v.toFixed(1);
}
function fmtPct(v: number | null): string {
  return v === null ? '-' : `${v}%`;
}

export default function ProjectResultSummary({ projectId, program, totals }: Props) {
  const [stats, setStats] = useState<ProjectSummaryStats | null>(null);
  const [surveys, setSurveys] = useState<SurveyPairSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    Promise.all([fetchProjectSummaryStats(projectId), fetchProjectSurveyComparisons(projectId)])
      .then(([s, sv]) => { if (!cancelled) { setStats(s); setSurveys(sv); } })
      .catch(() => { if (!cancelled) { setStats({ schools: [], weekly: [] }); setSurveys([]); setFailed(true); } });
    return () => { cancelled = true; };
  }, [projectId]);

  const schoolRows: SchoolStatRow[] = stats?.schools ?? [];

  const attendanceTotal = useMemo(() => sumAttendance(schoolRows), [schoolRows]);
  const attendanceRateValue = useMemo(() => attendanceRate(attendanceTotal), [attendanceTotal]);

  const resultTotal = useMemo(
    () => schoolRows.reduce((sum, s) => sum + s.result_count, 0),
    [schoolRows],
  );
  const resultStudentTotal = useMemo(
    () => schoolRows.reduce((sum, s) => sum + s.result_student_count, 0),
    [schoolRows],
  );
  const participationRate = totals.studentCount > 0
    ? (resultStudentTotal / totals.studentCount) * 100
    : null;

  const weekly = stats?.weekly ?? [];
  const maxWeeklyCnt = Math.max(1, ...weekly.map(w => w.cnt));

  const handlePrint = () => window.print();

  const handleExcel = async () => {
    setExporting(true);
    try {
      const overviewRows: (XCell | null)[][] = [
        [{ value: '사업 개요', style: 'header', span: 2 }, null],
        [{ value: '사업명' }, { value: program?.name ?? '-' }],
        [{ value: '학교/기관' }, { value: program?.school_name ?? '-' }],
        [{ value: '기간' }, { value: `${fmtDate(program?.start_date ?? null)} ~ ${fmtDate(program?.end_date ?? null)}` }],
        [{ value: '참여 학교 수' }, { value: totals.schoolCount }],
        [{ value: '참여 강사 수' }, { value: totals.teacherCount }],
        [{ value: '참여자 수' }, { value: totals.studentCount }],
        [null, null],
        [{ value: '출석 현황', style: 'header', span: 2 }, null],
        [{ value: '출석' }, { value: attendanceTotal.present }],
        [{ value: '결석' }, { value: attendanceTotal.absent }],
        [{ value: '지각' }, { value: attendanceTotal.late }],
        [{ value: '조퇴' }, { value: attendanceTotal.early_leave }],
        [{ value: '공결(분모 제외)' }, { value: attendanceTotal.excused }],
        [{ value: '출석률' }, { value: formatRate(attendanceRateValue) }],
        [null, null],
        [{ value: '결과물 제출 현황', style: 'header', span: 2 }, null],
        [{ value: '총 제출 건수' }, { value: resultTotal }],
        [{ value: '제출 참여자 수' }, { value: resultStudentTotal }],
        [{ value: '참여율' }, { value: formatRate(participationRate) }],
      ];

      const schoolSheetRows: (XCell | null)[][] = [
        [
          { value: '학교', style: 'header' }, { value: '반', style: 'header' },
          { value: '참가자', style: 'header' }, { value: '출석', style: 'header' },
          { value: '결석', style: 'header' }, { value: '지각', style: 'header' },
          { value: '조퇴', style: 'header' }, { value: '공결', style: 'header' },
          { value: '출석률', style: 'header' }, { value: '결과물', style: 'header' },
        ],
        ...schoolRows.map(s => [
          { value: s.school_name },
          { value: s.class_count },
          { value: s.student_count },
          { value: s.present },
          { value: s.absent },
          { value: s.late },
          { value: s.early_leave },
          { value: s.excused },
          { value: formatRate(attendanceRate(s)) },
          { value: s.result_count },
        ] as (XCell | null)[]),
      ];

      const surveySheetRows: (XCell | null)[][] = [
        [
          { value: '설문 쌍', style: 'header' }, { value: '문항', style: 'header' },
          { value: '유형', style: 'header' }, { value: '사전', style: 'header' }, { value: '사후', style: 'header' },
        ],
        ...(surveys ?? []).flatMap(pair => pair.rows.map(r => [
          { value: `${pair.preForm.title} → ${pair.postForm.title}` },
          { value: r.text },
          { value: r.type === 'yes_no' ? '예/아니오' : '점수' },
          { value: r.type === 'yes_no' ? fmtPct(r.prePct) : fmtAvg(r.preAvg) },
          { value: r.type === 'yes_no' ? fmtPct(r.postPct) : fmtAvg(r.postAvg) },
        ] as (XCell | null)[])),
      ];

      const blob = await buildXlsxBlob([
        { name: '사업 개요', colWidths: [16, 30], rows: overviewRows },
        { name: '학교별 비교', colWidths: [16, 8, 8, 8, 8, 8, 8, 8, 10, 8], rows: schoolSheetRows },
        ...(surveySheetRows.length > 1 ? [{ name: '사전사후 설문', colWidths: [24, 30, 10, 10, 10], rows: surveySheetRows }] : []),
      ]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${program?.name || '사업'}_결과요약.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  if (stats === null) {
    return <div className="surface-card border border-surface-container-high p-4 text-xs text-on-surface-variant/60">결과 요약을 불러오는 중…</div>;
  }
  if (failed) {
    return <div className="surface-card border border-surface-container-high p-4 text-xs text-red-500">결과 요약을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</div>;
  }

  return (
    <div id="project-result-summary-print" className="space-y-4">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #project-result-summary-print, #project-result-summary-print * { visibility: visible; }
          #project-result-summary-print { position: absolute; left: 0; top: 0; width: 100%; padding: 12px; }
          #project-result-summary-print .no-print { display: none !important; }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>

      <div className="flex items-center justify-between gap-2 no-print">
        <span className="text-sm font-bold flex items-center gap-1.5">
          <FileBarChart size={14} className="text-on-surface-variant/50" />
          사업 결과 요약
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleExcel}
            disabled={exporting}
            className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg surface-card border border-surface-container-high hover:bg-surface-container-high disabled:opacity-50"
          >
            {exporting ? <Loader2 size={12} className="animate-spin" /> : <FileSpreadsheet size={12} />}
            엑셀
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg surface-card border border-surface-container-high hover:bg-surface-container-high"
          >
            <Printer size={12} />
            PDF(인쇄)
          </button>
        </div>
      </div>

      {/* 사업 개요 */}
      <div className="surface-card border border-surface-container-high p-4">
        <h3 className="text-sm font-black mb-3">사업 개요</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-[11px] text-on-surface-variant/60">사업명</div>
            <div className="font-bold">{program?.name ?? '-'}</div>
          </div>
          <div>
            <div className="text-[11px] text-on-surface-variant/60">기간</div>
            <div className="font-bold">{fmtDate(program?.start_date ?? null)} ~ {fmtDate(program?.end_date ?? null)}</div>
          </div>
          <div>
            <div className="text-[11px] text-on-surface-variant/60">참여 학교</div>
            <div className="font-bold">{totals.schoolCount}개</div>
          </div>
          <div>
            <div className="text-[11px] text-on-surface-variant/60">참여자</div>
            <div className="font-bold">강사 {totals.teacherCount}명 · 학생 {totals.studentCount}명</div>
          </div>
        </div>
      </div>

      {/* 출석 현황 */}
      <div className="surface-card border border-surface-container-high p-4">
        <h3 className="text-sm font-black mb-1">출석 현황</h3>
        <p className="text-[11px] text-on-surface-variant/60 mb-3">출석률 = (출석+지각+조퇴) ÷ (출석+결석+지각+조퇴) · 공결은 분모에서 제외</p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-sm">
          <div><div className="text-[11px] text-on-surface-variant/60">출석</div><div className="font-bold tabular-nums">{attendanceTotal.present}</div></div>
          <div><div className="text-[11px] text-on-surface-variant/60">결석</div><div className="font-bold tabular-nums">{attendanceTotal.absent}</div></div>
          <div><div className="text-[11px] text-on-surface-variant/60">지각</div><div className="font-bold tabular-nums">{attendanceTotal.late}</div></div>
          <div><div className="text-[11px] text-on-surface-variant/60">조퇴</div><div className="font-bold tabular-nums">{attendanceTotal.early_leave}</div></div>
          <div><div className="text-[11px] text-on-surface-variant/60">공결</div><div className="font-bold tabular-nums">{attendanceTotal.excused}</div></div>
          <div><div className="text-[11px] text-on-surface-variant/60">출석률</div><div className="font-bold tabular-nums text-primary">{formatRate(attendanceRateValue)}</div></div>
        </div>
      </div>

      {/* 결과물 제출 현황 */}
      <div className="surface-card border border-surface-container-high p-4">
        <h3 className="text-sm font-black mb-3">결과물 제출 현황</h3>
        <div className="grid grid-cols-3 gap-3 text-sm mb-3">
          <div><div className="text-[11px] text-on-surface-variant/60">총 제출 건수</div><div className="font-bold tabular-nums">{resultTotal}건</div></div>
          <div><div className="text-[11px] text-on-surface-variant/60">제출 참여자</div><div className="font-bold tabular-nums">{resultStudentTotal}명</div></div>
          <div><div className="text-[11px] text-on-surface-variant/60">참여율</div><div className="font-bold tabular-nums text-primary">{formatRate(participationRate)}</div></div>
        </div>
        {weekly.length > 0 && (
          <div>
            <div className="text-[11px] text-on-surface-variant/60 mb-1.5">주차별 제출 추이</div>
            <div className="space-y-1">
              {weekly.map(w => (
                <div key={w.week_number} className="flex items-center gap-2 text-xs">
                  <span className="w-10 shrink-0 text-on-surface-variant/70">{w.week_number}주차</span>
                  <div className="flex-1 h-3 bg-surface-container-high rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${(w.cnt / maxWeeklyCnt) * 100}%` }} />
                  </div>
                  <span className="w-8 text-right tabular-nums font-bold">{w.cnt}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 사전·사후 설문 */}
      {surveys && surveys.length > 0 && (
        <div className="surface-card border border-surface-container-high p-4 space-y-4">
          <h3 className="text-sm font-black">사전·사후 설문 비교</h3>
          {surveys.map(pair => (
            <div key={pair.postForm.id} className="border border-surface-container-high rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-surface-container-low/40 flex items-center justify-between gap-2">
                <span className="text-xs font-bold">{pair.preForm.title} → {pair.postForm.title}</span>
                <span className="text-[10px] text-on-surface-variant/60">
                  {pair.matched ? `${pair.matchedCount}명 매칭` : `사전 ${pair.preResponseCount}명 · 사후 ${pair.postResponseCount}명 (전체 비교)`}
                </span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-surface-container-high text-left text-on-surface-variant/70">
                    <th className="px-3 py-2 font-bold">문항</th>
                    <th className="px-3 py-2 font-bold text-right">사전</th>
                    <th className="px-3 py-2 font-bold text-right">사후</th>
                  </tr>
                </thead>
                <tbody>
                  {pair.rows.map((r, i) => (
                    <tr key={i} className="border-b border-surface-container-high last:border-0">
                      <td className="px-3 py-2">{r.text}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.type === 'yes_no' ? fmtPct(r.prePct) : fmtAvg(r.preAvg)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold">{r.type === 'yes_no' ? fmtPct(r.postPct) : fmtAvg(r.postAvg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* 학교별 비교표 */}
      {schoolRows.length > 0 && (
        <div className="surface-card border border-surface-container-high overflow-hidden">
          <div className="px-4 py-2.5 border-b border-surface-container-high bg-surface-container-low/40">
            <span className="text-sm font-bold">학교별 비교</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-container-high text-left text-xs text-on-surface-variant/70">
                  <th className="px-4 py-2.5 font-bold whitespace-nowrap">학교</th>
                  <th className="px-4 py-2.5 font-bold text-right whitespace-nowrap">반</th>
                  <th className="px-4 py-2.5 font-bold text-right whitespace-nowrap">참가자</th>
                  <th className="px-4 py-2.5 font-bold text-right whitespace-nowrap">출석률</th>
                  <th className="px-4 py-2.5 font-bold text-right whitespace-nowrap">결과물</th>
                </tr>
              </thead>
              <tbody>
                {schoolRows.map(s => (
                  <tr key={s.school_id} className="border-b border-surface-container-high last:border-0">
                    <td className="px-4 py-2.5 font-bold whitespace-nowrap">{s.school_name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{s.class_count}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{s.student_count}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatRate(attendanceRate(s))}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{s.result_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
