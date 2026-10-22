import PptxGenJS from 'pptxgenjs';
import type { SlideDeck, SlideObject } from '../types';
import { extractYoutubeVideoId } from '../types';
import { createSlideRenderer } from './renderSlideToImage';

// 1280x720 디자인 좌표(96dpi) → PPTX 인치/포인트 변환
const px2in = (px: number) => px / 96;
const px2pt = (px: number) => px * 0.75; // 96dpi 기준 1px = 0.75pt

const stripHash = (hex: string | undefined, fallback: string): string => (hex ?? fallback).replace('#', '');

// 카드형 텍스트/링크/코드 블록의 모서리 둥글기(px)를 pptxgenjs의 rectRadius(인치 단위, 짧은 변의 절반이 최대)로 환산
const toRectRadius = (borderRadiusPx: number | undefined, width: number, height: number): number => {
  if (!borderRadiusPx) return 0;
  return Math.min(borderRadiusPx, Math.min(width, height) / 2) / 96;
};

interface PreparedImage { data: string; naturalW: number; naturalH: number }

const imageSizeCache = new Map<string, { w: number; h: number }>();

async function loadImage(url: string, cache: Map<string, string | null>): Promise<PreparedImage | null> {
  if (cache.has(url)) {
    const data = cache.get(url) ?? null;
    const size = imageSizeCache.get(url);
    return data && size ? { data, naturalW: size.w, naturalH: size.h } : null;
  }
  const result = await (async () => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const loaded = new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('image load failed'));
      });
      img.src = url;
      await loaded;
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 1;
      canvas.height = img.naturalHeight || 1;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0);
      imageSizeCache.set(url, { w: canvas.width, h: canvas.height });
      return canvas.toDataURL('image/png');
    } catch {
      return null;
    }
  })();
  cache.set(url, result);
  const size = imageSizeCache.get(url);
  return result && size ? { data: result, naturalW: size.w, naturalH: size.h } : null;
}

// 화면의 object-fit(cover/contain/fill)과 똑같이 보이도록, 사진을 칸 비율에 맞춰 미리 잘라 준다.
// (pptxgenjs의 cover 옵션은 원본 비율을 몰라 사진이 늘어나 버린다)
async function fitImageToBox(
  img: PreparedImage, fit: 'cover' | 'contain' | 'fill', x: number, y: number, w: number, h: number
): Promise<{ data: string; x: number; y: number; w: number; h: number }> {
  if (fit === 'fill') return { data: img.data, x, y, w, h };
  const boxRatio = w / h;
  const imgRatio = img.naturalW / img.naturalH;
  if (fit === 'contain') {
    const fw = imgRatio > boxRatio ? w : h * imgRatio;
    const fh = imgRatio > boxRatio ? w / imgRatio : h;
    return { data: img.data, x: x + (w - fw) / 2, y: y + (h - fh) / 2, w: fw, h: fh };
  }
  // cover: 가운데를 기준으로 칸 비율만큼 잘라낸다
  let sw = img.naturalW, sh = img.naturalH, sx = 0, sy = 0;
  if (imgRatio > boxRatio) { sw = Math.round(img.naturalH * boxRatio); sx = Math.round((img.naturalW - sw) / 2); }
  else { sh = Math.round(img.naturalW / boxRatio); sy = Math.round((img.naturalH - sh) / 2); }
  const el = new Image();
  await new Promise<void>(res => { el.onload = () => res(); el.onerror = () => res(); el.src = img.data; });
  const canvas = document.createElement('canvas');
  canvas.width = sw; canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { data: img.data, x, y, w, h };
  ctx.drawImage(el, sx, sy, sw, sh, 0, 0, sw, sh);
  return { data: canvas.toDataURL('image/png'), x, y, w, h };
}

// CSS 글꼴 목록("'Pretendard Variable', Pretendard, sans-serif")에서 첫 글꼴 이름만 꺼낸다(PPT는 이름 하나만 받는다)
const firstFontName = (family: string | undefined): string | undefined =>
  family?.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '') || undefined;

async function addObjectToSlide(
  pptxSlide: PptxGenJS.Slide,
  obj: SlideObject,
  fallbackColor: string,
  imageCache: Map<string, string | null>
): Promise<void> {
  const style = obj.style ?? {};
  const x = px2in(obj.x), y = px2in(obj.y), w = px2in(obj.width), h = px2in(obj.height);
  const opacity = style.opacity ?? 1;
  const transparency = Math.round((1 - opacity) * 100);

  if (obj.type === 'text') {
    const hasBg = !!style.background;
    pptxSlide.addText(obj.text || '', {
      x, y, w, h,
      fontSize: px2pt(style.fontSize ?? 24),
      color: stripHash(style.color, stripHash(fallbackColor, '000000')),
      bold: !!style.bold,
      align: style.align ?? 'left',
      valign: style.valign === 'middle' ? 'middle' : style.valign === 'bottom' ? 'bottom' : 'top',
      fontFace: firstFontName(style.fontFamily),
      // 화면의 줄 높이(1.0 등)를 PPT 줄 간격 배수로 환산(PPT 한 줄 기본 간격은 글자 크기의 약 1.2배)
      lineSpacingMultiple: style.lineHeight != null ? style.lineHeight / 1.2 : undefined,
      charSpacing: style.letterSpacing ? px2pt(style.letterSpacing) : undefined,
      fill: hasBg ? { color: stripHash(style.background, 'FFFFFF'), transparency } : undefined,
      transparency,
      shape: hasBg ? 'roundRect' : undefined,
      rectRadius: hasBg ? toRectRadius(style.borderRadius, obj.width, obj.height) : undefined,
      margin: hasBg ? 10 : 0,
      wrap: true,
    });
  } else if (obj.type === 'emoji') {
    pptxSlide.addText(obj.text || '🙂', {
      x, y, w, h,
      fontSize: px2pt(Math.min(obj.width, obj.height) * 0.8),
      align: 'center', valign: 'middle',
      transparency,
    });
  } else if (obj.type === 'link') {
    pptxSlide.addText(
      [
        { text: obj.text || '링크 제목 없음', options: { bold: true, fontSize: 14, color: stripHash(style.color, '3B82F6'), breakLine: true } },
        { text: obj.href || '', options: { fontSize: 11, color: '9CA3AF' } },
      ],
      {
        x, y, w, h, valign: 'middle', margin: 8,
        fill: { color: 'FFFFFF' },
        line: { color: stripHash(style.color, '3B82F6'), width: 1 },
        shape: 'roundRect',
        rectRadius: toRectRadius(style.borderRadius ?? 10, obj.width, obj.height),
        hyperlink: obj.href ? { url: obj.href } : undefined,
      }
    );
  } else if (obj.type === 'code') {
    pptxSlide.addText(obj.text || '', {
      x, y, w, h,
      fontSize: px2pt(style.fontSize ?? 16),
      fontFace: 'Courier New',
      color: 'CDD6F4',
      fill: { color: '1E1E2E' },
      align: 'left', valign: 'top', margin: 10,
      shape: 'roundRect',
      rectRadius: toRectRadius(10, obj.width, obj.height),
      wrap: true,
    });
  } else if (obj.type === 'image' && obj.src) {
    const loadedImg = await loadImage(obj.src, imageCache);
    if (loadedImg) {
      const fit = style.fit === 'contain' ? 'contain' : style.fit === 'fill' ? 'fill' : 'cover';
      const placed = await fitImageToBox(loadedImg, fit, x, y, w, h);
      pptxSlide.addImage({
        data: placed.data, x: placed.x, y: placed.y, w: placed.w, h: placed.h,
        rounding: style.frame === 'circle',
        rotate: style.rotate ?? 0,
        transparency,
      });
    }
  } else if (obj.type === 'youtube' && obj.src) {
    const videoId = extractYoutubeVideoId(obj.src);
    if (videoId) {
      const yt = await loadImage(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`, imageCache);
      if (yt) {
        const placed = await fitImageToBox(yt, 'cover', x, y, w, h);
        pptxSlide.addImage({
          data: placed.data, x: placed.x, y: placed.y, w: placed.w, h: placed.h,
          hyperlink: { url: `https://www.youtube.com/watch?v=${videoId}` },
        });
      }
    }
  }
}

// 완성된 슬라이드 덱을 파워포인트에서 바로 열고 편집 가능한 .pptx로 내보낸다.
// 배경(색/그라디언트/배경이미지)은 오브젝트 없이 스냅샷 이미지로 굽고, 텍스트/이미지/링크/이모지/코드는
// 실제 편집 가능한 PPTX 오브젝트로 그 위에 배치한다.
export async function exportDeckToPptx(deck: SlideDeck, onProgress?: (done: number, total: number) => void): Promise<void> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = deck.title || '슬라이드';

  const imageCache = new Map<string, string | null>();
  const total = deck.slides.length;
  const renderer = createSlideRenderer();

  try {
    onProgress?.(0, total);
    for (let i = 0; i < total; i++) {
      const slide = deck.slides[i];
      const pptxSlide = pptx.addSlide();
      const bgSnapshot = await renderer.render(slide, { includeObjects: false, format: 'jpeg' });
      pptxSlide.background = { data: bgSnapshot };

      const sortedObjects = [...slide.objects].sort((a, b) => a.zIndex - b.zIndex);
      for (const obj of sortedObjects) {
        await addObjectToSlide(pptxSlide, obj, slide.textColor, imageCache);
      }
      onProgress?.(i + 1, total);
    }
  } finally {
    renderer.dispose();
  }

  await pptx.writeFile({ fileName: `${deck.title || '슬라이드'}.pptx` });
}
