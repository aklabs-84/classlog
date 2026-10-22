import { createRoot } from 'react-dom/client';
import html2canvas from 'html2canvas';
import { toCanvas, getFontEmbedCSS } from 'html-to-image';
import SlideStage from '../SlideStage';
import type { DeckSlide } from '../types';
import { DECK_CANVAS_W, DECK_CANVAS_H } from '../types';

export interface SlideRenderOptions {
  includeObjects?: boolean; // false면 배경(색/그라디언트/배경이미지)만 캡처 — PPTX 배경 스냅샷용
  scale?: number;
  format?: 'png' | 'jpeg';
}

export interface SlideRenderer {
  render: (slide: DeckSlide, opts?: SlideRenderOptions) => Promise<string>;
  dispose: () => void;
}

const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

// 슬라이드를 화면 밖에서 실제 디자인 해상도(1280x720)로 렌더링해 이미지(data URL)로 돌려주는 도구.
// 임시 화면과 글꼴 포장을 한 번만 준비해 두고 모든 장에 재사용한다(장마다 새로 만들면 매우 느리다).
export function createSlideRenderer(): SlideRenderer {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '-10000px';
  container.style.left = '-10000px';
  container.style.width = `${DECK_CANVAS_W}px`;
  container.style.height = `${DECK_CANVAS_H}px`;
  document.body.appendChild(container);
  const root = createRoot(container);
  let fontEmbedCSS: string | undefined;

  const render = async (slide: DeckSlide, opts: SlideRenderOptions = {}): Promise<string> => {
    const { includeObjects = true, scale = 2, format = 'png' } = opts;
    const slideToRender = includeObjects ? slide : { ...slide, objects: [] };
    root.render(<SlideStage slide={slideToRender} editable={false} captureMode />);

    // 레이아웃/페인트가 반영될 때까지 두 프레임 대기
    await nextFrame();
    await nextFrame();

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
      if (fontEmbedCSS === undefined) {
        try { fontEmbedCSS = await getFontEmbedCSS(target); } catch { fontEmbedCSS = ''; }
      }
      canvas = await toCanvas(target, {
        pixelRatio: scale, width: DECK_CANVAS_W, height: DECK_CANVAS_H, backgroundColor: '#ffffff',
        cacheBust: false, fontEmbedCSS,
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
  };

  const dispose = () => {
    root.unmount();
    if (container.parentNode) container.parentNode.removeChild(container);
  };

  return { render, dispose };
}

// 한 장만 찍을 때 쓰는 간편 버전
export async function renderSlideToImage(slide: DeckSlide, opts: SlideRenderOptions = {}): Promise<string> {
  const renderer = createSlideRenderer();
  try {
    return await renderer.render(slide, opts);
  } finally {
    renderer.dispose();
  }
}
