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

// headingDivider:1로 h1마다 자동으로 새 슬라이드가 시작되는데, 문서에 있던 "---" 구분선이
// h1 바로 앞에 있으면 그 hr 자체도 Marpit 기본 동작으로 슬라이드 경계가 되어 h1의 자동 분리와
// 겹친다 — 그 사이에 내용 없는 빈 슬라이드가 하나 더 생기므로, h1 바로 앞의 "---"만 제거한다.
// (h1이 없는 발표자료 재구성 콘텐츠는 "---"가 유일한 슬라이드 구분자이므로 영향받지 않는다.)
function stripHrBeforeH1(content: string): string {
  const lines = content.split('\n');
  const out: string[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; out.push(line); continue; }
    if (!inFence && /^(-{3,}|_{3,}|\*{3,})$/.test(line.trim())) {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j < lines.length && /^#\s/.test(lines[j])) continue; // hr 줄 자체를 제거
    }
    out.push(line);
  }
  return out.join('\n');
}

// 자료 에디터(RichEditor)는 이미지 폭을 조절하면 `![alt](url "width:500")`처럼 title
// 속성 안에 "width:숫자" 관례로 저장한다(ResizableImage 참고). 이건 문서뷰 전용 규칙이라
// Marp/markdown-it은 이해하지 못하고 title을 그냥 툴팁 문구로 남긴 채 이미지를 원본 해상도로
// 렌더링한다 — 그러면 나란히 배치한 이미지가 컨테이너 폭을 각각 다 채워버려 옆으로 못 붙고
// 세로로 밀려난다. Marp가 이해하는 명시적 style width를 가진 <img> 태그로 미리 바꿔준다.
function widthImagesForMarp(content: string): string {
  return content.replace(
    /!\[([^\]]*)\]\(((?:\\.|[^()\s])+)(?:\s+"([^"]*)")?\)/g,
    (match, alt, src, title) => {
      const wm = title && title.match(/(?:^|,)width:(\d+)/);
      const hm = title && title.match(/(?:^|,)height:(\d+)/);
      if (!wm && !hm) return match;
      const unescapedSrc = src.replace(/\\([()])/g, '$1');
      const style = [wm ? `width:${wm[1]}px` : null, hm ? `height:${hm[1]}px` : null, 'max-width:100%']
        .filter(Boolean).join(';');
      const altAttr = alt ? ` alt="${String(alt).replace(/"/g, '&quot;')}"` : '';
      return `<img src="${unescapedSrc}"${altAttr} style="${style}" />`;
    },
  );
}

// RichEditor에서 이미지 여러 장을 같은 문단 안에서 줄바꿈(Shift+Enter)으로 나란히
// 배치하면, 마크다운에는 각 이미지 줄 끝에 하드브레이크 `\`가 직렬화된다(HardBreak
// 노드 → "\\\n", RichEditor.tsx 참고). widthImagesForMarp로 폭을 줄여도 이 `\`는
// Marp에서 그대로 <br />로 렌더링되어 강제로 다음 줄로 밀려난다 — 이미지 한 장만
// 있는 줄들이 하드브레이크로 이어진 구간을 찾아 한 줄로 합쳐, 인라인 흐름 안에서
// 자연스럽게 옆으로 붙을 수 있게 한다(일반 문단 텍스트의 하드브레이크는 건드리지 않음).
function joinAdjacentImageHardBreaks(content: string): string {
  const isImageLine = (line: string) => /^\s*!\[[^\]]*\]\([^)]*\)\s*\\?\s*$/.test(line);
  const hasHardBreak = (line: string) => /\\\s*$/.test(line.trimEnd());
  const lines = content.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (isImageLine(lines[i]) && hasHardBreak(lines[i]) && i + 1 < lines.length && isImageLine(lines[i + 1])) {
      let merged = lines[i].trimEnd().replace(/\\$/, '').trim();
      let j = i + 1;
      while (j < lines.length && isImageLine(lines[j])) {
        const cur = lines[j].trimEnd();
        const broke = hasHardBreak(cur);
        merged += ' ' + cur.replace(/\\$/, '').trim();
        j++;
        if (!broke) break;
      }
      out.push(merged);
      i = j;
      continue;
    }
    out.push(lines[i]);
    i++;
  }
  return out.join('\n');
}

// 토글(<details>)은 문서뷰에서는 접었다 펼치는 UI지만, 슬라이드는 클릭으로 펼칠 수 없는
// 정적인 한 장 한 장이라 "접힌 상태"라는 개념이 없다 — 그대로 두면 Marp가 토글 내부의
// "---"/제목 단위로 슬라이드를 쪼개면서 <details> 여는 태그와 닫는 태그가 서로 다른
// 슬라이드로 찢어져, 펼치지 않았는데도 내용이 보이거나 끝에 빈 슬라이드가 남는 등
// 의도치 않은 모양이 된다.
// 그래서 슬라이드 렌더링 직전에 각 토글을 명시적인 슬라이드 시퀀스로 미리 풀어준다:
// "---"(구분선) → "# 토글 제목"(안내 슬라이드) → 토글 내부 내용(내부의 "---"/제목으로 계속
// 이어서 슬라이드가 나뉨) → "---"(구분선) 순서로 펼쳐, 순서대로 다음 슬라이드 이동으로 볼 수
// 있게 하고, 그 대신 시작/끝 지점에 숨겨진 표시(data-toggle-start/end)를 심어 어떤 슬라이드
// 구간이 토글 출신인지 나중에(computeToggleRanges) 구분할 수 있게 한다 — "건너뛰기" 버튼과
// PDF 내보내기에서 토글 구간을 식별하는 데 쓰인다.
function explodeDetailsForSlides(content: string, counter: { n: number } = { n: 0 }): string {
  let result = '';
  let i = 0;
  while (true) {
    const openIdx = content.indexOf('<details>', i);
    if (openIdx === -1) { result += content.slice(i); break; }
    result += content.slice(i, openIdx);

    const headMatch = /^<details>\n<summary>([\s\S]*?)<\/summary>\n\n/.exec(content.slice(openIdx));
    if (!headMatch) {
      // 형식이 예상과 다르면(수동 편집 등) 안전하게 그대로 통과시키고 다음 위치로 진행
      result += '<details>';
      i = openIdx + '<details>'.length;
      continue;
    }
    const summaryHtml = headMatch[1];
    const bodyStart = openIdx + headMatch[0].length;

    // depth 카운팅으로 이 토글과 정확히 짝이 맞는 </details>를 찾는다(중첩 토글 대비)
    let depth = 1;
    let cursor = bodyStart;
    let closeIdx = -1;
    while (cursor < content.length) {
      const nextOpen = content.indexOf('<details>', cursor);
      const nextClose = content.indexOf('</details>', cursor);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        cursor = nextOpen + '<details>'.length;
      } else {
        depth--;
        cursor = nextClose + '</details>'.length;
        if (depth === 0) { closeIdx = nextClose; break; }
      }
    }
    if (closeIdx === -1) {
      // 닫는 태그를 못 찾으면(형식 오류) 나머지를 그대로 두고 종료
      result += content.slice(openIdx);
      i = content.length;
      break;
    }

    const rawBody = content.slice(bodyStart, closeIdx).replace(/\n+$/, '');
    const explodedBody = explodeDetailsForSlides(rawBody, counter);
    const id = counter.n++;
    const summaryText = summaryHtml
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

    result += `\n\n---\n\n# ${summaryText}\n\n`
      + `<div class="marp-toggle-boundary" data-toggle-start="${id}" style="display:none"></div>\n\n`
      + `${explodedBody}\n\n`
      + `<div class="marp-toggle-boundary" data-toggle-end="${id}" style="display:none"></div>\n\n---\n\n`;

    i = closeIdx + '</details>'.length;
    while (content[i] === '\n') i++;
  }
  return result;
}

export interface ToggleSlideRange {
  start: number;
  end: number;
}

// 렌더링된 html 문자열 안에서 data-toggle-start/end 표시를 찾아, 각 표시가 속한
// <section id="N">의 번호로 토글이 차지하는 슬라이드 구간(0-based)을 계산한다.
function computeToggleRanges(html: string): ToggleSlideRange[] {
  if (typeof document === 'undefined' || !html.includes('data-toggle-')) return [];
  const container = document.createElement('div');
  container.innerHTML = html;

  const sectionIdOf = (el: Element): number | null => {
    const section = el.closest('section[id]');
    const idAttr = section?.getAttribute('id');
    const n = idAttr ? parseInt(idAttr, 10) : NaN;
    return Number.isNaN(n) ? null : n;
  };

  const starts = new Map<string, number>();
  const ends = new Map<string, number>();
  container.querySelectorAll('[data-toggle-start]').forEach(el => {
    const id = el.getAttribute('data-toggle-start')!;
    const sec = sectionIdOf(el);
    if (sec != null) starts.set(id, sec);
  });
  container.querySelectorAll('[data-toggle-end]').forEach(el => {
    const id = el.getAttribute('data-toggle-end')!;
    const sec = sectionIdOf(el);
    if (sec != null) ends.set(id, sec);
  });

  const ranges: ToggleSlideRange[] = [];
  starts.forEach((startSec, id) => {
    const endSec = ends.get(id);
    if (endSec != null) ranges.push({ start: startSec - 1, end: endSec - 1 });
  });
  return ranges;
}

const normalize = (content: string) =>
  widthImagesForMarp(joinAdjacentImageHardBreaks(fixBoldFlanking(stripHrBeforeH1(normalizeHeadingSpace(normalizeStandaloneHr(explodeDetailsForSlides(content || '')))))));

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
  background: rgba(139,92,246,0.14);
  color: #6d28d9;
  border-radius: 4px;
  padding: 0.05em 0.4em;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}
${selDark(' code')} { background: rgba(216,180,254,0.16); color: #e9d5ff; }
${sel(' pre code')} {
  background: none;
  color: inherit;
  padding: 0;
  border-radius: 0;
  box-decoration-break: initial;
  -webkit-box-decoration-break: initial;
}
${selDark(' pre code')} { background: none; color: inherit; }
${sel(' pre')} {
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  max-width: 100%;
  overflow-x: hidden;
}
${sel(' pre code')} {
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}
${sel('::-webkit-scrollbar')} { width: 10px; }
${sel('::-webkit-scrollbar-thumb')} { background: rgba(139,92,246,0.35); border-radius: 999px; }
${sel(' img')} {
  display: inline;
  vertical-align: middle;
}
`;

export interface MarpRenderResult {
  html: string;
  css: string;
  slideCount: number;
  toggleRanges: ToggleSlideRange[];
}

export function renderMarpSlides(content: string): MarpRenderResult {
  const { html, css } = getDisplayMarp().render(normalize(content));
  // data-marpit-svg 속성은 슬라이드마다 하나씩 나오는 것 외에 공용 <style> 선택자
  // 안에도 한 번 더 등장하므로, 문자열 등장 횟수 대신 실제 <section id="..."> 개수를 센다.
  const slideCount = (html.match(/<section id="\d+"/g) || []).length;
  return { html, css: css + MARP_BRAND_THEME_CSS, slideCount: Math.max(slideCount, 1), toggleRanges: computeToggleRanges(html) };
}

export function renderMarpSlidesForExport(content: string): { html: string; css: string; toggleRanges: ToggleSlideRange[] } {
  const { html, css } = getExportMarp().render(normalize(content));
  return { html, css: css + MARP_BRAND_THEME_CSS, toggleRanges: computeToggleRanges(html) };
}
