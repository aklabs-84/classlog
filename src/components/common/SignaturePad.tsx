import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { Eraser } from 'lucide-react';

export interface SignaturePadHandle {
  /** 서명이 비었으면 null, 있으면 투명 배경 PNG */
  toBlob: () => Promise<Blob | null>;
  clear: () => void;
}

interface Props {
  onChange?: (hasInk: boolean) => void;
  height?: number;
}

/** 손가락/마우스/펜으로 서명을 그리는 칸. 터치 스크롤과 겹치지 않도록 touch-action:none */
const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad({ onChange, height = 160 }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  // 화면 크기에 맞춰 캔버스를 선명하게(고해상도) 맞춘다
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = Math.round(rect.width * dpr);
    c.height = Math.round(rect.height * dpr);
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#111827';
    }
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.01, p.y + 0.01);
    ctx.stroke();
    if (!hasInk) { setHasInk(true); onChange?.(true); }
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const up = () => { drawing.current = false; };

  const clear = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.restore();
    setHasInk(false);
    onChange?.(false);
  };

  useImperativeHandle(ref, () => ({
    clear,
    toBlob: () => new Promise(resolve => {
      const c = canvasRef.current;
      if (!c || !hasInk) { resolve(null); return; }
      c.toBlob(b => resolve(b), 'image/png');
    }),
  }));

  return (
    <div>
      <div className="relative rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 bg-white">
        <canvas
          ref={canvasRef}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          style={{ height, touchAction: 'none' }}
          className="w-full block cursor-crosshair rounded-xl"
          aria-label="서명하는 곳"
        />
        {!hasInk && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-on-surface-variant/60">
            여기에 서명해 주세요
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={clear}
        className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-on-surface-variant hover:text-on-surface"
      >
        <Eraser size={13} /> 지우고 다시 쓰기
      </button>
    </div>
  );
});

export default SignaturePad;
