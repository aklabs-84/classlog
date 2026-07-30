import { Sparkles, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface DemoModeBannerProps {
  classId: string;
  extraAction?: { label: string; onClick: () => void };
}

// 데모 체험 교사 계정으로 실제 화면(/dashboard/*)에 들어왔을 때 상단에 띄우는 안내 배너.
// 실제 저장/승인/생성 동작은 그대로 허용하되(방문자마다 격리된 학급이라 안전),
// 지금 보고 있는 화면이 체험용이며 곧 자동 삭제된다는 점만 알려준다.
const DemoModeBanner = ({ classId, extraAction }: DemoModeBannerProps) => {
  const navigate = useNavigate();

  const handleExit = async () => {
    // signOut()을 먼저 하면 ProtectedRoute가 user=null을 감지해 /login으로 리다이렉트하는
    // 것이 아래 navigate('/demo')보다 늦게 커밋되어 덮어써버리는 경합이 발생한다.
    // 보호되지 않은 /demo로 먼저 이동해 ProtectedRoute를 벗어난 뒤 로그아웃한다.
    navigate('/demo', { state: { finished: true, classId } });
    await supabase.auth.signOut();
  };

  return (
    <div className="sticky top-0 z-40 bg-gray-900 text-white">
      <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-3">
        <Sparkles size={14} className="text-amber-400 shrink-0" />
        <span className="flex-1 text-[11px] md:text-xs font-bold truncate">
          🎬 체험 모드 — 실제 화면 그대로입니다. 자유롭게 눌러보세요. 이 학급은 2시간 후 자동 삭제됩니다.
        </span>
        {extraAction && (
          <button
            data-tour="student-view-btn"
            onClick={extraAction.onClick}
            className="shrink-0 px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-gray-900 rounded-lg text-[11px] font-black transition-colors"
          >
            {extraAction.label}
          </button>
        )}
        <button
          onClick={handleExit}
          className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-[11px] font-bold transition-colors"
        >
          <LogOut size={12} /> 체험 종료
        </button>
      </div>
    </div>
  );
};

export default DemoModeBanner;
