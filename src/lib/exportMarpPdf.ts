import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { renderMarpSlidesForExport } from './marpConvert';

const PAGE_W_IN = 1280 / 96;
const PAGE_H_IN = 720 / 96;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

// 자료 목록 표지(업로드 이미지)를 슬라이드 PDF 1페이지 표지로도 재사용.
// 표지 이미지는 세로로 긴 경우가 많아 16:9 박스를 꽉 채우도록 크롭하고,
// 하단 그라데이션 위에 제목을 올려 어떤 이미지 비율이 와도 텍스트 가독성을 보장한다.
// 주의: html2canvas는 CSS `object-fit`을 지원하지 않아(알려진 한계) 그대로 쓰면
// 크롭 대신 이미지가 통째로 눌려 늘어나 버린다. 그래서 여기서는 object-fit을 쓰지 않고,
// 이미지 로드 후 실제 자연 크기를 읽어 크기/위치를 직접 계산해(수동 cover 크롭) 적용한다.
function buildCoverHtml(title: string, coverImageUrl?: string | null): string {
  const safeTitle = escapeHtml(title || '');
  if (coverImageUrl) {
    return `
      <div class="marp-pdf-cover" style="position:relative;width:1280px;height:720px;overflow:hidden;background:#1e1b2e;">
        <img class="marp-pdf-cover-img" src="${coverImageUrl}" style="position:absolute;" />
        <div style="position:absolute;inset:0;background:linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 45%, rgba(0,0,0,0) 75%);"></div>
        <div style="position:absolute;left:0;right:0;bottom:0;padding:64px 76px;">
          <h1 style="margin:0;color:#fff;font-family:'Pretendard Variable',Pretendard,-apple-system,BlinkMacSystemFont,'Malgun Gothic',sans-serif;font-weight:800;font-size:44px;line-height:1.35;word-break:keep-all;">${safeTitle}</h1>
        </div>
      </div>`;
  }
  return `
    <div class="marp-pdf-cover" style="position:relative;width:1280px;height:720px;overflow:hidden;background:linear-gradient(155deg,#8b5cf6 0%,#7c3aed 55%,#6d28d9 100%);display:flex;align-items:center;justify-content:center;padding:80px;box-sizing:border-box;">
      <h1 style="margin:0;color:#fff;text-align:center;font-family:'Pretendard Variable',Pretendard,-apple-system,BlinkMacSystemFont,'Malgun Gothic',sans-serif;font-weight:800;font-size:48px;line-height:1.4;word-break:keep-all;">${safeTitle}</h1>
    </div>`;
}

// object-fit:cover를 흉내내는 수동 계산 — 박스보다 넓은 쪽 기준으로 확대한 뒤 중앙 정렬.
function applyManualCoverFit(img: HTMLImageElement, boxW: number, boxH: number) {
  const iw = img.naturalWidth || boxW;
  const ih = img.naturalHeight || boxH;
  const scale = Math.max(boxW / iw, boxH / ih);
  const w = Math.ceil(iw * scale);
  const h = Math.ceil(ih * scale);
  img.style.width = `${w}px`;
  img.style.height = `${h}px`;
  img.style.left = `${Math.round((boxW - w) / 2)}px`;
  img.style.top = `${Math.round((boxH - h) / 2)}px`;
}

export async function exportMarpSlidesToPdf(content: string, title: string, coverImageUrl?: string | null): Promise<void> {
  const { html, css } = renderMarpSlidesForExport(content);

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '-10000px';
  container.style.left = '-10000px';
  container.style.width = '1280px';
  container.innerHTML = `<style>${css}</style>${buildCoverHtml(title, coverImageUrl)}${html}`;
  document.body.appendChild(container);

  try {
    // 레이아웃/페인트가 반영될 때까지 두 프레임 대기
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    // PDF는 정적 문서라 "펼쳐보기" 토글 자체가 의미 없다 — 요약줄만 남기지 않고
    // <details>를 통째로 출력에서 제외한다. 이미지 로드 대기 전에 미리 제거해,
    // 어차피 안 보일 내부 이미지 로드를 기다리지 않도록 한다(속도 개선의 일부).
    container.querySelectorAll('details').forEach((details) => details.remove());

    const imgs = Array.from(container.querySelectorAll('img'));
    await Promise.all(
      imgs.map(img => (img.complete ? Promise.resolve() : new Promise<void>(res => {
        img.onload = () => res();
        img.onerror = () => res();
      })))
    );

    const coverImgEl = container.querySelector('.marp-pdf-cover-img') as HTMLImageElement | null;
    if (coverImgEl) applyManualCoverFit(coverImgEl, 1280, 720);
    // 크기/위치를 바꿨으니 반영될 때까지 한 프레임 더 대기
    if (coverImgEl) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

    const coverEl = container.querySelector('.marp-pdf-cover') as HTMLElement | null;
    const sections = Array.from(container.querySelectorAll('.marpit > section')) as HTMLElement[];
    if (sections.length === 0) throw new Error('슬라이드를 찾을 수 없습니다.');

    // 슬라이드(section)는 화면 표시용 CSS에서 overflow-y:auto로 되어 있어 화면에서는
    // 넘치는 내용을 스크롤로 보게 되어 있는데, html2canvas는 overflow:auto/scroll을
    // 지원하지 않고 넘친 내용까지 전부 그려버려 한 장의 캡처가 다음 슬라이드 영역까지
    // 침범해 겹쳐 보인다. 캡처 직전에만 overflow:hidden으로 고정해 슬라이드 경계
    // 밖으로 넘어가는 내용은 잘리도록(넘어가지도, 겹치지도 않도록) 만든다.
    sections.forEach((section) => {
      section.style.overflow = 'hidden';
    });

    const doc = new jsPDF({ orientation: 'landscape', unit: 'in', format: [PAGE_W_IN, PAGE_H_IN], compress: true });

    // 슬라이드는 화면 열람이 주 목적이라 인쇄용 고해상도(scale 2)가 필요 없다.
    // 1.5배(1920x1080)로도 충분히 선명하면서 캡처 픽셀 수를 44%로 줄여 속도를 높인다.
    const SCALE = 1.5;
    const PAGE_W_PX = 1280;
    const PAGE_H_PX = 720;
    // PNG(무손실)는 그라디언트 배경 때문에 파일이 매우 커진다.
    // 슬라이드는 사진/그라디언트가 많아 JPEG 손실압축이 훨씬 적합하다.
    const toJpeg = (canvas: HTMLCanvasElement) => canvas.toDataURL('image/jpeg', 0.85);

    const pageEls: HTMLElement[] = [...(coverEl ? [coverEl] : []), ...sections];

    // html2canvas는 호출 1회마다 DOM 스타일 계산/클론 비용이 커서, 슬라이드마다
    // 따로따로(N+1번) 호출하면 페이지 수에 비례해 느려진다. 표지+모든 섹션이 여백 없이
    // 세로로 붙어 있는 offscreen 컨테이너 특성(각 요소 720px 고정 높이, 마진 없음)을
    // 이용해 전체를 한 번에 캡처한 뒤, 큰 캔버스를 페이지별로 잘라 쓰면 호출 횟수를
    // 1회로 줄일 수 있다. 다만 슬라이드가 아주 많으면 캔버스 크기가 브라우저 한도를
    // 넘을 수 있어(특히 모바일 사파리), 일정 페이지 수를 넘으면 기존 방식(순차 캡처)으로
    // 안전하게 폴백한다.
    const SINGLE_CAPTURE_MAX_PAGES = 30;

    if (pageEls.length > 0 && pageEls.length <= SINGLE_CAPTURE_MAX_PAGES) {
      const bigCanvas = await html2canvas(container, {
        scale: SCALE,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: PAGE_W_PX,
        height: PAGE_H_PX * pageEls.length,
      });

      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = PAGE_W_PX * SCALE;
      sliceCanvas.height = PAGE_H_PX * SCALE;
      const ctx = sliceCanvas.getContext('2d')!;

      for (let i = 0; i < pageEls.length; i++) {
        ctx.clearRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        ctx.drawImage(
          bigCanvas,
          0, i * PAGE_H_PX * SCALE, PAGE_W_PX * SCALE, PAGE_H_PX * SCALE,
          0, 0, PAGE_W_PX * SCALE, PAGE_H_PX * SCALE
        );
        if (i > 0) doc.addPage([PAGE_W_IN, PAGE_H_IN], 'landscape');
        doc.addImage(toJpeg(sliceCanvas), 'JPEG', 0, 0, PAGE_W_IN, PAGE_H_IN);
      }
    } else {
      const captureOptions = { scale: SCALE, useCORS: true, backgroundColor: '#ffffff', width: PAGE_W_PX, height: PAGE_H_PX };
      for (let i = 0; i < pageEls.length; i++) {
        const canvas = await html2canvas(pageEls[i], captureOptions);
        if (i > 0) doc.addPage([PAGE_W_IN, PAGE_H_IN], 'landscape');
        doc.addImage(toJpeg(canvas), 'JPEG', 0, 0, PAGE_W_IN, PAGE_H_IN);
      }
    }

    doc.save(`${title || '슬라이드'}_슬라이드.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}
