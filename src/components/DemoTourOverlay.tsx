import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, X } from 'lucide-react';

const STORAGE_KEY = 'demo_tour_active';
const SESSION_DATA_KEY = 'demo_session_data';

interface DemoTourState {
  roleLabel: string;
  stageTitle: string;
  classId?: string;
  entryCode?: string;
}

export function readDemoTourState(): DemoTourState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setDemoTourState(state: DemoTourState) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// 데모 안내 배너만 숨김 (진행 중인 데모 학급 정보는 유지 → /demo 복귀 시 이어보기 가능)
function hideDemoTourBanner() {
  sessionStorage.removeItem(STORAGE_KEY);
}

// 데모 체험을 완전히 종료 (배너 + 학생 세션 + 데모 학급 정보까지 모두 초기화)
export function clearDemoTourState() {
  sessionStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem('student_session');
  sessionStorage.removeItem(SESSION_DATA_KEY);
}

// 실제 라우트(/classroom-entry, /student-log, /share/:id 등) 위에 떠서
// 지금 실제 앱 화면이지만 "데모 체험 중"임을 알리고 언제든 이어보기/종료할 수 있게 하는 오버레이
const DemoTourOverlay = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // /demo 페이지 자체는 고유 UI를 사용하므로 중복 표시하지 않음
  if (location.pathname.startsWith('/demo')) return null;

  const tour = readDemoTourState();
  if (!tour) return null;

  const handleContinue = () => {
    hideDemoTourBanner();
    if (tour.classId) {
      navigate(`/classroom?id=${tour.classId}`);
    } else {
      navigate('/demo');
    }
  };

  const handleExit = () => {
    clearDemoTourState();
    navigate('/demo');
  };

  return (
    <div className="fixed top-0 inset-x-0 z-[9998] flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto mt-2 w-full max-w-md bg-gray-900/95 backdrop-blur text-white rounded-2xl shadow-2xl px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-amber-300 leading-none mb-0.5">{tour.roleLabel} · 데모 체험 중</p>
            <p className="text-xs font-bold truncate leading-tight">{tour.stageTitle}</p>
          </div>
          <button
            onClick={handleExit}
            aria-label="체험 종료"
            className="flex-shrink-0 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <button
          onClick={handleContinue}
          className="mt-2 w-full flex items-center justify-center gap-1.5 text-[11px] font-bold bg-amber-400 hover:bg-amber-300 text-gray-900 rounded-lg px-3 py-2 transition-colors"
        >
          <ArrowLeft className="w-3 h-3" />
          선생님 화면으로 이어보기
        </button>
      </div>
    </div>
  );
};

export default DemoTourOverlay;
