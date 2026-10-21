import type { LessonPlanSections } from './gemini';

// 학교 서식(강좌 강의계획서형) hwpx 틀의 빈칸에 계획서 내용을 채워 내려받는다.
// 틀 파일: public/forms/course-plan-form.hwpx (라벨만 남기고 내용은 비운 상태)
const FORM_URL = '/forms/course-plan-form.hwpx';
const HP_NS = 'http://www.hancom.co.kr/hwpml/2011/paragraph';
const FIRST_DATA_ROW = 6;

export type FormKind = 'basic' | 'detail' | 'operation';

const OPERATION_FORM_URL = '/forms/course-operation-plan-form.hwpx';

const CARD_FORM_URL = '/forms/instructor-card-form.hwpx';

export interface CoursePlanFormExtras {
  school?: string;
  place: string;
  teacher: string;
  hoursPerSession: string;
}

export function toLines(text: string | undefined | null): string[] {
  return (text ?? '').split('\n').map(l => l.trim()).filter(Boolean);
}

// 앞에 붙은 글머리 기호(-, •, ·)는 걷어낸다
export function stripBullet(line: string): string {
  return line.replace(/^[-•·*]\s*/, '');
}

export function bulletLines(text: string | undefined | null): string[] {
  return toLines(text).map(l => `· ${stripBullet(l)}`);
}

export function getTcs(root: Element): Element[] {
  return Array.from(root.getElementsByTagNameNS(HP_NS, 'tc'));
}

export function addrOf(tc: Element): { row: number; col: number } {
  const a = tc.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
  return { row: Number(a.getAttribute('rowAddr')), col: Number(a.getAttribute('colAddr')) };
}

function findCell(tcs: Element[], row: number, col: number): Element | null {
  return tcs.find(tc => {
    const a = addrOf(tc);
    return a.row === row && a.col === col;
  }) ?? null;
}

// 칸 안의 첫 문단을 본보기로 삼아 줄마다 문단을 만들어 채운다 (글꼴·정렬 유지)
export function setCellLines(tc: Element, lines: string[]): void {
  const subList = tc.getElementsByTagNameNS(HP_NS, 'subList')[0];
  const paras = Array.from(subList.children).filter(el => el.localName === 'p');
  const proto = paras[0];
  if (!proto) return;
  // 글자를 바꾸면 옛 줄 배치 정보가 남아 글자가 겹치므로 걷어낸다
  const dropLayout = (el: Element) => Array.from(el.getElementsByTagNameNS(HP_NS, 'linesegarray')).forEach(n => n.parentNode?.removeChild(n));
  const values = lines.length > 0 ? lines : [''];
  paras.forEach(p => subList.removeChild(p));
  values.forEach((line, idx) => {
    const p = proto.cloneNode(true) as Element;
    dropLayout(p);
    p.setAttribute('id', idx === 0 ? proto.getAttribute('id') ?? '0' : '0');
    const run = Array.from(p.children).find(el => el.localName === 'run');
    if (run) {
      Array.from(run.children).filter(el => el.localName === 't').forEach(t => run.removeChild(t));
      if (line) {
        const t = p.ownerDocument.createElementNS(HP_NS, 'hp:t');
        t.textContent = line;
        run.appendChild(t);
      }
    }
    subList.appendChild(p);
  });
}

export function buildPeriodText(plan: LessonPlanSections): string {
  const { date, periods } = plan.basicInfo;
  return [date, periods].map(s => (s ?? '').trim()).filter(Boolean).join(' | ');
}

export function buildOverview(plan: LessonPlanSections): string[] {
  const { subject, target, unitTitle } = plan.basicInfo;
  const who = (target ?? '').trim();
  const what = (subject ?? '').trim();
  const lines: string[] = [];
  if (who || what || unitTitle) {
    lines.push(`${who ? who + ' 대상 ' : ''}${what ? what + ' ' : ''}수업으로, '${unitTitle}' 내용을 다룹니다.`);
  }
  lines.push(...toLines(plan.standards).map(stripBullet));
  return lines;
}

// 학습목표는 서식 예시처럼 번호를 붙여 적는다 (이미 번호가 있으면 그대로)
export function buildObjectives(text: string): string[] {
  let n = 0;
  return toLines(text).map(l => {
    const body = stripBullet(l);
    if (/^(\d+[.)]|[①-⑩])/.test(body)) return body;
    n += 1;
    return `${n}. ${body}`;
  });
}

export function buildMethod(plan: LessonPlanSections): string[] {
  const lines: string[] = [];
  if (plan.sessionPlans && plan.sessionPlans.length > 0) {
    lines.push(`차시별 활동 중심 수업 (총 ${plan.sessionPlans.length}회차)`);
  } else if (plan.activities) {
    lines.push(`도입: ${toLines(plan.activities.intro).map(stripBullet).join(' ')}`);
    lines.push(`전개: ${toLines(plan.activities.development).map(stripBullet).join(' ')}`);
    lines.push(`정리: ${toLines(plan.activities.closing).map(stripBullet).join(' ')}`);
  }
  const mats = toLines(plan.materials).map(stripBullet).join(', ');
  if (mats) lines.push(`준비물: ${mats}`);
  return lines;
}

export interface TopicRow { title: string[]; body: string[] }

export function buildTopicRows(plan: LessonPlanSections): TopicRow[] {
  if (plan.sessionPlans && plan.sessionPlans.length > 0) {
    return plan.sessionPlans.map(r => ({
      title: [r.title || r.session || ''],
      body: bulletLines(r.content),
    }));
  }
  if (plan.activities) {
    const a = plan.activities;
    return [{
      title: [plan.basicInfo.unitTitle || ''],
      body: [...bulletLines(a.intro), ...bulletLines(a.development), ...bulletLines(a.closing)],
    }];
  }
  return [{ title: [plan.basicInfo.unitTitle || ''], body: [] }];
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '').trim() || '수업계획서';
}

export async function buildLessonPlanCourseForm(
  plan: LessonPlanSections,
  extras: CoursePlanFormExtras,
): Promise<{ blob: Blob; fileName: string }> {
  const [{ default: JSZip }, res] = await Promise.all([import('jszip'), fetch(FORM_URL)]);
  if (!res.ok) throw new Error('서식 틀 파일을 불러오지 못했어요.');
  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  const sectionFile = zip.file('Contents/section0.xml');
  if (!sectionFile) throw new Error('서식 틀 파일이 올바르지 않아요.');

  const doc = new DOMParser().parseFromString(await sectionFile.async('string'), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) throw new Error('서식 틀 파일을 읽지 못했어요.');
  const tbl = doc.getElementsByTagNameNS(HP_NS, 'tbl')[0];
  if (!tbl) throw new Error('서식 틀에서 표를 찾지 못했어요.');

  // 위쪽 칸 채우기
  const tcs = getTcs(tbl);
  const fill = (row: number, col: number, lines: string[]) => {
    const tc = findCell(tcs, row, col);
    if (tc) setCellLines(tc, lines);
  };
  fill(0, 2, [plan.basicInfo.unitTitle || plan.basicInfo.subject || '']);
  fill(0, 4, [extras.place.trim()]);
  fill(1, 2, [buildPeriodText(plan)]);
  fill(2, 2, buildOverview(plan));
  fill(3, 2, buildObjectives(plan.objectives));
  fill(4, 2, buildMethod(plan));

  // 아래 시간표: 본보기 줄을 복사해 회차 수만큼 늘린다
  const rows = Array.from(tbl.children).filter(el => el.localName === 'tr');
  const protoRow = rows[FIRST_DATA_ROW];
  if (protoRow) {
    const topics = buildTopicRows(plan);
    const hours = extras.hoursPerSession.trim();
    const teacher = extras.teacher.trim();
    const protoClone = protoRow.cloneNode(true) as Element;
    topics.forEach((topic, idx) => {
      const tr = idx === 0 ? protoRow : (protoClone.cloneNode(true) as Element);
      if (idx > 0) tbl.appendChild(tr);
      const rowIndex = FIRST_DATA_ROW + idx;
      const rowTcs = getTcs(tr);
      rowTcs.forEach(tc => tc.getElementsByTagNameNS(HP_NS, 'cellAddr')[0].setAttribute('rowAddr', String(rowIndex)));
      const cell = (col: number) => rowTcs.find(tc => addrOf(tc).col === col);
      const set = (col: number, lines: string[]) => { const tc = cell(col); if (tc) setCellLines(tc, lines); };
      set(0, [String(idx + 1)]);
      set(1, topic.title);
      set(2, topic.body);
      set(5, [hours]);
      set(6, [teacher]);
    });
    tbl.setAttribute('rowCnt', String(FIRST_DATA_ROW + topics.length));
  }

  zip.file('Contents/section0.xml', new XMLSerializer().serializeToString(doc), { createFolders: false });
  const mimetype = zip.file('mimetype');
  if (mimetype) zip.file('mimetype', await mimetype.async('string'), { compression: 'STORE', createFolders: false });
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/hwp+zip', compression: 'DEFLATE' });

  const title = plan.basicInfo.unitTitle || '수업계획서';
  return { blob, fileName: `${sanitizeFileName(title)}_강의계획서.hwpx` };
}

export async function packForm(zip: InstanceType<typeof import('jszip')>, doc: Document): Promise<Blob> {
  zip.file('Contents/section0.xml', new XMLSerializer().serializeToString(doc), { createFolders: false });
  const mimetype = zip.file('mimetype');
  if (mimetype) zip.file('mimetype', await mimetype.async('string'), { compression: 'STORE', createFolders: false });
  return zip.generateAsync({ type: 'blob', mimeType: 'application/hwp+zip', compression: 'DEFLATE' });
}

// 상세형: 강사관리카드 서식. 계획서에서 알 수 있는 강의 정보 칸만 채우고, 개인정보 칸은 비워 둔다
export async function buildLessonPlanInstructorCard(
  plan: LessonPlanSections,
  extras: CoursePlanFormExtras,
): Promise<{ blob: Blob; fileName: string }> {
  const [{ default: JSZip }, res] = await Promise.all([import('jszip'), fetch(CARD_FORM_URL)]);
  if (!res.ok) throw new Error('서식 틀 파일을 불러오지 못했어요.');
  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  const sectionFile = zip.file('Contents/section0.xml');
  if (!sectionFile) throw new Error('서식 틀 파일이 올바르지 않아요.');
  const doc = new DOMParser().parseFromString(await sectionFile.async('string'), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) throw new Error('서식 틀 파일을 읽지 못했어요.');

  const tbl = Array.from(doc.getElementsByTagNameNS(HP_NS, 'tbl')).find(t => t.getAttribute('rowCnt') === '16');
  if (!tbl) throw new Error('서식 틀에서 표를 찾지 못했어요.');
  const tcs = getTcs(tbl);
  const teacher = extras.teacher.trim();
  const fill = (row: number, col: number, lines: string[]) => {
    const tc = findCell(tcs, row, col);
    if (tc) setCellLines(tc, lines);
  };
  const objectives = buildObjectives(plan.objectives).slice(0, 2).map(l => l.replace(/^\d+[.)]\s*/, ''));
  // 한 장에 들어가도록 긴 글은 줄여 넣는다
  const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
  fill(1, 4, [teacher]);
  fill(5, 1, [teacher]);
  fill(5, 3, [clip(buildPeriodText(plan), 30)]);
  fill(6, 1, [clip(plan.basicInfo.unitTitle || plan.basicInfo.subject || '', 45)]);
  fill(7, 1, [clip(objectives.join(' / '), 80)]);

  // 승낙문의 학교·강사 이름 자리
  const school = (extras.school ?? '').trim() || '(학교명)';
  Array.from(doc.getElementsByTagNameNS(HP_NS, 't')).forEach(t => {
    const v = t.textContent ?? '';
    if (v.includes('{{')) t.textContent = v.replace(/\{\{SCHOOL\}\}/g, school).replace(/\{\{TEACHER\}\}/g, teacher);
  });

  const blob = await packForm(zip, doc);
  const title = plan.basicInfo.unitTitle || '수업계획서';
  return { blob, fileName: `${sanitizeFileName(title)}_강사관리카드.hwpx` };
}

// 강좌 운영 계획서(고교학점제 지역연계형): 기관 정보·차시별 표·학습목표를 채운다
export async function buildLessonPlanOperationForm(
  plan: LessonPlanSections,
  extras: CoursePlanFormExtras,
): Promise<{ blob: Blob; fileName: string }> {
  const [{ default: JSZip }, res] = await Promise.all([import('jszip'), fetch(OPERATION_FORM_URL)]);
  if (!res.ok) throw new Error('서식 틀 파일을 불러오지 못했어요.');
  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  const sectionFile = zip.file('Contents/section0.xml');
  if (!sectionFile) throw new Error('서식 틀 파일이 올바르지 않아요.');
  const doc = new DOMParser().parseFromString(await sectionFile.async('string'), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) throw new Error('서식 틀 파일을 읽지 못했어요.');

  const tbls = Array.from(doc.getElementsByTagNameNS(HP_NS, 'tbl'));
  const [, info, note, , planTbl] = tbls;
  if (!info || !note || !planTbl) throw new Error('서식 틀에서 표를 찾지 못했어요.');
  const fillIn = (tbl: Element, row: number, col: number, lines: string[]) => {
    const tc = findCell(getTcs(tbl), row, col);
    if (tc) setCellLines(tc, lines);
  };

  const { unitTitle, subject, target } = plan.basicInfo;
  const topics = buildTopicRows(plan);
  const mats = toLines(plan.materials).map(stripBullet);
  const place = extras.place.trim();

  fillIn(info, 2, 1, [`${topics.length}차시`]);
  fillIn(info, 3, 1, [place]);
  fillIn(info, 5, 3, [extras.teacher.trim()]);
  fillIn(note, 0, 0, [`- 준비물: ${mats.join(', ')}`.trimEnd()]);

  fillIn(planTbl, 1, 2, [subject || '']);
  fillIn(planTbl, 1, 4, [unitTitle || subject || '']);
  fillIn(planTbl, 3, 2, [buildPeriodText(plan)]);
  fillIn(planTbl, 3, 4, [place]);
  fillIn(planTbl, 3, 5, [(target ?? '').trim()]);
  fillIn(planTbl, 3, 7, mats);
  fillIn(planTbl, 7, 2, buildObjectives(plan.objectives).map(l => l.replace(/^(\d+)\./, '$1)')));

  // 차시별 표: 본보기 줄(첫 줄)을 복사해 회차 수만큼 늘린다
  const FIRST = 9;
  const rows = Array.from(planTbl.children).filter(el => el.localName === 'tr');
  const protoRow = rows[FIRST];
  if (protoRow) {
    const protoClone = protoRow.cloneNode(true) as Element;
    topics.forEach((topic, idx) => {
      const tr = idx === 0 ? protoRow : (protoClone.cloneNode(true) as Element);
      if (idx > 0) planTbl.appendChild(tr);
      const rowTcs = getTcs(tr);
      rowTcs.forEach(tc => tc.getElementsByTagNameNS(HP_NS, 'cellAddr')[0].setAttribute('rowAddr', String(FIRST + idx)));
      const set = (col: number, lines: string[]) => {
        const tc = rowTcs.find(c => addrOf(c).col === col);
        if (tc) setCellLines(tc, lines);
      };
      set(1, [String(idx + 1)]);
      set(2, topic.title);
      set(3, topic.body);
    });
    planTbl.setAttribute('rowCnt', String(FIRST + topics.length));
    const labelCell = findCell(getTcs(planTbl), FIRST - 1, 0);
    labelCell?.getElementsByTagNameNS(HP_NS, 'cellSpan')[0]?.setAttribute('rowSpan', String(1 + topics.length));
  }

  Array.from(doc.getElementsByTagNameNS(HP_NS, 't')).forEach(t => {
    const v = t.textContent ?? '';
    if (v.includes('{{PROGRAM}}')) t.textContent = v.replace('{{PROGRAM}}', unitTitle || subject || '');
    else if (v.includes('(10차시용)')) t.textContent = v.replace('(10차시용)', `(${topics.length}차시용)`);
  });

  const blob = await packForm(zip, doc);
  return { blob, fileName: `${sanitizeFileName(unitTitle || '수업계획서')}_강좌운영계획서.hwpx` };
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
