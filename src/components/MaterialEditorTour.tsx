import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sparkles, X, LocateFixed } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { isDemoTeacher, EDITOR_TOUR_KEY } from '../lib/demo';

// 수업 자료 에디터 체험 투어. /demo/material-editor 에서 시작한 체험용 계정에게만 보이며,
// 실제 에디터 화면의 data-tour 이름표가 붙은 요소를 비추고 그 자리로 화면을 스크롤해 준다.

interface TourState {
  step: number;
  status: 'active' | 'done' | 'skipped';
}

interface TourStep {
  target?: string;           // data-tour 이름. 없으면 화면 가운데 카드만 보여준다
  title: string;
  description: string;
  clickAdvances?: boolean;   // 하이라이트된 요소를 누르면 다음 단계로
  isDone?: () => boolean;    // true가 settleMs 동안 유지되면 자동으로 다음 단계로
  settleMs?: number;
  nextLabel?: string;
}

const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const pm = () => q('[data-tour="me-editor"] .ProseMirror');

const STEPS: TourStep[] = [
  {
    target: 'me-new-btn',
    title: '① 새 자료 만들기',
    description: '체험용 학급이 이미 골라져 있어요. 파란색 "새 자료 작성" 버튼을 눌러 보세요!',
    clickAdvances: true,
  },
  {
    target: 'me-title',
    title: '② 제목 쓰기',
    description: '자료 제목을 적어 보세요. 별표(*)가 붙은 칸은 꼭 써야 저장돼요. 예) 1주차 세포 알아보기',
    isDone: () => ((q('[data-tour="me-title"]') as HTMLInputElement | null)?.value.trim().length ?? 0) >= 2,
    settleMs: 1200,
  },
  {
    target: 'me-editor',
    title: '③ / 를 눌러 메뉴 열기',
    description: '아래 글쓰기 칸의 빈 줄을 누르고 / (슬래시)를 입력해 보세요. 나오는 목록에서 "표"를 골라 Enter!',
    isDone: () => !!pm()?.querySelector('table'),
    settleMs: 500,
  },
  {
    target: 'me-editor',
    title: '④ 학생이 적는 칸 만들기',
    description: '다시 / 를 누르고 "학생 입력"이라고 이어 쓰세요. 메모 표·체크 항목·밑줄 빈칸 중 하나를 골라 넣으면 학생 화면에서 직접 적는 칸이 돼요.',
    isDone: () => {
      const el = pm();
      if (!el) return false;
      const text = el.innerText || '';
      return el.querySelectorAll('table').length >= 2 || text.includes('[ ]') || text.includes('______');
    },
    settleMs: 500,
  },
  {
    target: 'me-tools',
    title: '⑤ 도구 버튼 줄',
    description: '보라색 AI 버튼(AI로 정리·오탈자 검수·계획서 만들기), 가져오기, 표지, PDF 다운로드가 여기 모여 있어요. 체험에서는 AI를 실제로 쓰지 않고, 위치만 알려 드려요.',
  },
  {
    target: 'me-bottom',
    title: '⑥ 공개하고 저장하기',
    description: '왼쪽 "비공개"를 누르면 "학생 공개 중"으로 바뀌어요. 그 뒤 오른쪽 "저장"을 누르면 학생이 수업자료 탭에서 볼 수 있어요.',
  },
  {
    target: 'me-preview',
    title: '⑦ 학생 화면 미리보기',
    description: '맨 위 "미리보기"를 눌러 학생에게 어떻게 보일지 확인해 보세요. 학생이 적는 칸도 직접 적어 볼 수 있어요!',
    clickAdvances: true,
  },
];

function readTour(): TourState | null {
  try {
    const raw = sessionStorage.getItem(EDITOR_TOUR_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeTour(state: TourState) {
  try { sessionStorage.setItem(EDITOR_TOUR_KEY, JSON.stringify(state)); } catch { /* 저장 실패해도 투어는 계속 */ }
}

// 스크롤되는 가장 가까운 부모를 찾는다 (없으면 window)
function getScrollParent(el: HTMLElement): HTMLElement | null {
  let p = el.parentElement;
  while (p && p !== document.body && p !== document.documentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p;
    p = p.parentElement;
  }
  return null;
}

const CARD_MAX_W = 320;
const TOP_SAFE = 72;   // 위쪽 고정 상단바에 가리지 않도록 남기는 여백
const SIDE = 12;

const MaterialEditorTour = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const active = isDemoTeacher(user);

  const [tour, setTour] = useState<TourState | null>(() => readTour());
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [cardH, setCardH] = useState(190);
  const [vw, setVw] = useState(() => window.innerWidth);
  const [vh, setVh] = useState(() => window.innerHeight);

  const cardRef = useRef<HTMLDivElement>(null);
  const searchStartRef = useRef(Date.now());
  const scrolledForStepRef = useRef<number>(-1);
  const doneSinceRef = useRef<number | null>(null);

  const onToolsPage = location.pathname.startsWith('/teaching-tools')
    && new URLSearchParams(location.search).get('tool') === 'material-editor';

  const step = tour && tour.status === 'active' && onToolsPage ? STEPS[tour.step] : null;
  const finished = tour?.status === 'done' && onToolsPage;

  const update = useCallback((next: TourState) => {
    setTour(next);
    writeTour(next);
  }, []);

  const advance = useCallback(() => {
    setTour(prev => {
      if (!prev || prev.status !== 'active') return prev;
      const nextStep = prev.step + 1;
      const next: TourState = nextStep >= STEPS.length
        ? { step: STEPS.length - 1, status: 'done' }
        : { step: nextStep, status: 'active' };
      writeTour(next);
      return next;
    });
  }, []);

  const skip = () => { if (tour) update({ ...tour, status: 'skipped' }); };

  // /demo/material-editor 에서 막 시작한 투어를 이미 떠 있는 이 컴포넌트가 알아차리도록 이동할 때마다 다시 읽는다
  useEffect(() => {
    const saved = readTour();
    setTour(prev => (JSON.stringify(prev) === JSON.stringify(saved) ? prev : saved));
  }, [location.key]);

  // 단계가 바뀌면 탐색 상태 초기화
  useEffect(() => {
    searchStartRef.current = Date.now();
    scrolledForStepRef.current = -1;
    doneSinceRef.current = null;
    setNotFound(false);
    setRect(null);
  }, [tour?.step, tour?.status, onToolsPage]);

  // 화면 크기 추적
  useEffect(() => {
    const onResize = () => { setVw(window.innerWidth); setVh(window.innerHeight); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 대상 위치 추적 + 처음 찾았을 때 한 번 정확한 위치로 스크롤 + 완료 조건 감시
  useEffect(() => {
    if (!step || !tour) return;
    const stepIndex = tour.step;

    const tick = () => {
      if (!step.target) { setRect(null); return; }
      const el = q(`[data-tour="${step.target}"]`);
      if (!el) {
        setRect(null);
        if (Date.now() - searchStartRef.current > 4000) setNotFound(true);
        return;
      }
      setNotFound(false);

      // 단계가 시작되고 처음 찾았을 때만 자동 스크롤 (이후 사용자가 직접 스크롤해도 방해하지 않음)
      if (scrolledForStepRef.current !== stepIndex) {
        scrolledForStepRef.current = stepIndex;
        scrollToTarget(el);
      }

      const r = el.getBoundingClientRect();
      setRect(prev => (prev && prev.top === r.top && prev.left === r.left && prev.width === r.width && prev.height === r.height) ? prev : r);

      if (step.isDone) {
        if (step.isDone()) {
          if (doneSinceRef.current === null) doneSinceRef.current = Date.now();
          else if (Date.now() - doneSinceRef.current >= (step.settleMs ?? 0)) advance();
        } else {
          doneSinceRef.current = null;
        }
      }
    };

    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [step, tour, advance]);

  // 하이라이트된 실제 버튼을 누르면 원래 동작과 함께 다음 단계로
  useEffect(() => {
    if (!step?.clickAdvances || !step.target) return;
    const sel = `[data-tour="${step.target}"]`;
    const handleClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.(sel)) advance();
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [step, advance]);

  // 카드 높이 측정 (위치 계산용)
  useEffect(() => {
    if (cardRef.current) {
      const h = cardRef.current.offsetHeight;
      if (h && h !== cardH) setCardH(h);
    }
  });

  const rescroll = () => {
    if (!step?.target) return;
    const el = q(`[data-tour="${step.target}"]`);
    if (el) scrollToTarget(el);
  };

  // 대상이 화면 어디에 오면 좋은지 계산해서 부드럽게 스크롤
  function scrollToTarget(el: HTMLElement) {
    const r = el.getBoundingClientRect();
    const sp = getScrollParent(el);
    const viewTop = sp ? sp.getBoundingClientRect().top : 0;
    const viewH = sp ? sp.clientHeight : window.innerHeight;
    const cardSpace = 230; // 말풍선이 들어갈 아래쪽 공간
    const tall = r.height > viewH - TOP_SAFE - cardSpace;
    // 키 큰 대상은 위쪽이 보이게, 그 외에는 대상+말풍선이 함께 보이도록 가운데쯤에 배치
    const desiredTop = tall
      ? TOP_SAFE + 8
      : Math.max(TOP_SAFE + 8, (viewH - r.height - cardSpace) / 2 + TOP_SAFE / 2);
    const delta = (r.top - viewTop) - desiredTop;
    if (Math.abs(delta) < 8) return;
    if (sp) sp.scrollTo({ top: sp.scrollTop + delta, behavior: 'smooth' });
    else window.scrollTo({ top: window.scrollY + delta, behavior: 'smooth' });
  }

  if (!active || !onToolsPage) return null;

  // ── 마무리 카드 ──
  if (finished) {
    return (
      <div className="fixed inset-x-0 bottom-4 z-[9999] flex justify-center px-3 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-md bg-gray-900/95 backdrop-blur text-white rounded-2xl shadow-2xl px-4 py-4">
          <p className="text-[10px] font-bold text-amber-300 mb-1 flex items-center gap-1"><Sparkles className="w-3 h-3" /> 체험 튜토리얼 완료</p>
          <p className="text-sm font-black mb-1">수고하셨어요! 🎉</p>
          <p className="text-xs font-bold text-white/80 leading-relaxed mb-3">
            미리보기를 닫고 자유롭게 눌러 보세요. 더 자세한 설명은 가이드에서 볼 수 있어요.
          </p>
          <div className="flex items-center gap-2">
            <a href="/guide.html" className="flex-1 text-center text-[11px] font-black bg-amber-400 hover:bg-amber-300 text-gray-900 rounded-lg px-3 py-2 transition-colors">자세한 가이드 보기</a>
            <button onClick={() => navigate('/login')} className="text-[11px] font-bold text-white/70 hover:text-white px-2 py-2 transition-colors">내 계정으로 시작</button>
            <button onClick={() => update({ step: STEPS.length - 1, status: 'skipped' })} aria-label="닫기" className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"><X className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      </div>
    );
  }

  if (!step || !tour) return null;

  // ── 화면 안에 보이는 부분만 하이라이트 (키 큰 대상 대비) ──
  const cardWidth = Math.min(CARD_MAX_W, vw - SIDE * 2);
  let vis: { top: number; left: number; width: number; height: number } | null = null;
  let offScreen = false;
  if (rect && !notFound) {
    const top = Math.max(rect.top, 0);
    const bottom = Math.min(rect.bottom, vh);
    const left = Math.max(rect.left, 0);
    const right = Math.min(rect.right, vw);
    if (bottom - top > 4 && right - left > 4) vis = { top, left, width: right - left, height: bottom - top };
    else offScreen = true;
  }

  let cardTop: number;
  let cardLeft: number;
  if (vis) {
    const below = vh - (vis.top + vis.height);
    const above = vis.top;
    if (below >= cardH + 24) cardTop = vis.top + vis.height + 14;
    else if (above >= cardH + 24) cardTop = vis.top - 14 - cardH;
    else cardTop = vh - cardH - 16; // 위아래 모두 좁으면 화면 아래에 고정
    cardLeft = Math.min(Math.max(SIDE, vis.left), vw - cardWidth - SIDE);
  } else {
    cardTop = Math.max(SIDE, vh - cardH - 16);
    cardLeft = Math.max(SIDE, (vw - cardWidth) / 2);
  }
  cardTop = Math.min(Math.max(SIDE, cardTop), Math.max(SIDE, vh - cardH - SIDE));

  const isLast = tour.step === STEPS.length - 1;
  const manualNext = !step.isDone && !step.clickAdvances;

  return (
    <>
      {vis && (
        <div
          className="fixed rounded-2xl ring-4 ring-amber-400 animate-pulse"
          style={{
            top: vis.top - 6,
            left: vis.left - 6,
            width: vis.width + 12,
            height: vis.height + 12,
            boxShadow: '0 0 0 9999px rgba(15,23,42,0.55)',
            pointerEvents: 'none',
            zIndex: 9997,
            transition: 'top 0.15s ease, left 0.15s ease, width 0.15s ease, height 0.15s ease',
          }}
        />
      )}
      <div
        ref={cardRef}
        className="fixed bg-gray-900/95 backdrop-blur text-white rounded-2xl shadow-2xl px-4 py-3.5"
        style={{ top: cardTop, left: cardLeft, width: cardWidth, zIndex: 9999, transition: 'top 0.15s ease, left 0.15s ease' }}
      >
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <p className="text-[10px] font-bold text-amber-300">STEP {tour.step + 1}/{STEPS.length} · 에디터 체험</p>
          <button onClick={skip} aria-label="체험 안내 닫기" className="p-1 -m-1 rounded-lg hover:bg-white/10 transition-colors shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-sm font-black mb-1">{step.title}</p>
        <p className="text-xs font-bold text-white/80 leading-relaxed mb-3">
          {notFound ? '이 단계의 화면이 보이지 않아요. 에디터 화면(새 자료 작성)으로 돌아와 이어가거나 "다음"을 눌러 주세요.' : step.description}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={advance}
            className="flex-1 text-[11px] font-black bg-amber-400 hover:bg-amber-300 text-gray-900 rounded-lg px-3 py-2 transition-colors"
          >
            {isLast ? '마치기' : (manualNext ? (step.nextLabel ?? '다음') : '건너뛰고 다음')}
          </button>
          {(offScreen || (!vis && !notFound && !!step.target)) && (
            <button
              onClick={rescroll}
              title="강조된 곳으로 이동"
              className="flex items-center gap-1 text-[11px] font-bold text-white/70 hover:text-white px-2 py-2 transition-colors"
            >
              <LocateFixed className="w-3 h-3" /> 위치로
            </button>
          )}
          <button
            onClick={skip}
            className="text-[11px] font-bold text-white/60 hover:text-white px-2 py-2 transition-colors"
          >
            그만 보기
          </button>
        </div>
      </div>
    </>
  );
};

export default MaterialEditorTour;
