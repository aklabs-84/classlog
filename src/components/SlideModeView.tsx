import { useState, useEffect, useLayoutEffect, useMemo, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTimer } from '../lib/timerContext';
import { renderMarpSlides } from '../lib/marpConvert';
import { exportMarpSlidesToPdf } from '../lib/exportMarpPdf';
import type { PresentationMaterial } from './PresentationModal';
import ActivityLinksButton from './ActivityLinksButton';
import {
  ArrowLeft, ZoomIn, PenTool, Undo2, Highlighter, Flashlight, Timer as TimerIcon, Play, Pause,
  Sun, Moon, X as XIcon, ChevronLeft, ChevronRight, Download, Loader2, Maximize2, Minimize2,
} from 'lucide-react';

const PEN_COLORS = ['#ff5252', '#ffd600', '#4ade80', '#ffffff'];

type Tool = 'none' | 'zoom' | 'pen' | 'spotlight';

const SlideModeView = ({
  material,
  coverImageUrl,
  onClose,
}: {
  material: PresentationMaterial;
  coverImageUrl?: string | null;
  onClose: () => void;
}) => {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const dark = theme === 'dark';
  const [slideIndex, setSlideIndex] = useState(0);
  const [tool, setTool] = useState<Tool>('none');
  const [lensPos, setLensPos] = useState<{ x: number; y: number } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const timer = useTimer();

  // 슬라이드 모드는 기본적으로 전체화면으로 진입하지 않는다 — 상단 바의 버튼을 눌러야만
  // 브라우저 실제 전체화면(Fullscreen API)으로 전환된다.
  useEffect(() => {
    const handleChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleChange);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else rootRef.current?.requestFullscreen?.().catch(() => {});
  };

  const { html, css, slideCount } = useMemo(() => renderMarpSlides(material.content), [material.content]);

  // 자료가 바뀌면(다른 자료를 슬라이드로 보기) 이전 화면 상태를 초기화
  useEffect(() => {
    setSlideIndex(0);
    setTool('none');
    setLensPos(null);
  }, [material.content]);

  const clampIndex = (i: number) => Math.max(0, Math.min(slideCount - 1, i));
  const goPrev = () => setSlideIndex(i => clampIndex(i - 1));
  const goNext = () => setSlideIndex(i => clampIndex(i + 1));

  const selectTool = (t: Tool) => {
    setLensPos(null);
    setTool(current => (current === t ? 'none' : t));
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      if (!isTyping) {
        if (e.key === '1') { setTheme(t => (t === 'dark' ? 'light' : 'dark')); return; }
        if (e.key === '2') { selectTool('zoom'); return; }
        if (e.key === '3') { selectTool('pen'); return; }
        if (e.key === '4') { selectTool('spotlight'); return; }
        if (e.key === '5') { if (timer.isAlarming) timer.stopAlarm(); else timer.toggle(); return; }
        if (e.key === '6') { toggleFullscreen(); return; }
        if (tool === 'none') {
          if (e.key === 'ArrowLeft') { goPrev(); return; }
          if (e.key === 'ArrowRight') { goNext(); return; }
        }
      }
      if (tool !== 'none' && e.key === 'Escape') { setTool('none'); return; }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, tool, timer, slideCount]);

  // 슬라이드 하나가 16:9 비율을 유지하면서 화면에 꽉 차도록 크기 계산
  const viewRef = useRef<HTMLDivElement>(null);
  const [paneSize, setPaneSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const calc = () => {
      const el = viewRef.current;
      if (el) setPaneSize({ width: el.clientWidth, height: el.clientHeight });
    };
    calc();
    const ro = new ResizeObserver(calc);
    if (viewRef.current) ro.observe(viewRef.current);
    window.addEventListener('resize', calc);
    return () => { ro.disconnect(); window.removeEventListener('resize', calc); };
  }, []);

  const stageSize = useMemo(() => {
    if (!paneSize.width || !paneSize.height) return { width: 0, height: 0 };
    let w = paneSize.width;
    let h = (w * 9) / 16;
    if (h > paneSize.height) { h = paneSize.height; w = (h * 16) / 9; }
    return { width: Math.round(w), height: Math.round(h) };
  }, [paneSize]);

  const themedHtml = useMemo(
    () => html.replace(/<section\b/g, `<section data-theme="${theme}"`),
    [html, theme],
  );

  const carouselStyle = `
    .marp-slide-carousel { position: relative; width: 100%; height: 100%; overflow: hidden; }
    .marp-slide-carousel .marpit { display: flex; width: 100%; height: 100%; transform: translateX(-${slideIndex * 100}%); transition: transform .35s cubic-bezier(.4,0,.2,1); }
    .marp-slide-carousel .marpit > svg { flex: 0 0 100%; width: 100%; height: 100%; display: block; }
  `;

  const stageBoxRef = useRef<HTMLDivElement>(null);
  const handleStageMouseMove = (e: ReactMouseEvent) => {
    const box = stageBoxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    setLensPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  // ── 펜 그리기 (Canvas 오버레이) ──
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const undoStackRef = useRef<ImageData[]>([]);
  const [penColor, setPenColor] = useState('#ff5252');
  const [penHighlight, setPenHighlight] = useState(false);
  const [canUndo, setCanUndo] = useState(false);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !stageSize.width || !stageSize.height) return;
    canvas.width = stageSize.width;
    canvas.height = stageSize.height;
    undoStackRef.current = [];
    setCanUndo(false);
  }, [stageSize.width, stageSize.height, slideIndex]);

  const getCanvasPoint = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePenDown = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    drawingRef.current = true;
    lastPointRef.current = getCanvasPoint(e);
    try {
      undoStackRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      setCanUndo(true);
    } catch {
      // 캔버스 크기가 0인 경우 등 — undo만 비활성화
    }
  };

  const handlePenMove = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !lastPointRef.current) return;
    const point = getCanvasPoint(e);
    ctx.globalAlpha = penHighlight ? 0.35 : 1;
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penHighlight ? 18 : 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
  };

  const handlePenUp = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const handleUndo = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const lastState = undoStackRef.current.pop();
    if (lastState) ctx.putImageData(lastState, 0, 0);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
    setCanUndo(undoStackRef.current.length > 0);
  };

  const handleClearPen = () => {
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    undoStackRef.current = [];
    setCanUndo(false);
  };

  const handleExportPdf = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportMarpSlidesToPdf(material.content, material.title, coverImageUrl);
    } catch (err) {
      console.error(err);
      alert('슬라이드 PDF 생성 중 오류가 발생했습니다.');
    } finally {
      setExporting(false);
    }
  };

  const ZOOM = 2.6;
  const SPOTLIGHT_RADIUS = 190;
  const SPOTLIGHT_ZOOM = 1.6;

  const carouselNode = (
    <>
      <style>{carouselStyle}</style>
      <div className="marp-slide-carousel" dangerouslySetInnerHTML={{ __html: themedHtml }} />
    </>
  );

  return createPortal(
    <div ref={rootRef} className={`fixed inset-0 z-[9999] flex flex-col ${tool === 'none' ? '' : 'select-none'} ${dark ? 'bg-[#0a0a14]' : 'bg-slate-50'}`}>
      <style>{css}</style>

      {/* 상단 바 */}
      <div className={`flex items-center gap-3 px-5 py-3 border-b shrink-0 ${dark ? 'border-white/10 bg-white/5' : 'border-slate-900/10 bg-white'}`}>
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-slate-800 font-black text-sm hover:bg-slate-100 active:scale-95 transition-all shadow"
        >
          <ArrowLeft size={15} /> 나가기
        </button>
        <div className="flex items-center gap-2 ml-2 flex-1 min-w-0">
          <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
          <span className={`text-sm font-bold truncate ${dark ? 'text-white/60' : 'text-slate-500'}`}>{material.title} · 슬라이드 보기</span>
        </div>

        <ActivityLinksButton links={material.activity_urls} dark={dark} />

        {/* 슬라이드 이동 */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={goPrev}
            disabled={slideIndex <= 0}
            title="이전 슬라이드 (←)"
            className={`p-2 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed ${dark ? 'bg-white/10 text-white/70 hover:bg-white/20' : 'bg-slate-900/5 text-slate-600 hover:bg-slate-900/10'}`}
          >
            <ChevronLeft size={16} />
          </button>
          <span className={`text-xs font-black tabular-nums px-1 ${dark ? 'text-white/60' : 'text-slate-500'}`}>
            {slideIndex + 1} / {slideCount}
          </span>
          <button
            onClick={goNext}
            disabled={slideIndex >= slideCount - 1}
            title="다음 슬라이드 (→)"
            className={`p-2 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed ${dark ? 'bg-white/10 text-white/70 hover:bg-white/20' : 'bg-slate-900/5 text-slate-600 hover:bg-slate-900/10'}`}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* 발표 보조 도구 */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
            title={dark ? '밝게 보기 (1)' : '어둡게 보기 (1)'}
            className={`p-2 rounded-xl transition-all ${dark ? 'bg-white/10 text-white/70 hover:bg-white/20' : 'bg-slate-900/5 text-slate-600 hover:bg-slate-900/10'}`}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            onClick={() => selectTool('zoom')}
            title="돋보기 (2)"
            className={`p-2 rounded-xl transition-all ${tool === 'zoom' ? 'bg-primary text-white' : dark ? 'bg-white/10 text-white/70 hover:bg-white/20' : 'bg-slate-900/5 text-slate-600 hover:bg-slate-900/10'}`}
          >
            <ZoomIn size={16} />
          </button>
          <button
            onClick={() => selectTool('pen')}
            title="펜 (3)"
            className={`p-2 rounded-xl transition-all ${tool === 'pen' ? 'bg-primary text-white' : dark ? 'bg-white/10 text-white/70 hover:bg-white/20' : 'bg-slate-900/5 text-slate-600 hover:bg-slate-900/10'}`}
          >
            <PenTool size={16} />
          </button>
          <button
            onClick={() => selectTool('spotlight')}
            title="스포트라이트 (4)"
            className={`p-2 rounded-xl transition-all ${tool === 'spotlight' ? 'bg-primary text-white' : dark ? 'bg-white/10 text-white/70 hover:bg-white/20' : 'bg-slate-900/5 text-slate-600 hover:bg-slate-900/10'}`}
          >
            <Flashlight size={16} />
          </button>
          <div className={`flex items-center rounded-xl ${dark ? 'bg-white/10' : 'bg-slate-900/5'}`}>
            <button
              onClick={timer.isAlarming ? timer.stopAlarm : timer.toggle}
              title={timer.isAlarming ? '알림 끄기 (5)' : '타이머 시작/정지 (5)'}
              className={`flex items-center gap-1.5 pl-2.5 pr-1.5 py-2 rounded-l-xl text-xs font-black tabular-nums transition-all ${timer.isAlarming ? 'bg-red-500 text-white animate-pulse' : timer.isRunning ? 'bg-primary text-white' : dark ? 'text-white/70 hover:bg-white/20' : 'text-slate-600 hover:bg-slate-900/10'}`}
            >
              {timer.isAlarming ? <XIcon size={14} /> : timer.isRunning ? <Pause size={14} /> : <Play size={14} />}
              <TimerIcon size={14} />
              {String(Math.floor(timer.remainingSeconds / 60)).padStart(2, '0')}:{String(timer.remainingSeconds % 60).padStart(2, '0')}
            </button>
            <input
              type="number"
              min={0}
              max={99}
              value={Math.floor(timer.totalSeconds / 60)}
              onChange={(e) => timer.applyTime(Math.max(0, Math.min(99, Number(e.target.value) || 0)), 0)}
              title="타이머 시간(분) 직접 입력"
              className={`w-9 text-center text-xs font-black bg-transparent focus:outline-none py-2 ${dark ? 'text-white/70' : 'text-slate-600'}`}
            />
            <span className={`text-[10px] font-bold pr-2 ${dark ? 'text-white/40' : 'text-slate-400'}`}>분</span>
          </div>
        </div>

        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? '전체화면 종료 (6)' : '전체화면 (6)'}
          className={`p-2 rounded-xl transition-all shrink-0 ${dark ? 'bg-white/10 text-white/70 hover:bg-white/20' : 'bg-slate-900/5 text-slate-600 hover:bg-slate-900/10'}`}
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        <button
          onClick={handleExportPdf}
          disabled={exporting}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white font-black text-sm hover:brightness-110 active:scale-95 transition-all shadow shrink-0 disabled:opacity-60"
        >
          {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
          슬라이드 PDF
        </button>
      </div>

      {/* 본문 영역 — 슬라이드 스테이지 */}
      <div ref={viewRef} className="flex-1 min-h-0 flex items-center justify-center overflow-hidden p-6">
        {stageSize.width > 0 && (
          <div
            ref={stageBoxRef}
            className="relative rounded-2xl overflow-hidden shadow-2xl"
            style={{ width: stageSize.width, height: stageSize.height, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
            onMouseMove={tool === 'zoom' || tool === 'spotlight' ? handleStageMouseMove : undefined}
            onMouseLeave={() => setLensPos(null)}
          >
            {carouselNode}

            {/* 돋보기 */}
            {tool === 'zoom' && lensPos && (() => {
              const panelW = stageSize.width;
              const panelH = stageSize.height;
              const scaledW = panelW * ZOOM;
              const scaledH = panelH * ZOOM;
              let tx = panelW / 2 - lensPos.x * ZOOM;
              let ty = panelH / 2 - lensPos.y * ZOOM;
              tx = Math.min(0, Math.max(panelW - scaledW, tx));
              ty = Math.min(0, Math.max(panelH - scaledH, ty));
              return (
                <div className="absolute inset-0 z-30 overflow-hidden pointer-events-none border-4 border-primary rounded-2xl">
                  <div style={{ width: panelW, height: panelH, transform: `translate(${tx}px, ${ty}px) scale(${ZOOM})`, transformOrigin: '0 0' }}>
                    {carouselNode}
                  </div>
                  <span className="absolute top-2.5 left-3.5 flex items-center gap-1.5 text-[11px] font-black text-white bg-black/55 px-2.5 py-1 rounded-lg">
                    <ZoomIn size={12} /> 돋보기 {ZOOM}x
                  </span>
                </div>
              );
            })()}

            {/* 스포트라이트 */}
            {tool === 'spotlight' && lensPos && (() => {
              const panelW = stageSize.width;
              const panelH = stageSize.height;
              const scaledW = panelW * SPOTLIGHT_ZOOM;
              const scaledH = panelH * SPOTLIGHT_ZOOM;
              let tx = lensPos.x - lensPos.x * SPOTLIGHT_ZOOM;
              let ty = lensPos.y - lensPos.y * SPOTLIGHT_ZOOM;
              tx = Math.min(0, Math.max(panelW - scaledW, tx));
              ty = Math.min(0, Math.max(panelH - scaledH, ty));
              return (
                <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden">
                  <div
                    className="absolute inset-0 overflow-hidden"
                    style={{
                      clipPath: `circle(${SPOTLIGHT_RADIUS}px at ${lensPos.x}px ${lensPos.y}px)`,
                      WebkitClipPath: `circle(${SPOTLIGHT_RADIUS}px at ${lensPos.x}px ${lensPos.y}px)`,
                    }}
                  >
                    <div style={{ width: panelW, height: panelH, transform: `translate(${tx}px, ${ty}px) scale(${SPOTLIGHT_ZOOM})`, transformOrigin: '0 0' }}>
                      {carouselNode}
                    </div>
                  </div>
                  <div
                    className="absolute inset-0"
                    style={{
                      background: 'rgba(0,0,0,0.92)',
                      WebkitMaskImage: `radial-gradient(circle ${SPOTLIGHT_RADIUS}px at ${lensPos.x}px ${lensPos.y}px, transparent 0px, transparent ${SPOTLIGHT_RADIUS - 3}px, black ${SPOTLIGHT_RADIUS}px)`,
                      maskImage: `radial-gradient(circle ${SPOTLIGHT_RADIUS}px at ${lensPos.x}px ${lensPos.y}px, transparent 0px, transparent ${SPOTLIGHT_RADIUS - 3}px, black ${SPOTLIGHT_RADIUS}px)`,
                    }}
                  />
                  <div
                    className="absolute rounded-full"
                    style={{
                      width: SPOTLIGHT_RADIUS * 2,
                      height: SPOTLIGHT_RADIUS * 2,
                      left: lensPos.x - SPOTLIGHT_RADIUS,
                      top: lensPos.y - SPOTLIGHT_RADIUS,
                      boxShadow: '0 0 0 4px rgba(255,255,255,0.95), 0 0 50px 12px rgba(255,255,255,0.6)',
                    }}
                  />
                </div>
              );
            })()}

            {/* 펜 그리기 캔버스 */}
            <canvas
              ref={canvasRef}
              className="absolute inset-0 z-40"
              style={{
                pointerEvents: tool === 'pen' ? 'auto' : 'none',
                cursor: tool === 'pen' ? 'crosshair' : 'default',
                touchAction: 'none',
              }}
              onMouseDown={handlePenDown}
              onMouseMove={handlePenMove}
              onMouseUp={handlePenUp}
              onMouseLeave={handlePenUp}
              onDragStart={(e) => e.preventDefault()}
            />
          </div>
        )}
      </div>

      {/* 펜 보조 도구바 */}
      {tool === 'pen' && (
        <div className={`shrink-0 flex items-center justify-center gap-4 px-6 py-3 border-t ${dark ? 'border-white/10 bg-white/5' : 'border-slate-900/10 bg-white'}`}>
          <div className="flex items-center gap-1.5">
            {PEN_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setPenColor(c)}
                title={c}
                className={`w-7 h-7 rounded-full border-2 transition-all ${penColor === c ? 'border-primary scale-110' : dark ? 'border-white/20 hover:border-white/50' : 'border-slate-900/15 hover:border-slate-900/40'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <button
            onClick={() => setPenHighlight(h => !h)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all ${penHighlight ? 'bg-primary/30 ring-2 ring-primary text-white' : dark ? 'bg-white/10 text-white/70 hover:bg-white/20' : 'bg-slate-900/5 text-slate-600 hover:bg-slate-900/10'}`}
          >
            <Highlighter size={14} /> 형광펜
          </button>
          <button
            onClick={handleUndo}
            disabled={!canUndo}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black disabled:opacity-30 disabled:cursor-not-allowed transition-all ${dark ? 'bg-white/10 text-white/70 hover:bg-white/20' : 'bg-slate-900/5 text-slate-600 hover:bg-slate-900/10'}`}
          >
            <Undo2 size={14} /> 실행취소
          </button>
          <button
            onClick={handleClearPen}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all ${dark ? 'bg-white/10 text-white/70 hover:bg-white/20' : 'bg-slate-900/5 text-slate-600 hover:bg-slate-900/10'}`}
          >
            <XIcon size={14} /> 전체 지우기
          </button>
        </div>
      )}
    </div>,
    document.body
  );
};

export default SlideModeView;
