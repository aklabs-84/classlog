import { useState, useEffect, useLayoutEffect, useMemo, useRef, useContext, createContext, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import { useTimer } from '../lib/timerContext';
import RichEditor from './RichEditor';
import ActivityLinksButton, { type ActivityLink } from './ActivityLinksButton';
import {
  ArrowLeft, Save, Pencil, X as XIcon,
  ZoomIn, PenTool, Undo2, Highlighter, Flashlight, Timer as TimerIcon, Play, Pause,
  Sun, Moon, Copy, Check, ChevronLeft, ChevronRight, FolderOpen, Link2, FileText, BellOff,
} from 'lucide-react';
import { useScrollLock } from '../hooks/useScrollLock';

const PEN_COLORS = ['#ff5252', '#ffd600', '#4ade80', '#ffffff'];

// 문단 바로 뒤에 빈 줄 없이 "---"가 붙으면 CommonMark가 구분선(hr) 대신 제목(Setext heading)이나
// 그냥 텍스트로 잘못 해석하는 경우가 있어, 렌더링 직전에 "---" 단독 줄 앞뒤로 빈 줄을 강제 삽입해 보정한다.
// (코드펜스 안의 "---"는 건드리지 않음)
export const normalizeStandaloneHr = (md: string): string => {
  const lines = md.split('\n');
  const out: string[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const isHr = !inFence && /^(-{3,}|_{3,}|\*{3,})$/.test(line.trim());
    if (isHr) {
      if (out.length > 0 && out[out.length - 1].trim() !== '') out.push('');
      out.push(line);
      if (lines[i + 1] !== undefined && lines[i + 1].trim() !== '') out.push('');
    } else {
      out.push(line);
    }
  }
  return out.join('\n');
};

// "#1. 제목"처럼 "#"과 글자 사이에 공백이 없으면 CommonMark가 제목(heading)이 아니라
// 그냥 텍스트로 인식해 "#"이 화면에 그대로 노출된다. 렌더링 직전에 공백을 강제로 넣어 보정한다.
// (코드펜스 안의 "#"은 건드리지 않음)
export const normalizeHeadingSpace = (md: string): string => {
  const lines = md.split('\n');
  let inFence = false;
  return lines.map(line => {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; return line; }
    if (inFence) return line;
    const m = line.match(/^(#{1,6})([^#\s].*)$/);
    return m ? `${m[1]} ${m[2]}` : line;
  }).join('\n');
};

// 슬라이드 글자 크기 편집 — 편집 패널의 %를 --slide-font-scale CSS 변수로 상위에서 지정하면
// 아래 각 요소가 calc()로 기본 rem 크기에 곱해서 반영한다 (Tailwind text-* 클래스는 rem 고정값이라 상속 배율 적용 불가)
const slideFontSize = (baseRem: number) => ({ fontSize: `calc(${baseRem}rem * var(--slide-font-scale, 1))` });

// 노션 스타일 콜아웃 블록 — RichEditor의 CalloutExtension이 `<div data-callout="...">`로 직렬화한 것을 렌더링
const CALLOUT_STYLES: Record<string, { icon: string; classes: string }> = {
  info: { icon: '💡', classes: 'bg-blue-50 border-blue-200 text-blue-900' },
  warning: { icon: '⚠️', classes: 'bg-amber-50 border-amber-200 text-amber-900' },
  tip: { icon: '✅', classes: 'bg-emerald-50 border-emerald-200 text-emerald-900' },
  important: { icon: '❗', classes: 'bg-red-50 border-red-200 text-red-900' },
};
const CALLOUT_STYLES_DARK: Record<string, { icon: string; classes: string }> = {
  info: { icon: '💡', classes: 'bg-blue-500/10 border-blue-400/30 text-blue-50' },
  warning: { icon: '⚠️', classes: 'bg-amber-500/10 border-amber-400/30 text-amber-50' },
  tip: { icon: '✅', classes: 'bg-emerald-500/10 border-emerald-400/30 text-emerald-50' },
  important: { icon: '❗', classes: 'bg-red-500/10 border-red-400/30 text-red-50' },
};
export const renderCallout = (props: any, dark: boolean) => {
  const { children, ...rest } = props;
  const type = rest['data-callout'];
  const style = type ? (dark ? CALLOUT_STYLES_DARK : CALLOUT_STYLES)[type] : undefined;
  if (!style) return <div {...rest}>{children}</div>;
  return (
    <div className={`my-3 rounded-xl border-2 flex gap-3 px-4 py-3 ${style.classes}`}>
      <span className="shrink-0 text-lg leading-none mt-0.5">{style.icon}</span>
      <div className="flex-1 min-w-0 text-sm [&>p]:m-0 [&>p]:mb-2 [&>p:last-child]:mb-0">{children}</div>
    </div>
  );
};

// 슬라이드 안 이미지를 클릭하면 전체화면으로 보여주기 위한 컨텍스트 — Provider가 없으면(null)
// 클릭해도 아무 동작 없이 일반 이미지처럼 보인다 (미리보기 등 확대가 필요 없는 곳에서 안전).
const SlideImageZoomContext = createContext<((src: string) => void) | null>(null);

const SlideImg = ({ src, alt, title }: { src?: string; alt?: string; title?: string }) => {
  const zoom = useContext(SlideImageZoomContext);
  const wm = (title || '').match(/(?:^|,)width:(\d+)/);
  const style = wm ? { width: `${wm[1]}px`, maxWidth: '100%' } : undefined;
  return (
    <img
      src={src}
      alt={alt}
      style={style}
      onClick={zoom ? () => zoom(src!) : undefined}
      className={`inline-block align-middle max-w-full h-auto rounded-2xl my-4 shadow-xl ${zoom ? 'cursor-zoom-in hover:opacity-90 transition-opacity' : ''}`}
    />
  );
};

// 발표 화면 코드박스 — 다른 화면(자료 에디터/학생 뷰)과 달리 우상단 복사 버튼이 없어서
// 발표 중 학생들이 코드를 그대로 복사할 수 없다는 문의로 추가.
const SlidePre = ({ dark, code }: { dark: boolean; code: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code).catch(() => {
      const el = document.createElement('textarea');
      el.value = code;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative my-4">
      <button
        onClick={handleCopy}
        className={`absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-black transition-all ${
          copied
            ? 'bg-emerald-500/20 text-emerald-400'
            : dark ? 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white' : 'bg-slate-900/10 text-slate-500 hover:bg-slate-900/20 hover:text-slate-800'
        }`}
      >
        {copied ? <><Check size={11} strokeWidth={3} /> 복사됨</> : <><Copy size={11} /> 복사</>}
      </button>
      <pre style={slideFontSize(1)} className={`rounded-2xl p-5 whitespace-pre-wrap break-words font-mono border ${dark ? 'bg-white/5 text-white/80 border-white/10' : 'bg-slate-900/[0.03] text-slate-700 border-slate-900/10'}`}>
        {code}
      </pre>
    </div>
  );
};

// ── 프레젠테이션 슬라이드 마크다운 렌더러 ────────────────────────────────────
// 발표 화면은 다크/라이트 두 테마를 지원한다 — dark=true면 짙은 배경 위 흰 글자,
// false면 밝은 배경 위 어두운 글자로 색상 세트 전체를 바꿔 반환한다.
const getSlideComponents = (
  dark: boolean,
  openDetailsKeysRef: { current: Set<number> },
  onToggleDetails: (key: number, isOpen: boolean) => void,
): any => {
  const SlideSummary = ({ children }: any) => (
    <summary className={`px-6 py-4 cursor-pointer font-black text-lg list-none flex items-center gap-3 select-none transition-colors [&::-webkit-details-marker]:hidden ${dark ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'}`}>
      <span className="text-sm opacity-70 shrink-0">▶</span> <span>{children}</span>
    </summary>
  );

  return {
  h1: ({ children }: any) => (
    <h1 style={slideFontSize(3)} className={`font-black mb-6 leading-tight tracking-tight ${dark ? 'text-white' : 'text-slate-900'}`}>{children}</h1>
  ),
  h2: ({ children }: any) => (
    <h2 style={slideFontSize(1.875)} className={`font-black mb-4 mt-6 ${dark ? 'text-white/90' : 'text-slate-800'}`}>{children}</h2>
  ),
  h3: ({ children }: any) => (
    <h3 style={slideFontSize(1.5)} className={`font-black mb-3 mt-5 ${dark ? 'text-white/80' : 'text-slate-700'}`}>{children}</h3>
  ),
  p: ({ children }: any) => (
    <p style={slideFontSize(1.25)} className={`leading-relaxed mb-4 ${dark ? 'text-white/75' : 'text-slate-600'}`}>{children}</p>
  ),
  ul: ({ children }: any) => <ul className="space-y-3 mb-4 pl-2">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal pl-6 space-y-3 mb-4">{children}</ol>,
  li: ({ children }: any) => (
    <li style={slideFontSize(1.25)} className={`flex items-start gap-3 ${dark ? 'text-white/75' : 'text-slate-600'}`}>
      <span className="mt-2 w-2 h-2 rounded-full bg-primary shrink-0" />
      <span>{children}</span>
    </li>
  ),
  blockquote: ({ children }: any) => (
    <blockquote style={slideFontSize(1.25)} className={`border-l-4 border-primary pl-6 italic my-4 ${dark ? 'text-white/60' : 'text-slate-500'}`}>{children}</blockquote>
  ),
  code: ({ children, className }: any) => {
    if (!className) {
      return <code style={slideFontSize(1.125)} className={`px-2 py-0.5 rounded font-mono text-primary ${dark ? 'bg-white/10' : 'bg-slate-900/5'}`}>{children}</code>;
    }
    return <code className={className}>{children}</code>;
  },
  pre: ({ children }: any) => {
    const child = (Array.isArray(children) ? children[0] : children) as any;
    const code = String(child?.props?.children ?? '').replace(/\n$/, '');
    return <SlidePre dark={dark} code={code} />;
  },
  strong: ({ children }: any) => <strong className={`font-black ${dark ? 'text-white' : 'text-slate-900'}`}>{children}</strong>,
  em: ({ children }: any) => <em className="italic text-primary">{children}</em>,
  img: ({ src, alt, title }: any) => <SlideImg src={src} alt={alt} title={title} />,
  a: ({ href, children }: any) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline">{children}</a>,
  hr: () => <hr className={`my-5 ${dark ? 'border-white/10' : 'border-slate-900/10'}`} />,
  table: ({ children }: any) => (
    <div className="overflow-auto mb-4">
      <table style={slideFontSize(1.125)} className={`w-full border-collapse ${dark ? 'text-white/80' : 'text-slate-700'}`}>{children}</table>
    </div>
  ),
  th: ({ children }: any) => (
    <th className={`border px-3 py-2 font-black text-left ${dark ? 'border-white/15 bg-white/10 text-white' : 'border-slate-900/10 bg-slate-900/5 text-slate-900'}`}>{children}</th>
  ),
  td: ({ children }: any) => (
    <td className={`border px-3 py-2 ${dark ? 'border-white/15' : 'border-slate-900/10'}`}>{children}</td>
  ),
  details: ({ children, node }: any) => {
    // 원문에서 <details>와 <summary>가 줄바꿈으로 떨어져 있으면 그 사이 개행이
    // children 배열의 첫 항목(공백 텍스트 노드)으로 끼어든다. 자리(0번 인덱스)가
    // 아니라 실제 summary 타입으로 찾아야 <summary>가 <details>의 직계 자식으로
    // 남아 — 안 그러면 브라우저가 유효한 summary로 인식하지 못해 기본 스타일로 표시된다.
    const arr = Array.isArray(children) ? children : [children];
    const summaryEl = arr.find((c: any) => c?.type === SlideSummary);
    const rest = arr.filter((c: any) => c !== summaryEl);
    // 돋보기/스포트라이트는 같은 마크다운을 별도의 DOM 트리로 다시 그린 "복제본"이라
    // <details>의 열림 상태가 브라우저 기본(비제어) 방식으로는 원본과 따로 논다.
    // 원문 소스 위치(offset)를 키로 삼아 열림 상태를 상위에서 공유 제어하면
    // 원본에서 펼친 토글이 복제본에도 그대로 반영된다.
    const key = node?.position?.start?.offset ?? 0;
    return (
      <details
        open={openDetailsKeysRef.current.has(key)}
        onToggle={(e) => onToggleDetails(key, (e.currentTarget as HTMLDetailsElement).open)}
        className={`my-4 rounded-2xl border overflow-hidden ${dark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white shadow-sm'}`}
      >
        {summaryEl}
        <div className="px-6 py-5">{rest}</div>
      </details>
    );
  },
  summary: SlideSummary,
  div: (props: any) => renderCallout(props, dark),
  };
};

export interface PresentationMaterial {
  title: string;
  content: string;
  activity_urls?: ActivityLink[];
}

// 발표 화면을 나가지 않고 다른 주차 자료로 바로 전환하기 위한 내비게이션 정보 —
// 주차별 자료 중 자료 에디터(class_materials)에 연결된 항목들만 대상으로 한다.
export interface PresentationWeekNav {
  weeks: { week: number; title: string }[];
  currentWeek: number;
  onNavigate: (week: number) => void;
}

// 발표 화면을 나가지 않고 등록된 일반 자료(링크/파일)를 바로 열어보기 위한 항목 —
// 실제 여는 동작(새 탭 열기 등)은 상위(Classroom)에서 처리해 이 컴포넌트는 Supabase를 몰라도 된다.
export interface PresentationResource {
  id: string;
  title: string;
  subtitle?: string;
  type: 'link' | 'file';
  onOpen: () => void;
}

// ── 프레젠테이션 모달 ─────────────────────────────────────────────────────────
const PresentationModal = ({
  material,
  onClose,
  onSave,
  weekNav,
  resources,
}: {
  material: PresentationMaterial;
  onClose: () => void;
  onSave?: (newContent: string) => void;
  weekNav?: PresentationWeekNav;
  resources?: PresentationResource[];
}) => {
  const [editMode, setEditMode] = useState(false);
  const [editedContent, setEditedContent] = useState(material.content);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const dark = theme === 'dark';

  // 토글(<details>) 열림 상태 — 돋보기/스포트라이트 복제본과 원본이 같은 상태를
  // 공유하도록 상위에서 제어. 키는 마크다운 소스 내 <details> 위치(offset).
  // ref로 최신값을 들고 있어야 하는 이유: 아래 slideComponents를 이 state에 의존해
  // 재생성하면 <details>/<summary>가 매 토글마다 통째로 리마운트되고, 이미 열린
  // <details>가 open 속성을 가진 채로 다시 마운트되며 브라우저가 toggle 이벤트를
  // 한 번 더 쏴 버려 무한 재열림 루프에 빠진다(펼치기는 되는데 접히지 않는 원인).
  const [openDetailsKeys, setOpenDetailsKeys] = useState<Set<number>>(new Set());
  const openDetailsKeysRef = useRef(openDetailsKeys);
  openDetailsKeysRef.current = openDetailsKeys;
  const toggleDetailsKey = (key: number, isOpen: boolean) => {
    setOpenDetailsKeys(prev => {
      const next = new Set(prev);
      if (isOpen) next.add(key); else next.delete(key);
      return next;
    });
  };

  const handleSaveEdits = () => {
    onSave?.(editedContent);
    setEditMode(false);
  };

  // ── 발표 중 보조 도구 (돋보기 / 펜 / 스포트라이트) ─────────────────────────
  const [tool, setTool] = useState<'none' | 'zoom' | 'pen' | 'spotlight'>('none');
  const [lensPos, setLensPos] = useState<{ x: number; y: number } | null>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const timer = useTimer();

  const selectTool = (t: typeof tool) => {
    setEditMode(false);
    setTool(prev => (prev === t ? 'none' : t));
  };

  // ── 주차 이동 (weekNav) ────────────────────────────────────────────────
  const weekIndex = weekNav ? weekNav.weeks.findIndex(w => w.week === weekNav.currentWeek) : -1;
  const goPrevWeek = () => {
    if (!weekNav || weekIndex <= 0) return;
    weekNav.onNavigate(weekNav.weeks[weekIndex - 1].week);
  };
  const goNextWeek = () => {
    if (!weekNav || weekIndex === -1 || weekIndex >= weekNav.weeks.length - 1) return;
    weekNav.onNavigate(weekNav.weeks[weekIndex + 1].week);
  };

  // ── 등록된 일반 자료(링크/파일) 패널 ───────────────────────────────────────
  const [showResourcePanel, setShowResourcePanel] = useState(false);
  const resourcePanelRef = useRef<HTMLDivElement>(null);

  // 전체화면 오버레이가 떠 있는 동안 배경 페이지 스크롤을 잠근다 — 안 그러면 배경 페이지의
  // 스크롤바와 본문 영역(stageBoxRef)의 자체 스크롤바가 겹쳐 오른쪽에 2중으로 보인다.
  useScrollLock(true);

  useEffect(() => {
    if (!showResourcePanel) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (resourcePanelRef.current && !resourcePanelRef.current.contains(e.target as Node)) {
        setShowResourcePanel(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showResourcePanel]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (zoomedImage) {
        if (e.key === 'Escape') setZoomedImage(null);
        return;
      }
      if (editMode) {
        if (e.key === 'Escape') setEditMode(false);
        return;
      }
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      if (!isTyping) {
        if (e.key === '1') { setTheme(t => (t === 'dark' ? 'light' : 'dark')); return; }
        if (e.key === '2') { selectTool('zoom'); return; }
        if (e.key === '3') { selectTool('pen'); return; }
        if (e.key === '4') { selectTool('spotlight'); return; }
        if (e.key === '5') { if (timer.isAlarming) timer.stopAlarm(); else timer.toggle(); return; }
        if (weekNav && tool === 'none') {
          if (e.key === 'ArrowLeft') { goPrevWeek(); return; }
          if (e.key === 'ArrowRight') { goNextWeek(); return; }
        }
      }
      if (tool !== 'none' && e.key === 'Escape') { setTool('none'); return; }
      if (showResourcePanel && e.key === 'Escape') { setShowResourcePanel(false); return; }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, editMode, tool, zoomedImage, timer, weekNav, weekIndex, showResourcePanel]);

  // ── 문서 스크롤 영역 크기/스크롤 위치 추적 (돋보기·스포트라이트가 "지금 화면에
  // 보이는 부분"을 계산하는 데 필요) — 편집모드로 전환되어도 캔버스가 리셋되지
  // 않도록, 크기 측정은 항상 마운트돼 있는 바깥 wrapper(viewRef) 기준으로 한다.
  const viewRef = useRef<HTMLDivElement>(null);
  const stageBoxRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<HTMLDivElement>(null);
  const [paneSize, setPaneSize] = useState({ width: 0, height: 0 });
  const [docHeight, setDocHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

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

  useEffect(() => {
    const doc = docRef.current;
    if (!doc) return;
    const update = () => setDocHeight(doc.scrollHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(doc);
    return () => ro.disconnect();
  }, [editMode]);

  const handleStageMouseMove = (e: ReactMouseEvent) => {
    const box = stageBoxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    setLensPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  // ── 문서 본문(돋보기/스포트라이트 복제본에도 동일하게 재사용) ─────────────────
  const slideComponents = useMemo(
    () => getSlideComponents(dark, openDetailsKeysRef, toggleDetailsKey),
    [dark],
  );
  const docInner = (
    <ReactMarkdown components={slideComponents} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
      {normalizeHeadingSpace(normalizeStandaloneHr(material.content))}
    </ReactMarkdown>
  );

  // ── 펜 그리기 (Canvas 오버레이 — 화면에 고정, 문서를 스크롤해도 그림은 그대로 남는다) ──
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const undoStackRef = useRef<ImageData[]>([]);
  const [penColor, setPenColor] = useState('#ff5252');
  const [penHighlight, setPenHighlight] = useState(false);
  const [canUndo, setCanUndo] = useState(false);

  // useEffect는 브라우저 페인트 이후 실행되어 첫 클릭 시점에 캔버스 크기가
  // 아직 반영되지 않을 수 있음 → useLayoutEffect로 페인트 전에 동기 반영
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !paneSize.width || !paneSize.height) return;
    canvas.width = paneSize.width;
    canvas.height = paneSize.height;
    undoStackRef.current = [];
    setCanUndo(false);
  }, [paneSize.width, paneSize.height]);

  const getCanvasPoint = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePenDown = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    // 드래그 상태부터 먼저 세팅 — undo 스냅샷 저장에 실패해도 그리기 자체는 항상 되도록
    drawingRef.current = true;
    lastPointRef.current = getCanvasPoint(e);
    try {
      undoStackRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      setCanUndo(true);
    } catch {
      // 캔버스 크기가 0이거나 스냅샷을 뜰 수 없는 경우 — undo만 비활성화하고 그리기는 계속
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

  // 주차를 이동해 material(title/content)이 바뀌면 이전 화면의 임시 상태(편집 중 텍스트,
  // 펼친 토글, 돋보기/펜 낙서, 확대 이미지, 스크롤 위치)가 새 자료에 그대로 남아있지 않도록 초기화한다.
  useEffect(() => {
    setEditedContent(material.content);
    setEditMode(false);
    setTool('none');
    setOpenDetailsKeys(new Set());
    setZoomedImage(null);
    handleClearPen();
    if (stageBoxRef.current) stageBoxRef.current.scrollTop = 0;
    setScrollTop(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material.title, material.content]);

  const SPOTLIGHT_RADIUS = 190;
  const SPOTLIGHT_ZOOM = 1.6;

  return createPortal(
    <SlideImageZoomContext.Provider value={setZoomedImage}>
    <div className={`fixed inset-0 z-[9999] flex flex-col ${tool === 'none' ? '' : 'select-none'} ${dark ? 'bg-[#0a0a14]' : 'bg-slate-50'}`}>

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
          <span className={`text-sm font-bold truncate ${dark ? 'text-white/60' : 'text-slate-500'}`}>{material.title}</span>
        </div>

        {!editMode && <ActivityLinksButton links={material.activity_urls} dark={dark} />}

        {/* 주차 이동 — 발표 화면을 나가지 않고 다른 주차 자료로 바로 전환 */}
        {weekNav && !editMode && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={goPrevWeek}
              disabled={weekIndex <= 0}
              title="이전 주차 (←)"
              className={`p-2 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed ${dark ? 'bg-white/10 text-white/70 hover:bg-white/20' : 'bg-slate-900/5 text-slate-600 hover:bg-slate-900/10'}`}
            >
              <ChevronLeft size={16} />
            </button>
            <select
              value={weekNav.currentWeek}
              onChange={e => weekNav.onNavigate(Number(e.target.value))}
              title="주차 선택"
              className={`max-w-[220px] text-xs font-black rounded-xl pl-3 pr-2 py-2.5 focus:outline-none cursor-pointer ${dark ? 'bg-white/10 text-white' : 'bg-slate-900/5 text-slate-800'}`}
            >
              {weekNav.weeks.map(w => (
                <option key={w.week} value={w.week}>{w.week}주차 · {w.title}</option>
              ))}
            </select>
            <button
              onClick={goNextWeek}
              disabled={weekIndex === -1 || weekIndex >= weekNav.weeks.length - 1}
              title="다음 주차 (→)"
              className={`p-2 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed ${dark ? 'bg-white/10 text-white/70 hover:bg-white/20' : 'bg-slate-900/5 text-slate-600 hover:bg-slate-900/10'}`}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* 등록된 일반 자료(링크/파일) — 발표 화면을 나가지 않고 목록에서 바로 열람 */}
        {resources && resources.length > 0 && !editMode && (
          <div className="relative shrink-0" ref={resourcePanelRef}>
            <button
              onClick={() => setShowResourcePanel(v => !v)}
              title="등록된 자료 보기"
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all ${showResourcePanel ? 'bg-primary text-white' : dark ? 'bg-white/10 text-white/70 hover:bg-white/20' : 'bg-slate-900/5 text-slate-600 hover:bg-slate-900/10'}`}
            >
              <FolderOpen size={15} /> 자료함
            </button>
            {showResourcePanel && (
              <div
                className={`absolute right-0 top-full mt-2 w-72 max-h-[60vh] overflow-y-auto rounded-2xl border shadow-2xl z-10 py-2 ${dark ? 'bg-[#15151f] border-white/10' : 'bg-white border-slate-900/10'}`}
              >
                {resources.map(r => (
                  <button
                    key={r.id}
                    onClick={() => { r.onOpen(); setShowResourcePanel(false); }}
                    className={`w-full flex items-start gap-2.5 px-4 py-2.5 text-left transition-colors ${dark ? 'hover:bg-white/10' : 'hover:bg-slate-900/5'}`}
                  >
                    {r.type === 'link'
                      ? <Link2 size={14} className="text-cyan-500 shrink-0 mt-0.5" />
                      : <FileText size={14} className="text-amber-500 shrink-0 mt-0.5" />}
                    <div className="min-w-0">
                      <p className={`text-xs font-black truncate ${dark ? 'text-white' : 'text-slate-800'}`}>{r.title}</p>
                      {r.subtitle && (
                        <p className={`text-[10px] truncate ${dark ? 'text-white/40' : 'text-slate-400'}`}>{r.subtitle}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 발표 보조 도구 */}
        {!editMode && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
              title={dark ? '밝게 보기' : '어둡게 보기'}
              className={`p-2 rounded-xl transition-all ${dark ? 'bg-white/10 text-white/70 hover:bg-white/20' : 'bg-slate-900/5 text-slate-600 hover:bg-slate-900/10'}`}
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              onClick={() => selectTool('zoom')}
              title="돋보기"
              className={`p-2 rounded-xl transition-all ${tool === 'zoom' ? 'bg-primary text-white' : dark ? 'bg-white/10 text-white/70 hover:bg-white/20' : 'bg-slate-900/5 text-slate-600 hover:bg-slate-900/10'}`}
            >
              <ZoomIn size={16} />
            </button>
            <button
              onClick={() => selectTool('pen')}
              title="펜"
              className={`p-2 rounded-xl transition-all ${tool === 'pen' ? 'bg-primary text-white' : dark ? 'bg-white/10 text-white/70 hover:bg-white/20' : 'bg-slate-900/5 text-slate-600 hover:bg-slate-900/10'}`}
            >
              <PenTool size={16} />
            </button>
            <button
              onClick={() => selectTool('spotlight')}
              title="스포트라이트"
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
                {timer.isAlarming ? <BellOff size={14} /> : timer.isRunning ? <Pause size={14} /> : <Play size={14} />}
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
        )}

        {onSave && (
          editMode ? (
            <button
              onClick={handleSaveEdits}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 text-white font-black text-sm hover:bg-emerald-600 active:scale-95 transition-all shadow shrink-0"
            >
              <Save size={15} /> 저장
            </button>
          ) : (
            <button
              onClick={() => { setTool('none'); setEditMode(true); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-black text-sm active:scale-95 transition-all shrink-0 ${dark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-slate-900/5 text-slate-800 hover:bg-slate-900/10'}`}
            >
              <Pencil size={15} /> 편집
            </button>
          )
        )}
      </div>

      {/* 본문 영역 — 편집모드: 원문 전체 텍스트 편집 / 발표모드: 전체 문서 스크롤 뷰 */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div ref={viewRef} className="relative flex-1 min-h-0">
          {editMode ? (
            <div className="absolute inset-0 p-6 overflow-y-auto">
              <RichEditor
                value={editedContent}
                onChange={setEditedContent}
                stickyToolbar={false}
              />
            </div>
          ) : (
            <div
              ref={stageBoxRef}
              className="absolute inset-0 overflow-y-auto"
              onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
              onMouseMove={tool === 'zoom' || tool === 'spotlight' ? handleStageMouseMove : undefined}
              onMouseLeave={() => setLensPos(null)}
            >
              <div ref={docRef} className="max-w-6xl mx-auto px-8 md:px-16 py-14">
                {docInner}
              </div>
            </div>
          )}

          {/* 돋보기 — 화면 상단에 고정된 확대창. 지금 스크롤돼 보이는 부분을 커서 위치 기준으로 확대 */}
          {!editMode && tool === 'zoom' && lensPos && paneSize.width > 0 && docHeight > 0 && (() => {
            const ZOOM = 2.6;
            const panelW = paneSize.width;
            const panelH = Math.min(760, Math.round(paneSize.height * 0.82));
            const scaledW = panelW * ZOOM;
            const scaledH = docHeight * ZOOM;
            let tx = panelW / 2 - lensPos.x * ZOOM;
            let ty = panelH / 2 - (lensPos.y + scrollTop) * ZOOM;
            tx = Math.min(0, Math.max(panelW - scaledW, tx));
            ty = Math.min(0, Math.max(panelH - scaledH, ty));
            return (
              <div
                className="absolute left-0 right-0 top-0 z-30 overflow-hidden rounded-b-[28px] border-b-4 border-primary shadow-2xl pointer-events-none"
                style={{ height: panelH, boxShadow: '0 12px 40px rgba(0,0,0,0.6)' }}
              >
                <div
                  className={dark ? 'bg-[#0a0a14]' : 'bg-slate-50'}
                  style={{
                    width: panelW,
                    transform: `translate(${tx}px, ${ty}px) scale(${ZOOM})`,
                    transformOrigin: '0 0',
                  }}
                >
                  <div className="max-w-6xl mx-auto px-8 md:px-16 py-14">
                    {docInner}
                  </div>
                </div>
                <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/50 to-transparent" />
                <span className="absolute top-2.5 left-3.5 flex items-center gap-1.5 text-[11px] font-black text-white bg-black/55 px-2.5 py-1 rounded-lg">
                  <ZoomIn size={12} /> 돋보기 {ZOOM}x
                </span>
              </div>
            );
          })()}

          {/* 스포트라이트 (레이저 포인터) — 원 안쪽은 커서 위치를 중심으로 확대해서 선명하게, 바깥은 짙게 어둡게 */}
          {!editMode && tool === 'spotlight' && lensPos && paneSize.width > 0 && docHeight > 0 && (() => {
            const panelW = paneSize.width;
            const panelH = paneSize.height;
            const scaledW = panelW * SPOTLIGHT_ZOOM;
            const scaledH = docHeight * SPOTLIGHT_ZOOM;
            let tx = lensPos.x - lensPos.x * SPOTLIGHT_ZOOM;
            let ty = lensPos.y - (lensPos.y + scrollTop) * SPOTLIGHT_ZOOM;
            tx = Math.min(0, Math.max(panelW - scaledW, tx));
            ty = Math.min(0, Math.max(panelH - scaledH, ty));
            return (
              <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden">
                {/* 원 안쪽 — 같은 콘텐츠를 커서 중심으로 확대 복제 (그라데이션 없이 테두리까지 선명) */}
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{
                    clipPath: `circle(${SPOTLIGHT_RADIUS}px at ${lensPos.x}px ${lensPos.y}px)`,
                    WebkitClipPath: `circle(${SPOTLIGHT_RADIUS}px at ${lensPos.x}px ${lensPos.y}px)`,
                  }}
                >
                  <div
                    className={`absolute inset-x-0 ${dark ? 'bg-[#0a0a14]' : 'bg-slate-50'}`}
                    style={{
                      width: panelW,
                      transform: `translate(${tx}px, ${ty}px) scale(${SPOTLIGHT_ZOOM})`,
                      transformOrigin: '0 0',
                      filter: dark ? 'brightness(1.3) contrast(1.08) saturate(1.05)' : 'brightness(1.03) contrast(1.02)',
                    }}
                  >
                    <div className="max-w-6xl mx-auto px-8 md:px-16 py-14">
                      {docInner}
                    </div>
                  </div>
                </div>
                {/* 원 바깥쪽을 짙게 어둡게 — 안쪽은 테두리 직전까지 완전히 선명하고, 테두리에서만 살짝 페더 처리 */}
                <div
                  className="absolute inset-0"
                  style={{
                    background: 'rgba(0,0,0,0.92)',
                    WebkitMaskImage: `radial-gradient(circle ${SPOTLIGHT_RADIUS}px at ${lensPos.x}px ${lensPos.y}px, transparent 0px, transparent ${SPOTLIGHT_RADIUS - 3}px, black ${SPOTLIGHT_RADIUS}px)`,
                    maskImage: `radial-gradient(circle ${SPOTLIGHT_RADIUS}px at ${lensPos.x}px ${lensPos.y}px, transparent 0px, transparent ${SPOTLIGHT_RADIUS - 3}px, black ${SPOTLIGHT_RADIUS}px)`,
                  } as CSSProperties}
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

          {/* 펜 그리기 캔버스 — 이 영역(발표 화면)에 고정, 문서를 스크롤해도 그림은 화면에 그대로 남는다 */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 z-40"
            style={{
              pointerEvents: tool === 'pen' && !editMode ? 'auto' : 'none',
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

        {/* 펜 보조 도구바 — 색상/형광펜/실행취소/지우기 */}
        {tool === 'pen' && !editMode && (
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
      </div>

      {/* 이미지 전체화면 보기 — 문서 안 이미지를 클릭하면 확대 */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-8 cursor-zoom-out"
          onClick={() => setZoomedImage(null)}
        >
          <button
            onClick={() => setZoomedImage(null)}
            className="absolute top-5 right-5 p-2.5 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all"
          >
            <XIcon size={20} />
          </button>
          <img
            src={zoomedImage}
            alt=""
            className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
    </SlideImageZoomContext.Provider>,
    document.body
  );
};

export default PresentationModal;
