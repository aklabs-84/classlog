import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, X } from 'lucide-react';

// 학생 화면용 "지금 화면" 안내
// - 화면(screenKey)마다 안내가 하나씩 있고, 이 기기에서 처음 한 번만 자동으로 나타난다 (그 뒤로는 ? 버튼으로만)
// - 우측 상단 ? 버튼을 누르면 지금 화면의 안내를 다시 볼 수 있다
// - 보기 전용: 학생 대신 아무것도 누르지 않는다. 안내 창은 설명 대상 위가 아니라 위/아래 빈 공간에 놓인다
// - "봤음" 기록은 이 기기(localStorage)에만 남는다

export interface StudentScreenStep {
  /** 설명 대상 요소의 data-tour 값 */
  target: string;
  title: string;
  lead: string;
  points?: string[];
  /** 대상 칸이 지금 화면에 없을 때(예: 수업이 끝나 입력 칸이 닫힌 경우) 대신 보여 줄 설명 */
  missing?: string;
  /** 같은 화면에서 이어서 보여 줄 다음 설명들 (있으면 "다음" 버튼으로 차례로 넘긴다) */
  more?: Omit<StudentScreenStep, 'more'>[];
}

interface Props {
  /** 지금 화면을 구분하는 값 (예: 입장 페이지의 단계 번호) */
  screenKey: string | null;
  screens: Record<string, StudentScreenStep>;
  /** localStorage 키 앞부분 (페이지마다 다르게) */
  storagePrefix: string;
  /** true인 동안은 자동으로 열지 않고 열려 있던 안내도 숨긴다 (다른 안내·창이 떠 있을 때) */
  suspended?: boolean;
  /** 기본 ? 버튼을 숨긴다 (페이지가 자기 헤더에 직접 버튼을 두고 openSignal을 올릴 때) */
  hideButton?: boolean;
  /** 값이 바뀔 때마다 안내를 연다 (0이면 무시) */
  openSignal?: number;
}

const MARGIN = 12;
const GAP = 16;

const readSeen = (key: string) => { try { return localStorage.getItem(key) === '1'; } catch { return false; } };
const writeSeen = (key: string) => { try { localStorage.setItem(key, '1'); } catch { /* 저장이 막힌 환경에서는 그냥 넘어감 */ } };

const sameRect = (a: DOMRect | null, b: DOMRect | null) =>
  a === b || (!!a && !!b && Math.abs(a.top - b.top) < 1 && Math.abs(a.left - b.left) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1);

interface Placement { top: number; left: number; width: number; maxH?: number }

// 대상과 겹치지 않는 자리: 아래 → 위 → 모두 안 되면 대상에서 먼 쪽 화면 가장자리
function computePlacement(rect: DOMRect | null, cardH: number, vw: number, vh: number): Placement {
  const width = Math.min(420, vw - MARGIN * 2);
  const clampLeft = (x: number) => Math.min(Math.max(MARGIN, x), vw - width - MARGIN);
  if (!rect) return { top: Math.max(MARGIN, vh - cardH - MARGIN), left: clampLeft((vw - width) / 2), width };
  const below = vh - rect.bottom - GAP - MARGIN;
  const above = rect.top - GAP - MARGIN;
  if (below >= cardH) return { top: rect.bottom + GAP, left: clampLeft(rect.left), width };
  if (above >= cardH) return { top: rect.top - GAP - cardH, left: clampLeft(rect.left), width };
  // 어느 쪽도 카드 전체가 안 들어가도, 넉넉한 쪽(200px 이상)에 두고 카드 안을 스크롤하게 해서 대상을 가리지 않는다
  const roomy = below >= above ? { top: rect.bottom + GAP, maxH: below } : { top: MARGIN, maxH: above };
  if (Math.max(below, above) >= 200) return { top: roomy.top, left: clampLeft(rect.left), width, maxH: roomy.maxH };
  const dockBottom = rect.top + rect.height / 2 < vh / 2;
  return { top: dockBottom ? Math.max(MARGIN, vh - cardH - MARGIN) : MARGIN, left: clampLeft((vw - width) / 2), width };
}

const StudentScreenTour = ({ screenKey, screens, storagePrefix, suspended = false, hideButton = false, openSignal = 0 }: Props) => {
  const base = screenKey ? screens[screenKey] ?? null : null;
  const [sub, setSub] = useState(0);
  const total = base ? 1 + (base.more?.length ?? 0) : 0;
  const screen: StudentScreenStep | null = base ? (sub === 0 ? base : (base.more?.[sub - 1] ?? base)) : null;
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [cardH, setCardH] = useState(260);
  const [missing, setMissing] = useState(false);
  const openedAtRef = useRef(0);
  const scrolledRef = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    if (screenKey) writeSeen(`${storagePrefix}_${screenKey}`);
  }, [screenKey, storagePrefix]);

  // 화면이 바뀌면 안내를 닫고, 처음 보는 화면이면 잠시 뒤 자동으로 연다 (화면 전환 애니메이션이 끝난 뒤 위치를 잡도록)
  useEffect(() => {
    setOpen(false);
    setRect(null);
    setSub(0);
    if (!screenKey || !screens[screenKey]) return;
    // 이 기기에서 자동 안내는 처음 한 번만 (이후엔 ? 버튼으로만). 뜨는 순간 바로 "봤음"으로 남겨 닫지 않고 지나가도 다시 뜨지 않는다
    const anyKey = `${storagePrefix}__auto_done`;
    if (suspended || readSeen(anyKey) || readSeen(`${storagePrefix}_${screenKey}`)) return;
    const t = setTimeout(() => { writeSeen(anyKey); setOpen(true); }, 700);
    return () => clearTimeout(t);
  }, [screenKey, screens, storagePrefix, suspended]);

  // 페이지 헤더의 ? 버튼에서 보낸 신호로 열기
  useEffect(() => { if (openSignal > 0 && !suspended) { setSub(0); setOpen(true); } }, [openSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  // 열릴 때 대상이 화면 밖이면 한 번 가운데로 스크롤
  useEffect(() => {
    if (!open || !screen) return;
    openedAtRef.current = Date.now();
    scrolledRef.current = false;
    setMissing(false);
  }, [open, screen]);

  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 대상 위치 추적 (키보드가 올라오거나 화면이 움직여도 따라감)
  useEffect(() => {
    if (!open || !screen) return;
    const tick = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${screen.target}"]`);
      if (!el) {
        setRect(prev => (prev === null ? prev : null));
        if (Date.now() - openedAtRef.current > 1200) setMissing(true);
        return;
      }
      setMissing(false);
      const full = el.getBoundingClientRect();
      // 대상이 화면보다 훨씬 크면(긴 본문 등) 위쪽 일부만 강조하고 그 부분이 보이도록 맞춘다
      const tall = full.height > window.innerHeight * 0.6;
      const r = tall ? new DOMRect(full.left, full.top, full.width, 120) : full;
      // 대상이 늦게 나타났거나 화면 밖이면 (열린 뒤 1.5초 안에) 보이는 곳으로 스크롤
      const off = tall ? (full.top < 80 || full.top > window.innerHeight * 0.45) : (r.top < 80 || r.bottom > window.innerHeight - 80);
      if (!scrolledRef.current && off) {
        if (tall) window.scrollBy({ top: full.top - 140, behavior: 'smooth' });
        else el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        if (Date.now() - openedAtRef.current > 1500) scrolledRef.current = true;
      } else {
        scrolledRef.current = true;
      }
      setRect(prev => (sameRect(prev, r) ? prev : r));
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [open, screen]);

  useLayoutEffect(() => {
    if (cardRef.current) {
      const h = cardRef.current.offsetHeight;
      setCardH(prev => (Math.abs(prev - h) > 1 ? h : prev));
    }
  });

  if (!screen) return null;
  // 대상이 아직 화면 밖이면(스크롤 중) 카드가 화면 밖으로 나가지 않게 가장자리에 둔다
  const inView = !!rect && rect.bottom > 0 && rect.top < vp.h;
  const place = computePlacement(missing || !inView ? null : rect, cardH, vp.w, vp.h);
  const shown = open && !suspended;

  return createPortal(
    <>
      {!hideButton && (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="이 화면 도움말"
        className="fixed top-3 right-3 w-11 h-11 rounded-full bg-white text-indigo-600 border border-indigo-200 shadow-lg flex items-center justify-center hover:bg-indigo-50 active:scale-95 transition-all"
        style={{ zIndex: 9990 }}
      >
        <HelpCircle size={24} />
      </button>
      )}

      {shown && (
        <>
          {rect && !missing && (
            <div
              aria-hidden
              style={{
                position: 'fixed',
                top: rect.top - 4,
                left: rect.left - 4,
                width: rect.width + 8,
                height: rect.height + 8,
                borderRadius: 16,
                border: '3px solid #f59e0b',
                boxShadow: '0 0 0 4px rgba(245,158,11,0.25)',
                pointerEvents: 'none',
                zIndex: 9997,
              }}
            />
          )}
          <div
            ref={cardRef}
            role="dialog"
            aria-label="이 화면 도움말"
            style={{ position: 'fixed', top: place.top, left: place.left, width: place.width, maxHeight: Math.min(vp.h - MARGIN * 2, place.maxH ?? Infinity), overflowY: 'auto', zIndex: 9999 }}
            className="bg-white text-gray-900 rounded-2xl border-2 border-indigo-500 shadow-2xl p-5"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs font-black text-indigo-600">이 화면 도움말</p>
              <button type="button" onClick={close} aria-label="도움말 닫기" className="p-1.5 -m-1.5 rounded-lg text-gray-500 hover:bg-gray-100"><X size={18} /></button>
            </div>
            <h3 className="text-lg font-black leading-snug mb-2">{screen.title}</h3>
            <p className="text-[15px] font-medium leading-7 text-gray-800">{missing && screen.missing ? screen.missing : screen.lead}</p>
            {screen.points && !(missing && screen.missing) && (
              <ol className="mt-3 space-y-2">
                {screen.points.map((p, i) => (
                  <li key={i} className="flex gap-2.5 text-[15px] leading-6 text-gray-800">
                    <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-indigo-600 text-white text-[11px] font-black flex items-center justify-center">{i + 1}</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ol>
            )}
            {sub < total - 1 ? (
              <div className="mt-4 flex gap-2">
                {sub > 0 && (
                  <button type="button" onClick={() => setSub(n => n - 1)} className="px-4 py-3 rounded-xl text-sm font-black text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all">이전</button>
                )}
                <button type="button" onClick={() => setSub(n => n + 1)} className="flex-1 px-4 py-3 rounded-xl text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 transition-all">다음 ({sub + 1}/{total})</button>
              </div>
            ) : (
              <div className="mt-4 flex gap-2">
                {sub > 0 && (
                  <button type="button" onClick={() => setSub(n => n - 1)} className="px-4 py-3 rounded-xl text-sm font-black text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all">이전</button>
                )}
                <button type="button" onClick={close} className="flex-1 px-4 py-3 rounded-xl text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 transition-all">알겠어요</button>
              </div>
            )}
          </div>
        </>
      )}
    </>,
    document.body,
  );
};

export default StudentScreenTour;
