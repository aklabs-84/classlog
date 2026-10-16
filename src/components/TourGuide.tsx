import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ArrowLeft, Check } from 'lucide-react';

export type TourStep = {
  /** 설명할 대상의 id. 여러 개면 화면에 실제로 보이는 첫 번째를 쓴다(예: 데스크탑 사이드바 / 모바일 하단 바) */
  targetId?: string | string[];
  emoji: string;
  title: string;
  description: string;
};

type Props = {
  steps: TourStep[];
  /** dontShow=true면 24시간 동안 다시 보지 않기 */
  onClose: (dontShow: boolean) => void;
};

const CARD_W = 400;
const GAP = 16;
const PAD = 16;
const MOBILE_BP = 640;
// 모바일 하단 바(약 90px)를 가리지 않도록 아래쪽 여백
const MOBILE_BOTTOM_SAFE = 96;
// 대상이 화면 높이의 이 비율보다 크면 위쪽이 보이게 스크롤하고 화면 끝까지만 테두리를 그린다
const BIG_RATIO = 0.6;

type Box = { top: number; left: number; width: number; height: number };

function findTarget(ids?: string | string[]): HTMLElement | null {
  if (!ids) return null;
  for (const id of Array.isArray(ids) ? ids : [ids]) {
    const el = document.getElementById(id);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

export default function TourGuide({ steps, onClose }: Props) {
  const [idx, setIdx] = useState(0);
  const [target, setTarget] = useState<Box | null>(null);
  const [cardH, setCardH] = useState(260);
  const [dontShow, setDontShow] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const step = steps[idx];
  const isLast = idx === steps.length - 1;

  // 대상 찾기 + 화면 안으로 스크롤(250ms 간격, 최대 1.5초 재시도) + 이후 위치 추적
  useEffect(() => {
    setTarget(null);
    if (!step.targetId) return;
    let tries = 0;
    let scrolled = false;

    const measure = () => {
      const el = findTarget(step.targetId);
      if (!el) { setTarget(null); return false; }
      const vh = window.innerHeight;
      let r = el.getBoundingClientRect();
      // 화면에 고정된 요소(사이드바·하단 바)는 스크롤·부분 강조 없이 그대로 짚는다
      if (getComputedStyle(el).position === 'fixed') {
        setTarget({ top: r.top, left: r.left, width: r.width, height: r.height });
        return true;
      }
      const big = r.height > vh * BIG_RATIO;
      const topLimit = 120;
      const inView = big
        ? r.top >= 0 && r.top <= topLimit + 40 && r.top < vh
        : r.top >= 0 && r.bottom <= vh - (window.innerWidth < MOBILE_BP ? MOBILE_BOTTOM_SAFE : 0);
      if (!inView && tries < 6) {
        // 큰 대상은 위쪽이 보이게, 작은 대상은 가운데로
        if (big) window.scrollBy({ top: r.top - topLimit, behavior: 'auto' });
        else el.scrollIntoView({ block: 'center', behavior: 'auto' });
        scrolled = true;
        r = el.getBoundingClientRect();
      }
      // 큰 대상도 전체를 테두리로 보여주되, 화면 아래로 넘치는 부분은 화면 끝까지만 그린다
      const h = big ? Math.min(r.height, vh - r.top - PAD) : r.height;
      setTarget({ top: r.top, left: r.left, width: r.width, height: h });
      return inView || !scrolled;
    };

    measure();
    const timer = window.setInterval(() => {
      tries += 1;
      measure();
      if (tries >= 6) window.clearInterval(timer);
    }, 250);
    const onMove = () => measure();
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [idx, step.targetId]);

  // 카드 실제 높이 측정(배치 계산에 사용)
  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  }, [idx, dontShow, target]);

  // 안내 창 자리 계산: 아래 → 위 → 옆 → 가장자리 도킹
  const cardStyle = useCallback((): React.CSSProperties => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const mobile = vw < MOBILE_BP;
    const w = mobile ? vw - PAD * 2 : CARD_W;
    const safeBottom = mobile ? MOBILE_BOTTOM_SAFE : PAD;
    const clampLeft = (x: number) => Math.max(PAD, Math.min(x, vw - w - PAD));
    const clampTop = (y: number) => Math.max(PAD, Math.min(y, vh - cardH - safeBottom));

    if (!target) {
      return { width: w, top: Math.max(PAD, (vh - cardH) / 2), left: (vw - w) / 2 };
    }
    const t = target;
    const cx = t.left + t.width / 2;
    const below = t.top + t.height + GAP;
    const above = t.top - GAP - cardH;
    const fitsBelow = below + cardH <= vh - safeBottom;
    const fitsAbove = above >= PAD;

    if (!mobile) {
      if (fitsBelow) return { width: w, top: below, left: clampLeft(cx - w / 2) };
      if (fitsAbove) return { width: w, top: above, left: clampLeft(cx - w / 2) };
      const roomRight = vw - (t.left + t.width) - GAP - PAD;
      const roomLeft = t.left - GAP - PAD;
      if (roomRight >= w) return { width: w, top: clampTop(t.top), left: t.left + t.width + GAP };
      if (roomLeft >= w) return { width: w, top: clampTop(t.top), left: t.left - GAP - w };
    } else {
      if (fitsBelow) return { width: w, top: below, left: PAD };
      if (fitsAbove) return { width: w, top: above, left: PAD };
    }
    // 가장자리 도킹: 대상이 있는 반대쪽(넓은 쪽) 끝에 붙인다
    const spaceTop = t.top;
    const spaceBottom = vh - (t.top + t.height);
    if (spaceBottom >= spaceTop) return { width: w, top: Math.max(PAD, vh - cardH - safeBottom), left: clampLeft((vw - w) / 2) };
    return { width: w, top: PAD, left: clampLeft((vw - w) / 2) };
  }, [target, cardH]);

  // 안내 카드 밖을 누르면(다른 메뉴 버튼 등) 안내를 닫는다 — 누른 버튼은 그대로 동작한다
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (cardRef.current?.contains(e.target as Node)) return;
      onCloseRef.current(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, []);

  const goNext = () => {
    if (isLast) onClose(dontShow);
    else setIdx(i => i + 1);
  };

  return (
    <>
      {/* 대상 강조: 어두운 막 없이 테두리만 */}
      {target && (
        <div
          className="fixed z-[9991] pointer-events-none rounded-2xl"
          style={{
            top: target.top - 6,
            left: target.left - 6,
            width: target.width + 12,
            height: target.height + 12,
            border: '3px solid #6d3df0',
            boxShadow: '0 0 0 4px rgba(109,61,240,0.18), 0 8px 30px rgba(109,61,240,0.25)',
            transition: 'top 0.25s ease, left 0.25s ease, width 0.25s ease, height 0.25s ease',
          }}
        />
      )}

      {/* 안내 카드 */}
      <div className="fixed z-[9995] pointer-events-auto" style={cardStyle()}>
        <AnimatePresence mode="wait">
          <motion.div
            key={idx}
            ref={cardRef}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden"
            style={{ wordBreak: 'keep-all' }}
          >
            {/* 진행 바 */}
            <div className="flex gap-1 pt-4 px-5">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i <= idx ? 'bg-primary' : 'bg-slate-200'}`}
                />
              ))}
            </div>

            <div className="p-5 space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-3xl leading-none">{step.emoji}</span>
                <p className="font-black text-lg text-on-surface" style={{ color: '#0f172a' }}>{step.title}</p>
              </div>
              <p className="text-[15px] text-slate-600 font-medium" style={{ lineHeight: 1.7 }}>{step.description}</p>

              <label className="flex items-center gap-2.5 cursor-pointer group pt-1 select-none">
                <input
                  type="checkbox"
                  checked={dontShow}
                  onChange={e => setDontShow(e.target.checked)}
                  className="sr-only"
                />
                <span
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                    dontShow ? 'bg-primary border-primary' : 'border-slate-300 group-hover:border-primary/60'
                  }`}
                >
                  {dontShow && <Check size={12} className="text-white" strokeWidth={4} />}
                </span>
                <span className="text-sm font-bold text-slate-500 group-hover:text-slate-700 transition-colors">
                  다시 보지 않기 <span className="font-medium text-slate-400">(24시간)</span>
                </span>
              </label>

              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={() => onClose(dontShow)}
                  className="text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
                >
                  건너뛰기
                </button>
                <div className="flex items-center gap-2">
                  {idx > 0 && (
                    <button
                      onClick={() => setIdx(i => i - 1)}
                      aria-label="이전"
                      className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-all"
                    >
                      <ArrowLeft size={17} className="text-slate-600" />
                    </button>
                  )}
                  <button
                    onClick={goNext}
                    className="px-5 h-10 rounded-xl btn-gradient text-[15px] font-black flex items-center gap-1.5 shadow-md shadow-primary/20"
                  >
                    {isLast ? '완료!' : '다음'}
                    {!isLast && <ArrowRight size={15} />}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
}
