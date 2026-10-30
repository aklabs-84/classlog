// `<div data-callout="steps">` 안에 `### n단계 제목` + 그림(또는 `🖼 캡처 자리: …` 자리표시) + 짧은 글을 쓰면
// 단계를 한 장씩 좌우로 넘겨 보는 화면으로 그린다. 에디터는 일반 콜아웃으로 저장하므로 글 모양은 그대로 유지된다.
// 모든 단계를 DOM에 그대로 두고 CSS로만 숨겨서, 입력칸 순번(체크박스 답변 키)이 밀리지 않고 인쇄 때는 전부 펼쳐진다.
import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

const tagOf = (el: any): string | undefined => el?.props?.node?.tagName ?? (typeof el?.type === 'string' ? el.type : undefined);

const textOf = (node: ReactNode): string => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf((node.props as any).children);
  return '';
};

const hasImg = (el: any): boolean => {
  if (!isValidElement(el)) return false;
  if (tagOf(el) === 'img') return true;
  const kids = (el.props as any).children;
  return Children.toArray(kids).some(hasImg);
};

interface Step { title: ReactNode; media: ReactNode[]; body: ReactNode[] }

const splitSteps = (children: ReactNode): Step[] => {
  const steps: Step[] = [];
  let cur: Step | null = null;
  Children.toArray(children).forEach((child) => {
    if (typeof child === 'string' && !child.trim()) return;
    if (isValidElement(child) && tagOf(child) === 'h3') {
      cur = { title: (child.props as any).children, media: [], body: [] };
      steps.push(cur);
      return;
    }
    if (!cur) { cur = { title: '', media: [], body: [] }; steps.push(cur); }
    const isPlaceholder = isValidElement(child) && tagOf(child) === 'p' && textOf(child).trim().startsWith('🖼');
    if (isPlaceholder) {
      const label = textOf(child).trim().replace(/^🖼\s*(캡처 자리|그림 자리)?\s*[:：]?\s*/, '');
      cur.media.push(
        <div key={`ph-${steps.length}-${cur.media.length}`} className="mv-step-ph">
          <span className="mv-step-ph-icon" aria-hidden="true">🖼</span>
          <span className="mv-step-ph-label">{label || '여기에 화면 캡처가 들어가요'}</span>
        </div>,
      );
    } else if (hasImg(child)) {
      cur.media.push(child);
    } else {
      cur.body.push(child);
    }
  });
  return steps;
};

// 부모 화면이 다시 그려지면 이 부품이 새로 만들어져 상태가 사라진다(콜아웃 렌더러가 매번 새 함수라서).
// 그래서 "지금 몇 번째 단계인지"는 컴포넌트 밖에 기억해 둔다 — 단계 제목들을 열쇠로 쓴다.
const savedIdx = new Map<string, number>();

export const StepCarousel = ({ children }: { children: ReactNode }) => {
  const steps = splitSteps(children);
  const total = steps.length;
  const memoKey = steps.map(s => textOf(s.title)).join('|');
  const [idx, setIdxRaw] = useState(() => Math.min(savedIdx.get(memoKey) ?? 0, Math.max(0, total - 1)));
  const rootRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);
  const zoomOpen = useRef(false);
  zoomOpen.current = !!zoom;
  const setIdx = (fn: (i: number) => number) => setIdxRaw(i => { const n = fn(i); savedIdx.set(memoKey, n); return n; });
  const go = (n: number) => setIdx(() => Math.max(0, Math.min(total - 1, n)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (zoomOpen.current) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const el = rootRef.current;
      if (!el) return;
      // 마우스가 위에 있거나 포커스가 안에 있거나, 화면 가운데쯤에 보이는 상자가 키를 받는다
      const r = el.getBoundingClientRect();
      const onScreen = r.top < window.innerHeight * 0.6 && r.bottom > window.innerHeight * 0.3;
      if (!(el.matches(':hover') || el.contains(document.activeElement) || onScreen)) return;
      e.preventDefault();
      setIdx(i => Math.max(0, Math.min(total - 1, i + (e.key === 'ArrowRight' ? 1 : -1))));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, memoKey]);

  // 그림을 크게 보는 중에는 Esc로 닫기, 뒤 화면 스크롤은 잠근다
  useEffect(() => {
    if (!zoom) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setZoom(null); } };
    window.addEventListener('keydown', onEsc, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onEsc, true); document.body.style.overflow = prev; };
  }, [zoom]);

  const onMediaClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.tagName === 'IMG') {
      const img = t as HTMLImageElement;
      setZoom({ src: img.currentSrc || img.src, alt: img.alt });
    }
  };

  const touchX = useRef<number | null>(null);

  if (total === 0) return null;
  if (total === 1) return <div className="mv-steps">{children}</div>;

  return (
    <div
      ref={rootRef}
      className="mv-steps"
      tabIndex={0}
      role="group"
      aria-roledescription="단계 넘겨 보기"
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchX.current == null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 50) go(idx + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="mv-steps-dots" role="tablist">
        {steps.map((_, i) => (
          <button key={i} type="button" role="tab" aria-selected={i === idx} aria-label={`${i + 1}단계`}
            className={`mv-steps-dot ${i === idx ? 'is-on' : ''}`} onClick={() => go(i)}>{i + 1}</button>
        ))}
      </div>
      <div className="mv-steps-stage">
        <button type="button" className="mv-steps-arrow" aria-label="이전 단계" disabled={idx === 0} onClick={() => go(idx - 1)}>
          <ChevronLeft size={26} />
        </button>
        <div className="mv-steps-slides">
          {steps.map((s, i) => (
            <section key={i} className={`mv-step ${i === idx ? 'is-on' : ''}`} aria-hidden={i !== idx}>
              <h4 className="mv-step-title"><span className="mv-step-no">{i + 1}</span><span>{s.title}</span></h4>
              {s.media.length > 0 && <div className="mv-step-media" onClick={onMediaClick}>{s.media}</div>}
              {s.body.length > 0 && <div className="mv-step-body">{s.body}</div>}
            </section>
          ))}
        </div>
        <button type="button" className="mv-steps-arrow" aria-label="다음 단계" disabled={idx === total - 1} onClick={() => go(idx + 1)}>
          <ChevronRight size={26} />
        </button>
      </div>
      <p className="mv-steps-hint">{idx + 1} / {total} · ← → 키나 화살표로 넘겨 보세요 · 그림을 누르면 크게 봐요</p>
      {zoom && createPortal(
        <div className="mv-zoom" role="dialog" aria-modal="true" aria-label="그림 크게 보기" onClick={() => setZoom(null)}>
          <button type="button" className="mv-zoom-close" aria-label="닫기" onClick={() => setZoom(null)}><X size={26} /></button>
          <img src={zoom.src} alt={zoom.alt} onClick={(e) => e.stopPropagation()} />
          {zoom.alt && <p className="mv-zoom-cap" onClick={(e) => e.stopPropagation()}>{zoom.alt}</p>}
        </div>,
        document.body,
      )}
    </div>
  );
};
