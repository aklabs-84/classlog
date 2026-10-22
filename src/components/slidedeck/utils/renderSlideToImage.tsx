import { createRoot } from 'react-dom/client';
import html2canvas from 'html2canvas';
import { toCanvas } from 'html-to-image';
import SlideStage from '../SlideStage';
import type { DeckSlide } from '../types';
import { DECK_CANVAS_W, DECK_CANVAS_H } from '../types';

// 화면에 보이지 않는 곳에 슬라이드를 실제 디자인 해상도(1280x720)로 잠깐 렌더링한 뒤
// html2canvas로 캡처해 PNG data URL로 반환한다. PPT/PDF 내보내기에서 공용으로 사용.
// includeObjects=false면 배경(색/그라디언트/배경이미지)만 캡처 — PPTX 배경 스냅샷용.
export async function renderSlideToImage(
  slide: DeckSlide,
  opts: { includeObjects?: boolean; scale?: number; format?: 'png' | 'jpeg' } = {}
): Promise<string> {
  const { includeObjects = true, scale = 2, format = 'png' } = opts;

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '-10000px';
  container.style.left = '-10000px';
  container.style.width = `${DECK_CANVAS_W}px`;
  container.style.height = `${DECK_CANVAS_H}px`;
  document.body.appendChild(container);

  const root = createRoot(container);
  const slideToRender = includeObjects ? slide : { ...slide, objects: [] };
  root.render(<SlideStage slide={slideToRender} editable={false} captureMode />);

  try {
    // 레이아웃/페인트가 반영될 때까지 두 프레임 대기
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    const imgs = Array.from(container.querySelectorAll('img'));
    await Promise.all(
      imgs.map(img => img.complete ? Promise.resolve() : new Promise<void>(res => {
        img.onload = () => res();
        img.onerror = () => res();
      }))
    );

    const target = container.firstElementChild as HTMLElement;
    // 브라우저가 직접 그린 모양 그대로 찍는다(html-to-image). 글자 위치가 화면과 같다.
    // 실패하면 html2canvas로 대신 찍는다(글자가 조금 아래로 밀릴 수 있음).
    let canvas: HTMLCanvasElement;
    try {
      canvas = await toCanvas(target, {
        pixelRatio: scale, width: DECK_CANVAS_W, height: DECK_CANVAS_H, backgroundColor: '#ffffff', cacheBust: false,
      });
    } catch (err) {
      console.warn('[renderSlideToImage] html-to-image 실패, html2canvas로 대체:', err);
      canvas = await html2canvas(target, {
        scale, useCORS: true, backgroundColor: '#ffffff',
        width: DECK_CANVAS_W, height: DECK_CANVAS_H,
        onclone: (doc) => {
          doc.querySelectorAll<HTMLElement>('[data-slide-text]').forEach(el => { el.style.overflow = 'visible'; });
        },
      });
    }
    return format === 'jpeg' ? canvas.toDataURL('image/jpeg', 0.92) : canvas.toDataURL('image/png');
  } finally {
    root.unmount();
    document.body.removeChild(container);
  }
}
