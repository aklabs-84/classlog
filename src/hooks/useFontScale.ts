import { useLayoutEffect, useState } from 'react';

const STEPS = [90, 100, 110, 120, 130, 140];
const DEFAULT_SCALE = 110;
const STORAGE_KEY = 'classlog_font_scale';

export function useFontScale() {
  const [scale, setScale] = useState<number>(() => {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    return STEPS.includes(saved) ? saved : DEFAULT_SCALE;
  });

  useLayoutEffect(() => {
    document.documentElement.style.fontSize = `${scale}%`;
    localStorage.setItem(STORAGE_KEY, String(scale));
  }, [scale]);

  const idx = STEPS.indexOf(scale);

  return {
    scale,
    canDecrease: idx > 0,
    canIncrease: idx < STEPS.length - 1,
    decrease: () => setScale(STEPS[Math.max(0, idx - 1)]),
    increase: () => setScale(STEPS[Math.min(STEPS.length - 1, idx + 1)]),
  };
}
