import { Marp } from '@marp-team/marp-core';
import { normalizeStandaloneHr, normalizeHeadingSpace } from '../components/PresentationModal';

// 화면 표시용 — inlineSVG로 렌더링해 슬라이드 하나하나가 자체 비율(16:9)을 유지한 채
// 컨테이너 크기에 맞춰 자연스럽게 확대/축소되도록 한다.
let marpDisplayInstance: Marp | null = null;
function getDisplayMarp(): Marp {
  if (!marpDisplayInstance) {
    marpDisplayInstance = new Marp({ html: true, inlineSVG: true, headingDivider: 1 });
  }
  return marpDisplayInstance;
}

// PDF 내보내기용 — html2canvas는 <svg><foreignObject> 조합을 제대로 캡처하지 못하므로,
// 내보내기 때는 순수 <section> 엘리먼트로 렌더링해 각 슬라이드를 그대로 캡처한다.
let marpExportInstance: Marp | null = null;
function getExportMarp(): Marp {
  if (!marpExportInstance) {
    marpExportInstance = new Marp({ html: true, inlineSVG: false, headingDivider: 1 });
  }
  return marpExportInstance;
}

// CommonMark 델리미터 규칙 보정: 닫는 `**` 바로 앞이 `]`같은 문장부호이고
// 뒤에 공백 없이 글자(주로 한글 조사)가 바로 붙으면 "right-flanking" 조건을
// 만족하지 못해 볼드로 닫히지 않는다. 닫는 `**` 뒤에 공백을 한 칸 넣어 보정.
function fixBoldFlanking(content: string): string {
  return content.replace(/\*\*([^\n*]+?[\])}"'.,;:!?…”’」』》〉])\*\*(?=[^\s*\n])/g, '**$1** ');
}

const normalize = (content: string) =>
  fixBoldFlanking(normalizeHeadingSpace(normalizeStandaloneHr(content || '')));

// 사이트 브랜드 팔레트(보라 #8b5cf6 / 시안 #06b6d4 / 핑크 #f472b6)를 반영한
// Marp 커스텀 테마. Marp 기본 테마 CSS 뒤에 이어붙여 덮어쓴다.
// 화면표시(inlineSVG:true, `div.marpit > svg > foreignObject > section`)와
// PDF 내보내기(inlineSVG:false, `div.marpit > section`) 두 구조를 모두 지원.
// 화면표시(svg>foreignObject>section)와 PDF 내보내기(순수 section) 두 구조 각각에
// 대해 접미사(자손 선택자/의사요소 등)를 안전하게 붙여 콤마로 묶은 선택자 목록을 만든다.
// (주의: 루트 선택자 문자열 자체에 콤마가 들어있으므로 `${ROOT}접미사` 형태로 직접
// 이어붙이면 콤마 앞뒤가 서로 다른 선택자로 쪼개져 의도와 다르게 파싱된다 — 반드시 이 헬퍼를 통할 것.)
const ROOTS = ['div.marpit > svg > foreignObject > section', 'div.marpit > section'];
const sel = (suffix = '') => ROOTS.map(r => `${r}${suffix}`).join(', ');
const selDark = (suffix = '') => ROOTS.map(r => `${r}[data-theme="dark"]${suffix}`).join(', ');

const MARP_BRAND_THEME_CSS = `
${sel()} {
  font-family: 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, 'Malgun Gothic', sans-serif;
  padding: 68px 76px;
  overflow-y: auto;
  overflow-x: hidden;
  background: linear-gradient(155deg, #ffffff 0%, #f5f3ff 55%, #eef2ff 100%);
  color: #1e293b;
  position: relative;
}
${selDark()} {
  background: linear-gradient(155deg, #0f172a 0%, #1b1533 55%, #17102b 100%);
  color: #f1f5f9;
}
${sel('::before')} {
  content: '';
  position: absolute;
  top: -120px;
  right: -120px;
  width: 320px;
  height: 320px;
  border-radius: 9999px;
  background: radial-gradient(circle, rgba(139,92,246,0.16) 0%, rgba(139,92,246,0) 70%);
  pointer-events: none;
}
${selDark('::before')} {
  background: radial-gradient(circle, rgba(167,139,250,0.22) 0%, rgba(167,139,250,0) 70%);
}
${sel(' h1')} {
  font-family: Manrope, 'Pretendard Variable', sans-serif;
  font-weight: 800;
  font-size: 1.9em;
  letter-spacing: -0.01em;
  color: #7c3aed;
  margin: 0 0 0.65em;
  padding-bottom: 0.28em;
  border-bottom: 5px solid #8b5cf6;
}
${selDark(' h1')} { color: #c4b5fd; border-bottom-color: #a78bfa; }
${sel(' h2')} {
  font-family: Manrope, 'Pretendard Variable', sans-serif;
  font-weight: 700;
  color: #06b6d4;
  margin: 0.4em 0 0.5em;
}
${selDark(' h2')} { color: #22d3ee; }
${sel(' h3')} { font-weight: 700; color: inherit; }
${sel(' strong')} {
  color: #db2777;
  font-weight: 800;
}
${selDark(' strong')} { color: #f9a8d4; }
${sel(' blockquote')} {
  margin: 0.6em 0;
  padding: 0.4em 0 0.4em 1em;
  border-left: 5px solid #8b5cf6;
  color: #475569;
  font-style: italic;
}
${selDark(' blockquote')} { color: #cbd5e1; border-left-color: #a78bfa; }
${sel(' li::marker')} { color: #8b5cf6; font-weight: 800; }
${selDark(' li::marker')} { color: #a78bfa; }
${sel(' table')} { border-collapse: collapse; }
${sel(' table th')} {
  background: #ede9fe;
  color: #4c1d95;
  font-weight: 800;
}
${selDark(' table th')} { background: #4c1d95; color: #ede9fe; }
${sel(' table th')}, ${sel(' table td')} { border: 1px solid #d8d0f5; padding: 0.4em 0.7em; }
${selDark(' table th')}, ${selDark(' table td')} { border-color: #4c1d95; }
${sel(' table td')} { color: #1e293b; }
${selDark(' table tr')} { background: #201a35; }
${selDark(' table tr:nth-child(even)')} { background: #251e40; }
${selDark(' table td')} { color: #e2e8f0; }
${sel(' code')} {
  background: #ede9fe;
  color: #6d28d9;
  border-radius: 6px;
  padding: 0.1em 0.4em;
}
${selDark(' code')} { background: #322150; color: #d8b4fe; }
${sel('::-webkit-scrollbar')} { width: 10px; }
${sel('::-webkit-scrollbar-thumb')} { background: rgba(139,92,246,0.35); border-radius: 999px; }
`;

export interface MarpRenderResult {
  html: string;
  css: string;
  slideCount: number;
}

export function renderMarpSlides(content: string): MarpRenderResult {
  const { html, css } = getDisplayMarp().render(normalize(content));
  // data-marpit-svg 속성은 슬라이드마다 하나씩 나오는 것 외에 공용 <style> 선택자
  // 안에도 한 번 더 등장하므로, 문자열 등장 횟수 대신 실제 <section id="..."> 개수를 센다.
  const slideCount = (html.match(/<section id="\d+"/g) || []).length;
  return { html, css: css + MARP_BRAND_THEME_CSS, slideCount: Math.max(slideCount, 1) };
}

export function renderMarpSlidesForExport(content: string): { html: string; css: string } {
  const { html, css } = getExportMarp().render(normalize(content));
  return { html, css: css + MARP_BRAND_THEME_CSS };
}
