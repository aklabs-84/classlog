import JSZip from 'jszip';
import type { DeckSlide, SlideObject, SlideObjectStyle } from '../types';
import { DECK_CANVAS_W, DECK_CANVAS_H } from '../types';
import { uploadSlideImage } from './imageUpload';

const P_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const xmlParser = new DOMParser();
const parseXml = (text: string) => xmlParser.parseFromString(text, 'application/xml');

const firstEl = (parent: Element | Document, ns: string, tag: string): Element | null =>
  parent.getElementsByTagNameNS(ns, tag)[0] ?? null;

const allEls = (parent: Element | Document, ns: string, tag: string): Element[] =>
  Array.from(parent.getElementsByTagNameNS(ns, tag));

// OPC 패키지 내부 상대 경로("../media/image1.png" 등)를 zip 절대 경로로 정규화
function resolvePath(baseDir: string, relTarget: string): string {
  const baseParts = baseDir.split('/').filter(Boolean);
  for (const part of relTarget.split('/').filter(Boolean)) {
    if (part === '..') baseParts.pop();
    else if (part !== '.') baseParts.push(part);
  }
  return baseParts.join('/');
}

interface RelInfo { target: string; external: boolean }

function parseRelationships(relsXml: string | undefined): Map<string, RelInfo> {
  const map = new Map<string, RelInfo>();
  if (!relsXml) return map;
  const doc = parseXml(relsXml);
  for (const rel of Array.from(doc.getElementsByTagName('Relationship'))) {
    map.set(rel.getAttribute('Id') ?? '', {
      target: rel.getAttribute('Target') ?? '',
      external: rel.getAttribute('TargetMode') === 'External',
    });
  }
  return map;
}

// 외부 URL 이미지(임베드가 아니라 링크로만 참조된 경우) — 접근 가능하면 직접 받아온다.
// CORS로 막혀 있거나 응답이 없으면 8초 후 포기하고 undefined 반환(전체 가져오기가 멈추지 않도록).
async function fetchExternalImage(url: string): Promise<Blob | undefined> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return undefined;
    return await res.blob();
  } catch {
    return undefined;
  }
}

interface RectEmu { x: number; y: number; cx: number; cy: number; rot: number }
interface GroupTransform { off: { x: number; y: number }; ext: { cx: number; cy: number }; chOff: { x: number; y: number }; chExt: { cx: number; cy: number } }

function readXfrm(spPr: Element | null): RectEmu | null {
  const xfrm = spPr && firstEl(spPr, A_NS, 'xfrm');
  if (!xfrm) return null;
  const off = firstEl(xfrm, A_NS, 'off');
  const ext = firstEl(xfrm, A_NS, 'ext');
  if (!off || !ext) return null;
  return {
    x: Number(off.getAttribute('x') ?? 0),
    y: Number(off.getAttribute('y') ?? 0),
    cx: Number(ext.getAttribute('cx') ?? 0),
    cy: Number(ext.getAttribute('cy') ?? 0),
    rot: Number(xfrm.getAttribute('rot') ?? 0),
  };
}

function readGroupXfrm(grpSpPr: Element | null): GroupTransform | null {
  const xfrm = grpSpPr && firstEl(grpSpPr, A_NS, 'xfrm');
  if (!xfrm) return null;
  const off = firstEl(xfrm, A_NS, 'off');
  const ext = firstEl(xfrm, A_NS, 'ext');
  const chOff = firstEl(xfrm, A_NS, 'chOff');
  const chExt = firstEl(xfrm, A_NS, 'chExt');
  if (!off || !ext || !chOff || !chExt) return null;
  return {
    off: { x: Number(off.getAttribute('x') ?? 0), y: Number(off.getAttribute('y') ?? 0) },
    ext: { cx: Number(ext.getAttribute('cx') ?? 0), cy: Number(ext.getAttribute('cy') ?? 0) },
    chOff: { x: Number(chOff.getAttribute('x') ?? 0), y: Number(chOff.getAttribute('y') ?? 0) },
    chExt: { cx: Number(chExt.getAttribute('cx') ?? 0), cy: Number(chExt.getAttribute('cy') ?? 0) },
  };
}

// 중첩 그룹 도형의 자체 좌표계를 슬라이드 최상위 EMU 좌표로 순차 변환
function toSlideRect(rect: RectEmu, groupStack: GroupTransform[]): RectEmu {
  let { x, y, cx, cy } = rect;
  for (let i = groupStack.length - 1; i >= 0; i--) {
    const g = groupStack[i];
    const sx = g.chExt.cx ? g.ext.cx / g.chExt.cx : 1;
    const sy = g.chExt.cy ? g.ext.cy / g.chExt.cy : 1;
    x = g.off.x + (x - g.chOff.x) * sx;
    y = g.off.y + (y - g.chOff.y) * sy;
    cx *= sx;
    cy *= sy;
  }
  return { x, y, cx, cy, rot: rect.rot };
}

const EMU_PER_PT = 12700;

// scaleY: 슬라이드 실제 물리 크기(EMU) → 1280x720 캔버스 변환 비율.
// 폰트 크기도 위치/크기와 같은 비율로 줄여야, 표준(13.333x7.5in)이 아닌 커스텀 슬라이드 크기(예: Canva 20x11.25in)에서
// 텍스트가 상자보다 훨씬 커져 겹치거나 줄바꿈이 깨지는 문제가 생기지 않는다.
// 텍스트 실행(run)에 걸린 하이퍼링크(a:hlinkClick, 외부 URL만)를 함께 추출한다.
// 여러 run에 서로 다른 링크가 걸려 있어도 우리 데이터 모델은 오브젝트당 하나의 href만 지원하므로 첫 번째 것만 사용한다.
function extractText(
  txBody: Element,
  scaleY: number,
  relMap: Map<string, RelInfo>
): { text: string; style: SlideObjectStyle; href?: string } {
  const paragraphs = allEls(txBody, A_NS, 'p');
  const lines: string[] = [];
  let fontSize: number | undefined;
  let color: string | undefined;
  let bold: boolean | undefined;
  let align: SlideObjectStyle['align'] | undefined;
  let href: string | undefined;

  for (const p of paragraphs) {
    const pPr = firstEl(p, A_NS, 'pPr');
    const algn = pPr?.getAttribute('algn');
    if (!align && algn) align = algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : 'left';

    const parts: string[] = [];
    for (const r of allEls(p, A_NS, 'r')) {
      const t = firstEl(r, A_NS, 't');
      if (t?.textContent) parts.push(t.textContent);
      const rPr = firstEl(r, A_NS, 'rPr');
      if (rPr) {
        const sz = rPr.getAttribute('sz');
        if (sz && fontSize === undefined) fontSize = Math.round((Number(sz) / 100) * EMU_PER_PT * scaleY);
        const b = rPr.getAttribute('b');
        if (b && bold === undefined) bold = b === '1';
        const srgb = firstEl(rPr, A_NS, 'srgbClr');
        if (srgb && color === undefined) color = `#${srgb.getAttribute('val')}`;
        if (href === undefined) {
          const rId = firstEl(rPr, A_NS, 'hlinkClick')?.getAttributeNS(R_NS, 'id');
          const rel = rId ? relMap.get(rId) : undefined;
          if (rel?.external) href = rel.target;
        }
      }
    }
    lines.push(parts.join(''));
  }

  return { text: lines.join('\n').trim(), style: { fontSize, color, bold, align }, href };
}

const IMAGE_EXT_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', jfif: 'image/jpeg',
  gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml',
};

// 브라우저가 아예 디코딩하지 못하는 포맷 — mime 매핑을 추가해도 <img>로 렌더링 자체가 안 되므로 구분해서 안내
const UNSUPPORTED_VECTOR_EXT = new Set(['emf', 'wmf', 'tif', 'tiff']);

export interface PptxImportResult {
  slides: DeckSlide[];
  skippedOther: number;         // 표/차트/스마트아트/커넥터/그룹 변환 실패 등
  skippedImages: number;        // 형식은 지원하지만 외부 링크 fetch 실패 등으로 가져오지 못한 이미지
  skippedVectorImages: number;  // EMF/WMF/TIFF 등 브라우저가 지원하지 않는 이미지 포맷
}

// 파워포인트(.pptx) 파일을 우리 슬라이드 도구의 DeckSlide[]로 최대한 변환한다.
// 배경은 스냅샷하지 않고 흰 배경으로 초기화하며, 텍스트/이미지 위주로만 복원한다.
// 표·차트·스마트아트·커넥터·그룹 변환 실패·위치 정보 없는 플레이스홀더는 건너뛰고 개수만 집계한다.
export async function parsePptxFile(file: File): Promise<PptxImportResult> {
  const zip = await JSZip.loadAsync(file);

  const presentationXml = await zip.file('ppt/presentation.xml')?.async('text');
  if (!presentationXml) throw new Error('올바른 pptx 파일이 아닙니다.');
  const presDoc = parseXml(presentationXml);

  const sldSz = firstEl(presDoc, P_NS, 'sldSz');
  const slideWidthEmu = Number(sldSz?.getAttribute('cx') ?? 12192000);
  const slideHeightEmu = Number(sldSz?.getAttribute('cy') ?? 6858000);
  const scaleX = DECK_CANVAS_W / slideWidthEmu;
  const scaleY = DECK_CANVAS_H / slideHeightEmu;

  const presRelMap = parseRelationships(await zip.file('ppt/_rels/presentation.xml.rels')?.async('text'));

  const slidePaths = allEls(presDoc, P_NS, 'sldId')
    .map(el => el.getAttributeNS(R_NS, 'id'))
    .filter((id): id is string => !!id)
    .map(id => presRelMap.get(id)?.target)
    .filter((target): target is string => !!target)
    .map(target => resolvePath('ppt', target));

  let skippedOther = 0;
  let skippedImages = 0;
  let skippedVectorImages = 0;
  const slides: DeckSlide[] = [];

  for (const slidePath of slidePaths) {
    const slideXml = await zip.file(slidePath)?.async('text');
    if (!slideXml) { skippedOther++; continue; }
    const slideDoc = parseXml(slideXml);

    const slideDir = slidePath.slice(0, slidePath.lastIndexOf('/'));
    const relsPath = resolvePath(slideDir, `_rels/${slidePath.split('/').pop()}.rels`);
    const relMap = parseRelationships(await zip.file(relsPath)?.async('text'));

    const spTree = firstEl(slideDoc, P_NS, 'spTree');
    const objects: SlideObject[] = [];
    let zIndex = 1;

    const walk = async (parent: Element, groupStack: GroupTransform[]): Promise<void> => {
      for (const node of Array.from(parent.children)) {
        if (node.localName === 'sp') {
          const rect = readXfrm(firstEl(node, P_NS, 'spPr'));
          const txBody = firstEl(node, P_NS, 'txBody');
          const { text, style, href: runHref } = txBody
            ? extractText(txBody, scaleY, relMap)
            : { text: '', style: {} as SlideObjectStyle, href: undefined };
          if (!text) continue; // 텍스트 없는 장식용 도형은 지원 대상 아님(생략, 미집계)
          if (!rect) { skippedOther++; continue; }

          // run 단위 링크가 없으면 도형 전체(버튼처럼 쓰인 텍스트 박스)에 걸린 링크를 확인
          let href = runHref;
          if (!href) {
            const cNvPr = firstEl(node, P_NS, 'cNvPr');
            const shapeHlinkId = cNvPr && firstEl(cNvPr, A_NS, 'hlinkClick')?.getAttributeNS(R_NS, 'id');
            const rel = shapeHlinkId ? relMap.get(shapeHlinkId) : undefined;
            if (rel?.external) href = rel.target;
          }

          const abs = toSlideRect(rect, groupStack);
          objects.push({
            id: crypto.randomUUID(), type: 'text', zIndex: zIndex++,
            x: abs.x * scaleX, y: abs.y * scaleY, width: abs.cx * scaleX, height: abs.cy * scaleY,
            text, style, href,
          });
        } else if (node.localName === 'pic') {
          const rect = readXfrm(firstEl(node, P_NS, 'spPr'));
          if (!rect) { skippedOther++; continue; }

          const blip = firstEl(node, A_NS, 'blip');
          const embedId = blip?.getAttributeNS(R_NS, 'embed');
          const linkId = blip?.getAttributeNS(R_NS, 'link');
          const imgRel = (embedId && relMap.get(embedId)) || (linkId && relMap.get(linkId)) || undefined;
          if (!imgRel) { skippedImages++; continue; }

          let blob: Blob | undefined;
          let mime = '';
          if (imgRel.external) {
            blob = await fetchExternalImage(imgRel.target);
            mime = blob?.type ?? '';
          } else {
            const mediaPath = resolvePath(slideDir, imgRel.target);
            const ext = mediaPath.split('.').pop()?.toLowerCase() ?? '';
            if (UNSUPPORTED_VECTOR_EXT.has(ext)) { skippedVectorImages++; continue; }
            mime = IMAGE_EXT_MIME[ext] ?? '';
            blob = mime ? await zip.file(mediaPath)?.async('blob') : undefined;
          }
          if (!blob) { skippedImages++; continue; }

          let publicUrl: string | null = null;
          try {
            publicUrl = await uploadSlideImage(new File([blob], 'image', { type: mime || blob.type || 'image/png' }));
          } catch {
            publicUrl = null;
          }
          if (!publicUrl) { skippedImages++; continue; }

          // 이미지 자체의 하이퍼링크, 또는 "웹 동영상"(유튜브 등) 링크가 있으면 정지 이미지를 그 링크로 클릭 가능하게 연결
          const cNvPr = firstEl(node, P_NS, 'cNvPr');
          const picHlinkId = cNvPr && firstEl(cNvPr, A_NS, 'hlinkClick')?.getAttributeNS(R_NS, 'id');
          const videoLinkId = firstEl(node, A_NS, 'videoFile')?.getAttributeNS(R_NS, 'link');
          let href: string | undefined;
          const videoRel = videoLinkId ? relMap.get(videoLinkId) : undefined;
          if (videoRel?.external) href = videoRel.target;
          if (!href && picHlinkId) {
            const rel = relMap.get(picHlinkId);
            if (rel?.external) href = rel.target;
          }

          const abs = toSlideRect(rect, groupStack);
          objects.push({
            id: crypto.randomUUID(), type: 'image', zIndex: zIndex++,
            x: abs.x * scaleX, y: abs.y * scaleY, width: abs.cx * scaleX, height: abs.cy * scaleY,
            src: publicUrl,
            href,
            style: rect.rot ? { rotate: Math.round(rect.rot / 60000) } : undefined,
          });
        } else if (node.localName === 'grpSp') {
          const groupXfrm = readGroupXfrm(firstEl(node, P_NS, 'grpSpPr'));
          if (!groupXfrm) { skippedOther++; continue; }
          await walk(node, [...groupStack, groupXfrm]);
        } else if (node.localName === 'graphicFrame' || node.localName === 'cxnSp') {
          skippedOther++; // 표/차트/스마트아트/커넥터 등은 지원하지 않음
        }
      }
    };

    if (spTree) await walk(spTree, []);

    slides.push({ id: crypto.randomUUID(), bg: '#ffffff', textColor: '#111827', objects });
  }

  return { slides, skippedOther, skippedImages, skippedVectorImages };
}
