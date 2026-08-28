import type { LessonPlanSections, LessonPlanSessionRow } from './gemini';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function paragraphsHtml(text: string): string {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return '<p style="color:#999;">-</p>';
  return lines.map(l => `<p style="margin:0 0 6px;">${escapeHtml(l)}</p>`).join('');
}

const SECTION_TITLE_STYLE = 'font-size:15px;font-weight:700;margin:20px 0 8px;border-left:4px solid #4f46e5;padding-left:8px;';

function sessionPlansTableHtml(rows: LessonPlanSessionRow[]): string {
  if (rows.length === 0) return '<p style="color:#999;">-</p>';
  return `
    <table style="width:100%;border-collapse:collapse;margin-top:8px;">
      <thead>
        <tr>
          <th style="width:70px;text-align:left;background:#f3f4f6;border:1px solid #d1d5db;padding:8px;font-size:12px;">차시</th>
          <th style="width:140px;text-align:left;background:#f3f4f6;border:1px solid #d1d5db;padding:8px;font-size:12px;">제목</th>
          <th style="text-align:left;background:#f3f4f6;border:1px solid #d1d5db;padding:8px;font-size:12px;">내용</th>
          <th style="width:110px;text-align:left;background:#f3f4f6;border:1px solid #d1d5db;padding:8px;font-size:12px;">비고</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td style="border:1px solid #d1d5db;padding:8px;font-size:12px;vertical-align:top;">${escapeHtml(r.session || '-')}</td>
            <td style="border:1px solid #d1d5db;padding:8px;font-size:12px;vertical-align:top;font-weight:600;">${escapeHtml(r.title || '-')}</td>
            <td style="border:1px solid #d1d5db;padding:8px;font-size:12px;vertical-align:top;white-space:pre-wrap;">${escapeHtml(r.content || '-')}</td>
            <td style="border:1px solid #d1d5db;padding:8px;font-size:12px;vertical-align:top;">${escapeHtml(r.note || '-')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}

export function buildLessonPlanHtml(plan: LessonPlanSections): string {
  const { basicInfo } = plan;
  const rows: Array<[string, string]> = [
    ['과목', basicInfo.subject],
    ['단원/차시', basicInfo.unitTitle],
    ['대상', basicInfo.target],
    ['차시', basicInfo.periods],
    ['일자', basicInfo.date],
    ['학생 수', basicInfo.studentCount != null ? String(basicInfo.studentCount) : '-'],
  ];

  const basicInfoTable = `
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <tbody>
        ${rows.map(([label, value]) => `
          <tr>
            <th style="width:110px;text-align:left;background:#f3f4f6;border:1px solid #d1d5db;padding:8px;font-size:13px;">${escapeHtml(label)}</th>
            <td style="border:1px solid #d1d5db;padding:8px;font-size:13px;">${escapeHtml(value || '-')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;

  const sections: string[] = [];
  sections.push(`<h1 style="font-size:20px;font-weight:800;margin:0 0 16px;">${escapeHtml(basicInfo.unitTitle || '수업 계획서')}</h1>`);
  sections.push(basicInfoTable);
  sections.push(`<h2 style="${SECTION_TITLE_STYLE}">학습목표</h2>${paragraphsHtml(plan.objectives)}`);
  if (plan.sessionPlans) {
    sections.push(`<h2 style="${SECTION_TITLE_STYLE}">차시별 내용</h2>${sessionPlansTableHtml(plan.sessionPlans)}`);
  } else if (plan.activities) {
    sections.push(`<h2 style="${SECTION_TITLE_STYLE}">활동 흐름</h2>
      <h3 style="font-size:13px;font-weight:700;margin:10px 0 4px;">도입</h3>${paragraphsHtml(plan.activities.intro)}
      <h3 style="font-size:13px;font-weight:700;margin:10px 0 4px;">전개</h3>${paragraphsHtml(plan.activities.development)}
      <h3 style="font-size:13px;font-weight:700;margin:10px 0 4px;">정리</h3>${paragraphsHtml(plan.activities.closing)}`);
  }
  sections.push(`<h2 style="${SECTION_TITLE_STYLE}">준비물</h2>${paragraphsHtml(plan.materials)}`);
  if (plan.assessment) {
    sections.push(`<h2 style="${SECTION_TITLE_STYLE}">평가계획</h2>${paragraphsHtml(plan.assessment)}`);
  }
  if (plan.standards) {
    sections.push(`<h2 style="${SECTION_TITLE_STYLE}">성취기준 연계</h2>${paragraphsHtml(plan.standards)}`);
  }

  return `<div style="font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:#111827;line-height:1.6;">${sections.join('\n')}</div>`;
}

function htmlToPlainText(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || div.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
}

export async function copyLessonPlanToClipboard(plan: LessonPlanSections): Promise<void> {
  const html = buildLessonPlanHtml(plan);
  const htmlBlob = new Blob([html], { type: 'text/html' });
  const textBlob = new Blob([htmlToPlainText(html)], { type: 'text/plain' });
  await navigator.clipboard.write([
    new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob }),
  ]);
}

// jsPDF의 html2canvas 기반 렌더링이 표(차시별 내용) 포함 레이아웃에서 빈 페이지를 내는
// 문제가 있어, 브라우저 자체 인쇄 대화상자를 열어 "PDF로 저장"하도록 대체.
export function exportLessonPlanToPdf(plan: LessonPlanSections): void {
  const title = plan.basicInfo.unitTitle || '수업계획서';
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; }
  table { page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  h1, h2 { page-break-after: avoid; }
</style>
</head><body>${buildLessonPlanHtml(plan)}</body></html>`);
  doc.close();

  const cleanup = () => { if (iframe.parentNode) document.body.removeChild(iframe); };
  const triggerPrint = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  };

  iframe.contentWindow?.addEventListener('afterprint', cleanup);
  setTimeout(triggerPrint, 200);
  setTimeout(cleanup, 120000);
}
