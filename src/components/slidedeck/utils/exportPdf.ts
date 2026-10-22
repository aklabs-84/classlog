import jsPDF from 'jspdf';
import type { SlideDeck } from '../types';
import { DECK_CANVAS_W, DECK_CANVAS_H } from '../types';
import { renderSlideToImage } from './renderSlideToImage';

const PAGE_W_IN = DECK_CANVAS_W / 96;
const PAGE_H_IN = DECK_CANVAS_H / 96;

export async function exportDeckToPdf(deck: SlideDeck): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'in', format: [PAGE_W_IN, PAGE_H_IN] });

  for (let i = 0; i < deck.slides.length; i++) {
    const dataUrl = await renderSlideToImage(deck.slides[i], { includeObjects: true, format: 'jpeg' });
    if (i > 0) doc.addPage([PAGE_W_IN, PAGE_H_IN], 'landscape');
    doc.addImage(dataUrl, 'JPEG', 0, 0, PAGE_W_IN, PAGE_H_IN);
  }

  doc.save(`${deck.title || '슬라이드'}.pdf`);
}
