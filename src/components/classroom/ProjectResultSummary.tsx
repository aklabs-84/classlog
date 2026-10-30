import { useEffect, useMemo, useState } from 'react';
import { FileBarChart, Printer, FileSpreadsheet, Loader2 } from 'lucide-react';
import {
  fetchProjectSummaryStats,
  fetchProjectCourseStats,
  fetchProjectClassOverview,
  sumAttendance,
  attendanceRate,
  formatRate,
  type ProjectSummaryStats,
  type SchoolStatRow,
  type ProjectCourseStats,
  type ProjectClassOverview,
  type ClassOverviewRow,
} from '../../lib/projectStats';
import { fetchProjectSurveyComparisons, type SurveyPairSummary } from '../../lib/surveyCompare';
import { buildXlsxBlob } from '../../lib/xlsxBuilder';
import type { XCell, XSheet } from '../../lib/xlsxBuilder';
import { saveBlob } from '../../lib/classExport';

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
  /** 학교별 비교 표에서 학교 이름을 누르면 해당 학교 상세로 이동 */
  onSchoolClick?: (schoolId: string) => void;
  /** 지정하면 이 학교 하나만의 요약을 보여 준다 (설문은 학교 전용 우선, 없으면 공통) */
  schoolId?: string | null;
  /** 학생이 제출한 활동 기록(승인된 것만) 합계. 학교 단위 요약에서만 전달한다 */
  activityStats?: { total: number; students: number } | null;
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

function BigNum({ label, value, unit, sub }: { label: string; value: number | string; unit?: string; sub?: string }) {
  return (
    <div className="px-3 first:pl-0">
      <div className="text-[11px] text-on-surface-variant/60">{label}</div>
      <div className="text-3xl font-black tabular-nums leading-tight">
        {value}{unit && typeof value === 'number' ? <span className="text-sm font-bold ml-0.5">{unit}</span> : null}
      </div>
      {sub && <div className="text-[10px] text-on-surface-variant/60 mt-0.5">{sub}</div>}
    </div>
  );
}

// 제출 건수가 많을수록 진한 색 (0건은 연한 회색)
function heatClass(cnt: number, max: number): string {
  if (cnt === 0) return 'bg-surface-container-high/60 text-on-surface-variant/50';
  const r = cnt / max;
  if (r > 0.66) return 'bg-primary text-white';
  if (r > 0.33) return 'bg-primary/60 text-white';
  return 'bg-primary/25 text-on-surface';
}

export default function ProjectResultSummary({ projectId, program, totals, onSchoolClick, schoolId = null, activityStats = null }: Props) {
  const [stats, setStats] = useState<ProjectSummaryStats | null>(null);
  const [surveys, setSurveys] = useState<SurveyPairSummary[] | null>(null);
  const [courseStats, setCourseStats] = useState<ProjectCourseStats | null>(null);
  const [overview, setOverview] = useState<ProjectClassOverview | null>(null);
  const [failed, setFailed] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setStats(null); setSurveys(null); setCourseStats(null); setOverview(null);
    Promise.all([fetchProjectSummaryStats(projectId, schoolId), fetchProjectSurveyComparisons(projectId, schoolId)])
      .then(([s, sv]) => { if (!cancelled) { setStats(s); setSurveys(sv); } })
      .catch(() => { if (!cancelled) { setStats({ schools: [], weekly: [] }); setSurveys([]); setFailed(true); } });
    // 반별 표·색칠표·설문 요약도 부가 정보라 실패해도 나머지는 그대로 보여 준다.
    fetchProjectClassOverview(projectId, schoolId)
      .then(o => { if (!cancelled) setOverview(o); })
      .catch(() => { if (!cancelled) setOverview({ classes: [], surveys: [] }); });
    // 과목별 합산은 부가 정보라 실패해도 나머지 화면에는 영향 없게 따로 불러온다.
    (schoolId ? Promise.resolve(null) : fetchProjectCourseStats(projectId))
      .then(c => { if (!cancelled) setCourseStats(c); })
      .catch(() => { if (!cancelled) setCourseStats(null); });
    return () => { cancelled = true; };
  }, [projectId, schoolId]);

  // 과목이 하나라도 만들어져 있어야 "과목별" 구역을 보여 준다.
  const hasCourses = !!courseStats && courseStats.courses.some(c => c.course_id !== null);

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


  const surveyResponseTotal = useMemo(
    () => (overview?.surveys ?? []).reduce((a, f) => a + f.response_count, 0),
    [overview],
  );
  const multiSchool = !schoolId && new Set((overview?.classes ?? []).map(k => k.school_id)).size > 1;
  const classLabel = (k: { school_name: string; class_name: string }) => (multiSchool ? `${k.school_name} · ${k.class_name}` : k.class_name);
  const weekCols = useMemo(() => {
    const mx = Math.max(1, ...(overview?.classes ?? []).flatMap(k => k.weekly.map(w => w.week)));
    return Array.from({ length: mx }, (_, i) => i + 1);
  }, [overview]);
  const maxHeat = Math.max(1, ...(overview?.classes ?? []).flatMap(k => k.weekly.map(w => w.cnt)));

  const handlePrint = () => window.print();

  const handleExcel = async () => {
    setExporting(true);
    try {
      const H = (v: string): XCell => ({ value: v, style: 'header' });
      const C = (v: string | number | null, style: 'cell' | 'num' = 'cell'): XCell => ({ value: v, style });
      const classes = overview?.classes ?? [];
      const surveyForms = overview?.surveys ?? [];
      const periodText = `${fmtDate(program?.start_date ?? null)} ~ ${fmtDate(program?.end_date ?? null)}`;
      const todayText = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
      const rateText = (r: ClassOverviewRow) => { const v = attendanceRate(r); return v === null ? '체크 전' : formatRate(v); };

      // 1) 표지·요약
      const coverRows: (XCell | null)[][] = [
        [{ value: `${program?.name ?? '사업'} 결과 요약`, style: 'title', span: 4 }, null, null, null],
        [{ value: `${program?.school_name ?? `학교 ${totals.schoolCount}곳`} · 기준일 ${todayText}`, style: 'note', span: 4 }, null, null, null],
        [null, null, null, null],
        [{ value: '사업 개요', style: 'section', span: 4 }, null, null, null],
        [C('사업명'), { value: program?.name ?? '-', style: 'cell', span: 3 }, null, null],
        [C('학교/기관'), { value: program?.school_name ?? `학교 ${totals.schoolCount}곳`, style: 'cell', span: 3 }, null, null],
        [C('기간'), { value: periodText, style: 'cell', span: 3 }, null, null],
        [C('참여 학교 / 강사'), { value: `학교 ${totals.schoolCount}곳 · 강사 ${totals.teacherCount}명`, style: 'cell', span: 3 }, null, null],
        [null, null, null, null],
        [{ value: '한눈에 보기', style: 'section', span: 4 }, null, null, null],
        [H('항목'), H('값'), H('참여'), H('참여율')],
        [C('학생'), C(totals.studentCount, 'num'), C('-'), C('-')],
        [C('결과물 제출(건)'), C(resultTotal, 'num'), C(`${resultStudentTotal}명`), C(formatRate(participationRate))],
        ...(activityStats ? [[
          C('활동 기록(건)'), C(activityStats.total, 'num'), C(`${activityStats.students}명`),
          C(formatRate(totals.studentCount > 0 ? (activityStats.students / totals.studentCount) * 100 : 0)),
        ] as (XCell | null)[]] : []),
        [C('설문 응답(건)'), C(surveyResponseTotal, 'num'), C(`설문 ${surveyForms.length}종`), C('-')],
        [C('출석률'), C(attendanceRateValue === null ? '체크 전' : formatRate(attendanceRateValue), 'num'),
          C(`출석 ${attendanceTotal.present} · 결석 ${attendanceTotal.absent} · 지각 ${attendanceTotal.late} · 조퇴 ${attendanceTotal.early_leave}`), C('공결은 분모 제외')],
      ];

      // 2) 반별 비교
      const classRows: (XCell | null)[][] = [
        [H('학교'), H('반'), H('학생'), H('출석률'), H('활동 기록'), H('활동 기록 참여'), H('결과물'), H('결과물 참여'), H('1인당 결과물'), H('설문 응답')],
        ...classes.map(k => [
          C(k.school_name), C(k.class_name), C(k.student_count, 'num'), C(rateText(k), 'num'),
          C(k.activity_count, 'num'), C(k.activity_student_count, 'num'),
          C(k.result_count, 'num'), C(k.result_student_count, 'num'),
          C(k.student_count > 0 ? Number((k.result_count / k.student_count).toFixed(1)) : null, 'num'),
          C(k.survey_response_count, 'num'),
        ] as (XCell | null)[]),
      ];

      // 3) 주차별 결과물
      const rowsByWeek: (XCell | null)[][] = [
        [H('학교'), H('반'), ...weekCols.map(w => H(`${w}주차`)), H('합계')],
        ...classes.map(k => [
          C(k.school_name), C(k.class_name),
          ...weekCols.map(w => C(k.weekly.find(x => x.week === w)?.cnt ?? 0, 'num')),
          C(k.result_count, 'num'),
        ] as (XCell | null)[]),
      ];

      // 4) 출석
      const attRows: (XCell | null)[][] = [
        [H('학교'), H('반'), H('출석'), H('결석'), H('지각'), H('조퇴'), H('공결'), H('출석률')],
        ...classes.map(k => [
          C(k.school_name), C(k.class_name), C(k.present, 'num'), C(k.absent, 'num'),
          C(k.late, 'num'), C(k.early_leave, 'num'), C(k.excused, 'num'), C(rateText(k), 'num'),
        ] as (XCell | null)[]),
      ];

      // 5) 설문 (전체 설문의 문항별 집계)
      const surveyRows: (XCell | null)[][] = [
        [H('설문'), H('구분'), H('응답 수'), H('문항'), H('유형'), H('결과')],
        ...surveyForms.flatMap(f => {
          const phase = f.phase === 'pre' ? '사전' : f.phase === 'post' ? '사후' : '-';
          if (f.questions.length === 0) return [[C(f.title), C(phase), C(f.response_count, 'num'), C('(점수·예/아니오 문항 없음)'), C('-'), C('-')] as (XCell | null)[]];
          return f.questions.map(q => [
            C(f.title), C(phase), C(f.response_count, 'num'), C(q.text),
            C(q.type === 'yes_no' ? '예/아니오' : '점수'),
            C(q.type === 'yes_no' ? `“예” ${fmtPct(q.pct)}` : `평균 ${fmtAvg(q.avg === null ? null : Number(q.avg))}`, 'num'),
          ] as (XCell | null)[]);
        }),
      ];

      // 6) 사전·사후 비교
      const pairRows: (XCell | null)[][] = [
        [H('설문 쌍'), H('문항'), H('유형'), H('사전'), H('사후')],
        ...(surveys ?? []).flatMap(pair => pair.rows.map(r => [
          C(`${pair.preForm.title} → ${pair.postForm.title}`), C(r.text), C(r.type === 'yes_no' ? '예/아니오' : '점수'),
          C(r.type === 'yes_no' ? fmtPct(r.prePct) : fmtAvg(r.preAvg), 'num'),
          C(r.type === 'yes_no' ? fmtPct(r.postPct) : fmtAvg(r.postAvg), 'num'),
        ] as (XCell | null)[])),
      ];

      const sheets: XSheet[] = [
        { name: '표지·요약', colWidths: [20, 22, 34, 18], rows: coverRows },
        ...(classes.length > 0 ? [
          { name: '반별 비교', colWidths: [18, 22, 8, 10, 10, 12, 9, 12, 12, 10], rows: classRows, freezeRows: 1, filterRow: 1 },
          { name: '주차별 결과물', colWidths: [18, 22, ...weekCols.map(() => 9), 9], rows: rowsByWeek, freezeRows: 1, filterRow: 1 },
          { name: '출석', colWidths: [18, 22, 8, 8, 8, 8, 8, 10], rows: attRows, freezeRows: 1, filterRow: 1 },
        ] : []),
        ...(surveyForms.length > 0 ? [{ name: '설문', colWidths: [26, 8, 9, 40, 11, 14], rows: surveyRows, freezeRows: 1, filterRow: 1 }] : []),
        ...(pairRows.length > 1 ? [{ name: '사전사후 비교', colWidths: [30, 36, 11, 10, 10], rows: pairRows, freezeRows: 1, filterRow: 1 }] : []),
        ...(!schoolId && schoolRows.length > 1 ? [{
          name: '학교별 비교', colWidths: [20, 8, 9, 10, 10],
          rows: [
            [H('학교'), H('반'), H('참가자'), H('출석률'), H('결과물')],
            ...schoolRows.map(sc => [C(sc.school_name), C(sc.class_count, 'num'), C(sc.student_count, 'num'), C(formatRate(attendanceRate(sc)), 'num'), C(sc.result_count, 'num')] as (XCell | null)[]),
          ],
          freezeRows: 1, filterRow: 1,
        }] : []),
      ];

      const blob = await buildXlsxBlob(sheets);
      saveBlob(blob, `${program?.name || '사업'}_결과요약_${todayText.replace(/\D/g, '')}.xlsx`);
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
          #project-result-summary-print * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          #project-result-summary-print .print-avoid-break { break-inside: avoid; }
          #project-result-summary-print .print-only { display: block !important; }
          #project-result-summary-print > div { break-inside: avoid; }
          #project-result-summary-print table { break-inside: auto; }
          #project-result-summary-print tr { break-inside: avoid; }
          @page { size: A4; margin: 16mm 14mm 18mm; @bottom-center { content: counter(page) " / " counter(pages); font-size: 9pt; color: #666; } }
        }
        .print-only { display: none; }
      `}</style>

      {/* 인쇄할 때만 보이는 보고서 머리글 */}
      <div className="print-only" style={{ borderBottom: '2px solid #111', paddingBottom: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{program?.name ?? '사업'} 결과 요약</div>
        <div style={{ fontSize: 11, color: '#444', marginTop: 4 }}>
          {program?.school_name ?? `학교 ${totals.schoolCount}곳`} · 기간 {fmtDate(program?.start_date ?? null)} ~ {fmtDate(program?.end_date ?? null)} · 작성일 {new Date().toLocaleDateString('ko-KR')}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 no-print">
        <span className="text-sm font-bold flex items-center gap-1.5">
          <FileBarChart size={14} className="text-on-surface-variant/50" />
          {schoolId ? '학교 결과 요약' : '사업 결과 요약'}
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
        <h3 className="text-sm font-black mb-3">{schoolId ? '학교 개요' : '사업 개요'}</h3>
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

      {/* 큰 숫자 한눈에 */}
      <div className="surface-card border border-surface-container-high p-4">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-y-4">
          <BigNum label="학생" value={totals.studentCount} unit="명" />
          <BigNum label="결과물 제출" value={resultTotal} unit="건" sub={`참여 ${resultStudentTotal}명 · ${formatRate(participationRate)}`} />
          {activityStats && (
            <BigNum label="활동 기록" value={activityStats.total} unit="건"
              sub={`참여 ${activityStats.students}명 · ${formatRate(totals.studentCount > 0 ? (activityStats.students / totals.studentCount) * 100 : 0)}`} />
          )}
          <BigNum label="설문 응답" value={surveyResponseTotal} unit="건" sub={`설문 ${overview?.surveys.length ?? 0}종`} />
          <BigNum label="출석률" value={attendanceRateValue === null ? '체크 전' : formatRate(attendanceRateValue)}
            sub={attendanceRateValue === null ? undefined : `출석 ${attendanceTotal.present} · 결석 ${attendanceTotal.absent} · 지각 ${attendanceTotal.late} · 조퇴 ${attendanceTotal.early_leave}`} />
        </div>
        {attendanceRateValue === null && (
          <p className="mt-3 text-[11px] px-3 py-2 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
            출석은 아직 체크 전입니다. 출석 체크를 시작하면 이 자리에 출석률이 나타납니다.
          </p>
        )}
        {attendanceRateValue !== null && (
          <p className="mt-2 text-[10px] text-on-surface-variant/50">출석률 = (출석+지각+조퇴) ÷ (출석+결석+지각+조퇴) · 공결은 분모에서 제외</p>
        )}
      </div>

      {/* 반별 한눈에 보기 */}
      {overview && overview.classes.length > 0 && (
        <div className="surface-card border border-surface-container-high overflow-hidden">
          <div className="px-4 py-2.5 border-b border-surface-container-high">
            <span className="text-sm font-black">반별 한눈에 보기</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-on-surface text-left text-on-surface-variant/70">
                  <th className="px-3 py-2 font-bold whitespace-nowrap">반</th>
                  <th className="px-3 py-2 font-bold text-right whitespace-nowrap">학생</th>
                  <th className="px-3 py-2 font-bold text-right whitespace-nowrap">출석률</th>
                  <th className="px-3 py-2 font-bold text-right whitespace-nowrap">활동 기록</th>
                  <th className="px-3 py-2 font-bold text-right whitespace-nowrap">결과물</th>
                  <th className="px-3 py-2 font-bold text-right whitespace-nowrap">1인당 결과물</th>
                  <th className="px-3 py-2 font-bold text-right whitespace-nowrap">설문 응답</th>
                </tr>
              </thead>
              <tbody>
                {overview.classes.map(k => {
                  const rate = attendanceRate(k);
                  return (
                    <tr key={k.class_id} className="border-b border-surface-container-high hover:bg-surface-container-low/60">
                      <td className="px-3 py-2.5 whitespace-nowrap font-bold">{classLabel(k)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{k.student_count}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{rate === null ? <span className="text-on-surface-variant/50">체크 전</span> : formatRate(rate)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{k.activity_count}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold">{k.result_count}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{k.student_count > 0 ? (k.result_count / k.student_count).toFixed(1) : '-'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{k.survey_response_count}</td>
                    </tr>
                  );
                })}
                <tr className="font-black bg-surface-container-low/40">
                  <td className="px-3 py-2.5">합계</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{overview.classes.reduce((a, k) => a + k.student_count, 0)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{attendanceRateValue === null ? '-' : formatRate(attendanceRateValue)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{overview.classes.reduce((a, k) => a + k.activity_count, 0)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{overview.classes.reduce((a, k) => a + k.result_count, 0)}</td>
                  <td className="px-3 py-2.5" />
                  <td className="px-3 py-2.5 text-right tabular-nums">{surveyResponseTotal}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 반 × 주차 색칠표 */}
      {overview && overview.classes.length > 0 && (
        <div className="surface-card border border-surface-container-high p-4">
          <h3 className="text-sm font-black mb-1">주차별 결과물 제출</h3>
          <p className="text-[11px] text-on-surface-variant/60 mb-3">칸의 숫자 = 그 주에 제출된 결과물 수 · 연한 회색 = 아직 제출 없음 · 진할수록 많이 제출</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-separate border-spacing-1">
              <thead>
                <tr className="text-on-surface-variant/70">
                  <th className="text-left font-bold px-1 py-1 whitespace-nowrap">반</th>
                  {weekCols.map(w => <th key={w} className="font-bold px-1 py-1 text-center whitespace-nowrap">{w}주차</th>)}
                  <th className="font-bold px-1 py-1 text-right whitespace-nowrap">합계</th>
                </tr>
              </thead>
              <tbody>
                {overview.classes.map(k => (
                  <tr key={k.class_id}>
                    <td className="px-1 py-1 font-bold whitespace-nowrap">{classLabel(k)}</td>
                    {weekCols.map(w => {
                      const cnt = k.weekly.find(x => x.week === w)?.cnt ?? 0;
                      return (
                        <td key={w} className="p-0">
                          <div
                            className={`heat-cell h-9 min-w-[44px] rounded-sm flex items-center justify-center font-bold tabular-nums transition-transform hover:scale-105 ${heatClass(cnt, maxHeat)}`}
                            title={`${classLabel(k)} ${w}주차 ${cnt}건`}
                          >
                            {cnt === 0 ? <span className="font-normal text-[10px]">–</span> : cnt}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-1 py-1 text-right tabular-nums font-bold">{k.result_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 설문 요약 (사전·사후 짝이 아닌 설문까지 모두) */}
      {overview && overview.surveys.length > 0 && (
        <div className="surface-card border border-surface-container-high p-4">
          <h3 className="text-sm font-black mb-3">설문 요약</h3>
          <div className="space-y-4">
            {overview.surveys.map(f => (
              <div key={f.id} className="print-avoid-break">
                <div className="flex items-baseline justify-between gap-2 border-b border-on-surface pb-1 mb-1">
                  <span className="text-xs font-bold">{f.title}{f.phase ? ` · ${f.phase === 'pre' ? '사전' : f.phase === 'post' ? '사후' : f.phase}` : ''}</span>
                  <span className="text-[11px] text-on-surface-variant/60 tabular-nums">응답 {f.response_count}명</span>
                </div>
                {f.questions.length === 0 ? (
                  <p className="text-[11px] text-on-surface-variant/50 py-1">점수·예/아니오 문항이 없어 숫자 요약은 없습니다.</p>
                ) : (
                  <table className="w-full text-xs">
                    <tbody>
                      {f.questions.map((q, i) => (
                        <tr key={i} className="border-b border-surface-container-high last:border-0">
                          <td className="py-1.5 pr-2">{q.text}</td>
                          <td className="py-1.5 text-right tabular-nums font-bold whitespace-nowrap">
                            {q.type === 'yes_no' ? `“예” ${fmtPct(q.pct)}` : `평균 ${fmtAvg(q.avg === null ? null : Number(q.avg))}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 과목별 합산 */}
      {hasCourses && courseStats && (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-black">과목별 합산</h3>
            <p className="text-[11px] text-on-surface-variant/60">같은 수업을 여러 선생님·학교에서 진행한 반을 과목 단위로 합쳐서 보여 줍니다.</p>
          </div>
          {courseStats.courses.map(c => {
            const classes = courseStats.classes.filter(k => k.course_id === c.course_id);
            const wk = courseStats.weekly.filter(w => w.course_id === c.course_id);
            const wkMax = Math.max(1, ...wk.map(w => w.cnt));
            const part = c.student_count > 0 ? (c.result_student_count / c.student_count) * 100 : null;
            return (
              <div key={c.course_id ?? 'none'} className="surface-card border border-surface-container-high overflow-hidden">
                <div className="px-4 py-2.5 border-b border-surface-container-high bg-surface-container-low/40 flex items-center justify-between gap-2">
                  <span className="text-sm font-bold">{c.name ?? '과목 없음 (묶지 않은 반)'}</span>
                  <span className="text-[11px] text-on-surface-variant/60">반 {c.class_count}개 · 선생님 {c.teacher_count}명</span>
                </div>
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div><div className="text-[11px] text-on-surface-variant/60">학생 수</div><div className="font-bold tabular-nums">{c.student_count}명</div></div>
                    <div><div className="text-[11px] text-on-surface-variant/60">출석률</div><div className="font-bold tabular-nums text-primary">{formatRate(attendanceRate(c))}</div></div>
                    <div><div className="text-[11px] text-on-surface-variant/60">출석 · 결석 · 지각 · 조퇴 · 공결</div><div className="font-bold tabular-nums text-xs">{c.present} · {c.absent} · {c.late} · {c.early_leave} · {c.excused}</div></div>
                    <div><div className="text-[11px] text-on-surface-variant/60">수업한 날</div><div className="font-bold tabular-nums">{c.session_days}일</div></div>
                    <div><div className="text-[11px] text-on-surface-variant/60">결과물 제출</div><div className="font-bold tabular-nums">{c.result_count}건</div></div>
                    <div><div className="text-[11px] text-on-surface-variant/60">제출한 학생</div><div className="font-bold tabular-nums">{c.result_student_count}명</div></div>
                    <div><div className="text-[11px] text-on-surface-variant/60">제출 참여율</div><div className="font-bold tabular-nums text-primary">{formatRate(part)}</div></div>
                  </div>
                  {wk.length > 0 && (
                    <div>
                      <div className="text-[11px] text-on-surface-variant/60 mb-1.5">주차별 제출</div>
                      <div className="space-y-1">
                        {wk.map(w => (
                          <div key={w.week_number} className="flex items-center gap-2 text-xs">
                            <span className="w-10 shrink-0 text-on-surface-variant/70">{w.week_number}주차</span>
                            <div className="flex-1 h-3 bg-surface-container-high rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full" style={{ width: `${(w.cnt / wkMax) * 100}%` }} />
                            </div>
                            <span className="w-8 text-right tabular-nums font-bold">{w.cnt}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {classes.length > 0 && (
                  <div className="overflow-x-auto border-t border-surface-container-high">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-surface-container-high text-left text-on-surface-variant/70">
                          <th className="px-4 py-2 font-bold whitespace-nowrap">학교 · 반</th>
                          <th className="px-4 py-2 font-bold text-right whitespace-nowrap">학생</th>
                          <th className="px-4 py-2 font-bold text-right whitespace-nowrap">출석률</th>
                          <th className="px-4 py-2 font-bold text-right whitespace-nowrap">수업일</th>
                          <th className="px-4 py-2 font-bold text-right whitespace-nowrap">제출</th>
                        </tr>
                      </thead>
                      <tbody>
                        {classes.map(k => (
                          <tr key={k.class_id} className="border-b border-surface-container-high last:border-0">
                            <td className="px-4 py-2 whitespace-nowrap"><span className="font-bold">{k.school_name}</span> · {k.class_name}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{k.student_count}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{formatRate(attendanceRate(k))}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{k.session_days}</td>
                            <td className="px-4 py-2 text-right tabular-nums">{k.result_count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

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
      {!schoolId && schoolRows.length > 0 && (
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
                    <td className="px-4 py-2.5 font-bold whitespace-nowrap">
                      {onSchoolClick ? (
                        <button type="button" onClick={() => onSchoolClick(s.school_id)} className="text-primary hover:underline">{s.school_name}</button>
                      ) : s.school_name}
                    </td>
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
