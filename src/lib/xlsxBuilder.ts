/**
 * JSZip 기반 XLSX 빌더.
 * 외부 의존성 없이 스타일이 포함된 xlsx 파일을 생성한다.
 * Style index:
 *   0 = normal
 *   1 = header  (하늘색 배경, 굵음, 가운데 정렬, 테두리)
 *   2 = section (연한 하늘색 배경, 굵음, 가운데 정렬)
 *   3 = wrap    (줄바꿈, 위 정렬)
 */
import JSZip from 'jszip';

export type CellStyle = 'normal' | 'header' | 'section' | 'wrap' | 'title' | 'note' | 'cell' | 'num';

export interface XCell {
  value: string | number | null;
  style?: CellStyle;
  span?: number; // 열 병합 수
}

export interface XSheet {
  name: string;
  colWidths: number[];
  rows: (XCell | null)[][];
  /** 위에서부터 이 줄 수만큼 스크롤해도 고정 (1 = 첫 줄) */
  freezeRows?: number;
  /** 이 줄(1부터)을 머리글로 보고 필터 버튼을 붙인다 */
  filterRow?: number;
}

// ── XML 특수문자 이스케이프 ───────────────────────────────────────────────────
const ESC = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── 열 번호(0-based) → 문자(A, B, … AA …) ───────────────────────────────────
function colName(n: number): string {
  let name = '';
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}

// ── 고정 스타일 XML ──────────────────────────────────────────────────────────
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><sz val="11"/><color theme="1"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color theme="1"/><name val="Calibri"/></font>
    <font><b/><sz val="15"/><color theme="1"/><name val="Calibri"/></font>
    <font><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD6EAF8"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEBF5FB"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFB8D4E8"/></left>
      <right style="thin"><color rgb="FFB8D4E8"/></right>
      <top style="thin"><color rgb="FFB8D4E8"/></top>
      <bottom style="thin"><color rgb="FFB8D4E8"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="8">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const STYLE_IDX: Record<CellStyle, number> = {
  normal: 0,
  header: 1,
  section: 2,
  wrap: 3,
  title: 4,
  note: 5,
  cell: 6,
  num: 7,
};

// ── 워크시트 XML 생성 ─────────────────────────────────────────────────────────
function buildWorksheetXml(sheet: XSheet, ssIndexOf: (s: string) => number, selected: boolean): string {
  const colsXml = sheet.colWidths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('');

  const merges: string[] = [];
  const rowXmls: string[] = [];

  sheet.rows.forEach((row, ri) => {
    if (!row) return;
    const rNum = ri + 1;
    const cells: string[] = [];

    row.forEach((cell, ci) => {
      if (cell === null) return; // 병합된 셀은 생략
      const ref = colName(ci) + rNum;
      const sIdx = STYLE_IDX[cell.style ?? 'normal'];
      const sAttr = sIdx > 0 ? ` s="${sIdx}"` : '';

      if (cell.value === null || cell.value === '' || cell.value === undefined) {
        cells.push(`<c r="${ref}"${sAttr}/>`);
      } else if (typeof cell.value === 'number') {
        cells.push(`<c r="${ref}"${sAttr} t="n"><v>${cell.value}</v></c>`);
      } else {
        const idx = ssIndexOf(String(cell.value));
        cells.push(`<c r="${ref}"${sAttr} t="s"><v>${idx}</v></c>`);
      }

      if (cell.span && cell.span > 1) {
        merges.push(`<mergeCell ref="${ref}:${colName(ci + cell.span - 1)}${rNum}"/>`);
      }
    });

    rowXmls.push(`<row r="${rNum}">${cells.join('')}</row>`);
  });

  const lastCol = colName(Math.max(0, sheet.colWidths.length - 1));
  const filterXml = sheet.filterRow
    ? `<autoFilter ref="A${sheet.filterRow}:${lastCol}${Math.max(sheet.filterRow, sheet.rows.length)}"/>`
    : '';
  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.join('')}</mergeCells>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews><sheetView${selected ? ' tabSelected="1"' : ''} workbookViewId="0">${
    sheet.freezeRows ? `<pane ySplit="${sheet.freezeRows}" topLeftCell="A${sheet.freezeRows + 1}" activePane="bottomLeft" state="frozen"/>` : ''
  }</sheetView></sheetViews>
  <cols>${colsXml}</cols>
  <sheetData>${rowXmls.join('')}</sheetData>
  ${filterXml}
  ${mergeXml}
</worksheet>`;
}

// ── 공개 API ─────────────────────────────────────────────────────────────────
export async function buildXlsxBlob(sheets: XSheet[]): Promise<Blob> {
  const strings: string[] = [];
  const strMap = new Map<string, number>();
  const ssIndexOf = (s: string): number => {
    if (!strMap.has(s)) { strMap.set(s, strings.length); strings.push(s); }
    return strMap.get(s)!;
  };

  // 워크시트 XML 생성 (이 과정에서 공유 문자열 테이블이 채워진다)
  const wsXmls = sheets.map((s, i) => buildWorksheetXml(s, ssIndexOf, i === 0));

  const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">
${strings.map((s) => `<si><t xml:space="preserve">${ESC(s)}</t></si>`).join('')}
</sst>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="14400" windowHeight="8700"/></bookViews>
  <sheets>
    ${sheets.map((s, i) => `<sheet name="${ESC(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}
  </sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId${sheets.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', rootRels);
  zip.file('xl/workbook.xml', workbookXml);
  zip.file('xl/_rels/workbook.xml.rels', workbookRels);
  zip.file('xl/styles.xml', STYLES_XML);
  zip.file('xl/sharedStrings.xml', sharedStringsXml);
  wsXmls.forEach((xml, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, xml));

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
