/**
 * 학급 결과 내려받기(엑셀·CSV) 공통 모듈.
 * 학생별 시트를 따로 만들지 않고, 활동 기록·결과물·설문을 각각 한 표로 모아
 * 한 파일에서 필터로 걸러 볼 수 있게 한다. 이름 포함/익명은 includeNames 로 고른다.
 */
import type { XCell, XSheet } from './xlsxBuilder';
import { buildSurveyXlsxRows } from './surveyExport';

export interface ExportResultItem {
  result_type: string;
  text_content: string | null;
  link_url: string | null;
  file_url: string | null;
  file_name?: string | null;
  display_name?: string | null;
  image_url: string | null;
  image_urls?: string[];
}

export interface ExportStudent {
  id: string;
  student_number: number | null;
  full_name: string;
  observations: { week_number: number | null; activity_name: string; content: string; created_at: string }[];
  resultGroups: {
    week_number: number | null;
    title: string | null;
    created_at: string;
    isGroupSubmission: boolean;
    items: ExportResultItem[];
  }[];
}

export interface ExportEval {
  achievement_level: string | null;
  status: string | null;
  setech_content: string;
}

export interface ExportSurveyForm {
  formTitle: string;
  phase?: string | null;
  questions: any[];
  answersByQuestion: Record<string, any[]>;
  responseCount: number;
}

export interface ClassExportInput {
  /** 사업(프로젝트) 또는 학교 이름 */
  orgName: string;
  className: string;
  students: ExportStudent[];
  evalMap: Record<string, ExportEval | undefined>;
  surveys: ExportSurveyForm[];
  /** 출석 요약(학급이 공개한 경우에만 전달) */
  attendance?: { total: number; byStatus: Record<string, number> } | null;
  includeNames: boolean;
}

const fmtDate = (v: string) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ko-KR');
};
const weekLabel = (w: number | null) => (w != null ? `${w}주차` : '');
const statusText = (s?: string | null) => (s === 'done' || s === 'final' ? '완료' : s === 'draft' ? '초안' : '미작성');

export function exportTodayStr() {
  return new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '').replace(/\.$/, '');
}

function sortedStudents(students: ExportStudent[]) {
  return [...students].sort((a, b) => (a.student_number ?? 9999) - (b.student_number ?? 9999) || a.full_name.localeCompare(b.full_name, 'ko'));
}

function resultContent(items: ExportResultItem[]): { text: string; kind: string } {
  const parts: string[] = [];
  const kinds: string[] = [];
  items.forEach(it => {
    if (it.result_type === 'text' || it.text_content) { if (it.text_content) parts.push(it.text_content); kinds.push('글'); }
    if (it.link_url) { parts.push(`링크: ${it.link_url}`); kinds.push('링크'); }
    if (it.file_url) { parts.push(`파일: ${it.display_name || it.file_name || '첨부 파일'}`); kinds.push('파일'); }
    const imgs = it.image_urls && it.image_urls.length > 0 ? it.image_urls.length : it.image_url ? 1 : 0;
    if (imgs > 0) { parts.push(`이미지 ${imgs}장 첨부`); kinds.push('이미지'); }
  });
  return { text: parts.join('\n'), kind: Array.from(new Set(kinds)).join('·') };
}

interface Tables {
  who: (s: ExportStudent, idx: number) => { num: number | string; name: string };
  overview: (string | number)[][];
  overviewHeader: string[];
  obsRows: (string | number)[][];
  resRows: (string | number)[][];
  weeklyRows: (string | number)[][];
  setechRows: (string | number)[][];
}

function buildTables(input: ClassExportInput): Tables {
  const { students, evalMap, includeNames } = input;
  const sorted = sortedStudents(students);
  const who = (s: ExportStudent, idx: number) => ({
    num: s.student_number ?? '',
    name: includeNames ? s.full_name : `학생 ${s.student_number ?? idx + 1}`,
  });

  const overviewHeader = includeNames
    ? ['번호', '이름', '활동 기록 수', '결과물 수', '성취도', '세특 상태']
    : ['번호', '학생', '활동 기록 수', '결과물 수', '성취도', '세특 상태'];
  const overview = sorted.map((s, i) => {
    const w = who(s, i);
    const ev = evalMap[s.id];
    return [w.num, w.name, s.observations.length, s.resultGroups.length, ev?.achievement_level ?? '', ev ? statusText(ev.status) : '미작성'];
  });

  const obsRows: (string | number)[][] = [];
  const resRows: (string | number)[][] = [];
  sorted.forEach((s, i) => {
    const w = who(s, i);
    [...s.observations]
      .sort((a, b) => (a.week_number ?? 0) - (b.week_number ?? 0) || a.created_at.localeCompare(b.created_at))
      .forEach(o => obsRows.push([w.num, w.name, weekLabel(o.week_number), o.activity_name || '', o.content || '', fmtDate(o.created_at)]));
    [...s.resultGroups]
      .sort((a, b) => (a.week_number ?? 0) - (b.week_number ?? 0) || a.created_at.localeCompare(b.created_at))
      .forEach(g => {
        const c = resultContent(g.items);
        resRows.push([w.num, w.name, weekLabel(g.week_number), g.isGroupSubmission ? '조별' : '개인', g.title || '', c.text, c.kind, fmtDate(g.created_at)]);
      });
  });

  const weekMap = new Map<number, { obs: number; res: number; people: Set<string> }>();
  const ensure = (w: number) => {
    if (!weekMap.has(w)) weekMap.set(w, { obs: 0, res: 0, people: new Set() });
    return weekMap.get(w)!;
  };
  students.forEach(s => {
    s.observations.forEach(o => { if (o.week_number != null) { const e = ensure(o.week_number); e.obs++; e.people.add(s.id); } });
    s.resultGroups.forEach(g => { if (g.week_number != null) { const e = ensure(g.week_number); e.res++; e.people.add(s.id); } });
  });
  const weeklyRows = Array.from(weekMap.entries()).sort((a, b) => a[0] - b[0])
    .map(([w, e]) => [`${w}주차`, e.obs, e.res, e.people.size]);

  const setechRows: (string | number)[][] = [];
  sorted.forEach((s, i) => {
    const ev = evalMap[s.id];
    if (!ev || !ev.setech_content) return;
    const w = who(s, i);
    setechRows.push([w.num, w.name, ev.achievement_level ?? '', statusText(ev.status), ev.setech_content, ev.setech_content.length]);
  });

  return { who, overview, overviewHeader, obsRows, resRows, weeklyRows, setechRows };
}

const toSurveyForms = (surveys: ExportSurveyForm[]) => surveys.map(f => ({
  title: f.formTitle,
  phase: f.phase ?? null,
  response_count: f.responseCount,
  questions: f.questions,
  answers: Object.values(f.answersByQuestion).flat(),
}));

const ATT_LABEL: [string, string][] = [['present', '출석'], ['absent', '결석'], ['late', '지각'], ['early_leave', '조퇴'], ['excused', '공결']];

const H = (value: string): XCell => ({ value, style: 'header' });
const C = (value: string | number | null): XCell => ({ value, style: 'cell' });
const N = (value: string | number | null): XCell => ({ value, style: 'num' });

/** 엑셀 시트 묶음: 요약 / 학생별 현황 / 활동 기록 / 결과물 / (설문) / (세특) */
export function buildClassSheets(input: ClassExportInput): XSheet[] {
  const t = buildTables(input);
  const { students, surveys, attendance } = input;
  const submitters = students.filter(s => s.observations.length > 0 || s.resultGroups.length > 0).length;
  const totalObs = students.reduce((a, s) => a + s.observations.length, 0);
  const totalRes = students.reduce((a, s) => a + s.resultGroups.length, 0);

  // ── 요약 ──
  const sum: (XCell | null)[][] = [];
  sum.push([{ value: `${input.orgName ? input.orgName + ' · ' : ''}${input.className} 결과 요약`, style: 'title', span: 4 }, null, null, null]);
  sum.push([{ value: `내려받은 날 ${fmtDate(new Date().toISOString())} · ${input.includeNames ? '학생 이름 포함' : '학생 이름 없이(번호만)'}`, style: 'note', span: 4 }, null, null, null]);
  sum.push([null, null, null, null]);
  sum.push([{ value: '한눈에 보기', style: 'section', span: 4 }, null, null, null]);
  const kv = (k: string, v: string | number): (XCell | null)[] => [C(k), N(v), null, null];
  sum.push(kv('전체 학생', students.length));
  sum.push(kv('활동 기록(건)', totalObs));
  sum.push(kv('결과물(건)', totalRes));
  sum.push(kv('제출한 학생', submitters));
  sum.push(kv('제출 참여율', students.length > 0 ? `${Math.round((submitters / students.length) * 100)}%` : '-'));
  sum.push(kv('설문(개)', surveys.length));
  if (attendance && attendance.total > 0) {
    sum.push([null, null, null, null]);
    sum.push([{ value: '출석 요약', style: 'section', span: 4 }, null, null, null]);
    ATT_LABEL.forEach(([k, label]) => sum.push(kv(label, attendance.byStatus[k] || 0)));
    const p = attendance.byStatus.present || 0;
    sum.push(kv('출석 비율', `${Math.round((p / attendance.total) * 100)}%`));
  }
  if (t.weeklyRows.length > 0) {
    sum.push([null, null, null, null]);
    sum.push([{ value: '주차별 현황', style: 'section', span: 4 }, null, null, null]);
    sum.push([H('주차'), H('활동 기록'), H('결과물'), H('참여 학생')]);
    t.weeklyRows.forEach(r => sum.push([C(r[0]), N(r[1]), N(r[2]), N(r[3])]));
  }

  const sheets: XSheet[] = [
    { name: '요약', colWidths: [22, 14, 14, 14], rows: sum },
    {
      name: '학생별 현황', colWidths: [8, 16, 14, 12, 10, 12], freezeRows: 1, filterRow: 1,
      rows: [t.overviewHeader.map(H), ...t.overview.map(r => r.map((v, i) => (i === 1 ? C(v) : N(v))))],
    },
    {
      name: '활동 기록', colWidths: [8, 16, 10, 22, 60, 13], freezeRows: 1, filterRow: 1,
      rows: [
        [H('번호'), H(t.overviewHeader[1]), H('주차'), H('활동명'), H('내용'), H('날짜')],
        ...(t.obsRows.length > 0
          ? t.obsRows.map(r => r.map((v, i) => (i === 3 || i === 4 || i === 1 ? C(v) : N(v))))
          : [[C('제출된 활동 기록이 없습니다.'), null, null, null, null, null] as (XCell | null)[]]),
      ],
    },
    {
      name: '결과물', colWidths: [8, 16, 10, 9, 24, 60, 12, 13], freezeRows: 1, filterRow: 1,
      rows: [
        [H('번호'), H(t.overviewHeader[1]), H('주차'), H('구분'), H('제목'), H('내용'), H('종류'), H('날짜')],
        ...(t.resRows.length > 0
          ? t.resRows.map(r => r.map((v, i) => (i === 4 || i === 5 || i === 1 ? C(v) : N(v))))
          : [[C('제출된 결과물이 없습니다.'), null, null, null, null, null, null, null] as (XCell | null)[]]),
      ],
    },
  ];

  if (surveys.length > 0) {
    sheets.push({
      name: '설문', colWidths: [44, 12, 10, 60],
      rows: [
        [{ value: '설문 결과 (응답자 구분 없이 질문별 집계)', style: 'title', span: 4 }, null, null, null],
        [null, null, null, null],
        ...(buildSurveyXlsxRows(toSurveyForms(surveys)) as (XCell | null)[][]),
      ],
    });
  }

  if (t.setechRows.length > 0) {
    sheets.push({
      name: '세특', colWidths: [8, 16, 10, 10, 70, 10], freezeRows: 1, filterRow: 1,
      rows: [
        [H('번호'), H(t.overviewHeader[1]), H('성취도'), H('상태'), H('세특 문장'), H('글자수')],
        ...t.setechRows.map(r => r.map((v, i) => (i === 1 || i === 4 ? C(v) : N(v)))),
      ],
    });
  }
  return sheets;
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export interface ShareSheetStudent {
  id: string;
  student_number: number | null;
  full_name: string;
  obs: { week_number: number | null; activity_name: string; content: string; created_at: string }[];
  results: {
    week_number: number | null;
    title: string | null;
    text_content: string | null;
    link_url?: string | null;
    file_url?: string | null;
    image_url?: string | null;
    image_urls?: string[];
    display_name?: string | null;
    created_at: string;
  }[];
}

export interface ShareSheetInput {
  className: string;
  students: ShareSheetStudent[];
  evalMap: Record<string, ExportEval | undefined>;
  surveys: ExportSurveyForm[];
  attendance?: { total: number; byStatus: Record<string, number> } | null;
}

/**
 * 공유 화면 엑셀: 전체 / 결과 / 기록 / 설문 네 시트.
 * 내용이 있는 시트만 만든다. 결과·기록·설문은 학생마다 제목 줄(번호+이름)을 두어 구분한다.
 */
export function buildShareSheets(input: ShareSheetInput): XSheet[] {
  const { students, evalMap, surveys, attendance } = input;
  const sorted = [...students].sort((a, b) => (a.student_number ?? 9999) - (b.student_number ?? 9999) || a.full_name.localeCompare(b.full_name, 'ko'));
  const label = (s: ShareSheetStudent) => `${s.student_number != null ? `${s.student_number}번 ` : ''}${s.full_name}`;
  const hasSetech = (s: ShareSheetStudent) => !!evalMap[s.id]?.setech_content;

  // ── 전체 ──
  const totalObs = sorted.reduce((a, s) => a + s.obs.length, 0);
  const totalRes = sorted.reduce((a, s) => a + s.results.length, 0);
  const active = sorted.filter(s => s.obs.length > 0 || s.results.length > 0).length;
  const all: (XCell | null)[][] = [];
  all.push([{ value: `${input.className} 전체 현황`, style: 'title', span: 6 }, null, null, null, null, null]);
  all.push([{ value: `내려받은 날 ${fmtDate(new Date().toISOString())}`, style: 'note', span: 6 }, null, null, null, null, null]);
  all.push([null, null, null, null, null, null]);
  all.push([{ value: '한눈에 보기', style: 'section', span: 6 }, null, null, null, null, null]);
  const kv = (k: string, v: string | number): (XCell | null)[] => [{ value: k, style: 'cell', span: 2 }, null, { value: v, style: 'num', span: 2 }, null, null, null];
  all.push(kv('전체 학생', sorted.length));
  all.push(kv('활동 기록(건)', totalObs));
  all.push(kv('결과물(건)', totalRes));
  all.push(kv('활동에 참여한 학생', `${active}명 (${sorted.length > 0 ? Math.round((active / sorted.length) * 100) : 0}%)`));
  if (surveys.length > 0) all.push(kv('설문(개)', surveys.length));
  if (attendance && attendance.total > 0) {
    all.push(kv('출석 비율', `${Math.round(((attendance.byStatus.present || 0) / attendance.total) * 100)}%`));
  }
  all.push([null, null, null, null, null, null]);
  all.push([{ value: '학생별 현황', style: 'section', span: 6 }, null, null, null, null, null]);
  all.push([H('번호'), H('이름'), H('활동 기록'), H('결과물'), H('성취도'), H('세특')]);
  sorted.forEach(s => {
    const ev = evalMap[s.id];
    all.push([N(s.student_number ?? ''), C(s.full_name), N(s.obs.length), N(s.results.length), N(ev?.achievement_level ?? ''), N(ev ? statusText(ev.status) : '미작성')]);
  });
  const sheets: XSheet[] = [{ name: '전체', colWidths: [8, 16, 12, 12, 12, 12], rows: all }];

  // ── 결과 ──
  const resStudents = sorted.filter(s => s.results.length > 0);
  if (resStudents.length > 0) {
    const rows: (XCell | null)[][] = [[H('번호'), H('이름'), H('주차'), H('제목'), H('내용'), H('종류'), H('날짜'), H('결과 보기'), H('결과 보기 2'), H('결과 보기 3')]];
    resStudents.forEach(s => {
      rows.push([{ value: `${label(s)} · 결과물 ${s.results.length}건`, style: 'section', span: 10 }, null, null, null, null, null, null, null, null, null]);
      [...s.results]
        .sort((a, b) => (a.week_number ?? 0) - (b.week_number ?? 0) || a.created_at.localeCompare(b.created_at))
        .forEach(r => {
          const c = resultContent([{
            result_type: 'text', text_content: r.text_content ?? null, link_url: r.link_url ?? null, file_url: r.file_url ?? null,
            display_name: r.display_name ?? null, image_url: r.image_url ?? null, image_urls: r.image_urls,
          }]);
          const imgs = r.image_urls && r.image_urls.length > 0 ? r.image_urls : r.image_url ? [r.image_url] : [];
          const links = [
            ...(r.link_url ? [{ text: '링크 열기', url: r.link_url }] : []),
            ...(r.file_url ? [{ text: '파일 열기', url: r.file_url }] : []),
            ...imgs.map((u, i) => ({ text: imgs.length > 1 ? `이미지 ${i + 1} 보기` : '이미지 보기', url: u })),
          ].filter(l => /^https?:\/\//.test(l.url)).slice(0, 3);
          const linkCell = (i: number): XCell => (links[i] ? { value: links[i].text, style: 'link', url: links[i].url } : C(''));
          rows.push([N(s.student_number ?? ''), C(s.full_name), N(weekLabel(r.week_number)), C(r.title || ''), C(c.text), N(c.kind), N(fmtDate(r.created_at)), linkCell(0), linkCell(1), linkCell(2)]);
        });
    });
    sheets.push({ name: '결과', colWidths: [8, 14, 10, 24, 55, 12, 13, 13, 13, 13], freezeRows: 1, rows });
  }

  // ── 기록 (활동 기록 + 세특) ──
  const recStudents = sorted.filter(s => s.obs.length > 0 || hasSetech(s));
  if (recStudents.length > 0) {
    const rows: (XCell | null)[][] = [[H('번호'), H('이름'), H('구분'), H('주차 / 성취도'), H('활동명'), H('내용'), H('날짜')]];
    recStudents.forEach(s => {
      const ev = evalMap[s.id];
      rows.push([{ value: `${label(s)} · 활동 기록 ${s.obs.length}건${hasSetech(s) ? ' · 세특 있음' : ''}`, style: 'section', span: 7 }, null, null, null, null, null, null]);
      [...s.obs]
        .sort((a, b) => (a.week_number ?? 0) - (b.week_number ?? 0) || a.created_at.localeCompare(b.created_at))
        .forEach(o => rows.push([N(s.student_number ?? ''), C(s.full_name), N('활동 기록'), N(weekLabel(o.week_number)), C(o.activity_name || ''), C(o.content || ''), N(fmtDate(o.created_at))]));
      if (hasSetech(s) && ev) {
        rows.push([N(s.student_number ?? ''), C(s.full_name), N('세특'), N(ev.achievement_level ? `성취도 ${ev.achievement_level}` : ''), C(statusText(ev.status)), C(ev.setech_content), N(`${ev.setech_content.length}자`)]);
      }
    });
    sheets.push({ name: '기록', colWidths: [8, 14, 11, 14, 22, 65, 12], freezeRows: 1, rows });
  }

  // ── 설문 ──
  if (surveys.length > 0) {
    sheets.push({
      name: '설문', colWidths: [44, 12, 10, 60],
      rows: [
        [{ value: '설문 결과 (응답자 구분 없이 질문별 집계)', style: 'title', span: 4 }, null, null, null],
        [null, null, null, null],
        ...(buildSurveyXlsxRows(toSurveyForms(surveys)) as (XCell | null)[][]),
      ],
    });
  }
  return sheets;
}
