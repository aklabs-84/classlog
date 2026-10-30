import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Zap, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// 전체 명단이 아닌 탭에서 도우미 칸 대신 보이는 "바로가기" 작은 버튼.
// 벽(기본 왼쪽)에 붙어 있고, 끌면 위아래·좌우 벽으로 옮길 수 있다 (FloatingLessonMemo와 같은 방식).
// 누르면 바로가기 메뉴가 작게 펼쳐진다. 자리는 이 브라우저에 기억한다.

export interface QuickItem { key: string; label: string; icon: LucideIcon; run: () => void; badge?: number }

const DOCK_KEY = 'classroom_quick_dock_v1';
const readLS = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const writeLS = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 기억 못 해도 화면은 정상 */ } };
const clampY = (y: number) => Math.min(Math.max(y, 80), window.innerHeight - 80);

const ClassroomQuickDock = ({ items }: { items: QuickItem[] }) => {
  const [open, setOpen] = useState(false);
  const [dock, setDock] = useState<{ side: 'left' | 'right'; y: number }>(() => {
    try {
      const v = JSON.parse(readLS(DOCK_KEY) || 'null');
      if (v && (v.side === 'left' || v.side === 'right') && typeof v.y === 'number') return { side: v.side, y: clampY(v.y) };
    } catch { /* 기본 자리 사용 */ }
    return { side: 'left', y: Math.round(window.innerHeight * 0.4) };
  });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const info = useRef<{ sx: number; sy: number; moved: boolean } | null>(null);

  useEffect(() => {
    const fit = () => setDock(prev => ({ ...prev, y: clampY(prev.y) }));
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (items.length === 0) return null;

  const down = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    info.current = { sx: e.clientX, sy: e.clientY, moved: false };
  };
  const move = (e: React.PointerEvent) => {
    const d = info.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6) return;
    d.moved = true;
    setDrag({ x: e.clientX, y: clampY(e.clientY) });
  };
  const up = (e: React.PointerEvent) => {
    const d = info.current;
    info.current = null;
    if (!d) return;
    if (!d.moved) { setOpen(v => !v); return; }
    const next = { side: e.clientX < window.innerWidth / 2 ? 'left' as const : 'right' as const, y: clampY(e.clientY) };
    setDrag(null);
    setDock(next);
    writeLS(DOCK_KEY, JSON.stringify(next));
  };

  const left = (drag ? drag.x < window.innerWidth / 2 : dock.side === 'left');
  const y = drag ? drag.y : dock.y;
  const pending = items.reduce((n, i) => n + (i.badge || 0), 0);

  return createPortal(
    <>
      {open && <div className="fixed inset-0 z-[55]" onClick={() => setOpen(false)} aria-hidden />}
      <div className="fixed z-[56]" style={{ top: y, [left ? 'left' : 'right']: 0, transform: 'translateY(-50%)' }}>
        <button
          type="button"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => { info.current = null; setDrag(null); }}
          aria-label="바로가기 메뉴"
          aria-expanded={open}
          title="바로가기 (끌어서 옮길 수 있어요)"
          style={{ touchAction: 'none' }}
          className={`relative h-12 w-9 flex items-center justify-center bg-primary text-white shadow-lg hover:w-10 transition-[width] cursor-grab active:cursor-grabbing ${left ? 'rounded-r-2xl' : 'rounded-l-2xl'}`}
        >
          <Zap size={18} />
          {pending > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-[11px] font-black inline-flex items-center justify-center">{pending}</span>}
        </button>
        {open && !drag && (
          <div className={`absolute top-1/2 -translate-y-1/2 w-[260px] max-h-[70vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-surface-container-lowest shadow-xl p-2 ${left ? 'left-11' : 'right-11'}`}>
            <div className="flex items-center justify-between px-2 pt-1 pb-1.5">
              <span className="text-[15px] font-bold text-on-surface">바로가기</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="닫기" className="p-1 rounded-lg text-on-surface-variant hover:bg-primary-container/60"><X size={16} /></button>
            </div>
            {items.map(({ key, label, icon: Icon, run, badge }) => (
              <button
                key={key}
                type="button"
                onClick={() => { setOpen(false); run(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[15px] font-semibold text-on-surface hover:bg-primary-container/60 transition-colors text-left"
              >
                <Icon size={17} className="text-primary shrink-0" />
                <span className="flex-1">{label}</span>
                {!!badge && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-white text-[12px] font-black inline-flex items-center justify-center">{badge}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </>,
    document.body,
  );
};

export default ClassroomQuickDock;
