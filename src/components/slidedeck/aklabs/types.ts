import type { SlideObject } from '../types';

export interface AklabsShowcaseSlide {
  key: string;      // 레이아웃 이름 (cover, roadmap, ...)
  label: string;    // 사용자에게 보이는 이름
  type: string;
  objects: Omit<SlideObject, 'id'>[];
  fills: { objectIndex: number; role: string; maxChars: number }[];  // AI가 채울 수 있는 글 칸
}

export interface AklabsShowcase {
  id: string;
  label: string;
  bg: string;
  textColor: string;
  accentColor: string;
  slides: AklabsShowcaseSlide[];
}
