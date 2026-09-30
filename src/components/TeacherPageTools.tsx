import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';
import { ZoomIn, PenTool, Flashlight, Undo2, Highlighter, X as XIcon } from 'lucide-react';

// 선생님이 학생 자료 화면(스크롤되는 한 페이지)을 보며 쓰는 수업 도구 — 돋보기 / 펜 / 스포트라이트.
// 발표 모드(PresentationModal)와 같은 동작이지만, 여기 화면은 입력칸이 들어 있는 살아있는 페이지라
// 본문을 다시 그리지 않고 "도구를 켤 때 찍어 둔 화면 복사본"을 확대해 보여준다.
// 이 컴포넌트는 화면 보조 도구일 뿐이며 데이터 접근 권한과는 무관하다.

type Tool = 'none' | 'zoom' | 'pen' | 'spotlight';

const PEN_COLORS = ['#ff5252', '#ffd600', '#4ade80', '#1f2937'];
const ZOOM = 2.2;
const SPOTLIGHT_RADIUS = 170;
const SPOTLIGHT_ZOOM = 1.6;
const DESKTOP_QUERY = '(min-width: 1024px)';

interface Props {
  /** 본문이 스크롤되는 영역 (첫 번째 자식이 본문 전체를 감싸는 요소여야 한다) */
  scrollRef: RefObject<HTMLElement | null>;
}

const toolBtnStyle = (active: boolean): CSSProperties => ({
  padding: 8, borderRadius: 8, border: 'none', cursor: 'pointer',
  background: active ? '#3B82F6' : 'rgba(255,255,255,0.15)', color: '#fff', display: 'flex', alignItems: 'center',
});

const chipStyle = (active: boolean, disabled = false): CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 8, border: 'none',
  background: active ? '#3B82F6' : 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 12,
  cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.3 : 1,
});

const TeacherPageTools = ({ scrollRef }: Props) => {
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches);
  const [tool, setTool] = useState<Tool>('none');
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [lensPos, setLensPos] = useState<{ x: number; y: number } | null>(null);
  const [scrollTick, setScrollTick] = useState(0); // 스크롤할 때 돋보기 위치를 다시 계산하기 위한 값
  const [snapshotReady, setSnapshotReady] = useState(0);
  const zoomCloneRef = useRef<HTMLDivElement>(null);
  const spotCloneRef = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef<HTMLElement | null>(null);

  // 펜 상태
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const undoStackRef = useRef<ImageData[]>([]);
  const [penColor, setPenColor] = useState('#ff5252');
  const [penHighlight, setPenHighlight] = useState(false);
  const [canUndo, setCanUndo] = useState(false);

  const selectTool = useCallback((t: Tool) => setTool(prev => (prev === t ? 'none' : t)), []);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  useEffect(() => { if (!isDesktop) setTool('none'); }, [isDesktop]);

  // 본문 영역의 화면상 위치/크기 추적 (오버레이를 그 위에 정확히 덮기 위해)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isDesktop) return;
    const calc = () => {
      const r = el.getBoundingClientRect();
      setRect({ left: r.left, top: r.top, width: el.clientWidth, height: el.clientHeight });
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    window.addEventListener('resize', calc);
    return () => { ro.disconnect(); window.removeEventListener('resize', calc); };
  }, [scrollRef, isDesktop]);

  // 돋보기/스포트라이트를 켤 때 현재 화면(본문 전체)의 복사본을 떠 둔다 — 입력칸 값도 함께 옮긴다
  useEffect(() => {
    snapshotRef.current = null;
    if (tool !== 'zoom' && tool !== 'spotlight') return;
    const src = scrollRef.current?.firstElementChild as HTMLElement | null;
    if (!src) return;
    const clone = src.cloneNode(true) as HTMLElement;
    const origFields = src.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
    clone.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea').forEach((f, i) => {
      const o = origFields[i];
      if (!o) return;
      if ((f as HTMLInputElement).type === 'checkbox') (f as HTMLInputElement).checked = (o as HTMLInputElement).checked;
      else f.value = o.value;
    });
    clone.querySelectorAll('iframe, script, video, audio').forEach(n => n.remove());
    clone.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    clone.querySelectorAll('[data-fkey]').forEach(n => n.removeAttribute('data-fkey'));
    snapshotRef.current = clone;
    setSnapshotReady(n => n + 1);
  }, [tool, scrollRef]);

  // 복사본을 렌즈 안에 붙인다(도구 종류/위치가 바뀌어 렌즈 div가 새로 그려질 때마다)
  useLayoutEffect(() => {
    [zoomCloneRef.current, spotCloneRef.current].forEach(host => {
      if (!host || !snapshotRef.current) return;
      if (host.firstChild !== snapshotRef.current) {
        host.textContent = '';
        host.appendChild(snapshotRef.current.cloneNode(true));
        // cloneNode는 입력칸 값(속성이 아닌 상태)을 옮기지 못하므로 다시 맞춘다
        const from = snapshotRef.current.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
        host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea').forEach((f, i) => {
          const o = from[i];
          if (!o) return;
          if ((f as HTMLInputElement).type === 'checkbox') (f as HTMLInputElement).checked = (o as HTMLInputElement).checked;
          else f.value = o.value;
        });
      }
    });
  });

  // 스크롤 감지 — 도구가 켜져 있을 때 렌즈가 스크롤을 따라가도록
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || tool === 'none') return;
    const onScroll = () => setScrollTick(t => t + 1);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [scrollRef, tool]);

  // 캔버스 크기 = 본문 영역 크기
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !rect?.width || !rect?.height) return;
    canvas.width = rect.width;
    canvas.height = rect.height;
    undoStackRef.current = [];
    setCanUndo(false);
  }, [rect?.width, rect?.height, tool]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isDesktop) return;
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      if (e.key === 'z' || e.key === 'Z') { selectTool('zoom'); return; }
      if (e.key === 'p' || e.key === 'P') { selectTool('pen'); return; }
      if (e.key === 'l' || e.key === 'L') { selectTool('spotlight'); return; }
      if (e.key === 'Escape' && tool !== 'none') setTool('none');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDesktop, tool, selectTool]);

  const handleMove = (e: ReactMouseEvent) => {
    if (!rect) return;
    setLensPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const canvasPoint = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const penDown = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    drawingRef.current = true;
    lastPointRef.current = canvasPoint(e);
    try {
      undoStackRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      setCanUndo(true);
    } catch { /* 되돌리기만 못 쓰고 그리기는 계속 */ }
  };
  const penMove = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !lastPointRef.current) return;
    const p = canvasPoint(e);
    ctx.globalAlpha = penHighlight ? 0.35 : 1;
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penHighlight ? 18 : 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPointRef.current = p;
  };
  const penUp = () => { drawingRef.current = false; lastPointRef.current = null; };
  const undo = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const last = undoStackRef.current.pop();
    if (last) ctx.putImageData(last, 0, 0); else ctx.clearRect(0, 0, canvas.width, canvas.height);
    setCanUndo(undoStackRef.current.length > 0);
  };
  const clearPen = () => {
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    undoStackRef.current = [];
    setCanUndo(false);
  };

  // 오버레이가 마우스 휠을 가로채므로 아래 본문을 대신 스크롤해 준다
  const forwardWheel = (e: React.WheelEvent) => { scrollRef.current?.scrollBy({ top: e.deltaY }); };

  if (!isDesktop) return null;

  const sc = scrollRef.current;
  const scrollTop = sc ? sc.scrollTop : 0;
  const docHeight = sc ? sc.scrollHeight : 0;
  void scrollTick; void snapshotReady;

  return (
    <>
      {/* 상단 바에 들어가는 도구 버튼 */}
      <div className="flex items-center gap-1.5 shrink-0" role="group" aria-label="선생님 수업 도구">
        <button onClick={() => selectTool('zoom')} title="돋보기 (Z)" style={toolBtnStyle(tool === 'zoom')}><ZoomIn size={18} /></button>
        <button onClick={() => selectTool('pen')} title="펜 (P)" style={toolBtnStyle(tool === 'pen')}><PenTool size={18} /></button>
        <button onClick={() => selectTool('spotlight')} title="스포트라이트 (L)" style={toolBtnStyle(tool === 'spotlight')}><Flashlight size={18} /></button>
      </div>

      {tool !== 'none' && rect && (
        <div style={{ position: 'fixed', left: rect.left, top: rect.top, width: rect.width, height: rect.height, zIndex: 10000, overflow: 'hidden' }}>
          {/* 돋보기 — 커서 주변을 확대해 화면 위쪽에 보여주는 패널 */}
          {tool === 'zoom' && lensPos && (() => {
            const panelW = rect.width;
            const panelH = Math.round(rect.height * 0.6);
            const cx = lensPos.x;
            const cy = lensPos.y + scrollTop;
            let tx = panelW / 2 - cx * ZOOM;
            let ty = panelH / 2 - cy * ZOOM;
            tx = Math.min(0, Math.max(panelW - panelW * ZOOM, tx));
            ty = Math.min(0, Math.max(panelH - docHeight * ZOOM, ty));
            return (
              <div style={{
                position: 'absolute', left: 0, right: 0, top: 0, height: panelH, zIndex: 30, overflow: 'hidden', background: '#fff',
                borderRadius: '0 0 20px 20px', borderBottom: '4px solid #3B82F6', boxShadow: '0 12px 40px rgba(0,0,0,0.5)', pointerEvents: 'none',
              }}>
                <div ref={zoomCloneRef} style={{ width: panelW, transform: `translate(${tx}px, ${ty}px) scale(${ZOOM})`, transformOrigin: '0 0' }} />
                <span style={{
                  position: 'absolute', top: 8, left: 10, display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 11, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.55)', padding: '4px 8px', borderRadius: 8,
                }}>
                  <ZoomIn size={12} /> 돋보기 {ZOOM}x
                </span>
              </div>
            );
          })()}

          {/* 스포트라이트 — 원 안쪽은 커서 중심 확대, 바깥은 어둡게 */}
          {tool === 'spotlight' && lensPos && (() => {
            const cx = lensPos.x;
            const cy = lensPos.y + scrollTop;
            const tx = lensPos.x - cx * SPOTLIGHT_ZOOM;
            const ty = lensPos.y - cy * SPOTLIGHT_ZOOM;
            const circle = `circle(${SPOTLIGHT_RADIUS}px at ${lensPos.x}px ${lensPos.y}px)`;
            const mask = `radial-gradient(circle ${SPOTLIGHT_RADIUS}px at ${lensPos.x}px ${lensPos.y}px, transparent 0px, transparent ${SPOTLIGHT_RADIUS - 3}px, black ${SPOTLIGHT_RADIUS}px)`;
            return (
              <div style={{ position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', clipPath: circle, WebkitClipPath: circle, background: '#fff' } as CSSProperties}>
                  <div ref={spotCloneRef} style={{ position: 'absolute', left: 0, top: 0, width: rect.width, transform: `translate(${tx}px, ${ty}px) scale(${SPOTLIGHT_ZOOM})`, transformOrigin: '0 0' }} />
                </div>
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', WebkitMaskImage: mask, maskImage: mask } as CSSProperties} />
                <div style={{
                  position: 'absolute', borderRadius: '50%', width: SPOTLIGHT_RADIUS * 2, height: SPOTLIGHT_RADIUS * 2,
                  left: lensPos.x - SPOTLIGHT_RADIUS, top: lensPos.y - SPOTLIGHT_RADIUS,
                  boxShadow: '0 0 0 4px rgba(255,255,255,0.95), 0 0 50px 12px rgba(255,255,255,0.6)',
                }} />
              </div>
            );
          })()}

          {/* 마우스 추적/그리기용 투명 레이어 (입력칸이 실수로 눌리지 않게 본문 위를 덮는다) */}
          <div
            style={{ position: 'absolute', inset: 0, zIndex: 40, cursor: tool === 'pen' ? 'crosshair' : 'default' }}
            onMouseMove={tool === 'zoom' || tool === 'spotlight' ? handleMove : undefined}
            onMouseLeave={() => setLensPos(null)}
            onWheel={forwardWheel}
          >
            <canvas
              ref={canvasRef}
              style={{ width: '100%', height: '100%', pointerEvents: tool === 'pen' ? 'auto' : 'none', touchAction: 'none' }}
              onMouseDown={tool === 'pen' ? penDown : undefined}
              onMouseMove={tool === 'pen' ? penMove : undefined}
              onMouseUp={tool === 'pen' ? penUp : undefined}
              onMouseLeave={tool === 'pen' ? penUp : undefined}
              onDragStart={e => e.preventDefault()}
            />
          </div>
        </div>
      )}

      {tool === 'pen' && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 10001,
          display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(20,20,20,0.88)', borderRadius: 12, padding: '8px 16px',
        }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {PEN_COLORS.map(c => (
              <button key={c} onClick={() => setPenColor(c)} title={c}
                style={{ width: 22, height: 22, borderRadius: '50%', border: penColor === c ? '2px solid #3B82F6' : '2px solid rgba(255,255,255,0.3)', background: c, cursor: 'pointer', padding: 0 }} />
            ))}
          </div>
          <button onClick={() => setPenHighlight(h => !h)} style={chipStyle(penHighlight)}><Highlighter size={13} /> 형광펜</button>
          <button onClick={undo} disabled={!canUndo} style={chipStyle(false, !canUndo)}><Undo2 size={13} /> 실행취소</button>
          <button onClick={clearPen} style={chipStyle(false)}><XIcon size={13} /> 전체 지우기</button>
        </div>
      )}
    </>
  );
};

export default TeacherPageTools;
