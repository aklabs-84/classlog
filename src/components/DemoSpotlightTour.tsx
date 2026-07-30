import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Sparkles, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { isDemoTeacher } from '../lib/demo';

const STORAGE_KEY = 'demo_spotlight_tour';

// 실제 앱 화면이 아닌, 방문자가 "학생 입장에서" 체험 중인 공개 라우트에서는
// 투어 UI를 완전히 숨긴다 (그 화면들은 Sidebar/탭 바 등 대상 요소 자체가 없음).
const HIDDEN_PATH_PREFIXES = ['/classroom-entry', '/student-log', '/demo', '/quiz'];

interface TourState {
  classId: string;
  step: number;
  status: 'active' | 'done' | 'skipped';
}

interface TourStep {
  selector: string;
  title: string;
  description: string;
}

const STEPS: TourStep[] = [
  { selector: 'tab-list', title: '① 학급 대시보드', description: '학생 명단과 학급 현황을 한눈에 확인할 수 있어요. 지금 보고 있는 이 화면이에요!' },
  { selector: 'approve-btn', title: '② 활동기록 승인·반려', description: '학생이 제출한 활동기록을 검토하고 한 번에 승인할 수 있어요. 눌러서 승인해보세요!' },
  { selector: 'tab-grading', title: '③ 결과물 평가', description: '학생 결과물을 AI가 자동으로 채점해줘요. 탭을 눌러 확인해보세요!' },
  { selector: 'student-view-btn', title: '④ 학생 화면 체험', description: '학생이 실제로 보는 화면을 직접 체험해볼 수 있어요. 눌러서 이동해보세요!' },
  { selector: 'ai-tab', title: '⑤ AI 세특 자동 생성', description: 'AI가 학생 활동기록을 분석해 세특 초안을 자동으로 작성해줘요. 눌러서 확인해보세요!' },
];

function readTour(): TourState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeTour(state: TourState) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const DemoSpotlightTour = () => {
  const { user } = useAuth();
  const location = useLocation();
  const active = isDemoTeacher(user);

  const [tour, setTour] = useState<TourState | null>(() => readTour());
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const searchStartRef = useRef(Date.now());

  const update = (next: TourState) => {
    setTour(next);
    writeTour(next);
  };

  // 데모 교실(/classroom?id=...)에 새로 진입했을 때 자동 시작 (학급이 바뀌면 재시작)
  useEffect(() => {
    if (!active) return;
    if (!location.pathname.startsWith('/classroom') || location.pathname.startsWith('/classroom-entry')) return;
    const classId = new URLSearchParams(location.search).get('id');
    if (!classId) return;
    setTour(prev => {
      if (prev && prev.classId === classId) return prev;
      const next: TourState = { classId, step: 0, status: 'active' };
      writeTour(next);
      return next;
    });
  }, [active, location.pathname, location.search]);

  const hiddenHere = HIDDEN_PATH_PREFIXES.some(p => location.pathname.startsWith(p));

  const currentStep = tour && tour.status === 'active' && !hiddenHere ? STEPS[tour.step] : null;

  // 스텝/경로가 바뀌면 탐색 타이머 초기화
  useEffect(() => {
    searchStartRef.current = Date.now();
    setNotFound(false);
    setRect(null);
  }, [currentStep?.selector, location.pathname]);

  // 대상 요소 위치를 주기적으로 추적 (최대 4초 대기 후 폴백 카드로 전환)
  useEffect(() => {
    if (!currentStep) return;
    const interval = setInterval(() => {
      const el = document.querySelector(`[data-tour="${currentStep.selector}"]`) as HTMLElement | null;
      if (el) {
        setRect(el.getBoundingClientRect());
        setNotFound(false);
      } else if (Date.now() - searchStartRef.current > 4000) {
        setNotFound(true);
      }
    }, 250);
    return () => clearInterval(interval);
  }, [currentStep]);

  const advance = () => {
    if (!tour) return;
    const next = tour.step + 1;
    if (next >= STEPS.length) {
      update({ ...tour, step: STEPS.length - 1, status: 'done' });
      setJustCompleted(true);
      setTimeout(() => setJustCompleted(false), 4000);
    } else {
      update({ ...tour, step: next, status: 'active' });
    }
  };

  const skip = () => {
    if (!tour) return;
    update({ ...tour, status: 'skipped' });
  };

  // 하이라이트된 실제 요소를 클릭하면 해당 동작이 정상 실행됨과 동시에 다음 단계로 진행
  useEffect(() => {
    if (!currentStep) return;
    const handleClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.(`[data-tour="${currentStep.selector}"]`);
      if (el) advance();
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, tour]);

  if (!active) return null;

  if (justCompleted) {
    return (
      <div className="fixed bottom-6 inset-x-0 z-[9999] flex justify-center px-4 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2 bg-gray-900/95 backdrop-blur text-white rounded-2xl shadow-2xl px-4 py-3">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-xs font-bold">체험 튜토리얼을 모두 마쳤어요! 이제 자유롭게 둘러보세요 🎉</p>
          <button onClick={() => setJustCompleted(false)} aria-label="닫기" className="p-1 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  if (!currentStep) return null;

  const stepIndex = STEPS.indexOf(currentStep);
  const cardWidth = 300;

  let cardTop: number;
  let cardLeft: number;
  if (rect) {
    const spaceBelow = window.innerHeight - rect.bottom;
    cardTop = spaceBelow > 200 ? rect.bottom + 14 : Math.max(12, rect.top - 14 - 190);
    cardLeft = Math.min(Math.max(12, rect.left), window.innerWidth - cardWidth - 12);
  } else {
    cardTop = window.innerHeight - 190;
    cardLeft = Math.max(12, window.innerWidth / 2 - cardWidth / 2);
  }

  return (
    <>
      {rect && !notFound && (
        <div
          className="fixed rounded-2xl ring-4 ring-amber-400 animate-pulse"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: '0 0 0 9999px rgba(15,23,42,0.55)',
            pointerEvents: 'none',
            zIndex: 9997,
            transition: 'top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease',
          }}
        />
      )}
      <div
        className="fixed bg-gray-900/95 backdrop-blur text-white rounded-2xl shadow-2xl px-4 py-3.5"
        style={{ top: cardTop, left: cardLeft, width: cardWidth, zIndex: 9999 }}
      >
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <p className="text-[10px] font-bold text-amber-300">STEP {stepIndex + 1}/{STEPS.length} · 체험 튜토리얼</p>
          <button onClick={skip} aria-label="투어 건너뛰기" className="p-1 -m-1 rounded-lg hover:bg-white/10 transition-colors shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-sm font-black mb-1">{currentStep.title}</p>
        <p className="text-xs font-bold text-white/80 leading-relaxed mb-3">{currentStep.description}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={advance}
            className="flex-1 text-[11px] font-black bg-amber-400 hover:bg-amber-300 text-gray-900 rounded-lg px-3 py-2 transition-colors"
          >
            다음
          </button>
          <button
            onClick={skip}
            className="text-[11px] font-bold text-white/60 hover:text-white px-2 py-2 transition-colors"
          >
            건너뛰기
          </button>
        </div>
      </div>
    </>
  );
};

export default DemoSpotlightTour;
