import jsPDF from 'jspdf';
import type { SlideDeck } from '../types';
import { DECK_CANVAS_W, DECK_CANVAS_H } from '../types';
import { createSlideRenderer } from './renderSlideToImage';

const PAGE_W_IN = DECK_CANVAS_W / 96;
const PAGE_H_IN = DECK_CANVAS_H / 96;

export async function exportDeckToPdf(deck: SlideDeck, onProgress?: (done: number, total: number) => void): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'in', format: [PAGE_W_IN, PAGE_H_IN], compress: true });
  const total = deck.slides.length;
  const renderer = createSlideRenderer();

  try {
    onProgress?.(0, total);
    for (let i = 0; i < total; i++) {
      const dataUrl = await renderer.render(deck.slides[i], { includeObjects: true, format: 'jpeg' });
      if (i > 0) doc.addPage([PAGE_W_IN, PAGE_H_IN], 'landscape');
      doc.addImage(dataUrl, 'JPEG', 0, 0, PAGE_W_IN, PAGE_H_IN, undefined, 'FAST');
      onProgress?.(i + 1, total);
    }
  } finally {
    renderer.dispose();
  }

  doc.save(`${deck.title || '슬라이드'}.pdf`);
}
