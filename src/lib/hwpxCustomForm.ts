import type { LessonPlanSections } from './gemini';
import {
  type CoursePlanFormExtras,
  buildMethod, buildObjectives, buildOverview, buildPeriodText, buildTopicRows,
  bulletLines, packForm, sanitizeFileName, setCellLines, stripBullet, toLines,
} from './hwpxFormExport';

// 선생님이 올린 한글(hwpx) 서식에서 "이름표 칸 + 오른쪽 빈 칸"을 찾아,
// 칸마다 계획서의 어떤 내용을 넣을지 짝지어 채운다. (파일은 브라우저 안에서만 처리하고 서버로 보내지 않는다)
const HP_NS = 'http://www.hancom.co.kr/hwpml/2011/paragraph';
const MAX_LABEL_LENGTH = 25;

export type PlanItemId =
  | 'title' | 'subject' | 'target' | 'period' | 'sessions' | 'place' | 'teacher' | 'school'
  | 'overview' | 'objectives' | 'materials' | 'method' | 'assessment' | 'content';

export interface PlanItem {
  id: PlanItemId;
  label: string;
  // 이름표에 이 낱말이 들어 있으면 이 항목을 먼저 추천한다 (위에 있는 것이 우선)
  keywords: string[];
  value: (plan: LessonPlanSections, extras: CoursePlanFormExtras) => string[];
}

const contentLines = (plan: LessonPlanSections): string[] => {
  const rows = buildTopicRows(plan);
  if (rows.length === 1) return [...rows[0].body];
  return rows.flatMap((r, i) => [`${i + 1}차시 ${r.title.join(' ')}`.trim(), ...r.body]);
};

export const PLAN_ITEMS: PlanItem[] = [
  { id: 'overview', label: '개요', keywords: ['개요', '소개', '개설 목적', '목적', '취지'], value: p => buildOverview(p) },
  { id: 'objectives', label: '학습 목표', keywords: ['목표', '성취'], value: p => buildObjectives(p.objectives) },
  { id: 'title', label: '수업 이름(단원명)', keywords: ['강좌명', '프로그램명', '연수명', '과목명', '수업명', '단원', '주제', '제목', '강의명'], value: p => [p.basicInfo.unitTitle || p.basicInfo.subject || ''] },
  { id: 'subject', label: '교과', keywords: ['교과', '과목', '영역'], value: p => [p.basicInfo.subject || ''] },
  { id: 'target', label: '대상(학년)', keywords: ['대상', '학년', '학급'], value: p => [p.basicInfo.target || ''] },
  { id: 'period', label: '일시(날짜·차시)', keywords: ['일시', '기간', '날짜', '일자', '시간'], value: p => [buildPeriodText(p)] },
  { id: 'sessions', label: '차시 수', keywords: ['차시', '횟수', '회차', '시수'], value: p => [`${p.sessionPlans?.length || 1}차시`] },
  { id: 'place', label: '장소', keywords: ['장소', '교실', '강의실'], value: (_p, e) => [e.place || ''] },
  { id: 'teacher', label: '강사(교사) 이름', keywords: ['강사', '교사', '성명', '이름', '담당', '지도교사'], value: (_p, e) => [e.teacher || ''] },
  { id: 'school', label: '학교 이름', keywords: ['학교', '기관', '소속'], value: (_p, e) => [e.school || ''] },
  { id: 'materials', label: '준비물', keywords: ['준비물', '교구', '자료', '도구'], value: p => bulletLines(p.materials) },
  { id: 'method', label: '수업 방법', keywords: ['방법', '방식', '운영'], value: p => buildMethod(p) },
  { id: 'assessment', label: '평가 계획', keywords: ['평가', '유의'], value: p => toLines(p.assessment).map(stripBullet) },
  { id: 'content', label: '수업 내용(차시별 전체)', keywords: ['내용', '활동', '과정', '전개', '진행'], value: p => contentLines(p) },
];

export interface FormSlot {
  id: string;
  label: string;
  tableIndex: number;
  // 채울 빈 칸의 위치
  row: number;
  col: number;
  // 빈 칸의 크기(한글 단위). 글이 넘칠지 대략 가늠하는 데 쓴다
  width: number;
  height: number;
  suggestion: PlanItemId | null;
}

export interface ScanResult {
  slots: FormSlot[];
  // 이미 내용이 들어 있어 건드리지 않는 칸 수
  untouchedCount: number;
  tableCount: number;
}

export class FormScanError extends Error {}

function tablesOf(doc: Document): Element[] {
  return Array.from(doc.getElementsByTagNameNS(HP_NS, 'tbl'));
}

// 표 한 개의 칸들 (표 안의 표는 제외)
function cellsOf(tbl: Element): Element[] {
  const out: Element[] = [];
  Array.from(tbl.children).filter(el => el.localName === 'tr').forEach(tr => {
    Array.from(tr.children).filter(el => el.localName === 'tc').forEach(tc => out.push(tc));
  });
  return out;
}

function cellInfo(tc: Element) {
  const a = tc.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
  const span = tc.getElementsByTagNameNS(HP_NS, 'cellSpan')[0];
  const size = tc.getElementsByTagNameNS(HP_NS, 'cellSz')[0];
  const text = Array.from(tc.getElementsByTagNameNS(HP_NS, 't')).map(t => t.textContent ?? '').join('').replace(/\s+/g, ' ').trim();
  return {
    row: Number(a?.getAttribute('rowAddr') ?? -1),
    col: Number(a?.getAttribute('colAddr') ?? -1),
    colSpan: Number(span?.getAttribute('colSpan') ?? 1) || 1,
    width: Number(size?.getAttribute('width') ?? 0),
    height: Number(size?.getAttribute('height') ?? 0),
    text,
  };
}

function suggest(label: string): PlanItemId | null {
  const compact = label.replace(/\s+/g, '');
  const hit = PLAN_ITEMS.find(item => item.keywords.some(k => compact.includes(k.replace(/\s+/g, ''))));
  return hit?.id ?? null;
}

async function loadZip(file: File) {
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 4));
  if (head[0] === 0xd0 && head[1] === 0xcf) {
    throw new FormScanError('옛 형식(hwp) 파일이에요. 한글에서 파일을 열고 [다른 이름으로 저장] → 파일 형식을 "한글 문서(*.hwpx)"로 골라 저장한 뒤 다시 올려 주세요.');
  }
  if (head[0] !== 0x50 || head[1] !== 0x4b) {
    throw new FormScanError('한글(hwpx) 파일이 아니에요. 확장자가 .hwpx인 파일을 올려 주세요.');
  }
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buf);
  const xml = zip.file('Contents/section0.xml');
  if (!xml) throw new FormScanError('한글 파일 안에서 본문을 찾지 못했어요. 한글에서 다시 저장해서 올려 주세요.');
  const doc = new DOMParser().parseFromString(await xml.async('string'), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) throw new FormScanError('파일 내용을 읽지 못했어요. 한글에서 다시 저장해서 올려 주세요.');
  return { zip, doc };
}

export async function scanCustomForm(file: File): Promise<ScanResult> {
  const { doc } = await loadZip(file);
  const tables = tablesOf(doc);
  if (tables.length === 0) throw new FormScanError('이 서식에는 표가 없어요. 이름표 칸과 빈 칸이 있는 표 모양 서식만 쓸 수 있어요.');
  const slots: FormSlot[] = [];
  let untouched = 0;
  tables.forEach((tbl, tableIndex) => {
    const infos = cellsOf(tbl).map(cellInfo);
    infos.forEach(label => {
      if (!label.text || label.text.length > MAX_LABEL_LENGTH) return;
      const right = infos.find(c => c.row === label.row && c.col === label.col + label.colSpan);
      if (!right) return;
      if (right.text) { untouched += 1; return; }
      slots.push({
        id: `${tableIndex}:${right.row}:${right.col}`,
        label: label.text,
        tableIndex,
        row: right.row,
        col: right.col,
        width: right.width,
        height: right.height,
        suggestion: suggest(label.text),
      });
    });
  });
  if (slots.length === 0) {
    throw new FormScanError('채울 수 있는 칸을 찾지 못했어요. 이름표 칸(예: "강좌명") 바로 오른쪽에 빈 칸이 있는 표 서식이어야 해요.');
  }
  return { slots, untouchedCount: untouched, tableCount: tables.length };
}

export function valueFor(itemId: PlanItemId, plan: LessonPlanSections, extras: CoursePlanFormExtras): string[] {
  const item = PLAN_ITEMS.find(i => i.id === itemId);
  return item ? item.value(plan, extras).filter(Boolean) : [];
}

// 칸 크기로 볼 때 글이 넘쳐 서식이 한 장을 넘길 수 있는지 대략 가늠한다 (글자 한 칸 약 1,000, 줄 높이 약 1,600)
export function mayOverflow(slot: FormSlot, lines: string[]): boolean {
  if (lines.length === 0 || slot.width <= 0) return false;
  const perLine = Math.max(1, Math.floor(slot.width / 1000));
  const needed = lines.reduce((sum, l) => sum + Math.max(1, Math.ceil(l.length / perLine)), 0);
  const capacity = Math.max(1, Math.floor(slot.height / 1600));
  return needed > capacity + 1;
}

export async function buildCustomForm(
  file: File,
  mapping: Record<string, PlanItemId | ''>,
  plan: LessonPlanSections,
  extras: CoursePlanFormExtras,
  slots: FormSlot[],
): Promise<{ blob: Blob; fileName: string }> {
  const { zip, doc } = await loadZip(file);
  const tables = tablesOf(doc);
  slots.forEach(slot => {
    const itemId = mapping[slot.id];
    if (!itemId) return;
    const tbl = tables[slot.tableIndex];
    const tc = tbl && cellsOf(tbl).find(c => {
      const info = cellInfo(c);
      return info.row === slot.row && info.col === slot.col;
    });
    if (!tc) return;
    const lines = valueFor(itemId, plan, extras);
    if (lines.length > 0) setCellLines(tc, lines);
  });
  const blob = await packForm(zip, doc);
  const base = file.name.replace(/\.hwpx$/i, '');
  return { blob, fileName: `${sanitizeFileName(plan.basicInfo.unitTitle || base)}_${sanitizeFileName(base)}.hwpx` };
}
